const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let user;
let song;
before(async () => {
  await h.start();
  user = await h.newUser();
  song = await h.activeSong("s.explicit = 0 AND s.content_rating = 'ALL' AND s.duration_sec > 150");
});
after(h.stop);

test('a full play is stored as completed, with events and session counters', async () => {
  const s = await h.api('POST', '/playback/start', { token: user.token, body: { songId: song.song_id, origin: 'SEARCH' } });
  assert.equal(s.status, 201);
  assert.equal(s.body.private, false);
  assert.ok(s.body.media && s.body.media.type, 'a permitted playback source is returned');
  const ev = await h.api('POST', `/playback/${s.body.playId}/events`, { token: user.token, body: { type: 'PAUSE', positionSec: 20 } });
  assert.equal(ev.status, 200);
  const f = await h.api('POST', `/playback/${s.body.playId}/finish`, { token: user.token, body: { listenedSec: song.duration_sec } });
  assert.equal(f.status, 200);
  assert.equal(f.body.completed, true);
  assert.equal(f.body.skipped, false);
  assert.equal(f.body.completionPct, 100);

  const events = await h.query('SELECT event_type FROM playback_events WHERE play_id = ? ORDER BY event_id', [s.body.playId]);
  assert.deepEqual(events.map((e) => e.event_type), ['PLAY_STARTED', 'PAUSE', 'COMPLETED']);
  const sess = await h.one('SELECT plays, listen_sec FROM listening_sessions WHERE session_id = ?', [s.body.sessionId]);
  assert.equal(sess.plays, 1);
  assert.equal(sess.listen_sec, song.duration_sec);
});

test('a short listen is a skip; completion % is derived by the database, not trusted from the client', async () => {
  const s = await h.api('POST', '/playback/start', { token: user.token, body: { songId: song.song_id } });
  const f = await h.api('POST', `/playback/${s.body.playId}/finish`, { token: user.token, body: { listenedSec: 10 } });
  assert.equal(f.body.completed, false);
  assert.equal(f.body.skipped, true);
  const row = await h.one('SELECT completion_pct FROM listening_history WHERE play_id = ?', [s.body.playId]);
  assert.equal(Number(row.completion_pct), Math.round((10 / song.duration_sec) * 10000) / 100);
});

test('replaying a finished song within 24 hours is flagged as a replay', async () => {
  const r = await h.play(user.token, song.song_id, song.duration_sec);
  assert.equal(r.status, 200);
  assert.equal(r.body.isReplay, true);
});

test('playback rules: finished plays are immutable, other users cannot touch them, listened time is bounded', async () => {
  const s = await h.api('POST', '/playback/start', { token: user.token, body: { songId: song.song_id } });
  await h.api('POST', `/playback/${s.body.playId}/finish`, { token: user.token, body: { listenedSec: 60 } });
  const again = await h.api('POST', `/playback/${s.body.playId}/finish`, { token: user.token, body: { listenedSec: 90 } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'PLAY_FINISHED');

  const other = await h.newUser({ onboard: false });
  const s2 = await h.api('POST', '/playback/start', { token: user.token, body: { songId: song.song_id } });
  const stolen = await h.api('POST', `/playback/${s2.body.playId}/finish`, { token: other.token, body: { listenedSec: 30 } });
  assert.equal(stolen.status, 404, "another user's play looks like it does not exist");

  const tooLong = await h.api('POST', `/playback/${s2.body.playId}/finish`, { token: user.token, body: { listenedSec: song.duration_sec + 60 } });
  assert.equal(tooLong.status, 400, 'trigger rejects listened time longer than the song');
  const seekNoTarget = await h.api('POST', `/playback/${s2.body.playId}/events`, { token: user.token, body: { type: 'SEEK', positionSec: 5 } });
  assert.equal(seekNoTarget.status, 400);
  await assert.rejects(h.query('UPDATE listening_history SET user_id = ? WHERE play_id = ?', [other.id, s.body.playId]), /immutable/);
});

test('unknown, hidden and filtered songs cannot be played', async () => {
  assert.equal((await h.api('POST', '/playback/start', { token: user.token, body: { songId: 999999 } })).status, 404);
  const hidden = await h.one("SELECT song_id FROM songs WHERE status <> 'ACTIVE' LIMIT 1");
  if (hidden) assert.equal((await h.api('POST', '/playback/start', { token: user.token, body: { songId: hidden.song_id } })).status, 409);
  const explicitSong = await h.activeSong('s.explicit = 1');
  const nila = await h.login('nila', 'Listener@123');
  const r = await h.api('POST', '/playback/start', { token: nila, body: { songId: explicitSong.song_id } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'CONTENT_FILTERED');
});

test('plays update learned preferences in the same transaction', async () => {
  const u = await h.newUser();
  const genre = await h.one('SELECT genre_id FROM song_genres WHERE song_id = ? AND is_primary = 1', [song.song_id]);
  const before = await h.one('SELECT plays FROM user_genre_preferences WHERE user_id = ? AND genre_id = ?', [u.id, genre.genre_id]);
  const r = await h.play(u.token, song.song_id, song.duration_sec);
  assert.ok(r.body.learned, 'response says what MUSE learned');
  const afterRow = await h.one('SELECT plays, short_term_score FROM user_genre_preferences WHERE user_id = ? AND genre_id = ?', [u.id, genre.genre_id]);
  assert.equal(afterRow.plays, (before ? before.plays : 0) + 1);
  assert.ok(Number(afterRow.short_term_score) > 0);
  const hist = await h.api('GET', '/history?limit=5', { token: u.token });
  assert.equal(hist.status, 200);
  assert.equal(hist.body.length, 1);
});

test('ratings: 1–5 only, POST twice is a duplicate, PUT changes it and updates the average', async () => {
  const u = await h.newUser();
  const bad = await h.api('PUT', `/songs/${song.song_id}/rating`, { token: u.token, body: { rating: 6 } });
  assert.equal(bad.status, 400);
  const first = await h.api('POST', '/ratings', { token: u.token, body: { songId: song.song_id, rating: 4 } });
  assert.equal(first.status, 201);
  const dup = await h.api('POST', '/ratings', { token: u.token, body: { songId: song.song_id, rating: 5 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_RATING');
  const changed = await h.api('PUT', `/songs/${song.song_id}/rating`, { token: u.token, body: { rating: 5 } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.previous, 4);
  const agg = await h.one('SELECT ROUND(AVG(rating), 2) AS a FROM ratings WHERE song_id = ?', [song.song_id]);
  assert.equal(Number(changed.body.songAverage), Number(agg.a));
  assert.equal((await h.api('DELETE', `/songs/${song.song_id}/rating`, { token: u.token })).status, 200);
  assert.equal((await h.api('DELETE', `/songs/${song.song_id}/rating`, { token: u.token })).status, 404);
  await assert.rejects(h.query('INSERT INTO ratings (user_id, song_id, rating) VALUES (?, ?, 0)', [u.id, song.song_id]), /chk_|Check constraint/i);
});

test('likes are idempotent and listed', async () => {
  const u = await h.newUser();
  await h.api('PUT', `/songs/${song.song_id}/like`, { token: u.token, body: { liked: true } });
  await h.api('PUT', `/songs/${song.song_id}/like`, { token: u.token, body: { liked: true } });
  const n = await h.one('SELECT COUNT(*) AS n FROM user_likes WHERE user_id = ?', [u.id]);
  assert.equal(n.n, 1);
  const likes = await h.api('GET', '/likes', { token: u.token });
  assert.equal(likes.status, 200);
  assert.ok(JSON.stringify(likes.body).includes(song.title));
  await h.api('PUT', `/songs/${song.song_id}/like`, { token: u.token, body: { liked: false } });
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM user_likes WHERE user_id = ?', [u.id])).n, 0);
});

test('listening insights are computed from the plays', async () => {
  const u = await h.newUser();
  await h.play(u.token, song.song_id, song.duration_sec);
  await h.play(u.token, song.song_id, 15);
  const p = await h.api('GET', '/insights/profile', { token: u.token });
  assert.equal(p.status, 200);
  assert.equal(p.body.headline.totalPlays, 2);
  assert.equal(p.body.headline.uniqueSongs, 1);
  for (const path of ['/insights/activity', '/insights/journey?period=weekly', '/insights/preferences', `/users/${u.id}/analytics`]) {
    assert.equal((await h.api('GET', path, { token: u.token })).status, 200, path);
  }
  assert.equal((await h.api('GET', `/users/${user.id}/analytics`, { token: u.token })).status, 403);
});

test('timestamps leave the API as ISO-8601 instants, correct in any browser time zone', async () => {
  const u = await h.newUser();
  await h.play(u.token, song.song_id, 60);
  const hist = await h.api('GET', '/history?limit=1', { token: u.token });
  const t = hist.body[0].playedAt;
  assert.match(t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Math.abs(Date.parse(t) - Date.now()) < 120000, `${t} is "now"`);
});

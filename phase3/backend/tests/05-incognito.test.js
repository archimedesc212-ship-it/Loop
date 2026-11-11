// Incognito isolation: PERMANENT PROFILE --(read only)--> PRIVATE SESSION --> TEMPORARY MEMORY.
// The proof is a byte-for-byte snapshot of every permanent table that belongs
// to the user, taken before and after a busy private session.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const PERMANENT = {
  listening_history: 'SELECT * FROM listening_history WHERE user_id = ? ORDER BY play_id',
  listening_sessions: 'SELECT * FROM listening_sessions WHERE user_id = ? ORDER BY session_id',
  playback_events: 'SELECT e.* FROM playback_events e JOIN listening_history lh USING (play_id) WHERE lh.user_id = ? ORDER BY e.event_id',
  search_history: 'SELECT * FROM search_history WHERE user_id = ? ORDER BY 1',
  ratings: 'SELECT * FROM ratings WHERE user_id = ? ORDER BY song_id',
  user_likes: 'SELECT * FROM user_likes WHERE user_id = ? ORDER BY song_id',
  user_genre_preferences: 'SELECT * FROM user_genre_preferences WHERE user_id = ? ORDER BY genre_id',
  user_artist_preferences: 'SELECT * FROM user_artist_preferences WHERE user_id = ? ORDER BY artist_id',
  user_mood_preferences: 'SELECT * FROM user_mood_preferences WHERE user_id = ? ORDER BY mood_id',
  user_context_preferences: 'SELECT * FROM user_context_preferences WHERE user_id = ? ORDER BY context_id',
  user_profiles: 'SELECT * FROM user_profiles WHERE user_id = ?',
  user_languages: 'SELECT * FROM user_languages WHERE user_id = ? ORDER BY language_id',
  playlists: 'SELECT * FROM playlists WHERE user_id = ? ORDER BY playlist_id',
  permanent_rec_lists: 'SELECT batch_id FROM recommendation_batches WHERE user_id = ? AND incognito_id IS NULL ORDER BY batch_id',
};

async function snapshot(userId) {
  const out = {};
  for (const [name, sql] of Object.entries(PERMANENT)) out[name] = JSON.stringify(await h.query(sql, [userId]));
  return out;
}

let user;
let songs;
before(async () => {
  await h.start();
  user = await h.newUser();
  songs = await h.query("SELECT song_id, duration_sec FROM songs WHERE status = 'ACTIVE' AND explicit = 0 AND content_rating = 'ALL' ORDER BY song_id LIMIT 6");
  // some permanent history first, so there is something to protect
  await h.play(user.token, songs[0].song_id, songs[0].duration_sec);
  await h.api('PUT', `/songs/${songs[0].song_id}/rating`, { token: user.token, body: { rating: 4 } });
  await h.api('GET', '/search?q=calm', { token: user.token });
  await h.api('POST', '/recommendations/mood', { token: user.token, body: { text: 'happy', limit: 5 } });
  await h.api('GET', '/worlds/current', { token: user.token });
});
after(h.stop);

test('a busy private session leaves every permanent table byte-for-byte unchanged', async () => {
  const calm = await h.one("SELECT mood_id FROM moods WHERE name = 'Calm'");
  const open = await h.one("SELECT COUNT(*) AS n FROM listening_sessions WHERE user_id = ? AND status = 'OPEN'", [user.id]);
  assert.equal(open.n, 1);
  const start = await h.api('POST', '/incognito', { token: user.token, body: { moodId: calm.mood_id } });
  assert.equal(start.status, 201);
  assert.equal(start.body.active, true);
  // by design, the open permanent session is closed (folded into the profile) BEFORE going private
  const stillOpen = await h.one("SELECT COUNT(*) AS n FROM listening_sessions WHERE user_id = ? AND status = 'OPEN'", [user.id]);
  assert.equal(stillOpen.n, 0);
  const beforeSnap = await snapshot(user.id);

  // play, skip, search, ask for recommendations, browse insights
  for (const s of songs.slice(1)) {
    const st = await h.api('POST', '/playback/start', { token: user.token, body: { songId: s.song_id } });
    assert.equal(st.status, 201);
    assert.equal(st.body.private, true);
    assert.equal(st.body.playId, null, 'no permanent play row was created');
    const f = await h.api('POST', '/playback/private', { token: user.token, body: { songId: s.song_id, listenedSec: s.duration_sec } });
    assert.equal(f.status, 200);
  }
  await h.api('POST', '/playback/private', { token: user.token, body: { songId: songs[1].song_id, listenedSec: 5 } });
  await h.api('POST', '/history', { token: user.token, body: { songId: songs[2].song_id, listenedSec: 100 } });
  assert.equal((await h.api('GET', '/search?q=love', { token: user.token })).status, 200);
  const rec = await h.api('POST', '/recommendations/mood', { token: user.token, body: { text: 'calm', limit: 10 } });
  assert.equal(rec.status, 200);
  assert.equal(rec.body.incognito, true);
  for (const p of ['/recommendations/daily', '/insights/profile', '/worlds/current']) assert.equal((await h.api('GET', p, { token: user.token })).status, 200, p);

  // permanent writes are refused, not silently dropped
  const rating = await h.api('PUT', `/songs/${songs[3].song_id}/rating`, { token: user.token, body: { rating: 5 } });
  assert.equal(rating.status, 409);
  assert.equal(rating.body.error.code, 'INCOGNITO_ACTIVE');
  assert.equal((await h.api('PUT', `/songs/${songs[3].song_id}/like`, { token: user.token, body: { liked: true } })).status, 409);
  assert.equal((await h.api('POST', '/playlists', { token: user.token, body: { name: 'Secret' } })).status, 409);
  assert.equal((await h.api('POST', '/worlds/current/regenerate', { token: user.token })).status, 409);

  // temporary memory did learn
  const st = await h.api('GET', '/incognito', { token: user.token });
  assert.equal(st.body.events, 7);          // 5 full plays + 1 short one + 1 via /history
  assert.ok(st.body.memory.find((m) => m.dimension === 'GENRE').items.length > 0);

  assert.deepEqual(await snapshot(user.id), beforeSnap, 'permanent profile unchanged');
});

test('the database itself rejects permanent history while a private session is active', async () => {
  const sess = await h.one('SELECT session_id FROM listening_sessions WHERE user_id = ? LIMIT 1', [user.id]);
  await assert.rejects(
    h.query('INSERT INTO listening_history (session_id, user_id, song_id, origin) VALUES (?, ?, ?, ?)', [sess.session_id, user.id, songs[1].song_id, 'HOME']),
    /Private session is active/);
});

test('ending the session deletes its temporary memory and private lists immediately', async () => {
  const id = (await h.one("SELECT incognito_id FROM incognito_sessions WHERE user_id = ? AND status = 'ACTIVE'", [user.id])).incognito_id;
  const end = await h.api('DELETE', '/incognito', { token: user.token });
  assert.equal(end.status, 200);
  assert.ok(end.body.purged.events > 0);
  assert.ok(end.body.purged.lists > 0);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM incognito_events WHERE incognito_id = ?', [id])).n, 0);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM recommendation_batches WHERE incognito_id = ?', [id])).n, 0);
  await assert.rejects(h.query('INSERT INTO incognito_events (incognito_id, song_id, listened_sec) VALUES (?, ?, 10)', [id, songs[1].song_id]), /Private session has ended/);

  // back to normal: plays are permanent again
  const r = await h.play(user.token, songs[1].song_id, 60);
  assert.equal(r.status, 200);
  assert.ok(r.body.playId);
  assert.equal((await h.api('DELETE', '/incognito', { token: user.token })).status, 409);
});

test('an expired private session stops being private and is purged by the cleanup job', async () => {
  const u = await h.newUser();
  await h.api('POST', '/incognito', { token: u.token, body: {} });
  assert.equal((await h.api('POST', '/incognito', { token: u.token, body: {} })).status, 409, 'only one active private session');
  await h.api('POST', '/playback/private', { token: u.token, body: { songId: songs[1].song_id, listenedSec: 60 } });
  await h.query(`UPDATE incognito_sessions SET started_at = NOW() - INTERVAL 2 HOUR, expires_at = NOW() - INTERVAL 1 SECOND
                  WHERE user_id = ? AND status = 'ACTIVE'`, [u.id]);
  const st = await h.api('GET', '/incognito', { token: u.token });
  assert.equal(st.body.active, false);
  const [[res]] = await h.query('CALL sp_cleanup_expired_incognito()');
  assert.ok(res.sessions_expired >= 1);
  const left = await h.one(
    'SELECT COUNT(*) AS n FROM incognito_events e JOIN incognito_sessions i USING (incognito_id) WHERE i.user_id = ?', [u.id]);
  assert.equal(left.n, 0);
  const s = await h.api('POST', '/playback/start', { token: u.token, body: { songId: songs[1].song_id } });
  assert.equal(s.body.private, false);
});

test("a private session never creates the week's world (it is built from the permanent profile)", async () => {
  const u = await h.newUser();
  await h.api('POST', '/incognito', { token: u.token, body: {} });
  const w = await h.api('GET', '/worlds/current', { token: u.token });
  assert.equal(w.status, 409);
  assert.equal(w.body.error.code, 'INCOGNITO_ACTIVE');
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM weekly_worlds WHERE user_id = ?', [u.id])).n, 0);
  await h.api('DELETE', '/incognito', { token: u.token });
  assert.equal((await h.api('GET', '/worlds/current', { token: u.token })).status, 200);
});

// Guarantees that live in the database itself (constraints, triggers, procedures),
// tested directly through the least-privilege application account.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let admin;
let adminId;
before(async () => {
  await h.start();
  admin = await h.login('admin', 'Admin@123');
  adminId = (await h.one("SELECT user_id FROM users WHERE username = 'admin'")).user_id;
});
after(h.stop);

const code = (errno) => (e) => e.errno === errno;

test('CHECK constraints reject impossible values', async () => {
  const s = await h.activeSong();
  await assert.rejects(h.query('UPDATE audio_features SET energy = 1.5 WHERE song_id = ? AND is_current = 1', [s.song_id]), code(3819));
  await assert.rejects(h.query('UPDATE audio_features SET tempo_bpm = 400 WHERE song_id = ? AND is_current = 1', [s.song_id]), code(3819));
  await assert.rejects(h.query("UPDATE songs SET explicit = 1, content_rating = 'ALL' WHERE song_id = ?", [s.song_id]), code(3819));
  await assert.rejects(h.query("UPDATE users SET email = 'not-an-email' WHERE username = 'varsha'"), code(3819));
});

test('foreign keys protect referenced rows', async () => {
  const s = await h.activeSong();
  await assert.rejects(h.query('DELETE FROM artists WHERE artist_id = ?', [s.primary_artist_id]), code(1451));
  await assert.rejects(h.query('INSERT INTO song_genres (song_id, genre_id, is_primary) VALUES (?, 65000, 0)', [s.song_id]), code(1452));
});

test('audio analysis is versioned: exactly one current version per song, switchable atomically', async () => {
  const s = await h.one('SELECT song_id FROM audio_features GROUP BY song_id HAVING COUNT(*) >= 2 LIMIT 1');
  const versions = await h.query('SELECT feature_id, is_current FROM audio_features WHERE song_id = ? ORDER BY feature_id', [s.song_id]);
  const cur = versions.find((v) => v.is_current);
  const old = versions.find((v) => !v.is_current);
  await assert.rejects(h.query('UPDATE audio_features SET is_current = 1 WHERE feature_id = ?', [old.feature_id]), code(1062));
  try {
    await h.query('CALL sp_set_current_audio_features(?)', [old.feature_id]);
    const now = await h.query('SELECT feature_id FROM audio_features WHERE song_id = ? AND is_current = 1', [s.song_id]);
    assert.deepEqual(now.map((r) => r.feature_id), [old.feature_id]);
  } finally {
    await h.query('CALL sp_set_current_audio_features(?)', [cur.feature_id]);
  }
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM audio_features WHERE song_id = ?', [s.song_id])).n, versions.length, 'old versions kept');
});

test('mood segments must stay inside the song and may not overlap', async () => {
  const seg = await h.one('SELECT song_id, model_id, start_sec, end_sec, mood_id FROM mood_segments ORDER BY segment_id LIMIT 1');
  const dur = (await h.one('SELECT duration_sec FROM songs WHERE song_id = ?', [seg.song_id])).duration_sec;
  await assert.rejects(h.query(
    `INSERT INTO mood_segments (song_id, model_id, segment_index, start_sec, end_sec, mood_id, confidence, energy, valence)
     VALUES (?, ?, 99, ?, ?, ?, 0.5, 0.5, 0.5)`, [seg.song_id, seg.model_id, seg.start_sec, seg.end_sec, seg.mood_id]), /may not overlap/);
  await assert.rejects(h.query(
    `INSERT INTO mood_segments (song_id, model_id, segment_index, start_sec, end_sec, mood_id, confidence, energy, valence)
     VALUES (?, ?, 98, ?, ?, ?, 0.5, 0.5, 0.5)`, [seg.song_id, seg.model_id, dur - 1, dur + 30, seg.mood_id]), /after the song ends/);
});

test('preferences decay with age: old plays fade from short-term faster than from long-term', async () => {
  const u = await h.newUser({ onboard: false });
  const [a, b] = await h.query(`SELECT s.song_id, s.duration_sec, sg.genre_id FROM songs s JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
                                 WHERE s.status = 'ACTIVE' AND sg.genre_id <> (SELECT genre_id FROM song_genres WHERE song_id = 1 AND is_primary = 1)
                                 ORDER BY s.song_id LIMIT 1`).then(async (x) => [x[0],
    await h.one(`SELECT s.song_id, s.duration_sec, sg.genre_id FROM songs s JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
                  WHERE s.song_id = 1`)]);
  // a play 30 days ago (inserted with its real timestamp), and a play now through the API
  const sess = await h.query(`INSERT INTO listening_sessions (user_id, started_at, last_activity_at, ended_at, status, plays, listen_sec)
                               VALUES (?, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 30 DAY, 'CLOSED', 1, ?)`, [u.id, a.duration_sec]);
  await h.query(`INSERT INTO listening_history (session_id, user_id, song_id, started_at, ended_at, listened_sec, origin)
                 VALUES (?, ?, ?, NOW() - INTERVAL 30 DAY, NOW() - INTERVAL 30 DAY, ?, 'HOME')`, [sess.insertId, u.id, a.song_id, a.duration_sec]);
  await h.play(u.token, b.song_id, b.duration_sec);
  const rows = await h.query('SELECT genre_id, short_term_score AS st, long_term_score AS lt FROM user_genre_preferences WHERE user_id = ? AND genre_id IN (?, ?)',
    [u.id, a.genre_id, b.genre_id]);
  const old = rows.find((r) => r.genre_id === a.genre_id);
  const recent = rows.find((r) => r.genre_id === b.genre_id);
  assert.ok(Number(old.st) < Number(recent.st) * 0.2, `short-term: 30-day-old play mostly faded (${old.st} vs ${recent.st})`);
  assert.ok(Number(old.lt) > Number(recent.lt) * 0.6, `long-term: still remembered (${old.lt} vs ${recent.lt})`);
});

test('duplicate songs merge into the canonical record without losing history', async () => {
  const artist = await h.one('SELECT artist_id FROM artists ORDER BY artist_id LIMIT 1');
  const genre = await h.one("SELECT genre_id FROM genres WHERE name = 'EDM'");
  const mk = (title) => h.api('POST', '/admin/songs', { token: admin, body: { title, artistId: artist.artist_id, genreId: genre.genre_id,
    durationSec: 180, releaseYear: 2026, features: { energy: 0.7, valence: 0.6, danceability: 0.7, acousticness: 0.2, instrumentalness: 0.1, speechiness: 0.05, tempo_bpm: 120 } } });
  const canonical = (await mk(`Merge Target ${h.uid()}`)).body;
  const dup = (await mk(`Merge Target (dup) ${h.uid()}`)).body;
  const u = await h.newUser();
  await h.play(u.token, dup.id, 180);
  await h.api('PUT', `/songs/${dup.id}/rating`, { token: u.token, body: { rating: 5 } });
  const pl = await h.api('POST', '/playlists', { token: u.token, body: { name: 'Merge test', songIds: [dup.id] } });

  assert.equal((await h.api('POST', '/admin/songs/merge', { token: admin, body: { duplicateSongId: dup.id, canonicalSongId: dup.id } })).status, 400);
  const m = await h.api('POST', '/admin/songs/merge', { token: admin, body: { duplicateSongId: dup.id, canonicalSongId: canonical.id } });
  assert.equal(m.status, 200);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM listening_history WHERE user_id = ? AND song_id = ?', [u.id, canonical.id])).n, 1);
  assert.equal((await h.one('SELECT rating FROM ratings WHERE user_id = ? AND song_id = ?', [u.id, canonical.id])).rating, 5);
  const d = await h.api('GET', `/playlists/${pl.body.id}`, { token: u.token });
  assert.deepEqual(d.body.songs.map((s) => s.id), [canonical.id]);
  const row = await h.one('SELECT status, merged_into_song_id FROM songs WHERE song_id = ?', [dup.id]);
  assert.deepEqual(row, { status: 'MERGED', merged_into_song_id: canonical.id });
  const a = await h.one("SELECT actor_user_id FROM audit_logs WHERE action = 'SONG_MERGED' AND entity_id = ?", [String(dup.id)]);
  assert.equal(a.actor_user_id, adminId);
  assert.equal((await h.api('POST', '/admin/songs/merge', { token: admin, body: { duplicateSongId: dup.id, canonicalSongId: canonical.id } })).status, 400);
});

test('MUSE World is versioned: regenerate makes v2, rollback restores v1, never two active', async () => {
  const u = await h.newUser();
  const v1 = await h.api('GET', '/worlds/current', { token: u.token });
  assert.equal(v1.status, 200);
  assert.equal(v1.body.world.version, 1);
  assert.ok(v1.body.world.signals, 'theme explained by stored signals');
  const v2 = await h.api('POST', '/worlds/current/regenerate', { token: u.token });
  assert.equal(v2.body.world.version, 2);
  const rb = await h.api('POST', '/worlds/current/rollback', { token: u.token });
  assert.equal(rb.body.world.version, 1);
  const statuses = await h.query('SELECT version, status FROM weekly_worlds WHERE user_id = ? ORDER BY version', [u.id]);
  assert.deepEqual(statuses.map((s) => s.status), ['ACTIVE', 'ROLLED_BACK']);
  await assert.rejects(h.query("UPDATE weekly_worlds SET status = 'ACTIVE' WHERE user_id = ? AND version = 2", [u.id]), code(1062));
  assert.equal((await h.api('POST', '/worlds/current/rollback', { token: u.token })).status, 400, 'nothing earlier to roll back to');
});

test('pipeline jobs are idempotent by key, and trend snapshots cover 24H / 7D / 30D', async () => {
  await assert.rejects(h.query(`INSERT INTO pipeline_jobs (job_type, idempotency_key, processing_version)
                                SELECT job_type, idempotency_key, processing_version FROM pipeline_jobs ORDER BY job_id LIMIT 1`), code(1062));
  const r = await h.api('POST', '/admin/pipeline/trends', { token: admin });
  assert.equal(r.status, 200);
  const job = await h.one("SELECT job_id, status FROM pipeline_jobs WHERE job_type = 'TREND_SNAPSHOT' ORDER BY job_id DESC LIMIT 1");
  assert.equal(job.status, 'COMPLETED');
  const windows = await h.query('SELECT DISTINCT window_code FROM trend_snapshots WHERE job_id = ? ORDER BY window_code', [job.job_id]);
  assert.deepEqual(windows.map((w) => w.window_code).sort(), ['24H', '30D', '7D']);
  const trending = await h.api('GET', '/trending?window=7D', { token: admin });
  assert.equal(trending.status, 200);
});

test('stored functions behave as documented', async () => {
  const f = await h.one(`SELECT fn_completion_pct(90, 180) AS half, fn_completion_pct(500, 180) AS capped,
                                fn_decay(7, 7) AS one_half_life, fn_week_start('2026-10-10') AS wk,
                                fn_normalize_text('  Vennela   Kurise! ') AS norm`);
  assert.equal(Number(f.half), 50);
  assert.equal(Number(f.capped), 100);
  assert.ok(Math.abs(f.one_half_life - 0.5) < 1e-9);
  assert.equal(f.wk instanceof Date ? f.wk.toISOString().slice(0, 10) : String(f.wk).slice(0, 10), '2026-10-05');
  assert.equal(f.norm, 'vennela kurise');
});

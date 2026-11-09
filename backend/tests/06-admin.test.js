const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let admin;
let curator;
let listener;
let adminId;
let curatorId;
const FEATURES = { energy: 0.82, valence: 0.74, danceability: 0.8, acousticness: 0.12, instrumentalness: 0.05, speechiness: 0.06, tempo_bpm: 128 };

before(async () => {
  await h.start();
  admin = await h.login('admin', 'Admin@123');
  curator = await h.login('kavya', 'Curator@123');
  listener = await h.newUser({ onboard: false });
  adminId = (await h.one("SELECT user_id FROM users WHERE username = 'admin'")).user_id;
  curatorId = (await h.one("SELECT user_id FROM users WHERE username = 'kavya'")).user_id;
});
after(h.stop);

async function newSong(token, extra = {}) {
  const artist = await h.one('SELECT artist_id FROM artists ORDER BY artist_id LIMIT 1');
  const genre = await h.one("SELECT genre_id FROM genres WHERE name = 'EDM'");
  return h.api('POST', '/admin/songs', { token, body: {
    title: `Test Anthem ${h.uid()}`, artistId: artist.artist_id, genreId: genre.genre_id, durationSec: 200, releaseYear: 2026,
    features: FEATURES, ...extra } });
}

test('role-based access: listener < curator < admin', async () => {
  assert.equal((await h.api('GET', '/admin/overview', { token: listener.token })).status, 403);
  assert.equal((await h.api('GET', '/admin/songs', { token: listener.token })).status, 403);
  for (const p of ['/admin/overview', '/admin/songs', '/admin/reviews', '/admin/health']) {
    assert.equal((await h.api('GET', p, { token: curator })).status, 200, `curator ${p}`);
  }
  for (const p of ['/admin/users', '/admin/audit']) {
    const r = await h.api('GET', p, { token: curator });
    assert.equal(r.status, 403, `curator ${p}`);
    assert.equal(r.body.error.code, 'FORBIDDEN');
  }
  assert.equal((await h.api('POST', '/admin/pipeline/trends', { token: curator })).status, 403);
  for (const p of ['/admin/users', '/admin/audit', '/admin/models', '/admin/jobs', '/admin/sources', '/admin/performance']) {
    assert.equal((await h.api('GET', p, { token: admin })).status, 200, `admin ${p}`);
  }
});

test('a curator adds a song: provenance recorded, analysed, mood-tagged, audited', async () => {
  const r = await newSong(curator);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'ACTIVE', 'analysis stored → playable');
  assert.ok(r.body.moodsDetailed.length >= 1, 'rule model tagged moods');
  const prov = await h.one(`SELECT ms.code, sr.status FROM source_records sr JOIN music_sources ms USING (source_id) WHERE sr.song_id = ?`, [r.body.id]);
  assert.deepEqual(prov, { code: 'MANUAL_ENTRY', status: 'COMPLETED' });
  const audit = await h.one("SELECT actor_user_id FROM audit_logs WHERE action = 'SONG_CREATED' AND entity_id = ?", [String(r.body.id)]);
  assert.equal(audit.actor_user_id, curatorId);

  const dup = await h.api('POST', '/admin/songs', { token: curator, body: { title: r.body.title, artistId: r.body.artist.id,
    genreId: r.body.genreId, durationSec: 200, releaseYear: 2026 } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_SONG');
  const badIsrc = await newSong(curator, { isrc: 'nope' });
  assert.equal(badIsrc.status, 400);
  assert.ok(badIsrc.body.error.details.isrc);
  const badFeature = await newSong(curator, { features: { ...FEATURES, energy: 1.7 } });
  assert.equal(badFeature.status, 400);
});

test('edits are audited by trigger with old and new values', async () => {
  const s = (await newSong(curator)).body;
  const r = await h.api('PATCH', `/admin/songs/${s.id}`, { token: curator, body: { popularity: 77, explicit: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.explicit, true);
  assert.notEqual(r.body.contentRating, 'ALL', 'explicit songs cannot stay rated ALL');
  const a = await h.one("SELECT actor_user_id, old_values, new_values FROM audit_logs WHERE action = 'SONG_UPDATED' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [String(s.id)]);
  assert.equal(a.actor_user_id, curatorId);
  assert.equal(a.new_values.popularity, 77);
  assert.notEqual(a.old_values.popularity, 77);
});

test('curator mood decisions survive re-analysis by the rule model', async () => {
  const s = (await newSong(curator)).body;
  const calm = await h.one("SELECT mood_id FROM moods WHERE name = 'Calm'");
  const tagged = s.moodsDetailed[0];
  const add = await h.api('PUT', `/admin/songs/${s.id}/moods/${calm.mood_id}`, { token: curator, body: { action: 'ADD', confidence: 0.9 } });
  assert.ok(add.body.moodsDetailed.some((m) => m.name === 'Calm'));
  const rm = await h.api('PUT', `/admin/songs/${s.id}/moods/${tagged.id}`, { token: curator, body: { action: 'REMOVE' } });
  assert.ok(!rm.body.moodsDetailed.some((m) => m.id === tagged.id));

  const model = await h.one("SELECT model_id FROM intelligence_models WHERE kind = 'MOOD' AND is_active = 1");
  await h.query('CALL sp_analyze_song_moods(?, NULL, ?)', [model.model_id, s.id]);
  const moods = await h.query('SELECT mood_id FROM v_current_song_moods WHERE song_id = ?', [s.id]);
  assert.ok(moods.some((m) => m.mood_id === calm.mood_id), 'ADD kept');
  assert.ok(!moods.some((m) => m.mood_id === tagged.id), 'REMOVE kept');

  assert.equal((await h.api('PUT', `/admin/songs/${s.id}/moods/${calm.mood_id}`, { token: curator, body: { action: 'ADD' } })).status, 400, 'ADD needs confidence');
  assert.equal((await h.api('DELETE', `/admin/songs/${s.id}/moods/${calm.mood_id}`, { token: curator })).status, 200);
  assert.equal((await h.api('DELETE', `/admin/songs/${s.id}/moods/${calm.mood_id}`, { token: curator })).status, 404);
});

test('deleting a song with history hides it instead; hidden songs drop out of listener views', async () => {
  const s = (await newSong(curator)).body;
  await h.play(listener.token, s.id, 120);
  const d = await h.api('DELETE', `/admin/songs/${s.id}`, { token: curator });
  assert.equal(d.body.result, 'HIDDEN');
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM listening_history WHERE song_id = ?', [s.id])).n, 1, 'history intact');
  assert.equal((await h.api('POST', '/playback/start', { token: listener.token, body: { songId: s.id } })).status, 409);
  const search = await h.api('GET', `/search?q=${encodeURIComponent(s.title)}`, { token: listener.token });
  assert.ok(!search.body.songs.some((x) => x.id === s.id));
});

test('model weights: bounded, audited, and admin-only', async () => {
  const model = await h.one("SELECT model_id FROM intelligence_models WHERE kind = 'RECOMMENDER' AND is_active = 1");
  const old = await h.one("SELECT param_value AS v FROM model_parameters WHERE model_id = ? AND param_code = 'w_trend'", [model.model_id]);
  assert.equal((await h.api('PATCH', `/admin/models/${model.model_id}/params/w_trend`, { token: curator, body: { value: 0.1 } })).status, 403);
  assert.equal((await h.api('PATCH', `/admin/models/${model.model_id}/params/w_trend`, { token: admin, body: { value: 5 } })).status, 400);
  const ok = await h.api('PATCH', `/admin/models/${model.model_id}/params/w_trend`, { token: admin, body: { value: 0.12 } });
  assert.equal(ok.status, 200);
  const a = await h.one("SELECT actor_user_id, old_values, new_values FROM audit_logs WHERE action = 'MODEL_PARAM_CHANGED' ORDER BY audit_id DESC LIMIT 1");
  assert.equal(a.actor_user_id, adminId);
  assert.equal(Number(a.new_values.value ?? a.new_values.param_value), 0.12);
  await h.api('PATCH', `/admin/models/${model.model_id}/params/w_trend`, { token: admin, body: { value: Number(old.v) } });
});

test('user management: role change audited, deactivation immediate, admins cannot lock themselves out', async () => {
  const u = await h.newUser({ onboard: false });
  const promote = await h.api('PATCH', `/admin/users/${u.id}`, { token: admin, body: { role: 'CURATOR' } });
  assert.equal(promote.status, 200);
  assert.equal((await h.api('GET', '/admin/songs', { token: u.token })).status, 200, 'permissions read from the database on each request');
  const a = await h.one("SELECT actor_user_id FROM audit_logs WHERE action = 'USER_ACCESS_CHANGED' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [String(u.id)]);
  assert.equal(a.actor_user_id, adminId);
  await h.api('PATCH', `/admin/users/${u.id}`, { token: admin, body: { isActive: false } });
  assert.equal((await h.api('GET', '/auth/me', { token: u.token })).status, 401);

  const self = await h.api('PATCH', `/admin/users/${adminId}`, { token: admin, body: { role: 'LISTENER' } });
  assert.equal(self.status, 409);
  assert.equal(self.body.error.code, 'SELF_LOCKOUT');
});

test('the audit log is append-only for the application database account', async () => {
  const row = await h.one('SELECT audit_id FROM audit_logs ORDER BY audit_id DESC LIMIT 1');
  await assert.rejects(h.query('DELETE FROM audit_logs WHERE audit_id = ?', [row.audit_id]), (e) => e.errno === 1142);
  await assert.rejects(h.query("UPDATE audit_logs SET action = 'X' WHERE audit_id = ?", [row.audit_id]), (e) => e.errno === 1142);
  await assert.rejects(h.query('DROP TABLE songs'), (e) => e.errno === 1142);
  const audit = await h.api('GET', '/admin/audit?limit=5', { token: admin });
  assert.equal(audit.body.length, 5);
});

test('ingestion is idempotent and review decisions are enforced and audited', async () => {
  const first = await h.api('POST', '/admin/pipeline/ingest', { token: admin, body: {} });
  assert.equal(first.status, 200);
  const songsBefore = (await h.one('SELECT COUNT(*) AS n FROM songs')).n;
  const again = await h.api('POST', '/admin/pipeline/ingest', { token: admin, body: {} });
  assert.equal(again.body.reused, true, 'same feed in the same week is not re-run');
  const forced = await h.api('POST', '/admin/pipeline/ingest', { token: admin, body: { force: true } });
  assert.equal(forced.status, 200);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM songs')).n, songsBefore, 'a forced re-run creates no duplicates');

  const list = await h.api('GET', '/admin/reviews?status=ALL&limit=200', { token: curator });
  assert.equal(list.status, 200);
  const failed = list.body.find((r) => r.review_type === 'FAILED_INGESTION' && r.status === 'PENDING');
  if (failed) {
    const notAllowed = await h.api('POST', `/admin/reviews/${failed.review_id}/decision`, { token: curator, body: { action: 'APPROVE' } });
    assert.equal(notAllowed.status, 400);
    assert.equal(notAllowed.body.error.code, 'ACTION_NOT_ALLOWED');
    const ok = await h.api('POST', `/admin/reviews/${failed.review_id}/decision`, { token: curator, body: { action: 'IGNORE', note: 'test' } });
    assert.equal(ok.status, 200);
    const twice = await h.api('POST', `/admin/reviews/${failed.review_id}/decision`, { token: curator, body: { action: 'IGNORE' } });
    assert.equal(twice.status, 409);
    const a = await h.one("SELECT actor_user_id FROM audit_logs WHERE entity_type = 'review_queue' AND entity_id = ? ORDER BY audit_id DESC LIMIT 1", [String(failed.review_id)]);
    assert.equal(a.actor_user_id, curatorId);
  }
  assert.equal((await h.api('POST', '/admin/reviews/1/decision', { token: listener.token, body: { action: 'IGNORE' } })).status, 403);
});

test('database health checks and the performance lab run', async () => {
  const health = await h.api('GET', '/admin/health', { token: admin });
  assert.equal(health.status, 200);
  assert.ok(health.body.integrity.length >= 8);
  const broken = health.body.integrity.filter((c) => c.severity === 'error' && !c.ok);
  assert.deepEqual(broken, [], 'no integrity violations');
  assert.ok(health.body.tables.length >= 50);
  const perf = await h.api('GET', '/admin/performance', { token: admin });
  assert.ok(perf.body.length >= 4);
  for (const q of perf.body) assert.ok(q.withIndex && q.withoutIndex, q.title);
});

// Product behaviour added in the finalisation pass: playable vs metadata-only
// songs, licensed local media, "Not for me", MUSE World feedback and failure
// safety, film and language pages, search edge cases, database outage handling.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const h = require('./helpers');
const cfg = require('../src/providers/config');

let base;
let admin;
let mediaDir;
const originalDir = cfg.localMedia.dir;
const cleanup = { media: [] };

/** A real, tiny WAV file (0.1 s of silence) so the browser could actually play it. */
function wav() {
  const samples = 800; const data = Buffer.alloc(samples * 2);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(8000, 24);
  hdr.writeUInt32LE(16000, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  return Buffer.concat([hdr, data]);
}

before(async () => {
  base = await h.start();
  admin = await h.login('admin', 'Admin@123');
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-media-'));
  cfg.localMedia.dir = mediaDir;
});
after(async () => {
  for (const id of cleanup.media) await h.query('DELETE FROM song_media WHERE media_id = ?', [id]);
  cfg.localMedia.dir = originalDir;
  fs.rmSync(mediaDir, { recursive: true, force: true });
  await h.stop();
});

// ---------------------------------------------------------------- playable vs metadata-only

test('metadata-only songs are listed honestly, cannot be played, and are never recommended', async () => {
  const u = await h.newUser();
  const meta = await h.metadataOnlySong();
  assert.ok(meta, 'the seed contains metadata-only songs');
  const detail = await h.api('GET', `/songs/${meta.song_id}`, { token: u.token });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.playback, { playable: false, type: null, source: null, demo: false });
  const play = await h.api('POST', '/playback/start', { token: u.token, body: { songId: meta.song_id } });
  assert.equal(play.status, 409);
  assert.equal(play.body.error.code, 'NO_PLAYBACK_SOURCE');
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM listening_history WHERE user_id = ?', [u.id])).n, 0, 'no history row for a failed start');

  const metaIds = new Set((await h.query('SELECT s.song_id FROM songs s WHERE NOT EXISTS (SELECT 1 FROM v_song_playback p WHERE p.song_id = s.song_id)')).map((r) => r.song_id));
  for (const path of ['/recommendations/daily?limit=50', '/recommendations/discovery?limit=50', '/recommendations/regional?limit=50']) {
    const r = await h.api('GET', path, { token: u.token });
    assert.equal(r.status, 200, path);
    assert.ok(r.body.songs.every((s) => !metaIds.has(s.id) && s.playback.playable), `${path} recommends only playable songs`);
  }
  const playable = await h.activeSong();
  const d2 = await h.api('GET', `/songs/${playable.song_id}`, { token: u.token });
  assert.equal(d2.body.playback.playable, true);
  assert.equal(d2.body.playback.demo, true, 'seed playback is the labelled demo fixture');
  const start = await h.api('POST', '/playback/start', { token: u.token, body: { songId: playable.song_id } });
  assert.equal(start.body.media.type, 'GENERATED_SKETCH');
  assert.match(start.body.media.label, /Demo fixture/);
  assert.equal(start.body.media.uri, null, 'no invented audio URL');
  await h.api('POST', `/playback/${start.body.playId}/finish`, { token: u.token, body: { listenedSec: 5 } });
});

// ---------------------------------------------------------------- licensed local media

test('licensed local media: registered by a curator, streamed with range support to signed-in users only', async () => {
  const meta = await h.metadataOnlySong();
  fs.writeFileSync(path.join(mediaDir, 'licensed-test.wav'), wav());
  const listener = await h.newUser();

  // validation and authorisation
  assert.equal((await h.api('POST', `/admin/songs/${meta.song_id}/media`, { token: listener.token, body: { fileName: 'licensed-test.wav' } })).status, 403);
  for (const bad of ['../etc/passwd', 'x.exe', '.hidden.wav', 'a/b.wav']) {
    const r = await h.api('POST', `/admin/songs/${meta.song_id}/media`, { token: admin, body: { fileName: bad } });
    assert.equal(r.status, 400, bad);
  }
  assert.equal((await h.api('POST', `/admin/songs/${meta.song_id}/media`, { token: admin, body: { fileName: 'missing.wav' } })).status, 404);

  const reg = await h.api('POST', `/admin/songs/${meta.song_id}/media`, { token: admin, body: { fileName: 'licensed-test.wav', attribution: 'Recorded by the MUSE team' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  cleanup.media.push(reg.body.mediaId);
  const again = await h.api('POST', `/admin/songs/${meta.song_id}/media`, { token: admin, body: { fileName: 'licensed-test.wav' } });
  assert.equal(again.body.created, false, 'registration is idempotent');

  // the song is now playable from the local file (higher priority than the sketch)
  const d = await h.api('GET', `/songs/${meta.song_id}`, { token: listener.token });
  assert.deepEqual(d.body.playback, { playable: true, type: 'USER_LOCAL', source: 'LOCAL_MEDIA', demo: false });
  const start = await h.api('POST', '/playback/start', { token: listener.token, body: { songId: meta.song_id } });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  assert.equal(start.body.media.uri, `/api/media/${reg.body.mediaId}`);
  assert.equal(start.body.media.attribution, 'Recorded by the MUSE team');
  await h.api('POST', `/playback/${start.body.playId}/finish`, { token: listener.token, body: { listenedSec: 5 } });

  // streaming
  const anon = await fetch(`${base}/media/${reg.body.mediaId}`);
  assert.equal(anon.status, 401);
  const full = await fetch(`${base}/media/${reg.body.mediaId}`, { headers: { Authorization: `Bearer ${listener.token}` } });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'audio/wav');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal((await full.arrayBuffer()).byteLength, 44 + 1600);
  const part = await fetch(`${base}/media/${reg.body.mediaId}`, { headers: { Authorization: `Bearer ${listener.token}`, Range: 'bytes=0-43' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 44);
  assert.equal((await fetch(`${base}/media/99999999`, { headers: { Authorization: `Bearer ${listener.token}` } })).status, 404);

  // the file disappears: marked unavailable, the song falls back, never a broken player
  fs.unlinkSync(path.join(mediaDir, 'licensed-test.wav'));
  const gone = await fetch(`${base}/media/${reg.body.mediaId}`, { headers: { Authorization: `Bearer ${listener.token}` } });
  assert.equal(gone.status, 404);
  assert.equal((await gone.json()).error.code, 'MEDIA_UNAVAILABLE');
  assert.equal((await h.one('SELECT availability FROM song_media WHERE media_id = ?', [reg.body.mediaId])).availability, 'UNAVAILABLE');
  const after = await h.api('POST', '/playback/start', { token: listener.token, body: { songId: meta.song_id } });
  assert.equal(after.status, 409, 'metadata-only again');

  // the hourly check restores it when the file comes back
  fs.writeFileSync(path.join(mediaDir, 'licensed-test.wav'), wav());
  const chk = await h.api('POST', '/admin/media/check', { token: admin });
  assert.equal(chk.status, 200);
  assert.ok(chk.body.available >= 1);
  assert.equal((await h.one('SELECT availability FROM song_media WHERE media_id = ?', [reg.body.mediaId])).availability, 'AVAILABLE');
});

// ---------------------------------------------------------------- "Not for me"

test('"Not for me" removes a song from future recommendations until undone; paused in private sessions', async () => {
  const u = await h.newUser();
  const first = await h.api('GET', '/recommendations/daily?limit=10', { token: u.token });
  const target = first.body.songs[0];
  const d = await h.api('PUT', `/songs/${target.id}/dismiss`, { token: u.token, body: { batchId: first.body.batchId } });
  assert.equal(d.status, 200);
  assert.equal((await h.api('PUT', `/songs/${target.id}/dismiss`, { token: u.token, body: {} })).status, 200, 'idempotent');
  for (let i = 0; i < 3; i++) {
    const r = await h.api('GET', '/recommendations/daily?limit=50', { token: u.token });
    assert.ok(!r.body.songs.some((s) => s.id === target.id), 'dismissed song is not recommended');
  }
  const list = await h.api('GET', '/me/dismissals', { token: u.token });
  assert.deepEqual(list.body.map((s) => s.id), [target.id]);
  // someone else's batch id is ignored, never linked
  const other = await h.newUser();
  const ob = await h.api('GET', '/recommendations/daily?limit=5', { token: other.token });
  await h.api('PUT', `/songs/${ob.body.songs[1].id}/dismiss`, { token: u.token, body: { batchId: ob.body.batchId } });
  assert.equal((await h.one('SELECT batch_id FROM song_dismissals WHERE user_id = ? AND song_id = ?', [u.id, ob.body.songs[1].id])).batch_id, null);

  assert.equal((await h.api('POST', '/incognito', { token: u.token, body: {} })).status, 201);
  const priv = await h.api('PUT', `/songs/${target.id}/dismiss`, { token: u.token, body: {} });
  assert.equal(priv.status, 409);
  assert.equal(priv.body.error.code, 'INCOGNITO_ACTIVE');
  await h.api('DELETE', '/incognito', { token: u.token });

  assert.equal((await h.api('DELETE', `/songs/${target.id}/dismiss`, { token: u.token })).status, 200);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM song_dismissals WHERE user_id = ? AND song_id = ?', [u.id, target.id])).n, 0);
  assert.equal((await h.api('PUT', '/songs/99999999/dismiss', { token: u.token, body: {} })).status, 404);
});

// ---------------------------------------------------------------- MUSE World

test('world feedback is stored per listener, shapes the next world, and is owner-only', async () => {
  const u = await h.newUser();
  const cur = await h.api('GET', '/worlds/current', { token: u.token });
  assert.equal(cur.status, 200);
  assert.equal(cur.body.world.feedback, null);
  assert.ok(cur.body.world.generatedAt && cur.body.world.expiresAt, 'timestamps are exposed');
  const wid = cur.body.world.id;
  const disliked = cur.body.world.archetype.code;

  const stranger = await h.newUser();
  assert.equal((await h.api('PUT', `/worlds/${wid}/feedback`, { token: stranger.token, body: { feedback: 'LOVE' } })).status, 404);
  assert.equal((await h.api('PUT', `/worlds/${wid}/feedback`, { token: u.token, body: { feedback: 'MEH' } })).status, 400);

  assert.equal((await h.api('PUT', `/worlds/${wid}/feedback`, { token: u.token, body: { feedback: 'LOVE' } })).status, 200);
  assert.equal((await h.api('GET', '/worlds/current', { token: u.token })).body.world.feedback, 'LOVE');
  assert.equal((await h.api('PUT', `/worlds/${wid}/feedback`, { token: u.token, body: { feedback: 'NOT_FOR_ME' } })).status, 200);

  const next = await h.api('POST', '/worlds/current/regenerate', { token: u.token });
  assert.equal(next.status, 200);
  assert.deepEqual(next.body.world.signals.feedback, [{ archetype: disliked, love: 0, notForMe: 1 }], 'the evidence records the feedback');
  assert.notEqual(next.body.world.archetype.code, disliked, '"Not for me" steers the next world away from that archetype');

  assert.equal((await h.api('DELETE', `/worlds/${wid}/feedback`, { token: u.token })).status, 200);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM world_feedback WHERE user_id = ?', [u.id])).n, 0);

  assert.equal((await h.api('POST', '/incognito', { token: u.token, body: {} })).status, 201);
  assert.equal((await h.api('PUT', `/worlds/${wid}/feedback`, { token: u.token, body: { feedback: 'LOVE' } })).status, 409);
  await h.api('DELETE', '/incognito', { token: u.token });
});

test('a failed world refresh keeps the current world and says so', async () => {
  const u = await h.newUser();
  const before = (await h.api('GET', '/worlds/current', { token: u.token })).body.world;
  const rec = require('../src/services/recommendationService');
  const real = rec.runInTx;
  rec.runInTx = async () => { throw new Error('simulated generator failure'); };
  let r;
  try {
    r = await h.api('POST', '/worlds/current/regenerate', { token: u.token });
  } finally {
    rec.runInTx = real;
  }
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'WORLD_REFRESH_FAILED');
  assert.ok(!JSON.stringify(r.body).includes('simulated'), 'internal error text is not leaked');
  const afterW = (await h.api('GET', '/worlds/current', { token: u.token })).body.world;
  assert.equal(afterW.id, before.id);
  assert.equal(afterW.version, before.version);
  assert.equal((await h.one("SELECT COUNT(*) AS n FROM weekly_worlds WHERE user_id = ? AND status = 'ACTIVE'", [u.id])).n, 1);
});

// ---------------------------------------------------------------- pages and search

test('film page: soundtrack albums, songs and composers; unknown film is 404', async () => {
  const u = await h.newUser({ onboard: false });
  const film = await h.one('SELECT film_id, title FROM films ORDER BY film_id LIMIT 1');
  const r = await h.api('GET', `/films/${film.film_id}`, { token: u.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, film.title);
  assert.ok(r.body.albums.length >= 1);
  assert.ok(r.body.songs.length >= 1);
  assert.ok(r.body.songs.every((s) => s.album.filmId === film.film_id));
  assert.ok(Array.isArray(r.body.composers));
  assert.equal((await h.api('GET', '/films/99999999', { token: u.token })).status, 404);
  assert.equal((await h.api('GET', '/films/abc', { token: u.token })).status, 400);
});

test('language page: regions, artists, films and songs for one language', async () => {
  const u = await h.newUser({ onboard: false });
  const te = await h.one("SELECT language_id FROM languages WHERE iso_code = 'te'");
  const r = await h.api('GET', `/languages/${te.language_id}`, { token: u.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Telugu');
  assert.ok(r.body.totalSongs > 0);
  assert.ok(r.body.songs.every((s) => s.language.id === te.language_id));
  assert.ok(r.body.regions.some((x) => x.code === 'IN-TG' || x.code === 'IN-AP'));
  assert.equal((await h.api('GET', '/languages/9999', { token: u.token })).status, 404);
});

test('search edge cases: empty, one character, nothing found, very long', async () => {
  const u = await h.newUser({ onboard: false });
  assert.equal((await h.api('GET', '/search?q=', { token: u.token })).status, 400);
  assert.equal((await h.api('GET', '/search?q=a', { token: u.token })).status, 400);
  const none = await h.api('GET', `/search?q=${encodeURIComponent('qqzzxxkk')}`, { token: u.token });
  assert.equal(none.status, 200);
  assert.equal(none.body.total, 0);
  assert.deepEqual(none.body.songs, []);
  assert.equal((await h.api('GET', `/search?q=${'a'.repeat(81)}`, { token: u.token })).status, 400);
  // ngram noise is filtered, but real misspellings and aliases still match
  const noisy = await h.api('GET', '/search?q=xyzzyplugh', { token: u.token });
  assert.equal(noisy.body.total, 0, 'a nonsense word that shares only a letter pair with titles finds nothing');
  const typo = await h.api('GET', '/search?q=venela', { token: u.token });
  assert.ok(typo.body.songs.some((x) => /vennela/i.test(x.title)), 'misspelling "venela" finds "Vennela"');
  const alias = await h.one('SELECT a.artist_id, al.alias FROM artist_aliases al JOIN artists a ON a.artist_id = al.artist_id ORDER BY al.alias LIMIT 1');
  const byAlias = await h.api('GET', `/search?q=${encodeURIComponent(alias.alias)}`, { token: u.token });
  assert.ok(byAlias.body.artists.some((x) => x.id === alias.artist_id), `alias "${alias.alias}" finds its artist`);
  assert.equal((await h.api('GET', `/search?q=${encodeURIComponent('%_\\')}`, { token: u.token })).status, 400);
});

// ---------------------------------------------------------------- outage

test('database outage: requests fail with 503 DATABASE_UNAVAILABLE, readiness is 503, liveness stays 200', async () => {
  const u = await h.newUser({ onboard: false });
  const db = require('../src/config/db');
  const real = db.pool.query;
  db.pool.query = async () => { const e = new Error('connect ECONNREFUSED 127.0.0.1:3306'); e.code = 'ECONNREFUSED'; throw e; };
  try {
    const r = await h.api('GET', '/songs', { token: u.token });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'DATABASE_UNAVAILABLE');
    assert.ok(!JSON.stringify(r.body).includes('3306'), 'no connection details leaked');
    const ready = await fetch(`${base}/ready`);
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).database, 'down');
    assert.equal((await fetch(`${base}/health`)).status, 200);
  } finally {
    db.pool.query = real;
  }
  assert.equal((await h.api('GET', '/songs?pageSize=1', { token: u.token })).status, 200, 'recovers when the database is back');
});

test('the schema is at the latest migration and every view/routine/trigger uses one collation', async () => {
  const { files } = require('../scripts/migrate');
  const latest = files().at(-1).version;
  const cur = await h.one('SELECT MAX(version) AS v FROM schema_migrations');
  assert.equal(cur.v, latest);
  // a routine created under a different collation than its callers fails with
  // "Illegal mix of collations" (a real bug found while adding migrations)
  const coll = await h.query(
    `SELECT DISTINCT c FROM (
       SELECT COLLATION_CONNECTION AS c FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()
       UNION ALL SELECT COLLATION_CONNECTION FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()
       UNION ALL SELECT COLLATION_CONNECTION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()) x`);
  assert.equal(coll.length, 1, JSON.stringify(coll));
});

test('onboarding offers composers / film music, saves them, and pre-fills a redo', async () => {
  const u = await h.newUser({ onboard: false });
  const o = await h.api('GET', '/me/onboarding', { token: u.token });
  assert.equal(o.status, 200);
  assert.equal(o.body.current, null, 'nothing saved yet');
  assert.ok(o.body.composers.length > 0, 'seed has composers');
  assert.ok(o.body.composers.some((c) => c.films), 'composers carry their film credits');
  const composer = o.body.composers[0];
  const te = o.body.languages.find((l) => l.name === 'Telugu');
  const save = await h.api('POST', '/me/onboarding', { token: u.token, body: { languageIds: [te.id], composerIds: [composer.id], moodIds: [o.body.moods[0].id] } });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  const pref = await h.one('SELECT onboarding_weight FROM user_artist_preferences WHERE user_id = ? AND artist_id = ?', [u.id, composer.id]);
  assert.equal(Number(pref.onboarding_weight), 0.9);
  const again = await h.api('GET', '/me/onboarding', { token: u.token });
  assert.deepEqual(again.body.current.languageIds, [te.id]);
  assert.deepEqual(again.body.current.moodIds, [o.body.moods[0].id]);
  const tooMany = await h.api('POST', '/me/onboarding', { token: u.token, body: { languageIds: [te.id], composerIds: [1, 2, 3, 4, 5] } });
  assert.equal(tooMany.status, 400);
});

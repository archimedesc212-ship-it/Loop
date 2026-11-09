// External provider adapters, tested against a LOCAL mock HTTP server only.
// No test in this file makes a real external request.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const h = require('./helpers');
const cfg = require('../src/providers/config');
const providers = require('../src/providers');
const { requestJson, ProviderError, _reset } = require('../src/providers/http');

let mock;           // { server, url, state: { hits, handler } }
let admin;
const original = JSON.parse(JSON.stringify(cfg));
const created = { media: [], records: [] };

function startMock() {
  return new Promise((resolve) => {
    const state = { hits: [], handler: (req, res) => { res.writeHead(404); res.end(); } };
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { state.hits.push({ method: req.method, url: req.url, headers: req.headers, body }); state.handler(req, res, body); });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
const json = (res, status, obj, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
const reply = (fn) => { mock.state.handler = fn; mock.state.hits.length = 0; };
const hits = () => mock.state.hits;

function restoreConfig() {
  for (const k of Object.keys(original)) {
    if (typeof original[k] === 'object') Object.assign(cfg[k], original[k]); else cfg[k] = original[k];
  }
}

before(async () => {
  await h.start();
  mock = await startMock();
  admin = await h.login('admin', 'Admin@123');
});
beforeEach(() => { restoreConfig(); cfg.retries = 2; cfg.timeoutMs = 400; _reset(); providers.theAudioDb._resetCache(); });
after(async () => {
  restoreConfig();
  for (const id of created.media) await h.query('DELETE FROM song_media WHERE media_id = ?', [id]);
  for (const id of created.records) await h.query('DELETE FROM source_records WHERE record_id = ?', [id]);
  await h.query("UPDATE music_sources SET is_enabled = 0 WHERE code IN ('EXTERNAL_PREVIEW')");
  await new Promise((r) => mock.server.close(r));
  await h.stop();
});

// ---------------------------------------------------------------- framework

test('every external provider is disabled by default and the app runs without keys', async () => {
  const st = Object.fromEntries(providers.status().map((p) => [p.code, p.state]));
  assert.deepEqual(st, { MUSICBRAINZ: 'disabled', TMDB: 'disabled', YOUTUBE_DATA: 'disabled', EXTERNAL_PREVIEW: 'disabled', THEAUDIODB: 'disabled', LOCAL_MEDIA: 'ready', AI: 'disabled' });
  await assert.rejects(providers.tmdb.searchMovie({ title: 'x' }), (e) => e instanceof ProviderError && e.code === 'DISABLED');
  const r = await h.api('POST', '/admin/providers/TMDB/test', { token: admin });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'PROVIDER_NOT_CONFIGURED');
  const list = await h.api('GET', '/admin/providers', { token: admin });
  assert.equal(list.status, 200);
  assert.ok(list.body.every((p) => p.code && p.state && p.purpose));
});

test('enabled but missing or invalid credentials are reported, never guessed', () => {
  cfg.tmdb.enabled = true; cfg.tmdb.readToken = ''; cfg.tmdb.apiKey = '';
  assert.equal(providers.tmdb.check().state, 'missing_credentials');
  cfg.youtube.enabled = true; cfg.youtube.apiKey = '';
  assert.deepEqual(providers.youtube.check().missing, ['YOUTUBE_API_KEY']);
  cfg.musicbrainz.enabled = true; cfg.musicbrainz.userAgent = 'MUSE/1.0';
  assert.equal(providers.musicbrainz.check().state, 'invalid_config', 'User-Agent without contact details is refused');
  cfg.musicbrainz.userAgent = 'MUSE/1.0 (student@example.com)';
  assert.equal(providers.musicbrainz.check().state, 'ready');
  cfg.ai.provider = 'openai';
  assert.equal(providers.ai.check().state, 'invalid_config');
  cfg.ai.provider = 'anthropic'; cfg.ai.apiKey = ''; cfg.ai.model = '';
  assert.deepEqual(providers.ai.check().missing, ['AI_API_KEY', 'AI_MODEL']);
  cfg.externalPreview.enabled = true; cfg.externalPreview.baseUrl = 'ftp://x'; cfg.externalPreview.apiKey = 'k';
  assert.equal(providers.externalPreview.check().state, 'invalid_config');
});

test('a provider that does not answer times out, is retried a bounded number of times, then fails cleanly', async () => {
  reply(() => { /* never answers */ });
  const t = Date.now();
  await assert.rejects(requestJson('TEST', `${mock.url}/slow`, { timeoutMs: 150, retries: 2 }), (e) => e.code === 'TIMEOUT' && e.retryable);
  assert.equal(hits().length, 3, '1 attempt + 2 retries');
  assert.ok(Date.now() - t < 3000);
});

test('5xx is retried and a later success is returned', async () => {
  let n = 0;
  reply((req, res) => (++n < 3 ? json(res, 503, {}) : json(res, 200, { ok: true })));
  assert.deepEqual(await requestJson('TEST', `${mock.url}/flaky`, { retries: 2 }), { ok: true });
  assert.equal(n, 3);
});

test('429 honours Retry-After; persistent 429 becomes RATE_LIMITED', async () => {
  let n = 0;
  reply((req, res) => (++n === 1 ? json(res, 429, {}, { 'Retry-After': '0' }) : json(res, 200, { ok: 1 })));
  assert.deepEqual(await requestJson('TEST', `${mock.url}/rl`, { retries: 1 }), { ok: 1 });
  reply((req, res) => json(res, 429, {}, { 'Retry-After': '0' }));
  await assert.rejects(requestJson('TEST', `${mock.url}/rl`, { retries: 1 }), (e) => e.code === 'RATE_LIMITED');
  assert.equal(hits().length, 2);
});

test('401/403 are not retried; error messages never contain the query string (where API keys live)', async () => {
  reply((req, res) => json(res, 401, { error: 'bad key' }));
  await assert.rejects(requestJson('TEST', `${mock.url}/x?key=SECRET123`, { retries: 3 }), (e) => {
    assert.equal(e.code, 'HTTP_ERROR');
    assert.equal(e.status, 401);
    assert.ok(!e.message.includes('SECRET123'));
    return true;
  });
  assert.equal(hits().length, 1);
});

test('a non-JSON body is a BAD_RESPONSE, a refused connection is NETWORK', async () => {
  reply((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>'); });
  await assert.rejects(requestJson('TEST', `${mock.url}/html`, { retries: 0 }), (e) => e.code === 'BAD_RESPONSE');
  await assert.rejects(requestJson('TEST', 'http://127.0.0.1:9/', { retries: 0, timeoutMs: 500 }), (e) => e.code === 'NETWORK' || e.code === 'TIMEOUT');
});

test('the per-provider minimum interval spaces requests out (MusicBrainz: 1 request per second)', async () => {
  reply((req, res) => json(res, 200, {}));
  const t = Date.now();
  await requestJson('MB_RATE', `${mock.url}/a`, { minIntervalMs: 300 });
  await requestJson('MB_RATE', `${mock.url}/b`, { minIntervalMs: 300 });
  assert.ok(Date.now() - t >= 290);
});

// ---------------------------------------------------------------- adapters

test('MusicBrainz: sends the identifying User-Agent and maps recordings to metadata-only records', async () => {
  Object.assign(cfg.musicbrainz, { enabled: true, userAgent: 'MUSE/1.0 (student@example.com)', baseUrl: mock.url, minIntervalMs: 0 });
  reply((req, res) => json(res, 200, { recordings: [{ id: 'mbid-1', title: 'Song', length: 201000, isrcs: ['INABC2600001'],
    'artist-credit': [{ name: 'Artist' }], releases: [{ title: 'Album', date: '2024-03-01' }] }] }));
  const r = await providers.musicbrainz.discover({ query: 'x', limit: 1 });
  assert.equal(hits()[0].headers['user-agent'], 'MUSE/1.0 (student@example.com)');
  assert.equal(r.records[0].rights, 'METADATA_ONLY');
  assert.equal(r.records[0].payload.duration_sec, 201);
  assert.equal(r.records[0].payload.isrc, 'INABC2600001');
  reply((req, res) => json(res, 200, { nope: true }));
  await assert.rejects(providers.musicbrainz.discover({ query: 'x' }), (e) => e.code === 'BAD_RESPONSE');
});

test('TheAudioDB: maps exact artist metadata, permits artwork hosts, and does not return unsafe image URLs', async () => {
  Object.assign(cfg.theAudioDb, { enabled: true, apiKey: '123', baseUrl: mock.url, minIntervalMs: 0 });
  reply((req, res) => json(res, 200, { artists: [{
    idArtist: '111', strArtist: 'Coldplay',
    strArtistBanner: 'https://r2.theaudiodb.com/images/media/artist/banner/banner.jpg',
    strArtistFanart: 'https://evil.example/fanart.jpg',
    strArtistThumb: 'https://www.theaudiodb.com/images/media/artist/thumb/thumb.jpg',
    strBiographyEN: 'Biography',
  }] }));
  const artist = await providers.theAudioDb.artistArtwork({ name: 'Coldplay' });
  assert.equal(hits().length, 1);
  assert.match(hits()[0].url, /^\\/api\\/v1\\/json\\/123\\/search\\.php\\?s=Coldplay$/);
  assert.equal(artist.name, 'Coldplay');
  assert.equal(artist.banner, 'https://r2.theaudiodb.com/images/media/artist/banner/banner.jpg');
  assert.equal(artist.fanart, null, 'external untrusted image hosts are not returned');
  assert.equal(artist.source, 'TheAudioDB');

  // The API key is in the URL path for this provider; errors must still redact it.
  reply((req, res) => json(res, 401, { error: 'bad key' }));
  await assert.rejects(requestJson('THEAUDIODB', `${mock.url}/api/v1/json/SECRET_PATH/search.php?s=Coldplay`, { retries: 0 }),
    (error) => error.code === 'HTTP_ERROR' && !error.message.includes('SECRET_PATH'));
});

test('TMDB film enrichment: confident match is stored once (idempotent) with attribution; ambiguous results store nothing', async () => {
  Object.assign(cfg.tmdb, { enabled: true, readToken: 'test-token', baseUrl: mock.url, minIntervalMs: 0 });
  const film = await h.one('SELECT film_id, title, release_year FROM films ORDER BY film_id LIMIT 1');
  reply((req, res) => json(res, 200, { results: [
    { id: 987654321, title: film.title, original_title: film.title, release_date: `${film.release_year}-05-01`, overview: 'A test overview.', original_language: 'te' },
    { id: 2, title: `${film.title} Returns`, release_date: '1999-01-01' }] }));
  const first = await h.api('POST', `/admin/films/${film.film_id}/enrich`, { token: admin, body: {} });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.stored, true);
  assert.equal(first.body.created, true);
  assert.equal(hits()[0].headers.authorization, 'Bearer test-token');
  const rec = await h.one("SELECT record_id FROM source_records WHERE entity_type = 'FILM' AND external_id = '987654321'");
  created.records.push(rec.record_id);
  const again = await h.api('POST', `/admin/films/${film.film_id}/enrich`, { token: admin, body: {} });
  assert.equal(again.body.created, false);
  assert.equal(again.body.changed, false);
  assert.equal((await h.one("SELECT COUNT(*) AS n FROM source_records WHERE external_id = '987654321'")).n, 1);

  const listener = await h.newUser({ onboard: false });
  const page = await h.api('GET', `/films/${film.film_id}`, { token: listener.token });
  assert.equal(page.status, 200);
  assert.equal(page.body.external.source, 'TMDB');
  assert.equal(page.body.external.overview, 'A test overview.');
  assert.match(page.body.external.attribution, /TMDB/);

  // ambiguous: two same-title candidates -> nothing stored, candidates returned
  const other = await h.one('SELECT film_id, title, release_year FROM films WHERE film_id <> ? ORDER BY film_id LIMIT 1', [film.film_id]);
  reply((req, res) => json(res, 200, { results: [
    { id: 11, title: other.title, release_date: `${other.release_year}-01-01` }, { id: 12, title: other.title, release_date: `${other.release_year}-06-01` }] }));
  const amb = await h.api('POST', `/admin/films/${other.film_id}/enrich`, { token: admin, body: {} });
  assert.equal(amb.body.stored, false);
  assert.equal(amb.body.reason, 'NO_CONFIDENT_MATCH');
  assert.equal(amb.body.candidates.length, 2);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM source_records WHERE film_id = ?', [other.film_id])).n, 0);
});

test('TMDB errors reach the admin as clear API errors (rejected key, timeout)', async () => {
  Object.assign(cfg.tmdb, { enabled: true, readToken: 'bad', baseUrl: mock.url, minIntervalMs: 0 });
  const film = await h.one('SELECT film_id FROM films ORDER BY film_id DESC LIMIT 1');
  reply((req, res) => json(res, 401, { status_message: 'Invalid API key' }));
  const r = await h.api('POST', `/admin/films/${film.film_id}/enrich`, { token: admin, body: {} });
  assert.equal(r.status, 502);
  assert.equal(r.body.error.code, 'PROVIDER_CREDENTIALS_REJECTED');
  assert.ok(!JSON.stringify(r.body).includes('bad'), 'token not echoed');
  cfg.timeoutMs = 100; cfg.retries = 0;
  reply(() => {});
  const t = await h.api('POST', `/admin/films/${film.film_id}/enrich`, { token: admin, body: {} });
  assert.equal(t.status, 504);
  assert.equal(t.body.error.code, 'PROVIDER_TIMEOUT');
});

test('YouTube Data API: video links are stored as metadata (idempotent) and shown on the song page', async () => {
  Object.assign(cfg.youtube, { enabled: true, apiKey: 'yt-key', baseUrl: mock.url, minIntervalMs: 0 });
  const song = await h.activeSong();
  reply((req, res) => json(res, 200, { items: [
    { id: { videoId: 'abcDEF12345' }, snippet: { title: 'Official video', channelTitle: 'Label', publishedAt: '2024-01-01T00:00:00Z' } },
    { id: { videoId: '../../etc' }, snippet: {} }] }));
  const r = await h.api('POST', `/admin/songs/${song.song_id}/video-links`, { token: admin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.stored.length, 1, 'invalid ids are dropped');
  assert.match(hits()[0].url, /key=yt-key/);
  const rec = await h.one("SELECT record_id FROM source_records WHERE external_id = 'abcDEF12345'");
  created.records.push(rec.record_id);
  const again = await h.api('POST', `/admin/songs/${song.song_id}/video-links`, { token: admin });
  assert.equal(again.body.stored[0].created, false);
  const page = await h.api('GET', `/songs/${song.song_id}`, { token: admin });
  assert.equal(page.body.videoLinks[0].url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.ok(!page.body.provenance.some((p) => p.source === 'YOUTUBE_DATA'));
});

test('external preview: used when the provider returns an https URL; "no preview" marks the source unavailable and falls back', async () => {
  Object.assign(cfg.externalPreview, { enabled: true, baseUrl: mock.url, apiKey: 'prev-key' });
  await h.query("UPDATE music_sources SET is_enabled = 1 WHERE code = 'EXTERNAL_PREVIEW'");
  const song = await h.activeSong("s.isrc IS NOT NULL AND s.explicit = 0 AND s.content_rating = 'ALL'");
  const src = await h.one("SELECT source_id FROM music_sources WHERE code = 'EXTERNAL_PREVIEW'");
  const ins = await h.query("INSERT INTO song_media (song_id, source_id, media_type, uri, rights_status, priority) VALUES (?, ?, 'PREVIEW', 'provider:EXTERNAL_PREVIEW', 'PERMITTED', 20)",
    [song.song_id, src.source_id]);
  created.media.push(ins.insertId);
  const u = await h.newUser();

  reply((req, res) => json(res, 200, { previewUrl: 'https://cdn.example/p.mp3', durationSec: 30, attribution: 'Preview by Example' }));
  const ok = await h.api('POST', '/playback/start', { token: u.token, body: { songId: song.song_id } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.media.type, 'PREVIEW');
  assert.equal(ok.body.media.uri, 'https://cdn.example/p.mp3');
  assert.equal(ok.body.media.attribution, 'Preview by Example');
  assert.equal(hits()[0].headers.authorization, 'Bearer prev-key');
  assert.match(hits()[0].url, new RegExp(`isrc=${song.isrc}`));
  await h.api('POST', `/playback/${ok.body.playId}/finish`, { token: u.token, body: { listenedSec: 10 } });

  // provider timeout: fall back to the demo sketch for this play, do not mark
  cfg.timeoutMs = 100;
  reply(() => {});
  const slow = await h.api('POST', '/playback/start', { token: u.token, body: { songId: song.song_id } });
  assert.equal(slow.body.media.type, 'GENERATED_SKETCH');
  assert.equal((await h.one('SELECT availability FROM song_media WHERE media_id = ?', [ins.insertId])).availability, 'AVAILABLE');
  await h.api('POST', `/playback/${slow.body.playId}/finish`, { token: u.token, body: { listenedSec: 5 } });

  // invalid reply (http, not https): never played
  reply((req, res) => json(res, 200, { previewUrl: 'http://insecure.example/p.mp3' }));
  const bad = await h.api('POST', '/playback/start', { token: u.token, body: { songId: song.song_id } });
  assert.equal(bad.body.media.type, 'GENERATED_SKETCH');
  await h.api('POST', `/playback/${bad.body.playId}/finish`, { token: u.token, body: { listenedSec: 5 } });

  // 404 = no preview for this ISRC -> marked UNAVAILABLE
  reply((req, res) => json(res, 404, {}));
  const none = await h.api('POST', '/playback/start', { token: u.token, body: { songId: song.song_id } });
  assert.equal(none.body.media.type, 'GENERATED_SKETCH');
  assert.equal(none.body.media.demo, true);
  assert.equal((await h.one('SELECT availability FROM song_media WHERE media_id = ?', [ins.insertId])).availability, 'UNAVAILABLE');
  await h.api('POST', `/playback/${none.body.playId}/finish`, { token: u.token, body: { listenedSec: 5 } });
});

test('AI mood fallback: used only when the local parser understands nothing, restricted to known moods, skipped in private sessions', async () => {
  Object.assign(cfg.ai, { provider: 'anthropic', apiKey: 'ai-key', model: 'test-model', baseUrl: mock.url, timeoutMs: 500 });
  const u = await h.newUser();
  reply((req, res) => json(res, 200, { content: [{ type: 'text', text: '{"moods":[{"name":"Calm","weight":0.9},{"name":"Invented","weight":1}],"context":"STUDY"}' }] }));

  // the local parser understands this: AI is not called
  const local = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'I feel calm and happy' } });
  assert.equal(local.status, 200);
  assert.equal(hits().length, 0);
  assert.equal(local.body.interpretation.parse.source, 'LOCAL');

  const r = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'zxqv blorf wibble' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.interpretation.parse.source, 'AI');
  assert.deepEqual(r.body.interpretation.parse.moods.map((m) => m.name), ['Calm'], 'unknown moods from the model are discarded');
  const sent = JSON.parse(hits()[0].body);
  assert.equal(hits()[0].headers['x-api-key'], 'ai-key');
  assert.equal(sent.model, 'test-model');
  assert.equal(sent.messages[0].content, 'zxqv blorf wibble', 'only the typed sentence is sent');

  // AI failure: same result as without AI (422), not a 500
  reply((req, res) => json(res, 500, {}));
  const fail = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'zxqv blorf wibble' } });
  assert.equal(fail.status, 422);
  assert.equal(fail.body.error.code, 'MOOD_NOT_UNDERSTOOD');

  // private session: the text never leaves MUSE
  assert.equal((await h.api('POST', '/incognito', { token: u.token, body: {} })).status, 201);
  reply((req, res) => json(res, 200, { content: [{ type: 'text', text: '{"moods":["Calm"]}' }] }));
  const priv = await h.api('POST', '/recommendations/mood', { token: u.token, body: { text: 'zxqv blorf wibble' } });
  assert.equal(priv.status, 422);
  assert.equal(hits().length, 0);
  await h.api('DELETE', '/incognito', { token: u.token });
});

test('AI reply parsing ignores non-JSON and out-of-vocabulary output', () => {
  const { parseReply } = providers.ai;
  assert.deepEqual(parseReply('sure!', ['Calm'], ['STUDY']), { moods: [], context: null });
  assert.deepEqual(parseReply('{bad json}', ['Calm'], ['STUDY']), { moods: [], context: null });
  assert.deepEqual(parseReply('{"moods":["calm"],"context":"study"}', ['Calm'], ['STUDY']), { moods: [{ name: 'Calm', weight: 1 }], context: 'STUDY' });
  assert.equal(parseReply('{"moods":["A","B","C","D"]}', ['A', 'B', 'C', 'D'], []).moods.length, 3);
});

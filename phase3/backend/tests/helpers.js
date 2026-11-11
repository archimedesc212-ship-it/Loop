// Test harness: boots the real Express app on a random port against the real
// MySQL database (run `npm run db:setup` first). Every test creates its own
// users, so tests do not depend on each other's side effects.
process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';

const crypto = require('crypto');
const app = require('../src/app');
const { pool, query, one } = require('../src/config/db');

let server;
let base;

async function start() {
  if (server) return base;
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  return base;
}

async function stop() {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  await pool.end();
}

/**
 * api(method, path, { body, token, headers }) -> { status, body, headers }
 * Tests authenticate with bearer tokens (X-Auth-Mode: bearer on sign-in); the
 * browser cookie + CSRF flow has its own tests in 08-sessions.test.js.
 */
async function api(method, path, { body, token, headers = {} } = {}) {
  const bearerSignIn = /^\/auth\/(login|register)$/.test(path) ? { 'X-Auth-Mode': 'bearer' } : {};
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...bearerSignIn, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

const uid = () => crypto.randomBytes(4).toString('hex');

/** Register a fresh listener; optionally complete onboarding. */
async function newUser({ onboard = true, languages = ['te', 'hi'] } = {}) {
  const u = `t_${uid()}`;
  const r = await api('POST', '/auth/register', { body: { username: u, email: `${u}@test.dev`, password: 'Testpass1', displayName: 'Test User' } });
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  const token = r.body.token;
  if (onboard) {
    const langIds = (await query('SELECT language_id FROM languages WHERE iso_code IN (?)', [languages])).map((x) => x.language_id);
    const g = await query("SELECT genre_id FROM genres WHERE name IN ('EDM', 'Film Dance')");
    const m = await query("SELECT mood_id FROM moods WHERE name IN ('Energetic', 'Happy')");
    const o = await api('POST', '/me/onboarding', { token, body: { languageIds: langIds, genreIds: g.map((x) => x.genre_id), moodIds: m.map((x) => x.mood_id), regionCode: 'IN-TG' } });
    if (o.status !== 200) throw new Error(`onboarding failed: ${JSON.stringify(o.body)}`);
  }
  return { token, id: r.body.user.id, username: u };
}

async function login(loginName, password) {
  const r = await api('POST', '/auth/login', { body: { login: loginName, password } });
  if (r.status !== 200) throw new Error(`login ${loginName} failed: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

/** Play a song start → finish. */
async function play(token, songId, listenedSec, extra = {}) {
  const s = await api('POST', '/playback/start', { token, body: { songId, ...extra } });
  if (s.status !== 201) return s;
  if (s.body.private) return api('POST', '/playback/private', { token, body: { songId, listenedSec } });
  return api('POST', `/playback/${s.body.playId}/finish`, { token, body: { listenedSec } });
}

/** First ACTIVE song with a playable source that matches `where`. */
const activeSong = async (where = '1 = 1') => one(`SELECT s.* FROM songs s WHERE s.status = 'ACTIVE' AND ${where}
  AND EXISTS (SELECT 1 FROM v_song_playback p WHERE p.song_id = s.song_id) ORDER BY s.song_id LIMIT 1`);
/** First ACTIVE song with metadata only (no playable source). */
const metadataOnlySong = async () => one(`SELECT s.* FROM songs s WHERE s.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM v_song_playback p WHERE p.song_id = s.song_id) ORDER BY s.song_id LIMIT 1`);

module.exports = { start, stop, api, newUser, login, play, query, one, uid, activeSong, metadataOnlySong };

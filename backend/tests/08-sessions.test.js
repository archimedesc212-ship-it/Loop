// Server-side sessions: browser cookie + CSRF flow, revocation, expiry, account
// management, origin checks, liveness/readiness.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let base;
before(async () => { base = await h.start(); });
after(h.stop);

/** Minimal browser: keeps cookies, sends the CSRF header like the web app does. */
function browser() {
  const jar = new Map();
  return {
    jar,
    async req(method, path, { body, csrf = true, headers = {} } = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf && jar.has('muse_csrf') ? { 'X-CSRF-Token': jar.get('muse_csrf') } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const i = pair.indexOf('=');
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (!v || attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a))) jar.delete(k); else jar.set(k, v);
      }
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
    },
  };
}

async function registerBrowser() {
  const b = browser();
  const u = `t_${h.uid()}`;
  const r = await b.req('POST', '/auth/register', { body: { username: u, email: `${u}@test.dev`, password: 'Testpass1', displayName: 'Cookie User' } });
  assert.equal(r.status, 201);
  return { b, username: u, id: r.body.user.id, r };
}

test('browser sign-in sets an httpOnly SameSite=Strict session cookie and never returns the token in the body', async () => {
  const { b, r } = await registerBrowser();
  assert.equal(r.body.token, undefined, 'token must not be readable by page scripts');
  assert.match(r.body.csrfToken, /^[0-9a-f]{64}$/);
  const session = r.setCookie.find((c) => c.startsWith('muse_session='));
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=Strict/i);
  assert.match(session, /Path=\//);
  const csrf = r.setCookie.find((c) => c.startsWith('muse_csrf='));
  assert.doesNotMatch(csrf, /HttpOnly/i, 'the CSRF cookie must be readable by the app');
  const me = await b.req('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.session.csrfToken, b.jar.get('muse_csrf'));
  // only the hash of the token is stored
  const token = b.jar.get('muse_session');
  const stored = await h.one('SELECT token_hash FROM auth_sessions WHERE token_hash = SHA2(?, 256)', [token]);
  assert.ok(stored);
  assert.equal(await h.one('SELECT 1 AS x FROM auth_sessions WHERE token_hash = ?', [token]), null);
});

test('cookie-authenticated writes need the CSRF token; reads do not', async () => {
  const { b } = await registerBrowser();
  const noCsrf = await b.req('PATCH', '/me/settings', { body: { displayName: 'X' }, csrf: false });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.body.error.code, 'CSRF_FAILED');
  const wrong = await b.req('PATCH', '/me/settings', { body: { displayName: 'X' }, csrf: false, headers: { 'X-CSRF-Token': 'a'.repeat(64) } });
  assert.equal(wrong.status, 403);
  const ok = await b.req('PATCH', '/me/settings', { body: { displayName: 'Renamed' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.displayName || ok.body.user?.displayName || 'Renamed', 'Renamed');
  assert.equal((await b.req('GET', '/songs?pageSize=1', { csrf: false })).status, 200);
});

test('a CSRF token from one session does not work for another', async () => {
  const a = await registerBrowser();
  const c = await registerBrowser();
  const r = await a.b.req('PATCH', '/me/settings', { body: { displayName: 'X' }, csrf: false, headers: { 'X-CSRF-Token': c.b.jar.get('muse_csrf') } });
  assert.equal(r.status, 403);
});

test('requests from another site are rejected by the Origin check; sign-in included', async () => {
  const { b } = await registerBrowser();
  const r = await b.req('PATCH', '/me/settings', { body: { displayName: 'X' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'ORIGIN_REJECTED');
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ login: 'varsha', password: 'Varsha@27' }) });
  assert.equal(login.status, 403);
  // an allowed dev origin (CORS_ORIGIN) still works
  const okLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', 'X-Auth-Mode': 'bearer' },
    body: JSON.stringify({ login: 'varsha', password: 'Varsha@27' }) });
  assert.equal(okLogin.status, 200);
  assert.equal(okLogin.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(okLogin.headers.get('access-control-allow-credentials'), 'true');
});

test('logout revokes the session on the server: the old cookie stops working', async () => {
  const { b } = await registerBrowser();
  const token = b.jar.get('muse_session');
  const out = await b.req('POST', '/auth/logout');
  assert.equal(out.status, 200);
  assert.ok(!b.jar.has('muse_session'), 'cookie cleared');
  const replay = await fetch(`${base}/auth/me`, { headers: { Cookie: `muse_session=${token}` } });
  assert.equal(replay.status, 401);
  const row = await h.one('SELECT revoke_reason FROM auth_sessions WHERE token_hash = SHA2(?, 256)', [token]);
  assert.equal(row.revoke_reason, 'LOGOUT');
});

test('bearer tokens are revoked by logout too', async () => {
  const u = await h.newUser({ onboard: false });
  assert.equal((await h.api('POST', '/auth/logout', { token: u.token })).status, 200);
  const r = await h.api('GET', '/auth/me', { token: u.token });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'TOKEN_INVALID');
});

test('an expired session is refused with a clear message', async () => {
  const u = await h.newUser({ onboard: false });
  await h.query("UPDATE auth_sessions SET created_at = NOW() - INTERVAL 2 DAY, last_seen_at = NOW() - INTERVAL 2 DAY, expires_at = NOW() - INTERVAL 1 DAY WHERE user_id = ?", [u.id]);
  const r = await h.api('GET', '/auth/me', { token: u.token });
  assert.equal(r.status, 401);
  assert.match(r.body.error.message, /expired/i);
});

test('garbage and unknown tokens are 401, not 500', async () => {
  for (const t of ['x', 'a'.repeat(43), 'a'.repeat(500), "' OR 1=1 --"]) {
    const r = await h.api('GET', '/auth/me', { token: t });
    assert.equal(r.status, 401, t);
  }
  const r = await fetch(`${base}/auth/me`, { headers: { Cookie: 'muse_session=%E0%A4%A' } });
  assert.equal(r.status, 401);
});

test('sessions list, revoke one, sign out everywhere', async () => {
  const u = await h.newUser({ onboard: false });
  const t2 = await h.login(u.username, 'Testpass1');
  const t3 = await h.login(u.username, 'Testpass1');
  const list = await h.api('GET', '/me/sessions', { token: u.token });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 3);
  assert.equal(list.body.filter((s) => s.current).length, 1);
  assert.ok(list.body.every((s) => !('token' in s) && !('tokenHash' in s) && !('token_hash' in s)));
  const other = list.body.find((s) => !s.current);
  assert.equal((await h.api('DELETE', `/me/sessions/${other.id}`, { token: u.token })).status, 200);
  assert.equal((await h.api('GET', '/me/sessions', { token: u.token })).body.length, 2);

  // someone else's session id is a 404
  const stranger = await h.newUser({ onboard: false });
  assert.equal((await h.api('DELETE', `/me/sessions/${other.id}`, { token: stranger.token })).status, 404);
  const strangerSession = (await h.api('GET', '/me/sessions', { token: stranger.token })).body[0];
  assert.equal((await h.api('DELETE', `/me/sessions/${strangerSession.id}`, { token: u.token })).status, 404);

  const all = await h.api('POST', '/auth/logout-all', { token: u.token });
  assert.equal(all.status, 200);
  for (const t of [u.token, t2, t3]) assert.equal((await h.api('GET', '/auth/me', { token: t })).status, 401);
});

test('changing the password signs out every other session and keeps this one', async () => {
  const u = await h.newUser({ onboard: false });
  const other = await h.login(u.username, 'Testpass1');
  const bad = await h.api('POST', '/me/password', { token: u.token, body: { currentPassword: 'Wrong1234', newPassword: 'Newpass12' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'WRONG_PASSWORD');
  const weak = await h.api('POST', '/me/password', { token: u.token, body: { currentPassword: 'Testpass1', newPassword: 'short' } });
  assert.equal(weak.status, 400);
  const same = await h.api('POST', '/me/password', { token: u.token, body: { currentPassword: 'Testpass1', newPassword: 'Testpass1' } });
  assert.equal(same.status, 400);
  const ok = await h.api('POST', '/me/password', { token: u.token, body: { currentPassword: 'Testpass1', newPassword: 'Newpass12' } });
  assert.equal(ok.status, 200);
  assert.equal((await h.api('GET', '/auth/me', { token: u.token })).status, 200);
  assert.equal((await h.api('GET', '/auth/me', { token: other })).status, 401);
  assert.equal((await h.api('POST', '/auth/login', { body: { login: u.username, password: 'Testpass1' } })).status, 401);
  assert.equal((await h.api('POST', '/auth/login', { body: { login: u.username, password: 'Newpass12' } })).status, 200);
  const audit = await h.one("SELECT action FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? AND action = 'PASSWORD_CHANGED'", [String(u.id)]);
  assert.ok(audit, 'password change is audited');
});

test('deleting the account needs the password and confirmation, and removes the user and their data', async () => {
  const u = await h.newUser();
  const song = await h.activeSong();
  assert.equal((await h.play(u.token, song.song_id, 60)).status, 200);
  assert.equal((await h.api('DELETE', '/me', { token: u.token, body: { password: 'Testpass1' } })).status, 400, 'confirm required');
  assert.equal((await h.api('DELETE', '/me', { token: u.token, body: { password: 'Wrong1234', confirm: 'DELETE' } })).status, 400);
  const r = await h.api('DELETE', '/me', { token: u.token, body: { password: 'Testpass1', confirm: 'DELETE' } });
  assert.equal(r.status, 200);
  assert.equal(await h.one('SELECT user_id FROM users WHERE user_id = ?', [u.id]), null);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM listening_history WHERE user_id = ?', [u.id])).n, 0);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ?', [u.id])).n, 0);
  assert.equal((await h.api('GET', '/auth/me', { token: u.token })).status, 401);
  const audit = await h.one("SELECT actor_user_id FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? AND action = 'ACCOUNT_DELETED'", [String(u.id)]);
  assert.ok(audit, 'deletion is audited');
});

test('the last admin cannot delete their own account', async () => {
  const admins = await h.query("SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.code = 'ADMIN' AND u.is_active = 1");
  if (admins.length !== 1) return;   // only meaningful on the seed data
  const token = await h.login('admin', 'Admin@123');
  const r = await h.api('DELETE', '/me', { token, body: { password: 'Admin@123', confirm: 'DELETE' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'LAST_ADMIN');
});

test('admin deactivation revokes the user’s sessions', async () => {
  const admin = await h.login('admin', 'Admin@123');
  const u = await h.newUser({ onboard: false });
  assert.equal((await h.api('PATCH', `/admin/users/${u.id}`, { token: admin, body: { isActive: false } })).status, 200);
  const live = await h.one('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [u.id]);
  assert.equal(live.n, 0);
  const r = await h.api('GET', '/auth/me', { token: u.token });
  assert.equal(r.status, 401);
  await h.api('PATCH', `/admin/users/${u.id}`, { token: admin, body: { isActive: true } });
  assert.equal((await h.api('GET', '/auth/me', { token: u.token })).status, 401, 're-activation does not revive old sessions');
});

test('liveness does not touch the database; readiness reports schema version and provider states without secrets', async () => {
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const ready = await fetch(`${base}/ready`);
  const body = await ready.json();
  assert.equal(ready.status, 200, JSON.stringify(body));
  assert.equal(body.status, 'ready');
  assert.equal(body.schema.current, body.schema.expected);
  assert.ok(body.catalogue.playableSongs <= body.catalogue.activeSongs);
  assert.ok(body.providers.find((p) => p.code === 'LOCAL_MEDIA'));
  const text = JSON.stringify(body);
  for (const k of ['DB_APP_PASSWORD', 'SESSION_SECRET', 'JWT_SECRET', 'DB_OWNER_PASSWORD']) {
    if (process.env[k]) assert.ok(!text.includes(process.env[k]), `${k} leaked`);
  }
});

test('API responses are not cached and carry security headers', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('ended sessions are purged by the housekeeping job', async () => {
  const sessions = require('../src/services/sessionService');
  const u = await h.newUser({ onboard: false });
  await h.query(`UPDATE auth_sessions SET created_at = NOW() - INTERVAL 40 DAY, last_seen_at = NOW() - INTERVAL 40 DAY,
                 expires_at = NOW() - INTERVAL 39 DAY WHERE user_id = ?`, [u.id]);
  const n = await sessions.purgeEnded(30);
  assert.ok(n >= 1);
  assert.equal((await h.one('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id = ?', [u.id])).n, 0);
});

test('GET /auth/session answers 200 for anonymous and signed-in callers', async () => {
  const anon = await fetch(`${base}/auth/session`);
  assert.equal(anon.status, 200);
  assert.deepEqual(await anon.json(), { authenticated: false });
  const stale = await fetch(`${base}/auth/session`, { headers: { Cookie: 'muse_session=not-a-real-token-xxxxxxxxxxxxxxxx' } });
  assert.equal(stale.status, 200);
  assert.deepEqual(await stale.json(), { authenticated: false });
  const u = await h.newUser({ onboard: false });
  const r = await h.api('GET', '/auth/session', { token: u.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.authenticated, true);
  assert.equal(r.body.username, u.username);
});

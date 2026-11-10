const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);

test('registration creates a hashed-password account and returns a token', async () => {
  const u = `t_${h.uid()}`;
  const r = await h.api('POST', '/auth/register', { body: { username: u, email: `${u}@test.dev`, password: 'Secret123', displayName: 'Reg Test' } });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.role, 'LISTENER');
  assert.equal(r.body.user.onboarded, false);
  const row = await h.one('SELECT password_hash FROM users WHERE username = ?', [u]);
  assert.match(row.password_hash, /^\$2[aby]\$10\$/, 'stored as bcrypt');
  assert.notEqual(row.password_hash, 'Secret123');
});

test('registration rejects duplicates and invalid input with field details', async () => {
  const { username } = await h.newUser({ onboard: false });
  const dup = await h.api('POST', '/auth/register', { body: { username, email: `${h.uid()}@x.dev`, password: 'Secret123', displayName: 'X' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'USERNAME_TAKEN');
  const bad = await h.api('POST', '/auth/register', { body: { username: 'Bad Name', email: 'nope', password: 'short', displayName: '' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  for (const f of ['username', 'email', 'password', 'displayName']) assert.ok(bad.body.error.details[f], `${f} reported`);
});

test('login works with username or email; wrong password is a generic 401', async () => {
  const ok = await h.api('POST', '/auth/login', { body: { login: 'varsha', password: 'Varsha@27' } });
  assert.equal(ok.status, 200);
  const byEmail = await h.api('POST', '/auth/login', { body: { login: 'varsha@muse.dev', password: 'Varsha@27' } });
  assert.equal(byEmail.status, 200);
  const wrong = await h.api('POST', '/auth/login', { body: { login: 'varsha', password: 'nope-nope1' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'INVALID_LOGIN');
  const unknown = await h.api('POST', '/auth/login', { body: { login: 'nobody_here', password: 'nope-nope1' } });
  assert.equal(unknown.body.error.message, wrong.body.error.message, 'same message: no account enumeration');
});

test('five wrong passwords lock the account', async () => {
  const u = await h.newUser({ onboard: false });
  let last;
  for (let i = 0; i < 5; i++) last = await h.api('POST', '/auth/login', { body: { login: u.username, password: 'Wrong1234' } });
  assert.equal(last.status, 429);
  assert.equal(last.body.error.code, 'ACCOUNT_LOCKED');
  const right = await h.api('POST', '/auth/login', { body: { login: u.username, password: 'Testpass1' } });
  assert.equal(right.status, 429, 'even the right password is refused while locked');
});

test('protected routes need a valid token', async () => {
  assert.equal((await h.api('GET', '/songs')).status, 401);
  const forged = await h.api('GET', '/songs', { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.invalid' });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, 'TOKEN_INVALID');
});

test('a deactivated account loses access immediately', async () => {
  const u = await h.newUser({ onboard: false });
  await h.query('UPDATE users SET is_active = 0 WHERE user_id = ?', [u.id]);
  const r = await h.api('GET', '/auth/me', { token: u.token });
  assert.equal(r.status, 401);
});

test('SQL injection in login and search is treated as plain text', async () => {
  const r = await h.api('POST', '/auth/login', { body: { login: "' OR 1=1 -- ", password: 'x' } });
  assert.equal(r.status, 401);
  const token = await h.login('varsha', 'Varsha@27');
  const s = await h.api('GET', `/search?q=${encodeURIComponent("'; DROP TABLE songs; --")}`, { token });
  assert.equal(s.status, 200);
  const songs = await h.one('SELECT COUNT(*) AS n FROM songs');
  assert.ok(songs.n > 0, 'songs table still there');
});

test('onboarding stores weights that drive the first recommendations', async () => {
  const u = await h.newUser();
  const me = await h.api('GET', '/auth/me', { token: u.token });
  assert.equal(me.body.onboarded, true);
  assert.equal(me.body.languages.length, 2);
  const prefs = await h.api('GET', `/users/${u.id}/preferences`, { token: u.token });
  assert.equal(prefs.status, 200);
  assert.equal(prefs.body.evidence.onboardingShare, 100, 'no plays yet: preferences are 100% onboarding');
  assert.ok(prefs.body.genres.some((g) => g.name === 'EDM' && g.score > 0.9));
});

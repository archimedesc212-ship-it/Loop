// Registration, login (with brute-force lockout) and the signed-in profile.
// Passwords are hashed with bcrypt (cost 10); the plaintext never reaches SQL.
const bcrypt = require('bcryptjs');
const { query, one, withTransaction } = require('../config/db');
const sessions = require('./sessionService');
const ApiError = require('../utils/ApiError');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

async function register({ username, email, password, displayName }, client = {}) {
  const hash = await bcrypt.hash(password, 10);
  const { userId, s } = await withTransaction(async (tx) => {
    const role = await tx.one("SELECT role_id FROM roles WHERE code = 'LISTENER'");
    const r = await tx.query('INSERT INTO users (username, email, password_hash, password_changed_at, role_id) VALUES (?, ?, ?, NOW(), ?)',
      [username, email, hash, role.role_id]);
    await tx.query('INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)', [r.insertId, displayName]);
    return { userId: r.insertId, s: await sessions.create(r.insertId, client, tx) };   // account + session, all or nothing
  });
  return { session: s, user: await profile(userId) };
}


/**
 * Promote the currently authenticated anonymous guest in place. Keeping the
 * same user_id preserves all foreign-key-owned preferences, likes, playlists,
 * ratings and listening history. This is intentionally available only to a
 * guest identity created by LOOP, never to an existing registered account.
 */
async function upgradeGuestAccount(userId, { username, email, password, displayName }) {
  const hash = await bcrypt.hash(password, 10);
  await withTransaction(async (tx) => {
    const current = await tx.one(
      `SELECT u.user_id, u.email, r.code AS role_code
         FROM users u JOIN roles r USING (role_id)
        WHERE u.user_id = ? FOR UPDATE`, [userId]);
    if (!current) throw ApiError.notFound('Guest session');
    if (current.role_code !== 'LISTENER' || !String(current.email || '').toLowerCase().endsWith('@guest.loop.invalid')) {
      throw new ApiError(409, 'NOT_GUEST_SESSION', 'This session is already linked to an account. Sign out before creating a different account.');
    }
    await tx.query(
      `UPDATE users SET username = ?, email = ?, password_hash = ?, password_changed_at = NOW(),
                        failed_login_count = 0, locked_until = NULL
        WHERE user_id = ?`, [username, email, hash, userId]);
    await tx.query('UPDATE user_profiles SET display_name = ? WHERE user_id = ?', [displayName, userId]);
  });
  return profile(userId);
}

/** Login by username or email. Five wrong passwords lock the account for 15 minutes. */
async function login({ login: id, password }, client = {}) {
  const u = await one(
    `SELECT user_id, password_hash, is_active, failed_login_count, locked_until,
            locked_until IS NOT NULL AND locked_until > NOW() AS is_locked,
            CEIL(TIMESTAMPDIFF(SECOND, NOW(), locked_until) / 60) AS minutes_left
       FROM users WHERE username = ? OR email = ?`, [id.toLowerCase(), id.toLowerCase()]);
  // same message whether the account exists or not, so accounts cannot be enumerated
  const invalid = new ApiError(401, 'INVALID_LOGIN', 'That username or password is not right.');
  if (!u) { await bcrypt.compare(password, DUMMY_HASH); throw invalid; }   // equal timing for unknown accounts
  if (!u.is_active) throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated. Contact an administrator.');
  if (u.is_locked) {
    throw new ApiError(429, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${u.minutes_left} minute${u.minutes_left === 1 ? '' : 's'}.`);
  }
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) {
    const failed = u.failed_login_count + 1;
    await query(
      `UPDATE users SET failed_login_count = ?, locked_until = IF(? >= ?, NOW() + INTERVAL ? MINUTE, NULL) WHERE user_id = ?`,
      [failed >= MAX_FAILED ? 0 : failed, failed, MAX_FAILED, LOCK_MINUTES, u.user_id]);
    if (failed >= MAX_FAILED) throw new ApiError(429, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
    throw invalid;
  }
  await query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE user_id = ?', [u.user_id]);
  const s = await sessions.create(u.user_id, client);
  return { session: s, user: await profile(u.user_id) };
}

/** Verify the current password of a signed-in user (for sensitive account actions). */
async function checkPassword(userId, password) {
  const u = await one('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is not right.');
  }
}

/** Change password; every other session of the user is revoked in the same transaction. */
async function changePassword(userId, currentSessionId, { currentPassword, newPassword }) {
  await checkPassword(userId, currentPassword);
  if (currentPassword === newPassword) throw ApiError.badRequest('The new password must be different from the current one.');
  const hash = await bcrypt.hash(newPassword, 10);
  return withTransaction(async (tx) => {
    await tx.query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE user_id = ?', [hash, userId]);
    const revoked = await sessions.revokeAll(userId, 'PASSWORD_CHANGED', { except: currentSessionId, tx });
    await tx.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values) VALUES (?, 'PASSWORD_CHANGED', 'user', ?, ?)",
      [userId, String(userId), JSON.stringify({ other_sessions_revoked: revoked })]);
    return { changed: true, otherSessionsRevoked: revoked };
  });
}

/**
 * Delete ordinary listener data. Verified artist uploads and rights reports are
 * retained as legal/moderation records, so an artist account with those records
 * must be deactivated/anonymised through a reviewed support workflow instead.
 */
async function deleteAccount(userId, { password }) {
  await checkPassword(userId, password);
  return withTransaction(async (tx) => {
    const me = await tx.one('SELECT u.user_id, r.code FROM users u JOIN roles r USING (role_id) WHERE u.user_id = ? FOR UPDATE OF u', [userId]);
    if (!me) throw ApiError.notFound('User');
    const artistRecords = await tx.one(`SELECT (SELECT COUNT(*) FROM artist_uploads WHERE user_id = ?) +
                                           (SELECT COUNT(*) FROM artist_rights_reports WHERE reporter_user_id = ?) AS total`, [userId, userId]);
    if (Number(artistRecords?.total || 0) > 0) {
      throw new ApiError(409, 'ARTIST_RECORDS_REQUIRE_REVIEW', 'This account has artist upload or rights-report records that must be retained for legal and moderation history. Contact LOOP support for a reviewed deactivation or anonymisation request.');
    }
    if (me.code === 'ADMIN') {
      const admins = await tx.query(`SELECT u.user_id FROM users u JOIN roles r USING (role_id)
                                      WHERE r.code = 'ADMIN' AND u.is_active = 1 FOR UPDATE OF u`);
      if (admins.length <= 1) throw new ApiError(409, 'LAST_ADMIN', 'You are the last active admin; promote someone else first.');
    }
    await tx.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (NULL, 'ACCOUNT_DELETED', 'user', ?)", [String(userId)]);
    // worlds reference their recommendation lists with ON DELETE RESTRICT, so remove worlds first
    await tx.query('DELETE FROM weekly_worlds WHERE user_id = ?', [userId]);
    await tx.query('DELETE FROM users WHERE user_id = ?', [userId]);
    return { deleted: true };
  });
}

async function profile(userId) {
  const u = await one(
    `SELECT u.user_id, u.username, u.email, u.created_at, r.code AS role_code, r.name AS role_name,
            up.display_name, up.region_code, rg.name AS region_name, up.content_filter, up.listening_habit,
            up.onboarding_completed_at,
            (SELECT JSON_ARRAYAGG(permission_code) FROM role_permissions rp WHERE rp.role_id = u.role_id) AS permissions,
            (SELECT i.incognito_id FROM incognito_sessions i WHERE i.user_id = u.user_id AND i.status = 'ACTIVE' AND i.expires_at > NOW()) AS incognito_id
       FROM users u JOIN roles r ON r.role_id = u.role_id JOIN user_profiles up ON up.user_id = u.user_id
       LEFT JOIN regions rg ON rg.region_code = up.region_code
      WHERE u.user_id = ?`, [userId]);
  if (!u) throw ApiError.notFound('User');
  const languages = await query(
    `SELECT l.language_id AS id, l.name, l.native_name AS nativeName, ul.priority
       FROM user_languages ul JOIN languages l ON l.language_id = ul.language_id WHERE ul.user_id = ? ORDER BY ul.priority`, [userId]);
  const perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions || [];
  return {
    id: u.user_id, username: u.username, email: u.email, displayName: u.display_name, role: u.role_code, roleName: u.role_name,
    permissions: perms, region: u.region_code ? { code: u.region_code, name: u.region_name } : null, languages,
    contentFilter: u.content_filter, listeningHabit: u.listening_habit, onboarded: !!u.onboarding_completed_at,
    incognito: !!u.incognito_id, memberSince: u.created_at,
  };
}

module.exports = { register, upgradeGuestAccount, login, profile, checkPassword, changePassword, deleteAccount, MAX_FAILED, LOCK_MINUTES };

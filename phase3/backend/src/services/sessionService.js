// Server-side sessions (auth_sessions).
//
//  * The secret token is 32 random bytes, sent once to the client (httpOnly
//    cookie for the browser, or the response body for API clients that ask for
//    bearer mode). Only its SHA-256 hash is stored.
//  * A request is authenticated only while its session row is not revoked and
//    not expired, so logout / password change / deactivation take effect at once.
//  * The CSRF token is an HMAC of the session id: nothing extra to store, and it
//    cannot be forged without SESSION_SECRET.
const crypto = require('crypto');
const { query, one } = require('../config/db');
const { session: cfg } = require('../config/env');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', cfg.secret).update(s).digest('hex');

function csrfFor(sessionId) {
  return hmac(`csrf:${sessionId}`);
}

function csrfMatches(sessionId, given) {
  if (typeof given !== 'string' || given.length !== 64) return false;
  return crypto.timingSafeEqual(Buffer.from(csrfFor(sessionId)), Buffer.from(given));
}

/** Create a session; `tx` lets callers include it in their transaction. */
async function create(userId, { userAgent = null, ip = null } = {}, tx = null) {
  const run = tx ? tx.query : query;
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionId = crypto.randomBytes(8).toString('hex');
  await run(
    `INSERT INTO auth_sessions (session_id, token_hash, user_id, expires_at, user_agent, ip_hash)
     VALUES (?, ?, ?, NOW() + INTERVAL ? HOUR, ?, ?)`,
    [sessionId, sha256(token), userId, cfg.ttlHours, userAgent ? String(userAgent).slice(0, 160) : null, ip ? hmac(`ip:${ip}`) : null]);
  const row = await (tx ? tx.one : one)('SELECT expires_at FROM auth_sessions WHERE session_id = ?', [sessionId]);
  return { token, sessionId, expiresAt: row.expires_at, csrfToken: csrfFor(sessionId) };
}

/**
 * Resolve a token to its session + user (one query). Returns null when the token
 * is unknown, revoked or expired, or the account is inactive.
 */
async function resolve(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const row = await one(
    `SELECT s.session_id, s.user_id, s.expires_at, s.revoked_at, s.expires_at <= NOW() AS expired,
            TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) AS idle_sec,
            u.username, u.is_active, r.code AS role_code, up.display_name, up.region_code, up.content_filter,
            up.onboarding_completed_at,
            (SELECT JSON_ARRAYAGG(permission_code) FROM role_permissions rp WHERE rp.role_id = u.role_id) AS permissions,
            (SELECT i.incognito_id FROM incognito_sessions i
              WHERE i.user_id = u.user_id AND i.status = 'ACTIVE' AND i.expires_at > NOW()) AS incognito_id
       FROM auth_sessions s
       JOIN users u ON u.user_id = s.user_id
       JOIN roles r ON r.role_id = u.role_id
       JOIN user_profiles up ON up.user_id = u.user_id
      WHERE s.token_hash = ?`, [sha256(token)]);
  if (!row) return null;
  if (row.revoked_at) return { invalid: 'revoked' };
  if (row.expired) return { invalid: 'expired' };
  if (!row.is_active) return { invalid: 'inactive' };
  // record activity at most once every 5 minutes (keeps writes off the hot path)
  if (row.idle_sec >= 300) query('UPDATE auth_sessions SET last_seen_at = NOW() WHERE session_id = ?', [row.session_id]).catch(() => {});
  return row;
}

async function revoke(sessionId, reason) {
  const r = await query(
    'UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = ? WHERE session_id = ? AND revoked_at IS NULL', [reason, sessionId]);
  return r.affectedRows;
}

/** Revoke all of a user's live sessions, optionally keeping one (the current). */
async function revokeAll(userId, reason, { except = null, tx = null } = {}) {
  const run = tx ? tx.query : query;
  const r = await run(
    `UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = ?
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() AND (? IS NULL OR session_id <> ?)`,
    [reason, userId, except, except]);
  return r.affectedRows;
}

async function list(userId, currentId) {
  const rows = await query(
    `SELECT session_id AS id, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt, user_agent AS userAgent
       FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`, [userId]);
  return rows.map((r) => ({ ...r, current: r.id === currentId }));
}

/** Housekeeping: drop sessions that ended more than `days` ago. */
async function purgeEnded(days = 30) {
  const r = await query(
    `DELETE FROM auth_sessions
      WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL ? DAY)
         OR expires_at < NOW() - INTERVAL ? DAY`, [days, days]);
  return r.affectedRows;
}

module.exports = { create, resolve, revoke, revokeAll, list, purgeEnded, csrfFor, csrfMatches, sha256 };

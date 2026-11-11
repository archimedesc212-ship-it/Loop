// Authentication (server-side sessions) and authorisation (role -> permissions from the DB).
//
// Two ways to present a session token:
//  * Browser: httpOnly, SameSite=Strict cookie `muse_session`. Because the browser
//    sends it automatically, every state-changing request must also carry the
//    CSRF token (header X-CSRF-Token, value from the readable `muse_csrf` cookie).
//  * API clients and tests: `Authorization: Bearer <token>`. Not sent automatically
//    by browsers, so no CSRF token is needed.
// The user, role, permissions and active private session are re-read from the
// database on every request, so revocation and demotion take effect immediately.
const sessions = require('../services/sessionService');
const { session: cfg } = require('../config/env');
const ApiError = require('../utils/ApiError');

const SESSION_COOKIE = 'muse_session';
const CSRF_COOKIE = 'muse_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) {
      try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed cookie: ignore */ }
    }
  }
  return out;
}

function cookieOpts(httpOnly, expires) {
  return { httpOnly, secure: cfg.secureCookies, sameSite: 'strict', path: '/', expires };
}

function setSessionCookies(res, s) {
  const expires = new Date(s.expiresAt);
  res.cookie(SESSION_COOKIE, s.token, cookieOpts(true, expires));
  res.cookie(CSRF_COOKIE, s.csrfToken, cookieOpts(false, expires));
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, cookieOpts(true));
  res.clearCookie(CSRF_COOKIE, cookieOpts(false));
}

/** Where the token came from: { token, via: 'cookie' | 'bearer' } or null. */
function readToken(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) return { token, via: 'bearer' };
  const c = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return c ? { token: c, via: 'cookie' } : null;
}

/**
 * Resolve the presented session onto req.session / req.user.
 * Returns null on success, or the ApiError to send.
 */
async function authenticate(req, res) {
  const t = readToken(req);
  if (!t) return ApiError.unauthorized();
  const s = await sessions.resolve(t.token);
  if (!s || s.invalid) {
    if (t.via === 'cookie') clearSessionCookies(res);
    const msg = s && s.invalid === 'inactive' ? 'This account is no longer active.'
      : s && s.invalid === 'revoked' ? 'You were signed out. Sign in again.'
        : 'Your session has expired. Sign in again.';
    return new ApiError(401, 'TOKEN_INVALID', msg);
  }
  if (t.via === 'cookie' && !SAFE.has(req.method) && !sessions.csrfMatches(s.session_id, req.headers['x-csrf-token'])) {
    return new ApiError(403, 'CSRF_FAILED', 'This request could not be verified. Reload the page and try again.');
  }
  const perms = typeof s.permissions === 'string' ? JSON.parse(s.permissions) : s.permissions || [];
  req.session = { id: s.session_id, via: t.via, expiresAt: s.expires_at };
  req.user = {
    id: s.user_id, username: s.username, displayName: s.display_name, role: s.role_code,
    regionCode: s.region_code, contentFilter: s.content_filter, onboarded: !!s.onboarding_completed_at,
    permissions: new Set(perms), incognitoId: s.incognito_id || null,
  };
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const err = await authenticate(req, res);
    next(err || undefined);
  } catch (err) { next(err); }
}

/** Like requireAuth, but an anonymous request continues without req.user. */
async function optionalAuth(req, res, next) {
  try {
    const err = await authenticate(req, res);
    if (err && err.status !== 401) return next(err);
    next();
  } catch (err) { next(err); }
}

const requirePermission = (...codes) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!codes.every((c) => req.user.permissions.has(c))) return next(ApiError.forbidden('Your role does not allow this action.'));
  next();
};

/** /users/:id/... — the user themself, or someone allowed to manage users. */
const requireSelfOr = (perm, param = 'id') => (req, res, next) => {
  const target = Number(req.params[param]);
  if (!Number.isInteger(target) || target < 1) return next(ApiError.badRequest(`${param} must be a positive whole number`));
  if (req.user.id !== target && !req.user.permissions.has(perm)) return next(ApiError.forbidden());
  next();
};

/**
 * Cross-site request guard for state-changing requests that are not yet
 * authenticated (login CSRF) and a second layer for the rest: if the browser sent
 * an Origin header, it must be this site or an allowed origin.
 */
function sameOriginOnly(allowed) {
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();   // non-browser clients and same-origin navigations in older browsers
    // Compare hosts, not schemes: behind a TLS-terminating proxy the API may see
    // http while the browser reports https.
    let host = null;
    try { host = new URL(origin).host; } catch { /* "null" or malformed origin */ }
    if ((host && host === req.get('host')) || allowed.includes(origin)) return next();
    return next(new ApiError(403, 'ORIGIN_REJECTED', 'Requests from other sites are not accepted.'));
  };
}

module.exports = { requireAuth, optionalAuth, requirePermission, requireSelfOr, sameOriginOnly, setSessionCookies, clearSessionCookies, parseCookies, SESSION_COOKIE, CSRF_COOKIE };

// Loads and validates environment variables once, at startup.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

function required(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[config] Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env.`);
    process.exit(1);
  }
}
// SESSION_SECRET keys the CSRF tokens and the IP hashes. JWT_SECRET is accepted
// as a fallback so .env files from earlier versions keep working.
if (!process.env.SESSION_SECRET && process.env.JWT_SECRET) process.env.SESSION_SECRET = process.env.JWT_SECRET;
required(['DB_HOST', 'DB_NAME', 'DB_APP_USER', 'DB_APP_PASSWORD', 'SESSION_SECRET']);
const isProd = process.env.NODE_ENV === 'production';
if (isProd && process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be at least 32 characters in production.');
  process.exit(1);
}
const num = (v, d, min, max, name) => {
  const n = v === undefined || v === '' ? d : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number between ${min} and ${max}`);
  return n;
};

const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true');
module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    appUser: process.env.DB_APP_USER,
    appPassword: process.env.DB_APP_PASSWORD || '',
    appHost: process.env.DB_APP_HOST || 'localhost',
    ownerUser: process.env.DB_OWNER_USER,
    ownerPassword: process.env.DB_OWNER_PASSWORD || '',
    // Time zone of the API's database sessions: NOW(), CURDATE(), day and week boundaries.
    timezone: (() => {
      const tz = process.env.DB_TIMEZONE || '+00:00';
      if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(tz)) throw new Error('DB_TIMEZONE must look like +00:00 or +05:30');
      return tz;
    })(),
  },
  session: {
    secret: process.env.SESSION_SECRET,
    ttlHours: num(process.env.SESSION_TTL_HOURS, 12, 1, 720, 'SESSION_TTL_HOURS'),
    // Secure cookies need HTTPS; on by default in production, opt-in elsewhere.
    secureCookies: bool(process.env.COOKIE_SECURE, isProd),
  },
  // Number of reverse proxies in front of the API (for client IP in rate limits); 0 = none.
  trustProxy: num(process.env.TRUST_PROXY, 0, 0, 5, 'TRUST_PROXY'),
  rateLimits: {
    authFailuresPer15Min: num(process.env.RATE_LIMIT_AUTH_FAILURES, 20, 1, 10000, 'RATE_LIMIT_AUTH_FAILURES'),
    writesPerMinute: num(process.env.RATE_LIMIT_WRITES_PER_MIN, 240, 1, 100000, 'RATE_LIMIT_WRITES_PER_MIN'),
  },
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  jobs: {
    enabled: bool(process.env.JOBS_ENABLED, true),
    sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES || 30),
    incognitoTtlMinutes: Number(process.env.INCOGNITO_TTL_MINUTES || 120),
  },
};

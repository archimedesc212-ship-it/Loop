// Load configuration without terminating the process at import time.
// Persistent Node entrypoints call validateEnvironment() before listening;
// Vercel Functions validate on each API request and can still serve liveness.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// SESSION_SECRET keys CSRF tokens and IP hashes. Keep compatibility with old .env files.
if (!process.env.SESSION_SECRET && process.env.JWT_SECRET) {
  process.env.SESSION_SECRET = process.env.JWT_SECRET;
}

const num = (v, d, min, max, name) => {
  const n = v === undefined || v === '' ? d : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
};

const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true');
const isProd = process.env.NODE_ENV === 'production';
const isServerless = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function validateEnvironment() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_APP_USER', 'DB_APP_PASSWORD', 'SESSION_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (isProd && process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }
  return true;
}

const timezone = process.env.DB_TIMEZONE || '+00:00';
if (!/^[+-](0[0-9]|1[0-4]):[0-5][0-9]$/.test(timezone)) {
  throw new Error('DB_TIMEZONE must look like +00:00 or +05:30');
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isServerless,
  port: Number(process.env.PORT || 4000),
  validateEnvironment,
  db: {
    host: process.env.DB_HOST,
    port: num(process.env.DB_PORT, 3306, 1, 65535, 'DB_PORT'),
    database: process.env.DB_NAME,
    appUser: process.env.DB_APP_USER,
    appPassword: process.env.DB_APP_PASSWORD || '',
    appHost: process.env.DB_APP_HOST || 'localhost',
    ownerUser: process.env.DB_OWNER_USER,
    ownerPassword: process.env.DB_OWNER_PASSWORD || '',
    timezone,
    // Enable TLS when the selected managed MySQL host requires it. A provider CA
    // can be supplied as DB_SSL_CA; do not disable certificate verification.
    ssl: bool(process.env.DB_SSL, false),
    sslCa: process.env.DB_SSL_CA || null,
    connectTimeoutMs: num(process.env.DB_CONNECT_TIMEOUT_MS, 10000, 1000, 60000, 'DB_CONNECT_TIMEOUT_MS'),
    poolMax: num(process.env.DB_POOL_MAX, isServerless ? 3 : 12, 1, 50, 'DB_POOL_MAX'),
  },
  session: {
    secret: process.env.SESSION_SECRET,
    ttlHours: num(process.env.SESSION_TTL_HOURS, 12, 1, 720, 'SESSION_TTL_HOURS'),
    secureCookies: bool(process.env.COOKIE_SECURE, isProd),
  },
  trustProxy: num(process.env.TRUST_PROXY, 0, 0, 5, 'TRUST_PROXY'),
  rateLimits: {
    authFailuresPer15Min: num(process.env.RATE_LIMIT_AUTH_FAILURES, 20, 1, 10000, 'RATE_LIMIT_AUTH_FAILURES'),
    writesPerMinute: num(process.env.RATE_LIMIT_WRITES_PER_MIN, 240, 1, 100000, 'RATE_LIMIT_WRITES_PER_MIN'),
  },
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  jobs: {
    enabled: bool(process.env.JOBS_ENABLED, true),
    sessionIdleMinutes: num(process.env.SESSION_IDLE_MINUTES, 30, 1, 1440, 'SESSION_IDLE_MINUTES'),
    incognitoTtlMinutes: num(process.env.INCOGNITO_TTL_MINUTES, 120, 1, 10080, 'INCOGNITO_TTL_MINUTES'),
  },
};

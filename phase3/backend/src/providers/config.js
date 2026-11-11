// Provider configuration contract, read from the environment once. Every provider
// is OFF unless its *_ENABLED flag is "true" AND its required settings are present.
// The object is mutable only so tests can point adapters at a local mock server.
const runtime = require('../config/env'); // loads .env and detects Vercel/serverless runtime
const { localMediaEnabled } = require('./runtimeCapabilities');
const e = process.env;
const on = (v) => String(v || '').toLowerCase() === 'true';
const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);

module.exports = {
  timeoutMs: int(e.PROVIDER_TIMEOUT_MS, 8000),
  retries: int(e.PROVIDER_RETRIES, 2),
  musicbrainz: {
    enabled: on(e.MUSICBRAINZ_ENABLED),
    userAgent: e.MUSICBRAINZ_USER_AGENT || '',
    baseUrl: e.MUSICBRAINZ_BASE_URL || 'https://musicbrainz.org/ws/2',
    minIntervalMs: 1100,                 // MusicBrainz asks for at most 1 request per second
  },
  tmdb: {
    enabled: on(e.TMDB_ENABLED),
    readToken: e.TMDB_READ_ACCESS_TOKEN || '',
    apiKey: e.TMDB_API_KEY || '',
    baseUrl: e.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
    minIntervalMs: 50,
  },
  jamendo: {
    enabled: on(e.JAMENDO_ENABLED),
    clientId: e.JAMENDO_CLIENT_ID || '',
    baseUrl: e.JAMENDO_BASE_URL || 'https://api.jamendo.com/v3.0',
    minIntervalMs: 100,
  },
  youtube: {
    enabled: on(e.YOUTUBE_ENABLED),
    apiKey: e.YOUTUBE_API_KEY || '',
    baseUrl: e.YOUTUBE_BASE_URL || 'https://www.googleapis.com/youtube/v3',
    minIntervalMs: 100,
  },
  externalPreview: {
    enabled: on(e.EXTERNAL_PREVIEW_ENABLED),
    baseUrl: e.EXTERNAL_PREVIEW_BASE_URL || '',
    apiKey: e.EXTERNAL_PREVIEW_API_KEY || '',
    minIntervalMs: 0,
  },
  theAudioDb: {
    // TheAudioDB publishes 123 as its shared free/test key; premium users may override it.
    enabled: on(e.THEAUDIODB_ENABLED),
    apiKey: e.THEAUDIODB_API_KEY || '123',
    baseUrl: e.THEAUDIODB_BASE_URL || 'https://www.theaudiodb.com/api/v1/json',
    minIntervalMs: 2200, // stays below the documented 30 requests/minute free limit
  },
  localMedia: {
    // Serverless filesystems are ephemeral. Never accept artist uploads or claim
    // local media is durable on Vercel; use a persistent media host/object-store adapter.
    enabled: localMediaEnabled({ isServerless: runtime.isServerless, configured: e.LOCAL_MEDIA_ENABLED }),
    dir: e.LOCAL_MEDIA_DIR || '',        // resolved in localMedia.js (default: <repo>/media)
  },
  ai: {
    provider: (e.AI_PROVIDER || 'none').toLowerCase(),
    apiKey: e.AI_API_KEY || '',
    model: e.AI_MODEL || '',
    baseUrl: e.AI_BASE_URL || 'https://api.anthropic.com/v1',
    timeoutMs: int(e.AI_TIMEOUT_MS, 10000),
  },
};

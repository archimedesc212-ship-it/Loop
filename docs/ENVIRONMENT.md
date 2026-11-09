# Environment variables

All configuration comes from `.env` in the repository root (copy `.env.example`).
`.env` is git-ignored. Values are read once at start-up, so **restart the API after
any change**. Invalid numeric values stop the API with a clear message.

`.env.example` contains placeholders only. Never commit a real password or key.

## Database

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_HOST` | yes | — | MySQL host |
| `DB_PORT` | no | `3306` | MySQL port |
| `DB_NAME` | yes | — | database name (letters, digits, `_`) |
| `DB_OWNER_USER` | for setup | — | owner account used **only** by `db:setup`, `db:migrate`, `db:verify` and the data-dictionary script |
| `DB_OWNER_PASSWORD` | for setup | empty | its password |
| `DB_APP_USER` | yes | — | least-privilege account the API connects as (created by `db:setup`). Use a **different** name per database on one server: `db:setup` recreates this account |
| `DB_APP_PASSWORD` | yes | empty | its password (set it; empty is accepted only for local experiments) |
| `DB_APP_HOST` | no | `localhost` | host part of the app account (`'muse_app'@'localhost'`) |
| `DB_TIMEZONE` | no | `+00:00` | session time zone for `NOW()`, "today", week boundaries. India: `+05:30` |
| `DB_SSL` | no | `false` | enable TLS for managed MySQL providers that require it; keep certificate verification enabled |
| `DB_SSL_CA` | no | — | optional PEM CA certificate supplied by the database provider |
| `DB_CONNECT_TIMEOUT_MS` | no | `10000` | connection timeout in milliseconds |
| `DB_POOL_MAX` | no | `3` on Vercel, `12` elsewhere | maximum pool connections per process/function instance |

## API and sessions

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `production` turns on secure cookies and the 32-character secret check |
| `SESSION_SECRET` | — (**required**) | keys the CSRF tokens and IP hashes. ≥ 32 random characters, enforced in production. `JWT_SECRET` from older `.env` files is accepted as a fallback |
| `SESSION_TTL_HOURS` | `12` | sign-in session lifetime (1–720) |
| `COOKIE_SECURE` | `true` in production, else `false` | `Secure` cookie flag; requires HTTPS |
| `TRUST_PROXY` | `0` | number of reverse proxies in front of the API; needed for correct client IPs in rate limits |
| `CORS_ORIGIN` | `http://localhost:5173` | comma-separated browser origins allowed to call the API cross-origin (the Vite dev server). Same-origin use needs none |
| `RATE_LIMIT_AUTH_FAILURES` | `20` | failed sign-in/registration attempts per IP per 15 minutes |
| `RATE_LIMIT_WRITES_PER_MIN` | `240` | state-changing requests per IP per minute |

## Background jobs

| Variable | Default | Purpose |
|---|---|---|
| `JOBS_ENABLED` | `true` | run the in-process scheduler (idle sessions, private-session cleanup, sign-in session purge, local media check, trend snapshot, weekly intelligence and MUSE Worlds). The weekly run happens only while the API process is running |
| `SESSION_IDLE_MINUTES` | `30` | idle minutes before an open *listening* session is closed |
| `INCOGNITO_TTL_MINUTES` | `120` | private-session lifetime |

## Providers (all optional; see [PROVIDERS.md](PROVIDERS.md))

| Variable | Default | Purpose |
|---|---|---|
| `PROVIDER_TIMEOUT_MS` | `8000` | per-attempt timeout for external requests |
| `PROVIDER_RETRIES` | `2` | retries for timeouts, network errors, 429 and 5xx |
| `MUSICBRAINZ_ENABLED` | `false` | turn the MusicBrainz adapter on |
| `MUSICBRAINZ_USER_AGENT` | — | required: `AppName/version (contact email or URL)` |
| `MUSICBRAINZ_BASE_URL` | `https://musicbrainz.org/ws/2` | override (tests use a local mock) |
| `TMDB_ENABLED` | `false` | turn TMDB on |
| `TMDB_READ_ACCESS_TOKEN` | — | v4 read token (preferred), **or** |
| `TMDB_API_KEY` | — | v3 API key |
| `TMDB_BASE_URL` | `https://api.themoviedb.org/3` | override |
| `YOUTUBE_ENABLED` | `false` | turn the YouTube Data API adapter on |
| `YOUTUBE_API_KEY` | — | Google Cloud API key with YouTube Data API v3 enabled |
| `YOUTUBE_BASE_URL` | `https://www.googleapis.com/youtube/v3` | override |
| `THEAUDIODB_ENABLED` | `false` | enable TheAudioDB artist/album artwork metadata (development/testing only with the shared free key) |
| `THEAUDIODB_API_KEY` | `123` | shared public test key; use a paid/approved key for a permitted production deployment |
| `THEAUDIODB_BASE_URL` | `https://www.theaudiodb.com/api/v1/json` | TheAudioDB v1 API base URL |
| `EXTERNAL_PREVIEW_ENABLED` | `false` | turn the licensed-preview adapter on |
| `EXTERNAL_PREVIEW_BASE_URL` | — | base URL implementing `GET /previews?isrc=` |
| `EXTERNAL_PREVIEW_API_KEY` | — | bearer key for that service |
| `EXTERNAL_PREVIEW_MEDIA_ORIGIN` | — | `https://host[:port]` the audio is served from; added to the CSP `media-src` |
| `LOCAL_MEDIA_ENABLED` | `true` | serve licensed local files |
| `LOCAL_MEDIA_DIR` | `<repo>/media` | folder holding those files |
| `AI_PROVIDER` | `none` | `none` or `anthropic` |
| `AI_API_KEY` | — | Anthropic API key |
| `AI_MODEL` | — | model id to use (choose a current one from the Anthropic docs) |
| `AI_BASE_URL` | `https://api.anthropic.com/v1` | override |
| `AI_TIMEOUT_MS` | `10000` | timeout for the AI call |

The current state of every provider (never the values) is shown at start-up, at
`GET /api/ready` and in **Admin › Providers & media**.

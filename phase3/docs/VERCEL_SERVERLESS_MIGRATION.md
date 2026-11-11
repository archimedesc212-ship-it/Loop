> **Latest audit (10 November 2026):** See [RELEASE_AUDIT_2026-11-10.md](RELEASE_AUDIT_2026-11-10.md) for the checks run in the current hand-off and remaining external blockers. The active setup instructions are in [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md).

# LOOP Vercel-only deployment refactor

Status: **Vercel routing/code migration committed; frontend verification passes. MySQL provisioning/configuration and production API verification remain blocked.**

## Verification snapshot

- Frontend production build: passed.
- ESLint: passed.
- Frontend tests: 35/35 passed.
- Local serverless-handler smoke test: `GET /api?__loop_path=health` returned 200; guest session correctly returned 503 with `DATABASE_NOT_CONFIGURED` when DB variables were absent.
- Production Vercel deployment: the last successfully deployed commit predates the final API rewrite. The Vercel deployment API then returned `402 payment_required` with `api-deployments-free-per-day` (100/day). The final API rewrite is committed to GitHub but is not yet live.
- Backend/MySQL integration tests were not run because no MySQL host or credentials are configured in the connected Vercel project.

## Implemented on `main`

- Added `api/index.js`, which exports the existing Express app as a Vercel Node Function. A same-origin rewrite sends `/api/*` to this function while preserving the original API suffix.
- Removed the Render hostname rewrite from `vercel.json`; browser requests continue using same-origin `/api/*`. The Vercel Function is pinned to the Mumbai region (`bom1`).
- Made environment validation callable rather than terminating Node during module import.
- Kept strict validation on persistent-server startup, and made unconfigured serverless API requests return an explicit HTTP 503 instead of leaving the frontend waiting.
- Reduced the default MySQL pool from 12 connections to 3 per Vercel instance, added bounded idle reuse and connection timeout, and added optional provider TLS/CA settings.

## Remaining release blockers

1. **MySQL is not provisioned/configured for Vercel.** Current production Vercel environment only had the old Render API origin; no `DB_HOST`, `DB_NAME`, `DB_APP_USER`, `DB_APP_PASSWORD`, or `SESSION_SECRET` were present. The old Render API also fails startup because its four database variables are missing.
2. The app uses MySQL-specific tables, stored routines, triggers, views, and least-privilege grants. Do not replace it with Firestore or PostgreSQL. Do not use a MySQL-compatible service that omits stored procedures/triggers unless the application is intentionally refactored and all SQL behavior is reimplemented and tested.
3. The target database must be MySQL 8.0.19+ (or a provider-confirmed compatible MySQL implementation) with routines, triggers, views, transactions, JSON functions, and required grants. Confirm TLS, network access from Vercel, connection limits, backup and restore support.
4. **Never run `npm run db:setup` or `npm run db:reset:unsafe` on an existing database.** The setup script is destructive and drops the named database. Use only a new, verified-empty schema for first bootstrap after reviewing the script. For data already entered, back it up and use the non-destructive migration path.
5. In Vercel Functions, `backend/src/server.js` and its in-process scheduler are not started. Background jobs still need to be converted into protected, short, idempotent Cron endpoints or moved to a separate worker. Do not start a scheduler on function import.
6. Local media is not durable serverless storage. Cloudflare R2/private object storage, signed upload/playback, FFmpeg/scanning workers, and media Range/authorization tests remain unfinished.
7. Production and Preview must use separate database, session secret, storage bucket and job secret. Do not let untrusted Preview deployments write to production data.

## Target topology

- Vercel: Vite frontend + Express API Node Function.
- Managed MySQL 8.0.19+: preserve the existing schema/routines initially; use bounded pool reuse and provider-supported TLS.
- Cloudflare R2: private audio/artwork bucket; separate production and preview buckets.
- Background processing: external queue/worker for FFmpeg and scanning.
- Cron: protected Vercel Cron routes for short, idempotent jobs; no in-process scheduler inside Functions.
- Firebase: optional Google sign-in only. Do not use Firestore as a second source of truth.

## Environment variables for Vercel

Required existing application values:
- `NODE_ENV=production`
- `SESSION_SECRET` (random, at least 32 characters; secret; never commit)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_APP_USER`, `DB_APP_PASSWORD`
- `DB_TIMEZONE=+05:30` for India-local database session time
- `DB_SSL=true` when required by the provider; provide `DB_SSL_CA` only when the provider publishes a CA certificate
- `COOKIE_SECURE=true`
- `TRUST_PROXY=1`
- Optional: `DB_CONNECT_TIMEOUT_MS=10000`, `DB_POOL_MAX=3`

The owner account (`DB_OWNER_USER`, `DB_OWNER_PASSWORD`) is for one-time bootstrap/migrations only; do not add it to the Vercel runtime environment.

## Release verification gates

- Vercel Preview build completes.
- `/api/health` returns liveness; `/api/ready` returns HTTP 200 and `status: ready` after MySQL is connected and schema is compatible.
- Guest session creation, session cookie persistence, CSRF, logout, and listener-only permissions pass end-to-end.
- API routes work without Render or a persistent server.
- DB load remains within provider limits during cold-start bursts.
- Cron rejects missing/incorrect secrets and duplicate runs are idempotent.
- No scheduler starts during function import or per request.
- Preview cannot read/write production data or production audio.
- Auth/session/CSRF, upload, Range playback, cache purge, cron replay, backup and restore drills pass.

Do not call this production-ready until all release gates pass on the deployed Vercel project.

# LOOP Vercel-only deployment refactor

Status: target design and migration checklist. Current repository is not yet Vercel-only deployable.

## Current blockers confirmed in repository

- Root `vercel.ts` requires `LOOP_API_ORIGIN` and forwards API calls to a persistent Render service.
- `backend/src/server.js` starts an Express listener and an in-process scheduler.
- `backend/src/config/env.js` currently calls process.exit when DB config is absent; this is unsuitable for import-time initialization in a serverless function.
- The application uses MySQL-specific SQL, stored routines, triggers, views and a least-privilege MySQL user. Do not silently replace it with Firebase Firestore or PostgreSQL.
- The current API has database-backed sessions and CSRF checks; preserve them during migration.
- Audio is currently local/provider based, not private object storage with signed upload/playback authorization.

## Target topology

- Vercel: Vite frontend + Node.js serverless API entrypoints.
- MySQL-compatible managed database: preserve current schema/routines initially; use bounded connection reuse and provider-supported TLS.
- Cloudflare R2: private audio/artwork bucket; separate production and preview buckets.
- Background processing: external queue/worker or managed background service for FFmpeg/scanning. A normal Vercel request is not a durable worker.
- Cron: Vercel Cron invokes protected, short, idempotent task endpoints. No in-process setInterval/scheduler in Functions.
- Firebase: separate LOOP Firebase project may be used for Google sign-in only if desired. Do not use Firestore as a second source of truth. Verify Firebase ID tokens server-side, then establish the existing app session; retain CSRF and cookie controls.

## Refactor steps

1. Extract configuration parsing from process boot. Validation should be callable and should not terminate the process merely because a module is imported.
2. Export the Express app without listening. Add a Vercel Node entrypoint that adapts the request/response to the existing Express app using a supported adapter; test body parsing, cookies, streaming responses and route paths.
3. Replace `vercel.ts` Render rewrite with explicit Vercel routing to the frontend build and API function. Remove `LOOP_API_ORIGIN` only after preview tests pass.
4. Make DB pool serverless-safe: small max connections, connection timeout, idle timeout, TLS, no per-request pool creation, no unbounded concurrency. Confirm the selected MySQL host permits Vercel egress/connection strategy.
5. Convert each scheduler operation into an exported idempotent job function. Add a protected cron route with constant-time secret comparison, job allowlist, bounded execution and run log. Do not expose a generic arbitrary job runner.
6. Configure Vercel Cron only for supported cadence/plan. For jobs needing longer than a function execution window, use a separate worker/queue.
7. Add preview/prod separation: database, session secret, Firebase project settings, R2 bucket, cron secret and allowed origins are distinct.
8. Add Vercel deployment protection / environment review, strict headers, CSP, upload limits, rate limiting and structured redacted logs.
9. Add CI gates: lint, unit tests, frontend tests, migration verification against MySQL 8, build, route smoke tests and secret scanning.
10. Run backup/restore, rollback, cold-start, concurrent connection, auth/session/CSRF, upload, Range playback, cache purge and cron replay tests before production.

## Environment variable groups

Existing application:
- `NODE_ENV=production`
- `SESSION_SECRET` (strong random secret, never commit)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_APP_USER`, `DB_APP_PASSWORD`, `DB_TIMEZONE`
- `COOKIE_SECURE=true`, `TRUST_PROXY`, `CORS_ORIGIN`

Optional LOOP Firebase Authentication:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` only if using Admin SDK service-account verification; prefer workload identity/OIDC where supported and never place private key in frontend variables.
- Public web config (apiKey/authDomain/projectId/appId) may be exposed in the browser bundle, but use Vercel envs for environment separation.

Private object storage:
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `UPLOAD_MAX_BYTES`, `PLAYBACK_TOKEN_SECRET`

Scheduled jobs:
- `CRON_SECRET`

Spotify:
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` only if a reviewed, policy-compliant optional integration is implemented. Never expose client secret with a VITE_ prefix.

## Release gates

- `/api/health` returns liveness; `/api/ready` proves DB and schema compatibility.
- Signup/login/logout, existing sessions, CSRF and role permissions pass end-to-end on Vercel Preview.
- API routes work without Render or a persistent server.
- DB connection load remains within provider limits under cold-start burst.
- Cron rejects missing/incorrect secret and duplicate runs are idempotent.
- No scheduler starts on import or per request.
- Preview cannot read/write production data or production audio.
- Audio is private, signed grants are short-lived, Range seeking works and takedown revocation is verified.
- Build, lint, unit, SQL migration, browser and security checks pass.

Do not call this production-ready until all gates pass on the deployed Vercel project and a restore drill has succeeded.

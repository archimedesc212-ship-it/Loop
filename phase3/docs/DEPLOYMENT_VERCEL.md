# LOOP production release and operations (Vercel)

**Full-stack account profile:** Vercel frontend + Vercel Node Function API + managed MySQL 8.0.19+. This runbook also describes the simpler static guest profile, which is the recommended first public preview.

## Choose the deployment profile first

LOOP supports two distinct Vercel profiles. The default is the **static guest profile**: leave `VITE_DEMO_MODE` unset or set it to `true`. It requires no database or backend secrets; preferences and playlists remain local to the browser. The full-stack account profile requires `VITE_DEMO_MODE=false`, a compatible MySQL database and every server-side variable in the table below. Do not set the account-mode flag until `/api/ready` is expected to pass.

For the static guest profile, use the root directory, `npm ci`, `npm run build` and output directory `frontend/dist`. An optional YouTube browser API key is public and must be restricted to YouTube Data API v3 plus the deployed site's HTTP referrers. It enables video-ID lookup only; it does not grant commercial streaming rights.

## Deployment configuration

In Vercel, set the project Root Directory to the repository root (not `frontend`). Keep the checked-in settings:

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `frontend/dist`
- Node.js runtime: 22.x
- Region: `bom1` (Mumbai)

Deploy through the connected Git repository. Vercel creates deployments for Git pushes; inspect the Preview deployment before promoting it to Production. See [Vercel deployment methods](https://vercel.com/docs/deployments) and [preview promotion](https://vercel.com/docs/deployments/promote-preview-to-production).

## Required Production environment variables (full-stack account profile only)

Set these in **Project → Settings → Environment Variables → Production**. Add the same values to Preview only when Preview uses a separate database, separate session secret and separate resources.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | Unique random secret, at least 32 characters; keep private |
| `DB_HOST` | Managed MySQL hostname |
| `DB_PORT` | `3306` unless provider specifies otherwise |
| `DB_NAME` | Dedicated LOOP schema |
| `DB_APP_USER` | Least-privilege runtime user |
| `DB_APP_PASSWORD` | Runtime user's password |
| `DB_TIMEZONE` | `+05:30` for India-local DB timestamps, if desired |
| `DB_SSL` | `true` when required by the DB provider |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `1` |
| `VITE_DEMO_MODE` | `false` |
| `JOBS_ENABLED` | `false` for the Vercel Function; in-process scheduler is not run there |
| `YOUTUBE_ENABLED` | `true` when using YouTube search |
| `YOUTUBE_API_KEY` | Secret server-side variable; never prefix with `VITE_` |
| `MUSICBRAINZ_ENABLED` | `true` when using MusicBrainz |
| `MUSICBRAINZ_USER_AGENT` | `LOOP/1.0 (contact: real-contact-email-or-url)` |

Only add `DB_SSL_CA` when the database provider publishes a CA certificate. Never put `DB_OWNER_USER` or `DB_OWNER_PASSWORD` in the Vercel runtime environment. Keep `.env` out of Git.

## Database bootstrap and upgrades

The database must be MySQL 8.0.19+ and support the project's stored routines, triggers, views, transactions, JSON functions and grants. Do not substitute Firestore or an arbitrary PostgreSQL-compatible service.

1. Provision a **new, empty** MySQL schema and a one-time owner account in a trusted admin environment.
2. Review `backend/scripts/setup-db.js` and the SQL it runs before first bootstrap. `npm run db:setup` / destructive reset can drop and recreate the target database. Never run `npm run db:reset:unsafe` or destructive setup against existing user data.
3. For an existing database, take a verified backup, run `npm run db:status`, then `npm run db:migrate` from a controlled machine using owner credentials.
4. Set only the least-privilege `DB_APP_USER` credentials in Vercel.
5. Confirm `/api/ready` returns HTTP 200 and `status: ready`.

The repository's GitHub CI workflow uses an isolated MySQL 8 service to run migrations and backend tests; it does not migrate your production database.

## Media upload safety boundary

Vercel Function filesystems are ephemeral and request bodies are bounded. Therefore LOOP now **disables local filesystem media and artist audio upload intents in serverless mode**. This is intentional fail-closed behaviour: accepting uploads to an ephemeral directory could lose user audio after a deployment or function recycle.

Artist profiles/applications can remain available, but audio upload, scanning and publishing must stay disabled until a private object-storage adapter (for example an R2/S3-compatible bucket), signed upload/playback grants, durable scanning worker and authorization/Range tests are implemented and configured. Do not set `LOCAL_MEDIA_ENABLED=true` expecting persistence on Vercel; the serverless guard overrides it.

## Background jobs and monitoring

The Express in-process scheduler starts only from `backend/src/server.js`, which is not used by Vercel Functions. Do not assume scheduled cleanup, trend snapshots or weekly intelligence jobs are running in Vercel. Move them to protected, idempotent Cron/worker jobs before relying on them in production. Do not start the scheduler on function import.

A GitHub Actions workflow `.github/workflows/production-smoke.yml` can check the homepage, `/api/health` and `/api/ready` every 15 minutes. Add a repository Actions variable named `LOOP_PRODUCTION_URL` with `https://loop-rho-beige.vercel.app` to enable it. Failed checks appear as failed workflow runs; configure GitHub notifications or an external alert destination for operational paging.

Configure automated daily MySQL backups with your database provider, retention, encryption and point-in-time recovery if offered. Perform a restore drill into a separate schema. No backup is considered verified until restored and `/api/ready` passes.

## Release gates

Run from the repository root after dependencies are installed:

```bash
npm ci
npm run deploy:check
npm run lint
npm test
npm run test:web
npm run test:sql
npm run build
LOOP_PRODUCTION_URL=https://loop-rho-beige.vercel.app npm run deploy:smoke
```

The backend and SQL suites require a reachable isolated test MySQL database. `deploy:smoke` requires an already deployed URL and expects database/schema readiness to be HTTP 200. A 503 from `/api/ready` is a release blocker, not a passing check.

## Current limitations that require external services

- MySQL provisioning, production secrets, schema migrations, backups and restore drills require your database provider and credentials.
- Artist audio upload/publication requires durable private object storage and a scanning worker; it is disabled on Vercel until that is built.
- Vercel does not run the persistent API scheduler. Scheduled work needs a protected external worker or verified Cron endpoints.
- YouTube embedding is controlled by the video owner, YouTube and regional restrictions; LOOP can provide a link fallback but cannot force an embed to play.
- Commercial full-length catalogue playback requires a provider licence. Metadata APIs do not grant streaming rights.

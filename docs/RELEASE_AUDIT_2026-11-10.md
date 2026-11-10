# LOOP production-readiness audit and hand-off

**Audit date:** 10 November 2026  
**Source:** `LOOP_Spotify_Black_Theme.zip`  
**Target deployment:** `https://loop-rho-beige.vercel.app`  

## Changes made in this audit pass

- Added `backend/src/providers/runtimeCapabilities.js` so local filesystem media is always disabled when the process is Vercel/serverless, even if `LOCAL_MEDIA_ENABLED=true` is mistakenly supplied.
- Added early checks to artist upload-intent creation and file receipt. On Vercel, uploads now return a clear HTTP 503 error rather than writing to ephemeral filesystem storage. This is a safety boundary, not an object-storage implementation.
- Added unit coverage for the serverless-media boundary.
- Added tests for Vercel's `/api?__loop_path=...` adapter, query preservation and path-traversal rejection.
- Added `scripts/vercel-smoke-test.js` and `npm run deploy:smoke`. It checks the homepage, API liveness and database/schema readiness without requiring credentials.
- Added `.github/workflows/production-smoke.yml`, which can run the smoke check every 15 minutes after a repository Actions variable `LOOP_PRODUCTION_URL` is configured.
- Added `docs/DEPLOYMENT_VERCEL.md`; marked the Render hybrid guide as historical and clarified the persistent-host guide as an alternative.
- Updated the README, environment and upload documentation to reflect the active Vercel architecture and the serverless media restriction.

## Checks run in this environment

| Check | Result |
|---|---|
| ZIP/source archive integrity | Passed |
| Backend/API/scripts Node syntax | 112 files passed |
| Frontend JSX/TSX syntax parse (TypeScript parser) | 45 files, 0 syntax errors |
| Dependency-free backend unit tests | 21 passed, 0 failed |
| Deployment contract preflight | 35 passed, 0 failed |
| Production smoke script against a local mock HTTP server | 3/3 passed |

The mock smoke test validates the script's request and response handling; it is not a test of the actual Vercel deployment.

## Checks not completed / external blockers

- `npm ci` did not finish in this environment. Therefore the full ESLint run, full backend suite, Vitest suite, SQL suite and Vite production build were not run. Do not treat syntax checks as a substitute for those tests.
- No MySQL credentials or reachable MySQL service were available. Production account creation, login persistence, playlist/like writes, listening history, deletion, migration compatibility and `/api/ready` are not live-verified.
- The live Vercel URL and its `/api/health` and `/api/ready` endpoints could not be resolved/reached from this environment, so the active deployment status is unknown.
- Vercel does not run the in-process scheduler in `backend/src/server.js`. Trend snapshots, weekly intelligence and cleanup tasks are not certified as scheduled in the Vercel-only deployment. Protected Cron/worker endpoints still need to be designed, implemented and tested.
- Private artist-audio object storage, signed upload/playback grants and a durable ClamAV/ffprobe worker are not implemented. Artist audio upload is intentionally disabled on Vercel to avoid losing data.
- Automated DB backup/restore depends on the chosen MySQL provider. A restore drill has not been run.
- The production smoke workflow remains inactive until `LOOP_PRODUCTION_URL` is added as a GitHub Actions repository variable. The workflow reports failures in Actions, but external paging/alert routing is not configured.
- Live YouTube embeds can be blocked by video owners or territory restrictions. The official iframe and outbound YouTube link remain the safe fallback; LOOP cannot force an unavailable video to play. Full commercial music playback requires a suitable licence.

## Required owner-side release actions

1. Configure Vercel Production with `SESSION_SECRET`, MySQL runtime credentials, `VITE_DEMO_MODE=false`, provider variables and the other settings listed in [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md).
2. Provision compatible MySQL 8.0.19+; from a trusted machine, take a backup and apply the reviewed non-destructive migrations with the owner account. Never use `db:reset:unsafe` on production.
3. Add GitHub Actions variable `LOOP_PRODUCTION_URL=https://loop-rho-beige.vercel.app` to enable scheduled smoke monitoring.
4. Push this release to the repository connected to Vercel, inspect the Preview deployment, and promote only after CI passes.
5. After deployment, run `LOOP_PRODUCTION_URL=https://loop-rho-beige.vercel.app npm run deploy:smoke`. All three checks—including `/api/ready`—must pass.
6. Configure provider-managed daily backups and verify a restore. Keep artist audio uploads disabled until the object-storage and worker requirements are delivered.

## Release assessment

**The source hand-off is improved, but LOOP is not yet fully production-certified.** This ZIP closes a concrete serverless upload safety issue, tests the Vercel route adapter, adds repeatable smoke monitoring and removes conflicting deployment instructions. Database readiness, full build/test execution, scheduled jobs, durable media and backup/restore remain unverified or incomplete because they require dependencies and external services that were not available in this environment.

# LOOP hybrid deployment: Vercel + Render + MySQL

## Architecture

- **Vercel** builds and serves the React/Vite frontend from `frontend/dist`.
- **Render** runs the long-lived Express API as one Node.js web service.
- **Managed MySQL 8** stores application data.
- Vercel rewrites browser requests from `/api/*` to the Render API. The browser continues to use the Vercel origin, so the existing `muse_session` and `muse_csrf` cookies remain first-party and `SameSite=Strict` is preserved.
- The scheduler remains inside the persistent Render process. Keep exactly one Render instance until scheduler leadership/locking is implemented independently.

## 1. Deploy the API on Render first

Create a Render Blueprint from this repository using `render.yaml`.

Provision a new managed MySQL 8.0.19+ database and configure the Render service's unsynced values:

- `DB_HOST`: database hostname only
- `DB_NAME`: new, dedicated database/schema name
- `DB_APP_USER`: least-privilege runtime user
- `DB_APP_PASSWORD`: runtime user's password
- `CORS_ORIGIN`: exact Vercel production origin, e.g. `https://your-loop-project.vercel.app`

Keep the generated `SESSION_SECRET`; it must remain stable across restarts and be at least 32 characters. Do not set `JOBS_ENABLED=false`. Do not scale the service above one instance while the in-process scheduler is enabled.

After the database has been initialized, verify:

- `https://<render-service-host>/api/health` returns process liveness.
- `https://<render-service-host>/api/ready` returns HTTP 200 and `status: ready`.

### Database safety

Never run `npm run db:setup` against an existing or valuable database: the current setup script drops and recreates the database. For a first install, use only a newly provisioned empty database after reviewing the setup SQL and target. For subsequent releases, back up first, inspect `npm run db:status`, then apply reviewed migrations with an owner account from a trusted environment. Do not put owner credentials in the running service.

## 2. Deploy the frontend on Vercel

Import this same repository as a Vercel project with:

- Root Directory: repository root (`.`), not `frontend`
- Framework: Other (the checked-in `vercel.ts` owns build and routing)
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `frontend/dist`

Set `LOOP_API_ORIGIN` in Vercel Project Settings for Production (and Preview only if preview origins are also explicitly allowed by the backend). Value must be the bare HTTPS origin of the Render service, for example `https://loop-muse-api.onrender.com` — no trailing path, no `/api`, no credentials.

The `vercel.ts` configuration validates that this value is a bare HTTPS origin, sends `/api/*` to Render, and sends other routes to the SPA entry point. It does not expose the Render hostname to browser JavaScript.

## 3. Authentication and origin security

The browser calls relative `/api` URLs with `credentials: 'same-origin'`. Keep that behavior. Do not change the API client to call the Render hostname directly.

Set Render `CORS_ORIGIN` to the exact public Vercel origin. The Express origin guard accepts that configured origin; requests are still same-site from the browser's perspective because Vercel proxies the API path. If adding a custom domain, update `CORS_ORIGIN` to include that exact HTTPS origin and redeploy the API.

Do not broadly allow `*`, do not disable CSRF, and do not change cookie SameSite settings to make cross-origin calls work. Preview deployments should not be used for authenticated production data unless their exact origin is explicitly added to the backend allowlist.

## 4. Scheduler and operational constraints

The Render API is a persistent process; its in-process scheduler remains enabled. Keep one instance. Do not run the same scheduler on Vercel Functions, and do not add Vercel Cron triggers for these same jobs, or tasks could execute twice.

Configure backups and restore testing for MySQL. Local media files on Render's ephemeral filesystem are not durable; use object storage or a durable media origin before depending on local uploads in production.

## 5. Verification checklist

After both providers are configured:

1. Confirm Render health and readiness.
2. Confirm Vercel deployment builds and serves the SPA.
3. From the Vercel origin, check `/api/health` and `/api/ready`.
4. Register/sign in, refresh the page, and confirm the session survives.
5. Verify an unsafe authenticated request succeeds with the CSRF header and fails without it.
6. Verify logout, session revocation, and rate limiting.
7. Verify scheduler logs show startup and scheduled work on Render.
8. Run the repository's full CI and database-backed tests before public launch.

This branch contains deployment configuration and instructions only. It does not provision providers, create databases, configure secrets, or claim a successful production deployment.

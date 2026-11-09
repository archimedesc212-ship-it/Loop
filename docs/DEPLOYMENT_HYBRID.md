# LOOP hybrid deployment: Vercel + Render + MySQL

## Architecture

- **Vercel** builds and serves the React/Vite frontend from **frontend/dist**.
- **Render** runs the long-lived Express API as one Node.js web service.
- **Managed MySQL 8** stores application data.
- Vercel rewrites browser requests from **/api/** to the Render API. The browser continues to use the Vercel origin, so the existing **muse_session** and **muse_csrf** cookies remain first-party and **SameSite=Strict** is preserved.
- The scheduler remains inside the persistent Render process. Keep exactly one Render instance until scheduler leadership/locking is implemented independently.
- The Phase 3 Streamlit Query Studio is a separate teaching tool using the legacy **muse_db** schema. It is not the production API and is not part of this hybrid deployment.

## 1. Deploy the API on Render first

Create a Render Blueprint from this repository using **render.yaml**.

Provision a new managed MySQL 8.0.19+ database and configure the Render service's unsynced values:

- **DB_HOST**: database hostname only
- **DB_NAME**: new, dedicated database/schema name
- **DB_APP_USER**: least-privilege runtime user
- **DB_APP_PASSWORD**: runtime user's password
- **CORS_ORIGIN**: exact Vercel production origin, e.g. **https://your-loop-project.vercel.app**

Keep the generated **SESSION_SECRET**; it must remain stable across restarts and be at least 32 characters. Do not set **JOBS_ENABLED=false**. Do not scale the service above one instance while the in-process scheduler is enabled.

After the database has been initialized, verify:

- **https://<render-service-host>/api/health** returns process liveness.
- **https://<render-service-host>/api/ready** returns HTTP 200 and **status: ready**.

### Database safety

Never run **npm run db:setup** against an existing or valuable database: the current setup script drops and recreates the database. For a first install, use only a newly provisioned empty database after reviewing the setup SQL and target. For subsequent releases, back up first, inspect **npm run db:status**, then apply reviewed migrations with an owner account from a trusted environment. Do not put owner credentials in the running service.

## 2. Deploy the frontend on Vercel

Import this same repository as a Vercel project with:

- Root Directory: repository root (**.**), not **frontend**
- Framework: Vite (the checked-in **vercel.json** owns build output and routing)
- Install Command: **npm ci**
- Build Command: **npm run build**
- Output Directory: **frontend/dist**
- Node.js version: **22.x** (the version used by the documented verification run)

The checked-in **vercel.json** sends **/api/** to the Render API at **https://loop-41r7.onrender.com/api/** and sends other paths to **/index.html** for client-side routing. If the Render hostname changes, update the API rewrite destination in **vercel.json** and run **npm run deploy:check** before deploying.

The current rewrite is shared by Production and Preview deployments. Do not send untrusted Preview builds to production data: disable Preview deployments or create an isolated preview API and database, then use a separately reviewed deployment configuration for that environment.

For local development, use **npm run dev**: Vite proxies **/api** to the local Express process on port 4000. Do not point local browser code directly at the production Render hostname.

## 3. Authentication and origin security

The browser calls relative **/api** URLs with **credentials: same-origin**. Keep that behavior. Do not change the API client to call the Render hostname directly.

Set Render **CORS_ORIGIN** to the exact public Vercel origin. The Express origin guard accepts that configured origin; requests are proxied through the Vercel origin. If adding a custom domain, add that exact HTTPS origin to **CORS_ORIGIN** and redeploy the API.

Do not use wildcard CORS origins, disable CSRF, or change cookie SameSite settings to make cross-origin calls work. Preview deployments should use an isolated backend and database unless access to production data has been explicitly approved.

## 4. Scheduler and operational constraints

The Render API is a persistent process; its in-process scheduler remains enabled. Keep one instance. Do not run the same scheduler on Vercel Functions or add Vercel Cron triggers for these same jobs, or tasks could execute twice. The scheduler performs minutely cleanup and hourly maintenance/trend/weekly-intelligence work while the API process is running.

Configure backups and restore testing for MySQL. Local media files on Render's ephemeral filesystem are not durable; use object storage or a durable media origin before depending on local uploads in production.

## 5. Verification checklist

Run the static deployment contract check from the repository root:

    npm ci
    npm run deploy:check
    npm run lint
    npm run test:web
    npm run build

The preflight validates the checked-in HTTPS API rewrite and SPA fallback without contacting Render, Vercel, or MySQL. It does not replace the full database-backed suite.

After both providers are configured:

1. Confirm Render health and readiness.
2. Confirm Vercel deployment builds and serves the SPA.
3. From the Vercel origin, check **/api/health** and **/api/ready**.
4. Register/sign in, refresh the page, and confirm the session survives.
5. Verify an unsafe authenticated request succeeds with the CSRF header and fails without it.
6. Verify logout, session revocation, account lockout and rate limiting.
7. Verify scheduler logs show startup and scheduled work on Render.
8. Run the full repository checks, including database-backed tests, before public launch.

## 6. Release boundaries

This repository configuration prepares the hybrid deployment; it does not create cloud databases, set provider credentials, or certify a production release. Render's **autoDeploy: false** is intentional: enable or trigger deployment only after the database target, migrations, environment values and health checks have been reviewed.

Never add database owner credentials, session secrets, API keys or live environment files to GitHub. Never attach **npm run db:setup** to a deployment build/start hook. The first schema bootstrap is a separately reviewed operation on a new, empty database only.

# Render deployment (primary MUSE app)

This deployment keeps the React app and Express API on **one origin and one
Node.js process**, matching the architecture the repository currently implements.
Do not split the browser app and API across unrelated hostnames without first
redesigning and testing the cookie, CSRF, Origin and CORS model.

## What this blueprint deploys

- Root Node.js workspace: Express API plus the built React/Vite app.
- One Render web service; the API serves `frontend/dist` from the same origin.
- The in-process scheduler is enabled. Keep exactly one running instance.
- MySQL is external and must be provisioned separately.

It does **not** deploy the legacy Phase 3 Streamlit Query Studio or the alternate
Phase 3 Flask HTML interface. Those are separate tools and use the legacy
`muse_db` schema; do not assume they can connect to the primary `muse` schema
without checking and migrating the SQL first.

## Render setup

1. Create/import a Render Blueprint from this repository and select this file
   (`render.yaml`).
2. Provision a managed MySQL 8.0.19+ database with network access from Render.
   Use TLS if the provider requires it; confirm the provider's connection
   requirements before configuring the service.
3. In the Render service environment, set the four unsynced values:
   - `DB_HOST`: database hostname (not a URL).
   - `DB_NAME`: a **new, dedicated** database name for this deployment.
   - `DB_APP_USER`: dedicated least-privilege runtime account name.
   - `DB_APP_PASSWORD`: strong password for that runtime account.
4. Keep the generated `SESSION_SECRET`. Never commit secrets or paste them into
   GitHub issues, chat, or source files.
5. Deploy only after the database has been initialized and the runtime account
   has the grants required by `database/06_security.sql` and the migrations.
6. Verify `GET /api/health` (process liveness) and then `GET /api/ready`
   (database connectivity and schema version). A healthy liveness response does
   not prove the database is ready.

## Database safety — read before running commands

- **Never run `npm run db:setup` against an existing or valuable database.**
  The current script executes `DROP DATABASE IF EXISTS` before creating the
  schema. It is destructive by design.
- For a first install, use a newly provisioned, uniquely named, empty database
  and review the setup script and SQL grants before running the one-time
  initialization with the owner account. Confirm the target host and database
  name twice. Do not reuse a database that may contain user data.
- For later releases, take and verify a backup, inspect
  `npm run db:status`, then run `npm run db:migrate` with the owner account
  from a trusted environment. Do not put owner credentials in the long-running
  Render service; the app should connect only as the least-privilege app user.
- Never run the seed/setup path as a routine deploy command.

## Runtime notes

- Render's reverse proxy is configured as one trusted proxy (`TRUST_PROXY=1`).
  Re-check this if the service is placed behind additional proxies.
- `JOBS_ENABLED=true` is intentional because cleanup, trend and weekly
  intelligence tasks currently run inside the API process. Do not scale this
  service to multiple instances until scheduler ownership is moved to a
  dedicated worker/lock strategy and rate limits are made shared.
- The blueprint uses an always-on Starter service rather than a sleeping
  free instance because the scheduler must remain available. Confirm current
  pricing and region before provisioning.
- Optional music/film/AI providers remain disabled unless separately configured.
- Local media files are ephemeral on ordinary service filesystems. Do not rely
  on local uploads for durable licensed audio; use durable object storage or
  a supported external media origin before enabling that workflow.

## Current limitations / gates before public launch

- This is a deployment blueprint, not proof of a successful production build.
  Run the repository's CI and deployment smoke tests after configuration.
- Initial production database bootstrap is a manual, destructive-risk operation;
  no automated production database creation or seed command is wired into deploy.
- Configure backups, restore testing, monitoring, rate-limit strategy and an
  operational owner before public launch.
- The primary app has been designed for same-origin serving. The existing
  `SameSite=Strict` session cookies and Origin guard are why this blueprint
  deliberately does not create a separate Vercel frontend service.

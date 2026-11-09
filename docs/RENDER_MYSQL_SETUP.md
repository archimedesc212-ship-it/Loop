# Render + MySQL deployment runbook

This runbook documents the safe production path for LOOP's existing Express API.
It does not create cloud resources, add credentials, run SQL, or deploy anything.

## Architecture

- GitHub stores the application source, SQL schema, and migration files.
- Render runs the persistent Node.js API.
- A separately hosted MySQL **8.0.19 or newer** instance stores application data.
- Vercel serves the frontend and proxies same-origin `/api/*` requests to Render.
- The in-process scheduler stays enabled on exactly one Render instance.

**Important:** GitHub is not a running SQL database. Render's PostgreSQL is not a drop-in replacement:
the current API uses `mysql2/promise`, MySQL-specific SQL, stored routines, triggers, and migrations.
Provision MySQL, not PostgreSQL.

## 1. Before provisioning

1. Choose a managed MySQL provider and create a dedicated, new database/schema for LOOP.
2. Confirm the provider permits inbound connections from the Render service. Configure TLS/CA
   verification if the provider requires it; do not disable certificate verification as a workaround.
3. Keep the database hostname, database name, runtime username, and runtime password in the
   provider's secure console/password manager. Never commit them to Git.
4. Confirm the target database is empty before the first schema bootstrap.

Do not point a first-time bootstrap at an existing or valuable database.

## 2. Database bootstrap safety

The current `backend/scripts/setup-db.js` explicitly runs
`DROP DATABASE IF EXISTS <DB_NAME>` before recreating the schema. Therefore:

- Never attach `npm run db:setup` to Render's build or start command.
- Never run it against an existing or valuable database.
- Only use it for the first install on a newly created, verified-empty LOOP database,
  after reviewing the SQL and confirming the target database name.
- The setup script needs a database owner account. Use that account only from a trusted,
  temporary setup environment; do not store owner credentials in the running Render service.
- After bootstrap, the API must connect using the least-privilege application account created
  by the database security SQL.
- For later schema changes, take a backup, inspect `npm run db:status`, review pending migrations,
  then run the approved `npm run db:migrate` with an owner account from a trusted environment.
  Verify the schema after migration and test restore procedures.

If the provider enables binary logging, review the project's SQL deployment notes for the
required function-creator setting/privileges before bootstrap. Do not grant broad privileges
to the runtime account.

## 3. Render service configuration

For the API service, the repository's `render.yaml` declares:

- Node runtime
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`
- `autoDeploy: false`
- One persistent instance while the in-process scheduler is enabled

The Blueprint currently declares the Starter plan and the service name `loop-muse-api`.
Review these against the existing Render service before using/syncing the Blueprint:
syncing may create or alter a different service. Do not assume it updates the existing
manually-created service named `Loop`.

### Runtime environment variables

Set these in the Render service's Environment settings. Use actual values from the chosen
MySQL provider and the real production Vercel origin; this document intentionally contains
no credentials or guessed hostnames.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | MySQL hostname only; no scheme or port |
| `DB_PORT` | `3306`, unless the provider specifies another port |
| `DB_NAME` | Dedicated LOOP schema/database name |
| `DB_APP_USER` | Least-privilege runtime database user |
| `DB_APP_PASSWORD` | That runtime user's password; must not be blank |
| `SESSION_SECRET` | Stable, randomly generated secret of at least 32 characters |
| `DB_TIMEZONE` | `+05:30` for India-local database session time |
| `CORS_ORIGIN` | Exact HTTPS Vercel production origin; no wildcard |
| `TRUST_PROXY` | `1` when one trusted proxy is in front of the API |
| `COOKIE_SECURE` | `true` |
| `JOBS_ENABLED` | `true` on exactly one API instance |

Let Render provide `PORT`. Do not hard-code it.

The following are setup-only values for the database bootstrap/migration process. Do not add
them to the long-running Render API environment:

- `DB_OWNER_USER`
- `DB_OWNER_PASSWORD`
- `DB_APP_HOST` (only when the database grants require a specific application host pattern)

Do not commit any `.env` file, database password, session secret, provider API key, or owner
credential to GitHub. Do not paste secrets into issue descriptions or pull requests.

## 4. Vercel frontend configuration

Set `LOOP_API_ORIGIN` in Vercel Project Settings for each deployment environment that builds
with the checked-in `vercel.ts`. It must be the bare HTTPS origin of the corresponding Render
API, with no `/api` path, credentials, query, or fragment.

Keep browser API calls as relative `/api/*` requests with same-origin credentials. Vercel
rewrites those requests to Render. Do not change the browser to call the Render hostname directly:
that would alter the first-party cookie/CSRF flow.

For Preview deployments, use an isolated preview API and database. Do not expose production data
to untrusted pull-request previews. If no approved preview backend exists, disable Preview
deployments until one is configured.

## 5. Release verification

After the database and provider settings have been reviewed and configured:

1. Run repository checks from the root: `npm ci`, `npm run deploy:check`,
   `npm run lint`, `npm run test:web`, and `npm run build`.
2. Deploy the API only after explicit release approval.
3. Confirm Render `/api/health` returns liveness.
4. Confirm Render `/api/ready` returns HTTP 200 and `status: ready`.
5. Confirm the same endpoints through the Vercel origin.
6. Test registration, sign-in, refresh/session persistence, CSRF enforcement, logout,
   session revocation, lockout, and rate limiting.
7. Confirm scheduler startup and scheduled work in Render logs.
8. Confirm MySQL backups and a restore test. Do not treat a successful health check as proof
   that the database is ready.

## 6. Current release boundary

This runbook is documentation only. It does not create a MySQL instance, configure environment
variables, run migrations, change Render service settings, or authorize a deployment.

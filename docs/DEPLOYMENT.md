# Deployment, backup and recovery

MUSE is one Node.js process (API + scheduler + built web app on the same origin) and
one MySQL 8 database. This page describes a single-server deployment, which is what
the project has been built and tested for. It has **not** been load-tested or run
behind a production load balancer.

## Requirements

- Node.js ≥ 20.19 (Vite 7); tested on Node 22.
- MySQL ≥ 8.0.19; tested on 8.0.46. The account that runs `db:setup` needs to create databases, users and routines; with binary logging on, set `log_bin_trust_function_creators=1` (or give it `SUPER`/`SET_USER_ID`).
- A reverse proxy that terminates HTTPS (nginx, Caddy, a cloud load balancer).

## First deployment

```bash
git clone … && cd muse
npm ci
cp .env.example .env        # then edit: see the production settings below
npm run db:setup            # creates the database, app account, seed data, migrations
npm run build               # builds frontend/dist, served by the API
NODE_ENV=production npm start
```

`db:setup` **drops and recreates** the database. Run it once. For later releases use
`npm run db:migrate` (below). To start without the demo data, keep the seed (the
reference data — roles, moods, languages, models — lives there) and remove the demo
listeners and catalogue afterwards, or adapt `backend/scripts/generate-seed.js`.

### Production settings (`.env`)

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` (secure cookies on, secret length enforced) |
| `SESSION_SECRET` | 48+ random bytes in hex; never reuse the example |
| `DB_APP_PASSWORD`, `DB_OWNER_PASSWORD` | long random passwords; the owner password is needed only for setup/migrations — you can remove it from the server's `.env` between releases |
| `DB_TIMEZONE` | your audience's offset, e.g. `+05:30` |
| `TRUST_PROXY` | `1` when exactly one proxy sits in front of the API |
| `CORS_ORIGIN` | empty or your own origin; the app is same-origin in production |
| `COOKIE_SECURE` | leave empty (defaults to `true` in production); requires HTTPS |
| `JOBS_ENABLED` | `true` on exactly **one** instance (the weekly MUSE World and trend jobs are idempotent by key, but one scheduler is simpler) |
| Providers | leave disabled until you hold the credentials and licences ([PROVIDERS.md](PROVIDERS.md)) |

### Reverse proxy (nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name muse.example.org;
  # ssl_certificate …; ssl_certificate_key …;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Keep it running

Use a process manager (systemd, pm2) with `NODE_ENV=production` and the working
directory set to the repository. Health checks: liveness `GET /api/health` (no
database), readiness `GET /api/ready` (503 while the database is down or the schema
is behind the code). The process shuts down cleanly on SIGTERM.

## Upgrading

```bash
git pull && npm ci
npm run db:status          # shows pending migrations
npm run db:migrate         # applies them as the owner account, in order, recorded with checksums
npm run build && restart the service
curl -s https://…/api/ready   # schema.current must equal schema.expected
```

Migrations are written to be safe to re-run after a partial failure (DDL in MySQL
commits implicitly, so a migration cannot be rolled back as one transaction). Take a
backup first. Before deploying a new migration, prove it with `npm run db:verify`
(builds a throw-away copy, upgrades it and compares it with a fresh install).

Use a **different** `DB_APP_USER` for every database on one MySQL server (for
example `muse_app` and `muse_app_staging`): `db:setup` recreates the app account
named in `.env`.

## Backup

The database holds everything except your licensed audio files (`LOCAL_MEDIA_DIR`)
and `.env`.

For independent-artist uploads, `LOCAL_MEDIA_DIR` must be a private persistent volume shared by the API and scan worker. The new quarantine directory is created beneath it with restrictive permissions and is not statically served. Configure ClamAV (`CLAMAV_HOST` / `CLAMAV_PORT`) and `ffprobe` (`FFPROBE_PATH`) before enabling artist submissions. Render ephemeral disk and Vercel/serverless local storage are not suitable for published artist audio; a durable mounted disk or private object-storage/CDN adapter is required before public launch. See `docs/ARTIST_UPLOADS_MODERATION_RIGHTS.md` for the implemented slice and remaining launch blockers.

```bash
# consistent online dump of data, routines, triggers and views (InnoDB)
mysqldump -u muse_owner -p --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF muse | gzip > muse-$(date +%F).sql.gz
```

- Run it daily (cron/systemd timer) and keep several generations off the server.
- Back up `LOCAL_MEDIA_DIR` and a copy of `.env` (in a secrets store, not next to the dumps).
- Test a restore regularly — a backup that was never restored is not known to work.

## Recovery

```bash
mysql -u muse_owner -p -e "CREATE DATABASE muse_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gunzip -c muse-2026-10-11.sql.gz | mysql -u muse_owner -p muse_restore
```

The dump contains the schema, data, routines, triggers, views and
`schema_migrations`, but **not** the MySQL accounts and grants. After restoring:

1. Recreate the app account and its grants: run the statements of `database/06_security.sql` and the `GRANT` lines of every file in `database/migrations/` with the placeholders replaced (`__DB__`, `__APP_USER__`, `__APP_HOST__`, `__APP_PASSWORD__`) — or restore into a fresh install made with `db:setup` after truncating its data.
2. Point `DB_NAME` at the restored database (or rename), start the API and check `GET /api/ready`.
3. `npm run db:status` — if the backup is older than the code, run `npm run db:migrate`.

Sign-in sessions are in the database, so restored users stay signed in on their
devices until their sessions expire; revoke them with `UPDATE auth_sessions SET
revoked_at = NOW(), revoke_reason = 'LOGOUT_ALL' WHERE revoked_at IS NULL` if the
incident requires it, and rotate `SESSION_SECRET` (which also invalidates every CSRF
token).

## What is not covered

No container image, no infrastructure-as-code, no multi-instance setup (rate limits
are per process), no read replicas, no CDN, no email service, no monitoring stack.
Each is a reasonable next step for a public deployment.

## Independent artist uploads (optional release slice)

Artist onboarding and the local private-quarantine upload workflow are implemented behind the additive migration `0008_artist_accounts_uploads_rights.sql`. Before enabling this slice:

- Set `VITE_DEMO_MODE=false` and apply `npm run db:migrate` after taking a database backup.
- Set `LOCAL_MEDIA_DIR` to a private, persistent mounted volume. The API and the scanning worker must share the same volume. Never serve this directory as static content.
- Configure a reachable ClamAV daemon with `CLAMAV_HOST` / `CLAMAV_PORT` and install `ffprobe` (or set `FFPROBE_PATH`). If scanning is unavailable, files remain private and cannot be published.
- Run the bounded scanner as `npm run artist:scan --workspace backend`; production should replace manual/in-process scanning with a durable job worker and object storage/CDN delivery before broad public launch.
- Verify the full artist journey, rights review, takedown behaviour and backup/restore on a staging database and persistent volume before production.

The current local-volume implementation is not suitable for an ephemeral serverless filesystem. See [artist uploads, moderation and rights](ARTIST_UPLOADS_MODERATION_RIGHTS.md) for its exact implemented boundary and remaining legal/technical launch gates.

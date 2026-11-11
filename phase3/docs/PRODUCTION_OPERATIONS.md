# LOOP production operations: backup, restore, monitoring and UI checks

This runbook supplements [DEPLOYMENT_VERCEL.md](DEPLOYMENT_VERCEL.md). It does not replace provider-managed MySQL backups, object-storage configuration or a live restore drill.

## 1. Static UI/accessibility source audit

Run from the repository root:

```bash
npm run ui:audit
```

It checks the responsive viewport declaration, dark-theme palette, tablet/phone breakpoints, reduced-motion support, keyboard focus indication, official-player outbound links, skip link/main landmark and `alt` declarations on JSX image elements. This is a static source check; it does not prove layout or screen-reader behaviour in a real browser. Before release, test Home, Discover, Assistant, Search, Library, Settings, login and admin pages at 390px, 768px and 1440px widths, with keyboard-only navigation and a screen reader.

## 2. Create a MySQL backup

Use a trusted workstation or private backup runner that can reach the managed MySQL host and has `mysqldump` from MySQL 8 installed. Do not run database backup jobs inside a Vercel Function. Prefer a dedicated backup account; the runtime `DB_APP_USER` must not be used as a backup owner.

Required environment variables:

```env
DB_BACKUP_HOST=your-mysql-host
DB_BACKUP_PORT=3306
DB_BACKUP_DATABASE=loop_production
DB_BACKUP_USER=loop_backup
DB_BACKUP_PASSWORD=stored-in-your-secret-manager
DB_BACKUP_SSL=true
DB_BACKUP_SSL_CA=/secure/path/provider-ca.pem
DB_BACKUP_DIR=/secure/private/loop-backups
DB_BACKUP_RETENTION_DAYS=14
```

Run:

```bash
npm run db:backup
```

The script reads an optional simple root `.env` file without overriding shell-exported values. It creates a `.sql.gz` dump with routines, triggers, events and binary values, verifies gzip integrity, writes a SHA-256 sidecar, applies restrictive local file permissions and prunes old local files. It uses a temporary MySQL option file (mode 0600) so passwords are not passed as command-line arguments. SSL uses certificate identity verification when enabled.

### Optional S3-compatible offsite copy

Set the following in the private runner's secret environment. Cloudflare R2 uses an account endpoint and an R2 access key; AWS S3 uses its normal endpoint/region and credentials.

```env
DB_BACKUP_S3_URI=s3://private-loop-backups/daily
DB_BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DB_BACKUP_S3_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The script requires the AWS CLI (`aws`) and uploads both the archive and checksum. Configure bucket-default encryption, object versioning, lifecycle/retention, restricted IAM permissions and alerting in the storage provider. The script does not configure those bucket policies. A local backup without the optional S3 URI is not an offsite backup.

## 3. Run a safe restore drill

Create a new, empty MySQL schema with a name beginning `loop_restore_` (for example `loop_restore_20261110`) and grant the backup/restore account access to that schema. Never point the drill at `DB_NAME`.

Set:

```env
DB_NAME=loop_production
DB_BACKUP_FILE=/secure/private/loop-backups/loop-db-YYYYMMDDTHHMMSSZ.sql.gz
DB_BACKUP_RESTORE_DATABASE=loop_restore_20261110
```

Use the same `DB_BACKUP_*` host/user/password/TLS settings, then run:

```bash
npm run db:restore:drill
```

The script verifies the SHA-256 sidecar and gzip stream, refuses to use `DB_NAME`, requires the `loop_restore_` prefix, checks that the target schema is empty, restores into that schema and verifies it contains tables. It does not drop or overwrite schemas. Afterward, point a non-production copy of LOOP at the restore schema and run the DB verification/test commands. A restore is not considered successful until application-level reads and critical workflows work against it.

## 4. Scheduled production smoke checks and alerts

The workflow `.github/workflows/production-smoke.yml` runs every 15 minutes after this repository is connected and the following GitHub repository variable is set:

- `LOOP_PRODUCTION_URL=https://loop-rho-beige.vercel.app`

Optionally set the repository secret `LOOP_ALERT_WEBHOOK` to a Slack-compatible incoming webhook or an internal endpoint that accepts JSON `{ "text": "..." }`. On a failed check, the workflow posts the repository and failed run URL. The secret is never printed. GitHub scheduled actions can be delayed or disabled for inactive repositories; use provider uptime monitoring for critical paging.

The smoke script checks the static homepage, `/api/health` and `/api/ready`. Readiness must return HTTP 200 and `status: ready`; a 503 indicates DB/schema readiness is not established.

## 5. Live database account checks

The existing CI workflow provisions a separate disposable MySQL 8 database, applies migrations, runs the backend integration tests and SQL checks. It must pass on GitHub Actions before release. Production login/session, playlists, likes, listening history and account deletion still require a separate non-destructive smoke test with test accounts in a staging database. Never use `db:reset:unsafe` or the CI bootstrap command against Production.

## 6. Media and playback release gate

- Artist uploads remain disabled on Vercel until a private durable object-store adapter, signed grants, background malware/media scanning worker, playback authorization and HTTP Range tests are implemented.
- YouTube embeds may be blocked by territory or video-owner policy. The UI links to the official YouTube page as a user-controlled fallback. LOOP cannot bypass those restrictions.
- Commercial full-length playback requires rights from an authorized music provider; metadata/search API keys do not grant streaming rights.
- Test Apple preview/iframe behaviour and the YouTube official player in Chrome, Firefox, Safari and mobile browsers after deployment.

## 7. Current scope boundary

These scripts improve operational readiness, but do not automatically provision MySQL, cloud buckets, backup lifecycle policies, worker queues, licences, Vercel variables or GitHub secrets. Those remain owner-side configuration and live verification tasks.

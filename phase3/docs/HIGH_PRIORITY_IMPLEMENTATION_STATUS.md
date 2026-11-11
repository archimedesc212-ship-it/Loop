# LOOP high-priority implementation status

Date: 10 November 2026

This is a high-priority implementation pass, not a declaration that every planned feature or production-launch gate is complete.

## Added in this pass

- Forward-only database migration `0008_artist_accounts_uploads_rights.sql` for artist applications, artist-account links, upload state, rights declarations, event history, and rights reports. Existing baseline schema files were not rewritten.
- Server-backed registration and sign-in pages at `/register` and `/login` using the existing HTTP-only session cookie and CSRF model.
- Artist application and status page at `/artist/apply`; guest listening accounts are not allowed to submit applications.
- Artist Studio at `/artist/studio` for audio upload, separate composition/master rights declarations, territories, licence dates, evidence references, withdrawal and upload-state visibility.
- Private upload quarantine with size limits, generated opaque identifiers, server-enforced rights-term acceptance, audio magic-byte validation, declared/received content-type matching, and SHA-256 recording.
- ClamAV INSTREAM and ffprobe checks before human review; unsupported containers, video streams, invalid media and out-of-range duration are rejected. A missing scanner fails closed and leaves the file private.
- Admin application review, upload scan, rights/metadata decision, separate publication action, and rights-report handling.
- Playback/direct-media checks for published state, licence dates and listener country; artist media responses use `Cache-Control: private, no-store`.
- Artist uploads/rights records are retained from ordinary account deletion to avoid deleting legal/moderation history by cascade.
- Focused tests for file signatures, malformed/truncated inputs, opaque upload IDs and fail-closed territory rules.

## Checks performed in this environment

| Check | Result |
|---|---|
| `node --check` across backend source and scripts | Passed |
| `node --test backend/tests/artistUploadValidation.test.js` | 5 passed, 0 failed |
| `node scripts/deployment-preflight.js` | 31 passed, 0 failed |
| `node backend/scripts/roadmap/check-registry.js` | Registry validates 87 feature entries; status unchanged |
| MySQL migration application / schema verification | Not run: no MySQL service available |
| Full backend suite (`npm test --workspace backend`) | Blocked: app tests cannot load because `express` is not installed; focused artist validation tests pass |
| Frontend test suite and Vite production build | Not run: workspace dependencies are not installed in this environment |
| ClamAV scan / real upload integration / deployment smoke test | Not run: ClamAV and deployed staging services are not available |

## Remaining high-priority release gates

1. Install workspace dependencies, run the full backend/frontend test suites and production frontend build, and fix any additional findings.
2. Apply migration 0008 to a disposable MySQL 8 database and run the migration/schema verification suite before upgrading a real database.
3. Use a persistent private volume for this local storage mode; for a public multi-instance launch, implement private object storage, durable asynchronous scanning/transcoding workers and CDN/edge authorization.
4. Add end-to-end tests for registration, application approval, cross-account upload isolation, scan failure/retry, approval/publish, territory/date denial, takedown and HTTP Range playback.
5. Complete signed playback grants, worker crash recovery/leases, safe transcoding/normalization, email verification and notifications, counter-notice/appeals, contributor/label accounting and royalty/payout infrastructure.
6. Complete legal review of ownership/licensing declarations, territory coverage, copyright/takedown process, privacy notices, repeat-infringer policy and operational moderation.
7. Validate staging/production deployment, persistent-volume backup/restore, load, security and monitoring.

## Important operating notes

- Apply the migration with `npm run db:migrate`; do not run the destructive `db:setup` against a database that contains work you need to preserve.
- `LOCAL_MEDIA_DIR` must be outside the public static web root and backed by persistent storage shared by API and worker processes.
- Configure `CLAMAV_HOST`, `CLAMAV_PORT`, and `FFPROBE_PATH`. Until the scanner is reachable, artist uploads cannot progress to publication.
- `ARTIST_UPLOAD_MAX_BYTES` is capped at 50 MiB; `ARTIST_STORAGE_QUOTA_BYTES` defaults to 500 MiB per rolling 30 days.
- Artist application approval changes the role to `ARTIST`; refresh the applicant's session/page to see the Artist Studio navigation.
- The roadmap registry currently records 87 planned features; this pass primarily fills a core artist-account/upload/moderation gap and does not complete all 87 features.

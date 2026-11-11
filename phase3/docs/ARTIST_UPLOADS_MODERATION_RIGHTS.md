# LOOP artist uploads, playback security, moderation and rights contract

Status: partial runtime implementation added in the LOOP high-priority work pass; not production-ready. The current code implements account applications, private local quarantine, signature/size checks, ClamAV + ffprobe gating, moderator review, separate publication, artist withdrawal and rights reports.
Target: first public release for independent artists who own or control the necessary rights.

## Current implementation boundary (November 2026)

Implemented in this codebase: `/register` and `/login` use the existing server-side session system; `/artist/apply` records applications for non-guest LISTENER accounts; `/artist/studio` submits rights declarations and uploads to a private `artist-quarantine` directory; `/admin` includes artist application, scanning, rights review, publication and report actions. Migration `0008_artist_accounts_uploads_rights.sql` is additive and gives ARTIST accounts the listener permission set plus creator permissions. Audio is signature-checked on intake, scanned by ClamAV, probed by ffprobe and held from playback until a moderator approves and explicitly publishes it.

Not implemented yet: private object-storage / CDN adapter, direct signed multipart uploads, durable worker queue and crash-safe processing leases, transcoding/normalization, short-lived signed playback grants, contributor/label splits, royalty calculation or payouts, email verification/notifications, copyright counter-notice and appeal workflows, and production deployment validation. Country-based territory and licence-date checks are enforced in the current playback-resolution and direct-media paths, but these are not a substitute for signed edge playback grants. The current filesystem storage is local `LOCAL_MEDIA_DIR`; it is **not durable on an ephemeral host**. The current code now disables local media and rejects upload intents in Vercel/serverless mode. Do not enable public artist uploads there until a private object-storage implementation and durable scanning worker exist. The in-process admin scan endpoint is intended for small bounded files; production should move scanning into a durable background worker.

### Local setup for the implemented slice

1. Apply the forward-only migration with `npm run db:migrate`.
2. Set `VITE_DEMO_MODE=false` for a backend-connected frontend.
3. Configure `LOCAL_MEDIA_DIR` to a private persistent directory writable by the API/worker; do not expose it as static web content.
4. Configure `CLAMAV_HOST`, `CLAMAV_PORT`, and install `ffprobe` (or set `FFPROBE_PATH`). Without a reachable scanner, uploads remain quarantined.
5. Register an account, submit an artist application, approve it in the admin artist panel, then upload a supported audio file from Artist Studio.
6. Use the admin panel's scan action or run `npm run artist:scan` on a worker. Approve only after rights/evidence review; publish is a second explicit action.
7. Verify backup/restore for the media directory as well as the database.

`ARTIST_UPLOAD_MAX_BYTES` is capped at 50 MiB by the application. `ARTIST_STORAGE_QUOTA_BYTES` defaults to 500 MiB per rolling 30 days. These are guardrails, not a CDN or storage plan.

## Non-negotiable release boundary

- Accept only original recordings or recordings for which the uploader has documented authority to distribute.
- A checkbox alone is not proof of ownership. Store the declaration, timestamp, user, IP/risk metadata, version of terms and supporting evidence/reference.
- Never make a track public immediately after upload. New uploads enter QUARANTINED / PENDING_REVIEW.
- Never expose an R2 bucket or object key publicly. No public bucket listing.
- Never use Spotify/YouTube metadata APIs as a source of audio or evidence of music rights.
- A takedown immediately blocks new playback authorization; purge/cache invalidation follows.
- Commercial label catalogue is disabled until the platform has executed territory- and use-specific agreements.

## Domain lifecycle

`DRAFT → UPLOADING → QUARANTINED → PROCESSING → PENDING_REVIEW → APPROVED → PUBLISHED`

Terminal or exceptional states: `REJECTED`, `TAKEDOWN_PENDING`, `TAKEN_DOWN`, `SUSPENDED`, `PROCESSING_FAILED`.

Only an authorized moderator may move a track to APPROVED. Only an artist with ownership of the track may edit its draft metadata or request withdrawal. Publication requires APPROVED status, valid rights grant, active territory window and completed media processing.

## Implemented upload protocol (local persistent-volume mode)

1. Authenticated artist requests an upload intent with metadata, declared file size/MIME, territory/date grant and separate composition/master rights declarations.
2. The API validates the artist-account link, upload limits and rolling quota, then returns a random 128-bit upload identifier and a single-use PUT endpoint.
3. The browser streams the file to a private `artist-quarantine` directory under `LOCAL_MEDIA_DIR`; the API enforces the byte count, accepted MIME/signature pair and SHA-256 checksum.
4. The upload remains unavailable to playback. ClamAV INSTREAM and ffprobe must both pass; ffprobe validates an audio-only stream and duration from 30 seconds to 30 minutes.
5. An authorized moderator reviews the rights evidence and metadata. Approval creates a hidden song. A second explicit moderator action publishes it.
6. Playback and direct media delivery check publication state, licence dates and listener country; artist-upload responses are sent with `Cache-Control: private, no-store`.
7. Artist withdrawal or a resolved copyright report hides the song and restricts the media record so future playback requests are denied.

This mode requires a private persistent mounted volume shared by the API and scanner. It is not a serverless object-storage architecture and should not be exposed on ephemeral storage.

## Target production object-storage protocol (not implemented)

1. API creates an upload intent and short-lived, single-purpose signed upload URL for a private object bucket. The browser never receives storage credentials.
2. Browser uploads directly to object storage. For large files use multipart upload with bounded part sizes and explicit abort/expiry cleanup.
3. Browser calls finalize. Server verifies object existence, actual size, checksum, content type by magic bytes, and ownership of the upload intent.
4. A durable worker performs malware scanning, media probing, safe transcoding and metadata extraction. Never run FFmpeg in a short Vercel request.
5. A moderator reviews the rights declaration, metadata, evidence and automated flags. Only then can the recording become publicly discoverable.

Reject path traversal, arbitrary URLs, client-supplied storage keys, oversized files, MIME-only validation, executable/polyglot files, duplicate finalize calls and replayed intents.

## Playback authorization and delivery

- Private objects are read only by the API/worker identity and the CDN origin identity.
- Playback authorization checks authenticated listener, track state, rights grant, territory, explicit-content policy and rate/abuse limits.
- Issue short-lived signed playback grants (target TTL 2–5 minutes) scoped to one track and one delivery origin. Do not put long-lived storage credentials or raw private object keys in client state.
- Prefer an edge authorization layer or short-lived signed CDN URL/cookie. If using R2 presigned GET URLs, keep TTL short and avoid leaking them into analytics/referrers/logs.
- Support HTTP Range (206, Content-Range, Accept-Ranges), correct Content-Type, safe Content-Disposition, and bounded range sizes. Test Safari/iOS seeking and interrupted requests.
- Do not proxy every audio byte through a Vercel Function. That adds function duration/bandwidth pressure and is not the target architecture.
- Use private origin + CDN authorization. Ensure cache keys and authorization are correct; a public cache hit must never bypass rights or account restrictions.
- On takedown, revoke grants, block new grants immediately, purge edge caches, and verify old URLs stop working within the documented maximum TTL.

## Rights ledger

Each track must have a versioned rights record containing:
- claimant/uploader identity and verification status;
- composition and sound-recording ownership/control declarations separately;
- contributors, featured performers, producers and label (where applicable);
- licence/authorization type and evidence reference;
- allowed uses (interactive streaming, preview, downloads if any);
- territories, start/end dates, exclusivity and withdrawal conditions;
- attribution requirements, royalty/share terms and currency;
- declaration version, accepted-at timestamp and immutable audit actor;
- review status, reviewer, decision reason and supporting evidence.

A track is not publishable if required fields are absent, territory/date is out of scope, a claim is disputed, or evidence is unresolved. Never infer licence coverage from ISRC, metadata provider response or platform API access.

## Moderation, reports and takedowns

- Separate moderation decisions from artist account roles. Least privilege: moderator cannot alter billing/rights contracts; admin actions are audited.
- Every decision records actor, timestamp, prior/new state, reason code, notes and evidence references.
- Provide report forms for copyright, impersonation, harmful content, explicit/mislabelled content and safety.
- A copyright notice creates a case, preserves evidence, disables affected playback when credible/required by policy, notifies uploader, records counter-notice/dispute state and supports restoration only after authorized review.
- Maintain repeat-infringer policy, appeal path, response SLAs and a designated legal/takedown contact before launch.
- No automatic AI decision should be the sole basis for permanent removal or account termination.

## Implemented API contract

All write endpoints use the existing same-origin CSRF protection and per-IP rate limits. Artist routes are `/api/artist/me`, `/api/artist/applications`, `/api/artist/uploads`, `/api/artist/uploads/:id/content` (PUT), `/api/artist/uploads/:id/withdraw`, and `/api/artist/uploads/:id/reports`. Admin routes are under `/api/admin/artist-applications`, `/api/admin/artist-uploads`, and `/api/admin/artist-rights-reports` and require `artist.review`.


| Method and route | Purpose | Required checks |
|---|---|---|
| POST /api/artist/uploads | Create upload intent | Artist role, quota, metadata and rights declaration |
| POST /api/artist/uploads/:id/finalize | Verify completed object | Intent owner, checksum, size, magic bytes |
| GET /api/artist/tracks | Artist's own tracks | Artist ownership |
| PATCH /api/artist/tracks/:id | Edit draft/rejected metadata | Owner; published metadata changes create revision |
| POST /api/artist/tracks/:id/withdraw | Request withdrawal | Owner; revoke playback grants |
| GET /api/moderation/queue | Review queue | Moderator permission |
| POST /api/moderation/tracks/:id/decision | Approve/reject/suspend | Moderator permission, reason, audit |
| POST /api/tracks/:id/reports | Report a track | Rate limit, evidence and abuse checks |
| POST /api/admin/takedowns | Record takedown case | Restricted legal/admin permission |
| POST /api/playback/:id/grant | Issue playback grant | Published, rights active, territory, content policy |

Use idempotency keys on upload creation/finalization, moderation decisions and takedown intake. Return generic not-found for resources the caller is not allowed to enumerate.

## Data model proposal

Add a new forward-only migration after confirming the actual current migration registry and grants. Candidate entities:
- artist_accounts (user-to-artist ownership/verification; many-to-many, not a boolean role flag);
- artist_uploads (opaque upload intent, object key, expected/actual bytes, checksum, expiry, state);
- track_rights_grants (versioned ownership/licence, rights scope, territory and validity);
- track_contributors (credited role and optional share);
- moderation_cases and moderation_events (case lifecycle and immutable decision history);
- content_reports and takedown_notices (complaint evidence and resolution);
- playback_grants (hashed token identifier, track, user/session, expiry, revocation);
- processing_jobs (idempotency, attempts, lease, retry-after, terminal result);
- artist_payout_ledger only after payment/royalty accounting has been designed and legally reviewed.

Do not add artist ownership directly to `artists` as a single user_id: groups, labels, managers and multiple rights holders require explicit relationships. Do not put raw signed URLs or secrets in SQL.

## Security acceptance tests

- Non-artist cannot create upload intent; artist A cannot read or finalize artist B's upload.
- Signed upload expires, is single-use, is size-limited and cannot overwrite a different key.
- Fake MIME, mismatched checksum, oversized object, malicious filename and invalid audio are rejected/quarantined.
- Unreviewed/rejected/taken-down/expired-rights track never receives playback grant.
- Guessing object keys, direct bucket URL and cross-user track IDs reveal no private media or metadata.
- Playback token expiry/revocation, Range seeking, iOS Safari, concurrent streams and abuse throttles work.
- Moderation and rights edits are audited; normal users cannot alter audit history.
- Takedown blocks new grants immediately and cache purge is verified.
- Backup/restore preserves rights and moderation evidence references.
- No test fixture or seed track is accidentally presented as a real commercial recording.

## Launch blockers beyond code

Legal review of Indian and target-territory music rights, uploader terms, privacy notice, content rules, copyright notice/counter-notice process, contact channel, moderation staffing, security review, restore drill and cost/traffic budget are mandatory. Free-tier quotas do not imply free unlimited audio delivery.

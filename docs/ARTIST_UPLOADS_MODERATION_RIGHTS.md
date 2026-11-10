# LOOP artist uploads, playback security, moderation and rights contract

Status: implementation contract; this document does not claim these runtime features are already implemented.
Target: first public release for independent artists who own or control the necessary rights.

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

## Upload protocol

1. Authenticated artist requests an upload intent with metadata and declared file size, MIME type and checksum.
2. API validates artist role, account state, per-account quota, allowed format and configured maximum size.
3. API creates a random opaque object key and a short-lived, single-purpose signed upload URL for a private bucket. The browser never receives storage credentials.
4. Browser uploads directly to object storage. For large files use multipart upload with bounded part sizes and explicit abort/expiry cleanup.
5. Browser calls finalize. Server verifies object existence, actual size, checksum, content type by magic bytes, and ownership of the upload intent.
6. Track remains quarantined. A background worker performs malware scanning, media probing, duration/codec checks, metadata extraction and safe transcoding. Never run FFmpeg in a short Vercel request.
7. A moderator reviews the rights declaration, metadata, evidence and any automated flags.
8. On approval, server records the moderation decision and creates a publishable catalogue record. Only then can a playback token be issued.

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

## Minimal API contract

All endpoints require same-origin CSRF protection for cookie-authenticated writes and per-user/IP rate limits.

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

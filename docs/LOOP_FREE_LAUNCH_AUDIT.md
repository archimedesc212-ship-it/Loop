# LOOP free-tier launch audit and implementation plan

**Audit date:** 2026-11-09  
**Audited branch:** `main`  
**Plan branch:** `loop/free-tier-launch-plan`

## Executive finding

The repository named `Loop` currently contains **MUSE**, a BTech music-mood recommendation/database project. It is not yet a Spotify-style commercial music streaming platform.

Evidence from the current default branch:
- Root `package.json` identifies the package as `muse` and describes a Music Mood Intelligence & Recommendation Database System.
- `README.md` describes 64 normalized tables and a fictional CC0 catalogue; it explicitly says no copyrighted audio, lyrics or artwork are bundled.
- The frontend is React 18 + Vite 7.
- The API is Express 4 / Node.js and uses MySQL 8 through `mysql2`.
- Existing authentication uses server-side sessions, httpOnly SameSite=Strict cookies and CSRF checks.
- Playback currently supports licensed local files, a labelled browser-generated demo sketch, and a vendor-neutral licensed-preview adapter. Full commercial-track streaming is explicitly not implemented.
- Existing `vercel.ts` proxies API requests to Render via `LOOP_API_ORIGIN`; `render.yaml` provisions a persistent API service. The in-process scheduler starts from `backend/src/server.js`.

**Do not present the current repository as a released Spotify competitor.** First decide whether this repo is being converted from the MUSE academic project into the LOOP product, or whether the MUSE project must be preserved separately.

## Spotify API key: what it can and cannot do

A Spotify Client ID / Client Secret can support approved Spotify Web API use cases such as metadata lookup, playlist management and user-authorized playback control within Spotify's rules. It does **not** grant LOOP rights to host, download, re-stream or redistribute Spotify recordings.

Important current restrictions to design around:
- Spotify's Developer Policy says sound-recording streaming through the Spotify Platform is limited to Spotify Premium subscribers and commercial use of streaming apps is not permitted without the applicable approval.
- Spotify's Web Playback SDK documentation says it must not be used in commercial projects without Spotify's prior written approval.
- Spotify Development Mode currently limits an app to five authenticated users and requires the app owner to have Spotify Premium; users must be allowlisted.
- Spotify prohibits apps that replicate or replace Spotify's core experience without prior written permission.

Official references:
- https://developer.spotify.com/policy
- https://developer.spotify.com/terms
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-playback-sdk
- https://developer.spotify.com/compliance-tips

**Recommended LOOP use of Spotify API:** optional “Connect Spotify” / import or link-out integration only after a policy review. Do not use it as LOOP's music source or build LOOP playback around Spotify's Web Playback SDK.

## Product scope for a lawful first release

### MVP — independent artist streaming

1. Listener accounts, sign-in, profile and session management.
2. Artist accounts and verified artist profiles.
3. Upload audio files and cover artwork with file type, size and duration validation.
4. Artist rights declaration and acceptance of upload terms.
5. Track metadata: title, artist, album, genre, language, explicit flag, ISRC (optional), release date.
6. Review/moderation queue, copyright complaint and takedown workflow.
7. Track processing: metadata extraction, duration, waveform/preview generation and optional transcoding in a background worker (not inside a short-lived request).
8. Private object storage and short-lived playback authorization.
9. Audio streaming with HTTP Range support; add HLS/adaptive bitrate only when justified.
10. Search, browse, artist pages, likes, playlists, listening history and queue.
11. Play-event accounting with duplicate/replay abuse controls.
12. Admin tools, audit log, backups, health checks and privacy/terms pages.

### Later — commercial catalogue

Commercial music requires direct agreements / appropriate licences from the relevant sound-recording owners and musical-work rights holders for the territories and use cases in question. A Spotify API key, YouTube link, MusicBrainz record or PPL venue licence is not a substitute for those rights. Have Indian music counsel review the proposed model before enabling commercial catalogue streaming.

## Suggested zero-cost / free-tier architecture

| Layer | Initial option | Notes |
|---|---|---|
| Frontend | Vercel Hobby | Free-tier deployment; observe current project and function limits. |
| API | Vercel Node.js Functions | Refactor Express routes into serverless-compatible handlers. No persistent in-process scheduler. |
| Database | Keep MySQL 8 schema initially | Choose a MySQL-compatible provider with a free tier; verify storage, sleep/expiry, backups, connection limits and region before selecting it. Do not switch to PostgreSQL without a migration plan. |
| Audio and artwork | Cloudflare R2 | S3-compatible object storage with a free allowance; storage and request limits apply. Keep objects private and authorize playback. |
| CDN / delivery | R2 custom domain / Cloudflare | Bandwidth and request limits still apply; test range requests and cache policy. |
| Scheduled work | Vercel Cron or an external free scheduler | Invoke short, idempotent tasks only. Do not duplicate scheduler runs. |
| CI | GitHub Actions | Build, lint, unit tests, migration checks and dependency audit. |
| Spotify integration | Optional Web API | Metadata / user-authorized Spotify functions only, subject to current policy and quotas. |

This is a **free-tier prototype target, not a promise of unlimited free production streaming**. Audio delivery is bandwidth-heavy; a successful public launch may incur storage, request, database or compute costs.

## Existing code that must be addressed before Vercel-only deployment

1. `vercel.ts` currently requires `LOOP_API_ORIGIN` and rewrites `/api/*` to a Render API. It is not a standalone Vercel backend.
2. `backend/src/server.js` starts an Express listener and an in-process scheduler. This cannot be deployed unchanged as a normal Vercel Function.
3. `JOBS_ENABLED` controls scheduled maintenance, cleanup, trend snapshots and weekly intelligence. Refactor each job into an idempotent callable task and invoke it through a protected Cron endpoint or a separate worker.
4. Database connection handling must be made serverless-safe: bounded pools, connection reuse, timeouts, and no connection storm on cold starts.
5. Replace local filesystem audio storage for production with private object storage; never commit audio files or upload them into Git.
6. Keep authentication protections: httpOnly cookies, SameSite policy, CSRF, origin validation, secure secrets, rate limiting and isolated Preview data.
7. Add signed, short-lived playback authorization and verify that private audio cannot be fetched by guessing object keys.
8. Add upload quotas, MIME/content validation, malware scanning strategy, size limits and abuse controls.
9. Add rights records, territory/availability windows, artist declarations, takedowns and a repeat-infringer process before user uploads go public.
10. Add observability for upload failures, playback failures, 4xx/5xx, job retries, storage usage and provider rate limits.

## Environment variables to plan for

Never commit actual values. Configure secrets in Vercel Project Settings and the storage provider dashboard.

### Existing application settings to preserve / map

- `NODE_ENV`
- `SESSION_SECRET`
- `DB_HOST`, `DB_PORT`, `DB_NAME`
- `DB_APP_USER`, `DB_APP_PASSWORD`
- `DB_TIMEZONE`
- `COOKIE_SECURE`
- `TRUST_PROXY`
- `CORS_ORIGIN` (only if cross-origin access remains necessary)
- Existing provider keys only when their provider is enabled.

### New integration settings (names are proposed; add only with implementation)

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET` (server-side only; never expose with a VITE_ prefix)
- `SPOTIFY_REDIRECT_URI`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_ORIGIN` (only if a public asset origin is deliberately used; audio should remain private by default)
- `UPLOAD_MAX_BYTES`
- `PLAYBACK_TOKEN_SECRET` (or derive a separate key securely from a managed secret)
- `CRON_SECRET`

Use separate Production and Preview credentials/buckets/databases. Do not put secrets in source control, build logs, browser bundles, screenshots or issue comments. Rotate any credential that has ever been committed.

## Phased delivery and acceptance gates

### Phase 0 — product and rights boundary
- Confirm whether MUSE is being converted into LOOP or retained as a separate academic project.
- Define launch territories, age/content rules, upload terms, privacy policy and takedown contact.
- Start with artist-owned / properly authorized recordings only.

**Gate:** written scope and rights checklist approved.

### Phase 1 — Vercel-only foundation
- Build the frontend on Vercel.
- Refactor API routes to Vercel Functions without changing auth semantics.
- Move scheduler tasks to protected, idempotent scheduled invocations.
- Provision and test a MySQL-compatible database.
- Add CI and Preview isolation.

**Gate:** signup/login/session/CSRF, DB readiness, migration and rollback/restore tests pass on Preview.

### Phase 2 — independent artist MVP
- Private R2 uploads, metadata, artist studio, moderation, playback tokens, range streaming, catalogue/search/playlists.
- Rights declaration, report/takedown and audit workflow.
- Test large uploads, interrupted uploads, unauthorized playback and quota enforcement.

**Gate:** only approved tracks can be played; no private object is publicly enumerable.

### Phase 3 — reliability and launch
- Load tests, backup restore rehearsal, abuse/rate-limit tests, accessibility and mobile checks.
- Verify actual free-tier limits and configure billing alerts / hard quotas where available.
- Add terms, privacy, copyright contact and support process.

**Gate:** production checklist signed off; no unresolved critical security or rights issue.

### Phase 4 — licensed commercial catalogue
- Negotiate direct agreements and document rights by recording, composition, territory, term and permitted usage.
- Implement reporting, royalty accounting and takedown/expiry automation only after contracts define the rules.

**Gate:** legal and commercial approval for each catalogue/territory.

## Explicit non-goals

- Do not scrape Spotify, YouTube, or other streaming services.
- Do not download or proxy Spotify audio.
- Do not use Spotify API metadata as a substitute for music rights.
- Do not add commercial copyrighted tracks without the required permissions.
- Do not store secrets or audio binaries in Git.
- Do not run FFmpeg/transcoding or long-lived schedulers inside request-limited Vercel Functions.
- Do not run destructive `db:setup` against an existing production database.

## Current status

This document is an audit and implementation plan only. It intentionally does not rename MUSE, remove Render files, alter database schema, or claim the product is deployed. Those changes require the product-conversion decision and a code-level implementation with tests.

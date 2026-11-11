# Security, privacy and content rights

This page describes the controls that are implemented and tested. It does not
claim the system is "secure": known gaps and residual risks are listed at the end.

## Authentication and sessions

| Control | Implementation |
|---|---|
| Password storage | bcrypt, cost 10 (`users.password_hash`); plain passwords are never stored or logged |
| Password policy | 8–72 characters, at least one letter and one digit (72 = bcrypt's input limit); a new password must differ from the current one |
| Sessions | server-side rows in `auth_sessions` (migration 0001). The client holds a random 32-byte token; the database stores only its SHA-256 hash, so a database leak does not leak usable sessions. Lifetime `SESSION_TTL_HOURS` (default 12 h); `last_seen_at` is updated at most every 5 minutes |
| Browser token storage | httpOnly, `SameSite=Strict`, `Path=/` cookie `muse_session` (`Secure` when `NODE_ENV=production` or `COOKIE_SECURE=true`). Page scripts cannot read it; nothing is kept in `localStorage` (the old JWT key is removed on load) |
| CSRF | double submit: the readable `muse_csrf` cookie holds `HMAC-SHA256(SESSION_SECRET, session id)`; every cookie-authenticated POST/PUT/PATCH/DELETE must send it as `X-CSRF-Token`, compared in constant time. Plus `SameSite=Strict` and an `Origin` check on all unsafe requests (sign-in included, against login CSRF) |
| Bearer mode | API clients send `X-Auth-Mode: bearer` at sign-in and get the token in the body instead of a cookie; browsers never attach an `Authorization` header by themselves, so bearer requests need no CSRF token |
| Revocation | logout (this session), sign out everywhere, revoke one device, password change (all *other* sessions), admin deactivation (all sessions), account deletion (rows cascade). Every request re-reads the session, user, role, permissions and active flag, so revocation is effective on the next request (tested) |
| Expired / revoked / inactive | 401 `TOKEN_INVALID` with a matching message; cookies are cleared. Ended sessions older than 30 days are purged hourly |
| Account lockout | 5 consecutive wrong passwords → locked 15 minutes (`failed_login_count`, `locked_until`); the right password is refused while locked |
| No account enumeration | unknown user and wrong password return the same 401 message; for unknown users a dummy bcrypt comparison keeps response time similar |
| Rate limiting | 20 *failed* sign-in/registration attempts per 15 min per IP (`RATE_LIMIT_AUTH_FAILURES`); 240 writes per minute per IP (`RATE_LIMIT_WRITES_PER_MIN`). Client IPs honour `X-Forwarded-For` only for `TRUST_PROXY` proxies, so the header cannot be spoofed to dodge limits |
| Account management | sessions list, change password, sign out everywhere, delete account (password + typed confirmation); password changes and deletions are written to `audit_logs` |
| Secrets | `SESSION_SECRET` (≥ 32 characters enforced in production) keys CSRF tokens and IP hashes; IP addresses are stored only as keyed hashes |

## Authorisation (RBAC)

Roles and permissions are data (`roles`, `permissions`, `role_permissions`), so the
matrix can be inspected with SQL (query Q35):

| Permission | Listener | Curator | Admin |
|---|:-:|:-:|:-:|
| own listening, playlists, insights | ✓ | ✓ | ✓ |
| `health.view`, `pipeline.view` | | ✓ | ✓ |
| `catalog.write`, `catalog.merge`, `review.decide` | | ✓ | ✓ |
| `pipeline.run`, `models.tune`, `users.manage`, `audit.view` | | | ✓ |

- Routes declare the permission they need (`requirePermission('catalog.write')`).
- Per-user resources (playlists, plays, recommendation lists) check ownership and answer **404** for someone else's, so their existence is not revealed.
- `/users/:id/...` is allowed for the user themself or for `users.manage`.
- Admins cannot demote or deactivate themselves (`SELF_LOCKOUT`), and the last active admin cannot be removed (`LAST_ADMIN`, checked under row locks).

## Database security

| Control | Implementation |
|---|---|
| Least privilege | The API connects as `muse_app`: `SELECT/INSERT/UPDATE/DELETE` on data tables, `SELECT` on views, `EXECUTE` on routines. **No** CREATE, ALTER, DROP, GRANT. `roles`, `permissions`, `role_permissions`, `reason_types` are read-only. |
| Append-only audit | `muse_app` has only `SELECT, INSERT` on `audit_logs`; a test proves `UPDATE`/`DELETE` fail with error 1142 |
| Owner separated | `muse_owner` (from `.env`, used only by `npm run db:setup`) owns the schema; procedures, views and triggers run with definer rights |
| SQL injection | every query uses `?` placeholders (`mysql2` prepared parameters); dynamic identifiers come only from fixed allow-lists (e.g. admin song fields map to known column names); `setup-db` validates database and user names against `^[A-Za-z0-9_]+$` |
| Input validation | declarative schema per route (types, ranges, lengths, patterns, enums); then CHECK constraints, FKs and triggers in the database as the last line |
| Error hygiene | MySQL errors are mapped to stable codes and human messages; SQL text, stack traces and credentials never reach the client |
| Secrets | only in `.env` (git-ignored); `.env.example` contains placeholders only. Provider keys are read on the server and never sent to the browser; `/api/ready`, `/admin/providers` and logs show configuration *state* only. Provider error messages strip query strings (where API keys live) |
| Migrations | schema changes run as the owner account; each applied file is checksummed in `schema_migrations` and an edited file is refused |

## Audit trail

`audit_logs(actor_user_id, action, entity_type, entity_id, old_values, new_values, created_at)`.

- Triggers write it for song updates and deletes, user role/active changes, model parameter changes, review decisions and source changes. The actor comes from `@muse_actor_id`, which the API sets inside the admin transaction (`withTransaction(…, { actorId })`) and clears afterwards.
- Songs merged by `sp_merge_songs` are logged by the song trigger as `SONG_MERGED`. Services add explicit entries for actions with no single-row update to hook: song, artist, album and mood created, artist updated, mood curated or cleared, keyword added, model activated.
- Admin › Audit shows it; the app account cannot alter it.

## HTTP hardening

`helmet` sets `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: [EXTERNAL_PREVIEW_MEDIA_ORIGIN]; frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'self'` (inline styles are allowed for React style props; no inline or third-party scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security` (effective over HTTPS), and removes `X-Powered-By`. API responses are `Cache-Control: no-store`. CORS allows only the origins in `CORS_ORIGIN` (with credentials); same-origin use needs none. JSON bodies are limited to 100 kB; invalid JSON → 400.

## Media and providers

- Local audio files are served only through `GET /api/media/:id` to signed-in users, only for files registered by a curator, with a strict file-name pattern (no paths, audio extensions only) and a resolved-path check; a missing file is reported, never guessed.
- Preview URLs from the external provider must be `https://`; anything else is refused and the song falls back.
- External requests have timeouts, bounded retries and a per-provider request interval; failures become stable error codes. No automated test makes a real external request (a local mock server is used).
- The optional AI fallback receives only the sentence the listener typed, never in a private session, and its answer is restricted to moods and contexts that already exist.

## Privacy

- **Private sessions**: the permanent profile is read-only while one is active; enforcement is in the API *and* in the database (`trg_lh_bi`), and a test compares 14 permanent tables byte for byte before and after a busy private session. Temporary memory is deleted when the session ends or expires.
- **Search history** is not logged in private sessions.
- **Region is a signal, not a stereotype**: it contributes at most the regional weight (0.07) and a 0.25 bonus inside that signal for artists from the same region; it never filters what a listener can see. Languages are what the listener chose, not inferred from region.
- **Moods describe music**: the UI says "the moods of the music you play", and Mood Recovery is presented as a musical arc, never as an assessment of the listener.
- **Data minimisation**: the schema stores a username, email, display name and a state-level region code the user chose — no phone number, address, birth date or precise location.

## Content rights

- The catalogue is fictional and project-authored (CC0): titles, artists, albums and audio-feature values were generated for this project. **No copyrighted audio, lyrics or artwork is stored or distributed.**
- Playback only uses `song_media` rows whose source is enabled, whose rights are not `RESTRICTED` and that are not marked `UNAVAILABLE`. Order: a licensed local file (`USER_LOCAL`), a licensed preview resolved by ISRC at play time (`EXTERNAL_PREVIEW`, off by default), then the **demo fixture** `MUSE_SKETCH`: a short sound synthesised in the browser from the song's stored features. The sketch is labelled "Demo sketch (not the recording)" in the player and on the song page.
- Songs with no permitted source are **metadata only**: shown with a label, never played, never recommended. Six seed songs are metadata-only on purpose.
- External sources are rows in `music_sources` with a declared licence and rights scope. MusicBrainz is metadata-only (CC0 core data); TMDB provides film details with its required attribution and no images are stored; the YouTube Data API provides links only — MUSE never downloads or extracts audio or video. A metadata licence is never treated as permission to stream audio or show artwork. No stream is scraped and no DRM is bypassed.
- Cover art is generated from two stored colours per album; no posters, logos or third-party brand assets are used.

## Known gaps and residual risks

- No multi-factor authentication, email verification or password-reset email (there is no mail service).
- Rate limits are per process and in memory; several API instances behind a load balancer would each keep their own counters (a shared store such as Redis would be needed).
- `style-src 'unsafe-inline'` is allowed because React style props are used throughout.
- Lockout by account can be used to lock someone out for 15 minutes by guessing wrong on purpose (a common trade-off; the IP rate limit reduces it).
- The local media folder relies on the operator to hold the rights to every file.
- Dependency audit (`npm audit`) reports 0 known vulnerabilities at the time of writing; this changes over time and should be re-run.
- No penetration test or external security review has been carried out.

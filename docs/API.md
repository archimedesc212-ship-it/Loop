# REST API

Base URL `/api`. JSON in, JSON out. Every route except register, login,
`/auth/session`, `/health` and `/ready` needs a signed-in session. The declared
validation schema of each route is in `backend/src/routes/index.js`, next to the
route; unknown fields are ignored.

## Authentication

Sessions are **server-side** (`auth_sessions`, default lifetime `SESSION_TTL_HOURS`
= 12 h). A session can be presented in two ways:

| Client | How it signs in | How it authenticates | CSRF |
|---|---|---|---|
| Browser (the web app) | `POST /auth/login` → `Set-Cookie: muse_session` (httpOnly, SameSite=Strict, Secure in production) and `muse_csrf` (readable) | the cookie, sent automatically | every POST/PUT/PATCH/DELETE must send `X-CSRF-Token: <value of muse_csrf>`; otherwise 403 `CSRF_FAILED` |
| API client / tests | `POST /auth/login` with header `X-Auth-Mode: bearer` → token in the response body (no cookie) | `Authorization: Bearer <token>` | not needed (browsers never send this header on their own) |

The token is random (32 bytes); only its SHA-256 hash is stored. Logout, "sign out
everywhere", a password change, admin deactivation and account deletion revoke
sessions immediately. Requests with an `Origin` header from another site are refused
(403 `ORIGIN_REJECTED`) unless the origin is listed in `CORS_ORIGIN`.

## Conventions

**Errors** always have the same shape and never contain SQL, stack traces or secrets:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "email must be a valid email address", "details": { "email": "email must be a valid email address" } } }
```

| Status | Typical codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_MOOD`, `INVALID_CONTEXT`, `CONSTRAINT_VIOLATION`, `INVALID_REFERENCE`, `ACTION_NOT_ALLOWED` |
| 401 | `UNAUTHORIZED`, `TOKEN_INVALID` (expired / revoked / inactive, with a matching message), `INVALID_LOGIN` |
| 403 | `FORBIDDEN`, `CONTENT_FILTERED`, `CSRF_FAILED`, `ORIGIN_REJECTED` |
| 404 | `NOT_FOUND` (also for another user's private resources, so their existence is not revealed) |
| 409 | `USERNAME_TAKEN`, `EMAIL_TAKEN`, `DUPLICATE_RATING`, `DUPLICATE_PLAYLIST_SONG`, `DUPLICATE_PLAYLIST`, `DUPLICATE_SONG`, `INCOGNITO_ACTIVE`, `NOT_PRIVATE`, `PLAY_FINISHED`, `NOT_PLAYABLE`, `NO_PLAYBACK_SOURCE` (metadata-only song), `ALREADY_DECIDED`, `SELF_LOCKOUT`, `LAST_ADMIN`, `IN_USE`, `PROVIDER_NOT_CONFIGURED`, `ALREADY_LINKED` |
| 422 | `MOOD_NOT_UNDERSTOOD` (with `details.suggestions`) |
| 429 | `RATE_LIMITED`, `ACCOUNT_LOCKED`, `PROVIDER_RATE_LIMITED` |
| 502 / 504 | `PROVIDER_UNREACHABLE`, `PROVIDER_CREDENTIALS_REJECTED`, `PROVIDER_ERROR`, `PROVIDER_BAD_RESPONSE` / `PROVIDER_TIMEOUT` (admin provider actions only) |
| 503 | `DATABASE_UNAVAILABLE`, `DEADLOCK`, `LOCK_TIMEOUT` (safe to retry), `WORLD_REFRESH_FAILED` (the current world was kept) |

**Rate limits** (configurable, see [ENVIRONMENT.md](ENVIRONMENT.md)): 20 *failed* sign-in or registration attempts per 15 min per IP; 240 writes per minute per IP; 5 wrong passwords lock an account for 15 minutes.

**Permissions** (admin routes): `catalog.write`, `catalog.merge`, `review.decide`, `pipeline.view`, `pipeline.run`, `health.view`, `models.tune`, `users.manage`, `audit.view`. Curators hold the first five plus `health.view`; admins hold all. They are re-read from the database on every request.

## Auth and account

| Method | Path | Body / query | Notes |
|---|---|---|---|
| POST | `/auth/register` | `username` (3–30, `a-z0-9_`), `email`, `password` (8–72, letter + digit), `displayName` | 201, signs in (cookie or bearer, see above); bcrypt cost 10 |
| POST | `/auth/login` | `login` (username or email), `password` | generic 401 for unknown user or wrong password; body `{ user, expiresAt, csrfToken }` (+ `token` in bearer mode) |
| GET | `/auth/session` | | **no auth required**: read-only startup check; returns `{ authenticated: false }` or `{ authenticated: true, …profile }` |
| POST | `/auth/session` | `{}` | **no auth required**: creates a limited guest account/session (201) when anonymous; returns the current profile if already signed in; rate-limited |
| GET | `/auth/me` | | profile, role, permissions, languages, private-session state, `session { id, expiresAt, csrfToken? }` |
| POST | `/auth/logout` | | revokes this session, clears cookies, closes the open listening session |
| POST | `/auth/logout-all` | | revokes every session of this user |
| GET | `/me/sessions` | | live sessions `{ id, createdAt, lastSeenAt, expiresAt, userAgent, current }` (never a token) |
| DELETE | `/me/sessions/:sessionId` | | revoke one of your sessions (someone else's → 404) |
| POST | `/me/password` | `currentPassword`, `newPassword` | revokes all *other* sessions; audited; 400 `WRONG_PASSWORD` |
| DELETE | `/me` | `password`, `confirm: "DELETE"` | deletes the account and its data; audited; the last admin gets 409 `LAST_ADMIN` |
| GET | `/me/onboarding` | | languages, regions, genres, artists, **composers** (with film credits), moods, contexts, and `current` (saved answers, for "Redo onboarding") |
| POST | `/me/onboarding` | `languageIds` (1–5), `regionCode?`, `genreIds?` (≤6), `artistIds?` (≤8), `composerIds?` (≤4), `moodIds?` (≤5), `contextCodes?`, `listeningHabit?`, `contentFilter?` | writes onboarding weights in one transaction |
| PATCH | `/me/settings` | `displayName?`, `regionCode?`, `languageIds?`, `contentFilter?` (`OFF` / `NO_EXPLICIT` / `FAMILY`), `listeningHabit?` | |

## Catalogue and search

| Method | Path | Notes |
|---|---|---|
| GET | `/songs?genreId&moodId&languageId&page&pageSize&sort=popular\|newest\|title` | respects the content filter |
| GET | `/songs/:id` | song card fields, moods with confidence, mood segments, analysis versions, provenance, credits, genres, merged duplicates, stats, `videoLinks` (YouTube metadata, if imported) |
| GET | `/artists/:id`, `/albums/:id` | albums include `filmId` |
| GET | `/films/:id` | film, soundtrack albums, songs, composers, `external` (TMDB overview + attribution, if imported) |
| GET | `/languages/:id` | language, regions where it is the primary language, artists, films, popular songs, total |
| GET | `/genres`, `/moods`, `/moods/:id/songs`, `/contexts`, `/languages`, `/regions` | |
| GET | `/search?q=` (1–80 chars; 2+ to search) | FULLTEXT ngram titles + aliases + albums + moods + genres + languages; logged to `search_history` except in private sessions |
| GET | `/trending?window=24H\|7D\|30D&entity=SONG\|ARTIST\|GENRE\|MOOD\|LANGUAGE&region&limit` | latest snapshot |

Every song object carries `playback: { playable, type, source, demo }`.
`playable: false` means **metadata only**: no permitted audio source exists, and
`POST /playback/start` answers 409 `NO_PLAYBACK_SOURCE`.

## Recommendations

All return `{ batchId, strategy, title, subtitle, songs[], interpretation?, incognito }`; each song has `score`, `breakdown.signals[8]` and `reasons[]`. Only playable songs are recommended, and songs the listener marked "Not for me" are left out. `interpretation.parse.source` is `LOCAL` or `AI` (the optional AI fallback, used only when the local parser understood nothing and never in a private session).

| Method | Path | Body / query |
|---|---|---|
| POST | `/recommendations/mood` | `moodIds?` (≤4) and/or `text?` (2–280), `contextCode?`, `limit?` (≤50) |
| POST | `/recommendations/parse` | `text` → how the sentence was read (no list generated) |
| GET | `/recommendations/context/:code` | `FOCUS`, `STUDY`, `WORK`, `WORKOUT`, `TRAVEL`, `RELAX`, `MORNING`, `EVENING`, `NIGHT`, `PARTY` |
| GET | `/recommendations/daily` | |
| GET | `/recommendations/similar?seed` | default seed: latest like or 4–5★ |
| GET | `/recommendations/regional?languageId` | |
| GET | `/recommendations/discovery` | never-played songs only |
| GET | `/recommendations/recovery` | three stages |
| GET | `/recommendations/batches/:id` | a stored list (owner only) |
| POST | `/recommendations/batches/:id/rebuild` | rebuild an owned mix with its stored mood/audio targets and the active model; rejected in private sessions |
| GET | `/recommendations/:userId` | your own, or anyone's with `users.manage` |

## Playback, history, feedback

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/playback/start` | `songId`, `origin?`, `batchId?`, `contextCode?` | 201 `{ playId, sessionId, isReplay, media }`; in a private session `{ private: true, playId: null }`. `media = { type, source, label, demo, uri, attribution }`: `uri` is `/api/media/:id` (licensed local file) or an https preview URL from the configured provider, and `null` for the demo sketch |
| GET | `/media/:id` | | streams a registered local audio file (HTTP range requests); signed-in users only; content filter applies; missing file → 404 `MEDIA_UNAVAILABLE` |
| POST | `/playback/:playId/events` | `type` PAUSE / RESUME / SEEK, `positionSec`, `seekToSec?` | |
| POST | `/playback/:playId/finish` | `listenedSec`, `positionSec?` | returns completed / skipped / completionPct / what was learned |
| POST | `/playback/private` | `songId`, `listenedSec` | private-session play (temporary memory only) |
| GET / POST | `/history` | POST: `songId`, `listenedSec`, `origin?` | POST records a whole play in one call |
| POST | `/ratings` | `songId`, `rating` 1–5 | create only: second time → 409 `DUPLICATE_RATING` |
| PUT / DELETE | `/songs/:id/rating` | `rating` 1–5 | set or change / remove |
| PUT | `/songs/:id/like` | `liked` true/false | idempotent |
| GET | `/likes` | | |
| PUT / DELETE | `/songs/:id/dismiss` | PUT: `batchId?` | "Not for me" / undo; paused in private sessions |
| GET | `/me/dismissals` | | hidden songs, newest first |

## Mood-wise percentage ratings

How well a song fits each mood, 0–100 with at most two decimals, as judged by the **signed-in user** (the user always
comes from the session; a `userId` in the body is ignored). Stored in `song_mood_ratings` (migration 0004), separate from
the AI's `song_moods.confidence`. Writes are paused in a private session (409 `INCOGNITO_ACTIVE`). Design and formulas:
[MOOD_RATINGS.md](MOOD_RATINGS.md).

| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/songs/:id/mood-ratings` | | every mood in the database with `aiConfidence` (0–1 or null), `community` `{ average, count, min, max, lastRatedAt }` or null, `mine` `{ matchPercentage, reviewText, updatedAt }` or null; `totals { ratings, raters }`; `privateSession` |
| POST | `/songs/:id/mood-ratings` | `moodId`, `matchPercentage` 0–100, `reviewText?` (≤ 280) | create only → 201; a second rating for the same song and mood → 409 `DUPLICATE_MOOD_RATING` |
| PUT | `/songs/:id/mood-ratings/:moodId` | `matchPercentage`, `reviewText?` | create (201) or replace (200); returns `saved[0].created`, `previous`, refreshed `community` |
| PUT | `/songs/:id/mood-ratings` | `ratings: [{ moodId, matchPercentage, reviewText? }]` (1–50) | several moods in **one transaction** (all or none); each mood at most once per request |
| DELETE | `/songs/:id/mood-ratings/:moodId` | | removes your own rating; 404 if you have none |
| GET | `/me/mood-ratings` | `songId?`, `page`, `pageSize` (≤ 100) | your own ratings, newest first |
| GET | `/moods/:id/top-rated` | `limit` (1–50, default 20), `page`, `minRatings` (default 1), `rank` `average` \| `adjusted`, `prior` (0–100, default 5), `includeUnrated` | songs ranked by users' ratings for one mood. Each song has `moodRating { average, count, min, max, adjustedScore, aiConfidence }`. Ties: rating count desc, then song id. Also `total`, `belowMinimumCount`, `unratedCount`, `prior { weight, mean }` (adjusted only) and, with `includeUnrated=true`, `unrated` (no ratings; ordered by AI prediction, `average: null`) |

Errors: invalid percentage / too many decimals / duplicate mood in a batch → 400 `VALIDATION_ERROR`; unknown song or mood → 404;
not signed in → 401. The database also enforces the range (`CHECK`), the references (foreign keys) and one rating per user,
song and mood (primary key).

## Playlists

| Method | Path | Body |
|---|---|---|
| GET / POST | `/playlists` | POST: `name` (1–80), `description?`, `songIds?` (≤200; created atomically) |
| POST | `/playlists/from-batch` | `batchId`, `name`, `description?`, `smartType?` — saves a generated list in rank order |
| GET | `/playlists/smart` | the 8 smart types |
| GET / POST | `/playlists/smart/:type` | `ENERGY_BOOST`, `CALM_MIX`, `LATE_NIGHT`, `STUDY`, `ROAD_TRIP`, `MOST_REPLAYED`, `DISCOVERY`, `REGIONAL` |
| GET / PATCH / DELETE | `/playlists/:id` | PATCH: `name?`, `description?` |
| POST | `/playlists/:id/songs` | `songId` (duplicate → 409) |
| DELETE | `/playlists/:id/songs/:songId` | |

## Insights, private session, worlds

| Method | Path | Notes |
|---|---|---|
| GET | `/insights/profile?days` | headline numbers, streaks, most replayed / skipped, trends |
| GET | `/insights/activity` | daily minutes + moving average, genres, languages, contexts, heatmap |
| GET | `/insights/journey?period=daily\|weekly\|monthly` | mood share, transitions, week-over-week, session arcs |
| GET | `/insights/preferences` | learned model: genres, artists, moods with short/long/onboarding parts |
| GET | `/users/:id/analytics`, `/users/:id/preferences` | self, or `users.manage` |
| GET / POST / DELETE | `/incognito` | status / start (`moodId?`) / end and purge |
| PUT | `/incognito/mood` | `moodId` |
| GET | `/worlds/current` | this week's world (created on first visit, never during a private session) |
| POST | `/worlds/current/regenerate`, `/worlds/current/rollback` | new version / previous version; a failed regenerate is 503 `WORLD_REFRESH_FAILED` and the current version stays active |
| PUT / DELETE | `/worlds/:id/feedback` | PUT `feedback`: `LOVE` / `NOT_FOR_ME`; owner only; shapes the archetype choice of later worlds |

## Admin (`/admin/...`)

| Method | Path | Permission |
|---|---|---|
| GET | `/overview`, `/stats`, `/models`, `/health`, `/performance` | `health.view` |
| GET | `/references`, `/songs`, `/songs/:id`, `/artists` | `catalog.write` |
| POST / PATCH / DELETE | `/songs`, `/songs/:id` (delete hides songs that have history or provenance) | `catalog.write` |
| PUT / DELETE | `/songs/:id/moods/:moodId` — body `action` ADD / REMOVE, `confidence?`, `note?` | `catalog.write` |
| POST | `/songs/merge` — `duplicateSongId`, `canonicalSongId` | `catalog.merge` |
| POST / PATCH | `/artists`, `/artists/:id`, `/albums`, `/moods`, `/mood-keywords` | `catalog.write` |
| GET / PATCH | `/users`, `/users/:id` — `role?`, `isActive?` | `users.manage` |
| PATCH | `/models/:id/params/:code` — `value` (bounded) | `models.tune` |
| POST | `/models/:id/activate` | `models.tune` |
| GET | `/audit?entityType&limit` | `audit.view` |
| GET | `/reviews?status&limit`, `/sources`, `/jobs`, `/jobs/:id`, `/feeds` | `pipeline.view` |
| POST | `/reviews/:id/decision` — `action` APPROVE / MERGE / REJECT / IGNORE / REPROCESS, `note?`, `patch?` | `review.decide` |
| PATCH | `/sources/:code` — `enabled?`, `priority?` | `pipeline.run` |
| POST | `/pipeline/ingest` (`sourceCode?`, `file?`, `force?`), `/pipeline/weekly` (`force?`), `/pipeline/trends` | `pipeline.run` |
| GET | `/providers` — configuration state of every provider (never secret values) | `pipeline.view` |
| POST | `/providers/:code/test` — one small real request (only when pressed) | `pipeline.run` |
| GET | `/films`; POST `/films/:id/enrich` — `tmdbId?` (TMDB lookup; stores only a confident match or the chosen id) | `catalog.write` |
| POST | `/songs/:id/video-links` — YouTube Data API search; stores up to 3 links | `catalog.write` |
| GET | `/media`; POST `/media/check`; POST `/songs/:id/media` — `fileName`, `rights?`, `attribution?` | `catalog.write` |

Allowed review actions per type: possible duplicate — all five; suspicious metadata — APPROVE, REJECT, IGNORE, REPROCESS; failed ingestion — REJECT, IGNORE, REPROCESS; source conflict — APPROVE, MERGE, REJECT, IGNORE.

## Private Mood Diary

- `GET /api/me/mood-diary?days=90&asOfDate=YYYY-MM-DD` — signed-in owner’s private check-ins for a 1–365 day window. `asOfDate` is optional and lets the browser use its local calendar day.
- `PUT /api/me/mood-diary/today` — upsert one check-in for the supplied browser-local date: `{ checkinDate, moodId?, note? }`. A mood, a note, or both are required; notes are limited to 500 characters. Check-in dates are restricted to the current local day (with a one-day UTC boundary allowance).
- `DELETE /api/me/mood-diary/:entryId` — permanently delete one of the caller’s own entries; entries belonging to another account are indistinguishable from missing entries (404).

Mood Diary entries are private by default, cascade-delete with their account, and are included in password-confirmed personal-data export. They are not shared with other listeners, used for recommendation ranking, or used for model training. Migration `0009_private_mood_diary.sql` creates the additive storage table.

## Health and readiness

- `GET /api/health` (no auth) — **liveness**: `{ status: "ok" }`; does not touch the database.
- `GET /api/ready` (no auth) — **readiness**: 200 `{ status: "ready", database: "up", schema: { expected, current }, catalogue: { activeSongs, playableSongs }, providers: [{ code, state }] }`, or 503 with `status: "not_ready"` and the reason (database down, schema behind the code). No secrets, hostnames or connection strings.

## Listener skip analytics

`GET /api/recommendations/discovery?limit=20&intensity=50` returns unplayed tracks with a familiar-to-unexpected sound target (0–100, default 50). The discovery-only SQL gate continues to exclude tracks already played; intensity changes the audio-feature target rather than weakening that rule.

`GET /api/insights/skip-patterns?days=30` returns the authenticated user's skip patterns for a 7–365 day window. The response includes summary totals and category-level skip counts/rates for genres, artists, music moods, contexts, hour of day and songs. Categories with fewer than two plays are omitted from rate rankings; the result is descriptive, not a dislike judgement. The endpoint reads only the caller's listening rows and requires no schema migration.

### `GET /api/insights/calendar?days=365`

Returns one row per calendar day for the authenticated listener, with listening play/minute totals and that same user's optional private Mood Diary mood (no diary note text is returned). `days` is 1–365. Listening dates use the application database timezone.

### `PUT /api/playlists/:id/order`

Reorders a listener-owned manual or saved-mix playlist. Supply `songIds` as the exact current membership in the requested order; missing, duplicated or foreign IDs are rejected. Private sessions and generated smart playlists cannot be reordered.



Admin read-only diagnostics: `GET /api/admin/permissions` shows the live role × permission mapping; `GET /api/admin/migrations` compares applied versions and source checksums. Both require `health.view`.

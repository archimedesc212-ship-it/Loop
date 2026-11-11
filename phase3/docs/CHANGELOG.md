# Changelog — finalisation pass (October 2026)

## Search clarity, song suggestions and full-video duration (10 November 2026)

- Fixed the Spotify-dark search field contrast: entered text, caret, placeholder and icon now remain visible on the dark surface.
- Added debounced, keyboard-accessible autocomplete for LOOP catalogue songs, artists and albums. The dedicated `/api/search/suggest` endpoint does not write partial keystrokes to search history; the demo catalogue supports the same response shape.
- Added actual YouTube video duration and current embedding-permission enrichment with `videos.list`; search results remain available if the optional enrichment call fails.
- YouTube search now shows the actual video duration, offers a 2+ minute filter to hide many short clips, and no longer inserts a fabricated four-minute duration into the player queue.
- Apple Music cards identify their short samples explicitly and include a Full version route that searches YouTube for the same song and artist. The official player panel now includes provider fallback links.
- See [SEARCH_AND_FULL_LENGTH_PLAYBACK.md](SEARCH_AND_FULL_LENGTH_PLAYBACK.md).

## Global music search, in-page playback and Spotify-style UI (10 November 2026)

- Global Search now combines the curated LOOP archive with Apple's public catalogue across the listener's locale and multiple international storefronts. Results are deduplicated by Apple track ID and show provider artwork when available.
- Apple-provided short preview audio now plays through LOOP's persistent HTML audio player (progress, pause/resume, volume and next-track behavior).
- When Apple does not provide a preview, the official Apple Music embed appears inline above the player bar instead of in a popup. Full playback remains subject to Apple's subscription and territory rules.
- The Content Security Policy was narrowly extended for Apple's official JSONP search script, artwork CDN, preview audio and embedded player.
- Search and Home gained international genre/region discovery shortcuts; Home gained a Recently Played shelf.
- The normal UI moved to charcoal surfaces, green accent, artwork-led global result rows and horizontal music shelves.
- The supplied notebook's mean feature-vector + standardisation + cosine-distance method remains available for Similar Sound and Made for You in the browser/demo recommendation path, adapted to the seven audio/year features actually present in LOOP's metadata archive.
- See [GLOBAL_MUSIC_AND_PLAYBACK.md](GLOBAL_MUSIC_AND_PLAYBACK.md) and [PLAYBACK_AND_RECOMMENDATIONS.md](PLAYBACK_AND_RECOMMENDATIONS.md).

Starting point: the MUSE project as audited in [AUDIT.md](AUDIT.md). Nothing was
rewritten from scratch; every change below extends or corrects the existing code.

## Roadmap review and expansion to 87 features (proposed migrations only)

- **Migration 0005 revision 2** (`database/migrations/proposed/`, not applied):
  - each column, CHECK, foreign key and ENUM value is added on its own; the ENUM is extended from its current definition;
  - self-follow is blocked on INSERT and UPDATE;
  - a room's HOST membership is created by the same statement, and it cannot be removed or reassigned;
  - the room lifecycle is enforced: SCHEDULED → LIVE → ENDED or SCHEDULED → CANCELLED, with ENDED and CANCELLED final and a new `cancelled_at` column;
  - `fn_harmonic_compat` returns NULL for NULL or out-of-range input;
  - a table-shape guard stops the migration if a table already exists with a different shape.
- **New proposed migration 0006** adds 14 tables, 3 columns and 5 ENUM values, only where features 58–87 need them; it requires 0005.
- **Migration runner:** GRANT placeholders now go through `backend/scripts/placeholders.js`, which validates identifiers, keeps the password literal and refuses unknown placeholders. `migrate.js` accepts an optional folder, so tests can run a proposed file through the real runner.
- **Tests:** `test-proposed-migration.js` covers, for both migrations:
  - fresh install through the runner;
  - data preservation;
  - re-runs, partial states, interrupted runs and drift;
  - grants checked as the app account;
  - placeholder refusal.

  `mutation-check.js` checks that the tests catch deliberately broken migrations. `phase2-data-regression.js` checks submitted rows while ignoring test-created rows. `collect-test-results.js` together with `check-registry.js --results` ensures that VERIFIED means "its test passed in this run".
- **Registry:** extended to 87 features with dependencies, plus generated DEPENDENCY_MAP.md, ROADMAP.md, DB_REGRESSION_REPORT.md, MIGRATION_TEST_REPORT.md and UNRESOLVED_ISSUES.md in `docs/roadmap/`. The application database is unchanged (64 tables, migrations 0000–0004).

## Mood-wise percentage ratings (migration 0004)

- New table `song_mood_ratings` (PK user + song + mood, `match_percentage DECIMAL(5,2)` 0–100 with a CHECK, optional review, timestamps; FKs to users, songs, moods), view `v_song_mood_rating_stats`, and `sp_merge_songs` carries mood ratings to the canonical song. Non-destructive and re-runnable.
- API: read all moods with AI confidence / listeners' average + count / your rating for a song; create (409 on duplicate), upsert one, upsert several in one transaction, delete, list your own; top-rated songs per mood by average or Bayesian-adjusted score with minimum count, limit, deterministic ties and separately counted unrated songs. Paused in private sessions.
- UI: "How well does it fit each mood?" on the song page (sliders + number inputs, validation, save/discard/remove, loading/error/empty/private states, phone layout) and "Rated by listeners" on the Mood page.
- Tests: 13 API/database tests, 9 web tests, 2 new SQL blocks (Q41–Q42), browser check `e2e/mood_ratings.py`. ERDs, Phase 1 report, data dictionary and Workbench scripts regenerated (64 tables, 124 foreign keys; core diagram now 16 entities). See [MOOD_RATINGS.md](MOOD_RATINGS.md).

## Security and accounts

- **Server-side sessions** replace the JWT kept in `localStorage`: `auth_sessions` table (token stored as SHA-256 only), httpOnly `SameSite=Strict` cookie, CSRF double-submit token (HMAC of the session id), `Origin` check on every unsafe request including sign-in, bearer mode for API clients and tests.
- Logout now **revokes** the session on the server; new: sign out everywhere, sessions list with per-device sign-out, change password (revokes other sessions, audited), delete account (password + typed confirmation, audited; last admin protected), admin deactivation revokes all sessions.
- `GET /api/auth/session` lets the web app check sign-in state without a 401.
- Rate limiter counts only failed sign-in attempts; limits and proxy trust are configurable (`RATE_LIMIT_*`, `TRUST_PROXY`); `X-Forwarded-For` is trusted only for configured proxies.
- CSP adds `frame-ancestors 'none'` and `form-action 'self'`; `Referrer-Policy: same-origin`; API responses `Cache-Control: no-store`; CORS restricted to listed origins with credentials.
- Dependency audit: 6 findings → 0 (Vite 7.3.7, @vitejs/plugin-react 5, React Router 7.18.4, concurrently 10.0.6; `jsonwebtoken` removed; Vitest 5 chosen because Vitest 3 pulled a vulnerable `tinypool`).
- Missing foreign key `song_mood_curations.curated_by → users` added.

## Database

- **Versioned migrations** (`database/migrations/`, `schema_migrations` with checksums, `npm run db:migrate`, `db:status`); fresh installs follow the same path as upgrades.
- `npm run db:verify`: builds a throw-away database, upgrades a 1.0 baseline, proves it is structurally identical to a fresh install (columns, indexes, constraints, views, routines, triggers, grants), that re-running is a no-op, and runs the empty-catalogue tests — with its own app account so the main database's grants are untouched.
- Migration 0002: `song_dismissals`, `world_feedback`, three WORLD model parameters; the recommendation procedure skips dismissed songs; song merges carry dismissals over.
- Migration 0003: playback availability per media row, attribution, new sources (`YOUTUBE_DATA`, `LOCAL_MEDIA`, `EXTERNAL_PREVIEW`), `v_song_playback`, playable flag in `v_song_catalog`, recommendation candidates restricted to playable songs.
- **Bug fixed**: routines created by a migration after the seed's `SET NAMES utf8mb4` used a different collation and failed with "Illegal mix of collations"; migrations now pin the session collation and a test asserts one collation across all views, routines and triggers.
- Seed: six songs (every 17th id) are metadata-only on purpose.
- SQL collection: Q36–Q40 for sessions, playback availability, dismissals, world feedback and migrations (47 blocks).

## Providers (all off by default)

- New `backend/src/providers/`: shared HTTP client (timeouts, bounded retries with back-off and `Retry-After`, per-provider request spacing, stable error codes, secrets stripped from messages), status registry, and adapters for MusicBrainz (moved from `sources/`), TMDB, YouTube Data API, a vendor-neutral licensed preview contract, local licensed media and an optional Anthropic AI fallback.
- Admin › Providers & media: configuration state (never values), explicit Test, TMDB film enrichment with confident-match rule and candidate choice, local media registration and re-check.
- Idempotent imports into `source_records`; never re-links a record to a different entity silently.
- `GET /api/ready` (database, schema version vs code, provider states); `/api/health` is now liveness only.

## Product

- Playback chain: licensed local file → licensed preview (resolved per play) → labelled demo sketch → metadata only (409). Missing files and "no preview" are marked unavailable; transient provider failures fall back for one play.
- Player: queue panel (jump, remove, "play next"), volume and mute (remembered per browser), real-audio timing from the audio element, demo-clock speed only for the sketch, honest media label.
- "Not for me" on recommendation lists; Settings › Hidden songs to undo.
- MUSE World: "Love this world" / "Not for me", feedback evidence in "what this world was built from", generated/expiry timestamps, failure-safe regenerate (`WORLD_REFRESH_FAILED`, current world kept).
- Film (soundtrack) pages and language/regional pages, linked from songs, albums, search and each other.
- Onboarding: composers and film music step; "Redo onboarding" starts from the saved answers; works on an empty catalogue.
- Cinematic first-visit introduction with Skip (focused), Escape/Enter, reduced-motion still frame; replay from Settings.
- Offline / server-unreachable banner, skip-to-content link, labelled form fields with `aria-describedby` hints and errors, modal focus on the first field, Settings › About and credits (TMDB notice).
- Search: ngram FULLTEXT noise filtered by letter-pair coverage (a nonsense word no longer matches 28 songs), while misspellings and aliases still match.
- Mood input: optional AI fallback when the local parser finds nothing (never in private sessions); the UI says when the AI helper was used.

## Quality

- ESLint 9 with the provided flat config (`npm run lint`), clean.
- API tests 61 → 104 (sessions/CSRF, providers against a local mock server, product behaviour, outages, edge cases) + 4 empty-catalogue tests.
- Frontend: 25 Vitest component and unit tests.
- Browser: new `e2e/finalisation.py` (43 checks incl. axe-core WCAG A/AA scan of 10 screens); existing walk-throughs updated for the intro and the new onboarding step.

## Documentation

New: ENVIRONMENT, PROVIDERS (integration guide, credentials checklist, step-by-step), DEPLOYMENT (production, upgrades, backup, recovery), STATUS, CHANGELOG, AUDIT. Updated: README, ARCHITECTURE (playback, migrations, folders), DATABASE_DESIGN (migrations, ERD, normalisation, Workbench), API, SECURITY (with known gaps), TESTING, ASSUMPTIONS, PROJECT_REPORT, DATA_DICTIONARY (regenerated).


## 2026-11-10 — YouTube-first playback and Now Playing
- Removed the Apple Music catalogue search and preview playback path from the active frontend.
- Catalogue-only songs now resolve through the backend YouTube Data API; the API key remains server-side.
- Replaced the compact player controls with a native LOOP Now Playing strip and wired shuffle, repeat, queue, volume, previous/next, and full-screen player entry.
- Added a full-screen Now Playing view backed by the same YouTube iframe (avoids starting duplicate audio).
- Set the example environment to real API mode and enabled YouTube provider configuration; supply `YOUTUBE_API_KEY` in the private `.env` file.

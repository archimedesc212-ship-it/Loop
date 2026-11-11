# LOOP — Simple Mood-aware Music Discovery

LOOP is a full-stack music discovery and listening app. The normal listener experience is intentionally
simple: **Home, Discover, Search, Library and Settings**. Listeners can find music by mood or text,
search tracks and artists, play available audio, like songs and create playlists. Artists can apply for
access and submit recordings for review; admins can manage catalogue entries and review submissions.
The React app uses the supplied **Mana Universal Icon Kit** through its Lucide `AppIcon` wrapper.

Advanced recommendation experiments, the database explorer, analytics and other academic/demo modules
remain in the source tree for project documentation, but are not part of the standard listener navigation.
See [docs/BASIC_PRODUCT_SCOPE.md](docs/BASIC_PRODUCT_SCOPE.md) for the deliberately small release scope.

It is a BTech CSE DBMS project, so the database does the heavy lifting:
64 normalised tables, 20 views, 11 stored procedures, 11 functions,
14 triggers, 71 CHECK constraints, 124 foreign keys, versioned migrations and
47 documented SQL query blocks.

**It runs completely without external API keys.** MusicBrainz, TMDB, the YouTube
Data API, a licensed preview provider and an optional AI helper are wired as
separate adapters that stay off until configured — see [docs/PROVIDERS.md](docs/PROVIDERS.md).

> **Moods describe music, not people.** LOOP maps words and audio features to musical moods. It never claims to diagnose how anyone feels.
> **Region is a signal, not a stereotype.** A listener's region adds a small, configurable weight; it never decides their taste.
> **The public static archive is metadata-first.** When the checksum-pinned CC BY 4.0 dataset is reachable, it contains 28,372 track records from 1950–2019; lyrics are excluded. The dataset contains no recordings, streaming URLs, track durations, language labels, albums or film metadata. If it cannot be fetched or verified, LOOP uses its curated regional starter metadata without inserting a fabricated placeholder track. Audio is not bundled; playback depends on permitted external provider embeds or search links. The separate MySQL development seed remains fictional test data.

---

## Public static archive

Cloudflare Workers and Vercel static builds run the dataset-backed archive adapter. The root `npm run build` verifies the supplied CSV by its pinned SHA-256 before generating `frontend/public/data/music-catalog.json`. With the upstream source available it publishes 28,372 track records, 5,426 artists and seven source genres. If that source is temporarily unavailable, the static app remains browseable from the curated multilingual starter list, and it clearly does not invent a substitute recording. Search, catalogue browsing, audio-feature matching, mood exploration and local playlists use the available metadata. Mood names are estimates from source topic/audio features, not predictions from a trained AI model. No audio is bundled; playback is delegated to official external provider embeds/search links and is not guaranteed for every track.

The Express/MySQL development and integration-test path remains a separate profile with a fictional seed catalogue. It is not what the public static archive reads. Its Kaggle staging importer is also separate from the static catalogue generator.

## Latest production-readiness audit

See [docs/RELEASE_AUDIT_2026-11-11_LOOP_HANDOFF.md](docs/RELEASE_AUDIT_2026-11-11_LOOP_HANDOFF.md) for the latest source changes, checks completed, environment blockers and owner-side release actions.

## Guest listening and optional accounts

LOOP opens directly to the music app. Guest listeners can browse and listen without entering credentials. In database-free mode, supported personal state stays in the current browser and account sign-in is unavailable. To enable optional email/password accounts and cross-device data syncing, deploy the API with the configured MySQL database and set `VITE_DEMO_MODE=false`. A guest who chooses **Create account** is promoted in place so their server-side listener data stays attached to the same user record. See [Guest Mode and Optional Accounts](docs/OPTIONAL_LOGIN_GUEST_MODE.md) for exact behaviour and setup requirements.

## Production deployment

The active Vercel deployment runbook, required environment variables, database release gates, production smoke checks, media-upload restrictions and monitoring setup are documented in [docs/DEPLOYMENT_VERCEL.md](docs/DEPLOYMENT_VERCEL.md). Run `npm run deploy:smoke` against the deployed URL after configuring `LOOP_PRODUCTION_URL`.

## Latest UI release

The latest UI/assistant implementation and its actual verification boundary are recorded in [docs/RELEASE_UI_ASSISTANT_2026-11-10.md](docs/RELEASE_UI_ASSISTANT_2026-11-10.md). The music-app route/component map and Spotify integration boundaries are in [docs/LOOP_SPOTIFY_INSPIRED_PARITY.md](docs/LOOP_SPOTIFY_INSPIRED_PARITY.md).

## Visual theme

The listener interface uses LOOP's own Spotify-inspired dark visual system: black app canvas, charcoal navigation/content surfaces, white typography and LOOP violet actions. The active stylesheet is `frontend/src/styles/spotify-dark.css`, loaded after `global.css`. The former light-theme override has been removed; this changes presentation only and preserves the existing routes and provider/player behaviour.

## Expansion roadmap

The curated LOOP roadmap contains 102 music-focused features across 12 categories. Eighteen low-fit or unsupported proposals were removed from the active scope. See [docs/LOOP_FEATURE_ROADMAP.md](docs/LOOP_FEATURE_ROADMAP.md) and [docs/LOOP_FEATURE_SCOPE_REVIEW_2026-11-10.md](docs/LOOP_FEATURE_SCOPE_REVIEW_2026-11-10.md). This is a scoped plan, not a claim that every retained feature is already implemented.

## Search and full-length playback

Search autocomplete, high-contrast search input, and provider-specific playback limits are documented in [docs/SEARCH_AND_FULL_LENGTH_PLAYBACK.md](docs/SEARCH_AND_FULL_LENGTH_PLAYBACK.md).

The current provider release adds direct-source Openverse audio with per-track attribution/licence details, keeps YouTube in its official visible player, and links out to Spotify rather than embedding Spotify streams. See [docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md](docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md) and [docs/PROVIDERS.md](docs/PROVIDERS.md) for the source and licensing boundaries.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Test access](#test-access)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [How it works (short)](#how-it-works-short)
- [Screenshots](#screenshots)
- [Testing](#testing)
- [Documentation index](#documentation-index)
- [Limitations and future scope](#limitations-and-future-scope)

## Basic features

**Listeners**
- Create an account, sign in and manage basic profile settings.
- Discover tracks by choosing moods or describing what they want to hear.
- Search tracks, artists, albums and genres.
- Play available recordings with play/pause, seek, volume and queue controls. Metadata-only tracks are clearly labelled and are never presented as playable audio.
- Like songs, create playlists, remove tracks and view recently played music.

**Artists and admins**
- Apply for an artist account and check application status.
- Approved artists can submit track details and audio files to private quarantine.
- Uploaded tracks require security checks and moderator review before publication.
- Admins can manage the catalogue, users, artist applications and track reviews.

**Core safety and project foundation**
- Password hashing, secure server-side sessions, CSRF protection, rate limiting and role-based permissions.
- MySQL schema, versioned migrations, stored procedures, triggers, views and DBMS documentation.
- Responsive React interface with loading, error, empty and offline states.

## Tech stack

| Layer | Choice |
|---|---|
| Database | MySQL 8.0 (InnoDB, utf8mb4, CHECK constraints, generated columns, window functions, recursive CTEs, JSON, FULLTEXT ngram) |
| API | Node.js 20.19+ / Express 4, `mysql2/promise`, bcryptjs, helmet, express-rate-limit, cors, dotenv |
| Web app | React 18, React Router 7, Vite 7, Lucide React via the Mana icon wrapper; self-hosted Fraunces + Hanken Grotesk fonts |
| Quality | ESLint 9; `node:test` API + database suites; Vitest + Testing Library component tests; SQL runner; Playwright browser checks with an axe-core accessibility scan |

## Quick Vercel launch (guest mode)

The easiest first deployment is the browser-only guest profile; a MySQL database is not required:

Follow [the GitHub and Vercel upload guide](docs/GITHUB_VERCEL_UPLOAD.md): push the repository to GitHub, import it into Vercel at the repository root, use `npm ci` / `npm run build` / `frontend/dist`, and deploy without setting `VITE_DEMO_MODE` (its default is guest mode). Optionally add a referrer-restricted `VITE_YOUTUBE_API_KEY` for provider video lookup.

Guest playlists, likes and preferences remain in the current browser; they do not sync across devices. For account sign-in and sync, configure MySQL and the server-side secrets described in [the Vercel runbook](docs/DEPLOYMENT_VERCEL.md), then set `VITE_DEMO_MODE=false`.

## Quick start

**Prerequisites:** Node.js ≥ 20.19, MySQL ≥ 8.0.19. No API keys.

**1. Create the MySQL owner account** (once, as root). The owner builds the schema and creates the least-privilege app account; the API never uses it.

```sql
CREATE USER 'muse_owner'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON *.* TO 'muse_owner'@'localhost' WITH GRANT OPTION;
-- stored functions are created by a non-SUPER account while binary logging is on:
SET PERSIST log_bin_trust_function_creators = 1;
```

If MySQL resolves `localhost` to `127.0.0.1` on your machine, create the same user `@'127.0.0.1'` too.

**2. Configure.**

```bash
cp .env.example .env
# edit .env: DB_OWNER_PASSWORD, DB_APP_PASSWORD (any new strong password), SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # a SESSION_SECRET
```

**3. Install, safely migrate an existing database, build the web app, run.**

```bash
npm install
npm run setup        # generate reference seed SQL, apply pending migrations, build frontend
npm start            # API + built web app on http://localhost:4000
```

For development with hot reload: `npm run dev` (API on :4000, Vite on :5173 with an `/api` proxy).

`npm run setup` is the normal non-destructive path: it generates reference seed SQL, applies pending migrations, and builds the frontend. The explicit `npm run db:reset:unsafe` command drops and recreates the `muse` database and is only for a brand-new, verified-empty development database. Never use it for the existing production database. To upgrade an existing database, use `npm run db:migrate`. Every variable is described in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md); production, backup and recovery in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Test access

A listener test account is provisioned by versioned database migrations. Apply pending migrations to the existing database before testing sign-in. Do not publish test credentials in the public login interface or repository documentation.

## Project structure

```
muse/
├── database/
│   ├── 01_schema.sql        baseline tables, constraints, indexes (1.0)
│   ├── 02_functions.sql     11 stored functions (decay, similarity, mood fit…)
│   ├── 03_views.sql         baseline views
│   ├── 04_procedures.sql    11 procedures (recommendation engine, preference learning, merge, rollback…)
│   ├── 05_triggers.sql      14 triggers (integrity, derived columns, audit)
│   ├── 06_security.sql      least-privilege grants for the app account
│   ├── 07_seed.sql          generated demo data (13 users, 104 songs, 2.6k plays)
│   ├── 08_queries.sql       47 documented SQL blocks (Q01–Q40, transactions, EXPLAIN)
│   ├── migrations/          0001 sessions · 0002 feedback · 0003 playback media and providers
│   └── sources/             partner feed used by the ingestion pipeline
├── backend/
│   ├── src/                 Express app: routes → controllers → services; config, middleware, providers, sources
│   ├── scripts/             setup-db, migrate, verify-db, seed generator, SQL runner, demos, data dictionary
│   └── tests/               node:test suites 01–10 (+ tests/empty for an empty catalogue)
├── frontend/src/            React app: pages, components, hooks, styles (+ *.test.js[x])
├── e2e/                     Playwright browser checks and accessibility scan
├── media/                   your licensed audio files (git-ignored)
└── docs/                    architecture, database design, algorithms, API, performance, concurrency, security, testing, viva, report
```

## Scripts

Operational additions: `npm run ui:audit` checks the responsive/accessibility source contract; `npm run db:backup` creates a verified compressed MySQL backup; `npm run db:restore:drill` restores only into a separate, empty schema whose name begins `loop_restore_`. See [docs/PRODUCTION_OPERATIONS.md](docs/PRODUCTION_OPERATIONS.md).

| Command | What it does |
|---|---|
| `npm run setup` | Generate reference seed SQL, apply pending migrations, and build the web app (non-destructive) |
| `npm run db:reset:unsafe` | Explicit destructive reset for a new, verified-empty development database only |
| `npm run db:setup` | (Re)create the database only |
| `npm run db:migrate` / `npm run db:status` | Apply pending migrations / list applied and pending ones |
| `npm run db:verify` | In a throw-away database: prove upgrade = fresh install, re-run safety, and the empty-catalogue tests |
| `npm start` / `npm run dev` | Run the API (+ built app) / run API and Vite with hot reload |
| `npm run lint` | ESLint over backend and frontend |
| `npm test` | API and database tests against the real MySQL database |
| `npm run test:web` | Frontend unit and component tests (Vitest, jsdom) |
| `npm run test:sql` | Execute all 47 blocks of `database/08_queries.sql` as the app account |
| `npm run check` | lint + API tests + web tests + SQL blocks + build |
| `npm run demo:concurrency` | Lost update, isolation levels and job-claim experiments on two real connections |
| `npm run demo:explain` | EXPLAIN / EXPLAIN ANALYZE with and without each key index |
| `npm run db:seed:generate` | Regenerate `07_seed.sql` and the partner feed (deterministic) |
| `npm run pipeline --workspace backend -- weekly\|ingest\|trends\|cleanup` | Run a pipeline job from the command line |
| `npm run docs:dictionary --workspace backend` | Regenerate `docs/DATA_DICTIONARY.md` from `information_schema` |

## How it works (short)

1. **Songs** carry versioned audio features (energy, valence, danceability, acousticness, instrumentalness, speechiness, tempo, loudness). A rule-based **mood model** (`sp_analyze_song_moods`, `fn_mood_fit`) tags each song with up to four moods plus time-coded mood segments; curator decisions override it.
2. **Listening behaviour** (completed = +1, partial = +0.4 × completion, skip = −0.6, replay +0.5, like +2, rating ±0.8/star) is decayed with a 7-day (short-term) and 90-day (long-term) half-life by `sp_refresh_user_preferences`, blended 40/60, and mixed with onboarding answers until 25 completed plays.
3. **Recommendations** (`sp_generate_recommendations`) score every candidate on eight signals — mood, audio, preference, recency, trend, context, regional, exploration — as a weighted mean minus a repetition penalty, enforce diversity (≤ 2 songs per artist, ≤ 40 % one genre), store the ranked list and derive reasons from the same numbers.

Details and formulas: [docs/ALGORITHMS.md](docs/ALGORITHMS.md).

## UI preview

The source archive does not include the older `docs/screenshots` set referenced by previous project reports. The current UI is implemented in `frontend/src` and can be previewed with `npm run dev` after dependency installation. Responsive and accessibility source checks are available with `npm run ui:audit`.

## Testing

```bash
npm run check                 # lint, API tests, web tests, SQL blocks, build
npm run db:verify             # migrations + empty catalogue, in a throw-away database
python3 e2e/finalisation.py   # browser checks + axe accessibility scan (see e2e/README.md)
```

Latest results, the full test-case table and the browser walk-throughs are in [docs/TESTING.md](docs/TESTING.md).

## Documentation index

| Document | Contents |
|---|---|
| [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) | Academic report: problem statement, objectives, existing vs proposed system, requirements, modules, conclusion |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, request flow, data flows, pipeline, scheduler, private session |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | ER diagram, table groups, normalisation UNF → BCNF with functional dependencies, controlled redundancy, constraints, triggers, procedures, views |
| [docs/erd/](docs/erd/MUSE_ERD_EXPLANATION.md) | ER diagrams generated from the live schema: A3 presentation ERD, complete 64-table ERD, conceptual flow, Mermaid and draw.io sources, viva guide, validation report |
| [docs/phase1/MUSE_Phase1_ER_Normalisation_Report.pdf](docs/phase1/MUSE_Phase1_ER_Normalisation_Report.pdf) | Phase 1 deliverable: topic, entities, relationships and cardinalities, ER diagram, normalisation UNF → 3NF, final normalised schema |
| [docs/phase2/MUSE_Phase2_Database_Creation_Report.pdf](docs/phase2/MUSE_Phase2_Database_Creation_Report.pdf) | Phase 2 deliverable: DDL (all tables, keys, constraints, indexes) and DML sample data in `database/phase2/`, with the test results. Rebuild with `npm run db:phase2` |
| [docs/phase3/MUSE_Phase3_Project_Report.pdf](docs/phase3/MUSE_Phase3_Project_Report.pdf) | Phase 3 deliverable: 17 queries (`database/phase3/`), screenshots, and the Streamlit / CLI interface in `phase3/app/` (see `phase3/README.md`) |
| [database/workbench/](database/workbench/README.md) | Run the whole database in MySQL Workbench without Node.js: one setup script, a stored-procedure demo, the analytical queries, step-by-step guide |
| [docs/MOOD_RATINGS.md](docs/MOOD_RATINGS.md) | Mood-wise percentage ratings: design, migration 0004, API, calculations, UI, tests, `.mwb` sync steps |
| [docs/erd/MUSE_ERD_Korth.pdf](docs/erd/MUSE_ERD_Korth.pdf) | The core schema in the E-R notation of *Database System Concepts* (attributes inside entity boxes, arrows to the "one" side, double lines for total participation), A3 |
| [docs/erd/MUSE_ERD_Chen.pdf](docs/erd/MUSE_ERD_Chen.pdf) | The core schema in Chen notation (entities, attributes, relationships, multi-valued attributes, weak entity), A3 |
| [docs/erd/MUSE_ERD_Core_GUIDE.md](docs/erd/MUSE_ERD_Core_GUIDE.md) | Simplified 16-entity ERD (all columns, 24 real FKs) with a mapping of the other 48 tables — the database itself is unchanged |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Every column of every table (generated from `information_schema`) |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | Mood analysis, text parsing, preference learning, scoring, diversity, reasons, worlds, trends |
| [docs/API.md](docs/API.md) | All endpoints with authentication, permissions and error format |
| [docs/LOOP_SPOTIFY_INSPIRED_PARITY.md](docs/LOOP_SPOTIFY_INSPIRED_PARITY.md) | Music-app UX map, user flows, Spotify API boundaries and product limitations |
| [docs/GITHUB_VERCEL_UPLOAD.md](docs/GITHUB_VERCEL_UPLOAD.md) | Step-by-step GitHub source upload and Vercel deployment guide |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Index design and measured EXPLAIN before/after |
| [docs/CONCURRENCY.md](docs/CONCURRENCY.md) | Transactions, isolation levels, locking, the deadlock fix, experiments |
| [docs/SECURITY.md](docs/SECURITY.md) | Sessions, CSRF, RBAC, least privilege, privacy, content rights, known gaps |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider integration guide, final API credentials checklist, step-by-step key setup |
| [docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md](docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md) | Openverse direct audio, official YouTube playback, Spotify hand-off and licensing boundaries |
| [docs/DATASETS.md](docs/DATASETS.md) | Safe Kaggle 1950–2019 music-feature dataset import, CC BY 4.0 attribution, and limits (metadata/features only; no audio) |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production configuration, upgrades, backup and recovery |
| [docs/STATUS.md](docs/STATUS.md) | Implemented / tested / partial / blocked matrix and limitations |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | What changed in the finalisation pass |
| [docs/AUDIT.md](docs/AUDIT.md) | State of the project before the finalisation pass |
| [docs/TESTING.md](docs/TESTING.md) | Test plan, cases, exact commands and results |
| [docs/VIVA.md](docs/VIVA.md) | 30 viva questions with answers |
| [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | Decisions taken where the brief was incomplete, and known limitations |

## Limitations and future scope

- Audio features are pre-computed values in the seed and feed; there is no signal-processing model analysing real audio. The schema already versions analyses per model, so a real analyser could be added as a new `AUDIO_FEATURES` model.
- External providers are implemented and tested against a local mock server, but none has been exercised against the real service in this build (no credentials were used). See [docs/STATUS.md](docs/STATUS.md).
- Single MySQL instance; read replicas, partitioning `listening_history` by month and moving the scheduler to a separate worker are the natural next steps.
- Collaborative filtering (listeners-like-you) is the largest missing recommendation signal; the per-user preference tables are its input.

See [docs/STATUS.md](docs/STATUS.md) and [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) for the complete list.

## Current implementation status

See [the project completion and verification report](docs/PROJECT_COMPLETION_STATUS.md) for the latest implemented roadmap areas, checks run, and the external services / integration tests that still require a configured deployment environment. The report deliberately distinguishes implemented code from production-verified functionality.

## Music playback and supplied recommendation notebook

The regular music catalogue is metadata, not a collection of recording files. When a listener selects a catalogue track, LOOP searches Apple's public catalogue using title and artist and opens the official Apple Music embedded player for a close match. Apple states that listeners not logged in to Apple Music can play a 30-second clip, while logged-in Apple Music listeners can hear full tracks in the embed ([Apple Music Marketing Tools](https://artists.apple.com/support/1117-apple-music-marketing-tools)). Provider availability varies by track and region. LOOP does not download or store Apple audio, and embedded playback events are not reported back as full listening-history events.

The root `npm run dev` command prepares the music metadata catalogue first (it downloads the checksum-pinned CC BY 4.0 dataset unless `LOOP_MUSIC_CSV` points to a local CSV). The uploaded Spotify recommendation notebook is preserved at `music-recommendation/notebooks/spotify-music-recommendation.ipynb`. Its seed-song mean-vector and cosine-distance recommendation method is ported to `frontend/src/lib/spotifySimilarity.js` and used for the listener's daily mix and similar-track recommendations. The notebook expects separate Spotify CSV files and Spotify API credentials that were not included in the upload; LOOP therefore uses only the seven numerical fields actually available in its own music catalogue. See `docs/PLAYBACK_AND_RECOMMENDATIONS.md` for the exact scope and limitations.


## Real YouTube playback

The public Vercel build defaults to browser-only guest mode. To use server-side YouTube search and account-backed playback history, configure the Express API and MySQL database, set `YOUTUBE_ENABLED=true` plus `YOUTUBE_API_KEY` on the backend, and build with `VITE_DEMO_MODE=false`. Keep this backend key server-side; never add it to a `VITE_` variable. The optional browser-mode `VITE_YOUTUBE_API_KEY` is public and must be restricted to YouTube Data API v3 and your deployed HTTP referrers.

## Licensed audio playback

The YouTube Data API provides discovery metadata; selected YouTube results play only through the visible official YouTube iframe, never as extracted/background audio. Openverse results with known Creative Commons/public-domain licence identifiers are played from their original HTTPS source and display creator, source and licence details; Openverse does not verify the rights metadata or guarantee that each URL is a full, working recording. Jamendo streams are optional and subject to its API terms and each recording's licence. Full-catalogue commercial streaming still requires a provider contract that explicitly grants on-demand rights. Spotify is an external hand-off only in this multi-provider release; its streams are not embedded in LOOP. See [docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md](docs/MUSIC_DISCOVERY_PROVIDERS_2026-11-11.md), [docs/PROVIDERS.md](docs/PROVIDERS.md) and [docs/LICENSED_PLAYBACK_SETUP.md](docs/LICENSED_PLAYBACK_SETUP.md) for the policy and setup boundaries.


### Jamendo non-commercial streaming

LOOP can search and stream Jamendo catalogue tracks when `JAMENDO_ENABLED=true` and `JAMENDO_CLIENT_ID` are configured on the backend. Search results include artist attribution and the track licence link. Read the per-track licence and Jamendo API terms before use; this integration does not support offline downloads or caching.

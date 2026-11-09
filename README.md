# MUSE — Music Mood Intelligence & Recommendation Database System

MUSE is a full-stack music recommendation system whose intelligence lives in a
**MySQL 8 database**. You tell it a mood ("calm", "not happy, need something for studying"),
a context (Focus, Workout, Late night) or just press play, and it recommends songs
— each with the real reasons it was chosen. Every play, skip, rating and like is
stored and folded back into a decaying model of your taste. It also generates a
weekly, versioned **MUSE World** for each listener, offers a **private session**
that never touches the permanent profile, and gives curators and admins an
ingestion pipeline, a review queue, a database health panel and an audit log.

It is a BTech CSE DBMS project, so the database does the heavy lifting:
64 normalised tables, 20 views, 11 stored procedures, 11 functions,
14 triggers, 71 CHECK constraints, 124 foreign keys, versioned migrations and
47 documented SQL query blocks.

**It runs completely without external API keys.** MusicBrainz, TMDB, the YouTube
Data API, a licensed preview provider and an optional AI helper are wired as
separate adapters that stay off until configured — see [docs/PROVIDERS.md](docs/PROVIDERS.md).

> **Moods describe music, not people.** MUSE maps words and audio features to musical moods. It never claims to diagnose how anyone feels.
> **Region is a signal, not a stereotype.** A listener's region adds a small, configurable weight; it never decides their taste.
> **No copyrighted audio, lyrics or artwork.** The catalogue is a fictional, project-authored dataset (CC0). Playback of demo songs is a labelled **demo sketch** synthesised in the browser from each song's stored audio features — never presented as the recording. Songs without a permitted source are shown as *metadata only* and are not played.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [How it works (short)](#how-it-works-short)
- [Screenshots](#screenshots)
- [Testing](#testing)
- [Documentation index](#documentation-index)
- [Limitations and future scope](#limitations-and-future-scope)

## Features

**Listening**
- Mood picker and free-text mood input with a deterministic, explainable parser (negation, intensity, activities; vocabulary stored in the database).
- Context modes (Focus/Study, Workout, Travel, Relax, Night…) and eight recommendation strategies: mood, context, daily mix, "because you liked", regional, discovery, recovery, weekly world.
- Every recommended song shows *why*: reasons generated from real signals (`recommendation_reasons`), and a per-signal score breakdown.
- Playback through a permitted source only — a licensed local file, a licensed preview (when a provider is configured) or the labelled demo sketch — with a play queue, volume and honest "metadata only" states; start / pause / seek / finish events are stored; completion %, skip and replay are derived by the database.
- "Not for me" removes a song from all future recommendations (undo in Settings); film (soundtrack) and language pages.
- A short cinematic introduction on the first visit (skippable, keyboard-operable, a still frame with reduced motion).
- **Mood-wise percentage ratings**: rate how well a song fits each mood (0–100 %, two decimals) on the song page; see the listeners' average and count next to the AI's own prediction, and rank songs for a mood by average or by a Bayesian-adjusted score (migration 0004).
- Ratings (1–5), likes, playlists (manual, saved mixes, 8 smart playlist types), search with an ngram FULLTEXT index and alias matching.
- Listening profile and **Music Mood Journey**: daily/weekly/monthly mood share, mood transitions (LAG), streaks (gaps-and-islands), peak hours, 7-day moving average — all SQL.
- Cold-start onboarding (languages, genres, artists, composers and film music, moods and moments, region) that fades out as real behaviour accumulates; editable later from Settings.

**Private session (incognito)**
- The permanent profile becomes read-only; plays go to temporary memory that shapes only that session's recommendations.
- Enforced in the database (`trg_lh_bi` rejects permanent history while a private session is active) and proven by a test that snapshots 14 permanent tables before and after a busy session.
- Ending (or expiry) deletes the temporary memory and private lists.

**MUSE World**
- A weekly themed world per listener (archetype, title, generative art, 18 songs), chosen from mood taste, season, novelty and the listener's "Love this world" / "Not for me" feedback. Versioned: regenerate creates v2, rollback restores v1; the database guarantees exactly one active version; a failed refresh keeps the current world.

**Curation and operations**
- Ingestion pipeline with statuses DISCOVERED → VALIDATING → PROCESSING → COMPLETED / SKIPPED / FAILED, idempotency keys, provenance (`source_records`), duplicate detection and a review queue (APPROVE / REJECT / MERGE / IGNORE / REPROCESS).
- Versioned audio analysis and mood models; curators can add or remove a song's mood and the decision survives re-analysis.
- Tunable model weights (bounded, audited), weekly intelligence and trend snapshots (24H / 7D / 30D).
- Admin: catalogue CRUD, users and roles, audit log, database health checks, a performance lab (EXPLAIN with and without each index).

**Security**
- bcrypt password hashing; server-side sessions in httpOnly SameSite=Strict cookies with CSRF tokens and an Origin check; logout that really revokes; sessions list, sign out everywhere, password change, account deletion; account lockout; rate limiting; role-based permissions read from the database on every request.
- Parameterised SQL everywhere; strict input validation; errors never leak SQL or stack traces.
- The API connects as a **least-privilege** MySQL account (`muse_app`): no DDL, and the audit log is append-only (SELECT, INSERT only).

## Tech stack

| Layer | Choice |
|---|---|
| Database | MySQL 8.0 (InnoDB, utf8mb4, CHECK constraints, generated columns, window functions, recursive CTEs, JSON, FULLTEXT ngram) |
| API | Node.js 20.19+ / Express 4, `mysql2/promise`, bcryptjs, helmet, express-rate-limit, cors, dotenv |
| Web app | React 18, React Router 7, Vite 7; self-hosted Fraunces + Hanken Grotesk fonts; Web Audio for the demo sketch |
| Quality | ESLint 9; `node:test` API + database suites; Vitest + Testing Library component tests; SQL runner; Playwright browser checks with an axe-core accessibility scan |

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

**3. Install, build the database, build the web app, run.**

```bash
npm install
npm run setup        # db:setup (baseline schema → seed → migrations → first weekly pipeline) + frontend build
npm start            # API + built web app on http://localhost:4000
```

For development with hot reload: `npm run dev` (API on :4000, Vite on :5173 with an `/api` proxy).

`npm run db:setup` drops and recreates the `muse` database, so it is also the way to reset the demo. To upgrade an existing database without losing data, use `npm run db:migrate`. Every variable is described in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md); production, backup and recovery in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Demo accounts

| Username | Password | Role | Notes |
|---|---|---|---|
| `aarav` | `Listener@123` | Listener | ~290 plays; Telugu and Hindi; leans motivational and energetic |
| `nila` | `Listener@123` | Listener | `FAMILY` content filter: never sees explicit songs |
| `kavya` | `Curator@123` | Curator | Catalogue, moods, review queue; cannot manage users or tune models |
| `admin` | `Admin@123` | Admin | Everything, including users, model weights and the audit log |

Other seeded listeners use `Listener@123`. You can also register a new account to see onboarding and cold start.

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

| Command | What it does |
|---|---|
| `npm run setup` | Build the database from scratch and build the web app |
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

## Screenshots

| | |
|---|---|
| ![Home](docs/screenshots/02-home.png) | ![Mood result](docs/screenshots/22-energetic.png) |
| Home: mood picker and free-text input | "I want something energetic": how MUSE read it, the target sound, the ranked list |
| ![MUSE World](docs/screenshots/05-world.png) | ![Listening profile](docs/screenshots/09-profile.png) |
| MUSE World with the evidence it was built from and its versions | Listening profile and Music Mood Journey |
| ![Private session](docs/screenshots/40-private.png) | ![Review queue](docs/screenshots/32-review.png) |
| Private session: temporary memory only | Admin review queue for ingested records |

| ![Introduction](docs/screenshots/61-intro-brand.png) | ![Film page](docs/screenshots/66-film.png) |
| First-visit introduction (skippable; still frame with reduced motion) | Film page: soundtrack, composer, a metadata-only song labelled |
| ![Queue](docs/screenshots/64-queue.png) | ![Providers](docs/screenshots/70-admin-providers.png) |
| Player queue, volume and the "Demo sketch (not the recording)" label | Admin › Providers & media: every provider off until configured, no secrets shown |
| ![Account security](docs/screenshots/69-settings-security.png) | ![Phone](docs/screenshots/71-phone-player.png) |
| Settings: hidden songs, sessions per device, password change, account deletion | Phone layout with the player and queue button |

More in [docs/screenshots](docs/screenshots), including phone and tablet layouts.

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
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Index design and measured EXPLAIN before/after |
| [docs/CONCURRENCY.md](docs/CONCURRENCY.md) | Transactions, isolation levels, locking, the deadlock fix, experiments |
| [docs/SECURITY.md](docs/SECURITY.md) | Sessions, CSRF, RBAC, least privilege, privacy, content rights, known gaps |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider integration guide, final API credentials checklist, step-by-step key setup |
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

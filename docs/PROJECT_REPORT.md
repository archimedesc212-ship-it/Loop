# MUSE — Music Mood Intelligence & Recommendation Database System

**Project report · BTech Computer Science & Engineering · Database Management Systems**

---

## Abstract

MUSE is a music recommendation system whose intelligence is implemented in a
relational database. Listeners describe a mood in words or choose a context, and
MUSE returns a ranked list of songs, each with reasons derived from stored signals.
Every play, skip, rating and like is recorded and folded into a time-decayed model of
the listener's taste. A private mode lets listeners explore without changing that
model, enforced by the database itself. Each week MUSE generates a versioned,
themed "world" for every listener. Curators manage a catalogue fed by an idempotent
ingestion pipeline with provenance and a review queue. The system is built on MySQL 8
(59 tables in BCNF, 18 views, 11 procedures, 11 functions, 14 triggers), a Node.js API
and a React web app, and is verified by 61 automated tests and 42 documented SQL blocks.

## 1. Introduction

Streaming services recommend music with opaque models trained on very large datasets.
For a student project the interesting question is different: *how much of a modern
recommender can be expressed, enforced and explained by a well-designed relational
database?* MUSE answers it by putting mood tagging, preference learning, scoring,
diversity, explanation, privacy isolation, versioning and auditing into SQL, and keeping
the application layer thin.

## 2. Problem statement

Design and implement a database-centred system that:

1. stores a music catalogue with stable identity, versioned audio analysis and mood tags;
2. records listening behaviour precisely enough to learn each listener's taste over time;
3. recommends songs for a mood, an activity or a listener's taste, explaining every choice with real data;
4. lets a listener listen privately without affecting their permanent profile;
5. supports curation, ingestion from external sources with provenance, and administration with an audit trail;
6. demonstrates core DBMS concepts — normalisation, constraints, joins, subqueries, views, procedures, functions, triggers, transactions, concurrency control, indexing and query optimisation — on a realistic workload.

## 3. Objectives

- A normalised schema (BCNF) with integrity enforced in the database, not only in code.
- A recommendation engine with configurable weights, diversity control and explainable output.
- Time-decayed learning from implicit (plays, skips, replays) and explicit (ratings, likes) feedback, with cold-start onboarding.
- Strict isolation of private sessions, provable by test.
- Safe concurrent operation: no lost updates, no duplicate jobs, no deadlocks under normal load.
- Measurable performance benefits from indexing, shown with EXPLAIN.
- Security: hashed passwords, RBAC, least-privilege database account, parameterised SQL, append-only audit.
- Ethical constraints: no copyrighted media; mood describes music, not people; region as a signal, not a stereotype.

## 4. Existing systems and their limitations

| Aspect | Typical commercial streaming apps | Typical student DBMS projects |
|---|---|---|
| Recommendation logic | Large ML models; opaque | Often absent, or "most played" |
| Explanations | Generic ("Because you listened to…") | None |
| Mood | Editorial playlists; not queryable per song | Not modelled |
| Private listening | Some offer "private session", effect not verifiable by the user | Not modelled |
| Data integrity | Not visible | Mostly enforced in application code |
| Versioning of analyses | Internal | None |
| Concurrency | Internal | Rarely considered |

## 5. Proposed system

MUSE models moods as first-class data (mood profiles, per-song confidences from a
versioned model, time-coded segments, curator overrides) and treats every listening
event as evidence. Recommendations are produced by one SQL procedure that scores every
eligible song on eight signals with weights stored as data, enforces diversity with
window functions, persists the ranked list and writes reasons from the same numbers.
Private sessions write only to temporary tables, and a trigger rejects permanent writes.
A weekly pipeline (idempotent, logged, retried) ingests sources, analyses new songs,
refreshes preferences, snapshots trends and generates each listener's MUSE World.

**Advantages:** transparent and testable logic; integrity that holds regardless of the
client; explanations that are true by construction; tunable without code changes;
privacy guarantees that can be demonstrated.

## 6. Requirements

### 6.1 Functional requirements

| ID | Requirement |
|---|---|
| FR1 | Register, sign in, sign out; onboarding of languages, region, genres, artists, moods |
| FR2 | Browse songs, artists, albums, genres, moods; search by title, alias, mood, genre, language |
| FR3 | Request recommendations by mood selection, free text, or context; daily mix; because-you-liked; regional; discovery; recovery |
| FR4 | Show why each song was recommended and its score breakdown |
| FR5 | Play songs; record start, pause, resume, seek, finish; derive completion, skip, replay |
| FR6 | Rate (1–5), like, create and edit playlists; save generated lists; smart playlists |
| FR7 | Listening profile and Music Mood Journey (daily / weekly / monthly) |
| FR8 | Private session with temporary memory; end or expire it, purging temporary data |
| FR9 | Weekly MUSE World with regenerate and rollback |
| FR10 | Curators: create/edit/hide songs, artists, albums, moods, keywords; curate song moods; merge duplicates; decide review items |
| FR11 | Admins: manage users and roles, tune model weights, activate model versions, run pipelines, view audit log, database health and performance lab |
| FR12 | Ingestion pipeline with statuses, idempotency, provenance, duplicate detection and review queue |
| FR13 | Trend snapshots for 24 h, 7 days and 30 days, overall and per region |

### 6.2 Non-functional requirements

| ID | Requirement | How it is met |
|---|---|---|
| NFR1 Integrity | invalid states impossible | 66 CHECKs, 114 FKs, unique generated keys, triggers |
| NFR2 Consistency | multi-step changes are atomic | transactions with explicit lock order; procedures roll back on error |
| NFR3 Concurrency | correct under simultaneous requests | atomic updates, `FOR UPDATE`, `SKIP LOCKED`, READ COMMITTED where justified, retries; tested |
| NFR4 Performance | interactive latency | indexed access paths, materialised preferences and trends; recommendation ≈ 120 ms median |
| NFR5 Security | confidentiality and least privilege | bcrypt, server-side sessions (httpOnly cookie + CSRF), lockout, rate limits, RBAC, `muse_app` account, CSP |
| NFR6 Privacy | private sessions leave no trace | API + trigger enforcement; byte-for-byte test |
| NFR7 Explainability | every recommendation justified | stored per-signal scores and rule-based reasons |
| NFR8 Maintainability | logic changes without code | weights, keywords, archetypes, sources are data; versioned models |
| NFR9 Usability | clear, responsive UI | desktop, tablet and phone layouts; empty/error/loading states |
| NFR10 Legality | no infringing content | fictional CC0 catalogue, synthesised playback, rights recorded per source |

## 7. System design

- **Architecture:** React SPA → Express API (validation, auth, RBAC, transactions) → MySQL 8 with procedures, triggers and views. Diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).
- **Database:** ER diagram, table groups, normalisation and object catalogue: [DATABASE_DESIGN.md](DATABASE_DESIGN.md); every column: [DATA_DICTIONARY.md](DATA_DICTIONARY.md).
- **Algorithms:** mood analysis, text parsing, preference learning, scoring, diversity, reasons, worlds, trends: [ALGORITHMS.md](ALGORITHMS.md).
- **Interfaces:** 99 REST endpoints: [API.md](API.md).

## 8. Modules

| Module | Main tables / objects | Screens |
|---|---|---|
| Accounts & onboarding | `users`, `user_profiles`, `user_languages`, `roles`… | Sign in, Register, Onboarding, Settings |
| Catalogue & search | `songs`, `artists`, `albums`, `genres`, `artist_aliases`, FULLTEXT | Search, Song, Artist, Album |
| Mood intelligence | `moods`, `audio_features`, `song_moods`, `mood_segments`, `sp_analyze_song_moods` | Mood page, song mood timeline |
| Recommendation | `recommendation_*`, `sp_generate_recommendations` | Home, Mood, Mixes, "Why this song?" |
| Listening & learning | `listening_*`, `playback_events`, `user_*_preferences`, `sp_refresh_user_preferences` | Player, Profile |
| Feedback & playlists | `ratings`, `user_likes`, `playlists` | Library, Playlist |
| Private session | `incognito_*`, `trg_lh_bi`, `sp_cleanup_expired_incognito` | Private |
| MUSE World | `weekly_worlds`, `world_archetypes`, `sp_rollback_world` | World |
| Pipeline & curation | `music_sources`, `pipeline_jobs`, `source_records`, `review_queue`, `sp_merge_songs` | Admin › Catalogue, Pipeline, Review |
| Administration | `audit_logs`, `model_parameters`, health views | Admin › Users, Models, Health, Performance, Audit |

## 9. Implementation

| Layer | Technology |
|---|---|
| Database | MySQL 8.0, InnoDB, utf8mb4 |
| Backend | Node.js 18+, Express 4, mysql2, bcryptjs, jsonwebtoken, helmet, express-rate-limit |
| Frontend | React 18, React Router 6, Vite 5, Web Audio API |
| Testing | node:test, SQL runner, Playwright |

Seed data: 13 accounts (11 listeners, a curator, an admin), 104 songs by fictional
artists in 12 Indian languages, English and instrumental, ≈ 2 600 plays over the 60 days
before setup (dates are relative to the day `db:setup` runs, so "this week" always has
data), ratings, likes and a partner feed that exercises every ingestion path (new, linked
by ISRC, duplicate for review, suspicious, invalid).

## 10. Testing

61 automated tests across authentication, recommendations, playback and feedback,
playlists, private sessions, administration and database guarantees; 42 SQL blocks
executed as the application account; browser walk-throughs on desktop, tablet and
phone. Details and results: [TESTING.md](TESTING.md). Two defects found by the tests
and fixed are documented there (deadlock under concurrent recommendation requests;
world generation during a private session).

## 11. Results

- Recommendations follow the request (energetic → the top 5 all have energy ≥ 0.6; Focus → average instrumentalness > 0.6, speechiness < 0.25) and respect diversity and content filters (tests).
- Behaviour changes results: a 1★ song never reappears; a like seeds "Because you liked"; a changed weight changes the ranking (tests).
- Private sessions leave 14 permanent tables byte-for-byte unchanged (test).
- Indexes reduce rows examined by one to two orders of magnitude on history queries (EXPLAIN).
- Concurrency experiments reproduce a lost update and its two fixes, and show why `SKIP LOCKED` needs a matching index.

## 12. Limitations

Audio features are provided values rather than computed from audio; collaborative
filtering is not implemented; a single MySQL instance; external providers are
implemented but were not exercised against the real services. See
[STATUS.md](STATUS.md) and [ASSUMPTIONS.md](ASSUMPTIONS.md).

## 13. Future scope

1. Collaborative filtering ("listeners like you") from the preference tables, computed as a weekly batch into a similarity table.
2. A real audio-analysis model registered as a new `AUDIO_FEATURES` model version; the schema already keeps versions side by side.
3. Partitioning of `listening_history` by month and read replicas for analytics.
4. A/B testing of model versions by assigning listeners to `intelligence_models` rows and comparing completion rates per batch.
5. Connecting a licensed preview provider through the existing contract (`docs/PROVIDERS.md`) and the `music_sources` rights model.
6. Multi-factor authentication and email-based password reset.

## 14. Conclusion

MUSE shows that a relational database can be the core of an intelligent, explainable
recommendation system rather than a passive store. Normalisation and constraints keep
the data trustworthy; procedures and window functions express learning and ranking;
triggers enforce rules no client can bypass, including privacy; transactions and
careful locking keep it correct under concurrency; and indexes keep it fast. Because
every number behind a recommendation is stored, the system can always say *why*.

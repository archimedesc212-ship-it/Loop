# LOOP × MUSE — project roadmap (87 features)

*Developed by Vaishnav Sai.* Generated from `feature-registry.json`; statuses come from code and passing tests only (see FEATURE_REGISTRY.md).

**Today:** VERIFIED 9 · IMPLEMENTED-UNVERIFIED 13 · PARTIAL 28 · PLANNED 28 · BLOCKED 7 · NOT IMPLEMENTED 2.

**Database:** the application database and the academic submission both stay at the 64-table baseline (migrations 0000–0004).
Proposed migrations `0005_roadmap_33_57.sql` (16 tables) and `0006_roadmap_58_87.sql` (14 tables) live in `database/migrations/proposed/`, which the migration runner does not read. They have been tested only on disposable schemas.

## Phases

### Stage 1 — Core product release (original 1–12)

VERIFIED 3 · IMPLEMENTED-UNVERIFIED 6 · PARTIAL 3 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 1 | Multi-Mood Blending | CORE | IMPLEMENTED-UNVERIFIED | — |
| 2 | Mood Journey Engine | CORE | IMPLEMENTED-UNVERIFIED | — |
| 3 | Context-Aware Recommendations | CORE | VERIFIED | — |
| 4 | Why This Song? | CORE | VERIFIED | — |
| 5 | Skip-Aware Learning | CORE | PARTIAL | — |
| 6 | Recommendation Diversity | CORE | IMPLEMENTED-UNVERIFIED | — |
| 7 | Smart Cold Start | CORE | VERIFIED | — |
| 8 | Recommendation Confidence | CORE | IMPLEMENTED-UNVERIFIED | — |
| 9 | Mood Dial | CORE | IMPLEMENTED-UNVERIFIED | — |
| 10 | Multilingual Search Intelligence | CORE | PARTIAL | — |
| 11 | Cross-Device Continuity | CORE | PARTIAL | — |
| 12 | Interactive ER Explorer | CORE | IMPLEMENTED-UNVERIFIED | — |

### Stage 2 — Intelligence and personal experience (original 13–24)

VERIFIED 2 · IMPLEMENTED-UNVERIFIED 4 · PARTIAL 5 · NOT IMPLEMENTED 1 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 13 | Mood Diary | CORE | IMPLEMENTED-UNVERIFIED | — |
| 14 | One-Tap Listening Modes | CORE | VERIFIED | — |
| 15 | Surprise Me | CORE | IMPLEMENTED-UNVERIFIED | — |
| 16 | Human vs Model Comparison | CORE | VERIFIED | — |
| 17 | Save My Mood Mix | CORE | PARTIAL | — |
| 18 | Personal Music Wrapped | CORE | PARTIAL | — |
| 19 | Taste Evolution Timeline | CORE | PARTIAL | — |
| 20 | Mood Calendar Heatmap | CORE | IMPLEMENTED-UNVERIFIED | — |
| 21 | Skip Pattern Intelligence | CORE | IMPLEMENTED-UNVERIFIED | — |
| 22 | Artist Discovery Graph | CORE | NOT IMPLEMENTED | — |
| 23 | Personal Recommendation Controls | CORE | PARTIAL | — |
| 24 | Privacy Control Centre | CORE | PARTIAL | — |

### Stage 3 — Advanced DBMS showcase (original 25–32)

PARTIAL 7 · NOT IMPLEMENTED 1 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 25 | SQL Query Studio | CORE | PARTIAL | — |
| 26 | SQL Execution Plan Visualizer | CORE | PARTIAL | — |
| 27 | Index Performance Lab | INFRA | NOT IMPLEMENTED | — |
| 28 | Transaction Demonstrator | CORE | PARTIAL | — |
| 29 | Permission Matrix | CORE | PARTIAL | — |
| 30 | Data Quality Centre | CORE | PARTIAL | — |
| 31 | Database Scenario Simulator | CORE | PARTIAL | — |
| 32 | Mood Disagreement Analysis | CORE | PARTIAL | — |

### Phase 4 — Intelligence on existing data (low risk, little or no schema change)

VERIFIED 3 · IMPLEMENTED-UNVERIFIED 1 · PARTIAL 2 · PLANNED 3 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 41 | Music Data Provenance | CORE | VERIFIED | — |
| 42 | Smart Duplicate Song Detection | CORE | IMPLEMENTED-UNVERIFIED | — |
| 45 | Song Mood Timeline | CORE | VERIFIED | — |
| 55 | Personal Listening Profile | CORE | VERIFIED | — |
| 48 | BPM and Harmonic Matching | CORE | PARTIAL | — |
| 51 | Music Discovery Passport | CORE | PLANNED | — |
| 49 | Time-Budget Playlist Generator | CORE | PLANNED | — |
| 47 | Intelligent Song Transitions | PLATFORM | PLANNED | — |
| 57 | Accessibility and Inclusive Mode | CORE | PARTIAL | — |

### Phase 5 — Social and collaboration

PARTIAL 2 · PLANNED 4 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 37 | LOOP Social Profiles | CORE | PLANNED | — |
| 34 | Collaborative Playlists | CORE | PLANNED | — |
| 38 | Playlist Notes and Reactions | CORE | PLANNED | — |
| 35 | Music Compatibility Match | CORE | PLANNED | #37 |
| 39 | MUSE Editorial Studio | CORE | PARTIAL | — |
| 40 | Community Metadata Contributions | CORE | PARTIAL | — |

### Phase 6 — Shared listening and engagement

PLANNED 5 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 33 | LOOP Listening Rooms | INFRA | PLANNED | — |
| 36 | Listening Party Scheduler | INFRA | PLANNED | #33 |
| 50 | Music Discovery Missions | CORE | PLANNED | — |
| 52 | Music Time Capsule | CORE | PLANNED | — |
| 53 | Seasonal and Occasion Mixes | CORE | PLANNED | — |

### Phase 7 — Provider- and platform-dependent

PLANNED 1 · BLOCKED 7 · no schema change

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 43 | Lyrics Intelligence and Search | PROVIDER | BLOCKED | — |
| 44 | Time-Synchronized Lyrics | PROVIDER | BLOCKED | — |
| 46 | Audio Fingerprint Intelligence | PROVIDER | BLOCKED | — |
| 54 | Mood-Based Music Alarm | PLATFORM | BLOCKED | — |
| 56 | Voice-Controlled LOOP | PLATFORM | PLANNED | — |
| 62 | Playback Quality Selector | PROVIDER | BLOCKED | — |
| 70 | New Release Radar | PROVIDER | BLOCKED | #71 |
| 78 | Consent and API Connection Centre | PROVIDER | BLOCKED | #35, #37 |

### Phase 8 — Listening tools (no new tables except bookmarks)

IMPLEMENTED-UNVERIFIED 1 · PARTIAL 2 · PLANNED 3 · schema: `0006_roadmap_58_87.sql`

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 58 | Smart Queue Autopilot | CORE | PARTIAL | — |
| 59 | Personal Radio Station | CORE | PARTIAL | — |
| 72 | Personal Music Radio | CORE | PLANNED | #59 |
| 60 | Sleep Timer with Audio Fade | CORE | IMPLEMENTED-UNVERIFIED | — |
| 61 | Focus Timer + Music | CORE | PLANNED | — |
| 63 | Listening Session Bookmarks | CORE | PLANNED | — |

### Phase 9 — Playlist tools, sharing and community (needs P5)

PARTIAL 1 · PLANNED 9 · schema: `0006_roadmap_58_87.sql`

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 64 | Playlist Health Score | CORE | PLANNED | — |
| 65 | Duplicate Playlist Cleaner | CORE | PARTIAL | — |
| 68 | Playlist Alternative Finder | CORE | PLANNED | — |
| 66 | Playlist Version History | CORE | PLANNED | #34 |
| 67 | Playlist Conflict Resolver | CORE | PLANNED | #34, #66 |
| 69 | QR Playlist Sharing | CORE | PLANNED | #34 |
| 73 | Playlist Sharing Cards | CORE | PLANNED | #69 |
| 71 | Artist Follow Notifications | CORE | PLANNED | — |
| 74 | Curator Leaderboard | CORE | PLANNED | #37, #40 |
| 75 | Community Music Collections | CORE | PLANNED | #39 |

### Phase 10 — Account, privacy and security

VERIFIED 1 · IMPLEMENTED-UNVERIFIED 1 · PARTIAL 3 · schema: `0006_roadmap_58_87.sql`

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 76 | Active Device Manager | CORE | VERIFIED | — |
| 77 | Login Activity Timeline | CORE | PARTIAL | — |
| 79 | Automatic Data Retention Rules | CORE | PARTIAL | #57 |
| 80 | Personal Data Export | CORE | IMPLEMENTED-UNVERIFIED | — |
| 81 | Account Recovery and Security Centre | PROVIDER | PARTIAL | #76, #77 |

### Phase 11 — Operations and platform

PARTIAL 3 · PLANNED 3 · schema: `0006_roadmap_58_87.sql`

| # | Feature | Dependency | Status | Needs first |
| --- | --- | --- | --- | --- |
| 83 | Migration History Dashboard | CORE | PARTIAL | — |
| 84 | API Health Monitor | CORE | PARTIAL | — |
| 87 | Load and Performance Lab | INFRA | PARTIAL | — |
| 86 | Feature Flag Manager | CORE | PLANNED | — |
| 85 | Recommendation A/B Testing | CORE | PLANNED | — |
| 82 | Database Backup and Restore Centre | INFRA | PLANNED | — |

## Recommended order of work

1. **Close the gaps of existing features first** — the PARTIAL features in S1–S3 and P4 need no new tables; finishing them raises VERIFIED without schema risk.
2. **P10 account and privacy items that need no migration** — 80 Personal Data Export and the remaining UI of 76/83/84 reuse existing tables.
3. **Promote 0005 in slices, not all at once** — e.g. the user_follows + profile columns slice for 37, then playlist collaboration for 34/38, each passing the gate below before the next.
4. **P8 and P9** — mostly computed features; 0006 objects are promoted only with the feature that uses them (bookmarks with 63, revisions with 66, …).
5. **P11 operations** — 83/84 first (read-only), then flags (86) before experiments (85); backups (82) need server infrastructure.
6. **P7 provider/platform features stay BLOCKED** until the listed external requirement exists; no mock or placeholder integration is shipped.

## Release gate (every phase)

1. All backend tests (npm test) and frontend tests (npm run test:web) pass; npm run roadmap:verify confirms every VERIFIED feature cites a test that passed in that run.
2. The submitted 64-table baseline is unchanged: node backend/scripts/test-phase2-sql.js shows 0 structural differences, node backend/scripts/roadmap/phase2-data-regression.js shows no submitted row missing except rows removed by designed jobs, and npm run phase3:test passes. (Do not run npm run db:phase2 for this: it regenerates the submitted files.)
3. The promoted proposed migration passes npm run roadmap:test-migration (fresh install, re-run, partial states, interrupted runs, drift, grants) and npm run roadmap:mutation catches every listed mutation.
4. npm run roadmap:check passes (no reference to a table, route, screen or test that does not exist).
5. The migration is reviewed by a second person, then copied from proposed/ to database/migrations/ under its number and applied with npm run db:migrate — never edited after it has been applied anywhere.

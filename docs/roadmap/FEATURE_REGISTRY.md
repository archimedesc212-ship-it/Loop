# LOOP × MUSE — 87-feature master registry

Developed by Vaishnav Sai. Generated from `feature-registry.json` by `backend/scripts/roadmap/check-registry.js`, which checks every reference against the code and every VERIFIED status against the test run of 2026-10-31 (121 backend + 34 frontend passing tests).

**All 87:** VERIFIED 9 · IMPLEMENTED-UNVERIFIED 1 · PARTIAL 33 · PLANNED 30 · BLOCKED 7 · NOT IMPLEMENTED 7

**Original 1–32:** VERIFIED 5 · PARTIAL 20 · NOT IMPLEMENTED 7

**Expansion 33–57:** VERIFIED 3 · IMPLEMENTED-UNVERIFIED 1 · PARTIAL 4 · PLANNED 13 · BLOCKED 4

**Expansion 58–87:** VERIFIED 1 · PARTIAL 9 · PLANNED 17 · BLOCKED 3

**By dependency:** CORE 72 · INFRA 5 · PROVIDER 7 · PLATFORM 3

No feature is reported as implemented unless the code exists; VERIFIED additionally needs passing automated tests. The proposed migrations 0005 and 0006 are **not applied** to the application database.

## Status definitions

- **VERIFIED** — Source exists and an automated test that passes today proves the behaviour.
- **IMPLEMENTED-UNVERIFIED** — Source exists, but no automated test covers the core behaviour yet.
- **PARTIAL** — Some of the behaviour exists; the listed gaps remain.
- **PLANNED** — Designed (data, API, UI, security, tests) but not implemented in the application.
- **BLOCKED** — Needs an external provider, licence, platform capability or hardware that is not available.
- **NOT IMPLEMENTED** — No working implementation and no detailed design yet.

## Dependency types

- **CORE** — Needs only MUSE (MySQL + Express + React).
- **INFRA** — Needs extra infrastructure we control (e.g. a WebSocket channel, a job scheduler).
- **PROVIDER** — Needs a licensed external provider or API key.
- **PLATFORM** — Needs a browser or operating-system capability that is not available everywhere.

## Registry

| # | Feature | Phase | Dependency | Status | New database objects | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Multi-Mood Blending | S1 | CORE | PARTIAL | — | — |
| 2 | Mood Journey Engine | S1 | CORE | NOT IMPLEMENTED | — | — |
| 3 | Context-Aware Recommendations | S1 | CORE | VERIFIED | — | — |
| 4 | Why This Song? | S1 | CORE | VERIFIED | — | — |
| 5 | Skip-Aware Learning | S1 | CORE | PARTIAL | — | — |
| 6 | Recommendation Diversity | S1 | CORE | PARTIAL | — | — |
| 7 | Smart Cold Start | S1 | CORE | VERIFIED | — | — |
| 8 | Recommendation Confidence | S1 | CORE | NOT IMPLEMENTED | — | — |
| 9 | Mood Dial | S1 | CORE | NOT IMPLEMENTED | — | — |
| 10 | Multilingual Search Intelligence | S1 | CORE | PARTIAL | — | — |
| 11 | Cross-Device Continuity | S1 | CORE | PARTIAL | — | — |
| 12 | Interactive ER Explorer | S1 | CORE | NOT IMPLEMENTED | — | — |
| 13 | Mood Diary | S2 | CORE | NOT IMPLEMENTED | — | — |
| 14 | One-Tap Listening Modes | S2 | CORE | VERIFIED | — | — |
| 15 | Surprise Me | S2 | CORE | PARTIAL | — | — |
| 16 | Human vs Model Comparison | S2 | CORE | VERIFIED | — | — |
| 17 | Save My Mood Mix | S2 | CORE | PARTIAL | — | — |
| 18 | Personal Music Wrapped | S2 | CORE | PARTIAL | — | — |
| 19 | Taste Evolution Timeline | S2 | CORE | PARTIAL | — | — |
| 20 | Mood Calendar Heatmap | S2 | CORE | PARTIAL | — | — |
| 21 | Skip Pattern Intelligence | S2 | CORE | PARTIAL | — | — |
| 22 | Artist Discovery Graph | S2 | CORE | NOT IMPLEMENTED | — | — |
| 23 | Personal Recommendation Controls | S2 | CORE | PARTIAL | — | — |
| 24 | Privacy Control Centre | S2 | CORE | PARTIAL | — | — |
| 25 | SQL Query Studio | S3 | CORE | PARTIAL | — | — |
| 26 | SQL Execution Plan Visualizer | S3 | CORE | PARTIAL | — | — |
| 27 | Index Performance Lab | S3 | INFRA | NOT IMPLEMENTED | — | — |
| 28 | Transaction Demonstrator | S3 | CORE | PARTIAL | — | — |
| 29 | Permission Matrix | S3 | CORE | PARTIAL | — | — |
| 30 | Data Quality Centre | S3 | CORE | PARTIAL | — | — |
| 31 | Database Scenario Simulator | S3 | CORE | PARTIAL | — | — |
| 32 | Mood Disagreement Analysis | S3 | CORE | PARTIAL | — | — |
| 33 | LOOP Listening Rooms | P6 | INFRA | PLANNED | listening_rooms, listening_room_members, listening_room_queue | — |
| 34 | Collaborative Playlists | P5 | CORE | PLANNED | playlist_collaborators, playlists.visibility, playlists.version, playlist_songs.added_by | — |
| 35 | Music Compatibility Match | P5 | CORE | PLANNED | user_profiles.allow_compatibility | #37 |
| 36 | Listening Party Scheduler | P6 | INFRA | PLANNED | — | #33 |
| 37 | LOOP Social Profiles | P5 | CORE | PLANNED | user_follows, user_profiles.bio, user_profiles.profile_visibility | — |
| 38 | Playlist Notes and Reactions | P5 | CORE | PLANNED | playlist_notes, playlist_reactions | — |
| 39 | MUSE Editorial Studio | P5 | CORE | PARTIAL | playlists.kind, playlists.published_at | — |
| 40 | Community Metadata Contributions | P5 | CORE | PARTIAL | metadata_suggestions | — |
| 41 | Music Data Provenance | P4 | CORE | VERIFIED | — | — |
| 42 | Smart Duplicate Song Detection | P4 | CORE | IMPLEMENTED-UNVERIFIED | — | — |
| 43 | Lyrics Intelligence and Search | P7 | PROVIDER | BLOCKED | — | — |
| 44 | Time-Synchronized Lyrics | P7 | PROVIDER | BLOCKED | — | — |
| 45 | Song Mood Timeline | P4 | CORE | VERIFIED | — | — |
| 46 | Audio Fingerprint Intelligence | P7 | PROVIDER | BLOCKED | — | — |
| 47 | Intelligent Song Transitions | P4 | PLATFORM | PLANNED | user_settings, fn_harmonic_compat | — |
| 48 | BPM and Harmonic Matching | P4 | CORE | PARTIAL | fn_harmonic_compat | — |
| 49 | Time-Budget Playlist Generator | P4 | CORE | PLANNED | recommendation_batches.target_duration_sec | — |
| 50 | Music Discovery Missions | P6 | CORE | PLANNED | discovery_missions, user_missions, v_user_mission_progress | — |
| 51 | Music Discovery Passport | P4 | CORE | PLANNED | v_discovery_passport | — |
| 52 | Music Time Capsule | P6 | CORE | PLANNED | time_capsules, time_capsule_songs | — |
| 53 | Seasonal and Occasion Mixes | P6 | CORE | PLANNED | occasions, occasion_windows, occasion_moods | — |
| 54 | Mood-Based Music Alarm | P7 | PLATFORM | BLOCKED | — | — |
| 55 | Personal Listening Profile | P4 | CORE | VERIFIED | — | — |
| 56 | Voice-Controlled LOOP | P7 | PLATFORM | PLANNED | — | — |
| 57 | Accessibility and Inclusive Mode | P4 | CORE | PARTIAL | user_settings | — |
| 58 | Smart Queue Autopilot | P8 | CORE | PARTIAL | recommendation_batches.strategy | — |
| 59 | Personal Radio Station | P8 | CORE | PARTIAL | recommendation_batches.seed_artist_id, recommendation_batches.strategy | — |
| 60 | Sleep Timer with Audio Fade | P8 | CORE | PLANNED | — | — |
| 61 | Focus Timer + Music | P8 | CORE | PLANNED | — | — |
| 62 | Playback Quality Selector | P7 | PROVIDER | BLOCKED | — | — |
| 63 | Listening Session Bookmarks | P8 | CORE | PLANNED | listening_bookmarks | — |
| 64 | Playlist Health Score | P9 | CORE | PLANNED | — | — |
| 65 | Duplicate Playlist Cleaner | P9 | CORE | PARTIAL | — | — |
| 66 | Playlist Version History | P9 | CORE | PLANNED | playlist_revisions, playlist_revision_songs | #34 |
| 67 | Playlist Conflict Resolver | P9 | CORE | PLANNED | — | #34, #66 |
| 68 | Playlist Alternative Finder | P9 | CORE | PLANNED | — | — |
| 69 | QR Playlist Sharing | P9 | CORE | PLANNED | playlist_share_links | #34 |
| 70 | New Release Radar | P7 | PROVIDER | BLOCKED | — | #71 |
| 71 | Artist Follow Notifications | P9 | CORE | PLANNED | artist_follows, notifications | — |
| 72 | Personal Music Radio | P8 | CORE | PLANNED | — | #59 |
| 73 | Playlist Sharing Cards | P9 | CORE | PLANNED | — | #69 |
| 74 | Curator Leaderboard | P9 | CORE | PLANNED | playlist_saves | #37, #40 |
| 75 | Community Music Collections | P9 | CORE | PLANNED | collection_submissions | #39 |
| 76 | Active Device Manager | P10 | CORE | VERIFIED | — | — |
| 77 | Login Activity Timeline | P10 | CORE | PARTIAL | login_events | — |
| 78 | Consent and API Connection Centre | P7 | PROVIDER | BLOCKED | — | #35, #37 |
| 79 | Automatic Data Retention Rules | P10 | CORE | PARTIAL | retention_policies, user_settings.history_retention_days, pipeline_jobs.job_type | #57 |
| 80 | Personal Data Export | P10 | CORE | PLANNED | — | — |
| 81 | Account Recovery and Security Centre | P10 | PROVIDER | PARTIAL | — | #76, #77 |
| 82 | Database Backup and Restore Centre | P11 | INFRA | PLANNED | pipeline_jobs.job_type | — |
| 83 | Migration History Dashboard | P11 | CORE | PARTIAL | — | — |
| 84 | API Health Monitor | P11 | CORE | PARTIAL | — | — |
| 85 | Recommendation A/B Testing | P11 | CORE | PLANNED | experiments, experiment_arms, recommendation_batches.experiment_arm_id | — |
| 86 | Feature Flag Manager | P11 | CORE | PLANNED | feature_flags, feature_flag_overrides | — |
| 87 | Load and Performance Lab | P11 | INFRA | PARTIAL | — | — |

## Phased plan

- **S1** — Stage 1 — Core product release (original 1–12)
- **S2** — Stage 2 — Intelligence and personal experience (original 13–24)
- **S3** — Stage 3 — Advanced DBMS showcase (original 25–32)
- **P4** — Phase 4 — Intelligence on existing data (low risk, little or no schema change): #41, #42, #45, #55, #48, #51, #49, #47, #57
- **P5** — Phase 5 — Social and collaboration: #37, #34, #38, #35, #39, #40
- **P6** — Phase 6 — Shared listening and engagement: #33, #36, #50, #52, #53
- **P7** — Phase 7 — Provider- and platform-dependent: #43, #44, #46, #54, #56, #62, #70, #78
- **P8** — Phase 8 — Listening tools (no new tables except bookmarks): #58, #59, #72, #60, #61, #63
- **P9** — Phase 9 — Playlist tools, sharing and community (needs P5): #64, #65, #68, #66, #67, #69, #73, #71, #74, #75
- **P10** — Phase 10 — Account, privacy and security: #76, #77, #79, #80, #81
- **P11** — Phase 11 — Operations and platform: #83, #84, #87, #86, #85, #82

**Gate before each phase is released:**

1. All backend tests (npm test) and frontend tests (npm run test:web) pass; npm run roadmap:verify confirms every VERIFIED feature cites a test that passed in that run.
2. The submitted 64-table baseline is unchanged: node backend/scripts/test-phase2-sql.js shows 0 structural differences, node backend/scripts/roadmap/phase2-data-regression.js shows no submitted row missing except rows removed by designed jobs, and npm run phase3:test passes. (Do not run npm run db:phase2 for this: it regenerates the submitted files.)
3. The promoted proposed migration passes npm run roadmap:test-migration (fresh install, re-run, partial states, interrupted runs, drift, grants) and npm run roadmap:mutation catches every listed mutation.
4. npm run roadmap:check passes (no reference to a table, route, screen or test that does not exist).
5. The migration is reviewed by a second person, then copied from proposed/ to database/migrations/ under its number and applied with npm run db:migrate — never edited after it has been applied anywhere.

## Features 33–87 in detail

### 33. LOOP Listening Rooms

**Status:** PLANNED · **Dependency:** INFRA · **Phase:** P6

A host plays a shared queue to invited listeners in real time.

- **Reuses:** tables `users`, `songs`, `moods`, `listening_sessions`, `listening_history`; views —; routines —; APIs `POST /playback/start`; UI —
- **Database change:** new table `listening_rooms`, new table `listening_room_members`, new table `listening_room_queue`. A room has its own lifecycle, members with roles and an ordered shared queue; no existing table models a shared session (listening_sessions belong to one user).
- **API:** `POST /rooms`; `GET /rooms/:id`; `POST /rooms/:id/members`; `POST /rooms/:id/queue`; `PUT /rooms/:id/state (host only, with state_version)`; `POST /rooms/:id/join`; `POST /rooms/:id/leave`; `GET /rooms/:id/events (Server-Sent Events or WebSocket)`
- **Frontend:** Room screen with shared Now Playing, member list and queue; Join from an invite link; Host controls (play, pause, skip, reorder); Clear 'not synced' state when the connection drops
- **Security and privacy:** Only the host or a co-host changes playback state; INVITE_ONLY rooms require membership; state_version rejects stale updates (optimistic concurrency); Each member's own play is recorded in their own history only if they are not in a private session
- **Tests to add:** non-member cannot read or join an invite-only room (403); listener cannot change playback state (403); stale state_version is rejected (409); LIVE room without started_at is rejected by the database; member in a private session leaves no permanent history
- **External blocker:** A real-time channel (SSE or WebSocket) and its hosting; Synchronised playback is limited to songs with a permitted audio source; metadata-only songs cannot be played together

### 34. Collaborative Playlists

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P5

Invite editors and viewers to a playlist; see who added what.

- **Reuses:** tables `playlists`, `playlist_songs`; views —; routines —; APIs `GET /playlists/:id`, `POST /playlists/:id/songs`, `DELETE /playlists/:id/songs/:songId`; UI `frontend/src/pages/Library.jsx`
- **Database change:** new table `playlist_collaborators`, column `playlists.visibility`, column `playlists.version`, column `playlist_songs.added_by`. Membership with a role is a M:N between users and playlists; version enables optimistic locking for concurrent edits; added_by records authorship.
- **API:** `POST /playlists/:id/collaborators`; `PATCH /playlists/:id/collaborators/:userId`; `DELETE /playlists/:id/collaborators/:userId`; `POST /playlists/:id/collaborators/accept`; `If-Match: version on every playlist write`
- **Frontend:** Share dialog with role selection; Invitation inbox; 'Added by' on each entry; Conflict message when the playlist changed meanwhile
- **Security and privacy:** Only the owner manages collaborators; VIEWERs cannot write; Existing private-by-default behaviour stays the default (visibility PRIVATE)
- **Passing tests:** "playlists are private to their owner"
- **Tests to add:** owner invites an editor; editor adds a song; added_by is recorded; viewer cannot add songs (403); stale version is rejected (409); ACCEPTED invitation without accepted_at is rejected by the database

### 35. Music Compatibility Match

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P5 · **Depends on:** #37 LOOP Social Profiles

A taste-overlap score between two consenting listeners, with what you share.

- **Reuses:** tables `user_mood_preferences`, `user_genre_preferences`, `user_artist_preferences`, `user_languages`, `user_follows`; views —; routines —; APIs —; UI —
- **Database change:** column `user_profiles.allow_compatibility`. Explicit opt-in consent; the score itself is computed on request from the existing preference tables and is not stored.
- **API:** `GET /users/:id/compatibility (both users must allow it)`
- **Frontend:** Compatibility card on a profile: score, shared moods, genres, artists; Consent toggle in settings
- **Security and privacy:** Both users must have allow_compatibility = 1; Returns only overlap categories, never the other user's history; Not available in private sessions
- **Tests to add:** refused unless both users consent (403); score is symmetric for A–B and B–A; users with no preferences get 'not enough data', not 0 %

### 36. Listening Party Scheduler

**Status:** PLANNED · **Dependency:** INFRA · **Phase:** P6 · **Depends on:** #33 LOOP Listening Rooms

Schedule a listening room in advance and invite people.

- **Reuses:** tables `listening_rooms`, `listening_room_members`; views —; routines —; APIs —; UI —
- **Database change:** none. No extra table: a SCHEDULED room with scheduled_start_at and INVITED/ACCEPTED/DECLINED members (from feature 33).
- **API:** `POST /rooms (status SCHEDULED)`; `POST /rooms/:id/rsvp`; `DELETE /rooms/:id (cancel)`
- **Frontend:** Schedule form with date/time and time zone; RSVP list; Upcoming parties on Home
- **Security and privacy:** Only the host edits or cancels; Invitees see only their invitations
- **Tests to add:** SCHEDULED room without a start time is rejected by the database; RSVP updates the member status; cancelled party cannot be joined
- **External blocker:** Reminders need web push (PLATFORM: not available on every browser) or email (PROVIDER); in-app reminders work without either

### 37. LOOP Social Profiles

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P5

Optional public profile with bio, follows and chosen highlights.

- **Reuses:** tables `user_profiles`, `users`; views —; routines —; APIs `PATCH /me/settings`; UI `frontend/src/pages/Profile.jsx`
- **Database change:** new table `user_follows`, column `user_profiles.bio`, column `user_profiles.profile_visibility`. Following is a M:N relationship of users with themselves; visibility is a property of the profile.
- **API:** `GET /users/:id/profile`; `POST /users/:id/follow`; `DELETE /users/:id/follow`; `GET /me/followers`; `GET /me/following`
- **Frontend:** Public profile page; Follow button; Visibility setting (Private default)
- **Security and privacy:** Profiles are PRIVATE by default; Listening history is never public; Self-follow refused by a database trigger
- **Tests to add:** private profile returns 404 to others; self-follow is rejected by the database; follow twice is a duplicate

### 38. Playlist Notes and Reactions

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P5

Short notes and one emoji reaction per person on playlist entries.

- **Reuses:** tables `playlist_songs`, `playlists`; views —; routines —; APIs —; UI —
- **Database change:** new table `playlist_notes`, new table `playlist_reactions`. Many people can annotate one playlist entry; both reference the entry through the composite key of playlist_songs, so removing a song removes its notes and reactions.
- **API:** `GET /playlists/:id/notes`; `POST /playlists/:id/notes`; `PATCH /notes/:id`; `DELETE /notes/:id`; `PUT /playlists/:id/songs/:songId/reaction`; `DELETE /playlists/:id/songs/:songId/reaction`
- **Frontend:** Notes drawer per entry; Reaction picker; Counts per reaction
- **Security and privacy:** Only people who can view the playlist can read notes; Only the author edits a note; the owner may remove any note; Notes are plain text (rendered escaped)
- **Tests to add:** second reaction by the same user is a duplicate; reaction on a song not in the playlist is rejected by the database; removing a song cascades its notes and reactions; empty note is rejected by the database

### 39. MUSE Editorial Studio

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P5

Curators build, schedule and publish editorial playlists from the catalogue.

- **Reuses:** tables `playlists`, `playlist_songs`, `audit_logs`; views —; routines —; APIs `POST /admin/songs`, `PUT /admin/songs/:id/moods/:moodId`; UI `frontend/src/pages/admin/CatalogAdmin.jsx`
- **Database change:** column `playlists.kind`, column `playlists.published_at`. Editorial lists are playlists with kind EDITORIAL (one more subclass in the EER specialization) and a publication time.
- **API:** `POST /admin/editorial`; `PATCH /admin/editorial/:id`; `POST /admin/editorial/:id/publish`; `GET /editorial`
- **Frontend:** Editorial Studio in Admin (draft, preview, publish); Editorial shelf on Home
- **Security and privacy:** Requires catalog.write (Curator, Administrator), enforced on the backend; Publishing is audited
- **Passing tests:** "a curator adds a song: provenance recorded, analysed, mood-tagged, audited"
- **Tests to add:** listener cannot create editorial lists (403); unpublished list is invisible to listeners; published_at on a PRIVATE list is rejected by the database
- **Gaps:** Curator catalogue tools exist; editorial playlists do not.

### 40. Community Metadata Contributions

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P5

Listeners suggest corrections; staff accept or reject them.

- **Reuses:** tables `song_mood_curations`, `review_queue`, `audit_logs`; views —; routines —; APIs `GET /admin/reviews`, `POST /admin/reviews/:id/decision`; UI —
- **Database change:** new table `metadata_suggestions`. A suggestion has a contributor, a field and a decision; review_queue is tied to import records and jobs, so mixing them would break its meaning.
- **API:** `POST /songs/:id/suggestions`; `GET /me/suggestions`; `DELETE /me/suggestions/:id (withdraw)`; `GET /admin/suggestions`; `POST /admin/suggestions/:id/decision`
- **Frontend:** 'Suggest a correction' on the song page; My suggestions list; Review screen for staff
- **Security and privacy:** Rate-limited per user; Accepting a suggestion goes through the same validated catalogue update as staff edits, with an audit record; One open suggestion per user, song and field (database unique key)
- **Passing tests:** "ingestion is idempotent and review decisions are enforced and audited"
- **Tests to add:** second open suggestion for the same field is a duplicate; listener cannot decide suggestions (403); accepted suggestion updates the song and writes an audit record
- **Gaps:** Staff curation and review decisions exist; listener suggestions do not.

### 41. Music Data Provenance

**Status:** VERIFIED · **Dependency:** CORE · **Phase:** P4

Show where every song's metadata came from: source, licence, match method, rights, verification.

- **Reuses:** tables `source_records`, `music_sources`, `pipeline_jobs`, `audit_logs`; views —; routines —; APIs `GET /songs/:id`, `GET /admin/jobs/:id`; UI `frontend/src/pages/Catalog.jsx`
- **Database change:** none. None needed.
- **Security and privacy:** YouTube metadata records are excluded from provenance (shown as video links instead); Raw payloads are not exposed to listeners
- **Passing tests:** "41 provenance: each source record of a song is returned with source, licence, match method and rights"; "a curator adds a song: provenance recorded, analysed, mood-tagged, audited"
- **Gaps:** Next: link each provenance row to its import job in the song page.

### 42. Smart Duplicate Song Detection

**Status:** IMPLEMENTED-UNVERIFIED · **Dependency:** CORE · **Phase:** P4

Detect duplicates on import (ISRC, normalised title + artist + duration, fuzzy match) and merge safely.

- **Reuses:** tables `songs`, `review_queue`, `source_records`; views —; routines `sp_merge_songs`; APIs `POST /admin/songs/merge`, `POST /admin/reviews/:id/decision`; UI `frontend/src/pages/admin/CatalogAdmin.jsx`
- **Database change:** none. None needed: songs.normalized_title (generated), unique key uq_songs_identity and review_type POSSIBLE_DUPLICATE already exist.
- **Passing tests:** "duplicate songs merge into the canonical record without losing history"; "merging duplicate songs carries mood ratings to the canonical song"
- **Tests to add:** an incoming record with an existing ISRC links to the song instead of creating one; a near-identical title by the same artist opens a POSSIBLE_DUPLICATE review
- **Gaps:** Merging is verified; the ISRC/exact/fuzzy detection path in ingestService.js has no dedicated test yet. Audio-based duplicate detection depends on feature 46.

### 43. Lyrics Intelligence and Search

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7

Search by lyric lines and analyse lyric themes.

- **Reuses:** tables `music_sources`, `source_records`, `languages`; views —; routines —; APIs —; UI —
- **Database change:** none. Deferred. Design: song_lyrics (song_id, source_id, external_ref, rights_status, language_id, fetched_at, expires_at, lyrics_text only when the licence allows storage) with a FULLTEXT ngram index. Not created until a licence decides what may be stored.
- **Security and privacy:** Store or display lyrics only as the provider licence allows; MUSE currently stores no lyrics; Show attribution required by the provider
- **Tests to add:** with the provider disabled the feature reports 'not available', never empty results; provider errors are reported clearly (same pattern as existing provider tests)
- **External blocker:** A licensed lyrics provider and its terms (PROVIDER)

### 44. Time-Synchronized Lyrics

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7

Lyrics highlighted line by line during playback.

- **Reuses:** tables —; views —; routines —; APIs —; UI —
- **Database change:** none. Deferred. Design: song_lyric_lines (song_id, line_no, start_ms, end_ms, text) under the same licence rules as 43.
- **External blocker:** A provider that licenses timed lyrics (PROVIDER); A permitted, full-length audio source; previews and the demo sketch do not match lyric timing

### 45. Song Mood Timeline

**Status:** VERIFIED · **Dependency:** CORE · **Phase:** P4

How a song's mood changes from section to section.

- **Reuses:** tables `mood_segments`, `moods`, `intelligence_models`; views —; routines —; APIs `GET /songs/:id`; UI `frontend/src/pages/Catalog.jsx`
- **Database change:** none. None needed.
- **Passing tests:** "45 mood timeline: segments come from the active model, ordered, non-overlapping, inside the song"; "45 mood timeline: a song without segment analysis returns an empty timeline, not invented segments"; "mood segments must stay inside the song and may not overlap"

### 46. Audio Fingerprint Intelligence

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7

Identify recordings and duplicates from the audio itself.

- **Reuses:** tables —; views —; routines —; APIs —; UI —
- **Database change:** none. Deferred. Design: audio_fingerprints (song_id, algorithm, fingerprint VARBINARY, duration_sec, computed_at).
- **External blocker:** Audio files we are licensed to analyse, or a fingerprint service and its key (PROVIDER)

### 47. Intelligent Song Transitions

**Status:** PLANNED · **Dependency:** PLATFORM · **Phase:** P4

Order songs for smooth tempo, key and energy changes, with optional crossfade.

- **Reuses:** tables `audio_features`; views —; routines `fn_tempo_fit`, `fn_feature_similarity`; APIs —; UI `frontend/src/hooks/usePlayer.jsx`
- **Database change:** new table `user_settings`, function `fn_harmonic_compat`. crossfade_sec follows the account across devices; the transition score uses the harmonic function from feature 48.
- **API:** `GET /queue/transition-order?songIds=… (returns the order and the score of each step)`; `PATCH /me/settings (crossfadeSec)`
- **Frontend:** Crossfade setting (0–12 s); 'Smooth order' action on a queue or playlist with the reason for each step
- **Security and privacy:** Read-only scoring; no change to stored playlists unless the user saves
- **Tests to add:** crossfade above 12 s is rejected by the database; transition order never repeats a song; songs without audio features keep their position and are flagged
- **External blocker:** Crossfade needs two permitted audio sources playing at once (Web Audio API); metadata-only songs cannot crossfade

### 48. BPM and Harmonic Matching

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P4

Find songs that match a song's tempo and musical key.

- **Reuses:** tables `audio_features`; views —; routines `fn_tempo_fit`; APIs —; UI `frontend/src/pages/Catalog.jsx`
- **Database change:** function `fn_harmonic_compat`. Key and mode are already stored per analysis; only the Camelot-wheel compatibility function is new.
- **API:** `GET /songs/:id/matches?by=bpm|key|both`
- **Frontend:** 'Matches' panel on the song page showing BPM, key and compatibility
- **Security and privacy:** Read-only: uses catalogue analysis data only, no personal data; Inactive or metadata-only songs are labelled, never presented as playable
- **Tests to add:** C major is fully compatible with itself and 0.8 with G major and A minor (function tested on a disposable schema); results exclude the song itself and inactive songs
- **Gaps:** Tempo and key data and tempo fitting exist; harmonic matching and the API do not.

### 49. Time-Budget Playlist Generator

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P4

Fill an exact time (e.g. a 40-minute commute) with songs for a mood or context.

- **Reuses:** tables `songs`, `recommendation_batches`, `recommendation_items`; views —; routines `sp_generate_recommendations`; APIs `POST /playlists/smart/:type`; UI —
- **Database change:** column `recommendation_batches.target_duration_sec`. Records the requested length so the generated list can be explained and regenerated.
- **API:** `POST /recommendations/time-budget { minutes, moodIds | contextCode }`
- **Frontend:** Minutes picker; Total vs target shown, with the difference
- **Security and privacy:** The generated list belongs to the requester; saving it uses the existing playlist ownership checks; Private-session requests leave no permanent batch (existing incognito rules)
- **Tests to add:** total duration is within ±60 s of the target when the catalogue allows; target below 5 minutes is rejected by the database; not enough songs returns the best fill and says so

### 50. Music Discovery Missions

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P6

Opt-in challenges such as 'finish 5 Bengali songs this month'.

- **Reuses:** tables `listening_history`, `songs`, `languages`, `genres`, `song_moods`; views —; routines —; APIs —; UI —
- **Database change:** new table `discovery_missions`, new table `user_missions`, view `v_user_mission_progress`. Missions and enrolment are new facts; progress is computed by a view from real plays so it can never disagree with listening history.
- **API:** `GET /missions`; `POST /missions/:id/join`; `GET /me/missions`
- **Frontend:** Missions list with progress bars; Completion moment
- **Security and privacy:** Progress only from the user's own completed plays; Private-session plays never count
- **Tests to add:** mission with two criteria is rejected by the database; view progress equals a direct count of completed plays (passes on a disposable schema); plays before joining do not count

### 51. Music Discovery Passport

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P4

Stamps for every language, genre and region a listener has explored.

- **Reuses:** tables `listening_history`, `songs`, `languages`, `song_genres`, `genres`, `artists`, `regions`; views —; routines —; APIs —; UI —
- **Database change:** view `v_discovery_passport`. No table: every stamp is derived from completed plays.
- **API:** `GET /me/passport`
- **Frontend:** Passport page with stamps and first-heard dates
- **Security and privacy:** Own data only
- **Tests to add:** view returns language, genre and region stamps from real plays (passes on a disposable schema); a new user has an empty passport

### 52. Music Time Capsule

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P6

Seal songs and a message to reopen on a future date.

- **Reuses:** tables `songs`, `users`; views —; routines —; APIs —; UI —
- **Database change:** new table `time_capsules`, new table `time_capsule_songs`. A capsule is its own entity with an ordered set of songs.
- **API:** `POST /capsules`; `GET /me/capsules`; `GET /capsules/:id (contents only after unlock_at)`; `POST /capsules/:id/open`
- **Frontend:** Create capsule; Countdown card; Opening view
- **Security and privacy:** Private to the owner; Contents withheld by the API until unlock time
- **Tests to add:** capsule that unlocks in the past is rejected by the database; opening before unlock_at is rejected by the database; another user cannot read a capsule (404)
- **External blocker:** An unlock reminder outside the app needs web push or email; the app shows unlocked capsules on next visit without them

### 53. Seasonal and Occasion Mixes

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P6

Mixes for festivals and seasons (Diwali, Onam, Monsoon …), by region.

- **Reuses:** tables `moods`, `regions`, `recommendation_batches`; views —; routines `sp_generate_recommendations`; APIs —; UI —
- **Database change:** new table `occasions`, new table `occasion_windows`, new table `occasion_moods`. Festival dates move every year (lunar calendars), so dates live per year in occasion_windows; contexts are situations, not dated events.
- **API:** `GET /occasions/current`; `POST /recommendations/occasion/:code`
- **Frontend:** Occasion banner on Home while a window is active
- **Security and privacy:** Occasions and dates maintained by curators (catalog.write)
- **Tests to add:** window ending before it starts is rejected by the database; only occasions active today are returned; regional occasion only shown for that region
- **External blocker:** Curators must enter real dates per year; no dates are invented

### 54. Mood-Based Music Alarm

**Status:** BLOCKED · **Dependency:** PLATFORM · **Phase:** P7

Wake up to music for a chosen mood.

- **Reuses:** tables —; views —; routines —; APIs —; UI —
- **Database change:** none. Deferred. Design: music_alarms (alarm_id, user_id, local_time, days_mask, timezone, mood_id, enabled).
- **Security and privacy:** Alarm definitions are private
- **External blocker:** Browsers and installed PWAs cannot reliably wake a device or start audio at a set time when the app is closed (PLATFORM). Needs native packaging (e.g. Capacitor) with OS alarm/notification APIs.

### 55. Personal Listening Profile

**Status:** VERIFIED · **Dependency:** CORE · **Phase:** P4

A listener's own moods, genres, artists, sound profile and habits.

- **Reuses:** tables `user_mood_preferences`, `user_genre_preferences`, `user_artist_preferences`; views `v_user_music_profile`; routines —; APIs `GET /insights/profile`, `GET /insights/preferences`, `GET /users/:id/analytics`; UI `frontend/src/pages/Profile.jsx`
- **Database change:** none. None needed.
- **Security and privacy:** Self or users.manage only
- **Passing tests:** "listening insights are computed from the plays"; "55 personal listening profile: describes only the caller's own plays"

### 56. Voice-Controlled LOOP

**Status:** PLANNED · **Dependency:** PLATFORM · **Phase:** P7

Spoken commands such as 'play something calm in Telugu'.

- **Reuses:** tables —; views —; routines —; APIs `POST /recommendations/parse`, `POST /recommendations/mood`, `GET /search`; UI —
- **Database change:** none. None: spoken text goes through the existing deterministic mood parser.
- **API:** `No new endpoint: recognised text → POST /recommendations/parse → POST /recommendations/mood or GET /search`
- **Frontend:** Microphone button only where the Web Speech API is available; Typed fallback everywhere
- **Security and privacy:** Ask for microphone permission only on tap; Tell users that some browsers send audio to the browser vendor for recognition; No audio is stored by LOOP
- **Passing tests:** "text input is parsed deterministically, including negation and activity"
- **Tests to add:** button hidden when speech recognition is unavailable; recognised text is sent to /recommendations/parse unchanged
- **External blocker:** Speech recognition availability varies by browser and OS (PLATFORM)

### 57. Accessibility and Inclusive Mode

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P4

Reduced motion, high contrast, larger text, captions, full keyboard and screen-reader support.

- **Reuses:** tables —; views —; routines —; APIs —; UI `frontend/src/components/Intro.jsx`, `frontend/src/components/ui.jsx`, `frontend/src/styles/global.css`
- **Database change:** new table `user_settings`. Accessibility choices follow the account across devices; kept apart from the public profile.
- **API:** `GET /me/settings`; `PATCH /me/settings (reducedMotion, highContrast, textScale, captionsEnabled)`
- **Frontend:** Inclusive Mode panel in Settings; High-contrast tokens for all three themes; Text scaling via CSS variables
- **Security and privacy:** Settings are private
- **Passing tests:** "with reduced motion shows one still frame and waits for Continue"; "Modal is a labelled dialog that closes on Escape and focuses its first field"
- **Tests to add:** text scale 3.0 is rejected by the database; high contrast meets WCAG AA contrast (axe scan); every page usable by keyboard only
- **Gaps:** System reduced-motion, labelled dialogs and keyboard escape work and are tested; an axe-core scan script exists (e2e/finalisation.py) but was not re-run in this session; no Inclusive Mode settings yet.

### 58. Smart Queue Autopilot

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P8

When the queue runs out, keep playing songs that fit what was just played, skipping dismissed, 1★ and unplayable songs.

- **Reuses:** tables `recommendation_batches`, `recommendation_items`, `song_dismissals`, `ratings`, `listening_history`, `audio_features`; views —; routines —; APIs `GET /recommendations/similar`, `POST /playback/start`, `POST /playback/:playId/finish`; UI `frontend/src/hooks/usePlayer.jsx`, `frontend/src/components/Layout.jsx`
- **Database change:** column `recommendation_batches.strategy` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). One ENUM value (AUTOPILOT) so autopilot lists are logged and explained like every other recommendation; no new table — the queue itself is client state.
- **API:** `POST /recommendations/autopilot {recentSongIds[], limit} → batch of next songs (strategy AUTOPILOT)`
- **Frontend:** "Autopilot" toggle in the player; Autopilot songs marked with their reason; Stops after N songs without interaction
- **Security and privacy:** Signed-in users only; recentSongIds validated and capped; Private sessions: generated from session memory only and never logged as a batch; Never queues a song without a playable licensed source
- **Passing tests:** "behaviour changes recommendations: a 1★ song disappears, a liked song seeds "Because you liked""
- **Tests to add:** autopilot excludes dismissed, 1★ and already-queued songs; autopilot in a private session writes no batch; autopilot stops when the catalogue has nothing playable left
- **Gaps:** The player has a queue, "play next" and skips unplayable songs, but nothing extends the queue when it ends.

### 59. Personal Radio Station

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P8

An endless station started from one song, artist or mood.

- **Reuses:** tables `recommendation_batches`, `recommendation_items`, `audio_features`, `song_moods`, `song_artists`, `artists`; views —; routines —; APIs `GET /recommendations/similar`, `POST /recommendations/mood`; UI `frontend/src/components/Rec.jsx`, `frontend/src/hooks/usePlayer.jsx`
- **Database change:** column `recommendation_batches.seed_artist_id`, column `recommendation_batches.strategy` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). A batch can already be seeded by a song (seed_song_id) or mood; an artist seed needs its own FK column. RADIO is one ENUM value.
- **API:** `POST /radio {seedType: SONG|ARTIST|MOOD, seedId} → first batch`; `GET /radio/:batchId/more → next batch, excluding songs already played this station`
- **Frontend:** "Start radio" on song, artist and mood pages; Station header showing the seed
- **Security and privacy:** Seed ids validated against the catalogue; Respects content filter and dismissals; Private sessions: not logged
- **Passing tests:** "behaviour changes recommendations: a 1★ song disappears, a liked song seeds "Because you liked""
- **Tests to add:** artist radio contains the seed artist and similar artists, never a dismissed song; a station never repeats a song within 50 plays; unknown seed id is 404
- **Gaps:** Song-seeded similarity exists (GET /recommendations/similar); artist seeds and an endless station do not.

### 60. Sleep Timer with Audio Fade

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P8

Stop playback after N minutes or at the end of the current song, fading the volume out.

- **Reuses:** tables `playback_events`, `listening_history`; views —; routines —; APIs `POST /playback/:playId/events`, `POST /playback/:playId/finish`; UI `frontend/src/hooks/usePlayer.jsx`
- **Database change:** none. None. A timer is client state; the stop is recorded as an ordinary PAUSE / finish, so listening history stays correct.
- **API:** `No new endpoint`
- **Frontend:** Timer menu (15/30/45/60 min, end of song); Gradual volume fade over the last 30 s; Remaining time in the player
- **Security and privacy:** No data stored; Fade restores the previous volume on resume
- **Tests to add:** timer pauses playback and records listened seconds correctly; end-of-song timer stops before the next song starts; cancelling the timer restores volume
- **Gaps:** Browsers may throttle timers in background tabs; mobile background playback is a platform limitation.

### 61. Focus Timer + Music

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P8

Pomodoro-style focus blocks with FOCUS-context music and quiet breaks.

- **Reuses:** tables `contexts`, `context_moods`, `listening_sessions`, `listening_history`; views —; routines —; APIs `GET /recommendations/context/:code`, `GET /contexts`; UI `frontend/src/pages/Mix.jsx`, `frontend/src/hooks/usePlayer.jsx`
- **Database change:** none. None for the first version: the FOCUS and STUDY contexts already exist and plays are logged with their context. A focus_sessions table is only worth adding if users ask for focus statistics.
- **API:** `GET /recommendations/context/FOCUS (existing)`
- **Frontend:** Focus timer with work/break lengths; Instrumental-first FOCUS mix; Break chime without music
- **Security and privacy:** No new data stored
- **Tests to add:** focus mix uses the FOCUS context targets; break pauses playback and resumes at the next block

### 62. Playback Quality Selector

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7

Choose streaming quality (data saver / normal / high).

- **Reuses:** tables `song_media`, `music_sources`; views —; routines —; APIs `GET /media/:id`; UI `frontend/src/hooks/usePlayer.jsx`
- **Database change:** none. None until a source actually offers several renditions; then a rendition column on song_media.
- **API:** `GET /media/:id?quality=LOW|NORMAL|HIGH (when available)`
- **Frontend:** Quality menu, hidden while only one rendition exists
- **Security and privacy:** Never transcode or re-encode commercial audio without rights
- **Tests to add:** menu hidden when one rendition exists; unsupported quality falls back to the available one
- **External blocker:** A licensed audio source offering multiple bitrates (local licensed files are single-rendition today)

### 63. Listening Session Bookmarks

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P8

Save a moment in a song ("the drop at 1:32") with an optional note and jump back to it.

- **Reuses:** tables `songs`, `users`, `incognito_sessions`; views —; routines —; APIs `GET /songs/:id`; UI `frontend/src/hooks/usePlayer.jsx`, `frontend/src/pages/Library.jsx`
- **Database change:** new table `listening_bookmarks` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). A user-chosen moment is not a playback event (those are automatic) — it needs its own row with a position and note.
- **API:** `GET /me/bookmarks`; `POST /songs/:id/bookmarks {positionSec, note}`; `DELETE /me/bookmarks/:id`
- **Frontend:** Bookmark button in the player; Markers on the seek bar; Bookmarks list in the Library
- **Security and privacy:** Owner-only; Refused in the database during a private session (trigger, like listening_history); Position must lie inside the song (trigger)
- **Tests to add:** bookmark beyond the song end is rejected by the database; no bookmark is saved during a private session; another user cannot read or delete my bookmark (404)

### 64. Playlist Health Score

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9

A 0–100 score with reasons: unplayable or hidden songs, near-duplicates, mood and energy jumps, overly long runs of one artist.

- **Reuses:** tables `playlist_songs`, `songs`, `song_media`, `audio_features`, `song_moods`; views —; routines —; APIs `GET /playlists/:id`; UI `frontend/src/pages/Library.jsx`
- **Database change:** none. None. Computed on request from existing rows; storing it would go stale.
- **API:** `GET /playlists/:id/health → {score, issues[]}`
- **Frontend:** Health badge on playlist pages; Issue list with one-tap fixes
- **Security and privacy:** Same access rule as viewing the playlist
- **Tests to add:** a hidden song lowers the score with an explicit issue; score is reproducible for the same playlist

### 65. Duplicate Playlist Cleaner

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P9

Find near-duplicates (same normalised title and artist, merged songs, alternate versions) and remove them in one step.

- **Reuses:** tables `playlist_songs`, `songs`, `song_artists`; views —; routines —; APIs `GET /playlists/:id`, `DELETE /playlists/:id/songs/:songId`; UI `frontend/src/pages/Library.jsx`
- **Database change:** none. None. The playlist_songs primary key already prevents exact duplicates; near-duplicates are found with songs.normalized_title and merged_into_song_id.
- **API:** `GET /playlists/:id/duplicates`; `POST /playlists/:id/duplicates/resolve {keepSongIds[]}`
- **Frontend:** Grouped duplicate review dialog
- **Security and privacy:** Owner or EDITOR collaborator only; Resolve runs in one transaction
- **Passing tests:** "duplicates are rejected: same song twice, same playlist name twice"
- **Tests to add:** a merged song and its target are reported as duplicates; resolve keeps the chosen entry and counters stay correct
- **Gaps:** Exact duplicates are already impossible; near-duplicate detection and the cleaner UI are not built.

### 66. Playlist Version History

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #34 Collaborative Playlists

See earlier versions of a playlist and restore one.

- **Reuses:** tables `playlists`, `playlist_songs`; views —; routines —; APIs `GET /playlists/:id`, `PATCH /playlists/:id`; UI `frontend/src/pages/Library.jsx`
- **Database change:** new table `playlist_revisions`, new table `playlist_revision_songs` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). A snapshot of name, description and ordered songs per playlists.version (0005). audit_logs is append-only admin evidence, not a restorable store.
- **API:** `GET /playlists/:id/revisions`; `GET /playlists/:id/revisions/:version`; `POST /playlists/:id/revisions/:version/restore`
- **Frontend:** History drawer; Diff view (added/removed/moved); Restore with confirmation
- **Security and privacy:** Viewers of the playlist may read history; only owner/editors restore; Revisions are insert-only for the application account (grant); Restore skips songs that no longer exist and says which
- **Tests to add:** each save writes exactly one revision; restore creates a new version instead of rewriting history; app account cannot UPDATE playlist_revisions

### 67. Playlist Conflict Resolver

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #34 Collaborative Playlists, #66 Playlist Version History

When two collaborators edit at once, show both changes and merge instead of silently overwriting.

- **Reuses:** tables `playlists`, `playlist_songs`, `playlist_collaborators`, `playlist_revisions`; views —; routines —; APIs —; UI `frontend/src/pages/Library.jsx`
- **Database change:** none. None beyond 0005 (playlists.version) and 66 (revisions): a stale write is detected by version and the two sides are compared against the common revision.
- **API:** `Writes carry If-Match: version → 409 with {base, mine, theirs}`; `POST /playlists/:id/merge {baseVersion, operations[]}`
- **Frontend:** Conflict dialog with a three-way view
- **Security and privacy:** Only collaborators with EDITOR role can merge; Merge is one transaction and writes a CONFLICT_MERGE revision
- **Tests to add:** stale version returns 409 with both sides; non-overlapping edits merge automatically; a viewer cannot merge

### 68. Playlist Alternative Finder

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9

For an unplayable or disliked entry, suggest the closest playable alternatives.

- **Reuses:** tables `audio_features`, `song_moods`, `song_media`, `playlist_songs`; views —; routines —; APIs `GET /recommendations/similar`; UI `frontend/src/pages/Library.jsx`
- **Database change:** none. None. Same similarity query as GET /recommendations/similar, restricted to playable songs not already in the playlist.
- **API:** `GET /playlists/:id/songs/:songId/alternatives`
- **Frontend:** "Find alternative" on unavailable entries; Swap in one tap
- **Security and privacy:** Playlist access rules apply; Only songs with a playable licensed source are suggested
- **Tests to add:** alternatives exclude songs already in the playlist; alternatives are all playable

### 69. QR Playlist Sharing

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #34 Collaborative Playlists

Share a playlist through an expiring, revocable link shown as a QR code.

- **Reuses:** tables `playlists`, `playlist_songs`; views —; routines —; APIs `GET /playlists/:id`; UI `frontend/src/pages/Library.jsx`
- **Database change:** new table `playlist_share_links` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). A share link has its own lifetime and revocation; only a SHA-256 hash of the token is stored, as for auth_sessions.
- **API:** `POST /playlists/:id/share-links {days ≤ 90}`; `DELETE /playlists/:id/share-links/:linkId`; `GET /shared/:token (read-only playlist view)`
- **Frontend:** Share dialog with QR code (generated in the browser); Active links with revoke
- **Security and privacy:** Token: 32 random bytes, shown once, stored hashed; Expiry ≤ 90 days enforced by CHECK; Shared view exposes titles only — no owner email, no listening data; Rate-limited lookups; revoked or expired links return 404
- **Tests to add:** raw token is never stored (CHECK on hash format); revoked link returns 404; shared view hides the owner's private data

### 70. New Release Radar

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7 · **Depends on:** #71 Artist Follow Notifications

A weekly list of real new releases from artists you follow or play.

- **Reuses:** tables `songs`, `albums`, `artists`, `user_artist_preferences`; views —; routines —; APIs —; UI `frontend/src/pages/Home.jsx`
- **Database change:** none. Uses artist_follows (71). Release dates need provider metadata: albums.release_year is a year only, and songs.created_at is when the curator added the song, not when it was released.
- **API:** `GET /recommendations/new-releases (when a release feed exists)`
- **Frontend:** Release radar shelf on Home
- **Security and privacy:** Provider terms and attribution respected; No scraping
- **Tests to add:** only releases inside the last 14 days appear; without a provider the shelf says it is unavailable
- **Gaps:** A catalogue-only "recently added from artists you follow" list is possible through 71 without a provider, but it is not a release radar.
- **External blocker:** A licensed release-metadata feed with release dates (provider adapter, credentials in .env)

### 71. Artist Follow Notifications

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9

Follow an artist and get an in-app notice when the catalogue adds their songs.

- **Reuses:** tables `artists`, `songs`, `song_artists`, `pipeline_jobs`; views —; routines —; APIs `GET /artists/:id`; UI `frontend/src/pages/Catalog.jsx`, `frontend/src/components/Layout.jsx`
- **Database change:** new table `artist_follows`, new table `notifications` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). Following is explicit intent; user_artist_preferences is a recomputed score and would lose it. notifications is a shared in-app inbox (also used by 34 invitations and 36 reminders) with a dedupe key so fan-out jobs are idempotent.
- **API:** `PUT /artists/:id/follow`; `DELETE /artists/:id/follow`; `GET /me/notifications`; `POST /me/notifications/read`
- **Frontend:** Follow button; Notification bell with unread count
- **Security and privacy:** In-app only: push and e-mail delivery are platform/provider-dependent and not built; link_path restricted to in-app paths by CHECK (no external or javascript: links); Follows are private
- **Tests to add:** catalogue addition notifies followers once even if the job reruns; external links in notifications are rejected by the database; notify=0 suppresses notices

### 72. Personal Music Radio

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P8 · **Depends on:** #59 Personal Radio Station

One always-on station built from the listener's whole profile rather than a single seed.

- **Reuses:** tables `user_mood_preferences`, `user_genre_preferences`, `user_artist_preferences`, `recommendation_batches`; views —; routines —; APIs `GET /recommendations/daily`, `GET /insights/preferences`; UI `frontend/src/pages/Home.jsx`
- **Database change:** none. None beyond 59: it is a RADIO batch seeded by the stored preference profile instead of one song or artist.
- **API:** `POST /radio {seedType: PROFILE}`
- **Frontend:** "My radio" tile on Home
- **Security and privacy:** Uses only the caller's own preferences; Not available until onboarding or enough history exists — says so instead of guessing
- **Tests to add:** profile radio reflects top preferred moods; new user without history gets a clear "not enough listening yet" response
- **Gaps:** Overlaps with 59 and the existing Daily mix; ship after 59 as one more seed type.

### 73. Playlist Sharing Cards

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #69 QR Playlist Sharing

A downloadable image card for a playlist: cover colours, top songs and the share QR.

- **Reuses:** tables `playlists`, `playlist_songs`, `albums`; views —; routines —; APIs `GET /playlists/:id`; UI `frontend/src/components/Art.jsx`, `frontend/src/pages/Library.jsx`
- **Database change:** none. None. Rendered in the browser from playlist data and a link from 69.
- **API:** `No new endpoint`
- **Frontend:** Card preview and PNG download
- **Security and privacy:** Only data visible on the playlist page; no third-party artwork without rights (uses generated cover colours)
- **Tests to add:** card shows at most the playlist's first 5 titles; download works without network access to third parties

### 74. Curator Leaderboard

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #37 LOOP Social Profiles, #40 Community Metadata Contributions

Rank listeners who opted in by saves of their public playlists and accepted metadata contributions.

- **Reuses:** tables `playlists`, `metadata_suggestions`, `user_profiles`; views —; routines —; APIs —; UI `frontend/src/pages/Profile.jsx`
- **Database change:** new table `playlist_saves` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). Saving someone else's playlist is a many-to-many relationship that does not exist yet; it also powers "saved playlists" in the Library.
- **API:** `PUT /playlists/:id/save`; `DELETE /playlists/:id/save`; `GET /leaderboard/curators?period=30d`
- **Frontend:** Leaderboard page; Save button on public playlists
- **Security and privacy:** Only users with profile_visibility PUBLIC appear (0005); Only PUBLIC playlists can be saved; Self-saves do not count
- **Tests to add:** private profiles never appear; self-saves are excluded from the score; saving a private playlist is 404

### 75. Community Music Collections

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P9 · **Depends on:** #39 MUSE Editorial Studio

Themed public collections curated by editors, open to song submissions from listeners.

- **Reuses:** tables `playlists`, `playlist_songs`, `review_queue`, `audit_logs`; views —; routines —; APIs `GET /playlists/:id`; UI `frontend/src/pages/Library.jsx`, `frontend/src/pages/admin/CatalogAdmin.jsx`
- **Database change:** new table `collection_submissions` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). A collection is an EDITORIAL playlist (0005); a submission has its own moderation state, one open submission per song per collection.
- **API:** `POST /collections/:id/submissions`; `GET /admin/collections/:id/submissions`; `POST /admin/collections/:id/submissions/:sid/decision`
- **Frontend:** Submit button on collections; Moderation queue for curators
- **Security and privacy:** Only PUBLIC EDITORIAL playlists accept submissions (trigger); Decisions require the curator permission and are audited; Rate limit per user
- **Tests to add:** submitting to a private playlist is refused by the database; duplicate open submission is refused; accepting adds the song in one transaction

### 76. Active Device Manager

**Status:** VERIFIED · **Dependency:** CORE · **Phase:** P10

See every signed-in device and sign out one or all.

- **Reuses:** tables `auth_sessions`; views —; routines —; APIs `GET /me/sessions`, `DELETE /me/sessions/:sessionId`, `POST /auth/logout-all`; UI `frontend/src/pages/Settings.jsx`
- **Database change:** none. None. Already implemented on auth_sessions.
- **Security and privacy:** Sessions are listed for the caller only; Tokens stored as SHA-256 hashes; Revocation is immediate
- **Passing tests:** "sessions list, revoke one, sign out everywhere"; "logout revokes the session on the server: the old cookie stops working"
- **Gaps:** Devices are shown by raw user-agent text; there is no friendly device name and no frontend test of the Settings panel.

### 77. Login Activity Timeline

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P10

A timeline of sign-ins, failed attempts, lockouts and security changes on the account.

- **Reuses:** tables `auth_sessions`, `audit_logs`, `users`; views —; routines —; APIs `GET /me/sessions`; UI `frontend/src/pages/Settings.jsx`
- **Database change:** new table `login_events` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). auth_sessions keeps only successful sign-ins and is purged 30 days after they end; failed attempts exist only as users.failed_login_count. A timeline needs one row per attempt.
- **API:** `GET /me/login-activity?days=90`
- **Frontend:** Timeline in Settings → Security; "This wasn't me" → sign out everywhere and change password
- **Security and privacy:** Only the account owner sees it; No passwords, no raw IP (hash only, CHECK), attempts on unknown usernames are not stored; Append-only for the application account
- **Passing tests:** "five wrong passwords lock the account"; "sessions list, revoke one, sign out everywhere"
- **Tests to add:** a wrong password writes one WRONG_PASSWORD event; a raw IP is rejected by the database; another user's activity is never returned
- **Gaps:** Active sessions and lockouts exist; a history of attempts does not.

### 78. Consent and API Connection Centre

**Status:** BLOCKED · **Dependency:** PROVIDER · **Phase:** P7 · **Depends on:** #35 Music Compatibility Match, #37 LOOP Social Profiles

Listeners see and revoke every consent and every external account connected to MUSE.

- **Reuses:** tables `music_sources`, `user_profiles`; views —; routines —; APIs `GET /admin/providers`; UI `frontend/src/pages/Settings.jsx`
- **Database change:** none. None now. Providers are server-level today (no user connects an external account); consent flags from 0005 (allow_compatibility, profile_visibility) are shown in Settings. A user_connections table waits for an OAuth provider.
- **API:** `GET /me/consents`; `PATCH /me/consents (0005 flags)`; `User connections: blocked`
- **Frontend:** Consents panel; Connected accounts list (blocked)
- **Security and privacy:** OAuth tokens encrypted at rest, never sent to the browser; Revoking a connection deletes its tokens
- **Passing tests:** "every external provider is disabled by default and the app runs without keys"
- **Tests to add:** consent changes are audited; revoking a connection deletes stored tokens
- **External blocker:** OAuth client registration with at least one provider; provider terms allowing per-user connections

### 79. Automatic Data Retention Rules

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P10 · **Depends on:** #57 Accessibility and Inclusive Mode

Old data is deleted on a schedule according to visible rules, and listeners can choose how long history is kept.

- **Reuses:** tables `auth_sessions`, `incognito_sessions`, `incognito_events`, `pipeline_jobs`, `listening_history`; views —; routines —; APIs `GET /admin/jobs`; UI `frontend/src/pages/admin/PipelineAdmin.jsx`, `frontend/src/pages/Settings.jsx`
- **Database change:** new table `retention_policies`, column `user_settings.history_retention_days`, column `pipeline_jobs.job_type` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). Rules become data an admin can see and change; only the rule enforced today (ended sessions, 30 days) starts enabled. A per-user history setting (NULL = keep). DATA_RETENTION job type logs each run.
- **API:** `GET /admin/retention`; `PATCH /admin/retention/:dataClass`; `PATCH /me/settings {historyRetentionDays}`
- **Frontend:** Retention rules panel (admin); History retention choice in Settings
- **Security and privacy:** Deletions run as a logged job with row counts; Minimum 30 days for user history (CHECK); Changing a rule is admin-only and audited
- **Passing tests:** "ended sessions are purged by the housekeeping job"; "an expired private session stops being private and is purged by the cleanup job"
- **Tests to add:** a disabled rule deletes nothing; history older than the user's setting is deleted, newer kept; retention job is idempotent
- **Gaps:** Purging of ended sessions and private sessions exists with fixed values; configurable rules do not. Purging login_events needs a DELETE path that the append-only grant does not give (see unresolved issues).

### 80. Personal Data Export

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P10

Download everything MUSE stores about you as a JSON file.

- **Reuses:** tables `users`, `user_profiles`, `listening_history`, `ratings`, `user_likes`, `playlists`, `playlist_songs`, `song_mood_ratings`, `search_history`, `auth_sessions`; views —; routines —; APIs `GET /insights/profile`, `GET /history`; UI `frontend/src/pages/Settings.jsx`
- **Database change:** none. None. A synchronous, authenticated, streamed download of the caller's own rows; no export files are stored on the server.
- **API:** `POST /me/export {password} → application/json download`
- **Frontend:** "Download my data" in Settings
- **Security and privacy:** Requires the current password; Own rows only; excludes password hash, token hashes and other users' data; Rate-limited (e.g. once per hour); Logged in audit_logs
- **Tests to add:** export contains my plays and none of another user's; export never contains password_hash or token_hash; wrong password is 401

### 81. Account Recovery and Security Centre

**Status:** PARTIAL · **Dependency:** PROVIDER · **Phase:** P10 · **Depends on:** #76 Active Device Manager, #77 Login Activity Timeline

One place for password, sessions, lockouts and account deletion — and recovery when the password is forgotten.

- **Reuses:** tables `users`, `auth_sessions`, `audit_logs`; views —; routines —; APIs `POST /me/password`, `DELETE /me`, `GET /me/sessions`, `POST /auth/logout-all`; UI `frontend/src/pages/Settings.jsx`
- **Database change:** none. None now. Self-service recovery needs a password_reset_tokens table, which is deliberately not added until an e-mail provider exists.
- **API:** `Existing account endpoints`; `POST /auth/recovery (blocked)`; `POST /auth/recovery/confirm (blocked)`
- **Frontend:** Security section in Settings combining password, devices (76) and activity (77)
- **Security and privacy:** Recovery tokens single-use, short-lived, stored hashed; Responses never reveal whether an e-mail exists; Every security change writes a SECURITY notification and an audit row
- **Passing tests:** "changing the password signs out every other session and keeps this one"; "deleting the account needs the password and confirmation, and removes the user and their data"; "five wrong passwords lock the account"; "the last admin cannot delete their own account"
- **Tests to add:** recovery request for unknown e-mail returns the same response; recovery token works once
- **Gaps:** Password change, lockout, session control and deletion are implemented and tested; forgotten-password recovery is blocked on e-mail delivery.
- **External blocker:** A transactional e-mail provider (credentials in .env, never in code) for recovery links

### 82. Database Backup and Restore Centre

**Status:** PLANNED · **Dependency:** INFRA · **Phase:** P11

Scheduled logical backups with verification by restoring into a scratch schema; production restore stays an operator procedure.

- **Reuses:** tables `pipeline_jobs`, `pipeline_job_logs`, `schema_migrations`; views —; routines —; APIs `GET /admin/jobs`, `GET /admin/jobs/:id`; UI `frontend/src/pages/admin/PipelineAdmin.jsx`
- **Database change:** column `pipeline_jobs.job_type` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). Two ENUM values (DATABASE_BACKUP, BACKUP_VERIFY); the existing job table already records status, timings, retries and logs.
- **API:** `POST /admin/backups (start)`; `GET /admin/backups`; `POST /admin/backups/:jobId/verify`
- **Frontend:** Backup list with size, checksum and verification result
- **Security and privacy:** Backup files outside the web root, encrypted at rest, never downloadable through the API; Restore over the live database is NOT offered in the UI; Requires a backup tool and storage on the server (INFRA)
- **Tests to add:** verify restores into a scratch schema and compares row counts; a second backup with the same key is idempotent; non-admin is 403
- **External blocker:** Server-side mysqldump/xtrabackup and encrypted storage location

### 83. Migration History Dashboard

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P11

Admins see applied and pending migrations with checksums, timings and drift warnings.

- **Reuses:** tables `schema_migrations`; views —; routines —; APIs `GET /admin/health`; UI `frontend/src/pages/admin/SystemAdmin.jsx`
- **Database change:** none. None. schema_migrations already records version, checksum, time and duration.
- **API:** `GET /admin/migrations → applied, pending, checksum problems (same logic as migrate.js status)`
- **Frontend:** Migrations table in System admin; Warning when a file changed after it was applied
- **Security and privacy:** Admin-only, read-only: the dashboard never applies a migration
- **Passing tests:** "the schema is at the latest migration and every view/routine/trigger uses one collation"; "liveness does not touch the database; readiness reports schema version and provider states without secrets"
- **Tests to add:** dashboard lists 0000–0004 as applied with checksums; an edited migration file is reported as a checksum problem
- **Gaps:** Schema version is reported by readiness and the CLI; there is no admin screen.

### 84. API Health Monitor

**Status:** PARTIAL · **Dependency:** CORE · **Phase:** P11

Live view of API latency and error rates per route, database health and provider states.

- **Reuses:** tables `music_sources`; views —; routines —; APIs `GET /admin/health`, `GET /admin/performance`, `GET /admin/providers`; UI `frontend/src/pages/admin/SystemAdmin.jsx`, `frontend/src/pages/admin/ProvidersAdmin.jsx`
- **Database change:** none. None. Per-route latency and error counts are kept in memory over a rolling window; long-term metrics belong in an external monitoring system.
- **API:** `GET /admin/metrics → per-route p50/p95, error rate, last 15 min`
- **Frontend:** Route latency table and error-rate sparkline
- **Security and privacy:** Admin-only; no request bodies, tokens or user ids in metrics
- **Passing tests:** "database health checks and the performance lab run"; "database outage: requests fail with 503 DATABASE_UNAVAILABLE, readiness is 503, liveness stays 200"; "a provider that does not answer times out, is retried a bounded number of times, then fails cleanly"
- **Tests to add:** metrics count a 500 as an error for its route; metrics contain no user identifiers
- **Gaps:** Database health, readiness and provider states exist; per-route API metrics do not.

### 85. Recommendation A/B Testing

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P11

Compare two recommender versions on real listening outcomes (completion, skips, likes).

- **Reuses:** tables `intelligence_models`, `model_parameters`, `recommendation_batches`, `recommendation_items`, `listening_history`; views —; routines —; APIs `GET /admin/models`, `POST /admin/models/:id/activate`; UI `frontend/src/pages/admin/SystemAdmin.jsx`
- **Database change:** new table `experiments`, new table `experiment_arms`, column `recommendation_batches.experiment_arm_id` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). An experiment and its arms (each pointing at a model version and a traffic share ≤ 100 %, enforced by trigger). Assignment is a stable hash, so it is not stored; the arm is recorded on each batch for analysis.
- **API:** `POST /admin/experiments`; `POST /admin/experiments/:id/start`; `POST /admin/experiments/:id/stop`; `GET /admin/experiments/:id/results`
- **Frontend:** Experiment list and results (with sample sizes and confidence intervals)
- **Security and privacy:** Admin-only; Private sessions never enter an experiment; Results are aggregates only
- **Tests to add:** the same user always gets the same arm; arms above 100 % are refused by the database; private-session requests are not assigned

### 86. Feature Flag Manager

**Status:** PLANNED · **Dependency:** CORE · **Phase:** P11

Turn features on gradually (percentage rollout, per-user overrides) without redeploying.

- **Reuses:** tables `users`, `audit_logs`; views —; routines —; APIs `GET /admin/overview`; UI `frontend/src/pages/admin/SystemAdmin.jsx`
- **Database change:** new table `feature_flags`, new table `feature_flag_overrides` (in `database/migrations/proposed/0006_roadmap_58_87.sql`). Flags with a rollout share, and an allow/deny list per user (M:N).
- **API:** `GET /me/flags`; `GET /admin/flags`; `PATCH /admin/flags/:code`; `PUT /admin/flags/:code/users/:userId`
- **Frontend:** Flag list with rollout slider; Client reads /me/flags once per session
- **Security and privacy:** Flags hide UI but every API route still checks permissions; Changes are admin-only and audited; Unknown flag = off
- **Tests to add:** rollout 10 % enables a stable subset; a per-user override wins over rollout; a flag never grants a permission the role lacks

### 87. Load and Performance Lab

**Status:** PARTIAL · **Dependency:** INFRA · **Phase:** P11

Show how key queries use indexes, and measure the API under concurrent load.

- **Reuses:** tables `songs`, `listening_history`, `recommendation_items`; views —; routines —; APIs `GET /admin/performance`; UI `frontend/src/pages/admin/SystemAdmin.jsx`
- **Database change:** none. None. EXPLAIN / EXPLAIN ANALYZE comparisons already run; load tests run outside the database against a disposable copy.
- **API:** `GET /admin/performance (existing)`; `npm run perf:load (planned script, never against production)`
- **Frontend:** Existing index comparison panel; Load-test report page
- **Security and privacy:** Load tests run only against a disposable environment; Admin-only
- **Passing tests:** "database health checks and the performance lab run"; "concurrent recommendation requests do not deadlock (READ COMMITTED scoring + retry)"
- **Tests to add:** load script refuses a production database name; p95 latency of /songs under 50 concurrent users is reported
- **Gaps:** Index comparisons and a concurrency test exist; there is no load-generation tool or report.

## Original features 1–32: evidence and gaps

| # | Feature | Status | Evidence (passing tests) | Gaps |
| --- | --- | --- | --- | --- |
| 1 | Multi-Mood Blending | PARTIAL | "picking moods returns a ranked, explained list stored in the database" | Up to 4 moods are accepted but weighted equally; no percentage weights or 100 % validation. |
| 2 | Mood Journey Engine | NOT IMPLEMENTED | — | GET /insights/journey reports past moods; it does not generate journeys. |
| 3 | Context-Aware Recommendations | VERIFIED | "focus mode prefers instrumental, low-speech songs"; "other strategies respond: daily, regional, recovery, worlds, recommendations/:userId" | — |
| 4 | Why This Song? | VERIFIED | "picking moods returns a ranked, explained list stored in the database" | — |
| 5 | Skip-Aware Learning | PARTIAL | "a short listen is a skip; completion % is derived by the database, not trusted from the client"; "behaviour changes recommendations: a 1★ song disappears, a liked song seeds "Because you liked"" | Skips are weighted (w_skip) with decay in preference refresh, but no test proves repeated skips change rankings. |
| 6 | Recommendation Diversity | PARTIAL | "diversity: no artist appears more than the configured cap" | No user-adjustable discovery intensity. |
| 7 | Smart Cold Start | VERIFIED | "onboarding stores weights that drive the first recommendations" | — |
| 8 | Recommendation Confidence | NOT IMPLEMENTED | — | — |
| 9 | Mood Dial | NOT IMPLEMENTED | — | — |
| 10 | Multilingual Search Intelligence | PARTIAL | "search finds songs, aliases and moods via SQL"; "search edge cases: empty, one character, nothing found, very long" | No transliteration between scripts. |
| 11 | Cross-Device Continuity | PARTIAL | — | Queue and playback position are not synced. |
| 12 | Interactive ER Explorer | NOT IMPLEMENTED | — | Static diagrams exist in docs/erd; no in-app explorer. |
| 13 | Mood Diary | NOT IMPLEMENTED | — | — |
| 14 | One-Tap Listening Modes | VERIFIED | "focus mode prefers instrumental, low-speech songs" | — |
| 15 | Surprise Me | PARTIAL | "discovery only returns songs the user has never played" | No adjustable discovery intensity. |
| 16 | Human vs Model Comparison | VERIFIED | "user ratings never change the AI mood prediction"; "the average and count per song and mood match the stored ratings" | — |
| 17 | Save My Mood Mix | PARTIAL | "a generated list saves as a playlist in rank order; someone else cannot save it" | No reorder or regenerate. |
| 18 | Personal Music Wrapped | PARTIAL | "listening insights are computed from the plays" | Daily/weekly/monthly only; no yearly summary or shareable recap. |
| 19 | Taste Evolution Timeline | PARTIAL | — | Moods only; no genre/artist/language evolution. |
| 20 | Mood Calendar Heatmap | PARTIAL | — | Listening heatmap only; depends on 13 for mood check-ins. |
| 21 | Skip Pattern Intelligence | PARTIAL | — | Platform-level SQL (Phase 3 Q06) exists; no per-user skip report in the app. |
| 22 | Artist Discovery Graph | NOT IMPLEMENTED | — | — |
| 23 | Personal Recommendation Controls | PARTIAL | ""Not for me" removes a song from future recommendations until undone; paused in private sessions" | No 'prefer this artist' or 'explore new genres' controls. |
| 24 | Privacy Control Centre | PARTIAL | "the database itself rejects permanent history while a private session is active"; "sessions list, revoke one, sign out everywhere" | No personal data export. |
| 25 | SQL Query Studio | PARTIAL | — | Exists as the Phase 3 Streamlit/HTML apps (phase3/), verified by phase3/run_query_tests.py; not yet inside the LOOP app. |
| 26 | SQL Execution Plan Visualizer | PARTIAL | — | EXPLAIN examples in the Workbench queries file and slow-query digests for admins; no visualizer. |
| 27 | Index Performance Lab | NOT IMPLEMENTED | — | — |
| 28 | Transaction Demonstrator | PARTIAL | — | Demonstrated by SQL scripts (constraint tests with rollback); no UI. |
| 29 | Permission Matrix | PARTIAL | "protected routes need a valid token" | Enforcement exists; no matrix screen. |
| 30 | Data Quality Centre | PARTIAL | "ingestion is idempotent and review decisions are enforced and audited" | No detection of suspicious ratings or contradictory mood classifications. |
| 31 | Database Scenario Simulator | PARTIAL | — | Scripts and tests (empty catalogue, constraint tests); no UI. |
| 32 | Mood Disagreement Analysis | PARTIAL | — | Aggregates exist; no disagreement report. |

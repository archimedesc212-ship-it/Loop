# MUSE — ER Diagram explanation and viva guide

*Simple English, with Telugu-English ("Tenglish") help lines marked* **TE:**

This folder contains three coordinated ER diagrams of **MUSE — Music Mood Intelligence
& Recommendation Database System**. All three are generated from the **real, final
MySQL schema** (baseline files `database/01–06` plus migrations `0001`, `0002`, `0003`, `0004`),
read from `information_schema`. No relationship is drawn unless a real foreign key
exists for it.

| File | What it is | Use it for |
|---|---|---|
| `MUSE_ERD_Presentation.pdf` / `.svg` / `.png` | **Diagram A** — 46 major entities, 67 relationships, A3 landscape | **Submit this to the professor**; print on A3 |
| `MUSE_ERD_Full_Schema.pdf` / `.svg` / `.png` | **Diagram B** — all 64 tables, all 124 foreign keys; PDF page 1 = whole schema (A1 landscape), pages 2–9 = one functional group each at 100 % scale (tables of other groups shown as dashed boxes) with the FK column and ON DELETE rule on every line | **Study this**; show it when asked "where is table X?" |
| `MUSE_ERD_Conceptual.svg` / `.png` | **Diagram C** — the recommendation data flow, 15 entities, with numbered process steps | Opening slide / explaining the idea |
| `MUSE_ERD.mmd` | Mermaid source of the complete schema (64 entities, 124 relationships) | Paste into any Mermaid viewer |
| `MUSE_ERD_Editable.drawio` | diagrams.net file with 3 pages (A, B, C) | Open at app.diagrams.net to rearrange or edit |
| `validation-report.json` | Machine-checked validation (section 16) | Proof that the diagram matches the schema |
| `schema-model.json` | The extracted schema the diagrams were built from | Reference |

Regenerate everything after a schema change:

```bash
node backend/scripts/erd/extract-schema.js     # read the live database
python3 backend/scripts/erd/build_erd.py       # build SVG, Mermaid, draw.io
python3 backend/scripts/erd/render.py          # PNG + PDF + rendering checks
python3 backend/scripts/erd/check_docs.py      # compare older hand-drawn diagrams
```

---

## How to read the notation (crow's foot)

| Symbol at the end of a line | Meaning |
|---|---|
| two bars `‖` | exactly one |
| bar + circle `|o` | zero or one (optional) |
| crow's foot + circle `o<` | zero or many |
| **solid** line | *identifying* relationship: the foreign key is part of the child's primary key (e.g. `playlist_songs.playlist_id`) |
| **dashed** line | *non-identifying* relationship: the FK is an ordinary column (e.g. `songs.album_id`) |
| `PK` / `FK` / `UK`, `U1`, `U2` | primary key / foreign key / unique key (same tag = one composite unique key) |
| `null` after a type | the column allows NULL → the relationship is optional on the parent side |
| `gen` after a type | a generated column (MySQL computes it) |

The child side is always drawn as **zero or many** (or **zero or one** for 1:1)
because a foreign key never forces a parent to have children. Rules like "every song
has exactly one primary genre" are enforced by unique keys, procedures and health
checks, not by the foreign key itself (section 16).

**TE:** Line chivara rendu geethalu (‖) unte "khachitanga okati". Circle unte "undakapovachu" (optional). Kaaki kaali (crow's foot) unte "chaala undochu". Solid line ante FK primary key lo bhaagam; dashed ante maamoolu column.

---

## 1. Project introduction and problem statement

Music apps usually recommend songs from listening counts alone and cannot explain
*why* a song was chosen. MUSE stores songs with their **audio features** (energy,
valence, tempo …) and **moods**, records every **play, skip, like and rating**, learns
each listener's **preferences**, and generates **recommendation lists in which every
song has stored scores and reasons**. It also supports private (incognito) listening,
weekly personalised "MUSE Worlds", a data-import pipeline with provenance, and an
audit trail.

Problem statement: *design a relational database that can store a music catalogue,
mood analysis, listening behaviour and explainable recommendations consistently, with
integrity enforced by the database itself.*

**TE:** Problem enti ante — normal apps "enduku ee paata?" ani cheppalevu. MUSE lo prathi recommendation ki score, reason database lo store avthayi.

## 2. Purpose of the ER diagram

An ER diagram shows the **entities** (things we store), their **attributes** and the
**relationships** between them, with **cardinality** (how many). It is the blueprint
that lets anyone check the design before reading SQL: which table owns which data,
how tables are linked, and what happens to related data when a row is deleted.

**TE:** ER diagram ante database ki "blueprint". Ye table lo ye data undi, tables ela connect ayyayi, oka row delete chesthe migathavi emavuthayi — anni okka chitram lo kanipisthayi.

## 3. Entity groups and their purpose (all 64 tables)

| # | Group | Tables | Purpose |
|---|---|---|---|
| 1 | Users, Profiles & Access Control | `users`, `user_profiles`, `roles`, `permissions`, `role_permissions`, `auth_sessions` | accounts, profile data, role-based access, server-side sign-in sessions |
| 2 | Music Catalogue | `songs`, `artists`, `artist_aliases`, `albums`, `album_artists`, `films`, `song_artists`, `genres`, `song_genres`, `languages`, `regions` | what music exists and who made it |
| 3 | Mood & Audio Intelligence | `moods`, `mood_categories`, `mood_keywords`, `contexts`, `context_keywords`, `context_moods`, `intelligence_models`, `model_parameters`, `audio_features`, `song_moods`, `mood_segments`, `song_mood_curations` | versioned audio analysis, mood tags, the vocabulary that turns words into moods, model versions and weights |
| 4 | Listening History & Feedback | `listening_sessions`, `listening_history`, `playback_events`, `ratings`, `song_mood_ratings`, `user_likes`, `song_dismissals`, `search_history`, `incognito_sessions`, `incognito_events` | every play and signal, including users' 0–100 % mood-match ratings; private-session memory kept separately |
| 5 | Recommendation Engine | `recommendation_batches`, `recommendation_batch_moods`, `recommendation_items`, `recommendation_reasons`, `reason_types` | each generated list, its ranked songs, score breakdown and reasons |
| 6 | Playlists & Preferences | `playlists`, `playlist_songs`, `user_languages`, `user_genre_preferences`, `user_artist_preferences`, `user_mood_preferences`, `user_context_preferences` | user playlists and the learned taste model |
| 7 | Music Sources & Data Pipeline | `music_sources`, `song_media`, `source_records`, `pipeline_jobs`, `pipeline_job_logs`, `review_queue` | where data and playable media come from, import jobs, provenance and human review |
| 8 | MUSE World, Trends & Audit | `world_archetypes`, `archetype_moods`, `weekly_worlds`, `world_feedback`, `trend_snapshots`, `audit_logs`, `schema_migrations` | weekly worlds and feedback, trend facts, audit trail, migration history |

Tables added by migrations: `auth_sessions` (0001), `song_dismissals` and
`world_feedback` (0002); migration 0003 added columns to `song_media` and views, not tables; `song_mood_ratings` (0004).
`schema_migrations` is created by the migration tool.

## 4. Important attributes, primary keys and foreign keys

| Table | Primary key | Important attributes | Foreign keys |
|---|---|---|---|
| `users` | `user_id` | `username` (UK), `email` (UK), `password_hash`, `is_active` | `role_id → roles` |
| `user_profiles` | `user_id` (also FK) | `display_name`, `content_filter` | `user_id → users` (1:1), `region_code → regions` (optional) |
| `songs` | `song_id` | `title`, `isrc` (UK), `duration_sec`, `status`; UK (`primary_artist_id`, `normalized_title`, `version_label`) | `primary_artist_id → artists`, `album_id → albums` (opt.), `language_id → languages` (opt.), `merged_into_song_id → songs` (self, opt.) |
| `audio_features` | `feature_id` | `energy`, `valence`, `tempo_bpm`, `is_current`; UK (`song_id`, `model_id`) | `song_id → songs`, `model_id → intelligence_models` |
| `song_moods` | (`song_id`, `mood_id`, `model_id`) | `confidence` | `song_id`, `mood_id`, `model_id`, `feature_id → audio_features` |
| `listening_history` | `play_id` | `listened_sec`, `completed`, `skipped`, `is_replay` | (`session_id`, `user_id`) → `listening_sessions` (composite), `song_id → songs`, `batch_id → recommendation_batches` (opt.) |
| `recommendation_batches` | `batch_id` | `strategy`, `created_at` | `user_id → users`, `model_id → intelligence_models`, `context_id`, `language_id`, `seed_song_id`, `incognito_id` (all optional) |
| `recommendation_items` | (`batch_id`, `song_id`) | `rank_position` (UK with batch), `final_score`, eight signal scores | `batch_id`, `song_id` |
| `weekly_worlds` | `world_id` | `week_start`, `version`, `status`; UK (`user_id`, `week_start`, `version`), UK `batch_id` | `user_id`, `archetype_code`, `batch_id` (1:1), `primary_mood_id`, … |

**TE:** Primary key ante prathi row ni unique ga gurthinche column. Foreign key ante vere table lo unna primary key ni point chese column — rendu tables ni kalipe "link".

## 5. One-to-one, one-to-many, many-to-many — real examples

- **One-to-one (1 : 0..1)** — the FK is also the PK or a unique key:
  - `users` ↔ `user_profiles`: `user_profiles.user_id` is both PK and FK. Credentials stay in `users`, profile data in `user_profiles`.
  - `recommendation_batches` ↔ `weekly_worlds`: `weekly_worlds.batch_id` is UNIQUE, so one list belongs to at most one world.
- **One-to-many (1 : 0..*)**: `artists` → `songs` (`songs.primary_artist_id`), `users` → `playlists`, `listening_history` → `playback_events`, `recommendation_batches` → `recommendation_items`.
- **Many-to-many (M : N)** through a junction table: `songs` ↔ `genres` via `song_genres`; `songs` ↔ `artists` via `song_artists` (with a `role`); `playlists` ↔ `songs` via `playlist_songs`; `roles` ↔ `permissions` via `role_permissions`; `albums` ↔ `artists` via `album_artists`.
- **Self-referencing (recursive)**: `genres.parent_genre_id` (genre tree), `songs.merged_into_song_id` (duplicate merged into the canonical song), `pipeline_jobs.parent_job_id`, `music_sources.fallback_source_id`.
- **Optional relationships** (nullable FK, 42 of 124): e.g. `songs.album_id` (a single has no album), `listening_history.batch_id` (a play may not come from a recommendation list).

**TE:** 1:1 ante oka user ki okate profile. 1:N ante oka artist ki chaala songs. M:N ante oka song ki chaala genres, oka genre lo chaala songs — anduke madhyalo `song_genres` table.

## 6. Why junction tables are needed

A relational table cell holds one value. If `songs` had a `genres` column with
"Film Melody, Indian Film", that breaks 1NF and makes searching and updating error-prone.
A junction table stores **one row per pair**: `song_genres(song_id, genre_id, is_primary)`
with the composite PK (`song_id`, `genre_id`), which also prevents the same pair twice.
Many MUSE junction tables are **associative entities** that carry their own data:
`ratings.rating`, `playlist_songs.position`, `song_moods.confidence`,
`recommendation_items.final_score`, `user_mood_preferences.blended_score`.

The schema has 23 composite primary keys; 22 tables have at least two identifying
foreign keys (pure junctions or associative entities).

**TE:** Oka cell lo oke value undali. Anduke "song–genre" jathalu prathyeka table lo, okko row ki okko jatha.

## 7. User → recommendation → listening history workflow

1. The listener picks a mood or context (or types a sentence). The API inserts a row in `recommendation_batches` (`user_id`, optional `context_id`) and the chosen moods with weights in `recommendation_batch_moods`.
2. The stored procedure `sp_generate_recommendations` scores candidate songs and writes `recommendation_items` (rank + eight signal scores) and `recommendation_reasons` (reason codes from `reason_types`).
3. The listener plays a song. A row is added to `listening_history` inside a `listening_sessions` row; `listening_history.batch_id` links the play back to the list it came from. Pause/seek events go to `playback_events`.
4. On finish, triggers derive `completion_pct`, `completed`, `skipped`; `sp_refresh_user_preferences` updates `user_genre_preferences`, `user_mood_preferences`, `user_artist_preferences`, `user_context_preferences`.
5. The next request reads those preferences, so recommendations change with behaviour. "Not for me" (`song_dismissals`) removes a song from future lists.

Diagram C shows exactly this flow; its blue arrows are **steps**, not foreign keys.

**TE:** User mood cheptadu → batch create avuthundi → procedure songs ki score isthundi → user play chesthadu → history lo save → preferences update → next time inka better recommendations.

## 8. How mood analysis and preferences connect to recommendations

- Each song has versioned `audio_features` (one current version per song, enforced by the unique generated column `current_song_key`), produced by an `intelligence_models` row.
- The mood model turns features into `song_moods` (song, mood, model, confidence) and time-coded `mood_segments`; curators can override in `song_mood_curations`.
- Words map to moods through `mood_keywords` and to contexts through `context_keywords` / `context_moods`.
- The recommender compares the requested moods (`recommendation_batch_moods`) with `song_moods` and audio targets, adds the listener's learned `user_*_preferences`, and stores the result per song in `recommendation_items`.

## 9. Referential integrity and ON DELETE behaviour

Referential integrity = a foreign key can only hold a value that exists in the parent
(or NULL when optional). MUSE uses all three delete rules (69 CASCADE, 32 SET NULL, 23 RESTRICT):

| Rule | Meaning | Real examples |
|---|---|---|
| **CASCADE** | deleting the parent deletes the children | delete a user → their `auth_sessions`, `playlists`, `ratings`, `listening_sessions` → `listening_history` → `playback_events` go too; delete a playlist → its `playlist_songs` |
| **SET NULL** | the child stays, the link becomes NULL | `songs.album_id`, `listening_history.batch_id`, `audit_logs.actor_user_id` (the audit entry survives the user), `song_dismissals.batch_id` |
| **RESTRICT** | the parent cannot be deleted while children exist | `songs.primary_artist_id → artists`, `song_genres.genre_id → genres`, `source_records.song_id → songs` (a song with provenance cannot be deleted, so the app hides it instead), `users.role_id → roles`, `weekly_worlds.batch_id → recommendation_batches` |

The last one is why account deletion removes the user's `weekly_worlds` before the user row.

**TE:** CASCADE ante parent delete aithe pillalu kooda delete. SET NULL ante pillalu untaru kaani link NULL avuthundi. RESTRICT ante pillalu unnantha varaku parent ni delete cheyyalemu.

## 10. How the design reduces anomalies

- **Insertion anomaly** avoided: a new artist can be added without a song; a mood can exist before any song has it (separate tables).
- **Update anomaly** avoided: an artist's name is stored once in `artists`; every song refers to it by `artist_id`, so renaming is one update.
- **Deletion anomaly** avoided: deleting a user's last rating does not delete the song; deleting a play does not delete the user. Delete rules are explicit (section 9).
- Unique keys stop duplicates: one rating per (user, song), one active world per user and week (`active_key`), one pending review per record and review type (`pending_key`), at most one primary genre per song (`primary_song_key`).

## 11. Normalisation (UNF → 1NF → 2NF → 3NF → BCNF)

Only claims that follow from the actual keys are made here; the full derivation with
more functional dependencies is in `docs/DATABASE_DESIGN.md` § 3.

- **UNF**: one wide "play log" row: user name, email, song title, artist, album, genres "Pop, Film", moods "Happy, Calm", rating, played_at …
- **1NF** (atomic values, no repeating groups): multi-valued genres and moods move to `song_genres` and `song_moods` (one row per value).
- **2NF** (no partial dependency on part of a composite key): in the flat key (user, song, played_at), `song → title, artist …` and `user → email …` depend on part of the key, so they move to `songs` and `users`; `(user, song) → rating` becomes `ratings(user_id, song_id, rating)`. In today's composite-key tables the non-key columns depend on the whole key, e.g. `song_moods.confidence` on (`song_id`, `mood_id`, `model_id`), `playlist_songs.position` on (`playlist_id`, `song_id`).
- **3NF** (no transitive dependency): `song → album → film` is split into `songs`, `albums`, `films`; `mood → category name` into `mood_categories`; reason text into `reason_types`.
- **BCNF**: in the core tables every determinant is a candidate key — e.g. in `songs` the determinants are `song_id`, `isrc` (UNIQUE) and (`primary_artist_id`, `normalized_title`, `version_label`) (UNIQUE).

**Honest exceptions (controlled redundancy, deliberate and guarded):**

- `listening_history.user_id` is derivable from `session_id` (`session_id → user_id`), a transitive dependency. It is kept for fast per-user queries and kept consistent by the **composite foreign key** (`session_id`, `user_id`) → `listening_sessions(session_id, user_id)`.
- `songs.normalized_title`, `artists.normalized_name` are generated from other columns (MySQL computes them, so they cannot drift).
- `listening_history.completion_pct / completed / skipped`, `playlists.song_count`, the `user_*_preferences` tables and `trend_snapshots` are derived data maintained by triggers or procedures.

So the accurate statement is: **the base data is normalised to 3NF/BCNF, with a small,
documented set of derived or redundant columns that the database keeps consistent.**
It is not claimed that every table is strictly BCNF.

**TE:** Normalisation ante oke data ni rendu chotla store cheyyakunda tables ni vidagottadam. Konni columns kaavalani redundant ga unchamu (speed kosam), kaani triggers/FK tho correct ga untayi.

## 12. ER diagram vs relational schema

| ER diagram | Relational schema |
|---|---|
| conceptual/logical picture: entities, attributes, relationships, cardinality | the implemented tables: columns with types, PKs, FKs, UNIQUE, CHECK, indexes |
| an M:N relationship is one line conceptually | becomes a junction table with a composite PK |
| independent of the DBMS | specific to MySQL 8 (`CREATE TABLE …` in `database/01_schema.sql` + migrations) |

MUSE's diagrams are drawn *from* the relational schema, so they show junction tables
explicitly (an implementation-level ER diagram).

## 13. Ten likely viva questions

1. **How many tables and relationships?** 64 tables, 124 foreign keys, 20 views. Schema version 0004.
2. **Give a 1:1 example.** `users`–`user_profiles`: `user_profiles.user_id` is both PK and FK. Another: `weekly_worlds.batch_id` is UNIQUE.
3. **Why `song_genres`?** Songs and genres are M:N; a junction table keeps one value per cell and the composite PK stops duplicate pairs.
4. **What is a composite key here?** `ratings(user_id, song_id)` — one rating per user per song. `recommendation_reasons` even has a composite *foreign* key (`batch_id`, `song_id`) to `recommendation_items`.
5. **What happens if a user is deleted?** CASCADE removes their sessions, plays, ratings, playlists, preferences; SET NULL keeps audit entries with a NULL actor.
6. **Why can't you delete a song that came from an import?** `source_records.song_id` is RESTRICT, protecting provenance; the app hides the song instead.
7. **What is a self-referencing relationship?** `genres.parent_genre_id → genres.genre_id` builds a genre tree (read with a recursive CTE).
8. **Is it in BCNF?** The base data is in 3NF/BCNF; documented exceptions like `listening_history.user_id` are controlled by a composite FK (section 11).
9. **How are recommendations explained?** Each `recommendation_items` row stores eight signal scores; `recommendation_reasons` stores reason codes whose text templates are in `reason_types`.
10. **How do you keep one current analysis per song?** A virtual generated column `current_song_key = IF(is_current = 1, song_id, NULL)` with a UNIQUE index: NULLs do not collide, so only one row per song can be current.

## 14. Two-minute presentation script

"Good morning. Our project is MUSE, a music mood intelligence and recommendation
database in MySQL. This ER diagram has eight colour-coded groups. In the centre is the
**Music Catalogue** — songs, artists, albums, films, genres — with junction tables such
as `song_genres` and `song_artists` for many-to-many links. On the right, **Mood & Audio
Intelligence** stores versioned audio features and mood tags for every song.

When a **user** asks for a mood, the **Recommendation Engine** stores a batch, the moods
requested, the ranked items with their scores, and reasons. When the user plays a song,
**Listening History** records the play and links it back to the batch; procedures then
update the **preferences** in group 6, so the next list improves.

Crow's-foot ends show cardinality, solid lines are identifying relationships, dashed
lines are optional or non-identifying. Every line is a real foreign key — 124 in total —
with CASCADE, SET NULL or RESTRICT chosen per relationship. Thank you."

## 15. Five-minute detailed presentation script

1. **Problem (30 s)** — Apps recommend without explanation; MUSE stores the evidence for every recommendation.
2. **Notation (30 s)** — Point to the legend: bars = one, circle = optional, crow's foot = many; solid = identifying, dashed = non-identifying.
3. **Users and access (40 s)** — `users` with unique username and email; 1:1 `user_profiles`; `roles` ↔ `permissions` through `role_permissions`; `auth_sessions` store only a hash of each sign-in token.
4. **Catalogue (50 s)** — `songs` reference `artists` (RESTRICT), optionally `albums` and `languages` (SET NULL / optional); albums belong optionally to `films`; M:N with `song_artists` (role), `song_genres` (at most one primary genre per song, enforced by a unique generated key); `genres` is self-referencing.
5. **Mood intelligence (50 s)** — `audio_features` versioned per `intelligence_models` row; `song_moods` composite key (song, mood, model) with confidence; keyword tables map words to moods and contexts.
6. **Recommendation and listening (70 s)** — walk through Diagram C: batch → batch moods → items with scores → reasons; play in `listening_history` inside a session (composite FK keeps the user consistent), optional `batch_id` back to the list; preferences updated by a procedure; "Not for me" in `song_dismissals`.
7. **Pipeline and world (40 s)** — `music_sources` → `source_records` (provenance, unique per source + external id) → `review_queue`; `weekly_worlds` 1:1 with a batch, versioned, one active per week; `audit_logs` keep the actor with SET NULL.
8. **Integrity and normalisation (40 s)** — 69 CASCADE, 32 SET NULL, 23 RESTRICT; normalised to 3NF/BCNF with documented controlled redundancy.
9. **Close (10 s)** — "Diagram B shows all 64 tables if you want to check any one."

## 16. Validation report

Machine-checked by the build scripts; full details in `validation-report.json`.

| Check | Result |
|---|---|
| Tables in final schema / in Diagram B / in Mermaid / in draw.io page B | 64 / 64 / 64 / 64 |
| Foreign keys in schema / drawn in Diagram B / Mermaid / draw.io page B | 124 / 124 / 124 / 124 |
| Every relationship in Diagrams A and C exists as a foreign key | yes — the build stops if one does not (A: 67, C: 19 FK lines + 6 process steps) |
| Migration-added tables included | `auth_sessions`, `song_dismissals`, `world_feedback`, `schema_migrations` — yes |
| One-to-one relationships | `user_profiles(user_id) → users`, `weekly_worlds(batch_id) → recommendation_batches` |
| Composite foreign keys | `listening_history(session_id, user_id) → listening_sessions`, `recommendation_reasons(batch_id, song_id) → recommendation_items` |
| Self-referencing FKs | `genres`, `songs`, `pipeline_jobs`, `music_sources` |
| Optional (nullable) vs mandatory FKs | 42 optional (parent end `|o`), 82 mandatory (`‖`) |
| Composite primary keys | 22 |
| Text clipping | no text outside its table box in any SVG (browser `getBBox` check); PDFs contain vector text (all 64 table names extractable from the full PDF; all 46 entity names from the presentation PDF) |
| Mermaid | renders with mermaid-cli without syntax errors |
| draw.io | 3 pages; every edge references existing shapes; ids unique |

**Omissions (Diagram A only, by design):** 18 tables are left out of the presentation
overview (`archetype_moods`, `artist_aliases`, `context_keywords`, `context_moods`,
`incognito_events`, `incognito_sessions`, `model_parameters`, `mood_categories`,
`mood_keywords`, `mood_segments`, `pipeline_job_logs`, `regions`, `schema_migrations`,
`search_history`, `song_mood_curations`, `user_artist_preferences`,
`user_context_preferences`, `user_languages`), and 22 foreign keys between shown tables
are not drawn to keep it readable (listed in `validation-report.json`). Diagram B omits nothing.
Diagram B lists key columns only; the other attributes are in `docs/DATA_DICTIONARY.md`.

**Relationships that are application-level, not foreign keys:**

- `audit_logs(entity_type, entity_id)` and `trend_snapshots(entity_type, entity_id)` are *polymorphic* references (the target table depends on `entity_type`), so no FK can enforce them.
- `source_records.external_id` identifies a record in an external system; `pipeline_jobs.locked_by` names a worker process.
- Minimum-participation rules are not foreign-key rules: "every active song has exactly one primary genre" is checked by the database health checks (the unique key only guarantees *at most* one); albums are created with at least one artist by API validation; roles receive their permissions from the seed data. A recommendation batch can legitimately have zero items (an empty catalogue).
- `schema_migrations` has no relationships (it records the migration history).

**Discrepancies found in older documentation** (the executable schema was treated as the
source of truth; the older hand-drawn Mermaid diagram in `docs/DATABASE_DESIGN.md` § 2 was checked, 64 relationships):

| Old diagram | Actual database |
|---|---|
| `USERS \|\|--\|\| USER_PROFILES` (mandatory 1:1) | a user *may* have zero or one profile at database level (`o|`); the app always creates both in one transaction |
| `ROLES \|\|--\|{ ROLE_PERMISSIONS`, `ALBUMS \|\|--\|{ ALBUM_ARTISTS`, `SONGS \|\|--\|{ SONG_GENRES`, `RECOMMENDATION_BATCHES \|\|--\|{ RECOMMENDATION_ITEMS`, `RECOMMENDATION_ITEMS \|\|--\|{ RECOMMENDATION_REASONS` ("one or more") | the foreign key enforces "zero or more"; "at least one" is at most an application rule (and a batch may be empty) |

All other 58 relationships in the older diagram match real foreign keys and their
optionality. No unresolved discrepancies remain in the new diagrams.

---

### Glossary (TE: padakosham)

| Term | Simple meaning | Telugu |
|---|---|---|
| Entity | a thing we store (a table) | వస్తువు / అంశం (vastuvu) |
| Attribute | a property (a column) | లక్షణం (lakshanam) |
| Relationship | a link between entities | సంబంధం (sambandham) |
| Primary key | the column(s) that uniquely identify a row | ప్రాథమిక కీ |
| Foreign key | a column that points to another table's primary key | విదేశీ కీ / లింక్ కీ |
| Cardinality | how many rows can be related | సంఖ్యా సంబంధం |
| Normalisation | splitting tables to avoid duplicate data | సాధారణీకరణ |

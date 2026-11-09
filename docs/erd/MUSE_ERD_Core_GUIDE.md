# MUSE — 16-Entity ER Diagram: Guide

Files: `MUSE_ERD_Core.png` / `.svg` / `.pdf` (A3 landscape), `MUSE_ERD_Core.mmd` (Mermaid),
`MUSE_ERD_Core.drawio` (editable in diagrams.net), `core-mapping.json` (machine-readable mapping).
Regenerate with `python3 backend/scripts/erd/build_core.py`; it is also part of `npm run docs:erd`.
The Phase 1 report built from it is `docs/phase1/MUSE_Phase1_ER_Normalisation_Report.pdf`.

> **Important — read this first.** The MUSE database has **64 tables**. Nothing was deleted
> or merged. This diagram is a **simplified view** that draws the 16 most important tables in full
> (every column, every key) and the **24 real foreign keys** between them. Each of the other 48 tables
> is assigned to one of these 16 in section 3, so all of the content is still accounted for.
> The complete diagram of all 64 tables is `MUSE_ERD_Full_Schema.pdf`.
>
> *TE:* Database lo 64 tables unnayi — emi delete cheyyaledu. Ee diagram lo mukhyamaina 16
> tables matrame chupinchamu; migata 48 tables ee 16 lo edo okadaniki "support" tables.

---

## 1. Why 16?

A diagram with 64 tables and 124 relationship lines is correct, but hard to explain in a few minutes.
These 16 tables tell the whole story of the application:

> a **user** → listens to **songs** (grouped by **artist**, **album**, **genre**) → songs are tagged with
> **moods** (by the AI) and **rated for each mood by users** (0–100 %) → the system makes a **recommendation batch** of **recommended songs** → plays are stored in
> **listening history** → the user saves songs into **playlists**.

The 16 were chosen because they hold the main business data, and every other table either *describes*
one of them (a lookup like `languages`), *extends* it (like `auth_sessions` for `users`), or *records
details* about it (like `playback_events` for a play).

## 2. The 16 entities (6 areas)

| # | Area | Entity | Primary key | What one row means | Cols |
|---|------|--------|-------------|--------------------|------|
| 1 | Users | `users` | `user_id` | one login account | 11 |
| 2 | Users | `user_profiles` | `user_id` (also FK) | the profile of one user (1 : 1) | 7 |
| 3 | Music Catalogue | `artists` | `artist_id` | one singer, band or composer | 11 |
| 4 | Music Catalogue | `albums` | `album_id` | one album / film soundtrack | 9 |
| 5 | Music Catalogue | `songs` | `song_id` | one track | 18 |
| 6 | Music Catalogue | `genres` | `genre_id` | one genre (can have a parent genre) | 5 |
| 7 | Music Catalogue | `song_genres` | (`song_id`, `genre_id`) | "this song belongs to this genre" (junction) | 4 |
| 8 | Mood Intelligence | `moods` | `mood_id` | one mood, e.g. calm, energetic | 13 |
| 9 | Mood Intelligence | `song_moods` | (`song_id`, `mood_id`, `model_id`) | "this model rated this song with this mood" (junction) | 6 |
| 10 | Mood Intelligence | `song_mood_ratings` | (`user_id`, `song_id`, `mood_id`) | "this user says this song fits this mood X %" (0–100, ternary junction; added in migration 0004) | 7 |
| 11 | Listening History | `listening_sessions` | `session_id` | one listening session of a user | 10 |
| 12 | Listening History | `listening_history` | `play_id` | one play of one song | 13 |
| 13 | Recommendations | `recommendation_batches` | `batch_id` | one set of recommendations made for a user | 20 |
| 14 | Recommendations | `recommendation_items` | (`batch_id`, `song_id`) | one song inside a batch, with its scores (junction) | 13 |
| 15 | Playlists | `playlists` | `playlist_id` | one playlist owned by a user | 11 |
| 16 | Playlists | `playlist_songs` | (`playlist_id`, `song_id`) | "this song is in this playlist" (junction) | 4 |

Total columns shown: **162**. Some FK columns point to tables that are not drawn; the diagram marks them
with "→ table" (for example `users.role_id … → roles`). There are 15 such FKs.

## 3. Where the other 48 tables belong

Every table appears exactly once below (the build script checks this and stops if one is missing).

| Core entity | Tables that belong to it | In simple words |
|-------------|--------------------------|-----------------|
| `users` | `roles`, `permissions`, `role_permissions`, `auth_sessions`, `user_languages`, `audit_logs`, `schema_migrations` | login security, roles (admin/user), sessions, the user's preferred languages, the audit trail. `schema_migrations` is bookkeeping only (which migration files ran). |
| `user_profiles` | `regions`, `languages` | lookup lists used by profiles (and by songs, albums, artists) |
| `artists` | `artist_aliases`, `user_artist_preferences` | other names of an artist; how much each user likes each artist |
| `albums` | `album_artists`, `films` | many artists per album; the film a soundtrack belongs to |
| `songs` | `song_artists`, `song_media`, `music_sources`, `source_records`, `pipeline_jobs`, `pipeline_job_logs`, `review_queue`, `trend_snapshots` | featured artists; where a song can legally be played from (source, rights, availability); the import pipeline that loads songs, its logs and manual review; trending statistics |
| `genres` | `user_genre_preferences` | how much each user likes each genre |
| `moods` | `mood_categories`, `mood_keywords`, `contexts`, `context_keywords`, `context_moods`, `user_mood_preferences`, `user_context_preferences` | grouping of moods, words that map to moods, listening contexts (workout, study…) and which moods suit them, user preferences for moods and contexts |
| `song_moods` | `audio_features`, `mood_segments`, `song_mood_curations`, `intelligence_models`, `model_parameters` | the audio measurements used to detect mood, mood per part of a song, manual corrections by curators, and the model (and its settings) that produced the rating |
| `listening_sessions` | `incognito_sessions`, `incognito_events`, `search_history` | private sessions that do not affect recommendations, and search queries |
| `listening_history` | `playback_events`, `ratings`, `user_likes`, `song_dismissals` | pause/seek/skip events inside a play, ratings, likes, "don't recommend this" |
| `recommendation_batches` | `recommendation_batch_moods`, `weekly_worlds`, `world_archetypes`, `archetype_moods`, `world_feedback` | target moods of a batch; the weekly themed "world" built from a batch, its theme templates and the user's feedback |
| `recommendation_items` | `recommendation_reasons`, `reason_types` | why a song was recommended ("because you like calm Telugu songs") |
| `song_genres`, `song_mood_ratings`, `playlists`, `playlist_songs` | — | complete on their own |

7 + 2 + 2 + 2 + 8 + 1 + 7 + 5 + 3 + 4 + 5 + 2 = **48**, plus the 16 shown = **64**.

*TE:* Professor "migata tables ekkada?" ani adigite: "Prati table ee 16 lo okadaniki chendindi — ee table
lo chupinchamu. Full diagram kooda undi (`MUSE_ERD_Full_Schema.pdf`)."

## 4. The 24 relationships (all real foreign keys)

Notation: **1** = exactly one, **0..1** = zero or one, **0..\*** = zero or many.
Solid line = identifying (FK is part of the child's PK); dashed = non-identifying.

| # | Child (FK) → Parent | Name on diagram | Cardinality (parent : child) | FK nullable? | ON DELETE |
|---|--------------------|-----------------|------------------------------|--------------|-----------|
| 1 | `user_profiles.user_id` → `users` | has profile | 1 : 0..1 (one-to-one) | no (FK is the PK) | CASCADE |
| 2 | `listening_sessions.user_id` → `users` | opens | 1 : 0..\* | no | CASCADE |
| 3 | `recommendation_batches.user_id` → `users` | receives | 1 : 0..\* | no | CASCADE |
| 4 | `playlists.user_id` → `users` | owns | 1 : 0..\* | no | CASCADE |
| 5 | `songs.primary_artist_id` → `artists` | performs | 1 : 0..\* | no | RESTRICT |
| 6 | `songs.album_id` → `albums` | contains | 0..1 : 0..\* | yes | SET NULL |
| 7 | `songs.merged_into_song_id` → `songs` | merged into (self) | 0..1 : 0..\* | yes | RESTRICT |
| 8 | `genres.parent_genre_id` → `genres` | sub-genre of (self) | 0..1 : 0..\* | yes | SET NULL |
| 9 | `song_genres.song_id` → `songs` | classified as | 1 : 0..\* | no (in PK) | CASCADE |
| 10 | `song_genres.genre_id` → `genres` | genre of | 1 : 0..\* | no (in PK) | RESTRICT |
| 11 | `song_moods.song_id` → `songs` | tagged with | 1 : 0..\* | no (in PK) | CASCADE |
| 12 | `song_moods.mood_id` → `moods` | mood of | 1 : 0..\* | no (in PK) | CASCADE |
| 13 | `listening_history.(session_id, user_id)` → `listening_sessions` | contains plays | 1 : 0..\* | no | CASCADE |
| 14 | `listening_history.song_id` → `songs` | played | 1 : 0..\* | no | CASCADE |
| 15 | `listening_history.batch_id` → `recommendation_batches` | came from list | 0..1 : 0..\* | yes | SET NULL |
| 16 | `recommendation_batches.seed_song_id` → `songs` | seeded by | 0..1 : 0..\* | yes | SET NULL |
| 17 | `recommendation_items.batch_id` → `recommendation_batches` | ranks | 1 : 0..\* | no (in PK) | CASCADE |
| 18 | `recommendation_items.song_id` → `songs` | recommends | 1 : 0..\* | no (in PK) | CASCADE |
| 19 | `playlist_songs.playlist_id` → `playlists` | includes | 1 : 0..\* | no (in PK) | CASCADE |
| 20 | `playlist_songs.song_id` → `songs` | listed in | 1 : 0..\* | no (in PK) | CASCADE |
| 21 | `playlists.source_batch_id` → `recommendation_batches` | saved from list | 0..1 : 0..\* | yes | SET NULL |
| 22 | `song_mood_ratings.user_id` → `users` | rates mood fit | 1 : 0..\* | no (in PK) | CASCADE |
| 23 | `song_mood_ratings.song_id` → `songs` | mood-rated as | 1 : 0..\* | no (in PK) | CASCADE |
| 24 | `song_mood_ratings.mood_id` → `moods` | rated mood | 1 : 0..\* | no (in PK) | CASCADE |

Notes for accuracy:
- "0..\*" on the child side means the database *allows* zero. For example a batch with no items is
  not blocked by a foreign key; filling a batch with songs is done by the application code, not enforced by the database.
- #13 is a **composite** FK: the play's `user_id` must match the session's user, so a play cannot be
  attached to another user's session.

## 5. Many-to-many relationships (junction tables)

Five of the 16 entities are junction tables that turn an M : N relationship into 1 : N relationships:

| M : N relationship | Junction table | Extra data on the link |
|--------------------|----------------|------------------------|
| songs ↔ genres | `song_genres` | `is_primary` (at most one primary genre per song, enforced by the unique `primary_song_key`) |
| songs ↔ moods | `song_moods` | `confidence`, which model rated it, which audio features were used |
| recommendation batches ↔ songs | `recommendation_items` | rank and all the scores (mood, audio, preference, trend…) |
| playlists ↔ songs | `playlist_songs` | `position`, `added_at` |
| users ↔ songs ↔ moods (ternary) | `song_mood_ratings` | `match_percentage` (0–100, two decimals), `review_text`, timestamps |

*TE:* Oka song ki chala genres, oka genre lo chala songs — idi M : N. Direct ga FK pettalemu, andukē
madhyalo junction table (`song_genres`) pettamu.

## 6. One-to-one example

`users` ↔ `user_profiles`: `user_profiles.user_id` is both the primary key and the foreign key, so each
user has at most one profile. The login data (password hash, lock-out) is kept separate from the
display data (display name, content filter).

## 7. Self-referencing examples

- `genres.parent_genre_id` → `genres` — a genre hierarchy (e.g. a sub-genre under a main genre).
- `songs.merged_into_song_id` → `songs` — when the same song is imported twice, the duplicate points to
  the song it was merged into, so old history is not lost.

## 8. Two-minute script for this diagram

"This is the ER diagram of MUSE, a mood-based music recommendation system. The full database has 64
tables; for clarity this diagram shows the 16 core entities with all their columns, and the 24 foreign
keys between them. On the left is the **user**, with a one-to-one **profile**. In the middle is the
**music catalogue**: songs, artists, albums and genres; songs and genres are many-to-many through
`song_genres`. On the right, **moods** are linked to songs through `song_moods`, which also records
which model produced the prediction and how confident it is. Next to it, `song_mood_ratings` stores what
**users** think: each user can rate how well a song fits each mood from 0 to 100 %, once per song and mood.
The AI's confidence and the users' ratings are kept in different tables, so one never overwrites the other. When a user asks for music, the system
creates a **recommendation batch**; `recommendation_items` stores the ranked songs with their scores.
Every play is stored in **listening history**, inside a **listening session**, and can point back to the
batch it came from. Finally, users save songs into **playlists**, and a playlist can be created from a
batch. The remaining 48 tables support these 16 — for example security tables for users, and audit
and pipeline tables for songs — and are shown in the full diagram."

## 9. Likely questions about this simplified diagram

1. **"Why only 16 tables? Did you remove tables?"** — No. The database has 64; this is a view of the
   16 core entities. Section 3 maps every other table to one of them; the full ERD shows all 64.
2. **"Why are some FKs shown as '→ table' instead of lines?"** — Their parent table is a support table
   that is not drawn (e.g. `roles`). The key is real; only the line is omitted to keep the diagram readable.
3. **"Why is `listening_history` separate from `listening_sessions`?"** — One session has many plays
   (1 : N). Putting plays inside the session row would repeat the session data for every play.
4. **"Why does `song_moods` have three columns in its primary key?"** — The same song can be rated
   for the same mood by different models (`model_id`), so all three are needed to identify a row.
5. **"Why SET NULL for `songs.album_id` but CASCADE for `playlist_songs.song_id`?"** — If an album is
   deleted the song still exists (it just has no album); if a song is deleted it cannot stay in a playlist.
6. **"Why not store the users' mood ratings in `song_moods`?"** — The keys differ: an AI prediction is
   identified by (song, mood, model), a user rating by (user, song, mood). One table would mix two facts and
   break 2NF. The average per song and mood is computed by the view `v_song_mood_rating_stats`, not stored.

## 10. Validation (generated by the build script)

- 16 entities, 162 columns — every column of each table is present (checked against the live schema).
- 24 relationship lines drawn = 24 foreign keys between the 16 tables (checked by counting the lines).
- No text overflows its table box; all 16 entity names are present as vector text in the PDF.
- Every one of the 64 tables is either drawn or mapped exactly once (`core-mapping.json`, `everyTableMappedOnce: true`).
- `MUSE_ERD_Core.mmd` renders with the Mermaid CLI.

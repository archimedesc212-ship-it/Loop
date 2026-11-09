# MUSE — Data dictionary

Generated from the live `muse` schema by `npm run docs:dictionary` on 2026-10-12.
64 tables. Key: **PK** primary key, **UQ** unique, **IX** indexed, **FK** foreign key, *gen* generated column.

## Tables

[`album_artists`](#album_artists) · [`albums`](#albums) · [`archetype_moods`](#archetype_moods) · [`artist_aliases`](#artist_aliases) · [`artists`](#artists) · [`audio_features`](#audio_features) · [`audit_logs`](#audit_logs) · [`auth_sessions`](#auth_sessions) · [`context_keywords`](#context_keywords) · [`context_moods`](#context_moods) · [`contexts`](#contexts) · [`films`](#films) · [`genres`](#genres) · [`incognito_events`](#incognito_events) · [`incognito_sessions`](#incognito_sessions) · [`intelligence_models`](#intelligence_models) · [`languages`](#languages) · [`listening_history`](#listening_history) · [`listening_sessions`](#listening_sessions) · [`model_parameters`](#model_parameters) · [`mood_categories`](#mood_categories) · [`mood_keywords`](#mood_keywords) · [`mood_segments`](#mood_segments) · [`moods`](#moods) · [`music_sources`](#music_sources) · [`permissions`](#permissions) · [`pipeline_job_logs`](#pipeline_job_logs) · [`pipeline_jobs`](#pipeline_jobs) · [`playback_events`](#playback_events) · [`playlist_songs`](#playlist_songs) · [`playlists`](#playlists) · [`ratings`](#ratings) · [`reason_types`](#reason_types) · [`recommendation_batch_moods`](#recommendation_batch_moods) · [`recommendation_batches`](#recommendation_batches) · [`recommendation_items`](#recommendation_items) · [`recommendation_reasons`](#recommendation_reasons) · [`regions`](#regions) · [`review_queue`](#review_queue) · [`role_permissions`](#role_permissions) · [`roles`](#roles) · [`schema_migrations`](#schema_migrations) · [`search_history`](#search_history) · [`song_artists`](#song_artists) · [`song_dismissals`](#song_dismissals) · [`song_genres`](#song_genres) · [`song_media`](#song_media) · [`song_mood_curations`](#song_mood_curations) · [`song_mood_ratings`](#song_mood_ratings) · [`song_moods`](#song_moods) · [`songs`](#songs) · [`source_records`](#source_records) · [`trend_snapshots`](#trend_snapshots) · [`user_artist_preferences`](#user_artist_preferences) · [`user_context_preferences`](#user_context_preferences) · [`user_genre_preferences`](#user_genre_preferences) · [`user_languages`](#user_languages) · [`user_likes`](#user_likes) · [`user_mood_preferences`](#user_mood_preferences) · [`user_profiles`](#user_profiles) · [`users`](#users) · [`weekly_worlds`](#weekly_worlds) · [`world_archetypes`](#world_archetypes) · [`world_feedback`](#world_feedback)

## album_artists

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `album_id` | int unsigned | no | PK FK |  | albums.album_id (on delete cascade) |
| `artist_id` | int unsigned | no | PK FK |  | artists.artist_id (on delete cascade) |
| `credit_order` | tinyint unsigned | no |  | default 1 |  |

**Indexes:** `idx_aa_artist` (artist_id); `PRIMARY` (album_id,artist_id) unique

## albums

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `album_id` | int unsigned | no | PK | auto_increment |  |
| `title` | varchar(150) | no | IX |  |  |
| `normalized_title` | varchar(150) | yes | IX | *gen:* normalised copy of `title` (lower-case, punctuation folded) |  |
| `album_type` | enum('ALBUM','EP','SINGLE','SOUNDTRACK','COMPILATION') | no |  | default ALBUM |  |
| `film_id` | int unsigned | yes | IX FK |  | films.film_id (on delete restrict) |
| `release_year` | smallint unsigned | no |  |  |  |
| `language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete set null) |
| `cover_color_1` | char(7) | no |  |  |  |
| `cover_color_2` | char(7) | no |  |  |  |

**Indexes:** `fk_albums_film` (film_id); `fk_albums_lang` (language_id); `ft_albums_title` (title) fulltext; `idx_albums_normalized` (normalized_title); `PRIMARY` (album_id) unique

**Checks:** `chk_albums_year`, `chk_albums_film`, `chk_albums_colors`

## archetype_moods

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `archetype_code` | varchar(20) | no | PK FK |  | world_archetypes.archetype_code (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `weight` | decimal(3,2) | no |  |  |  |

**Indexes:** `fk_am_mood` (mood_id); `PRIMARY` (archetype_code,mood_id) unique

**Checks:** `chk_am_weight`

## artist_aliases

Alternative spellings / transliterations / native-script names. Used by search ("arjit" -> "Arijit") and by duplicate detection.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `alias_id` | int unsigned | no | PK | auto_increment |  |
| `artist_id` | int unsigned | no | IX FK |  | artists.artist_id (on delete cascade) |
| `alias` | varchar(100) | no | IX |  |  |
| `normalized_alias` | varchar(100) | yes | IX | *gen:* normalised copy of `alias` (lower-case, punctuation folded) |  |
| `alias_type` | enum('SPELLING','TRANSLITERATION','NATIVE_SCRIPT','STAGE_NAME') | no |  |  |  |

**Indexes:** `ft_aliases_alias` (alias) fulltext; `idx_aliases_normalized` (normalized_alias); `PRIMARY` (alias_id) unique; `uq_aliases_artist_alias` (artist_id,normalized_alias) unique

## artists

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `artist_id` | int unsigned | no | PK | auto_increment |  |
| `name` | varchar(100) | no | IX |  |  |
| `normalized_name` | varchar(100) | yes | IX | *gen:* normalised copy of `name` (lower-case, punctuation folded) |  |
| `disambiguation` | varchar(80) | no |  | default  |  |
| `artist_type` | enum('SOLO','GROUP','COMPOSER','ORCHESTRA') | no |  | default SOLO |  |
| `country_code` | char(2) | no |  | default IN |  |
| `region_code` | varchar(6) | yes | IX FK |  | regions.region_code (on delete set null) |
| `primary_language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete set null) |
| `formed_year` | smallint unsigned | yes |  |  |  |
| `bio` | varchar(400) | yes |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_artists_lang` (primary_language_id); `fk_artists_region` (region_code); `ft_artists_name` (name) fulltext; `PRIMARY` (artist_id) unique; `uq_artists_identity` (normalized_name,disambiguation) unique

**Checks:** `chk_artists_year`

## audio_features

Every analysis run is a NEW row; old analyses are never overwritten.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `feature_id` | int unsigned | no | PK | auto_increment |  |
| `song_id` | int unsigned | no | IX FK |  | songs.song_id (on delete cascade) |
| `model_id` | smallint unsigned | no | IX FK |  | intelligence_models.model_id (on delete restrict) |
| `energy` | decimal(4,3) | no | IX |  |  |
| `valence` | decimal(4,3) | no |  |  |  |
| `danceability` | decimal(4,3) | no |  |  |  |
| `acousticness` | decimal(4,3) | no |  |  |  |
| `instrumentalness` | decimal(4,3) | no |  |  |  |
| `speechiness` | decimal(4,3) | no |  |  |  |
| `loudness_db` | decimal(5,2) | no |  |  |  |
| `tempo_bpm` | decimal(5,1) | no |  |  |  |
| `musical_key` | tinyint unsigned | no |  |  |  |
| `mode` | tinyint unsigned | no |  |  |  |
| `analyzed_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `is_current` | tinyint(1) | no |  | default 0 |  |
| `current_song_key` | int unsigned | yes | UQ | *gen:* `if((`is_current` = 1),`song_id`,NULL)` |  |

**Indexes:** `fk_af_model` (model_id); `idx_af_energy_valence` (energy,valence); `PRIMARY` (feature_id) unique; `uq_af_one_current` (current_song_key) unique; `uq_af_song_model` (song_id,model_id) unique

**Checks:** `chk_af_unit`, `chk_af_loudness`, `chk_af_tempo`, `chk_af_key`

## audit_logs

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `audit_id` | bigint unsigned | no | PK | auto_increment |  |
| `actor_user_id` | int unsigned | yes | IX FK |  | users.user_id (on delete set null) |
| `action` | varchar(40) | no |  |  |  |
| `entity_type` | varchar(30) | no | IX |  |  |
| `entity_id` | varchar(40) | no |  |  |  |
| `old_values` | json | yes |  |  |  |
| `new_values` | json | yes |  |  |  |
| `ip_address` | varchar(45) | yes |  |  |  |
| `created_at` | datetime(3) | no | IX | default CURRENT_TIMESTAMP(3), DEFAULT_GENERATED |  |

**Indexes:** `idx_audit_actor` (actor_user_id,created_at); `idx_audit_entity` (entity_type,entity_id); `idx_audit_time` (created_at); `PRIMARY` (audit_id) unique

## auth_sessions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `session_id` | char(16) | no | PK |  |  |
| `token_hash` | char(64) | no | UQ |  |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `last_seen_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `expires_at` | datetime | no | IX |  |  |
| `revoked_at` | datetime | yes |  |  |  |
| `revoke_reason` | enum('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGED','ADMIN_DEACTIVATED','REVOKED_BY_USER','ACCOUNT_DELETED') | yes |  |  |  |
| `user_agent` | varchar(160) | yes |  |  |  |
| `ip_hash` | char(64) | yes |  |  |  |

**Indexes:** `idx_session_expiry` (expires_at); `idx_session_user` (user_id,revoked_at,expires_at); `PRIMARY` (session_id) unique; `uq_session_token` (token_hash) unique

**Checks:** `chk_session_times`, `chk_session_revoke`

## context_keywords

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `phrase` | varchar(60) | no | PK |  |  |
| `context_id` | tinyint unsigned | no | IX FK |  | contexts.context_id (on delete cascade) |

**Indexes:** `fk_ck_ctx` (context_id); `PRIMARY` (phrase) unique

**Checks:** `chk_ck_lower`

## context_moods

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `context_id` | tinyint unsigned | no | PK FK |  | contexts.context_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `weight` | decimal(3,2) | no |  |  |  |

**Indexes:** `fk_cm_mood` (mood_id); `PRIMARY` (context_id,mood_id) unique

**Checks:** `chk_cm_weight`

## contexts

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `context_id` | tinyint unsigned | no | PK | auto_increment |  |
| `code` | varchar(20) | no | UQ |  |  |
| `name` | varchar(40) | no |  |  |  |
| `emoji` | varchar(8) | no |  |  |  |
| `description` | varchar(200) | no |  |  |  |
| `target_energy` | decimal(4,3) | no |  |  |  |
| `target_valence` | decimal(4,3) | no |  |  |  |
| `target_danceability` | decimal(4,3) | no |  |  |  |
| `target_acousticness` | decimal(4,3) | no |  |  |  |
| `target_instrumentalness` | decimal(4,3) | no |  |  |  |
| `tempo_min` | decimal(5,1) | no |  |  |  |
| `tempo_max` | decimal(5,1) | no |  |  |  |
| `max_speechiness` | decimal(4,3) | no |  | default 1.000 |  |
| `sort_order` | tinyint unsigned | no |  |  |  |

**Indexes:** `PRIMARY` (context_id) unique; `uq_contexts_code` (code) unique

**Checks:** `chk_ctx_code`, `chk_ctx_targets`, `chk_ctx_tempo`

## films

Films whose soundtracks appear in the catalogue (Indian cinema ecosystem).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `film_id` | int unsigned | no | PK | auto_increment |  |
| `title` | varchar(150) | no | IX |  |  |
| `release_year` | smallint unsigned | no |  |  |  |
| `language_id` | smallint unsigned | no | IX FK |  | languages.language_id (on delete restrict) |

**Indexes:** `fk_films_lang` (language_id); `PRIMARY` (film_id) unique; `uq_films_identity` (title,release_year,language_id) unique

**Checks:** `chk_films_year`

## genres

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `genre_id` | smallint unsigned | no | PK | auto_increment |  |
| `name` | varchar(40) | no | UQ |  |  |
| `parent_genre_id` | smallint unsigned | yes | IX FK |  | genres.genre_id (on delete set null) |
| `color_hex` | char(7) | no |  |  |  |
| `description` | varchar(200) | yes |  |  |  |

**Indexes:** `fk_genres_parent` (parent_genre_id); `PRIMARY` (genre_id) unique; `uq_genres_name` (name) unique

**Checks:** `chk_genres_color`

## incognito_events

Temporary listening memory. Deleted with its session (CASCADE).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `event_id` | bigint unsigned | no | PK | auto_increment |  |
| `incognito_id` | bigint unsigned | no | IX FK |  | incognito_sessions.incognito_id (on delete cascade) |
| `song_id` | int unsigned | no | IX FK |  | songs.song_id (on delete cascade) |
| `listened_sec` | smallint unsigned | no |  |  |  |
| `completed` | tinyint(1) | no |  | default 0 |  |
| `skipped` | tinyint(1) | no |  | default 0 |  |
| `occurred_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_ie_song` (song_id); `idx_ie_session` (incognito_id,occurred_at); `PRIMARY` (event_id) unique

**Checks:** `chk_ie_flags`

## incognito_sessions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `incognito_id` | bigint unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `current_mood_id` | smallint unsigned | yes | IX FK |  | moods.mood_id (on delete set null) |
| `status` | enum('ACTIVE','ENDED','EXPIRED') | no | IX | default ACTIVE |  |
| `active_user_key` | int unsigned | yes | UQ | *gen:* `if((`status` = _utf8mb4\'ACTIVE\'),`user_id`,NULL)` |  |
| `started_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `expires_at` | datetime | no |  |  |  |
| `ended_at` | datetime | yes |  |  |  |

**Indexes:** `fk_incog_mood` (current_mood_id); `fk_incog_user` (user_id); `idx_incog_expiry` (status,expires_at); `PRIMARY` (incognito_id) unique; `uq_incog_one_active` (active_user_key) unique

**Checks:** `chk_incog_times`, `chk_incog_state`

## intelligence_models

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `model_id` | smallint unsigned | no | PK | auto_increment |  |
| `kind` | enum('AUDIO_FEATURES','MOOD','SEGMENTS','PREFERENCE','RECOMMENDER','WORLD') | no | IX |  |  |
| `name` | varchar(40) | no |  |  |  |
| `version` | varchar(20) | no |  |  |  |
| `description` | varchar(300) | no |  |  |  |
| `is_active` | tinyint(1) | no |  | default 0 |  |
| `active_kind` | varchar(20) | yes | UQ | *gen:* `if((`is_active` = 1),`kind`,NULL)` |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `PRIMARY` (model_id) unique; `uq_models_one_active` (active_kind) unique; `uq_models_version` (kind,name,version) unique

## languages

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `language_id` | smallint unsigned | no | PK | auto_increment |  |
| `iso_code` | varchar(3) | no | UQ |  |  |
| `name` | varchar(40) | no | UQ |  |  |
| `native_name` | varchar(40) | no |  |  |  |
| `script` | varchar(30) | no |  |  |  |

**Indexes:** `PRIMARY` (language_id) unique; `uq_languages_iso` (iso_code) unique; `uq_languages_name` (name) unique

**Checks:** `chk_languages_iso`

## listening_history

One row per play. user_id is carried for fast per-user analytics; the composite FK (session_id, user_id) guarantees it always equals the session's user, so the session_id -> user_id dependency cannot be violated.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `play_id` | bigint unsigned | no | PK | auto_increment |  |
| `session_id` | bigint unsigned | no | IX FK |  | listening_sessions.session_id (on delete cascade) |
| `user_id` | int unsigned | no | IX FK |  | listening_sessions.user_id (on delete cascade) |
| `song_id` | int unsigned | no | IX FK |  | songs.song_id (on delete cascade) |
| `batch_id` | bigint unsigned | yes | IX FK |  | recommendation_batches.batch_id (on delete set null) |
| `origin` | enum('HOME','MOOD','CONTEXT','WORLD','SEARCH','PLAYLIST','LIBRARY','SMART_PLAYLIST') | no |  | default HOME |  |
| `started_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `ended_at` | datetime | yes |  |  |  |
| `listened_sec` | smallint unsigned | no |  | default 0 |  |
| `completion_pct` | decimal(5,2) | no |  | default 0.00 |  |
| `completed` | tinyint(1) | no |  | default 0 |  |
| `skipped` | tinyint(1) | no |  | default 0 |  |
| `is_replay` | tinyint(1) | no |  | default 0 |  |

**Indexes:** `fk_lh_batch` (batch_id); `fk_lh_session_user` (session_id,user_id); `idx_lh_session` (session_id); `idx_lh_song_time` (song_id,started_at); `idx_lh_user_song` (user_id,song_id,started_at); `idx_lh_user_time` (user_id,started_at); `PRIMARY` (play_id) unique

**Checks:** `chk_lh_end`, `chk_lh_flags`, `chk_lh_pct`

## listening_sessions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `session_id` | bigint unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `context_id` | tinyint unsigned | yes | IX FK |  | contexts.context_id (on delete set null) |
| `device` | varchar(30) | no |  | default web |  |
| `started_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `last_activity_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `ended_at` | datetime | yes |  |  |  |
| `status` | enum('OPEN','CLOSED') | no |  | default OPEN |  |
| `plays` | smallint unsigned | no |  | default 0 |  |
| `listen_sec` | int unsigned | no |  | default 0 |  |

**Indexes:** `fk_ls_ctx` (context_id); `idx_ls_user_status` (user_id,status,last_activity_at); `PRIMARY` (session_id) unique; `uq_ls_session_user` (session_id,user_id) unique

**Checks:** `chk_ls_state`

## model_parameters

Tunable numbers of a model version: recommender weights, diversity caps, preference half-lives, mood thresholds. Changing a value is audited.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `model_id` | smallint unsigned | no | PK FK |  | intelligence_models.model_id (on delete cascade) |
| `param_code` | varchar(40) | no | PK |  |  |
| `param_value` | decimal(10,4) | no |  |  |  |
| `min_value` | decimal(10,4) | no |  |  |  |
| `max_value` | decimal(10,4) | no |  |  |  |
| `description` | varchar(200) | no |  |  |  |

**Indexes:** `PRIMARY` (model_id,param_code) unique

**Checks:** `chk_mp_range`

## mood_categories

Valence/arousal quadrants (circumplex model) grouping the moods.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `category_id` | tinyint unsigned | no | PK | auto_increment |  |
| `name` | varchar(40) | no | UQ |  |  |
| `quadrant` | enum('BRIGHT_HIGH','BRIGHT_LOW','DARK_HIGH','DARK_LOW') | no | UQ |  |  |
| `description` | varchar(200) | no |  |  |  |

**Indexes:** `PRIMARY` (category_id) unique; `uq_mc_name` (name) unique; `uq_mc_quadrant` (quadrant) unique

## mood_keywords

Vocabulary for the deterministic "describe how you feel" parser.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `keyword_id` | int unsigned | no | PK | auto_increment |  |
| `phrase` | varchar(60) | no | IX |  |  |
| `mood_id` | smallint unsigned | no | IX FK |  | moods.mood_id (on delete cascade) |
| `weight` | decimal(3,2) | no |  |  |  |

**Indexes:** `idx_mk_mood` (mood_id); `PRIMARY` (keyword_id) unique; `uq_mk` (phrase,mood_id) unique

**Checks:** `chk_mk_weight`, `chk_mk_lower`

## mood_segments

Mood changes inside a song (intro calm -> chorus euphoric ...). Energy/valence here are SEGMENT-level measurements, not copies of the song's.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `segment_id` | int unsigned | no | PK | auto_increment |  |
| `song_id` | int unsigned | no | IX FK |  | songs.song_id (on delete cascade) |
| `model_id` | smallint unsigned | no | IX FK |  | intelligence_models.model_id (on delete restrict) |
| `segment_index` | tinyint unsigned | no |  |  |  |
| `start_sec` | smallint unsigned | no |  |  |  |
| `end_sec` | smallint unsigned | no |  |  |  |
| `mood_id` | smallint unsigned | no | IX FK |  | moods.mood_id (on delete restrict) |
| `confidence` | decimal(4,3) | no |  |  |  |
| `energy` | decimal(4,3) | no |  |  |  |
| `valence` | decimal(4,3) | no |  |  |  |
| `analyzed_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_ms_model` (model_id); `fk_ms_mood` (mood_id); `PRIMARY` (segment_id) unique; `uq_ms_order` (song_id,model_id,segment_index) unique

**Checks:** `chk_ms_span`, `chk_ms_vals`

## moods

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `mood_id` | smallint unsigned | no | PK | auto_increment |  |
| `category_id` | tinyint unsigned | no | IX FK |  | mood_categories.category_id (on delete restrict) |
| `name` | varchar(30) | no | UQ |  |  |
| `emoji` | varchar(8) | no |  |  |  |
| `color_hex` | char(7) | no |  |  |  |
| `description` | varchar(200) | no |  |  |  |
| `target_energy` | decimal(4,3) | no |  |  |  |
| `target_valence` | decimal(4,3) | no |  |  |  |
| `target_danceability` | decimal(4,3) | no |  |  |  |
| `target_acousticness` | decimal(4,3) | no |  |  |  |
| `target_instrumentalness` | decimal(4,3) | no |  |  |  |
| `tempo_min` | decimal(5,1) | no |  |  |  |
| `tempo_max` | decimal(5,1) | no |  |  |  |

**Indexes:** `fk_moods_category` (category_id); `PRIMARY` (mood_id) unique; `uq_moods_name` (name) unique

**Checks:** `chk_moods_targets`, `chk_moods_tempo`, `chk_moods_color`

## music_sources

Each source declares what it may legally provide (rights_scope) and an optional fallback: PRIMARY SOURCE -> APPROVED FALLBACK -> CACHED DB DATA.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `source_id` | smallint unsigned | no | PK | auto_increment |  |
| `code` | varchar(30) | no | UQ |  |  |
| `name` | varchar(80) | no |  |  |  |
| `source_type` | enum('MUSIC_METADATA','AUDIO_ANALYSIS','MUSIC_AUDIO','PLAYBACK','MOVIE_METADATA','ARTWORK','VIDEO_METADATA') | no |  |  |  |
| `access_method` | enum('API','FILE_FEED','GENERATED','USER_UPLOAD','MANUAL') | no |  |  |  |
| `base_url` | varchar(255) | yes |  |  |  |
| `license_name` | varchar(120) | no |  |  |  |
| `rights_scope` | set('METADATA','AUDIO_FEATURES','AUDIO_PREVIEW','AUDIO_FULL','ARTWORK') | no |  |  |  |
| `requires_attribution` | tinyint(1) | no |  | default 0 |  |
| `attribution_text` | varchar(255) | yes |  |  |  |
| `priority` | tinyint unsigned | no |  | default 50 |  |
| `fallback_source_id` | smallint unsigned | yes | IX FK |  | music_sources.source_id (on delete set null) |
| `is_enabled` | tinyint(1) | no |  | default 1 |  |
| `requires_credentials` | tinyint(1) | no |  | default 0 |  |
| `last_success_at` | datetime | yes |  |  |  |
| `notes` | varchar(300) | yes |  |  |  |

**Indexes:** `fk_sources_fallback` (fallback_source_id); `PRIMARY` (source_id) unique; `uq_sources_code` (code) unique

**Checks:** `chk_sources_attrib`

## permissions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `permission_code` | varchar(40) | no | PK |  |  |
| `description` | varchar(200) | no |  |  |  |

**Indexes:** `PRIMARY` (permission_code) unique

## pipeline_job_logs

Job log; rows with level = 'ERROR' are the ingestion error list.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `log_id` | bigint unsigned | no | PK | auto_increment |  |
| `job_id` | bigint unsigned | no | IX FK |  | pipeline_jobs.job_id (on delete cascade) |
| `level` | enum('INFO','WARN','ERROR') | no | IX |  |  |
| `stage` | varchar(30) | no |  |  |  |
| `message` | varchar(500) | no |  |  |  |
| `record_id` | bigint unsigned | yes | IX FK |  | source_records.record_id (on delete set null) |
| `created_at` | datetime(3) | no |  | default CURRENT_TIMESTAMP(3), DEFAULT_GENERATED |  |

**Indexes:** `fk_logs_record` (record_id); `idx_logs_job` (job_id,log_id); `idx_logs_level` (level,created_at); `PRIMARY` (log_id) unique

## pipeline_jobs

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `job_id` | bigint unsigned | no | PK | auto_increment |  |
| `job_type` | enum('INGEST_SOURCE','AUDIO_ANALYSIS','MOOD_ANALYSIS','TREND_SNAPSHOT','WORLD_GENERATION','WEEKLY_INTELLIGENCE','PREFERENCE_REFRESH','INCOGNITO_CLEANUP','SESSION_CLOSE') | no | IX |  |  |
| `parent_job_id` | bigint unsigned | yes | IX FK |  | pipeline_jobs.job_id (on delete set null) |
| `source_id` | smallint unsigned | yes | IX FK |  | music_sources.source_id (on delete set null) |
| `idempotency_key` | varchar(120) | no | UQ |  |  |
| `status` | enum('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED') | no | IX | default DISCOVERED |  |
| `params` | json | yes |  |  |  |
| `processing_version` | varchar(20) | no |  |  |  |
| `retry_count` | tinyint unsigned | no |  | default 0 |  |
| `max_retries` | tinyint unsigned | no |  | default 3 |  |
| `next_attempt_at` | datetime | yes |  |  |  |
| `locked_by` | varchar(64) | yes |  |  |  |
| `locked_at` | datetime | yes |  |  |  |
| `requested_by` | int unsigned | yes | IX FK |  | users.user_id (on delete set null) |
| `stats` | json | yes |  |  |  |
| `last_error` | varchar(500) | yes |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `started_at` | datetime | yes |  |  |  |
| `completed_at` | datetime | yes |  |  |  |

**Indexes:** `fk_jobs_parent` (parent_job_id); `fk_jobs_source` (source_id); `fk_jobs_user` (requested_by); `idx_jobs_claim` (status,next_attempt_at); `idx_jobs_queue` (status,job_id); `idx_jobs_type_time` (job_type,created_at); `PRIMARY` (job_id) unique; `uq_jobs_idem` (idempotency_key) unique

**Checks:** `chk_jobs_retry`, `chk_jobs_times`

## playback_events

Meaningful player events only (no hover/scroll noise).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `event_id` | bigint unsigned | no | PK | auto_increment |  |
| `play_id` | bigint unsigned | no | IX FK |  | listening_history.play_id (on delete cascade) |
| `event_type` | enum('PLAY_STARTED','PAUSE','RESUME','SEEK','SKIP','COMPLETED','REPLAY') | no |  |  |  |
| `position_sec` | smallint unsigned | no |  |  |  |
| `seek_to_sec` | smallint unsigned | yes |  |  |  |
| `occurred_at` | datetime(3) | no |  | default CURRENT_TIMESTAMP(3), DEFAULT_GENERATED |  |

**Indexes:** `idx_pe_play` (play_id,occurred_at); `PRIMARY` (event_id) unique

**Checks:** `chk_pe_seek`

## playlist_songs

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `playlist_id` | int unsigned | no | PK FK |  | playlists.playlist_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `position` | smallint unsigned | no |  | default 0 |  |
| `added_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `idx_ps_song` (song_id); `PRIMARY` (playlist_id,song_id) unique

## playlists

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `playlist_id` | int unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `name` | varchar(80) | no |  |  |  |
| `description` | varchar(255) | yes |  |  |  |
| `kind` | enum('MANUAL','SMART','SAVED_MIX','WORLD') | no |  | default MANUAL |  |
| `smart_type` | varchar(30) | yes |  |  |  |
| `source_batch_id` | bigint unsigned | yes | IX FK |  | recommendation_batches.batch_id (on delete set null) |
| `song_count` | smallint unsigned | no |  | default 0 |  |
| `total_duration_sec` | int unsigned | no |  | default 0 |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_pl_batch` (source_batch_id); `PRIMARY` (playlist_id) unique; `uq_playlists_user_name` (user_id,name) unique

**Checks:** `chk_pl_name`, `chk_pl_smart`

## ratings

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `rating` | tinyint unsigned | no |  |  |  |
| `rated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `idx_ratings_song` (song_id,rating); `PRIMARY` (user_id,song_id) unique

**Checks:** `chk_ratings_value`

## reason_types

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `reason_code` | varchar(30) | no | PK |  |  |
| `template` | varchar(160) | no |  |  |  |
| `score_family` | varchar(30) | no |  |  |  |

**Indexes:** `PRIMARY` (reason_code) unique

## recommendation_batch_moods

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `batch_id` | bigint unsigned | no | PK FK |  | recommendation_batches.batch_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `weight` | decimal(3,2) | no |  |  |  |

**Indexes:** `idx_rbm_mood` (mood_id); `PRIMARY` (batch_id,mood_id) unique

**Checks:** `chk_rbm_weight`

## recommendation_batches

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `batch_id` | bigint unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `incognito_id` | bigint unsigned | yes | IX FK |  | incognito_sessions.incognito_id (on delete cascade) |
| `model_id` | smallint unsigned | no | IX FK |  | intelligence_models.model_id (on delete restrict) |
| `strategy` | enum('MOOD','TEXT','CONTEXT','DAILY','SIMILAR','TRENDING','DISCOVERY','REGIONAL','WORLD','SMART_PLAYLIST','RECOVERY') | no |  |  |  |
| `label` | varchar(120) | yes |  |  |  |
| `input_text` | varchar(280) | yes |  |  |  |
| `context_id` | tinyint unsigned | yes | IX FK |  | contexts.context_id (on delete set null) |
| `seed_song_id` | int unsigned | yes | IX FK |  | songs.song_id (on delete set null) |
| `language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete set null) |
| `target_energy` | decimal(4,3) | no |  |  |  |
| `target_valence` | decimal(4,3) | no |  |  |  |
| `target_danceability` | decimal(4,3) | no |  |  |  |
| `target_acousticness` | decimal(4,3) | no |  |  |  |
| `target_instrumentalness` | decimal(4,3) | no |  |  |  |
| `tempo_min` | decimal(5,1) | no |  |  |  |
| `tempo_max` | decimal(5,1) | no |  |  |  |
| `max_speechiness` | decimal(4,3) | no |  | default 1.000 |  |
| `discovery_only` | tinyint(1) | no |  | default 0 |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_rb_ctx` (context_id); `fk_rb_incognito` (incognito_id); `fk_rb_lang` (language_id); `fk_rb_model` (model_id); `fk_rb_seed` (seed_song_id); `idx_rb_user_time` (user_id,created_at); `PRIMARY` (batch_id) unique

**Checks:** `chk_rb_targets`, `chk_rb_tempo`

## recommendation_items

Ranked items with the full score breakdown (1:1 with the item, so kept in-row).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `batch_id` | bigint unsigned | no | PK FK |  | recommendation_batches.batch_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `rank_position` | smallint unsigned | no |  |  |  |
| `final_score` | decimal(6,4) | no |  |  |  |
| `mood_score` | decimal(6,4) | yes |  |  |  |
| `audio_score` | decimal(6,4) | no |  |  |  |
| `preference_score` | decimal(6,4) | no |  |  |  |
| `recency_score` | decimal(6,4) | yes |  |  |  |
| `trend_score` | decimal(6,4) | no |  |  |  |
| `context_score` | decimal(6,4) | yes |  |  |  |
| `regional_score` | decimal(6,4) | yes |  |  |  |
| `exploration_score` | decimal(6,4) | no |  |  |  |
| `repetition_penalty` | decimal(6,4) | no |  |  |  |

**Indexes:** `idx_ri_song` (song_id); `PRIMARY` (batch_id,song_id) unique; `uq_ri_rank` (batch_id,rank_position) unique

**Checks:** `chk_ri_score`

## recommendation_reasons

Normalised reasons: code + the real values that justified it.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `batch_id` | bigint unsigned | no | PK FK |  | recommendation_items.batch_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | recommendation_items.song_id (on delete cascade) |
| `reason_code` | varchar(30) | no | PK FK |  | reason_types.reason_code (on delete restrict) |
| `strength` | decimal(5,3) | no |  |  |  |
| `params` | json | no |  |  |  |

**Indexes:** `idx_rr_code` (reason_code); `PRIMARY` (batch_id,song_id,reason_code) unique

## regions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `region_code` | varchar(6) | no | PK |  |  |
| `name` | varchar(60) | no | UQ |  |  |
| `country_code` | char(2) | no |  |  |  |
| `primary_language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete set null) |

**Indexes:** `fk_regions_language` (primary_language_id); `PRIMARY` (region_code) unique; `uq_regions_name` (name) unique

**Checks:** `chk_regions_code`

## review_queue

Admin review queue: ambiguous duplicates, suspicious metadata, failures, conflicts.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `review_id` | bigint unsigned | no | PK | auto_increment |  |
| `review_type` | enum('POSSIBLE_DUPLICATE','SUSPICIOUS_METADATA','FAILED_INGESTION','SOURCE_CONFLICT') | no |  |  |  |
| `record_id` | bigint unsigned | yes | IX FK |  | source_records.record_id (on delete cascade) |
| `candidate_song_id` | int unsigned | yes | IX FK |  | songs.song_id (on delete set null) |
| `job_id` | bigint unsigned | yes | IX FK |  | pipeline_jobs.job_id (on delete set null) |
| `score` | decimal(4,3) | yes |  |  |  |
| `details` | json | no |  |  |  |
| `status` | enum('PENDING','APPROVED','REJECTED','MERGED','IGNORED','REPROCESS') | no | IX | default PENDING |  |
| `pending_key` | varchar(80) | yes | UQ | *gen:* `if((`status` = _utf8mb4\'PENDING\'),concat(`review_type`,_utf8mb4\':\',coalesce(` |  |
| `decided_by` | int unsigned | yes | IX FK |  | users.user_id (on delete set null) |
| `decided_at` | datetime | yes |  |  |  |
| `decision_note` | varchar(300) | yes |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_rq_job` (job_id); `fk_rq_record` (record_id); `fk_rq_song` (candidate_song_id); `fk_rq_user` (decided_by); `idx_review_status` (status,created_at); `PRIMARY` (review_id) unique; `uq_review_one_pending` (pending_key) unique

**Checks:** `chk_rq_decided`

## role_permissions

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `role_id` | tinyint unsigned | no | PK FK |  | roles.role_id (on delete cascade) |
| `permission_code` | varchar(40) | no | PK FK |  | permissions.permission_code (on delete cascade) |

**Indexes:** `fk_rp_perm` (permission_code); `PRIMARY` (role_id,permission_code) unique

## roles

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `role_id` | tinyint unsigned | no | PK | auto_increment |  |
| `code` | varchar(20) | no | UQ |  |  |
| `name` | varchar(40) | no |  |  |  |

**Indexes:** `PRIMARY` (role_id) unique; `uq_roles_code` (code) unique

## schema_migrations

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `version` | char(4) | no | PK |  |  |
| `name` | varchar(120) | no |  |  |  |
| `checksum` | char(64) | yes |  |  |  |
| `applied_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `execution_ms` | int unsigned | no |  | default 0 |  |

**Indexes:** `PRIMARY` (version) unique

**Checks:** `chk_mig_version`

## search_history

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `search_id` | bigint unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `query_text` | varchar(120) | no |  |  |  |
| `normalized_query` | varchar(120) | no | IX |  |  |
| `result_count` | smallint unsigned | no |  |  |  |
| `searched_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `idx_sh_query` (normalized_query); `idx_sh_user_time` (user_id,searched_at); `PRIMARY` (search_id) unique

## song_artists

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `artist_id` | int unsigned | no | PK FK |  | artists.artist_id (on delete cascade) |
| `role` | enum('FEATURED','COMPOSER','LYRICIST','PRODUCER') | no | PK |  |  |
| `credit_order` | tinyint unsigned | no |  | default 1 |  |

**Indexes:** `idx_sa_artist` (artist_id); `PRIMARY` (song_id,artist_id,role) unique

## song_dismissals

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `batch_id` | bigint unsigned | yes | IX FK |  | recommendation_batches.batch_id (on delete set null) |
| `dismissed_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `idx_dismiss_batch` (batch_id); `idx_dismiss_song` (song_id); `PRIMARY` (user_id,song_id) unique

## song_genres

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `genre_id` | smallint unsigned | no | PK FK |  | genres.genre_id (on delete restrict) |
| `is_primary` | tinyint(1) | no |  | default 0 |  |
| `primary_song_key` | int unsigned | yes | UQ | *gen:* `if((`is_primary` = 1),`song_id`,NULL)` |  |

**Indexes:** `idx_sg_genre` (genre_id,is_primary); `PRIMARY` (song_id,genre_id) unique; `uq_sg_one_primary` (primary_song_key) unique

## song_media

How a song can legally be played. Resolved in priority order.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `media_id` | int unsigned | no | PK | auto_increment |  |
| `song_id` | int unsigned | no | IX FK |  | songs.song_id (on delete cascade) |
| `source_id` | smallint unsigned | no | IX FK |  | music_sources.source_id (on delete restrict) |
| `media_type` | enum('PREVIEW','FULL','GENERATED_SKETCH','USER_LOCAL') | no |  |  |  |
| `uri` | varchar(500) | yes |  |  |  |
| `rights_status` | enum('PERMITTED','ATTRIBUTION_REQUIRED','RESTRICTED') | no |  |  |  |
| `availability` | enum('AVAILABLE','UNAVAILABLE','UNCHECKED') | no |  | default UNCHECKED |  |
| `last_checked_at` | datetime | yes |  |  |  |
| `attribution` | varchar(200) | yes |  |  |  |
| `priority` | tinyint unsigned | no |  | default 50 |  |

**Indexes:** `fk_media_source` (source_id); `idx_media_song_avail` (song_id,availability); `PRIMARY` (media_id) unique; `uq_media` (song_id,source_id,media_type) unique

**Checks:** `chk_media_uri`

## song_mood_curations

Human curation of song moods. song_moods is rebuilt per model version, so a curator's decision lives here and sp_analyze_song_moods re-applies it after every analysis run: ADD forces a tag in, REMOVE keeps a tag out.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `action` | enum('ADD','REMOVE') | no |  |  |  |
| `confidence` | decimal(4,3) | yes |  |  |  |
| `note` | varchar(200) | yes |  |  |  |
| `curated_by` | int unsigned | yes | IX FK |  | users.user_id (on delete set null) |
| `curated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `fk_smc_curator` (curated_by); `idx_smc_mood` (mood_id); `PRIMARY` (song_id,mood_id) unique

**Checks:** `chk_smc_conf`

## song_mood_ratings

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `match_percentage` | decimal(5,2) | no |  |  |  |
| `review_text` | varchar(280) | yes |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `idx_smr_mood_song` (mood_id,song_id,match_percentage); `idx_smr_song_mood` (song_id,mood_id,match_percentage); `PRIMARY` (user_id,song_id,mood_id) unique

**Checks:** `chk_smr_pct`, `chk_smr_review`

## song_moods

songs <-> moods (M:N), one row per analysis model version. feature_id records the exact audio analysis the mood was derived from (lineage).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `model_id` | smallint unsigned | no | PK FK |  | intelligence_models.model_id (on delete restrict) |
| `confidence` | decimal(4,3) | no |  |  |  |
| `feature_id` | int unsigned | no | IX FK |  | audio_features.feature_id (on delete cascade) |
| `analyzed_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_sm_feature` (feature_id); `fk_sm_mood` (mood_id); `idx_sm_model_mood` (model_id,mood_id,confidence); `PRIMARY` (song_id,mood_id,model_id) unique

**Checks:** `chk_sm_conf`

## songs

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `song_id` | int unsigned | no | PK | auto_increment |  |
| `title` | varchar(150) | no | IX |  |  |
| `normalized_title` | varchar(150) | yes |  | *gen:* normalised copy of `title` (lower-case, punctuation folded) |  |
| `version_label` | varchar(40) | no |  | default  |  |
| `primary_artist_id` | int unsigned | no | IX FK |  | artists.artist_id (on delete restrict) |
| `album_id` | int unsigned | yes | IX FK |  | albums.album_id (on delete set null) |
| `track_number` | tinyint unsigned | yes |  |  |  |
| `duration_sec` | smallint unsigned | no |  |  |  |
| `release_year` | smallint unsigned | no |  |  |  |
| `language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete restrict) |
| `isrc` | char(12) | yes | UQ |  |  |
| `explicit` | tinyint(1) | no |  | default 0 |  |
| `content_rating` | enum('ALL','TEEN','MATURE') | no |  | default ALL |  |
| `popularity` | tinyint unsigned | no |  | default 50 |  |
| `status` | enum('ACTIVE','PENDING_ANALYSIS','HIDDEN','MERGED') | no | IX | default ACTIVE |  |
| `merged_into_song_id` | int unsigned | yes | IX FK |  | songs.song_id (on delete restrict) |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `fk_songs_merged` (merged_into_song_id); `ft_songs_title` (title) fulltext; `idx_songs_album` (album_id,track_number); `idx_songs_lang_status` (language_id,status); `idx_songs_status_pop` (status,popularity); `PRIMARY` (song_id) unique; `uq_songs_identity` (primary_artist_id,normalized_title,version_label) unique; `uq_songs_isrc` (isrc) unique

**Checks:** `chk_songs_duration`, `chk_songs_year`, `chk_songs_pop`, `chk_songs_isrc`, `chk_songs_merge`, `chk_songs_explicit`

## source_records

Provenance: one row per (source, entity type, external id). Links to the canonical catalogue row once resolved.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `record_id` | bigint unsigned | no | PK | auto_increment |  |
| `source_id` | smallint unsigned | no | IX FK |  | music_sources.source_id (on delete restrict) |
| `entity_type` | enum('SONG','ARTIST','ALBUM','FILM') | no |  |  |  |
| `external_id` | varchar(100) | no |  |  |  |
| `isrc` | char(12) | yes | IX |  |  |
| `song_id` | int unsigned | yes | IX FK |  | songs.song_id (on delete restrict) |
| `artist_id` | int unsigned | yes | IX FK |  | artists.artist_id (on delete restrict) |
| `album_id` | int unsigned | yes | IX FK |  | albums.album_id (on delete restrict) |
| `film_id` | int unsigned | yes | IX FK |  | films.film_id (on delete restrict) |
| `source_url` | varchar(500) | yes |  |  |  |
| `rights_status` | enum('PERMITTED','ATTRIBUTION_REQUIRED','METADATA_ONLY','RESTRICTED','UNKNOWN') | no |  |  |  |
| `payload` | json | no |  |  |  |
| `payload_hash` | char(64) | no |  |  |  |
| `status` | enum('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED','IN_REVIEW') | no | IX | default DISCOVERED |  |
| `match_method` | enum('EXTERNAL_ID','ISRC','EXACT','FUZZY','NEW','MANUAL') | yes |  |  |  |
| `match_confidence` | decimal(4,3) | yes |  |  |  |
| `quality_score` | decimal(4,3) | yes |  |  |  |
| `processing_version` | varchar(20) | no |  |  |  |
| `last_job_id` | bigint unsigned | yes | IX FK |  | pipeline_jobs.job_id (on delete set null) |
| `first_seen_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `last_verified_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_sr_album` (album_id); `fk_sr_artist` (artist_id); `fk_sr_film` (film_id); `fk_sr_job` (last_job_id); `idx_sr_isrc` (isrc); `idx_sr_song` (song_id); `idx_sr_status` (status); `PRIMARY` (record_id) unique; `uq_sr_external` (source_id,entity_type,external_id) unique

**Checks:** `chk_sr_entity`, `chk_sr_scores`

## trend_snapshots

entity_id is intentionally not an FK: a snapshot is a historical fact and must survive later catalogue edits. entity_type says what it is.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `snapshot_id` | bigint unsigned | no | PK | auto_increment |  |
| `job_id` | bigint unsigned | no | IX FK |  | pipeline_jobs.job_id (on delete cascade) |
| `window_code` | enum('24H','7D','30D') | no | IX |  |  |
| `entity_type` | enum('SONG','ARTIST','GENRE','MOOD','LANGUAGE') | no |  |  |  |
| `entity_id` | int unsigned | no |  |  |  |
| `region_code` | varchar(6) | yes | IX FK |  | regions.region_code (on delete cascade) |
| `region_key` | varchar(6) | yes |  | *gen:* `coalesce(`region_code`,_utf8mb4\'ALL\')` |  |
| `curr_plays` | int unsigned | no |  |  |  |
| `prev_plays` | int unsigned | no |  |  |  |
| `curr_listeners` | int unsigned | no |  |  |  |
| `velocity_pct` | decimal(8,2) | yes |  |  |  |
| `momentum_rank` | smallint unsigned | no |  |  |  |
| `computed_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `fk_trend_region` (region_code); `idx_trend_lookup` (window_code,entity_type,region_key,job_id,momentum_rank); `PRIMARY` (snapshot_id) unique; `uq_trend` (job_id,window_code,entity_type,region_key,entity_id) unique

## user_artist_preferences

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `artist_id` | int unsigned | no | PK FK |  | artists.artist_id (on delete cascade) |
| `onboarding_weight` | decimal(4,3) | no |  | default 0.000 |  |
| `plays` | int unsigned | no |  | default 0 |  |
| `completes` | int unsigned | no |  | default 0 |  |
| `skips` | int unsigned | no |  | default 0 |  |
| `replays` | int unsigned | no |  | default 0 |  |
| `listen_sec` | int unsigned | no |  | default 0 |  |
| `short_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `long_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `blended_score` | decimal(5,4) | no |  | default 0.0000 |  |
| `last_played_at` | datetime | yes |  |  |  |
| `model_id` | smallint unsigned | yes | IX FK |  | intelligence_models.model_id (on delete set null) |
| `computed_at` | datetime | yes |  |  |  |

**Indexes:** `fk_uap_artist` (artist_id); `fk_uap_model` (model_id); `idx_uap_rank` (user_id,blended_score); `PRIMARY` (user_id,artist_id) unique

**Checks:** `chk_uap`

## user_context_preferences

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `context_id` | tinyint unsigned | no | PK FK |  | contexts.context_id (on delete cascade) |
| `onboarding_weight` | decimal(4,3) | no |  | default 0.000 |  |
| `sessions` | int unsigned | no |  | default 0 |  |
| `listen_sec` | int unsigned | no |  | default 0 |  |
| `blended_score` | decimal(5,4) | no |  | default 0.0000 |  |
| `computed_at` | datetime | yes |  |  |  |

**Indexes:** `fk_ucp_ctx` (context_id); `PRIMARY` (user_id,context_id) unique

**Checks:** `chk_ucp`

## user_genre_preferences

Rebuilt by sp_refresh_user_preferences from behaviour tables with time decay. Never written from incognito data.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `genre_id` | smallint unsigned | no | PK FK |  | genres.genre_id (on delete cascade) |
| `onboarding_weight` | decimal(4,3) | no |  | default 0.000 |  |
| `plays` | int unsigned | no |  | default 0 |  |
| `completes` | int unsigned | no |  | default 0 |  |
| `skips` | int unsigned | no |  | default 0 |  |
| `replays` | int unsigned | no |  | default 0 |  |
| `listen_sec` | int unsigned | no |  | default 0 |  |
| `short_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `long_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `blended_score` | decimal(5,4) | no |  | default 0.0000 |  |
| `last_played_at` | datetime | yes |  |  |  |
| `model_id` | smallint unsigned | yes | IX FK |  | intelligence_models.model_id (on delete set null) |
| `computed_at` | datetime | yes |  |  |  |

**Indexes:** `fk_ugp_genre` (genre_id); `fk_ugp_model` (model_id); `idx_ugp_rank` (user_id,blended_score); `PRIMARY` (user_id,genre_id) unique

**Checks:** `chk_ugp`

## user_languages

Languages the user explicitly chose (M:N with an order).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `language_id` | smallint unsigned | no | PK FK |  | languages.language_id (on delete cascade) |
| `priority` | tinyint unsigned | no |  |  |  |

**Indexes:** `fk_ul_lang` (language_id); `PRIMARY` (user_id,language_id) unique; `uq_ul_priority` (user_id,priority) unique

**Checks:** `chk_ul_priority`

## user_likes

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `song_id` | int unsigned | no | PK FK |  | songs.song_id (on delete cascade) |
| `liked_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |

**Indexes:** `idx_likes_song` (song_id); `idx_likes_user_time` (user_id,liked_at); `PRIMARY` (user_id,song_id) unique

## user_mood_preferences

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `mood_id` | smallint unsigned | no | PK FK |  | moods.mood_id (on delete cascade) |
| `onboarding_weight` | decimal(4,3) | no |  | default 0.000 |  |
| `plays` | int unsigned | no |  | default 0 |  |
| `short_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `long_term_score` | decimal(9,4) | no |  | default 0.0000 |  |
| `blended_score` | decimal(5,4) | no |  | default 0.0000 |  |
| `last_played_at` | datetime | yes |  |  |  |
| `model_id` | smallint unsigned | yes | IX FK |  | intelligence_models.model_id (on delete set null) |
| `computed_at` | datetime | yes |  |  |  |

**Indexes:** `fk_ump_model` (model_id); `fk_ump_mood` (mood_id); `idx_ump_rank` (user_id,blended_score); `PRIMARY` (user_id,mood_id) unique

**Checks:** `chk_ump`

## user_profiles

1:1 with users. Kept separate because it changes often and is read by the recommender, while users holds security data read by auth only.

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `display_name` | varchar(60) | no |  |  |  |
| `region_code` | varchar(6) | yes | IX FK |  | regions.region_code (on delete set null) |
| `content_filter` | enum('OFF','NO_EXPLICIT','FAMILY') | no |  | default OFF |  |
| `listening_habit` | enum('BACKGROUND','ACTIVE','MIXED') | yes |  |  |  |
| `onboarding_completed_at` | datetime | yes |  |  |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `fk_up_region` (region_code); `PRIMARY` (user_id) unique

## users

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK | auto_increment |  |
| `username` | varchar(30) | no | UQ |  |  |
| `email` | varchar(120) | no | UQ |  |  |
| `password_hash` | char(60) | no |  |  |  |
| `password_changed_at` | datetime | yes |  |  |  |
| `role_id` | tinyint unsigned | no | IX FK |  | roles.role_id (on delete restrict) |
| `is_active` | tinyint(1) | no |  | default 1 |  |
| `failed_login_count` | tinyint unsigned | no |  | default 0 |  |
| `locked_until` | datetime | yes |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `last_login_at` | datetime | yes |  |  |  |

**Indexes:** `fk_users_role` (role_id); `PRIMARY` (user_id) unique; `uq_users_email` (email) unique; `uq_users_username` (username) unique

**Checks:** `chk_users_email`, `chk_users_username`

## weekly_worlds

One world per user per week per version; exactly one ACTIVE version. Its songs and reasons ARE its recommendation batch (no duplicated item table).

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `world_id` | bigint unsigned | no | PK | auto_increment |  |
| `user_id` | int unsigned | no | IX FK |  | users.user_id (on delete cascade) |
| `week_start` | date | no |  |  |  |
| `version` | smallint unsigned | no |  |  |  |
| `archetype_code` | varchar(20) | no | IX FK |  | world_archetypes.archetype_code (on delete restrict) |
| `title` | varchar(80) | no |  |  |  |
| `description` | varchar(300) | no |  |  |  |
| `primary_mood_id` | smallint unsigned | no | IX FK |  | moods.mood_id (on delete restrict) |
| `language_id` | smallint unsigned | yes | IX FK |  | languages.language_id (on delete set null) |
| `region_code` | varchar(6) | yes | IX FK |  | regions.region_code (on delete set null) |
| `theme` | json | no |  |  |  |
| `signals` | json | no |  |  |  |
| `batch_id` | bigint unsigned | no | UQ FK |  | recommendation_batches.batch_id (on delete restrict) |
| `job_id` | bigint unsigned | yes | IX FK |  | pipeline_jobs.job_id (on delete set null) |
| `status` | enum('ACTIVE','SUPERSEDED','ROLLED_BACK') | no |  | default ACTIVE |  |
| `active_key` | varchar(30) | yes | UQ | *gen:* `if((`status` = _utf8mb4\'ACTIVE\'),concat(`user_id`,_utf8mb4\':\',`week_start`),` |  |
| `generated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `expires_at` | datetime | no |  |  |  |

**Indexes:** `fk_ww_arch` (archetype_code); `fk_ww_job` (job_id); `fk_ww_lang` (language_id); `fk_ww_mood` (primary_mood_id); `fk_ww_region` (region_code); `PRIMARY` (world_id) unique; `uq_world_batch` (batch_id) unique; `uq_world_one_active` (active_key) unique; `uq_world_version` (user_id,week_start,version) unique

**Checks:** `chk_ww_week`, `chk_ww_expiry`

## world_archetypes

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `archetype_code` | varchar(20) | no | PK |  |  |
| `name` | varchar(40) | no | UQ |  |  |
| `description` | varchar(200) | no |  |  |  |
| `motif` | enum('ORBITS','WAVES','PEAKS','RAIN','SUNBURST','GRID','STARS','EMBERS') | no |  |  |  |
| `palette` | json | no |  |  |  |
| `title_words` | json | no |  |  |  |
| `season_months` | varchar(30) | yes |  |  |  |

**Indexes:** `PRIMARY` (archetype_code) unique; `uq_archetype_name` (name) unique

**Checks:** `chk_arch_palette`

## world_feedback

| Column | Type | Null | Key | Default / extra | References |
|---|---|---|---|---|---|
| `user_id` | int unsigned | no | PK FK |  | users.user_id (on delete cascade) |
| `world_id` | bigint unsigned | no | PK FK |  | weekly_worlds.world_id (on delete cascade) |
| `feedback` | enum('LOVE','NOT_FOR_ME') | no |  |  |  |
| `created_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED |  |
| `updated_at` | datetime | no |  | default CURRENT_TIMESTAMP, DEFAULT_GENERATED on update CURRENT_TIMESTAMP |  |

**Indexes:** `idx_wf_world` (world_id); `PRIMARY` (user_id,world_id) unique

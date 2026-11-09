-- =====================================================================
--  MUSE — Music Mood Intelligence & Recommendation Database
--  01_schema.sql : tables, keys, constraints        (MySQL 8.0.19+)
--
--  Load order (backend/scripts/setup-db.js):
--    01_schema  02_functions  03_views  04_procedures  05_triggers
--    06_security  07_seed
--
--  Design rules used throughout
--    * Surrogate AUTO_INCREMENT keys for entities whose natural identity is
--      unstable (songs, artists...). Natural keys where identity is stable
--      (region_code, permission_code, reason_code, archetype_code).
--    * Composite PKs for pure relationship tables (M:N).
--    * Every FK states ON DELETE / ON UPDATE explicitly.
--    * "Exactly one current X" rules use a VIRTUAL generated column that is the
--      key when the row is current and NULL otherwise, plus a UNIQUE index.
--      (VIRTUAL, because InnoDB forbids cascading FKs on base columns of
--      STORED generated columns.)
--      (UNIQUE ignores NULLs, so any number of non-current rows may exist.)
--    * Normalised text columns used for duplicate detection are GENERATED,
--      so they can never drift from the source column.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
  audit_logs, trend_snapshots, weekly_worlds, archetype_moods, world_archetypes,
  incognito_events, incognito_sessions,
  recommendation_reasons, reason_types, recommendation_items, recommendation_batch_moods, recommendation_batches,
  user_context_preferences, user_mood_preferences, user_artist_preferences, user_genre_preferences,
  playlist_songs, playlists, user_likes, ratings, search_history,
  playback_events, listening_history, listening_sessions,
  review_queue, pipeline_job_logs, source_records, pipeline_jobs, song_media, music_sources,
  context_keywords, context_moods, contexts, mood_keywords, song_mood_curations, mood_segments, song_moods, moods, mood_categories,
  audio_features, model_parameters, intelligence_models,
  song_genres, song_artists, songs, album_artists, albums, films, artist_aliases, artists, genres,
  user_languages, user_profiles, users, role_permissions, permissions, roles, regions, languages;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 1. REFERENCE DATA
-- =====================================================================
CREATE TABLE languages (
  language_id  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  iso_code     VARCHAR(3)  NOT NULL,                 -- ISO 639-1/3 (candidate key)
  name         VARCHAR(40) NOT NULL,                 -- candidate key
  native_name  VARCHAR(40) NOT NULL,
  script       VARCHAR(30) NOT NULL,
  PRIMARY KEY (language_id),
  UNIQUE KEY uq_languages_iso (iso_code),
  UNIQUE KEY uq_languages_name (name),
  CONSTRAINT chk_languages_iso CHECK (REGEXP_LIKE(iso_code, '^[a-z]{2,3}$', 'c'))
) ENGINE=InnoDB;

CREATE TABLE regions (
  region_code          VARCHAR(6)  NOT NULL,         -- ISO 3166-2, e.g. IN-TG (natural key)
  name                 VARCHAR(60) NOT NULL,
  country_code         CHAR(2)     NOT NULL,
  primary_language_id  SMALLINT UNSIGNED NULL,       -- a SIGNAL only, never an assumption
  PRIMARY KEY (region_code),
  UNIQUE KEY uq_regions_name (name),
  CONSTRAINT fk_regions_language FOREIGN KEY (primary_language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_regions_code CHECK (REGEXP_LIKE(region_code, '^[A-Z]{2}(-[A-Z]{2,3})?$', 'c'))
) ENGINE=InnoDB;

-- =====================================================================
-- 2. IDENTITY, ROLES, PERMISSIONS
-- =====================================================================
CREATE TABLE roles (
  role_id  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code     VARCHAR(20) NOT NULL,
  name     VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  permission_code  VARCHAR(40)  NOT NULL,            -- natural key, e.g. 'catalog.write'
  description      VARCHAR(200) NOT NULL,
  PRIMARY KEY (permission_code)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (                      -- M:N roles <-> permissions
  role_id          TINYINT UNSIGNED NOT NULL,
  permission_code  VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (role_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code) REFERENCES permissions (permission_code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username            VARCHAR(30)  NOT NULL,
  email               VARCHAR(120) NOT NULL,
  password_hash       CHAR(60)     NOT NULL,         -- bcrypt; plaintext is never stored
  role_id             TINYINT UNSIGNED NOT NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  failed_login_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME     NULL,             -- brute-force lockout
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at       DATETIME     NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (role_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_users_username CHECK (REGEXP_LIKE(username, '^[a-z0-9_]{3,30}$', 'c')),
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%')
) ENGINE=InnoDB;

-- 1:1 with users. Kept separate because it changes often and is read by
-- the recommender, while users holds security data read by auth only.
CREATE TABLE user_profiles (
  user_id                  INT UNSIGNED NOT NULL,
  display_name             VARCHAR(60)  NOT NULL,
  region_code              VARCHAR(6)   NULL,
  content_filter           ENUM('OFF','NO_EXPLICIT','FAMILY') NOT NULL DEFAULT 'OFF',
  listening_habit          ENUM('BACKGROUND','ACTIVE','MIXED') NULL,
  onboarding_completed_at  DATETIME NULL,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_up_user   FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_up_region FOREIGN KEY (region_code) REFERENCES regions (region_code) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Languages the user explicitly chose (M:N with an order).
CREATE TABLE user_languages (
  user_id      INT UNSIGNED NOT NULL,
  language_id  SMALLINT UNSIGNED NOT NULL,
  priority     TINYINT UNSIGNED NOT NULL,            -- 1 = most preferred
  PRIMARY KEY (user_id, language_id),
  UNIQUE KEY uq_ul_priority (user_id, priority),
  CONSTRAINT fk_ul_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ul_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_ul_priority CHECK (priority BETWEEN 1 AND 10)
) ENGINE=InnoDB;

-- =====================================================================
-- 3. MUSIC CATALOGUE
-- =====================================================================
CREATE TABLE genres (
  genre_id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(40)  NOT NULL,
  parent_genre_id  SMALLINT UNSIGNED NULL,           -- hierarchy, walked with a recursive CTE
  color_hex        CHAR(7)      NOT NULL,
  description      VARCHAR(200) NULL,
  PRIMARY KEY (genre_id),
  UNIQUE KEY uq_genres_name (name),
  CONSTRAINT fk_genres_parent FOREIGN KEY (parent_genre_id) REFERENCES genres (genre_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_genres_color CHECK (REGEXP_LIKE(color_hex, '^#[0-9A-Fa-f]{6}$'))
) ENGINE=InnoDB;

CREATE TABLE artists (
  artist_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(100) NOT NULL,
  normalized_name      VARCHAR(100) AS (TRIM(REGEXP_REPLACE(LOWER(name), '[!-/:-@\\[-`{-~—–‘’“”[:space:]]+', ' '))) STORED,
  disambiguation       VARCHAR(80)  NOT NULL DEFAULT '',   -- tells same-named artists apart
  artist_type          ENUM('SOLO','GROUP','COMPOSER','ORCHESTRA') NOT NULL DEFAULT 'SOLO',
  country_code         CHAR(2)      NOT NULL DEFAULT 'IN',
  region_code          VARCHAR(6)   NULL,
  primary_language_id  SMALLINT UNSIGNED NULL,
  formed_year          SMALLINT UNSIGNED NULL,
  bio                  VARCHAR(400) NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artist_id),
  UNIQUE KEY uq_artists_identity (normalized_name, disambiguation),   -- candidate key
  FULLTEXT KEY ft_artists_name (name) WITH PARSER ngram,
  CONSTRAINT fk_artists_region FOREIGN KEY (region_code) REFERENCES regions (region_code) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_artists_lang   FOREIGN KEY (primary_language_id) REFERENCES languages (language_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_artists_year  CHECK (formed_year IS NULL OR formed_year BETWEEN 1900 AND 2100)
) ENGINE=InnoDB;

-- Alternative spellings / transliterations / native-script names.
-- Used by search ("arjit" -> "Arijit") and by duplicate detection.
CREATE TABLE artist_aliases (
  alias_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  artist_id         INT UNSIGNED NOT NULL,
  alias             VARCHAR(100) NOT NULL,
  normalized_alias  VARCHAR(100) AS (TRIM(REGEXP_REPLACE(LOWER(alias), '[!-/:-@\\[-`{-~—–‘’“”[:space:]]+', ' '))) STORED,
  alias_type        ENUM('SPELLING','TRANSLITERATION','NATIVE_SCRIPT','STAGE_NAME') NOT NULL,
  PRIMARY KEY (alias_id),
  UNIQUE KEY uq_aliases_artist_alias (artist_id, normalized_alias),
  KEY idx_aliases_normalized (normalized_alias),
  FULLTEXT KEY ft_aliases_alias (alias) WITH PARSER ngram,
  CONSTRAINT fk_aliases_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Films whose soundtracks appear in the catalogue (Indian cinema ecosystem).
CREATE TABLE films (
  film_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(150) NOT NULL,
  release_year  SMALLINT UNSIGNED NOT NULL,
  language_id   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (film_id),
  UNIQUE KEY uq_films_identity (title, release_year, language_id),
  CONSTRAINT fk_films_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_films_year CHECK (release_year BETWEEN 1900 AND 2100)
) ENGINE=InnoDB;

CREATE TABLE albums (
  album_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title             VARCHAR(150) NOT NULL,
  normalized_title  VARCHAR(150) AS (TRIM(REGEXP_REPLACE(LOWER(title), '[!-/:-@\\[-`{-~—–‘’“”[:space:]]+', ' '))) STORED,
  album_type        ENUM('ALBUM','EP','SINGLE','SOUNDTRACK','COMPILATION') NOT NULL DEFAULT 'ALBUM',
  film_id           INT UNSIGNED NULL,
  release_year      SMALLINT UNSIGNED NOT NULL,
  language_id       SMALLINT UNSIGNED NULL,
  cover_color_1     CHAR(7) NOT NULL,                 -- artwork is generated from these; no copyrighted art
  cover_color_2     CHAR(7) NOT NULL,
  PRIMARY KEY (album_id),
  FULLTEXT KEY ft_albums_title (title) WITH PARSER ngram,
  KEY idx_albums_normalized (normalized_title),
  CONSTRAINT fk_albums_film FOREIGN KEY (film_id) REFERENCES films (film_id) ON DELETE RESTRICT,
  CONSTRAINT fk_albums_lang FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_albums_year CHECK (release_year BETWEEN 1900 AND 2100),
  CONSTRAINT chk_albums_film CHECK (film_id IS NULL OR album_type = 'SOUNDTRACK'),
  CONSTRAINT chk_albums_colors CHECK (REGEXP_LIKE(cover_color_1, '^#[0-9A-Fa-f]{6}$') AND REGEXP_LIKE(cover_color_2, '^#[0-9A-Fa-f]{6}$'))
) ENGINE=InnoDB;

CREATE TABLE album_artists (                         -- M:N: collaborations and compilations
  album_id      INT UNSIGNED NOT NULL,
  artist_id     INT UNSIGNED NOT NULL,
  credit_order  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (album_id, artist_id),
  KEY idx_aa_artist (artist_id),
  CONSTRAINT fk_aa_album  FOREIGN KEY (album_id)  REFERENCES albums (album_id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE songs (
  song_id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title               VARCHAR(150) NOT NULL,
  normalized_title    VARCHAR(150) AS (TRIM(REGEXP_REPLACE(LOWER(title), '[!-/:-@\\[-`{-~—–‘’“”[:space:]]+', ' '))) STORED,
  version_label       VARCHAR(40)  NOT NULL DEFAULT '',   -- '', 'Unplugged', 'Reprise', 'Remix'...
  primary_artist_id   INT UNSIGNED NOT NULL,              -- main credit (1:N); other credits in song_artists
  album_id            INT UNSIGNED NULL,
  track_number        TINYINT UNSIGNED NULL,
  duration_sec        SMALLINT UNSIGNED NOT NULL,
  release_year        SMALLINT UNSIGNED NOT NULL,
  language_id         SMALLINT UNSIGNED NULL,             -- NULL = instrumental, no sung language
  isrc                CHAR(12) NULL,                      -- International Standard Recording Code
  explicit            TINYINT(1) NOT NULL DEFAULT 0,
  content_rating      ENUM('ALL','TEEN','MATURE') NOT NULL DEFAULT 'ALL',
  popularity          TINYINT UNSIGNED NOT NULL DEFAULT 50,   -- 0..100 catalogue prior
  status              ENUM('ACTIVE','PENDING_ANALYSIS','HIDDEN','MERGED') NOT NULL DEFAULT 'ACTIVE',
  merged_into_song_id INT UNSIGNED NULL,                  -- canonical record after an admin MERGE
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id),
  -- obvious duplicates are impossible: same main artist + same normalised title + same version
  UNIQUE KEY uq_songs_identity (primary_artist_id, normalized_title, version_label),
  UNIQUE KEY uq_songs_isrc (isrc),                        -- NULLs allowed, real ISRCs unique
  KEY idx_songs_album (album_id, track_number),
  KEY idx_songs_lang_status (language_id, status),
  KEY idx_songs_status_pop (status, popularity),
  FULLTEXT KEY ft_songs_title (title) WITH PARSER ngram,
  CONSTRAINT fk_songs_artist FOREIGN KEY (primary_artist_id) REFERENCES artists (artist_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_songs_album  FOREIGN KEY (album_id)  REFERENCES albums (album_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_songs_lang   FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_songs_merged FOREIGN KEY (merged_into_song_id) REFERENCES songs (song_id) ON DELETE RESTRICT,
  CONSTRAINT chk_songs_duration CHECK (duration_sec BETWEEN 30 AND 1800),
  CONSTRAINT chk_songs_year     CHECK (release_year BETWEEN 1900 AND 2100),
  CONSTRAINT chk_songs_pop      CHECK (popularity <= 100),
  CONSTRAINT chk_songs_isrc     CHECK (isrc IS NULL OR REGEXP_LIKE(isrc, '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$', 'c')),
  CONSTRAINT chk_songs_merge    CHECK ((status = 'MERGED') = (merged_into_song_id IS NOT NULL)),
  CONSTRAINT chk_songs_explicit CHECK (explicit = 0 OR content_rating <> 'ALL')
) ENGINE=InnoDB;

CREATE TABLE song_artists (                          -- secondary credits (M:N)
  song_id       INT UNSIGNED NOT NULL,
  artist_id     INT UNSIGNED NOT NULL,
  role          ENUM('FEATURED','COMPOSER','LYRICIST','PRODUCER') NOT NULL,
  credit_order  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (song_id, artist_id, role),
  KEY idx_sa_artist (artist_id),
  CONSTRAINT fk_sa_song   FOREIGN KEY (song_id)   REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE song_genres (                           -- M:N, exactly one primary genre per song
  song_id          INT UNSIGNED NOT NULL,
  genre_id         SMALLINT UNSIGNED NOT NULL,
  is_primary       TINYINT(1) NOT NULL DEFAULT 0,
  primary_song_key INT UNSIGNED AS (IF(is_primary = 1, song_id, NULL)) VIRTUAL,
  PRIMARY KEY (song_id, genre_id),
  UNIQUE KEY uq_sg_one_primary (primary_song_key),
  KEY idx_sg_genre (genre_id, is_primary),
  CONSTRAINT fk_sg_song  FOREIGN KEY (song_id)  REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_sg_genre FOREIGN KEY (genre_id) REFERENCES genres (genre_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4. VERSIONED INTELLIGENCE (models, audio features, moods, segments)
-- =====================================================================
CREATE TABLE intelligence_models (
  model_id     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind         ENUM('AUDIO_FEATURES','MOOD','SEGMENTS','PREFERENCE','RECOMMENDER','WORLD') NOT NULL,
  name         VARCHAR(40)  NOT NULL,
  version      VARCHAR(20)  NOT NULL,
  description  VARCHAR(300) NOT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 0,
  active_kind  VARCHAR(20) AS (IF(is_active = 1, kind, NULL)) VIRTUAL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (model_id),
  UNIQUE KEY uq_models_version (kind, name, version),
  UNIQUE KEY uq_models_one_active (active_kind)       -- at most one active model per kind
) ENGINE=InnoDB;

-- Tunable numbers of a model version: recommender weights, diversity caps,
-- preference half-lives, mood thresholds. Changing a value is audited.
CREATE TABLE model_parameters (
  model_id     SMALLINT UNSIGNED NOT NULL,
  param_code   VARCHAR(40)  NOT NULL,
  param_value  DECIMAL(10,4) NOT NULL,
  min_value    DECIMAL(10,4) NOT NULL,
  max_value    DECIMAL(10,4) NOT NULL,
  description  VARCHAR(200) NOT NULL,
  PRIMARY KEY (model_id, param_code),
  CONSTRAINT fk_mp_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE CASCADE,
  CONSTRAINT chk_mp_range CHECK (min_value <= max_value AND param_value BETWEEN min_value AND max_value)
) ENGINE=InnoDB;

-- Every analysis run is a NEW row; old analyses are never overwritten.
CREATE TABLE audio_features (
  feature_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id           INT UNSIGNED NOT NULL,
  model_id          SMALLINT UNSIGNED NOT NULL,       -- which analyser version produced it
  energy            DECIMAL(4,3) NOT NULL,
  valence           DECIMAL(4,3) NOT NULL,
  danceability      DECIMAL(4,3) NOT NULL,
  acousticness      DECIMAL(4,3) NOT NULL,
  instrumentalness  DECIMAL(4,3) NOT NULL,
  speechiness       DECIMAL(4,3) NOT NULL,
  loudness_db       DECIMAL(5,2) NOT NULL,
  tempo_bpm         DECIMAL(5,1) NOT NULL,
  musical_key       TINYINT UNSIGNED NOT NULL,        -- 0 = C ... 11 = B
  mode              TINYINT UNSIGNED NOT NULL,        -- 0 minor, 1 major
  analyzed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current        TINYINT(1) NOT NULL DEFAULT 0,
  current_song_key  INT UNSIGNED AS (IF(is_current = 1, song_id, NULL)) VIRTUAL,
  PRIMARY KEY (feature_id),
  UNIQUE KEY uq_af_song_model (song_id, model_id),
  UNIQUE KEY uq_af_one_current (current_song_key),
  KEY idx_af_energy_valence (energy, valence),
  CONSTRAINT fk_af_song  FOREIGN KEY (song_id)  REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_af_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT chk_af_unit CHECK (energy BETWEEN 0 AND 1 AND valence BETWEEN 0 AND 1 AND danceability BETWEEN 0 AND 1
                                AND acousticness BETWEEN 0 AND 1 AND instrumentalness BETWEEN 0 AND 1 AND speechiness BETWEEN 0 AND 1),
  CONSTRAINT chk_af_loudness CHECK (loudness_db BETWEEN -60 AND 0),
  CONSTRAINT chk_af_tempo    CHECK (tempo_bpm BETWEEN 40 AND 220),
  CONSTRAINT chk_af_key      CHECK (musical_key <= 11 AND mode IN (0,1))
) ENGINE=InnoDB;

-- Valence/arousal quadrants (circumplex model) grouping the moods.
CREATE TABLE mood_categories (
  category_id  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(40)  NOT NULL,
  quadrant     ENUM('BRIGHT_HIGH','BRIGHT_LOW','DARK_HIGH','DARK_LOW') NOT NULL,
  description  VARCHAR(200) NOT NULL,
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_mc_name (name),
  UNIQUE KEY uq_mc_quadrant (quadrant)
) ENGINE=InnoDB;

CREATE TABLE moods (
  mood_id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id              TINYINT UNSIGNED NOT NULL,
  name                     VARCHAR(30)  NOT NULL,
  emoji                    VARCHAR(8)   NOT NULL,
  color_hex                CHAR(7)      NOT NULL,
  description              VARCHAR(200) NOT NULL,
  target_energy            DECIMAL(4,3) NOT NULL,     -- the mood's ideal sound
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  PRIMARY KEY (mood_id),
  UNIQUE KEY uq_moods_name (name),
  CONSTRAINT fk_moods_category FOREIGN KEY (category_id) REFERENCES mood_categories (category_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_moods_targets CHECK (target_energy BETWEEN 0 AND 1 AND target_valence BETWEEN 0 AND 1 AND target_danceability BETWEEN 0 AND 1
                                      AND target_acousticness BETWEEN 0 AND 1 AND target_instrumentalness BETWEEN 0 AND 1),
  CONSTRAINT chk_moods_tempo CHECK (tempo_min >= 40 AND tempo_max <= 220 AND tempo_min < tempo_max),
  CONSTRAINT chk_moods_color CHECK (REGEXP_LIKE(color_hex, '^#[0-9A-Fa-f]{6}$'))
) ENGINE=InnoDB;

-- songs <-> moods (M:N), one row per analysis model version.
-- feature_id records the exact audio analysis the mood was derived from (lineage).
CREATE TABLE song_moods (
  song_id      INT UNSIGNED NOT NULL,
  mood_id      SMALLINT UNSIGNED NOT NULL,
  model_id     SMALLINT UNSIGNED NOT NULL,
  confidence   DECIMAL(4,3) NOT NULL,
  feature_id   INT UNSIGNED NOT NULL,
  analyzed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id, mood_id, model_id),
  KEY idx_sm_model_mood (model_id, mood_id, confidence),
  CONSTRAINT fk_sm_song    FOREIGN KEY (song_id)    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_mood    FOREIGN KEY (mood_id)    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_model   FOREIGN KEY (model_id)   REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sm_feature FOREIGN KEY (feature_id) REFERENCES audio_features (feature_id) ON DELETE CASCADE,
  CONSTRAINT chk_sm_conf   CHECK (confidence > 0 AND confidence <= 1)
) ENGINE=InnoDB;

-- Mood changes inside a song (intro calm -> chorus euphoric ...).
-- Energy/valence here are SEGMENT-level measurements, not copies of the song's.
CREATE TABLE mood_segments (
  segment_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id        INT UNSIGNED NOT NULL,
  model_id       SMALLINT UNSIGNED NOT NULL,
  segment_index  TINYINT UNSIGNED NOT NULL,
  start_sec      SMALLINT UNSIGNED NOT NULL,
  end_sec        SMALLINT UNSIGNED NOT NULL,
  mood_id        SMALLINT UNSIGNED NOT NULL,
  confidence     DECIMAL(4,3) NOT NULL,
  energy         DECIMAL(4,3) NOT NULL,
  valence        DECIMAL(4,3) NOT NULL,
  analyzed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (segment_id),
  UNIQUE KEY uq_ms_order (song_id, model_id, segment_index),
  CONSTRAINT fk_ms_song  FOREIGN KEY (song_id)  REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_ms_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ms_mood  FOREIGN KEY (mood_id)  REFERENCES moods (mood_id) ON DELETE RESTRICT,
  CONSTRAINT chk_ms_span CHECK (start_sec < end_sec),
  CONSTRAINT chk_ms_vals CHECK (confidence > 0 AND confidence <= 1 AND energy BETWEEN 0 AND 1 AND valence BETWEEN 0 AND 1)
) ENGINE=InnoDB;

-- Human curation of song moods. song_moods is rebuilt per model version, so a
-- curator's decision lives here and sp_analyze_song_moods re-applies it after
-- every analysis run: ADD forces a tag in, REMOVE keeps a tag out.
CREATE TABLE song_mood_curations (
  song_id      INT UNSIGNED NOT NULL,
  mood_id      SMALLINT UNSIGNED NOT NULL,
  action       ENUM('ADD','REMOVE') NOT NULL,
  confidence   DECIMAL(4,3) NULL,                     -- required for ADD
  note         VARCHAR(200) NULL,
  curated_by   INT UNSIGNED NULL,
  curated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id, mood_id),
  KEY idx_smc_mood (mood_id),
  CONSTRAINT fk_smc_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_smc_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_smc_conf CHECK ((action = 'ADD' AND confidence > 0 AND confidence <= 1) OR (action = 'REMOVE' AND confidence IS NULL))
) ENGINE=InnoDB;

-- Vocabulary for the deterministic "describe how you feel" parser.
CREATE TABLE mood_keywords (
  keyword_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phrase      VARCHAR(60)  NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  weight      DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (keyword_id),
  UNIQUE KEY uq_mk (phrase, mood_id),
  KEY idx_mk_mood (mood_id),
  CONSTRAINT fk_mk_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_mk_weight CHECK (weight > 0 AND weight <= 1),
  CONSTRAINT chk_mk_lower  CHECK (phrase = LOWER(phrase))
) ENGINE=InnoDB;

-- =====================================================================
-- 5. LISTENING CONTEXTS (study, workout, night ...)
-- =====================================================================
CREATE TABLE contexts (
  context_id               TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                     VARCHAR(20)  NOT NULL,
  name                     VARCHAR(40)  NOT NULL,
  emoji                    VARCHAR(8)   NOT NULL,
  description              VARCHAR(200) NOT NULL,
  target_energy            DECIMAL(4,3) NOT NULL,
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  max_speechiness          DECIMAL(4,3) NOT NULL DEFAULT 1,
  sort_order               TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (context_id),
  UNIQUE KEY uq_contexts_code (code),
  CONSTRAINT chk_ctx_code CHECK (REGEXP_LIKE(code, '^[A-Z_]{2,20}$', 'c')),
  CONSTRAINT chk_ctx_targets CHECK (target_energy BETWEEN 0 AND 1 AND target_valence BETWEEN 0 AND 1 AND target_danceability BETWEEN 0 AND 1
                                    AND target_acousticness BETWEEN 0 AND 1 AND target_instrumentalness BETWEEN 0 AND 1 AND max_speechiness BETWEEN 0 AND 1),
  CONSTRAINT chk_ctx_tempo CHECK (tempo_min >= 40 AND tempo_max <= 220 AND tempo_min < tempo_max)
) ENGINE=InnoDB;

CREATE TABLE context_moods (
  context_id  TINYINT UNSIGNED NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  weight      DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (context_id, mood_id),
  CONSTRAINT fk_cm_ctx  FOREIGN KEY (context_id) REFERENCES contexts (context_id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_cm_weight CHECK (weight > 0 AND weight <= 1)
) ENGINE=InnoDB;

CREATE TABLE context_keywords (
  phrase      VARCHAR(60) NOT NULL,
  context_id  TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (phrase),
  CONSTRAINT fk_ck_ctx FOREIGN KEY (context_id) REFERENCES contexts (context_id) ON DELETE CASCADE,
  CONSTRAINT chk_ck_lower CHECK (phrase = LOWER(phrase))
) ENGINE=InnoDB;

-- =====================================================================
-- 6. SOURCES, RIGHTS, PROVENANCE, PIPELINE
-- =====================================================================
-- Each source declares what it may legally provide (rights_scope) and an
-- optional fallback: PRIMARY SOURCE -> APPROVED FALLBACK -> CACHED DB DATA.
CREATE TABLE music_sources (
  source_id             SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                  VARCHAR(30)  NOT NULL,
  name                  VARCHAR(80)  NOT NULL,
  source_type           ENUM('MUSIC_METADATA','AUDIO_ANALYSIS','MUSIC_AUDIO','PLAYBACK','MOVIE_METADATA','ARTWORK') NOT NULL,
  access_method         ENUM('API','FILE_FEED','GENERATED','USER_UPLOAD','MANUAL') NOT NULL,
  base_url              VARCHAR(255) NULL,
  license_name          VARCHAR(120) NOT NULL,
  rights_scope          SET('METADATA','AUDIO_FEATURES','AUDIO_PREVIEW','AUDIO_FULL','ARTWORK') NOT NULL,
  requires_attribution  TINYINT(1)   NOT NULL DEFAULT 0,
  attribution_text      VARCHAR(255) NULL,
  priority              TINYINT UNSIGNED NOT NULL DEFAULT 50,   -- lower = tried first
  fallback_source_id    SMALLINT UNSIGNED NULL,
  is_enabled            TINYINT(1)   NOT NULL DEFAULT 1,
  requires_credentials  TINYINT(1)   NOT NULL DEFAULT 0,        -- key comes from .env, never the DB
  last_success_at       DATETIME     NULL,
  notes                 VARCHAR(300) NULL,
  PRIMARY KEY (source_id),
  UNIQUE KEY uq_sources_code (code),
  CONSTRAINT fk_sources_fallback FOREIGN KEY (fallback_source_id) REFERENCES music_sources (source_id) ON DELETE SET NULL,
  CONSTRAINT chk_sources_attrib CHECK (requires_attribution = 0 OR attribution_text IS NOT NULL)
) ENGINE=InnoDB;

-- How a song can legally be played. Resolved in priority order.
CREATE TABLE song_media (
  media_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id        INT UNSIGNED NOT NULL,
  source_id      SMALLINT UNSIGNED NOT NULL,
  media_type     ENUM('PREVIEW','FULL','GENERATED_SKETCH','USER_LOCAL') NOT NULL,
  uri            VARCHAR(500) NULL,
  rights_status  ENUM('PERMITTED','ATTRIBUTION_REQUIRED','RESTRICTED') NOT NULL,
  priority       TINYINT UNSIGNED NOT NULL DEFAULT 50,
  PRIMARY KEY (media_id),
  UNIQUE KEY uq_media (song_id, source_id, media_type),
  CONSTRAINT fk_media_song   FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_media_source FOREIGN KEY (source_id) REFERENCES music_sources (source_id) ON DELETE RESTRICT,
  CONSTRAINT chk_media_uri CHECK (media_type = 'GENERATED_SKETCH' OR uri IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE pipeline_jobs (
  job_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type            ENUM('INGEST_SOURCE','AUDIO_ANALYSIS','MOOD_ANALYSIS','TREND_SNAPSHOT','WORLD_GENERATION',
                           'WEEKLY_INTELLIGENCE','PREFERENCE_REFRESH','INCOGNITO_CLEANUP','SESSION_CLOSE') NOT NULL,
  parent_job_id       BIGINT UNSIGNED NULL,           -- weekly pipeline -> stage jobs
  source_id           SMALLINT UNSIGNED NULL,
  idempotency_key     VARCHAR(120) NOT NULL,          -- same key = same job, never run twice
  status              ENUM('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED') NOT NULL DEFAULT 'DISCOVERED',
  params              JSON NULL,
  processing_version  VARCHAR(20) NOT NULL,
  retry_count         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_retries         TINYINT UNSIGNED NOT NULL DEFAULT 3,
  next_attempt_at     DATETIME NULL,
  locked_by           VARCHAR(64) NULL,               -- worker that claimed it (SELECT ... FOR UPDATE SKIP LOCKED)
  locked_at           DATETIME NULL,
  requested_by        INT UNSIGNED NULL,
  stats               JSON NULL,
  last_error          VARCHAR(500) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at          DATETIME NULL,
  completed_at        DATETIME NULL,
  PRIMARY KEY (job_id),
  UNIQUE KEY uq_jobs_idem (idempotency_key),
  KEY idx_jobs_claim (status, next_attempt_at),
  KEY idx_jobs_queue (status, job_id),      -- claim order: lets FOR UPDATE SKIP LOCKED stop at the first free row
  KEY idx_jobs_type_time (job_type, created_at),
  CONSTRAINT fk_jobs_parent FOREIGN KEY (parent_job_id) REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_jobs_source FOREIGN KEY (source_id) REFERENCES music_sources (source_id) ON DELETE SET NULL,
  CONSTRAINT fk_jobs_user   FOREIGN KEY (requested_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_jobs_retry CHECK (retry_count <= max_retries + 1),
  CONSTRAINT chk_jobs_times CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
) ENGINE=InnoDB;

-- Provenance: one row per (source, entity type, external id).
-- Links to the canonical catalogue row once resolved.
CREATE TABLE source_records (
  record_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id           SMALLINT UNSIGNED NOT NULL,
  entity_type         ENUM('SONG','ARTIST','ALBUM','FILM') NOT NULL,
  external_id         VARCHAR(100) NOT NULL,
  isrc                CHAR(12) NULL,
  song_id             INT UNSIGNED NULL,
  artist_id           INT UNSIGNED NULL,
  album_id            INT UNSIGNED NULL,
  film_id             INT UNSIGNED NULL,
  source_url          VARCHAR(500) NULL,
  rights_status       ENUM('PERMITTED','ATTRIBUTION_REQUIRED','METADATA_ONLY','RESTRICTED','UNKNOWN') NOT NULL,
  payload             JSON NOT NULL,
  payload_hash        CHAR(64) NOT NULL,              -- SHA-256: unchanged payload = nothing to do
  status              ENUM('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED','IN_REVIEW') NOT NULL DEFAULT 'DISCOVERED',
  match_method        ENUM('EXTERNAL_ID','ISRC','EXACT','FUZZY','NEW','MANUAL') NULL,
  match_confidence    DECIMAL(4,3) NULL,
  quality_score       DECIMAL(4,3) NULL,              -- completeness/consistency of the payload
  processing_version  VARCHAR(20) NOT NULL,
  last_job_id         BIGINT UNSIGNED NULL,
  first_seen_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_verified_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id),
  UNIQUE KEY uq_sr_external (source_id, entity_type, external_id),
  KEY idx_sr_isrc (isrc),
  KEY idx_sr_song (song_id),
  KEY idx_sr_status (status),
  CONSTRAINT fk_sr_source FOREIGN KEY (source_id) REFERENCES music_sources (source_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_song   FOREIGN KEY (song_id)   REFERENCES songs (song_id) ON DELETE RESTRICT,   -- provenance blocks hard deletes; songs are hidden instead
  CONSTRAINT fk_sr_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_album  FOREIGN KEY (album_id)  REFERENCES albums (album_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_film   FOREIGN KEY (film_id)   REFERENCES films (film_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_job    FOREIGN KEY (last_job_id) REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  -- a record may only point at an entity of its own type
  CONSTRAINT chk_sr_entity CHECK (
       (entity_type = 'SONG'   AND artist_id IS NULL AND album_id IS NULL AND film_id IS NULL)
    OR (entity_type = 'ARTIST' AND song_id IS NULL AND album_id IS NULL AND film_id IS NULL)
    OR (entity_type = 'ALBUM'  AND song_id IS NULL AND artist_id IS NULL AND film_id IS NULL)
    OR (entity_type = 'FILM'   AND song_id IS NULL AND artist_id IS NULL AND album_id IS NULL)),
  CONSTRAINT chk_sr_scores CHECK ((match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1)
                                  AND (quality_score IS NULL OR quality_score BETWEEN 0 AND 1))
) ENGINE=InnoDB;

-- Job log; rows with level = 'ERROR' are the ingestion error list.
CREATE TABLE pipeline_job_logs (
  log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id      BIGINT UNSIGNED NOT NULL,
  level       ENUM('INFO','WARN','ERROR') NOT NULL,
  stage       VARCHAR(30)  NOT NULL,
  message     VARCHAR(500) NOT NULL,
  record_id   BIGINT UNSIGNED NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (log_id),
  KEY idx_logs_job (job_id, log_id),
  KEY idx_logs_level (level, created_at),
  CONSTRAINT fk_logs_job    FOREIGN KEY (job_id) REFERENCES pipeline_jobs (job_id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_record FOREIGN KEY (record_id) REFERENCES source_records (record_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Admin review queue: ambiguous duplicates, suspicious metadata, failures, conflicts.
CREATE TABLE review_queue (
  review_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_type     ENUM('POSSIBLE_DUPLICATE','SUSPICIOUS_METADATA','FAILED_INGESTION','SOURCE_CONFLICT') NOT NULL,
  record_id       BIGINT UNSIGNED NULL,
  candidate_song_id INT UNSIGNED NULL,               -- existing song it may duplicate
  job_id          BIGINT UNSIGNED NULL,
  score           DECIMAL(4,3) NULL,
  details         JSON NOT NULL,
  status          ENUM('PENDING','APPROVED','REJECTED','MERGED','IGNORED','REPROCESS') NOT NULL DEFAULT 'PENDING',
  pending_key     VARCHAR(80) AS (IF(status = 'PENDING', CONCAT(review_type, ':', COALESCE(record_id, 0)), NULL)) VIRTUAL,
  decided_by      INT UNSIGNED NULL,
  decided_at      DATETIME NULL,
  decision_note   VARCHAR(300) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_review_one_pending (pending_key),
  KEY idx_review_status (status, created_at),
  CONSTRAINT fk_rq_record FOREIGN KEY (record_id) REFERENCES source_records (record_id) ON DELETE CASCADE,
  CONSTRAINT fk_rq_song   FOREIGN KEY (candidate_song_id) REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_rq_job    FOREIGN KEY (job_id) REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_rq_user   FOREIGN KEY (decided_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_rq_decided CHECK ((status = 'PENDING') = (decided_at IS NULL))
) ENGINE=InnoDB;

-- =====================================================================
-- 7. LISTENING
-- =====================================================================
CREATE TABLE listening_sessions (
  session_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  context_id        TINYINT UNSIGNED NULL,           -- what the user said they were doing
  device            VARCHAR(30)  NOT NULL DEFAULT 'web',
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at          DATETIME NULL,
  status            ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  plays             SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- summary written on close
  listen_sec        INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_ls_session_user (session_id, user_id),     -- target of the composite FK below
  KEY idx_ls_user_status (user_id, status, last_activity_at),
  CONSTRAINT fk_ls_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ls_ctx  FOREIGN KEY (context_id) REFERENCES contexts (context_id) ON DELETE SET NULL,
  CONSTRAINT chk_ls_state CHECK ((status = 'OPEN' AND ended_at IS NULL) OR (status = 'CLOSED' AND ended_at IS NOT NULL AND ended_at >= started_at))
) ENGINE=InnoDB;

-- One row per play. user_id is carried for fast per-user analytics; the
-- composite FK (session_id, user_id) guarantees it always equals the
-- session's user, so the session_id -> user_id dependency cannot be violated.
CREATE TABLE listening_history (
  play_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id      BIGINT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  song_id         INT UNSIGNED NOT NULL,
  batch_id        BIGINT UNSIGNED NULL,             -- the recommendation list it came from
  origin          ENUM('HOME','MOOD','CONTEXT','WORLD','SEARCH','PLAYLIST','LIBRARY','SMART_PLAYLIST') NOT NULL DEFAULT 'HOME',
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at        DATETIME NULL,
  listened_sec    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  completion_pct  DECIMAL(5,2) NOT NULL DEFAULT 0,
  completed       TINYINT(1) NOT NULL DEFAULT 0,
  skipped         TINYINT(1) NOT NULL DEFAULT 0,
  is_replay       TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (play_id),
  KEY idx_lh_user_time (user_id, started_at),
  KEY idx_lh_user_song (user_id, song_id, started_at),
  KEY idx_lh_song_time (song_id, started_at),
  KEY idx_lh_session (session_id),
  CONSTRAINT fk_lh_session_user FOREIGN KEY (session_id, user_id) REFERENCES listening_sessions (session_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_lh_song  FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT chk_lh_pct  CHECK (completion_pct BETWEEN 0 AND 100),
  CONSTRAINT chk_lh_flags CHECK (NOT (completed = 1 AND skipped = 1)),
  CONSTRAINT chk_lh_end  CHECK (ended_at IS NULL OR ended_at >= started_at)
) ENGINE=InnoDB;

-- Meaningful player events only (no hover/scroll noise).
CREATE TABLE playback_events (
  event_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  play_id       BIGINT UNSIGNED NOT NULL,
  event_type    ENUM('PLAY_STARTED','PAUSE','RESUME','SEEK','SKIP','COMPLETED','REPLAY') NOT NULL,
  position_sec  SMALLINT UNSIGNED NOT NULL,
  seek_to_sec   SMALLINT UNSIGNED NULL,
  occurred_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  KEY idx_pe_play (play_id, occurred_at),
  CONSTRAINT fk_pe_play FOREIGN KEY (play_id) REFERENCES listening_history (play_id) ON DELETE CASCADE,
  CONSTRAINT chk_pe_seek CHECK ((event_type = 'SEEK') = (seek_to_sec IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE search_history (
  search_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  query_text        VARCHAR(120) NOT NULL,
  normalized_query  VARCHAR(120) NOT NULL,
  result_count      SMALLINT UNSIGNED NOT NULL,
  searched_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (search_id),
  KEY idx_sh_user_time (user_id, searched_at),
  KEY idx_sh_query (normalized_query),
  CONSTRAINT fk_sh_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 8. EXPLICIT FEEDBACK & PLAYLISTS
-- =====================================================================
CREATE TABLE ratings (
  user_id     INT UNSIGNED NOT NULL,
  song_id     INT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  rated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  KEY idx_ratings_song (song_id, rating),
  CONSTRAINT fk_ratings_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT chk_ratings_value CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE user_likes (
  user_id   INT UNSIGNED NOT NULL,
  song_id   INT UNSIGNED NOT NULL,
  liked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  KEY idx_likes_song (song_id),
  KEY idx_likes_user_time (user_id, liked_at),
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. RECOMMENDATIONS (batch -> ranked items -> normalised reasons)
-- =====================================================================
CREATE TABLE recommendation_batches (
  batch_id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                  INT UNSIGNED NOT NULL,
  incognito_id             BIGINT UNSIGNED NULL,    -- set when generated inside a private session
  model_id                 SMALLINT UNSIGNED NOT NULL,
  strategy                 ENUM('MOOD','TEXT','CONTEXT','DAILY','SIMILAR','TRENDING','DISCOVERY','REGIONAL','WORLD','SMART_PLAYLIST','RECOVERY') NOT NULL,
  label                    VARCHAR(120) NULL,
  input_text               VARCHAR(280) NULL,
  context_id               TINYINT UNSIGNED NULL,
  seed_song_id             INT UNSIGNED NULL,
  language_id              SMALLINT UNSIGNED NULL,  -- REGIONAL strategy focus language
  target_energy            DECIMAL(4,3) NOT NULL,
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  max_speechiness          DECIMAL(4,3) NOT NULL DEFAULT 1,
  discovery_only           TINYINT(1) NOT NULL DEFAULT 0,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  KEY idx_rb_user_time (user_id, created_at),
  CONSTRAINT fk_rb_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_rb_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_rb_ctx   FOREIGN KEY (context_id) REFERENCES contexts (context_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_seed  FOREIGN KEY (seed_song_id) REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_lang  FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE SET NULL,
  CONSTRAINT chk_rb_targets CHECK (target_energy BETWEEN 0 AND 1 AND target_valence BETWEEN 0 AND 1 AND target_danceability BETWEEN 0 AND 1
                                   AND target_acousticness BETWEEN 0 AND 1 AND target_instrumentalness BETWEEN 0 AND 1 AND max_speechiness BETWEEN 0 AND 1),
  CONSTRAINT chk_rb_tempo CHECK (tempo_min < tempo_max)
) ENGINE=InnoDB;

CREATE TABLE recommendation_batch_moods (            -- the moods requested for a batch
  batch_id  BIGINT UNSIGNED NOT NULL,
  mood_id   SMALLINT UNSIGNED NOT NULL,
  weight    DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (batch_id, mood_id),
  KEY idx_rbm_mood (mood_id),
  CONSTRAINT fk_rbm_batch FOREIGN KEY (batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE CASCADE,
  CONSTRAINT fk_rbm_mood  FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_rbm_weight CHECK (weight > 0 AND weight <= 1)
) ENGINE=InnoDB;

-- Ranked items with the full score breakdown (1:1 with the item, so kept in-row).
CREATE TABLE recommendation_items (
  batch_id            BIGINT UNSIGNED NOT NULL,
  song_id             INT UNSIGNED NOT NULL,
  rank_position       SMALLINT UNSIGNED NOT NULL,
  final_score         DECIMAL(6,4) NOT NULL,
  mood_score          DECIMAL(6,4) NULL,       -- NULL = factor not applicable to this batch
  audio_score         DECIMAL(6,4) NOT NULL,
  preference_score    DECIMAL(6,4) NOT NULL,
  recency_score       DECIMAL(6,4) NULL,       -- NULL = factor not applicable to this batch
  trend_score         DECIMAL(6,4) NOT NULL,
  context_score       DECIMAL(6,4) NULL,       -- NULL = factor not applicable to this batch
  regional_score      DECIMAL(6,4) NULL,       -- NULL = factor not applicable to this batch
  exploration_score   DECIMAL(6,4) NOT NULL,
  repetition_penalty  DECIMAL(6,4) NOT NULL,
  PRIMARY KEY (batch_id, song_id),
  UNIQUE KEY uq_ri_rank (batch_id, rank_position),
  KEY idx_ri_song (song_id),
  CONSTRAINT fk_ri_batch FOREIGN KEY (batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_song  FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT chk_ri_score CHECK (final_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE TABLE reason_types (
  reason_code  VARCHAR(30)  NOT NULL,
  template     VARCHAR(160) NOT NULL,               -- e.g. 'You replay {mood} {language} tracks'
  score_family VARCHAR(30)  NOT NULL,               -- which score it explains
  PRIMARY KEY (reason_code)
) ENGINE=InnoDB;

-- Normalised reasons: code + the real values that justified it.
CREATE TABLE recommendation_reasons (
  batch_id     BIGINT UNSIGNED NOT NULL,
  song_id      INT UNSIGNED NOT NULL,
  reason_code  VARCHAR(30) NOT NULL,
  strength     DECIMAL(5,3) NOT NULL,
  params       JSON NOT NULL,
  PRIMARY KEY (batch_id, song_id, reason_code),
  KEY idx_rr_code (reason_code),
  CONSTRAINT fk_rr_item FOREIGN KEY (batch_id, song_id) REFERENCES recommendation_items (batch_id, song_id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_type FOREIGN KEY (reason_code) REFERENCES reason_types (reason_code) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 10. PERMANENT USER INTELLIGENCE
--     Rebuilt by sp_refresh_user_preferences from behaviour tables with
--     time decay. Never written from incognito data.
-- =====================================================================
CREATE TABLE user_genre_preferences (
  user_id            INT UNSIGNED NOT NULL,
  genre_id           SMALLINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0,   -- what they told us at sign-up
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  completes          INT UNSIGNED NOT NULL DEFAULT 0,
  skips              INT UNSIGNED NOT NULL DEFAULT 0,
  replays            INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0,    -- 7-day half-life
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0,    -- 90-day half-life
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0,    -- 0..1, what the recommender reads
  last_played_at     DATETIME NULL,
  model_id           SMALLINT UNSIGNED NULL,             -- calculation version
  computed_at        DATETIME NULL,
  PRIMARY KEY (user_id, genre_id),
  KEY idx_ugp_rank (user_id, blended_score),
  CONSTRAINT fk_ugp_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ugp_genre FOREIGN KEY (genre_id) REFERENCES genres (genre_id) ON DELETE CASCADE,
  CONSTRAINT fk_ugp_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT chk_ugp CHECK (onboarding_weight BETWEEN 0 AND 1 AND blended_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE TABLE user_artist_preferences (
  user_id            INT UNSIGNED NOT NULL,
  artist_id          INT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0,
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  completes          INT UNSIGNED NOT NULL DEFAULT 0,
  skips              INT UNSIGNED NOT NULL DEFAULT 0,
  replays            INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0,
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0,
  last_played_at     DATETIME NULL,
  model_id           SMALLINT UNSIGNED NULL,
  computed_at        DATETIME NULL,
  PRIMARY KEY (user_id, artist_id),
  KEY idx_uap_rank (user_id, blended_score),
  CONSTRAINT fk_uap_user   FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_uap_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE,
  CONSTRAINT fk_uap_model  FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT chk_uap CHECK (onboarding_weight BETWEEN 0 AND 1 AND blended_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE TABLE user_mood_preferences (
  user_id            INT UNSIGNED NOT NULL,
  mood_id            SMALLINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0,
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0,
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0,
  last_played_at     DATETIME NULL,
  model_id           SMALLINT UNSIGNED NULL,
  computed_at        DATETIME NULL,
  PRIMARY KEY (user_id, mood_id),
  KEY idx_ump_rank (user_id, blended_score),
  CONSTRAINT fk_ump_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ump_mood  FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_ump_model FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT chk_ump CHECK (onboarding_weight BETWEEN 0 AND 1 AND blended_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

CREATE TABLE user_context_preferences (
  user_id            INT UNSIGNED NOT NULL,
  context_id         TINYINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0,
  sessions           INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0,
  computed_at        DATETIME NULL,
  PRIMARY KEY (user_id, context_id),
  CONSTRAINT fk_ucp_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ucp_ctx  FOREIGN KEY (context_id) REFERENCES contexts (context_id) ON DELETE CASCADE,
  CONSTRAINT chk_ucp CHECK (onboarding_weight BETWEEN 0 AND 1 AND blended_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

-- =====================================================================
-- 11. INCOGNITO (private session) — isolated from permanent intelligence
-- =====================================================================
CREATE TABLE incognito_sessions (
  incognito_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  current_mood_id  SMALLINT UNSIGNED NULL,
  status           ENUM('ACTIVE','ENDED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  active_user_key  INT UNSIGNED AS (IF(status = 'ACTIVE', user_id, NULL)) VIRTUAL,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME NOT NULL,
  ended_at         DATETIME NULL,
  PRIMARY KEY (incognito_id),
  UNIQUE KEY uq_incog_one_active (active_user_key),       -- one private session per user
  KEY idx_incog_expiry (status, expires_at),
  CONSTRAINT fk_incog_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_incog_mood FOREIGN KEY (current_mood_id) REFERENCES moods (mood_id) ON DELETE SET NULL,
  CONSTRAINT chk_incog_times CHECK (expires_at > started_at AND (ended_at IS NULL OR ended_at >= started_at)),
  CONSTRAINT chk_incog_state CHECK ((status = 'ACTIVE') = (ended_at IS NULL))
) ENGINE=InnoDB;

-- Temporary listening memory. Deleted with its session (CASCADE).
CREATE TABLE incognito_events (
  event_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  incognito_id  BIGINT UNSIGNED NOT NULL,
  song_id       INT UNSIGNED NOT NULL,
  listened_sec  SMALLINT UNSIGNED NOT NULL,
  completed     TINYINT(1) NOT NULL DEFAULT 0,
  skipped       TINYINT(1) NOT NULL DEFAULT 0,
  occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_ie_session (incognito_id, occurred_at),
  CONSTRAINT fk_ie_session FOREIGN KEY (incognito_id) REFERENCES incognito_sessions (incognito_id) ON DELETE CASCADE,
  CONSTRAINT fk_ie_song    FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT chk_ie_flags  CHECK (NOT (completed = 1 AND skipped = 1))
) ENGINE=InnoDB;

ALTER TABLE recommendation_batches
  ADD CONSTRAINT fk_rb_incognito FOREIGN KEY (incognito_id) REFERENCES incognito_sessions (incognito_id) ON DELETE CASCADE;
ALTER TABLE listening_history
  ADD CONSTRAINT fk_lh_batch FOREIGN KEY (batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL;

-- =====================================================================
-- 12. MUSE WORLD (weekly, versioned, with rollback)
-- =====================================================================
CREATE TABLE world_archetypes (
  archetype_code  VARCHAR(20)  NOT NULL,
  name            VARCHAR(40)  NOT NULL,
  description     VARCHAR(200) NOT NULL,
  motif           ENUM('ORBITS','WAVES','PEAKS','RAIN','SUNBURST','GRID','STARS','EMBERS') NOT NULL,
  palette         JSON NOT NULL,                     -- ["#hex", ...] visual theme base
  title_words     JSON NOT NULL,                     -- {"lead":[...], "place":[...]} for original titles
  season_months   VARCHAR(30) NULL,                  -- calendar signal, e.g. '6,7,8,9' (monsoon)
  PRIMARY KEY (archetype_code),
  UNIQUE KEY uq_archetype_name (name),
  CONSTRAINT chk_arch_palette CHECK (JSON_LENGTH(palette) BETWEEN 3 AND 6)
) ENGINE=InnoDB;

CREATE TABLE archetype_moods (
  archetype_code  VARCHAR(20) NOT NULL,
  mood_id         SMALLINT UNSIGNED NOT NULL,
  weight          DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (archetype_code, mood_id),
  CONSTRAINT fk_am_arch FOREIGN KEY (archetype_code) REFERENCES world_archetypes (archetype_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_am_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_am_weight CHECK (weight > 0 AND weight <= 1)
) ENGINE=InnoDB;

-- One world per user per week per version; exactly one ACTIVE version.
-- Its songs and reasons ARE its recommendation batch (no duplicated item table).
CREATE TABLE weekly_worlds (
  world_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  week_start       DATE NOT NULL,                    -- Monday
  version          SMALLINT UNSIGNED NOT NULL,
  archetype_code   VARCHAR(20)  NOT NULL,
  title            VARCHAR(80)  NOT NULL,
  description      VARCHAR(300) NOT NULL,
  primary_mood_id  SMALLINT UNSIGNED NOT NULL,
  language_id      SMALLINT UNSIGNED NULL,
  region_code      VARCHAR(6) NULL,
  theme            JSON NOT NULL,                    -- palette, motif, seed for the generated visual
  signals          JSON NOT NULL,                    -- the evidence the world was built from
  batch_id         BIGINT UNSIGNED NOT NULL,
  job_id           BIGINT UNSIGNED NULL,
  status           ENUM('ACTIVE','SUPERSEDED','ROLLED_BACK') NOT NULL DEFAULT 'ACTIVE',
  active_key       VARCHAR(30) AS (IF(status = 'ACTIVE', CONCAT(user_id, ':', week_start), NULL)) VIRTUAL,
  generated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME NOT NULL,
  PRIMARY KEY (world_id),
  UNIQUE KEY uq_world_version (user_id, week_start, version),
  UNIQUE KEY uq_world_one_active (active_key),
  UNIQUE KEY uq_world_batch (batch_id),
  CONSTRAINT fk_ww_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ww_arch  FOREIGN KEY (archetype_code) REFERENCES world_archetypes (archetype_code) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ww_mood  FOREIGN KEY (primary_mood_id) REFERENCES moods (mood_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ww_lang  FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE SET NULL,
  CONSTRAINT fk_ww_region FOREIGN KEY (region_code) REFERENCES regions (region_code) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ww_batch FOREIGN KEY (batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ww_job   FOREIGN KEY (job_id) REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT chk_ww_week CHECK (DAYOFWEEK(week_start) = 2),
  CONSTRAINT chk_ww_expiry CHECK (expires_at > generated_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 13. TREND SNAPSHOTS (fact table written by sp_generate_trend_snapshot)
--     entity_id is intentionally not an FK: a snapshot is a historical fact
--     and must survive later catalogue edits. entity_type says what it is.
-- =====================================================================
CREATE TABLE trend_snapshots (
  snapshot_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id          BIGINT UNSIGNED NOT NULL,
  window_code     ENUM('24H','7D','30D') NOT NULL,
  entity_type     ENUM('SONG','ARTIST','GENRE','MOOD','LANGUAGE') NOT NULL,
  entity_id       INT UNSIGNED NOT NULL,
  region_code     VARCHAR(6) NULL,                   -- NULL = all listeners
  region_key      VARCHAR(6) AS (COALESCE(region_code, 'ALL')) VIRTUAL,
  curr_plays      INT UNSIGNED NOT NULL,
  prev_plays      INT UNSIGNED NOT NULL,
  curr_listeners  INT UNSIGNED NOT NULL,
  velocity_pct    DECIMAL(8,2) NULL,                 -- NULL when the previous window had no plays
  momentum_rank   SMALLINT UNSIGNED NOT NULL,
  computed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  UNIQUE KEY uq_trend (job_id, window_code, entity_type, region_key, entity_id),
  KEY idx_trend_lookup (window_code, entity_type, region_key, job_id, momentum_rank),
  CONSTRAINT fk_trend_job FOREIGN KEY (job_id) REFERENCES pipeline_jobs (job_id) ON DELETE CASCADE,
  CONSTRAINT fk_trend_region FOREIGN KEY (region_code) REFERENCES regions (region_code) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 14. PLAYLISTS
-- =====================================================================
CREATE TABLE playlists (
  playlist_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  name                VARCHAR(80)  NOT NULL,
  description         VARCHAR(255) NULL,
  kind                ENUM('MANUAL','SMART','SAVED_MIX','WORLD') NOT NULL DEFAULT 'MANUAL',
  smart_type          VARCHAR(30) NULL,
  source_batch_id     BIGINT UNSIGNED NULL,          -- the generated list it was saved from
  song_count          SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- trigger-maintained
  total_duration_sec  INT UNSIGNED NOT NULL DEFAULT 0,        -- trigger-maintained
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id),
  UNIQUE KEY uq_playlists_user_name (user_id, name),
  CONSTRAINT fk_pl_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_batch FOREIGN KEY (source_batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL,
  CONSTRAINT chk_pl_name CHECK (CHAR_LENGTH(TRIM(name)) >= 1),
  CONSTRAINT chk_pl_smart CHECK ((kind = 'SMART') = (smart_type IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE playlist_songs (
  playlist_id  INT UNSIGNED NOT NULL,
  song_id      INT UNSIGNED NOT NULL,
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  added_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, song_id),
  KEY idx_ps_song (song_id),
  CONSTRAINT fk_ps_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_song     FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 15. AUDIT LOG (append-only; the app DB user has no UPDATE/DELETE on it)
-- =====================================================================
CREATE TABLE audit_logs (
  audit_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id  INT UNSIGNED NULL,
  action         VARCHAR(40) NOT NULL,
  entity_type    VARCHAR(30) NOT NULL,
  entity_id      VARCHAR(40) NOT NULL,
  old_values     JSON NULL,
  new_values     JSON NULL,
  ip_address     VARCHAR(45) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_time (created_at),
  KEY idx_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

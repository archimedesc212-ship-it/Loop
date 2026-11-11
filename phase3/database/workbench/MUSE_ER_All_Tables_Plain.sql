DROP DATABASE IF EXISTS muse_er_all;
CREATE DATABASE muse_er_all CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE muse_er_all;

CREATE TABLE languages (
  language_id  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  iso_code     VARCHAR(3) NOT NULL,
  name         VARCHAR(40) NOT NULL,
  native_name  VARCHAR(40) NOT NULL,
  script       VARCHAR(30) NOT NULL,
  PRIMARY KEY (language_id),
  CONSTRAINT uq_languages_iso UNIQUE (iso_code),
  CONSTRAINT uq_languages_name UNIQUE (name)
) ENGINE = InnoDB;

CREATE TABLE films (
  film_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(150) NOT NULL,
  release_year  SMALLINT UNSIGNED NOT NULL,
  language_id   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (film_id),
  CONSTRAINT uq_films_identity UNIQUE (title, release_year, language_id),
  CONSTRAINT fk_films_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE albums (
  album_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title             VARCHAR(150) NOT NULL,
  normalized_title  VARCHAR(150),
  album_type        ENUM('ALBUM','EP','SINGLE','SOUNDTRACK','COMPILATION') NOT NULL DEFAULT 'ALBUM',
  film_id           INT UNSIGNED,
  release_year      SMALLINT UNSIGNED NOT NULL,
  language_id       SMALLINT UNSIGNED,
  cover_color_1     CHAR(7) NOT NULL,
  cover_color_2     CHAR(7) NOT NULL,
  PRIMARY KEY (album_id),
  CONSTRAINT fk_albums_film FOREIGN KEY (film_id)
    REFERENCES films (film_id) ON DELETE RESTRICT,
  CONSTRAINT fk_albums_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE regions (
  region_code          VARCHAR(6) NOT NULL,
  name                 VARCHAR(60) NOT NULL,
  country_code         CHAR(2) NOT NULL,
  primary_language_id  SMALLINT UNSIGNED,
  PRIMARY KEY (region_code),
  CONSTRAINT uq_regions_name UNIQUE (name),
  CONSTRAINT fk_regions_language FOREIGN KEY (primary_language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE artists (
  artist_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(100) NOT NULL,
  normalized_name      VARCHAR(100),
  disambiguation       VARCHAR(80) NOT NULL DEFAULT '',
  artist_type          ENUM('SOLO','GROUP','COMPOSER','ORCHESTRA') NOT NULL DEFAULT 'SOLO',
  country_code         CHAR(2) NOT NULL DEFAULT 'IN',
  region_code          VARCHAR(6),
  primary_language_id  SMALLINT UNSIGNED,
  formed_year          SMALLINT UNSIGNED,
  bio                  VARCHAR(400),
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (artist_id),
  CONSTRAINT uq_artists_identity UNIQUE (normalized_name, disambiguation),
  CONSTRAINT fk_artists_lang FOREIGN KEY (primary_language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL,
  CONSTRAINT fk_artists_region FOREIGN KEY (region_code)
    REFERENCES regions (region_code) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE album_artists (
  album_id      INT UNSIGNED NOT NULL,
  artist_id     INT UNSIGNED NOT NULL,
  credit_order  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (album_id, artist_id),
  CONSTRAINT fk_aa_album FOREIGN KEY (album_id)
    REFERENCES albums (album_id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_artist FOREIGN KEY (artist_id)
    REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE world_archetypes (
  archetype_code  VARCHAR(20) NOT NULL,
  name            VARCHAR(40) NOT NULL,
  description     VARCHAR(200) NOT NULL,
  motif           ENUM('ORBITS','WAVES','PEAKS','RAIN','SUNBURST','GRID','STARS','EMBERS') NOT NULL,
  palette         JSON NOT NULL,
  title_words     JSON NOT NULL,
  season_months   VARCHAR(30),
  PRIMARY KEY (archetype_code),
  CONSTRAINT uq_archetype_name UNIQUE (name)
) ENGINE = InnoDB;

CREATE TABLE mood_categories (
  category_id  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(40) NOT NULL,
  quadrant     ENUM('BRIGHT_HIGH','BRIGHT_LOW','DARK_HIGH','DARK_LOW') NOT NULL,
  description  VARCHAR(200) NOT NULL,
  PRIMARY KEY (category_id),
  CONSTRAINT uq_mc_name UNIQUE (name),
  CONSTRAINT uq_mc_quadrant UNIQUE (quadrant)
) ENGINE = InnoDB;

CREATE TABLE moods (
  mood_id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id              TINYINT UNSIGNED NOT NULL,
  name                     VARCHAR(30) NOT NULL,
  emoji                    VARCHAR(8) NOT NULL,
  color_hex                CHAR(7) NOT NULL,
  description              VARCHAR(200) NOT NULL,
  target_energy            DECIMAL(4,3) NOT NULL,
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  PRIMARY KEY (mood_id),
  CONSTRAINT uq_moods_name UNIQUE (name),
  CONSTRAINT fk_moods_category FOREIGN KEY (category_id)
    REFERENCES mood_categories (category_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE archetype_moods (
  archetype_code  VARCHAR(20) NOT NULL,
  mood_id         SMALLINT UNSIGNED NOT NULL,
  weight          DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (archetype_code, mood_id),
  CONSTRAINT fk_am_arch FOREIGN KEY (archetype_code)
    REFERENCES world_archetypes (archetype_code) ON DELETE CASCADE,
  CONSTRAINT fk_am_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE artist_aliases (
  alias_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  artist_id         INT UNSIGNED NOT NULL,
  alias             VARCHAR(100) NOT NULL,
  normalized_alias  VARCHAR(100),
  alias_type        ENUM('SPELLING','TRANSLITERATION','NATIVE_SCRIPT','STAGE_NAME') NOT NULL,
  PRIMARY KEY (alias_id),
  CONSTRAINT uq_aliases_artist_alias UNIQUE (artist_id, normalized_alias),
  CONSTRAINT fk_aliases_artist FOREIGN KEY (artist_id)
    REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE intelligence_models (
  model_id     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind         ENUM('AUDIO_FEATURES','MOOD','SEGMENTS','PREFERENCE','RECOMMENDER','WORLD') NOT NULL,
  name         VARCHAR(40) NOT NULL,
  version      VARCHAR(20) NOT NULL,
  description  VARCHAR(300) NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 0,
  active_kind  VARCHAR(20),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (model_id),
  CONSTRAINT uq_models_one_active UNIQUE (active_kind),
  CONSTRAINT uq_models_version UNIQUE (kind, name, version)
) ENGINE = InnoDB;

CREATE TABLE songs (
  song_id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title                VARCHAR(150) NOT NULL,
  normalized_title     VARCHAR(150),
  version_label        VARCHAR(40) NOT NULL DEFAULT '',
  primary_artist_id    INT UNSIGNED NOT NULL,
  album_id             INT UNSIGNED,
  track_number         TINYINT UNSIGNED,
  duration_sec         SMALLINT UNSIGNED NOT NULL,
  release_year         SMALLINT UNSIGNED NOT NULL,
  language_id          SMALLINT UNSIGNED,
  isrc                 CHAR(12),
  explicit             TINYINT(1) NOT NULL DEFAULT 0,
  content_rating       ENUM('ALL','TEEN','MATURE') NOT NULL DEFAULT 'ALL',
  popularity           TINYINT UNSIGNED NOT NULL DEFAULT 50,
  status               ENUM('ACTIVE','PENDING_ANALYSIS','HIDDEN','MERGED') NOT NULL DEFAULT 'ACTIVE',
  merged_into_song_id  INT UNSIGNED,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id),
  CONSTRAINT uq_songs_identity UNIQUE (primary_artist_id, normalized_title, version_label),
  CONSTRAINT uq_songs_isrc UNIQUE (isrc),
  CONSTRAINT fk_songs_album FOREIGN KEY (album_id)
    REFERENCES albums (album_id) ON DELETE SET NULL,
  CONSTRAINT fk_songs_artist FOREIGN KEY (primary_artist_id)
    REFERENCES artists (artist_id) ON DELETE RESTRICT,
  CONSTRAINT fk_songs_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE RESTRICT,
  CONSTRAINT fk_songs_merged FOREIGN KEY (merged_into_song_id)
    REFERENCES songs (song_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE audio_features (
  feature_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id           INT UNSIGNED NOT NULL,
  model_id          SMALLINT UNSIGNED NOT NULL,
  energy            DECIMAL(4,3) NOT NULL,
  valence           DECIMAL(4,3) NOT NULL,
  danceability      DECIMAL(4,3) NOT NULL,
  acousticness      DECIMAL(4,3) NOT NULL,
  instrumentalness  DECIMAL(4,3) NOT NULL,
  speechiness       DECIMAL(4,3) NOT NULL,
  loudness_db       DECIMAL(5,2) NOT NULL,
  tempo_bpm         DECIMAL(5,1) NOT NULL,
  musical_key       TINYINT UNSIGNED NOT NULL,
  mode              TINYINT UNSIGNED NOT NULL,
  analyzed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current        TINYINT(1) NOT NULL DEFAULT 0,
  current_song_key  INT UNSIGNED,
  PRIMARY KEY (feature_id),
  CONSTRAINT uq_af_one_current UNIQUE (current_song_key),
  CONSTRAINT uq_af_song_model UNIQUE (song_id, model_id),
  CONSTRAINT fk_af_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_af_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE roles (
  role_id  TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code     VARCHAR(20) NOT NULL,
  name     VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id),
  CONSTRAINT uq_roles_code UNIQUE (code)
) ENGINE = InnoDB;

CREATE TABLE users (
  user_id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username             VARCHAR(30) NOT NULL,
  email                VARCHAR(120) NOT NULL,
  password_hash        CHAR(60) NOT NULL,
  password_changed_at  DATETIME,
  role_id              TINYINT UNSIGNED NOT NULL,
  is_active            TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until         DATETIME,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at        DATETIME,
  PRIMARY KEY (user_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id)
    REFERENCES roles (role_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE audit_logs (
  audit_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id  INT UNSIGNED,
  action         VARCHAR(40) NOT NULL,
  entity_type    VARCHAR(30) NOT NULL,
  entity_id      VARCHAR(40) NOT NULL,
  old_values     JSON,
  new_values     JSON,
  ip_address     VARCHAR(45),
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
    REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE auth_sessions (
  session_id     CHAR(16) NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NOT NULL,
  revoked_at     DATETIME,
  revoke_reason  ENUM('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGED','ADMIN_DEACTIVATED','REVOKED_BY_USER','ACCOUNT_DELETED'),
  user_agent     VARCHAR(160),
  ip_hash        CHAR(64),
  PRIMARY KEY (session_id),
  CONSTRAINT uq_session_token UNIQUE (token_hash),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE contexts (
  context_id               TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                     VARCHAR(20) NOT NULL,
  name                     VARCHAR(40) NOT NULL,
  emoji                    VARCHAR(8) NOT NULL,
  description              VARCHAR(200) NOT NULL,
  target_energy            DECIMAL(4,3) NOT NULL,
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  max_speechiness          DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  sort_order               TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (context_id),
  CONSTRAINT uq_contexts_code UNIQUE (code)
) ENGINE = InnoDB;

CREATE TABLE context_keywords (
  phrase      VARCHAR(60) NOT NULL,
  context_id  TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (phrase),
  CONSTRAINT fk_ck_ctx FOREIGN KEY (context_id)
    REFERENCES contexts (context_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE context_moods (
  context_id  TINYINT UNSIGNED NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  weight      DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (context_id, mood_id),
  CONSTRAINT fk_cm_ctx FOREIGN KEY (context_id)
    REFERENCES contexts (context_id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE genres (
  genre_id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name             VARCHAR(40) NOT NULL,
  parent_genre_id  SMALLINT UNSIGNED,
  color_hex        CHAR(7) NOT NULL,
  description      VARCHAR(200),
  PRIMARY KEY (genre_id),
  CONSTRAINT uq_genres_name UNIQUE (name),
  CONSTRAINT fk_genres_parent FOREIGN KEY (parent_genre_id)
    REFERENCES genres (genre_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE incognito_sessions (
  incognito_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  current_mood_id  SMALLINT UNSIGNED,
  status           ENUM('ACTIVE','ENDED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  active_user_key  INT UNSIGNED,
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME NOT NULL,
  ended_at         DATETIME,
  PRIMARY KEY (incognito_id),
  CONSTRAINT uq_incog_one_active UNIQUE (active_user_key),
  CONSTRAINT fk_incog_mood FOREIGN KEY (current_mood_id)
    REFERENCES moods (mood_id) ON DELETE SET NULL,
  CONSTRAINT fk_incog_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE incognito_events (
  event_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  incognito_id  BIGINT UNSIGNED NOT NULL,
  song_id       INT UNSIGNED NOT NULL,
  listened_sec  SMALLINT UNSIGNED NOT NULL,
  completed     TINYINT(1) NOT NULL DEFAULT 0,
  skipped       TINYINT(1) NOT NULL DEFAULT 0,
  occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_ie_session FOREIGN KEY (incognito_id)
    REFERENCES incognito_sessions (incognito_id) ON DELETE CASCADE,
  CONSTRAINT fk_ie_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE recommendation_batches (
  batch_id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                  INT UNSIGNED NOT NULL,
  incognito_id             BIGINT UNSIGNED,
  model_id                 SMALLINT UNSIGNED NOT NULL,
  strategy                 ENUM('MOOD','TEXT','CONTEXT','DAILY','SIMILAR','TRENDING','DISCOVERY','REGIONAL','WORLD','SMART_PLAYLIST','RECOVERY') NOT NULL,
  label                    VARCHAR(120),
  input_text               VARCHAR(280),
  context_id               TINYINT UNSIGNED,
  seed_song_id             INT UNSIGNED,
  language_id              SMALLINT UNSIGNED,
  target_energy            DECIMAL(4,3) NOT NULL,
  target_valence           DECIMAL(4,3) NOT NULL,
  target_danceability      DECIMAL(4,3) NOT NULL,
  target_acousticness      DECIMAL(4,3) NOT NULL,
  target_instrumentalness  DECIMAL(4,3) NOT NULL,
  tempo_min                DECIMAL(5,1) NOT NULL,
  tempo_max                DECIMAL(5,1) NOT NULL,
  max_speechiness          DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  discovery_only           TINYINT(1) NOT NULL DEFAULT 0,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  CONSTRAINT fk_rb_ctx FOREIGN KEY (context_id)
    REFERENCES contexts (context_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_incognito FOREIGN KEY (incognito_id)
    REFERENCES incognito_sessions (incognito_id) ON DELETE CASCADE,
  CONSTRAINT fk_rb_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_rb_seed FOREIGN KEY (seed_song_id)
    REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE listening_sessions (
  session_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  context_id        TINYINT UNSIGNED,
  device            VARCHAR(30) NOT NULL DEFAULT 'web',
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at          DATETIME,
  status            ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  plays             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec        INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id),
  CONSTRAINT uq_ls_session_user UNIQUE (session_id, user_id),
  CONSTRAINT fk_ls_ctx FOREIGN KEY (context_id)
    REFERENCES contexts (context_id) ON DELETE SET NULL,
  CONSTRAINT fk_ls_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE listening_history (
  play_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id      BIGINT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  song_id         INT UNSIGNED NOT NULL,
  batch_id        BIGINT UNSIGNED,
  origin          ENUM('HOME','MOOD','CONTEXT','WORLD','SEARCH','PLAYLIST','LIBRARY','SMART_PLAYLIST') NOT NULL DEFAULT 'HOME',
  started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at        DATETIME,
  listened_sec    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  completion_pct  DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  completed       TINYINT(1) NOT NULL DEFAULT 0,
  skipped         TINYINT(1) NOT NULL DEFAULT 0,
  is_replay       TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (play_id),
  CONSTRAINT fk_lh_batch FOREIGN KEY (batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL,
  CONSTRAINT fk_lh_session_user FOREIGN KEY (session_id, user_id)
    REFERENCES listening_sessions (session_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_lh_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE model_parameters (
  model_id     SMALLINT UNSIGNED NOT NULL,
  param_code   VARCHAR(40) NOT NULL,
  param_value  DECIMAL(10,4) NOT NULL,
  min_value    DECIMAL(10,4) NOT NULL,
  max_value    DECIMAL(10,4) NOT NULL,
  description  VARCHAR(200) NOT NULL,
  PRIMARY KEY (model_id, param_code),
  CONSTRAINT fk_mp_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE mood_keywords (
  keyword_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phrase      VARCHAR(60) NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  weight      DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (keyword_id),
  CONSTRAINT uq_mk UNIQUE (phrase, mood_id),
  CONSTRAINT fk_mk_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE
) ENGINE = InnoDB;

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
  CONSTRAINT uq_ms_order UNIQUE (song_id, model_id, segment_index),
  CONSTRAINT fk_ms_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ms_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ms_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE music_sources (
  source_id             SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                  VARCHAR(30) NOT NULL,
  name                  VARCHAR(80) NOT NULL,
  source_type           ENUM('MUSIC_METADATA','AUDIO_ANALYSIS','MUSIC_AUDIO','PLAYBACK','MOVIE_METADATA','ARTWORK','VIDEO_METADATA') NOT NULL,
  access_method         ENUM('API','FILE_FEED','GENERATED','USER_UPLOAD','MANUAL') NOT NULL,
  base_url              VARCHAR(255),
  license_name          VARCHAR(120) NOT NULL,
  rights_scope          SET('METADATA','AUDIO_FEATURES','AUDIO_PREVIEW','AUDIO_FULL','ARTWORK') NOT NULL,
  requires_attribution  TINYINT(1) NOT NULL DEFAULT 0,
  attribution_text      VARCHAR(255),
  priority              TINYINT UNSIGNED NOT NULL DEFAULT 50,
  fallback_source_id    SMALLINT UNSIGNED,
  is_enabled            TINYINT(1) NOT NULL DEFAULT 1,
  requires_credentials  TINYINT(1) NOT NULL DEFAULT 0,
  last_success_at       DATETIME,
  notes                 VARCHAR(300),
  PRIMARY KEY (source_id),
  CONSTRAINT uq_sources_code UNIQUE (code),
  CONSTRAINT fk_sources_fallback FOREIGN KEY (fallback_source_id)
    REFERENCES music_sources (source_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE permissions (
  permission_code  VARCHAR(40) NOT NULL,
  description      VARCHAR(200) NOT NULL,
  PRIMARY KEY (permission_code)
) ENGINE = InnoDB;

CREATE TABLE pipeline_jobs (
  job_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type            ENUM('INGEST_SOURCE','AUDIO_ANALYSIS','MOOD_ANALYSIS','TREND_SNAPSHOT','WORLD_GENERATION','WEEKLY_INTELLIGENCE','PREFERENCE_REFRESH','INCOGNITO_CLEANUP','SESSION_CLOSE') NOT NULL,
  parent_job_id       BIGINT UNSIGNED,
  source_id           SMALLINT UNSIGNED,
  idempotency_key     VARCHAR(120) NOT NULL,
  status              ENUM('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED') NOT NULL DEFAULT 'DISCOVERED',
  params              JSON,
  processing_version  VARCHAR(20) NOT NULL,
  retry_count         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_retries         TINYINT UNSIGNED NOT NULL DEFAULT 3,
  next_attempt_at     DATETIME,
  locked_by           VARCHAR(64),
  locked_at           DATETIME,
  requested_by        INT UNSIGNED,
  stats               JSON,
  last_error          VARCHAR(500),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at          DATETIME,
  completed_at        DATETIME,
  PRIMARY KEY (job_id),
  CONSTRAINT uq_jobs_idem UNIQUE (idempotency_key),
  CONSTRAINT fk_jobs_parent FOREIGN KEY (parent_job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_jobs_source FOREIGN KEY (source_id)
    REFERENCES music_sources (source_id) ON DELETE SET NULL,
  CONSTRAINT fk_jobs_user FOREIGN KEY (requested_by)
    REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE source_records (
  record_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id           SMALLINT UNSIGNED NOT NULL,
  entity_type         ENUM('SONG','ARTIST','ALBUM','FILM') NOT NULL,
  external_id         VARCHAR(100) NOT NULL,
  isrc                CHAR(12),
  song_id             INT UNSIGNED,
  artist_id           INT UNSIGNED,
  album_id            INT UNSIGNED,
  film_id             INT UNSIGNED,
  source_url          VARCHAR(500),
  rights_status       ENUM('PERMITTED','ATTRIBUTION_REQUIRED','METADATA_ONLY','RESTRICTED','UNKNOWN') NOT NULL,
  payload             JSON NOT NULL,
  payload_hash        CHAR(64) NOT NULL,
  status              ENUM('DISCOVERED','VALIDATING','PROCESSING','COMPLETED','SKIPPED','FAILED','IN_REVIEW') NOT NULL DEFAULT 'DISCOVERED',
  match_method        ENUM('EXTERNAL_ID','ISRC','EXACT','FUZZY','NEW','MANUAL'),
  match_confidence    DECIMAL(4,3),
  quality_score       DECIMAL(4,3),
  processing_version  VARCHAR(20) NOT NULL,
  last_job_id         BIGINT UNSIGNED,
  first_seen_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_verified_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id),
  CONSTRAINT uq_sr_external UNIQUE (source_id, entity_type, external_id),
  CONSTRAINT fk_sr_album FOREIGN KEY (album_id)
    REFERENCES albums (album_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_artist FOREIGN KEY (artist_id)
    REFERENCES artists (artist_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_film FOREIGN KEY (film_id)
    REFERENCES films (film_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_job FOREIGN KEY (last_job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sr_source FOREIGN KEY (source_id)
    REFERENCES music_sources (source_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE pipeline_job_logs (
  log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id      BIGINT UNSIGNED NOT NULL,
  level       ENUM('INFO','WARN','ERROR') NOT NULL,
  stage       VARCHAR(30) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  record_id   BIGINT UNSIGNED,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (log_id),
  CONSTRAINT fk_logs_job FOREIGN KEY (job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_record FOREIGN KEY (record_id)
    REFERENCES source_records (record_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE playback_events (
  event_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  play_id       BIGINT UNSIGNED NOT NULL,
  event_type    ENUM('PLAY_STARTED','PAUSE','RESUME','SEEK','SKIP','COMPLETED','REPLAY') NOT NULL,
  position_sec  SMALLINT UNSIGNED NOT NULL,
  seek_to_sec   SMALLINT UNSIGNED,
  occurred_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  CONSTRAINT fk_pe_play FOREIGN KEY (play_id)
    REFERENCES listening_history (play_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE playlists (
  playlist_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id             INT UNSIGNED NOT NULL,
  name                VARCHAR(80) NOT NULL,
  description         VARCHAR(255),
  kind                ENUM('MANUAL','SMART','SAVED_MIX','WORLD') NOT NULL DEFAULT 'MANUAL',
  smart_type          VARCHAR(30),
  source_batch_id     BIGINT UNSIGNED,
  song_count          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_duration_sec  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id),
  CONSTRAINT uq_playlists_user_name UNIQUE (user_id, name),
  CONSTRAINT fk_pl_batch FOREIGN KEY (source_batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL,
  CONSTRAINT fk_pl_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE playlist_songs (
  playlist_id  INT UNSIGNED NOT NULL,
  song_id      INT UNSIGNED NOT NULL,
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  added_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, song_id),
  CONSTRAINT fk_ps_playlist FOREIGN KEY (playlist_id)
    REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE ratings (
  user_id     INT UNSIGNED NOT NULL,
  song_id     INT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,
  rated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  CONSTRAINT fk_ratings_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE reason_types (
  reason_code   VARCHAR(30) NOT NULL,
  template      VARCHAR(160) NOT NULL,
  score_family  VARCHAR(30) NOT NULL,
  PRIMARY KEY (reason_code)
) ENGINE = InnoDB;

CREATE TABLE recommendation_batch_moods (
  batch_id  BIGINT UNSIGNED NOT NULL,
  mood_id   SMALLINT UNSIGNED NOT NULL,
  weight    DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (batch_id, mood_id),
  CONSTRAINT fk_rbm_batch FOREIGN KEY (batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE CASCADE,
  CONSTRAINT fk_rbm_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE recommendation_items (
  batch_id            BIGINT UNSIGNED NOT NULL,
  song_id             INT UNSIGNED NOT NULL,
  rank_position       SMALLINT UNSIGNED NOT NULL,
  final_score         DECIMAL(6,4) NOT NULL,
  mood_score          DECIMAL(6,4),
  audio_score         DECIMAL(6,4) NOT NULL,
  preference_score    DECIMAL(6,4) NOT NULL,
  recency_score       DECIMAL(6,4),
  trend_score         DECIMAL(6,4) NOT NULL,
  context_score       DECIMAL(6,4),
  regional_score      DECIMAL(6,4),
  exploration_score   DECIMAL(6,4) NOT NULL,
  repetition_penalty  DECIMAL(6,4) NOT NULL,
  PRIMARY KEY (batch_id, song_id),
  CONSTRAINT uq_ri_rank UNIQUE (batch_id, rank_position),
  CONSTRAINT fk_ri_batch FOREIGN KEY (batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE recommendation_reasons (
  batch_id     BIGINT UNSIGNED NOT NULL,
  song_id      INT UNSIGNED NOT NULL,
  reason_code  VARCHAR(30) NOT NULL,
  strength     DECIMAL(5,3) NOT NULL,
  params       JSON NOT NULL,
  PRIMARY KEY (batch_id, song_id, reason_code),
  CONSTRAINT fk_rr_item FOREIGN KEY (batch_id, song_id)
    REFERENCES recommendation_items (batch_id, song_id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_type FOREIGN KEY (reason_code)
    REFERENCES reason_types (reason_code) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE review_queue (
  review_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_type        ENUM('POSSIBLE_DUPLICATE','SUSPICIOUS_METADATA','FAILED_INGESTION','SOURCE_CONFLICT') NOT NULL,
  record_id          BIGINT UNSIGNED,
  candidate_song_id  INT UNSIGNED,
  job_id             BIGINT UNSIGNED,
  score              DECIMAL(4,3),
  details            JSON NOT NULL,
  status             ENUM('PENDING','APPROVED','REJECTED','MERGED','IGNORED','REPROCESS') NOT NULL DEFAULT 'PENDING',
  pending_key        VARCHAR(80),
  decided_by         INT UNSIGNED,
  decided_at         DATETIME,
  decision_note      VARCHAR(300),
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id),
  CONSTRAINT uq_review_one_pending UNIQUE (pending_key),
  CONSTRAINT fk_rq_job FOREIGN KEY (job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_rq_record FOREIGN KEY (record_id)
    REFERENCES source_records (record_id) ON DELETE CASCADE,
  CONSTRAINT fk_rq_song FOREIGN KEY (candidate_song_id)
    REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_rq_user FOREIGN KEY (decided_by)
    REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE = InnoDB;

CREATE TABLE role_permissions (
  role_id          TINYINT UNSIGNED NOT NULL,
  permission_code  VARCHAR(40) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code)
    REFERENCES permissions (permission_code) ON DELETE CASCADE,
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id)
    REFERENCES roles (role_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE schema_migrations (
  version       CHAR(4) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  checksum      CHAR(64),
  applied_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execution_ms  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (version)
) ENGINE = InnoDB;

CREATE TABLE search_history (
  search_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  query_text        VARCHAR(120) NOT NULL,
  normalized_query  VARCHAR(120) NOT NULL,
  result_count      SMALLINT UNSIGNED NOT NULL,
  searched_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (search_id),
  CONSTRAINT fk_sh_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_artists (
  song_id       INT UNSIGNED NOT NULL,
  artist_id     INT UNSIGNED NOT NULL,
  role          ENUM('FEATURED','COMPOSER','LYRICIST','PRODUCER') NOT NULL,
  credit_order  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (song_id, artist_id, role),
  CONSTRAINT fk_sa_artist FOREIGN KEY (artist_id)
    REFERENCES artists (artist_id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_dismissals (
  user_id       INT UNSIGNED NOT NULL,
  song_id       INT UNSIGNED NOT NULL,
  batch_id      BIGINT UNSIGNED,
  dismissed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  CONSTRAINT fk_dismiss_batch FOREIGN KEY (batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL,
  CONSTRAINT fk_dismiss_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_dismiss_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_genres (
  song_id           INT UNSIGNED NOT NULL,
  genre_id          SMALLINT UNSIGNED NOT NULL,
  is_primary        TINYINT(1) NOT NULL DEFAULT 0,
  primary_song_key  INT UNSIGNED,
  PRIMARY KEY (song_id, genre_id),
  CONSTRAINT uq_sg_one_primary UNIQUE (primary_song_key),
  CONSTRAINT fk_sg_genre FOREIGN KEY (genre_id)
    REFERENCES genres (genre_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sg_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_media (
  media_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id          INT UNSIGNED NOT NULL,
  source_id        SMALLINT UNSIGNED NOT NULL,
  media_type       ENUM('PREVIEW','FULL','GENERATED_SKETCH','USER_LOCAL') NOT NULL,
  uri              VARCHAR(500),
  rights_status    ENUM('PERMITTED','ATTRIBUTION_REQUIRED','RESTRICTED') NOT NULL,
  availability     ENUM('AVAILABLE','UNAVAILABLE','UNCHECKED') NOT NULL DEFAULT 'UNCHECKED',
  last_checked_at  DATETIME,
  attribution      VARCHAR(200),
  priority         TINYINT UNSIGNED NOT NULL DEFAULT 50,
  PRIMARY KEY (media_id),
  CONSTRAINT uq_media UNIQUE (song_id, source_id, media_type),
  CONSTRAINT fk_media_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_media_source FOREIGN KEY (source_id)
    REFERENCES music_sources (source_id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE song_mood_curations (
  song_id     INT UNSIGNED NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  action      ENUM('ADD','REMOVE') NOT NULL,
  confidence  DECIMAL(4,3),
  note        VARCHAR(200),
  curated_by  INT UNSIGNED,
  curated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id, mood_id),
  CONSTRAINT fk_smc_curator FOREIGN KEY (curated_by)
    REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_smc_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_smc_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_mood_ratings (
  user_id           INT UNSIGNED NOT NULL,
  song_id           INT UNSIGNED NOT NULL,
  mood_id           SMALLINT UNSIGNED NOT NULL,
  match_percentage  DECIMAL(5,2) NOT NULL,
  review_text       VARCHAR(280),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id, mood_id),
  CONSTRAINT fk_smr_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE song_moods (
  song_id      INT UNSIGNED NOT NULL,
  mood_id      SMALLINT UNSIGNED NOT NULL,
  model_id     SMALLINT UNSIGNED NOT NULL,
  confidence   DECIMAL(4,3) NOT NULL,
  feature_id   INT UNSIGNED NOT NULL,
  analyzed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id, mood_id, model_id),
  CONSTRAINT fk_sm_feature FOREIGN KEY (feature_id)
    REFERENCES audio_features (feature_id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT fk_sm_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE trend_snapshots (
  snapshot_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id          BIGINT UNSIGNED NOT NULL,
  window_code     ENUM('24H','7D','30D') NOT NULL,
  entity_type     ENUM('SONG','ARTIST','GENRE','MOOD','LANGUAGE') NOT NULL,
  entity_id       INT UNSIGNED NOT NULL,
  region_code     VARCHAR(6),
  region_key      VARCHAR(6),
  curr_plays      INT UNSIGNED NOT NULL,
  prev_plays      INT UNSIGNED NOT NULL,
  curr_listeners  INT UNSIGNED NOT NULL,
  velocity_pct    DECIMAL(8,2),
  momentum_rank   SMALLINT UNSIGNED NOT NULL,
  computed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  CONSTRAINT uq_trend UNIQUE (job_id, window_code, entity_type, region_key, entity_id),
  CONSTRAINT fk_trend_job FOREIGN KEY (job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE CASCADE,
  CONSTRAINT fk_trend_region FOREIGN KEY (region_code)
    REFERENCES regions (region_code) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_artist_preferences (
  user_id            INT UNSIGNED NOT NULL,
  artist_id          INT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  completes          INT UNSIGNED NOT NULL DEFAULT 0,
  skips              INT UNSIGNED NOT NULL DEFAULT 0,
  replays            INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  last_played_at     DATETIME,
  model_id           SMALLINT UNSIGNED,
  computed_at        DATETIME,
  PRIMARY KEY (user_id, artist_id),
  CONSTRAINT fk_uap_artist FOREIGN KEY (artist_id)
    REFERENCES artists (artist_id) ON DELETE CASCADE,
  CONSTRAINT fk_uap_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT fk_uap_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_context_preferences (
  user_id            INT UNSIGNED NOT NULL,
  context_id         TINYINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  sessions           INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  computed_at        DATETIME,
  PRIMARY KEY (user_id, context_id),
  CONSTRAINT fk_ucp_ctx FOREIGN KEY (context_id)
    REFERENCES contexts (context_id) ON DELETE CASCADE,
  CONSTRAINT fk_ucp_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_genre_preferences (
  user_id            INT UNSIGNED NOT NULL,
  genre_id           SMALLINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  completes          INT UNSIGNED NOT NULL DEFAULT 0,
  skips              INT UNSIGNED NOT NULL DEFAULT 0,
  replays            INT UNSIGNED NOT NULL DEFAULT 0,
  listen_sec         INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  last_played_at     DATETIME,
  model_id           SMALLINT UNSIGNED,
  computed_at        DATETIME,
  PRIMARY KEY (user_id, genre_id),
  CONSTRAINT fk_ugp_genre FOREIGN KEY (genre_id)
    REFERENCES genres (genre_id) ON DELETE CASCADE,
  CONSTRAINT fk_ugp_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT fk_ugp_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_languages (
  user_id      INT UNSIGNED NOT NULL,
  language_id  SMALLINT UNSIGNED NOT NULL,
  priority     TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, language_id),
  CONSTRAINT uq_ul_priority UNIQUE (user_id, priority),
  CONSTRAINT fk_ul_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE CASCADE,
  CONSTRAINT fk_ul_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_likes (
  user_id   INT UNSIGNED NOT NULL,
  song_id   INT UNSIGNED NOT NULL,
  liked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  CONSTRAINT fk_likes_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_mood_preferences (
  user_id            INT UNSIGNED NOT NULL,
  mood_id            SMALLINT UNSIGNED NOT NULL,
  onboarding_weight  DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  plays              INT UNSIGNED NOT NULL DEFAULT 0,
  short_term_score   DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  long_term_score    DECIMAL(9,4) NOT NULL DEFAULT 0.0000,
  blended_score      DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  last_played_at     DATETIME,
  model_id           SMALLINT UNSIGNED,
  computed_at        DATETIME,
  PRIMARY KEY (user_id, mood_id),
  CONSTRAINT fk_ump_model FOREIGN KEY (model_id)
    REFERENCES intelligence_models (model_id) ON DELETE SET NULL,
  CONSTRAINT fk_ump_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_ump_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE user_profiles (
  user_id                  INT UNSIGNED NOT NULL,
  display_name             VARCHAR(60) NOT NULL,
  region_code              VARCHAR(6),
  content_filter           ENUM('OFF','NO_EXPLICIT','FAMILY') NOT NULL DEFAULT 'OFF',
  listening_habit          ENUM('BACKGROUND','ACTIVE','MIXED'),
  onboarding_completed_at  DATETIME,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_up_region FOREIGN KEY (region_code)
    REFERENCES regions (region_code) ON DELETE SET NULL,
  CONSTRAINT fk_up_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE weekly_worlds (
  world_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  week_start       DATE NOT NULL,
  version          SMALLINT UNSIGNED NOT NULL,
  archetype_code   VARCHAR(20) NOT NULL,
  title            VARCHAR(80) NOT NULL,
  description      VARCHAR(300) NOT NULL,
  primary_mood_id  SMALLINT UNSIGNED NOT NULL,
  language_id      SMALLINT UNSIGNED,
  region_code      VARCHAR(6),
  theme            JSON NOT NULL,
  signals          JSON NOT NULL,
  batch_id         BIGINT UNSIGNED NOT NULL,
  job_id           BIGINT UNSIGNED,
  status           ENUM('ACTIVE','SUPERSEDED','ROLLED_BACK') NOT NULL DEFAULT 'ACTIVE',
  active_key       VARCHAR(30),
  generated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME NOT NULL,
  PRIMARY KEY (world_id),
  CONSTRAINT uq_world_batch UNIQUE (batch_id),
  CONSTRAINT uq_world_one_active UNIQUE (active_key),
  CONSTRAINT uq_world_version UNIQUE (user_id, week_start, version),
  CONSTRAINT fk_ww_arch FOREIGN KEY (archetype_code)
    REFERENCES world_archetypes (archetype_code) ON DELETE RESTRICT,
  CONSTRAINT fk_ww_batch FOREIGN KEY (batch_id)
    REFERENCES recommendation_batches (batch_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ww_job FOREIGN KEY (job_id)
    REFERENCES pipeline_jobs (job_id) ON DELETE SET NULL,
  CONSTRAINT fk_ww_lang FOREIGN KEY (language_id)
    REFERENCES languages (language_id) ON DELETE SET NULL,
  CONSTRAINT fk_ww_mood FOREIGN KEY (primary_mood_id)
    REFERENCES moods (mood_id) ON DELETE RESTRICT,
  CONSTRAINT fk_ww_region FOREIGN KEY (region_code)
    REFERENCES regions (region_code) ON DELETE SET NULL,
  CONSTRAINT fk_ww_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE world_feedback (
  user_id     INT UNSIGNED NOT NULL,
  world_id    BIGINT UNSIGNED NOT NULL,
  feedback    ENUM('LOVE','NOT_FOR_ME') NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, world_id),
  CONSTRAINT fk_wf_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_wf_world FOREIGN KEY (world_id)
    REFERENCES weekly_worlds (world_id) ON DELETE CASCADE
) ENGINE = InnoDB;

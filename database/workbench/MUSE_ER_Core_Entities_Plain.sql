DROP DATABASE IF EXISTS muse_er;
CREATE DATABASE muse_er CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE muse_er;

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
  CONSTRAINT uq_users_username UNIQUE (username)
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
  CONSTRAINT fk_up_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
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
  CONSTRAINT uq_artists_identity UNIQUE (normalized_name, disambiguation)
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
  PRIMARY KEY (album_id)
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
  CONSTRAINT fk_songs_merged FOREIGN KEY (merged_into_song_id)
    REFERENCES songs (song_id) ON DELETE RESTRICT
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
  CONSTRAINT uq_moods_name UNIQUE (name)
) ENGINE = InnoDB;

CREATE TABLE song_moods (
  song_id      INT UNSIGNED NOT NULL,
  mood_id      SMALLINT UNSIGNED NOT NULL,
  model_id     SMALLINT UNSIGNED NOT NULL,
  confidence   DECIMAL(4,3) NOT NULL,
  feature_id   INT UNSIGNED NOT NULL,
  analyzed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (song_id, mood_id, model_id),
  CONSTRAINT fk_sm_mood FOREIGN KEY (mood_id)
    REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_song FOREIGN KEY (song_id)
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
  CONSTRAINT fk_ls_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
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
  CONSTRAINT fk_rb_seed FOREIGN KEY (seed_song_id)
    REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_user FOREIGN KEY (user_id)
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

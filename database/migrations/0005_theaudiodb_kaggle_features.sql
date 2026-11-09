-- =====================================================================
--  0005 — TheAudioDB artwork metadata + Kaggle music feature staging
--
--  Non-destructive. TheAudioDB is metadata/artwork only, never audio.
--  Kaggle's CC BY 4.0 feature dataset is kept in a separate table because
--  it does not contain playable recordings or track duration. Lyrics are
--  intentionally NOT imported.
-- =====================================================================

CREATE TABLE IF NOT EXISTS kaggle_ceds_music_features (
  feature_row_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_key          CHAR(64)        NOT NULL,
  artist_name          VARCHAR(100)    NOT NULL,
  track_name           VARCHAR(180)    NOT NULL,
  normalized_artist    VARCHAR(120)    NOT NULL,
  normalized_track     VARCHAR(180)    NOT NULL,
  release_year         SMALLINT UNSIGNED NOT NULL,
  genre                VARCHAR(40)     NOT NULL,
  topic                VARCHAR(40)     NOT NULL,
  energy               DECIMAL(8,6)    NOT NULL,
  danceability         DECIMAL(8,6)    NOT NULL,
  valence              DECIMAL(8,6)    NOT NULL,
  acousticness         DECIMAL(8,6)    NOT NULL,
  instrumentalness     DECIMAL(8,6)    NOT NULL,
  loudness_db          DECIMAL(9,4)    NOT NULL,
  topic_scores         JSON            NOT NULL,
  matched_song_id      INT UNSIGNED    NULL,
  dataset_license      VARCHAR(40)     NOT NULL DEFAULT 'CC BY 4.0',
  dataset_source       VARCHAR(255)    NOT NULL DEFAULT 'Kaggle: saurabhshahane/music-dataset-1950-to-2019',
  imported_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (feature_row_id),
  UNIQUE KEY uq_kaggle_ceds_key (dataset_key),
  KEY idx_kaggle_ceds_artist_track_year (normalized_artist, normalized_track, release_year),
  KEY idx_kaggle_ceds_genre_year (genre, release_year),
  KEY idx_kaggle_ceds_topic (topic),
  KEY idx_kaggle_ceds_matched_song (matched_song_id),
  CONSTRAINT fk_kaggle_ceds_song FOREIGN KEY (matched_song_id)
    REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT chk_kaggle_ceds_year CHECK (release_year BETWEEN 1950 AND 2019),
  CONSTRAINT chk_kaggle_ceds_energy CHECK (energy BETWEEN 0 AND 1),
  CONSTRAINT chk_kaggle_ceds_danceability CHECK (danceability BETWEEN 0 AND 1),
  CONSTRAINT chk_kaggle_ceds_valence CHECK (valence BETWEEN 0 AND 1),
  CONSTRAINT chk_kaggle_ceds_acousticness CHECK (acousticness BETWEEN 0 AND 1),
  CONSTRAINT chk_kaggle_ceds_instrumentalness CHECK (instrumentalness BETWEEN 0 AND 1)
) ENGINE=InnoDB;

INSERT INTO music_sources
  (code, name, source_type, access_method, base_url, license_name, rights_scope,
   requires_attribution, attribution_text, priority, is_enabled, requires_credentials, notes)
VALUES
  ('THEAUDIODB', 'TheAudioDB artist artwork', 'MUSIC_METADATA', 'API',
   'https://www.theaudiodb.com/api/v1/json', 'TheAudioDB API terms of use', 'METADATA',
   1, 'Artist and album metadata/artwork via TheAudioDB.', 45, 1, 0,
   'Metadata and artwork only; never audio. Free shared key 123 is rate-limited to 30 requests/minute. Artist artwork is cached by the backend.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), source_type = VALUES(source_type), access_method = VALUES(access_method),
  base_url = VALUES(base_url), license_name = VALUES(license_name), rights_scope = VALUES(rights_scope),
  requires_attribution = VALUES(requires_attribution), attribution_text = VALUES(attribution_text),
  notes = VALUES(notes);

GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.kaggle_ceds_music_features TO '__APP_USER__'@'__APP_HOST__';

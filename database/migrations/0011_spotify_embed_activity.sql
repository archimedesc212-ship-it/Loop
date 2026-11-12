-- 0011: record Spotify embed launches without storing Spotify catalogue metadata or audio.
-- Track IDs are identifiers only; names/artwork are fetched from Spotify when needed.
CREATE TABLE IF NOT EXISTS spotify_embed_events (
  event_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED NOT NULL,
  spotify_track_id  VARCHAR(32) NOT NULL,
  event_type        ENUM('EMBED_OPENED') NOT NULL DEFAULT 'EMBED_OPENED',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_spotify_events_user_time (user_id, created_at),
  KEY idx_spotify_events_track_time (spotify_track_id, created_at),
  CONSTRAINT fk_spotify_events_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_spotify_track_id CHECK (spotify_track_id REGEXP '^[A-Za-z0-9]{10,32}$')
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW v_spotify_embed_activity AS
SELECT user_id,
       spotify_track_id,
       COUNT(*) AS embed_open_count,
       MAX(created_at) AS last_opened_at
  FROM spotify_embed_events
 GROUP BY user_id, spotify_track_id;

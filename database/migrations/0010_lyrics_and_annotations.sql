-- 0010: licensed/user-supplied lyrics and private listening annotations.
-- Existing user_likes remains the single source of truth for favourites.
CREATE TABLE IF NOT EXISTS song_lyrics (
  lyric_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  song_id INT UNSIGNED NOT NULL,
  language_code VARCHAR(12) NOT NULL DEFAULT 'und',
  source_type ENUM('USER_PROVIDED','LICENSED') NOT NULL,
  source_label VARCHAR(160) NOT NULL,
  source_url VARCHAR(500) NULL,
  rights_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  supplied_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (lyric_id),
  UNIQUE KEY uq_song_lyrics_song_language (song_id, language_code),
  CONSTRAINT fk_song_lyrics_song FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE,
  CONSTRAINT fk_song_lyrics_user FOREIGN KEY (supplied_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_song_lyrics_rights CHECK (rights_confirmed = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lyric_lines (
  lyric_line_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lyric_id BIGINT UNSIGNED NOT NULL,
  line_number SMALLINT UNSIGNED NOT NULL,
  start_ms INT UNSIGNED NOT NULL,
  end_ms INT UNSIGNED NULL,
  lyric_text VARCHAR(1000) NOT NULL,
  PRIMARY KEY (lyric_line_id),
  UNIQUE KEY uq_lyric_line_number (lyric_id, line_number),
  KEY idx_lyric_line_time (lyric_id, start_ms),
  CONSTRAINT fk_lyric_lines_lyric FOREIGN KEY (lyric_id) REFERENCES song_lyrics(lyric_id) ON DELETE CASCADE,
  CONSTRAINT chk_lyric_line_end CHECK (end_ms IS NULL OR end_ms >= start_ms)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lyric_annotations (
  annotation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lyric_line_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  annotation_text VARCHAR(2000) NOT NULL,
  source_url VARCHAR(500) NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (annotation_id),
  KEY idx_lyric_annotations_line (lyric_line_id),
  KEY idx_lyric_annotations_user (user_id, updated_at),
  CONSTRAINT fk_lyric_annotations_line FOREIGN KEY (lyric_line_id) REFERENCES lyric_lines(lyric_line_id) ON DELETE CASCADE,
  CONSTRAINT fk_lyric_annotations_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_song_notes (
  note_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  song_id INT UNSIGNED NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id),
  UNIQUE KEY uq_user_song_note (user_id, song_id),
  CONSTRAINT fk_user_song_notes_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_song_notes_song FOREIGN KEY (song_id) REFERENCES songs(song_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- A reporting view makes the normalized song → lyric → line → annotation joins easy to demonstrate.
CREATE OR REPLACE VIEW v_song_lyric_annotation_summary AS
SELECT s.song_id, s.title AS song_title, ar.name AS artist_name, al.title AS album_title,
       COUNT(DISTINCT ll.lyric_line_id) AS lyric_line_count,
       COUNT(DISTINCT la.annotation_id) AS annotation_count,
       MAX(sl.updated_at) AS lyrics_updated_at
  FROM songs s
  JOIN artists ar ON ar.artist_id = s.primary_artist_id
  LEFT JOIN albums al ON al.album_id = s.album_id
  LEFT JOIN song_lyrics sl ON sl.song_id = s.song_id
  LEFT JOIN lyric_lines ll ON ll.lyric_id = sl.lyric_id
  LEFT JOIN lyric_annotations la ON la.lyric_line_id = ll.lyric_line_id
 GROUP BY s.song_id, s.title, ar.name, al.title;

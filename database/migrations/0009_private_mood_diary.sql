-- =====================================================================
-- 0009 — optional private daily mood diary
-- Additive only. Diary data is owner-readable, is never used for song
-- recommendation/model training, and is removed with the owning account.
-- =====================================================================

CREATE TABLE IF NOT EXISTS mood_diary_entries (
  entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  mood_id SMALLINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id),
  UNIQUE KEY uq_mde_user_day (user_id, checkin_date),
  KEY idx_mde_mood_day (mood_id, checkin_date),
  CONSTRAINT fk_mde_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_mde_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE SET NULL,
  CONSTRAINT chk_mde_content CHECK (mood_id IS NOT NULL OR (note IS NOT NULL AND CHAR_LENGTH(TRIM(note)) > 0)),
  CONSTRAINT chk_mde_note CHECK (note IS NULL OR CHAR_LENGTH(TRIM(note)) > 0)
) ENGINE=InnoDB;

GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.mood_diary_entries TO '__APP_USER__'@'__APP_HOST__';

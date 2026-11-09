-- =====================================================================
--  0004 — mood-wise percentage ratings by users
--
--  Users rate how well a song fits each mood on a 0–100 scale ("Happy: 92.50 %").
--  This is USER FEEDBACK and is stored apart from the AI's mood prediction:
--    * song_moods.confidence           — the mood model's prediction (unchanged)
--    * song_mood_ratings.match_percentage — one user's judgement (this migration)
--    * v_song_mood_rating_stats        — the aggregate of all users' judgements
--  Neither ever overwrites the other.
--
--  Non-destructive: only CREATE … IF NOT EXISTS, CREATE OR REPLACE VIEW and a
--  re-created procedure. No existing table or row is changed. Safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS song_mood_ratings (
  user_id           INT UNSIGNED      NOT NULL,
  song_id           INT UNSIGNED      NOT NULL,
  mood_id           SMALLINT UNSIGNED NOT NULL,
  match_percentage  DECIMAL(5,2)      NOT NULL,          -- 0.00 … 100.00
  review_text       VARCHAR(280)      NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id, mood_id),               -- one rating per user, song and mood
  KEY idx_smr_song_mood (song_id, mood_id, match_percentage),   -- per-song averages
  KEY idx_smr_mood_song (mood_id, song_id, match_percentage),   -- top songs for a mood
  CONSTRAINT fk_smr_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_smr_mood FOREIGN KEY (mood_id) REFERENCES moods (mood_id) ON DELETE CASCADE,
  CONSTRAINT chk_smr_pct CHECK (match_percentage >= 0 AND match_percentage <= 100),
  CONSTRAINT chk_smr_review CHECK (review_text IS NULL OR CHAR_LENGTH(TRIM(review_text)) > 0)
) ENGINE=InnoDB;

-- aggregate of user feedback per song and mood (songs with no ratings simply have no row)
CREATE OR REPLACE VIEW v_song_mood_rating_stats AS
SELECT song_id, mood_id,
       COUNT(*)                         AS rating_count,
       ROUND(AVG(match_percentage), 2)  AS avg_match_percentage,
       MIN(match_percentage)            AS min_match_percentage,
       MAX(match_percentage)            AS max_match_percentage,
       MAX(updated_at)                  AS last_rated_at
  FROM song_mood_ratings
 GROUP BY song_id, mood_id;

-- song merges carry the new ratings over to the canonical song
DROP PROCEDURE IF EXISTS sp_merge_songs;
DELIMITER $$
CREATE PROCEDURE sp_merge_songs(IN p_duplicate_id INT UNSIGNED, IN p_canonical_id INT UNSIGNED, IN p_actor INT UNSIGNED)
BEGIN
  DECLARE v_dup_status, v_can_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN SET @muse_allow_merge = 0; ROLLBACK; RESIGNAL; END;

  IF p_duplicate_id = p_canonical_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A song cannot be merged into itself';
  END IF;

  START TRANSACTION;
    SELECT status INTO v_dup_status FROM songs WHERE song_id = p_duplicate_id FOR UPDATE;
    SELECT status INTO v_can_status FROM songs WHERE song_id = p_canonical_id FOR UPDATE;
    IF v_dup_status IS NULL OR v_can_status IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Song not found';
    END IF;
    IF v_dup_status = 'MERGED' OR v_can_status = 'MERGED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One of these songs is already merged';
    END IF;

    SET @muse_actor_id = p_actor;
    SET @muse_allow_merge = 1;            -- the only path allowed to re-point history (see trg_lh_bu)
    UPDATE listening_history SET song_id = p_canonical_id WHERE song_id = p_duplicate_id;
    SET @muse_allow_merge = 0;
    UPDATE incognito_events  SET song_id = p_canonical_id WHERE song_id = p_duplicate_id;

    INSERT INTO ratings (user_id, song_id, rating, rated_at)
    SELECT * FROM (SELECT user_id, p_canonical_id AS sid, rating, rated_at FROM ratings WHERE song_id = p_duplicate_id) AS d
    ON DUPLICATE KEY UPDATE rating = GREATEST(ratings.rating, d.rating);
    DELETE FROM ratings WHERE song_id = p_duplicate_id;

    INSERT IGNORE INTO user_likes (user_id, song_id, liked_at)
    SELECT user_id, p_canonical_id, liked_at FROM user_likes WHERE song_id = p_duplicate_id;
    DELETE FROM user_likes WHERE song_id = p_duplicate_id;

    INSERT IGNORE INTO song_dismissals (user_id, song_id, batch_id, dismissed_at)
    SELECT user_id, p_canonical_id, batch_id, dismissed_at FROM song_dismissals WHERE song_id = p_duplicate_id;
    DELETE FROM song_dismissals WHERE song_id = p_duplicate_id;

    -- 0004: users' mood-match ratings follow the song. If a user rated the same mood on both
    -- songs, the more recently updated rating wins (ties keep the canonical song's rating).
    INSERT INTO song_mood_ratings (user_id, song_id, mood_id, match_percentage, review_text, created_at, updated_at)
    SELECT * FROM (SELECT user_id, p_canonical_id AS sid, mood_id, match_percentage, review_text, created_at, updated_at
                     FROM song_mood_ratings WHERE song_id = p_duplicate_id) AS d
    ON DUPLICATE KEY UPDATE
      match_percentage = IF(d.updated_at > song_mood_ratings.updated_at, d.match_percentage, song_mood_ratings.match_percentage),
      review_text      = IF(d.updated_at > song_mood_ratings.updated_at, d.review_text, song_mood_ratings.review_text),
      created_at       = LEAST(song_mood_ratings.created_at, d.created_at),
      updated_at       = GREATEST(song_mood_ratings.updated_at, d.updated_at);
    DELETE FROM song_mood_ratings WHERE song_id = p_duplicate_id;

    INSERT IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at)
    SELECT playlist_id, p_canonical_id, position, added_at FROM playlist_songs WHERE song_id = p_duplicate_id;
    DELETE FROM playlist_songs WHERE song_id = p_duplicate_id;

    UPDATE source_records SET song_id = p_canonical_id, match_method = 'MANUAL', match_confidence = 1
     WHERE song_id = p_duplicate_id;
    UPDATE songs SET status = 'MERGED', merged_into_song_id = p_canonical_id WHERE song_id = p_duplicate_id;
  COMMIT;
  SELECT p_duplicate_id AS merged_song_id, p_canonical_id AS canonical_song_id;
END$$
DELIMITER ;

GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_mood_ratings TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.v_song_mood_rating_stats TO '__APP_USER__'@'__APP_HOST__';

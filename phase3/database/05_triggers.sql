-- =====================================================================
--  MUSE — 05_triggers.sql
--  Triggers are used sparingly, for three jobs only:
--    A. INTEGRITY that a CHECK constraint cannot express (needs other rows
--       or other tables): incognito isolation, overlap-free mood segments,
--       immutable listening history, plays never longer than the song.
--    B. DERIVED COLUMNS that must never drift: a play's completion %,
--       completed/skipped flags and replay flag; playlist song count/length.
--    C. AUDIT LOGGING of sensitive changes (catalogue edits, roles, model
--       weights, review decisions, source settings). The acting user is
--       read from the session variable @muse_actor_id, which the API sets
--       at the start of every admin transaction and clears afterwards.
--  Preference learning is deliberately NOT a trigger: it needs time decay
--  and normalisation over all of a user's rows, so it is a procedure
--  (sp_refresh_user_preferences) that can be rerun and versioned.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_lh_bi;
DROP TRIGGER IF EXISTS trg_lh_bu;
DROP TRIGGER IF EXISTS trg_ie_bi;
DROP TRIGGER IF EXISTS trg_ms_bi;
DROP TRIGGER IF EXISTS trg_ms_bu;
DROP TRIGGER IF EXISTS trg_ps_bi;
DROP TRIGGER IF EXISTS trg_ps_ai;
DROP TRIGGER IF EXISTS trg_ps_ad;
DROP TRIGGER IF EXISTS trg_songs_au_audit;
DROP TRIGGER IF EXISTS trg_songs_ad_audit;
DROP TRIGGER IF EXISTS trg_users_au_audit;
DROP TRIGGER IF EXISTS trg_mp_au_audit;
DROP TRIGGER IF EXISTS trg_review_au_audit;
DROP TRIGGER IF EXISTS trg_sources_au_audit;

DELIMITER $$

-- ---------------------------------------------------------------------
-- A+B. LISTENING HISTORY
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_lh_bi BEFORE INSERT ON listening_history
FOR EACH ROW
BEGIN
  DECLARE v_dur SMALLINT UNSIGNED;
  DECLARE v_status VARCHAR(20);

  -- Incognito isolation, enforced in the database itself: while a user has
  -- an ACTIVE private session, nothing may be written to permanent history.
  IF EXISTS (SELECT 1 FROM incognito_sessions WHERE user_id = NEW.user_id AND status = 'ACTIVE' AND expires_at > NOW()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Private session is active: permanent listening history is read-only';
  END IF;

  SELECT duration_sec, status INTO v_dur, v_status FROM songs WHERE song_id = NEW.song_id;
  IF v_dur IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Song not found';
  END IF;
  IF v_status NOT IN ('ACTIVE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Song is not playable';
  END IF;
  IF NEW.listened_sec > v_dur + 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listened time cannot exceed the song duration';
  END IF;

  SET NEW.completion_pct = fn_completion_pct(NEW.listened_sec, v_dur);
  IF NEW.ended_at IS NOT NULL THEN
    SET NEW.completed = NEW.completion_pct >= 90;
    SET NEW.skipped   = NEW.completed = 0 AND NEW.listened_sec < 30 AND NEW.completion_pct < 50;
  END IF;

  -- a replay = starting a song this user already finished in the previous 24 hours
  SET NEW.is_replay = EXISTS (
    SELECT 1 FROM listening_history lh
     WHERE lh.user_id = NEW.user_id AND lh.song_id = NEW.song_id AND lh.completed = 1
       AND lh.started_at BETWEEN NEW.started_at - INTERVAL 1 DAY AND NEW.started_at);
END$$

CREATE TRIGGER trg_lh_bu BEFORE UPDATE ON listening_history
FOR EACH ROW
BEGIN
  DECLARE v_dur SMALLINT UNSIGNED;

  -- history is append-only: who / when / which session never change.
  -- song_id may change only inside sp_merge_songs (canonicalisation).
  IF NEW.user_id <> OLD.user_id OR NEW.session_id <> OLD.session_id OR NEW.started_at <> OLD.started_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listening history is immutable';
  END IF;
  IF NEW.song_id <> OLD.song_id AND COALESCE(@muse_allow_merge, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listening history is immutable';
  END IF;
  IF OLD.ended_at IS NOT NULL AND NEW.song_id = OLD.song_id
     AND (NEW.listened_sec <> OLD.listened_sec OR NEW.ended_at <> OLD.ended_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This play is already finished';
  END IF;

  SELECT duration_sec INTO v_dur FROM songs WHERE song_id = NEW.song_id;
  IF NEW.listened_sec > v_dur + 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listened time cannot exceed the song duration';
  END IF;
  SET NEW.completion_pct = fn_completion_pct(NEW.listened_sec, v_dur);
  IF NEW.ended_at IS NOT NULL THEN
    SET NEW.completed = NEW.completion_pct >= 90;
    SET NEW.skipped   = NEW.completed = 0 AND NEW.listened_sec < 30 AND NEW.completion_pct < 50;
  END IF;
END$$

-- Incognito events may only be written into a live private session.
CREATE TRIGGER trg_ie_bi BEFORE INSERT ON incognito_events
FOR EACH ROW
BEGIN
  DECLARE v_dur SMALLINT UNSIGNED;
  IF NOT EXISTS (SELECT 1 FROM incognito_sessions WHERE incognito_id = NEW.incognito_id AND status = 'ACTIVE' AND expires_at > NOW()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Private session has ended';
  END IF;
  SELECT duration_sec INTO v_dur FROM songs WHERE song_id = NEW.song_id AND status = 'ACTIVE';
  IF v_dur IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Song is not playable';
  END IF;
  IF NEW.listened_sec > v_dur + 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listened time cannot exceed the song duration';
  END IF;
  SET NEW.completed = NEW.listened_sec >= 0.9 * v_dur;
  SET NEW.skipped   = NEW.completed = 0 AND NEW.listened_sec < 30 AND NEW.listened_sec < 0.5 * v_dur;
END$$

-- ---------------------------------------------------------------------
-- A. MOOD SEGMENTS: inside the song and not overlapping (same model)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_ms_bi BEFORE INSERT ON mood_segments
FOR EACH ROW
BEGIN
  IF NEW.end_sec > (SELECT duration_sec FROM songs WHERE song_id = NEW.song_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Segment ends after the song ends';
  END IF;
  IF EXISTS (SELECT 1 FROM mood_segments ms
              WHERE ms.song_id = NEW.song_id AND ms.model_id = NEW.model_id
                AND ms.start_sec < NEW.end_sec AND NEW.start_sec < ms.end_sec) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mood segments of one analysis may not overlap';
  END IF;
END$$

CREATE TRIGGER trg_ms_bu BEFORE UPDATE ON mood_segments
FOR EACH ROW
BEGIN
  IF NEW.end_sec > (SELECT duration_sec FROM songs WHERE song_id = NEW.song_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Segment ends after the song ends';
  END IF;
  IF EXISTS (SELECT 1 FROM mood_segments ms
              WHERE ms.song_id = NEW.song_id AND ms.model_id = NEW.model_id AND ms.segment_id <> NEW.segment_id
                AND ms.start_sec < NEW.end_sec AND NEW.start_sec < ms.end_sec) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mood segments of one analysis may not overlap';
  END IF;
END$$

-- ---------------------------------------------------------------------
-- B. PLAYLIST METADATA
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_ps_bi BEFORE INSERT ON playlist_songs
FOR EACH ROW
BEGIN
  IF NEW.position = 0 THEN
    SET NEW.position = (SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = NEW.playlist_id);
  END IF;
END$$

CREATE TRIGGER trg_ps_ai AFTER INSERT ON playlist_songs
FOR EACH ROW
BEGIN
  UPDATE playlists
     SET song_count = song_count + 1,
         total_duration_sec = total_duration_sec + (SELECT duration_sec FROM songs WHERE song_id = NEW.song_id),
         updated_at = NOW()
   WHERE playlist_id = NEW.playlist_id;
END$$

CREATE TRIGGER trg_ps_ad AFTER DELETE ON playlist_songs
FOR EACH ROW
BEGIN
  UPDATE playlists
     SET song_count = GREATEST(CAST(song_count AS SIGNED) - 1, 0),
         total_duration_sec = GREATEST(CAST(total_duration_sec AS SIGNED)
                                       - COALESCE((SELECT duration_sec FROM songs WHERE song_id = OLD.song_id), 0), 0),
         updated_at = NOW()
   WHERE playlist_id = OLD.playlist_id;
END$$

-- ---------------------------------------------------------------------
-- C. AUDIT LOGGING
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_songs_au_audit AFTER UPDATE ON songs
FOR EACH ROW
BEGIN
  IF NOT (OLD.title <=> NEW.title AND OLD.status <=> NEW.status AND OLD.album_id <=> NEW.album_id
          AND OLD.primary_artist_id <=> NEW.primary_artist_id AND OLD.explicit <=> NEW.explicit
          AND OLD.content_rating <=> NEW.content_rating AND OLD.language_id <=> NEW.language_id
          AND OLD.duration_sec <=> NEW.duration_sec AND OLD.isrc <=> NEW.isrc AND OLD.popularity <=> NEW.popularity) THEN
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@muse_actor_id, IF(NEW.status = 'MERGED' AND OLD.status <> 'MERGED', 'SONG_MERGED', 'SONG_UPDATED'), 'song', OLD.song_id,
      JSON_OBJECT('title', OLD.title, 'status', OLD.status, 'album_id', OLD.album_id, 'artist_id', OLD.primary_artist_id,
                  'explicit', OLD.explicit, 'content_rating', OLD.content_rating, 'language_id', OLD.language_id,
                  'duration_sec', OLD.duration_sec, 'isrc', OLD.isrc, 'popularity', OLD.popularity),
      JSON_OBJECT('title', NEW.title, 'status', NEW.status, 'album_id', NEW.album_id, 'artist_id', NEW.primary_artist_id,
                  'explicit', NEW.explicit, 'content_rating', NEW.content_rating, 'language_id', NEW.language_id,
                  'duration_sec', NEW.duration_sec, 'isrc', NEW.isrc, 'popularity', NEW.popularity,
                  'merged_into', NEW.merged_into_song_id));
  END IF;
END$$

CREATE TRIGGER trg_songs_ad_audit AFTER DELETE ON songs
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values)
  VALUES (@muse_actor_id, 'SONG_DELETED', 'song', OLD.song_id,
          JSON_OBJECT('title', OLD.title, 'artist_id', OLD.primary_artist_id, 'status', OLD.status));
END$$

CREATE TRIGGER trg_users_au_audit AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF OLD.role_id <> NEW.role_id OR OLD.is_active <> NEW.is_active THEN
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@muse_actor_id, 'USER_ACCESS_CHANGED', 'user', OLD.user_id,
            JSON_OBJECT('role_id', OLD.role_id, 'is_active', OLD.is_active),
            JSON_OBJECT('role_id', NEW.role_id, 'is_active', NEW.is_active));
  END IF;
END$$

CREATE TRIGGER trg_mp_au_audit AFTER UPDATE ON model_parameters
FOR EACH ROW
BEGIN
  IF OLD.param_value <> NEW.param_value THEN
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@muse_actor_id, 'MODEL_PARAM_CHANGED', 'model_parameter', CONCAT(OLD.model_id, ':', OLD.param_code),
            JSON_OBJECT('value', OLD.param_value), JSON_OBJECT('value', NEW.param_value));
  END IF;
END$$

CREATE TRIGGER trg_review_au_audit AFTER UPDATE ON review_queue
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (COALESCE(NEW.decided_by, @muse_actor_id), CONCAT('REVIEW_', NEW.status), 'review', OLD.review_id,
            JSON_OBJECT('status', OLD.status),
            JSON_OBJECT('status', NEW.status, 'note', NEW.decision_note, 'record_id', NEW.record_id,
                        'candidate_song_id', NEW.candidate_song_id));
  END IF;
END$$

CREATE TRIGGER trg_sources_au_audit AFTER UPDATE ON music_sources
FOR EACH ROW
BEGIN
  IF OLD.is_enabled <> NEW.is_enabled OR OLD.priority <> NEW.priority OR NOT (OLD.fallback_source_id <=> NEW.fallback_source_id) THEN
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@muse_actor_id, 'SOURCE_CHANGED', 'music_source', OLD.code,
            JSON_OBJECT('is_enabled', OLD.is_enabled, 'priority', OLD.priority, 'fallback', OLD.fallback_source_id),
            JSON_OBJECT('is_enabled', NEW.is_enabled, 'priority', NEW.priority, 'fallback', NEW.fallback_source_id));
  END IF;
END$$

DELIMITER ;

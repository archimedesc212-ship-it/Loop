-- =====================================================================
--  MUSE — 04_procedures.sql
--
--  Transaction convention
--    * "Building block" procedures (sp_generate_recommendations,
--      sp_refresh_user_preferences_core, sp_analyze_song_moods) never start
--      or commit a transaction, so callers can compose them atomically.
--    * "Top-level" procedures (sp_refresh_user_preferences,
--      sp_close_listening_session, sp_merge_songs, sp_rollback_world,
--      sp_cleanup_expired_incognito, sp_generate_trend_snapshot) own a
--      transaction and roll back on any error (EXIT HANDLER ... RESIGNAL).
--  All procedures validate inputs and raise SQLSTATE '45000' with a readable
--  message; the API maps those to HTTP 4xx responses.
-- =====================================================================

DROP PROCEDURE IF EXISTS sp_analyze_song_moods;
DROP PROCEDURE IF EXISTS sp_set_current_audio_features;
DROP PROCEDURE IF EXISTS sp_refresh_user_preferences_core;
DROP PROCEDURE IF EXISTS sp_refresh_user_preferences;
DROP PROCEDURE IF EXISTS sp_close_listening_session;
DROP PROCEDURE IF EXISTS sp_generate_recommendations;
DROP PROCEDURE IF EXISTS sp_generate_trend_snapshot;
DROP PROCEDURE IF EXISTS sp_cleanup_expired_incognito;
DROP PROCEDURE IF EXISTS sp_rollback_world;
DROP PROCEDURE IF EXISTS sp_merge_songs;
DROP PROCEDURE IF EXISTS sp_user_listening_summary;

DELIMITER $$

-- ---------------------------------------------------------------------
-- MOOD ANALYSIS (rule model): score every mood against a song's audio
-- features with fn_mood_fit, keep the strongest few. Writes rows for ONE
-- model version; other versions are untouched (history is preserved).
--   p_feature_model_id NULL = use each song's current audio analysis
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_analyze_song_moods(IN p_model_id SMALLINT UNSIGNED, IN p_feature_model_id SMALLINT UNSIGNED, IN p_song_id INT UNSIGNED)
BEGIN
  DECLARE v_floor, v_min DECIMAL(10,4);
  DECLARE v_max INT;

  IF NOT EXISTS (SELECT 1 FROM intelligence_models WHERE model_id = p_model_id AND kind = 'MOOD') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not a mood model';
  END IF;
  SET v_floor = fn_model_param(p_model_id, 'fit_floor');
  SET v_min   = fn_model_param(p_model_id, 'min_confidence');
  SET v_max   = fn_model_param(p_model_id, 'max_moods_per_song');

  DELETE FROM song_moods WHERE model_id = p_model_id AND (p_song_id IS NULL OR song_id = p_song_id);

  INSERT INTO song_moods (song_id, mood_id, model_id, confidence, feature_id)
  WITH fits AS (
    SELECT af.song_id, af.feature_id, m.mood_id,
           (fn_mood_fit(af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness, af.tempo_bpm,
                        m.target_energy, m.target_valence, m.target_danceability, m.target_acousticness,
                        m.target_instrumentalness, m.tempo_min, m.tempo_max) - v_floor) / (1 - v_floor) AS conf
    FROM audio_features af
    CROSS JOIN moods m
    WHERE (p_song_id IS NULL OR af.song_id = p_song_id)
      AND ((p_feature_model_id IS NULL AND af.is_current = 1) OR af.model_id = p_feature_model_id)
  ),
  ranked AS (
    SELECT f.*, ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY conf DESC, mood_id) AS rn FROM fits f
  )
  SELECT song_id, mood_id, p_model_id, ROUND(LEAST(1, conf), 3), feature_id
  FROM ranked
  WHERE conf > 0 AND rn <= v_max AND (rn = 1 OR conf >= v_min);

  -- human curation always wins over the rules: re-apply it after every run
  DELETE sm FROM song_moods sm
    JOIN song_mood_curations c ON c.song_id = sm.song_id AND c.mood_id = sm.mood_id AND c.action = 'REMOVE'
   WHERE sm.model_id = p_model_id AND (p_song_id IS NULL OR sm.song_id = p_song_id);

  INSERT INTO song_moods (song_id, mood_id, model_id, confidence, feature_id)
  SELECT c.song_id, c.mood_id, p_model_id, c.confidence, af.feature_id
    FROM song_mood_curations c
    JOIN audio_features af ON af.song_id = c.song_id
     AND ((p_feature_model_id IS NULL AND af.is_current = 1) OR af.model_id = p_feature_model_id)
   WHERE c.action = 'ADD' AND (p_song_id IS NULL OR c.song_id = p_song_id)
  ON DUPLICATE KEY UPDATE confidence = VALUES(confidence), feature_id = VALUES(feature_id);

  SELECT COUNT(*) AS mood_rows_written FROM song_moods
   WHERE model_id = p_model_id AND (p_song_id IS NULL OR song_id = p_song_id);
END$$

-- Make one analysis version current for its song. Old rows are kept.
CREATE PROCEDURE sp_set_current_audio_features(IN p_feature_id INT UNSIGNED)
BEGIN
  DECLARE v_song INT UNSIGNED;
  SELECT song_id INTO v_song FROM audio_features WHERE feature_id = p_feature_id;
  IF v_song IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audio analysis not found';
  END IF;
  -- order matters: clear the old current row first so the unique key never sees two
  UPDATE audio_features SET is_current = 0 WHERE song_id = v_song AND is_current = 1 AND feature_id <> p_feature_id;
  UPDATE audio_features SET is_current = 1 WHERE feature_id = p_feature_id;
END$$

-- ---------------------------------------------------------------------
-- PERMANENT USER INTELLIGENCE
-- Rebuilds genre / artist / mood / context preferences from behaviour:
--   play signal = completed: w_complete | skipped: w_skip | else w_partial * completion
--                 + w_replay_bonus when the play was a replay
--   like = w_like,  rating r = (r - 3) * w_rating
--   short_term = Σ signal · 0.5^(age / half_life_short)
--   long_term  = Σ signal · 0.5^(age / half_life_long)
--   blended    = evidence · (s · short_norm + (1 - s) · long_norm) + (1 - evidence) · onboarding
--   evidence   = min(1, completed plays / cold_start_plays)
-- Reads ONLY permanent tables (listening_history, user_likes, ratings,
-- listening_sessions); incognito tables are never referenced here.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_refresh_user_preferences_core(IN p_user_id INT UNSIGNED)
BEGIN
  DECLARE v_model SMALLINT UNSIGNED;
  DECLARE v_hs, v_hl, v_wc, v_wp, v_wsk, v_wr, v_wl, v_wrt, v_cold, v_share DECIMAL(10,4);
  DECLARE v_evidence, v_ms, v_ml DOUBLE;

  SET v_model = fn_active_model('PREFERENCE');
  SET v_hs  = fn_model_param(v_model, 'half_life_short_days');
  SET v_hl  = fn_model_param(v_model, 'half_life_long_days');
  SET v_wc  = fn_model_param(v_model, 'w_complete');
  SET v_wp  = fn_model_param(v_model, 'w_partial');
  SET v_wsk = fn_model_param(v_model, 'w_skip');
  SET v_wr  = fn_model_param(v_model, 'w_replay_bonus');
  SET v_wl  = fn_model_param(v_model, 'w_like');
  SET v_wrt = fn_model_param(v_model, 'w_rating');
  SET v_cold  = fn_model_param(v_model, 'cold_start_plays');
  SET v_share = fn_model_param(v_model, 'short_term_share');

  SELECT LEAST(1, COALESCE(SUM(completed), 0) / v_cold) INTO v_evidence
    FROM listening_history WHERE user_id = p_user_id;

  -- one row per behavioural signal, with its age in days
  DROP TEMPORARY TABLE IF EXISTS tmp_signals;
  CREATE TEMPORARY TABLE tmp_signals ENGINE=MEMORY AS
  SELECT lh.song_id,
         CASE WHEN lh.completed = 1 THEN v_wc WHEN lh.skipped = 1 THEN v_wsk ELSE v_wp * lh.completion_pct / 100 END
           + CASE WHEN lh.is_replay = 1 AND lh.skipped = 0 THEN v_wr ELSE 0 END AS sig,
         TIMESTAMPDIFF(MINUTE, lh.started_at, NOW()) / 1440 AS age_days,
         1 AS is_play, lh.completed, lh.skipped, lh.is_replay, lh.listened_sec, lh.started_at
  FROM listening_history lh WHERE lh.user_id = p_user_id
  UNION ALL
  SELECT ul.song_id, v_wl, TIMESTAMPDIFF(MINUTE, ul.liked_at, NOW()) / 1440, 0, 0, 0, 0, 0, NULL
  FROM user_likes ul WHERE ul.user_id = p_user_id
  UNION ALL
  SELECT r.song_id, (CAST(r.rating AS SIGNED) - 3) * v_wrt, TIMESTAMPDIFF(MINUTE, r.updated_at, NOW()) / 1440, 0, 0, 0, 0, 0, NULL
  FROM ratings r WHERE r.user_id = p_user_id;

  -- ---- genres ----------------------------------------------------------
  UPDATE user_genre_preferences
     SET plays = 0, completes = 0, skips = 0, replays = 0, listen_sec = 0, short_term_score = 0, long_term_score = 0
   WHERE user_id = p_user_id;

  INSERT INTO user_genre_preferences (user_id, genre_id, plays, completes, skips, replays, listen_sec,
                                      short_term_score, long_term_score, last_played_at, model_id, computed_at)
  SELECT * FROM (
    SELECT p_user_id AS uid, sg.genre_id AS gid, SUM(t.is_play) AS n_plays, SUM(t.completed) AS n_comp, SUM(t.skipped) AS n_skip,
           SUM(t.is_replay) AS n_rep, SUM(t.listened_sec) AS secs,
           SUM(t.sig * fn_decay(t.age_days, v_hs)) AS st, SUM(t.sig * fn_decay(t.age_days, v_hl)) AS lt,
           MAX(t.started_at) AS last_at, v_model AS mdl, NOW() AS comp_at
    FROM tmp_signals t JOIN song_genres sg ON sg.song_id = t.song_id AND sg.is_primary = 1
    GROUP BY sg.genre_id
  ) AS agg
  ON DUPLICATE KEY UPDATE plays = agg.n_plays, completes = agg.n_comp, skips = agg.n_skip, replays = agg.n_rep,
    listen_sec = agg.secs, short_term_score = agg.st, long_term_score = agg.lt, last_played_at = agg.last_at,
    model_id = agg.mdl, computed_at = agg.comp_at;

  SELECT COALESCE(MAX(GREATEST(short_term_score, 0)), 0), COALESCE(MAX(GREATEST(long_term_score, 0)), 0)
    INTO v_ms, v_ml FROM user_genre_preferences WHERE user_id = p_user_id;
  UPDATE user_genre_preferences
     SET blended_score = LEAST(1, GREATEST(0, ROUND(
           v_evidence * (v_share * COALESCE(GREATEST(short_term_score, 0) / NULLIF(v_ms, 0), 0)
                       + (1 - v_share) * COALESCE(GREATEST(long_term_score, 0) / NULLIF(v_ml, 0), 0))
         + (1 - v_evidence) * onboarding_weight, 4))),
         model_id = v_model, computed_at = NOW()
   WHERE user_id = p_user_id;
  DELETE FROM user_genre_preferences
   WHERE user_id = p_user_id AND plays = 0 AND onboarding_weight = 0 AND short_term_score = 0 AND long_term_score = 0;

  -- ---- artists ---------------------------------------------------------
  UPDATE user_artist_preferences
     SET plays = 0, completes = 0, skips = 0, replays = 0, listen_sec = 0, short_term_score = 0, long_term_score = 0
   WHERE user_id = p_user_id;

  INSERT INTO user_artist_preferences (user_id, artist_id, plays, completes, skips, replays, listen_sec,
                                       short_term_score, long_term_score, last_played_at, model_id, computed_at)
  SELECT * FROM (
    SELECT p_user_id AS uid, s.primary_artist_id AS aid, SUM(t.is_play) AS n_plays, SUM(t.completed) AS n_comp,
           SUM(t.skipped) AS n_skip, SUM(t.is_replay) AS n_rep, SUM(t.listened_sec) AS secs,
           SUM(t.sig * fn_decay(t.age_days, v_hs)) AS st, SUM(t.sig * fn_decay(t.age_days, v_hl)) AS lt,
           MAX(t.started_at) AS last_at, v_model AS mdl, NOW() AS comp_at
    FROM tmp_signals t JOIN songs s ON s.song_id = t.song_id
    GROUP BY s.primary_artist_id
  ) AS agg
  ON DUPLICATE KEY UPDATE plays = agg.n_plays, completes = agg.n_comp, skips = agg.n_skip, replays = agg.n_rep,
    listen_sec = agg.secs, short_term_score = agg.st, long_term_score = agg.lt, last_played_at = agg.last_at,
    model_id = agg.mdl, computed_at = agg.comp_at;

  SELECT COALESCE(MAX(GREATEST(short_term_score, 0)), 0), COALESCE(MAX(GREATEST(long_term_score, 0)), 0)
    INTO v_ms, v_ml FROM user_artist_preferences WHERE user_id = p_user_id;
  UPDATE user_artist_preferences
     SET blended_score = LEAST(1, GREATEST(0, ROUND(
           v_evidence * (v_share * COALESCE(GREATEST(short_term_score, 0) / NULLIF(v_ms, 0), 0)
                       + (1 - v_share) * COALESCE(GREATEST(long_term_score, 0) / NULLIF(v_ml, 0), 0))
         + (1 - v_evidence) * onboarding_weight, 4))),
         model_id = v_model, computed_at = NOW()
   WHERE user_id = p_user_id;
  DELETE FROM user_artist_preferences
   WHERE user_id = p_user_id AND plays = 0 AND onboarding_weight = 0 AND short_term_score = 0 AND long_term_score = 0;

  -- ---- moods (each song contributes to its moods by confidence) -------
  UPDATE user_mood_preferences SET plays = 0, short_term_score = 0, long_term_score = 0 WHERE user_id = p_user_id;

  INSERT INTO user_mood_preferences (user_id, mood_id, plays, short_term_score, long_term_score, last_played_at, model_id, computed_at)
  SELECT * FROM (
    SELECT p_user_id AS uid, cm.mood_id AS mid, SUM(t.is_play) AS n_plays,
           SUM(cm.confidence * t.sig * fn_decay(t.age_days, v_hs)) AS st,
           SUM(cm.confidence * t.sig * fn_decay(t.age_days, v_hl)) AS lt,
           MAX(t.started_at) AS last_at, v_model AS mdl, NOW() AS comp_at
    FROM tmp_signals t JOIN v_current_song_moods cm ON cm.song_id = t.song_id
    GROUP BY cm.mood_id
  ) AS agg
  ON DUPLICATE KEY UPDATE plays = agg.n_plays, short_term_score = agg.st, long_term_score = agg.lt,
    last_played_at = agg.last_at, model_id = agg.mdl, computed_at = agg.comp_at;

  SELECT COALESCE(MAX(GREATEST(short_term_score, 0)), 0), COALESCE(MAX(GREATEST(long_term_score, 0)), 0)
    INTO v_ms, v_ml FROM user_mood_preferences WHERE user_id = p_user_id;
  UPDATE user_mood_preferences
     SET blended_score = LEAST(1, GREATEST(0, ROUND(
           v_evidence * (v_share * COALESCE(GREATEST(short_term_score, 0) / NULLIF(v_ms, 0), 0)
                       + (1 - v_share) * COALESCE(GREATEST(long_term_score, 0) / NULLIF(v_ml, 0), 0))
         + (1 - v_evidence) * onboarding_weight, 4))),
         model_id = v_model, computed_at = NOW()
   WHERE user_id = p_user_id;
  DELETE FROM user_mood_preferences
   WHERE user_id = p_user_id AND plays = 0 AND onboarding_weight = 0 AND short_term_score = 0 AND long_term_score = 0;

  -- ---- contexts (from the context chosen for listening sessions) -------
  UPDATE user_context_preferences SET sessions = 0, listen_sec = 0 WHERE user_id = p_user_id;
  INSERT INTO user_context_preferences (user_id, context_id, sessions, listen_sec, computed_at)
  SELECT * FROM (
    SELECT p_user_id AS uid, ls.context_id AS cid, COUNT(DISTINCT ls.session_id) AS n, COALESCE(SUM(lh.listened_sec), 0) AS secs, NOW() AS comp_at
    FROM listening_sessions ls LEFT JOIN listening_history lh ON lh.session_id = ls.session_id
    WHERE ls.user_id = p_user_id AND ls.context_id IS NOT NULL
    GROUP BY ls.context_id
  ) AS agg
  ON DUPLICATE KEY UPDATE sessions = agg.n, listen_sec = agg.secs, computed_at = agg.comp_at;

  SELECT COALESCE(MAX(listen_sec), 0) INTO v_ml FROM user_context_preferences WHERE user_id = p_user_id;
  UPDATE user_context_preferences
     SET blended_score = LEAST(1, ROUND(v_evidence * COALESCE(listen_sec / NULLIF(v_ml, 0), 0) + (1 - v_evidence) * onboarding_weight, 4)),
         computed_at = NOW()
   WHERE user_id = p_user_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_signals;
END$$

-- Top-level, concurrency-safe wrapper. Locking the user row with
-- SELECT ... FOR UPDATE serialises two refreshes of the same user
-- (e.g. a finished play and a rating arriving together): the second waits
-- for the first to commit instead of interleaving its reset/upsert steps.
CREATE PROCEDURE sp_refresh_user_preferences(IN p_user_id INT UNSIGNED)
BEGIN
  DECLARE v_found INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT user_id INTO v_found FROM users WHERE user_id = p_user_id FOR UPDATE;
    IF v_found IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;
    CALL sp_refresh_user_preferences_core(p_user_id);
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Close a listening session safely and fold it into the user's profile.
-- Idempotent: closing an already-closed session does nothing.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_close_listening_session(IN p_session_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_user INT UNSIGNED;
  DECLARE v_status VARCHAR(10);
  DECLARE v_lock INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    -- lock order: user row, then session row (same order as sp_refresh_user_preferences
    -- and the play-finish path), which prevents deadlocks between them
    SELECT user_id INTO v_user FROM listening_sessions WHERE session_id = p_session_id;
    IF v_user IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listening session not found';
    END IF;
    SELECT user_id INTO v_lock FROM users WHERE user_id = v_user FOR UPDATE;
    SELECT status INTO v_status FROM listening_sessions WHERE session_id = p_session_id FOR UPDATE;

    IF v_status = 'OPEN' THEN
      UPDATE listening_sessions ls
        JOIN (SELECT COUNT(*) AS n, COALESCE(SUM(listened_sec), 0) AS secs,
                     MAX(COALESCE(ended_at, started_at)) AS last_at
                FROM listening_history WHERE session_id = p_session_id) x
         SET ls.plays = x.n, ls.listen_sec = x.secs, ls.status = 'CLOSED',
             ls.ended_at = GREATEST(ls.started_at, COALESCE(x.last_at, ls.last_activity_at), ls.last_activity_at)
       WHERE ls.session_id = p_session_id;
      CALL sp_refresh_user_preferences_core(v_user);
    END IF;
  COMMIT;
  SELECT session_id, status, plays, listen_sec, started_at, ended_at FROM listening_sessions WHERE session_id = p_session_id;
END$$

-- ---------------------------------------------------------------------
-- THE RECOMMENDATION ENGINE (building block, no transaction of its own)
-- Reads the batch (targets, moods, context, seed, strategy) and scores
-- every candidate on up to eight signals:
--   mood, audio, preference, recency, trend, context, regional, exploration
-- final = Σ wᵢ·scoreᵢ / Σ wᵢ (only over signals that apply to this batch)
--         − w_repetition · repetition_penalty
-- then applies diversity caps (artist cap, genre share), stores the ranked
-- items with every score, derives normalised reasons from real signals and
-- returns the ranked list.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_generate_recommendations(IN p_batch_id BIGINT UNSIGNED, IN p_limit INT)
BEGIN
  DECLARE v_user INT UNSIGNED;
  DECLARE v_incog BIGINT UNSIGNED;
  DECLARE v_model SMALLINT UNSIGNED;
  DECLARE v_strategy VARCHAR(20);
  DECLARE v_ctx TINYINT UNSIGNED;
  DECLARE v_seed INT UNSIGNED;
  DECLARE v_lang SMALLINT UNSIGNED;
  DECLARE v_te, v_tv, v_td, v_ta, v_ti, v_maxsp DOUBLE;
  DECLARE v_tmin, v_tmax DOUBLE;
  DECLARE v_disc TINYINT;
  DECLARE v_w_mood, v_w_audio, v_w_pref, v_w_rec, v_w_trend, v_w_ctx, v_w_reg, v_w_exp, v_w_rep DOUBLE;
  DECLARE v_artist_cap, v_genre_cap INT;
  DECLARE v_excl_hours, v_recent_hours DOUBLE;
  DECLARE v_mood_total DOUBLE DEFAULT 0;
  DECLARE v_filter VARCHAR(12) DEFAULT 'OFF';
  DECLARE v_region VARCHAR(6) DEFAULT NULL;
  DECLARE v_has_lang INT DEFAULT 0;
  DECLARE v_re, v_rv, v_rd, v_ra, v_ri DOUBLE;
  DECLARE v_recent_n INT DEFAULT 0;
  DECLARE v_trend_job BIGINT UNSIGNED;
  DECLARE v_trend_n INT DEFAULT 0;
  DECLARE v_seed_title VARCHAR(150);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Limit must be between 1 and 100';
  END IF;

  SELECT user_id, incognito_id, model_id, strategy, context_id, seed_song_id, language_id,
         target_energy, target_valence, target_danceability, target_acousticness, target_instrumentalness,
         tempo_min, tempo_max, max_speechiness, discovery_only
    INTO v_user, v_incog, v_model, v_strategy, v_ctx, v_seed, v_lang,
         v_te, v_tv, v_td, v_ta, v_ti, v_tmin, v_tmax, v_maxsp, v_disc
    FROM recommendation_batches WHERE batch_id = p_batch_id;
  IF v_user IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Recommendation batch not found';
  END IF;

  -- configurable weights and diversity controls of THIS model version
  SET v_w_mood  = fn_model_param(v_model, 'w_mood');
  SET v_w_audio = fn_model_param(v_model, 'w_audio');
  SET v_w_pref  = fn_model_param(v_model, 'w_preference');
  SET v_w_rec   = fn_model_param(v_model, 'w_recency');
  SET v_w_trend = fn_model_param(v_model, 'w_trend');
  SET v_w_ctx   = fn_model_param(v_model, 'w_context');
  SET v_w_reg   = fn_model_param(v_model, 'w_regional');
  SET v_w_exp   = fn_model_param(v_model, 'w_exploration');
  SET v_w_rep   = fn_model_param(v_model, 'w_repetition');
  SET v_artist_cap   = fn_model_param(v_model, 'artist_cap');
  SET v_genre_cap    = CEIL(p_limit * fn_model_param(v_model, 'genre_max_share'));
  SET v_excl_hours   = fn_model_param(v_model, 'recent_exclusion_hours');
  SET v_recent_hours = fn_model_param(v_model, 'recent_window_hours');
  IF v_strategy = 'DISCOVERY' THEN SET v_w_exp = v_w_exp * 2; END IF;

  SELECT COALESCE(SUM(weight), 0) INTO v_mood_total FROM recommendation_batch_moods WHERE batch_id = p_batch_id;
  SELECT COALESCE(MAX(content_filter), 'OFF'), MAX(region_code) INTO v_filter, v_region
    FROM user_profiles WHERE user_id = v_user;
  SELECT COUNT(*) INTO v_has_lang FROM user_languages WHERE user_id = v_user;

  -- "recent session" taste: average sound of what was just finished
  IF v_incog IS NULL THEN
    SELECT COUNT(*), AVG(af.energy), AVG(af.valence), AVG(af.danceability), AVG(af.acousticness), AVG(af.instrumentalness)
      INTO v_recent_n, v_re, v_rv, v_rd, v_ra, v_ri
      FROM (SELECT song_id FROM listening_history
             WHERE user_id = v_user AND skipped = 0 AND completion_pct >= 60
               AND started_at >= NOW() - INTERVAL v_recent_hours HOUR
             ORDER BY started_at DESC LIMIT 10) r
      JOIN audio_features af ON af.song_id = r.song_id AND af.is_current = 1;
  ELSE
    SELECT COUNT(*), AVG(af.energy), AVG(af.valence), AVG(af.danceability), AVG(af.acousticness), AVG(af.instrumentalness)
      INTO v_recent_n, v_re, v_rv, v_rd, v_ra, v_ri
      FROM (SELECT song_id FROM incognito_events WHERE incognito_id = v_incog AND skipped = 0
             ORDER BY occurred_at DESC LIMIT 10) r
      JOIN audio_features af ON af.song_id = r.song_id AND af.is_current = 1;
  END IF;

  SELECT MAX(job_id) INTO v_trend_job FROM trend_snapshots;
  SELECT COUNT(*) INTO v_trend_n FROM trend_snapshots
   WHERE job_id = v_trend_job AND window_code = '7D' AND entity_type = 'SONG' AND region_code IS NULL;
  SELECT title INTO v_seed_title FROM songs WHERE song_id = v_seed;

  DELETE FROM recommendation_items WHERE batch_id = p_batch_id;   -- re-runnable

  INSERT INTO recommendation_items
    (batch_id, song_id, rank_position, final_score, mood_score, audio_score, preference_score, recency_score,
     trend_score, context_score, regional_score, exploration_score, repetition_penalty)
  WITH
  user_song AS (
    SELECT song_id, COUNT(*) AS plays, SUM(skipped) AS skips,
           SUM(started_at >= NOW() - INTERVAL 7 DAY) AS plays_7d,
           MAX(started_at) AS last_played
    FROM listening_history WHERE user_id = v_user GROUP BY song_id
  ),
  user_artist AS (
    SELECT DISTINCT s.primary_artist_id AS artist_id
    FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id WHERE lh.user_id = v_user
  ),
  incog_song AS (
    SELECT song_id, COUNT(*) AS plays, SUM(skipped) AS skips FROM incognito_events
    WHERE incognito_id = v_incog GROUP BY song_id
  ),
  mood_match AS (
    SELECT cm.song_id, SUM(cm.confidence * bm.weight) AS m
    FROM v_current_song_moods cm
    JOIN recommendation_batch_moods bm ON bm.mood_id = cm.mood_id AND bm.batch_id = p_batch_id
    GROUP BY cm.song_id
  ),
  mood_pref AS (                    -- user's learned mood taste projected onto each song
    SELECT cm.song_id, SUM(cm.confidence * ump.blended_score) / SUM(cm.confidence) AS m
    FROM v_current_song_moods cm
    JOIN user_mood_preferences ump ON ump.mood_id = cm.mood_id AND ump.user_id = v_user
    GROUP BY cm.song_id
  ),
  ctx_match AS (
    SELECT cm.song_id, SUM(cm.confidence * cxm.weight) / (SELECT SUM(weight) FROM context_moods WHERE context_id = v_ctx) AS m
    FROM v_current_song_moods cm
    JOIN context_moods cxm ON cxm.mood_id = cm.mood_id AND cxm.context_id = v_ctx
    GROUP BY cm.song_id
  ),
  tmp_mem AS (                      -- incognito temporary memory (read-only view)
    SELECT dimension, ref_id, GREATEST(score, 0) / NULLIF(MAX(GREATEST(score, 0)) OVER (PARTITION BY dimension), 0) AS s
    FROM v_incognito_memory WHERE incognito_id = v_incog
  ),
  trend AS (
    SELECT entity_id AS song_id, momentum_rank FROM trend_snapshots
    WHERE job_id = v_trend_job AND window_code = '7D' AND entity_type = 'SONG' AND region_code IS NULL
  ),
  scored AS (
    SELECT c.song_id, c.artist_id, c.genre_id,
      CASE WHEN v_mood_total > 0 THEN LEAST(1, COALESCE(mm.m, 0) / v_mood_total) END AS f_mood,
      ( 0.30 * fn_unit_similarity(c.energy, v_te) + 0.30 * fn_unit_similarity(c.valence, v_tv)
      + 0.10 * fn_unit_similarity(c.danceability, v_td) + 0.10 * fn_unit_similarity(c.acousticness, v_ta)
      + 0.10 * fn_unit_similarity(c.instrumentalness, v_ti) + 0.10 * fn_tempo_fit(c.tempo_bpm, v_tmin, v_tmax) )
      * CASE WHEN c.speechiness <= v_maxsp THEN 1 ELSE GREATEST(0, 1 - (c.speechiness - v_maxsp) * 2) END AS f_audio,
      ( 0.45 * COALESCE(ugp.blended_score, 0) + 0.30 * COALESCE(uap.blended_score, 0) + 0.25 * COALESCE(mp.m, 0) ) AS pref_perm,
      CASE WHEN v_incog IS NULL THEN NULL
           ELSE 0.45 * COALESCE(tg.s, 0) + 0.30 * COALESCE(ta.s, 0) + 0.25 * COALESCE(tmood.s, 0) END AS pref_temp,
      r.rating,
      CASE WHEN v_recent_n >= 2
           THEN fn_feature_similarity(c.energy, c.valence, c.danceability, c.acousticness, c.instrumentalness,
                                      v_re, v_rv, v_rd, v_ra, v_ri) END AS f_recency,
      CASE WHEN tr.song_id IS NULL OR v_trend_n < 2 THEN 0
           ELSE 1 - (tr.momentum_rank - 1) / (v_trend_n - 1) END AS f_trend,
      CASE WHEN v_ctx IS NULL THEN NULL
           ELSE 0.5 * LEAST(1, COALESCE(cxm.m, 0))
              + 0.5 * ( fn_unit_similarity(c.energy, v_te) + fn_unit_similarity(c.instrumentalness, v_ti)
                      + fn_tempo_fit(c.tempo_bpm, v_tmin, v_tmax) + IF(c.speechiness <= v_maxsp, 1, 0) ) / 4 END AS f_context,
      CASE WHEN v_has_lang = 0 AND v_region IS NULL THEN NULL
           ELSE LEAST(1,
                  CASE WHEN c.language_id IS NULL THEN 0.5
                       WHEN ul.priority = 1 THEN 1.0 WHEN ul.priority = 2 THEN 0.85 WHEN ul.priority IS NOT NULL THEN 0.7
                       ELSE 0.1 END
                + CASE WHEN v_region IS NOT NULL AND c.artist_region = v_region THEN 0.25 ELSE 0 END) END AS f_regional,
      CASE WHEN us.song_id IS NOT NULL OR isg.song_id IS NOT NULL THEN 0
           WHEN ua.artist_id IS NULL THEN 1 ELSE 0.6 END AS f_explore,
      LEAST(1, 0.7 * LEAST(1, (COALESCE(us.plays_7d, 0) + COALESCE(isg.plays, 0)) / 4)
             + 0.3 * COALESCE((COALESCE(us.skips, 0) + COALESCE(isg.skips, 0)) / NULLIF(COALESCE(us.plays, 0) + COALESCE(isg.plays, 0), 0), 0)) AS f_repeat
    FROM v_recommendation_candidates c
    LEFT JOIN mood_match mm ON mm.song_id = c.song_id
    LEFT JOIN mood_pref mp ON mp.song_id = c.song_id
    LEFT JOIN ctx_match cxm ON cxm.song_id = c.song_id
    LEFT JOIN user_genre_preferences ugp ON ugp.user_id = v_user AND ugp.genre_id = c.genre_id
    LEFT JOIN user_artist_preferences uap ON uap.user_id = v_user AND uap.artist_id = c.artist_id
    LEFT JOIN tmp_mem tg ON tg.dimension = 'GENRE' AND tg.ref_id = c.genre_id
    LEFT JOIN tmp_mem ta ON ta.dimension = 'ARTIST' AND ta.ref_id = c.artist_id
    LEFT JOIN (SELECT cm.song_id, SUM(cm.confidence * t.s) / SUM(cm.confidence) AS s
                 FROM v_current_song_moods cm JOIN tmp_mem t ON t.dimension = 'MOOD' AND t.ref_id = cm.mood_id
                GROUP BY cm.song_id) tmood ON tmood.song_id = c.song_id
    LEFT JOIN ratings r ON r.user_id = v_user AND r.song_id = c.song_id
    LEFT JOIN user_languages ul ON ul.user_id = v_user AND ul.language_id = c.language_id
    LEFT JOIN user_song us ON us.song_id = c.song_id
    LEFT JOIN incog_song isg ON isg.song_id = c.song_id
    LEFT JOIN user_artist ua ON ua.artist_id = c.artist_id
    LEFT JOIN trend tr ON tr.song_id = c.song_id
    WHERE (v_filter = 'OFF' OR (c.explicit = 0 AND (v_filter = 'NO_EXPLICIT' OR c.content_rating = 'ALL')))
      AND (v_disc = 0 OR (us.song_id IS NULL AND isg.song_id IS NULL))
      AND (v_seed IS NULL OR c.song_id <> v_seed)
      AND (v_lang IS NULL OR c.language_id = v_lang)
      AND (r.rating IS NULL OR r.rating > 1)                       -- 1 star = never again
      AND (v_excl_hours <= 0 OR us.last_played IS NULL OR us.last_played < NOW() - INTERVAL v_excl_hours HOUR)
  ),
  combined AS (
    SELECT s.*,
      -- ratings refine the learned preference; incognito blends in the session's own taste
      CASE WHEN rating IS NULL THEN COALESCE((pref_perm + pref_temp) / 2, pref_perm)
           ELSE 0.6 * COALESCE((pref_perm + pref_temp) / 2, pref_perm) + 0.4 * (rating - 1) / 4 END AS f_pref
    FROM scored s
  ),
  weighted AS (
    SELECT c.*,
      ( IF(f_mood IS NULL, 0, v_w_mood * f_mood) + v_w_audio * f_audio + v_w_pref * f_pref
      + IF(f_recency IS NULL, 0, v_w_rec * f_recency) + v_w_trend * f_trend
      + IF(f_context IS NULL, 0, v_w_ctx * f_context) + IF(f_regional IS NULL, 0, v_w_reg * f_regional)
      + v_w_exp * f_explore )
      / NULLIF( IF(f_mood IS NULL, 0, v_w_mood) + v_w_audio + v_w_pref + IF(f_recency IS NULL, 0, v_w_rec) + v_w_trend
              + IF(f_context IS NULL, 0, v_w_ctx) + IF(f_regional IS NULL, 0, v_w_reg) + v_w_exp, 0)
      - v_w_rep * f_repeat AS raw_score
    FROM combined c
  ),
  diversified AS (
    SELECT w.*, LEAST(1, GREATEST(0, raw_score)) AS score,
           ROW_NUMBER() OVER (PARTITION BY artist_id ORDER BY raw_score DESC, song_id) AS artist_slot,
           ROW_NUMBER() OVER (PARTITION BY genre_id  ORDER BY raw_score DESC, song_id) AS genre_slot
    FROM weighted w
  ),
  ranked AS (
    SELECT d.*, ROW_NUMBER() OVER (ORDER BY score DESC, song_id) AS rn
    FROM diversified d
    WHERE artist_slot <= v_artist_cap AND genre_slot <= v_genre_cap
  )
  SELECT p_batch_id, song_id, rn, ROUND(score, 4), ROUND(f_mood, 4), ROUND(f_audio, 4), ROUND(f_pref, 4),
         ROUND(f_recency, 4), ROUND(f_trend, 4), ROUND(f_context, 4), ROUND(f_regional, 4), ROUND(f_explore, 4),
         ROUND(v_w_rep * f_repeat, 4)
  FROM ranked WHERE rn <= p_limit;

  -- ---------------- reasons: only from signals that are really there ----
  INSERT INTO recommendation_reasons (batch_id, song_id, reason_code, strength, params)
  WITH items AS (
    SELECT ri.*, s.primary_artist_id AS artist_id, sg.genre_id, s.language_id,
           a.name AS artist_name, g.name AS genre_name, l.name AS language_name, af.tempo_bpm
    FROM recommendation_items ri
    JOIN songs s ON s.song_id = ri.song_id
    JOIN artists a ON a.artist_id = s.primary_artist_id
    JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
    JOIN genres g ON g.genre_id = sg.genre_id
    LEFT JOIN languages l ON l.language_id = s.language_id
    LEFT JOIN audio_features af ON af.song_id = s.song_id AND af.is_current = 1
    WHERE ri.batch_id = p_batch_id
  ),
  genre_rank AS (
    SELECT genre_id, plays, blended_score, onboarding_weight,
           RANK() OVER (ORDER BY blended_score DESC) AS rnk
    FROM user_genre_preferences WHERE user_id = v_user
  ),
  artist_rank AS (
    SELECT artist_id, plays, replays, blended_score, RANK() OVER (ORDER BY blended_score DESC) AS rnk
    FROM user_artist_preferences WHERE user_id = v_user
  ),
  artist_week AS (
    SELECT s.primary_artist_id AS artist_id, COUNT(*) AS n
    FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
    WHERE lh.user_id = v_user AND lh.skipped = 0 AND lh.started_at >= NOW() - INTERVAL 7 DAY
    GROUP BY s.primary_artist_id
  ),
  replay_mood_lang AS (             -- "you replay energetic Telugu tracks"
    SELECT pm.mood_id, pm.mood_name, s.language_id, COUNT(*) AS n
    FROM listening_history lh
    JOIN songs s ON s.song_id = lh.song_id
    JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
    WHERE lh.user_id = v_user AND lh.is_replay = 1 AND s.language_id IS NOT NULL
    GROUP BY pm.mood_id, pm.mood_name, s.language_id
  ),
  top_req_mood AS (
    SELECT cm.song_id, cm.mood_name,
           ROW_NUMBER() OVER (PARTITION BY cm.song_id ORDER BY cm.confidence * bm.weight DESC) AS rn
    FROM v_current_song_moods cm
    JOIN recommendation_batch_moods bm ON bm.batch_id = p_batch_id AND bm.mood_id = cm.mood_id
  ),
  regional_pop AS (
    SELECT lh.song_id, COUNT(*) AS n
    FROM listening_history lh JOIN user_profiles up ON up.user_id = lh.user_id
    WHERE up.region_code = v_region AND lh.user_id <> v_user AND lh.skipped = 0
      AND lh.started_at >= NOW() - INTERVAL 30 DAY
    GROUP BY lh.song_id
  ),
  trend_info AS (
    SELECT entity_id AS song_id, velocity_pct, momentum_rank FROM trend_snapshots
    WHERE job_id = v_trend_job AND window_code = '7D' AND entity_type = 'SONG' AND region_code IS NULL
  )
  SELECT i.batch_id, i.song_id, 'MOOD_MATCH', i.mood_score, JSON_OBJECT('mood', t.mood_name)
    FROM items i JOIN top_req_mood t ON t.song_id = i.song_id AND t.rn = 1 WHERE i.mood_score >= 0.45
  UNION ALL
  SELECT i.batch_id, i.song_id, 'AUDIO_FIT', i.audio_score * 0.9, JSON_OBJECT()
    FROM items i WHERE i.audio_score >= 0.88
  UNION ALL
  SELECT i.batch_id, i.song_id, 'CONTEXT_FIT', i.context_score,
         JSON_OBJECT('context', (SELECT LOWER(name) FROM contexts WHERE context_id = v_ctx), 'bpm', ROUND(i.tempo_bpm))
    FROM items i WHERE i.context_score >= 0.6
  UNION ALL
  SELECT i.batch_id, i.song_id, 'REPLAYED_MOOD_LANGUAGE', LEAST(1, 0.6 + rml.n * 0.08),
         JSON_OBJECT('mood', LOWER(rml.mood_name), 'language', i.language_name, 'count', rml.n)
    FROM items i
    JOIN v_song_primary_mood pm ON pm.song_id = i.song_id
    JOIN replay_mood_lang rml ON rml.mood_id = pm.mood_id AND rml.language_id = i.language_id
   WHERE rml.n >= 2
  UNION ALL
  SELECT i.batch_id, i.song_id, 'FAVORITE_GENRE', gr.blended_score, JSON_OBJECT('genre', i.genre_name, 'count', gr.plays)
    FROM items i JOIN genre_rank gr ON gr.genre_id = i.genre_id WHERE gr.rnk <= 3 AND gr.plays >= 3
  UNION ALL
  SELECT i.batch_id, i.song_id, 'ARTIST_THIS_WEEK', LEAST(1, 0.55 + aw.n * 0.05), JSON_OBJECT('artist', i.artist_name, 'count', aw.n)
    FROM items i JOIN artist_week aw ON aw.artist_id = i.artist_id WHERE aw.n >= 3
  UNION ALL
  SELECT i.batch_id, i.song_id, 'FAVORITE_ARTIST', ar.blended_score * 0.9, JSON_OBJECT('artist', i.artist_name, 'count', ar.plays)
    FROM items i JOIN artist_rank ar ON ar.artist_id = i.artist_id
   WHERE ar.rnk <= 5 AND ar.plays >= 2
     AND NOT EXISTS (SELECT 1 FROM artist_week aw WHERE aw.artist_id = i.artist_id AND aw.n >= 3)
  UNION ALL
  SELECT i.batch_id, i.song_id, 'RATED_HIGH', r.rating / 5, JSON_OBJECT('rating', r.rating)
    FROM items i JOIN ratings r ON r.user_id = v_user AND r.song_id = i.song_id WHERE r.rating >= 4
  UNION ALL
  SELECT i.batch_id, i.song_id, 'SIMILAR_RECENT', i.recency_score * 0.85, JSON_OBJECT('count', v_recent_n)
    FROM items i WHERE i.recency_score >= 0.85 AND v_incog IS NULL
  UNION ALL
  SELECT i.batch_id, i.song_id, 'SIMILAR_SEED', i.audio_score, JSON_OBJECT('seed', v_seed_title)
    FROM items i WHERE v_seed IS NOT NULL AND i.audio_score >= 0.8
  UNION ALL
  SELECT i.batch_id, i.song_id, 'TRENDING', LEAST(1, 0.5 + ti.velocity_pct / 400), JSON_OBJECT('pct', ROUND(ti.velocity_pct))
    FROM items i JOIN trend_info ti ON ti.song_id = i.song_id WHERE ti.momentum_rank <= 10 AND ti.velocity_pct > 0
  UNION ALL
  SELECT i.batch_id, i.song_id, 'LANGUAGE_PICK', 0.5 + 0.1 * (4 - LEAST(ul.priority, 3)), JSON_OBJECT('language', i.language_name)
    FROM items i JOIN user_languages ul ON ul.user_id = v_user AND ul.language_id = i.language_id
  UNION ALL
  SELECT i.batch_id, i.song_id, 'REGIONAL_POPULAR', LEAST(1, 0.4 + rp.n * 0.05),
         JSON_OBJECT('region', (SELECT name FROM regions WHERE region_code = v_region), 'count', rp.n)
    FROM items i JOIN regional_pop rp ON rp.song_id = i.song_id WHERE rp.n >= 3
  UNION ALL
  SELECT i.batch_id, i.song_id, 'NEW_DISCOVERY', i.exploration_score * 0.7, JSON_OBJECT('artist', i.artist_name)
    FROM items i WHERE i.exploration_score >= 1
  UNION ALL
  SELECT i.batch_id, i.song_id, 'SESSION_TASTE', 0.75, JSON_OBJECT('genre', i.genre_name)
    FROM items i
    JOIN v_incognito_memory vm ON vm.incognito_id = v_incog AND vm.dimension = 'GENRE' AND vm.ref_id = i.genre_id AND vm.score > 0
  UNION ALL
  SELECT i.batch_id, i.song_id, 'ONBOARDING_PICK', 0.55, JSON_OBJECT('genre', i.genre_name)
    FROM items i JOIN genre_rank gr ON gr.genre_id = i.genre_id WHERE gr.onboarding_weight >= 0.5 AND gr.plays < 3;

  -- the ranked list with its explanation, as the API returns it
  SELECT ri.*, sc.*,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT('code', e.reason_code, 'text', e.reason_text, 'strength', e.strength))
            FROM v_recommendation_explanations e
           WHERE e.batch_id = ri.batch_id AND e.song_id = ri.song_id AND e.reason_rank <= 3) AS reasons
  FROM recommendation_items ri
  JOIN v_song_catalog sc ON sc.song_id = ri.song_id
  WHERE ri.batch_id = p_batch_id
  ORDER BY ri.rank_position;
END$$

-- ---------------------------------------------------------------------
-- TREND SNAPSHOT: current window vs the previous window of equal length,
-- for songs, artists, genres, moods and languages; overall and per region.
--   momentum = current plays x (1 + clamped growth)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_generate_trend_snapshot(IN p_job_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_hours INT;
  DECLARE v_code VARCHAR(4);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE job_id = p_job_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pipeline job not found';
  END IF;

  START TRANSACTION;
  DELETE FROM trend_snapshots WHERE job_id = p_job_id;            -- safe to rerun
  WHILE v_i < 3 DO
    SET v_hours = ELT(v_i + 1, 24, 168, 720);
    SET v_code  = ELT(v_i + 1, '24H', '7D', '30D');

    INSERT INTO trend_snapshots (job_id, window_code, entity_type, entity_id, region_code,
                                 curr_plays, prev_plays, curr_listeners, velocity_pct, momentum_rank)
    WITH plays AS (
      SELECT lh.user_id, lh.song_id, s.primary_artist_id, sg.genre_id, pm.mood_id, s.language_id, up.region_code,
             (lh.started_at >= NOW() - INTERVAL v_hours HOUR) AS is_curr
      FROM listening_history lh
      JOIN songs s ON s.song_id = lh.song_id
      JOIN user_profiles up ON up.user_id = lh.user_id
      LEFT JOIN song_genres sg ON sg.song_id = lh.song_id AND sg.is_primary = 1
      LEFT JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
      WHERE lh.skipped = 0 AND lh.started_at >= NOW() - INTERVAL (2 * v_hours) HOUR
    ),
    ev AS (
      SELECT 'SONG' AS et, song_id AS eid, user_id, region_code, is_curr FROM plays
      UNION ALL SELECT 'ARTIST', primary_artist_id, user_id, region_code, is_curr FROM plays
      UNION ALL SELECT 'GENRE', genre_id, user_id, region_code, is_curr FROM plays WHERE genre_id IS NOT NULL
      UNION ALL SELECT 'MOOD', mood_id, user_id, region_code, is_curr FROM plays WHERE mood_id IS NOT NULL
      UNION ALL SELECT 'LANGUAGE', language_id, user_id, region_code, is_curr FROM plays WHERE language_id IS NOT NULL
    ),
    scoped AS (                       -- every event counts overall (NULL) and in its listener's region
      SELECT et, eid, user_id, NULL AS region_code, is_curr FROM ev
      UNION ALL
      SELECT et, eid, user_id, region_code, is_curr FROM ev WHERE region_code IS NOT NULL
    ),
    agg AS (
      SELECT et, eid, region_code, SUM(is_curr) AS curr, SUM(1 - is_curr) AS prev,
             COUNT(DISTINCT CASE WHEN is_curr = 1 THEN user_id END) AS listeners
      FROM scoped GROUP BY et, eid, region_code
    )
    SELECT p_job_id, v_code, et, eid, region_code, curr, prev, listeners,
           CASE WHEN prev = 0 THEN NULL ELSE ROUND(100 * (curr - prev) / prev, 2) END,
           RANK() OVER (PARTITION BY et, region_code
                        ORDER BY curr * (1 + LEAST(3, GREATEST(-1, COALESCE((curr - prev) / NULLIF(prev, 0), 1)))) DESC, listeners DESC)
    FROM agg WHERE curr > 0;

    SET v_i = v_i + 1;
  END WHILE;
  COMMIT;
  SELECT window_code, entity_type, COUNT(*) AS entities FROM trend_snapshots WHERE job_id = p_job_id GROUP BY window_code, entity_type;
END$$

-- ---------------------------------------------------------------------
-- INCOGNITO CLEANUP
-- 1. ACTIVE sessions past expiry become EXPIRED.
-- 2. Ended/expired sessions lose ALL their content immediately: listening
--    events and any recommendation batches made inside them.
-- 3. The empty session header (start/end time only) is deleted after 30 days.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_cleanup_expired_incognito()
BEGIN
  DECLARE v_expired, v_events, v_batches, v_headers INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    UPDATE incognito_sessions SET status = 'EXPIRED', ended_at = NOW()
     WHERE status = 'ACTIVE' AND expires_at <= NOW();
    SET v_expired = ROW_COUNT();

    DELETE e FROM incognito_events e JOIN incognito_sessions i ON i.incognito_id = e.incognito_id
     WHERE i.status IN ('ENDED', 'EXPIRED');
    SET v_events = ROW_COUNT();

    DELETE b FROM recommendation_batches b JOIN incognito_sessions i ON i.incognito_id = b.incognito_id
     WHERE i.status IN ('ENDED', 'EXPIRED')
       AND NOT EXISTS (SELECT 1 FROM weekly_worlds w WHERE w.batch_id = b.batch_id);
    SET v_batches = ROW_COUNT();

    DELETE FROM incognito_sessions WHERE status IN ('ENDED', 'EXPIRED') AND ended_at < NOW() - INTERVAL 30 DAY;
    SET v_headers = ROW_COUNT();
  COMMIT;
  SELECT v_expired AS sessions_expired, v_events AS events_deleted, v_batches AS batches_deleted, v_headers AS headers_deleted;
END$$

-- ---------------------------------------------------------------------
-- MUSE WORLD ROLLBACK: re-activate the previous version of this week's world.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_rollback_world(IN p_user_id INT UNSIGNED, IN p_week_start DATE)
BEGIN
  DECLARE v_active BIGINT UNSIGNED;
  DECLARE v_active_ver SMALLINT UNSIGNED;
  DECLARE v_prev BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
    SELECT world_id, version INTO v_active, v_active_ver FROM weekly_worlds
     WHERE user_id = p_user_id AND week_start = p_week_start AND status = 'ACTIVE' FOR UPDATE;
    IF v_active IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active world for that week';
    END IF;
    SELECT world_id INTO v_prev FROM weekly_worlds
     WHERE user_id = p_user_id AND week_start = p_week_start AND version < v_active_ver AND status = 'SUPERSEDED'
     ORDER BY version DESC LIMIT 1 FOR UPDATE;
    IF v_prev IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'There is no earlier version to roll back to';
    END IF;
    -- deactivate first: the unique active_key never sees two ACTIVE rows
    UPDATE weekly_worlds SET status = 'ROLLED_BACK' WHERE world_id = v_active;
    UPDATE weekly_worlds SET status = 'ACTIVE' WHERE world_id = v_prev;
  COMMIT;
  SELECT world_id, version, status FROM weekly_worlds
   WHERE user_id = p_user_id AND week_start = p_week_start ORDER BY version;
END$$

-- ---------------------------------------------------------------------
-- CANONICALISATION: merge a duplicate song into its canonical record.
-- Moves behaviour, feedback, playlists and provenance; keeps the duplicate
-- row as MERGED (with a pointer) so nothing is silently lost.
-- ---------------------------------------------------------------------
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

    INSERT IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at)
    SELECT playlist_id, p_canonical_id, position, added_at FROM playlist_songs WHERE song_id = p_duplicate_id;
    DELETE FROM playlist_songs WHERE song_id = p_duplicate_id;

    UPDATE source_records SET song_id = p_canonical_id, match_method = 'MANUAL', match_confidence = 1
     WHERE song_id = p_duplicate_id;
    UPDATE songs SET status = 'MERGED', merged_into_song_id = p_canonical_id WHERE song_id = p_duplicate_id;
  COMMIT;
  SELECT p_duplicate_id AS merged_song_id, p_canonical_id AS canonical_song_id;
END$$

-- ---------------------------------------------------------------------
-- Listening summary for the profile page (several result sets).
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_user_listening_summary(IN p_user_id INT UNSIGNED, IN p_days INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Days must be between 1 and 365';
  END IF;

  -- 1. headline profile
  SELECT * FROM v_user_music_profile WHERE user_id = p_user_id;

  -- 2. most replayed and most skipped song in the window
  (SELECT 'MOST_REPLAYED' AS kind, sc.song_id, sc.title, sc.artist_name, SUM(lh.is_replay) AS n
     FROM listening_history lh JOIN v_song_catalog sc ON sc.song_id = lh.song_id
    WHERE lh.user_id = p_user_id AND lh.started_at >= NOW() - INTERVAL p_days DAY
    GROUP BY sc.song_id, sc.title, sc.artist_name HAVING SUM(lh.is_replay) > 0
    ORDER BY n DESC, sc.song_id LIMIT 1)
  UNION ALL
  (SELECT 'MOST_SKIPPED', sc.song_id, sc.title, sc.artist_name, SUM(lh.skipped)
     FROM listening_history lh JOIN v_song_catalog sc ON sc.song_id = lh.song_id
    WHERE lh.user_id = p_user_id AND lh.started_at >= NOW() - INTERVAL p_days DAY
    GROUP BY sc.song_id, sc.title, sc.artist_name HAVING SUM(lh.skipped) > 0
    ORDER BY 5 DESC, sc.song_id LIMIT 1);

  -- 3. recent vs earlier window (recent trend)
  SELECT
    SUM(started_at >= NOW() - INTERVAL 7 DAY)                                        AS plays_last_7d,
    SUM(started_at <  NOW() - INTERVAL 7 DAY AND started_at >= NOW() - INTERVAL 14 DAY) AS plays_prev_7d,
    ROUND(SUM(IF(started_at >= NOW() - INTERVAL 7 DAY, listened_sec, 0)) / 60)       AS minutes_last_7d,
    ROUND(SUM(IF(started_at < NOW() - INTERVAL 7 DAY AND started_at >= NOW() - INTERVAL 14 DAY, listened_sec, 0)) / 60) AS minutes_prev_7d
  FROM listening_history WHERE user_id = p_user_id;
END$$

DELIMITER ;

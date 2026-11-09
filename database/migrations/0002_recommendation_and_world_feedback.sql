-- =====================================================================
--  0002 — explicit feedback on recommendations and on MUSE Worlds
--
--  * song_dismissals: "Not for me" on a recommended song. The song never
--    appears in that listener's generated lists again (like a 1★ rating, but
--    without rating it). Kept separate from ratings because it is a statement
--    about recommendations, not about the song's quality. batch_id records which
--    list it was dismissed from, for analysis.
--  * world_feedback: LOVE / NOT_FOR_ME on a weekly world. The world generator
--    boosts or penalises that archetype for the following weeks (WORLD model
--    parameters feedback_love_boost / feedback_dismiss_penalty / feedback_weeks).
--  * sp_generate_recommendations and sp_merge_songs are re-created to honour
--    dismissals (copied from the baseline with only those additions).
-- =====================================================================

CREATE TABLE IF NOT EXISTS song_dismissals (
  user_id       INT UNSIGNED    NOT NULL,
  song_id       INT UNSIGNED    NOT NULL,
  batch_id      BIGINT UNSIGNED NULL,
  dismissed_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, song_id),
  KEY idx_dismiss_song (song_id),
  KEY idx_dismiss_batch (batch_id),
  CONSTRAINT fk_dismiss_user  FOREIGN KEY (user_id)  REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_dismiss_song  FOREIGN KEY (song_id)  REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_dismiss_batch FOREIGN KEY (batch_id) REFERENCES recommendation_batches (batch_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS world_feedback (
  user_id      INT UNSIGNED    NOT NULL,
  world_id     BIGINT UNSIGNED NOT NULL,
  feedback     ENUM('LOVE','NOT_FOR_ME') NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, world_id),
  KEY idx_wf_world (world_id),
  CONSTRAINT fk_wf_user  FOREIGN KEY (user_id)  REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_wf_world FOREIGN KEY (world_id) REFERENCES weekly_worlds (world_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- feedback weights live with the other WORLD model parameters (bounded, audited, tunable in Admin › Models)
INSERT IGNORE INTO model_parameters (model_id, param_code, param_value, min_value, max_value, description)
SELECT model_id, 'feedback_love_boost', 0.15, 0, 1, 'Added to an archetype the listener marked LOVE in recent weeks'
  FROM intelligence_models WHERE kind = 'WORLD';
INSERT IGNORE INTO model_parameters (model_id, param_code, param_value, min_value, max_value, description)
SELECT model_id, 'feedback_dismiss_penalty', 0.40, 0, 2, 'Subtracted from an archetype the listener marked NOT_FOR_ME in recent weeks'
  FROM intelligence_models WHERE kind = 'WORLD';
INSERT IGNORE INTO model_parameters (model_id, param_code, param_value, min_value, max_value, description)
SELECT model_id, 'feedback_weeks', 6, 1, 26, 'How many weeks of world feedback are taken into account'
  FROM intelligence_models WHERE kind = 'WORLD';

DROP PROCEDURE IF EXISTS sp_generate_recommendations;
DROP PROCEDURE IF EXISTS sp_merge_songs;
DELIMITER $$
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
      AND NOT EXISTS (SELECT 1 FROM song_dismissals sd               -- "not for me" = never again in lists
                       WHERE sd.user_id = v_user AND sd.song_id = c.song_id)
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

GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_dismissals TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.world_feedback TO '__APP_USER__'@'__APP_HOST__';

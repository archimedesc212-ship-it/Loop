-- =====================================================================
--  MUSE — 02_functions.sql
--  Small DETERMINISTIC helpers. They hold arithmetic that would otherwise
--  be copy-pasted into many queries; business decisions stay in procedures
--  and the service layer.
-- =====================================================================

DROP FUNCTION IF EXISTS fn_normalize_text;
DROP FUNCTION IF EXISTS fn_completion_pct;
DROP FUNCTION IF EXISTS fn_decay;
DROP FUNCTION IF EXISTS fn_unit_similarity;
DROP FUNCTION IF EXISTS fn_feature_similarity;
DROP FUNCTION IF EXISTS fn_tempo_fit;
DROP FUNCTION IF EXISTS fn_mood_fit;
DROP FUNCTION IF EXISTS fn_nearest_mood;
DROP FUNCTION IF EXISTS fn_week_start;
DROP FUNCTION IF EXISTS fn_model_param;
DROP FUNCTION IF EXISTS fn_active_model;

DELIMITER $$

-- Same normalisation as the generated normalized_* columns, for search input.
CREATE FUNCTION fn_normalize_text(p_text VARCHAR(300)) RETURNS VARCHAR(300)
DETERMINISTIC NO SQL
BEGIN
  RETURN TRIM(REGEXP_REPLACE(LOWER(COALESCE(p_text, '')), '[!-/:-@\\[-`{-~—–‘’“”[:space:]]+', ' '));
END$$

-- Percentage of a song actually heard, capped to 0..100.
CREATE FUNCTION fn_completion_pct(p_listened INT, p_duration INT) RETURNS DECIMAL(5,2)
DETERMINISTIC NO SQL
BEGIN
  IF p_duration IS NULL OR p_duration <= 0 THEN RETURN 0; END IF;
  RETURN LEAST(100, GREATEST(0, ROUND(100 * p_listened / p_duration, 2)));
END$$

-- Exponential time decay: weight of an event that is p_age_days old,
-- given a half-life. 1.0 today, 0.5 after one half-life, 0.25 after two.
CREATE FUNCTION fn_decay(p_age_days DOUBLE, p_half_life_days DOUBLE) RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  IF p_half_life_days <= 0 THEN RETURN 0; END IF;
  RETURN POW(0.5, GREATEST(p_age_days, 0) / p_half_life_days);
END$$

-- 1 - |a - b| for two values on a 0..1 scale.
CREATE FUNCTION fn_unit_similarity(p_a DOUBLE, p_b DOUBLE) RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  RETURN GREATEST(0, 1 - ABS(p_a - p_b));
END$$

-- Similarity of two sounds from five audio features (Euclidean, scaled to 0..1).
CREATE FUNCTION fn_feature_similarity(
  e1 DOUBLE, v1 DOUBLE, d1 DOUBLE, a1 DOUBLE, i1 DOUBLE,
  e2 DOUBLE, v2 DOUBLE, d2 DOUBLE, a2 DOUBLE, i2 DOUBLE) RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  RETURN GREATEST(0, 1 - SQRT(POW(e1 - e2, 2) * 1.6 + POW(v1 - v2, 2) * 1.6 + POW(d1 - d2, 2) * 0.6
                              + POW(a1 - a2, 2) * 0.6 + POW(i1 - i2, 2) * 0.6) / SQRT(5));
END$$

-- 1 inside the tempo band, falling linearly to 0 at 40 BPM outside it.
CREATE FUNCTION fn_tempo_fit(p_tempo DOUBLE, p_min DOUBLE, p_max DOUBLE) RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  IF p_tempo BETWEEN p_min AND p_max THEN RETURN 1; END IF;
  RETURN GREATEST(0, 1 - LEAST(ABS(p_tempo - p_min), ABS(p_tempo - p_max)) / 40);
END$$

-- How well a sound fits a mood's ideal profile (0..1). Energy and valence
-- dominate because they are the two axes of the circumplex mood model.
CREATE FUNCTION fn_mood_fit(
  e DOUBLE, v DOUBLE, d DOUBLE, a DOUBLE, i DOUBLE, t DOUBLE,
  te DOUBLE, tv DOUBLE, td DOUBLE, ta DOUBLE, ti DOUBLE, tmin DOUBLE, tmax DOUBLE) RETURNS DOUBLE
DETERMINISTIC NO SQL
BEGIN
  RETURN 0.32 * fn_unit_similarity(e, te) + 0.32 * fn_unit_similarity(v, tv)
       + 0.09 * fn_unit_similarity(d, td) + 0.09 * fn_unit_similarity(a, ta)
       + 0.08 * fn_unit_similarity(i, ti) + 0.10 * fn_tempo_fit(t, tmin, tmax);
END$$

-- Nearest mood on the energy/valence plane (used by segment analysis).
CREATE FUNCTION fn_nearest_mood(p_energy DOUBLE, p_valence DOUBLE) RETURNS SMALLINT UNSIGNED
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_mood SMALLINT UNSIGNED;
  SELECT mood_id INTO v_mood FROM moods
   ORDER BY POW(target_energy - p_energy, 2) + POW(target_valence - p_valence, 2), mood_id
   LIMIT 1;
  RETURN v_mood;
END$$

-- Monday of the week containing p_date (MUSE World weeks start on Monday).
CREATE FUNCTION fn_week_start(p_date DATE) RETURNS DATE
DETERMINISTIC NO SQL
BEGIN
  RETURN DATE_SUB(p_date, INTERVAL WEEKDAY(p_date) DAY);
END$$

-- A tunable number of a model version; raises an error if it is missing,
-- so a mistyped parameter can never silently become 0.
CREATE FUNCTION fn_model_param(p_model_id SMALLINT UNSIGNED, p_code VARCHAR(40)) RETURNS DECIMAL(10,4)
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v DECIMAL(10,4);
  DECLARE v_msg VARCHAR(120);
  SELECT param_value INTO v FROM model_parameters WHERE model_id = p_model_id AND param_code = p_code;
  IF v IS NULL THEN
    SET v_msg = CONCAT('Model parameter missing: ', p_code);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  RETURN v;
END$$

-- The active model of a kind ('MOOD', 'RECOMMENDER', ...).
CREATE FUNCTION fn_active_model(p_kind VARCHAR(20)) RETURNS SMALLINT UNSIGNED
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v SMALLINT UNSIGNED;
  SELECT model_id INTO v FROM intelligence_models WHERE kind = p_kind AND is_active = 1;
  IF v IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active model of this kind';
  END IF;
  RETURN v;
END$$

DELIMITER ;

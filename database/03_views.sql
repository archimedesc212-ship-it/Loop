-- =====================================================================
--  MUSE — 03_views.sql
--  Each view replaces a join or aggregation that more than one API
--  endpoint (or procedure) would otherwise repeat. The comment above each
--  says which queries it simplifies.
-- =====================================================================

-- Current audio analysis per song (the row flagged is_current).
-- Used by: catalogue, recommender, insights.
CREATE OR REPLACE VIEW v_current_audio_features AS
SELECT af.feature_id, af.song_id, af.model_id, im.version AS analysis_version, af.analyzed_at,
       af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness, af.speechiness,
       af.loudness_db, af.tempo_bpm, af.musical_key, af.mode
FROM audio_features af
JOIN intelligence_models im ON im.model_id = af.model_id
WHERE af.is_current = 1;

-- Song moods from the ACTIVE mood model only, ranked per song.
-- Older model versions stay in song_moods for comparison but never leak in here.
CREATE OR REPLACE VIEW v_current_song_moods AS
SELECT sm.song_id, sm.mood_id, m.name AS mood_name, m.emoji, m.color_hex, m.category_id,
       sm.confidence, sm.model_id, sm.feature_id, sm.analyzed_at,
       ROW_NUMBER() OVER (PARTITION BY sm.song_id ORDER BY sm.confidence DESC, sm.mood_id) AS mood_rank
FROM song_moods sm
JOIN intelligence_models im ON im.model_id = sm.model_id AND im.kind = 'MOOD' AND im.is_active = 1
JOIN moods m ON m.mood_id = sm.mood_id;

-- The single strongest mood of each song (Mood Journey uses this per play).
CREATE OR REPLACE VIEW v_song_primary_mood AS
SELECT song_id, mood_id, mood_name, emoji, color_hex, confidence
FROM v_current_song_moods
WHERE mood_rank = 1;

-- Everything a song card needs, in one row.
CREATE OR REPLACE VIEW v_song_catalog AS
SELECT
  s.song_id, s.title, s.version_label, s.status, s.duration_sec, s.release_year, s.explicit,
  s.content_rating, s.popularity, s.isrc,
  a.artist_id, a.name AS artist_name, a.region_code AS artist_region,
  al.album_id, al.title AS album_title, al.album_type, f.title AS film_title,
  COALESCE(al.cover_color_1, g.color_hex) AS cover_color_1,
  COALESCE(al.cover_color_2, '#1F1B2E')   AS cover_color_2,
  l.language_id, COALESCE(l.name, 'Instrumental') AS language_name,
  g.genre_id, g.name AS genre_name, g.color_hex AS genre_color,
  caf.energy, caf.valence, caf.danceability, caf.acousticness, caf.instrumentalness,
  caf.speechiness, caf.loudness_db, caf.tempo_bpm, caf.musical_key, caf.mode, caf.analysis_version,
  (SELECT GROUP_CONCAT(cm.mood_name ORDER BY cm.mood_rank SEPARATOR ',')
     FROM v_current_song_moods cm WHERE cm.song_id = s.song_id AND cm.mood_rank <= 3) AS mood_tags
FROM songs s
JOIN artists a ON a.artist_id = s.primary_artist_id
LEFT JOIN albums al ON al.album_id = s.album_id
LEFT JOIN films f   ON f.film_id = al.film_id
LEFT JOIN languages l ON l.language_id = s.language_id
LEFT JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
LEFT JOIN genres g ON g.genre_id = sg.genre_id
LEFT JOIN v_current_audio_features caf ON caf.song_id = s.song_id;

-- What the recommender may consider: active, analysed, with a primary genre.
-- One place to change eligibility rules.
CREATE OR REPLACE VIEW v_recommendation_candidates AS
SELECT s.song_id, s.primary_artist_id AS artist_id, sg.genre_id, s.language_id, s.explicit, s.content_rating,
       s.popularity, s.duration_sec, a.region_code AS artist_region,
       af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness, af.speechiness, af.tempo_bpm
FROM songs s
JOIN artists a ON a.artist_id = s.primary_artist_id
JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
JOIN audio_features af ON af.song_id = s.song_id AND af.is_current = 1
WHERE s.status = 'ACTIVE';

-- Aggregate listening and feedback per song.
CREATE OR REPLACE VIEW v_song_stats AS
SELECT s.song_id,
       COALESCE(lh.plays, 0) AS plays, COALESCE(lh.listeners, 0) AS listeners,
       COALESCE(lh.completes, 0) AS completes, COALESCE(lh.skips, 0) AS skips, COALESCE(lh.replays, 0) AS replays,
       (SELECT COUNT(*) FROM user_likes ul WHERE ul.song_id = s.song_id) AS likes,
       (SELECT ROUND(AVG(r.rating), 2) FROM ratings r WHERE r.song_id = s.song_id) AS avg_rating,
       (SELECT COUNT(*) FROM ratings r WHERE r.song_id = s.song_id) AS rating_count
FROM songs s
LEFT JOIN (
  SELECT song_id, COUNT(*) AS plays, COUNT(DISTINCT user_id) AS listeners,
         SUM(completed) AS completes, SUM(skipped) AS skips, SUM(is_replay) AS replays
  FROM listening_history GROUP BY song_id
) lh ON lh.song_id = s.song_id;

-- One row per user: the headline numbers of the Listening Profile.
CREATE OR REPLACE VIEW v_user_music_profile AS
WITH plays AS (
  SELECT lh.user_id, lh.song_id, lh.listened_sec, lh.completed, lh.skipped, lh.is_replay, lh.started_at,
         af.energy, af.tempo_bpm, s.duration_sec
  FROM listening_history lh
  JOIN songs s ON s.song_id = lh.song_id
  LEFT JOIN audio_features af ON af.song_id = lh.song_id AND af.is_current = 1
),
hours AS (
  SELECT user_id, HOUR(started_at) AS hr, COUNT(*) AS n,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC, HOUR(started_at)) AS rn
  FROM plays GROUP BY user_id, HOUR(started_at)
),
dom_mood AS (
  SELECT p.user_id, pm.mood_name, COUNT(*) AS n,
         ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY COUNT(*) DESC, pm.mood_name) AS rn
  FROM plays p JOIN v_song_primary_mood pm ON pm.song_id = p.song_id
  WHERE p.skipped = 0
  GROUP BY p.user_id, pm.mood_name
)
SELECT
  u.user_id, up.display_name,
  COUNT(p.song_id)                                   AS total_plays,
  ROUND(COALESCE(SUM(p.listened_sec), 0) / 60)       AS minutes_listened,
  COUNT(DISTINCT p.song_id)                          AS unique_songs,
  COUNT(DISTINCT DATE(p.started_at))                 AS active_days,
  ROUND(100 * AVG(p.completed), 1)                   AS completion_rate,
  ROUND(100 * AVG(p.skipped), 1)                     AS skip_rate,
  ROUND(100 * AVG(p.is_replay), 1)                   AS replay_rate,
  ROUND(AVG(CASE WHEN p.skipped = 0 THEN p.energy END), 3)    AS avg_energy,
  ROUND(AVG(CASE WHEN p.skipped = 0 THEN p.tempo_bpm END), 1) AS avg_tempo,
  ROUND(AVG(p.duration_sec))                          AS avg_song_duration_sec,
  (SELECT h.hr FROM hours h WHERE h.user_id = u.user_id AND h.rn = 1)          AS peak_hour,
  (SELECT d.mood_name FROM dom_mood d WHERE d.user_id = u.user_id AND d.rn = 1) AS dominant_mood,
  (SELECT g.name FROM user_genre_preferences x JOIN genres g ON g.genre_id = x.genre_id
    WHERE x.user_id = u.user_id ORDER BY x.blended_score DESC LIMIT 1)          AS favorite_genre,
  (SELECT a.name FROM user_artist_preferences x JOIN artists a ON a.artist_id = x.artist_id
    WHERE x.user_id = u.user_id ORDER BY x.blended_score DESC LIMIT 1)          AS favorite_artist,
  MAX(p.started_at) AS last_played_at
FROM users u
JOIN user_profiles up ON up.user_id = u.user_id
LEFT JOIN plays p ON p.user_id = u.user_id
GROUP BY u.user_id, up.display_name;

-- Daily listening with running total and a 7-day moving average.
CREATE OR REPLACE VIEW v_daily_listening_summary AS
WITH daily AS (
  SELECT user_id, DATE(started_at) AS day, COUNT(*) AS plays,
         ROUND(SUM(listened_sec) / 60, 1) AS minutes, SUM(completed) AS completes, SUM(skipped) AS skips,
         COUNT(DISTINCT song_id) AS unique_songs
  FROM listening_history
  GROUP BY user_id, DATE(started_at)
)
SELECT d.*,
       SUM(minutes) OVER (PARTITION BY user_id ORDER BY day) AS running_minutes,
       -- days without listening count as zero, so divide by 7, not by the row count
       ROUND(SUM(minutes) OVER (PARTITION BY user_id ORDER BY day
                                RANGE BETWEEN INTERVAL 6 DAY PRECEDING AND CURRENT ROW) / 7, 1) AS moving_avg_7d,
       LAG(day) OVER (PARTITION BY user_id ORDER BY day) AS previous_active_day
FROM daily d;

-- Weekly share of each mood in a user's listening, with change vs. the previous week.
CREATE OR REPLACE VIEW v_weekly_mood_summary AS
WITH weekly AS (
  SELECT lh.user_id, fn_week_start(DATE(lh.started_at)) AS week_start, pm.mood_id, pm.mood_name,
         COUNT(*) AS plays
  FROM listening_history lh
  JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
  WHERE lh.skipped = 0
  GROUP BY lh.user_id, fn_week_start(DATE(lh.started_at)), pm.mood_id, pm.mood_name
),
shares AS (
  SELECT w.*, ROUND(100 * plays / SUM(plays) OVER (PARTITION BY user_id, week_start), 1) AS share_pct
  FROM weekly w
)
SELECT s.*,
       LAG(share_pct) OVER (PARTITION BY user_id, mood_id ORDER BY week_start) AS prev_share_pct,
       ROUND(share_pct - COALESCE(LAG(share_pct) OVER (PARTITION BY user_id, mood_id ORDER BY week_start), 0), 1) AS share_change
FROM shares s;

-- Reasons rendered into sentences, straight from the stored params.
CREATE OR REPLACE VIEW v_recommendation_explanations AS
SELECT rr.batch_id, rr.song_id, rr.reason_code, rr.strength, rr.params, rt.score_family,
       ROW_NUMBER() OVER (PARTITION BY rr.batch_id, rr.song_id ORDER BY rr.strength DESC, rr.reason_code) AS reason_rank,
       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(rt.template,
         '{genre}',    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.genre')), '')),
         '{artist}',   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.artist')), '')),
         '{mood}',     COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.mood')), '')),
         '{language}', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.language')), '')),
         '{region}',   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.region')), '')),
         '{count}',    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.count')), '')),
         '{pct}',      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.pct')), '')),
         '{seed}',     COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.seed')), '')),
         '{context}',  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.context')), '')),
         '{bpm}',      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.bpm')), '')),
         '{rating}',   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(rr.params, '$.rating')), '')) AS reason_text
FROM recommendation_reasons rr
JOIN reason_types rt ON rt.reason_code = rr.reason_code;

-- Latest trend snapshot (all entity types), with names resolved.
CREATE OR REPLACE VIEW v_latest_trends AS
WITH latest AS (
  SELECT MAX(job_id) AS job_id FROM trend_snapshots
)
SELECT t.window_code, t.entity_type, t.entity_id, t.region_code, t.curr_plays, t.prev_plays, t.curr_listeners,
       t.velocity_pct, t.momentum_rank, t.computed_at,
       CASE t.entity_type
         WHEN 'SONG'     THEN (SELECT title FROM songs WHERE song_id = t.entity_id)
         WHEN 'ARTIST'   THEN (SELECT name FROM artists WHERE artist_id = t.entity_id)
         WHEN 'GENRE'    THEN (SELECT name FROM genres WHERE genre_id = t.entity_id)
         WHEN 'MOOD'     THEN (SELECT name FROM moods WHERE mood_id = t.entity_id)
         WHEN 'LANGUAGE' THEN (SELECT name FROM languages WHERE language_id = t.entity_id)
       END AS entity_name
FROM trend_snapshots t
JOIN latest ON latest.job_id = t.job_id;

-- Trending songs right now (7-day window, all listeners).
CREATE OR REPLACE VIEW v_trending_songs AS
SELECT entity_id AS song_id, entity_name AS title, curr_plays, prev_plays, curr_listeners, velocity_pct, momentum_rank, computed_at
FROM v_latest_trends
WHERE window_code = '7D' AND entity_type = 'SONG' AND region_code IS NULL;

-- A world with its archetype, mood and size (for the World page and admin).
CREATE OR REPLACE VIEW v_muse_world_summary AS
SELECT w.world_id, w.user_id, w.week_start, w.version, w.status, w.title, w.description,
       w.archetype_code, wa.name AS archetype_name, wa.motif, w.theme, w.signals,
       m.mood_id AS primary_mood_id, m.name AS primary_mood, m.emoji AS primary_mood_emoji,
       l.name AS language_name, r.name AS region_name, w.batch_id, w.job_id, w.generated_at, w.expires_at,
       (SELECT COUNT(*) FROM recommendation_items ri WHERE ri.batch_id = w.batch_id) AS song_count,
       (SELECT SUM(s.duration_sec) FROM recommendation_items ri JOIN songs s ON s.song_id = ri.song_id
         WHERE ri.batch_id = w.batch_id) AS total_duration_sec
FROM weekly_worlds w
JOIN world_archetypes wa ON wa.archetype_code = w.archetype_code
JOIN moods m ON m.mood_id = w.primary_mood_id
LEFT JOIN languages l ON l.language_id = w.language_id
LEFT JOIN regions r ON r.region_code = w.region_code;

-- Artist popularity over the last 30 days, ranked.
CREATE OR REPLACE VIEW v_artist_popularity AS
SELECT a.artist_id, a.name, a.region_code, l.name AS language_name,
       COUNT(lh.play_id) AS plays_30d, COUNT(DISTINCT lh.user_id) AS listeners_30d,
       COALESCE(SUM(lh.completed), 0) AS completes_30d,
       DENSE_RANK() OVER (ORDER BY COUNT(lh.play_id) DESC) AS popularity_rank
FROM artists a
LEFT JOIN languages l ON l.language_id = a.primary_language_id
LEFT JOIN songs s ON s.primary_artist_id = a.artist_id
LEFT JOIN listening_history lh ON lh.song_id = s.song_id AND lh.started_at >= NOW() - INTERVAL 30 DAY
GROUP BY a.artist_id, a.name, a.region_code, l.name;

-- Per-genre catalogue and listening statistics.
CREATE OR REPLACE VIEW v_genre_statistics AS
SELECT g.genre_id, g.name, g.color_hex, pg.name AS parent_genre,
       COUNT(DISTINCT sg.song_id) AS songs,
       (SELECT COUNT(*) FROM listening_history lh JOIN song_genres x ON x.song_id = lh.song_id AND x.is_primary = 1
         WHERE x.genre_id = g.genre_id) AS plays,
       (SELECT ROUND(AVG(r.rating), 2) FROM ratings r JOIN song_genres x ON x.song_id = r.song_id AND x.is_primary = 1
         WHERE x.genre_id = g.genre_id) AS avg_rating,
       ROUND(AVG(af.energy), 3) AS avg_energy, ROUND(AVG(af.valence), 3) AS avg_valence
FROM genres g
LEFT JOIN genres pg ON pg.genre_id = g.parent_genre_id
LEFT JOIN song_genres sg ON sg.genre_id = g.genre_id AND sg.is_primary = 1
LEFT JOIN audio_features af ON af.song_id = sg.song_id AND af.is_current = 1
GROUP BY g.genre_id, g.name, g.color_hex, pg.name;

-- Temporary taste of an ACTIVE private session, derived from its own events.
-- Read by the recommender for incognito batches; never copied anywhere permanent.
CREATE OR REPLACE VIEW v_incognito_memory AS
SELECT i.incognito_id, i.user_id, 'GENRE' AS dimension, sg.genre_id AS ref_id,
       SUM(CASE WHEN e.skipped = 1 THEN -0.6 WHEN e.completed = 1 THEN 1 ELSE 0.3 END) AS score, COUNT(*) AS events
FROM incognito_sessions i
JOIN incognito_events e ON e.incognito_id = i.incognito_id
JOIN song_genres sg ON sg.song_id = e.song_id AND sg.is_primary = 1
WHERE i.status = 'ACTIVE'
GROUP BY i.incognito_id, i.user_id, sg.genre_id
UNION ALL
SELECT i.incognito_id, i.user_id, 'ARTIST', s.primary_artist_id,
       SUM(CASE WHEN e.skipped = 1 THEN -0.6 WHEN e.completed = 1 THEN 1 ELSE 0.3 END), COUNT(*)
FROM incognito_sessions i
JOIN incognito_events e ON e.incognito_id = i.incognito_id
JOIN songs s ON s.song_id = e.song_id
WHERE i.status = 'ACTIVE'
GROUP BY i.incognito_id, i.user_id, s.primary_artist_id
UNION ALL
SELECT i.incognito_id, i.user_id, 'MOOD', cm.mood_id,
       SUM(cm.confidence * CASE WHEN e.skipped = 1 THEN -0.6 WHEN e.completed = 1 THEN 1 ELSE 0.3 END), COUNT(*)
FROM incognito_sessions i
JOIN incognito_events e ON e.incognito_id = i.incognito_id
JOIN v_current_song_moods cm ON cm.song_id = e.song_id
WHERE i.status = 'ACTIVE'
GROUP BY i.incognito_id, i.user_id, cm.mood_id;

-- Provenance and data-quality summary per source.
CREATE OR REPLACE VIEW v_data_quality AS
SELECT ms.source_id, ms.code, ms.name, ms.source_type, ms.is_enabled, ms.rights_scope,
       COUNT(sr.record_id)                         AS records,
       SUM(sr.status = 'COMPLETED')                AS completed,
       SUM(sr.status = 'SKIPPED')                  AS skipped,
       SUM(sr.status = 'FAILED')                   AS failed,
       SUM(sr.status = 'IN_REVIEW')                AS in_review,
       ROUND(AVG(sr.quality_score), 3)             AS avg_quality,
       MIN(sr.first_seen_at)                       AS first_seen,
       MAX(sr.last_verified_at)                    AS last_verified
FROM music_sources ms
LEFT JOIN source_records sr ON sr.source_id = ms.source_id
GROUP BY ms.source_id, ms.code, ms.name, ms.source_type, ms.is_enabled, ms.rights_scope;

-- Effective permissions of every user, one row per (user, permission): the
-- role-based access matrix as data (see 08_queries.sql Q35). The auth middleware
-- reads role_permissions in its own single per-request query.
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT u.user_id, r.code AS role_code, rp.permission_code
FROM users u
JOIN roles r ON r.role_id = u.role_id
JOIN role_permissions rp ON rp.role_id = u.role_id;

-- =====================================================================
--  MUSE — Music Mood Intelligence & Recommendation Database System
--  Phase 3: Queries
--  Developed by Vaishnav Sai
--
--  Runs on the database created by Phase 2 (database/phase2/schema.sql).
--  In MySQL Workbench: open this file, put the cursor inside one query and
--  press Ctrl + Enter to run only that query (or the lightning bolt for all).
--  All queries are read-only.
--
--  Each query has a header that the MUSE Query Studio (frontend/streamlit_app.py)
--  reads:  @id  @title  @concepts  @question  @chart (optional)
-- =====================================================================

USE muse_db;

-- @id Q01
-- @title Popular recent songs
-- @concepts SELECT, WHERE (=, >=, AND), ORDER BY, LIMIT
-- @question Which active songs released in 2022 or later have a popularity of at least 75?
-- @chart bar x=title y=popularity
SELECT song_id, title, release_year, popularity, duration_sec
FROM songs
WHERE status = 'ACTIVE'
  AND release_year >= 2022
  AND popularity >= 75
ORDER BY popularity DESC, title
LIMIT 15;

-- @id Q02
-- @title Calm-sounding tracks by audio profile
-- @concepts SELECT, WHERE (BETWEEN), INNER JOIN, ORDER BY
-- @question Which songs sound calm — low energy, slow tempo and mostly acoustic — according to their current audio analysis?
SELECT s.title, a.name AS artist,
       f.energy, f.valence, f.acousticness, f.tempo_bpm
FROM audio_features f
INNER JOIN songs   s ON s.song_id   = f.song_id
INNER JOIN artists a ON a.artist_id = s.primary_artist_id
WHERE f.is_current = 1
  AND f.energy BETWEEN 0 AND 0.30
  AND f.tempo_bpm BETWEEN 60 AND 105
  AND f.acousticness >= 0.40
ORDER BY f.energy, f.tempo_bpm;

-- @id Q03
-- @title Platform listening summary
-- @concepts COUNT, COUNT DISTINCT, SUM, AVG, MIN, MAX
-- @question How much listening does the platform hold in total, and over what period?
SELECT COUNT(*)                           AS total_plays,
       COUNT(DISTINCT user_id)            AS listeners,
       COUNT(DISTINCT song_id)            AS distinct_songs,
       ROUND(SUM(listened_sec) / 3600, 1) AS hours_listened,
       ROUND(AVG(completion_pct), 1)      AS avg_completion_pct,
       SUM(completed)                     AS completed_plays,
       SUM(skipped)                       AS skipped_plays,
       MIN(started_at)                    AS first_play,
       MAX(started_at)                    AS last_play
FROM listening_history;

-- @id Q04
-- @title Listener leaderboard
-- @concepts INNER JOIN, GROUP BY, COUNT, SUM, AVG, MAX, ORDER BY
-- @question Who listens the most, how completely do they listen, and when did they last play something?
-- @chart bar x=listener y=hours
SELECT p.display_name                          AS listener,
       u.username,
       COUNT(*)                                AS plays,
       ROUND(SUM(lh.listened_sec) / 3600, 1)   AS hours,
       ROUND(AVG(lh.completion_pct), 1)        AS avg_completion_pct,
       ROUND(100 * AVG(lh.skipped), 1)         AS skip_rate_pct,
       MAX(lh.started_at)                      AS last_played
FROM listening_history lh
INNER JOIN users         u ON u.user_id = lh.user_id
INNER JOIN user_profiles p ON p.user_id = u.user_id
GROUP BY u.user_id, p.display_name, u.username
ORDER BY hours DESC;

-- @id Q05
-- @title Artists with a strong catalogue
-- @concepts INNER JOIN, GROUP BY, HAVING, COUNT, AVG, MIN, MAX, ORDER BY
-- @question Which artists have at least 4 songs and an average popularity above 70?
-- @chart bar x=artist y=avg_popularity
SELECT a.name                       AS artist,
       COUNT(*)                     AS songs,
       ROUND(AVG(s.popularity), 1)  AS avg_popularity,
       MIN(s.release_year)          AS first_release,
       MAX(s.release_year)          AS latest_release
FROM artists a
INNER JOIN songs s ON s.primary_artist_id = a.artist_id
GROUP BY a.artist_id, a.name
HAVING COUNT(*) >= 4 AND AVG(s.popularity) > 70
ORDER BY avg_popularity DESC;

-- @id Q06
-- @title Most-skipped songs
-- @concepts INNER JOIN, GROUP BY, HAVING, COUNT, SUM, AVG, ORDER BY
-- @question Among songs played at least 20 times, which are skipped most often?
-- @chart bar x=title y=skip_rate_pct
SELECT s.title,
       a.name                                AS artist,
       COUNT(*)                              AS plays,
       SUM(lh.skipped)                       AS skips,
       ROUND(100 * SUM(lh.skipped) / COUNT(*), 1) AS skip_rate_pct,
       ROUND(AVG(lh.listened_sec))           AS avg_seconds_listened
FROM listening_history lh
INNER JOIN songs   s ON s.song_id   = lh.song_id
INNER JOIN artists a ON a.artist_id = s.primary_artist_id
GROUP BY s.song_id, s.title, a.name
HAVING COUNT(*) >= 20
ORDER BY skip_rate_pct DESC, plays DESC
LIMIT 10;

-- @id Q07
-- @title Mood map of the catalogue
-- @concepts INNER JOIN (4 tables), GROUP BY, COUNT, AVG, ORDER BY
-- @question For each mood, how many songs does the active mood model tag with it, how confident is it, and what do those songs sound like on average?
-- @chart bar x=mood y=songs
SELECT m.name                          AS mood,
       COUNT(*)                        AS songs,
       ROUND(AVG(sm.confidence), 3)    AS avg_confidence,
       ROUND(AVG(f.energy), 2)         AS avg_energy,
       ROUND(AVG(f.valence), 2)        AS avg_valence,
       ROUND(AVG(f.tempo_bpm))         AS avg_tempo_bpm
FROM song_moods sm
INNER JOIN moods               m  ON m.mood_id   = sm.mood_id
INNER JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1
INNER JOIN audio_features      f  ON f.feature_id = sm.feature_id
GROUP BY m.mood_id, m.name
ORDER BY songs DESC;

-- @id Q08
-- @title Every mood with its song count
-- @concepts LEFT JOIN, GROUP BY, COUNT, ORDER BY
-- @question How many songs does each of the 17 moods have? A mood with no songs would still be listed, with 0 (an INNER JOIN would drop it).
SELECT mc.name                 AS mood_family,
       m.name                  AS mood,
       COUNT(sm.song_id)       AS songs_tagged
FROM moods m
INNER JOIN mood_categories mc ON mc.category_id = m.category_id
LEFT JOIN (song_moods sm
           INNER JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1)
       ON sm.mood_id = m.mood_id
GROUP BY mc.name, m.mood_id, m.name
ORDER BY mood_family, songs_tagged DESC;

-- @id Q09
-- @title Songs no one has put in a playlist
-- @concepts LEFT JOIN … IS NULL (anti-join), WHERE, ORDER BY
-- @question Which popular songs have never been added to any playlist?
SELECT s.title, a.name AS artist, s.popularity
FROM songs s
INNER JOIN artists a ON a.artist_id = s.primary_artist_id
LEFT JOIN playlist_songs ps ON ps.song_id = s.song_id
WHERE ps.song_id IS NULL
  AND s.popularity >= 70
ORDER BY s.popularity DESC;

-- @id Q10
-- @title Catalogue by language
-- @concepts RIGHT JOIN, GROUP BY, COUNT, AVG, ORDER BY
-- @question How many songs exist in each language? Every language must be listed, even one with no songs.
-- @chart bar x=language y=songs
SELECT l.name                       AS language,
       l.script,
       COUNT(s.song_id)             AS songs,
       ROUND(AVG(s.popularity), 1)  AS avg_popularity
FROM songs s
RIGHT JOIN languages l ON l.language_id = s.language_id
GROUP BY l.language_id, l.name, l.script
ORDER BY songs DESC, language;

-- @id Q11
-- @title Listening by context
-- @concepts LEFT JOIN, GROUP BY, COUNT, SUM, AVG, ORDER BY
-- @question In which situations (study, workout, travel …) do people listen most, and how completely?
-- @chart bar x=context y=hours
SELECT COALESCE(c.name, 'No context')       AS context,
       COUNT(DISTINCT ls.session_id)         AS sessions,
       COUNT(lh.play_id)                     AS plays,
       ROUND(SUM(lh.listened_sec) / 3600, 1) AS hours,
       ROUND(AVG(lh.completion_pct), 1)      AS avg_completion_pct
FROM listening_sessions ls
LEFT JOIN contexts c           ON c.context_id = ls.context_id
LEFT JOIN listening_history lh ON lh.session_id = ls.session_id
GROUP BY c.context_id, c.name
ORDER BY hours DESC;

-- @id Q12
-- @title Best-rated genres
-- @concepts INNER JOIN (4 tables), GROUP BY, HAVING, COUNT, AVG, MIN, MAX
-- @question Which primary genres get the best star ratings, counting only genres with at least 5 ratings?
-- @chart bar x=genre y=avg_rating
SELECT g.name                     AS genre,
       COUNT(*)                   AS ratings,
       ROUND(AVG(r.rating), 2)    AS avg_rating,
       MIN(r.rating)              AS lowest,
       MAX(r.rating)              AS highest
FROM ratings r
INNER JOIN songs       s  ON s.song_id   = r.song_id
INNER JOIN song_genres sg ON sg.song_id  = s.song_id AND sg.is_primary = 1
INNER JOIN genres      g  ON g.genre_id  = sg.genre_id
GROUP BY g.genre_id, g.name
HAVING COUNT(*) >= 5
ORDER BY avg_rating DESC, ratings DESC;

-- @id Q13
-- @title Listening by hour of day
-- @concepts Recursive CTE (hours 0-23), LEFT JOIN, GROUP BY, COUNT, SUM, AVG, ORDER BY
-- @question At what time of day does listening happen? Hours with no plays are shown as 0.
-- @chart line x=hour_of_day y=plays
WITH RECURSIVE hours AS (
  SELECT 0 AS h
  UNION ALL
  SELECT h + 1 FROM hours WHERE h < 23
)
SELECT hours.h                                          AS hour_of_day,
       COUNT(lh.play_id)                                AS plays,
       ROUND(COALESCE(SUM(lh.listened_sec), 0) / 3600, 1) AS hours,
       ROUND(AVG(lh.completion_pct), 1)                 AS avg_completion_pct
FROM hours
LEFT JOIN listening_history lh ON HOUR(lh.started_at) = hours.h
GROUP BY hours.h
ORDER BY hour_of_day;

-- @id Q14
-- @title Playlists with their real length
-- @concepts LEFT JOIN (4 tables), GROUP BY, COUNT, SUM, ORDER BY
-- @question What does each playlist contain, and how long is it really (computed from its songs)?
SELECT pl.name                             AS playlist,
       p.display_name                      AS owner,
       COUNT(ps.song_id)                   AS songs,
       ROUND(SUM(s.duration_sec) / 60, 1)  AS minutes,
       GROUP_CONCAT(s.title ORDER BY ps.position SEPARATOR ', ') AS songs_in_order
FROM playlists pl
INNER JOIN user_profiles p ON p.user_id = pl.user_id
LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.playlist_id
LEFT JOIN songs s           ON s.song_id = ps.song_id
GROUP BY pl.playlist_id, pl.name, p.display_name
ORDER BY minutes DESC;

-- @id Q15
-- @title Listeners above the average
-- @concepts GROUP BY, HAVING with a subquery, SUM, AVG
-- @question Which listeners have listened for longer than the average listener?
SELECT u.username,
       ROUND(SUM(lh.listened_sec) / 3600, 1) AS hours
FROM listening_history lh
INNER JOIN users u ON u.user_id = lh.user_id
GROUP BY u.user_id, u.username
HAVING SUM(lh.listened_sec) > (SELECT AVG(total_sec)
                               FROM (SELECT SUM(listened_sec) AS total_sec
                                     FROM listening_history
                                     GROUP BY user_id) per_user)
ORDER BY hours DESC;

-- @id Q16
-- @title Each listener's favourite mood
-- @chart bar x=listener y=share_pct
-- @concepts INNER JOIN, GROUP BY, window function ROW_NUMBER() OVER (PARTITION BY), CTE
-- @question Which mood does each listener play most, and what share of their mood-tagged plays is it?
WITH plays_by_mood AS (
  SELECT lh.user_id, m.name AS mood, COUNT(*) AS plays
  FROM listening_history lh
  INNER JOIN song_moods sm           ON sm.song_id = lh.song_id
  INNER JOIN intelligence_models im  ON im.model_id = sm.model_id AND im.is_active = 1
  INNER JOIN moods m                 ON m.mood_id = sm.mood_id
  GROUP BY lh.user_id, m.name
), ranked AS (
  SELECT user_id, mood, plays,
         ROUND(100 * plays / SUM(plays) OVER (PARTITION BY user_id), 1) AS share_pct,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY plays DESC, mood) AS rn
  FROM plays_by_mood
)
SELECT p.display_name AS listener, r.mood AS favourite_mood, r.plays, r.share_pct
FROM ranked r
INNER JOIN user_profiles p ON p.user_id = r.user_id
WHERE r.rn = 1
ORDER BY r.plays DESC;

-- @id Q17
-- @title Weekly MUSE Worlds and their recommendations
-- @concepts INNER JOIN (5 tables), GROUP BY, COUNT, AVG, MAX
-- @question For each weekly MUSE World, who is it for, what is its main mood, and how strong are its recommended songs?
SELECT w.title                          AS world,
       p.display_name                   AS listener,
       m.name                           AS main_mood,
       w.week_start,
       COUNT(ri.song_id)                AS songs_recommended,
       ROUND(AVG(ri.final_score), 3)    AS avg_score,
       ROUND(MAX(ri.final_score), 3)    AS best_score
FROM weekly_worlds w
INNER JOIN user_profiles p         ON p.user_id = w.user_id
INNER JOIN moods m                 ON m.mood_id = w.primary_mood_id
INNER JOIN recommendation_batches b ON b.batch_id = w.batch_id
INNER JOIN recommendation_items ri ON ri.batch_id = b.batch_id
GROUP BY w.world_id, w.title, p.display_name, m.name, w.week_start
ORDER BY avg_score DESC;

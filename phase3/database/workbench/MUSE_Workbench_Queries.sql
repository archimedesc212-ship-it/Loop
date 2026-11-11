-- Copy of database/08_queries.sql (generated). Run after MUSE_Workbench_Setup.sql.
-- In Workbench: put the cursor in one query and press Ctrl+Enter to run just that query.
USE `muse`;
-- =====================================================================
--  MUSE — 08_queries.sql
--  Analytical queries that demonstrate the DBMS concepts of the project.
--  Not loaded by setup; run them in Workbench / mysql, or all at once with
--      npm run test:sql            (pass/fail per block)
--      npm run test:sql -- --show  (also prints the first rows)
--  Every block starts with "-- Qnn:" / "-- Tn:" / "-- En:" — the runner splits on it.
--  @uid = 3 is the demo listener "aarav". Change it to explore other users.
-- =====================================================================
SET @uid = 3;
SET @mood_model = (SELECT model_id FROM intelligence_models WHERE kind = 'MOOD' AND is_active = 1);

-- Q01: Top 3 songs for every mood (active model only)  [INNER JOIN, CTE, ROW_NUMBER]
WITH ranked AS (
  SELECT m.name AS mood, s.title, a.name AS artist, sm.confidence,
         ROW_NUMBER() OVER (PARTITION BY m.mood_id ORDER BY sm.confidence DESC, s.popularity DESC) AS rn
  FROM song_moods sm
  JOIN moods m   ON m.mood_id = sm.mood_id
  JOIN songs s   ON s.song_id = sm.song_id AND s.status = 'ACTIVE'
  JOIN artists a ON a.artist_id = s.primary_artist_id
  WHERE sm.model_id = @mood_model
)
SELECT mood, rn AS position, title, artist, confidence FROM ranked WHERE rn <= 3 ORDER BY mood, rn;

-- Q02: Most listened genres across all listeners  [multi JOIN, GROUP BY, aggregates]
SELECT g.name AS genre, COUNT(*) AS plays, COUNT(DISTINCT lh.user_id) AS listeners,
       ROUND(SUM(lh.listened_sec) / 60) AS minutes, ROUND(100 * AVG(lh.completed), 1) AS completion_pct
FROM listening_history lh
JOIN song_genres sg ON sg.song_id = lh.song_id AND sg.is_primary = 1
JOIN genres g ON g.genre_id = sg.genre_id
GROUP BY g.genre_id, g.name
ORDER BY minutes DESC;

-- Q03: The listener's favourite artists with at least 5 completed plays  [GROUP BY, HAVING, LEFT JOIN]
SELECT a.name AS artist, COUNT(*) AS plays, SUM(lh.completed) AS completed, SUM(lh.is_replay) AS replays,
       ROUND(AVG(r.rating), 2) AS avg_rating_given
FROM listening_history lh
JOIN songs s ON s.song_id = lh.song_id
JOIN artists a ON a.artist_id = s.primary_artist_id
LEFT JOIN ratings r ON r.user_id = lh.user_id AND r.song_id = lh.song_id
WHERE lh.user_id = @uid
GROUP BY a.artist_id, a.name
HAVING SUM(lh.completed) >= 5
ORDER BY completed DESC;

-- Q04: Most popular mood by real listening, weighted by mood confidence  [M:N join, SUM, ORDER BY … LIMIT]
SELECT m.emoji, m.name AS mood, ROUND(SUM(sm.confidence), 1) AS weighted_plays, COUNT(*) AS raw_plays
FROM listening_history lh
JOIN song_moods sm ON sm.song_id = lh.song_id AND sm.model_id = @mood_model
JOIN moods m ON m.mood_id = sm.mood_id
WHERE lh.skipped = 0
GROUP BY m.mood_id, m.emoji, m.name
ORDER BY weighted_plays DESC
LIMIT 5;

-- Q05: Average rating per genre (genres with at least 5 ratings)  [AVG, HAVING, conditional SUM]
SELECT g.name AS genre, COUNT(*) AS ratings, ROUND(AVG(r.rating), 2) AS avg_rating, SUM(r.rating = 5) AS five_stars
FROM ratings r
JOIN song_genres sg ON sg.song_id = r.song_id AND sg.is_primary = 1
JOIN genres g ON g.genre_id = sg.genre_id
GROUP BY g.genre_id, g.name
HAVING COUNT(*) >= 5
ORDER BY avg_rating DESC;

-- Q06: Active songs this listener has never played  [NOT EXISTS]
SELECT s.song_id, s.title, a.name AS artist, s.popularity
FROM songs s JOIN artists a ON a.artist_id = s.primary_artist_id
WHERE s.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM listening_history lh WHERE lh.user_id = @uid AND lh.song_id = s.song_id)
ORDER BY s.popularity DESC;

-- Q07: Unplayed songs that sound closest to the listener's 4–5★ songs  [CTE, CROSS JOIN, stored function, ROW_NUMBER]
WITH favourites AS (
  SELECT r.song_id, s.title, af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness FROM ratings r
  JOIN songs s ON s.song_id = r.song_id
  JOIN audio_features af ON af.song_id = r.song_id AND af.is_current = 1
  WHERE r.user_id = @uid AND r.rating >= 4
),
candidates AS (
  SELECT s.song_id, s.title, af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness
  FROM songs s JOIN audio_features af ON af.song_id = s.song_id AND af.is_current = 1
  WHERE s.status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM listening_history lh WHERE lh.user_id = @uid AND lh.song_id = s.song_id)
),
pairs AS (
  SELECT c.title, f.title AS similar_to,
         fn_feature_similarity(c.energy, c.valence, c.danceability, c.acousticness, c.instrumentalness,
                               f.energy, f.valence, f.danceability, f.acousticness, f.instrumentalness) AS sim,
         ROW_NUMBER() OVER (PARTITION BY c.song_id ORDER BY
           fn_feature_similarity(c.energy, c.valence, c.danceability, c.acousticness, c.instrumentalness,
                                 f.energy, f.valence, f.danceability, f.acousticness, f.instrumentalness) DESC) AS rn
  FROM candidates c CROSS JOIN favourites f
)
SELECT title, similar_to, ROUND(sim, 3) AS similarity FROM pairs WHERE rn = 1 ORDER BY sim DESC LIMIT 10;

-- Q08: Most replayed songs on MUSE  [SUM over flags, HAVING]
SELECT s.title, a.name AS artist, SUM(lh.is_replay) AS replays, COUNT(*) AS plays,
       ROUND(100 * SUM(lh.is_replay) / COUNT(*), 1) AS replay_pct
FROM listening_history lh
JOIN songs s ON s.song_id = lh.song_id
JOIN artists a ON a.artist_id = s.primary_artist_id
GROUP BY s.song_id, s.title, a.name
HAVING SUM(lh.is_replay) > 0
ORDER BY replays DESC
LIMIT 10;

-- Q09: Songs gaining plays: last 7 days vs the 7 days before  [conditional aggregation, date arithmetic]
SELECT s.title,
       SUM(lh.started_at >= NOW() - INTERVAL 7 DAY) AS this_week,
       SUM(lh.started_at <  NOW() - INTERVAL 7 DAY) AS last_week,
       ROUND(100 * (SUM(lh.started_at >= NOW() - INTERVAL 7 DAY) - SUM(lh.started_at < NOW() - INTERVAL 7 DAY))
             / NULLIF(SUM(lh.started_at < NOW() - INTERVAL 7 DAY), 0)) AS growth_pct
FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
WHERE lh.started_at >= NOW() - INTERVAL 14 DAY AND lh.skipped = 0
GROUP BY s.song_id, s.title
HAVING this_week >= 3
ORDER BY growth_pct DESC
LIMIT 10;

-- Q10: Listening pattern by part of day with share of total  [CASE, window SUM() OVER ()]
SELECT CASE WHEN HOUR(started_at) BETWEEN 5 AND 11 THEN 'Morning'
            WHEN HOUR(started_at) BETWEEN 12 AND 16 THEN 'Afternoon'
            WHEN HOUR(started_at) BETWEEN 17 AND 20 THEN 'Evening'
            ELSE 'Night' END AS part_of_day,
       COUNT(*) AS plays,
       ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM listening_history
WHERE user_id = @uid
GROUP BY part_of_day
ORDER BY plays DESC;

-- Q11: Highest-rated songs, fairly ranked with a Bayesian average  [CTE, CROSS JOIN, aggregate]
WITH g AS (SELECT AVG(rating) AS mu FROM ratings)
SELECT s.title, COUNT(*) AS votes, ROUND(AVG(r.rating), 2) AS raw_avg,
       ROUND((SUM(r.rating) + 5 * g.mu) / (COUNT(*) + 5), 3) AS bayesian_avg
FROM ratings r JOIN songs s ON s.song_id = r.song_id CROSS JOIN g
GROUP BY s.song_id, s.title, g.mu
ORDER BY bayesian_avg DESC
LIMIT 10;

-- Q12: Songs more energetic than their own genre's average  [CORRELATED subquery]
SELECT s.title, g.name AS genre, af.energy,
       (SELECT ROUND(AVG(af2.energy), 3) FROM song_genres sg2
          JOIN audio_features af2 ON af2.song_id = sg2.song_id AND af2.is_current = 1
         WHERE sg2.genre_id = sg.genre_id AND sg2.is_primary = 1) AS genre_avg
FROM songs s
JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
JOIN genres g ON g.genre_id = sg.genre_id
JOIN audio_features af ON af.song_id = s.song_id AND af.is_current = 1
WHERE af.energy > (SELECT AVG(af2.energy) FROM song_genres sg2
                     JOIN audio_features af2 ON af2.song_id = sg2.song_id AND af2.is_current = 1
                    WHERE sg2.genre_id = sg.genre_id AND sg2.is_primary = 1)
ORDER BY g.name, af.energy DESC;

-- Q13: Every artist with catalogue size and plays, including never-played artists  [LEFT JOIN, COALESCE]
SELECT a.name AS artist, COUNT(DISTINCT s.song_id) AS songs, COUNT(lh.play_id) AS plays
FROM artists a
LEFT JOIN songs s ON s.primary_artist_id = a.artist_id
LEFT JOIN listening_history lh ON lh.song_id = s.song_id
GROUP BY a.artist_id, a.name
ORDER BY plays DESC;

-- Q14: Every language with this listener's plays, including languages never played  [RIGHT JOIN over a derived table]
SELECT l.name AS language, l.native_name, COALESCE(mine.plays, 0) AS my_plays
FROM (SELECT s.language_id, COUNT(*) AS plays
        FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
       WHERE lh.user_id = @uid GROUP BY s.language_id) AS mine
RIGHT JOIN languages l ON l.language_id = mine.language_id
ORDER BY my_plays DESC, l.name;

-- Q15: Genre hierarchy with depth and path  [RECURSIVE CTE]
WITH RECURSIVE tree AS (
  SELECT genre_id, name, parent_genre_id, 0 AS depth, CAST(name AS CHAR(300)) AS path
  FROM genres WHERE parent_genre_id IS NULL
  UNION ALL
  SELECT g.genre_id, g.name, g.parent_genre_id, t.depth + 1, CONCAT(t.path, ' > ', g.name)
  FROM genres g JOIN tree t ON g.parent_genre_id = t.genre_id
)
SELECT depth, path FROM tree ORDER BY path;

-- Q16: Current and longest listening streak  [gaps-and-islands: ROW_NUMBER + DATE_SUB]
WITH days AS (SELECT DISTINCT DATE(started_at) AS d FROM listening_history WHERE user_id = @uid),
islands AS (SELECT d, DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (ORDER BY d) DAY) AS grp FROM days),
runs AS (SELECT MIN(d) AS start_day, MAX(d) AS end_day, COUNT(*) AS days_in_row FROM islands GROUP BY grp)
SELECT start_day, end_day, days_in_row,
       CASE WHEN end_day >= CURDATE() - INTERVAL 1 DAY THEN 'current' ELSE 'ended' END AS status
FROM runs ORDER BY days_in_row DESC, end_day DESC LIMIT 5;

-- Q17: Last 14 days zero-filled, with running total and 7-day moving average  [RECURSIVE calendar, SUM() OVER, ROWS frame]
WITH RECURSIVE cal AS (
  SELECT CURDATE() - INTERVAL 13 DAY AS d UNION ALL SELECT d + INTERVAL 1 DAY FROM cal WHERE d < CURDATE()
),
daily AS (
  SELECT cal.d, COALESCE(ROUND(SUM(lh.listened_sec) / 60, 1), 0) AS minutes
  FROM cal LEFT JOIN listening_history lh ON lh.user_id = @uid AND DATE(lh.started_at) = cal.d
  GROUP BY cal.d
)
SELECT d AS day, minutes,
       SUM(minutes) OVER (ORDER BY d) AS running_total,
       ROUND(AVG(minutes) OVER (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS moving_avg_7d
FROM daily ORDER BY d;

-- Q18: Music Mood Journey — mood of each play vs the previous and next play in the session  [LAG, LEAD]
SELECT lh.session_id, lh.started_at, pm.mood_name AS mood,
       LAG(pm.mood_name)  OVER w AS previous_mood,
       LEAD(pm.mood_name) OVER w AS next_mood
FROM listening_history lh
JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
WHERE lh.user_id = @uid AND lh.skipped = 0
WINDOW w AS (PARTITION BY lh.session_id ORDER BY lh.started_at, lh.play_id)
ORDER BY lh.started_at DESC
LIMIT 15;

-- Q19: Most common mood transitions inside sessions  [LAG in a CTE, GROUP BY on the pair]
WITH seq AS (
  SELECT pm.mood_name AS mood,
         LAG(pm.mood_name) OVER (PARTITION BY lh.session_id ORDER BY lh.started_at, lh.play_id) AS prev_mood
  FROM listening_history lh JOIN v_song_primary_mood pm ON pm.song_id = lh.song_id
  WHERE lh.skipped = 0
)
SELECT CONCAT(prev_mood, ' → ', mood) AS transition, COUNT(*) AS times
FROM seq WHERE prev_mood IS NOT NULL AND prev_mood <> mood
GROUP BY prev_mood, mood ORDER BY times DESC LIMIT 10;

-- Q20: Popularity rank inside each genre  [RANK, DENSE_RANK, PERCENT_RANK, NTILE, named WINDOW]
SELECT g.name AS genre, s.title, s.popularity,
       RANK() OVER w AS rnk, DENSE_RANK() OVER w AS dense_rnk,
       ROUND(PERCENT_RANK() OVER w, 2) AS pct_rank, NTILE(4) OVER w AS quartile
FROM songs s
JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
JOIN genres g ON g.genre_id = sg.genre_id
WHERE s.status = 'ACTIVE'
WINDOW w AS (PARTITION BY g.genre_id ORDER BY s.popularity DESC)
ORDER BY g.name, rnk;

-- Q21: Ratings given without ever finishing the song  [EXISTS + NOT EXISTS]
SELECT u.username, s.title, r.rating
FROM ratings r
JOIN users u ON u.user_id = r.user_id
JOIN songs s ON s.song_id = r.song_id
WHERE EXISTS     (SELECT 1 FROM listening_history lh WHERE lh.user_id = r.user_id AND lh.song_id = r.song_id)
  AND NOT EXISTS (SELECT 1 FROM listening_history lh WHERE lh.user_id = r.user_id AND lh.song_id = r.song_id AND lh.completed = 1)
ORDER BY u.username;

-- Q22: Genres this listener skips a lot (skip rate above 20 %)  [CASE in aggregate, HAVING]
SELECT g.name AS genre, COUNT(*) AS plays,
       SUM(CASE WHEN lh.skipped = 1 THEN 1 ELSE 0 END) AS skips,
       ROUND(100 * AVG(lh.skipped), 1) AS skip_rate_pct
FROM listening_history lh
JOIN song_genres sg ON sg.song_id = lh.song_id AND sg.is_primary = 1
JOIN genres g ON g.genre_id = sg.genre_id
WHERE lh.user_id = @uid
GROUP BY g.genre_id, g.name
HAVING AVG(lh.skipped) > 0.20
ORDER BY skip_rate_pct DESC;

-- Q23: Each listener's strongest learned mood, short term vs long term  [ROW_NUMBER per user]
WITH ranked AS (
  SELECT up.display_name, m.name AS mood, ump.blended_score, ump.short_term_score, ump.long_term_score,
         ROW_NUMBER() OVER (PARTITION BY ump.user_id ORDER BY ump.blended_score DESC) AS rn
  FROM user_mood_preferences ump
  JOIN user_profiles up ON up.user_id = ump.user_id
  JOIN moods m ON m.mood_id = ump.mood_id
)
SELECT display_name, mood, blended_score, ROUND(short_term_score, 2) AS short_term, ROUND(long_term_score, 2) AS long_term
FROM ranked WHERE rn = 1 ORDER BY blended_score DESC;

-- Q24: Search "vennela" across songs, artist aliases and albums  [FULLTEXT ngram, UNION ALL]
SELECT 'song' AS kind, title AS label, MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE) AS relevance
  FROM songs WHERE MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)
UNION ALL
SELECT 'artist alias', CONCAT(al.alias, ' → ', a.name), MATCH(al.alias) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)
  FROM artist_aliases al JOIN artists a ON a.artist_id = al.artist_id
 WHERE MATCH(al.alias) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)
UNION ALL
SELECT 'album', title, MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)
  FROM albums WHERE MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE)
ORDER BY relevance DESC;

-- Q25: Listener × mood matrix (pivot)  [conditional aggregation]
SELECT up.display_name,
       ROUND(SUM(CASE WHEN m.name = 'Calm'      THEN sm.confidence ELSE 0 END), 1) AS calm,
       ROUND(SUM(CASE WHEN m.name = 'Energetic' THEN sm.confidence ELSE 0 END), 1) AS energetic,
       ROUND(SUM(CASE WHEN m.name = 'Romantic'  THEN sm.confidence ELSE 0 END), 1) AS romantic,
       ROUND(SUM(CASE WHEN m.name = 'Nostalgic' THEN sm.confidence ELSE 0 END), 1) AS nostalgic,
       ROUND(SUM(CASE WHEN m.name = 'Focused'   THEN sm.confidence ELSE 0 END), 1) AS focused
FROM listening_history lh
JOIN user_profiles up ON up.user_id = lh.user_id
JOIN song_moods sm ON sm.song_id = lh.song_id AND sm.model_id = @mood_model
JOIN moods m ON m.mood_id = sm.mood_id
GROUP BY up.user_id, up.display_name
ORDER BY up.user_id;

-- Q26: Listeners with above-average listening time  [subquery in HAVING over a derived table]
SELECT up.display_name, ROUND(SUM(lh.listened_sec) / 60) AS minutes
FROM listening_history lh JOIN user_profiles up ON up.user_id = lh.user_id
GROUP BY up.user_id, up.display_name
HAVING SUM(lh.listened_sec) > (SELECT AVG(t.total) FROM (SELECT SUM(listened_sec) AS total FROM listening_history GROUP BY user_id) t)
ORDER BY minutes DESC;

-- Q27: Compare two mood-model versions for the same songs (versioned data)  [self-join on song_moods]
SELECT s.title,
       (SELECT GROUP_CONCAT(m.name ORDER BY v1.confidence DESC) FROM song_moods v1 JOIN moods m ON m.mood_id = v1.mood_id
         WHERE v1.song_id = s.song_id AND v1.model_id = (SELECT model_id FROM intelligence_models WHERE kind = 'MOOD' AND version = '1.0')) AS moods_v1,
       (SELECT GROUP_CONCAT(m.name ORDER BY v2.confidence DESC) FROM song_moods v2 JOIN moods m ON m.mood_id = v2.mood_id
         WHERE v2.song_id = s.song_id AND v2.model_id = (SELECT model_id FROM intelligence_models WHERE kind = 'MOOD' AND version = '2.0')) AS moods_v2
FROM songs s WHERE s.song_id <= 8;

-- Q28: Provenance of every song: source, rights, match method and data quality  [multi JOIN, CASE]
SELECT s.title, ms.code AS source, sr.external_id, sr.rights_status, sr.match_method,
       sr.quality_score, CASE WHEN sr.quality_score >= 0.9 THEN 'good' WHEN sr.quality_score >= 0.6 THEN 'fair' ELSE 'poor' END AS quality
FROM source_records sr
JOIN music_sources ms ON ms.source_id = sr.source_id
JOIN songs s ON s.song_id = sr.song_id
WHERE sr.entity_type = 'SONG'
ORDER BY sr.last_verified_at DESC
LIMIT 15;

-- Q29: Why was each song recommended? Latest list for the listener, reasons as sentences  [view, JSON_ARRAYAGG]
SELECT ri.rank_position, s.title, ri.final_score,
       (SELECT JSON_ARRAYAGG(e.reason_text) FROM v_recommendation_explanations e
         WHERE e.batch_id = ri.batch_id AND e.song_id = ri.song_id AND e.reason_rank <= 3) AS reasons
FROM recommendation_items ri
JOIN songs s ON s.song_id = ri.song_id
WHERE ri.batch_id = (SELECT MAX(batch_id) FROM recommendation_batches WHERE user_id = @uid AND incognito_id IS NULL)
ORDER BY ri.rank_position
LIMIT 10;

-- Q30: Weekly share of each mood with week-over-week change  [view with LAG]
SELECT week_start, mood_name, share_pct, prev_share_pct, share_change
FROM v_weekly_mood_summary
WHERE user_id = @uid
ORDER BY week_start DESC, share_pct DESC
LIMIT 15;

-- Q31: Users' language preferences vs what they actually play  [JOIN + correlated subquery]
SELECT up.display_name, l.name AS chosen_language, ul.priority,
       (SELECT COUNT(*) FROM listening_history lh JOIN songs s ON s.song_id = lh.song_id
         WHERE lh.user_id = ul.user_id AND s.language_id = ul.language_id) AS plays_in_it
FROM user_languages ul
JOIN user_profiles up ON up.user_id = ul.user_id
JOIN languages l ON l.language_id = ul.language_id
ORDER BY up.display_name, ul.priority;

-- =====================================================================
--  STORED PROCEDURES AND VIEWS
-- =====================================================================
-- Q32: Listening profile summary  [stored procedure, several result sets]
CALL sp_user_listening_summary(@uid, 30);

-- Q33: Personalised preference refresh (time-decayed, versioned)  [stored procedure with transaction + row lock]
CALL sp_refresh_user_preferences(@uid);

-- Q34: The user's music profile row  [view with CTEs and window functions]
SELECT * FROM v_user_music_profile WHERE user_id = @uid;

-- Q35: Access matrix — which roles hold which permission, and how many active users that reaches  [view + conditional aggregation]
SELECT vp.permission_code,
       MAX(vp.role_code = 'LISTENER') AS listener, MAX(vp.role_code = 'CURATOR') AS curator, MAX(vp.role_code = 'ADMIN') AS admin,
       COUNT(DISTINCT CASE WHEN u.is_active = 1 THEN vp.user_id END) AS active_users_with_it
FROM v_user_permissions vp JOIN users u ON u.user_id = vp.user_id
GROUP BY vp.permission_code
ORDER BY active_users_with_it, vp.permission_code;

-- Q36: Live sign-in sessions per user — never the token, only its existence  [migration 0001, partial-state filter]
SELECT u.username, COUNT(*) AS live_sessions, MAX(s.last_seen_at) AS last_seen,
       SUM(s.expires_at < NOW() + INTERVAL 1 HOUR) AS expiring_within_1h
FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
GROUP BY u.username ORDER BY live_sessions DESC, u.username;

-- Q37: How much of the catalogue can actually play, and from which source  [LEFT JOIN to a window-function view]
SELECT COALESCE(p.media_type, 'METADATA ONLY') AS playback, COALESCE(p.source_name, '—') AS source, COUNT(*) AS songs
FROM songs s LEFT JOIN v_song_playback p ON p.song_id = s.song_id
WHERE s.status = 'ACTIVE'
GROUP BY playback, source ORDER BY songs DESC;

-- Q38: "Not for me" — the most dismissed songs and which strategy had suggested them  [migration 0002, LEFT JOIN, GROUP BY]
SELECT s.title, a.name AS artist, COUNT(*) AS dismissed_by, GROUP_CONCAT(DISTINCT rb.strategy) AS suggested_by
FROM song_dismissals d
JOIN songs s ON s.song_id = d.song_id
JOIN artists a ON a.artist_id = s.primary_artist_id
LEFT JOIN recommendation_batches rb ON rb.batch_id = d.batch_id
GROUP BY s.song_id, s.title, a.name ORDER BY dismissed_by DESC, s.title LIMIT 10;

-- Q39: MUSE World feedback per archetype  [conditional aggregation over a composite-key table]
SELECT wa.name AS archetype,
       SUM(wf.feedback = 'LOVE') AS loved, SUM(wf.feedback = 'NOT_FOR_ME') AS not_for_me,
       COUNT(DISTINCT ww.world_id) AS worlds_generated
FROM world_archetypes wa
LEFT JOIN weekly_worlds ww ON ww.archetype_code = wa.archetype_code
LEFT JOIN world_feedback wf ON wf.world_id = ww.world_id
GROUP BY wa.archetype_code, wa.name ORDER BY loved DESC, worlds_generated DESC;

-- Q40: Schema version history  [migration bookkeeping]
SELECT version, name, applied_at, execution_ms, LEFT(checksum, 12) AS checksum_prefix FROM schema_migrations ORDER BY version;

-- Q41: Mood-match ratings by users: average and count per song and mood, next to the AI's prediction  [view, LEFT JOIN]
-- (empty until listeners rate songs on the song page; songs without ratings have no row, not 0 %)
SELECT s.title, m.name AS mood, st.avg_match_percentage AS users_avg_pct, st.rating_count,
       ROUND(100 * cm.confidence, 1) AS ai_pct
FROM v_song_mood_rating_stats st
JOIN songs s ON s.song_id = st.song_id
JOIN moods m ON m.mood_id = st.mood_id
LEFT JOIN v_current_song_moods cm ON cm.song_id = st.song_id AND cm.mood_id = st.mood_id
ORDER BY st.rating_count DESC, st.avg_match_percentage DESC, s.song_id
LIMIT 20;

-- Q42: Top songs for a mood by listener ratings, plain average vs Bayesian-adjusted (prior weight 5)  [CTE, window-free ranking]
SET @rate_mood = (SELECT mood_id FROM moods WHERE name = 'Romantic');
WITH mood_mean AS (
  SELECT AVG(match_percentage) AS m FROM song_mood_ratings WHERE mood_id = @rate_mood
)
SELECT s.title, st.avg_match_percentage AS users_avg_pct, st.rating_count,
       ROUND((5 * mm.m + st.rating_count * st.avg_match_percentage) / (5 + st.rating_count), 2) AS adjusted_score
FROM v_song_mood_rating_stats st
JOIN songs s ON s.song_id = st.song_id AND s.status = 'ACTIVE'
CROSS JOIN mood_mean mm
WHERE st.mood_id = @rate_mood AND st.rating_count >= 1
ORDER BY adjusted_score DESC, st.rating_count DESC, s.song_id
LIMIT 10;

-- =====================================================================
--  TRANSACTIONS
-- =====================================================================
-- T1: Create a playlist and add songs atomically — COMMIT (triggers maintain count and length)
START TRANSACTION;
INSERT INTO playlists (user_id, name, description) VALUES (@uid, 'TX demo playlist', 'Created in one transaction');
SET @pl = LAST_INSERT_ID();
INSERT INTO playlist_songs (playlist_id, song_id) VALUES (@pl, 1), (@pl, 2), (@pl, 3);
COMMIT;
SELECT playlist_id, name, song_count, total_duration_sec FROM playlists WHERE playlist_id = @pl;

-- T2: The same work rolled back — nothing remains
START TRANSACTION;
INSERT INTO playlists (user_id, name) VALUES (@uid, 'TX rollback demo');
SET @pl2 = LAST_INSERT_ID();
INSERT INTO playlist_songs (playlist_id, song_id) VALUES (@pl2, 1);
ROLLBACK;
SELECT COUNT(*) AS should_be_zero FROM playlists WHERE name = 'TX rollback demo';

-- T3: Rating + preference refresh in one unit; ROLLBACK undoes both (before = after_rollback ≠ during)
SET @g = (SELECT genre_id FROM user_genre_preferences WHERE user_id = @uid ORDER BY blended_score DESC LIMIT 1 OFFSET 1);
SET @s = (SELECT sg.song_id FROM song_genres sg WHERE sg.genre_id = @g AND sg.is_primary = 1
           AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.user_id = @uid AND r.song_id = sg.song_id) LIMIT 1);
SELECT blended_score INTO @before FROM user_genre_preferences WHERE user_id = @uid AND genre_id = @g;
START TRANSACTION;
INSERT INTO ratings (user_id, song_id, rating) VALUES (@uid, @s, 1);
CALL sp_refresh_user_preferences_core(@uid);
SELECT blended_score INTO @during FROM user_genre_preferences WHERE user_id = @uid AND genre_id = @g;
ROLLBACK;
SELECT blended_score INTO @after FROM user_genre_preferences WHERE user_id = @uid AND genre_id = @g;
SELECT (SELECT name FROM genres WHERE genre_id = @g) AS genre, @before AS before_score, @during AS during_1star, @after AS after_rollback,
       (SELECT COUNT(*) FROM ratings WHERE user_id = @uid AND song_id = @s) AS rating_rows_left;

DELETE FROM playlists WHERE name = 'TX demo playlist' AND user_id = @uid;

-- =====================================================================
--  EXPLAIN  (see docs/PERFORMANCE.md and Admin › Performance in the app)
-- =====================================================================
-- E1: Listener timeline — range scan on idx_lh_user_time
EXPLAIN SELECT play_id, song_id, started_at FROM listening_history
 WHERE user_id = 3 AND started_at >= NOW() - INTERVAL 7 DAY ORDER BY started_at DESC;

-- E2: The same query with the index ignored — full table scan
EXPLAIN SELECT play_id, song_id, started_at FROM listening_history IGNORE INDEX (idx_lh_user_time, idx_lh_user_song)
 WHERE user_id = 3 AND started_at >= NOW() - INTERVAL 7 DAY ORDER BY started_at DESC;

-- E3: Mood → songs uses idx_sm_model_mood (covering, backward scan for ORDER BY … DESC)
EXPLAIN SELECT song_id, confidence FROM song_moods WHERE model_id = 4 AND mood_id = 3 ORDER BY confidence DESC;

-- E4: Full-text title search uses the ngram FULLTEXT index
EXPLAIN SELECT song_id, title FROM songs WHERE MATCH(title) AGAINST ('vennela' IN NATURAL LANGUAGE MODE);

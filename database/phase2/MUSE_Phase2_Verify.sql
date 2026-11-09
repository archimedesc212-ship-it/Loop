USE muse_db;

SELECT COUNT(*) AS tables_created FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'muse_db' AND TABLE_TYPE = 'BASE TABLE';
SELECT CONSTRAINT_TYPE, COUNT(*) AS how_many FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = 'muse_db' GROUP BY CONSTRAINT_TYPE ORDER BY CONSTRAINT_TYPE;
SELECT table_name, rows_loaded FROM (
  SELECT 'languages' AS table_name, COUNT(*) AS rows_loaded FROM languages
  UNION ALL
  SELECT 'films' AS table_name, COUNT(*) AS rows_loaded FROM films
  UNION ALL
  SELECT 'albums' AS table_name, COUNT(*) AS rows_loaded FROM albums
  UNION ALL
  SELECT 'regions' AS table_name, COUNT(*) AS rows_loaded FROM regions
  UNION ALL
  SELECT 'artists' AS table_name, COUNT(*) AS rows_loaded FROM artists
  UNION ALL
  SELECT 'album_artists' AS table_name, COUNT(*) AS rows_loaded FROM album_artists
  UNION ALL
  SELECT 'world_archetypes' AS table_name, COUNT(*) AS rows_loaded FROM world_archetypes
  UNION ALL
  SELECT 'mood_categories' AS table_name, COUNT(*) AS rows_loaded FROM mood_categories
  UNION ALL
  SELECT 'moods' AS table_name, COUNT(*) AS rows_loaded FROM moods
  UNION ALL
  SELECT 'archetype_moods' AS table_name, COUNT(*) AS rows_loaded FROM archetype_moods
  UNION ALL
  SELECT 'artist_aliases' AS table_name, COUNT(*) AS rows_loaded FROM artist_aliases
  UNION ALL
  SELECT 'intelligence_models' AS table_name, COUNT(*) AS rows_loaded FROM intelligence_models
  UNION ALL
  SELECT 'songs' AS table_name, COUNT(*) AS rows_loaded FROM songs
  UNION ALL
  SELECT 'audio_features' AS table_name, COUNT(*) AS rows_loaded FROM audio_features
  UNION ALL
  SELECT 'roles' AS table_name, COUNT(*) AS rows_loaded FROM roles
  UNION ALL
  SELECT 'users' AS table_name, COUNT(*) AS rows_loaded FROM users
  UNION ALL
  SELECT 'audit_logs' AS table_name, COUNT(*) AS rows_loaded FROM audit_logs
  UNION ALL
  SELECT 'auth_sessions' AS table_name, COUNT(*) AS rows_loaded FROM auth_sessions
  UNION ALL
  SELECT 'contexts' AS table_name, COUNT(*) AS rows_loaded FROM contexts
  UNION ALL
  SELECT 'context_keywords' AS table_name, COUNT(*) AS rows_loaded FROM context_keywords
  UNION ALL
  SELECT 'context_moods' AS table_name, COUNT(*) AS rows_loaded FROM context_moods
  UNION ALL
  SELECT 'genres' AS table_name, COUNT(*) AS rows_loaded FROM genres
  UNION ALL
  SELECT 'incognito_sessions' AS table_name, COUNT(*) AS rows_loaded FROM incognito_sessions
  UNION ALL
  SELECT 'incognito_events' AS table_name, COUNT(*) AS rows_loaded FROM incognito_events
  UNION ALL
  SELECT 'recommendation_batches' AS table_name, COUNT(*) AS rows_loaded FROM recommendation_batches
  UNION ALL
  SELECT 'listening_sessions' AS table_name, COUNT(*) AS rows_loaded FROM listening_sessions
  UNION ALL
  SELECT 'listening_history' AS table_name, COUNT(*) AS rows_loaded FROM listening_history
  UNION ALL
  SELECT 'model_parameters' AS table_name, COUNT(*) AS rows_loaded FROM model_parameters
  UNION ALL
  SELECT 'mood_keywords' AS table_name, COUNT(*) AS rows_loaded FROM mood_keywords
  UNION ALL
  SELECT 'mood_segments' AS table_name, COUNT(*) AS rows_loaded FROM mood_segments
  UNION ALL
  SELECT 'music_sources' AS table_name, COUNT(*) AS rows_loaded FROM music_sources
  UNION ALL
  SELECT 'permissions' AS table_name, COUNT(*) AS rows_loaded FROM permissions
  UNION ALL
  SELECT 'pipeline_jobs' AS table_name, COUNT(*) AS rows_loaded FROM pipeline_jobs
  UNION ALL
  SELECT 'source_records' AS table_name, COUNT(*) AS rows_loaded FROM source_records
  UNION ALL
  SELECT 'pipeline_job_logs' AS table_name, COUNT(*) AS rows_loaded FROM pipeline_job_logs
  UNION ALL
  SELECT 'playback_events' AS table_name, COUNT(*) AS rows_loaded FROM playback_events
  UNION ALL
  SELECT 'playlists' AS table_name, COUNT(*) AS rows_loaded FROM playlists
  UNION ALL
  SELECT 'playlist_songs' AS table_name, COUNT(*) AS rows_loaded FROM playlist_songs
  UNION ALL
  SELECT 'ratings' AS table_name, COUNT(*) AS rows_loaded FROM ratings
  UNION ALL
  SELECT 'reason_types' AS table_name, COUNT(*) AS rows_loaded FROM reason_types
  UNION ALL
  SELECT 'recommendation_batch_moods' AS table_name, COUNT(*) AS rows_loaded FROM recommendation_batch_moods
  UNION ALL
  SELECT 'recommendation_items' AS table_name, COUNT(*) AS rows_loaded FROM recommendation_items
  UNION ALL
  SELECT 'recommendation_reasons' AS table_name, COUNT(*) AS rows_loaded FROM recommendation_reasons
  UNION ALL
  SELECT 'review_queue' AS table_name, COUNT(*) AS rows_loaded FROM review_queue
  UNION ALL
  SELECT 'role_permissions' AS table_name, COUNT(*) AS rows_loaded FROM role_permissions
  UNION ALL
  SELECT 'schema_migrations' AS table_name, COUNT(*) AS rows_loaded FROM schema_migrations
  UNION ALL
  SELECT 'search_history' AS table_name, COUNT(*) AS rows_loaded FROM search_history
  UNION ALL
  SELECT 'song_artists' AS table_name, COUNT(*) AS rows_loaded FROM song_artists
  UNION ALL
  SELECT 'song_dismissals' AS table_name, COUNT(*) AS rows_loaded FROM song_dismissals
  UNION ALL
  SELECT 'song_genres' AS table_name, COUNT(*) AS rows_loaded FROM song_genres
  UNION ALL
  SELECT 'song_media' AS table_name, COUNT(*) AS rows_loaded FROM song_media
  UNION ALL
  SELECT 'song_mood_curations' AS table_name, COUNT(*) AS rows_loaded FROM song_mood_curations
  UNION ALL
  SELECT 'song_mood_ratings' AS table_name, COUNT(*) AS rows_loaded FROM song_mood_ratings
  UNION ALL
  SELECT 'song_moods' AS table_name, COUNT(*) AS rows_loaded FROM song_moods
  UNION ALL
  SELECT 'trend_snapshots' AS table_name, COUNT(*) AS rows_loaded FROM trend_snapshots
  UNION ALL
  SELECT 'user_artist_preferences' AS table_name, COUNT(*) AS rows_loaded FROM user_artist_preferences
  UNION ALL
  SELECT 'user_context_preferences' AS table_name, COUNT(*) AS rows_loaded FROM user_context_preferences
  UNION ALL
  SELECT 'user_genre_preferences' AS table_name, COUNT(*) AS rows_loaded FROM user_genre_preferences
  UNION ALL
  SELECT 'user_languages' AS table_name, COUNT(*) AS rows_loaded FROM user_languages
  UNION ALL
  SELECT 'user_likes' AS table_name, COUNT(*) AS rows_loaded FROM user_likes
  UNION ALL
  SELECT 'user_mood_preferences' AS table_name, COUNT(*) AS rows_loaded FROM user_mood_preferences
  UNION ALL
  SELECT 'user_profiles' AS table_name, COUNT(*) AS rows_loaded FROM user_profiles
  UNION ALL
  SELECT 'weekly_worlds' AS table_name, COUNT(*) AS rows_loaded FROM weekly_worlds
  UNION ALL
  SELECT 'world_feedback' AS table_name, COUNT(*) AS rows_loaded FROM world_feedback
) x ORDER BY table_name;

SELECT u.username, p.display_name, r.name AS role FROM users u JOIN user_profiles p ON p.user_id = u.user_id JOIN roles r ON r.role_id = u.role_id ORDER BY u.user_id;
SELECT s.title, a.name AS artist, al.title AS album, g.name AS genre FROM songs s JOIN artists a ON a.artist_id = s.primary_artist_id LEFT JOIN albums al ON al.album_id = s.album_id JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1 JOIN genres g ON g.genre_id = sg.genre_id ORDER BY s.song_id LIMIT 15;
SELECT m.name AS mood, COUNT(*) AS songs_tagged FROM song_moods sm JOIN moods m ON m.mood_id = sm.mood_id JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1 GROUP BY m.name ORDER BY songs_tagged DESC;
SELECT u.username, COUNT(*) AS plays, SUM(lh.completed) AS completed, SUM(lh.skipped) AS skipped FROM listening_history lh JOIN users u ON u.user_id = lh.user_id GROUP BY u.username ORDER BY plays DESC;

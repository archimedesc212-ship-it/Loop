-- =====================================================================
--  MUSE — 06_security.sql   (least-privilege application account)
--  Run by backend/scripts/setup-db.js as the OWNER account, which replaces
--  __DB__, __APP_USER__, __APP_HOST__ and __APP_PASSWORD__ from .env.
--
--  * The API connects as __APP_USER__, never as the owner/root.
--  * It may read and write data, and EXECUTE procedures/functions.
--  * It cannot CREATE / ALTER / DROP anything, cannot GRANT, and cannot
--    UPDATE or DELETE audit_logs (append-only), nor change role/permission
--    reference data.
--  * Procedures, functions, triggers and views run with DEFINER rights
--    (the owner), so the app account needs no extra privileges for the
--    temporary tables and side effects they create.
--  * Read access to statement digests powers the admin "slow queries" panel.
-- =====================================================================
DROP USER IF EXISTS '__APP_USER__'@'__APP_HOST__';
CREATE USER '__APP_USER__'@'__APP_HOST__' IDENTIFIED BY '__APP_PASSWORD__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.album_artists TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.albums TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.archetype_moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_aliases TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artists TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.audio_features TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT ON __DB__.audit_logs TO '__APP_USER__'@'__APP_HOST__';   -- append-only
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.context_keywords TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.context_moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.contexts TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.films TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.genres TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.incognito_events TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.incognito_sessions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.intelligence_models TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.languages TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_history TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_sessions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.model_parameters TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.mood_categories TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.mood_keywords TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.mood_segments TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.music_sources TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.permissions TO '__APP_USER__'@'__APP_HOST__';   -- reference data, read-only
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.pipeline_job_logs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.pipeline_jobs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playback_events TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playlist_songs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playlists TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.ratings TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.reason_types TO '__APP_USER__'@'__APP_HOST__';   -- reference data, read-only
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.recommendation_batch_moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.recommendation_batches TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.recommendation_items TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.recommendation_reasons TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.regions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.review_queue TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.role_permissions TO '__APP_USER__'@'__APP_HOST__';   -- reference data, read-only
GRANT SELECT ON __DB__.roles TO '__APP_USER__'@'__APP_HOST__';   -- reference data, read-only
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.search_history TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_artists TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_genres TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_media TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_mood_curations TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.song_moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.songs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.source_records TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.trend_snapshots TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_artist_preferences TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_context_preferences TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_genre_preferences TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_languages TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_likes TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_mood_preferences TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_profiles TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.users TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.weekly_worlds TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.world_archetypes TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.v_artist_popularity TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_current_audio_features TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_current_song_moods TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_daily_listening_summary TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_data_quality TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_genre_statistics TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_incognito_memory TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_latest_trends TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_muse_world_summary TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_recommendation_candidates TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_recommendation_explanations TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_song_catalog TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_song_primary_mood TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_song_stats TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_trending_songs TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_user_music_profile TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_user_permissions TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT SELECT ON __DB__.v_weekly_mood_summary TO '__APP_USER__'@'__APP_HOST__';   -- view
GRANT EXECUTE ON __DB__.* TO '__APP_USER__'@'__APP_HOST__';    -- procedures and functions
GRANT SELECT ON performance_schema.events_statements_summary_by_digest TO '__APP_USER__'@'__APP_HOST__';

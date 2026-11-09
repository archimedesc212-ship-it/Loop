-- =====================================================================
--  0003 — playback sources, media availability and provider registry rows
--
--  Separates three things that were implicit before:
--    * music METADATA (songs, artists, provenance)       — always shown
--    * permitted PLAYBACK media (song_media)             — may or may not exist
--    * whether that media is currently AVAILABLE          — checked, not assumed
--
--  * song_media.availability / last_checked_at / attribution: the media check
--    job (Admin › Providers) marks local files that are missing, previews a
--    provider no longer returns, etc. Unavailable media is never offered.
--  * v_song_playback: the best available permitted media per song (one row).
--  * v_song_catalog gains playable / playback_type / playback_source, so the UI
--    can show "metadata only" honestly; v_recommendation_candidates only
--    returns playable songs (recommending something nobody can play is useless).
--  * music_sources gets rows for the new provider adapters (all disabled until
--    configured) and the generated sketch is labelled as a demo fixture.
-- =====================================================================

DROP PROCEDURE IF EXISTS mig_0003_columns;
DELIMITER $$
CREATE PROCEDURE mig_0003_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'song_media' AND COLUMN_NAME = 'availability') THEN
    ALTER TABLE song_media
      ADD COLUMN availability ENUM('AVAILABLE','UNAVAILABLE','UNCHECKED') NOT NULL DEFAULT 'UNCHECKED' AFTER rights_status,
      ADD COLUMN last_checked_at DATETIME NULL AFTER availability,
      ADD COLUMN attribution VARCHAR(200) NULL AFTER last_checked_at,
      ADD KEY idx_media_song_avail (song_id, availability);
  END IF;
END$$
DELIMITER ;
CALL mig_0003_columns();
DROP PROCEDURE mig_0003_columns;

ALTER TABLE music_sources
  MODIFY source_type ENUM('MUSIC_METADATA','AUDIO_ANALYSIS','MUSIC_AUDIO','PLAYBACK','MOVIE_METADATA','ARTWORK','VIDEO_METADATA') NOT NULL;

-- a generated sketch exists wherever the song has audio features, so it is always available
UPDATE song_media SET availability = 'AVAILABLE', last_checked_at = NOW()
 WHERE media_type = 'GENERATED_SKETCH' AND availability = 'UNCHECKED';

UPDATE music_sources
   SET name = 'Demo sketch (local fixture)',
       notes = 'DEMO FIXTURE: a short sound synthesised in the browser from the song''s tempo, key, mode and energy. It is not the recording and not provider data.'
 WHERE code = 'MUSE_SKETCH';
UPDATE music_sources
   SET notes = 'Film metadata (title, year, overview, link). Disabled until TMDB_ENABLED=true and a token are set. Posters are not stored.',
       requires_credentials = 1
 WHERE code = 'TMDB';
UPDATE music_sources
   SET notes = 'Metadata only. No audio or artwork rights. Disabled until MUSICBRAINZ_ENABLED=true and MUSICBRAINZ_USER_AGENT (with contact details) are set.'
 WHERE code = 'MUSICBRAINZ';

INSERT IGNORE INTO music_sources (code, name, source_type, access_method, base_url, license_name, rights_scope, requires_attribution, attribution_text, priority, is_enabled, requires_credentials, notes) VALUES
('YOUTUBE_DATA', 'YouTube Data API v3', 'VIDEO_METADATA', 'API', 'https://www.googleapis.com/youtube/v3', 'YouTube API Services Terms of Service', 'METADATA', 1, 'Video links via the YouTube Data API.', 40, 0, 1,
 'Links to public videos (id, title, channel, URL). Never downloads or extracts audio. Needs YOUTUBE_ENABLED=true and YOUTUBE_API_KEY.'),
('LOCAL_MEDIA', 'Local media library', 'PLAYBACK', 'USER_UPLOAD', NULL, 'Files supplied by the operator, who holds the rights', 'AUDIO_FULL', 0, NULL, 10, 1, 0,
 'Audio files you own or are licensed to use, placed in LOCAL_MEDIA_DIR and registered per song by a curator.'),
('EXTERNAL_PREVIEW', 'Licensed preview provider', 'PLAYBACK', 'API', NULL, 'Per contract with the provider', 'AUDIO_PREVIEW', 1, 'Preview courtesy of the configured provider.', 20, 0, 1,
 'Vendor-neutral contract (GET /previews?isrc=). Disabled until EXTERNAL_PREVIEW_* settings are present.');

CREATE OR REPLACE VIEW v_song_playback AS
SELECT song_id, media_id, media_type, source_code, source_name, uri, attribution
FROM (
  SELECT sm.song_id, sm.media_id, sm.media_type, ms.code AS source_code, ms.name AS source_name, sm.uri,
         COALESCE(sm.attribution, ms.attribution_text) AS attribution,
         ROW_NUMBER() OVER (PARTITION BY sm.song_id ORDER BY sm.priority, ms.priority, sm.media_id) AS rn
  FROM song_media sm
  JOIN music_sources ms ON ms.source_id = sm.source_id
  WHERE ms.is_enabled = 1 AND sm.rights_status <> 'RESTRICTED' AND sm.availability <> 'UNAVAILABLE'
) ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW v_song_catalog AS
SELECT
  s.song_id, s.title, s.version_label, s.status, s.duration_sec, s.release_year, s.explicit,
  s.content_rating, s.popularity, s.isrc,
  a.artist_id, a.name AS artist_name, a.region_code AS artist_region,
  al.album_id, al.title AS album_title, al.album_type, f.film_id, f.title AS film_title,
  COALESCE(al.cover_color_1, g.color_hex) AS cover_color_1,
  COALESCE(al.cover_color_2, '#1F1B2E')   AS cover_color_2,
  l.language_id, COALESCE(l.name, 'Instrumental') AS language_name,
  g.genre_id, g.name AS genre_name, g.color_hex AS genre_color,
  caf.energy, caf.valence, caf.danceability, caf.acousticness, caf.instrumentalness,
  caf.speechiness, caf.loudness_db, caf.tempo_bpm, caf.musical_key, caf.mode, caf.analysis_version,
  (SELECT GROUP_CONCAT(cm.mood_name ORDER BY cm.mood_rank SEPARATOR ',')
     FROM v_current_song_moods cm WHERE cm.song_id = s.song_id AND cm.mood_rank <= 3) AS mood_tags,
  pm.media_type AS playback_type, pm.source_code AS playback_source, pm.source_name AS playback_source_name,
  pm.media_type IS NOT NULL AS playable
FROM songs s
JOIN artists a ON a.artist_id = s.primary_artist_id
LEFT JOIN albums al ON al.album_id = s.album_id
LEFT JOIN films f   ON f.film_id = al.film_id
LEFT JOIN languages l ON l.language_id = s.language_id
LEFT JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
LEFT JOIN genres g ON g.genre_id = sg.genre_id
LEFT JOIN v_current_audio_features caf ON caf.song_id = s.song_id
LEFT JOIN v_song_playback pm ON pm.song_id = s.song_id;

CREATE OR REPLACE VIEW v_recommendation_candidates AS
SELECT s.song_id, s.primary_artist_id AS artist_id, sg.genre_id, s.language_id, s.explicit, s.content_rating,
       s.popularity, s.duration_sec, a.region_code AS artist_region,
       af.energy, af.valence, af.danceability, af.acousticness, af.instrumentalness, af.speechiness, af.tempo_bpm
FROM songs s
JOIN artists a ON a.artist_id = s.primary_artist_id
JOIN song_genres sg ON sg.song_id = s.song_id AND sg.is_primary = 1
JOIN audio_features af ON af.song_id = s.song_id AND af.is_current = 1
WHERE s.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM v_song_playback p WHERE p.song_id = s.song_id);   -- playable only

GRANT SELECT ON __DB__.v_song_playback TO '__APP_USER__'@'__APP_HOST__';

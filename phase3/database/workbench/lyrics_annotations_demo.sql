-- LOOP lyrics / annotations DBMS demonstration
-- Run after database migrations. These are real queries against the live MySQL schema.
-- Existing users, songs, artists, albums, playlists, listening_history and user_likes
-- are reused; this feature adds only lyric/annotation/note tables.

-- 1) Relational join + aggregate through the reporting view.
SELECT song_id, song_title, artist_name, album_title, lyric_line_count,
       annotation_count, lyrics_updated_at
  FROM v_song_lyric_annotation_summary
 ORDER BY annotation_count DESC, song_title
 LIMIT 25;

-- 2) Explicit normalized join: song -> artist -> album -> lyric -> timestamped lines.
SELECT s.song_id, s.title, ar.name AS artist, al.title AS album,
       sl.language_code, sl.source_type, sl.source_label,
       ll.line_number, ll.start_ms, ll.end_ms, ll.lyric_text
  FROM songs s
  JOIN artists ar ON ar.artist_id = s.primary_artist_id
  LEFT JOIN albums al ON al.album_id = s.album_id
  JOIN song_lyrics sl ON sl.song_id = s.song_id
  JOIN lyric_lines ll ON ll.lyric_id = sl.lyric_id
 WHERE s.song_id = ? -- supply a real song_id with rights-cleared lyrics
 ORDER BY ll.line_number;

-- 3) User-specific notes and favourites use existing user_likes + new notes table.
SELECT u.user_id, u.username, s.song_id, s.title,
       CASE WHEN ul.song_id IS NULL THEN 0 ELSE 1 END AS is_favourite,
       usn.note_text, usn.updated_at
  FROM users u
  JOIN user_song_notes usn ON usn.user_id = u.user_id
  JOIN songs s ON s.song_id = usn.song_id
  LEFT JOIN user_likes ul ON ul.user_id = u.user_id AND ul.song_id = s.song_id
 WHERE u.user_id = ?;

-- 4) Annotation ownership / privacy join.
SELECT ll.line_number, ll.lyric_text, la.annotation_text, la.is_private,
       u.username AS annotation_owner, la.created_at
  FROM lyric_lines ll
  JOIN lyric_annotations la ON la.lyric_line_id = ll.lyric_line_id
  JOIN users u ON u.user_id = la.user_id
 WHERE ll.lyric_id = ?
 ORDER BY ll.line_number, la.created_at;

-- 5) Transaction demonstration: write a temporary personal note, inspect it, then rollback.
-- Replace IDs with real values. The application uses withTransaction() for lyric replacement.
START TRANSACTION;
INSERT INTO user_song_notes (user_id, song_id, note_text)
VALUES (?, ?, 'DBMS demo note — this write will be rolled back')
ON DUPLICATE KEY UPDATE note_text = VALUES(note_text);
SELECT user_id, song_id, note_text, updated_at
  FROM user_song_notes WHERE user_id = ? AND song_id = ?;
ROLLBACK;

-- 6) Constraint demonstration: duplicate user/song notes are prevented by uq_user_song_note.
-- A second INSERT for the same (user_id, song_id) is an UPSERT in the API, not a duplicate row.
SHOW CREATE TABLE song_lyrics;
SHOW CREATE TABLE lyric_lines;
SHOW CREATE TABLE lyric_annotations;
SHOW CREATE TABLE user_song_notes;

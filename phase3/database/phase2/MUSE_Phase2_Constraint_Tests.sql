USE muse_db;

SELECT 'T01 PRIMARY KEY: same user rates the same song twice' AS test;
INSERT INTO ratings (user_id, song_id, rating) VALUES (3, 3, 4);

SELECT 'T02 UNIQUE: username already taken' AS test;
INSERT INTO users (username, email, password_hash, role_id) VALUES ('kavya', 'new.user@example.com', REPEAT('x', 60), 2);

SELECT 'T03 FOREIGN KEY: rating for a song that does not exist' AS test;
INSERT INTO ratings (user_id, song_id, rating) VALUES (3, 999999, 4);

SELECT 'T04 CHECK: rating outside 1-5' AS test;
UPDATE ratings SET rating = 6 WHERE user_id = 3 AND song_id = 3;

SELECT 'T05 CHECK: username with capitals, spaces and symbols' AS test;
INSERT INTO users (username, email, password_hash, role_id) VALUES ('Bad Name!', 'bad.name@example.com', REPEAT('x', 60), 2);

SELECT 'T06 CHECK: email without @' AS test;
INSERT INTO users (username, email, password_hash, role_id) VALUES ('new_user', 'not-an-email', REPEAT('x', 60), 2);

SELECT 'T07 NOT NULL: mood without a name' AS test;
INSERT INTO moods (category_id, name, emoji, color_hex, description, target_energy, target_valence, target_danceability,
                   target_acousticness, target_instrumentalness, tempo_min, tempo_max)
VALUES (1, NULL, 'x', '#123456', 'test', 0.5, 0.5, 0.5, 0.5, 0.5, 80, 120);

SELECT 'T08 CHECK: a play cannot be both completed and skipped' AS test;
UPDATE listening_history SET completed = 1, skipped = 1 WHERE play_id = 1;

SELECT 'T09 CHECK: mood confidence above 1' AS test;
UPDATE song_moods SET confidence = 1.5 WHERE song_id = 2 AND mood_id = 1 AND model_id = 3;

SELECT 'T10 CHECK: mood colour not a hex code' AS test;
UPDATE moods SET color_hex = 'blue' WHERE mood_id = 1;

SELECT 'T11 CHECK: tempo_min must be below tempo_max' AS test;
UPDATE moods SET tempo_min = 150, tempo_max = 100 WHERE mood_id = 1;

SELECT 'T12 ENUM: origin value not in the list' AS test;
UPDATE listening_history SET origin = 'RADIO' WHERE play_id = 1;

SELECT 'T13 GENERATED COLUMN: cannot be written directly' AS test;
UPDATE albums SET normalized_title = 'x' WHERE album_id = 1;

SELECT 'T14 ON DELETE RESTRICT: role still used by users' AS test;
DELETE FROM roles WHERE role_id = 2;

SELECT 'T15 ON DELETE CASCADE: deleting a playlist removes its playlist_songs rows (rolled back)' AS test;
START TRANSACTION;
SELECT COUNT(*) AS playlist_songs_before FROM playlist_songs WHERE playlist_id = 2;
DELETE FROM playlists WHERE playlist_id = 2;
SELECT COUNT(*) AS playlist_songs_after FROM playlist_songs WHERE playlist_id = 2;
ROLLBACK;

SELECT 'T15b ON DELETE RESTRICT: a listener whose weekly MUSE World exists cannot be deleted' AS test;
DELETE FROM users WHERE user_id = 3;

SELECT 'T16 ON DELETE SET NULL: deleting an album keeps its songs, album_id becomes NULL (rolled back)' AS test;
START TRANSACTION;
SELECT COUNT(*) AS songs_on_album_1_before FROM songs WHERE album_id = 1;
DELETE FROM albums WHERE album_id = 1;
SELECT COUNT(*) AS songs_on_album_1_after, (SELECT COUNT(*) FROM songs) AS songs_total FROM songs WHERE album_id = 1;
ROLLBACK;

SELECT 'T17 GENERATED COLUMN computed by MySQL' AS test;
SELECT album_id, title, normalized_title FROM albums ORDER BY album_id LIMIT 3;

SELECT 'T18 valid insert succeeds (rolled back)' AS test;
START TRANSACTION;
INSERT INTO users (username, email, password_hash, role_id) VALUES ('phase2_test', 'phase2.test@example.com', REPEAT('x', 60), 2);
SELECT user_id, username, is_active, failed_login_count, created_at IS NOT NULL AS created_at_defaulted FROM users WHERE username = 'phase2_test';
ROLLBACK;

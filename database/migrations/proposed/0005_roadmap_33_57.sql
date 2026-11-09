-- =====================================================================
--  0005 (PROPOSED) — database objects for roadmap features 33–57   · revision 2
--  Developed by Vaishnav Sai
--
--  STATUS: PROPOSED. NOT applied to the application database. It lives in
--  database/migrations/proposed/, which backend/scripts/migrate.js does not read
--  (it only applies database/migrations/NNNN_name.sql). Promote it phase by phase
--  (docs/roadmap/FEATURE_REGISTRY.md); it is validated on disposable schemas by
--  backend/scripts/roadmap/test-proposed-migration.js (fresh install, re-run,
--  partial states, interrupted run, grants through the real migration runner).
--
--  Revision 2 changes (review of revision 1):
--    * every added column, CHECK and foreign key is checked and added on its own,
--      so a partially applied earlier run is completed instead of skipped;
--    * the playlists.kind ENUM is extended from its CURRENT definition, so values
--      added by anyone else are kept;
--    * self-follow is refused on INSERT and on UPDATE;
--    * creating a room creates its HOST membership in the same statement (trigger),
--      and the host membership cannot be removed or reassigned;
--    * room lifecycle: allowed states and transitions SCHEDULED → LIVE → ENDED and
--      SCHEDULED → CANCELLED are enforced (CHECKs + trigger); cancelled_at added;
--    * fn_harmonic_compat returns NULL (unknown) for NULL or out-of-range input,
--      never a misleading 0.
--
--  Re-runnable: helper procedures check information_schema before each change;
--  tables use CREATE TABLE IF NOT EXISTS; views CREATE OR REPLACE; the function
--  and triggers created here are dropped and re-created (all of them belong to
--  this migration — no existing object is replaced).
--  Non-destructive: no existing row is changed; new columns are nullable or have
--  defaults that keep current behaviour (playlists and profiles stay PRIVATE).
--
--  Placeholders __DB__, __APP_USER__, __APP_HOST__ are substituted by
--  backend/scripts/placeholders.js, which refuses unsafe values.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Helpers (dropped at the end of this file)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS mig_0005_add_column;
DROP PROCEDURE IF EXISTS mig_0005_add_constraint;
DROP PROCEDURE IF EXISTS mig_0005_append_enum;
DROP PROCEDURE IF EXISTS mig_0005_require_columns;
DELIMITER $$
CREATE PROCEDURE mig_0005_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
CREATE PROCEDURE mig_0005_add_constraint(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_definition VARCHAR(1000))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` ', p_definition);
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
-- Appends one value to an ENUM column, keeping every existing value, NULL-ability and default.
CREATE PROCEDURE mig_0005_append_enum(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_value VARCHAR(40))
BEGIN
  DECLARE v_type TEXT; DECLARE v_null VARCHAR(3); DECLARE v_default TEXT;
  SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT INTO v_type, v_null, v_default
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column;
  IF v_type IS NULL OR v_type NOT LIKE 'enum(%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mig_0005_append_enum: column is not an ENUM';
  END IF;
  IF LOCATE(CONCAT('''', p_value, ''''), v_type) = 0 THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` MODIFY COLUMN `', p_column, '` ',
                          LEFT(v_type, CHAR_LENGTH(v_type) - 1), ',''', p_value, ''')',
                          IF(v_null = 'NO', ' NOT NULL', ' NULL'),
                          IF(v_default IS NULL, '', CONCAT(' DEFAULT ''', v_default, '''')));
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
-- CREATE TABLE IF NOT EXISTS skips a table that already exists, even with a different shape.
-- This stops the migration loudly instead of continuing on a table that lacks expected columns.
CREATE PROCEDURE mig_0005_require_columns(IN p_table VARCHAR(64), IN p_columns VARCHAR(1000))
BEGIN
  DECLARE v_expected INT DEFAULT CHAR_LENGTH(p_columns) - CHAR_LENGTH(REPLACE(p_columns, ',', '')) + 1;
  DECLARE v_found INT;
  SELECT COUNT(*) INTO v_found FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND FIND_IN_SET(COLUMN_NAME, p_columns) > 0;
  IF v_found <> v_expected THEN
    SET @mig_msg = LEFT(CONCAT('0005: existing table ', p_table, ' does not have the expected columns (', p_columns, ')'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @mig_msg;
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
--  Columns and constraints on existing tables — each one independent
-- ---------------------------------------------------------------------
-- 37 Social Profiles, 35 Compatibility Match
CALL mig_0005_add_column('user_profiles', 'bio', 'VARCHAR(300) NULL AFTER display_name');
CALL mig_0005_add_column('user_profiles', 'profile_visibility', "ENUM('PRIVATE','FOLLOWERS','PUBLIC') NOT NULL DEFAULT 'PRIVATE' AFTER bio");
CALL mig_0005_add_column('user_profiles', 'allow_compatibility', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_visibility');
CALL mig_0005_add_constraint('user_profiles', 'chk_up_bio', 'CHECK (bio IS NULL OR CHAR_LENGTH(TRIM(bio)) > 0)');
CALL mig_0005_add_constraint('user_profiles', 'chk_up_allow_compat', 'CHECK (allow_compatibility IN (0, 1))');
-- 34 Collaborative Playlists, 39 Editorial Studio
CALL mig_0005_append_enum('playlists', 'kind', 'EDITORIAL');
CALL mig_0005_add_column('playlists', 'visibility', "ENUM('PRIVATE','COLLABORATORS','PUBLIC') NOT NULL DEFAULT 'PRIVATE'");
CALL mig_0005_add_column('playlists', 'version', 'INT UNSIGNED NOT NULL DEFAULT 1');
CALL mig_0005_add_column('playlists', 'published_at', 'DATETIME NULL');
CALL mig_0005_add_constraint('playlists', 'chk_pl_published', "CHECK (published_at IS NULL OR visibility = 'PUBLIC')");
CALL mig_0005_add_constraint('playlists', 'chk_pl_version', 'CHECK (version >= 1)');
-- 34 Collaborative Playlists: who added each entry (kept as NULL when that user is deleted)
CALL mig_0005_add_column('playlist_songs', 'added_by', 'INT UNSIGNED NULL');
CALL mig_0005_add_constraint('playlist_songs', 'fk_ps_added_by', 'FOREIGN KEY (added_by) REFERENCES users (user_id) ON DELETE SET NULL');
-- 49 Time-Budget Playlist Generator
CALL mig_0005_add_column('recommendation_batches', 'target_duration_sec', 'SMALLINT UNSIGNED NULL');
CALL mig_0005_add_constraint('recommendation_batches', 'chk_rb_target_duration', 'CHECK (target_duration_sec IS NULL OR target_duration_sec BETWEEN 300 AND 21600)');

-- ---------------------------------------------------------------------
--  37 Social Profiles / 35 Compatibility Match — who follows whom
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id INT UNSIGNED NOT NULL,
  followee_id INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followee_id),
  KEY idx_uf_followee (followee_id, created_at),
  CONSTRAINT fk_uf_follower FOREIGN KEY (follower_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_uf_followee FOREIGN KEY (followee_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- MySQL forbids CHECKs on columns with ON DELETE CASCADE, so self-follow is refused by triggers (INSERT and UPDATE).
DROP TRIGGER IF EXISTS trg_uf_bi;
DROP TRIGGER IF EXISTS trg_uf_bu;
DELIMITER $$
CREATE TRIGGER trg_uf_bi BEFORE INSERT ON user_follows FOR EACH ROW
BEGIN
  IF NEW.follower_id = NEW.followee_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A user cannot follow themselves';
  END IF;
END$$
CREATE TRIGGER trg_uf_bu BEFORE UPDATE ON user_follows FOR EACH ROW
BEGIN
  IF NEW.follower_id = NEW.followee_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A user cannot follow themselves';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
--  34 Collaborative Playlists — invited editors and viewers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_collaborators (
  playlist_id  INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  role         ENUM('EDITOR','VIEWER')    NOT NULL DEFAULT 'EDITOR',
  status       ENUM('INVITED','ACCEPTED') NOT NULL DEFAULT 'INVITED',
  invited_by   INT UNSIGNED NULL,
  invited_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at  DATETIME NULL,
  PRIMARY KEY (playlist_id, user_id),
  KEY idx_pc_user (user_id, status),
  KEY idx_pc_inviter (invited_by),
  CONSTRAINT fk_pc_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_user     FOREIGN KEY (user_id)     REFERENCES users (user_id)         ON DELETE CASCADE,
  CONSTRAINT fk_pc_inviter  FOREIGN KEY (invited_by)  REFERENCES users (user_id)         ON DELETE SET NULL,
  CONSTRAINT chk_pc_accepted CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL)),
  CONSTRAINT chk_pc_accept_time CHECK (accepted_at IS NULL OR accepted_at >= invited_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  38 Playlist Notes and Reactions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_notes (
  note_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  playlist_id INT UNSIGNED    NOT NULL,
  song_id     INT UNSIGNED    NULL,                    -- NULL = a note on the playlist itself
  user_id     INT UNSIGNED    NOT NULL,
  body        VARCHAR(500)    NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at   DATETIME        NULL,
  PRIMARY KEY (note_id),
  KEY idx_pn_entry (playlist_id, song_id, created_at),
  KEY idx_pn_user (user_id),
  CONSTRAINT fk_pn_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_pn_entry    FOREIGN KEY (playlist_id, song_id) REFERENCES playlist_songs (playlist_id, song_id) ON DELETE CASCADE,
  CONSTRAINT fk_pn_user     FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_pn_body    CHECK (CHAR_LENGTH(TRIM(body)) >= 1),
  CONSTRAINT chk_pn_edited  CHECK (edited_at IS NULL OR edited_at >= created_at)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS playlist_reactions (
  playlist_id INT UNSIGNED NOT NULL,
  song_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  reaction    ENUM('LIKE','LOVE','FIRE','CALM','TEARS') NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id, song_id, user_id),          -- one reaction per user per entry
  KEY idx_pr_user (user_id),
  CONSTRAINT fk_pr_entry FOREIGN KEY (playlist_id, song_id) REFERENCES playlist_songs (playlist_id, song_id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  33 Listening Rooms / 36 Listening Party Scheduler
--  States: SCHEDULED → LIVE → ENDED, or SCHEDULED → CANCELLED (ENDED and CANCELLED are final).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listening_rooms (
  room_id             BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  host_user_id        INT UNSIGNED      NOT NULL,
  name                VARCHAR(80)       NOT NULL,
  mood_id             SMALLINT UNSIGNED NULL,
  visibility          ENUM('INVITE_ONLY','FOLLOWERS') NOT NULL DEFAULT 'INVITE_ONLY',
  status              ENUM('SCHEDULED','LIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  scheduled_start_at  DATETIME NULL,
  started_at          DATETIME NULL,
  ended_at            DATETIME NULL,
  cancelled_at        DATETIME NULL,
  current_song_id     INT UNSIGNED NULL,
  current_position_ms INT UNSIGNED NULL,
  state_version       INT UNSIGNED NOT NULL DEFAULT 1,   -- UPDATE … WHERE state_version = ? rejects stale playback updates
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id),
  KEY idx_lr_host (host_user_id, status),
  KEY idx_lr_schedule (status, scheduled_start_at),
  KEY idx_lr_mood (mood_id),
  KEY idx_lr_song (current_song_id),
  CONSTRAINT fk_lr_host FOREIGN KEY (host_user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_mood FOREIGN KEY (mood_id)         REFERENCES moods (mood_id) ON DELETE SET NULL,
  CONSTRAINT fk_lr_song FOREIGN KEY (current_song_id) REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT chk_lr_name      CHECK (CHAR_LENGTH(TRIM(name)) >= 1),
  CONSTRAINT chk_lr_scheduled CHECK (status <> 'SCHEDULED' OR (scheduled_start_at IS NOT NULL AND started_at IS NULL AND ended_at IS NULL AND cancelled_at IS NULL)),
  CONSTRAINT chk_lr_live      CHECK (status <> 'LIVE' OR (started_at IS NOT NULL AND ended_at IS NULL AND cancelled_at IS NULL)),
  CONSTRAINT chk_lr_ended     CHECK (status <> 'ENDED' OR (started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at >= started_at AND cancelled_at IS NULL)),
  CONSTRAINT chk_lr_cancelled CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)
                                     AND (status <> 'CANCELLED' OR (started_at IS NULL AND ended_at IS NULL))),
  CONSTRAINT chk_lr_version   CHECK (state_version >= 1)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS listening_room_members (
  room_id    BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED    NOT NULL,
  role       ENUM('HOST','COHOST','LISTENER') NOT NULL DEFAULT 'LISTENER',
  status     ENUM('INVITED','ACCEPTED','DECLINED','JOINED','LEFT') NOT NULL DEFAULT 'INVITED',
  invited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  joined_at  DATETIME NULL,
  left_at    DATETIME NULL,
  PRIMARY KEY (room_id, user_id),
  KEY idx_lrm_user (user_id, status),
  CONSTRAINT fk_lrm_room FOREIGN KEY (room_id) REFERENCES listening_rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_lrm_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_lrm_joined CHECK (status NOT IN ('JOINED','LEFT') OR joined_at IS NOT NULL),
  CONSTRAINT chk_lrm_left   CHECK ((status = 'LEFT') = (left_at IS NOT NULL) AND (left_at IS NULL OR left_at >= joined_at))
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS listening_room_queue (
  room_id   BIGINT UNSIGNED   NOT NULL,
  position  SMALLINT UNSIGNED NOT NULL,
  song_id   INT UNSIGNED      NOT NULL,
  added_by  INT UNSIGNED      NULL,
  added_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, position),
  KEY idx_lrq_song (song_id),
  KEY idx_lrq_user (added_by),
  CONSTRAINT fk_lrq_room FOREIGN KEY (room_id)  REFERENCES listening_rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_lrq_song FOREIGN KEY (song_id)  REFERENCES songs (song_id)           ON DELETE CASCADE,
  CONSTRAINT fk_lrq_user FOREIGN KEY (added_by) REFERENCES users (user_id)           ON DELETE SET NULL,
  CONSTRAINT chk_lrq_position CHECK (position >= 1)
) ENGINE = InnoDB;

DROP TRIGGER IF EXISTS trg_lr_bi;
DROP TRIGGER IF EXISTS trg_lr_ai;
DROP TRIGGER IF EXISTS trg_lr_bu;
DROP TRIGGER IF EXISTS trg_lrm_bi;
DROP TRIGGER IF EXISTS trg_lrm_bu;
DROP TRIGGER IF EXISTS trg_lrm_bd;
DELIMITER $$
-- A room starts SCHEDULED or LIVE; playback state exists only while LIVE.
-- (current_song_id has ON DELETE SET NULL, so MySQL does not allow it in a CHECK.)
CREATE TRIGGER trg_lr_bi BEFORE INSERT ON listening_rooms FOR EACH ROW
BEGIN
  IF NEW.status NOT IN ('SCHEDULED','LIVE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A room must be created SCHEDULED or LIVE';
  END IF;
  IF NEW.status <> 'LIVE' AND (NEW.current_song_id IS NOT NULL OR NEW.current_position_ms IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a LIVE room has a current song';
  END IF;
END$$
-- The host's membership is created by the same INSERT statement, so a room can never exist without its HOST row.
CREATE TRIGGER trg_lr_ai AFTER INSERT ON listening_rooms FOR EACH ROW
BEGIN
  INSERT INTO listening_room_members (room_id, user_id, role, status, joined_at)
  VALUES (NEW.room_id, NEW.host_user_id, 'HOST', IF(NEW.status = 'LIVE', 'JOINED', 'ACCEPTED'), IF(NEW.status = 'LIVE', NOW(), NULL));
END$$
-- Allowed transitions: SCHEDULED→LIVE, SCHEDULED→CANCELLED, LIVE→ENDED. ENDED and CANCELLED are final.
CREATE TRIGGER trg_lr_bu BEFORE UPDATE ON listening_rooms FOR EACH ROW
BEGIN
  IF NEW.host_user_id <> OLD.host_user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The host of a room cannot be changed';
  END IF;
  IF OLD.status IN ('ENDED','CANCELLED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An ended or cancelled room cannot be changed';
  END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status = 'SCHEDULED' AND NEW.status IN ('LIVE','CANCELLED'))
                                       OR (OLD.status = 'LIVE' AND NEW.status = 'ENDED')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room status change not allowed';
  END IF;
  IF NEW.status <> 'LIVE' AND (NEW.current_song_id IS NOT NULL OR NEW.current_position_ms IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a LIVE room has a current song';
  END IF;
END$$
-- The HOST role belongs to the room's host and nobody else; members cannot join a finished room.
CREATE TRIGGER trg_lrm_bi BEFORE INSERT ON listening_room_members FOR EACH ROW
BEGIN
  DECLARE v_host INT UNSIGNED; DECLARE v_status VARCHAR(10);
  SELECT host_user_id, status INTO v_host, v_status FROM listening_rooms WHERE room_id = NEW.room_id;
  IF (NEW.role = 'HOST') <> (NEW.user_id = v_host) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the room host has the HOST role';
  END IF;
  IF v_status IN ('ENDED','CANCELLED') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Members cannot be added to an ended or cancelled room';
  END IF;
END$$
CREATE TRIGGER trg_lrm_bu BEFORE UPDATE ON listening_room_members FOR EACH ROW
BEGIN
  IF NEW.room_id <> OLD.room_id OR NEW.user_id <> OLD.user_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A membership cannot be moved to another room or user';
  END IF;
  IF NEW.role <> OLD.role AND 'HOST' IN (NEW.role, OLD.role) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The HOST role cannot be given or taken away';
  END IF;
END$$
-- Deleting the room (or the host account) removes memberships through ON DELETE CASCADE, which does not fire this trigger.
CREATE TRIGGER trg_lrm_bd BEFORE DELETE ON listening_room_members FOR EACH ROW
BEGIN
  IF OLD.role = 'HOST' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The host membership cannot be removed; end or delete the room instead';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
--  40 Community Metadata Contributions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metadata_suggestions (
  suggestion_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED    NOT NULL,
  song_id        INT UNSIGNED    NOT NULL,
  field_name     ENUM('TITLE','LANGUAGE','ALBUM','PRIMARY_GENRE','RELEASE_YEAR','ARTIST_CREDIT') NOT NULL,
  proposed_value VARCHAR(200)    NOT NULL,
  reason         VARCHAR(300)    NULL,
  status         ENUM('PENDING','ACCEPTED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  decided_by     INT UNSIGNED    NULL,
  decided_at     DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pending_key    VARCHAR(40) GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(user_id, ':', song_id, ':', field_name), NULL)) VIRTUAL,
  PRIMARY KEY (suggestion_id),
  UNIQUE KEY uq_msg_pending (pending_key),
  KEY idx_msg_queue (status, created_at),
  KEY idx_msg_song (song_id),
  KEY idx_msg_user (user_id),
  KEY idx_msg_decider (decided_by),
  CONSTRAINT fk_msg_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_song    FOREIGN KEY (song_id)    REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_decider FOREIGN KEY (decided_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_msg_value   CHECK (CHAR_LENGTH(TRIM(proposed_value)) >= 1),
  CONSTRAINT chk_msg_decided CHECK ((status IN ('PENDING','WITHDRAWN')) = (decided_at IS NULL))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  50 Music Discovery Missions (progress computed by a view, never stored)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discovery_missions (
  mission_id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(40)       NOT NULL,
  title         VARCHAR(80)       NOT NULL,
  description   VARCHAR(300)      NOT NULL,
  criteria_type ENUM('LANGUAGE','GENRE','MOOD','NEW_ARTISTS') NOT NULL,
  language_id   SMALLINT UNSIGNED NULL,
  genre_id      SMALLINT UNSIGNED NULL,
  mood_id       SMALLINT UNSIGNED NULL,
  target_count  TINYINT UNSIGNED  NOT NULL,
  active_from   DATE NOT NULL,
  active_to     DATE NULL,
  PRIMARY KEY (mission_id),
  UNIQUE KEY uq_dm_code (code),
  KEY idx_dm_language (language_id),
  KEY idx_dm_genre (genre_id),
  KEY idx_dm_mood (mood_id),
  CONSTRAINT fk_dm_language FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE RESTRICT,
  CONSTRAINT fk_dm_genre    FOREIGN KEY (genre_id)    REFERENCES genres (genre_id)       ON DELETE RESTRICT,
  CONSTRAINT fk_dm_mood     FOREIGN KEY (mood_id)     REFERENCES moods (mood_id)         ON DELETE RESTRICT,
  CONSTRAINT chk_dm_target  CHECK (target_count BETWEEN 1 AND 100),
  CONSTRAINT chk_dm_window  CHECK (active_to IS NULL OR active_to >= active_from),
  CONSTRAINT chk_dm_criteria CHECK (
       (criteria_type = 'LANGUAGE'    AND language_id IS NOT NULL AND genre_id IS NULL AND mood_id IS NULL)
    OR (criteria_type = 'GENRE'       AND genre_id IS NOT NULL AND language_id IS NULL AND mood_id IS NULL)
    OR (criteria_type = 'MOOD'        AND mood_id IS NOT NULL AND language_id IS NULL AND genre_id IS NULL)
    OR (criteria_type = 'NEW_ARTISTS' AND language_id IS NULL AND genre_id IS NULL AND mood_id IS NULL))
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS user_missions (
  user_id      INT UNSIGNED      NOT NULL,
  mission_id   SMALLINT UNSIGNED NOT NULL,
  joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (user_id, mission_id),
  KEY idx_um_mission (mission_id),
  CONSTRAINT fk_um_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_um_mission FOREIGN KEY (mission_id) REFERENCES discovery_missions (mission_id) ON DELETE CASCADE,
  CONSTRAINT chk_um_done   CHECK (completed_at IS NULL OR completed_at >= joined_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  52 Music Time Capsule
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_capsules (
  capsule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NOT NULL,
  title      VARCHAR(80)     NOT NULL,
  message    VARCHAR(1000)   NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unlock_at  DATETIME        NOT NULL,
  opened_at  DATETIME        NULL,
  PRIMARY KEY (capsule_id),
  KEY idx_tc_user (user_id, unlock_at),
  CONSTRAINT fk_tc_user    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_tc_title  CHECK (CHAR_LENGTH(TRIM(title)) >= 1),
  CONSTRAINT chk_tc_unlock CHECK (unlock_at > created_at),
  CONSTRAINT chk_tc_opened CHECK (opened_at IS NULL OR opened_at >= unlock_at)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS time_capsule_songs (
  capsule_id BIGINT UNSIGNED   NOT NULL,
  song_id    INT UNSIGNED      NOT NULL,
  position   SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (capsule_id, song_id),
  UNIQUE KEY uq_tcs_position (capsule_id, position),
  KEY idx_tcs_song (song_id),
  CONSTRAINT fk_tcs_capsule FOREIGN KEY (capsule_id) REFERENCES time_capsules (capsule_id) ON DELETE CASCADE,
  CONSTRAINT fk_tcs_song    FOREIGN KEY (song_id)    REFERENCES songs (song_id)            ON DELETE CASCADE,
  CONSTRAINT chk_tcs_position CHECK (position >= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  53 Seasonal and Occasion Mixes (dates per year: festival dates move)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS occasions (
  occasion_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(30)       NOT NULL,
  name        VARCHAR(60)       NOT NULL,
  description VARCHAR(300)      NOT NULL,
  region_code VARCHAR(6)        NULL,
  PRIMARY KEY (occasion_id),
  UNIQUE KEY uq_occ_code (code),
  KEY idx_occ_region (region_code),
  CONSTRAINT fk_occ_region FOREIGN KEY (region_code) REFERENCES regions (region_code) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS occasion_windows (
  occasion_id SMALLINT UNSIGNED NOT NULL,
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  PRIMARY KEY (occasion_id, starts_on),
  KEY idx_ow_dates (starts_on, ends_on),
  CONSTRAINT fk_ow_occasion FOREIGN KEY (occasion_id) REFERENCES occasions (occasion_id) ON DELETE CASCADE,
  CONSTRAINT chk_ow_range   CHECK (ends_on >= starts_on AND DATEDIFF(ends_on, starts_on) <= 60)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS occasion_moods (
  occasion_id SMALLINT UNSIGNED NOT NULL,
  mood_id     SMALLINT UNSIGNED NOT NULL,
  weight      DECIMAL(4,3)      NOT NULL,
  PRIMARY KEY (occasion_id, mood_id),
  KEY idx_om_mood (mood_id),
  CONSTRAINT fk_om_occasion FOREIGN KEY (occasion_id) REFERENCES occasions (occasion_id) ON DELETE CASCADE,
  CONSTRAINT fk_om_mood     FOREIGN KEY (mood_id)     REFERENCES moods (mood_id)         ON DELETE CASCADE,
  CONSTRAINT chk_om_weight  CHECK (weight > 0 AND weight <= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  47 Intelligent Song Transitions, 57 Accessibility and Inclusive Mode
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           INT UNSIGNED NOT NULL,
  crossfade_sec     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  reduced_motion    ENUM('SYSTEM','ON','OFF') NOT NULL DEFAULT 'SYSTEM',
  high_contrast     TINYINT(1) NOT NULL DEFAULT 0,
  text_scale        DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  captions_enabled  TINYINT(1) NOT NULL DEFAULT 0,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_us_user        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_us_crossfade  CHECK (crossfade_sec <= 12),
  CONSTRAINT chk_us_text_scale CHECK (text_scale BETWEEN 0.85 AND 1.60),
  CONSTRAINT chk_us_flags      CHECK (high_contrast IN (0, 1) AND captions_enabled IN (0, 1))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  48 BPM and Harmonic Matching — Camelot-wheel compatibility of two keys.
--  musical_key = pitch class 0–11 (C = 0), mode = 1 major / 0 minor (as in audio_features).
--  Returns 1.00 same key, 0.80 adjacent or relative key, 0.40 two steps, 0.00 clash,
--  and NULL when any input is NULL or out of range (unknown is not the same as a clash).
--  INT parameters so out-of-range values reach the range check instead of being truncated.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_harmonic_compat;
DELIMITER $$
CREATE FUNCTION fn_harmonic_compat(p_key1 INT, p_mode1 INT, p_key2 INT, p_mode2 INT) RETURNS DECIMAL(3,2)
DETERMINISTIC NO SQL
BEGIN
  DECLARE n1, n2, d INT;
  IF p_key1 IS NULL OR p_key2 IS NULL OR p_mode1 IS NULL OR p_mode2 IS NULL THEN RETURN NULL; END IF;
  IF p_key1 NOT BETWEEN 0 AND 11 OR p_key2 NOT BETWEEN 0 AND 11 OR p_mode1 NOT IN (0, 1) OR p_mode2 NOT IN (0, 1) THEN RETURN NULL; END IF;
  -- Camelot number: major key k -> ((7k mod 12) + 7) mod 12 + 1; a minor key uses its relative major (k + 3)
  SET n1 = MOD(MOD(7 * IF(p_mode1 = 1, p_key1, p_key1 + 3), 12) + 7, 12) + 1;
  SET n2 = MOD(MOD(7 * IF(p_mode2 = 1, p_key2, p_key2 + 3), 12) + 7, 12) + 1;
  SET d = LEAST(ABS(n1 - n2), 12 - ABS(n1 - n2));
  IF p_mode1 = p_mode2 THEN
    RETURN CASE d WHEN 0 THEN 1.00 WHEN 1 THEN 0.80 WHEN 2 THEN 0.40 ELSE 0.00 END;
  END IF;
  RETURN IF(d = 0, 0.80, 0.00);
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
--  51 Music Discovery Passport — derived entirely from completed plays (no table)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_discovery_passport AS
SELECT lh.user_id, 'LANGUAGE' AS stamp_type, l.name AS stamp, MIN(lh.started_at) AS first_heard_at,
       COUNT(*) AS completed_plays, COUNT(DISTINCT lh.song_id) AS songs
  FROM listening_history lh
  JOIN songs s     ON s.song_id = lh.song_id
  JOIN languages l ON l.language_id = s.language_id
 WHERE lh.completed = 1
 GROUP BY lh.user_id, l.language_id, l.name
UNION ALL
SELECT lh.user_id, 'GENRE', g.name, MIN(lh.started_at), COUNT(*), COUNT(DISTINCT lh.song_id)
  FROM listening_history lh
  JOIN song_genres sg ON sg.song_id = lh.song_id AND sg.is_primary = 1
  JOIN genres g       ON g.genre_id = sg.genre_id
 WHERE lh.completed = 1
 GROUP BY lh.user_id, g.genre_id, g.name
UNION ALL
SELECT lh.user_id, 'REGION', r.name, MIN(lh.started_at), COUNT(*), COUNT(DISTINCT lh.song_id)
  FROM listening_history lh
  JOIN songs s   ON s.song_id = lh.song_id
  JOIN artists a ON a.artist_id = s.primary_artist_id
  JOIN regions r ON r.region_code = a.region_code
 WHERE lh.completed = 1
 GROUP BY lh.user_id, r.region_code, r.name;

-- 50 Missions: progress = distinct qualifying songs (or new artists) completed since joining
CREATE OR REPLACE VIEW v_user_mission_progress AS
SELECT um.user_id, dm.mission_id, dm.code, dm.title, dm.target_count, um.joined_at, um.completed_at,
       ( SELECT COUNT(DISTINCT IF(dm.criteria_type = 'NEW_ARTISTS', s.primary_artist_id, lh.song_id))
           FROM listening_history lh
           JOIN songs s ON s.song_id = lh.song_id
          WHERE lh.user_id = um.user_id AND lh.completed = 1 AND lh.started_at >= um.joined_at
            AND (   (dm.criteria_type = 'LANGUAGE' AND s.language_id = dm.language_id)
                 OR (dm.criteria_type = 'GENRE' AND EXISTS (SELECT 1 FROM song_genres sg
                                                             WHERE sg.song_id = s.song_id AND sg.genre_id = dm.genre_id))
                 OR (dm.criteria_type = 'MOOD' AND EXISTS (SELECT 1 FROM song_moods sm
                                                            JOIN intelligence_models im ON im.model_id = sm.model_id AND im.is_active = 1
                                                           WHERE sm.song_id = s.song_id AND sm.mood_id = dm.mood_id))
                 OR (dm.criteria_type = 'NEW_ARTISTS' AND NOT EXISTS (
                       SELECT 1 FROM listening_history old JOIN songs os ON os.song_id = old.song_id
                        WHERE old.user_id = um.user_id AND old.started_at < um.joined_at
                          AND os.primary_artist_id = s.primary_artist_id)) )
       ) AS progress_count
  FROM user_missions um
  JOIN discovery_missions dm ON dm.mission_id = um.mission_id;

-- ---------------------------------------------------------------------
--  Shape check of every table this migration creates (detects a pre-existing table of the same name)
-- ---------------------------------------------------------------------
CALL mig_0005_require_columns('user_follows', 'follower_id,followee_id,created_at');
CALL mig_0005_require_columns('playlist_collaborators', 'playlist_id,user_id,role,status,invited_by,invited_at,accepted_at');
CALL mig_0005_require_columns('playlist_notes', 'note_id,playlist_id,song_id,user_id,body,created_at,edited_at');
CALL mig_0005_require_columns('playlist_reactions', 'playlist_id,song_id,user_id,reaction,created_at');
CALL mig_0005_require_columns('listening_rooms', 'room_id,host_user_id,name,mood_id,visibility,status,scheduled_start_at,started_at,ended_at,cancelled_at,current_song_id,current_position_ms,state_version,created_at');
CALL mig_0005_require_columns('listening_room_members', 'room_id,user_id,role,status,invited_at,joined_at,left_at');
CALL mig_0005_require_columns('listening_room_queue', 'room_id,position,song_id,added_by,added_at');
CALL mig_0005_require_columns('metadata_suggestions', 'suggestion_id,user_id,song_id,field_name,proposed_value,reason,status,decided_by,decided_at,created_at,pending_key');
CALL mig_0005_require_columns('discovery_missions', 'mission_id,code,title,description,criteria_type,language_id,genre_id,mood_id,target_count,active_from,active_to');
CALL mig_0005_require_columns('user_missions', 'user_id,mission_id,joined_at,completed_at');
CALL mig_0005_require_columns('time_capsules', 'capsule_id,user_id,title,message,created_at,unlock_at,opened_at');
CALL mig_0005_require_columns('time_capsule_songs', 'capsule_id,song_id,position');
CALL mig_0005_require_columns('occasions', 'occasion_id,code,name,description,region_code');
CALL mig_0005_require_columns('occasion_windows', 'occasion_id,starts_on,ends_on');
CALL mig_0005_require_columns('occasion_moods', 'occasion_id,mood_id,weight');
CALL mig_0005_require_columns('user_settings', 'user_id,crossfade_sec,reduced_motion,high_contrast,text_scale,captions_enabled,updated_at');

DROP PROCEDURE mig_0005_add_column;
DROP PROCEDURE mig_0005_add_constraint;
DROP PROCEDURE mig_0005_append_enum;
DROP PROCEDURE mig_0005_require_columns;

-- ---------------------------------------------------------------------
--  Least-privilege grants for the application account
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON __DB__.user_follows TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playlist_collaborators TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playlist_notes TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.playlist_reactions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_rooms TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_room_members TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_room_queue TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE ON __DB__.metadata_suggestions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.discovery_missions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.user_missions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.time_capsules TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.time_capsule_songs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.occasions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.occasion_windows TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.occasion_moods TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE ON __DB__.user_settings TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.v_discovery_passport TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.v_user_mission_progress TO '__APP_USER__'@'__APP_HOST__';
GRANT EXECUTE ON FUNCTION __DB__.fn_harmonic_compat TO '__APP_USER__'@'__APP_HOST__';

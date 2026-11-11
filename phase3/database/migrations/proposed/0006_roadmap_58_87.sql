-- =====================================================================
--  0006 (PROPOSED) — database objects for roadmap features 58–87
--  Developed by Vaishnav Sai
--
--  STATUS: PROPOSED. NOT applied anywhere except disposable test schemas
--  (backend/scripts/roadmap/test-proposed-migration.js). Requires 0005.
--
--  Scope was decided feature by feature (docs/roadmap/FEATURE_REGISTRY.md).
--  Most of 58–87 need NO schema change — they are computed from existing tables
--  or live in the client:
--    58 autopilot, 59/72 radio  → recommendation_batches (+2 ENUM values, seed_artist_id)
--    60 sleep timer, 61 focus timer, 73 sharing cards  → client only (plays still logged as today)
--    64 health score, 65 duplicate cleaner, 68 alternative finder → computed queries
--    67 conflict resolver → playlists.version (0005) + playlist_revisions (below)
--    76 device manager → auth_sessions (already implemented)
--    80 data export → read-only query of the caller's own rows, streamed as a download
--    83 migration history → schema_migrations;  84 API health → in-process metrics + /admin/health
--    87 performance lab → existing EXPLAIN lab; load testing runs outside the database
--  Provider/platform-blocked features add NOTHING here: 62 quality selector, 70 release radar,
--  78 API connections, 81 recovery e-mail (password_reset_tokens waits for a mail provider).
--
--  Objects (14 tables, 3 columns, 5 ENUM values, 5 triggers for rules that span tables):
--    63 listening_bookmarks · 66 playlist_revisions, playlist_revision_songs · 69 playlist_share_links
--    71 artist_follows, notifications · 74 playlist_saves · 75 collection_submissions · 77 login_events
--    79 retention_policies, user_settings.history_retention_days · 85 experiments, experiment_arms,
--       recommendation_batches.experiment_arm_id · 86 feature_flags, feature_flag_overrides
--    59 recommendation_batches.seed_artist_id, strategy += AUTOPILOT, RADIO
--    79/82 pipeline_jobs.job_type += DATABASE_BACKUP, BACKUP_VERIFY, DATA_RETENTION
--
--  Same rules as 0005: every column / constraint / ENUM value is checked and added on its own,
--  tables are CREATE IF NOT EXISTS and their shape is verified, triggers and helpers belong to
--  this file only, no existing row is changed, new behaviour is off by default.
-- =====================================================================

DROP PROCEDURE IF EXISTS mig_0006_add_column;
DROP PROCEDURE IF EXISTS mig_0006_add_constraint;
DROP PROCEDURE IF EXISTS mig_0006_append_enum;
DROP PROCEDURE IF EXISTS mig_0006_require_columns;
DELIMITER $$
CREATE PROCEDURE mig_0006_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
CREATE PROCEDURE mig_0006_add_constraint(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_definition VARCHAR(1000))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` ', p_definition);
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
CREATE PROCEDURE mig_0006_append_enum(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_value VARCHAR(40))
BEGIN
  DECLARE v_type TEXT; DECLARE v_null VARCHAR(3); DECLARE v_default TEXT;
  SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT INTO v_type, v_null, v_default
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column;
  IF v_type IS NULL OR v_type NOT LIKE 'enum(%' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mig_0006_append_enum: column is not an ENUM';
  END IF;
  IF LOCATE(CONCAT('''', p_value, ''''), v_type) = 0 THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` MODIFY COLUMN `', p_column, '` ',
                          LEFT(v_type, CHAR_LENGTH(v_type) - 1), ',''', p_value, ''')',
                          IF(v_null = 'NO', ' NOT NULL', ' NULL'),
                          IF(v_default IS NULL, '', CONCAT(' DEFAULT ''', v_default, '''')));
    PREPARE mig_stmt FROM @mig_sql; EXECUTE mig_stmt; DEALLOCATE PREPARE mig_stmt;
  END IF;
END$$
CREATE PROCEDURE mig_0006_require_columns(IN p_table VARCHAR(64), IN p_columns VARCHAR(1000))
BEGIN
  DECLARE v_expected INT DEFAULT CHAR_LENGTH(p_columns) - CHAR_LENGTH(REPLACE(p_columns, ',', '')) + 1;
  DECLARE v_found INT;
  SELECT COUNT(*) INTO v_found FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND FIND_IN_SET(COLUMN_NAME, p_columns) > 0;
  IF v_found <> v_expected THEN
    SET @mig_msg = LEFT(CONCAT('0006: table ', p_table, ' does not have the expected columns (', p_columns, ')'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @mig_msg;
  END IF;
END$$
DELIMITER ;

-- 0006 builds on 0005 (playlists.version, user_settings): stop before changing anything if it is missing.
CALL mig_0006_require_columns('playlists', 'visibility,version');
CALL mig_0006_require_columns('user_settings', 'user_id');

-- ---------------------------------------------------------------------
--  85 Recommendation A/B Testing — experiments and their arms.
--  Assignment is deterministic (hash of user and experiment), so it is not stored;
--  the arm that produced a list is recorded on recommendation_batches.experiment_arm_id.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS experiments (
  experiment_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(40)  NOT NULL,
  hypothesis    VARCHAR(300) NOT NULL,
  status        ENUM('DRAFT','RUNNING','STOPPED') NOT NULL DEFAULT 'DRAFT',
  started_at    DATETIME NULL,
  stopped_at    DATETIME NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (experiment_id),
  UNIQUE KEY uq_exp_code (code),
  KEY idx_exp_creator (created_by),
  CONSTRAINT fk_exp_creator FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_exp_code   CHECK (REGEXP_LIKE(code, '^[a-z0-9_-]{3,40}$', 'c')),
  CONSTRAINT chk_exp_state  CHECK ((status = 'DRAFT' AND started_at IS NULL AND stopped_at IS NULL)
                              OR (status = 'RUNNING' AND started_at IS NOT NULL AND stopped_at IS NULL)
                              OR (status = 'STOPPED' AND started_at IS NOT NULL AND stopped_at >= started_at))
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS experiment_arms (
  arm_id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  experiment_id   SMALLINT UNSIGNED NOT NULL,
  code            VARCHAR(20)       NOT NULL,
  model_id        SMALLINT UNSIGNED NOT NULL,      -- which recommender version this arm serves
  traffic_percent TINYINT UNSIGNED  NOT NULL,
  PRIMARY KEY (arm_id),
  UNIQUE KEY uq_arm_code (experiment_id, code),
  KEY idx_arm_model (model_id),
  CONSTRAINT fk_arm_experiment FOREIGN KEY (experiment_id) REFERENCES experiments (experiment_id) ON DELETE CASCADE,
  CONSTRAINT fk_arm_model      FOREIGN KEY (model_id) REFERENCES intelligence_models (model_id) ON DELETE RESTRICT,
  CONSTRAINT chk_arm_traffic   CHECK (traffic_percent BETWEEN 1 AND 100)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  Columns and ENUM values on existing tables — each one independent
-- ---------------------------------------------------------------------
CALL mig_0006_append_enum('recommendation_batches', 'strategy', 'AUTOPILOT');      -- 58
CALL mig_0006_append_enum('recommendation_batches', 'strategy', 'RADIO');          -- 59, 72
CALL mig_0006_add_column('recommendation_batches', 'seed_artist_id', 'INT UNSIGNED NULL AFTER seed_song_id');
CALL mig_0006_add_constraint('recommendation_batches', 'fk_rb_seed_artist', 'FOREIGN KEY (seed_artist_id) REFERENCES artists (artist_id) ON DELETE SET NULL');
CALL mig_0006_add_column('recommendation_batches', 'experiment_arm_id', 'SMALLINT UNSIGNED NULL');
CALL mig_0006_add_constraint('recommendation_batches', 'fk_rb_experiment_arm', 'FOREIGN KEY (experiment_arm_id) REFERENCES experiment_arms (arm_id) ON DELETE SET NULL');
CALL mig_0006_append_enum('pipeline_jobs', 'job_type', 'DATABASE_BACKUP');          -- 82
CALL mig_0006_append_enum('pipeline_jobs', 'job_type', 'BACKUP_VERIFY');            -- 82
CALL mig_0006_append_enum('pipeline_jobs', 'job_type', 'DATA_RETENTION');           -- 79
-- 79: NULL = keep listening history until the user deletes it (today's behaviour)
CALL mig_0006_add_column('user_settings', 'history_retention_days', 'SMALLINT UNSIGNED NULL');
CALL mig_0006_add_constraint('user_settings', 'chk_us_retention', 'CHECK (history_retention_days IS NULL OR history_retention_days BETWEEN 30 AND 3650)');

-- ---------------------------------------------------------------------
--  63 Listening Session Bookmarks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listening_bookmarks (
  bookmark_id  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED      NOT NULL,
  song_id      INT UNSIGNED      NOT NULL,
  position_sec SMALLINT UNSIGNED NOT NULL,
  note         VARCHAR(200)      NULL,
  created_at   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bookmark_id),
  UNIQUE KEY uq_lb_moment (user_id, song_id, position_sec),
  KEY idx_lb_song (song_id),
  CONSTRAINT fk_lb_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_lb_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE CASCADE,
  CONSTRAINT chk_lb_note CHECK (note IS NULL OR CHAR_LENGTH(TRIM(note)) >= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  66 Playlist Version History, 67 Conflict Resolver — a snapshot per saved version
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_revisions (
  revision_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  playlist_id  INT UNSIGNED    NOT NULL,
  version      INT UNSIGNED    NOT NULL,               -- playlists.version this snapshot captured
  name         VARCHAR(80)     NOT NULL,
  description  VARCHAR(255)    NULL,
  reason       ENUM('EDIT','RESTORE','CONFLICT_MERGE') NOT NULL DEFAULT 'EDIT',
  created_by   INT UNSIGNED    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (revision_id),
  UNIQUE KEY uq_pr_version (playlist_id, version),
  KEY idx_pr_creator (created_by),
  CONSTRAINT fk_pr_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_creator  FOREIGN KEY (created_by)  REFERENCES users (user_id)         ON DELETE SET NULL,
  CONSTRAINT chk_pr_version CHECK (version >= 1)
) ENGINE = InnoDB;

-- song_id has no FK on purpose: a snapshot must still show a song that was later removed from the catalogue
-- (the restore API skips songs that no longer exist). Title is kept for display.
CREATE TABLE IF NOT EXISTS playlist_revision_songs (
  revision_id BIGINT UNSIGNED   NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL,
  song_id     INT UNSIGNED      NOT NULL,
  song_title  VARCHAR(150)      NOT NULL,
  PRIMARY KEY (revision_id, position),
  UNIQUE KEY uq_prs_song (revision_id, song_id),
  CONSTRAINT fk_prs_revision FOREIGN KEY (revision_id) REFERENCES playlist_revisions (revision_id) ON DELETE CASCADE,
  CONSTRAINT chk_prs_position CHECK (position >= 1)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  69 QR Playlist Sharing, 73 Sharing Cards — revocable, expiring links.
--  Only a SHA-256 hash of the token is stored; the token itself is shown once.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_share_links (
  link_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  playlist_id INT UNSIGNED    NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  created_by  INT UNSIGNED    NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME        NOT NULL,
  revoked_at  DATETIME        NULL,
  open_count  INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id),
  UNIQUE KEY uq_psl_token (token_hash),
  KEY idx_psl_playlist (playlist_id, revoked_at),
  KEY idx_psl_creator (created_by),
  CONSTRAINT fk_psl_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_psl_creator  FOREIGN KEY (created_by)  REFERENCES users (user_id)         ON DELETE CASCADE,
  CONSTRAINT chk_psl_token   CHECK (REGEXP_LIKE(token_hash, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT chk_psl_expiry  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL 90 DAY),
  CONSTRAINT chk_psl_revoked CHECK (revoked_at IS NULL OR revoked_at >= created_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  74 Curator Leaderboard (and "saved playlists" in the library)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_saves (
  user_id     INT UNSIGNED NOT NULL,
  playlist_id INT UNSIGNED NOT NULL,
  saved_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, playlist_id),
  KEY idx_psv_playlist (playlist_id, saved_at),
  CONSTRAINT fk_psv_user     FOREIGN KEY (user_id)     REFERENCES users (user_id)         ON DELETE CASCADE,
  CONSTRAINT fk_psv_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  70/71 Artist follows and in-app notifications (no push or e-mail: those are provider/platform-blocked)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artist_follows (
  user_id     INT UNSIGNED NOT NULL,
  artist_id   INT UNSIGNED NOT NULL,
  notify      TINYINT(1)   NOT NULL DEFAULT 1,
  followed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, artist_id),
  KEY idx_af_artist (artist_id, notify),
  CONSTRAINT fk_af_user   FOREIGN KEY (user_id)   REFERENCES users (user_id)     ON DELETE CASCADE,
  CONSTRAINT fk_af_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE,
  CONSTRAINT chk_af_notify CHECK (notify IN (0, 1))
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED    NOT NULL,
  kind            ENUM('ARTIST_NEW_SONG','PLAYLIST_INVITE','ROOM_REMINDER','SUGGESTION_DECIDED','SECURITY') NOT NULL,
  title           VARCHAR(120)    NOT NULL,
  body            VARCHAR(300)    NULL,
  link_path       VARCHAR(200)    NULL,       -- in-app path only, e.g. /songs/42
  dedupe_key      VARCHAR(80)     NOT NULL,   -- makes fan-out jobs idempotent
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME        NULL,
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_ntf_dedupe (user_id, dedupe_key),
  KEY idx_ntf_inbox (user_id, read_at, created_at),
  CONSTRAINT fk_ntf_user  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_ntf_title CHECK (CHAR_LENGTH(TRIM(title)) >= 1),
  CONSTRAINT chk_ntf_link  CHECK (link_path IS NULL OR REGEXP_LIKE(link_path, '^/[A-Za-z0-9/_?=&.-]*$', 'c')),
  CONSTRAINT chk_ntf_read  CHECK (read_at IS NULL OR read_at >= created_at)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  75 Community Music Collections — a collection is an EDITORIAL playlist (0005); listeners submit songs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_submissions (
  submission_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  playlist_id   INT UNSIGNED    NOT NULL,
  song_id       INT UNSIGNED    NOT NULL,
  user_id       INT UNSIGNED    NOT NULL,
  note          VARCHAR(200)    NULL,
  status        ENUM('PENDING','ACCEPTED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  decided_by    INT UNSIGNED    NULL,
  decided_at    DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pending_key   VARCHAR(30) GENERATED ALWAYS AS (IF(status = 'PENDING', CONCAT(playlist_id, ':', song_id), NULL)) VIRTUAL,
  PRIMARY KEY (submission_id),
  UNIQUE KEY uq_cs_pending (pending_key),               -- one open submission per song per collection
  KEY idx_cs_queue (playlist_id, status, created_at),
  KEY idx_cs_song (song_id),
  KEY idx_cs_user (user_id),
  KEY idx_cs_decider (decided_by),
  CONSTRAINT fk_cs_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_song     FOREIGN KEY (song_id)     REFERENCES songs (song_id)         ON DELETE CASCADE,
  CONSTRAINT fk_cs_user     FOREIGN KEY (user_id)     REFERENCES users (user_id)         ON DELETE CASCADE,
  CONSTRAINT fk_cs_decider  FOREIGN KEY (decided_by)  REFERENCES users (user_id)         ON DELETE SET NULL,
  CONSTRAINT chk_cs_decided CHECK ((status IN ('PENDING','WITHDRAWN')) = (decided_at IS NULL))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  77 Login Activity Timeline, 81 Security Centre — sign-in attempts.
--  auth_sessions only holds successful sign-ins and is purged after 30 days; failed attempts
--  were only a counter. No password, no raw IP (SHA-256 as in auth_sessions), no attempted username.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_events (
  event_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED    NOT NULL,        -- attempts on unknown usernames are not stored
  outcome     ENUM('SUCCESS','WRONG_PASSWORD','LOCKED','DEACTIVATED','SIGNED_OUT_EVERYWHERE','PASSWORD_CHANGED') NOT NULL,
  session_id  CHAR(16)        NULL,            -- the session a SUCCESS created (kept after the session is purged)
  user_agent  VARCHAR(160)    NULL,
  ip_hash     CHAR(64)        NULL,
  occurred_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_le_user_time (user_id, occurred_at),
  KEY idx_le_time (occurred_at),
  CONSTRAINT fk_le_user    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_le_session CHECK ((outcome = 'SUCCESS') = (session_id IS NOT NULL)),
  CONSTRAINT chk_le_ip     CHECK (ip_hash IS NULL OR REGEXP_LIKE(ip_hash, '^[0-9a-f]{64}$', 'c'))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  79 Automatic Data Retention Rules — one row per data class. Classes that are not purged
--  today start DISABLED, so applying the migration changes no behaviour.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retention_policies (
  data_class  ENUM('ENDED_AUTH_SESSIONS','LOGIN_EVENTS','READ_NOTIFICATIONS','SEARCH_HISTORY','PIPELINE_JOB_LOGS','EXPIRED_SHARE_LINKS') NOT NULL,
  keep_days   SMALLINT UNSIGNED NOT NULL,
  is_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (data_class),
  KEY idx_rp_updater (updated_by),
  CONSTRAINT fk_rp_updater FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_rp_days   CHECK (keep_days BETWEEN 1 AND 3650),
  CONSTRAINT chk_rp_flag   CHECK (is_enabled IN (0, 1))
) ENGINE = InnoDB;
-- ENDED_AUTH_SESSIONS mirrors sessionService.purgeEnded(30), which already runs today.
INSERT IGNORE INTO retention_policies (data_class, keep_days, is_enabled) VALUES
  ('ENDED_AUTH_SESSIONS', 30, 1), ('LOGIN_EVENTS', 180, 0), ('READ_NOTIFICATIONS', 90, 0),
  ('SEARCH_HISTORY', 365, 0), ('PIPELINE_JOB_LOGS', 365, 0), ('EXPIRED_SHARE_LINKS', 30, 0);

-- ---------------------------------------------------------------------
--  86 Feature Flag Manager
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_code       VARCHAR(40)      NOT NULL,
  description     VARCHAR(200)     NOT NULL,
  is_enabled      TINYINT(1)       NOT NULL DEFAULT 0,
  rollout_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- share of users, by stable hash, when enabled
  updated_by      INT UNSIGNED     NULL,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (flag_code),
  KEY idx_ff_updater (updated_by),
  CONSTRAINT fk_ff_updater FOREIGN KEY (updated_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_ff_code   CHECK (REGEXP_LIKE(flag_code, '^[a-z0-9_.-]{3,40}$', 'c')),
  CONSTRAINT chk_ff_rollout CHECK (rollout_percent <= 100 AND is_enabled IN (0, 1))
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  flag_code  VARCHAR(40)  NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  is_enabled TINYINT(1)   NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (flag_code, user_id),
  KEY idx_ffo_user (user_id),
  CONSTRAINT fk_ffo_flag FOREIGN KEY (flag_code) REFERENCES feature_flags (flag_code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ffo_user FOREIGN KEY (user_id)   REFERENCES users (user_id)           ON DELETE CASCADE,
  CONSTRAINT chk_ffo_flag CHECK (is_enabled IN (0, 1))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  Cross-table rules (MySQL CHECKs cannot read other tables)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_lb_bi;
DROP TRIGGER IF EXISTS trg_lb_bu;
DROP TRIGGER IF EXISTS trg_cs_bi;
DROP TRIGGER IF EXISTS trg_arm_bi;
DROP TRIGGER IF EXISTS trg_arm_bu;
DELIMITER $$
-- 63: a bookmark is a permanent record, so it follows the private-session rule of listening_history,
--     and it must point inside the song.
CREATE TRIGGER trg_lb_bi BEFORE INSERT ON listening_bookmarks FOR EACH ROW
BEGIN
  DECLARE v_dur SMALLINT UNSIGNED;
  IF EXISTS (SELECT 1 FROM incognito_sessions WHERE user_id = NEW.user_id AND status = 'ACTIVE' AND expires_at > NOW()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Private session is active: bookmarks are not saved';
  END IF;
  SELECT duration_sec INTO v_dur FROM songs WHERE song_id = NEW.song_id;
  IF v_dur IS NOT NULL AND NEW.position_sec > v_dur THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bookmark position is beyond the end of the song';
  END IF;
END$$
CREATE TRIGGER trg_lb_bu BEFORE UPDATE ON listening_bookmarks FOR EACH ROW
BEGIN
  DECLARE v_dur SMALLINT UNSIGNED;
  IF NEW.user_id <> OLD.user_id OR NEW.song_id <> OLD.song_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A bookmark cannot be moved to another user or song';
  END IF;
  SELECT duration_sec INTO v_dur FROM songs WHERE song_id = NEW.song_id;
  IF v_dur IS NOT NULL AND NEW.position_sec > v_dur THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bookmark position is beyond the end of the song';
  END IF;
END$$
-- 75: submissions are only accepted into EDITORIAL playlists that are PUBLIC
CREATE TRIGGER trg_cs_bi BEFORE INSERT ON collection_submissions FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM playlists WHERE playlist_id = NEW.playlist_id AND kind = 'EDITORIAL' AND visibility = 'PUBLIC') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Songs can only be submitted to a public editorial collection';
  END IF;
END$$
-- 85: the arms of one experiment may not take more than 100 % of traffic
CREATE TRIGGER trg_arm_bi BEFORE INSERT ON experiment_arms FOR EACH ROW
BEGIN
  IF (SELECT COALESCE(SUM(traffic_percent), 0) FROM experiment_arms WHERE experiment_id = NEW.experiment_id) + NEW.traffic_percent > 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Experiment arms cannot exceed 100 percent of traffic';
  END IF;
END$$
CREATE TRIGGER trg_arm_bu BEFORE UPDATE ON experiment_arms FOR EACH ROW
BEGIN
  IF NEW.experiment_id <> OLD.experiment_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An arm cannot move to another experiment';
  END IF;
  IF (SELECT COALESCE(SUM(traffic_percent), 0) FROM experiment_arms WHERE experiment_id = NEW.experiment_id AND arm_id <> OLD.arm_id) + NEW.traffic_percent > 100 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Experiment arms cannot exceed 100 percent of traffic';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
--  Shape check of every table this migration creates
-- ---------------------------------------------------------------------
CALL mig_0006_require_columns('experiments', 'experiment_id,code,hypothesis,status,started_at,stopped_at,created_by,created_at');
CALL mig_0006_require_columns('experiment_arms', 'arm_id,experiment_id,code,model_id,traffic_percent');
CALL mig_0006_require_columns('listening_bookmarks', 'bookmark_id,user_id,song_id,position_sec,note,created_at');
CALL mig_0006_require_columns('playlist_revisions', 'revision_id,playlist_id,version,name,description,reason,created_by,created_at');
CALL mig_0006_require_columns('playlist_revision_songs', 'revision_id,position,song_id,song_title');
CALL mig_0006_require_columns('playlist_share_links', 'link_id,playlist_id,token_hash,created_by,created_at,expires_at,revoked_at,open_count');
CALL mig_0006_require_columns('playlist_saves', 'user_id,playlist_id,saved_at');
CALL mig_0006_require_columns('artist_follows', 'user_id,artist_id,notify,followed_at');
CALL mig_0006_require_columns('notifications', 'notification_id,user_id,kind,title,body,link_path,dedupe_key,created_at,read_at');
CALL mig_0006_require_columns('collection_submissions', 'submission_id,playlist_id,song_id,user_id,note,status,decided_by,decided_at,created_at,pending_key');
CALL mig_0006_require_columns('login_events', 'event_id,user_id,outcome,session_id,user_agent,ip_hash,occurred_at');
CALL mig_0006_require_columns('retention_policies', 'data_class,keep_days,is_enabled,updated_by,updated_at');
CALL mig_0006_require_columns('feature_flags', 'flag_code,description,is_enabled,rollout_percent,updated_by,updated_at');
CALL mig_0006_require_columns('feature_flag_overrides', 'flag_code,user_id,is_enabled,created_at');

DROP PROCEDURE mig_0006_add_column;
DROP PROCEDURE mig_0006_add_constraint;
DROP PROCEDURE mig_0006_append_enum;
DROP PROCEDURE mig_0006_require_columns;

-- ---------------------------------------------------------------------
--  Least-privilege grants for the application account
-- ---------------------------------------------------------------------
-- experiments, flags and retention rules are edited through admin-only API routes (permission-checked in the API)
GRANT SELECT, INSERT, UPDATE ON __DB__.experiments TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.experiment_arms TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.listening_bookmarks TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT ON __DB__.playlist_revisions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT ON __DB__.playlist_revision_songs TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE ON __DB__.playlist_share_links TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, DELETE ON __DB__.playlist_saves TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_follows TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.notifications TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE ON __DB__.collection_submissions TO '__APP_USER__'@'__APP_HOST__';
-- login_events is append-only for the application (like audit_logs); purging it is left to the retention job (open issue)
GRANT SELECT, INSERT ON __DB__.login_events TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, UPDATE ON __DB__.retention_policies TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE ON __DB__.feature_flags TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.feature_flag_overrides TO '__APP_USER__'@'__APP_HOST__';

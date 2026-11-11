-- =====================================================================
--  0001 — server-side sessions and account management
--
--  * auth_sessions: every sign-in is a row. The browser holds only a random
--    token in an httpOnly cookie; the database stores its SHA-256 hash, so a
--    database leak does not leak usable sessions. A session is valid only while
--    it is not revoked and not expired — logout, "sign out everywhere", a
--    password change and admin deactivation all revoke rows, effective at once.
--  * users.password_changed_at: when the password was last set.
--  * song_mood_curations.curated_by gets the foreign key it was missing
--    (SET NULL keeps the curation if the curator's account is deleted).
--  Written to be safe to re-run after a partial failure.
-- =====================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id     CHAR(16)     NOT NULL,                    -- public id (shown in "your sessions"), not the secret
  token_hash     CHAR(64)     NOT NULL,                    -- SHA-256 of the secret token
  user_id        INT UNSIGNED NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME     NOT NULL,
  revoked_at     DATETIME     NULL,
  revoke_reason  ENUM('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGED','ADMIN_DEACTIVATED','REVOKED_BY_USER','ACCOUNT_DELETED') NULL,
  user_agent     VARCHAR(160) NULL,
  ip_hash        CHAR(64)     NULL,                        -- keyed hash of the IP; the IP itself is never stored
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_session_token (token_hash),
  KEY idx_session_user (user_id, revoked_at, expires_at),
  KEY idx_session_expiry (expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_session_times CHECK (expires_at > created_at AND last_seen_at >= created_at),
  CONSTRAINT chk_session_revoke CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS mig_0001_columns;
DELIMITER $$
CREATE PROCEDURE mig_0001_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at') THEN
    ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL AFTER password_hash;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_smc_curator') THEN
    UPDATE song_mood_curations c LEFT JOIN users u ON u.user_id = c.curated_by SET c.curated_by = NULL
     WHERE c.curated_by IS NOT NULL AND u.user_id IS NULL;
    ALTER TABLE song_mood_curations
      ADD CONSTRAINT fk_smc_curator FOREIGN KEY (curated_by) REFERENCES users (user_id) ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;
CALL mig_0001_columns();
DROP PROCEDURE mig_0001_columns;

-- The app account manages sessions and may read the migration history (readiness check).
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.auth_sessions TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT ON __DB__.schema_migrations TO '__APP_USER__'@'__APP_HOST__';

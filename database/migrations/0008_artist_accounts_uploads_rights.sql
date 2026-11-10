-- =====================================================================
-- 0008 — independent artist onboarding, private uploads, rights and review
-- Non-destructive, additive. Uploaded audio remains private until a scan
-- worker marks it CLEAN and a moderator explicitly approves and publishes.
-- =====================================================================

INSERT INTO roles (code, name)
VALUES ('ARTIST', 'Artist')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO permissions (permission_code, description) VALUES
  ('artist.studio', 'View and manage the signed-in artist studio'),
  ('artist.upload', 'Create and manage original or authorized artist uploads'),
  ('artist.review', 'Review artist applications, upload rights and moderation reports')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Artists retain the complete listener experience; the ARTIST role adds creator tools.
INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT artist_role.role_id, rp.permission_code
  FROM roles artist_role
  JOIN roles listener_role ON listener_role.code = 'LISTENER'
  JOIN role_permissions rp ON rp.role_id = listener_role.role_id
 WHERE artist_role.code = 'ARTIST';

INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT role_id, 'artist.studio' FROM roles WHERE code = 'ARTIST';
INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT role_id, 'artist.upload' FROM roles WHERE code = 'ARTIST';
INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT role_id, 'artist.review' FROM roles WHERE code = 'ADMIN';

CREATE TABLE IF NOT EXISTS artist_applications (
  application_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  artist_type ENUM('SOLO','GROUP','COMPOSER','ORCHESTRA') NOT NULL DEFAULT 'SOLO',
  country_code CHAR(2) NOT NULL DEFAULT 'IN',
  bio VARCHAR(400) NULL,
  website_url VARCHAR(255) NULL,
  proof_url VARCHAR(500) NULL,
  status ENUM('PENDING','APPROVED','REJECTED','WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  artist_id INT UNSIGNED NULL,
  reviewer_user_id INT UNSIGNED NULL,
  review_note VARCHAR(500) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (application_id),
  KEY idx_artist_app_status (status, submitted_at),
  KEY idx_artist_app_user (user_id, status),
  CONSTRAINT fk_artist_app_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_artist_app_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_app_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_artist_app_country CHECK (REGEXP_LIKE(country_code, '^[A-Z]{2}$', 'c'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artist_accounts (
  user_id INT UNSIGNED NOT NULL,
  artist_id INT UNSIGNED NOT NULL,
  account_status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, artist_id),
  KEY idx_artist_accounts_artist (artist_id, account_status),
  CONSTRAINT fk_artist_accounts_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_artist_accounts_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artist_uploads (
  upload_id CHAR(32) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  artist_id INT UNSIGNED NOT NULL,
  song_id INT UNSIGNED NULL,
  media_id INT UNSIGNED NULL,
  title VARCHAR(150) NOT NULL,
  version_label VARCHAR(40) NOT NULL DEFAULT '',
  genre_id SMALLINT UNSIGNED NOT NULL,
  language_id SMALLINT UNSIGNED NULL,
  duration_claim_sec SMALLINT UNSIGNED NOT NULL,
  duration_verified_sec SMALLINT UNSIGNED NULL,
  release_year SMALLINT UNSIGNED NOT NULL,
  explicit TINYINT(1) NOT NULL DEFAULT 0,
  declared_size BIGINT UNSIGNED NOT NULL,
  file_size BIGINT UNSIGNED NULL,
  declared_mime VARCHAR(100) NOT NULL,
  detected_mime VARCHAR(100) NULL,
  file_name VARCHAR(140) NULL,
  sha256 CHAR(64) NULL,
  status ENUM('UPLOADING','QUARANTINED','PROCESSING','PENDING_REVIEW','APPROVED','PUBLISHED','REJECTED','TAKEN_DOWN','PROCESSING_FAILED') NOT NULL DEFAULT 'UPLOADING',
  scan_status ENUM('NOT_SCANNED','CLEAN','INFECTED','ERROR') NOT NULL DEFAULT 'NOT_SCANNED',
  scan_detail VARCHAR(500) NULL,
  composition_rights ENUM('OWNED','LICENSED','PUBLIC_DOMAIN') NOT NULL,
  recording_rights ENUM('OWNED','LICENSED','PUBLIC_DOMAIN') NOT NULL,
  rights_evidence_ref VARCHAR(500) NULL,
  territory_codes JSON NOT NULL,
  allowed_uses JSON NOT NULL,
  licence_start DATE NULL,
  licence_end DATE NULL,
  royalty_share_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  royalty_currency CHAR(3) NOT NULL DEFAULT 'INR',
  rights_terms_version VARCHAR(30) NOT NULL,
  rights_accepted_at DATETIME NOT NULL,
  rights_ip_hash CHAR(64) NULL,
  reviewer_user_id INT UNSIGNED NULL,
  review_note VARCHAR(500) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id),
  KEY idx_artist_upload_review (status, scan_status, created_at),
  KEY idx_artist_upload_user (user_id, created_at),
  KEY idx_artist_upload_artist (artist_id, status),
  UNIQUE KEY uq_artist_upload_song (song_id),
  UNIQUE KEY uq_artist_upload_media (media_id),
  CONSTRAINT fk_artist_upload_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_upload_artist FOREIGN KEY (artist_id) REFERENCES artists (artist_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_upload_song FOREIGN KEY (song_id) REFERENCES songs (song_id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_upload_media FOREIGN KEY (media_id) REFERENCES song_media (media_id) ON DELETE SET NULL,
  CONSTRAINT fk_artist_upload_genre FOREIGN KEY (genre_id) REFERENCES genres (genre_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_upload_language FOREIGN KEY (language_id) REFERENCES languages (language_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_upload_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT chk_artist_upload_duration CHECK (duration_claim_sec BETWEEN 30 AND 1800),
  CONSTRAINT chk_artist_upload_verified_duration CHECK (duration_verified_sec IS NULL OR duration_verified_sec BETWEEN 30 AND 1800),
  CONSTRAINT chk_artist_upload_year CHECK (release_year BETWEEN 1900 AND 2100),
  CONSTRAINT chk_artist_upload_size CHECK (declared_size BETWEEN 1 AND 52428800 AND (file_size IS NULL OR file_size BETWEEN 1 AND 52428800)),
  CONSTRAINT chk_artist_upload_royalty CHECK (royalty_share_pct BETWEEN 0 AND 100),
  CONSTRAINT chk_artist_upload_licence_dates CHECK (licence_end IS NULL OR licence_start IS NULL OR licence_end >= licence_start)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artist_upload_events (
  event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  upload_id CHAR(32) NOT NULL,
  actor_user_id INT UNSIGNED NULL,
  event_code VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  KEY idx_artist_upload_events (upload_id, created_at),
  CONSTRAINT fk_artist_upload_events_upload FOREIGN KEY (upload_id) REFERENCES artist_uploads (upload_id) ON DELETE CASCADE,
  CONSTRAINT fk_artist_upload_events_actor FOREIGN KEY (actor_user_id) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS artist_rights_reports (
  report_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  upload_id CHAR(32) NOT NULL,
  reporter_user_id INT UNSIGNED NOT NULL,
  report_type ENUM('COPYRIGHT','IMPERSONATION','EXPLICIT_CONTENT','MISLABELLED','SAFETY','OTHER') NOT NULL,
  details VARCHAR(2000) NOT NULL,
  evidence_ref VARCHAR(500) NULL,
  status ENUM('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED') NOT NULL DEFAULT 'OPEN',
  assigned_to INT UNSIGNED NULL,
  resolution_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (report_id),
  KEY idx_artist_rights_reports_status (status, created_at),
  KEY idx_artist_rights_reports_upload (upload_id, status),
  CONSTRAINT fk_artist_rights_report_upload FOREIGN KEY (upload_id) REFERENCES artist_uploads (upload_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_rights_reporter FOREIGN KEY (reporter_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_artist_rights_assignee FOREIGN KEY (assigned_to) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO music_sources
  (code, name, source_type, access_method, license_name, rights_scope, requires_attribution,
   priority, is_enabled, requires_credentials, notes)
VALUES
  ('ARTIST_UPLOAD', 'LOOP independent artist uploads', 'MUSIC_AUDIO', 'USER_UPLOAD',
   'Uploader-declared rights; per-track rights ledger and manual moderation required', 'AUDIO_FULL',
   0, 5, 1, 0,
   'Private quarantine until malware/media scan and moderator approval. Only authorized recordings may be published.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name), notes = VALUES(notes), is_enabled = 1;

-- Runtime API account privileges. The owner account runs this migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_applications TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_accounts TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_uploads TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_upload_events TO '__APP_USER__'@'__APP_HOST__';
GRANT SELECT, INSERT, UPDATE, DELETE ON __DB__.artist_rights_reports TO '__APP_USER__'@'__APP_HOST__';

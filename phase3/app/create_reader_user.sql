-- Optional: a read-only MySQL account for the MUSE Query Studio.
-- Replace CHANGE_ME_BEFORE_RUNNING with your own password, run this once as root,
-- and put the same password in MUSE_DB_PASSWORD in app/.env (never commit .env).
CREATE USER IF NOT EXISTS 'muse_reader'@'localhost' IDENTIFIED BY 'CHANGE_ME_BEFORE_RUNNING';
GRANT SELECT ON muse_db.* TO 'muse_reader'@'localhost';

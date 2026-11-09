-- =====================================================================
--  0006 — stable Varsha demo account
--
--  Reuses the seeded Aarav listener row when available, preserving its
--  sample playlists, listening history and recommendations. On databases
--  without that seed row, creates a new LISTENER account.
--  The password is stored only as a bcrypt hash.
-- =====================================================================

UPDATE users
   SET username = 'varsha',
       email = 'varsha@muse.dev',
       password_hash = '$2b$10$HL.0Lq/5MoyeejRdmkLwJOb8Dt3Qech87qwurEWEcAtgfyh/mbDYC',
       password_changed_at = NOW(),
       is_active = 1,
       failed_login_count = 0,
       locked_until = NULL
 WHERE username = 'aarav'
    OR (username = 'varsha' AND email = 'varsha@muse.dev');

INSERT INTO users
  (username, email, password_hash, role_id, is_active, failed_login_count, locked_until, password_changed_at)
SELECT 'varsha', 'varsha@muse.dev', '$2b$10$HL.0Lq/5MoyeejRdmkLwJOb8Dt3Qech87qwurEWEcAtgfyh/mbDYC', r.role_id, 1, 0, NULL, NOW()
  FROM roles r
 WHERE r.code = 'LISTENER'
   AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'varsha')
   AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'varsha@muse.dev');

INSERT INTO user_profiles
  (user_id, display_name, region_code, content_filter, listening_habit, onboarding_completed_at)
SELECT user_id, 'Varsha', 'IN-TG', 'OFF', 'MIXED', NOW()
  FROM users
 WHERE username = 'varsha' AND email = 'varsha@muse.dev'
ON DUPLICATE KEY UPDATE
  display_name = 'Varsha',
  region_code = 'IN-TG',
  onboarding_completed_at = COALESCE(onboarding_completed_at, NOW());

DELETE ul
  FROM user_languages ul
  JOIN users u ON u.user_id = ul.user_id
 WHERE u.username = 'varsha' AND u.email = 'varsha@muse.dev';

INSERT INTO user_languages (user_id, language_id, priority)
SELECT u.user_id, l.language_id,
       CASE l.iso_code WHEN 'te' THEN 1 WHEN 'en' THEN 2 END
  FROM users u
  JOIN languages l ON l.iso_code IN ('te', 'en')
 WHERE u.username = 'varsha' AND u.email = 'varsha@muse.dev';


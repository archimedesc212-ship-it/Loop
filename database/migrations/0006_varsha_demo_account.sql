-- =====================================================================
--  0006 — stable Aarav demo account
--
--  Keeps the seeded Aarav listener row in place, preserving the sample
--  playlists, listening history and recommendations expected by the app. If an
--  older Varsha alias exists, it is migrated back to Aarav for compatibility.
--  The password is stored only as a bcrypt hash.
-- =====================================================================

UPDATE users
   SET username = 'aarav',
       email = 'aarav@muse.dev',
       password_hash = '$2a$10$S/fTa5ZAykr9zZPnCToIreraEDXyFu8ofeJp3tprxfTn7ix357VmW',
       password_changed_at = NOW(),
       is_active = 1,
       failed_login_count = 0,
       locked_until = NULL
 WHERE username IN ('aarav', 'varsha')
    OR email IN ('aarav@muse.dev', 'varsha@muse.dev');

INSERT INTO users
  (username, email, password_hash, role_id, is_active, failed_login_count, locked_until, password_changed_at)
SELECT 'aarav', 'aarav@muse.dev', '$2a$10$S/fTa5ZAykr9zZPnCToIreraEDXyFu8ofeJp3tprxfTn7ix357VmW', r.role_id, 1, 0, NULL, NOW()
  FROM roles r
 WHERE r.code = 'LISTENER'
   AND NOT EXISTS (SELECT 1 FROM users WHERE username = 'aarav')
   AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'aarav@muse.dev');

INSERT INTO user_profiles
  (user_id, display_name, region_code, content_filter, listening_habit, onboarding_completed_at)
SELECT user_id, 'Aarav Varma', 'IN-TG', 'OFF', 'MIXED', NOW()
  FROM users
 WHERE username = 'aarav' AND email = 'aarav@muse.dev'
ON DUPLICATE KEY UPDATE
  display_name = 'Aarav Varma',
  region_code = 'IN-TG',
  onboarding_completed_at = COALESCE(onboarding_completed_at, NOW());

DELETE ul
  FROM user_languages ul
  JOIN users u ON u.user_id = ul.user_id
 WHERE u.username IN ('aarav', 'varsha')
   AND u.email IN ('aarav@muse.dev', 'varsha@muse.dev');

INSERT INTO user_languages (user_id, language_id, priority)
SELECT u.user_id, l.language_id,
       CASE l.iso_code WHEN 'te' THEN 1 WHEN 'en' THEN 2 END
  FROM users u
  JOIN languages l ON l.iso_code IN ('te', 'en')
 WHERE u.username = 'aarav' AND u.email = 'aarav@muse.dev';


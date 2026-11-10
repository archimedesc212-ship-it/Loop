-- =====================================================================
--  0007 — correct the Aarav demo password hash
--
--  Forward-only repair for the listener account used by the seeded demo data.
--  Older Varsha aliases are also normalized to the same credentials.
--  No account rows or user content are removed.
-- =====================================================================

UPDATE users
   SET password_hash = '$2a$10$S/fTa5ZAykr9zZPnCToIreraEDXyFu8ofeJp3tprxfTn7ix357VmW',
       password_changed_at = NOW(),
       failed_login_count = 0,
       locked_until = NULL,
       is_active = 1
 WHERE (username = 'aarav' OR username = 'varsha')
   AND (email = 'aarav@muse.dev' OR email = 'varsha@muse.dev');

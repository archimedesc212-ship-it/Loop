-- =====================================================================
--  0007 — correct the Varsha demo password hash
--
--  Forward-only repair for the account created by migration 0006.
--  No account rows or user content are removed.
-- =====================================================================

UPDATE users
   SET password_hash = '$2b$10$MLoMFiwGBSHUvIn8tEkew.p/qFCD1iLcwv6iaHmV2I6lFI9CBxL6K',
       password_changed_at = NOW(),
       failed_login_count = 0,
       locked_until = NULL,
       is_active = 1
 WHERE username = 'varsha'
   AND email = 'varsha@muse.dev';

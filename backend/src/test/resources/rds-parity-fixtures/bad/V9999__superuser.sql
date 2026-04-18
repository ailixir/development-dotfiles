-- Negative fixture: SUPERUSER role attribute
-- Expected violations: lines 4, 5, and 6

ALTER USER admin_user SUPERUSER;
CREATE ROLE god_mode WITH SUPERUSER LOGIN;
ALTER ROLE backup_user SUPERUSER;

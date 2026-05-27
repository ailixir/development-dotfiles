-- Negative fixture: ALTER SYSTEM (all forms)
-- Expected violations: lines 4 and 5

ALTER SYSTEM SET work_mem = '256MB';
ALTER SYSTEM RESET ALL;

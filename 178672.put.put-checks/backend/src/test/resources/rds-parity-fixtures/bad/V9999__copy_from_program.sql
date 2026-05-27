-- Negative fixture: COPY FROM PROGRAM
-- Expected violation: line 4

COPY test_table FROM PROGRAM 'cat /etc/passwd';

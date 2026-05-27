-- Negative fixture: server file access role grants
-- Expected violations: lines 4, 5, and 6

GRANT pg_read_server_files TO backup_user;
GRANT pg_write_server_files TO export_user;
GRANT pg_execute_server_program TO admin_user;

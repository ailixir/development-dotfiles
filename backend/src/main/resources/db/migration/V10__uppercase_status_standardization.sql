-- V10: Standardize all status values to UPPERCASE for consistency.
-- Reports, report_executions, and ui_tests used lowercase;
-- checks, execution_results, ui_test_executions, and csi_systems already used UPPERCASE.

-- ─────────────────────────────────────────────────────────────
-- Helper: drop all CHECK constraints on a specific column
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _drop_check_constraints(p_table TEXT, p_column TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = p_table
      AND att.attname = p_column
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, r.conname);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- (1) reports.status: 'active','paused','draft' → 'ACTIVE','PAUSED','DRAFT'
--     Drop old constraint FIRST so the UPDATE can write UPPERCASE values.
-- ─────────────────────────────────────────────────────────────
SELECT _drop_check_constraints('reports', 'status');
UPDATE reports SET status = UPPER(status) WHERE status <> UPPER(status);
ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('ACTIVE', 'PAUSED', 'DRAFT'));
ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'DRAFT';

-- ─────────────────────────────────────────────────────────────
-- (2) report_executions.status: 'success','failed','partial' → 'SUCCESS','FAILED','PARTIAL'
--     Partitioned table — drop constraint from parent; partitions inherit.
-- ─────────────────────────────────────────────────────────────
SELECT _drop_check_constraints('report_executions', 'status');
UPDATE report_executions SET status = UPPER(status) WHERE status <> UPPER(status);
ALTER TABLE report_executions ADD CONSTRAINT report_executions_status_check
    CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL'));

-- ─────────────────────────────────────────────────────────────
-- (3) ui_tests.status: 'paused','active','draft','archived' → UPPERCASE
--     Added in V5 with no CHECK constraint — safe to UPDATE first.
-- ─────────────────────────────────────────────────────────────
SELECT _drop_check_constraints('ui_tests', 'status');
UPDATE ui_tests SET status = UPPER(status) WHERE status IS NOT NULL AND status <> UPPER(status);
ALTER TABLE ui_tests ALTER COLUMN status SET DEFAULT 'PAUSED';
ALTER TABLE ui_tests ADD CONSTRAINT ui_tests_status_check
    CHECK (status IN ('ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'));

-- Clean up helper function
DROP FUNCTION _drop_check_constraints(TEXT, TEXT);

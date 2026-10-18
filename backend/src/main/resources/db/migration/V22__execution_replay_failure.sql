-- STUDIO-OBS-008 T0 ruling A1 (A1.3): the persisted public replay failure of an execution.
-- Ruling: docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md, sections A1.1-A1.3
-- (@architect, 2026-10-16). Forward-only after V21. V1-V21 stay byte-identical.
--
-- What is stored. Four nullable columns on the range-partitioned parent ui_test_executions (V7).
-- They hold the one named cause of a replay that stopped at a learned step: a closed code, the
-- confirmed revision's stable step ID, its 0-based position, and, for login only, one boolean.
-- Nothing else is stored, so no page text, URL, selector, diagnostic text or secret can land here.
-- Only the FINAL report UPDATE writes them, in the same statement as status and error_code. The
-- reapers, the cancel route, the reconciler and the pre-Ready failure path leave all four NULL.
-- No backfill: the runner's login detail was never stored (ruling F4), and NULL means "no named
-- cause". Write-once is the application's rule (a duplicate FINAL changes nothing). The ruling
-- asks for no trigger, and this file adds none.
--
-- Partitions. ALTER TABLE on the partitioned parent recurses into every existing partition, the
-- bootstrap months and DEFAULT included. PartitionManager creates later months with
-- CREATE TABLE ... PARTITION OF, which copies the parent's columns and CHECK constraints. Its
-- DEFAULT-to-month move reads the column list from pg_attribute, so these columns move with the row.
--
-- The CHECK admits exactly three shapes:
--   (1) all four NULL: no named cause;
--   (2) LOGIN_REQUIRED, step ID of 1..256 characters, step index >= 0, login boolean NOT NULL;
--   (3) TARGET_DRIFT, step ID of 1..256 characters, step index >= 0, login boolean NULL.
-- Each branch tests a column with IS NOT NULL before comparing it. A CHECK passes when it
-- evaluates to NULL. Without the guard, a row with a NULL code and the other three columns set
-- would make branch (2) NULL rather than FALSE, and that row would be accepted.
-- char_length counts characters, as the contract's maxLength does.
--
-- Locks and validation (PostgreSQL 15; Flyway applies this file as one transaction):
--   * ADD COLUMN (nullable, no default) changes only the catalog. It rewrites and scans nothing.
--     It takes ACCESS EXCLUSIVE on the parent and on every partition, and holds it until COMMIT.
--   * ADD CONSTRAINT ... NOT VALID recurses into every partition without scanning any of them. From
--     that statement on, every new INSERT or UPDATE is checked.
--   * VALIDATE CONSTRAINT then scans each partition once (heap only: the four new columns are
--     inline NULLs, so no TOAST is read). On its own it needs only SHARE UPDATE EXCLUSIVE. Here
--     ACCESS EXCLUSIVE is already held from ADD COLUMN, so splitting ADD and VALIDATE does not
--     shorten the blocking window inside this transaction. The window is catalog time plus one
--     scan of the execution history. The split follows V13's convention and ends with the
--     constraint validated on the parent and on every partition.
--   * VALIDATE cannot fail on data. All four columns are created by this file, so every existing
--     row holds four NULLs, which is shape (1). If any of the columns already existed (out-of-band
--     DDL), ADD COLUMN fails first and the whole file rolls back, leaving the database at V21.
--
-- Rollback (pre-release, disposable databases only): there is no down migration (repo
-- convention). Recreate the database and migrate to V21, or restore a pg_dump taken before V22.

ALTER TABLE ui_test_executions
    ADD COLUMN replay_failure_code                text,
    ADD COLUMN replay_failure_step_id             text,
    ADD COLUMN replay_failure_step_index          integer,
    ADD COLUMN replay_failure_login_steps_present boolean;

ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_replay_failure CHECK (
    (replay_failure_code IS NULL
        AND replay_failure_step_id IS NULL
        AND replay_failure_step_index IS NULL
        AND replay_failure_login_steps_present IS NULL)
    OR (replay_failure_code IS NOT NULL AND replay_failure_code = 'LOGIN_REQUIRED'
        AND replay_failure_step_id IS NOT NULL
        AND char_length(replay_failure_step_id) BETWEEN 1 AND 256
        AND replay_failure_step_index IS NOT NULL AND replay_failure_step_index >= 0
        AND replay_failure_login_steps_present IS NOT NULL)
    OR (replay_failure_code IS NOT NULL AND replay_failure_code = 'TARGET_DRIFT'
        AND replay_failure_step_id IS NOT NULL
        AND char_length(replay_failure_step_id) BETWEEN 1 AND 256
        AND replay_failure_step_index IS NOT NULL AND replay_failure_step_index >= 0
        AND replay_failure_login_steps_present IS NULL)) NOT VALID;

ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_replay_failure;

COMMENT ON COLUMN ui_test_executions.replay_failure_code IS
    'STUDIO-OBS-008 A1: LOGIN_REQUIRED | TARGET_DRIFT, or NULL for no named cause. Written once by '
    'the FINAL report, in the same UPDATE as status.';
COMMENT ON COLUMN ui_test_executions.replay_failure_step_id IS
    'STUDIO-OBS-008 A1: the confirmed revision''s stable authoring step ID (1..256 characters).';
COMMENT ON COLUMN ui_test_executions.replay_failure_step_index IS
    'STUDIO-OBS-008 A1: 0-based, in the same index space as step_results[].stepIndex.';
COMMENT ON COLUMN ui_test_executions.replay_failure_login_steps_present IS
    'STUDIO-OBS-008 A1: NOT NULL exactly when the code is LOGIN_REQUIRED.';

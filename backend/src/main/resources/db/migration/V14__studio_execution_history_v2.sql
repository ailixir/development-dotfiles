-- V14__studio_execution_history_v2.sql
-- Story 10.1 — execution history carries immutable provenance, evidence state and real timings.
-- Source: Architecture "Checks UI Studio" v2.1 §5.3 (durable progress/results), §6.1 (evidence
--         state), §8.1 (execution history), §8.2 (execution migrations and states),
--         §8.3 (canonical browser value).
--
-- Forward-only. Applies after V12 (ui_test_revisions) and V13 (dispatch ledger).
--
-- ui_test_executions is range-partitioned by started_at with primary key (id, started_at)
-- since V7. started_at stays the immutable acceptance/partition timestamp and is never
-- rewritten; the public contract exposes it as acceptedAt. Browser start goes to the new
-- nullable browser_started_at, exposed as startedAt. ALTER TABLE on the partitioned parent
-- recurses into every partition, including the DEFAULT one.

-- ─────────────────────────────────────────────────────────────
-- 1. Execution history columns (§8.1, §8.2, §6.1)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ui_test_executions
    -- Browser start; null until an authenticated runner start report is committed (§8.2).
    ADD COLUMN browser_started_at    TIMESTAMPTZ,
    -- Timeouts are ERROR with a code, never a distinct status (§8.2).
    ADD COLUMN error_code            VARCHAR(40),
    -- Immutable provenance. A partitioned table may reference a regular table, so this
    -- single-column FK into the unpartitioned ui_test_revisions is valid (V12).
    ADD COLUMN revision_id           UUID REFERENCES ui_test_revisions(id),
    -- The execution's own CSI. Historical access uses this, never a mutable parent lookup (§9.1).
    ADD COLUMN csi_id                VARCHAR(20),
    ADD COLUMN principal             VARCHAR(255),
    ADD COLUMN environment           VARCHAR(50),
    -- Nonsecret configuration snapshot taken at acceptance time.
    ADD COLUMN configuration_snapshot JSONB,
    -- One entry per original step: {stepIndex, originalText, status, offsetMs, durationMs, message}.
    ADD COLUMN step_results          JSONB,
    ADD COLUMN logs_truncated        BOOLEAN NOT NULL DEFAULT false,
    -- Evidence: object key only; the browser is given the protected API path (§6.2, §6.3).
    ADD COLUMN video_key             TEXT,
    ADD COLUMN video_status          VARCHAR(20),
    ADD COLUMN video_error           TEXT,
    ADD COLUMN video_expires_at      TIMESTAMPTZ,
    ADD COLUMN video_partial         BOOLEAN,
    -- Actual runtime versions observed for this run (§4.6). Null for legacy history.
    ADD COLUMN runtime_versions      JSONB,
    -- Monotonic API snapshot revision; also the SSE event id (§5.5).
    ADD COLUMN snapshot_revision     BIGINT NOT NULL DEFAULT 0;

-- Evidence state is independent of the check outcome (§6.1): an upload failure never overwrites
-- a known assertion outcome.
ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_video_status
    CHECK (video_status IS NULL
           OR video_status IN ('PROCESSING', 'AVAILABLE', 'FAILED', 'UNAVAILABLE', 'EXPIRED'));

-- ─────────────────────────────────────────────────────────────
-- 2. Structured bounded log storage (§5.3, §8.1)
-- ─────────────────────────────────────────────────────────────
-- The legacy `logs TEXT` column becomes the structured buffer the snapshot contract exposes.
-- Legacy free text is preserved verbatim as a single INFO entry rather than discarded; nothing
-- is invented beyond the timestamp already recorded on the row.
ALTER TABLE ui_test_executions
    ALTER COLUMN logs TYPE JSONB
    USING CASE
        WHEN logs IS NULL THEN NULL
        ELSE jsonb_build_array(jsonb_build_object(
                 'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'level', 'INFO',
                 'message', logs,
                 'stepIndex', NULL))
    END;

-- ─────────────────────────────────────────────────────────────
-- 3. Status vocabulary and nullable end/duration (§8.2)
-- ─────────────────────────────────────────────────────────────
-- Legacy outcome adapters applied in place: COMPLETED is PASSED; TIMEOUT is ERROR with a code.
-- The V1/V7 CHECK never allowed these values, so this normally updates zero rows; it exists so
-- that history restored from an older dump converges on the canonical vocabulary.
UPDATE ui_test_executions SET status = 'PASSED' WHERE status = 'COMPLETED';
UPDATE ui_test_executions
   SET status = 'ERROR', error_code = COALESCE(error_code, 'TIMEOUT')
 WHERE status = 'TIMEOUT';

-- Drop whatever the V1/V7 inline CHECK on status was named, then install the widened one.
-- Dropping on the partitioned parent propagates to every partition.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
         WHERE con.conrelid = 'ui_test_executions'::regclass
           AND con.contype = 'c'
           AND att.attname = 'status'
    LOOP
        EXECUTE format('ALTER TABLE ui_test_executions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END
$$;

-- PENDING is accepted-but-not-browser-started; RUNNING requires a committed start report (§8.2).
-- This is also what makes the existing POST /tests/{id}/execute placeholder, which writes
-- PENDING, stop violating the constraint it was written against.
ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_status
    CHECK (status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR'));

-- A run that has not finished has no end and no duration. durationMs measures browser execution
-- only; queue time is a separate budget (§8.2).
ALTER TABLE ui_test_executions ALTER COLUMN ended_at    DROP NOT NULL;
ALTER TABLE ui_test_executions ALTER COLUMN duration_ms DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. CSI backfill and quarantine of ambiguous history (§8.2)
-- ─────────────────────────────────────────────────────────────
-- Backfill only where ownership is actually known. Rows whose parent is missing or itself has no
-- CSI keep csi_id NULL; the application excludes every NULL-CSI row from user-facing queries.
-- They are counted here and never exposed, pending an explicit migration resolution.
DO $$
DECLARE
    backfilled INTEGER;
    quarantined INTEGER;
BEGIN
    UPDATE ui_test_executions e
       SET csi_id = t.csi_id
      FROM ui_tests t
     WHERE t.id = e.ui_test_id
       AND e.csi_id IS NULL
       AND t.csi_id IS NOT NULL;
    GET DIAGNOSTICS backfilled = ROW_COUNT;

    SELECT COUNT(*) INTO quarantined FROM ui_test_executions WHERE csi_id IS NULL;

    RAISE NOTICE 'V14: backfilled csi_id on % ui_test_executions row(s)', backfilled;
    RAISE NOTICE 'V14: % ui_test_executions row(s) remain without a CSI and are quarantined '
                 'from every user-facing query', quarantined;
END
$$;

-- Every user-facing history query filters on the execution's own CSI before paging (§9.1).
CREATE INDEX idx_ui_test_exec_csi
    ON ui_test_executions(csi_id, started_at DESC)
    WHERE csi_id IS NOT NULL;

-- Legacy rows acquire no fabricated confirmation metadata: revision_id and runtime_versions
-- stay NULL for everything that predates confirmed revisions (§8.1).

-- ─────────────────────────────────────────────────────────────
-- 5. Last-run projection vocabulary (§8.2)
-- ─────────────────────────────────────────────────────────────
-- ERROR is a real outcome and must be projectable. The service additionally refuses to move the
-- projection backwards: it writes only when the finishing execution is newer than the projected
-- one by (acceptedAt, executionId).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
         WHERE con.conrelid = 'ui_tests'::regclass
           AND con.contype = 'c'
           AND att.attname = 'last_run_status'
    LOOP
        EXECUTE format('ALTER TABLE ui_tests DROP CONSTRAINT %I', r.conname);
    END LOOP;
END
$$;

ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_last_run_status
    CHECK (last_run_status IS NULL OR last_run_status IN ('PASSED', 'FAILED', 'ERROR'));

-- Projection ordering support: find the newest finished execution of a test.
CREATE INDEX idx_ui_test_exec_projection
    ON ui_test_executions(ui_test_id, started_at DESC, id)
    WHERE status IN ('PASSED', 'FAILED', 'ERROR');

-- ─────────────────────────────────────────────────────────────
-- 6. Canonical browser value (§8.3)
-- ─────────────────────────────────────────────────────────────
-- 'chromium' is the only engine V1 executes. Legacy 'chrome' is the same engine under its old
-- name. Any other engine is converted to chromium so the row stays authored and readable, but
-- those drafts are STALE from V12 and cannot execute until they are recompiled and confirmed.
DO $$
DECLARE
    renamed INTEGER;
    converted INTEGER;
BEGIN
    UPDATE ui_tests SET browser = 'chromium' WHERE browser = 'chrome';
    GET DIAGNOSTICS renamed = ROW_COUNT;

    UPDATE ui_tests SET browser = 'chromium' WHERE browser <> 'chromium';
    GET DIAGNOSTICS converted = ROW_COUNT;

    RAISE NOTICE 'V14: renamed % ui_tests row(s) from chrome to chromium', renamed;
    RAISE NOTICE 'V14: converted % ui_tests row(s) from a non-chrome legacy engine to chromium; '
                 'they remain STALE until recompiled and confirmed', converted;
END
$$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
         WHERE con.conrelid = 'ui_tests'::regclass
           AND con.contype = 'c'
           AND att.attname = 'browser'
    LOOP
        EXECUTE format('ALTER TABLE ui_tests DROP CONSTRAINT %I', r.conname);
    END LOOP;
END
$$;

ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_browser
    CHECK (browser IN ('chromium'));

ALTER TABLE ui_tests ALTER COLUMN browser SET DEFAULT 'chromium';

-- ─────────────────────────────────────────────────────────────
-- 7. Partition locators for pre-existing history (§8.2, AC-13)
-- ─────────────────────────────────────────────────────────────
-- Every read of a single execution resolves (execution_id, execution_accepted_at) through the
-- ledger first, so that no code path issues a bare `WHERE id = ?` against the partitioned table.
-- Legacy rows therefore need a locator. They get exactly that and nothing more: principal,
-- attempt, admission, lease and deadline stay NULL, and the state reflects the fact that these
-- runs are already over. Rows with no CSI are quarantined from every user-facing query and are
-- deliberately left without a locator.
INSERT INTO studio_dispatch_ledger (
    execution_id, execution_accepted_at, test_id, csi_id, state, created_at, updated_at)
SELECT e.id, e.started_at, e.ui_test_id, e.csi_id, 'DONE', e.created_at, e.created_at
  FROM ui_test_executions e
 WHERE e.csi_id IS NOT NULL
ON CONFLICT (execution_id) DO NOTHING;

DO $$
DECLARE
    located INTEGER;
BEGIN
    SELECT COUNT(*) INTO located FROM studio_dispatch_ledger WHERE principal IS NULL;
    RAISE NOTICE 'V14: created % partition locator(s) for pre-existing execution history', located;
END
$$;

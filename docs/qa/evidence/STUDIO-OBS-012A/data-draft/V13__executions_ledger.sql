-- STUDIO-OBS-012A / ADR-SC-005 D-B. ISOLATED DRAFT rev 2 (post wave 1a); not applied to any dev DB.
-- Fresh baseline after untouched V1–V11; integrate in the single compile-green Lane M batch.

-- V13__studio_dispatch_ledger.sql
-- Story 10.1 — durable dispatch identity for Studio executions.
-- Source: Architecture "Checks UI Studio" v2.1 §5.1 (acceptance and dispatch),
--         §5.4 (recovery and backpressure), §8.1 (dispatch ledger), §8.2 (migrations).
--
-- Forward-only. Applies after V12 (story 10.4's ui_test_revisions); V14 is the matching
-- execution-history migration.
--
-- Why unpartitioned: ui_test_executions is range-partitioned by started_at with primary key
-- (id, started_at), so it cannot carry a globally unique single-column identity and cannot be
-- the target of a single-column foreign key. The ledger owns that identity instead and carries
-- execution_accepted_at as the partition locator used to reach the history row (§8.2).
-- There is deliberately NO foreign key from here into ui_test_executions.

CREATE TABLE studio_dispatch_ledger (
    -- Globally unique execution identity. The history row is reached by
    -- (execution_id, execution_accepted_at) against the partitioned table.
    execution_id           UUID         PRIMARY KEY,
    execution_accepted_at  TIMESTAMPTZ  NOT NULL,

    -- No ON DELETE CASCADE: dispatch history must survive a soft-deleted (or purged) draft.
    test_id                UUID         NOT NULL REFERENCES ui_tests(id),
    csi_id                 VARCHAR(20)  NOT NULL,

    -- Durable, principal-scoped execute idempotency. The in-memory idempotency filter alone is
    -- insufficient across API replicas (§5.1 step 2). Same key + same digest returns the same
    -- execution; same key + different digest is a conflict.
    -- Nullable: legacy history predates principal-scoped acceptance and is backfilled by V14
    -- purely so that its partition locator exists. It acquires no dispatch identity.
    principal              VARCHAR(255),
    idempotency_key        VARCHAR(200),
    request_digest         VARCHAR(64),

    -- Attempt and admission identity. Only one (runner_instance_id, admission_id) may own an
    -- attempt; a browser never starts without a successful admission CAS (§5.1 step 4).
    attempt_id             UUID,
    admission_id           UUID,
    runner_instance_id     VARCHAR(255),

    -- Provisional dispatcher states. The CHECK constraint is deliberately NOT added here:
    -- story 10.7 owns the final dispatcher state machine and adds it then (AC-6, @po 2026-09-10).
    -- Provisional values: QUEUED | CLAIMED | DISPATCHING | ADMITTED | RUNNING | FINALIZING | DONE.
    state                  VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',

    -- Transactional claim lease and the deadlines the reapers derive their work from (§5.4).
    lease_owner            VARCHAR(255),
    lease_expires_at       TIMESTAMPTZ,
    pending_deadline_at    TIMESTAMPTZ,
    start_deadline_at      TIMESTAMPTZ,
    run_deadline_at        TIMESTAMPTZ,

    -- Ordering and visible-state versioning. last_runner_sequence rejects stale runner reports;
    -- snapshot_revision is the API's own monotonic revision, also used as the SSE event id.
    last_runner_sequence   BIGINT       NOT NULL DEFAULT 0,
    snapshot_revision      BIGINT       NOT NULL DEFAULT 0,

    -- Deterministic terminal manifest key (§6.2). Derived by the API from immutable identity;
    -- a runner-supplied key is never trusted.
    manifest_key           TEXT,

    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Postgres treats NULLs as distinct here, so executions submitted without an idempotency
    -- key never collide with each other.
    CONSTRAINT uq_studio_dispatch_ledger_idempotency
        UNIQUE (principal, idempotency_key),

    -- A digest is only meaningful next to the key it was computed for.
    CONSTRAINT ck_studio_dispatch_ledger_digest_pair
        CHECK ((idempotency_key IS NULL) = (request_digest IS NULL))
);

-- Queued work waiting for a dispatcher claim, and expired leases eligible for reclaim.
CREATE INDEX idx_studio_dispatch_ledger_queued
    ON studio_dispatch_ledger(state, lease_expires_at)
    WHERE state IN ('QUEUED', 'CLAIMED', 'DISPATCHING');

-- Admitted-but-not-started work past its start deadline (§5.4 START_TIMEOUT).
CREATE INDEX idx_studio_dispatch_ledger_start_deadline
    ON studio_dispatch_ledger(state, start_deadline_at)
    WHERE state <> 'DONE' AND start_deadline_at IS NOT NULL;

-- Running work past its total runtime deadline (§5.4 STALE).
CREATE INDEX idx_studio_dispatch_ledger_run_deadline
    ON studio_dispatch_ledger(state, run_deadline_at)
    WHERE state <> 'DONE' AND run_deadline_at IS NOT NULL;

-- Partition locator lookups: history reads resolve (execution_id, execution_accepted_at) here
-- before touching the partitioned table, and per-test dispatch history is bounded by CSI.
CREATE INDEX idx_studio_dispatch_ledger_test
    ON studio_dispatch_ledger(test_id, execution_accepted_at DESC);

CREATE INDEX idx_studio_dispatch_ledger_csi
    ON studio_dispatch_ledger(csi_id, execution_accepted_at DESC);

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

ALTER TABLE studio_dispatch_ledger
    ADD CONSTRAINT ck_studio_dispatch_ledger_state
    CHECK (state IN ('QUEUED', 'CLAIMED', 'DISPATCHING', 'ADMITTED', 'RUNNING', 'FINALIZING', 'DONE'));

-- ─────────────────────────────────────────────────────────────
-- 2. Admission identity is all-or-nothing (AC-2)
-- ─────────────────────────────────────────────────────────────
-- The admission CAS guards on (execution_id, attempt_id, admission_id, runner_instance_id), and
-- every runner report is applied by a statement carrying all four. A half-written identity —
-- an admission_id with no attempt_id or no runner_instance_id — is therefore a CAS guard with a
-- hole in it: the predicate would be satisfiable by a row nobody owns.
--
-- The converse is deliberately NOT constrained: an attempt_id without an admission_id is the
-- normal DISPATCHING state, which is precisely the window the CAS exists to close.
ALTER TABLE studio_dispatch_ledger
    ADD CONSTRAINT ck_studio_dispatch_ledger_admission_identity
    CHECK (admission_id IS NULL
           OR (attempt_id IS NOT NULL AND runner_instance_id IS NOT NULL));

-- ─────────────────────────────────────────────────────────────
-- 3. Where the snapshot revision lives (AC-23)
-- ─────────────────────────────────────────────────────────────
-- ui_test_executions.snapshot_revision is the authoritative monotonic revision: it is the SSE
-- event id and the `revision` of the public snapshot, and it is incremented by the same UPDATE
-- that makes each visible change. studio_dispatch_ledger.snapshot_revision is left at its V13
-- default and is not written by story 10.7: two allocators for one number is how they diverge.
COMMENT ON COLUMN studio_dispatch_ledger.snapshot_revision IS
    'Unused as of story 10.7: ui_test_executions.snapshot_revision is the single allocator of the '
    'public snapshot revision and the SSE event id (§5.5, AC-23).';

COMMENT ON COLUMN studio_dispatch_ledger.state IS
    'Dispatch state, never an outcome. QUEUED|CLAIMED|DISPATCHING|ADMITTED|RUNNING|FINALIZING|DONE; '
    'DONE is the single absorbing terminal state and covers success, error, disablement and reaped '
    'work alike (§8.1, story 10.7 AC-2/AC-3).';

ALTER TABLE studio_dispatch_ledger
    ADD COLUMN cancel_requested_at TIMESTAMPTZ,
    ADD COLUMN cancel_requested_by VARCHAR(255),
    ADD COLUMN cancel_relayed_at   TIMESTAMPTZ;

-- Who asked is meaningless without when, and a relay is meaningless without a request.
ALTER TABLE studio_dispatch_ledger
    ADD CONSTRAINT ck_studio_dispatch_ledger_cancel_pair
    CHECK ((cancel_requested_by IS NULL OR cancel_requested_at IS NOT NULL)
           AND (cancel_relayed_at IS NULL OR cancel_requested_at IS NOT NULL));

-- The dispatcher's relay scan and the running reaper's unacknowledged-cancel scan. Both read only
-- dispatched, non-terminal rows that carry a request, which is a handful at any moment.
CREATE INDEX idx_studio_dispatch_ledger_cancel_requested
    ON studio_dispatch_ledger(cancel_requested_at)
    WHERE cancel_requested_at IS NOT NULL
      AND state IN ('DISPATCHING', 'ADMITTED', 'RUNNING');

COMMENT ON COLUMN studio_dispatch_ledger.cancel_requested_at IS
    'When a principal asked to cancel this execution (Studio v1 WP4). Written once; a second '
    'cancel matches nothing and answers 409.';
COMMENT ON COLUMN studio_dispatch_ledger.cancel_relayed_at IS
    'When the runner acknowledged the relayed DELETE /v2/runs/{id}. Not the end of the run.';

ALTER TABLE ui_test_executions
    ADD COLUMN execution_scope VARCHAR(20),
    ADD CONSTRAINT ck_ui_test_execution_scope CHECK (execution_scope IS NULL OR execution_scope = 'FULL');
CREATE INDEX idx_ui_test_exec_full_baseline
    ON ui_test_executions(revision_id, ui_test_id, csi_id, started_at DESC, id DESC)
    WHERE status = 'PASSED' AND execution_scope = 'FULL';

COMMENT ON COLUMN ui_test_executions.execution_scope IS
    'Immutable FULL acceptance marker; NULL core history has no invented observed provenance.';
CREATE FUNCTION studio_execution_scope_immutable() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.execution_scope IS DISTINCT FROM OLD.execution_scope THEN
        RAISE EXCEPTION 'execution_scope is immutable (execution %)', OLD.id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_studio_execution_scope_immutable
    BEFORE UPDATE ON ui_test_executions
    FOR EACH ROW EXECUTE FUNCTION studio_execution_scope_immutable();

-- Created before V15 observed execution guards; V17 installs audit/retry enforcement.
ALTER TABLE studio_dispatch_ledger
 ADD COLUMN revoked_at timestamptz,
 ADD COLUMN definite_refusal_attempt_id uuid,
 ADD COLUMN zero_send_decision_attempt_id uuid;
ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_error_code CHECK(
 error_code IS NULL OR error_code IN ('TIMEOUT','DISPATCH_FAILED','DISPATCH_UNKNOWN',
 'START_TIMEOUT','STALE','DISPATCH_DISABLED','AUTHORIZATION_REVOKED','REFERENCE_UNAVAILABLE',
 'CANCELLED','SECRET_TOO_LONG')) NOT VALID;
ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;

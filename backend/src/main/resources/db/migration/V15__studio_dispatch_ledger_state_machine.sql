-- V15__studio_dispatch_ledger_state_machine.sql
-- Story 10.7 (10.7a) — the two CHECK constraints V13 deferred to this story.
-- Source: Architecture "Checks UI Studio" v2.1 §5.1 (acceptance, dispatch, admission),
--         §5.4 (recovery), §8.1 (dispatch ledger). Story 10.7 AC-2.
--
-- Forward-only. Applies after V14. Adding a CHECK to a merged table cannot be done by editing
-- V13, which is why this is a new migration rather than an amendment; it is the ONE migration
-- this story adds, and every column AC-2 through AC-31 needs already exists on V13 or V14.
--
-- The version number was a merge-time fact, not a drafting-time one: V12, V13 and V14 are merged
-- and other Epic-10 branches are in flight, so the story deliberately left it unassigned and it
-- is assigned here as the next free version.

-- ─────────────────────────────────────────────────────────────
-- 1. The dispatch state vocabulary (AC-2)
-- ─────────────────────────────────────────────────────────────
-- The enumerated set is exactly V13's provisional list, unchanged and deliberately so. V13
-- already ships three partial indexes written against this vocabulary and against a SINGLE
-- absorbing terminal state:
--
--     idx_studio_dispatch_ledger_queued          WHERE state IN ('QUEUED','CLAIMED','DISPATCHING')
--     idx_studio_dispatch_ledger_start_deadline  WHERE state <> 'DONE' AND start_deadline_at IS NOT NULL
--     idx_studio_dispatch_ledger_run_deadline    WHERE state <> 'DONE' AND run_deadline_at IS NOT NULL
--
-- Widening or renaming the set would silently strand the indexes the reapers query through, so
-- the vocabulary is inherited rather than designed a second time.
--
-- state is a DISPATCH state and never an outcome: DONE covers success, error, disablement and
-- reaped work alike, and the outcome plus error_code live on the execution history row (§8.2)
-- and are not duplicated here.
--
-- Existing rows: the only values any writer has ever produced are 'QUEUED' (the column default
-- and the entity's constructor) and 'DONE' (V14's partition-locator backfill). Both are in the
-- set, so this applies to a database holding history as well as to an empty one — which
-- LedgerStateMachineMigrationIT proves by seeding rows at V14 and migrating afterwards, the
-- blind spot that hid V14's own browser-CHECK ordering defect.
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

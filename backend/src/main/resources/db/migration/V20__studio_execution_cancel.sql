-- V20__studio_execution_cancel.sql
-- Studio v1 WP4 — a real cancel (decision D4: graceful stop with a 5 s grace, then kill the tree;
-- the terminal outcome is ERROR / CANCELLED).
-- Source: Studio v1 plan §2 "Cancellation"; ADR-002 §29; Architecture v2.1 §8.1 (forward-only).
--
-- Forward-only. Applies after V17. V18 and V19 are reserved for the studio-inference program
-- (plan decision D2), so this version is deliberately not the next integer.
--
-- Two changes, in this order: the error_code vocabulary gains CANCELLED, then the dispatch ledger
-- gains the columns the cancel is recorded in.
--
-- ─────────────────────────────────────────────────────────────
-- 1. error_code: V17's CHECK is replaced, not amended
-- ─────────────────────────────────────────────────────────────
-- A CHECK cannot be altered in place, so V17's constraint is dropped and added again under the
-- same name with the widened list. The name is kept because it is what the operator remedy below,
-- ErrorCodeVocabularyTest and ErrorCodeConstraintMigrationIT all address.
--
-- The value list is the nine the API can assign (dto/ExecutionErrorCode) and the nine the contract
-- declares (components.schemas.ExecutionErrorCode, whose tenth member is the explicit `null`
-- covered by the IS NULL disjunct). ErrorCodeVocabularyTest reads this file, not V17, and asserts
-- all three agree.
--
-- The form is V17's, for V17's reason: ui_test_executions is range-partitioned, so
-- ADD CONSTRAINT ... NOT VALID recurses into every partition without scanning any of them and is
-- enforced on new writes at once, and the separate VALIDATE scans once. Dropping and re-adding
-- happen in one Flyway transaction, so no write can land between them unconstrained.
--
-- ─────────────────────────────────────────────────────────────
-- If this migration fails at deploy — the operator remedy
-- ─────────────────────────────────────────────────────────────
-- The widened list is a superset of V17's, and V17's constraint was validated, so VALIDATE cannot
-- fail on data V17 admitted. If it fails anyway, a row was written while the constraint was absent
-- (a restored dump or a manual repair). It fails with:
--
--   ERROR: check constraint "ck_ui_test_executions_error_code" of relation
--          "<partition name>" is violated by some row
--
-- PostgreSQL names the *relation*, not the row. The offending rows are found with:
--
--   SELECT id, started_at, error_code
--     FROM ui_test_executions
--    WHERE error_code IS NOT NULL
--      AND error_code NOT IN ('TIMEOUT', 'DISPATCH_FAILED', 'DISPATCH_UNKNOWN', 'START_TIMEOUT',
--                             'STALE', 'DISPATCH_DISABLED', 'AUTHORIZATION_REVOKED',
--                             'REFERENCE_UNAVAILABLE', 'CANCELLED');
--
-- Map each onto a declared value or onto NULL, repair it, and re-run
--
--   ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;
--
-- Do not drop the constraint: while it is NOT VALID it already protects every new write.

ALTER TABLE ui_test_executions DROP CONSTRAINT ck_ui_test_executions_error_code;

ALTER TABLE ui_test_executions
    ADD CONSTRAINT ck_ui_test_executions_error_code
    CHECK (error_code IS NULL
           OR error_code IN ('TIMEOUT', 'DISPATCH_FAILED', 'DISPATCH_UNKNOWN', 'START_TIMEOUT',
                             'STALE', 'DISPATCH_DISABLED', 'AUTHORIZATION_REVOKED',
                             'REFERENCE_UNAVAILABLE', 'CANCELLED'))
    NOT VALID;

ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;

-- ─────────────────────────────────────────────────────────────
-- 2. The cancel request, on the dispatch ledger
-- ─────────────────────────────────────────────────────────────
-- cancel_requested_at / cancel_requested_by: written once, by the cancel compare-and-set in
-- StudioDispatchLedgerStatements.requestCancel, and by nothing else. "Once" is part of that
-- statement's predicate (cancel_requested_at IS NULL), which is what makes a second cancel a 409.
--
-- cancel_relayed_at: when the runner acknowledged the relayed DELETE /v1/runs/{id}. The dispatcher
-- relays every marked, dispatched row whose relay is not yet acknowledged, so this column is what
-- stops a pass from sending the same DELETE again. It is not the run's end: the run ends when the
-- runner's FINAL report lands, or when the running reaper closes a cancel nobody finished.
--
-- The state column is unchanged. A cancel is a request against a dispatch state, never a state of
-- its own: queued work is closed to DONE at once, and dispatched work keeps its state until the
-- runner or the reaper ends it. Adding a CANCELLING state would strand V13's partial indexes the
-- same way V15 explains for any widening of that vocabulary.
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
    'When the runner acknowledged the relayed DELETE /v1/runs/{id}. Not the end of the run.';

-- V17__studio_execution_error_code_check.sql
-- Story 10.14 — ADR-002 O-11: ui_test_executions.error_code gets the CHECK it has never had.
-- Source: ADR-002 §15.5, §15.9 (O-11), §18.2 (the form and the partitioned-table caveat);
--         Architecture "Checks UI Studio" v2.1 §8.1 (forward-only), §8.2 (the (id, started_at)
--         primary key and the partition behaviour), §5.4 / §8.2 (the terminal vocabulary).
--
-- Forward-only. Applies after V16.
--
-- Why: video_status was constrained in the adjacent V14 §1 statement and error_code was not, so
-- the enum §15 declares is enforced on the write path by convention and on the read path by
-- nothing — ExecutionSnapshotMapper publishes the column verbatim. No row can hold an undeclared
-- value today; a restored dump or a manual repair could, and it would be published as though the
-- API had assigned it.
--
-- The value list is the eight the API can actually assign (dto/ExecutionErrorCode) and the eight
-- the frozen contract declares (components.schemas.ExecutionErrorCode, whose ninth member is the
-- explicit `null` covered by the IS NULL disjunct). ErrorCodeVocabularyTest reads this file and
-- both of those sources and asserts all three agree, so the next widening of §15's vocabulary is a
-- red test rather than a silent drift.
--
-- ─────────────────────────────────────────────────────────────
-- Partitioned parent: NOT VALID, then VALIDATE
-- ─────────────────────────────────────────────────────────────
-- ui_test_executions is range-partitioned by started_at with primary key (id, started_at) since
-- V7, and ALTER TABLE on the parent recurses into every partition including the DEFAULT one.
-- ADD CONSTRAINT ... NOT VALID adds the constraint to the parent and to every partition without
-- scanning any of them, and it is enforced on every new write immediately; VALIDATE CONSTRAINT
-- then scans once.
--
-- Verified against postgres:15-alpine (PostgreSQL 15.19), the image the IT tier runs:
--   * ADD CONSTRAINT ... NOT VALID on the partitioned parent is accepted and produces one
--     pg_constraint row per relation (parent + every partition), all with convalidated = false;
--   * a new INSERT carrying an undeclared value is refused immediately, with the failing row in
--     the error DETAIL, while the constraint is still NOT VALID;
--   * VALIDATE CONSTRAINT fails loudly on dirty data.
--
-- ─────────────────────────────────────────────────────────────
-- If this migration fails at deploy — the operator remedy
-- ─────────────────────────────────────────────────────────────
-- VALIDATE CONSTRAINT fails with:
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
--                             'REFERENCE_UNAVAILABLE');
--
-- A value outside the vocabulary can only have arrived by a restored dump or a manual repair
-- (§15.5). Decide per row whether it maps onto a declared value or onto NULL — an ERROR whose
-- cause the API could not name is `error_code IS NULL` by contract — repair it, and re-run
--
--   ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;
--
-- Do not drop the constraint: while it is NOT VALID it is already protecting every new write, and
-- dropping it restores exactly the condition this migration exists to end.

ALTER TABLE ui_test_executions
    ADD CONSTRAINT ck_ui_test_executions_error_code
    CHECK (error_code IS NULL
           OR error_code IN ('TIMEOUT', 'DISPATCH_FAILED', 'DISPATCH_UNKNOWN', 'START_TIMEOUT',
                             'STALE', 'DISPATCH_DISABLED', 'AUTHORIZATION_REVOKED',
                             'REFERENCE_UNAVAILABLE'))
    NOT VALID;

ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;

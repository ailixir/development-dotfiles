-- V16__studio_compile_started_at.sql
--
-- Story 10.9, AC-16/AC-17. Architecture §4.7 — "Recovery of an abandoned compile request marks it
-- retryable without replacing the confirmed history".
--
-- Forward-only. Story 10.8 recorded the gap this closes: `ui_tests` had no column from which a
-- stranded `COMPILING` row could be aged, because `updated_at` is bumped by any edit and says
-- nothing about when a compile began. The per-attempt budget and the late-result drop are held in
-- memory and so do not survive an API restart.
--
-- What this buys is a truthful authoring display and a `compile_error` the author can see — NOT a
-- recovered capability. Readiness never reads `compile_status` (story 10.8 AC-22/AC-23), so a row
-- stranded in `COMPILING` blocks nothing that matters: the confirmed revision still executes and
-- `POST /execute` is still accepted. Nothing here may change that.

-- 1. The column.
--
-- The invariant the application maintains is `compile_started_at IS NOT NULL` <=>
-- `compile_status = 'COMPILING'`: `beginCompile` sets it in the same single statement that sets
-- the request identity and the status, and every terminal transition — publishCandidate,
-- publishInvalid, publishError and the sweep — clears it.
ALTER TABLE ui_tests
    ADD COLUMN compile_started_at TIMESTAMPTZ;

-- 2. The sweep's selection path.
--
-- Partial, restricted to the one status the sweep can act on, following V12's own partial-index
-- style (`idx_ui_tests_quarantined`, `idx_ui_tests_visible_csi`). Almost no row is compiling at
-- any moment, so a full index over the column would be mostly dead weight on every write.
CREATE INDEX idx_ui_tests_compiling_started
    ON ui_tests(compile_started_at)
    WHERE compile_status = 'COMPILING';

-- 3. Backfill the rows that are already stranded.
--
-- To the migration's own clock, deliberately: a row already in `COMPILING` when this deploys was
-- begun at a time nobody recorded, and there is no honest value to recover. Ageing it from
-- deployment means it is swept one threshold after the deployment that gave it a clock, which is
-- the earliest defensible moment. Borrowing `updated_at` would have invented a start time that any
-- edit could have moved.
--
-- No other row is touched: the WHERE clause is the status, and the statement writes this column
-- only. No `confirmed_revision_id`, no `current_candidate_revision_id` and no `ui_test_revisions`
-- row changes.
UPDATE ui_tests
   SET compile_started_at = NOW()
 WHERE compile_status = 'COMPILING'
   AND compile_started_at IS NULL;

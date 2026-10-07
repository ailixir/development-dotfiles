-- Story 10.49 — Run-confirmed compiles (ADR-002 §35.5 item 1; C0-A3 §4 wording).
--
-- 1. ui_test_compile_requests."trigger": the server-captured action that started the compile.
--    The closed set is C0-A3's: RUN, COMPILE_CHANGES, REBUILD_ALL. V1 writes only RUN (the route is
--    the trigger, §35.3); the two v2 values exist so the column's domain is the contract's.
--    Immutable after insert with no new code: V18's trg_ui_test_compile_requests_immutable rejects
--    every UPDATE and DELETE on this table. Nullable with no default and no backfill: a request row
--    written before V29 (or by a writer that has no trigger to state) reads NULL, which is never
--    RUN and so is never auto-accepted. A DEFAULT would stamp a trigger the server did not observe.
--
-- 2. ui_test_revisions.confirmation_source: RUN (Run auto-accept) or MANUAL (confirm-compile),
--    written in the same statement as confirmed_by/confirmed_at. Rows confirmed before V29 keep
--    NULL ("unknown") and are never backfilled as MANUAL: that would falsify the audit (§35.5).
--    ck_ui_test_revisions_confirmation_source also forbids a source on an unconfirmed revision.
--
-- 3. ui_test_revisions_write_once(): amended under V27's contract — deny-by-default form kept, NOT
--    an enumerated column list. confirmation_source joins the exclusion array (so the first
--    confirmation may set it) and the write-once check (so it cannot be set, changed or cleared on a
--    revision that is already confirmed — including a pre-V29 row, which blocks a later backfill).
--    InferenceMigrationLatestIT's mutable-column allow-list gains it in the same change.
--
-- Forward-only. Touches no rows. Does not touch, renumber or depend on the staged
-- backend/db/cutover/V19__studio_inference_candidate_identity.sql.
-- Rollback (if ever required, forward migration): re-run V27's function body, then
--   ALTER TABLE ui_test_revisions DROP COLUMN confirmation_source;
--   ALTER TABLE ui_test_compile_requests DROP COLUMN "trigger";
-- (dropping a column of ui_test_compile_requests is DDL, not DML, so V18's row trigger allows it.)

ALTER TABLE ui_test_compile_requests
    ADD COLUMN "trigger" VARCHAR(20),
    ADD CONSTRAINT ck_ui_test_compile_requests_trigger
        CHECK ("trigger" IN ('RUN', 'COMPILE_CHANGES', 'REBUILD_ALL'));

ALTER TABLE ui_test_revisions
    ADD COLUMN confirmation_source VARCHAR(10),
    ADD CONSTRAINT ck_ui_test_revisions_confirmation_source
        CHECK (confirmation_source IS NULL
               OR (confirmation_source IN ('RUN', 'MANUAL') AND confirmed_by IS NOT NULL));

CREATE OR REPLACE FUNCTION ui_test_revisions_write_once()
RETURNS TRIGGER AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['confirmed_by', 'confirmed_at', 'confirmation_source'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['confirmed_by', 'confirmed_at', 'confirmation_source'])
    THEN
        RAISE EXCEPTION
            'ui_test_revisions is immutable; only first confirmation may change (revision %)',
            OLD.id
            USING ERRCODE = '23514';
    END IF;

    IF (OLD.confirmed_by IS NOT NULL OR OLD.confirmed_at IS NOT NULL)
       AND (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
            OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
            OR NEW.confirmation_source IS DISTINCT FROM OLD.confirmation_source)
    THEN
        RAISE EXCEPTION
            'ui_test_revisions confirmation is write-once (revision %)', OLD.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ui_test_revisions_write_once() IS
    'Canonical deny-by-default guard (V18, restored V27, V29 adds confirmation_source): every '
    'ui_test_revisions column except the first-confirmation set (confirmed_by, confirmed_at, '
    'confirmation_source) is immutable. Never redefine with an enumerated column list.';
COMMENT ON COLUMN ui_test_compile_requests."trigger" IS
    'Server-captured compile trigger (C0-A3): RUN for every v1 compile. NULL = not captured '
    '(pre-V29 or no trigger stated); never auto-accepted.';
COMMENT ON COLUMN ui_test_revisions.confirmation_source IS
    'RUN = accepted by the Run action without prior review; MANUAL = confirm-compile. '
    'NULL on a confirmed row = confirmed before V29, unknown; never backfilled.';

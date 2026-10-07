-- Story 10.23 defect D1 — restore deny-by-default immutability of ui_test_revisions.
--
-- V18 replaced V12's enumerated column list with a generic diff so that every column, including
-- ones added later, is immutable unless explicitly excluded. V21, V22, V23 and V24 each then
-- CREATE OR REPLACE'd this function with an enumerated list again, which silently dropped the
-- seven V18 columns (compile_request_id, authoring_snapshot, authoring_hash, scope_reviewed_by,
-- scope_reviewed_at, compilation_fingerprint, baseline_revision_id) from the guard.
--
-- This restores the V18 form. It protects the union of every column V12, V18, V21, V22, V23 and
-- V24 intended to protect (all of them are every column except the first confirmation pair), and
-- any column a future migration adds. Forward-only: no rows are touched.
--
-- Contract for future migrations (enforced by InferenceMigrationLatestIT, which mutates every
-- column of ui_test_revisions on the head schema):
--   * Do NOT redefine this function with an enumerated column list.
--   * A new column is immutable automatically; nothing needs to change here.
--   * A column that must be mutable is a deliberate exception: add it to the exclusion array below
--     (in a new migration) and to the test's allow-list in the same change.
CREATE OR REPLACE FUNCTION ui_test_revisions_write_once()
RETURNS TRIGGER AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['confirmed_by', 'confirmed_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['confirmed_by', 'confirmed_at'])
    THEN
        RAISE EXCEPTION
            'ui_test_revisions is immutable; only first confirmation may change (revision %)',
            OLD.id
            USING ERRCODE = '23514';
    END IF;

    IF (OLD.confirmed_by IS NOT NULL OR OLD.confirmed_at IS NOT NULL)
       AND (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
            OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
    THEN
        RAISE EXCEPTION
            'ui_test_revisions confirmation is write-once (revision %)', OLD.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ui_test_revisions_write_once() IS
    'Canonical deny-by-default guard (V18, restored V27): every ui_test_revisions column except '
    'confirmed_by/confirmed_at is immutable. Never redefine with an enumerated column list.';

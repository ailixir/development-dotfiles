-- Story 10.35 — context-aware authoring and immutable revision snapshots.
--
-- Legacy rows deliberately remain NULL. They are promoted only by the first successful v2
-- authoring write, so a read-only rollout neither fabricates step identities nor changes history.
ALTER TABLE ui_tests
    ADD COLUMN authoring JSONB,
    ADD COLUMN authoring_revision_inputs JSONB;

ALTER TABLE ui_test_revisions
    ADD COLUMN authoring JSONB,
    ADD COLUMN authoring_revision_inputs JSONB;

ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_authoring_v2
    CHECK (authoring IS NULL OR (
        authoring ->> 'authoringSchemaVersion' = '2'
        AND jsonb_typeof(authoring -> 'steps') = 'array'
        AND NOT jsonb_path_exists(authoring, '$.** ? (@.source == "observed")')
    ));

ALTER TABLE ui_test_revisions ADD CONSTRAINT ck_ui_test_revisions_authoring_v2
    CHECK (authoring IS NULL OR (
        authoring ->> 'authoringSchemaVersion' = '2'
        AND jsonb_typeof(authoring -> 'steps') = 'array'
        AND NOT jsonb_path_exists(authoring, '$.** ? (@.source == "observed")')
    ));

-- CompileStateService already locks the current ui_tests row before inserting a candidate. This
-- trigger therefore captures the exact authoring inputs guarded by that compile request without
-- widening the compiler surface or allowing a caller to provide a different snapshot.
CREATE FUNCTION capture_ui_test_revision_authoring()
RETURNS TRIGGER AS $$
BEGIN
    SELECT t.authoring, t.authoring_revision_inputs
      INTO NEW.authoring, NEW.authoring_revision_inputs
      FROM ui_tests t
     WHERE t.id = NEW.test_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ui_test_revisions_capture_authoring
    BEFORE INSERT ON ui_test_revisions
    FOR EACH ROW EXECUTE FUNCTION capture_ui_test_revision_authoring();

-- Extend V12's write-once rule to the newly introduced snapshot columns. Existing rows are not
-- updated, and their NULL snapshot truthfully records that they predate context-aware authoring.
CREATE OR REPLACE FUNCTION ui_test_revisions_write_once()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id                      IS DISTINCT FROM OLD.id
    OR NEW.test_id                 IS DISTINCT FROM OLD.test_id
    OR NEW.csi_id                  IS DISTINCT FROM OLD.csi_id
    OR NEW.source_revision         IS DISTINCT FROM OLD.source_revision
    OR NEW.configuration_revision  IS DISTINCT FROM OLD.configuration_revision
    OR NEW.source                  IS DISTINCT FROM OLD.source
    OR NEW.source_hash             IS DISTINCT FROM OLD.source_hash
    OR NEW.artifact                IS DISTINCT FROM OLD.artifact
    OR NEW.artifact_hash           IS DISTINCT FROM OLD.artifact_hash
    OR NEW.artifact_schema_version IS DISTINCT FROM OLD.artifact_schema_version
    OR NEW.configuration           IS DISTINCT FROM OLD.configuration
    OR NEW."references"            IS DISTINCT FROM OLD."references"
    OR NEW.provenance              IS DISTINCT FROM OLD.provenance
    OR NEW.authoring               IS DISTINCT FROM OLD.authoring
    OR NEW.authoring_revision_inputs IS DISTINCT FROM OLD.authoring_revision_inputs
    OR NEW.created_by              IS DISTINCT FROM OLD.created_by
    OR NEW.created_at              IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION
            'ui_test_revisions is immutable; only confirmed_by/confirmed_at may change (revision %)',
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

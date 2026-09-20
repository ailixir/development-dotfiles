-- Story 10.39: immutable compiler expectation replayed by confirmation and dispatch.
ALTER TABLE ui_test_revisions ADD COLUMN expected_intent JSONB;

-- Artifact identity now includes the exact expectation snapshot. This permits a pre-ADR v2 row
-- with a NULL snapshot to be recompiled into an executable candidate even when the model emits
-- byte-identical artifact source.
ALTER TABLE ui_test_revisions DROP CONSTRAINT uq_ui_test_revisions_identity;
CREATE UNIQUE INDEX uq_ui_test_revisions_identity
    ON ui_test_revisions (
        test_id, source_revision, configuration_revision, artifact_hash,
        COALESCE(expected_intent::text, ''));

-- Existing v2 candidates predate ADR-003 and truthfully remain NULL. New v2 inserts must carry
-- the validated snapshot and therefore require recompilation instead of a legacy fallback.
ALTER TABLE ui_test_revisions
    ADD CONSTRAINT ck_ui_test_revisions_v2_expected_intent
    CHECK (authoring IS NULL OR expected_intent IS NOT NULL) NOT VALID;

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
    OR NEW.expected_intent         IS DISTINCT FROM OLD.expected_intent
    OR NEW.created_by              IS DISTINCT FROM OLD.created_by
    OR NEW.created_at              IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION
            'ui_test_revisions is immutable; only confirmed_by/confirmed_at may change (revision %)',
            OLD.id USING ERRCODE = '23514';
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

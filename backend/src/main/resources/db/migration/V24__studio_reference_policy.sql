-- Story 10.44 / ADR-SC-003: the structural reference policy replaces the English-derived expected
-- intent. The derivation version keeps its V23 column: it now names the reference-policy
-- derivation ("2"), and V23's CHECK that authoring-v2 rows carry a version stays valid unchanged.
ALTER TABLE ui_test_revisions ADD COLUMN reference_policy JSONB;

-- New authoring-v2 rows carry a reference policy instead of an expected intent. Historical rows
-- keep their expected_intent truthfully (forward-only) and remain NULL here, which readiness and
-- confirmation already treat as COMPILE_REQUIRED.
ALTER TABLE ui_test_revisions DROP CONSTRAINT ck_ui_test_revisions_v2_expected_intent;
ALTER TABLE ui_test_revisions
    ADD CONSTRAINT ck_ui_test_revisions_v2_reference_policy
    CHECK (authoring IS NULL OR reference_policy IS NOT NULL) NOT VALID;

-- The policy joins the identity. expected_intent stays in it so historical rows that differed only
-- by their expectation remain distinct and the index can be rebuilt over existing data.
DROP INDEX uq_ui_test_revisions_identity;
CREATE UNIQUE INDEX uq_ui_test_revisions_identity
    ON ui_test_revisions (
        test_id, source_revision, configuration_revision, artifact_hash,
        COALESCE(expected_intent::text, ''), COALESCE(reference_policy::text, ''),
        COALESCE(intent_derivation_version, ''));

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
    OR NEW.reference_policy        IS DISTINCT FROM OLD.reference_policy
    OR NEW.intent_derivation_version IS DISTINCT FROM OLD.intent_derivation_version
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

-- STUDIO-OBS-012A / ADR-SC-005 D-B. ISOLATED DRAFT rev 2 (post wave 1a); not applied to any dev DB.
-- Fresh baseline after untouched V1–V11. Constraint names kept from V21/V24 (_v2) so pinned tests do not churn.

-- Retained observed authoring input identity; no compile job/candidate state.
CREATE TABLE ui_test_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 test_id uuid NOT NULL REFERENCES ui_tests(id),
 csi_id varchar(20) NOT NULL,
 source_revision bigint NOT NULL,
 configuration_revision bigint NOT NULL,
 source jsonb NOT NULL,
 source_hash varchar(64) NOT NULL,
 artifact jsonb NOT NULL,
 artifact_hash varchar(64) NOT NULL,
 artifact_schema_version integer NOT NULL,
 configuration jsonb NOT NULL,
 "references" jsonb NOT NULL,
 provenance jsonb NOT NULL,
 authoring jsonb,
 authoring_revision_inputs jsonb,
 reference_policy jsonb,
 created_by varchar(255) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_by varchar(255) NOT NULL,
 confirmed_at timestamptz NOT NULL,
 confirmation_source varchar(10) NOT NULL,
 CONSTRAINT uq_ui_test_revisions_id_test_csi UNIQUE(id,test_id,csi_id),
 CONSTRAINT ck_ui_test_revisions_confirmation_source CHECK(confirmation_source='GUIDED_RUN'),
 CONSTRAINT ck_ui_test_revisions_authoring_v2 CHECK(authoring IS NULL OR (
  authoring->>'authoringSchemaVersion'='2' AND jsonb_typeof(authoring->'steps')='array'
  AND NOT jsonb_path_exists(authoring,'$.** ? (@.source == "observed")'))),
 -- Rev 2: retained V24 rule (validated: fresh table, no legacy rows). Observed publication
 -- always writes reference_policy; the V15 replay binding hashes it.
 CONSTRAINT ck_ui_test_revisions_v2_reference_policy CHECK(authoring IS NULL OR reference_policy IS NOT NULL)
);
CREATE INDEX idx_ui_test_revisions_test_created ON ui_test_revisions(test_id,created_at DESC);
CREATE INDEX idx_ui_test_revisions_csi ON ui_test_revisions(csi_id);
-- All revisions are published and already confirmed; immutable includes future columns.
CREATE FUNCTION ui_test_revisions_write_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  RAISE EXCEPTION 'ui_test_revisions is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_ui_test_revisions_write_once BEFORE UPDATE ON ui_test_revisions
 FOR EACH ROW EXECUTE FUNCTION ui_test_revisions_write_once();
ALTER TABLE ui_tests
 ADD COLUMN source_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN configuration_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN confirmed_revision_id uuid REFERENCES ui_test_revisions(id),
 ADD COLUMN quarantined_at timestamptz,
 ADD COLUMN authoring jsonb,
 ADD COLUMN authoring_revision_inputs jsonb,
 ADD CONSTRAINT uq_ui_tests_id_csi UNIQUE(id,csi_id),
 ADD CONSTRAINT ck_ui_tests_authoring_v2 CHECK(authoring IS NULL OR (
  authoring->>'authoringSchemaVersion'='2' AND jsonb_typeof(authoring->'steps')='array'
  AND NOT jsonb_path_exists(authoring,'$.** ? (@.source == "observed")')));
-- V1 core drafts retain ownership and source; absent CSI is quarantined, never invented.
DO $$
DECLARE
    quarantined_count INTEGER;
BEGIN
    UPDATE ui_tests t
       SET quarantined_at = NOW()
     WHERE t.quarantined_at IS NULL
       AND (t.csi_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM csi_systems c WHERE c.id = t.csi_id));
    GET DIAGNOSTICS quarantined_count = ROW_COUNT;
    RAISE NOTICE 'V12: quarantined % ui_tests row(s) with a missing or unregistered CSI',
        quarantined_count;
END
$$;

-- Every non-quarantined test carries a CSI. The API additionally requires the CSI to be
-- registered on create and forbids changing it on update (409 CSI_IMMUTABLE).
ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_csi_registered
    CHECK (csi_id IS NOT NULL OR quarantined_at IS NOT NULL);

CREATE INDEX idx_ui_tests_quarantined
    ON ui_tests(quarantined_at)
    WHERE quarantined_at IS NOT NULL;

-- Visible-row lookup path used by every list/get query (deleted and quarantined excluded).
CREATE INDEX idx_ui_tests_visible_csi
    ON ui_tests(csi_id, created_at DESC)
    WHERE deleted_at IS NULL AND quarantined_at IS NULL;

-- Retain the exact current authoring capture used by guided publication.
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

-- 6. Canonical browser value (§8.3)
-- ─────────────────────────────────────────────────────────────
-- 'chromium' is the only engine the observed path executes. Legacy 'chrome' is the same engine under its old
-- name. Any other engine is converted to chromium so the row stays authored and readable, but
-- those drafts have no published revision and must be learned before execution.
-- V1's inline ui_tests_browser_check permits only chrome/firefox/safari/edge, so it MUST be
-- dropped BEFORE any row is rewritten to 'chromium'. Rewriting first aborts the whole migration
-- with SQLSTATE 23514 on any database that already holds a legacy row.
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
           AND att.attname = 'browser'
    LOOP
        EXECUTE format('ALTER TABLE ui_tests DROP CONSTRAINT %I', r.conname);
    END LOOP;
END
$$;

DO $$
DECLARE
    renamed INTEGER;
    converted INTEGER;
BEGIN
    UPDATE ui_tests SET browser = 'chromium' WHERE browser = 'chrome';
    GET DIAGNOSTICS renamed = ROW_COUNT;

    UPDATE ui_tests SET browser = 'chromium' WHERE browser <> 'chromium';
    GET DIAGNOSTICS converted = ROW_COUNT;

    RAISE NOTICE 'V14: renamed % ui_tests row(s) from chrome to chromium', renamed;
    RAISE NOTICE 'V14: converted % ui_tests row(s) from a non-chrome legacy engine to chromium; '
                 'they remain unlearned until a guided publication', converted;
END
$$;

ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_browser
    CHECK (browser IN ('chromium'));

ALTER TABLE ui_tests ALTER COLUMN browser SET DEFAULT 'chromium';

-- ─────────────────────────────────────────────────────────────

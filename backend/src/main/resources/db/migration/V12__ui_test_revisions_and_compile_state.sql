-- V12__ui_test_revisions_and_compile_state.sql
-- Story 10.4 — Immutable revisions and compile state.
-- Source: Architecture "Checks UI Studio" v2.1 §4.2 (revision/confirmation lifecycle),
--         §8.1 (drafts and immutable revisions), BRD §9 (no authored test is lost).
--
-- Forward-only. Legacy ui_tests rows keep their history: they end this migration STALE,
-- with no candidate and no confirmed revision. No revision rows are fabricated.
--
-- FOC-01: this file is the ONLY migration owned by story 10.4. Story 10.1 owns V13/V14.

-- ─────────────────────────────────────────────────────────────
-- 1. ui_test_revisions — immutable compiled candidates (§8.1)
-- ─────────────────────────────────────────────────────────────
-- NOTE: "references" is a reserved SQL keyword, so the column is a quoted identifier.
-- It holds the declared variable/secret references of the artifact (never resolved values).
CREATE TABLE ui_test_revisions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- No ON DELETE CASCADE: revision history must survive a soft-deleted (or later purged) draft.
    test_id                 UUID         NOT NULL REFERENCES ui_tests(id),
    csi_id                  VARCHAR(20)  NOT NULL,
    source_revision         BIGINT       NOT NULL,
    configuration_revision  BIGINT       NOT NULL,
    source                  JSONB        NOT NULL,
    source_hash             VARCHAR(64)  NOT NULL,
    artifact                JSONB        NOT NULL,
    artifact_hash           VARCHAR(64)  NOT NULL,
    artifact_schema_version INTEGER      NOT NULL,
    configuration           JSONB        NOT NULL,
    "references"            JSONB        NOT NULL,
    provenance              JSONB        NOT NULL,
    created_by              VARCHAR(255) NOT NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    confirmed_by            VARCHAR(255),
    confirmed_at            TIMESTAMPTZ,
    CONSTRAINT uq_ui_test_revisions_identity
        UNIQUE (test_id, source_revision, configuration_revision, artifact_hash),
    CONSTRAINT ck_ui_test_revisions_confirmation_pair
        CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

CREATE INDEX idx_ui_test_revisions_test_created
    ON ui_test_revisions(test_id, created_at DESC);

CREATE INDEX idx_ui_test_revisions_csi
    ON ui_test_revisions(csi_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Write-once enforcement on ui_test_revisions (§4.2, §8.1)
-- ─────────────────────────────────────────────────────────────
-- Ordinary test CRUD cannot alter revision history: an UPDATE may only move
-- confirmed_by/confirmed_at from NULL to a value, exactly once.
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

CREATE TRIGGER trg_ui_test_revisions_write_once
    BEFORE UPDATE ON ui_test_revisions
    FOR EACH ROW EXECUTE FUNCTION ui_test_revisions_write_once();

-- ─────────────────────────────────────────────────────────────
-- 3. ui_tests — draft revisions, compile state, quarantine (§4.2, §8.1)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ui_tests
    ADD COLUMN source_revision               BIGINT      NOT NULL DEFAULT 1,
    ADD COLUMN configuration_revision        BIGINT      NOT NULL DEFAULT 1,
    ADD COLUMN compile_status                VARCHAR(30) NOT NULL DEFAULT 'STALE',
    ADD COLUMN compile_request_id            UUID,
    ADD COLUMN compile_error                 JSONB,
    ADD COLUMN compile_diagnostics           JSONB,
    ADD COLUMN current_candidate_revision_id UUID REFERENCES ui_test_revisions(id),
    ADD COLUMN confirmed_revision_id         UUID REFERENCES ui_test_revisions(id),
    ADD COLUMN quarantined_at                TIMESTAMPTZ;

ALTER TABLE ui_tests ADD CONSTRAINT ck_ui_tests_compile_status
    CHECK (compile_status IN
        ('STALE', 'COMPILING', 'AWAITING_CONFIRMATION', 'READY', 'NEEDS_REVISION'));

-- Legacy rows: explicitly STALE with no candidate and no confirmed revision.
-- Legacy history is retained without pretending it had confirmed artifacts (§8.1).
UPDATE ui_tests
   SET compile_status                = 'STALE',
       current_candidate_revision_id = NULL,
       confirmed_revision_id         = NULL,
       compile_request_id            = NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. CSI quarantine (§9.1 CSI immutability, BRD §9 no authored test is lost)
-- ─────────────────────────────────────────────────────────────
-- Rows whose CSI is null or is not a registered csi_system are quarantined, never
-- deleted and never reassigned. Resolution is an explicit later migration or admin
-- action; the application hides quarantined rows from every user-facing path and
-- from compile/confirm/execute.
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

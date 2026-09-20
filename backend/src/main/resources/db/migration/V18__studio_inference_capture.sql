-- Story 10.23 / C0: additive expansion only. V19 lives outside db/migration.
-- Never infer historical step identity, scope review, compile attempts or full-run evidence.
ALTER TABLE ui_tests
    ADD COLUMN authoring_snapshot JSONB,
    ADD COLUMN authoring_hash VARCHAR(64),
    ADD COLUMN scope_reviewed_by VARCHAR(255),
    ADD COLUMN scope_reviewed_at TIMESTAMPTZ,
    ADD CONSTRAINT uq_ui_tests_id_csi UNIQUE (id, csi_id),
    ADD CONSTRAINT ck_ui_tests_authoring_pair CHECK
        ((authoring_snapshot IS NULL) = (authoring_hash IS NULL)),
    ADD CONSTRAINT ck_ui_tests_scope_review CHECK
        ((scope_reviewed_by IS NULL) = (scope_reviewed_at IS NULL)
         AND (scope_reviewed_at IS NULL OR authoring_snapshot IS NOT NULL));

CREATE TABLE ui_test_step_identities (
    step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES ui_tests(id),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ui_test_step_identities_test ON ui_test_step_identities(test_id);

-- Immediate baseline ownership is a foreign-key invariant, not a content-hash entitlement.
ALTER TABLE ui_test_revisions
    ADD CONSTRAINT uq_ui_test_revisions_id_test_csi UNIQUE (id, test_id, csi_id);

CREATE TABLE ui_test_compile_requests (
    request_id UUID PRIMARY KEY,
    test_id UUID NOT NULL,
    csi_id VARCHAR(20) NOT NULL,
    source_revision BIGINT NOT NULL CHECK (source_revision > 0),
    configuration_revision BIGINT NOT NULL CHECK (configuration_revision > 0),
    source JSONB NOT NULL CHECK (jsonb_typeof(source) = 'array'),
    source_hash VARCHAR(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
    authoring_snapshot JSONB,
    authoring_hash VARCHAR(64),
    scope_reviewed_by VARCHAR(255),
    scope_reviewed_at TIMESTAMPTZ,
    configuration JSONB NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
    "references" JSONB NOT NULL CHECK (jsonb_typeof("references") = 'object'),
    compilation_fingerprint VARCHAR(64) NOT NULL
        CHECK (compilation_fingerprint ~ '^[0-9a-f]{64}$'),
    compilation_plan JSONB NOT NULL CHECK (jsonb_typeof(compilation_plan) = 'object'),
    baseline_revision_id UUID,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_ui_test_compile_request_deadline CHECK (deadline_at > created_at),
    CONSTRAINT ck_ui_test_compile_request_authoring CHECK
        ((authoring_snapshot IS NULL) = (authoring_hash IS NULL)
         AND (authoring_hash IS NULL OR authoring_hash ~ '^[0-9a-f]{64}$')),
    CONSTRAINT ck_ui_test_compile_request_scope CHECK
        ((scope_reviewed_by IS NULL) = (scope_reviewed_at IS NULL)
         AND (scope_reviewed_at IS NULL OR authoring_snapshot IS NOT NULL)),
    CONSTRAINT fk_ui_test_compile_request_owner FOREIGN KEY (test_id, csi_id)
        REFERENCES ui_tests(id, csi_id),
    CONSTRAINT fk_ui_test_compile_request_baseline
        FOREIGN KEY (baseline_revision_id, test_id, csi_id)
        REFERENCES ui_test_revisions(id, test_id, csi_id),
    CONSTRAINT uq_ui_test_compile_request_capture
        UNIQUE (request_id, test_id, csi_id, source_revision, configuration_revision)
);
CREATE INDEX idx_ui_test_compile_requests_test_created
    ON ui_test_compile_requests(test_id, created_at DESC, request_id DESC);
CREATE INDEX idx_ui_test_compile_requests_baseline
    ON ui_test_compile_requests(baseline_revision_id) WHERE baseline_revision_id IS NOT NULL;

-- Settlement is separate from the immutable input record and itself can be written only once.
CREATE TABLE ui_test_compile_outcomes (
    request_id UUID PRIMARY KEY REFERENCES ui_test_compile_requests(request_id),
    outcome JSONB NOT NULL CHECK (jsonb_typeof(outcome) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ui_test_revisions
    ADD COLUMN compile_request_id UUID,
    ADD COLUMN authoring_snapshot JSONB,
    ADD COLUMN authoring_hash VARCHAR(64),
    ADD COLUMN scope_reviewed_by VARCHAR(255),
    ADD COLUMN scope_reviewed_at TIMESTAMPTZ,
    ADD COLUMN compilation_fingerprint VARCHAR(64),
    ADD COLUMN baseline_revision_id UUID,
    ADD CONSTRAINT uq_ui_test_revisions_compile_request UNIQUE (compile_request_id),
    ADD CONSTRAINT fk_ui_test_revision_compile_capture
        FOREIGN KEY (compile_request_id, test_id, csi_id, source_revision, configuration_revision)
        REFERENCES ui_test_compile_requests
            (request_id, test_id, csi_id, source_revision, configuration_revision),
    ADD CONSTRAINT fk_ui_test_revision_baseline
        FOREIGN KEY (baseline_revision_id, test_id, csi_id)
        REFERENCES ui_test_revisions(id, test_id, csi_id),
    ADD CONSTRAINT ck_ui_test_revision_authoring_pair CHECK
        ((authoring_snapshot IS NULL) = (authoring_hash IS NULL)),
    ADD CONSTRAINT ck_ui_test_revision_scope_review CHECK
        ((scope_reviewed_by IS NULL) = (scope_reviewed_at IS NULL)
         AND (scope_reviewed_at IS NULL OR authoring_snapshot IS NOT NULL)),
    ADD CONSTRAINT ck_ui_test_revision_request_metadata CHECK
        (compile_request_id IS NULL OR compilation_fingerprint IS NOT NULL);

CREATE INDEX idx_ui_test_revisions_eligible
    ON ui_test_revisions(test_id, csi_id, compilation_fingerprint, created_at DESC, id DESC)
    WHERE confirmed_at IS NOT NULL AND authoring_snapshot IS NOT NULL;
CREATE INDEX idx_ui_test_revisions_baseline
    ON ui_test_revisions(baseline_revision_id) WHERE baseline_revision_id IS NOT NULL;

CREATE FUNCTION studio_inference_append_only() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ui_test_step_identities_immutable
    BEFORE UPDATE OR DELETE ON ui_test_step_identities
    FOR EACH ROW EXECUTE FUNCTION studio_inference_append_only();
CREATE TRIGGER trg_ui_test_compile_requests_immutable
    BEFORE UPDATE OR DELETE ON ui_test_compile_requests
    FOR EACH ROW EXECUTE FUNCTION studio_inference_append_only();
CREATE TRIGGER trg_ui_test_compile_outcomes_immutable
    BEFORE UPDATE OR DELETE ON ui_test_compile_outcomes
    FOR EACH ROW EXECUTE FUNCTION studio_inference_append_only();

-- Future columns are protected by default. Only first confirmation may change a revision.
CREATE OR REPLACE FUNCTION ui_test_revisions_write_once() RETURNS TRIGGER AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['confirmed_by', 'confirmed_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['confirmed_by', 'confirmed_at']) THEN
        RAISE EXCEPTION 'ui_test_revisions is immutable; only first confirmation may change'
            USING ERRCODE = '23514';
    END IF;
    IF (OLD.confirmed_by IS NOT NULL OR OLD.confirmed_at IS NOT NULL)
        AND (NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
             OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) THEN
        RAISE EXCEPTION 'ui_test_revisions confirmation is write-once' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A candidate must copy the request's captured input, never a later mutable draft.
CREATE FUNCTION studio_inference_revision_capture() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.compile_request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ui_test_compile_requests r
         WHERE r.request_id = NEW.compile_request_id
           AND r.test_id = NEW.test_id AND r.csi_id = NEW.csi_id
           AND r.source_revision = NEW.source_revision
           AND r.configuration_revision = NEW.configuration_revision
           AND r.source = NEW.source AND r.source_hash = NEW.source_hash
           AND r.configuration = NEW.configuration AND r."references" = NEW."references"
           AND r.authoring_snapshot IS NOT DISTINCT FROM NEW.authoring_snapshot
           AND r.authoring_hash IS NOT DISTINCT FROM NEW.authoring_hash
           AND r.scope_reviewed_by IS NOT DISTINCT FROM NEW.scope_reviewed_by
           AND r.scope_reviewed_at IS NOT DISTINCT FROM NEW.scope_reviewed_at
           AND r.compilation_fingerprint = NEW.compilation_fingerprint
           AND r.baseline_revision_id IS NOT DISTINCT FROM NEW.baseline_revision_id
    ) THEN
        RAISE EXCEPTION 'candidate does not match immutable compile request capture'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ui_test_revision_capture
    BEFORE INSERT ON ui_test_revisions
    FOR EACH ROW EXECUTE FUNCTION studio_inference_revision_capture();

CREATE FUNCTION studio_inference_authoring_revision() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.authoring_snapshot IS DISTINCT FROM OLD.authoring_snapshot
        OR NEW.authoring_hash IS DISTINCT FROM OLD.authoring_hash
        OR NEW.scope_reviewed_by IS DISTINCT FROM OLD.scope_reviewed_by
        OR NEW.scope_reviewed_at IS DISTINCT FROM OLD.scope_reviewed_at)
        AND NEW.source_revision <= OLD.source_revision THEN
        RAISE EXCEPTION 'authoring/scope change requires a new source_revision'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ui_test_authoring_revision
    BEFORE UPDATE ON ui_tests
    FOR EACH ROW EXECUTE FUNCTION studio_inference_authoring_revision();

ALTER TABLE ui_test_executions
    ADD COLUMN execution_scope VARCHAR(20),
    ADD CONSTRAINT ck_ui_test_execution_scope CHECK (execution_scope IS NULL OR execution_scope = 'FULL');
CREATE INDEX idx_ui_test_exec_full_baseline
    ON ui_test_executions(revision_id, ui_test_id, csi_id, started_at DESC, id DESC)
    WHERE status = 'PASSED' AND execution_scope = 'FULL';

COMMENT ON COLUMN ui_test_executions.execution_scope IS
    'Explicit acceptance scope. NULL historical rows never establish incremental eligibility.';
COMMENT ON COLUMN ui_test_revisions.compile_request_id IS
    'Unique attempt identity; historical rows stay NULL. Old content uniqueness remains until staged V19.';
COMMENT ON TABLE ui_test_compile_requests IS
    'Immutable captured inputs; commit before network work. No resolved variable or secret values.';

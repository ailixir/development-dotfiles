-- MANUALLY STAGED, NOT on the application Flyway classpath.
-- See docs/runbooks/studio-inference-rollout.md. Snapshot and drain incompatible writers first.
-- A release operator must explicitly attest the completed writer barrier for this DB session.
DO $$
BEGIN
    IF current_setting('checks.inference_publishers_drained', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'V19 requires the compatible-writer drain barrier'
            USING ERRCODE = '23514';
    END IF;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE ui_test_revisions DROP CONSTRAINT uq_ui_test_revisions_identity;

-- Old historical rows remain untouched; after cutover every new candidate needs an attempt.
CREATE FUNCTION studio_inference_require_request() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.compile_request_id IS NULL THEN
        RAISE EXCEPTION 'new candidate requires immutable compile request after V19'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ui_test_revision_require_request
    BEFORE INSERT ON ui_test_revisions
    FOR EACH ROW EXECUTE FUNCTION studio_inference_require_request();

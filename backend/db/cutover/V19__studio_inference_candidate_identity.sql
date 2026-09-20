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

-- `uq_ui_test_revisions_identity` is a table CONSTRAINT on a schema that stops at V18 (V12 created
-- it that way, and this cutover was written for that state), but V22 dropped that constraint and
-- re-created the same name as a UNIQUE INDEX (so it could carry COALESCE(expected_intent::text,
-- '')), and V23 re-created it again with the derivation version. This file is staged by hand, so
-- it can meet either state: drop whichever form exists, and still fail loudly if neither does.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ui_test_revisions'::regclass
          AND conname = 'uq_ui_test_revisions_identity'
    ) THEN
        ALTER TABLE ui_test_revisions DROP CONSTRAINT uq_ui_test_revisions_identity;
    ELSE
        DROP INDEX uq_ui_test_revisions_identity;
    END IF;
END;
$$ LANGUAGE plpgsql;

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

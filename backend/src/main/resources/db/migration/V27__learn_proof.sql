-- STUDIO proof = replay of the published revision.
-- Forward-only on top of V1-V26. A successful learn is followed by one observed replay of exactly the
-- revision it published, accepted inside the publication commit (trigger source AFTER_LEARN). The
-- learn recording is kept only for a learn that did not publish, so nothing is dropped here.
--
--   1. The execution trigger-source CHECK admits AFTER_LEARN (no schedule, no scheduled slot).
--   2. studio_learn_proofs links a published session to its proof execution, or records why the
--      proof was refused. It is a separate table because ui_test_executions is range-partitioned
--      (V7) and cannot carry a unique single-column identity or be the target of a foreign key; the
--      unpartitioned dispatch ledger owns that identity, so the link points there. No
--      learn_session_id column is added to executions.

-- 1. Trigger attribution.
ALTER TABLE ui_test_executions
    DROP CONSTRAINT ck_ui_test_executions_trigger_source,
    ADD CONSTRAINT ck_ui_test_executions_trigger_source CHECK (
        (trigger_source = 'SCHEDULED' AND scheduled_at IS NOT NULL)
        OR ((trigger_source IS NULL OR trigger_source IN ('MANUAL', 'AFTER_LEARN'))
            AND schedule_id IS NULL AND scheduled_at IS NULL));

-- 2. One immutable link per published session: exactly one of an accepted execution or a refusal.
--    The refusal set is closed; it is never shown to a client (the result carries proof null).
CREATE TABLE studio_learn_proofs (
    session_id   varchar(256) PRIMARY KEY,
    revision_id  uuid         NOT NULL,
    execution_id uuid         UNIQUE REFERENCES studio_dispatch_ledger (execution_id),
    refusal_code varchar(32),
    created_at   timestamptz  NOT NULL DEFAULT clock_timestamp(),
    -- The proof belongs to the revision this very session published.
    FOREIGN KEY (session_id, revision_id)
        REFERENCES studio_guided_publications (session_id, revision_id),
    CONSTRAINT ck_studio_learn_proofs_outcome
        CHECK ((execution_id IS NULL) <> (refusal_code IS NULL)),
    CONSTRAINT ck_studio_learn_proofs_refusal CHECK (refusal_code IS NULL OR refusal_code IN (
        'DISPATCH_DISABLED', 'PENDING_QUOTA_EXCEEDED', 'REFERENCE_UNAVAILABLE',
        'VAULT_UNAVAILABLE', 'STEP_LIMIT_EXCEEDED', 'NOT_READY', 'RUNTIME_INCOMPATIBLE'))
);

-- The linked execution is the AFTER_LEARN replay of that same revision (matching binding), reached
-- through the ledger's partition locator.
CREATE FUNCTION studio_learn_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM studio_dispatch_ledger l
          JOIN ui_test_executions e
            ON e.id = l.execution_id AND e.started_at = l.execution_accepted_at
         WHERE l.execution_id = NEW.execution_id
           AND e.trigger_source = 'AFTER_LEARN'
           AND e.revision_id = NEW.revision_id
           AND e.observed_revision_binding->>'revisionId' = NEW.revision_id::text) THEN
        RAISE EXCEPTION 'learn proof must link the AFTER_LEARN execution of the published revision'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_studio_learn_proof_guard BEFORE INSERT ON studio_learn_proofs
    FOR EACH ROW EXECUTE FUNCTION studio_learn_proof_guard();

CREATE FUNCTION studio_learn_proof_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'learn proof link is immutable'; END $$;
CREATE TRIGGER tr_studio_learn_proof_immutable BEFORE UPDATE OR DELETE ON studio_learn_proofs
    FOR EACH ROW EXECUTE FUNCTION studio_learn_proof_immutable();

-- Observed-1 is additive; no legacy execute, revision or schedule row is changed.
CREATE TABLE studio_guided_sessions (
    session_id varchar(256) PRIMARY KEY,
    test_id varchar(256) NOT NULL,
    principal_id varchar(256) NOT NULL,
    scope_hash char(64) NOT NULL,
    state varchar(32) NOT NULL,
    expires_at timestamptz NOT NULL,
    document jsonb NOT NULL,
    progress jsonb NOT NULL DEFAULT '{}'::jsonb,
    finalization_identity char(64),
    UNIQUE (session_id, scope_hash),
    CHECK (state IN ('PREPARING','OBSERVING','PROPOSING','ACTING','AWAITING_CLARIFICATION',
      'AWAITING_AUTH','FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')),
    CHECK (document->>'sessionId' = session_id),
    CHECK (document->>'scopeHash' = scope_hash),
    CHECK (document->>'state' = state),
    CHECK (document->'scope'->>'principalId' = principal_id)
);
CREATE INDEX ix_guided_session_expiry ON studio_guided_sessions (expires_at);
CREATE TABLE studio_guided_actions (
    admission_id varchar(256) PRIMARY KEY,
    session_id varchar(256) NOT NULL REFERENCES studio_guided_sessions(session_id),
    step_id varchar(256) NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    document jsonb NOT NULL,
    proposal jsonb NOT NULL,
    UNIQUE (session_id, step_id, ordinal),
    CHECK (document->'admission'->>'admissionId' = admission_id),
    CHECK (document->>'sessionId' = session_id),
    CHECK (document->'coordinate'->>'stepId' = step_id),
    CHECK ((document->'coordinate'->>'ordinal')::integer = ordinal),
    CHECK ((document->>'dispatchCount')::integer IN (0,1)),
    CHECK ((document->>'state' IN ('ADMITTED','REVOKED') AND document->>'dispatchCount' = '0')
        OR (document->>'state' IN ('DISPATCHING','SUCCEEDED','FAILED','UNKNOWN_OUTCOME') AND document->>'dispatchCount' = '1'))
);
CREATE TABLE studio_guided_commands (
    namespace varchar(256) NOT NULL,
    route varchar(64) NOT NULL,
    idempotency_key varchar(256) NOT NULL,
    request_digest char(64) NOT NULL,
    response jsonb NOT NULL,
    PRIMARY KEY (namespace, route, idempotency_key)
);
-- Evidence contains opaque, scoped references only; never snapshots or runtime values.
CREATE TABLE studio_guided_evidence (
    session_id varchar(256) NOT NULL REFERENCES studio_guided_sessions(session_id),
    evidence_id varchar(256) NOT NULL,
    scope_hash char(64) NOT NULL,
    evidence_kind varchar(16) NOT NULL CHECK (evidence_kind IN ('guided','replay')),
    evidence_ref varchar(256) NOT NULL,
    FOREIGN KEY (session_id,scope_hash) REFERENCES studio_guided_sessions(session_id,scope_hash),
    PRIMARY KEY (session_id,evidence_id)
);
CREATE FUNCTION studio_guided_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.document->'sessionId' IS DISTINCT FROM NEW.document->'sessionId'
       OR OLD.document->'testId' IS DISTINCT FROM NEW.document->'testId'
       OR OLD.document->'scopeHash' IS DISTINCT FROM NEW.document->'scopeHash'
       OR OLD.scope_hash IS DISTINCT FROM NEW.scope_hash
       OR OLD.principal_id IS DISTINCT FROM NEW.principal_id
       OR OLD.document->'scope' IS DISTINCT FROM NEW.document->'scope'
       OR OLD.document->'limits' IS DISTINCT FROM NEW.document->'limits'
       OR OLD.document->'versions' IS DISTINCT FROM NEW.document->'versions'
       OR OLD.document->'sourceSteps' IS DISTINCT FROM NEW.document->'sourceSteps'
       OR OLD.document->'runAuthorization' IS DISTINCT FROM NEW.document->'runAuthorization'
       OR OLD.document->'createdAt' IS DISTINCT FROM NEW.document->'createdAt'
       OR OLD.document->'expiresAt' IS DISTINCT FROM NEW.document->'expiresAt'
       OR OLD.test_id IS DISTINCT FROM NEW.test_id OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
      RAISE EXCEPTION 'guided identity is immutable';
    END IF;
    IF OLD.state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
       AND NEW.state <> OLD.state THEN RAISE EXCEPTION 'guided terminal state is immutable'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_identity BEFORE UPDATE ON studio_guided_sessions
FOR EACH ROW EXECUTE FUNCTION studio_guided_immutable_identity();
CREATE FUNCTION studio_guided_immutable_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.proposal IS DISTINCT FROM NEW.proposal THEN RAISE EXCEPTION 'guided proposal is immutable'; END IF;
    IF (OLD.document - ARRAY['state','dispatchCount','outcomeCode','assertionPassed'])
       IS DISTINCT FROM (NEW.document - ARRAY['state','dispatchCount','outcomeCode','assertionPassed'])
       OR (NEW.document->>'dispatchCount')::integer < (OLD.document->>'dispatchCount')::integer THEN
      RAISE EXCEPTION 'guided admission is immutable';
    END IF;
    IF OLD.document->>'state' IN ('SUCCEEDED','FAILED','UNKNOWN_OUTCOME','REVOKED')
       AND NEW.document IS DISTINCT FROM OLD.document THEN RAISE EXCEPTION 'guided outcome is immutable'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_admission BEFORE UPDATE ON studio_guided_actions
FOR EACH ROW EXECUTE FUNCTION studio_guided_immutable_admission();

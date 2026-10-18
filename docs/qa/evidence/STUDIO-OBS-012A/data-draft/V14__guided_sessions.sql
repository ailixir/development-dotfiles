-- STUDIO-OBS-012A / ADR-SC-005 D-B. ISOLATED DRAFT rev 2 (post wave 1a); not applied to any dev DB.
-- Fresh baseline after untouched V1–V11; integrate in the single compile-green Lane M batch.

-- One guided contract generation; all existing identity/admission guards retained.
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
    CONSTRAINT ck_guided_session_state_v3 CHECK (state IN ('PREPARING','OBSERVING','PROPOSING','ACTING','AWAITING_CLARIFICATION',
      'FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')),
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

-- Bridge identity/admission/terminal guards remain authoritative.
ALTER TABLE studio_guided_actions ADD CONSTRAINT uq_guided_action_session UNIQUE(session_id,admission_id);
CREATE TABLE studio_guided_assignments (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_sessions(session_id),
 assignment_id varchar(256) NOT NULL UNIQUE,
 scope_hash char(64) NOT NULL,
 worker_id varchar(256) NOT NULL,
 expected_fence integer NOT NULL CHECK(expected_fence BETWEEN 0 AND 2147483646),
 intent jsonb NOT NULL,
 receipt jsonb,
 live boolean NOT NULL DEFAULT true,
 FOREIGN KEY(session_id,scope_hash) REFERENCES studio_guided_sessions(session_id,scope_hash),
 CHECK(intent->>'sessionId' IS NOT NULL AND intent->>'sessionId'=session_id),
 CHECK(intent->>'assignmentId' IS NOT NULL AND intent->>'assignmentId'=assignment_id),
 CHECK(intent->>'workerId' IS NOT NULL AND intent->>'workerId'=worker_id),
 CHECK(intent->>'scopeHash' IS NOT NULL AND intent->>'scopeHash'=scope_hash),
 CHECK(intent->>'expectedFence' IS NOT NULL AND (intent->>'expectedFence')::integer=expected_fence),
 CHECK(receipt IS NULL OR (receipt->>'status' IS NOT NULL AND receipt->>'status'='OWNED'
   AND receipt->'assignment' IS NOT NULL AND receipt->'assignment'=intent
   AND receipt->>'leaseExpiresAt' IS NOT NULL
   AND receipt->>'ownerFence' IS NOT NULL AND (receipt->>'ownerFence')::integer=expected_fence+1))
);
CREATE FUNCTION studio_guided_assignment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)-ARRAY['live','receipt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['live','receipt'])
 OR (NOT OLD.live AND NEW.live) OR (OLD.receipt IS NOT NULL AND OLD.receipt IS DISTINCT FROM NEW.receipt) THEN
 RAISE EXCEPTION 'guided assignment is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_assignment_identity BEFORE UPDATE ON studio_guided_assignments FOR EACH ROW EXECUTE FUNCTION studio_guided_assignment_identity();

CREATE TABLE studio_guided_materializations (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_assignments(session_id),
 scope_hash char(64) NOT NULL,
 context_id varchar(256) NOT NULL UNIQUE,
 context_revision integer NOT NULL CHECK(context_revision > 0),
 materialization_revision integer NOT NULL CHECK(materialization_revision > 0),
 worker_id varchar(256) NOT NULL,
 owner_fence integer NOT NULL CHECK(owner_fence > 0),
 source_revision varchar(256) NOT NULL,
 configuration_revision varchar(256) NOT NULL,
 authored_inputs_hash char(64) NOT NULL CHECK(authored_inputs_hash ~ '^[a-f0-9]{64}$'),
 authored_inputs jsonb NOT NULL,
 live boolean NOT NULL DEFAULT true,
 UNIQUE(session_id,context_id,owner_fence),
 FOREIGN KEY(session_id,scope_hash) REFERENCES studio_guided_sessions(session_id,scope_hash),
 CHECK(authored_inputs->>'sessionId' IS NOT NULL AND authored_inputs->>'sessionId'=session_id),
 CHECK(authored_inputs->>'scopeHash' IS NOT NULL AND authored_inputs->>'scopeHash'=scope_hash)
);
CREATE TABLE studio_guided_preparations (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_materializations(session_id),
 preparation_id varchar(256) NOT NULL,
 context_id varchar(256) NOT NULL,
 owner_fence integer NOT NULL CHECK(owner_fence>0),
 request_digest char(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 proof jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 admission_id varchar(256),
 PRIMARY KEY(session_id,preparation_id),
 FOREIGN KEY(session_id,context_id,owner_fence) REFERENCES studio_guided_materializations(session_id,context_id,owner_fence),
 CHECK(proof->>'contextId' IS NOT NULL AND proof->>'contextId'=context_id),
 CHECK(proof->>'ownerFence' IS NOT NULL AND (proof->>'ownerFence')::integer=owner_fence),
 UNIQUE(session_id,admission_id),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 CHECK(proof->>'sessionId' IS NOT NULL AND proof->>'sessionId'=session_id),
 CHECK(proof->>'preparationId' IS NOT NULL AND proof->>'preparationId'=preparation_id),
 CHECK(proof->>'requestDigest' IS NOT NULL AND proof->>'requestDigest'=request_digest)
);
CREATE TABLE studio_guided_allocations (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_materializations(session_id),
 binding_id varchar(256) NOT NULL,
 need_id varchar(256) NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(session_id,binding_id), UNIQUE(session_id,need_id),
 CHECK(document->>'bindingId' IS NOT NULL AND document->>'bindingId'=binding_id),
 CHECK(document->>'needId' IS NOT NULL AND document->>'needId'=need_id)
);
CREATE TABLE studio_guided_producers (
 session_id varchar(256) NOT NULL,
 binding_id varchar(256) NOT NULL,
 admission_id varchar(256) NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(session_id,binding_id), UNIQUE(session_id,admission_id),
 UNIQUE(session_id,binding_id,admission_id),
 FOREIGN KEY(session_id,binding_id) REFERENCES studio_guided_allocations(session_id,binding_id),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 CHECK(document->>'bindingId' IS NOT NULL AND document->>'bindingId'=binding_id),
 CHECK(document->>'producerAdmissionId' IS NOT NULL AND document->>'producerAdmissionId'=admission_id)
);
CREATE TABLE studio_guided_consumer_edges (
 session_id varchar(256) NOT NULL,
 consumer_admission_id varchar(256) NOT NULL,
 argument_slot varchar(64) NOT NULL CHECK(argument_slot IN ('fill.value','selectOption.value','assert.expected')),
 binding_id varchar(256) NOT NULL,
 producer_admission_id varchar(256) NOT NULL,
 document jsonb NOT NULL,
 PRIMARY KEY(session_id,consumer_admission_id,argument_slot),
 FOREIGN KEY(session_id,consumer_admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 FOREIGN KEY(session_id,producer_admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 FOREIGN KEY(session_id,binding_id,producer_admission_id) REFERENCES studio_guided_producers(session_id,binding_id,admission_id),
 CHECK(document->>'producerAdmissionId' IS NOT NULL AND document->>'producerAdmissionId'=producer_admission_id),
 CHECK(document->>'consumerAdmissionId' IS NOT NULL AND document->>'consumerAdmissionId'=consumer_admission_id),
 CHECK(document->>'argumentSlot' IS NOT NULL AND document->>'argumentSlot'=argument_slot),
 CHECK(document->>'bindingId' IS NOT NULL AND document->>'bindingId'=binding_id)
);
CREATE FUNCTION studio_guided_bridge_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'guided bridge evidence is immutable'; END $$;
CREATE TRIGGER tr_guided_producer_immutable BEFORE UPDATE OR DELETE ON studio_guided_producers FOR EACH ROW EXECUTE FUNCTION studio_guided_bridge_immutable();
CREATE TRIGGER tr_guided_edge_immutable BEFORE UPDATE OR DELETE ON studio_guided_consumer_edges FOR EACH ROW EXECUTE FUNCTION studio_guided_bridge_immutable();
CREATE FUNCTION studio_guided_materialization_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)-ARRAY['live','materialization_revision']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['live','materialization_revision'])
 OR (NOT OLD.live AND NEW.live) OR NEW.materialization_revision < OLD.materialization_revision THEN
 RAISE EXCEPTION 'guided materialization is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_materialization_identity BEFORE UPDATE ON studio_guided_materializations FOR EACH ROW EXECUTE FUNCTION studio_guided_materialization_identity();
CREATE FUNCTION studio_guided_preparation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(OLD)-'admission_id') IS DISTINCT FROM (to_jsonb(NEW)-'admission_id')
 OR (OLD.admission_id IS NOT NULL AND OLD.admission_id IS DISTINCT FROM NEW.admission_id) THEN
 RAISE EXCEPTION 'guided preparation is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_preparation_identity BEFORE UPDATE ON studio_guided_preparations FOR EACH ROW EXECUTE FUNCTION studio_guided_preparation_identity();

CREATE FUNCTION studio_guided_allocation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.document-'consumers') IS DISTINCT FROM (NEW.document-'consumers')
 OR NOT ((NEW.document->'consumers') @> (OLD.document->'consumers'))
 OR OLD.session_id IS DISTINCT FROM NEW.session_id OR OLD.binding_id IS DISTINCT FROM NEW.binding_id OR OLD.need_id IS DISTINCT FROM NEW.need_id THEN
 RAISE EXCEPTION 'guided allocation history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_allocation_identity BEFORE UPDATE ON studio_guided_allocations FOR EACH ROW EXECUTE FUNCTION studio_guided_allocation_identity();

-- OBS-005 adds interpretation provenance, never another execution ledger or budget counter.
CREATE TABLE studio_guided_source_manifests (
 session_id varchar(256) PRIMARY KEY,
 scope_hash char(64) NOT NULL,
 manifest jsonb NOT NULL CHECK ((jsonb_typeof(manifest)='object'
   AND jsonb_typeof(manifest->'sourceRevision')='string'
   AND jsonb_typeof(manifest->'configurationRevision')='string'
   AND jsonb_typeof(manifest->'testId')='string'
   AND jsonb_typeof(manifest->'policy')='string'
   AND jsonb_typeof(manifest->'sourceSteps')='array'
   AND jsonb_array_length(manifest->'sourceSteps') BETWEEN 1 AND 100
   AND octet_length(manifest::text)<=1048576) IS TRUE),
 manifest_hash char(64) NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(session_id,scope_hash),
 FOREIGN KEY(session_id,scope_hash) REFERENCES studio_guided_sessions(session_id,scope_hash)
);
CREATE TABLE studio_guided_translation_plans (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_source_manifests(session_id),
 plan_revision bigint NOT NULL CHECK(plan_revision>0),
 parent_revision bigint NOT NULL CHECK(parent_revision>=0 AND parent_revision=plan_revision-1),
 plan jsonb NOT NULL CHECK ((jsonb_typeof(plan)='object' AND jsonb_typeof(plan->'obligations')='array'
   AND jsonb_array_length(plan->'obligations')<=800 AND octet_length(plan::text)<=1048576) IS TRUE),
 plan_hash char(64) NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,plan_revision)
);
CREATE TABLE studio_guided_translation_state (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_source_manifests(session_id),
 plan_revision bigint CHECK(plan_revision>0),
 continuation varchar(32) NOT NULL DEFAULT 'SOURCE_PLAN'
   CHECK(continuation IN ('SOURCE_PLAN','NEXT_ACTION','VERIFY_STEP','MATERIALIZE','NEXT','REFRESH','AWAITING_CLARIFICATION','OBSERVING','FINALIZING','STOPPED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(session_id,plan_revision) REFERENCES studio_guided_translation_plans(session_id,plan_revision)
);
CREATE TABLE studio_guided_model_attempts (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_translation_state(session_id),
 attempt_id varchar(256) NOT NULL,
 request_id varchar(256) NOT NULL,
 attempt_number integer NOT NULL CHECK(attempt_number>0 AND attempt_number<=3),
 kind varchar(32) NOT NULL CHECK(kind IN ('SOURCE_PLAN','NEXT_ACTION','VERIFY_STEP')),
 identity jsonb NOT NULL CHECK ((jsonb_typeof(identity)='object'
   AND identity->>'sessionId'=session_id AND identity->>'attemptId'=attempt_id
   AND identity->>'requestId'=request_id AND identity->>'kind'=kind
   AND jsonb_typeof(identity->'planRevision')='number'
   AND jsonb_typeof(identity->'owner')='object'
   AND jsonb_typeof(identity->'inputCeiling')='number' AND (identity->>'inputCeiling')::integer>0
   AND jsonb_typeof(identity->'outputCeiling')='number' AND (identity->>'outputCeiling')::integer>0
   AND jsonb_typeof(identity->'scopeHash')='string'
   AND octet_length(identity::text)<=32768) IS TRUE),
 request_digest char(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 translator_id varchar(256) NOT NULL,
 lease_until timestamptz NOT NULL,
 reservation_key varchar(256) NOT NULL,
 settlement_key varchar(256) NOT NULL,
 status varchar(32) NOT NULL CHECK(status IN ('RESERVED','CALLING','APPLIED','REJECTED','SUPERSEDED','UNKNOWN_CALL')),
 safe_result jsonb CHECK(safe_result IS NULL OR (jsonb_typeof(safe_result)='object' AND octet_length(safe_result::text)<=1048576) IS TRUE),
 input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,attempt_id), UNIQUE(session_id,request_id,attempt_number),
 UNIQUE(session_id,reservation_key), UNIQUE(session_id,settlement_key)
);
CREATE UNIQUE INDEX uq_guided_translation_live_attempt ON studio_guided_model_attempts(session_id)
 WHERE status IN ('RESERVED','CALLING');
CREATE TABLE studio_guided_model_usage_audit (
 session_id varchar(256) NOT NULL, attempt_id varchar(256) NOT NULL,
 input_tokens integer CHECK(input_tokens>=0), output_tokens integer CHECK(output_tokens>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,attempt_id),
 FOREIGN KEY(session_id,attempt_id) REFERENCES studio_guided_model_attempts(session_id,attempt_id)
);
CREATE TABLE studio_guided_obligation_admissions (
 session_id varchar(256) NOT NULL,
 obligation_id varchar(256) NOT NULL,
 plan_revision bigint NOT NULL,
 meaning jsonb NOT NULL CHECK ((jsonb_typeof(meaning)='object' AND meaning->>'obligationId'=obligation_id
   AND jsonb_typeof(meaning->'stepId')='string' AND jsonb_typeof(meaning->'occurrence')='number'
   AND (meaning->>'occurrence')::integer BETWEEN 0 AND 7
   AND octet_length(meaning::text)<=32768) IS TRUE),
 proposal jsonb NOT NULL CHECK((jsonb_typeof(proposal)='object' AND jsonb_typeof(proposal->'coordinate')='object'
   AND jsonb_typeof(proposal->'coordinate'->'stepId')='string'
   AND jsonb_typeof(proposal->'coordinate'->'ordinal')='number'
   AND (proposal->'coordinate'->>'ordinal')::integer BETWEEN 0 AND 7
   AND octet_length(proposal::text)<=131072) IS TRUE),
 proposal_digest char(64) NOT NULL CHECK(proposal_digest ~ '^[a-f0-9]{64}$'),
 admission_key varchar(256) NOT NULL,
 admission_id varchar(256),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,obligation_id), UNIQUE(session_id,admission_key), UNIQUE(session_id,admission_id),
 FOREIGN KEY(session_id,plan_revision) REFERENCES studio_guided_translation_plans(session_id,plan_revision),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id)
);
CREATE UNIQUE INDEX uq_guided_translation_coordinate ON studio_guided_obligation_admissions
 (session_id,(proposal->'coordinate'->>'stepId'),(proposal->'coordinate'->>'ordinal'));
CREATE TABLE studio_guided_clarification_contexts (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_translation_state(session_id),
 clarification_id varchar(256) NOT NULL,
 identity jsonb NOT NULL CHECK((jsonb_typeof(identity)='object' AND identity->>'sessionId'=session_id
   AND identity->>'clarificationId'=clarification_id AND identity ? 'sourceRevision'
   AND identity ? 'configurationRevision' AND identity ? 'question'
   AND octet_length(identity::text)<=65536) IS TRUE),
 meanings jsonb NOT NULL CHECK((jsonb_typeof(meanings)='array' AND jsonb_array_length(meanings) BETWEEN 1 AND 10
   AND octet_length(meanings::text)<=65536) IS TRUE),
 accepted_choice varchar(256),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,clarification_id)
);
CREATE FUNCTION studio_guided_translation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'guided translation record is immutable'; END $$;
CREATE TRIGGER tr_guided_manifest_immutable BEFORE UPDATE OR DELETE ON studio_guided_source_manifests FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_immutable();
CREATE TRIGGER tr_guided_plan_immutable BEFORE UPDATE OR DELETE ON studio_guided_translation_plans FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_immutable();
CREATE TRIGGER tr_guided_usage_immutable BEFORE UPDATE OR DELETE ON studio_guided_model_usage_audit FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_immutable();
-- Rev 2 decision: terminal attempts stay fully immutable here, safe_result included. Publication
-- evidence (GuidedPublicationEvidenceRepository) and idempotent settlement (GuidedTranslationStore)
-- require APPLIED safe_result NOT NULL. The narrow "safe_result -> NULL on terminal attempts after
-- session end" prune belongs to OBS-014 V19 (CREATE OR REPLACE of this function) with its policy,
-- pruner and negative immutability tests; V14 does not pre-authorize an unconsumed relaxation.
CREATE FUNCTION studio_guided_translation_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guided attempt is immutable'; END IF;
 IF (to_jsonb(OLD)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at'])
   IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at'])
   OR (OLD.status NOT IN ('RESERVED','CALLING') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
   OR (OLD.status='CALLING' AND NEW.status='RESERVED') THEN RAISE EXCEPTION 'guided attempt transition refused'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_attempt_guard BEFORE UPDATE OR DELETE ON studio_guided_model_attempts FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_attempt_guard();
CREATE FUNCTION studio_guided_translation_single_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text := TG_ARGV[0];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guided association is immutable'; END IF;
 IF (to_jsonb(OLD)-field) IS DISTINCT FROM (to_jsonb(NEW)-field)
 OR ((to_jsonb(OLD)->field) <> 'null'::jsonb AND (to_jsonb(OLD)->field) IS DISTINCT FROM (to_jsonb(NEW)->field))
 THEN RAISE EXCEPTION 'guided association is single assignment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_obligation_assignment BEFORE UPDATE OR DELETE ON studio_guided_obligation_admissions FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_single_assignment('admission_id');
CREATE TRIGGER tr_guided_question_assignment BEFORE UPDATE OR DELETE ON studio_guided_clarification_contexts FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_single_assignment('accepted_choice');
CREATE FUNCTION studio_guided_translation_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.session_id IS DISTINCT FROM OLD.session_id OR COALESCE(NEW.plan_revision,0)<COALESCE(OLD.plan_revision,0)
 THEN RAISE EXCEPTION 'guided translation head cannot regress'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_head_guard BEFORE UPDATE ON studio_guided_translation_state FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_head_guard();
-- A single-assignment FK must also bind the exact existing ledger identity, not merely any row.
CREATE FUNCTION studio_guided_translation_association_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual jsonb;
BEGIN
 IF TG_TABLE_NAME='studio_guided_obligation_admissions' THEN
 IF NEW.admission_id IS NOT NULL THEN
  SELECT document INTO actual FROM studio_guided_actions WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
  IF actual IS NULL OR (actual->>'requestDigest'=NEW.proposal_digest AND actual->'coordinate'=NEW.proposal->'coordinate') IS NOT TRUE
  THEN RAISE EXCEPTION 'guided admission meaning mismatch'; END IF;
 END IF;
 ELSIF TG_TABLE_NAME='studio_guided_clarification_contexts' THEN
 IF NEW.accepted_choice IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.meanings) AS item WHERE item->>'choiceId'=NEW.accepted_choice)
  THEN RAISE EXCEPTION 'guided choice missing'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_obligation_check BEFORE INSERT OR UPDATE ON studio_guided_obligation_admissions FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_association_check();
CREATE TRIGGER tr_guided_question_check BEFORE INSERT OR UPDATE ON studio_guided_clarification_contexts FOR EACH ROW EXECUTE FUNCTION studio_guided_translation_association_check();
-- One row per attempt: reporting reconciles known late usage without mutating session counters.
CREATE VIEW studio_guided_model_usage_report AS
 SELECT a.session_id,a.attempt_id,a.reservation_key,
   COALESCE(u.input_tokens,a.input_tokens) AS actual_input_tokens,
   COALESCE(u.output_tokens,a.output_tokens) AS actual_output_tokens,
   GREATEST((a.identity->>'inputCeiling')::integer,COALESCE(u.input_tokens,a.input_tokens)) AS reported_input_tokens,
   GREATEST((a.identity->>'outputCeiling')::integer,COALESCE(u.output_tokens,a.output_tokens)) AS reported_output_tokens
 FROM studio_guided_model_attempts a
 LEFT JOIN studio_guided_model_usage_audit u USING(session_id,attempt_id);

ALTER TABLE studio_guided_sessions ADD COLUMN revoked_at timestamptz;
CREATE FUNCTION studio_secret_revocation_write_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
  RAISE EXCEPTION 'secret revocation is write-once';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_secret_revocation BEFORE UPDATE ON studio_guided_sessions
 FOR EACH ROW EXECUTE FUNCTION studio_secret_revocation_write_once();
CREATE TRIGGER tr_execution_secret_revocation BEFORE UPDATE ON studio_dispatch_ledger
 FOR EACH ROW EXECUTE FUNCTION studio_secret_revocation_write_once();

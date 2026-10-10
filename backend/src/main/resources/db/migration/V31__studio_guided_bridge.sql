-- Additive observed-2. V30 identity/admission/terminal triggers remain authoritative.
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

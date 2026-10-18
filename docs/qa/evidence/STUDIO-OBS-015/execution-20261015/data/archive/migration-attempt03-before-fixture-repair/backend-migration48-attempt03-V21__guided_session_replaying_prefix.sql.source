-- DESIGN CANDIDATE ONLY; not installed in production migration resources.
-- STUDIO-OBS-015 final data interface. Flyway applies this whole file transactionally.
-- V1-V20 remain byte-identical. All new records retain existing F01 data categories;
-- normalized input history introduces no new distinct values and is NOT pruned by V19.

ALTER TABLE studio_guided_sessions DROP CONSTRAINT ck_guided_session_state_v3,
 ADD CONSTRAINT ck_guided_session_state_v3 CHECK(state IN
 ('PREPARING','REPLAYING_PREFIX','OBSERVING','PROPOSING','ACTING','AWAITING_CLARIFICATION',
 'FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED'));
ALTER TABLE studio_guided_translation_state DROP CONSTRAINT studio_guided_translation_state_continuation_check,
 ADD CONSTRAINT studio_guided_translation_state_continuation_check CHECK(continuation IN
 ('SOURCE_PLAN','REPLAYING_PREFIX','NEXT_ACTION','VERIFY_STEP','MATERIALIZE','NEXT','REFRESH','AWAITING_CLARIFICATION','OBSERVING','FINALIZING','STOPPED'));

CREATE FUNCTION studio_015_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'incremental history is immutable'; END $$;

-- One authoritative base and initial learning boundary, even when k=1.
CREATE TABLE studio_guided_relearn_plans (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_publication_bases(session_id),
 base_revision_id uuid NOT NULL REFERENCES ui_test_revisions(id),
 initial_step_id varchar(256) NOT NULL,
 initial_step_index integer NOT NULL CHECK(initial_step_index BETWEEN 0 AND 99),
 prefix_program jsonb NOT NULL CHECK(octet_length(convert_to(studio_publication_canonical(prefix_program),'UTF8'))<=1048576),
 prefix_program_hash char(64) NOT NULL CHECK(prefix_program_hash=studio_publication_hash(prefix_program)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE studio_guided_relearn_switches (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_relearn_plans(session_id),
 reason varchar(16) NOT NULL CHECK(reason IN ('EMPTY_PREFIX','BOUNDARY','DRIFT')),
 effective_step_id varchar(256) NOT NULL,
 effective_step_index integer NOT NULL CHECK(effective_step_index BETWEEN 0 AND 99),
 next_ordinal integer NOT NULL CHECK(next_ordinal BETWEEN 0 AND 7),
 completed_prefix_count integer NOT NULL CHECK(completed_prefix_count=effective_step_index),
 drift_receipt_hash char(64),
 completed_admissions_hash char(64) GENERATED ALWAYS AS (studio_publication_hash(completed_admissions)) STORED,
 completed_admissions jsonb NOT NULL CHECK(jsonb_typeof(completed_admissions)='array' AND jsonb_array_length(completed_admissions)<=200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((reason='DRIFT')=(drift_receipt_hash IS NOT NULL)),
 CHECK(reason='DRIFT' OR next_ordinal=0),
 CHECK(reason<>'EMPTY_PREFIX' OR (effective_step_index=0 AND completed_admissions='[]'))
);
CREATE FUNCTION studio_015_prefix_pending(id text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_relearn_plans p WHERE p.session_id=id
 AND p.initial_step_index>0 AND NOT EXISTS(SELECT 1 FROM studio_guided_relearn_switches x WHERE x.session_id=id))
$$;
CREATE FUNCTION studio_015_prefix_program(revision_key uuid, ids jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r ui_test_revisions; a jsonb; op jsonb; guard jsonb; result jsonb; actions jsonb:='[]'; sid jsonb;
BEGIN
 SELECT * INTO STRICT r FROM ui_test_revisions WHERE id=revision_key;
 IF jsonb_typeof(ids) IS DISTINCT FROM 'array' OR jsonb_array_length(ids)>99 THEN RAISE EXCEPTION 'prefix IDs invalid'; END IF;
 FOR sid IN SELECT value FROM jsonb_array_elements(ids) LOOP
  FOR a IN SELECT value FROM jsonb_array_elements(r.artifact->'learnedPlan'->'actions')
   WHERE value->'coordinate'->'stepId'=sid ORDER BY (value->'coordinate'->>'ordinal')::integer LOOP
   SELECT operation INTO STRICT op FROM jsonb_array_elements(r.artifact->'steps') step,
    LATERAL jsonb_array_elements(step->'operations') operation WHERE operation->'coordinate'=a->'coordinate';
   SELECT value INTO STRICT guard FROM jsonb_array_elements(r.artifact->'guards') WHERE value->'guardId'=op->'guardId';
   actions:=actions||jsonb_build_array((a-'admissionId')||jsonb_build_object('guard',guard));
  END LOOP;
 END LOOP;
 result:=jsonb_build_object('schemaVersion',3,'baseRevisionId',r.id,'baseRevisionDigest',r.revision_digest,'sourceStepIds',ids,'actions',actions);
 IF jsonb_array_length(actions)>200 OR octet_length(convert_to(studio_publication_canonical(result),'UTF8'))>1048576 THEN RAISE EXCEPTION 'prefix program bounds'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION studio_015_relearn_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; b studio_guided_publication_bases; r ui_test_revisions; ids jsonb;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT b FROM studio_guided_publication_bases WHERE session_id=NEW.session_id;
 SELECT * INTO STRICT r FROM ui_test_revisions WHERE id=NEW.base_revision_id;
 IF s.state<>'PREPARING' OR s.document->'owner'->>'workerId'<>'unclaimed'
 OR b.document->>'confirmedRevisionId' IS DISTINCT FROM NEW.base_revision_id::text
 OR r.test_id<>b.test_id OR r.csi_id<>b.csi_id OR r.publication_kind<>'GUIDED_RUN'
 OR s.document->>'baseRevisionId' IS DISTINCT FROM NEW.base_revision_id::text
 OR s.document->>'firstLearnStepId' IS DISTINCT FROM NEW.initial_step_id
 OR (s.document->'sourceSteps'->NEW.initial_step_index->>'stepId') IS DISTINCT FROM NEW.initial_step_id
 OR (NEW.initial_step_index>0 AND (r.step_snapshot_hashes IS NULL OR r.step_reuse_provenance IS NULL OR NOT (r."references" ? 'authoredDeclarations') OR r."references"->'authoringIdentityVersion' IS DISTINCT FROM '1'::jsonb))
 OR EXISTS(SELECT 1 FROM studio_guided_assignments WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=NEW.session_id)
 THEN RAISE EXCEPTION 'incremental base or start boundary invalid'; END IF;
 SELECT COALESCE(jsonb_agg(value->'stepId' ORDER BY n),'[]') INTO ids
 FROM jsonb_array_elements(s.document->'sourceSteps') WITH ORDINALITY step(value,n) WHERE n<=NEW.initial_step_index;
 IF NEW.prefix_program IS DISTINCT FROM studio_015_prefix_program(NEW.base_revision_id,ids)
 THEN RAISE EXCEPTION 'prefix program does not name pinned base'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_relearn_plan BEFORE INSERT ON studio_guided_relearn_plans FOR EACH ROW EXECUTE FUNCTION studio_015_relearn_plan_guard();

-- Normalized history stores each distinct authored input once, plus immutable version headers.
CREATE TABLE studio_guided_materialization_versions (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_materializations(session_id),
 context_revision integer NOT NULL CHECK(context_revision BETWEEN 1 AND 201),
 context_id varchar(256) NOT NULL, scope_hash char(64) NOT NULL,
 worker_id varchar(256) NOT NULL, owner_fence integer NOT NULL CHECK(owner_fence>0),
 source_revision varchar(256) NOT NULL, configuration_revision varchar(256) NOT NULL,
 materialization_revision integer NOT NULL CHECK(materialization_revision>0),
 input_count integer NOT NULL CHECK(input_count BETWEEN 0 AND 200),
 authored_inputs_identity jsonb NOT NULL,
 authored_inputs_hash char(64) NOT NULL CHECK(authored_inputs_hash ~ '^[a-f0-9]{64}$'),
 previous_inputs_hash char(64), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,context_revision),
 UNIQUE(session_id,context_revision,context_id,owner_fence,authored_inputs_hash),
 CHECK((context_revision=1)=(previous_inputs_hash IS NULL)),
 CHECK(studio_publication_closed(authored_inputs_identity,ARRAY['schemaVersion','sessionId','scopeHash','sourceRevision','configurationRevision'],8192))
);
CREATE TABLE studio_guided_materialization_inputs (
 session_id varchar(256) NOT NULL, input_ordinal integer NOT NULL CHECK(input_ordinal BETWEEN 0 AND 199),
 introduced_revision integer NOT NULL, input_id varchar(256) NOT NULL,
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND document->>'inputId'=input_id AND octet_length(convert_to(studio_publication_canonical(document),'UTF8'))<=32768),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,input_ordinal), UNIQUE(session_id,input_id),
 FOREIGN KEY(session_id,introduced_revision) REFERENCES studio_guided_materialization_versions(session_id,context_revision) DEFERRABLE INITIALLY DEFERRED,
 CHECK((document->>'kind'<>'secretRef' OR NOT(document ? 'value')) IS TRUE)
);
CREATE VIEW studio_guided_materialization_snapshots AS
 SELECT v.*,v.authored_inputs_identity||jsonb_build_object('inputs',
 (SELECT COALESCE(jsonb_agg(i.document ORDER BY i.input_ordinal),'[]') FROM studio_guided_materialization_inputs i
 WHERE i.session_id=v.session_id AND i.input_ordinal<v.input_count)) AS authored_inputs
 FROM studio_guided_materialization_versions v;
-- Existing materialization identity is copied exactly. No ACK, declaration or old hash is invented.
INSERT INTO studio_guided_materialization_versions
 (session_id,context_revision,context_id,scope_hash,worker_id,owner_fence,source_revision,configuration_revision,materialization_revision,input_count,authored_inputs_identity,authored_inputs_hash)
 SELECT session_id,context_revision,context_id,scope_hash,worker_id,owner_fence,source_revision,configuration_revision,materialization_revision,
 jsonb_array_length(authored_inputs->'inputs'),authored_inputs-'inputs',authored_inputs_hash FROM studio_guided_materializations;
INSERT INTO studio_guided_materialization_inputs(session_id,input_ordinal,introduced_revision,input_id,document)
 SELECT m.session_id,n-1,m.context_revision,i->>'inputId',i FROM studio_guided_materializations m,
 LATERAL jsonb_array_elements(m.authored_inputs->'inputs') WITH ORDINALITY item(i,n);
ALTER TABLE studio_guided_materializations ADD CONSTRAINT fk_015_materialization_head
 FOREIGN KEY(session_id,context_revision,context_id,owner_fence,authored_inputs_hash)
 REFERENCES studio_guided_materialization_versions(session_id,context_revision,context_id,owner_fence,authored_inputs_hash) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE studio_guided_materialization_deliveries (
 session_id varchar(256) NOT NULL, context_revision integer NOT NULL CHECK(context_revision BETWEEN 2 AND 201),
 authored_inputs_hash char(64) NOT NULL, materialization_revision integer NOT NULL,
 delivery_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACKNOWLEDGED')),
 context_metadata jsonb, context_hash char(64), ack jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,context_revision),
 FOREIGN KEY(session_id,context_revision) REFERENCES studio_guided_materialization_versions(session_id,context_revision),
 CHECK((status='ACKNOWLEDGED')=(ack IS NOT NULL)),
 CHECK((context_metadata IS NULL)=(context_hash IS NULL)),
 CHECK(context_hash IS NULL OR context_hash ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX uq_015_delivery_live ON studio_guided_materialization_deliveries(session_id) WHERE status='PENDING';
CREATE FUNCTION studio_015_delivery_pending(id text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_materialization_deliveries WHERE session_id=id AND status='PENDING')
$$;
CREATE OR REPLACE FUNCTION studio_guided_materialization_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; old_count integer; new_count integer;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF (to_jsonb(OLD)-ARRAY['live','materialization_revision','context_revision','authored_inputs_hash','authored_inputs'])
 IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['live','materialization_revision','context_revision','authored_inputs_hash','authored_inputs'])
 OR (NOT OLD.live AND NEW.live) OR NEW.materialization_revision<OLD.materialization_revision
 THEN RAISE EXCEPTION 'guided materialization identity is immutable'; END IF;
 IF NEW.context_revision=OLD.context_revision THEN
  IF NEW.authored_inputs IS DISTINCT FROM OLD.authored_inputs OR NEW.authored_inputs_hash IS DISTINCT FROM OLD.authored_inputs_hash
  THEN RAISE EXCEPTION 'input change requires append version'; END IF;
  IF NEW.materialization_revision<>OLD.materialization_revision AND studio_015_delivery_pending(NEW.session_id)
  THEN RAISE EXCEPTION 'context delivery pending'; END IF;
  RETURN NEW;
 END IF;
 old_count:=jsonb_array_length(OLD.authored_inputs->'inputs'); new_count:=jsonb_array_length(NEW.authored_inputs->'inputs');
 IF NOT OLD.live OR NOT NEW.live OR NEW.context_revision<>OLD.context_revision+1 OR NEW.context_revision>201
 OR NEW.materialization_revision<>OLD.materialization_revision+1 OR new_count<=old_count OR new_count>200
 OR NEW.authored_inputs-'inputs' IS DISTINCT FROM OLD.authored_inputs-'inputs'
 OR NEW.authored_inputs_hash<>studio_publication_hash(NEW.authored_inputs) OR octet_length(convert_to(studio_publication_canonical(NEW.authored_inputs),'UTF8'))>1048576
 OR studio_015_prefix_pending(NEW.session_id) OR studio_015_delivery_pending(NEW.session_id)
 OR s.state IN ('FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
 OR (SELECT continuation FROM studio_guided_translation_state WHERE session_id=NEW.session_id) IS DISTINCT FROM 'MATERIALIZE'
 OR EXISTS(SELECT 1 FROM studio_guided_actions WHERE session_id=NEW.session_id AND document->>'state' IN ('ADMITTED','DISPATCHING','UNKNOWN_OUTCOME'))
 OR EXISTS(SELECT 1 FROM studio_guided_preparations WHERE session_id=NEW.session_id AND admission_id IS NULL AND expires_at>clock_timestamp())
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.authored_inputs->'inputs') WITH ORDINALITY x(d,n) WHERE d IS DISTINCT FROM NEW.authored_inputs->'inputs'->(n::integer-1))
 THEN RAISE EXCEPTION 'materialization append refused'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION studio_015_materialization_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_count integer:=0; previous_hash text:=NULL;
BEGIN
 IF TG_OP='UPDATE' AND NEW.context_revision=OLD.context_revision THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' THEN old_count:=jsonb_array_length(OLD.authored_inputs->'inputs'); previous_hash:=OLD.authored_inputs_hash; END IF;
 IF NEW.authored_inputs_hash<>studio_publication_hash(NEW.authored_inputs)
 OR octet_length(convert_to(studio_publication_canonical(NEW.authored_inputs),'UTF8'))>1048576 OR jsonb_array_length(NEW.authored_inputs->'inputs')>200
 OR (TG_OP='INSERT' AND NEW.context_revision<>1) THEN RAISE EXCEPTION 'materialization initial identity invalid'; END IF;
 INSERT INTO studio_guided_materialization_versions
 (session_id,context_revision,context_id,scope_hash,worker_id,owner_fence,source_revision,configuration_revision,materialization_revision,input_count,authored_inputs_identity,authored_inputs_hash,previous_inputs_hash)
 VALUES(NEW.session_id,NEW.context_revision,NEW.context_id,NEW.scope_hash,NEW.worker_id,NEW.owner_fence,NEW.source_revision,NEW.configuration_revision,NEW.materialization_revision,
 jsonb_array_length(NEW.authored_inputs->'inputs'),NEW.authored_inputs-'inputs',NEW.authored_inputs_hash,previous_hash);
 INSERT INTO studio_guided_materialization_inputs(session_id,input_ordinal,introduced_revision,input_id,document)
 SELECT NEW.session_id,n-1,NEW.context_revision,d->>'inputId',d FROM jsonb_array_elements(NEW.authored_inputs->'inputs') WITH ORDINALITY x(d,n) WHERE n>old_count;
 IF NEW.context_revision>1 THEN
 INSERT INTO studio_guided_materialization_deliveries(session_id,context_revision,authored_inputs_hash,materialization_revision)
 VALUES(NEW.session_id,NEW.context_revision,NEW.authored_inputs_hash,NEW.materialization_revision);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER tr_015_materialization_capture AFTER INSERT OR UPDATE ON studio_guided_materializations FOR EACH ROW EXECUTE FUNCTION studio_015_materialization_capture();
CREATE FUNCTION studio_015_version_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v studio_guided_materialization_snapshots; prior studio_guided_materialization_versions;
BEGIN
 SELECT * INTO STRICT v FROM studio_guided_materialization_snapshots WHERE session_id=NEW.session_id AND context_revision=NEW.context_revision;
 IF v.authored_inputs_hash<>studio_publication_hash(v.authored_inputs)
 OR jsonb_array_length(v.authored_inputs->'inputs')<>v.input_count THEN RAISE EXCEPTION 'materialization history hash mismatch'; END IF;
 IF v.context_revision>1 THEN
 SELECT * INTO STRICT prior FROM studio_guided_materialization_versions WHERE session_id=v.session_id AND context_revision=v.context_revision-1;
 IF v.previous_inputs_hash<>prior.authored_inputs_hash OR v.input_count<=prior.input_count
 OR v.authored_inputs_identity IS DISTINCT FROM prior.authored_inputs_identity
 OR ROW(v.context_id,v.scope_hash,v.worker_id,v.owner_fence,v.source_revision,v.configuration_revision)
 IS DISTINCT FROM ROW(prior.context_id,prior.scope_hash,prior.worker_id,prior.owner_fence,prior.source_revision,prior.configuration_revision)
 THEN RAISE EXCEPTION 'materialization version chain invalid'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_version_commit AFTER INSERT ON studio_guided_materialization_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_version_commit();
CREATE FUNCTION studio_015_history_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m studio_guided_materializations;
BEGIN
 SELECT * INTO STRICT m FROM studio_guided_materializations WHERE session_id=NEW.session_id FOR UPDATE;
 IF TG_TABLE_NAME='studio_guided_materialization_inputs' THEN
  IF NEW.introduced_revision<>m.context_revision OR NEW.document IS DISTINCT FROM m.authored_inputs->'inputs'->NEW.input_ordinal
  THEN RAISE EXCEPTION 'input history is not current append'; END IF;
 ELSE
  IF NEW.context_revision<>m.context_revision OR NEW.authored_inputs_hash<>m.authored_inputs_hash
  OR NEW.authored_inputs_identity IS DISTINCT FROM m.authored_inputs-'inputs'
  OR NEW.input_count<>jsonb_array_length(m.authored_inputs->'inputs')
  OR ROW(NEW.context_id,NEW.scope_hash,NEW.worker_id,NEW.owner_fence,NEW.source_revision,NEW.configuration_revision,NEW.materialization_revision)
  IS DISTINCT FROM ROW(m.context_id,m.scope_hash,m.worker_id,m.owner_fence,m.source_revision,m.configuration_revision,m.materialization_revision) THEN RAISE EXCEPTION 'version history is not current append'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_input_insert BEFORE INSERT ON studio_guided_materialization_inputs FOR EACH ROW EXECUTE FUNCTION studio_015_history_insert();
CREATE TRIGGER tr_015_version_insert BEFORE INSERT ON studio_guided_materialization_versions FOR EACH ROW EXECUTE FUNCTION studio_015_history_insert();
CREATE FUNCTION studio_015_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m studio_guided_materializations; s studio_guided_sessions; p studio_guided_relearn_plans; has_plan boolean; full_context jsonb; metadata_keys text[]:=ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','expiresAt','leaseExpiresAt','approvedOrigins','sourceStepIds','authoredInputsHash','materializationRevision','allocations','producers','consumerEdges','limits','applicationPolicy','policyHash'];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'delivery immutable'; END IF;
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT m FROM studio_guided_materializations WHERE session_id=NEW.session_id;
 IF NEW.context_revision<>m.context_revision OR NEW.authored_inputs_hash<>m.authored_inputs_hash OR NEW.materialization_revision<>m.materialization_revision
 THEN RAISE EXCEPTION 'delivery does not name head'; END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.status<>'PENDING' OR NEW.ack IS NOT NULL OR NEW.context_metadata IS NOT NULL THEN RAISE EXCEPTION 'delivery starts pending and unissued'; END IF;
 RETURN NEW;
 END IF;
 IF OLD.status<>'PENDING' OR (to_jsonb(OLD)-ARRAY['status','ack','context_metadata','context_hash']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','ack','context_metadata','context_hash'])
 THEN RAISE EXCEPTION 'delivery identity immutable'; END IF;
 IF OLD.context_metadata IS NULL THEN
 IF NEW.status<>'PENDING' OR NEW.ack IS NOT NULL OR NOT studio_publication_closed(NEW.context_metadata-ARRAY['prefixProgram','prefixProgramHash'],metadata_keys,2147483647)
 THEN RAISE EXCEPTION 'delivery must issue exact bounded context before ACK'; END IF;
 -- The optional program pair is present for every pinned-base session, including
 -- EMPTY_PREFIX, and never changes after switching to suffix learning.
 SELECT * INTO p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 has_plan:=FOUND;
 IF (NEW.context_metadata ? 'prefixProgram') IS DISTINCT FROM has_plan
 OR (NEW.context_metadata ? 'prefixProgramHash') IS DISTINCT FROM has_plan
 OR (has_plan AND (NEW.context_metadata->'prefixProgram' IS DISTINCT FROM p.prefix_program
 OR NEW.context_metadata->>'prefixProgramHash' IS DISTINCT FROM p.prefix_program_hash::text))
 THEN RAISE EXCEPTION 'issued context prefix program identity invalid'; END IF;
 full_context:=NEW.context_metadata||jsonb_build_object('authoredInputs',m.authored_inputs);
 IF NEW.context_hash IS DISTINCT FROM studio_publication_hash(full_context) OR octet_length(convert_to(studio_publication_canonical(full_context),'UTF8'))>1048576
 OR NEW.context_metadata->>'contextId' IS DISTINCT FROM m.context_id
 OR NEW.context_metadata->>'sessionId' IS DISTINCT FROM m.session_id
 OR NEW.context_metadata->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR NEW.context_metadata->>'contextRevision' IS DISTINCT FROM m.context_revision::text
 OR NEW.context_metadata->>'authoredInputsHash' IS DISTINCT FROM m.authored_inputs_hash::text
 OR NEW.context_metadata->>'materializationRevision' IS DISTINCT FROM m.materialization_revision::text
 OR NEW.context_metadata->>'workerId' IS DISTINCT FROM m.worker_id
 OR NEW.context_metadata->>'ownerFence' IS DISTINCT FROM m.owner_fence::text
 OR NEW.context_metadata->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR NEW.context_metadata->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR NEW.context_metadata->>'expiresAt' IS DISTINCT FROM s.document->>'expiresAt'
 OR NEW.context_metadata->>'leaseExpiresAt' IS DISTINCT FROM s.document->'owner'->>'leaseExpiresAt'
 THEN RAISE EXCEPTION 'issued context identity invalid'; END IF;
 RETURN NEW;
 END IF;
 IF NEW.context_metadata IS DISTINCT FROM OLD.context_metadata OR NEW.context_hash IS DISTINCT FROM OLD.context_hash
 OR NEW.status<>'ACKNOWLEDGED'
 OR NOT studio_publication_closed(NEW.ack,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','materializationRevision','authoredInputsHash','contextHash','deliveryId'],8192)
 OR NEW.ack->>'sessionId' IS DISTINCT FROM NEW.session_id OR NEW.ack->>'deliveryId' IS DISTINCT FROM NEW.delivery_id::text
 OR NEW.ack->>'contextHash' IS DISTINCT FROM NEW.context_hash::text
 OR NEW.ack->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR NEW.ack->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR NEW.ack->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR NEW.ack->>'workerId' IS DISTINCT FROM m.worker_id OR NEW.ack->>'ownerFence' IS DISTINCT FROM m.owner_fence::text
 OR NEW.ack->>'contextId' IS DISTINCT FROM m.context_id OR NEW.ack->>'contextRevision' IS DISTINCT FROM m.context_revision::text
 OR NEW.ack->>'materializationRevision' IS DISTINCT FROM m.materialization_revision::text OR NEW.ack->>'authoredInputsHash' IS DISTINCT FROM m.authored_inputs_hash::text
 OR NEW.ack->>'schemaVersion' IS DISTINCT FROM '3' OR NOT m.live
 OR s.document->'owner'->>'workerId' IS DISTINCT FROM m.worker_id OR s.document->'owner'->>'fence' IS DISTINCT FROM m.owner_fence::text
 OR (s.document->'owner'->>'leaseExpiresAt')::timestamptz<=clock_timestamp() OR s.expires_at<=clock_timestamp()
 OR (NEW.context_metadata->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
 THEN RAISE EXCEPTION 'delivery ACK identity invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_delivery_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_materialization_deliveries FOR EACH ROW EXECUTE FUNCTION studio_015_delivery_guard();

-- Prefix preparation requests are authenticated by the existing owning-worker transport.
-- SQL verifies issued identity; SQL cannot prove physical absence of native browser invocation.
CREATE TABLE studio_guided_prefix_requests (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_relearn_plans(session_id),
 request_digest char(64) NOT NULL, step_id varchar(256) NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 7), evidence_hash char(64) NOT NULL,
 document jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','WAIT','PREPARED','DRIFT')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,request_digest), UNIQUE(session_id,step_id,ordinal,evidence_hash),
 CHECK(request_digest=studio_publication_hash(document)),
 CHECK(studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash'],8192))
);
CREATE UNIQUE INDEX uq_015_prefix_request_live ON studio_guided_prefix_requests(session_id,step_id,ordinal) WHERE status='ISSUED';
CREATE TABLE studio_guided_no_invocation_receipts (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_relearn_plans(session_id),
 request_digest char(64) NOT NULL, admission_id varchar(256), preparation_id varchar(256),
 receipt_hash char(64) NOT NULL UNIQUE, document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(session_id,request_digest) REFERENCES studio_guided_prefix_requests(session_id,request_digest),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 FOREIGN KEY(session_id,preparation_id) REFERENCES studio_guided_preparations(session_id,preparation_id),
 UNIQUE(session_id,receipt_hash),
 CHECK(receipt_hash=studio_publication_hash(document-'receiptHash')),
 CHECK(document->>'receiptHash'=receipt_hash),
 CHECK(studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','requestDigest','admissionId','preparationId','attemptOrdinal','operationHash','phase','nativeInvocationStarted','reason','receiptHash'],16384)),
 CHECK((document->>'phase' IN ('PRE_ADMISSION','ADMITTED_PRE_INVOCATION')
 AND document->'nativeInvocationStarted'='false'::jsonb AND document->'attemptOrdinal'='0'::jsonb
 AND document->>'reason' IN ('TARGET_DRIFT','LOCATOR_AMBIGUOUS','STALE_GENERATION')
 AND (document->>'phase'='PRE_ADMISSION')=(admission_id IS NULL AND preparation_id IS NULL)
 AND (document->>'phase'<>'ADMITTED_PRE_INVOCATION' OR (admission_id IS NOT NULL AND preparation_id IS NOT NULL))) IS TRUE)
);
ALTER TABLE studio_guided_relearn_switches ADD CONSTRAINT fk_015_switch_receipt
 FOREIGN KEY(session_id,drift_receipt_hash) REFERENCES studio_guided_no_invocation_receipts(session_id,receipt_hash);

ALTER TABLE studio_guided_actions ADD COLUMN attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(attempt_ordinal BETWEEN 0 AND 1);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='studio_guided_actions'::regclass AND contype='u'
 AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='studio_guided_actions'::regclass AND attname='session_id'),
 (SELECT attnum FROM pg_attribute WHERE attrelid='studio_guided_actions'::regclass AND attname='step_id'),
 (SELECT attnum FROM pg_attribute WHERE attrelid='studio_guided_actions'::regclass AND attname='ordinal')]::smallint[] LOOP
 EXECUTE format('ALTER TABLE studio_guided_actions DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE studio_guided_actions ADD CONSTRAINT uq_015_action_attempt UNIQUE(session_id,step_id,ordinal,attempt_ordinal);
ALTER TABLE studio_guided_obligation_admissions ADD COLUMN attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(attempt_ordinal BETWEEN 0 AND 1);
DROP INDEX uq_guided_translation_coordinate;
CREATE UNIQUE INDEX uq_guided_translation_coordinate ON studio_guided_obligation_admissions
 (session_id,(proposal->'coordinate'->>'stepId'),(proposal->'coordinate'->>'ordinal'),attempt_ordinal);
CREATE FUNCTION studio_015_current_version(id text, proof jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_materializations m WHERE m.session_id=id AND m.live
 AND proof->>'contextRevision'=m.context_revision::text AND proof->>'authoredInputsHash'=m.authored_inputs_hash
 AND NOT studio_015_delivery_pending(id))
$$;
CREATE FUNCTION studio_015_preparation_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF NOT studio_015_current_version(NEW.session_id,NEW.proof)
 OR NOT EXISTS(SELECT 1 FROM studio_guided_materialization_versions v
 WHERE v.session_id=NEW.session_id AND v.context_revision=(NEW.proof->>'contextRevision')::integer
 AND v.context_id=NEW.context_id AND v.owner_fence=NEW.owner_fence AND v.authored_inputs_hash=NEW.proof->>'authoredInputsHash')
 THEN RAISE EXCEPTION 'preparation version or delivery is stale'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_preparation_version BEFORE INSERT ON studio_guided_preparations FOR EACH ROW EXECUTE FUNCTION studio_015_preparation_version();
CREATE FUNCTION studio_015_action_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; prior studio_guided_actions; receipt studio_guided_no_invocation_receipts;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
 IF ROW(NEW.session_id,NEW.admission_id,NEW.step_id,NEW.ordinal,NEW.attempt_ordinal)
 IS DISTINCT FROM ROW(OLD.session_id,OLD.admission_id,OLD.step_id,OLD.ordinal,OLD.attempt_ordinal)
 THEN RAISE EXCEPTION 'action attempt identity is immutable'; END IF;
 IF OLD.document->>'state'='ADMITTED' AND NEW.document->>'state'='DISPATCHING'
 AND NOT studio_015_current_version(NEW.session_id,NEW.document) THEN RAISE EXCEPTION 'dispatch version stale'; END IF;
 RETURN NEW;
 END IF;
 IF NEW.document->'contextRevision' IS DISTINCT FROM NEW.proposal->'contextRevision'
 OR NEW.document->'authoredInputsHash' IS DISTINCT FROM NEW.proposal->'authoredInputsHash'
 OR NOT EXISTS(SELECT 1 FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id AND p.preparation_id=NEW.document->>'preparationId'
 AND p.request_digest=studio_publication_hash(NEW.proposal) AND p.proof->'contextRevision'=NEW.proposal->'contextRevision'
 AND p.proof->'authoredInputsHash'=NEW.proposal->'authoredInputsHash') THEN RAISE EXCEPTION 'action preparation version mismatch'; END IF;
 IF NEW.document->>'attemptOrdinal' IS DISTINCT FROM NEW.attempt_ordinal::text THEN RAISE EXCEPTION 'ledger attempt ordinal mismatch'; END IF;
 IF NEW.ordinal>=LEAST(8,(s.document->'limits'->>'maxStatementsPerStep')::integer)
 OR (SELECT count(*) FROM studio_guided_actions WHERE session_id=NEW.session_id)>=LEAST(200,(s.document->'limits'->>'maxActions')::integer)
 OR NOT studio_015_current_version(NEW.session_id,NEW.document)
 THEN RAISE EXCEPTION 'action attempt bounds or version'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) AND (NEW.attempt_ordinal<>0 OR NOT EXISTS(SELECT 1 FROM studio_guided_relearn_plans p, LATERAL jsonb_array_elements(p.prefix_program->'actions') op WHERE p.session_id=NEW.session_id AND op->'coordinate'=NEW.document->'coordinate' AND op->>'operationHash'=NEW.document->>'operationHash')) THEN RAISE EXCEPTION 'prefix action differs from verified program'; END IF;
 IF NEW.attempt_ordinal=1 THEN
 SELECT * INTO STRICT prior FROM studio_guided_actions WHERE session_id=NEW.session_id AND step_id=NEW.step_id AND ordinal=NEW.ordinal AND attempt_ordinal=0;
 SELECT * INTO STRICT receipt FROM studio_guided_no_invocation_receipts WHERE session_id=NEW.session_id AND admission_id=prior.admission_id;
 IF prior.document->>'state'<>'FAILED' OR prior.document->>'dispatchCount'<>'1'
 OR receipt.document->>'phase'<>'ADMITTED_PRE_INVOCATION'
 OR NOT EXISTS(SELECT 1 FROM studio_guided_relearn_switches WHERE session_id=NEW.session_id AND reason='DRIFT'
 AND effective_step_id=NEW.step_id AND next_ordinal=NEW.ordinal AND drift_receipt_hash=receipt.receipt_hash)
 THEN RAISE EXCEPTION 'replacement lacks no-invocation proof'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_action_attempt BEFORE INSERT OR UPDATE ON studio_guided_actions FOR EACH ROW EXECUTE FUNCTION studio_015_action_attempt_guard();
CREATE FUNCTION studio_015_obligation_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.attempt_ordinal<>OLD.attempt_ordinal THEN RAISE EXCEPTION 'obligation attempt immutable'; END IF;
 IF NEW.admission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=NEW.session_id
 AND a.admission_id=NEW.admission_id AND a.attempt_ordinal=NEW.attempt_ordinal)
 THEN RAISE EXCEPTION 'obligation/action attempt mismatch'; END IF;
 IF NEW.attempt_ordinal=1 AND NOT EXISTS(SELECT 1 FROM studio_guided_relearn_switches x
 JOIN studio_guided_no_invocation_receipts r ON r.session_id=x.session_id
 WHERE x.session_id=NEW.session_id AND x.reason='DRIFT' AND r.admission_id IS NOT NULL
 AND x.effective_step_id=NEW.proposal->'coordinate'->>'stepId' AND x.next_ordinal=(NEW.proposal->'coordinate'->>'ordinal')::integer)
 THEN RAISE EXCEPTION 'replacement obligation lacks drift proof'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_obligation_attempt BEFORE INSERT OR UPDATE ON studio_guided_obligation_admissions FOR EACH ROW EXECUTE FUNCTION studio_015_obligation_attempt_guard();
CREATE FUNCTION studio_015_prefix_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; m studio_guided_materializations; p studio_guided_relearn_plans;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'prefix request immutable'; END IF;
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
 IF OLD.status<>'ISSUED' OR NEW.status NOT IN ('WAIT','PREPARED','DRIFT')
 OR (to_jsonb(OLD)-'status') IS DISTINCT FROM (to_jsonb(NEW)-'status') THEN RAISE EXCEPTION 'prefix request settlement immutable'; END IF;
 RETURN NEW;
 END IF;
 SELECT * INTO STRICT p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 SELECT * INTO STRICT m FROM studio_guided_materializations WHERE session_id=NEW.session_id;
 IF NOT studio_015_prefix_pending(NEW.session_id) OR s.state<>'REPLAYING_PREFIX'
 OR NEW.status<>'ISSUED' OR NOT studio_015_current_version(NEW.session_id,NEW.document)
 OR NEW.document->>'sessionId' IS DISTINCT FROM NEW.session_id OR NEW.document->>'schemaVersion' IS DISTINCT FROM '3'
 OR NEW.document->'coordinate' IS DISTINCT FROM jsonb_build_object('stepId',NEW.step_id,'ordinal',NEW.ordinal)
 OR NEW.document->>'evidenceHash' IS DISTINCT FROM NEW.evidence_hash::text
 OR NEW.document->>'prefixProgramHash' IS DISTINCT FROM p.prefix_program_hash::text
 OR NEW.document->>'workerId' IS DISTINCT FROM m.worker_id OR NEW.document->>'ownerFence' IS DISTINCT FROM m.owner_fence::text
 OR NEW.document->>'contextId' IS DISTINCT FROM m.context_id
 OR NEW.document->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR NEW.document->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR NEW.document->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.prefix_program->'actions') a WHERE a->'coordinate'=NEW.document->'coordinate')
 OR (SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=NEW.session_id)>=LEAST(400,(s.document->'limits'->>'maxObservations')::integer)
 THEN RAISE EXCEPTION 'prefix request identity invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_prefix_request BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_prefix_requests FOR EACH ROW EXECUTE FUNCTION studio_015_prefix_request_guard();
CREATE FUNCTION studio_015_no_invocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; q studio_guided_prefix_requests; p studio_guided_relearn_plans; a studio_guided_actions; prep studio_guided_preparations;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT q FROM studio_guided_prefix_requests WHERE session_id=NEW.session_id AND request_digest=NEW.request_digest;
 SELECT * INTO STRICT p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 IF NOT studio_015_prefix_pending(NEW.session_id) OR s.state<>'REPLAYING_PREFIX' OR s.expires_at<=clock_timestamp()
 OR (s.document->'owner'->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
 OR NEW.document->>'workerId' IS DISTINCT FROM s.document->'owner'->>'workerId'
 OR NEW.document->>'ownerFence' IS DISTINCT FROM s.document->'owner'->>'fence'
 OR NEW.document-ARRAY['requestDigest','admissionId','preparationId','attemptOrdinal','operationHash','phase','nativeInvocationStarted','reason','receiptHash'] IS DISTINCT FROM q.document
 OR NEW.document->>'requestDigest' IS DISTINCT FROM NEW.request_digest::text
 OR NEW.document->>'admissionId' IS DISTINCT FROM NEW.admission_id
 OR NEW.document->>'preparationId' IS DISTINCT FROM NEW.preparation_id
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.prefix_program->'actions') op WHERE op->'coordinate'=NEW.document->'coordinate' AND op->>'operationHash'=NEW.document->>'operationHash')
 THEN RAISE EXCEPTION 'no-invocation receipt identity invalid'; END IF;
 IF NEW.admission_id IS NULL THEN
 IF q.status<>'ISSUED' OR EXISTS(SELECT 1 FROM studio_guided_actions WHERE session_id=NEW.session_id AND step_id=q.step_id AND ordinal=q.ordinal)
 THEN RAISE EXCEPTION 'pre-admission receipt has an action'; END IF;
 ELSE
 SELECT * INTO STRICT a FROM studio_guided_actions WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
 SELECT * INTO STRICT prep FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
 IF q.status<>'PREPARED' OR a.attempt_ordinal<>0 OR a.document->>'state'<>'DISPATCHING' OR a.document->>'dispatchCount'<>'1'
 OR a.document->>'preparationId' IS DISTINCT FROM NEW.preparation_id OR prep.admission_id IS DISTINCT FROM a.admission_id
 OR a.document->'coordinate' IS DISTINCT FROM NEW.document->'coordinate' OR a.document->>'operationHash' IS DISTINCT FROM NEW.document->>'operationHash'
 OR a.proposal->>'contextRevision' IS DISTINCT FROM NEW.document->>'contextRevision'
 OR a.proposal->>'authoredInputsHash' IS DISTINCT FROM NEW.document->>'authoredInputsHash'
 OR a.proposal->>'evidenceHash' IS DISTINCT FROM NEW.document->>'evidenceHash'
 OR prep.proof->>'contextId' IS DISTINCT FROM NEW.document->>'contextId'
 OR prep.owner_fence::text IS DISTINCT FROM NEW.document->>'ownerFence'
 THEN RAISE EXCEPTION 'admitted no-invocation proof mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_no_invocation BEFORE INSERT ON studio_guided_no_invocation_receipts FOR EACH ROW EXECUTE FUNCTION studio_015_no_invocation_guard();
CREATE FUNCTION studio_015_switch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; p studio_guided_relearn_plans; r studio_guided_no_invocation_receipts; op jsonb; ids jsonb; successful jsonb;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 IF (NEW.reason='EMPTY_PREFIX' AND (p.initial_step_index<>0 OR s.state<>'PREPARING'))
 OR (NEW.reason<>'EMPTY_PREFIX' AND (NOT studio_015_prefix_pending(NEW.session_id) OR s.state<>'REPLAYING_PREFIX'))
 OR NEW.effective_step_index>p.initial_step_index
 OR s.document->'sourceSteps'->NEW.effective_step_index->>'stepId' IS DISTINCT FROM NEW.effective_step_id
 THEN RAISE EXCEPTION 'learning switch identity invalid'; END IF;
 IF NEW.reason IN ('EMPTY_PREFIX','BOUNDARY') THEN
 IF NEW.effective_step_index<>p.initial_step_index OR NEW.effective_step_id<>p.initial_step_id THEN RAISE EXCEPTION 'boundary narrowed'; END IF;
 ELSE
 SELECT * INTO STRICT r FROM studio_guided_no_invocation_receipts WHERE session_id=NEW.session_id AND receipt_hash=NEW.drift_receipt_hash;
 IF NEW.effective_step_index>=p.initial_step_index OR r.document->'coordinate' IS DISTINCT FROM jsonb_build_object('stepId',NEW.effective_step_id,'ordinal',NEW.next_ordinal)
 THEN RAISE EXCEPTION 'drift switch coordinate invalid'; END IF;
 END IF;
 SELECT COALESCE(jsonb_agg(value->'stepId' ORDER BY n),'[]') INTO ids FROM jsonb_array_elements(s.document->'sourceSteps') WITH ORDINALITY z(value,n) WHERE n<=NEW.effective_step_index;
 successful:='[]';
 FOR op IN SELECT value FROM jsonb_array_elements(p.prefix_program->'actions') LOOP
 IF ids @> jsonb_build_array(op->'coordinate'->'stepId') OR (op->'coordinate'->>'stepId'=NEW.effective_step_id AND (op->'coordinate'->>'ordinal')::integer<NEW.next_ordinal) THEN
 IF NOT EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=NEW.session_id AND a.document->'coordinate'=op->'coordinate'
 AND a.attempt_ordinal=0 AND a.document->>'state'='SUCCEEDED' AND a.document->>'dispatchCount'='1'
 AND a.document->>'operationHash'=op->>'operationHash') THEN RAISE EXCEPTION 'prefix coordinate not completed'; END IF;
 successful:=successful||jsonb_build_array((SELECT admission_id FROM studio_guided_actions WHERE session_id=NEW.session_id AND document->'coordinate'=op->'coordinate' AND attempt_ordinal=0));
 END IF;
 END LOOP;
 IF NEW.completed_admissions IS DISTINCT FROM successful THEN RAISE EXCEPTION 'completed action lineage differs'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_switch BEFORE INSERT ON studio_guided_relearn_switches FOR EACH ROW EXECUTE FUNCTION studio_015_switch_guard();
CREATE FUNCTION studio_015_switch_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE x studio_guided_relearn_switches; s studio_guided_sessions; r studio_guided_no_invocation_receipts;
BEGIN
 SELECT * INTO STRICT x FROM studio_guided_relearn_switches WHERE session_id=NEW.session_id;
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id;
 IF s.state='REPLAYING_PREFIX' OR (SELECT continuation FROM studio_guided_translation_state WHERE session_id=NEW.session_id) IS DISTINCT FROM 'SOURCE_PLAN'
 THEN RAISE EXCEPTION 'learning switch must leave prefix atomically'; END IF;
 IF x.reason='DRIFT' THEN
 SELECT * INTO STRICT r FROM studio_guided_no_invocation_receipts WHERE session_id=x.session_id;
 IF r.admission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.admission_id=r.admission_id
 AND a.document->>'state'='FAILED' AND a.document->>'dispatchCount'='1' AND a.document->>'outcomeCode'='TARGET_CHANGED')
 THEN RAISE EXCEPTION 'spent no-invocation attempt not settled'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_switch_commit AFTER INSERT ON studio_guided_relearn_switches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_switch_commit();
CREATE FUNCTION studio_015_receipt_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio_guided_relearn_switches x WHERE x.session_id=NEW.session_id AND x.reason='DRIFT' AND x.drift_receipt_hash=NEW.receipt_hash)
 THEN RAISE EXCEPTION 'drift receipt requires atomic switch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_receipt_commit AFTER INSERT ON studio_guided_no_invocation_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_receipt_commit();

-- One narrow initial suffix acceptance; later replans retain their existing monotonic rules.
CREATE TABLE studio_guided_suffix_acceptances (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_relearn_plans(session_id),
 plan_revision bigint NOT NULL, previous_plan_revision bigint NOT NULL CHECK(previous_plan_revision>=0 AND plan_revision=previous_plan_revision+1),
 retained_admissions jsonb NOT NULL CHECK(jsonb_typeof(retained_admissions)='array' AND jsonb_array_length(retained_admissions)<=200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(session_id,plan_revision) REFERENCES studio_guided_translation_plans(session_id,plan_revision)
);
CREATE FUNCTION studio_015_suffix_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p studio_guided_relearn_plans; x studio_guided_relearn_switches; plan jsonb; retained jsonb; assoc record; old_meaning jsonb;
BEGIN
 PERFORM 1 FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 SELECT * INTO x FROM studio_guided_relearn_switches WHERE session_id=NEW.session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'suffix plan before prefix switch'; END IF;
 retained:=COALESCE(x.completed_admissions,'[]');
 IF NEW.retained_admissions IS DISTINCT FROM retained THEN RAISE EXCEPTION 'suffix retained list differs'; END IF;
 SELECT t.plan INTO STRICT plan FROM studio_guided_translation_plans t WHERE t.session_id=NEW.session_id AND t.plan_revision=NEW.plan_revision;
 FOR assoc IN SELECT o.* FROM studio_guided_obligation_admissions o WHERE o.session_id=NEW.session_id AND retained @> jsonb_build_array(o.admission_id) LOOP
 SELECT a INTO STRICT old_meaning FROM studio_guided_translation_plans t,
 LATERAL jsonb_array_elements(t.plan->'obligations') a
 WHERE t.session_id=NEW.session_id AND t.plan_revision=assoc.plan_revision AND a->>'obligationId'=assoc.obligation_id;
 IF NOT(plan->'obligations' @> jsonb_build_array(old_meaning)) THEN RAISE EXCEPTION 'suffix plan changed executed meaning'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_suffix_acceptance BEFORE INSERT ON studio_guided_suffix_acceptances FOR EACH ROW EXECUTE FUNCTION studio_015_suffix_guard();

CREATE FUNCTION studio_015_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.document->'baseRevisionId' IS DISTINCT FROM NEW.document->'baseRevisionId'
 OR OLD.document->'firstLearnStepId' IS DISTINCT FROM NEW.document->'firstLearnStepId'
 THEN RAISE EXCEPTION 'initial incremental identity is immutable'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) OR OLD.state='REPLAYING_PREFIX' OR NEW.state='REPLAYING_PREFIX' THEN
 IF NEW.document->'counters'->'modelProposals' IS DISTINCT FROM OLD.document->'counters'->'modelProposals'
 OR NEW.document->'counters'->'modelInputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelInputTokens'
 OR NEW.document->'counters'->'modelOutputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelOutputTokens'
 THEN RAISE EXCEPTION 'model counters frozen during prefix'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) AND OLD.state='REPLAYING_PREFIX' AND NEW.state NOT IN ('REPLAYING_PREFIX','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
 THEN RAISE EXCEPTION 'prefix callback cannot escape mode'; END IF;
 END IF;
 IF NEW.state='REPLAYING_PREFIX' AND NOT studio_015_prefix_pending(NEW.session_id)
 THEN RAISE EXCEPTION 'prefix state without pending program'; END IF;
 IF NEW.state='REPLAYING_PREFIX' AND EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=NEW.session_id AND status IN ('RESERVED','CALLING'))
 THEN RAISE EXCEPTION 'prefix state with model attempt'; END IF;
 IF studio_015_delivery_pending(NEW.session_id) AND (
 NEW.document->'counters'->'modelProposals' IS DISTINCT FROM OLD.document->'counters'->'modelProposals'
 OR NEW.document->'counters'->'modelInputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelInputTokens'
 OR NEW.document->'counters'->'modelOutputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelOutputTokens')
 THEN RAISE EXCEPTION 'model counters frozen until context ACK'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_session_guard BEFORE UPDATE ON studio_guided_sessions FOR EACH ROW EXECUTE FUNCTION studio_015_session_guard();
CREATE FUNCTION studio_015_model_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF studio_015_prefix_pending(NEW.session_id) OR studio_015_delivery_pending(NEW.session_id) OR (SELECT state FROM studio_guided_sessions WHERE session_id=NEW.session_id)='REPLAYING_PREFIX'
 THEN RAISE EXCEPTION 'model reservation refused during replay or context delivery'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_model_guard BEFORE INSERT ON studio_guided_model_attempts FOR EACH ROW EXECUTE FUNCTION studio_015_model_guard();
CREATE FUNCTION studio_015_continuation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF NEW.continuation='REPLAYING_PREFIX' AND NOT studio_015_prefix_pending(NEW.session_id)
 THEN RAISE EXCEPTION 'prefix continuation cannot reenter'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) AND NEW.continuation<>'REPLAYING_PREFIX'
 AND NOT(NEW.continuation='STOPPED' AND s.state IN ('FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED'))
 THEN RAISE EXCEPTION 'prefix continuation requires atomic switch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_continuation BEFORE UPDATE ON studio_guided_translation_state FOR EACH ROW EXECUTE FUNCTION studio_015_continuation_guard();
CREATE FUNCTION studio_015_relearn_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.initial_step_index>0 AND (SELECT continuation FROM studio_guided_translation_state WHERE session_id=NEW.session_id) IS DISTINCT FROM 'REPLAYING_PREFIX'
 THEN RAISE EXCEPTION 'incremental start must persist replay continuation'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_relearn_commit AFTER INSERT ON studio_guided_relearn_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_relearn_commit();

CREATE FUNCTION studio_015_historical_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio_guided_materialization_versions v WHERE v.session_id=NEW.session_id
 AND v.context_revision=(NEW.proof->>'contextRevision')::integer AND v.context_id=NEW.context_id
 AND v.owner_fence=NEW.owner_fence AND v.authored_inputs_hash=NEW.proof->>'authoredInputsHash')
 THEN RAISE EXCEPTION 'publication preparation historical version missing'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_015_publication_preparation_version BEFORE INSERT ON studio_guided_publication_preparations FOR EACH ROW EXECUTE FUNCTION studio_015_historical_preparation_guard();

CREATE FUNCTION studio_015_declarations(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; prior text:=NULL; name text;
BEGIN
 IF NOT studio_publication_closed(d,ARRAY['variables','secrets','authoringIdentityVersion','authoredDeclarations'],1048576)
 OR d->'authoringIdentityVersion' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(d->'variables') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'secrets') IS DISTINCT FROM 'array'
 OR jsonb_typeof(d->'authoredDeclarations') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'authoredDeclarations')>500
 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'authoredDeclarations') LOOP
 name:=item->>'referenceId';
 IF name IS NULL OR length(name) NOT BETWEEN 1 AND 256 OR (prior IS NOT NULL AND prior COLLATE "C">=name COLLATE "C") THEN RETURN false; END IF;
 IF item->>'kind'='plain' THEN
 IF NOT studio_publication_closed(item,ARRAY['referenceId','kind','valueHash'],2048) OR (item->>'valueHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE THEN RETURN false; END IF;
 ELSIF item->>'kind'='secretRef' THEN
 IF NOT studio_publication_closed(item,ARRAY['referenceId','kind','secretId'],2048) OR (item->>'secretId' ~ '^[A-Za-z0-9_.-]{1,64}$') IS NOT TRUE OR item->>'secretId' IN ('.','..') THEN RETURN false; END IF;
 ELSE RETURN false;
 END IF;
 prior:=name;
 END LOOP;
 RETURN true;
END $$;
-- Immutable result projection survives V19 pruning without retaining more progress keys.
CREATE FUNCTION studio_015_relearned_from(id text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN x.reason='DRIFT' THEN jsonb_build_object('stepId',x.effective_step_id,'driftSwitchStepId',x.effective_step_id)
 ELSE jsonb_build_object('stepId',p.initial_step_id) END
 FROM studio_guided_relearn_plans p JOIN studio_guided_relearn_switches x USING(session_id) WHERE p.session_id=id
$$;
CREATE FUNCTION studio_015_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p studio_guided_relearn_plans; x studio_guided_relearn_switches; s studio_guided_sessions; prefix_count integer:=0;
 expected jsonb:='{}'; step jsonb; n integer:=0; incremental jsonb; receipt jsonb;
BEGIN
 IF NEW.step_snapshot_hashes IS NULL OR NEW.step_reuse_provenance IS NULL OR NOT studio_015_declarations(NEW."references")
 THEN RAISE EXCEPTION 'new revision requires complete immutable input and snapshot metadata'; END IF;
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.guided_session_id;
 SELECT * INTO p FROM studio_guided_relearn_plans WHERE session_id=NEW.guided_session_id;
 IF FOUND THEN
 SELECT * INTO x FROM studio_guided_relearn_switches WHERE session_id=NEW.guided_session_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'publication before prefix switch'; END IF;
 prefix_count:=COALESCE(x.completed_prefix_count,0);
 FOR step IN SELECT value FROM jsonb_array_elements(s.document->'sourceSteps') LOOP
 EXIT WHEN n>=prefix_count;
 expected:=expected||jsonb_build_object(step->>'stepId',jsonb_build_object('revisionId',p.base_revision_id,'stepId',step->>'stepId')); n:=n+1;
 END LOOP;
 incremental:=jsonb_build_object('baseRevisionId',p.base_revision_id,'initialFirstLearnStepId',p.initial_step_id,
 'effectiveFirstLearnStepId',COALESCE(x.effective_step_id,p.initial_step_id),'retainedPrefixAdmissionIds',COALESCE(x.completed_admissions,'[]'),
 'driftReceiptHash',x.drift_receipt_hash);
 IF NEW.artifact->'learnedPlan'->'incremental' IS DISTINCT FROM incremental THEN RAISE EXCEPTION 'learned incremental proof differs'; END IF;
 ELSE
 IF COALESCE(NEW.artifact->'learnedPlan'->'incremental','null')<>'null'::jsonb THEN RAISE EXCEPTION 'ordinary revision has incremental proof'; END IF;
 END IF;
 IF NEW.step_reuse_provenance IS DISTINCT FROM expected THEN RAISE EXCEPTION 'reuse must equal actual immediate-base prefix'; END IF;
 IF EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=NEW.guided_session_id
 AND a.document->>'state'<>'SUCCEEDED' AND NOT EXISTS(SELECT 1 FROM studio_guided_no_invocation_receipts r
 WHERE r.session_id=a.session_id AND r.admission_id=a.admission_id AND a.document->>'state'='FAILED' AND a.document->>'dispatchCount'='1'))
 THEN RAISE EXCEPTION 'publication omitted unproven failed attempt'; END IF;
 IF (SELECT count(DISTINCT a->>'admissionId') FROM jsonb_array_elements(NEW.artifact->'learnedPlan'->'actions') a)<>jsonb_array_length(NEW.artifact->'learnedPlan'->'actions')
 OR (SELECT count(DISTINCT a->'coordinate') FROM jsonb_array_elements(NEW.artifact->'learnedPlan'->'actions') a)<>jsonb_array_length(NEW.artifact->'learnedPlan'->'actions') THEN RAISE EXCEPTION 'duplicate effective action'; END IF;
 IF (SELECT count(*) FROM studio_guided_actions WHERE session_id=NEW.guided_session_id AND document->>'state'='SUCCEEDED')
 <> jsonb_array_length(NEW.artifact->'learnedPlan'->'actions') THEN RAISE EXCEPTION 'effective action set incomplete'; END IF;
 FOR step IN SELECT value FROM jsonb_array_elements(NEW.artifact->'learnedPlan'->'actions') LOOP
 IF NOT EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=NEW.guided_session_id
 AND a.admission_id=step->>'admissionId' AND a.document->>'state'='SUCCEEDED' AND a.document->>'dispatchCount'='1'
 AND a.document->'coordinate'=step->'coordinate' AND a.document->>'operationHash'=step->>'operationHash')
 THEN RAISE EXCEPTION 'effective action does not match ledger'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_revision_guard AFTER INSERT ON ui_test_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_revision_guard();
CREATE FUNCTION studio_015_publication_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected jsonb;
BEGIN
 expected:=studio_015_relearned_from(NEW.session_id);
 IF NOT (NEW.document->'publicReceipt' ? 'relearnedFrom')
 OR NEW.document->'publicReceipt'->'relearnedFrom' IS DISTINCT FROM COALESCE(expected,'null'::jsonb)
 THEN RAISE EXCEPTION 'publication relearned boundary differs'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_publication_result AFTER INSERT ON studio_guided_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_publication_result_guard();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['studio_guided_relearn_plans','studio_guided_relearn_switches','studio_guided_no_invocation_receipts',
 'studio_guided_materialization_versions','studio_guided_materialization_inputs','studio_guided_suffix_acceptances'] LOOP
 EXECUTE format('CREATE TRIGGER tr_015_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION studio_015_immutable()',t);
 EXECUTE format('CREATE TRIGGER tr_015_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION studio_015_immutable()',t);
 END LOOP;
END $$;
-- V19 retained-progress keys, prune algorithm, and V20 recording remain exactly unchanged.
-- All new durable boundary/receipt history is safe IDs/hashes/codes. Raw input entries remain F01 residual.

-- V17: only historical materialization join changes; terminal no-decision guard stays.
CREATE OR REPLACE FUNCTION studio_secret_guided_input_reference(session_key text,scope_key text,admission_key text)
 RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN count(*)=1 THEN min(input->'provenance'->>'referenceId') ELSE NULL END
 FROM studio_guided_actions a JOIN studio_guided_materialization_snapshots material ON material.session_id=a.session_id
  AND material.context_revision=(a.proposal->>'contextRevision')::integer
  AND material.authored_inputs_hash=a.proposal->>'authoredInputsHash'
 JOIN studio_guided_source_manifests source ON source.session_id=a.session_id,
 LATERAL jsonb_array_elements(material.authored_inputs->'inputs') input
 WHERE a.session_id=session_key AND a.admission_id=admission_key AND material.scope_hash=scope_key
  AND source.scope_hash=scope_key AND source.manifest_hash=studio_publication_hash(source.manifest)
  AND material.owner_fence=(a.document->>'ownerFence')::integer
  AND a.proposal->'operation'->>'kind'='fill' AND a.proposal->'operation'->'value'->>'kind'='secretRef'
  AND input->>'inputId'=a.proposal->'operation'->'value'->>'sourceInputId'
  AND input->>'kind'='secretRef' AND input->>'sourceStepId'=a.step_id
  AND input->>'intendedSlot'='fill.value' AND NOT(input ? 'value')
  AND input->'provenance'->>'referenceKind'='configuration'
  AND input->'provenance'->>'kind'='secretRef' AND input->'provenance'->>'intendedSlot'='fill.value'
  AND input->'provenance'->>'stepId'=a.step_id
  AND input->'provenance'->>'referenceName'=input->>'secretId'
  AND input->'provenance'->>'configurationRevision'=material.configuration_revision
  AND studio_secret_guided_exact_reference(session_key,scope_key,a.step_id,input->>'secretId',input->'provenance'->>'referenceId')
$$;

-- V17: only historical materialization join changes; terminal no-decision guard stays.
CREATE OR REPLACE FUNCTION studio_secret_guided_consumed(session_key text,scope_key text,admission_key text,
 step_key text,ordinal_key integer,secret_key text,attempt_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_actions a
  JOIN studio_guided_materialization_snapshots m ON m.session_id=a.session_id
   AND m.context_revision=(a.proposal->>'contextRevision')::integer
   AND m.authored_inputs_hash=a.proposal->>'authoredInputsHash',
  LATERAL jsonb_array_elements(m.authored_inputs->'inputs') input
  WHERE a.session_id=session_key AND a.admission_id=admission_key
   AND a.step_id=step_key AND a.ordinal=ordinal_key
   AND (a.document->>'dispatchCount')::integer=1
   AND a.document->>'state' IN ('DISPATCHING','UNKNOWN_OUTCOME','FAILED','SUCCEEDED','REVOKED')
   AND attempt_key=session_key||':'||(a.document->>'ownerFence')
   AND m.scope_hash=scope_key AND m.owner_fence=(a.document->>'ownerFence')::integer
   AND a.proposal->'operation'->>'kind'='fill'
   AND a.proposal->'operation'->'value'->>'kind'='secretRef'
   AND input->>'inputId'=a.proposal->'operation'->'value'->>'sourceInputId'
   AND input->>'kind'='secretRef' AND input->>'secretId'=secret_key AND NOT(input ? 'value')
   AND input->>'sourceStepId'=step_key AND input->>'intendedSlot'='fill.value'
   AND studio_secret_guided_input_reference(session_key,scope_key,admission_key) IS NOT NULL)
$$;

-- Allow only the separately checked relearnedFrom addition to nested publicReceipt.
CREATE OR REPLACE FUNCTION studio_publication_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a studio_guided_publication_attempts; r ui_test_revisions; b studio_guided_publication_bases;
BEGIN
 SELECT * INTO STRICT a FROM studio_guided_publication_attempts WHERE session_id=NEW.session_id AND attempt_id=NEW.attempt_id;
 SELECT * INTO STRICT r FROM ui_test_revisions WHERE id=NEW.revision_id;
 SELECT * INTO STRICT b FROM studio_guided_publication_bases WHERE session_id=NEW.session_id;
 IF (studio_publication_strings(NEW.document,ARRAY['snapshotHash','basisHash','learnedPlanHash','artifactHash','referencePolicyHash','operationEquivalenceHash','admissionProvenanceHash','publicationEvidenceHash','revisionDigest','profileHash'],'^[a-f0-9]{64}$') AND studio_publication_strings(NEW.document,ARRAY['originalPrincipalId','finalizeKey','finalizeDigest','publishedAt'])
 AND studio_publication_closed((NEW.document->'publicReceipt')-'relearnedFrom',ARRAY['schemaVersion','sessionId','revisionId','revisionDigest','learnedPlanHash','artifactHash','publicationEvidenceHash','publishedAt','learnedFromThisRun','replayVerified'],32768)
 AND NEW.document->'publicReceipt'->'schemaVersion'='3'::jsonb AND NEW.document->'publicReceipt'->'learnedFromThisRun'='true'::jsonb AND NEW.document->'publicReceipt'->'replayVerified'='false'::jsonb
 AND NEW.document->'publicReceipt'->'sessionId'=NEW.document->'sessionId' AND NEW.document->'publicReceipt'->'revisionId'=NEW.document->'revisionId'
 AND NEW.document->'publicReceipt'->'revisionDigest'=NEW.document->'revisionDigest' AND NEW.document->'publicReceipt'->'learnedPlanHash'=NEW.document->'learnedPlanHash'
 AND NEW.document->'publicReceipt'->'artifactHash'=NEW.document->'artifactHash' AND NEW.document->'publicReceipt'->'publicationEvidenceHash'=NEW.document->'publicationEvidenceHash'
 AND NEW.document->'publicReceipt'->'publishedAt'=NEW.document->'publishedAt' AND (NEW.document->>'publishedAt')::timestamptz=NEW.published_at) IS NOT TRUE THEN RAISE EXCEPTION 'publication receipt shape invalid'; END IF;
 IF NEW.document->>'finalizeDigest' IS DISTINCT FROM a.finalize_digest OR NEW.document->>'finalizeKey' IS DISTINCT FROM a.finalize_key OR NEW.document->>'profileHash' IS DISTINCT FROM a.identity->>'profileHash' OR NEW.document->>'admissionProvenanceHash' IS DISTINCT FROM a.validator_receipt->>'admissionProvenanceHash' OR NEW.document->>'operationEquivalenceHash' IS DISTINCT FROM a.validator_receipt->>'operationEquivalenceHash' OR NEW.document->>'learnedPlanHash' IS DISTINCT FROM studio_publication_hash(NEW.learned_plan) OR r.artifact_hash IS DISTINCT FROM studio_publication_hash(r.artifact) OR NEW.document->>'referencePolicyHash' IS DISTINCT FROM studio_publication_hash(r.reference_policy) OR a.status<>'VALIDATED' OR r.publication_kind<>'GUIDED_RUN' OR r.confirmation_source<>'GUIDED_RUN'
 OR r.confirmed_by<>b.document->>'originalPrincipalId' OR NEW.document->>'originalPrincipalId' IS DISTINCT FROM r.confirmed_by
 OR r.learned_plan_hash IS DISTINCT FROM NEW.document->>'learnedPlanHash' OR r.artifact_hash IS DISTINCT FROM NEW.document->>'artifactHash'
 OR r.revision_digest IS DISTINCT FROM NEW.document->>'revisionDigest'
 OR r.source_revision::text<>b.document->>'sourceRevision' OR r.configuration_revision::text<>b.document->>'configurationRevision'
 OR a.identity->>'artifactHash' IS DISTINCT FROM NEW.document->>'artifactHash'
 OR a.identity->>'learnedPlanHash' IS DISTINCT FROM NEW.document->>'learnedPlanHash'
 OR a.identity->>'referencePolicyHash' IS DISTINCT FROM NEW.document->>'referencePolicyHash'
 OR a.identity->>'publicationEvidenceHash' IS DISTINCT FROM NEW.document->>'publicationEvidenceHash'
 THEN RAISE EXCEPTION 'publication receipt proof mismatch'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION studio_015_session_mode_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id;
 IF s.state='REPLAYING_PREFIX' AND (NOT studio_015_prefix_pending(s.session_id)
 OR (SELECT continuation FROM studio_guided_translation_state WHERE session_id=s.session_id) IS DISTINCT FROM 'REPLAYING_PREFIX')
 THEN RAISE EXCEPTION 'prefix mode missing durable program or continuation'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tr_015_session_mode_commit AFTER INSERT OR UPDATE ON studio_guided_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_015_session_mode_commit();

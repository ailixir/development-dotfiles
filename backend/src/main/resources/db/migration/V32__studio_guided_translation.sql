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

-- OBS-007 / ADR-SC-005: current-baseline migration, re-homed by OBS-012A.
-- Secret values are never persisted. Account-free v3 predicates are active;
-- immutable historical v2 evidence is retained, never accepted as a new operation.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM studio_guided_sessions WHERE state='AWAITING_AUTH') THEN
  RAISE EXCEPTION 'V34 refuses existing AWAITING_AUTH sessions';
 END IF;
 IF EXISTS(SELECT 1 FROM ui_test_executions WHERE observed_revision_binding IS NOT NULL) THEN
  RAISE EXCEPTION 'V34 refuses existing observed execution bindings';
 END IF;
END $$;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='studio_guided_sessions'::regclass
  AND contype='c' AND pg_get_constraintdef(oid) LIKE '%AWAITING_AUTH%' LOOP
  EXECUTE format('ALTER TABLE studio_guided_sessions DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE studio_guided_sessions ADD CONSTRAINT ck_guided_session_state_v3 CHECK (
 state IN ('PREPARING','OBSERVING','PROPOSING','ACTING','AWAITING_CLARIFICATION',
 'FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED'));
ALTER TABLE studio_guided_sessions ADD COLUMN revoked_at timestamptz;
ALTER TABLE studio_dispatch_ledger ADD COLUMN revoked_at timestamptz;
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

-- NOT VALID preserves closed, immutable v2 provenance already stored in a dev DB.
-- PostgreSQL still enforces these replacement checks on every new INSERT/UPDATE.
ALTER TABLE ui_test_revisions DROP CONSTRAINT ck_observed_revision_origin;
ALTER TABLE ui_test_revisions ADD CONSTRAINT ck_observed_revision_origin CHECK ((
 (publication_kind IS NULL AND guided_session_id IS NULL AND learned_plan_hash IS NULL
  AND revision_digest IS NULL AND confirmation_source IS DISTINCT FROM 'GUIDED_RUN')
 OR (publication_kind='GUIDED_RUN' AND guided_session_id IS NOT NULL AND compile_request_id IS NULL
  AND learned_plan_hash ~ '^[a-f0-9]{64}$' AND revision_digest ~ '^[a-f0-9]{64}$'
  AND artifact_schema_version=3 AND studio_publication_profile(artifact->'profile')
  AND confirmation_source='GUIDED_RUN'
  AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)) IS TRUE) NOT VALID;

-- RELEASE is a release-authorization decision, including zero-send refusals.
-- LIVE_RECHECK is an explicit no-send revocation decision about an earlier release.
-- USAGE stores the terminal safe usage/ledger code, never a value or diagnostic.
CREATE TABLE studio_secret_use_audit (
 id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(occurred_at)),
 release_occurred_at timestamptz NOT NULL CHECK(isfinite(release_occurred_at)),
 path varchar(20) NOT NULL CHECK(path IN ('GUIDED','OBSERVED_REPLAY')),
 row_kind varchar(8) NOT NULL CHECK(row_kind IN ('RELEASE','USAGE')),
 release_id uuid,
 affected_release_id uuid,
 decision_stage varchar(16) CHECK(decision_stage IN ('DISPATCH','LIVE_RECHECK')),
 attempt_id varchar(256) NOT NULL CHECK(length(attempt_id)>0),
 release_seq bigint NOT NULL CHECK(release_seq>0),
 execution_id uuid REFERENCES studio_dispatch_ledger(execution_id),
 session_id varchar(256) REFERENCES studio_guided_sessions(session_id),
 admission_id varchar(256),
 principal_id varchar(256) NOT NULL CHECK(length(principal_id)>0),
 csi_id varchar(20) NOT NULL CHECK(length(csi_id)>0),
 environment varchar(256) NOT NULL CHECK(length(environment)>0),
 test_id uuid NOT NULL,
 secret_id varchar(64) NOT NULL CHECK(secret_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
 vault_version varchar(256) CHECK(length(vault_version)>0),
 coordinate_step_id varchar(256) CHECK(length(coordinate_step_id)>0),
 coordinate_ordinal integer CHECK(coordinate_ordinal>=0),
 outcome varchar(24) CHECK(outcome IN ('RESOLVED','NOT_AUTHORIZED','REVOKED',
  'UNAVAILABLE','VAULT_UNAVAILABLE','REVOKED_MID_RUN')),
 usage_outcome varchar(32),
 PRIMARY KEY(id,release_occurred_at),
 FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 CHECK((path='GUIDED' AND session_id IS NOT NULL AND execution_id IS NULL)
  OR (path='OBSERVED_REPLAY' AND execution_id IS NOT NULL AND session_id IS NULL)),
 CHECK((coordinate_step_id IS NULL)=(coordinate_ordinal IS NULL)),
 CHECK(path<>'GUIDED' OR coordinate_step_id IS NOT NULL),
 CHECK(occurred_at>=release_occurred_at),
 CONSTRAINT ck_secret_audit_row_shape CHECK((
  (row_kind='RELEASE' AND release_id=id AND outcome IS NOT NULL AND usage_outcome IS NULL
   AND ((decision_stage='DISPATCH' AND affected_release_id IS NULL
     AND outcome<>'REVOKED_MID_RUN' AND release_occurred_at=occurred_at)
    OR (decision_stage='LIVE_RECHECK' AND affected_release_id IS NOT NULL
     AND affected_release_id<>id AND outcome='REVOKED_MID_RUN')))
  OR (row_kind='USAGE' AND decision_stage IS NULL AND affected_release_id IS NULL
   AND usage_outcome IS NOT NULL
   AND ((release_id IS NOT NULL AND outcome IS NOT NULL)
    OR (path='GUIDED' AND release_id IS NULL AND outcome IS NULL AND vault_version IS NULL
     AND release_occurred_at=occurred_at
     AND ((usage_outcome='NOT_USED' AND admission_id IS NULL)
      OR (usage_outcome IN ('UNKNOWN_OUTCOME','ACK_LOST') AND admission_id IS NOT NULL)))))
 ) IS TRUE),
 CHECK(row_kind<>'USAGE' OR
  (path='OBSERVED_REPLAY' AND usage_outcome IN ('USED','NOT_USED','REFUSED','UNKNOWN_OUTCOME')) OR
  (path='GUIDED' AND usage_outcome IN ('USED','NOT_USED','REFUSED','OK','ASSERTION_FAILED',
   'TARGET_CHANGED','POLICY_DENIED','TIMEOUT','ACK_LOST','UNKNOWN_OUTCOME','CANCELLED'))),
 CHECK(row_kind<>'RELEASE' OR outcome<>'RESOLVED' OR vault_version IS NOT NULL)
) PARTITION BY RANGE(release_occurred_at);
CREATE UNIQUE INDEX uq_secret_usage_release ON studio_secret_use_audit(release_id,release_occurred_at)
 WHERE row_kind='USAGE' AND release_id IS NOT NULL;
CREATE UNIQUE INDEX uq_secret_live_recheck ON studio_secret_use_audit(affected_release_id,release_occurred_at)
 WHERE decision_stage='LIVE_RECHECK';
CREATE INDEX ix_secret_audit_session ON studio_secret_use_audit(session_id,secret_id,release_occurred_at);
CREATE INDEX ix_secret_audit_execution ON studio_secret_use_audit(execution_id,secret_id,release_occurred_at);
CREATE INDEX ix_secret_audit_scope ON studio_secret_use_audit(csi_id,test_id,occurred_at);

CREATE FUNCTION studio_secret_guided_declaration(session_key text,scope_key text,step_key text,secret_key text)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'configurationReferences') reference
  WHERE m.session_id=session_key AND m.scope_hash=scope_key
   AND m.manifest_hash=studio_publication_hash(m.manifest)
   AND reference->>'kind'='secretRef' AND reference->>'referenceName'=secret_key
   AND reference->>'stepId'=step_key AND reference->>'intendedSlot'='fill.value'
   AND NOT (reference ? 'value'))
$$;

CREATE FUNCTION studio_secret_guided_consumed(session_key text,scope_key text,admission_key text,
 step_key text,ordinal_key integer,secret_key text,attempt_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_actions a
  JOIN studio_guided_materializations m ON m.session_id=a.session_id,
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
   AND input->>'sourceStepId'=step_key AND input->>'intendedSlot'='fill.value')
$$;

CREATE FUNCTION studio_secret_audit_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original studio_secret_use_audit; s studio_guided_sessions; l studio_dispatch_ledger;
 action studio_guided_actions; execution ui_test_executions;
BEGIN
 -- Global order: caller owner row, lifecycle owner advisory, event advisory.
 IF NEW.path='GUIDED' THEN
  SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 ELSE
  SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id FOR UPDATE;
 END IF;
 -- Serialize the lifecycle across partitions, including duplicate unlinked summaries.
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-audit-owner:'||NEW.path||':'||
  COALESCE(NEW.session_id,NEW.execution_id::text),0));
 -- Caller session/ledger row lock precedes owner, then event; Java uses the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-audit-id:'||NEW.id::text,0));
 IF EXISTS(SELECT 1 FROM studio_secret_use_audit WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'secret audit identity already exists';
 END IF;
 IF NEW.path='GUIDED' THEN
  SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id;
  IF ROW(s.test_id,s.principal_id,s.document->'scope'->>'csiId',s.document->'scope'->>'environmentId')
   IS DISTINCT FROM ROW(NEW.test_id::text,NEW.principal_id,NEW.csi_id,NEW.environment) THEN
   RAISE EXCEPTION 'secret audit session scope mismatch';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.document->'sourceSteps') step
   WHERE step->>'stepId'=NEW.coordinate_step_id) THEN
   RAISE EXCEPTION 'secret audit source coordinate mismatch';
  END IF;
  IF NEW.admission_id IS NOT NULL THEN
   SELECT * INTO STRICT action FROM studio_guided_actions
    WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
   IF ROW(action.step_id,action.ordinal) IS DISTINCT FROM ROW(NEW.coordinate_step_id,NEW.coordinate_ordinal)
    THEN RAISE EXCEPTION 'secret audit admission coordinate mismatch'; END IF;
  END IF;
  IF NEW.decision_stage='DISPATCH' THEN
   IF NEW.attempt_id IS DISTINCT FROM NEW.session_id||':'||(s.document->'owner'->>'fence')
    OR NOT studio_secret_guided_declaration(NEW.session_id,s.scope_hash,NEW.coordinate_step_id,NEW.secret_id)
    OR NOT studio_secret_guided_consumed(NEW.session_id,s.scope_hash,NEW.admission_id,
     NEW.coordinate_step_id,NEW.coordinate_ordinal,NEW.secret_id,NEW.attempt_id)
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit u WHERE u.session_id=NEW.session_id
     AND u.secret_id=NEW.secret_id AND u.coordinate_step_id=NEW.coordinate_step_id
     AND u.attempt_id=NEW.attempt_id AND u.row_kind='USAGE' AND u.release_id IS NULL) THEN
    RAISE EXCEPTION 'secret audit guided release lineage invalid';
   END IF;
  END IF;
  IF NEW.row_kind='USAGE' AND NEW.release_id IS NULL THEN
   IF s.state NOT IN ('FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
    OR NOT studio_secret_guided_declaration(NEW.session_id,s.scope_hash,NEW.coordinate_step_id,NEW.secret_id)
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit decision
     WHERE decision.session_id=NEW.session_id AND decision.secret_id=NEW.secret_id
      AND decision.coordinate_step_id=NEW.coordinate_step_id AND decision.decision_stage='DISPATCH') THEN
    RAISE EXCEPTION 'secret audit no-decision scope or declaration invalid';
   END IF;
   IF NEW.usage_outcome='NOT_USED' THEN
    IF NEW.attempt_id IS DISTINCT FROM NEW.session_id||':'||(s.document->'owner'->>'fence')
     OR EXISTS(SELECT 1 FROM studio_guided_actions consumed
      WHERE consumed.session_id=NEW.session_id AND consumed.step_id=NEW.coordinate_step_id
       AND (consumed.document->>'dispatchCount')::integer=1
       AND consumed.proposal->'operation'->>'kind'='fill'
       AND consumed.proposal->'operation'->'value'->>'kind'='secretRef') THEN
     RAISE EXCEPTION 'secret audit unreached cannot conceal consumed admission';
    END IF;
   ELSE
    IF (NEW.admission_id IS NOT NULL AND (action.document->>'dispatchCount')::integer=1
     AND action.document->>'state' IN ('DISPATCHING','UNKNOWN_OUTCOME','FAILED')
     AND NEW.attempt_id=NEW.session_id||':'||(action.document->>'ownerFence')
     AND action.proposal->'operation'->>'kind'='fill'
     AND action.proposal->'operation'->'value'->>'kind'='secretRef'
     AND EXISTS(SELECT 1 FROM studio_guided_materializations material,
      LATERAL jsonb_array_elements(material.authored_inputs->'inputs') input
      WHERE material.session_id=NEW.session_id AND material.scope_hash=s.scope_hash
       AND material.owner_fence=(action.document->>'ownerFence')::integer
       AND input->>'inputId'=action.proposal->'operation'->'value'->>'sourceInputId'
       AND input->>'kind'='secretRef' AND input->>'secretId'=NEW.secret_id AND NOT (input ? 'value')
       AND input->>'sourceStepId'=NEW.coordinate_step_id AND input->>'intendedSlot'='fill.value')
     AND (NEW.usage_outcome<>'ACK_LOST' OR action.document->>'outcomeCode'='ACK_LOST')) IS NOT TRUE THEN
     RAISE EXCEPTION 'secret audit consumed no-decision evidence invalid';
    END IF;
   END IF;
  END IF;
  IF NEW.row_kind='USAGE' AND NEW.usage_outcome='ACK_LOST'
   AND (NEW.admission_id IS NULL OR (action.document->>'dispatchCount')::integer IS DISTINCT FROM 1
    OR action.document->>'outcomeCode' IS DISTINCT FROM 'ACK_LOST') THEN
   RAISE EXCEPTION 'secret audit acknowledgement loss evidence missing';
  END IF;
 ELSE
  SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id;
  SELECT * INTO STRICT execution FROM ui_test_executions
   WHERE id=l.execution_id AND started_at=l.execution_accepted_at;
  IF ROW(l.test_id,l.csi_id,l.principal,execution.environment)
   IS DISTINCT FROM ROW(NEW.test_id,NEW.csi_id,NEW.principal_id,NEW.environment) THEN
   RAISE EXCEPTION 'secret audit execution scope mismatch';
  END IF;
  IF NEW.decision_stage='DISPATCH' THEN
   IF (execution.observed_revision_binding IS NOT NULL
    AND execution.observed_revision_binding->>'attemptId'=NEW.attempt_id
    AND l.lease_owner IS NOT NULL AND l.lease_expires_at>clock_timestamp()
    AND l.admission_id IS NULL AND execution.observed_admission_receipt IS NULL
    AND ((l.state='DISPATCHING' AND l.attempt_id::text=NEW.attempt_id)
     OR (l.state='CLAIMED' AND l.attempt_id IS NULL))
    AND EXISTS(SELECT 1 FROM ui_test_revisions r,
     LATERAL jsonb_array_elements_text(r."references"->'secrets') secret
     WHERE r.id=execution.revision_id AND r.id::text=execution.observed_revision_binding->>'revisionId'
      AND r.test_id=NEW.test_id AND r.csi_id=NEW.csi_id AND secret=NEW.secret_id)) IS NOT TRUE THEN
    RAISE EXCEPTION 'secret audit replay release lineage invalid';
   END IF;
  END IF;
 END IF;
 IF NEW.path='GUIDED' AND NEW.row_kind='USAGE' AND NEW.release_id IS NULL
  AND NEW.usage_outcome='NOT_USED' AND EXISTS(SELECT 1 FROM studio_secret_use_audit u
   WHERE u.session_id=NEW.session_id AND u.secret_id=NEW.secret_id
    AND u.coordinate_step_id=NEW.coordinate_step_id AND u.attempt_id=NEW.attempt_id
    AND u.row_kind='USAGE' AND u.release_id IS NULL) THEN
  RAISE EXCEPTION 'secret audit duplicate declaring summary';
 END IF;
 IF NEW.row_kind='USAGE' AND EXISTS(SELECT 1 FROM studio_secret_use_audit history
  WHERE history.row_kind='USAGE' AND history.path=NEW.path
   AND history.session_id IS NOT DISTINCT FROM NEW.session_id
   AND history.execution_id IS NOT DISTINCT FROM NEW.execution_id AND history.attempt_id=NEW.attempt_id
   AND history.secret_id=NEW.secret_id AND history.coordinate_step_id IS NOT DISTINCT FROM NEW.coordinate_step_id
   AND history.coordinate_ordinal IS NOT DISTINCT FROM NEW.coordinate_ordinal) THEN
  RAISE EXCEPTION 'secret audit duplicate usage summary';
 END IF;
 IF NEW.decision_stage='LIVE_RECHECK' OR (NEW.row_kind='USAGE' AND NEW.release_id IS NOT NULL) THEN
  SELECT * INTO original FROM studio_secret_use_audit
   WHERE id=CASE WHEN NEW.decision_stage='LIVE_RECHECK' THEN NEW.affected_release_id ELSE NEW.release_id END
    AND release_occurred_at=NEW.release_occurred_at AND row_kind='RELEASE' AND decision_stage='DISPATCH';
  IF NOT FOUND THEN RAISE EXCEPTION 'secret audit release locator missing'; END IF;
  IF ROW(original.path,original.execution_id,original.session_id,original.admission_id,
    original.principal_id,original.csi_id,original.environment,original.test_id,original.secret_id,
    original.vault_version,original.attempt_id,original.release_seq,original.coordinate_step_id,original.coordinate_ordinal)
   IS DISTINCT FROM ROW(NEW.path,NEW.execution_id,NEW.session_id,NEW.admission_id,
    NEW.principal_id,NEW.csi_id,NEW.environment,NEW.test_id,NEW.secret_id,
    NEW.vault_version,NEW.attempt_id,NEW.release_seq,NEW.coordinate_step_id,NEW.coordinate_ordinal)
   THEN RAISE EXCEPTION 'secret audit release identity mismatch'; END IF;
  IF NEW.decision_stage='LIVE_RECHECK' AND original.outcome<>'RESOLVED' THEN
   RAISE EXCEPTION 'secret audit recheck requires resolved release';
  END IF;
  IF NEW.row_kind='USAGE' AND NEW.outcome IS DISTINCT FROM original.outcome
   AND NEW.outcome IS DISTINCT FROM 'REVOKED_MID_RUN' THEN
   RAISE EXCEPTION 'secret audit resolution outcome mismatch';
  END IF;
  IF NEW.row_kind='USAGE' AND NEW.outcome='REVOKED_MID_RUN' AND NOT EXISTS(
   SELECT 1 FROM studio_secret_use_audit WHERE affected_release_id=original.id
    AND release_occurred_at=original.release_occurred_at AND decision_stage='LIVE_RECHECK') THEN
   RAISE EXCEPTION 'secret audit revocation decision missing';
  END IF;
 ELSE
  -- Owner lock covers every retention month, so moving a timestamp cannot evade uniqueness.
  IF EXISTS(SELECT 1 FROM studio_secret_use_audit history
   WHERE history.path=NEW.path AND history.session_id IS NOT DISTINCT FROM NEW.session_id
    AND history.execution_id IS NOT DISTINCT FROM NEW.execution_id AND history.secret_id=NEW.secret_id
    AND history.coordinate_step_id IS NOT DISTINCT FROM NEW.coordinate_step_id
    AND history.coordinate_ordinal IS NOT DISTINCT FROM NEW.coordinate_ordinal
    AND ((NEW.row_kind='USAGE' AND history.row_kind='USAGE' AND history.attempt_id=NEW.attempt_id)
     OR (NEW.row_kind='RELEASE' AND history.decision_stage='DISPATCH'
      AND (history.attempt_id=NEW.attempt_id OR history.release_seq=NEW.release_seq)))) THEN
   RAISE EXCEPTION 'secret audit duplicate lifecycle decision';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_secret_audit_insert BEFORE INSERT ON studio_secret_use_audit
 FOR EACH ROW EXECUTE FUNCTION studio_secret_audit_insert_guard();
CREATE FUNCTION studio_secret_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'secret use audit is append-only'; END $$;
CREATE TRIGGER tr_secret_audit_immutable BEFORE UPDATE OR DELETE ON studio_secret_use_audit
 FOR EACH ROW EXECUTE FUNCTION studio_secret_audit_immutable();
CREATE TRIGGER tr_secret_audit_truncate BEFORE TRUNCATE ON studio_secret_use_audit
 FOR EACH STATEMENT EXECUTE FUNCTION studio_secret_audit_immutable();
REVOKE UPDATE,DELETE,TRUNCATE ON studio_secret_use_audit FROM PUBLIC;

-- No DEFAULT: an append-only audit must never need PartitionManager's DELETE/move.
-- Backend bootstrap extends this family before traffic, with the existing retention window.
DO $$ DECLARE month_start date; i integer; BEGIN
 month_start:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
 FOR i IN 0..2 LOOP
  EXECUTE format('CREATE TABLE %I PARTITION OF studio_secret_use_audit FOR VALUES FROM (%L) TO (%L)',
   'studio_secret_use_audit_'||to_char(month_start+(i||' months')::interval,'YYYY_MM'),
   (month_start+(i||' months')::interval)::date,
   (month_start+((i+1)||' months')::interval)::date);
 END LOOP;
END $$;
COMMENT ON TABLE studio_secret_use_audit IS
 'Safe metadata only; UPDATE/DELETE refused. RELEASE/USAGE lifecycle retention uses release_occurred_at monthly detach/drop.';
COMMENT ON COLUMN studio_secret_use_audit.outcome IS
 'Exact six resolution decisions; NULL only for truthful guided no-decision usage (unreached or actual consumed uncertainty).';
COMMENT ON COLUMN studio_secret_use_audit.usage_outcome IS
 'Terminal known usage or audit-only UNKNOWN_OUTCOME/genuine guided ACK_LOST; wire remains USED|NOT_USED|REFUSED. Never a value.';

-- Retry authority is names-only and has distinct transport/no-send provenance.
ALTER TABLE studio_dispatch_ledger ADD COLUMN definite_refusal_attempt_id uuid,
 ADD COLUMN zero_send_decision_attempt_id uuid;
CREATE FUNCTION studio_observed_retry_authority_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e ui_test_executions;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.definite_refusal_attempt_id IS NOT NULL OR NEW.zero_send_decision_attempt_id IS NOT NULL THEN
   RAISE EXCEPTION 'observed retry authority requires a prior decision';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.definite_refusal_attempt_id IS NOT DISTINCT FROM OLD.definite_refusal_attempt_id
  AND NEW.zero_send_decision_attempt_id IS NOT DISTINCT FROM OLD.zero_send_decision_attempt_id THEN RETURN NEW; END IF;
 SELECT * INTO STRICT e FROM ui_test_executions WHERE id=OLD.execution_id AND started_at=OLD.execution_accepted_at;
 IF e.observed_revision_binding IS NULL OR e.observed_admission_receipt IS NOT NULL
  OR OLD.admission_id IS NOT NULL OR NEW.admission_id IS NOT NULL
  OR OLD.cancel_requested_at IS NOT NULL OR OLD.revoked_at IS NOT NULL
  OR OLD.pending_deadline_at IS NOT NULL AND OLD.pending_deadline_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'observed retry authority not pending';
 END IF;
 IF NEW.definite_refusal_attempt_id IS DISTINCT FROM OLD.definite_refusal_attempt_id
  AND NEW.definite_refusal_attempt_id IS NOT NULL THEN
  IF (OLD.state='DISPATCHING' AND OLD.attempt_id=NEW.definite_refusal_attempt_id
   AND OLD.definite_refusal_attempt_id IS NULL
   AND e.observed_revision_binding->>'attemptId'=OLD.attempt_id::text
   AND NEW.state='QUEUED' AND NEW.attempt_id IS NULL AND NEW.lease_owner IS NULL
   AND NEW.lease_expires_at IS NULL
   AND NEW.zero_send_decision_attempt_id IS NOT DISTINCT FROM OLD.zero_send_decision_attempt_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'observed definite refusal transition invalid';
  END IF;
 END IF;
 IF NEW.zero_send_decision_attempt_id IS DISTINCT FROM OLD.zero_send_decision_attempt_id
  AND NEW.zero_send_decision_attempt_id IS NOT NULL THEN
  IF (OLD.state='CLAIMED' AND OLD.attempt_id IS NULL AND OLD.lease_owner IS NOT NULL
   AND OLD.lease_expires_at>clock_timestamp()
   AND e.observed_revision_binding->>'attemptId'=NEW.zero_send_decision_attempt_id::text
   AND NEW.state='QUEUED' AND NEW.attempt_id IS NULL AND NEW.lease_owner IS NULL
   AND NEW.lease_expires_at IS NULL
   AND NEW.definite_refusal_attempt_id IS NOT DISTINCT FROM OLD.definite_refusal_attempt_id
   AND EXISTS(SELECT 1 FROM studio_secret_use_audit a WHERE a.execution_id=OLD.execution_id
    AND a.row_kind='RELEASE' AND a.decision_stage='DISPATCH' AND a.outcome='VAULT_UNAVAILABLE'
    AND a.attempt_id=NEW.zero_send_decision_attempt_id::text)) IS NOT TRUE THEN
   RAISE EXCEPTION 'observed no-send outage transition invalid';
  END IF;
 END IF;
 IF (OLD.definite_refusal_attempt_id IS NOT NULL AND NEW.definite_refusal_attempt_id IS NULL)
  OR (OLD.zero_send_decision_attempt_id IS NOT NULL AND NEW.zero_send_decision_attempt_id IS NULL) THEN
  IF (OLD.state='CLAIMED' AND OLD.attempt_id IS NULL AND OLD.lease_owner IS NOT NULL
   AND OLD.lease_owner=NEW.lease_owner AND OLD.lease_expires_at>clock_timestamp()
   AND NEW.state='DISPATCHING' AND NEW.attempt_id IS NOT NULL
   AND e.observed_revision_binding->>'attemptId'=NEW.attempt_id::text
   AND NEW.attempt_id IS DISTINCT FROM OLD.definite_refusal_attempt_id
   AND NEW.attempt_id IS DISTINCT FROM OLD.zero_send_decision_attempt_id
   AND NEW.definite_refusal_attempt_id IS NULL AND NEW.zero_send_decision_attempt_id IS NULL) IS NOT TRUE THEN
   RAISE EXCEPTION 'observed retry authority consumption invalid';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_retry_authority BEFORE INSERT OR UPDATE ON studio_dispatch_ledger
 FOR EACH ROW EXECUTE FUNCTION studio_observed_retry_authority_guard();

-- Active publication/replay predicates: complete account-free v3 tuple.
CREATE OR REPLACE FUNCTION studio_publication_profile(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT p='{"catalog":"observed-replay-2","playwright":"1.63.0","browserEngine":"chromium","contract":3,"learnedPlan":3,"observation":3,"guidedPolicy":3,"referencePolicy":4,"lowering":2,"artifact":3,"language":"observed-3","executor":"observed-3","publicationEvidence":1,"validationBasis":1,"validator":"observed-2","protocol":3,"replayAuthorization":2}'::jsonb
$$;

CREATE OR REPLACE FUNCTION studio_publication_scope(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF (studio_publication_closed(p,ARRAY['principalId','csiId','environment','applicationId','allowedOrigins','capabilities','policyId','policyVersion','entryPolicyId','initialContext'],32768)
 AND studio_publication_strings(p,ARRAY['principalId','csiId','environment','applicationId','policyId','policyVersion','entryPolicyId'])
 AND jsonb_typeof(p->'allowedOrigins')='array' AND jsonb_array_length(p->'allowedOrigins') BETWEEN 1 AND 32
 AND jsonb_typeof(p->'capabilities')='array' AND jsonb_array_length(p->'capabilities') BETWEEN 1 AND 10) IS NOT TRUE THEN RETURN false; END IF;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(p->'allowedOrigins')) OR (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(p->'capabilities')) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'allowedOrigins') LOOP
  IF (jsonb_typeof(item)='string' AND length(item#>>'{}')<=256 AND item#>>'{}' ~ '^https?://([a-z0-9.-]+|\[[0-9a-f:]+\])(:[1-9][0-9]{0,4})?$') IS NOT TRUE THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'capabilities') LOOP
  IF jsonb_typeof(item)<>'string' OR item#>>'{}' NOT IN ('navigate','click','fill','press','check','uncheck','hover','selectOption','read','assert') THEN RETURN false; END IF;
 END LOOP;
 RETURN ((p->'initialContext'='{"kind":"initialBlank"}'::jsonb)
 OR (studio_publication_closed(p->'initialContext',ARRAY['kind','origin'],1024)
 AND p->'initialContext'->>'kind'='observedDocument' AND p->'allowedOrigins' @> jsonb_build_array(p->'initialContext'->'origin'))) IS TRUE;
END $$;

CREATE OR REPLACE FUNCTION studio_observed_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; g jsonb; q jsonb; receipt jsonb; r ui_test_revisions; published studio_guided_publications; ledger studio_dispatch_ledger;
 uuid_pattern constant text:='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
 hash_pattern constant text:='^[a-f0-9]{64}$';
 time_pattern constant text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$';
 first_receipt boolean;
BEGIN
 b:=NEW.observed_revision_binding;receipt:=NEW.observed_admission_receipt;
 IF TG_OP='UPDATE' THEN
  IF OLD.observed_admission_receipt IS NOT NULL AND receipt IS DISTINCT FROM OLD.observed_admission_receipt
  THEN RAISE EXCEPTION 'observed execution identity immutable'; END IF;
  IF b IS DISTINCT FROM OLD.observed_revision_binding THEN
   SELECT * INTO STRICT ledger FROM studio_dispatch_ledger WHERE execution_id=NEW.id FOR UPDATE;
   IF (OLD.observed_revision_binding IS NOT NULL AND b IS NOT NULL
    AND OLD.observed_admission_receipt IS NULL AND receipt IS NULL
    AND ledger.execution_accepted_at=NEW.started_at AND ledger.state='CLAIMED'
    AND ledger.attempt_id IS NULL AND ledger.admission_id IS NULL
    AND ledger.cancel_requested_at IS NULL AND ledger.revoked_at IS NULL
    AND ledger.lease_expires_at>clock_timestamp() AND ledger.lease_owner IS NOT NULL
    AND current_setting('studio.observed_retry_owner',true)=ledger.lease_owner
    AND (ledger.pending_deadline_at IS NULL OR ledger.pending_deadline_at>clock_timestamp())
    AND (ledger.definite_refusal_attempt_id::text=OLD.observed_revision_binding->>'attemptId'
     OR ledger.zero_send_decision_attempt_id::text=OLD.observed_revision_binding->>'attemptId')
    AND b->>'attemptId' IS DISTINCT FROM OLD.observed_revision_binding->>'attemptId'
    AND b->'replayGrant'->>'grantId' IS DISTINCT FROM OLD.observed_revision_binding->'replayGrant'->>'grantId'
    AND (b-ARRAY['attemptId','replayGrant'])=(OLD.observed_revision_binding-ARRAY['attemptId','replayGrant'])
    AND ((b->'replayGrant')-ARRAY['grantId','attemptId','issuedAt','expiresAt'])=
        ((OLD.observed_revision_binding->'replayGrant')-ARRAY['grantId','attemptId','issuedAt','expiresAt'])
    AND (b->'replayGrant'->>'issuedAt')::timestamptz<=clock_timestamp()
    AND (b->'replayGrant'->>'expiresAt')::timestamptz>clock_timestamp()) IS NOT TRUE THEN
    RAISE EXCEPTION 'observed execution identity immutable without owned retry authority';
   END IF;
  END IF;
  first_receipt:=OLD.observed_admission_receipt IS NULL AND receipt IS NOT NULL;
 ELSE
  first_receipt:=receipt IS NOT NULL;
  IF receipt IS NOT NULL THEN RAISE EXCEPTION 'observed admission requires actual admission transition'; END IF;
 END IF;
 IF b IS NULL THEN
  IF receipt IS NOT NULL THEN RAISE EXCEPTION 'observed receipt needs binding'; END IF;
  IF NEW.revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM ui_test_revisions WHERE id=NEW.revision_id AND publication_kind='GUIDED_RUN') THEN RAISE EXCEPTION 'observed revision needs execution binding'; END IF;
  RETURN NEW;
 END IF;
 IF (studio_publication_closed(b,ARRAY['version','executionId','startedAt','attemptId','revisionId','revisionDigest','testId','csiId','principalId','environment','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','requiredProfile','requiredBuild','scope','scopeHash','currentPolicyHash','replayGrant'],32768)
  AND b->'version'='1'::jsonb
  AND studio_publication_strings(b,ARRAY['executionId','attemptId','revisionId','testId'],uuid_pattern)
  AND studio_publication_strings(b,ARRAY['revisionDigest','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','scopeHash','currentPolicyHash'],hash_pattern)
  AND studio_publication_strings(b,ARRAY['csiId','principalId','environment']) AND studio_publication_strings(b,ARRAY['startedAt'],time_pattern)
  AND studio_publication_profile(b->'requiredProfile') AND studio_publication_build(b->'requiredBuild') AND studio_publication_scope(b->'scope')
  AND b->>'executionId'=NEW.id::text AND (b->>'startedAt')::timestamptz=NEW.started_at AND b->>'revisionId'=NEW.revision_id::text
  AND b->>'testId'=NEW.ui_test_id::text AND b->>'csiId'=NEW.csi_id AND b->>'principalId'=NEW.principal AND b->>'environment'=NEW.environment
  AND b->'scope'->>'principalId'=NEW.principal AND b->'scope'->>'csiId'=NEW.csi_id AND b->'scope'->>'environment'=NEW.environment
  AND studio_publication_hash(b->'scope')=b->>'scopeHash' AND b->'requiredBuild'->>'profileHash'=studio_publication_hash(b->'requiredProfile')) IS NOT TRUE
 THEN RAISE EXCEPTION 'observed execution binding invalid'; END IF;
 SELECT * INTO STRICT r FROM ui_test_revisions WHERE id=NEW.revision_id AND test_id=NEW.ui_test_id AND csi_id=NEW.csi_id;
 SELECT * INTO STRICT published FROM studio_guided_publications WHERE revision_id=r.id;
 IF (r.publication_kind='GUIDED_RUN' AND b->>'revisionDigest'=r.revision_digest AND b->>'artifactHash'=r.artifact_hash
  AND b->>'learnedPlanHash'=r.learned_plan_hash AND b->>'configurationHash'=studio_publication_hash(r.configuration)
  AND b->>'referencePolicyHash'=studio_publication_hash(r.reference_policy)
  AND b->>'publicationEvidenceHash'=published.document->>'publicationEvidenceHash'
  AND b->'requiredProfile'=r.artifact->'profile' AND b->>'environment'=r.configuration->>'environment'
  AND ((b->'scope')-'principalId')=r.reference_policy->'scope') IS NOT TRUE
 THEN RAISE EXCEPTION 'observed execution revision mismatch'; END IF;
 g:=b->'replayGrant';
 IF (studio_publication_closed(g,ARRAY['version','grantId','executionId','attemptId','revisionId','revisionDigest','principalId','csiId','scopeHash','profileHash','buildHash','currentPolicyHash','issuedAt','expiresAt'],8192)
  AND g->'version'='1'::jsonb
  AND studio_publication_strings(g,ARRAY['grantId','executionId','attemptId','revisionId'],uuid_pattern)
  AND studio_publication_strings(g,ARRAY['revisionDigest','scopeHash','profileHash','buildHash','currentPolicyHash'],hash_pattern)
  AND studio_publication_strings(g,ARRAY['principalId','csiId'])
  AND studio_publication_strings(g,ARRAY['issuedAt','expiresAt'],time_pattern)
  AND g->'executionId'=b->'executionId' AND g->'attemptId'=b->'attemptId' AND g->'revisionId'=b->'revisionId' AND g->'revisionDigest'=b->'revisionDigest'
  AND g->'principalId'=b->'principalId' AND g->'csiId'=b->'csiId' AND g->'scopeHash'=b->'scopeHash' AND g->'currentPolicyHash'=b->'currentPolicyHash'
  AND g->>'profileHash'=studio_publication_hash(b->'requiredProfile') AND g->>'buildHash'=studio_publication_hash(b->'requiredBuild')
  AND (g->>'issuedAt')::timestamptz<=(g->>'expiresAt')::timestamptz AND (g->>'expiresAt')::timestamptz<=(g->>'issuedAt')::timestamptz+interval '30 seconds') IS NOT TRUE
 THEN RAISE EXCEPTION 'observed execution grant invalid'; END IF;
 IF TG_OP='INSERT' AND ((g->>'expiresAt')::timestamptz<=clock_timestamp() OR (g->>'issuedAt')::timestamptz>clock_timestamp()) THEN RAISE EXCEPTION 'observed execution grant expired'; END IF;
 IF receipt IS NOT NULL THEN
  q:=receipt->'request';
  IF (studio_publication_closed(receipt,ARRAY['schemaVersion','kind','admissionId','request','admittedAt','startDeadlineAt','runDeadlineAt'],16384)
   AND receipt->'schemaVersion'='3'::jsonb AND receipt->>'kind'='observed'
   AND studio_publication_strings(receipt,ARRAY['admissionId'],uuid_pattern)
   AND studio_publication_strings(receipt,ARRAY['admittedAt','startDeadlineAt','runDeadlineAt'],time_pattern)
   AND studio_publication_closed(q,ARRAY['schemaVersion','kind','executionId','startedAt','attemptId','runnerInstanceId','admissionId','revisionId','revisionDigest','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','scopeHash','currentPolicyHash','grantId','profile','build'],16384)
   AND q->'schemaVersion'='3'::jsonb AND q->>'kind'='observed' AND studio_publication_strings(q,ARRAY['runnerInstanceId'])
   AND q->'admissionId'=receipt->'admissionId' AND q->'executionId'=b->'executionId' AND q->'startedAt'=b->'startedAt' AND q->'attemptId'=b->'attemptId'
   AND q->'revisionId'=b->'revisionId' AND q->'revisionDigest'=b->'revisionDigest' AND q->'artifactHash'=b->'artifactHash' AND q->'configurationHash'=b->'configurationHash'
   AND q->'learnedPlanHash'=b->'learnedPlanHash' AND q->'referencePolicyHash'=b->'referencePolicyHash' AND q->'publicationEvidenceHash'=b->'publicationEvidenceHash'
   AND q->'scopeHash'=b->'scopeHash' AND q->'currentPolicyHash'=b->'currentPolicyHash' AND q->'grantId'=g->'grantId' 
   AND q->'profile'=b->'requiredProfile' AND q->'build'=b->'requiredBuild'
   AND (receipt->>'admittedAt')::timestamptz<=(receipt->>'startDeadlineAt')::timestamptz AND (receipt->>'startDeadlineAt')::timestamptz<=(receipt->>'runDeadlineAt')::timestamptz) IS NOT TRUE
  THEN RAISE EXCEPTION 'observed admission binding invalid'; END IF;
  IF first_receipt THEN
   SELECT * INTO STRICT ledger FROM studio_dispatch_ledger WHERE execution_id=NEW.id;
   IF (ledger.execution_accepted_at=NEW.started_at AND ledger.attempt_id::text=q->>'attemptId' AND ledger.admission_id::text=q->>'admissionId'
    AND ledger.runner_instance_id=q->>'runnerInstanceId' AND ledger.state='ADMITTED' AND ledger.cancel_requested_at IS NULL
    AND ledger.start_deadline_at=(receipt->>'startDeadlineAt')::timestamptz AND ledger.run_deadline_at=(receipt->>'runDeadlineAt')::timestamptz
    AND (receipt->>'admittedAt')::timestamptz>=(g->>'issuedAt')::timestamptz AND (receipt->>'admittedAt')::timestamptz<=clock_timestamp()
    AND (g->>'expiresAt')::timestamptz>clock_timestamp()) IS NOT TRUE
   THEN RAISE EXCEPTION 'observed admission not owned by current ledger'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_publication_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'RESERVED' OR NEW.attempt_number<>(SELECT COALESCE(max(attempt_number),0)+1 FROM studio_guided_publication_attempts WHERE session_id=NEW.session_id) OR EXISTS(SELECT 1 FROM studio_guided_publication_attempts WHERE session_id=NEW.session_id AND finalize_key=NEW.finalize_key AND finalize_digest<>NEW.finalize_digest) THEN RAISE EXCEPTION 'publication claim sequence invalid'; END IF;
 ELSE
  IF NEW.status='VALIDATED' AND OLD.status<>'VALIDATING' THEN RAISE EXCEPTION 'publication validation was not claimed'; END IF;
  IF (to_jsonb(OLD)-ARRAY['status','claimed_at','completed_at','validator_receipt','failure_code']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','claimed_at','completed_at','validator_receipt','failure_code'])
  OR OLD.status NOT IN ('RESERVED','VALIDATING') OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
  OR (OLD.status='VALIDATING' AND NEW.status IN ('RESERVED','VALIDATING')) THEN RAISE EXCEPTION 'publication attempt immutable'; END IF;
 END IF;
 IF NEW.snapshot_hash<>studio_publication_hash(NEW.identity-ARRAY['snapshotHash','finalizeKey','finalizeDigest']) OR NEW.identity->'base' IS DISTINCT FROM (SELECT document FROM studio_guided_publication_bases WHERE session_id=NEW.session_id) THEN RAISE EXCEPTION 'publication attempt snapshot mismatch'; END IF;
 IF NEW.status IN ('RESERVED','VALIDATING','VALIDATED') THEN
  IF s.state<>'FINALIZING' OR s.expires_at<=clock_timestamp() OR NEW.validation_deadline<=clock_timestamp()
   OR s.document->'owner'->>'workerId' IS DISTINCT FROM NEW.identity->>'ownerWorkerId'
   OR s.document->'owner'->>'fence' IS DISTINCT FROM NEW.identity->>'ownerFence'
   OR (s.document->'owner'->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
  THEN RAISE EXCEPTION 'publication claim authority expired'; END IF;
 END IF;
 IF NEW.status='VALIDATED' AND (studio_publication_closed(NEW.validator_receipt,ARRAY['schemaVersion','ok','errorCode','attemptId','claimId','snapshotHash','basisHash','artifactHash','learnedPlanHash','referencePolicyHash','operationEquivalenceHash','admissionProvenanceHash','publicationEvidenceHash','profile','build'],65536)
  AND NEW.validator_receipt->'schemaVersion'='3'::jsonb AND studio_publication_strings(NEW.validator_receipt,ARRAY['admissionProvenanceHash'],'^[a-f0-9]{64}$')
  AND studio_publication_profile(NEW.validator_receipt->'profile')
  AND studio_publication_build(NEW.validator_receipt->'build')
  AND NEW.validator_receipt->>'ok'='true' AND NEW.validator_receipt->'errorCode'='null'::jsonb
  AND studio_publication_hash(NEW.validator_receipt->'profile')=NEW.identity->>'profileHash'
  AND studio_publication_hash(NEW.validator_receipt->'build')=NEW.identity->>'validationBuildHash' AND NEW.validator_receipt->>'attemptId'=NEW.attempt_id::text
  AND NEW.validator_receipt->>'claimId'=NEW.claim_id::text AND NEW.validator_receipt->>'snapshotHash'=NEW.snapshot_hash
  AND NEW.validator_receipt->>'basisHash'=NEW.basis_hash AND NEW.validator_receipt->>'artifactHash'=NEW.identity->>'artifactHash'
  AND NEW.validator_receipt->>'learnedPlanHash'=NEW.identity->>'learnedPlanHash'
  AND NEW.validator_receipt->>'referencePolicyHash'=NEW.identity->>'referencePolicyHash'
  AND NEW.validator_receipt->>'operationEquivalenceHash'=NEW.identity->>'operationEquivalenceHash'
  AND NEW.validator_receipt->>'publicationEvidenceHash'=NEW.identity->>'publicationEvidenceHash') IS NOT TRUE
 THEN RAISE EXCEPTION 'publication verdict mismatch'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_publication_observation_shape(o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n jsonb; l jsonb; v jsonb; k text;
BEGIN
 IF (o->'schemaVersion'='3'::jsonb AND studio_publication_strings(o,ARRAY['sessionId','documentId','origin','scopeHash','observedAt'])
  AND jsonb_typeof(o->'generation')='number' AND (o->>'generation')::bigint BETWEEN 0 AND 2147483647
  AND jsonb_typeof(o->'nodes')='array' AND jsonb_array_length(o->'nodes')<=500
  AND studio_publication_closed(o->'coverage',ARRAY['mode','complete','truncated','withheldRegions','reason','passwordControls'],1024)
  AND jsonb_typeof(o->'coverage'->'passwordControls')='number'
  AND o->'coverage'->>'passwordControls' ~ '^(0|[1-9][0-9]{0,2})$'
  AND (o->'coverage'->>'passwordControls')::integer BETWEEN 0 AND 500
  AND o->'coverage'->>'mode' IN ('semantic','boundedDom') AND jsonb_typeof(o->'coverage'->'complete')='boolean'
  AND jsonb_typeof(o->'coverage'->'truncated')='boolean' AND jsonb_typeof(o->'coverage'->'withheldRegions')='number'
  AND (o->'coverage'->>'withheldRegions')::bigint BETWEEN 0 AND 2147483647 AND o->'coverage'->>'reason' IN ('complete','budget','sensitivity','unsupportedSurface')) IS NOT TRUE THEN RETURN false; END IF;
 IF (SELECT count(*)<>count(DISTINCT value->>'nodeId') FROM jsonb_array_elements(o->'nodes')) THEN RETURN false; END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(o->'nodes') LOOP
  IF (studio_publication_closed(n,ARRAY['nodeId','documentId','generation','role','name','elementType','controlType','classification','policyRuleId','visible','actionable','depth','parentNodeId','regionId','formId','labelNodeIds','locatorHints'],16384)
   AND studio_publication_strings(n,ARRAY['nodeId','documentId','role']) AND jsonb_typeof(n->'name')='string' AND length(n->>'name') BETWEEN 1 AND 256
   AND n->'documentId'=o->'documentId' AND n->'generation'=o->'generation'
   AND n->>'elementType' IN ('button','input','textarea','select','text','link','other')
   AND n->>'controlType' IN ('none','text','search','email','tel','url','textarea','hidden','other')
   AND n->>'classification' IN ('structuralOnly','permittedBusinessData','nonsecretApproved','withheld')
   AND jsonb_typeof(n->'visible')='boolean' AND jsonb_typeof(n->'actionable')='boolean'
   AND jsonb_typeof(n->'depth')='number' AND (n->>'depth')::bigint BETWEEN 0 AND 2147483647
   AND jsonb_typeof(n->'labelNodeIds')='array' AND jsonb_array_length(n->'labelNodeIds')<=20
   AND jsonb_typeof(n->'locatorHints')='array' AND jsonb_array_length(n->'locatorHints')<=5) IS NOT TRUE THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['policyRuleId','parentNodeId','regionId','formId'] LOOP
   IF n->k<>'null'::jsonb AND NOT studio_publication_strings(n,ARRAY[k]) THEN RETURN false; END IF;
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(n->'labelNodeIds') LOOP
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 256 THEN RETURN false; END IF;
  END LOOP;
  FOR l IN SELECT value FROM jsonb_array_elements(n->'locatorHints') LOOP
   IF ((l->>'kind'='role' AND studio_publication_closed(l,ARRAY['kind','role','name','exact'],2048) AND studio_publication_strings(l,ARRAY['role','name']) AND l->'exact'='true'::jsonb)
    OR (l->>'kind' IN ('label','testId','text','placeholder') AND studio_publication_closed(l,ARRAY['kind','value','exact'],2048) AND studio_publication_strings(l,ARRAY['value']) AND l->'exact'='true'::jsonb)) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE studio_guided_publication_observations DROP CONSTRAINT ck_publication_observation_shape;
ALTER TABLE studio_guided_publication_observations ADD CONSTRAINT ck_publication_observation_shape CHECK(studio_publication_observation_shape(observation)) NOT VALID;
-- OBSERVED_SCHEDULE_AUTH_REQUIRED remains in the V33 schedule constraint unchanged.

-- AC-12: terminal refusal for an overlong already-stored secret, never truncation.
ALTER TABLE ui_test_executions DROP CONSTRAINT ck_ui_test_executions_error_code;
ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_error_code CHECK(
 error_code IS NULL OR error_code IN ('TIMEOUT','DISPATCH_FAILED','DISPATCH_UNKNOWN',
 'START_TIMEOUT','STALE','DISPATCH_DISABLED','AUTHORIZATION_REVOKED','REFERENCE_UNAVAILABLE',
 'CANCELLED','SECRET_TOO_LONG')) NOT VALID;
ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;

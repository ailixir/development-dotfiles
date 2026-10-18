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
 release_seq bigint CHECK(release_seq>0),
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
 source_reference_id varchar(256) CHECK(length(source_reference_id)>0),
 outcome varchar(24) CHECK(outcome IN ('RESOLVED','NOT_AUTHORIZED','REVOKED',
  'UNAVAILABLE','VAULT_UNAVAILABLE','REVOKED_MID_RUN')),
 usage_outcome varchar(32),
 PRIMARY KEY(id,release_occurred_at),
 FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 CHECK((path='GUIDED' AND session_id IS NOT NULL AND execution_id IS NULL)
  OR (path='OBSERVED_REPLAY' AND execution_id IS NOT NULL AND session_id IS NULL)),
 CHECK(path<>'OBSERVED_REPLAY' OR (coordinate_step_id IS NULL AND coordinate_ordinal IS NULL AND source_reference_id IS NULL)),
 CHECK(path<>'GUIDED' OR coordinate_step_id IS NOT NULL),
 CHECK(occurred_at>=release_occurred_at),
 CONSTRAINT ck_secret_audit_row_shape CHECK((
  (row_kind='RELEASE' AND release_id=id AND release_seq IS NOT NULL AND outcome IS NOT NULL AND usage_outcome IS NULL
   AND (path<>'GUIDED' OR (admission_id IS NOT NULL AND coordinate_ordinal IS NOT NULL))
   AND ((decision_stage='DISPATCH' AND affected_release_id IS NULL
     AND outcome<>'REVOKED_MID_RUN' AND release_occurred_at=occurred_at)
    OR (decision_stage='LIVE_RECHECK' AND affected_release_id IS NOT NULL
     AND affected_release_id<>id AND outcome='REVOKED_MID_RUN')))
  OR (row_kind='USAGE' AND decision_stage IS NULL AND affected_release_id IS NULL
   AND usage_outcome IS NOT NULL
   AND ((release_id IS NOT NULL AND outcome IS NOT NULL AND release_seq IS NOT NULL
     AND (path<>'GUIDED' OR (admission_id IS NOT NULL AND coordinate_ordinal IS NOT NULL)))
    OR (release_id IS NULL AND outcome IS NULL AND vault_version IS NULL AND release_seq IS NULL
     AND release_occurred_at=occurred_at
     AND ((path='GUIDED' AND ((usage_outcome='NOT_USED' AND admission_id IS NULL
       AND coordinate_ordinal IS NULL AND source_reference_id IS NOT NULL)
      OR (usage_outcome IN ('UNKNOWN_OUTCOME','ACK_LOST') AND admission_id IS NOT NULL AND coordinate_ordinal IS NOT NULL)))
      OR (path='OBSERVED_REPLAY' AND usage_outcome IN ('NOT_USED','UNKNOWN_OUTCOME') AND admission_id IS NULL)))))
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

-- Safe, positively constructed read/no-send evidence; neither family is retry authority.
CREATE TABLE studio_observed_secret_read_entries (
 id uuid NOT NULL, occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 execution_id uuid NOT NULL REFERENCES studio_dispatch_ledger(execution_id),
 execution_accepted_at timestamptz NOT NULL CHECK(isfinite(execution_accepted_at)),
 attempt_id uuid NOT NULL, revision_id uuid NOT NULL REFERENCES ui_test_revisions(id),
 revision_digest char(64) NOT NULL CHECK(revision_digest ~ '^[a-f0-9]{64}$'),
 binding_digest char(64) NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
 scope_hash char(64) NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 principal_id varchar(256) NOT NULL CHECK(length(principal_id)>0),
 csi_id varchar(20) NOT NULL, environment varchar(256) NOT NULL CHECK(length(environment)>0),
 test_id uuid NOT NULL, lease_owner varchar(256) NOT NULL CHECK(length(lease_owner)>0),
 secret_id varchar(64) NOT NULL CHECK(secret_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
 PRIMARY KEY(id,occurred_at), FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id)
) PARTITION BY RANGE(occurred_at);
CREATE INDEX ix_observed_read_entry_attempt ON studio_observed_secret_read_entries(execution_id,attempt_id,secret_id);
CREATE TABLE studio_observed_no_send_decisions (
 id uuid NOT NULL, occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 execution_id uuid NOT NULL REFERENCES studio_dispatch_ledger(execution_id),
 execution_accepted_at timestamptz NOT NULL CHECK(isfinite(execution_accepted_at)),
 attempt_id uuid NOT NULL, revision_id uuid NOT NULL REFERENCES ui_test_revisions(id),
 revision_digest char(64) NOT NULL CHECK(revision_digest ~ '^[a-f0-9]{64}$'),
 binding_digest char(64) NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
 scope_hash char(64) NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 principal_id varchar(256) NOT NULL CHECK(length(principal_id)>0),
 csi_id varchar(20) NOT NULL, environment varchar(256) NOT NULL CHECK(length(environment)>0),
 test_id uuid NOT NULL, lease_owner varchar(256) NOT NULL CHECK(length(lease_owner)>0),
 not_entered_ids jsonb NOT NULL, disposition varchar(8) NOT NULL CHECK(disposition IN ('CLOSED','REQUEUED')),
 PRIMARY KEY(id,occurred_at), FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id),
 CHECK(jsonb_typeof(not_entered_ids)='array' AND jsonb_array_length(not_entered_ids)<=64)
) PARTITION BY RANGE(occurred_at);
CREATE INDEX ix_observed_no_send_attempt ON studio_observed_no_send_decisions(execution_id,attempt_id);

-- Terminal winners have separate CLOSED-only authority; no live lease is borrowed.
CREATE TABLE studio_observed_terminal_secret_settlements (
 id uuid NOT NULL, occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 execution_id uuid NOT NULL REFERENCES studio_dispatch_ledger(execution_id),
 execution_accepted_at timestamptz NOT NULL CHECK(isfinite(execution_accepted_at)),
 attempt_id uuid NOT NULL, revision_id uuid NOT NULL REFERENCES ui_test_revisions(id),
 revision_digest char(64) NOT NULL CHECK(revision_digest ~ '^[a-f0-9]{64}$'),
 binding_digest char(64) NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
 scope_hash char(64) NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 principal_id varchar(256) NOT NULL CHECK(length(principal_id)>0), csi_id varchar(20) NOT NULL,
 environment varchar(256) NOT NULL CHECK(length(environment)>0), test_id uuid NOT NULL,
 disposition varchar(6) NOT NULL DEFAULT 'CLOSED' CHECK(disposition='CLOSED'),
 before_state varchar(16) NOT NULL CHECK(before_state IN ('QUEUED','CLAIMED')),
 before_updated_at timestamptz NOT NULL, before_snapshot_revision bigint NOT NULL,
 before_ended_at timestamptz, terminal_error_code varchar(64) NOT NULL CHECK(terminal_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
 terminal_ended_at timestamptz NOT NULL CHECK(isfinite(terminal_ended_at)),
 no_read_ids jsonb NOT NULL, possible_read_ids jsonb NOT NULL,
 PRIMARY KEY(id,occurred_at), FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id)
) PARTITION BY RANGE(occurred_at);
CREATE INDEX ix_observed_terminal_attempt ON studio_observed_terminal_secret_settlements(execution_id,attempt_id);

-- VOLATILE is deliberate: after a waited owner lock, SPI reads use the fresh current snapshot.
CREATE FUNCTION studio_observed_terminal_classification(execution_key uuid,attempt_key uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE AS $$
DECLARE result jsonb; declarations jsonb; owner_row studio_dispatch_ledger; history_row ui_test_executions;
BEGIN
 SELECT * INTO STRICT owner_row FROM studio_dispatch_ledger WHERE execution_id=execution_key;
 SELECT * INTO STRICT history_row FROM ui_test_executions WHERE id=execution_key AND started_at=owner_row.execution_accepted_at;
 IF EXISTS(SELECT 1 FROM studio_observed_secret_read_entries entry WHERE entry.execution_id=execution_key
  AND entry.attempt_id=attempt_key AND ROW(entry.execution_accepted_at,entry.revision_id,entry.revision_digest::text,
   entry.binding_digest::text,entry.scope_hash::text,entry.principal_id,entry.csi_id,entry.environment,entry.test_id)
   IS DISTINCT FROM ROW(owner_row.execution_accepted_at,history_row.revision_id,
    history_row.observed_revision_binding->>'revisionDigest',studio_publication_hash(history_row.observed_revision_binding),
    history_row.observed_revision_binding->>'scopeHash',owner_row.principal,owner_row.csi_id,history_row.environment,owner_row.test_id)) THEN
  RAISE EXCEPTION 'terminal secret read-entry scope mismatch'; END IF;
 SELECT r."references"->'secrets' INTO STRICT declarations FROM studio_dispatch_ledger l
  JOIN ui_test_executions e ON e.id=l.execution_id AND e.started_at=l.execution_accepted_at
  JOIN ui_test_revisions r ON r.id=e.revision_id AND r.test_id=l.test_id AND r.csi_id=l.csi_id
  WHERE l.execution_id=execution_key AND e.observed_revision_binding->>'attemptId'=attempt_key::text;
 IF jsonb_typeof(declarations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'terminal secret declaration unavailable'; END IF;
 IF jsonb_array_length(declarations)>64 OR EXISTS(SELECT 1 FROM jsonb_array_elements(declarations) name
  WHERE jsonb_typeof(name)<>'string' OR name#>>'{}' !~ '^[A-Za-z0-9_.-]{1,64}$')
  OR (SELECT count(*) FROM jsonb_array_elements_text(declarations))<>
     (SELECT count(DISTINCT name) FROM jsonb_array_elements_text(declarations) name) THEN
  RAISE EXCEPTION 'terminal secret declaration invalid'; END IF;
 SELECT jsonb_build_object('noReadIds',COALESCE(jsonb_agg(name ORDER BY name) FILTER(WHERE NOT entered),'[]'::jsonb),
  'possibleReadIds',COALESCE(jsonb_agg(name ORDER BY name) FILTER(WHERE entered),'[]'::jsonb)) INTO result
 FROM (SELECT name,EXISTS(SELECT 1 FROM studio_observed_secret_read_entries entry
   WHERE entry.execution_id=execution_key AND entry.attempt_id=attempt_key AND entry.secret_id=name) AS entered
  FROM jsonb_array_elements_text(declarations) name
  WHERE NOT EXISTS(SELECT 1 FROM studio_secret_use_audit fact WHERE fact.execution_id=execution_key
    AND fact.attempt_id=attempt_key::text AND fact.secret_id=name
    AND (fact.decision_stage='DISPATCH' OR fact.row_kind='USAGE'))) remaining;
 RETURN result;
END $$;

CREATE FUNCTION studio_observed_terminal_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l studio_dispatch_ledger; e ui_test_executions; expected jsonb;
BEGIN
 SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id FOR UPDATE;
 SELECT * INTO STRICT e FROM ui_test_executions WHERE id=l.execution_id AND started_at=l.execution_accepted_at FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-audit-owner:OBSERVED_REPLAY:'||NEW.execution_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-terminal-id:'||NEW.id::text,0));
 IF (l.state IN ('QUEUED','CLAIMED') AND l.attempt_id IS NULL AND l.admission_id IS NULL
  AND e.status='PENDING' AND e.observed_admission_receipt IS NULL AND e.observed_revision_binding IS NOT NULL
  AND e.observed_revision_binding->>'attemptId'=NEW.attempt_id::text
  AND ROW(l.execution_accepted_at,e.revision_id,e.observed_revision_binding->>'revisionDigest',
   studio_publication_hash(e.observed_revision_binding),e.observed_revision_binding->>'scopeHash',
   l.principal,l.csi_id,e.environment,l.test_id)
   IS NOT DISTINCT FROM ROW(NEW.execution_accepted_at,NEW.revision_id,NEW.revision_digest::text,
    NEW.binding_digest::text,NEW.scope_hash::text,NEW.principal_id,NEW.csi_id,NEW.environment,NEW.test_id)) IS NOT TRUE THEN
  RAISE EXCEPTION 'terminal secret settlement requires authentic pre-transition owner';
 END IF;
 IF (NEW.before_state IS NOT NULL AND NEW.before_state IS DISTINCT FROM l.state)
  OR (NEW.before_updated_at IS NOT NULL AND NEW.before_updated_at IS DISTINCT FROM l.updated_at)
  OR (NEW.before_snapshot_revision IS NOT NULL AND NEW.before_snapshot_revision IS DISTINCT FROM e.snapshot_revision)
  OR (NEW.before_ended_at IS NOT NULL AND NEW.before_ended_at IS DISTINCT FROM e.ended_at) THEN
  RAISE EXCEPTION 'terminal secret settlement before-image mismatch'; END IF;
 NEW.before_state:=l.state;NEW.before_updated_at:=l.updated_at;NEW.before_snapshot_revision:=e.snapshot_revision;
 NEW.before_ended_at:=e.ended_at;
 IF e.ended_at IS NOT NULL THEN NEW.terminal_ended_at:=e.ended_at; END IF;
 IF EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements existing
  WHERE existing.execution_id=NEW.execution_id AND existing.attempt_id=NEW.attempt_id) THEN
  RAISE EXCEPTION 'terminal secret settlement duplicate'; END IF;
 -- Separate SPI command after lock acquisition, including a writer we waited for.
 expected:=studio_observed_terminal_classification(NEW.execution_id,NEW.attempt_id);
 IF NEW.no_read_ids IS DISTINCT FROM expected->'noReadIds' OR NEW.possible_read_ids IS DISTINCT FROM expected->'possibleReadIds' THEN
  RAISE EXCEPTION 'terminal secret settlement classification mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_terminal_insert BEFORE INSERT ON studio_observed_terminal_secret_settlements
 FOR EACH ROW EXECUTE FUNCTION studio_observed_terminal_insert_guard();

CREATE FUNCTION studio_observed_terminal_check(cut studio_observed_terminal_secret_settlements) RETURNS void LANGUAGE plpgsql AS $$
DECLARE l studio_dispatch_ledger; e ui_test_executions; owner_version xid; history_version xid;
 receipt_version xid; usage_version xid; secret text; expected_code text; counts integer;
BEGIN
 SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=cut.execution_id;
 SELECT xmin INTO owner_version FROM studio_dispatch_ledger WHERE execution_id=cut.execution_id;
 SELECT * INTO STRICT e FROM ui_test_executions WHERE id=l.execution_id AND started_at=l.execution_accepted_at;
 SELECT xmin INTO history_version FROM ui_test_executions WHERE id=l.execution_id AND started_at=l.execution_accepted_at;
 SELECT xmin INTO receipt_version FROM studio_observed_terminal_secret_settlements WHERE id=cut.id AND occurred_at=cut.occurred_at;
 IF (owner_version=pg_current_xact_id()::xid AND history_version=pg_current_xact_id()::xid
  AND receipt_version=pg_current_xact_id()::xid AND l.state='DONE' AND e.status='ERROR'
  AND l.attempt_id IS NULL AND l.admission_id IS NULL AND e.observed_admission_receipt IS NULL
  AND e.snapshot_revision=cut.before_snapshot_revision+1 AND e.error_code=cut.terminal_error_code
  AND e.ended_at=cut.terminal_ended_at AND l.execution_accepted_at=cut.execution_accepted_at
  AND e.revision_id=cut.revision_id AND e.observed_revision_binding->>'attemptId'=cut.attempt_id::text
  AND studio_publication_hash(e.observed_revision_binding)=cut.binding_digest
  AND ROW(l.principal,l.csi_id,e.environment,l.test_id,e.observed_revision_binding->>'scopeHash',e.observed_revision_binding->>'revisionDigest')
   IS NOT DISTINCT FROM ROW(cut.principal_id,cut.csi_id,cut.environment,cut.test_id,cut.scope_hash::text,cut.revision_digest::text)
  AND (l.terminal_error_code IS NULL OR l.terminal_error_code=e.error_code)
  AND (l.terminal_error_at IS NULL OR l.terminal_error_at=e.ended_at)) IS NOT TRUE THEN
  RAISE EXCEPTION 'terminal secret settlement requires exact top-transaction winner and locator'; END IF;
 FOR secret IN SELECT jsonb_array_elements_text(cut.no_read_ids||cut.possible_read_ids) LOOP
  expected_code:=CASE WHEN cut.no_read_ids ? secret THEN 'NOT_USED' ELSE 'UNKNOWN_OUTCOME' END;
  SELECT count(*) INTO counts FROM studio_secret_use_audit fact WHERE fact.execution_id=cut.execution_id
   AND fact.attempt_id=cut.attempt_id::text AND fact.secret_id=secret AND fact.row_kind='USAGE'
   AND fact.release_id IS NULL AND fact.usage_outcome=expected_code AND fact.release_seq IS NULL
   AND fact.outcome IS NULL AND fact.vault_version IS NULL AND fact.admission_id IS NULL
   AND fact.coordinate_step_id IS NULL AND fact.coordinate_ordinal IS NULL AND fact.source_reference_id IS NULL;
  SELECT xmin INTO usage_version FROM studio_secret_use_audit fact WHERE fact.execution_id=cut.execution_id
   AND fact.attempt_id=cut.attempt_id::text AND fact.secret_id=secret AND fact.row_kind='USAGE' AND fact.release_id IS NULL;
  IF counts<>1 OR usage_version IS DISTINCT FROM pg_current_xact_id()::xid THEN
   RAISE EXCEPTION 'terminal secret settlement requires complete top-transaction summaries'; END IF;
 END LOOP;
 RETURN;
END $$;

CREATE FUNCTION studio_observed_terminal_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM studio_observed_terminal_check(NEW);
 RETURN NEW;
END $$;

-- A caller may flush a deferred event early. Regular update guards retain the winner invariant.
CREATE FUNCTION studio_observed_terminal_history_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cut studio_observed_terminal_secret_settlements; cut_version xid; history_version xid;
 current_cut boolean; owner_state text;
BEGIN
 SELECT * INTO cut FROM studio_observed_terminal_secret_settlements receipt
  WHERE receipt.execution_id=NEW.id AND receipt.execution_accepted_at=NEW.started_at;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT xmin INTO cut_version FROM studio_observed_terminal_secret_settlements WHERE id=cut.id AND occurred_at=cut.occurred_at;
 IF ROW(NEW.id,NEW.started_at,NEW.revision_id,NEW.ui_test_id,NEW.csi_id,NEW.principal,NEW.environment,
   NEW.status::text,NEW.error_code,NEW.ended_at,studio_publication_hash(NEW.observed_revision_binding),
   NEW.observed_revision_binding->>'attemptId',NEW.observed_revision_binding->>'scopeHash',NEW.observed_revision_binding->>'revisionDigest')
  IS DISTINCT FROM ROW(cut.execution_id,cut.execution_accepted_at,cut.revision_id,cut.test_id,cut.csi_id,cut.principal_id,cut.environment,
   'ERROR'::text,cut.terminal_error_code,cut.terminal_ended_at,cut.binding_digest::text,cut.attempt_id::text,cut.scope_hash::text,cut.revision_digest::text)
  OR NEW.observed_admission_receipt IS NOT NULL THEN
  RAISE EXCEPTION 'terminal secret settlement authoritative history locator immutable'; END IF;
 current_cut:=cut_version=pg_current_xact_id()::xid;
 SELECT xmin INTO history_version FROM ui_test_executions WHERE id=NEW.id AND started_at=NEW.started_at;
 IF current_cut AND (history_version IS DISTINCT FROM pg_current_xact_id()::xid
  OR NEW.snapshot_revision IS DISTINCT FROM cut.before_snapshot_revision+1) THEN
  RAISE EXCEPTION 'terminal secret settlement requires exact top-transaction winner and locator'; END IF;
 IF NOT current_cut AND (NEW.snapshot_revision<OLD.snapshot_revision OR NEW.snapshot_revision<cut.before_snapshot_revision+1) THEN
  RAISE EXCEPTION 'terminal secret settlement committed metadata snapshot cannot regress'; END IF;
 -- Existing CTE writes history before owner DONE. Do not demand that transition prematurely.
 SELECT state INTO owner_state FROM studio_dispatch_ledger WHERE execution_id=NEW.id;
 IF current_cut AND owner_state='DONE' THEN PERFORM studio_observed_terminal_check(cut); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_terminal_history_update AFTER UPDATE ON ui_test_executions
 FOR EACH ROW EXECUTE FUNCTION studio_observed_terminal_history_update_guard();

CREATE FUNCTION studio_observed_terminal_owner_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cut studio_observed_terminal_secret_settlements; cut_version xid; owner_version xid;
 history ui_test_executions; current_cut boolean;
BEGIN
 SELECT * INTO cut FROM studio_observed_terminal_secret_settlements receipt WHERE receipt.execution_id=NEW.execution_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT xmin INTO cut_version FROM studio_observed_terminal_secret_settlements WHERE id=cut.id AND occurred_at=cut.occurred_at;
 IF ROW(NEW.execution_id,NEW.execution_accepted_at,NEW.test_id,NEW.csi_id,NEW.principal,NEW.attempt_id,NEW.admission_id)
  IS DISTINCT FROM ROW(cut.execution_id,cut.execution_accepted_at,cut.test_id,cut.csi_id,cut.principal_id,NULL::uuid,NULL::uuid) THEN
  RAISE EXCEPTION 'terminal secret settlement authoritative owner locator immutable'; END IF;
 current_cut:=cut_version=pg_current_xact_id()::xid;
 SELECT xmin INTO owner_version FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id;
 IF current_cut AND owner_version IS DISTINCT FROM pg_current_xact_id()::xid THEN
  RAISE EXCEPTION 'terminal secret settlement requires exact top-transaction winner and locator'; END IF;
 IF NEW.state='DONE' THEN
  IF current_cut THEN PERFORM studio_observed_terminal_check(cut);
  ELSE
   SELECT * INTO STRICT history FROM ui_test_executions WHERE id=NEW.execution_id AND started_at=NEW.execution_accepted_at;
   IF history.status<>'ERROR' OR history.error_code IS DISTINCT FROM cut.terminal_error_code
    OR history.ended_at IS DISTINCT FROM cut.terminal_ended_at
    OR (NEW.terminal_error_code IS NOT NULL AND NEW.terminal_error_code IS DISTINCT FROM history.error_code)
    OR (NEW.terminal_error_at IS NOT NULL AND NEW.terminal_error_at IS DISTINCT FROM history.ended_at) THEN
    RAISE EXCEPTION 'terminal secret settlement authoritative owner locator immutable'; END IF;
  END IF;
 ELSIF NOT current_cut THEN RAISE EXCEPTION 'terminal secret settlement committed owner must remain terminal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_terminal_owner_update AFTER UPDATE ON studio_dispatch_ledger
 FOR EACH ROW EXECUTE FUNCTION studio_observed_terminal_owner_update_guard();

CREATE FUNCTION studio_observed_terminal_dispatch_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements cut WHERE cut.execution_id=OLD.execution_id)
  AND ((NEW.state IS DISTINCT FROM OLD.state AND NEW.state<>'DONE')
   OR NEW.attempt_id IS NOT NULL OR NEW.admission_id IS NOT NULL) THEN
  RAISE EXCEPTION 'terminal secret cut fences dispatch admission and retry'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_terminal_dispatch_fence BEFORE UPDATE ON studio_dispatch_ledger
 FOR EACH ROW EXECUTE FUNCTION studio_observed_terminal_dispatch_fence();

CREATE FUNCTION studio_observed_secret_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l studio_dispatch_ledger; e ui_test_executions; ids jsonb; secret text;
BEGIN
 SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id FOR UPDATE;
 SELECT * INTO STRICT e FROM ui_test_executions WHERE id=l.execution_id AND started_at=l.execution_accepted_at FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-audit-owner:OBSERVED_REPLAY:'||NEW.execution_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('studio-secret-evidence-id:'||NEW.id::text,0));
 IF (l.state='CLAIMED' AND l.attempt_id IS NULL AND l.admission_id IS NULL
  AND l.lease_owner=NEW.lease_owner AND l.lease_expires_at>clock_timestamp()
  AND e.observed_revision_binding IS NOT NULL AND e.observed_admission_receipt IS NULL
  AND e.observed_revision_binding->>'attemptId'=NEW.attempt_id::text
  AND ROW(l.execution_accepted_at,e.revision_id,e.observed_revision_binding->>'revisionDigest',
   studio_publication_hash(e.observed_revision_binding),e.observed_revision_binding->>'scopeHash',
   l.principal,l.csi_id,e.environment,l.test_id)
   IS NOT DISTINCT FROM ROW(NEW.execution_accepted_at,NEW.revision_id,NEW.revision_digest::text,
    NEW.binding_digest::text,NEW.scope_hash::text,NEW.principal_id,NEW.csi_id,NEW.environment,NEW.test_id)) IS NOT TRUE THEN
  RAISE EXCEPTION 'observed secret evidence owner or binding invalid';
 END IF;
 SELECT r."references"->'secrets' INTO STRICT ids FROM ui_test_revisions r
  WHERE r.id=e.revision_id AND r.test_id=l.test_id AND r.csi_id=l.csi_id;
 IF jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'observed secret declaration unavailable'; END IF;
 IF TG_TABLE_NAME LIKE 'studio_observed_secret_read_entries%' THEN
  IF EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements cut WHERE cut.execution_id=NEW.execution_id) THEN
   RAISE EXCEPTION 'terminal secret cut fences new read entry'; END IF;
  IF NOT (ids ? NEW.secret_id) OR EXISTS(SELECT 1 FROM studio_observed_secret_read_entries entry
   WHERE entry.execution_id=NEW.execution_id AND entry.attempt_id=NEW.attempt_id AND entry.secret_id=NEW.secret_id)
   OR EXISTS(SELECT 1 FROM studio_observed_no_send_decisions receipt
    WHERE receipt.execution_id=NEW.execution_id AND receipt.attempt_id=NEW.attempt_id) THEN
   RAISE EXCEPTION 'observed secret read entry undeclared or duplicate';
  END IF;
 ELSE
  IF jsonb_typeof(NEW.not_entered_ids) IS DISTINCT FROM 'array'
   OR jsonb_array_length(NEW.not_entered_ids)>64
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.not_entered_ids) name
    WHERE jsonb_typeof(name)<>'string' OR name#>>'{}' !~ '^[A-Za-z0-9_.-]{1,64}$')
   OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.not_entered_ids))<>
      (SELECT count(DISTINCT name) FROM jsonb_array_elements_text(NEW.not_entered_ids) name)
   OR EXISTS(SELECT 1 FROM studio_observed_no_send_decisions receipt
    WHERE receipt.execution_id=NEW.execution_id AND receipt.attempt_id=NEW.attempt_id) THEN
   RAISE EXCEPTION 'observed no-send receipt shape or identity invalid';
  END IF;
  FOR secret IN SELECT jsonb_array_elements_text(NEW.not_entered_ids) LOOP
   IF NOT (ids ? secret) OR EXISTS(SELECT 1 FROM studio_observed_secret_read_entries entry
     WHERE entry.execution_id=NEW.execution_id AND entry.attempt_id=NEW.attempt_id AND entry.secret_id=secret)
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit decision WHERE decision.execution_id=NEW.execution_id
     AND decision.attempt_id=NEW.attempt_id::text AND decision.secret_id=secret AND decision.decision_stage='DISPATCH') THEN
    RAISE EXCEPTION 'observed no-send positive absence contradicted';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_observed_read_entry_guard BEFORE INSERT ON studio_observed_secret_read_entries
 FOR EACH ROW EXECUTE FUNCTION studio_observed_secret_evidence_guard();
CREATE TRIGGER tr_observed_no_send_guard BEFORE INSERT ON studio_observed_no_send_decisions
 FOR EACH ROW EXECUTE FUNCTION studio_observed_secret_evidence_guard();

CREATE FUNCTION studio_observed_no_send_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l studio_dispatch_ledger; e ui_test_executions; owner_version xid; secret text;
BEGIN
 SELECT * INTO STRICT l FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id;
 SELECT xmin INTO owner_version FROM studio_dispatch_ledger WHERE execution_id=NEW.execution_id;
 SELECT * INTO STRICT e FROM ui_test_executions WHERE id=l.execution_id AND started_at=l.execution_accepted_at;
 IF (owner_version=pg_current_xact_id()::xid AND l.execution_accepted_at=NEW.execution_accepted_at
  AND l.attempt_id IS NULL AND l.admission_id IS NULL
  AND e.observed_admission_receipt IS NULL AND e.revision_id=NEW.revision_id
  AND e.observed_revision_binding->>'attemptId'=NEW.attempt_id::text
  AND studio_publication_hash(e.observed_revision_binding)=NEW.binding_digest
  AND ((NEW.disposition='CLOSED' AND l.state='DONE' AND e.status='ERROR'
    AND l.terminal_error_code=e.error_code AND l.terminal_error_at=e.ended_at
    AND (l.lease_owner=NEW.lease_owner OR l.lease_owner IS NULL)) OR
   (NEW.disposition='REQUEUED' AND l.state='QUEUED' AND l.lease_owner IS NULL AND l.lease_expires_at IS NULL
    AND l.zero_send_decision_attempt_id=NEW.attempt_id
    AND EXISTS(SELECT 1 FROM studio_secret_use_audit decision WHERE decision.execution_id=NEW.execution_id
     AND decision.attempt_id=NEW.attempt_id::text AND decision.decision_stage='DISPATCH' AND decision.outcome='VAULT_UNAVAILABLE')))) IS NOT TRUE THEN
  RAISE EXCEPTION 'observed no-send receipt requires winning atomic owner transition';
 END IF;
 FOR secret IN SELECT jsonb_array_elements_text(NEW.not_entered_ids) LOOP
  IF (SELECT count(*) FROM studio_secret_use_audit usage WHERE usage.execution_id=NEW.execution_id
   AND usage.attempt_id=NEW.attempt_id::text AND usage.secret_id=secret AND usage.row_kind='USAGE'
   AND usage.release_id IS NULL AND usage.usage_outcome='NOT_USED')<>1 THEN
   RAISE EXCEPTION 'observed no-send receipt requires exact unused summary';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

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

CREATE FUNCTION studio_secret_guided_exact_reference(session_key text,scope_key text,step_key text,secret_key text,reference_key text)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT count(*)=1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'configurationReferences') reference
  WHERE m.session_id=session_key AND m.scope_hash=scope_key
   AND m.manifest_hash=studio_publication_hash(m.manifest)
   AND reference->>'referenceId'=reference_key AND length(reference_key) BETWEEN 1 AND 256
   AND reference->>'kind'='secretRef' AND reference->>'referenceName'=secret_key
   AND reference->>'stepId'=step_key AND reference->>'intendedSlot'='fill.value'
   AND NOT(reference ? 'value')
$$;
CREATE FUNCTION studio_secret_guided_input_reference(session_key text,scope_key text,admission_key text)
 RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN count(*)=1 THEN min(input->'provenance'->>'referenceId') ELSE NULL END
 FROM studio_guided_actions a JOIN studio_guided_materializations material ON material.session_id=a.session_id
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
   AND input->>'sourceStepId'=step_key AND input->>'intendedSlot'='fill.value'
   AND studio_secret_guided_input_reference(session_key,scope_key,admission_key) IS NOT NULL)
$$;

CREATE FUNCTION studio_secret_audit_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original studio_secret_use_audit; s studio_guided_sessions; l studio_dispatch_ledger;
 action studio_guided_actions; execution ui_test_executions; actual_reference text;
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
  IF NEW.admission_id IS NOT NULL THEN
   actual_reference:=studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,NEW.admission_id);
   IF actual_reference IS NULL OR (NEW.source_reference_id IS NOT NULL AND NEW.source_reference_id<>actual_reference) THEN
    RAISE EXCEPTION 'secret audit admission source reference declaration lineage invalid';
   END IF;
  END IF;
  IF NEW.decision_stage='DISPATCH' THEN
   IF NEW.attempt_id IS DISTINCT FROM NEW.session_id||':'||(s.document->'owner'->>'fence')
    OR NOT studio_secret_guided_declaration(NEW.session_id,s.scope_hash,NEW.coordinate_step_id,NEW.secret_id)
    OR NOT studio_secret_guided_consumed(NEW.session_id,s.scope_hash,NEW.admission_id,
     NEW.coordinate_step_id,NEW.coordinate_ordinal,NEW.secret_id,NEW.attempt_id)
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit u WHERE u.session_id=NEW.session_id
     AND u.row_kind='USAGE' AND u.release_id IS NULL
     AND ((u.usage_outcome='NOT_USED' AND u.source_reference_id=actual_reference) OR u.admission_id=NEW.admission_id)) THEN
    RAISE EXCEPTION 'secret audit guided release lineage invalid';
   END IF;
  END IF;
  IF NEW.row_kind='USAGE' AND NEW.release_id IS NULL THEN
   IF s.state NOT IN ('FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
    OR NOT studio_secret_guided_declaration(NEW.session_id,s.scope_hash,NEW.coordinate_step_id,NEW.secret_id)
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit decision
     WHERE decision.session_id=NEW.session_id AND decision.secret_id=NEW.secret_id
      AND decision.decision_stage='DISPATCH'
      AND (NEW.usage_outcome<>'NOT_USED' AND decision.admission_id=NEW.admission_id
       OR NEW.usage_outcome='NOT_USED' AND (decision.source_reference_id=NEW.source_reference_id
        OR studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,decision.admission_id)=NEW.source_reference_id))) THEN
    RAISE EXCEPTION 'secret audit no-decision scope or declaration invalid';
   END IF;
   IF NEW.usage_outcome='NOT_USED' THEN
    IF NEW.attempt_id IS DISTINCT FROM NEW.session_id||':'||(s.document->'owner'->>'fence')
     OR NEW.admission_id IS NOT NULL OR NEW.coordinate_ordinal IS NOT NULL OR NEW.release_seq IS NOT NULL
     OR NOT studio_secret_guided_exact_reference(NEW.session_id,s.scope_hash,NEW.coordinate_step_id,NEW.secret_id,NEW.source_reference_id) THEN
     RAISE EXCEPTION 'secret audit unreached declaration identity invalid';
    END IF;
    IF EXISTS(SELECT 1 FROM studio_guided_actions consumed WHERE consumed.session_id=NEW.session_id
      AND (consumed.document->>'dispatchCount')::integer=1
      AND (studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,consumed.admission_id)=NEW.source_reference_id
       OR (consumed.proposal->'operation'->>'kind'='fill' AND consumed.proposal->'operation'->'value'->>'kind'='secretRef'
        AND studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,consumed.admission_id) IS NULL))) THEN
     RAISE EXCEPTION 'secret audit unreached cannot conceal consumed admission';
    END IF;
    IF EXISTS(SELECT 1 FROM studio_secret_use_audit retained WHERE retained.session_id=NEW.session_id
      AND (retained.source_reference_id=NEW.source_reference_id OR
       studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,retained.admission_id)=NEW.source_reference_id)) THEN
     RAISE EXCEPTION 'secret audit duplicate declaring summary';
    END IF;
   ELSE
    IF (NEW.release_seq IS NULL AND NEW.admission_id IS NOT NULL AND (action.document->>'dispatchCount')::integer=1
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
     AND actual_reference IS NOT NULL
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
  IF NEW.row_kind='USAGE' AND NEW.release_id IS NULL THEN
   IF NEW.release_seq IS NOT NULL OR NEW.usage_outcome NOT IN ('NOT_USED','UNKNOWN_OUTCOME')
    OR EXISTS(SELECT 1 FROM studio_secret_use_audit decision WHERE decision.execution_id=NEW.execution_id
     AND decision.attempt_id=NEW.attempt_id AND decision.secret_id=NEW.secret_id AND decision.decision_stage='DISPATCH')
    OR NOT (EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements receipt
      WHERE receipt.execution_id=NEW.execution_id AND receipt.execution_accepted_at=l.execution_accepted_at
       AND receipt.attempt_id::text=NEW.attempt_id AND receipt.revision_id=execution.revision_id
       AND receipt.binding_digest=studio_publication_hash(execution.observed_revision_binding)
       AND ((NEW.usage_outcome='NOT_USED' AND receipt.no_read_ids ? NEW.secret_id)
        OR (NEW.usage_outcome='UNKNOWN_OUTCOME' AND receipt.possible_read_ids ? NEW.secret_id)))
     OR (NEW.usage_outcome='NOT_USED'
      AND NOT EXISTS(SELECT 1 FROM studio_observed_secret_read_entries entry WHERE entry.execution_id=NEW.execution_id
       AND entry.attempt_id::text=NEW.attempt_id AND entry.secret_id=NEW.secret_id)
      AND EXISTS(SELECT 1 FROM studio_observed_no_send_decisions receipt
       WHERE receipt.execution_id=NEW.execution_id AND receipt.execution_accepted_at=l.execution_accepted_at
        AND receipt.attempt_id::text=NEW.attempt_id AND receipt.revision_id=execution.revision_id
        AND receipt.binding_digest=studio_publication_hash(execution.observed_revision_binding)
        AND receipt.not_entered_ids ? NEW.secret_id))) THEN
    RAISE EXCEPTION 'secret audit unlinked replay requires authentic terminal or positive no-send evidence';
   END IF;
  END IF;
  IF NEW.decision_stage='DISPATCH' THEN
   IF EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements cut WHERE cut.execution_id=NEW.execution_id) THEN
    RAISE EXCEPTION 'terminal secret cut fences new release'; END IF;
   IF (execution.observed_revision_binding IS NOT NULL
    AND execution.observed_revision_binding->>'attemptId'=NEW.attempt_id
    AND NOT EXISTS(SELECT 1 FROM studio_secret_use_audit prior WHERE prior.execution_id=NEW.execution_id
     AND prior.attempt_id=NEW.attempt_id AND prior.secret_id=NEW.secret_id AND prior.row_kind='USAGE' AND prior.release_id IS NULL)
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
   WHERE u.session_id=NEW.session_id AND u.source_reference_id=NEW.source_reference_id
    AND u.row_kind='USAGE') THEN RAISE EXCEPTION 'secret audit duplicate declaring summary'; END IF;
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
    original.vault_version,original.attempt_id,original.release_seq,original.coordinate_step_id,original.coordinate_ordinal,original.source_reference_id)
   IS DISTINCT FROM ROW(NEW.path,NEW.execution_id,NEW.session_id,NEW.admission_id,
    NEW.principal_id,NEW.csi_id,NEW.environment,NEW.test_id,NEW.secret_id,
    NEW.vault_version,NEW.attempt_id,NEW.release_seq,NEW.coordinate_step_id,NEW.coordinate_ordinal,NEW.source_reference_id)
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

CREATE TRIGGER tr_observed_read_entry_immutable BEFORE UPDATE OR DELETE ON studio_observed_secret_read_entries
 FOR EACH ROW EXECUTE FUNCTION studio_secret_audit_immutable();
CREATE TRIGGER tr_observed_no_send_immutable BEFORE UPDATE OR DELETE ON studio_observed_no_send_decisions
 FOR EACH ROW EXECUTE FUNCTION studio_secret_audit_immutable();
CREATE TRIGGER tr_observed_read_entry_truncate BEFORE TRUNCATE ON studio_observed_secret_read_entries
 FOR EACH STATEMENT EXECUTE FUNCTION studio_secret_audit_immutable();
CREATE TRIGGER tr_observed_no_send_truncate BEFORE TRUNCATE ON studio_observed_no_send_decisions
 FOR EACH STATEMENT EXECUTE FUNCTION studio_secret_audit_immutable();
REVOKE UPDATE,DELETE,TRUNCATE ON studio_observed_secret_read_entries,studio_observed_no_send_decisions FROM PUBLIC;
CREATE TRIGGER tr_observed_terminal_immutable BEFORE UPDATE OR DELETE ON studio_observed_terminal_secret_settlements
 FOR EACH ROW EXECUTE FUNCTION studio_secret_audit_immutable();
CREATE TRIGGER tr_observed_terminal_truncate BEFORE TRUNCATE ON studio_observed_terminal_secret_settlements
 FOR EACH STATEMENT EXECUTE FUNCTION studio_secret_audit_immutable();
REVOKE UPDATE,DELETE,TRUNCATE ON studio_observed_terminal_secret_settlements FROM PUBLIC;
CREATE FUNCTION studio_secret_install_partition_guards(parent_key text,leaf_key text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE parent_oid regclass; leaf_oid regclass;
BEGIN
 IF parent_key NOT IN ('studio_secret_use_audit','studio_observed_secret_read_entries','studio_observed_no_send_decisions','studio_observed_terminal_secret_settlements')
  OR leaf_key !~ ('^'||parent_key||'_[0-9]{4}_[0-9]{2}$') THEN
  RAISE EXCEPTION 'secret evidence partition family invalid'; END IF;
 parent_oid:=to_regclass(parent_key);leaf_oid:=to_regclass(leaf_key);
 IF leaf_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=leaf_oid AND inhparent=parent_oid) THEN
  RAISE EXCEPTION 'secret evidence partition lineage invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=leaf_oid AND tgname='tr_secret_evidence_leaf_truncate') THEN
  EXECUTE format('CREATE TRIGGER tr_secret_evidence_leaf_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION studio_secret_audit_immutable()',leaf_oid);
 END IF;
 IF parent_key='studio_observed_no_send_decisions' AND NOT EXISTS(
  SELECT 1 FROM pg_trigger WHERE tgrelid=leaf_oid AND tgname='tr_observed_no_send_commit') THEN
  EXECUTE format('CREATE CONSTRAINT TRIGGER tr_observed_no_send_commit AFTER INSERT ON %s DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_observed_no_send_commit_guard()',leaf_oid);
 END IF;
 IF parent_key='studio_observed_terminal_secret_settlements' AND NOT EXISTS(
  SELECT 1 FROM pg_trigger WHERE tgrelid=leaf_oid AND tgname='tr_observed_terminal_commit') THEN
  EXECUTE format('CREATE CONSTRAINT TRIGGER tr_observed_terminal_commit AFTER INSERT ON %s DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_observed_terminal_commit_guard()',leaf_oid);
 END IF;
END $$;

-- No DEFAULT: an append-only audit must never need PartitionManager's DELETE/move.
-- Backend bootstrap extends this family before traffic, with the existing retention window.
DO $$ DECLARE month_start date; i integer; family text; leaf text; BEGIN
 month_start:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
 FOREACH family IN ARRAY ARRAY['studio_secret_use_audit','studio_observed_secret_read_entries','studio_observed_no_send_decisions','studio_observed_terminal_secret_settlements'] LOOP
  FOR i IN 0..2 LOOP
   leaf:=family||'_'||to_char(month_start+(i||' months')::interval,'YYYY_MM');
   EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',leaf,family,
    (month_start+(i||' months')::interval)::date,(month_start+((i+1)||' months')::interval)::date);
   PERFORM studio_secret_install_partition_guards(family,leaf);
  END LOOP;
 END LOOP;
END $$;
COMMENT ON TABLE studio_secret_use_audit IS
 'Safe metadata only; UPDATE/DELETE refused. RELEASE/USAGE lifecycle retention uses release_occurred_at monthly detach/drop.';
COMMENT ON COLUMN studio_secret_use_audit.outcome IS
 'Exact six resolution decisions; NULL only for authentic guided no-decision, positively unattempted replay or scoped entered/no-decision terminal usage.';
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
 SELECT p='{"catalog":"observed-replay-3","playwright":"1.63.0","browserEngine":"chromium","contract":3,"learnedPlan":3,"observation":3,"guidedPolicy":3,"referencePolicy":4,"lowering":2,"artifact":3,"language":"observed-3","executor":"observed-4","publicationEvidence":1,"validationBasis":1,"validator":"observed-2","protocol":3,"replayAuthorization":2}'::jsonb
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
   IF OLD.observed_revision_binding IS NULL OR b IS NULL THEN
    RAISE EXCEPTION 'observed execution identity immutable without owned retry authority';
   END IF;
   SELECT * INTO ledger FROM studio_dispatch_ledger WHERE execution_id=NEW.id FOR UPDATE;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'observed execution identity immutable without owned retry authority';
   END IF;
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

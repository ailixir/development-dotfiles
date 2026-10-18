-- STUDIO-OBS-014: guided governance. Forward-only on top of the frozen V12–V18 baseline
-- (ADR-SC-005 D-B, ARCH.md:123). Authored with V20 as one unit (s0-plan-refresh lanes.D, RK-5).
-- Ruling: docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-3-obs014.json (AR-2 b, c, d, e, h) and
-- PO X6 (po-x6-and-leftovers.json decision1_X6).
--
-- Out of scope by ruling (AR-2 a, stop condition S-1): the execution error vocabulary. This file
-- does not name the V13 execution error-code constraint and adds no execution error code; guided
-- codes are contract vocabulary only and have no DB CHECK.
--
-- Contents:
--   1. Governed observation policy: policies, immutable versions, approvals (approval activates),
--      trigger-only append-only audit, and the start-time session freeze (AR-2 h).
--   2. Per-CSI budget: lock row, monotone UTC-day token counters, live-session index (AR-2 c).
--   3. Retention: pruned_at marker + prune guard, retained-key list, studio_guided_prune_session
--      (AR-2 b), the narrowed attempt guard (AR-2 d) and the narrowed publication guard (AR-2 e).
--
-- Rollback (pre-release, disposable databases only): there is no down migration. Recreate the
-- database and migrate to V18, or restore a pg_dump taken before V19. Do not hand-edit
-- flyway_schema_history. V19 does not rewrite any existing row: it adds tables and one nullable
-- column, and replaces two trigger functions. Every replaced V14/V15 behaviour is kept for every
-- row that is not a pruned, terminal session.

-- ---------------------------------------------------------------------------------------------
-- 1. Governed observation policy (AR-2 h)
-- ---------------------------------------------------------------------------------------------

-- Governed policy document shape: architect C2b spec (docs/qa/evidence/STUDIO-OBSERVED-NEXT/
-- c2b-spec.json governedDocumentKeySet_DLane, normativeSql_replaces_V19_function, verbatim).
-- Keys: schemaVersion (3), allowedOrigins (1..10, session-scope origin pattern, unique),
-- applicationPolicy (closed: policyRuleId, allowStructuralDiscovery = true, readGrants <= 32),
-- sideEffectStance (AR-2 f), destructiveVocabulary (1..64 lowercase, unique, each <= 64 chars).
CREATE OR REPLACE FUNCTION studio_guided_policy_document(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(d)='object'
  AND d ?& ARRAY['schemaVersion','allowedOrigins','applicationPolicy','sideEffectStance','destructiveVocabulary']
  AND d-ARRAY['schemaVersion','allowedOrigins','applicationPolicy','sideEffectStance','destructiveVocabulary']='{}'::jsonb
  AND d->'schemaVersion'='3'::jsonb
  AND octet_length(convert_to(d::text,'UTF8'))<=65536
  AND jsonb_typeof(d->'allowedOrigins')='array' AND jsonb_array_length(d->'allowedOrigins') BETWEEN 1 AND 10
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'allowedOrigins') o
   WHERE jsonb_typeof(o)<>'string' OR length(o#>>'{}')>256
    OR (o#>>'{}') !~ '^https?://(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::[1-9][0-9]{0,4})?$')
  AND (SELECT count(DISTINCT o) FROM jsonb_array_elements(d->'allowedOrigins') o)=jsonb_array_length(d->'allowedOrigins')
  AND jsonb_typeof(d->'applicationPolicy')='object'
  AND (d->'applicationPolicy') ?& ARRAY['policyRuleId','allowStructuralDiscovery','readGrants']
  AND (d->'applicationPolicy')-ARRAY['policyRuleId','allowStructuralDiscovery','readGrants']='{}'::jsonb
  AND d->'applicationPolicy'->'allowStructuralDiscovery'='true'::jsonb
  AND jsonb_typeof(d->'applicationPolicy'->'readGrants')='array'
  AND jsonb_array_length(d->'applicationPolicy'->'readGrants')<=32
  AND d->>'sideEffectStance' IN ('ALLOW','CLARIFY_FIRST','DENY')
  AND jsonb_typeof(d->'destructiveVocabulary')='array'
  AND jsonb_array_length(d->'destructiveVocabulary') BETWEEN 1 AND 64
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'destructiveVocabulary') v
   WHERE jsonb_typeof(v)<>'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 64 OR v#>>'{}'<>lower(v#>>'{}'))
  AND (SELECT count(DISTINCT v) FROM jsonb_array_elements(d->'destructiveVocabulary') v)=jsonb_array_length(d->'destructiveVocabulary')
 ) IS TRUE
$$;

CREATE TABLE studio_guided_policies (
 policy_id uuid PRIMARY KEY,
 csi_id varchar(20) NOT NULL,
 application_id varchar(256) NOT NULL,
 environment_id varchar(256) NOT NULL,
 created_by varchar(256) NOT NULL,
 active_version integer CHECK(active_version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(csi_id,application_id,environment_id)
);

CREATE TABLE studio_guided_policy_versions (
 policy_id uuid NOT NULL REFERENCES studio_guided_policies(policy_id),
 version integer NOT NULL CHECK(version>0),
 document jsonb NOT NULL CHECK(studio_guided_policy_document(document)),
-- Both hashes are witnessed by PostgreSQL at write time (C2b spec, S-5): canonical-v1 via V15's
-- studio_publication_hash, so a Java canonical drift is refused at insert.
 document_hash char(64) NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$') CHECK(document_hash = studio_publication_hash(document)),
 observation_policy_hash char(64) NOT NULL CHECK(observation_policy_hash ~ '^[a-f0-9]{64}$') CHECK(observation_policy_hash = studio_publication_hash(document->'applicationPolicy')),
 created_by varchar(256) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(policy_id,version)
);

CREATE TABLE studio_guided_policy_approvals (
 policy_id uuid NOT NULL,
 version integer NOT NULL,
 approved_by varchar(256) NOT NULL,
 approval_ref varchar(256) NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(policy_id,version),
 FOREIGN KEY(policy_id,version) REFERENCES studio_guided_policy_versions(policy_id,version)
);

CREATE TABLE studio_guided_policy_audit (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 policy_id uuid NOT NULL REFERENCES studio_guided_policies(policy_id),
 version integer,
 event varchar(32) NOT NULL CHECK(event IN ('POLICY_CREATED','VERSION_CREATED','VERSION_APPROVED','VERSION_ACTIVATED')),
 principal_id varchar(256) NOT NULL,
 document_hash char(64),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ix_guided_policy_audit_policy ON studio_guided_policy_audit(policy_id,audit_id);

-- Start-time freeze. Session document, scope and runAuthorization stay untouched (AR-2 h).
CREATE TABLE studio_guided_session_policies (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_sessions(session_id),
 policy_id uuid NOT NULL,
 policy_version integer NOT NULL,
 observation_policy_hash char(64) NOT NULL CHECK(observation_policy_hash ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(policy_id,policy_version) REFERENCES studio_guided_policy_versions(policy_id,version)
);

-- Policies: identity immutable; active_version starts NULL, only increases, only to an approved
-- version; no DELETE.
CREATE FUNCTION studio_guided_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guided policy is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.active_version IS NOT NULL THEN RAISE EXCEPTION 'guided policy activation requires approval'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-'active_version') IS DISTINCT FROM (to_jsonb(OLD)-'active_version') THEN
  RAISE EXCEPTION 'guided policy identity is immutable';
 END IF;
 IF NEW.active_version IS DISTINCT FROM OLD.active_version THEN
  IF NEW.active_version IS NULL OR NEW.active_version<=COALESCE(OLD.active_version,0) THEN
   RAISE EXCEPTION 'guided policy activation cannot regress';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM studio_guided_policy_approvals WHERE policy_id=NEW.policy_id AND version=NEW.active_version) THEN
   RAISE EXCEPTION 'guided policy activation requires approval';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_policies
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_guard();

-- Versions: dense numbering (version = max + 1, serialized on the policy row); immutable.
CREATE FUNCTION studio_guided_policy_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'guided policy version is immutable'; END IF;
 PERFORM 1 FROM studio_guided_policies WHERE policy_id=NEW.policy_id FOR UPDATE;
 IF NEW.version<>(SELECT COALESCE(max(version),0)+1 FROM studio_guided_policy_versions WHERE policy_id=NEW.policy_id) THEN
  RAISE EXCEPTION 'guided policy version sequence invalid';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_policy_version_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_policy_versions
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_version_guard();

-- Approvals: approver is not the version author; never behind the active version; immutable.
CREATE FUNCTION studio_guided_policy_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p studio_guided_policies; v studio_guided_policy_versions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'guided policy approval is immutable'; END IF;
 SELECT * INTO STRICT p FROM studio_guided_policies WHERE policy_id=NEW.policy_id FOR UPDATE;
 SELECT * INTO STRICT v FROM studio_guided_policy_versions WHERE policy_id=NEW.policy_id AND version=NEW.version;
 IF NEW.approved_by=v.created_by THEN RAISE EXCEPTION 'guided policy approver must not be the author'; END IF;
 IF NEW.version<COALESCE(p.active_version,0) THEN RAISE EXCEPTION 'guided policy approval is stale'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_policy_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_policy_approvals
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_approval_guard();

-- Approval implies activation.
CREATE FUNCTION studio_guided_policy_activate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE studio_guided_policies SET active_version=NEW.version WHERE policy_id=NEW.policy_id;
 RETURN NULL;
END $$;
CREATE TRIGGER tr_guided_policy_approval_2_activate AFTER INSERT ON studio_guided_policy_approvals
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_activate();

-- Audit chain: written only from the AFTER triggers below (pg_trigger_depth() >= 2 means the
-- insert comes from inside another trigger), never by application SQL; immutable.
CREATE FUNCTION studio_guided_policy_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'guided policy audit is immutable'; END IF;
 IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'guided policy audit is written by triggers only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_policy_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_policy_audit
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_audit_guard();

CREATE FUNCTION studio_guided_policy_audit_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='studio_guided_policies' AND TG_OP='INSERT' THEN
  INSERT INTO studio_guided_policy_audit(policy_id,version,event,principal_id,document_hash)
   VALUES (NEW.policy_id,NULL,'POLICY_CREATED',NEW.created_by,NULL);
 ELSIF TG_TABLE_NAME='studio_guided_policies' THEN
  IF NEW.active_version IS DISTINCT FROM OLD.active_version THEN
   INSERT INTO studio_guided_policy_audit(policy_id,version,event,principal_id,document_hash)
    SELECT NEW.policy_id,NEW.active_version,'VERSION_ACTIVATED',a.approved_by,v.document_hash
    FROM studio_guided_policy_approvals a
    JOIN studio_guided_policy_versions v USING(policy_id,version)
    WHERE a.policy_id=NEW.policy_id AND a.version=NEW.active_version;
  END IF;
 ELSIF TG_TABLE_NAME='studio_guided_policy_versions' THEN
  INSERT INTO studio_guided_policy_audit(policy_id,version,event,principal_id,document_hash)
   VALUES (NEW.policy_id,NEW.version,'VERSION_CREATED',NEW.created_by,NEW.document_hash);
 ELSE
  INSERT INTO studio_guided_policy_audit(policy_id,version,event,principal_id,document_hash)
   SELECT NEW.policy_id,NEW.version,'VERSION_APPROVED',NEW.approved_by,v.document_hash
   FROM studio_guided_policy_versions v WHERE v.policy_id=NEW.policy_id AND v.version=NEW.version;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER tr_guided_policy_audit AFTER INSERT OR UPDATE ON studio_guided_policies
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_audit_write();
CREATE TRIGGER tr_guided_policy_version_audit AFTER INSERT ON studio_guided_policy_versions
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_audit_write();
-- Named so that it fires before tr_guided_policy_approval_2_activate (same table and timing fire in
-- name order): the chain reads VERSION_APPROVED then VERSION_ACTIVATED.
CREATE TRIGGER tr_guided_policy_approval_1_audit AFTER INSERT ON studio_guided_policy_approvals
 FOR EACH ROW EXECUTE FUNCTION studio_guided_policy_audit_write();

-- Session freeze: only the approved, currently active version of a policy for the session's CSI,
-- with that version's observation hash; immutable.
CREATE FUNCTION studio_guided_session_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p studio_guided_policies; v studio_guided_policy_versions; s studio_guided_sessions;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'guided session policy is immutable'; END IF;
 SELECT * INTO p FROM studio_guided_policies WHERE policy_id=NEW.policy_id FOR SHARE;
 SELECT * INTO v FROM studio_guided_policy_versions WHERE policy_id=NEW.policy_id AND version=NEW.policy_version;
 SELECT * INTO s FROM studio_guided_sessions WHERE session_id=NEW.session_id;
 IF p.policy_id IS NULL OR v.policy_id IS NULL OR s.session_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM studio_guided_policy_approvals WHERE policy_id=NEW.policy_id AND version=NEW.policy_version)
  OR p.active_version IS DISTINCT FROM NEW.policy_version
 THEN RAISE EXCEPTION 'guided session policy is not approved and active'; END IF;
 IF NEW.observation_policy_hash<>v.observation_policy_hash OR s.document->'scope'->>'csiId' IS DISTINCT FROM p.csi_id THEN
  RAISE EXCEPTION 'guided session policy mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_session_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON studio_guided_session_policies
 FOR EACH ROW EXECUTE FUNCTION studio_guided_session_policy_guard();

-- ---------------------------------------------------------------------------------------------
-- 2. Per-CSI budget (AR-2 c). Concurrency is counted under the guard-row lock, never kept as a
-- counter. The token day is (clock_timestamp() AT TIME ZONE 'UTC')::date, computed by the caller's
-- SQL on the DB clock; the verdict is the affected-row count of one conditional UPDATE.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE studio_guided_csi_guards (
 csi_id varchar(20) PRIMARY KEY
);

CREATE TABLE studio_guided_csi_token_days (
 csi_id varchar(20) NOT NULL,
 budget_day date NOT NULL,
 input_tokens bigint NOT NULL DEFAULT 0 CHECK(input_tokens>=0),
 output_tokens bigint NOT NULL DEFAULT 0 CHECK(output_tokens>=0),
 PRIMARY KEY(csi_id,budget_day)
);
CREATE FUNCTION studio_guided_csi_token_day_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guided csi token day is append-only'; END IF;
 IF NEW.csi_id IS DISTINCT FROM OLD.csi_id OR NEW.budget_day IS DISTINCT FROM OLD.budget_day
  OR NEW.input_tokens<OLD.input_tokens OR NEW.output_tokens<OLD.output_tokens THEN
  RAISE EXCEPTION 'guided csi token day is monotone';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_csi_token_day_guard BEFORE UPDATE OR DELETE ON studio_guided_csi_token_days
 FOR EACH ROW EXECUTE FUNCTION studio_guided_csi_token_day_guard();

CREATE INDEX ix_guided_session_live_csi ON studio_guided_sessions((document->'scope'->>'csiId'))
 WHERE state NOT IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED');

-- ---------------------------------------------------------------------------------------------
-- 3. Retention (AR-2 b, d, e; PO X6)
-- ---------------------------------------------------------------------------------------------

-- Single source of the post-prune progress keys (RETAIN-list, fail-closed). Java holds no copy.
CREATE FUNCTION studio_guided_progress_retained_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['stepIndex','errorCode','detail','teardownStatus','publicationRevisionId','publicationRevisionDigest','evidenceRef']::text[]
$$;

ALTER TABLE studio_guided_sessions ADD COLUMN pruned_at timestamptz;
CREATE INDEX ix_guided_session_prune ON studio_guided_sessions(expires_at) WHERE pruned_at IS NULL;

CREATE FUNCTION studio_guided_prune_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.pruned_at IS NOT NULL THEN
  IF NEW.pruned_at IS DISTINCT FROM OLD.pruned_at THEN RAISE EXCEPTION 'guided prune is write-once'; END IF;
  IF (NEW.progress-studio_guided_progress_retained_keys())<>'{}'::jsonb THEN
   RAISE EXCEPTION 'pruned progress cannot regain content';
  END IF;
 ELSIF NEW.pruned_at IS NOT NULL THEN
  IF (OLD.state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
   AND NEW.state=OLD.state AND (NEW.progress-studio_guided_progress_retained_keys())='{}'::jsonb) IS NOT TRUE THEN
   RAISE EXCEPTION 'guided prune requires a terminal session and pruned progress';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_prune_guard BEFORE UPDATE ON studio_guided_sessions
 FOR EACH ROW EXECUTE FUNCTION studio_guided_prune_guard();

-- AR-2 d: the V14 binding tr_guided_attempt_guard stays. A pruned session's attempts accept exactly
-- one change: terminal safe_result non-null -> NULL, every other column (updated_at included)
-- byte-identical. Any other change on a pruned session, a late settlement included, is refused.
-- Unpruned sessions run the V14 body verbatim.
CREATE OR REPLACE FUNCTION studio_guided_translation_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'guided attempt is immutable'; END IF;
 IF EXISTS(SELECT 1 FROM studio_guided_sessions WHERE session_id=OLD.session_id AND pruned_at IS NOT NULL) THEN
  IF OLD.status IN ('APPLIED','REJECTED','SUPERSEDED','UNKNOWN_CALL') AND OLD.safe_result IS NOT NULL
   AND NEW.safe_result IS NULL AND (to_jsonb(NEW)-'safe_result')=(to_jsonb(OLD)-'safe_result') THEN
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'guided attempt is pruned';
 END IF;
 IF (to_jsonb(OLD)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at'])
   IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at'])
   OR (OLD.status NOT IN ('RESERVED','CALLING') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
   OR (OLD.status='CALLING' AND NEW.status='RESERVED') THEN RAISE EXCEPTION 'guided attempt transition refused'; END IF;
 RETURN NEW;
END $$;

-- AR-2 e / PO X6-b: the V15 bindings (BEFORE UPDATE OR DELETE on bases, observations, preparations,
-- admissions, publications; BEFORE DELETE on attempts) stay. The only permitted operation is a
-- DELETE from the three copy tables for a pruned, terminal session that has no publication row.
-- Published sessions (X6-a), bases, attempts and publications stay immutable; UPDATE never passes.
CREATE OR REPLACE FUNCTION studio_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE'
  AND TG_TABLE_NAME IN ('studio_guided_publication_admissions','studio_guided_publication_preparations','studio_guided_publication_observations')
  AND EXISTS(SELECT 1 FROM studio_guided_sessions WHERE session_id=OLD.session_id AND pruned_at IS NOT NULL
   AND state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED'))
  AND NOT EXISTS(SELECT 1 FROM studio_guided_publications WHERE session_id=OLD.session_id) THEN
  RETURN OLD;
 END IF;
 RAISE EXCEPTION 'publication evidence immutable';
END $$;

-- AR-2 b. Every condition is re-judged under the session row lock, on the DB clock. Returns false
-- (and changes nothing) when the session is missing, already pruned, not terminal or inside the
-- window. updated_at on attempts is not touched. Bases and publication attempts are never deleted.
CREATE FUNCTION studio_guided_prune_session(p_session_id varchar, p_window interval) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 IF p_window IS NULL OR p_window<interval '1 hour' THEN RAISE EXCEPTION 'guided prune window invalid'; END IF;
 SELECT * INTO s FROM studio_guided_sessions WHERE session_id=p_session_id FOR UPDATE;
 IF NOT FOUND OR s.pruned_at IS NOT NULL
  OR s.state NOT IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
  OR s.expires_at+p_window>clock_timestamp() THEN
  RETURN false;
 END IF;
 UPDATE studio_guided_sessions
  SET progress=(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(s.progress)
                WHERE key=ANY(studio_guided_progress_retained_keys())),
      pruned_at=clock_timestamp()
  WHERE session_id=p_session_id;
 UPDATE studio_guided_model_attempts SET safe_result=NULL
  WHERE session_id=p_session_id AND status IN ('APPLIED','REJECTED','SUPERSEDED','UNKNOWN_CALL') AND safe_result IS NOT NULL;
 IF NOT EXISTS(SELECT 1 FROM studio_guided_publications WHERE session_id=p_session_id) THEN
  DELETE FROM studio_guided_publication_admissions WHERE session_id=p_session_id;
  DELETE FROM studio_guided_publication_preparations WHERE session_id=p_session_id;
  DELETE FROM studio_guided_publication_observations WHERE session_id=p_session_id;
 END IF;
 RETURN true;
END $$;

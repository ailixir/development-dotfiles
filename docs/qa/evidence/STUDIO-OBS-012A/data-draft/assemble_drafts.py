from pathlib import Path
import re,json,hashlib
ROOT=Path(__file__).parent
M=Path('backend/src/main/resources/db/migration')
def old(v):return next(M.glob(f'V{v}__*.sql')).read_text()
def lines(v,a,b):return '\n'.join(old(v).splitlines()[a-1:b])+'\n'
def write(name,body):
 (ROOT/name).write_text('-- STUDIO-OBS-012A / ADR-SC-005 D-B. ISOLATED T0 DRAFT; not applied.\n-- Fresh baseline after untouched V1–V11; apply only after Lane K+C gate.\n\n'+body.rstrip()+'\n')
V12='''-- Retained observed authoring input identity; no compile job/candidate state.
CREATE TABLE ui_test_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 test_id uuid NOT NULL REFERENCES ui_tests(id),
 csi_id varchar(20) NOT NULL,
 source_revision bigint NOT NULL,
 configuration_revision bigint NOT NULL,
 source jsonb NOT NULL,
 source_hash varchar(64) NOT NULL,
 artifact jsonb NOT NULL,
 artifact_hash varchar(64) NOT NULL,
 artifact_schema_version integer NOT NULL,
 configuration jsonb NOT NULL,
 "references" jsonb NOT NULL,
 provenance jsonb NOT NULL,
 authoring jsonb,
 authoring_revision_inputs jsonb,
 reference_policy jsonb,
 created_by varchar(255) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_by varchar(255) NOT NULL,
 confirmed_at timestamptz NOT NULL,
 confirmation_source varchar(10) NOT NULL,
 CONSTRAINT uq_ui_test_revisions_id_test_csi UNIQUE(id,test_id,csi_id),
 CONSTRAINT ck_ui_test_revisions_confirmation_source CHECK(confirmation_source='GUIDED_RUN'),
 CONSTRAINT ck_ui_test_revisions_authoring CHECK(authoring IS NULL OR (
  authoring->>'authoringSchemaVersion'='2' AND jsonb_typeof(authoring->'steps')='array'
  AND NOT jsonb_path_exists(authoring,'$.** ? (@.source == "observed")')))
);
CREATE INDEX idx_ui_test_revisions_test_created ON ui_test_revisions(test_id,created_at DESC);
CREATE INDEX idx_ui_test_revisions_csi ON ui_test_revisions(csi_id);
-- All revisions are published and already confirmed; immutable includes future columns.
CREATE FUNCTION ui_test_revisions_write_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  RAISE EXCEPTION 'ui_test_revisions is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_ui_test_revisions_write_once BEFORE UPDATE ON ui_test_revisions
 FOR EACH ROW EXECUTE FUNCTION ui_test_revisions_write_once();
ALTER TABLE ui_tests
 ADD COLUMN source_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN configuration_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN confirmed_revision_id uuid REFERENCES ui_test_revisions(id),
 ADD COLUMN quarantined_at timestamptz,
 ADD COLUMN authoring jsonb,
 ADD COLUMN authoring_revision_inputs jsonb,
 ADD CONSTRAINT uq_ui_tests_id_csi UNIQUE(id,csi_id),
 ADD CONSTRAINT ck_ui_tests_authoring CHECK(authoring IS NULL OR (
  authoring->>'authoringSchemaVersion'='2' AND jsonb_typeof(authoring->'steps')='array'
  AND NOT jsonb_path_exists(authoring,'$.** ? (@.source == "observed")')));
-- V1 core drafts retain ownership and source; absent CSI is quarantined, never invented.
'''+lines(12,127,154)+'''
-- Retain the exact current authoring capture used by guided publication.
'''+lines(21,30,43)+'''
'''
# Browser normalization is core-data compatibility, not compile compatibility.
s=old(14);browser=s[s.index('-- 6. Canonical browser'):s.index('-- 7. Partition locators')]
browser=browser.replace('V1 executes','the observed path executes').replace('those drafts are STALE from V12 and cannot execute until they are recompiled and confirmed.','those drafts have no published revision and must be learned before execution.').replace('they remain STALE until recompiled and confirmed','they remain unlearned until a guided publication')
write('V12__tests_revisions.sql',V12+browser)
# Existing history behavior is retained; final constraints appear once.
hist=s[:s.index('-- 6. Canonical browser')]+s[s.index('-- 7. Partition locators'):]
V13=old(13)+'\n'+hist+'\n'+lines(15,37,70)+'\n'+lines(20,82,104).replace('DELETE /v1/runs/{id}','DELETE /v2/runs/{id}')+'\n'+lines(18,183,190)+"    'Immutable FULL acceptance marker; NULL core history has no invented observed provenance.';\n"+lines(28,18,30)+'''
-- Created before V15 observed execution guards; V17 installs audit/retry enforcement.
ALTER TABLE studio_dispatch_ledger
 ADD COLUMN revoked_at timestamptz,
 ADD COLUMN definite_refusal_attempt_id uuid,
 ADD COLUMN zero_send_decision_attempt_id uuid;
ALTER TABLE ui_test_executions ADD CONSTRAINT ck_ui_test_executions_error_code CHECK(
 error_code IS NULL OR error_code IN ('TIMEOUT','DISPATCH_FAILED','DISPATCH_UNKNOWN',
 'START_TIMEOUT','STALE','DISPATCH_DISABLED','AUTHORIZATION_REVOKED','REFERENCE_UNAVAILABLE',
 'CANCELLED','SECRET_TOO_LONG')) NOT VALID;
ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code;
'''
write('V13__executions_ledger.sql',V13)
V14=old(30).replace('-- Observed-1 is additive; no legacy execute, revision or schedule row is changed.','-- One guided contract generation; all existing identity/admission guards retained.').replace("CHECK (state IN (", "CONSTRAINT ck_guided_session_state_v3 CHECK (state IN (").replace("'AWAITING_AUTH',",'')+'\n'+old(31)+'\n'+old(32)+'\n'+lines(34,22,35).replace('ALTER TABLE studio_dispatch_ledger ADD COLUMN revoked_at timestamptz;\n','')
V14=V14.replace('-- Additive observed-2. V30 identity/admission/terminal triggers remain authoritative.','-- Bridge identity/admission/terminal guards remain authoritative.')
write('V14__guided_sessions.sql',V14)
# Build the final publication definitions once, dependency-first.
helpers=lines(33,17,30)+lines(33,43,48)+lines(33,291,298)+lines(34,839,842)+lines(33,302,306)+lines(34,843,861)
epoch='''ALTER TABLE ui_tests ADD COLUMN publication_epoch bigint NOT NULL DEFAULT 0 CHECK(publication_epoch>=0);
CREATE FUNCTION studio_publication_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.confirmed_revision_id IS DISTINCT FROM OLD.confirmed_revision_id THEN
  IF OLD.publication_epoch=9223372036854775807 OR NEW.publication_epoch NOT IN (OLD.publication_epoch,OLD.publication_epoch+1)
  THEN RAISE EXCEPTION 'publication epoch invalid'; END IF;
  NEW.publication_epoch:=OLD.publication_epoch+1;
 ELSIF NEW.publication_epoch IS DISTINCT FROM OLD.publication_epoch THEN RAISE EXCEPTION 'publication epoch immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_studio_publication_epoch BEFORE UPDATE ON ui_tests FOR EACH ROW EXECUTE FUNCTION studio_publication_epoch();
'''
bases=lines(33,49,88).replace("'compileRequestId','candidateRevisionId',",'')
bases='\n'.join(x for x in bases.splitlines() if "NEW.document->>'compileRequestId'" not in x and "NEW.document->>'candidateRevisionId'" not in x)+'\n'
revision='''ALTER TABLE ui_test_revisions
 ADD COLUMN publication_kind varchar(16) NOT NULL,
 ADD COLUMN guided_session_id varchar(256) NOT NULL,
 ADD COLUMN learned_plan_hash char(64) NOT NULL,
 ADD COLUMN revision_digest char(64) NOT NULL,
 ADD CONSTRAINT ck_observed_revision_origin CHECK((
  publication_kind='GUIDED_RUN' AND learned_plan_hash ~ '^[a-f0-9]{64}$'
  AND revision_digest ~ '^[a-f0-9]{64}$' AND artifact_schema_version=3
  AND studio_publication_profile(artifact->'profile') AND confirmation_source='GUIDED_RUN'
  AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) IS TRUE),
 ADD CONSTRAINT uq_observed_revision_pair UNIQUE(guided_session_id,id),
 ADD CONSTRAINT uq_observed_revision_scope UNIQUE(id,test_id,csi_id,guided_session_id),
 ADD CONSTRAINT fk_observed_revision_base FOREIGN KEY(guided_session_id,test_id,csi_id)
  REFERENCES studio_guided_publication_bases(session_id,test_id,csi_id);
CREATE UNIQUE INDEX uq_observed_revision_session ON ui_test_revisions(guided_session_id);
CREATE UNIQUE INDEX uq_observed_revision_digest ON ui_test_revisions(test_id,revision_digest);
'''
V15=helpers+epoch+bases+lines(33,89,179)+lines(34,972,1008)+lines(33,214,214)+revision+lines(33,229,277)+lines(33,290,290)+lines(34,862,971)+lines(33,412,412)+lines(34,1009,1046)+"ALTER TABLE studio_guided_publication_observations ADD CONSTRAINT ck_publication_observation_shape CHECK(studio_publication_observation_shape(observation));\n"+lines(33,450,485)
V15=V15.replace('{"catalog":"observed-replay-3","playwright":"1.63.0","browserEngine":"chromium","contract":3,"learnedPlan":3,"observation":3,"guidedPolicy":3,"referencePolicy":4,"lowering":2,"artifact":3,"language":"observed-3","executor":"observed-4","publicationEvidence":1,"validationBasis":1,"validator":"observed-2","protocol":3,"replayAuthorization":2}', '{"contract":3}')
V15+="""
-- ADR-SC-005 D-D storage only; OBS-015 populates and defines hash composition.
-- Both NULL means no per-step snapshot metadata was recorded. Never synthesize hashes.
ALTER TABLE ui_test_revisions
 ADD COLUMN step_snapshot_hashes jsonb,
 ADD COLUMN step_reuse_provenance jsonb,
 ADD CONSTRAINT ck_observed_revision_step_metadata CHECK(
  (step_snapshot_hashes IS NULL AND step_reuse_provenance IS NULL) OR
  (jsonb_typeof(step_snapshot_hashes)='object' AND jsonb_typeof(step_reuse_provenance)='object'
   AND octet_length(convert_to(step_snapshot_hashes::text,'UTF8'))<=32768
   AND octet_length(convert_to(step_reuse_provenance::text,'UTF8'))<=32768) IS TRUE);
CREATE FUNCTION studio_publication_step_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record; source_step jsonb; source_count integer; hash_count integer;
 uuid_pattern constant text:='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
BEGIN
 IF NEW.step_snapshot_hashes IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(NEW.authoring->'steps') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'step snapshot requires immutable authored steps'; END IF;
 source_count:=jsonb_array_length(NEW.authoring->'steps');
 SELECT count(*) INTO hash_count FROM jsonb_each(NEW.step_snapshot_hashes);
 IF source_count NOT BETWEEN 1 AND 100 OR hash_count<>source_count THEN
  RAISE EXCEPTION 'step snapshot must cover every immutable authored step'; END IF;
 FOR source_step IN SELECT value FROM jsonb_array_elements(NEW.authoring->'steps') LOOP
  IF (source_step->>'id' ~ uuid_pattern AND NEW.step_snapshot_hashes ? (source_step->>'id')) IS NOT TRUE THEN
   RAISE EXCEPTION 'step snapshot authored coordinate mismatch'; END IF;
 END LOOP;
 FOR item IN SELECT key,value FROM jsonb_each(NEW.step_snapshot_hashes) LOOP
  IF (item.key ~ uuid_pattern AND jsonb_typeof(item.value)='string'
   AND item.value#>>'{}' ~ '^[a-f0-9]{64}$'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.authoring->'steps') authored
    WHERE authored->>'id'=item.key)) IS NOT TRUE THEN
   RAISE EXCEPTION 'step snapshot hash shape invalid'; END IF;
 END LOOP;
 FOR item IN SELECT key,value FROM jsonb_each(NEW.step_reuse_provenance) LOOP
  IF (NEW.step_snapshot_hashes ? item.key
   AND studio_publication_closed(item.value,ARRAY['revisionId','stepId'],1024)
   AND studio_publication_strings(item.value,ARRAY['revisionId','stepId'],uuid_pattern)
   AND item.value->>'stepId'=item.key AND item.value->>'revisionId'<>NEW.id::text) IS NOT TRUE THEN
   RAISE EXCEPTION 'step reuse provenance shape invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM ui_test_revisions prior
   WHERE prior.id=(item.value->>'revisionId')::uuid AND prior.test_id=NEW.test_id
    AND prior.csi_id=NEW.csi_id AND prior.publication_kind='GUIDED_RUN'
    AND prior.step_snapshot_hashes->item.key=NEW.step_snapshot_hashes->item.key) THEN
   RAISE EXCEPTION 'step reuse must preserve same-scope published snapshot hash'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
-- Deferred INSERT validation sees the existing authoring-capture trigger's final row.
-- The deny-by-default revision UPDATE guard protects these two columns automatically.
CREATE CONSTRAINT TRIGGER tr_publication_step_metadata_guard AFTER INSERT ON ui_test_revisions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_publication_step_metadata_guard();
COMMENT ON COLUMN ui_test_revisions.step_snapshot_hashes IS 'OBS-015 immutable stable-step UUID to snapshot SHA-256 map; NULL until that story records snapshots.';
COMMENT ON COLUMN ui_test_revisions.step_reuse_provenance IS 'OBS-015 stable-step UUID to reusedFrom {revisionId,stepId}; same test/CSI and identical hash. NULL until snapshot metadata is recorded.';
"""
write('V15__publication.sql',V15)
V16=old(26).replace("'COMPILE_REQUIRED'","'LEARN_REQUIRED'")
start=V16.index('    CONSTRAINT ck_studio_schedule_occurrences_code CHECK (');end=V16.index('    CONSTRAINT ck_studio_schedule_occurrences_misfire',start)
constraint=lines(33,6,16)
constraint=constraint[constraint.index('CHECK ('):].rstrip().removesuffix(';')
V16=V16[:start]+'    CONSTRAINT ck_studio_schedule_occurrences_code '+constraint.replace("'COMPILE_REQUIRED'","'LEARN_REQUIRED'")+',\n'+V16[end:]
write('V16__scheduling.sql',V16)
V17=lines(34,47,838).replace('ALTER TABLE studio_dispatch_ledger ADD COLUMN definite_refusal_attempt_id uuid,\n ADD COLUMN zero_send_decision_attempt_id uuid;\n','')
write('V17__secret_use_audit.sql',V17)
write('V18__drop_plaintext_secrets.sql',old(25))
print(json.dumps({'draft_files':[p.name for p in sorted(ROOT.glob('V*.sql'))],'draft_count':len(list(ROOT.glob('V*.sql'))),'applied':False}))

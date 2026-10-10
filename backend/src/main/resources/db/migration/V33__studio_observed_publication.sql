-- OBS-006: additive publication provenance; no source rewrite, ordinary cutover, or replay rows.

-- Preserve V26's ordinary scheduling vocabulary and ACCEPTED equivalence. The observed
-- family adds a durable refusal, never an unattended execution authorization.
ALTER TABLE studio_schedule_occurrences DROP CONSTRAINT ck_studio_schedule_occurrences_code;
ALTER TABLE studio_schedule_occurrences ADD CONSTRAINT ck_studio_schedule_occurrences_code CHECK (
    code IN ('ACCEPTED', 'COMPILE_REQUIRED', 'ACTIVATION_REVISION_MISMATCH',
        'RUNTIME_INCOMPATIBLE', 'STEP_LIMIT_EXCEEDED', 'TEST_DELETED', 'TEST_QUARANTINED',
        'BACKGROUND_AUTHORIZATION_DENIED', 'REFERENCE_UNAVAILABLE',
        'PENDING_QUOTA_EXCEEDED', 'BACKGROUND_AUTHORIZATION_UNAVAILABLE',
        'VAULT_UNAVAILABLE', 'OVERLAP', 'MISFIRE', 'GRACE_EXPIRED',
        'DISPATCH_DISABLED', 'UNCERTAIN_EXECUTION', 'SCHEDULE_PAUSED',
        'SCHEDULE_UPDATED', 'SCHEDULE_REMOVED', 'OBSERVED_SCHEDULE_AUTH_REQUIRED')
    AND ((decision = 'ACCEPTED') = (code = 'ACCEPTED'))
    AND (code <> 'OBSERVED_SCHEDULE_AUTH_REQUIRED' OR decision = 'REFUSED')
);
CREATE FUNCTION studio_publication_canonical(d jsonb, depth integer DEFAULT 0) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result text;
BEGIN
 IF depth>32 OR d IS NULL THEN RAISE EXCEPTION 'publication canonical bounds'; END IF;
 CASE jsonb_typeof(d)
 WHEN 'object' THEN SELECT '{'||COALESCE(string_agg(to_jsonb(key)::text||':'||studio_publication_canonical(value,depth+1),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(d);
 WHEN 'array' THEN SELECT '['||COALESCE(string_agg(studio_publication_canonical(value,depth+1),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(d) WITH ORDINALITY AS a(value,ordinal);
 WHEN 'number' THEN IF d::text !~ '^-?(0|[1-9][0-9]*)$' OR abs(d::text::numeric)>9007199254740991 THEN RAISE EXCEPTION 'publication canonical number'; END IF; result:=d::text;
 ELSE result:=d::text;
 END CASE;
 RETURN result;
END $$;
CREATE FUNCTION studio_publication_hash(d jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(studio_publication_canonical(d),'UTF8')),'hex') $$;

ALTER TABLE ui_tests ADD COLUMN publication_epoch bigint NOT NULL DEFAULT 0 CHECK(publication_epoch>=0);
CREATE FUNCTION studio_publication_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.compile_request_id,NEW.current_candidate_revision_id,NEW.confirmed_revision_id)
 IS DISTINCT FROM ROW(OLD.compile_request_id,OLD.current_candidate_revision_id,OLD.confirmed_revision_id) THEN
  IF OLD.publication_epoch=9223372036854775807 OR NEW.publication_epoch NOT IN (OLD.publication_epoch,OLD.publication_epoch+1)
  THEN RAISE EXCEPTION 'publication epoch invalid'; END IF;
  NEW.publication_epoch:=OLD.publication_epoch+1;
 ELSIF NEW.publication_epoch IS DISTINCT FROM OLD.publication_epoch THEN RAISE EXCEPTION 'publication epoch immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_studio_publication_epoch BEFORE UPDATE ON ui_tests FOR EACH ROW EXECUTE FUNCTION studio_publication_epoch();
CREATE FUNCTION studio_publication_object(d jsonb, keys text[], max_bytes integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(d)='object' AND d ?& keys AND octet_length(convert_to(d::text,'UTF8'))<=max_bytes) IS TRUE
$$;
CREATE FUNCTION studio_publication_closed(d jsonb, keys text[], max_bytes integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (studio_publication_object(d,keys,max_bytes) AND d-keys='{}'::jsonb) IS TRUE
$$;
CREATE TABLE studio_guided_publication_bases (
 session_id varchar(256) PRIMARY KEY REFERENCES studio_guided_sessions(session_id),
 test_id uuid NOT NULL REFERENCES ui_tests(id), csi_id varchar(20) NOT NULL,
 scope_hash char(64) NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL CHECK(studio_publication_closed(document,ARRAY['sessionId','testId','csiId','resultContractVersion','sourceRevision','configurationRevision','publicationEpoch','compileRequestId','candidateRevisionId','confirmedRevisionId','sourceHash','configurationHash','authoringHash','scopeHash','runAuthorizationHash','sourceManifestHash','originalPrincipalId','runAuthorization','initialContext','replayRequirements','createdAt'],1048576)),
 created_at timestamptz NOT NULL,
 UNIQUE(session_id,test_id,csi_id), UNIQUE(session_id,scope_hash),
 FOREIGN KEY(test_id,csi_id) REFERENCES ui_tests(id,csi_id),
 CHECK((document->>'sessionId'=session_id AND document->>'testId'=test_id::text AND document->>'csiId'=csi_id
  AND document->>'scopeHash'=scope_hash AND document->>'resultContractVersion'='3'
  AND jsonb_typeof(document->'runAuthorization')='object' AND jsonb_typeof(document->'replayRequirements')='object') IS TRUE)
);
CREATE FUNCTION studio_publication_base_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; t ui_tests; m studio_guided_source_manifests;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT t FROM ui_tests WHERE id=NEW.test_id FOR UPDATE;
 SELECT * INTO STRICT m FROM studio_guided_source_manifests WHERE session_id=NEW.session_id;
 IF (studio_publication_strings(NEW.document,ARRAY['sourceHash','configurationHash','authoringHash','scopeHash','runAuthorizationHash','sourceManifestHash'],'^[a-f0-9]{64}$') AND studio_publication_strings(NEW.document,ARRAY['sourceRevision','configurationRevision','publicationEpoch'],'^(0|[1-9][0-9]{0,18})$')) IS NOT TRUE THEN RAISE EXCEPTION 'publication base identity shape invalid'; END IF;
 IF s.state<>'PREPARING' OR s.document->'owner'->>'workerId'<>'unclaimed' OR (s.document->'owner'->>'fence')::bigint<>0
 OR s.test_id<>NEW.test_id::text OR s.principal_id<>NEW.document->>'originalPrincipalId'
 OR s.scope_hash<>NEW.scope_hash OR s.document->'scope'->>'csiId'<>NEW.csi_id
 OR NEW.document->'runAuthorization' IS DISTINCT FROM s.document->'runAuthorization'
 OR NEW.document->>'runAuthorizationHash' IS DISTINCT FROM studio_publication_hash(s.document->'runAuthorization')
 OR m.manifest_hash IS DISTINCT FROM studio_publication_hash(m.manifest)
 OR NEW.document->>'sourceManifestHash' IS DISTINCT FROM studio_publication_hash(m.manifest-'configurationValues')
 OR (NEW.document->>'sourceRevision')::bigint<>t.source_revision
 OR (NEW.document->>'configurationRevision')::bigint<>t.configuration_revision
 OR (NEW.document->>'publicationEpoch')::bigint<>t.publication_epoch
 OR NULLIF(NEW.document->>'compileRequestId','')::uuid IS DISTINCT FROM t.compile_request_id
 OR NULLIF(NEW.document->>'candidateRevisionId','')::uuid IS DISTINCT FROM t.current_candidate_revision_id
 OR NULLIF(NEW.document->>'confirmedRevisionId','')::uuid IS DISTINCT FROM t.confirmed_revision_id
 OR EXISTS(SELECT 1 FROM studio_guided_assignments WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_materializations WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_actions WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=NEW.session_id)
 THEN RAISE EXCEPTION 'publication base is not pre-effect current source'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_publication_base_guard BEFORE INSERT ON studio_guided_publication_bases FOR EACH ROW EXECUTE FUNCTION studio_publication_base_guard();
CREATE TABLE studio_guided_publication_observations (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_publication_bases(session_id),
 observation_hash char(64) NOT NULL CHECK(observation_hash ~ '^[a-f0-9]{64}$'),
 context_id varchar(256) NOT NULL, owner_fence integer NOT NULL CHECK(owner_fence>0),
 document_id varchar(256) NOT NULL CHECK(document_id<>''), generation integer NOT NULL CHECK(generation>=0),
 observation jsonb NOT NULL CHECK(studio_publication_closed(observation,ARRAY['schemaVersion','sessionId','documentId','generation','origin','scopeHash','observedAt','coverage','nodes'],32768)),
 captured_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,observation_hash),
 FOREIGN KEY(session_id,context_id,owner_fence) REFERENCES studio_guided_materializations(session_id,context_id,owner_fence),
 CHECK((observation->>'documentId'=document_id AND (observation->>'generation')::integer=generation AND jsonb_typeof(observation->'nodes')='array') IS TRUE)
);
CREATE TABLE studio_guided_publication_preparations (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_publication_bases(session_id), preparation_id varchar(256) NOT NULL,
 context_id varchar(256) NOT NULL, owner_fence integer NOT NULL CHECK(owner_fence>0), request_digest char(64) NOT NULL,
 evidence_hash char(64) NOT NULL, inputs_hash char(64) NOT NULL, materialization_revision integer NOT NULL CHECK(materialization_revision>0),
 source_manifest_hash char(64) NOT NULL, observation_hash char(64), execution_evidence jsonb NOT NULL,
 proposal jsonb NOT NULL, proof jsonb NOT NULL, captured_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,preparation_id),
 FOREIGN KEY(session_id,preparation_id) REFERENCES studio_guided_preparations(session_id,preparation_id),
 FOREIGN KEY(session_id,observation_hash) REFERENCES studio_guided_publication_observations(session_id,observation_hash),
 CHECK((studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt'],16384)
  AND studio_publication_closed(proposal,ARRAY['schemaVersion','sessionId','coordinate','scopeHash','generation','target','operation','executionEvidence','evidenceHash','authoredInputsHash','contextRevision'],16384)
  AND studio_publication_object(execution_evidence,ARRAY['kind','documentId','generation'],16384)
  AND proof->>'preparationId'=preparation_id AND proof->>'sessionId'=session_id AND proof->>'contextId'=context_id
  AND (proof->>'ownerFence')::integer=owner_fence AND proof->>'requestDigest'=request_digest
  AND proof->>'evidenceHash'=evidence_hash AND proof->>'authoredInputsHash'=inputs_hash
  AND proposal->'executionEvidence'=execution_evidence AND proposal->>'evidenceHash'=evidence_hash
  AND (observation_hash IS NULL)=(execution_evidence->>'kind'='initialBlank')
  AND jsonb_typeof(proposal->'target')='object'
  AND (execution_evidence->>'kind'<>'initialBlank' OR (proposal->'target'->>'kind'='page'
    AND proposal->'target'->>'documentId'=execution_evidence->>'documentId'
    AND proposal->'target'->>'generation'='0' AND proposal->'operation'->>'kind'='navigate'))
  AND octet_length(convert_to((jsonb_build_array(execution_evidence,proposal,proof))::text,'UTF8'))<=16384) IS TRUE)
);
CREATE TABLE studio_guided_publication_admissions (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_publication_bases(session_id), admission_id varchar(256) NOT NULL,
 preparation_id varchar(256) NOT NULL, obligation_id varchar(256) NOT NULL, proposal_hash char(64) NOT NULL,
 captured_at timestamptz NOT NULL, PRIMARY KEY(session_id,admission_id), UNIQUE(session_id,preparation_id), UNIQUE(session_id,obligation_id),
 FOREIGN KEY(session_id,admission_id) REFERENCES studio_guided_actions(session_id,admission_id),
 FOREIGN KEY(session_id,preparation_id) REFERENCES studio_guided_publication_preparations(session_id,preparation_id),
 FOREIGN KEY(session_id,obligation_id) REFERENCES studio_guided_obligation_admissions(session_id,obligation_id)
);
CREATE FUNCTION studio_publication_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; n bigint; b bigint; p studio_guided_preparations; a studio_guided_actions; o studio_guided_obligation_admissions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF s.state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED','FINALIZING')
 OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'publication evidence capture is closed'; END IF;
 IF TG_TABLE_NAME='studio_guided_publication_observations' THEN
  SELECT count(*),COALESCE(sum(octet_length(convert_to(observation::text,'UTF8'))),0) INTO n,b FROM studio_guided_publication_observations WHERE session_id=NEW.session_id;
  IF n>=400 OR b+octet_length(convert_to(NEW.observation::text,'UTF8'))>1048576 THEN RAISE EXCEPTION 'publication evidence limit'; END IF;
  IF NEW.observation IS DISTINCT FROM s.progress->'observation' OR NEW.observation_hash<>studio_publication_hash(NEW.observation) THEN RAISE EXCEPTION 'publication observation is not current'; END IF;
 ELSIF TG_TABLE_NAME='studio_guided_publication_preparations' THEN
  SELECT * INTO STRICT p FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
  IF NEW.request_digest<>studio_publication_hash(NEW.proposal) OR NEW.evidence_hash<>studio_publication_hash(NEW.execution_evidence) OR p.proof IS DISTINCT FROM NEW.proof OR p.request_digest<>NEW.request_digest OR p.context_id<>NEW.context_id OR p.owner_fence<>NEW.owner_fence
   OR NEW.execution_evidence IS DISTINCT FROM s.progress->'executionEvidence'
  THEN RAISE EXCEPTION 'publication preparation mismatch'; END IF;
  SELECT count(*),COALESCE(sum(octet_length(convert_to(jsonb_build_array(execution_evidence,proposal,proof)::text,'UTF8'))),0) INTO n,b FROM studio_guided_publication_preparations WHERE session_id=NEW.session_id;
  IF n>=400 OR b+octet_length(convert_to(jsonb_build_array(NEW.execution_evidence,NEW.proposal,NEW.proof)::text,'UTF8'))>2097152 THEN RAISE EXCEPTION 'publication preparation limit'; END IF;
 ELSE
  SELECT * INTO STRICT a FROM studio_guided_actions WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
  SELECT * INTO STRICT o FROM studio_guided_obligation_admissions WHERE session_id=NEW.session_id AND obligation_id=NEW.obligation_id;
  SELECT * INTO STRICT p FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
  IF NEW.proposal_hash<>studio_publication_hash(a.proposal) OR a.document->>'operationHash' IS DISTINCT FROM studio_publication_hash(jsonb_build_object('coordinate',a.proposal->'coordinate','origin',a.proposal->'executionEvidence'->'origin','locator',COALESCE(a.proposal->'target'->'locator','null'::jsonb),'operation',a.proposal->'operation')) OR a.document->>'preparationId' IS DISTINCT FROM NEW.preparation_id OR a.document->>'requestDigest' IS DISTINCT FROM NEW.proposal_hash
   OR o.admission_id IS DISTINCT FROM NEW.admission_id OR o.proposal_digest<>NEW.proposal_hash OR p.admission_id IS DISTINCT FROM NEW.admission_id
  THEN RAISE EXCEPTION 'publication admission mismatch'; END IF;
  SELECT count(*) INTO n FROM studio_guided_publication_admissions WHERE session_id=NEW.session_id;
  IF n>=200 THEN RAISE EXCEPTION 'publication admission limit'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_publication_observation_guard BEFORE INSERT ON studio_guided_publication_observations FOR EACH ROW EXECUTE FUNCTION studio_publication_evidence_guard();
CREATE TRIGGER tr_publication_preparation_guard BEFORE INSERT ON studio_guided_publication_preparations FOR EACH ROW EXECUTE FUNCTION studio_publication_evidence_guard();
CREATE TRIGGER tr_publication_admission_guard BEFORE INSERT ON studio_guided_publication_admissions FOR EACH ROW EXECUTE FUNCTION studio_publication_evidence_guard();
CREATE TABLE studio_guided_publication_attempts (
 session_id varchar(256) NOT NULL REFERENCES studio_guided_publication_bases(session_id), attempt_id uuid NOT NULL UNIQUE,
 attempt_number smallint NOT NULL CHECK(attempt_number BETWEEN 1 AND 3), claim_id uuid NOT NULL UNIQUE,
 finalize_key varchar(256) NOT NULL CHECK(finalize_key<>''), finalize_digest char(64) NOT NULL CHECK(finalize_digest ~ '^[a-f0-9]{64}$'),
 snapshot_hash char(64) NOT NULL, basis_hash char(64) NOT NULL, identity jsonb NOT NULL,
 validation_deadline timestamptz NOT NULL, status varchar(16) NOT NULL CHECK(status IN ('RESERVED','VALIDATING','VALIDATED','REJECTED','SUPERSEDED','UNKNOWN')),
 created_at timestamptz NOT NULL, claimed_at timestamptz, completed_at timestamptz, validator_receipt jsonb, failure_code varchar(64),
 PRIMARY KEY(session_id,attempt_id), UNIQUE(session_id,attempt_number), UNIQUE(session_id,attempt_id,claim_id,snapshot_hash,basis_hash),
 CHECK((studio_publication_closed(identity,ARRAY['base','ownerWorkerId','ownerFence','validationDeadline','translationHash','basisHash','learnedPlanHash','artifactHash','referencePolicyHash','operationEquivalenceHash','publicationEvidenceHash','profileHash','validationBuildHash','snapshotHash','finalizeKey','finalizeDigest'],65536)
  AND identity->>'snapshotHash'=snapshot_hash AND identity->>'basisHash'=basis_hash AND identity->>'finalizeKey'=finalize_key AND identity->>'finalizeDigest'=finalize_digest
  AND (identity->>'validationDeadline')::timestamptz=validation_deadline) IS TRUE),
 CHECK((status='RESERVED' AND claimed_at IS NULL AND completed_at IS NULL AND validator_receipt IS NULL AND failure_code IS NULL)
 OR(status='VALIDATING' AND claimed_at IS NOT NULL AND completed_at IS NULL AND validator_receipt IS NULL AND failure_code IS NULL)
 OR(status='VALIDATED' AND claimed_at IS NOT NULL AND completed_at IS NOT NULL AND validator_receipt IS NOT NULL AND failure_code IS NULL)
 OR(status IN ('REJECTED','SUPERSEDED','UNKNOWN') AND completed_at IS NOT NULL AND validator_receipt IS NULL AND failure_code IS NOT NULL))
);
CREATE UNIQUE INDEX uq_publication_live_claim ON studio_guided_publication_attempts(session_id) WHERE status IN ('RESERVED','VALIDATING');
CREATE FUNCTION studio_publication_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  AND NEW.validator_receipt->'schemaVersion'='2'::jsonb AND studio_publication_strings(NEW.validator_receipt,ARRAY['admissionProvenanceHash'],'^[a-f0-9]{64}$')
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
CREATE TRIGGER tr_publication_attempt_guard BEFORE INSERT OR UPDATE ON studio_guided_publication_attempts FOR EACH ROW EXECUTE FUNCTION studio_publication_attempt_guard();
ALTER TABLE ui_test_revisions ADD COLUMN publication_kind varchar(16), ADD COLUMN guided_session_id varchar(256),
 ADD COLUMN learned_plan_hash char(64), ADD COLUMN revision_digest char(64),
 ADD CONSTRAINT ck_observed_revision_origin CHECK((
  (publication_kind IS NULL AND guided_session_id IS NULL AND learned_plan_hash IS NULL AND revision_digest IS NULL AND confirmation_source IS DISTINCT FROM 'GUIDED_RUN')
  OR(publication_kind='GUIDED_RUN' AND guided_session_id IS NOT NULL AND compile_request_id IS NULL
   AND learned_plan_hash ~ '^[a-f0-9]{64}$' AND revision_digest ~ '^[a-f0-9]{64}$' AND artifact_schema_version=2
   AND confirmation_source='GUIDED_RUN' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)) IS TRUE),
 ADD CONSTRAINT uq_observed_revision_pair UNIQUE(guided_session_id,id),
 ADD CONSTRAINT uq_observed_revision_scope UNIQUE(id,test_id,csi_id,guided_session_id),
 ADD CONSTRAINT fk_observed_revision_base FOREIGN KEY(guided_session_id,test_id,csi_id) REFERENCES studio_guided_publication_bases(session_id,test_id,csi_id);
ALTER TABLE ui_test_revisions DROP CONSTRAINT ck_ui_test_revisions_confirmation_source;
ALTER TABLE ui_test_revisions ADD CONSTRAINT ck_ui_test_revisions_confirmation_source CHECK(confirmation_source IS NULL OR (confirmation_source IN ('RUN','MANUAL','GUIDED_RUN') AND confirmed_by IS NOT NULL));
CREATE UNIQUE INDEX uq_observed_revision_session ON ui_test_revisions(guided_session_id) WHERE publication_kind='GUIDED_RUN';
CREATE UNIQUE INDEX uq_observed_revision_digest ON ui_test_revisions(test_id,revision_digest) WHERE publication_kind='GUIDED_RUN';
CREATE TABLE studio_guided_publications (
 session_id varchar(256) PRIMARY KEY, revision_id uuid NOT NULL UNIQUE, test_id uuid NOT NULL, csi_id varchar(20) NOT NULL,
 attempt_id uuid NOT NULL, claim_id uuid NOT NULL, snapshot_hash char(64) NOT NULL, basis_hash char(64) NOT NULL,
 document jsonb NOT NULL CHECK(studio_publication_closed(document,ARRAY['sessionId','revisionId','testId','csiId','originalPrincipalId','finalizeKey','finalizeDigest','attemptId','claimId','snapshotHash','basisHash','learnedPlanHash','artifactHash','referencePolicyHash','operationEquivalenceHash','admissionProvenanceHash','publicationEvidenceHash','revisionDigest','profileHash','publishedAt','publicReceipt'],2097152)),
 learned_plan jsonb NOT NULL CHECK(jsonb_typeof(learned_plan)='object'), published_at timestamptz NOT NULL,
 UNIQUE(session_id,revision_id),
 FOREIGN KEY(session_id,test_id,csi_id) REFERENCES studio_guided_publication_bases(session_id,test_id,csi_id),
 FOREIGN KEY(revision_id,test_id,csi_id,session_id) REFERENCES ui_test_revisions(id,test_id,csi_id,guided_session_id),
 FOREIGN KEY(session_id,attempt_id,claim_id,snapshot_hash,basis_hash) REFERENCES studio_guided_publication_attempts(session_id,attempt_id,claim_id,snapshot_hash,basis_hash),
 CHECK((document->>'sessionId'=session_id AND document->>'revisionId'=revision_id::text AND document->>'testId'=test_id::text
  AND document->>'csiId'=csi_id AND document->>'attemptId'=attempt_id::text AND document->>'claimId'=claim_id::text
  AND document->>'snapshotHash'=snapshot_hash AND document->>'basisHash'=basis_hash) IS TRUE)
);
ALTER TABLE ui_test_revisions ADD CONSTRAINT fk_observed_revision_receipt FOREIGN KEY(guided_session_id,id) REFERENCES studio_guided_publications(session_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION studio_publication_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a studio_guided_publication_attempts; r ui_test_revisions; b studio_guided_publication_bases;
BEGIN
 SELECT * INTO STRICT a FROM studio_guided_publication_attempts WHERE session_id=NEW.session_id AND attempt_id=NEW.attempt_id;
 SELECT * INTO STRICT r FROM ui_test_revisions WHERE id=NEW.revision_id;
 SELECT * INTO STRICT b FROM studio_guided_publication_bases WHERE session_id=NEW.session_id;
 IF (studio_publication_strings(NEW.document,ARRAY['snapshotHash','basisHash','learnedPlanHash','artifactHash','referencePolicyHash','operationEquivalenceHash','admissionProvenanceHash','publicationEvidenceHash','revisionDigest','profileHash'],'^[a-f0-9]{64}$') AND studio_publication_strings(NEW.document,ARRAY['originalPrincipalId','finalizeKey','finalizeDigest','publishedAt'])
 AND studio_publication_closed(NEW.document->'publicReceipt',ARRAY['schemaVersion','sessionId','revisionId','revisionDigest','learnedPlanHash','artifactHash','publicationEvidenceHash','publishedAt','learnedFromThisRun','replayVerified'],32768)
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
CREATE CONSTRAINT TRIGGER tr_publication_receipt_guard AFTER INSERT ON studio_guided_publications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION studio_publication_receipt_guard();
-- Every newly added provenance row is append-only, except the explicitly fenced claim transition.
CREATE FUNCTION studio_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'publication evidence immutable'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['studio_guided_publication_bases','studio_guided_publication_observations','studio_guided_publication_preparations','studio_guided_publication_admissions','studio_guided_publications'] LOOP
 EXECUTE format('CREATE TRIGGER tr_publication_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION studio_publication_immutable()',t);
 END LOOP;
END $$;
CREATE TRIGGER tr_publication_attempt_delete BEFORE DELETE ON studio_guided_publication_attempts FOR EACH ROW EXECUTE FUNCTION studio_publication_immutable();
-- Preserve optional V19 capability, including deployments that installed the original staged file.
DO $$ DECLARE installed boolean; function_exists boolean; BEGIN
 SELECT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='ui_test_revisions'::regclass AND t.tgname='trg_ui_test_revision_require_request' AND NOT t.tgisinternal AND t.tgenabled<>'D' AND p.proname='studio_inference_require_request') INTO installed;
 SELECT to_regprocedure('studio_inference_require_request()') IS NOT NULL INTO function_exists;
 IF installed<>function_exists OR (NOT installed AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='ui_test_revisions'::regclass AND tgname='trg_ui_test_revision_require_request')) THEN RAISE EXCEPTION 'inconsistent inference cutover capability'; END IF;
 IF installed THEN
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION studio_inference_require_request() RETURNS trigger LANGUAGE plpgsql AS $body$
   BEGIN IF NEW.compile_request_id IS NULL AND NEW.publication_kind IS DISTINCT FROM 'GUIDED_RUN' THEN RAISE EXCEPTION 'new ordinary candidate requires immutable compile request after V19'; END IF; RETURN NEW; END $body$ $ddl$;
 ELSE
  DROP INDEX uq_ui_test_revisions_identity;
  CREATE UNIQUE INDEX uq_ui_test_revisions_identity ON ui_test_revisions(test_id,source_revision,configuration_revision,artifact_hash,COALESCE(expected_intent::text,''),COALESCE(reference_policy::text,''),COALESCE(intent_derivation_version,'')) WHERE publication_kind IS NULL;
 END IF;
END $$;
ALTER TABLE ui_test_executions ADD COLUMN observed_revision_binding jsonb, ADD COLUMN observed_admission_receipt jsonb;
CREATE FUNCTION studio_publication_strings(d jsonb, names text[], pattern text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY names LOOP
  IF (jsonb_typeof(d->k)='string' AND length(d->>k) BETWEEN 1 AND 256 AND octet_length(convert_to(d->>k,'UTF8'))<=1024
    AND (pattern IS NULL OR d->>k ~ pattern)) IS NOT TRUE THEN RETURN false; END IF;
 END LOOP; RETURN true;
END $$;
CREATE FUNCTION studio_publication_profile(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT p='{"catalog":"observed-replay-1","playwright":"1.63.0","browserEngine":"chromium","contract":2,"learnedPlan":2,"observation":2,"guidedPolicy":2,"referencePolicy":3,"lowering":1,"artifact":2,"language":"observed-2","executor":"observed-2","publicationEvidence":1,"validationBasis":1,"validator":"observed-1","protocol":2,"replayAuthorization":1,"accountAbi":1}'::jsonb
$$;
CREATE FUNCTION studio_publication_build(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (studio_publication_closed(p,ARRAY['profileHash','schemaBundleHash','referenceBundleHash','executableImageDigest','chromiumBuild'],8192)
 AND studio_publication_strings(p,ARRAY['profileHash','schemaBundleHash','referenceBundleHash','executableImageDigest'],'^[a-f0-9]{64}$')
 AND studio_publication_strings(p,ARRAY['chromiumBuild'])) IS TRUE
$$;
CREATE FUNCTION studio_publication_scope(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF (studio_publication_closed(p,ARRAY['principalId','csiId','environment','applicationId','accountRef','allowedOrigins','capabilities','policyId','policyVersion','entryPolicyId','initialContext'],32768)
 AND studio_publication_strings(p,ARRAY['principalId','csiId','environment','applicationId','accountRef','policyId','policyVersion','entryPolicyId'])
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
CREATE FUNCTION studio_observed_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; g jsonb; a jsonb; q jsonb; receipt jsonb; r ui_test_revisions; published studio_guided_publications; ledger studio_dispatch_ledger;
 uuid_pattern constant text:='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
 hash_pattern constant text:='^[a-f0-9]{64}$';
 time_pattern constant text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$';
 first_receipt boolean;
BEGIN
 b:=NEW.observed_revision_binding;receipt:=NEW.observed_admission_receipt;
 IF TG_OP='UPDATE' THEN
  IF b IS DISTINCT FROM OLD.observed_revision_binding OR (OLD.observed_admission_receipt IS NOT NULL AND receipt IS DISTINCT FROM OLD.observed_admission_receipt)
  THEN RAISE EXCEPTION 'observed execution identity immutable'; END IF;
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
 IF (studio_publication_closed(b,ARRAY['version','executionId','startedAt','attemptId','revisionId','revisionDigest','testId','csiId','principalId','environment','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','requiredProfile','requiredBuild','scope','scopeHash','currentPolicyHash','replayGrant','accountAuthorization'],32768)
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
 g:=b->'replayGrant';a:=b->'accountAuthorization';
 IF (studio_publication_closed(g,ARRAY['version','grantId','executionId','attemptId','revisionId','revisionDigest','principalId','csiId','scopeHash','profileHash','buildHash','currentPolicyHash','accountGrantId','issuedAt','expiresAt'],8192)
  AND studio_publication_closed(a,ARRAY['version','grantId','providerId','executionId','attemptId','revisionDigest','scope','scopeHash','issuedAt','expiresAt'],8192)
  AND g->'version'='1'::jsonb AND a->'version'='1'::jsonb
  AND studio_publication_strings(g,ARRAY['grantId','executionId','attemptId','revisionId','accountGrantId'],uuid_pattern)
  AND studio_publication_strings(a,ARRAY['grantId','executionId','attemptId'],uuid_pattern)
  AND studio_publication_strings(g,ARRAY['revisionDigest','scopeHash','profileHash','buildHash','currentPolicyHash'],hash_pattern)
  AND studio_publication_strings(a,ARRAY['revisionDigest','scopeHash'],hash_pattern)
  AND studio_publication_strings(g,ARRAY['principalId','csiId']) AND studio_publication_strings(a,ARRAY['providerId'])
  AND studio_publication_strings(g,ARRAY['issuedAt','expiresAt'],time_pattern) AND studio_publication_strings(a,ARRAY['issuedAt','expiresAt'],time_pattern)
  AND g->'executionId'=b->'executionId' AND g->'attemptId'=b->'attemptId' AND g->'revisionId'=b->'revisionId' AND g->'revisionDigest'=b->'revisionDigest'
  AND g->'principalId'=b->'principalId' AND g->'csiId'=b->'csiId' AND g->'scopeHash'=b->'scopeHash' AND g->'currentPolicyHash'=b->'currentPolicyHash'
  AND g->>'profileHash'=studio_publication_hash(b->'requiredProfile') AND g->>'buildHash'=studio_publication_hash(b->'requiredBuild')
  AND g->'accountGrantId'=a->'grantId' AND a->'scope'=b->'scope' AND a->'scopeHash'=b->'scopeHash'
  AND a->'executionId'=b->'executionId' AND a->'attemptId'=b->'attemptId' AND a->'revisionDigest'=b->'revisionDigest'
  AND (g->>'issuedAt')::timestamptz<=(g->>'expiresAt')::timestamptz AND (g->>'expiresAt')::timestamptz<=(g->>'issuedAt')::timestamptz+interval '30 seconds'
  AND (a->>'issuedAt')::timestamptz<=(g->>'issuedAt')::timestamptz AND (g->>'expiresAt')::timestamptz<=(a->>'expiresAt')::timestamptz) IS NOT TRUE
 THEN RAISE EXCEPTION 'observed execution grant invalid'; END IF;
 IF TG_OP='INSERT' AND ((g->>'expiresAt')::timestamptz<=clock_timestamp() OR (g->>'issuedAt')::timestamptz>clock_timestamp()) THEN RAISE EXCEPTION 'observed execution grant expired'; END IF;
 IF receipt IS NOT NULL THEN
  q:=receipt->'request';
  IF (studio_publication_closed(receipt,ARRAY['schemaVersion','kind','admissionId','request','admittedAt','startDeadlineAt','runDeadlineAt'],16384)
   AND receipt->'schemaVersion'='2'::jsonb AND receipt->>'kind'='observed'
   AND studio_publication_strings(receipt,ARRAY['admissionId'],uuid_pattern)
   AND studio_publication_strings(receipt,ARRAY['admittedAt','startDeadlineAt','runDeadlineAt'],time_pattern)
   AND studio_publication_closed(q,ARRAY['schemaVersion','kind','executionId','startedAt','attemptId','runnerInstanceId','admissionId','revisionId','revisionDigest','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','scopeHash','currentPolicyHash','grantId','accountGrantId','profile','build'],16384)
   AND q->'schemaVersion'='2'::jsonb AND q->>'kind'='observed' AND studio_publication_strings(q,ARRAY['runnerInstanceId'])
   AND q->'admissionId'=receipt->'admissionId' AND q->'executionId'=b->'executionId' AND q->'startedAt'=b->'startedAt' AND q->'attemptId'=b->'attemptId'
   AND q->'revisionId'=b->'revisionId' AND q->'revisionDigest'=b->'revisionDigest' AND q->'artifactHash'=b->'artifactHash' AND q->'configurationHash'=b->'configurationHash'
   AND q->'learnedPlanHash'=b->'learnedPlanHash' AND q->'referencePolicyHash'=b->'referencePolicyHash' AND q->'publicationEvidenceHash'=b->'publicationEvidenceHash'
   AND q->'scopeHash'=b->'scopeHash' AND q->'currentPolicyHash'=b->'currentPolicyHash' AND q->'grantId'=g->'grantId' AND q->'accountGrantId'=a->'grantId'
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
CREATE TRIGGER tr_studio_observed_execution_guard BEFORE INSERT OR UPDATE ON ui_test_executions FOR EACH ROW EXECUTE FUNCTION studio_observed_execution_guard();
CREATE FUNCTION studio_publication_observation_shape(o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n jsonb; l jsonb; v jsonb; k text;
BEGIN
 IF (o->'schemaVersion'='2'::jsonb AND studio_publication_strings(o,ARRAY['sessionId','documentId','origin','scopeHash','observedAt'])
  AND jsonb_typeof(o->'generation')='number' AND (o->>'generation')::bigint BETWEEN 0 AND 2147483647
  AND jsonb_typeof(o->'nodes')='array' AND jsonb_array_length(o->'nodes')<=500
  AND studio_publication_closed(o->'coverage',ARRAY['mode','complete','truncated','withheldRegions','reason'],1024)
  AND o->'coverage'->>'mode' IN ('semantic','boundedDom') AND jsonb_typeof(o->'coverage'->'complete')='boolean'
  AND jsonb_typeof(o->'coverage'->'truncated')='boolean' AND jsonb_typeof(o->'coverage'->'withheldRegions')='number'
  AND (o->'coverage'->>'withheldRegions')::bigint BETWEEN 0 AND 2147483647 AND o->'coverage'->>'reason' IN ('complete','budget','sensitivity','unsupportedSurface')) IS NOT TRUE THEN RETURN false; END IF;
 IF (SELECT count(*)<>count(DISTINCT value->>'nodeId') FROM jsonb_array_elements(o->'nodes')) THEN RETURN false; END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(o->'nodes') LOOP
  IF (studio_publication_closed(n,ARRAY['nodeId','documentId','generation','role','name','elementType','controlType','classification','policyRuleId','visible','actionable','depth','parentNodeId','regionId','formId','labelNodeIds','locatorHints'],16384)
   AND studio_publication_strings(n,ARRAY['nodeId','documentId','role']) AND jsonb_typeof(n->'name')='string' AND length(n->>'name') BETWEEN 1 AND 256
   AND n->'documentId'=o->'documentId' AND n->'generation'=o->'generation'
   AND n->>'elementType' IN ('button','input','textarea','select','text','link','other')
   AND n->>'controlType' IN ('none','text','search','email','tel','url','textarea','password','hidden','other')
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
ALTER TABLE studio_guided_publication_observations ADD CONSTRAINT ck_publication_observation_shape CHECK(studio_publication_observation_shape(observation));

-- Prospective preparation-time answer snapshot only. Causal model/plan/choice joins are
-- independently checked by the application; this shape check is not an invented JSON FK.
CREATE FUNCTION studio_publication_observed_choice_receipt(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a jsonb; coordinate jsonb; parsed_time timestamptz;
BEGIN
 IF (studio_publication_closed(d,ARRAY['version','sessionId','preparationId','clarificationId','obligationId','contextIdentityHash','meaningsHash','questionCaptureHash','acceptedChoiceId','answer'],2147483647)
  AND d->'version'='1'::jsonb
  AND studio_publication_strings(d,ARRAY['sessionId','preparationId','clarificationId','acceptedChoiceId'])
  AND studio_publication_strings(d,ARRAY['obligationId'],'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  AND studio_publication_strings(d,ARRAY['contextIdentityHash','meaningsHash','questionCaptureHash'],'^[a-f0-9]{64}$')
  AND octet_length(convert_to(studio_publication_canonical(d),'UTF8'))<=16384) IS NOT TRUE THEN RETURN false; END IF;
 a:=d->'answer'; coordinate:=a->'coordinate';
 IF (studio_publication_closed(a,ARRAY['sessionId','scopeHash','clarificationId','coordinate','documentId','generation','choiceId','nodeId','bindingId','sourceRevision','configurationRevision','resolvedAt'],2147483647)
  AND studio_publication_strings(a,ARRAY['sessionId','clarificationId','documentId','choiceId','nodeId'])
  AND studio_publication_strings(a,ARRAY['scopeHash'],'^[a-f0-9]{64}$')
  AND (a->'bindingId'='null'::jsonb OR studio_publication_strings(a,ARRAY['bindingId']))
  AND a->'sessionId'=d->'sessionId' AND a->'clarificationId'=d->'clarificationId' AND a->'choiceId'=d->'acceptedChoiceId'
  AND jsonb_typeof(a->'generation')='number' AND a->>'generation' ~ '^(0|[1-9][0-9]{0,9})$'
  AND (a->>'generation')::numeric<=2147483647
  AND studio_publication_closed(coordinate,ARRAY['stepId','ordinal'],2147483647)
  AND studio_publication_strings(coordinate,ARRAY['stepId'])
  AND jsonb_typeof(coordinate->'ordinal')='number' AND coordinate->>'ordinal' ~ '^[0-7]$'
  AND studio_publication_strings(a,ARRAY['sourceRevision','configurationRevision'],'^(0|[1-9][0-9]{0,18})$')
  AND (a->>'sourceRevision')::numeric<=9223372036854775807 AND (a->>'configurationRevision')::numeric<=9223372036854775807
  AND studio_publication_strings(a,ARRAY['resolvedAt'],'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$')) IS NOT TRUE THEN RETURN false; END IF;
 BEGIN parsed_time:=(a->>'resolvedAt')::timestamptz;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false; END;
 RETURN isfinite(parsed_time);
END $$;
ALTER TABLE studio_guided_publication_preparations ADD COLUMN observed_choice_receipt jsonb,
 ADD CONSTRAINT ck_publication_observed_choice_receipt CHECK (
  observed_choice_receipt IS NULL OR
  (studio_publication_observed_choice_receipt(observed_choice_receipt)
   AND observed_choice_receipt->>'sessionId'=session_id
   AND observed_choice_receipt->>'preparationId'=preparation_id) IS TRUE
 );

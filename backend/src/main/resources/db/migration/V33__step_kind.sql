-- STUDIO SC008-E4 / ADR-SC-008 D2: one open step kind.
-- Forward-only. Replaces every SQL rule that encoded the ten typed operation kinds, the
-- runner-reported target, argument slots, press inheritance and real-source assertion binding.
--
-- Existing rows: no data migration, and the only row-level change is dropping the unused
-- observed_choice_receipt column. Following the V28 precedent (a CREATE OR REPLACE capability
-- change with no data migration for a product that has not been released), old-shape learn
-- sessions are abandoned, not preserved: the closed-key checks below are re-added NOT VALID, so
-- they validate every new write and exempt old rows from validation, but PostgreSQL re-checks a
-- NOT VALID check when an old row is updated, so an old in-flight model attempt fails its next
-- status update. An old confirmed revision is refused at verification (profile pin), not here.

-- 1. Replay scope: exactly one capability, and it is step (live body: V28).
CREATE OR REPLACE FUNCTION studio_publication_scope(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF (studio_publication_closed(p,ARRAY['principalId','csiId','environment','capabilities','initialContext'],32768)
 AND studio_publication_strings(p,ARRAY['principalId','csiId','environment'])
 AND jsonb_typeof(p->'capabilities')='array' AND jsonb_array_length(p->'capabilities')=1) IS NOT TRUE THEN RETURN false; END IF;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(p->'capabilities')) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'capabilities') LOOP
  IF jsonb_typeof(item)<>'string' OR item#>>'{}'<>'step' THEN RETURN false; END IF;
 END LOOP;
 RETURN ((p->'initialContext'='{"kind":"initialBlank"}'::jsonb)
 OR (studio_publication_closed(p->'initialContext',ARRAY['kind','origin'],1024)
 AND p->'initialContext'->>'kind'='observedDocument'
 AND jsonb_typeof(p->'initialContext'->'origin')='string' AND length(p->'initialContext'->>'origin')<=256
 AND p->'initialContext'->>'origin' ~ '^https?://([a-z0-9.-]+|\[[0-9a-f:]+\])(:[1-9][0-9]{0,4})?$')) IS TRUE;
END $$;

-- 2. Consumer edges lose the argument slot; a step can capture several bindings.
ALTER TABLE studio_guided_consumer_edges DROP COLUMN argument_slot;
ALTER TABLE studio_guided_consumer_edges ADD PRIMARY KEY(session_id,consumer_admission_id,binding_id);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT con.conname FROM pg_constraint con WHERE con.conrelid='studio_guided_producers'::regclass AND con.contype='u'
  AND (SELECT array_agg(att.attname::text ORDER BY att.attname) FROM pg_attribute att WHERE att.attrelid=con.conrelid AND att.attnum=ANY(con.conkey))=ARRAY['admission_id','session_id'] LOOP
  EXECUTE format('ALTER TABLE studio_guided_producers DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;

-- 3. Model attempts are source-plan or step-code requests.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='studio_guided_model_attempts'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%SOURCE_PLAN%' AND pg_get_constraintdef(oid) NOT LIKE '%intent_path%' LOOP
  EXECUTE format('ALTER TABLE studio_guided_model_attempts DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE studio_guided_model_attempts ADD CONSTRAINT ck_step_kind CHECK(kind IN ('SOURCE_PLAN','STEP_CODE')) NOT VALID;

-- 4. Observation facts lose the read-rule id, the direct-text flag and the read scope (E5 row 33d).
CREATE OR REPLACE FUNCTION studio_wi6_fact_relations(o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; f jsonb; r jsonb; source jsonb; c integer; seen integer; ordinal jsonb;
BEGIN
 FOR k,f IN SELECT key,value FROM jsonb_each(o->'facts') LOOP
  SELECT count(*) INTO c FROM jsonb_each(o->'facts') peers WHERE peers.value->'role'=f->'role' AND peers.value->'name'=f->'name' AND peers.value->'evidence'=f->'evidence';
  ordinal:=f->'ordinal';
  IF c=1 AND f ? 'ordinal' THEN RETURN false; END IF;
  IF c>1 THEN
   IF NOT studio_publication_closed(ordinal,ARRAY['index','count'],256) OR NOT studio_publication_uint31(ordinal->'index') OR NOT studio_publication_uint31(ordinal->'count')
    OR (ordinal->>'count')::integer<>c OR (ordinal->>'index')::integer NOT BETWEEN 1 AND c THEN RETURN false; END IF;
   SELECT count(*) INTO seen FROM jsonb_each(o->'facts') peers WHERE peers.value->'role'=f->'role' AND peers.value->'name'=f->'name' AND peers.value->'evidence'=f->'evidence' AND peers.value->'ordinal'->'index'=ordinal->'index';
   IF seen<>1 THEN RETURN false; END IF;
  END IF;
  IF f ? 'nearSource' AND (f->>'nearSource'<>'WITHHELD_ADJACENT_PUBLIC' OR (SELECT count(*) FROM jsonb_array_elements(f->'evidenceSegments') s WHERE s->>'field'='near' AND s->>'purpose'='READ_ASSERT_ONLY')<>1) THEN RETURN false; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(jsonb_build_array(COALESCE(f->'scopeRefs','null'::jsonb))) LOOP
   IF r='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(r)<>'array' OR jsonb_array_length(r) NOT BETWEEN 1 AND 8 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(r))<>jsonb_array_length(r) THEN RETURN false; END IF;
   FOR source IN SELECT value FROM jsonb_array_elements(r) LOOP
    IF jsonb_typeof(source)<>'string' OR source#>>'{}'=k OR COALESCE(source#>>'{}','') !~ '^e[0-9]{1,6}$' OR NOT o->'facts' ? (source#>>'{}')
     OR o->'facts'->(source#>>'{}')->'nameComplete'<>'true'::jsonb OR o->'facts'->(source#>>'{}')->'editable'<>'false'::jsonb OR (o->'facts'->(source#>>'{}')->>'role' NOT IN ('form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list','heading','cell','gridcell','rowheader','columnheader','text','paragraph','strong','status','link')) OR length(o->'facts'->(source#>>'{}')->>'name') NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION studio_publication_observation_shape(o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; f jsonb; s jsonb; keys integer := 0;
BEGIN
 IF (o->'schemaVersion'='3'::jsonb AND studio_publication_strings(o,ARRAY['sessionId','documentId','origin','scopeHash','observedAt'])
  AND studio_publication_uint31(o->'generation')
  AND studio_publication_closed(o->'coverage',ARRAY['withheldRegions','unsupportedRegions','passwordControls'],1024)
  AND studio_publication_uint31(o->'coverage'->'withheldRegions') AND studio_publication_uint31(o->'coverage'->'unsupportedRegions')
  AND studio_publication_uint31(o->'coverage'->'passwordControls') AND (o->'coverage'->>'passwordControls')::integer BETWEEN 0 AND 500
  AND studio_publication_closed(o->'projection',ARRAY['projected','tier','totalNodes','shownNodes','notShown','outlineBytes'],1024)
  AND jsonb_typeof(o->'projection'->'projected')='boolean'
  AND (o->'projection'->'tier'='null'::jsonb OR o->'projection'->>'tier' IN ('focus+parent+siblings','focus+parent','focus','truncated'))
  AND studio_publication_uint31(o->'projection'->'totalNodes') AND studio_publication_uint31(o->'projection'->'shownNodes')
  AND studio_publication_uint31(o->'projection'->'notShown') AND studio_publication_uint31(o->'projection'->'outlineBytes')
  AND (o->'projection'->>'outlineBytes')::integer<=40000
  AND jsonb_typeof(o->'outline')='string' AND octet_length(convert_to(o->>'outline','UTF8')) BETWEEN 1 AND 40000
  AND jsonb_typeof(o->'facts')='object') IS NOT TRUE THEN RETURN false; END IF;
 FOR k, f IN SELECT key, value FROM jsonb_each(o->'facts') LOOP
  keys := keys + 1;
  IF keys > 4096 OR k !~ '^e[0-9]{1,6}$' THEN RETURN false; END IF;
  IF (jsonb_typeof(f)='object' AND f ?& ARRAY['role','name','editable','evidence','evidenceSegments','nameComplete','ownTextComplete']
   AND (f-ARRAY['role','name','editable','evidence','evidenceSegments','text','nameComplete','ownTextComplete','ordinal','nearSource','scopeRefs'])='{}'::jsonb
   AND jsonb_typeof(f->'role')='string' AND length(f->>'role') BETWEEN 1 AND 64
   AND jsonb_typeof(f->'name')='string' AND length(f->>'name') BETWEEN 0 AND 256
   AND jsonb_typeof(f->'editable')='boolean' AND jsonb_typeof(f->'nameComplete')='boolean' AND jsonb_typeof(f->'ownTextComplete')='boolean'
   AND jsonb_typeof(f->'evidence')='string' AND length(f->>'evidence') BETWEEN 0 AND 256
   AND (NOT f ? 'text' OR (jsonb_typeof(f->'text')='string' AND length(f->>'text') BETWEEN 0 AND 256))
   AND jsonb_typeof(f->'evidenceSegments')='array' AND jsonb_array_length(f->'evidenceSegments')<=128) IS NOT TRUE THEN RETURN false; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(f->'evidenceSegments') LOOP
   IF (studio_publication_closed(s-'purpose',ARRAY['field','start','end'],256) AND (NOT s ? 'purpose' OR s->>'purpose'='READ_ASSERT_ONLY')
    AND s->>'field' IN ('name','placeholder','near','ownText','text','group','header','sibling')
    AND studio_publication_uint31(s->'start') AND studio_publication_uint31(s->'end')
    AND (s->>'start')::integer<=(s->>'end')::integer AND (s->>'end')::integer<=512) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN studio_wi6_fact_relations(o);
END $$;

ALTER TABLE studio_guided_publication_observations DROP CONSTRAINT ck_publication_observation_closed;
ALTER TABLE studio_guided_publication_observations ADD CONSTRAINT ck_publication_observation_closed CHECK(studio_publication_closed(observation,ARRAY['schemaVersion','sessionId','documentId','generation','origin','scopeHash','observedAt','coverage','projection','outline','facts'],524288)) NOT VALID;

-- 5. Closed-key checks without the target, press inheritance and assert source binding. Size caps: a
-- 16384-byte code is up to six times larger as jsonb text (control characters), so a proposal
-- and the (evidence, proposal, proof) triple may take 131072 bytes; the per-session preparation
-- aggregate in the evidence guard below equals PublicationContracts.MAX_BASIS_BYTES.
ALTER TABLE studio_guided_publication_preparations DROP CONSTRAINT ck_publication_preparation_shape;
ALTER TABLE studio_guided_publication_preparations
 ADD CONSTRAINT ck_publication_preparation_shape CHECK((studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt'],16384)
  AND studio_publication_closed(proposal,ARRAY['schemaVersion','sessionId','coordinate','scopeHash','generation','operation','executionEvidence','evidenceHash','authoredInputsHash','contextRevision'],131072)
  AND studio_publication_object(execution_evidence,ARRAY['kind','documentId','generation'],16384)
  AND proof->>'preparationId'=preparation_id AND proof->>'sessionId'=session_id AND proof->>'contextId'=context_id
  AND (proof->>'ownerFence')::integer=owner_fence AND proof->>'requestDigest'=request_digest
  AND proof->>'evidenceHash'=evidence_hash AND proof->>'authoredInputsHash'=inputs_hash
  AND proposal->'executionEvidence'=execution_evidence AND proposal->>'evidenceHash'=evidence_hash
  AND (observation_hash IS NULL)=(execution_evidence->>'kind'='initialBlank')
  AND (execution_evidence->>'kind'<>'initialBlank' OR (execution_evidence->>'generation'='0' AND proposal->>'generation'='0'))
  AND octet_length(convert_to((jsonb_build_array(execution_evidence,proposal,proof))::text,'UTF8'))<=131072) IS TRUE) NOT VALID;

ALTER TABLE studio_guided_preparations DROP CONSTRAINT ck_wi6_preparation_metadata;
ALTER TABLE studio_guided_preparations ADD CONSTRAINT ck_wi6_preparation_metadata CHECK(studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt'],16384) IS TRUE) NOT VALID;
ALTER TABLE studio_guided_prefix_requests DROP CONSTRAINT ck_wi6_prefix_closed;
ALTER TABLE studio_guided_no_invocation_receipts DROP CONSTRAINT ck_wi6_receipt_closed;
ALTER TABLE studio_guided_prefix_requests ADD CONSTRAINT ck_wi6_prefix_closed CHECK(studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash'],8192) IS TRUE) NOT VALID;
ALTER TABLE studio_guided_no_invocation_receipts ADD CONSTRAINT ck_wi6_receipt_closed CHECK(studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','requestDigest','admissionId','preparationId','attemptOrdinal','operationHash','phase','nativeInvocationStarted','reason','receiptHash'],16384) IS TRUE) NOT VALID;

-- 6. The admitted operation identity is sha256(canonical({coordinate, origin, operation})).
-- The observed-choice witness (and its receipt column) left the contract (E5 row 49).
CREATE OR REPLACE FUNCTION studio_publication_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions; n bigint; b bigint; p studio_guided_preparations; a studio_guided_actions; o studio_guided_obligation_admissions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 IF s.state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED','FINALIZING')
 OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'publication evidence capture is closed'; END IF;
 IF TG_TABLE_NAME='studio_guided_publication_observations' THEN
  SELECT count(*),COALESCE(sum(octet_length(convert_to(observation::text,'UTF8'))),0) INTO n,b FROM studio_guided_publication_observations WHERE session_id=NEW.session_id;
  IF n>=400 OR b+octet_length(convert_to(NEW.observation::text,'UTF8'))>4194304 THEN RAISE EXCEPTION 'publication evidence limit'; END IF;
  IF NEW.observation IS DISTINCT FROM s.progress->'observation' OR NEW.observation_hash<>studio_publication_hash(NEW.observation) THEN RAISE EXCEPTION 'publication observation is not current'; END IF;
 ELSIF TG_TABLE_NAME='studio_guided_publication_preparations' THEN
  SELECT * INTO STRICT p FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
  IF NEW.request_digest<>studio_publication_hash(NEW.proposal) OR NEW.evidence_hash<>studio_publication_hash(NEW.execution_evidence) OR p.proof IS DISTINCT FROM NEW.proof OR p.request_digest<>NEW.request_digest OR p.context_id<>NEW.context_id OR p.owner_fence<>NEW.owner_fence
   OR NEW.execution_evidence IS DISTINCT FROM s.progress->'executionEvidence'
  THEN RAISE EXCEPTION 'publication preparation mismatch'; END IF;
  SELECT count(*),COALESCE(sum(octet_length(convert_to(jsonb_build_array(execution_evidence,proposal,proof)::text,'UTF8'))),0) INTO n,b FROM studio_guided_publication_preparations WHERE session_id=NEW.session_id;
  IF n>=400 OR b+octet_length(convert_to(jsonb_build_array(NEW.execution_evidence,NEW.proposal,NEW.proof)::text,'UTF8'))>6291456 THEN RAISE EXCEPTION 'publication preparation limit'; END IF;
 ELSE
  SELECT * INTO STRICT a FROM studio_guided_actions WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
  SELECT * INTO STRICT o FROM studio_guided_obligation_admissions WHERE session_id=NEW.session_id AND obligation_id=NEW.obligation_id;
  SELECT * INTO STRICT p FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
  IF NEW.proposal_hash<>studio_publication_hash(a.proposal) OR a.document->>'operationHash' IS DISTINCT FROM studio_publication_hash(jsonb_build_object('coordinate',a.proposal->'coordinate','origin',COALESCE(a.proposal->'executionEvidence'->'origin','null'::jsonb),'operation',a.proposal->'operation')) OR a.document->>'preparationId' IS DISTINCT FROM NEW.preparation_id OR a.document->>'requestDigest' IS DISTINCT FROM NEW.proposal_hash
   OR o.admission_id IS DISTINCT FROM NEW.admission_id OR o.proposal_digest<>NEW.proposal_hash OR p.admission_id IS DISTINCT FROM NEW.admission_id
  THEN RAISE EXCEPTION 'publication admission mismatch'; END IF;
  SELECT count(*) INTO n FROM studio_guided_publication_admissions WHERE session_id=NEW.session_id;
  IF n>=200 THEN RAISE EXCEPTION 'publication admission limit'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE studio_guided_publication_preparations DROP CONSTRAINT ck_publication_observed_choice_receipt;
ALTER TABLE studio_guided_publication_preparations DROP COLUMN observed_choice_receipt;
DROP FUNCTION studio_publication_observed_choice_receipt(jsonb);

-- 7. The ledger: no assertion verdict; the attempt's step receipt is written once with the outcome
-- (the gate judges the false-pass controls on it); a step has no per-step statement limit.
ALTER TABLE studio_guided_actions ADD COLUMN receipt jsonb;
ALTER TABLE studio_guided_actions ADD CONSTRAINT ck_guided_action_receipt CHECK(receipt IS NULL OR (
 studio_publication_closed(receipt,ARRAY['closedCode','stepHash','fenceCrossed','effects','effectsTruncated','offscreen'],16384)
 AND document->>'state' IN ('SUCCEEDED','FAILED','UNKNOWN_OUTCOME')
 AND receipt->>'stepHash' ~ '^[a-f0-9]{64}$'
 AND jsonb_typeof(receipt->'fenceCrossed')='boolean' AND jsonb_typeof(receipt->'effectsTruncated')='boolean'
 AND jsonb_typeof(receipt->'offscreen')='boolean'
 AND (receipt->'closedCode'='null'::jsonb OR jsonb_typeof(receipt->'closedCode')='string')
 AND jsonb_typeof(receipt->'effects')='array' AND jsonb_array_length(receipt->'effects')<=64) IS TRUE);
CREATE OR REPLACE FUNCTION studio_guided_immutable_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.proposal IS DISTINCT FROM NEW.proposal THEN RAISE EXCEPTION 'guided proposal is immutable'; END IF;
    IF (OLD.document - ARRAY['state','dispatchCount','outcomeCode'])
       IS DISTINCT FROM (NEW.document - ARRAY['state','dispatchCount','outcomeCode'])
       OR (NEW.document->>'dispatchCount')::integer < (OLD.document->>'dispatchCount')::integer THEN
      RAISE EXCEPTION 'guided admission is immutable';
    END IF;
    IF OLD.document->>'state' IN ('SUCCEEDED','FAILED','UNKNOWN_OUTCOME','REVOKED')
       AND NEW.document IS DISTINCT FROM OLD.document THEN RAISE EXCEPTION 'guided outcome is immutable'; END IF;
    IF NEW.receipt IS DISTINCT FROM OLD.receipt AND (OLD.receipt IS NOT NULL
       OR OLD.document->>'state' IN ('SUCCEEDED','FAILED','UNKNOWN_OUTCOME','REVOKED')) THEN
      RAISE EXCEPTION 'guided receipt is written once, with the outcome';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_015_action_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF studio_015_prefix_pending(NEW.session_id) AND s.state<>'REPLAYING_PREFIX'
 THEN RAISE EXCEPTION 'prefix action requires replay state'; END IF;
 IF NEW.document->'contextRevision' IS DISTINCT FROM NEW.proposal->'contextRevision'
 OR NEW.document->'authoredInputsHash' IS DISTINCT FROM NEW.proposal->'authoredInputsHash'
 OR NOT EXISTS(SELECT 1 FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id AND p.preparation_id=NEW.document->>'preparationId'
 AND p.request_digest=studio_publication_hash(NEW.proposal) AND p.proof->'contextRevision'=NEW.proposal->'contextRevision'
 AND p.proof->'authoredInputsHash'=NEW.proposal->'authoredInputsHash') THEN RAISE EXCEPTION 'action preparation version mismatch'; END IF;
 IF NEW.document->>'attemptOrdinal' IS DISTINCT FROM NEW.attempt_ordinal::text THEN RAISE EXCEPTION 'ledger attempt ordinal mismatch'; END IF;
 IF NEW.ordinal>=8
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

-- 8. Secret audit: a dispatch can carry up to 8 secrets. The link from a dispatch to a secret is
-- "the admitted step's uses names {kind: secret, id}" plus the step's authored secretRef input
-- with its exact manifest reference, one reference per (admission, secret).
CREATE FUNCTION studio_secret_step_uses(operation jsonb, secret_key text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE((SELECT bool_or(u->>'kind'='secret' AND u->>'id'=secret_key)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(operation->'uses')='array' THEN operation->'uses' ELSE '[]'::jsonb END) u),false)
$$;
CREATE OR REPLACE FUNCTION studio_secret_guided_declaration(session_key text,scope_key text,step_key text,secret_key text)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'configurationReferences') reference
  WHERE m.session_id=session_key AND m.scope_hash=scope_key
   AND m.manifest_hash=studio_publication_hash(m.manifest)
   AND reference->>'kind'='secretRef' AND reference->>'referenceName'=secret_key
   AND reference->>'stepId'=step_key
   AND NOT (reference ? 'value'))
$$;
CREATE OR REPLACE FUNCTION studio_secret_guided_exact_reference(session_key text,scope_key text,step_key text,secret_key text,reference_key text)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT count(*)=1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'configurationReferences') reference
  WHERE m.session_id=session_key AND m.scope_hash=scope_key
   AND m.manifest_hash=studio_publication_hash(m.manifest)
   AND reference->>'referenceId'=reference_key AND length(reference_key) BETWEEN 1 AND 256
   AND reference->>'kind'='secretRef' AND reference->>'referenceName'=secret_key
   AND reference->>'stepId'=step_key
   AND NOT(reference ? 'value')
$$;
CREATE FUNCTION studio_secret_guided_input_reference(session_key text,scope_key text,admission_key text,secret_key text)
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
  AND studio_secret_step_uses(a.proposal->'operation',secret_key)
  AND input->>'kind'='secretRef' AND input->>'secretId'=secret_key AND input->>'sourceStepId'=a.step_id
  AND NOT(input ? 'value')
  AND input->'provenance'->>'referenceKind'='configuration'
  AND input->'provenance'->>'kind'='secretRef'
  AND input->'provenance'->>'stepId'=a.step_id
  AND input->'provenance'->>'referenceName'=input->>'secretId'
  AND input->'provenance'->>'configurationRevision'=material.configuration_revision
  AND studio_secret_guided_exact_reference(session_key,scope_key,a.step_id,input->>'secretId',input->'provenance'->>'referenceId')
$$;
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
   AND studio_secret_step_uses(a.proposal->'operation',secret_key)
   AND input->>'kind'='secretRef' AND input->>'secretId'=secret_key AND NOT(input ? 'value')
   AND input->>'sourceStepId'=step_key
   AND studio_secret_guided_input_reference(session_key,scope_key,admission_key,secret_key) IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION studio_secret_audit_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
   actual_reference:=studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,NEW.admission_id,NEW.secret_id);
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
     AND ((u.usage_outcome='NOT_USED' AND u.source_reference_id=actual_reference) OR (u.admission_id=NEW.admission_id AND u.secret_id=NEW.secret_id))) THEN
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
        OR studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,decision.admission_id,NEW.secret_id)=NEW.source_reference_id))) THEN
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
      AND (studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,consumed.admission_id,NEW.secret_id)=NEW.source_reference_id
       OR (studio_secret_step_uses(consumed.proposal->'operation',NEW.secret_id)
        AND studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,consumed.admission_id,NEW.secret_id) IS NULL))) THEN
     RAISE EXCEPTION 'secret audit unreached cannot conceal consumed admission';
    END IF;
    IF EXISTS(SELECT 1 FROM studio_secret_use_audit retained WHERE retained.session_id=NEW.session_id
      AND (retained.source_reference_id=NEW.source_reference_id OR
       studio_secret_guided_input_reference(NEW.session_id,s.scope_hash,retained.admission_id,NEW.secret_id)=NEW.source_reference_id)) THEN
     RAISE EXCEPTION 'secret audit duplicate declaring summary';
    END IF;
   ELSE
    IF (NEW.release_seq IS NULL AND NEW.admission_id IS NOT NULL AND (action.document->>'dispatchCount')::integer=1
     AND action.document->>'state' IN ('DISPATCHING','UNKNOWN_OUTCOME','FAILED')
     AND NEW.attempt_id=NEW.session_id||':'||(action.document->>'ownerFence')
     AND studio_secret_step_uses(action.proposal->'operation',NEW.secret_id)
     AND EXISTS(SELECT 1 FROM studio_guided_materializations material,
      LATERAL jsonb_array_elements(material.authored_inputs->'inputs') input
      WHERE material.session_id=NEW.session_id AND material.scope_hash=s.scope_hash
       AND material.owner_fence=(action.document->>'ownerFence')::integer
       AND input->>'kind'='secretRef' AND input->>'secretId'=NEW.secret_id AND NOT (input ? 'value')
       AND input->>'sourceStepId'=NEW.coordinate_step_id)
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
DROP FUNCTION studio_secret_guided_input_reference(text,text,text);

-- 9. The press, child-locator and real-source assertion machinery is gone with the typed kinds.
DROP TRIGGER tr_wi6_press_preparation ON studio_guided_preparations;
DROP TRIGGER tr_wi6_press_publication ON studio_guided_publication_preparations;
DROP TRIGGER tr_wi6_press_action ON studio_guided_actions;
DROP TRIGGER tr_wi6_child_preparation ON studio_guided_preparations;
DROP TRIGGER tr_wi6_child_publication ON studio_guided_publication_preparations;
DROP TRIGGER tr_wi6_child_action ON studio_guided_actions;
DROP TRIGGER tr_wi6_child_revision ON ui_test_revisions;
DROP TRIGGER tr_wi6_assertion_preparation ON studio_guided_preparations;
DROP TRIGGER tr_wi6_assertion_publication ON studio_guided_publication_preparations;
DROP TRIGGER tr_wi6_assertion_action ON studio_guided_actions;
DROP TRIGGER tr_wi6_assertion_revision ON ui_test_revisions;
DROP TRIGGER tr_wi6_source_request ON studio_guided_prefix_requests;
DROP TRIGGER tr_wi6_source_receipt ON studio_guided_no_invocation_receipts;
DROP FUNCTION studio_wi6_press_join_guard();
DROP FUNCTION studio_wi6_child_write_guard();
DROP FUNCTION studio_wi6_assertion_write_guard();
DROP FUNCTION studio_wi6_source_request_guard();
DROP FUNCTION studio_wi6_prefix_source_identity(jsonb,jsonb);
DROP FUNCTION studio_wi6_read_producer_metadata(jsonb,jsonb,jsonb,jsonb,jsonb);
DROP FUNCTION studio_wi6_frozen_assertion_metadata(jsonb);
DROP FUNCTION studio_wi6_assertion_metadata(jsonb,jsonb,jsonb);
DROP FUNCTION studio_wi6_locator(jsonb,text);
DROP FUNCTION studio_wi6_source_metadata(jsonb);
DROP FUNCTION studio_wi6_press_metadata(jsonb);

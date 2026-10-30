-- WI6 actual real-source assertion repair. Forward-only JSON validation; no history rewrite.
-- Native table ancestry and physical read capabilities remain runner authority, never SQL inference.
CREATE FUNCTION studio_wi6_source_metadata(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (NOT d ? 'assertSourceBinding' OR (studio_publication_closed(d->'assertSourceBinding',ARRAY['bindingId','producerAdmissionId','producerPreparationId'],4096)
 AND studio_publication_strings(d->'assertSourceBinding',ARRAY['bindingId','producerAdmissionId','producerPreparationId'])
 AND length(d->'assertSourceBinding'->>'bindingId') BETWEEN 1 AND 256
 AND length(d->'assertSourceBinding'->>'producerAdmissionId') BETWEEN 1 AND 256
 AND length(d->'assertSourceBinding'->>'producerPreparationId') BETWEEN 1 AND 256)) IS TRUE
$$;

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
  IF f ? 'readScope' THEN
   IF NOT studio_publication_closed(f->'readScope',CASE WHEN f->'readScope' ? 'tableTitleRef' THEN ARRAY['relation','sourceRefs','tableTitleRef'] ELSE ARRAY['relation','sourceRefs'] END,1024) OR f->'readScope'->>'relation' NOT IN ('SAME_ROW_LABEL','IMMEDIATE_HEADING_SAME_PARENT','R7_ADJACENT_PUBLIC') THEN RETURN false; END IF;
  END IF;
  IF f ? 'directTextAssertion' AND (f->'directTextAssertion'='true'::jsonb AND f->>'role'='paragraph' AND f->>'name'='' AND f->'editable'='false'::jsonb AND jsonb_typeof(f->'text')='string' AND f->'ownTextComplete'='true'::jsonb) IS NOT TRUE THEN RETURN false; END IF;
  IF f->'readScope' ? 'tableTitleRef' AND (jsonb_typeof(f->'readScope'->'tableTitleRef')='string'
    AND f->'readScope'->>'relation'='SAME_ROW_LABEL' AND f->'readScope'->>'tableTitleRef'<>k
    AND f->'readScope'->'sourceRefs' @> jsonb_build_array(f->'readScope'->'tableTitleRef')
    AND jsonb_array_length(f->'readScope'->'sourceRefs')>=2) IS NOT TRUE THEN RETURN false; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(jsonb_build_array(COALESCE(f->'scopeRefs','null'::jsonb),COALESCE(f->'readScope'->'sourceRefs','null'::jsonb))) LOOP
   IF r='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(r)<>'array' OR jsonb_array_length(r) NOT BETWEEN 1 AND 8 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(r))<>jsonb_array_length(r) THEN RETURN false; END IF;
   FOR source IN SELECT value FROM jsonb_array_elements(r) LOOP
    IF jsonb_typeof(source)<>'string' OR source#>>'{}'=k OR COALESCE(source#>>'{}','') !~ '^e[0-9]{1,6}$' OR NOT o->'facts' ? (source#>>'{}')
     OR o->'facts'->(source#>>'{}')->'nameComplete'<>'true'::jsonb OR o->'facts'->(source#>>'{}')->'editable'<>'false'::jsonb OR (o->'facts'->(source#>>'{}')->>'role' NOT IN ('form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list','heading','cell','gridcell','rowheader','columnheader','text','paragraph','strong','status','link') AND NOT ((source=f->'readScope'->'tableTitleRef' AND o->'facts'->(source#>>'{}')->>'role'='caption' AND r=f->'readScope'->'sourceRefs' AND NOT (COALESCE(f->'scopeRefs','[]'::jsonb) @> jsonb_build_array(source))) IS TRUE)) OR length(o->'facts'->(source#>>'{}')->>'name') NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
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
  AND (o->'readRuleId'='null'::jsonb OR (jsonb_typeof(o->'readRuleId')='string' AND length(o->>'readRuleId') BETWEEN 1 AND 256))
  AND jsonb_typeof(o->'outline')='string' AND octet_length(convert_to(o->>'outline','UTF8')) BETWEEN 1 AND 40000
  AND jsonb_typeof(o->'facts')='object') IS NOT TRUE THEN RETURN false; END IF;
 FOR k, f IN SELECT key, value FROM jsonb_each(o->'facts') LOOP
  keys := keys + 1;
  IF keys > 4096 OR k !~ '^e[0-9]{1,6}$' THEN RETURN false; END IF;
  IF (jsonb_typeof(f)='object' AND f ?& ARRAY['role','name','editable','evidence','evidenceSegments','nameComplete','ownTextComplete']
   AND (f-ARRAY['role','name','editable','evidence','evidenceSegments','text','nameComplete','ownTextComplete','ordinal','nearSource','readScope','scopeRefs','directTextAssertion'])='{}'::jsonb
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

ALTER TABLE studio_guided_publication_preparations DROP CONSTRAINT ck_publication_preparation_shape;
ALTER TABLE studio_guided_publication_preparations
 ADD CONSTRAINT ck_publication_preparation_shape CHECK((studio_publication_closed(proof-'assertSourceBinding',ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt','target','pressInheritance'],16384) AND studio_wi6_press_metadata(proof->'pressInheritance') AND studio_wi6_source_metadata(proof)
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
  AND octet_length(convert_to((jsonb_build_array(execution_evidence,proposal,proof))::text,'UTF8'))<=16384) IS TRUE) NOT VALID;


ALTER TABLE studio_guided_preparations DROP CONSTRAINT ck_wi6_preparation_metadata;
ALTER TABLE studio_guided_preparations ADD CONSTRAINT ck_wi6_preparation_metadata CHECK((studio_publication_closed(proof-'assertSourceBinding',ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt','target','pressInheritance'],16384) AND studio_wi6_press_metadata(proof->'pressInheritance') AND studio_wi6_source_metadata(proof)) IS TRUE) NOT VALID;
ALTER TABLE studio_guided_prefix_requests DROP CONSTRAINT ck_wi6_prefix_closed;
ALTER TABLE studio_guided_no_invocation_receipts DROP CONSTRAINT ck_wi6_receipt_closed;
ALTER TABLE studio_guided_prefix_requests ADD CONSTRAINT ck_wi6_prefix_closed CHECK((studio_publication_closed(document-'assertSourceBinding',ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','pressInheritance'],8192) AND studio_wi6_press_metadata(document->'pressInheritance') AND studio_wi6_source_metadata(document)) IS TRUE) NOT VALID;
ALTER TABLE studio_guided_no_invocation_receipts ADD CONSTRAINT ck_wi6_receipt_closed CHECK((studio_publication_closed(document-'assertSourceBinding',ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','pressInheritance','requestDigest','admissionId','preparationId','attemptOrdinal','operationHash','phase','nativeInvocationStarted','reason','receiptHash'],16384) AND studio_wi6_press_metadata(document->'pressInheritance') AND studio_wi6_source_metadata(document)) IS TRUE) NOT VALID;

-- Optional means omitted, never JSON null. Mode is operation/expected-source authority.
CREATE FUNCTION studio_wi6_assertion_metadata(proposal jsonb, proof jsonb, observation jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE target jsonb:=proof->'target'; fact jsonb; mode text; op jsonb:=proposal->'operation';
BEGIN
 IF NOT studio_wi6_source_metadata(proof) THEN RETURN false; END IF;
 IF target<>'null'::jsonb THEN
  IF (studio_publication_closed(target-'assertTextMode',ARRAY['locator','tier','identity'],8192)
    AND studio_wi6_locator(target->'locator',COALESCE(op->>'kind',''))
    AND target->>'tier' IN ('testId','role','label','placeholder','text','scoped','filterHas','attribute','nth')
    AND studio_publication_closed(target->'identity',ARRAY['role','name'],2048)
    AND jsonb_typeof(target->'identity'->'role')='string' AND length(target->'identity'->>'role') BETWEEN 1 AND 64
    AND (target->'identity'->'name'='null'::jsonb OR (jsonb_typeof(target->'identity'->'name')='string'
      AND length(target->'identity'->>'name') BETWEEN 1 AND 256))) IS NOT TRUE THEN RETURN false; END IF;
 END IF;
 fact:=observation->'facts'->(proposal->'target'->>'ref');
 IF target ? 'assertTextMode' THEN
  mode:=target->>'assertTextMode';
  IF (jsonb_typeof(target->'assertTextMode')='string' AND mode IN ('DIRECT_PUBLIC','READ_BINDING_SOURCE')
   AND proposal->'target'->>'kind'='node' AND op->>'kind'='assert' AND op->>'predicate'='containsText') IS NOT TRUE THEN RETURN false; END IF;
 END IF;
 IF fact ? 'directTextAssertion' AND target->>'assertTextMode' IS DISTINCT FROM 'DIRECT_PUBLIC' THEN RETURN false; END IF;
 IF proof ? 'assertSourceBinding' AND target->>'assertTextMode' IS DISTINCT FROM 'READ_BINDING_SOURCE' THEN RETURN false; END IF;
 IF mode='DIRECT_PUBLIC' THEN
  RETURN (fact->'directTextAssertion'='true'::jsonb AND op->'expected'->>'kind'='authoredLiteral'
   AND NOT proof ? 'assertSourceBinding') IS TRUE;
 ELSIF mode='READ_BINDING_SOURCE' THEN
  RETURN (NOT fact ? 'directTextAssertion' AND proof ? 'assertSourceBinding'
   AND op->'expected'->>'kind'='binding' AND op->'expected'->'bindingId'=proof->'assertSourceBinding'->'bindingId') IS TRUE;
 END IF;
 RETURN NOT proof ? 'assertSourceBinding';
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- Stable because the frozen comparator is joined to the exact persisted successful preparation.
CREATE FUNCTION studio_wi6_frozen_assertion_metadata(artifact jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE action jsonb; target jsonb; guard jsonb; persisted_target jsonb;
BEGIN
  FOR action IN SELECT value FROM jsonb_array_elements(artifact->'learnedPlan'->'actions') LOOP
   target:=action->'target';
   IF target ? 'assertTextMode' AND (jsonb_typeof(target->'assertTextMode')='string'
    AND target->>'assertTextMode' IN ('DIRECT_PUBLIC','READ_BINDING_SOURCE') AND action->'operation'->>'kind'='assert'
    AND action->'operation'->>'predicate'='containsText' AND action->'operation'->'expected'->>'kind'=
       CASE target->>'assertTextMode' WHEN 'DIRECT_PUBLIC' THEN 'authoredLiteral' ELSE 'binding' END) IS NOT TRUE
   THEN RETURN false; END IF;
   SELECT prepared.proof->'target' INTO persisted_target FROM studio_guided_actions admitted
    JOIN studio_guided_preparations prepared ON prepared.session_id=admitted.session_id
     AND prepared.preparation_id=admitted.document->>'preparationId'
    WHERE admitted.admission_id=action->>'admissionId';
   IF (target ? 'assertTextMode' OR persisted_target ? 'assertTextMode')
     AND target->'assertTextMode' IS DISTINCT FROM persisted_target->'assertTextMode'
    THEN RETURN false; END IF;
   -- Every frozen guard must preserve mode independently of operation hashes.
   SELECT g INTO STRICT guard FROM jsonb_array_elements(artifact->'steps') step,
    LATERAL jsonb_array_elements(step->'operations') operation,
    LATERAL jsonb_array_elements(artifact->'guards') g
    WHERE operation->'coordinate'=action->'coordinate' AND g->>'guardId'=operation->>'guardId';
   IF guard->'target'->'assertTextMode' IS DISTINCT FROM target->'assertTextMode'
    THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- The receipt is the immutable producer document; IDs/FKs alone cannot attest its authority.
CREATE FUNCTION studio_wi6_read_producer_metadata(producer jsonb, prior_ledger jsonb,
 prior_proposal jsonb, predecessor jsonb, source_binding jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (studio_publication_closed(producer,ARRAY['bindingId','producerAdmissionId','coordinate','origin','recipe','availability'],8192)
  AND producer->'bindingId'=source_binding->'bindingId'
  AND producer->'producerAdmissionId'=source_binding->'producerAdmissionId'
  AND producer->'coordinate'=prior_ledger->'coordinate'
  AND producer->'origin'=prior_proposal->'executionEvidence'->'origin'
  AND producer->'recipe'=prior_proposal->'operation'->'recipe'
  AND studio_publication_closed(producer->'availability',ARRAY['bindingId','producerAdmissionId','contextId','workerId','ownerFence'],4096)
  AND producer->'availability'->'bindingId'=source_binding->'bindingId'
  AND producer->'availability'->'producerAdmissionId'=source_binding->'producerAdmissionId'
  AND producer->'availability'->'contextId'=predecessor->'contextId'
  AND producer->'availability'->'workerId'=predecessor->'workerId'
  AND producer->'availability'->'ownerFence'=predecessor->'ownerFence') IS TRUE
$$;

-- Successful producer/preparation and need consumer joins are checked against persisted rows.
CREATE FUNCTION studio_wi6_assertion_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof jsonb; v_proposal jsonb; observation jsonb; source jsonb; prior studio_guided_actions;
 predecessor jsonb; producer jsonb; allocation jsonb; field text; meaning jsonb; v_plan_revision bigint; v_obligation_id text; planned_meaning jsonb; source_references jsonb; target jsonb; action jsonb; guard jsonb; persisted_target jsonb;
BEGIN
 IF TG_TABLE_NAME='ui_test_revisions' THEN
  IF NOT studio_wi6_frozen_assertion_metadata(NEW.artifact) THEN RAISE EXCEPTION 'frozen assertion metadata invalid'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='studio_guided_publication_preparations' THEN proof:=NEW.proof; v_proposal:=NEW.proposal;
 ELSIF TG_TABLE_NAME='studio_guided_preparations' THEN
  proof:=NEW.proof;
  SELECT DISTINCT o.proposal INTO v_proposal FROM studio_guided_obligation_admissions o
   WHERE o.session_id=NEW.session_id AND o.proposal_digest=NEW.request_digest;
 ELSE
  v_proposal:=NEW.proposal;
  SELECT p.proof INTO STRICT proof FROM studio_guided_preparations p
   WHERE p.session_id=NEW.session_id AND p.preparation_id=NEW.document->>'preparationId';
 END IF;
 SELECT o.observation INTO observation FROM studio_guided_publication_observations o
  WHERE o.session_id=NEW.session_id AND o.observation_hash=v_proposal->'executionEvidence'->>'observationHash';
 IF NOT studio_wi6_assertion_metadata(v_proposal,proof,observation) THEN RAISE EXCEPTION 'assertion metadata invalid'; END IF;
 IF proof->'target'->>'assertTextMode'='DIRECT_PUBLIC' THEN
  SELECT o.meaning,o.plan_revision,o.obligation_id INTO STRICT meaning,v_plan_revision,v_obligation_id FROM studio_guided_obligation_admissions o
   WHERE o.session_id=NEW.session_id AND o.proposal_digest=proof->>'requestDigest';
  -- No integer cast or array indexing is reached until canonical uint31 and range succeed.
  IF NOT studio_publication_uint31(meaning->'referenceIndex')
   THEN RAISE EXCEPTION 'direct assertion reference index invalid'; END IF;
  SELECT plan.plan->'sourceReferences' INTO STRICT source_references FROM studio_guided_translation_plans plan
   WHERE plan.session_id=NEW.session_id AND plan.plan_revision=v_plan_revision;
  IF jsonb_typeof(source_references) IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'direct assertion source references invalid'; END IF;
  IF (meaning->>'referenceIndex')::bigint>=jsonb_array_length(source_references)
   THEN RAISE EXCEPTION 'direct assertion reference index out of range'; END IF;
  BEGIN
   SELECT promised INTO STRICT planned_meaning FROM studio_guided_translation_plans plan,
    LATERAL jsonb_array_elements(plan.plan->'obligations') promised
    WHERE plan.session_id=NEW.session_id AND plan.plan_revision=v_plan_revision
     AND promised->>'obligationId'=v_obligation_id;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
   RAISE EXCEPTION 'direct assertion plan meaning mismatch';
  END;
  -- Observed-choice selection metadata may resolve a target, never rewrite admitted semantics.
  FOREACH field IN ARRAY ARRAY['obligationId','stepId','occurrence','operationKind','predicate','referenceIndex','needId','targetIntent','scopeIntent'] LOOP
   IF meaning->field IS DISTINCT FROM planned_meaning->field
    THEN RAISE EXCEPTION 'direct assertion plan meaning mismatch'; END IF;
  END LOOP;
  IF (meaning->>'operationKind'='assert' AND meaning->>'predicate'='containsText'
    AND meaning->'needId'='null'::jsonb
    AND EXISTS(SELECT 1 FROM studio_guided_materialization_inputs input,
      studio_guided_translation_plans plan WHERE input.session_id=NEW.session_id
      AND input.input_id=v_proposal->'operation'->'expected'->>'sourceInputId'
      AND input.document->>'kind'='nonsecretText' AND input.document->>'intendedSlot'='assert.expected'
      AND input.document->'sourceStepId'=v_proposal->'coordinate'->'stepId'
      AND input.document->'provenance'->>'referenceKind'='sourceSpan'
      AND input.introduced_revision<=(proof->>'contextRevision')::integer
      AND plan.session_id=NEW.session_id AND plan.plan_revision=v_plan_revision
      AND input.document->'provenance'=plan.plan->'sourceReferences'->((meaning->>'referenceIndex')::integer))) IS NOT TRUE
   THEN RAISE EXCEPTION 'direct assertion authored source mismatch'; END IF;
 END IF;
 IF NOT proof ? 'assertSourceBinding' THEN
  IF v_proposal->'target'->>'kind'='node' AND v_proposal->'operation'->>'kind'='assert'
   AND v_proposal->'operation'->>'predicate'='containsText' AND v_proposal->'operation'->'expected'->>'kind'='binding'
   AND EXISTS(SELECT 1 FROM studio_guided_producers produced JOIN studio_guided_actions a
     ON a.session_id=produced.session_id AND a.admission_id=produced.admission_id
     WHERE produced.session_id=NEW.session_id AND produced.binding_id=v_proposal->'operation'->'expected'->>'bindingId'
      AND a.proposal->'target'->'ref'=v_proposal->'target'->'ref'
      AND a.proposal->'target'->'documentId'=v_proposal->'target'->'documentId')
   THEN RAISE EXCEPTION 'source assertion mode omitted'; END IF;
  RETURN NEW;
 END IF;
 source:=proof->'assertSourceBinding';
 SELECT * INTO STRICT prior FROM studio_guided_actions a WHERE a.session_id=NEW.session_id
  AND a.admission_id=source->>'producerAdmissionId';
 SELECT p.proof INTO STRICT predecessor FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id
  AND p.preparation_id=source->>'producerPreparationId' AND p.admission_id=prior.admission_id;
 SELECT p.document INTO STRICT producer FROM studio_guided_producers p WHERE p.session_id=NEW.session_id
  AND p.binding_id=source->>'bindingId' AND p.admission_id=prior.admission_id;
 SELECT a.document INTO STRICT allocation FROM studio_guided_allocations a WHERE a.session_id=NEW.session_id
  AND a.binding_id=source->>'bindingId';
 IF NOT studio_wi6_read_producer_metadata(producer,prior.document,prior.proposal,predecessor,source)
  THEN RAISE EXCEPTION 'assertion producer receipt mismatch'; END IF;
 IF (prior.document->>'state'='SUCCEEDED' AND prior.document->>'outcomeCode'='OK' AND prior.document->>'dispatchCount'='1'
  AND prior.proposal->'operation'->>'kind'='read' AND prior.proposal->'operation'->'bindingId'=source->'bindingId'
  AND prior.document->>'preparationId'=source->>'producerPreparationId'
  AND prior.proposal->'target'->>'kind'='node' AND prior.proposal->'target'->'ref'=v_proposal->'target'->'ref'
  AND prior.proposal->'target'->'documentId'=v_proposal->'target'->'documentId'
  AND prior.proposal->'executionEvidence'->'origin'=v_proposal->'executionEvidence'->'origin'
  AND producer->'coordinate'=prior.document->'coordinate'
  AND allocation->'producerStepId'=prior.document->'coordinate'->'stepId'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(allocation->'consumers') c
    WHERE c->'stepId'=v_proposal->'coordinate'->'stepId' AND c->>'argumentSlot'='assert.expected')) IS NOT TRUE
 THEN RAISE EXCEPTION 'assertion producer mismatch'; END IF;
 FOREACH field IN ARRAY ARRAY['sessionId','contextId','contextRevision','authoredInputsHash','workerId','ownerFence','scopeHash','sourceRevision','configurationRevision'] LOOP
  IF predecessor->field IS DISTINCT FROM proof->field THEN RAISE EXCEPTION 'assertion source authority mismatch'; END IF;
 END LOOP;
 SELECT o.meaning,o.plan_revision INTO STRICT meaning,v_plan_revision FROM studio_guided_obligation_admissions o WHERE o.session_id=NEW.session_id
  AND o.proposal_digest=proof->>'requestDigest';
 IF (meaning->>'operationKind'='assert' AND meaning->>'predicate'='containsText'
  AND meaning->'stepId'=v_proposal->'coordinate'->'stepId' AND meaning->>'needId'=allocation->>'needId') IS NOT TRUE
 THEN RAISE EXCEPTION 'assertion need mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'sourceSteps') WITH ORDINALITY producer_step(value,position),
  LATERAL jsonb_array_elements(m.manifest->'sourceSteps') WITH ORDINALITY consumer_step(value,position)
  WHERE m.session_id=NEW.session_id AND producer_step.value->>'stepId'=prior.step_id
   AND consumer_step.value->>'stepId'=v_proposal->'coordinate'->>'stepId'
   AND (producer_step.position<consumer_step.position OR (producer_step.position=consumer_step.position
      AND prior.ordinal<(v_proposal->'coordinate'->>'ordinal')::integer)))
 THEN RAISE EXCEPTION 'assertion producer is not earlier'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_wi6_assertion_preparation BEFORE INSERT ON studio_guided_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_assertion_write_guard();
CREATE TRIGGER tr_wi6_assertion_publication BEFORE INSERT ON studio_guided_publication_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_assertion_write_guard();
CREATE TRIGGER tr_wi6_assertion_action BEFORE INSERT ON studio_guided_actions FOR EACH ROW EXECUTE FUNCTION studio_wi6_assertion_write_guard();
CREATE TRIGGER tr_wi6_assertion_revision BEFORE INSERT ON ui_test_revisions FOR EACH ROW EXECUTE FUNCTION studio_wi6_assertion_write_guard();

-- Closed prefix request metadata is derived from the exact persisted frozen operation.
CREATE FUNCTION studio_wi6_prefix_source_identity(frozen_action jsonb, q jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE mode text:=frozen_action->'target'->>'assertTextMode';
BEGIN
 IF NOT studio_wi6_source_metadata(q)
  OR frozen_action->'target'->'assertTextMode' IS DISTINCT FROM frozen_action->'guard'->'target'->'assertTextMode'
  OR (frozen_action->'target' ? 'assertTextMode' AND (jsonb_typeof(frozen_action->'target'->'assertTextMode')='string'
    AND mode IN ('DIRECT_PUBLIC','READ_BINDING_SOURCE')) IS NOT TRUE)
  OR (q ? 'assertSourceBinding') IS DISTINCT FROM COALESCE(mode='READ_BINDING_SOURCE',false) THEN RETURN false; END IF;
 IF NOT q ? 'assertSourceBinding' THEN RETURN true; END IF;
 RETURN (frozen_action->'operation'->>'kind'='assert' AND frozen_action->'operation'->>'predicate'='containsText'
  AND frozen_action->'operation'->'expected'->>'kind'='binding'
  AND frozen_action->'operation'->'expected'->'bindingId'=q->'assertSourceBinding'->'bindingId') IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION studio_wi6_source_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d jsonb:=NEW.document; q jsonb; p jsonb; a studio_guided_actions; field text; frozen_action jsonb; producer_document jsonb;
BEGIN
 IF TG_TABLE_NAME='studio_guided_no_invocation_receipts' THEN
  SELECT r.document INTO STRICT q FROM studio_guided_prefix_requests r
   WHERE r.session_id=NEW.session_id AND r.request_digest=d->>'requestDigest';
  IF q->'assertSourceBinding' IS DISTINCT FROM d->'assertSourceBinding'
   THEN RAISE EXCEPTION 'prefix source receipt changed'; END IF;
 ELSE q:=d; END IF;
 IF NOT studio_wi6_source_metadata(q) THEN RAISE EXCEPTION 'prefix source metadata invalid'; END IF;
 SELECT action_value INTO STRICT frozen_action FROM studio_guided_relearn_plans plans,
  LATERAL jsonb_array_elements(plans.prefix_program->'actions') action_value
  WHERE plans.session_id=NEW.session_id AND plans.prefix_program_hash=q->>'prefixProgramHash'
   AND action_value->'coordinate'=q->'coordinate';
 IF NOT studio_wi6_prefix_source_identity(frozen_action,q)
  THEN RAISE EXCEPTION 'prefix source mode or operation invalid'; END IF;
 IF NOT q ? 'assertSourceBinding' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT a FROM studio_guided_actions prior_action WHERE prior_action.session_id=NEW.session_id
  AND prior_action.admission_id=q->'assertSourceBinding'->>'producerAdmissionId';
 SELECT prepared.proof INTO STRICT p FROM studio_guided_preparations prepared WHERE prepared.session_id=NEW.session_id
  AND prepared.preparation_id=q->'assertSourceBinding'->>'producerPreparationId' AND prepared.admission_id=a.admission_id;
 SELECT produced.document INTO STRICT producer_document FROM studio_guided_producers produced
  WHERE produced.session_id=NEW.session_id AND produced.binding_id=q->'assertSourceBinding'->>'bindingId'
   AND produced.admission_id=a.admission_id;
 IF NOT studio_wi6_read_producer_metadata(producer_document,a.document,a.proposal,p,q->'assertSourceBinding')
  THEN RAISE EXCEPTION 'prefix producer receipt mismatch'; END IF;
 IF (a.document->>'state'='SUCCEEDED' AND a.document->>'outcomeCode'='OK' AND a.document->>'dispatchCount'='1'
  AND a.document->>'preparationId'=q->'assertSourceBinding'->>'producerPreparationId'
  AND a.proposal->'operation'->>'kind'='read'
  AND a.proposal->'operation'->'bindingId'=q->'assertSourceBinding'->'bindingId'
  AND EXISTS(SELECT 1 FROM studio_guided_producers producer WHERE producer.session_id=NEW.session_id
    AND producer.binding_id=q->'assertSourceBinding'->>'bindingId' AND producer.admission_id=a.admission_id)
  AND EXISTS(SELECT 1 FROM studio_guided_allocations allocation,
    LATERAL jsonb_array_elements(allocation.document->'consumers') c
    WHERE allocation.session_id=NEW.session_id AND allocation.binding_id=q->'assertSourceBinding'->>'bindingId'
    AND c->'stepId'=q->'coordinate'->'stepId' AND c->>'argumentSlot'='assert.expected')) IS NOT TRUE
 THEN RAISE EXCEPTION 'prefix source producer mismatch'; END IF;
 FOREACH field IN ARRAY ARRAY['sessionId','contextId','contextRevision','authoredInputsHash','workerId','ownerFence','scopeHash','sourceRevision','configurationRevision'] LOOP
  IF p->field IS DISTINCT FROM q->field THEN RAISE EXCEPTION 'prefix source authority mismatch'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_wi6_source_request BEFORE INSERT ON studio_guided_prefix_requests FOR EACH ROW EXECUTE FUNCTION studio_wi6_source_request_guard();
CREATE TRIGGER tr_wi6_source_receipt BEFORE INSERT ON studio_guided_no_invocation_receipts FOR EACH ROW EXECUTE FUNCTION studio_wi6_source_request_guard();

-- WI6: current closed metadata and source/ordinal joins. No history rewriting or value export.
CREATE FUNCTION studio_wi6_press_metadata(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (p='null'::jsonb OR (studio_publication_closed(p,ARRAY['kind','predecessorAdmissionId','predecessorRequestDigest','predecessorOperationHash','predecessorCoordinate','documentId'],4096)
 AND p->>'kind'='same-element-press' AND studio_publication_strings(p,ARRAY['predecessorAdmissionId','documentId'])
 AND p->>'predecessorRequestDigest' ~ '^[a-f0-9]{64}$' AND p->>'predecessorOperationHash' ~ '^[a-f0-9]{64}$'
 AND studio_publication_closed(p->'predecessorCoordinate',ARRAY['stepId','ordinal'],1024)
 AND studio_publication_strings(p->'predecessorCoordinate',ARRAY['stepId'])
 AND studio_publication_uint31(p->'predecessorCoordinate'->'ordinal') AND (p->'predecessorCoordinate'->>'ordinal')::integer<=7)) IS TRUE
$$;
CREATE FUNCTION studio_wi6_fact_relations(o jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
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
   IF NOT studio_publication_closed(f->'readScope',ARRAY['relation','sourceRefs'],1024) OR f->'readScope'->>'relation' NOT IN ('SAME_ROW_LABEL','IMMEDIATE_HEADING_SAME_PARENT','R7_ADJACENT_PUBLIC') THEN RETURN false; END IF;
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(jsonb_build_array(COALESCE(f->'scopeRefs','null'::jsonb),COALESCE(f->'readScope'->'sourceRefs','null'::jsonb))) LOOP
   IF r='null'::jsonb THEN CONTINUE; END IF;
   IF jsonb_typeof(r)<>'array' OR jsonb_array_length(r) NOT BETWEEN 1 AND 8 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(r))<>jsonb_array_length(r) THEN RETURN false; END IF;
   FOR source IN SELECT value FROM jsonb_array_elements(r) LOOP
    IF jsonb_typeof(source)<>'string' OR source#>>'{}'=k OR COALESCE(source#>>'{}','') !~ '^e[0-9]{1,6}$' OR NOT o->'facts' ? (source#>>'{}')
     OR o->'facts'->(source#>>'{}')->'nameComplete'<>'true'::jsonb OR o->'facts'->(source#>>'{}')->'editable'<>'false'::jsonb OR o->'facts'->(source#>>'{}')->>'role' NOT IN ('form','dialog','alertdialog','region','search','navigation','main','row','article','listitem','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','complementary','list','heading','cell','gridcell','rowheader','columnheader','text','paragraph','strong','status','link') OR length(o->'facts'->(source#>>'{}')->>'name') NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
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
   AND (f-ARRAY['role','name','editable','evidence','evidenceSegments','text','nameComplete','ownTextComplete','ordinal','nearSource','readScope','scopeRefs'])='{}'::jsonb
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
 ADD CONSTRAINT ck_publication_preparation_shape CHECK((studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt','target','pressInheritance'],16384) AND studio_wi6_press_metadata(proof->'pressInheritance')
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


ALTER TABLE studio_guided_preparations ADD CONSTRAINT ck_wi6_preparation_metadata CHECK((studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt','target','pressInheritance'],16384) AND studio_wi6_press_metadata(proof->'pressInheritance')) IS TRUE) NOT VALID;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='studio_guided_model_attempts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%intent_path%' AND pg_get_constraintdef(oid) LIKE '%SELECTED_CHOICE%' LOOP
 EXECUTE format('ALTER TABLE studio_guided_model_attempts DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE studio_guided_model_attempts ADD CONSTRAINT ck_wi6_intent_path CHECK(intent_path IS NULL OR (status='APPLIED' AND kind='NEXT_ACTION' AND intent_path IN ('EXACT_NAME','EVIDENCE_SUBSET','SELECTED_CHOICE','SCOPE_EVIDENCE')));
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint WHERE conrelid IN ('studio_guided_prefix_requests'::regclass,'studio_guided_no_invocation_receipts'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%studio_publication_closed(document,%' LOOP
 EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',c.relation,c.conname); END LOOP;
END $$;
ALTER TABLE studio_guided_prefix_requests ADD CONSTRAINT ck_wi6_prefix_closed CHECK((studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','pressInheritance'],8192) AND studio_wi6_press_metadata(document->'pressInheritance')) IS TRUE) NOT VALID;
ALTER TABLE studio_guided_no_invocation_receipts ADD CONSTRAINT ck_wi6_receipt_closed CHECK((studio_publication_closed(document,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','prefixProgramHash','coordinate','evidenceHash','pressInheritance','requestDigest','admissionId','preparationId','attemptOrdinal','operationHash','phase','nativeInvocationStarted','reason','receiptHash'],16384) AND studio_wi6_press_metadata(document->'pressInheritance')) IS TRUE) NOT VALID;

-- Safe metadata cannot substitute a sibling proof or a failed/multi-action predecessor.
CREATE FUNCTION studio_wi6_press_join_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof jsonb; proposal jsonb; inherited jsonb; prior studio_guided_actions; predecessor jsonb; field text; n integer;
BEGIN
 IF TG_TABLE_NAME='studio_guided_preparations' THEN
  proof:=NEW.proof;
  SELECT DISTINCT o.proposal INTO proposal FROM studio_guided_obligation_admissions o WHERE o.session_id=NEW.session_id AND o.proposal_digest=NEW.request_digest;
 ELSIF TG_TABLE_NAME='studio_guided_publication_preparations' THEN proof:=NEW.proof; proposal:=NEW.proposal;
 ELSE
  proposal:=NEW.proposal;
  SELECT p.proof INTO STRICT proof FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id AND p.preparation_id=NEW.document->>'preparationId';
 END IF;
 inherited:=proof->'pressInheritance';
 IF inherited='null'::jsonb THEN RETURN NEW; END IF;
 IF NOT studio_wi6_press_metadata(inherited) OR proposal->'operation'->>'kind' IS DISTINCT FROM 'press'
  OR proposal->'target'->>'kind' IS DISTINCT FROM 'node' OR proposal->'coordinate'->>'ordinal' IS DISTINCT FROM '0'
  OR proposal->'target'->>'documentId' IS DISTINCT FROM inherited->>'documentId'
 THEN RAISE EXCEPTION 'press inheritance operation invalid'; END IF;
 SELECT * INTO STRICT prior FROM studio_guided_actions a WHERE a.session_id=NEW.session_id AND a.admission_id=inherited->>'predecessorAdmissionId';
 SELECT p.proof INTO STRICT predecessor FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id AND p.preparation_id=prior.document->>'preparationId';
 SELECT count(*) INTO n FROM studio_guided_actions a WHERE a.session_id=NEW.session_id AND a.step_id=prior.step_id;
 IF (n=1 AND prior.document->>'state'='SUCCEEDED' AND prior.document->>'outcomeCode'='OK' AND prior.document->>'dispatchCount'='1'
  AND prior.attempt_ordinal=0 AND prior.ordinal=0 AND prior.proposal->'operation'->>'kind' IN ('fill','click','check')
  AND prior.proposal->'target'->>'kind'='node' AND NOT COALESCE(prior.proposal->'operation'->'value'->>'kind'='secretRef',false)
  AND prior.document->'coordinate'=inherited->'predecessorCoordinate'
  AND prior.document->>'requestDigest'=inherited->>'predecessorRequestDigest'
  AND prior.document->>'operationHash'=inherited->>'predecessorOperationHash'
  AND prior.document->>'documentId'=inherited->>'documentId'
  AND prior.proposal->'executionEvidence'->'origin'=proposal->'executionEvidence'->'origin') IS NOT TRUE THEN RAISE EXCEPTION 'press predecessor mismatch'; END IF;
 FOREACH field IN ARRAY ARRAY['contextId','contextRevision','authoredInputsHash','sourceRevision','configurationRevision','scopeHash','workerId','ownerFence'] LOOP
  IF predecessor->field IS DISTINCT FROM proof->field THEN RAISE EXCEPTION 'press predecessor authority mismatch'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM studio_guided_source_manifests m,
  LATERAL jsonb_array_elements(m.manifest->'sourceSteps') WITH ORDINALITY current_step(value,position),
  LATERAL jsonb_array_elements(m.manifest->'sourceSteps') WITH ORDINALITY prior_step(value,position)
  WHERE m.session_id=NEW.session_id AND current_step.value->>'stepId'=proposal->'coordinate'->>'stepId'
  AND prior_step.value->>'stepId'=prior.step_id AND current_step.position=prior_step.position+1)
 THEN RAISE EXCEPTION 'press predecessor source order mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_wi6_press_preparation BEFORE INSERT ON studio_guided_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_press_join_guard();
CREATE TRIGGER tr_wi6_press_publication BEFORE INSERT ON studio_guided_publication_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_press_join_guard();
CREATE TRIGGER tr_wi6_press_action BEFORE INSERT ON studio_guided_actions FOR EACH ROW EXECUTE FUNCTION studio_wi6_press_join_guard();

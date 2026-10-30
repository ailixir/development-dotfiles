-- ADR-SC-007 (WI-3): the observation is an outline plus a facts table, a target is a ref, the runner
-- reports the locator the plan carries, and every grounding refusal and every admitted pick is
-- recorded. Schema statements only: no INSERT, UPDATE or DELETE of data (ADR D8). Forward-only.
--
-- Constraint names are looked up from pg_constraint, never assumed, as V23 does. The two new
-- publication-observation CHECK constraints are added NOT VALID: new rows are enforced and old rows
-- are not scanned, so this migration applies to a database that still holds old-shape rows. Those
-- rows survive; every session started under the old schema pins is refused at the application
-- (RUNTIME_INCOMPATIBLE), and recreating the development database remains the clean path.

-- 1. Gate audit on the model attempt (D5): the first grounding gate that refused a REJECTED NEXT_ACTION,
--    and how the intent gate admitted an APPLIED NEXT_ACTION ACTION (the D7(d) record). All three
--    columns are nullable closed tokens chosen by the Java allowlist; none is a message or a body.
ALTER TABLE studio_guided_model_attempts
 ADD COLUMN rejection_gate varchar(40)
 CHECK (rejection_gate IS NULL OR (status='REJECTED' AND rejection_gate ~ '^[A-Z0-9_]{1,40}$')),
 ADD COLUMN intent_path varchar(16)
 CHECK (intent_path IS NULL OR (status='APPLIED' AND kind='NEXT_ACTION' AND intent_path IN ('EXACT_NAME','EVIDENCE_SUBSET','SELECTED_CHOICE'))),
 ADD COLUMN intent_fields varchar(80)
 CHECK (intent_fields IS NULL OR (intent_path IS NOT NULL AND intent_fields ~ '^(name|placeholder|near|ownText|text|group|header|sibling)(,(name|placeholder|near|ownText|text|group|header|sibling)){0,7}$'));

-- The V23 guard refuses an UPDATE that changes a column outside its transition list; the one UPDATE
-- that finishes an attempt now also sets these three. Everything else is the V23 body verbatim.
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
 IF (to_jsonb(OLD)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at','rejection_reason','rejection_gate','intent_path','intent_fields'])
   IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at','rejection_reason','rejection_gate','intent_path','intent_fields'])
   OR (OLD.status NOT IN ('RESERVED','CALLING') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
   OR (OLD.status='CALLING' AND NEW.status='RESERVED') THEN RAISE EXCEPTION 'guided attempt transition refused'; END IF;
 RETURN NEW;
END $$;

-- The runner-time gate that ended a run (progress.refusalGate, D5) is a closed token like errorCode and
-- survives the prune the same way.
CREATE OR REPLACE FUNCTION studio_guided_progress_retained_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['stepIndex','errorCode','detail','teardownStatus','publicationRevisionId','publicationRevisionDigest','evidenceRef','refusalGate']::text[]
$$;

-- 2. Publication observations (D1, D17): outline + facts, 512 KiB per row.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='studio_guided_publication_observations'::regclass AND contype='c'
   AND conname<>'ck_publication_observation_shape' AND pg_get_constraintdef(oid) LIKE '%nodes%'
 LOOP
  EXECUTE format('ALTER TABLE studio_guided_publication_observations DROP CONSTRAINT %I', c.conname);
 END LOOP;
END $$;
ALTER TABLE studio_guided_publication_observations
 ADD CONSTRAINT ck_publication_observation_closed CHECK(studio_publication_closed(observation,ARRAY['schemaVersion','sessionId','documentId','generation','origin','scopeHash','observedAt','coverage','projection','readRuleId','outline','facts'],524288)) NOT VALID,
 ADD CONSTRAINT ck_publication_observation_identity CHECK((observation->>'documentId'=document_id AND (observation->>'generation')::integer=generation AND jsonb_typeof(observation->'facts')='object') IS TRUE) NOT VALID;

-- Integer 0..2147483647 as the canonical JSON number lexeme.
CREATE OR REPLACE FUNCTION studio_publication_uint31(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (jsonb_typeof(v)='number' AND v::text ~ '^(0|[1-9][0-9]{0,9})$' AND v::text::bigint<=2147483647) IS TRUE
$$;

-- The closed shape of a new-shape observation. CREATE OR REPLACE does not re-validate stored rows,
-- and the named V15 constraint keeps calling this function.
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
  IF (jsonb_typeof(f)='object' AND f ?& ARRAY['role','name','editable','evidence','evidenceSegments']
   AND (f-ARRAY['role','name','editable','evidence','evidenceSegments','text'])='{}'::jsonb
   AND jsonb_typeof(f->'role')='string' AND length(f->>'role') BETWEEN 1 AND 64
   AND jsonb_typeof(f->'name')='string' AND length(f->>'name') BETWEEN 0 AND 256
   AND jsonb_typeof(f->'editable')='boolean'
   AND jsonb_typeof(f->'evidence')='string' AND length(f->>'evidence') BETWEEN 0 AND 256
   AND (NOT f ? 'text' OR (jsonb_typeof(f->'text')='string' AND length(f->>'text') BETWEEN 0 AND 256))
   AND jsonb_typeof(f->'evidenceSegments')='array' AND jsonb_array_length(f->'evidenceSegments')<=128) IS NOT TRUE THEN RETURN false; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(f->'evidenceSegments') LOOP
   IF (studio_publication_closed(s,ARRAY['field','start','end'],256)
    AND s->>'field' IN ('name','placeholder','near','ownText','text','group','header','sibling')
    AND studio_publication_uint31(s->'start') AND studio_publication_uint31(s->'end')
    AND (s->>'start')::integer<=(s->>'end')::integer AND (s->>'end')::integer<=512) IS NOT TRUE THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;

-- 3. Publication preparations (D2): the proof carries the runner-reported target.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='studio_guided_publication_preparations'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%studio_publication_closed(proof%'
 LOOP
  EXECUTE format('ALTER TABLE studio_guided_publication_preparations DROP CONSTRAINT %I', c.conname);
 END LOOP;
END $$;
ALTER TABLE studio_guided_publication_preparations
 ADD CONSTRAINT ck_publication_preparation_shape CHECK((studio_publication_closed(proof,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','preparationId','requestDigest','evidenceHash','authoredInputsHash','expiresAt','target'],16384)
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

-- 4. Evidence guard (D2, D9): 4 MiB of observation evidence per session, and the admission
--    operationHash is sha256(canonical-v1({coordinate, origin, target, operation})) with target the
--    runner-reported target of the preparation proof (null for page, password control and navigate).
--    Everything else is the V15 body verbatim.
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
  IF n>=400 OR b+octet_length(convert_to(jsonb_build_array(NEW.execution_evidence,NEW.proposal,NEW.proof)::text,'UTF8'))>2097152 THEN RAISE EXCEPTION 'publication preparation limit'; END IF;
 ELSE
  SELECT * INTO STRICT a FROM studio_guided_actions WHERE session_id=NEW.session_id AND admission_id=NEW.admission_id;
  SELECT * INTO STRICT o FROM studio_guided_obligation_admissions WHERE session_id=NEW.session_id AND obligation_id=NEW.obligation_id;
  SELECT * INTO STRICT p FROM studio_guided_preparations WHERE session_id=NEW.session_id AND preparation_id=NEW.preparation_id;
  IF NEW.proposal_hash<>studio_publication_hash(a.proposal) OR a.document->>'operationHash' IS DISTINCT FROM studio_publication_hash(jsonb_build_object('coordinate',a.proposal->'coordinate','origin',COALESCE(a.proposal->'executionEvidence'->'origin','null'::jsonb),'target',COALESCE(p.proof->'target','null'::jsonb),'operation',a.proposal->'operation')) OR a.document->>'preparationId' IS DISTINCT FROM NEW.preparation_id OR a.document->>'requestDigest' IS DISTINCT FROM NEW.proposal_hash
   OR o.admission_id IS DISTINCT FROM NEW.admission_id OR o.proposal_digest<>NEW.proposal_hash OR p.admission_id IS DISTINCT FROM NEW.admission_id
  THEN RAISE EXCEPTION 'publication admission mismatch'; END IF;
  SELECT count(*) INTO n FROM studio_guided_publication_admissions WHERE session_id=NEW.session_id;
  IF n>=200 THEN RAISE EXCEPTION 'publication admission limit'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- 5. The observed-choice receipt answer no longer carries a node id (D6): a ref is meaningful only
--    inside its generation, and the choice is bound to its meaning by choiceId.
CREATE OR REPLACE FUNCTION studio_publication_observed_choice_receipt(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a jsonb; coordinate jsonb; parsed_time timestamptz;
BEGIN
 IF (studio_publication_closed(d,ARRAY['version','sessionId','preparationId','clarificationId','obligationId','contextIdentityHash','meaningsHash','questionCaptureHash','acceptedChoiceId','answer'],2147483647)
  AND d->'version'='1'::jsonb
  AND studio_publication_strings(d,ARRAY['sessionId','preparationId','clarificationId','acceptedChoiceId'])
  AND studio_publication_strings(d,ARRAY['obligationId'],'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  AND studio_publication_strings(d,ARRAY['contextIdentityHash','meaningsHash','questionCaptureHash'],'^[a-f0-9]{64}$')
  AND octet_length(convert_to(studio_publication_canonical(d),'UTF8'))<=16384) IS NOT TRUE THEN RETURN false; END IF;
 a:=d->'answer'; coordinate:=a->'coordinate';
 IF (studio_publication_closed(a,ARRAY['sessionId','scopeHash','clarificationId','coordinate','documentId','generation','choiceId','bindingId','sourceRevision','configurationRevision','resolvedAt'],2147483647)
  AND studio_publication_strings(a,ARRAY['sessionId','clarificationId','documentId','choiceId'])
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

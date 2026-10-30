-- STUDIO-GOV-001.4: origins come from the test and the runner's deny list; the deployment trusted policy,
-- the observation application policy and every policy identity leave the contracts.
-- Forward-only on top of V1-V25. Studio is unreleased: existing revisions are learned again, so no row
-- is converted. Three guards named the removed fields in their closed key lists; each is replaced with
-- its body unchanged except for those keys (CREATE OR REPLACE keeps its trigger).
--
--   1. studio_publication_scope (V15): the replay scope no longer carries applicationId, policyId,
--      policyVersion or entryPolicyId.
--   2. studio_observed_execution_guard (V15): the execution binding, replay grant and admission request
--      no longer carry currentPolicyHash (it hashed the trusted policy).
--   3. studio_015_delivery_guard (V21): the context metadata key list no longer names applicationPolicy
--      or policyHash (the runner owns the read profile).

CREATE OR REPLACE FUNCTION studio_publication_scope(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF (studio_publication_closed(p,ARRAY['principalId','csiId','environment','allowedOrigins','capabilities','initialContext'],32768)
 AND studio_publication_strings(p,ARRAY['principalId','csiId','environment'])
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
 IF (studio_publication_closed(b,ARRAY['version','executionId','startedAt','attemptId','revisionId','revisionDigest','testId','csiId','principalId','environment','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','requiredProfile','requiredBuild','scope','scopeHash','replayGrant'],32768)
  AND b->'version'='1'::jsonb
  AND studio_publication_strings(b,ARRAY['executionId','attemptId','revisionId','testId'],uuid_pattern)
  AND studio_publication_strings(b,ARRAY['revisionDigest','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','scopeHash'],hash_pattern)
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
 IF (studio_publication_closed(g,ARRAY['version','grantId','executionId','attemptId','revisionId','revisionDigest','principalId','csiId','scopeHash','profileHash','buildHash','issuedAt','expiresAt'],8192)
  AND g->'version'='1'::jsonb
  AND studio_publication_strings(g,ARRAY['grantId','executionId','attemptId','revisionId'],uuid_pattern)
  AND studio_publication_strings(g,ARRAY['revisionDigest','scopeHash','profileHash','buildHash'],hash_pattern)
  AND studio_publication_strings(g,ARRAY['principalId','csiId'])
  AND studio_publication_strings(g,ARRAY['issuedAt','expiresAt'],time_pattern)
  AND g->'executionId'=b->'executionId' AND g->'attemptId'=b->'attemptId' AND g->'revisionId'=b->'revisionId' AND g->'revisionDigest'=b->'revisionDigest'
  AND g->'principalId'=b->'principalId' AND g->'csiId'=b->'csiId' AND g->'scopeHash'=b->'scopeHash'
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
   AND studio_publication_closed(q,ARRAY['schemaVersion','kind','executionId','startedAt','attemptId','runnerInstanceId','admissionId','revisionId','revisionDigest','artifactHash','configurationHash','learnedPlanHash','referencePolicyHash','publicationEvidenceHash','scopeHash','grantId','profile','build'],16384)
   AND q->'schemaVersion'='3'::jsonb AND q->>'kind'='observed' AND studio_publication_strings(q,ARRAY['runnerInstanceId'])
   AND q->'admissionId'=receipt->'admissionId' AND q->'executionId'=b->'executionId' AND q->'startedAt'=b->'startedAt' AND q->'attemptId'=b->'attemptId'
   AND q->'revisionId'=b->'revisionId' AND q->'revisionDigest'=b->'revisionDigest' AND q->'artifactHash'=b->'artifactHash' AND q->'configurationHash'=b->'configurationHash'
   AND q->'learnedPlanHash'=b->'learnedPlanHash' AND q->'referencePolicyHash'=b->'referencePolicyHash' AND q->'publicationEvidenceHash'=b->'publicationEvidenceHash'
   AND q->'scopeHash'=b->'scopeHash' AND q->'grantId'=g->'grantId' 
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

CREATE OR REPLACE FUNCTION studio_015_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m studio_guided_materializations; s studio_guided_sessions; p studio_guided_relearn_plans; has_plan boolean; full_context jsonb; metadata_keys text[]:=ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','expiresAt','leaseExpiresAt','approvedOrigins','sourceStepIds','authoredInputsHash','materializationRevision','allocations','producers','consumerEdges','limits'];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'delivery immutable'; END IF;
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
 SELECT * INTO STRICT m FROM studio_guided_materializations WHERE session_id=NEW.session_id;
 IF NEW.context_revision<>m.context_revision OR NEW.authored_inputs_hash<>m.authored_inputs_hash OR NEW.materialization_revision<>m.materialization_revision
 THEN RAISE EXCEPTION 'delivery does not name head'; END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.status<>'PENDING' OR NEW.ack IS NOT NULL OR NEW.context_metadata IS NOT NULL THEN RAISE EXCEPTION 'delivery starts pending and unissued'; END IF;
 RETURN NEW;
 END IF;
 IF OLD.status<>'PENDING' OR (to_jsonb(OLD)-ARRAY['status','ack','context_metadata','context_hash']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','ack','context_metadata','context_hash'])
 THEN RAISE EXCEPTION 'delivery identity immutable'; END IF;
 IF OLD.context_metadata IS NULL THEN
 IF NEW.status<>'PENDING' OR NEW.ack IS NOT NULL OR NOT studio_publication_closed(NEW.context_metadata-ARRAY['prefixProgram','prefixProgramHash'],metadata_keys,2147483647)
 THEN RAISE EXCEPTION 'delivery must issue exact bounded context before ACK'; END IF;
 -- The optional program pair is present for every pinned-base session, including
 -- EMPTY_PREFIX, and never changes after switching to suffix learning.
 SELECT * INTO p FROM studio_guided_relearn_plans WHERE session_id=NEW.session_id;
 has_plan:=FOUND;
 IF (NEW.context_metadata ? 'prefixProgram') IS DISTINCT FROM has_plan
 OR (NEW.context_metadata ? 'prefixProgramHash') IS DISTINCT FROM has_plan
 OR (has_plan AND (NEW.context_metadata->'prefixProgram' IS DISTINCT FROM p.prefix_program
 OR NEW.context_metadata->>'prefixProgramHash' IS DISTINCT FROM p.prefix_program_hash::text))
 THEN RAISE EXCEPTION 'issued context prefix program identity invalid'; END IF;
 full_context:=NEW.context_metadata||jsonb_build_object('authoredInputs',m.authored_inputs);
 IF NEW.context_hash IS DISTINCT FROM studio_publication_hash(full_context) OR octet_length(convert_to(studio_publication_canonical(full_context),'UTF8'))>1048576
 OR NEW.context_metadata->>'contextId' IS DISTINCT FROM m.context_id
 OR NEW.context_metadata->>'sessionId' IS DISTINCT FROM m.session_id
 OR NEW.context_metadata->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR NEW.context_metadata->>'contextRevision' IS DISTINCT FROM m.context_revision::text
 OR NEW.context_metadata->>'authoredInputsHash' IS DISTINCT FROM m.authored_inputs_hash::text
 OR NEW.context_metadata->>'materializationRevision' IS DISTINCT FROM m.materialization_revision::text
 OR NEW.context_metadata->>'workerId' IS DISTINCT FROM m.worker_id
 OR NEW.context_metadata->>'ownerFence' IS DISTINCT FROM m.owner_fence::text
 OR NEW.context_metadata->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR NEW.context_metadata->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR NEW.context_metadata->>'expiresAt' IS DISTINCT FROM s.document->>'expiresAt'
 OR NEW.context_metadata->>'leaseExpiresAt' IS DISTINCT FROM s.document->'owner'->>'leaseExpiresAt'
 THEN RAISE EXCEPTION 'issued context identity invalid'; END IF;
 RETURN NEW;
 END IF;
 IF NEW.context_metadata IS DISTINCT FROM OLD.context_metadata OR NEW.context_hash IS DISTINCT FROM OLD.context_hash
 OR NEW.status<>'ACKNOWLEDGED'
 OR NOT studio_publication_closed(NEW.ack,ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','materializationRevision','authoredInputsHash','contextHash','deliveryId'],8192)
 OR NEW.ack->>'sessionId' IS DISTINCT FROM NEW.session_id OR NEW.ack->>'deliveryId' IS DISTINCT FROM NEW.delivery_id::text
 OR NEW.ack->>'contextHash' IS DISTINCT FROM NEW.context_hash::text
 OR NEW.ack->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR NEW.ack->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR NEW.ack->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR NEW.ack->>'workerId' IS DISTINCT FROM m.worker_id OR NEW.ack->>'ownerFence' IS DISTINCT FROM m.owner_fence::text
 OR NEW.ack->>'contextId' IS DISTINCT FROM m.context_id OR NEW.ack->>'contextRevision' IS DISTINCT FROM m.context_revision::text
 OR NEW.ack->>'materializationRevision' IS DISTINCT FROM m.materialization_revision::text OR NEW.ack->>'authoredInputsHash' IS DISTINCT FROM m.authored_inputs_hash::text
 OR NEW.ack->>'schemaVersion' IS DISTINCT FROM '3' OR NOT m.live
 OR s.document->'owner'->>'workerId' IS DISTINCT FROM m.worker_id OR s.document->'owner'->>'fence' IS DISTINCT FROM m.owner_fence::text
 OR (s.document->'owner'->>'leaseExpiresAt')::timestamptz<=clock_timestamp() OR s.expires_at<=clock_timestamp()
 OR (NEW.context_metadata->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
 THEN RAISE EXCEPTION 'delivery ACK identity invalid'; END IF;
 RETURN NEW;
END $$;

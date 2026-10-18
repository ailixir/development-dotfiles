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

-- ARCH015-03: this is the existing server-issued side-effect confirmation, never a generic
-- clarification exemption. SQL binds stored authority; authenticated answer/native facts remain
-- application/runner responsibilities. Volatile runner preparation expiry is intentionally absent.
CREATE FUNCTION studio_015_prefix_confirmation_wait(id text,d jsonb,pr jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE s studio_guided_sessions; m studio_guided_materializations; p studio_guided_relearn_plans;
 q studio_guided_prefix_requests; marker jsonb:=pr->'sideEffectConfirmation'; question jsonb:=pr->'clarification';
 choice jsonb; coordinate jsonb; evidence jsonb:=pr->'executionEvidence';
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=id;
 SELECT * INTO STRICT m FROM studio_guided_materializations WHERE session_id=id;
 SELECT * INTO STRICT p FROM studio_guided_relearn_plans WHERE session_id=id;
 IF NOT studio_015_prefix_pending(id) OR NOT m.live OR studio_015_delivery_pending(id)
 OR (SELECT continuation FROM studio_guided_translation_state WHERE session_id=id) IS DISTINCT FROM 'REPLAYING_PREFIX'
 OR s.expires_at<=clock_timestamp() OR (d->'owner'->>'leaseExpiresAt')::timestamptz<=clock_timestamp()
 OR (pr ? 'observationRefresh')
 OR NOT studio_publication_closed(marker,ARRAY['clarificationId','status','prefixRequestDigest'],8192)
 OR marker->>'status' IS DISTINCT FROM 'PENDING'
 OR NOT studio_publication_strings(marker,ARRAY['clarificationId'])
 OR NOT studio_publication_strings(marker,ARRAY['prefixRequestDigest'],'^[a-f0-9]{64}$')
 OR NOT studio_publication_closed(question,ARRAY['schemaVersion','clarificationId','sessionId','scopeHash','coordinate','documentId','generation','reason','promptCode','choices','expiresAt','phase'],16384)
 OR question->'schemaVersion' IS DISTINCT FROM '3'::jsonb
 OR question->>'clarificationId' IS DISTINCT FROM marker->>'clarificationId'
 OR question->>'sessionId' IS DISTINCT FROM id OR question->>'scopeHash' IS DISTINCT FROM s.scope_hash::text
 OR question->>'reason' IS DISTINCT FROM 'SIDE_EFFECT_CONFIRMATION'
 OR question->>'promptCode' IS DISTINCT FROM 'CONFIRM_ACTION' OR question->>'phase' IS DISTINCT FROM 'observed'
 OR NOT studio_publication_strings(question,ARRAY['documentId','expiresAt'])
 OR jsonb_typeof(question->'generation') IS DISTINCT FROM 'number'
 OR (question->>'generation')::numeric NOT BETWEEN 0 AND 2147483647
 OR (question->>'expiresAt')::timestamptz<=clock_timestamp()
 OR (question->>'expiresAt')::timestamptz>s.expires_at
 OR jsonb_typeof(question->'choices') IS DISTINCT FROM 'array' OR jsonb_array_length(question->'choices')<>1
 OR EXISTS(SELECT 1 FROM studio_guided_actions WHERE session_id=id AND document->>'state' IN ('ADMITTED','DISPATCHING','UNKNOWN_OUTCOME'))
 OR EXISTS(SELECT 1 FROM studio_guided_preparations WHERE session_id=id AND admission_id IS NULL AND expires_at>clock_timestamp())
 OR EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=id AND status IN ('RESERVED','CALLING'))
 THEN RETURN false; END IF;
 choice:=question->'choices'->0;
 IF NOT studio_publication_closed(choice,ARRAY['choiceId','safeLabel','labelSource','nodeId','bindingId'],4096)
 OR NOT studio_publication_strings(choice,ARRAY['choiceId','safeLabel'])
 OR choice->>'labelSource' IS DISTINCT FROM 'AUTHORED' OR choice->'bindingId' IS DISTINCT FROM 'null'::jsonb
 OR NOT(choice->'nodeId'='null'::jsonb OR studio_publication_strings(choice,ARRAY['nodeId']))
 THEN RETURN false; END IF;
 SELECT * INTO STRICT q FROM studio_guided_prefix_requests WHERE session_id=id AND request_digest=marker->>'prefixRequestDigest';
 SELECT value->'coordinate' INTO coordinate FROM jsonb_array_elements(p.prefix_program->'actions') WITH ORDINALITY op(value,n)
 WHERE NOT EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=id
 AND a.document->'coordinate'=value->'coordinate' AND a.document->>'state'='SUCCEEDED'
 AND a.document->>'dispatchCount'='1' AND a.attempt_ordinal=0 AND a.document->>'operationHash'=value->>'operationHash')
 ORDER BY n LIMIT 1;
 IF coordinate IS NULL OR q.status<>'PREPARED' OR q.document->'coordinate' IS DISTINCT FROM coordinate
 OR question->'coordinate' IS DISTINCT FROM coordinate
 OR NOT studio_publication_closed(question->'coordinate',ARRAY['stepId','ordinal'],1024)
 OR EXISTS(SELECT 1 FROM studio_guided_actions a WHERE a.session_id=id AND a.document->'coordinate'=coordinate)
 OR q.document->>'schemaVersion' IS DISTINCT FROM '3' OR q.document->>'sessionId' IS DISTINCT FROM id
 OR q.document->>'prefixProgramHash' IS DISTINCT FROM p.prefix_program_hash::text
 OR q.document->>'workerId' IS DISTINCT FROM d->'owner'->>'workerId'
 OR q.document->>'ownerFence' IS DISTINCT FROM d->'owner'->>'fence'
 OR d->'owner'->>'workerId' IS DISTINCT FROM m.worker_id OR d->'owner'->>'fence' IS DISTINCT FROM m.owner_fence::text
 OR q.document->>'scopeHash' IS DISTINCT FROM m.scope_hash::text OR d->>'scopeHash' IS DISTINCT FROM m.scope_hash::text
 OR q.document->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR q.document->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR d->'scope'->>'sourceRevision' IS DISTINCT FROM m.source_revision
 OR d->'scope'->>'configurationRevision' IS DISTINCT FROM m.configuration_revision
 OR q.document->>'contextId' IS DISTINCT FROM m.context_id OR q.document->>'contextRevision' IS DISTINCT FROM m.context_revision::text
 OR q.document->>'authoredInputsHash' IS DISTINCT FROM m.authored_inputs_hash::text
 OR NOT studio_015_current_version(id,q.document)
 OR q.document->>'evidenceHash' IS DISTINCT FROM pr->>'evidenceHash'
 OR q.document->>'evidenceHash' IS DISTINCT FROM studio_publication_hash(evidence)
 OR question->'documentId' IS DISTINCT FROM pr->'documentId' OR question->'generation' IS DISTINCT FROM pr->'generation'
 OR question->'documentId' IS DISTINCT FROM evidence->'documentId' OR question->'generation' IS DISTINCT FROM evidence->'generation'
 OR evidence->>'sessionId' IS DISTINCT FROM id OR evidence->>'contextId' IS DISTINCT FROM m.context_id
 OR evidence->>'kind' IS DISTINCT FROM 'observedDocument'
 OR evidence->>'observationHash' IS DISTINCT FROM studio_publication_hash(pr->'observation')
 OR NOT EXISTS(SELECT 1 FROM studio_guided_publication_observations o WHERE o.session_id=id
 AND o.observation_hash=evidence->>'observationHash' AND o.observation=pr->'observation'
 AND o.context_id=m.context_id AND o.owner_fence=m.owner_fence)
 OR NOT EXISTS(SELECT 1 FROM studio_guided_session_policies sp
 JOIN studio_guided_policy_versions v ON v.policy_id=sp.policy_id AND v.version=sp.policy_version
 JOIN studio_guided_policy_approvals approval ON approval.policy_id=v.policy_id AND approval.version=v.version
 WHERE sp.session_id=id AND v.document->>'sideEffectStance'='CLARIFY_FIRST'
 AND sp.observation_policy_hash=v.observation_policy_hash
 AND v.observation_policy_hash=studio_publication_hash(v.document->'applicationPolicy')
 AND v.document_hash=studio_publication_hash(v.document))
 THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN no_data_found OR data_exception THEN RETURN false;
END $$;

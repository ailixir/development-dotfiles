-- STUDIO-FLEX-001: the domain allow-list is deployment configuration, not session or replay data.
-- Forward-only on top of V1-V27. Studio is unreleased: revisions published before this are refused at
-- Run (RUNTIME_INCOMPATIBLE) and learned again, so no row is converted. Two guards named the removed
-- fields; each is replaced with its body unchanged except for those keys (CREATE OR REPLACE keeps its
-- trigger).
--
--   1. studio_publication_scope (V26): the replay scope no longer carries allowedOrigins. The origin
--      pattern check stays for initialContext.origin, the one origin a scope still names.
--   2. studio_015_delivery_guard (V26): the issued context metadata key list no longer names
--      approvedOrigins (the runner checks the allow-list it is configured with).

CREATE OR REPLACE FUNCTION studio_publication_scope(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF (studio_publication_closed(p,ARRAY['principalId','csiId','environment','capabilities','initialContext'],32768)
 AND studio_publication_strings(p,ARRAY['principalId','csiId','environment'])
 AND jsonb_typeof(p->'capabilities')='array' AND jsonb_array_length(p->'capabilities') BETWEEN 1 AND 10) IS NOT TRUE THEN RETURN false; END IF;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(p->'capabilities')) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'capabilities') LOOP
  IF jsonb_typeof(item)<>'string' OR item#>>'{}' NOT IN ('navigate','click','fill','press','check','uncheck','hover','selectOption','read','assert') THEN RETURN false; END IF;
 END LOOP;
 RETURN ((p->'initialContext'='{"kind":"initialBlank"}'::jsonb)
 OR (studio_publication_closed(p->'initialContext',ARRAY['kind','origin'],1024)
 AND p->'initialContext'->>'kind'='observedDocument'
 AND jsonb_typeof(p->'initialContext'->'origin')='string' AND length(p->'initialContext'->>'origin')<=256
 AND p->'initialContext'->>'origin' ~ '^https?://([a-z0-9.-]+|\[[0-9a-f:]+\])(:[1-9][0-9]{0,4})?$')) IS TRUE;
END $$;

CREATE OR REPLACE FUNCTION studio_015_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m studio_guided_materializations; s studio_guided_sessions; p studio_guided_relearn_plans; has_plan boolean; full_context jsonb; metadata_keys text[]:=ARRAY['schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision','sourceRevision','configurationRevision','versions','expiresAt','leaseExpiresAt','sourceStepIds','authoredInputsHash','materializationRevision','allocations','producers','consumerEdges','limits'];
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

-- SC008-E12: a learned revision is recorded first and confirmed by a model-free proof (ADR-SC-008 D5).
-- Forward-only on top of V1-V33.
--   1. ui_tests.candidate_revision_id: the recorded revision awaiting its proof. The "head" revision of a
--      test is COALESCE(candidate_revision_id, confirmed_revision_id). The publication base document keeps
--      its key name confirmedRevisionId and now carries the head (no contract change).
--   2. studio_step_receipts: one row per step of a revision, written by the proof; the latest proof replaces
--      the revision's rows.
--   3. ui_test_executions.diagnostic: a manual run of a revision that is not the confirmed one.
--   4. The publication epoch moves when the head moves, not when the candidate is promoted.

-- 1. Candidate pointer.
ALTER TABLE ui_tests
    ADD COLUMN candidate_revision_id uuid REFERENCES ui_test_revisions(id);

-- 2. Per-step receipts of the proof of one revision.
CREATE TABLE studio_step_receipts (
    revision_id        uuid         NOT NULL REFERENCES ui_test_revisions(id),
    step_ordinal       integer      NOT NULL CHECK (step_ordinal >= 0),
    proof_execution_id uuid         NOT NULL,
    status             varchar(8)   NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'NOT_RUN')),
    step_hash          char(64)     CHECK (step_hash IS NULL OR step_hash ~ '^[a-f0-9]{64}$'),
    receipt            jsonb,
    recorded_at        timestamptz  NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (revision_id, step_ordinal)
);

-- 3. Diagnostic attribution, set at insert.
ALTER TABLE ui_test_executions
    ADD COLUMN diagnostic boolean NOT NULL DEFAULT false;

-- 4. Epoch: bumps when the head revision changes.
CREATE OR REPLACE FUNCTION studio_publication_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF COALESCE(NEW.candidate_revision_id,NEW.confirmed_revision_id) IS DISTINCT FROM COALESCE(OLD.candidate_revision_id,OLD.confirmed_revision_id) THEN
  IF OLD.publication_epoch=9223372036854775807 OR NEW.publication_epoch NOT IN (OLD.publication_epoch,OLD.publication_epoch+1)
  THEN RAISE EXCEPTION 'publication epoch invalid'; END IF;
  NEW.publication_epoch:=OLD.publication_epoch+1;
 ELSIF NEW.publication_epoch IS DISTINCT FROM OLD.publication_epoch THEN RAISE EXCEPTION 'publication epoch immutable'; END IF;
 RETURN NEW;
END $$;

-- The base document's confirmedRevisionId is the head at session start.
CREATE OR REPLACE FUNCTION studio_publication_base_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
 OR NULLIF(NEW.document->>'confirmedRevisionId','')::uuid IS DISTINCT FROM COALESCE(t.candidate_revision_id,t.confirmed_revision_id)
 OR EXISTS(SELECT 1 FROM studio_guided_assignments WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_materializations WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_actions WHERE session_id=NEW.session_id)
 OR EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=NEW.session_id)
 THEN RAISE EXCEPTION 'publication base is not pre-effect current source'; END IF;
 RETURN NEW;
END $$;

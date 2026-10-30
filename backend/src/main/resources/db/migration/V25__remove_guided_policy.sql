-- STUDIO-GOV-001.3: remove the governed observation policy and the side-effect stance.
-- Forward-only on top of V1-V23 (V24 belongs to the scheduling change). User decision 2026-10-24:
-- the CSI-governed policy is dropped entirely, and a side-effecting click or Enter no longer asks
-- for confirmation.
--
-- Contents:
--   1. Drop the governed policy tables (V19) with their triggers and functions: policies, immutable
--      versions, approvals, the trigger-only audit chain and the per-session freeze. No data is
--      converted: Studio is unreleased and no deployment ever approved a policy.
--   2. Drop studio_015_prefix_confirmation_wait (V21), the stored-authority check of the one
--      server-made side-effect confirmation, and replace its two callers so a replaying prefix can
--      no longer wait for a question. The V19 per-CSI budget and retention objects stay.

-- ---------------------------------------------------------------------------------------------
-- 1. Governed policy tables
-- ---------------------------------------------------------------------------------------------
DROP TABLE studio_guided_session_policies;
DROP TABLE studio_guided_policy_audit;
DROP TABLE studio_guided_policy_approvals;
DROP TABLE studio_guided_policy_versions;
DROP TABLE studio_guided_policies;

DROP FUNCTION studio_guided_session_policy_guard();
DROP FUNCTION studio_guided_policy_audit_write();
DROP FUNCTION studio_guided_policy_audit_guard();
DROP FUNCTION studio_guided_policy_activate();
DROP FUNCTION studio_guided_policy_approval_guard();
DROP FUNCTION studio_guided_policy_version_guard();
DROP FUNCTION studio_guided_policy_guard();
DROP FUNCTION studio_guided_policy_document(jsonb);

-- ---------------------------------------------------------------------------------------------
-- 2. Side-effect confirmation wait
-- ---------------------------------------------------------------------------------------------
-- A session whose prefix program is pending can no longer enter AWAITING_CLARIFICATION: the only
-- question it could raise was the side-effect confirmation. Every other V21 session-guard rule is
-- kept verbatim.
CREATE OR REPLACE FUNCTION studio_015_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.document->'baseRevisionId' IS DISTINCT FROM NEW.document->'baseRevisionId'
 OR OLD.document->'firstLearnStepId' IS DISTINCT FROM NEW.document->'firstLearnStepId'
 THEN RAISE EXCEPTION 'initial incremental identity is immutable'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) OR OLD.state='REPLAYING_PREFIX' OR NEW.state='REPLAYING_PREFIX' THEN
 IF NEW.document->'counters'->'modelProposals' IS DISTINCT FROM OLD.document->'counters'->'modelProposals'
 OR NEW.document->'counters'->'modelInputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelInputTokens'
 OR NEW.document->'counters'->'modelOutputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelOutputTokens'
 THEN RAISE EXCEPTION 'model counters frozen during prefix'; END IF;
 IF studio_015_prefix_pending(NEW.session_id) AND OLD.state='REPLAYING_PREFIX'
 AND NEW.state NOT IN ('REPLAYING_PREFIX','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
 THEN RAISE EXCEPTION 'prefix callback cannot escape mode'; END IF;
 END IF;
 IF studio_015_prefix_pending(NEW.session_id)
 AND (NEW.state='AWAITING_CLARIFICATION' OR (OLD.state='AWAITING_CLARIFICATION' AND NEW.state='REPLAYING_PREFIX'))
 THEN RAISE EXCEPTION 'prefix replay cannot await a question'; END IF;
 IF NEW.state='REPLAYING_PREFIX' AND NOT studio_015_prefix_pending(NEW.session_id)
 THEN RAISE EXCEPTION 'prefix state without pending program'; END IF;
 IF NEW.state='REPLAYING_PREFIX' AND EXISTS(SELECT 1 FROM studio_guided_model_attempts WHERE session_id=NEW.session_id AND status IN ('RESERVED','CALLING'))
 THEN RAISE EXCEPTION 'prefix state with model attempt'; END IF;
 IF studio_015_delivery_pending(NEW.session_id) AND (
 NEW.document->'counters'->'modelProposals' IS DISTINCT FROM OLD.document->'counters'->'modelProposals'
 OR NEW.document->'counters'->'modelInputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelInputTokens'
 OR NEW.document->'counters'->'modelOutputTokens' IS DISTINCT FROM OLD.document->'counters'->'modelOutputTokens')
 THEN RAISE EXCEPTION 'model counters frozen until context ACK'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_015_session_mode_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s studio_guided_sessions;
BEGIN
 SELECT * INTO STRICT s FROM studio_guided_sessions WHERE session_id=NEW.session_id;
 IF s.state='REPLAYING_PREFIX' AND (NOT studio_015_prefix_pending(s.session_id)
 OR (SELECT continuation FROM studio_guided_translation_state WHERE session_id=s.session_id) IS DISTINCT FROM 'REPLAYING_PREFIX')
 THEN RAISE EXCEPTION 'prefix mode missing durable program or continuation'; END IF;
 RETURN NULL;
END $$;

DROP FUNCTION studio_015_prefix_confirmation_wait(text,jsonb,jsonb);

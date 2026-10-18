-- DESIGN DRAFT (STUDIO-OBS-015, @data-engineer). Not installed. Proposed path when the S4 window
-- closes: backend/src/main/resources/db/migration/V21__guided_session_replaying_prefix.sql
-- (Flyway description "guided session replaying prefix").
--
-- STUDIO-OBS-015: guided session state REPLAYING_PREFIX. Forward-only after V19 (OBS-014) and
-- V20 (OBS-013); V12-V20 are not edited. Ruling: docs/qa/evidence/STUDIO-OBS-015/
-- t0-architect-rulings.json ruling4.ownership.ddlFinding (state) and ruling3.mechanism[2]
-- (the model gateway is never reserved while state = REPLAYING_PREFIX).
--
-- Part A (required). Replace the V14 state CHECK by its explicit name. The name stays
-- ck_guided_session_state_v3: the suffix is the guided contract generation (contracts/v3,
-- session schemaVersion 3), and C3b adds REPLAYING_PREFIX inside v3, so no new generation exists.
-- Only this named constraint is touched. The four auto-named CHECKs on studio_guided_sessions
-- (document->>'sessionId'/'scopeHash'/'state' and scope.principalId equalities) are not named and
-- not changed. REPLAYING_PREFIX is NON-terminal: every terminal list in V14/V15/V17/V19 and Java
-- is an explicit list of the six terminal states, so a new state is non-terminal everywhere
-- without editing any of them (V14 tr_guided_identity, V15 evidence guard, V17 secret release,
-- V19 prune guard, prune function, live-CSI index, GuidedCsiBudget.TERMINAL).
--
-- Part B (optional defence in depth, @data-engineer discretion per story T3). No model attempt
-- row can be inserted while the session is REPLAYING_PREFIX, and the session cannot enter
-- REPLAYING_PREFIX while a live (RESERVED or CALLING) attempt exists. Together these make
-- "no reserved gateway call while REPLAYING_PREFIX" a database invariant. New function and two
-- new triggers; the V14/V19 function studio_guided_translation_attempt_guard is NOT replaced.
-- Locking: the session row is locked FOR UPDATE, as the V15 guards do; GuidedSessionService
-- .translationTransaction already holds that lock (GuidedSessionRepository.lock), so no new
-- lock order is introduced.

ALTER TABLE studio_guided_sessions
 DROP CONSTRAINT ck_guided_session_state_v3,
 ADD CONSTRAINT ck_guided_session_state_v3 CHECK (state IN ('PREPARING','REPLAYING_PREFIX','OBSERVING',
  'PROPOSING','ACTING','AWAITING_CLARIFICATION','FINALIZING','SUCCEEDED','PUBLICATION_CONFLICT','FAILED',
  'UNKNOWN_OUTCOME','CANCELLED','EXPIRED'));

CREATE FUNCTION studio_guided_replaying_prefix_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_state varchar(32);
BEGIN
 IF TG_TABLE_NAME='studio_guided_model_attempts' THEN
  SELECT state INTO current_state FROM studio_guided_sessions WHERE session_id=NEW.session_id FOR UPDATE;
  IF current_state='REPLAYING_PREFIX' THEN
   RAISE EXCEPTION 'guided model attempt refused while replaying prefix';
  END IF;
 ELSIF NEW.state='REPLAYING_PREFIX' AND OLD.state IS DISTINCT FROM 'REPLAYING_PREFIX'
  AND EXISTS(SELECT 1 FROM studio_guided_model_attempts
   WHERE session_id=NEW.session_id AND status IN ('RESERVED','CALLING')) THEN
  RAISE EXCEPTION 'guided session cannot replay prefix with a live model attempt';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_guided_replaying_prefix_attempt BEFORE INSERT ON studio_guided_model_attempts
 FOR EACH ROW EXECUTE FUNCTION studio_guided_replaying_prefix_guard();
CREATE TRIGGER tr_guided_replaying_prefix_entry BEFORE UPDATE OF state ON studio_guided_sessions
 FOR EACH ROW EXECUTE FUNCTION studio_guided_replaying_prefix_guard();

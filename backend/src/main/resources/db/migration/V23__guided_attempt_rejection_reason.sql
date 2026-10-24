-- STUDIO-OBS-009 round 053 ruling (a): a closed rejection reason per guided model attempt.
-- translation-design.md section 5 lists a "closed rejection reason" as part of
-- studio_guided_model_attempts; V14 never created the column. Additive, nullable, no backfill: past
-- reasons were never recorded, so existing rows stay NULL. The value is a closed upper-case token
-- chosen by the Java allowlist (GuidedTranslationStore); it is never a message, body or header.
ALTER TABLE studio_guided_model_attempts
 ADD COLUMN rejection_reason varchar(40)
 CHECK (rejection_reason IS NULL OR (status='REJECTED' AND rejection_reason ~ '^[A-Z0-9_]{1,40}$'));

-- The V19 attempt guard refuses an UPDATE that changes a column outside its transition list, so the
-- one UPDATE that finishes an attempt as REJECTED and sets its reason needs 'rejection_reason' in
-- that list. Everything else is the V19 body verbatim: the pruned-session branch (it compares
-- to_jsonb(NEW)-'safe_result', so it needs no change) and the terminal immutability test (a terminal
-- row refuses any later change of any column, the reason included).
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
 IF (to_jsonb(OLD)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at','rejection_reason'])
   IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','safe_result','input_tokens','output_tokens','updated_at','rejection_reason'])
   OR (OLD.status NOT IN ('RESERVED','CALLING') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
   OR (OLD.status='CALLING' AND NEW.status='RESERVED') THEN RAISE EXCEPTION 'guided attempt transition refused'; END IF;
 RETURN NEW;
END $$;

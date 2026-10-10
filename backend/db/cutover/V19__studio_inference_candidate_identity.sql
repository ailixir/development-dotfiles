-- Manually staged, never an automatic Flyway cutover. Drain compatible writers first.
DO $$
BEGIN
 IF current_setting('checks.inference_publishers_drained',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'V19 requires the compatible-writer drain barrier' USING ERRCODE='23514';
 END IF;
END $$;
DO $$ DECLARE columns integer; receipt_exists boolean;
BEGIN
 SELECT count(*) INTO columns FROM pg_attribute WHERE attrelid='ui_test_revisions'::regclass
 AND attname IN ('publication_kind','guided_session_id','learned_plan_hash','revision_digest') AND NOT attisdropped;
 receipt_exists:=to_regclass('studio_guided_publications') IS NOT NULL;
 IF (columns NOT IN (0,4)) OR (columns=0 AND receipt_exists)
 OR (columns=4 AND (NOT receipt_exists OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='ui_test_revisions'::regclass AND conname='fk_observed_revision_receipt' AND condeferrable)))
 THEN RAISE EXCEPTION 'partial observed publication capability'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='ui_test_revisions'::regclass AND conname='uq_ui_test_revisions_identity') THEN
  ALTER TABLE ui_test_revisions DROP CONSTRAINT uq_ui_test_revisions_identity;
 ELSE DROP INDEX IF EXISTS uq_ui_test_revisions_identity; END IF;
 IF columns=4 THEN
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION studio_inference_require_request() RETURNS trigger LANGUAGE plpgsql AS $body$
   BEGIN IF NEW.compile_request_id IS NULL AND NEW.publication_kind IS DISTINCT FROM 'GUIDED_RUN' THEN RAISE EXCEPTION 'new ordinary candidate requires immutable compile request after V19' USING ERRCODE='23514'; END IF; RETURN NEW; END $body$ $ddl$;
 ELSE
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION studio_inference_require_request() RETURNS trigger LANGUAGE plpgsql AS $body$
   BEGIN IF NEW.compile_request_id IS NULL THEN RAISE EXCEPTION 'new candidate requires immutable compile request after V19' USING ERRCODE='23514'; END IF; RETURN NEW; END $body$ $ddl$;
 END IF;
END $$;
DROP TRIGGER IF EXISTS trg_ui_test_revision_require_request ON ui_test_revisions;
CREATE TRIGGER trg_ui_test_revision_require_request BEFORE INSERT ON ui_test_revisions
FOR EACH ROW EXECUTE FUNCTION studio_inference_require_request();

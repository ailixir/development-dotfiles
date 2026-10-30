-- WI6: one closed child relation; omitted relation retains the existing descendant language.
-- Forward only. These functions/constraints govern new writes, without rewriting old evidence.
CREATE FUNCTION studio_wi6_locator(l jsonb, operation_kind text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s jsonb; h jsonb; a jsonb; n integer:=0; idx integer:=0; keys text[];
BEGIN
 IF jsonb_typeof(l)<>'array' OR jsonb_array_length(l) NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(l) LOOP
  n:=n+1; idx:=idx+1;
  IF jsonb_typeof(s)<>'object' THEN RETURN false; END IF;
  CASE s->>'by'
  WHEN 'testId' THEN
   IF NOT studio_publication_closed(s,ARRAY['by','value'],4096) OR NOT studio_publication_strings(s,ARRAY['value']) OR length(s->>'value') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  WHEN 'role','scope' THEN
   IF NOT studio_publication_closed(s,CASE WHEN s ? 'name' THEN ARRAY['by','role','name','exact'] ELSE ARRAY['by','role'] END,4096)
    OR COALESCE(s->>'role','') !~ '^[a-z][a-z-]{0,40}$' OR (s->>'by'='scope' AND NOT s ? 'name')
    OR (s ? 'name' AND (s->'exact'<>'true'::jsonb OR jsonb_typeof(s->'name')<>'string' OR length(s->>'name') NOT BETWEEN 1 AND 200)) THEN RETURN false; END IF;
  WHEN 'label','placeholder','text' THEN
   IF NOT studio_publication_closed(s,ARRAY['by','value','exact'],4096) OR s->'exact'<>'true'::jsonb
    OR NOT studio_publication_strings(s,ARRAY['value']) OR length(s->>'value') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
  WHEN 'tag','attr' THEN
   IF COALESCE(s->>'tag','') NOT IN ('a','article','aside','button','dialog','details','div','fieldset','footer','form','h1','h2','h3','h4','h5','h6','header','img','input','label','li','main','nav','ol','option','p','section','select','span','summary','table','tbody','td','textarea','th','tr','ul') THEN RETURN false; END IF;
   IF s->>'by'='tag' THEN
    IF NOT studio_publication_closed(s,ARRAY['by','tag'],4096) THEN RETURN false; END IF;
   ELSE
    IF NOT studio_publication_closed(s,ARRAY['by','tag','attrs'],4096) OR jsonb_typeof(s->'attrs')<>'array' OR jsonb_array_length(s->'attrs') NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(s->'attrs') LOOP
     IF NOT studio_publication_closed(a,ARRAY['name','value'],1024) OR a->>'name' NOT IN ('name','id','type','aria-label','title') OR NOT studio_publication_strings(a,ARRAY['value']) OR length(a->>'value') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
    END LOOP;
   END IF;
  WHEN 'nth' THEN
   IF NOT studio_publication_closed(s,ARRAY['by','index'],1024) OR NOT studio_publication_uint31(s->'index') OR (s->>'index')::integer>500 OR idx<>jsonb_array_length(l) THEN RETURN false; END IF;
  WHEN 'filterHas' THEN
   IF idx=1 OR jsonb_typeof(s->'has')<>'array' OR jsonb_array_length(s->'has') NOT BETWEEN 1 AND 7 THEN RETURN false; END IF;
   IF s ? 'relation' THEN
    IF NOT studio_publication_closed(s,ARRAY['by','relation','has'],8192) OR s->>'relation'<>'child'
     OR operation_kind NOT IN ('read','assert') OR jsonb_array_length(s->'has')<>1 THEN RETURN false; END IF;
    h:=s->'has'->0;
    IF NOT studio_publication_closed(h,ARRAY['by','role','name','exact'],4096) OR h->>'by'<>'role'
     OR h->'exact'<>'true'::jsonb OR COALESCE(h->>'role','') !~ '^[a-z][a-z-]{0,40}$'
     OR NOT studio_publication_strings(h,ARRAY['name']) OR length(h->>'name') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
   ELSE
    IF NOT studio_publication_closed(s,ARRAY['by','has'],8192) OR NOT studio_wi6_locator(s->'has',operation_kind)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(s->'has') inner_step WHERE inner_step->>'by' IN ('scope','filterHas')) THEN RETURN false; END IF;
   END IF;
   n:=n+jsonb_array_length(s->'has');
  ELSE RETURN false;
  END CASE;
 END LOOP;
 RETURN n<=8;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION studio_wi6_child_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof jsonb; proposal jsonb; action jsonb; request jsonb; kind text;
BEGIN
 IF TG_TABLE_NAME='studio_guided_publication_preparations' THEN
  proof:=NEW.proof; proposal:=NEW.proposal;
 ELSIF TG_TABLE_NAME='studio_guided_preparations' THEN
  proof:=NEW.proof;
  SELECT DISTINCT o.proposal INTO proposal FROM studio_guided_obligation_admissions o
   WHERE o.session_id=NEW.session_id AND o.proposal_digest=NEW.request_digest;
 ELSIF TG_TABLE_NAME='studio_guided_actions' THEN
  proposal:=NEW.proposal;
  SELECT p.proof INTO STRICT proof FROM studio_guided_preparations p WHERE p.session_id=NEW.session_id AND p.preparation_id=NEW.document->>'preparationId';
 ELSIF TG_TABLE_NAME='ui_test_revisions' THEN
  FOR action IN SELECT value FROM jsonb_array_elements(NEW.artifact->'learnedPlan'->'actions') LOOP
   IF action->'target'<>'null'::jsonb AND NOT studio_wi6_locator(action->'target'->'locator',action->'operation'->>'kind') THEN RAISE EXCEPTION 'frozen locator purpose invalid'; END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 IF proof->'target'<>'null'::jsonb THEN
  kind:=proposal->'operation'->>'kind';
  IF NOT studio_wi6_locator(proof->'target'->'locator',COALESCE(kind,'')) THEN RAISE EXCEPTION 'locator purpose invalid'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_wi6_child_preparation BEFORE INSERT ON studio_guided_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_child_write_guard();
CREATE TRIGGER tr_wi6_child_publication BEFORE INSERT ON studio_guided_publication_preparations FOR EACH ROW EXECUTE FUNCTION studio_wi6_child_write_guard();
CREATE TRIGGER tr_wi6_child_action BEFORE INSERT ON studio_guided_actions FOR EACH ROW EXECUTE FUNCTION studio_wi6_child_write_guard();
CREATE TRIGGER tr_wi6_child_revision BEFORE INSERT ON ui_test_revisions FOR EACH ROW EXECUTE FUNCTION studio_wi6_child_write_guard();

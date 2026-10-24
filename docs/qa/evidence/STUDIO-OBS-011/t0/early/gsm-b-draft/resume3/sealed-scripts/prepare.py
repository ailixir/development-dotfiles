from pathlib import Path
import re, json, hashlib, difflib
ROOT=Path.cwd(); D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-b-draft'
A=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/repo'
G=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/repo'
S='backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java'
T='backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
def put(p,t):
 p=D/p; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(t)
def replace(t,a,b):
 assert t.count(a)==1,(a,t.count(a)); return t.replace(a,b,1)
main=(A/S).read_text()
main=main.replace('require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409);','requireTranslation(id);')
assert main.count('requireTranslation(id);')==3
main=replace(main,'  /** Fresh authorization/identity checks even when another command has a cached response. */', '''  private void requireTranslation(String id) {
    require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409);
  }

  /** Fresh authorization/identity checks even when another command has a cached response. */''')
# Match the actual unique operation bodies; no generic insertion into the wrapper.
for anchor in [
 '          require(\n              (state(session).equals("PROPOSING") || state(session).equals("REPLAYING_PREFIX"))',
 '          active(session);\n          JsonNode question = session.progress().path("clarification");',
 '          require(\n              Set.of("PROPOSING", "REPLAYING_PREFIX").contains(state(session)),',
 '          materialization.verify(session.document(), request);\n          access.checkSourceCurrent(session.document());\n          require(\n              state(session).equals("PREPARING")']:
 if 'Set.of("PROPOSING", "REPLAYING_PREFIX")' in anchor:
  before, section=main.split('  private JsonNode admitChecked(',1)
  section=section.replace(anchor,'          requireTranslation(id);\n'+anchor,1)
  main=before+'  private JsonNode admitChecked('+section
 else:
  main=replace(main,anchor,'          requireTranslation(id);\n'+anchor)
# Unwrap exactly the five arms; preserve their whole bodies and nesting.
condition='if (translation != null && translation.exists(id)) {'
assert main.count(condition)==5
while condition in main:
 i=main.index(condition); line=main.rfind('\n',0,i)+1; indent=main[line:i]; start=i+len(condition); depth=1; end=start
 while depth:
  if main[end]=='{': depth+=1
  elif main[end]=='}': depth-=1
  end+=1
 body=main[start:end-1]
 assert body.startswith('\n') and body.endswith(indent)
 body=body[1:-len(indent)]
 body='\n'.join(x[2:] if x.startswith('  ') else x for x in body.split('\n'))
 main=main[:line]+body+main[end+1:]
# Remove only the full dead method and its own Javadoc.
start=main.index('  /** Opaque evidence-store identifiers only; the authorized evidence service resolves them. */')
end=main.index('  public JsonNode clarification(',start)
main=main[:start]+main[end:]
assert main.count('requireTranslation(id);')==7 and main.count('translation != null')==1
put(Path('repo')/S,main)
session=(G/T).read_text()
old='''    service.recordEvidence(worker, id, 1, "evidence", "video-1", "evidence-store-1");
    assertThatThrownBy(
            () ->
                service.recordEvidence(
                    worker, id, 1, "raw", "video-2", "https://secret@example.test"))
        .hasMessage("INVALID_CONTRACT");'''
new='''    // R-21: the unused command is retired. Preserve this case's independent relational
    // scope, opaque reference and public no-replay oracles at their surviving repository seam.
    repository.evidence(id, scope(id), "video-1", "evidence-store-1");'''
session=replace(session,old,new)
put(Path('repo')/T,session)
for p in [
 'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionController.java',
 'backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationResultProjector.java',
 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedTeardownShedTest.java',
 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedResultPublicationDisabledIT.java']:
 put(Path('repo')/p,(A/p).read_text())

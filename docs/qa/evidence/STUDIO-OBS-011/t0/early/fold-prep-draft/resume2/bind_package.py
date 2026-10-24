from pathlib import Path
import json,hashlib
root=Path.cwd();out=Path(__file__).parent
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=['AGENTS.md','.codex/skills/aiox-dev/SKILL.md','docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v6.md','docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fold-left/review.md','docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fold-left/review.json','docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fold-left/independent-static.json','backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchStopKeyTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchContextDeadlineTest.java','backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationProperties.java','backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceClassifier.java','backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProductionSessionAccess.java','backend/src/test/java/com/citi/put/checks/studio/support/ObservedPublicationFixture.java','backend/src/main/resources/application-test.yml']
bindings={p:h(root/p) for p in paths}
(out/'source-and-review-bindings.json').write_text(json.dumps(bindings,indent=2)+'\n')
clock='backend/src/test/java/com/citi/put/checks/studio/guided/publication/PublicationGrantClockIT.java'
final={'owner':'11-FOLD-final, same Dex author, root explicit plan ownership required','boundedScope':'Only remove red-first old-authority injected field/fallback/type references; keep3 methods, fixture scope and all clock/expiry/claim/budget assertions','path':clock,'correctedPrepSha256':h(out/'tree'/clock),'finalTestSha256':h(out/'final-clock-test-baton'/clock),'patch':'patches/05-FINAL-ONLY-clock-fallback-removal.patch','patchSha256':h(out/'patches/05-FINAL-ONLY-clock-fallback-removal.patch'),'when':'Same atomic compile-clean final unit that ports all21 FOLD_TESTS/projector, applies3 consumer swaps, removes compatibility plumbing/beans/classes, adds test-only observer accessor and updates exact diagnostic class names; after all incoming batons','applied':False,'runtimeVerified':False}
(out/'final-clock-test-baton.json').write_text(json.dumps(final,indent=2)+'\n')
mp=json.loads((out/'preservation-map.json').read_text())
mp['adapterOverloads']={'sender2':'Exact original two-argument runner.send(operation, body) in both constructors','sender3':'Exact original three-argument runner.send(operation, body, key) in both constructors','sender4':'Exact original four-argument runner.send(operation, body, key, callerDeadline) in both constructors','secretSender':'Exact original four-argument sendSecret(body, metadata, secret, callerDeadline)','keyGenerationOrNullInferenceInAdapter':False,'downstreamAlgorithm':'Byte-identical after type and method receiver normalization; static only'}
mp['clockTestScope']={'applications':'ObservedPublicationFixture.APPLICATION = studio-fixture','environments':'ObservedPublicationFixture.ENVIRONMENTS.getFirst() = Production','mechanism':'DynamicPropertyRegistry in this owned test only','productionDefaultsChanged':False,'policyStubbedOrRelaxed':False,'all3TestMethodsChanged':False}
mp['orderRuling']={'id':'FOLD-ORDER-1','prep':'All3 old active consumer bindings preserved; new implementations/seam plus DB clock composition installed/tested side-by-side','final':'All3 switches atomic with complete final ports/projector/compatibility/beans/classes retirement and exact ClockIT cleanup; not merely config patch'}
mp['nativeUntouchedTests']={p:bindings[p] for p in paths if p.endswith(('GuidedDispatchStopKeyTest.java','GuidedDispatchContextDeadlineTest.java'))}
mp['alternateSet']['difference']='Only3 final-only consumer switches; same corrected20 paths; no FOLD_TESTS edits/deletions'
(out/'preservation-map.json').write_text(json.dumps(mp,indent=2)+'\n')
sets={}
for name in ['tree','proposed-final-wiring']:
 rows={str(p.relative_to(out/name)):h(p) for p in (out/name).rglob('*') if p.is_file()}
 sets[name]={'files':rows,'mainCount':sum('/src/main/' in p for p in rows),'testCount':sum('/src/test/' in p for p in rows)}
diffs=[p for p,v in sets['tree']['files'].items() if sets['proposed-final-wiring']['files'][p]!=v]
(out/'full-set-hashes.json').write_text(json.dumps({'sets':sets,'alternateDifferences':diffs},indent=2)+'\n')
(out/'patch-hashes.json').write_text(json.dumps({p.name:h(p) for p in sorted((out/'patches').glob('*.patch'))},indent=2)+'\n')
for name in ['DESIGN.md','PRESERVATION-AND-CONFLICT.md']:
 p=out/name;s=p.read_text()
 if not s.startswith('# Resume2 author addendum'):
  p.write_text('''# Resume2 author addendum (governs the inherited text below)\n\nFOLD-PREP-1/2 are corrected in both full sets; FOLD-ORDER-1 now resolves phase ordering: old active consumer bindings stay in prep, all3 switches plus complete ports/projector/deletions land atomically in final. See REVIEW-DISPOSITIONS.md and VERIFY-AFTER-GATES.md for current actions; the copied design/conflict discussion below is historical rationale and does not leave the architecture decision unresolved. Root application/plan adoption still required. Original artifacts outside resume2 remain unchanged.\n\n'''+s)
print('Bound corrected full sets, original/native inputs, v6 review, preservation maps and exact final ClockIT ownership baton')

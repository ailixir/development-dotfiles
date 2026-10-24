"""Read-only source custody and exact ASCII grounding witness; no Java/SQL execution."""
from pathlib import Path
import ast
import hashlib
import json
import re

O = Path(__file__).resolve().parent
R = O.parents[6]
T = R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
B = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
P = B / 'early/gs-t-draft/lifecycle-dispatch-source-audit'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
context = read(T/'gst-lifecycle-wording-source-review-context.json')
for pin in context['pins']:
    assert sha(R/pin['path']) == pin['sha256'], pin['path']
manifest = read(P/'manifest.json')
for pin in manifest['files']:
    assert sha(P/pin['path']) == pin['sha256'], pin['path']
inputs = read(P/'inputs.json')
for pin in inputs['sourcePins']:
    assert sha(R/pin['path']) == pin['sha256'], pin['path']
tree = ast.parse((P/'verify.py').read_text())
selected = [n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef)) and not (isinstance(n,ast.FunctionDef) and n.name=='main')]
scope = {}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<pure-reviewed-source-functions>','exec'),scope)
rel = 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
session = (P/'repo'/rel).read_text()
a,b = scope['method_span'](session,'sourceFixture')
block = session[a:b]
assert block.count('Click Order reference.') == 2
assert "'[]'::jsonb" in block and 'Map.of()' in block
assert 'sourceAccess(), properties, clock' in session and 'return productionAccess(jdbc, contracts, access' in session
assert 'JsonNode association = planner(id).reserve(id, key, probe);' in session
assert 'planner(id).reserve(id, "admit", proposal(id));' in session
assert 'ObjectNode o = fixture("observation");' in session and 'ObjectNode p = fixture("action");' in session
assert 'p.putObject("operation").put("kind", "click");' in session
assert 'selected.put(id, probe.deepCopy());' in session and 'translation.advance(' in session
fixture = read(R/'backend/src/test/resources/studio/guided/session-it-documents.json')['documents']
node = fixture['observation']['nodes'][0]
assert node['name'] == 'Order number'
assert node['nodeId'] == fixture['action']['target']['nodeId']
assert fixture['action']['coordinate']['stepId'].endswith('a1')
assert fixture['action']['target']['locator']['value'] == 'order-reference'
guard = (R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedActionGuard.java').read_text()
assert 'node != null && !node.path("name").asText("").isBlank()' in guard
assert '? node.path("name").asText()' in guard
assert 'for (JsonNode value : manifest.path("configurationValues"))' in guard
assert 'saved.add(value.path("value").asText());' in guard
assert 'GROUNDED_KINDS.contains(kind) && !grounded(label, node, sources)' in guard
classifier = (R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceClassifier.java').read_text()
assert 'var privateConfigs = result.putObject("configurationValues")' in classifier
assert 'for (JsonNode variable : current.path("variables"))' in classifier
assert 'steps.addObject().put("stepId", id).put("text", text)' in classifier
grounded = scope['grounded_ascii_branch']
assert not grounded(node['name'],'Click Order reference.')
assert grounded(node['name'],'Click Order number.')
assert grounded('order-reference','Click Order reference.')
inventory = read(R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-before.json')
main = [row for row in inventory['files'] if row['path'].startswith('backend/src/main/')]
for row in main:
    assert sha(R/row['path']) == row['sha256'],row['path']
assert len(main)==506
projection = read(B/'runtime/obs011-gst-provisional-03/closed-tool-case-line-projection.json')
assert not any(row['class']=='GuidedSessionIT' for row in projection['records'])
pf = read(T/'gst-lifecycle-wording-source-review-preflight.json')
assert pf['scan']['safe'] and pf['story']['status']=='InProgress' and pf['budgetCeilingUsd']==500
report = {'assignedPins':len(context['pins']),'manifestMembers':len(manifest['files']),
          'relevantSourcePins':len(inputs['sourcePins']),'mainFrozenExact':len(main),
          'pureVerifierInspectedAndRunExit':0,'literalDelta':{'file':'GuidedLifecycleReasonIT.java','occurrences':2},
          'groundingWitness':{'domain':'exact ASCII literals; no saved inputs','nodeName':'Order number',
                              'locator':'order-reference','old':False,'corrected':True,'locatorAloneOldWouldPass':True},
          'sessionSiblingMismatchSourceProven':True,'sessionFirstStepIdSuffix':'a1',
          'sessionOriginalObservationAndClickPreserved':True,'distinctSavedInputRescueFound':False,
          'sessionRequiredFutureCorrection':'same two newly introduced sourceFixture literals; no candidate edited',
          'sessionRuntimeAttribution':'UNEXECUTED44','actualLifecycleFirstGuardAndCode':'UNKNOWN',
          'highControlFindingRetained':'GST03-CONTROL-01','sourceOrRetryRelease':False,
          'pins':context['pins']}
(O/'audit-result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='pins'}))

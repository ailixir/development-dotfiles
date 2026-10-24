"""Read-only source/artifact reconstruction; output only in exclusive resume2 directory."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys
sys.dont_write_bytecode=True
D=Path(__file__).resolve().parent;O=D.parent;R=next(p for p in D.parents if (p/'backend/gradlew').is_file())
def sha(data):return hashlib.sha256(data).hexdigest()
for line in (O/'artifact-hashes.sha256').read_text().splitlines():
 h,n=line.split('  ',1);assert sha((O/n).read_bytes())==h,('SEALED_ORIGINAL_CHANGED',n)
previous=D.parent/'resume2'
for line in (previous/'artifact-hashes.sha256').read_text().splitlines():
 h,n=line.split('  ',1);assert sha((previous/n).read_bytes())==h,('SEALED_RESUME2_CHANGED',n)
copy_map=json.loads((D/'sealed-original-copy.json').read_text())
for item in copy_map['files']:assert sha((D/item['copy']).read_bytes())==item['sha256']
m=json.loads((D/'manifest.json').read_text());old=json.loads((O/'manifest.json').read_text())
for key in ['files','mutants','proofFiles','unchangedGsTBatons','newCaseNames','sessionBeforeNames','sessionAfterNames']:
 assert m[key]==old[key],key
for fact in m['files']:
 assert (D/'repo'/fact['path']).read_bytes()==(O/'repo'/fact['path']).read_bytes()
 assert sha((D/'repo'/fact['path']).read_bytes())==fact['draftSha256']
 if fact['baseOrigin']:assert sha((R/fact['baseOrigin']).read_bytes())==fact['baseSha256']
for name, fact in m['mutants'].items():
 for suffix in ['.java.txt','.patch']:assert (D/'mutants'/(name+suffix)).read_bytes()==(O/'mutants'/(name+suffix)).read_bytes()
for name in ['part-b.patch','S011-composition.patch','S011-owned-seven-paths.patch','negative-tests-only.patch',
 'main-session-after-red.patch','source-preservation.json','site-map.json','forwarding-batons.json',
 'input-bindings.json','expected-discovery.json','design.md']:
 assert (D/name).read_bytes()==(O/name).read_bytes(),name

def apply(text, delta):
 src=text.splitlines(True);out=[];at=0;lines=delta.splitlines(True);i=0
 while i<len(lines):
  if not lines[i].startswith('@@ '):i+=1;continue
  match=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]);assert match
  start=max(0,int(match[1])-1);out.extend(src[at:start]);at=start;i+=1
  while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
   line=lines[i]
   if line.startswith(' '):assert src[at]==line[1:];out.append(src[at]);at+=1
   elif line.startswith('-'):assert src[at]==line[1:];at+=1
   elif line.startswith('+'):out.append(line[1:])
   else:raise AssertionError('PATCH_LINE')
   i+=1
 out.extend(src[at:]);return ''.join(out)

def sections(text):
 starts=[m.start() for m in re.finditer(r'^--- ',text,re.M)]+[len(text)]
 return [(re.search(r'^\+\+\+ b/(.*)$',text[a:b],re.M)[1],text[a:b]) for a,b in zip(starts,starts[1:])]
reconstructions=[]
for patch in ['part-b.patch','S011-owned-seven-paths.patch','S011-composition.patch','negative-tests-only.patch','main-session-after-red.patch']:
 count=0
 for rel,delta in sections((D/patch).read_text()):
  fact=next((x for x in m['files'] if x['path']==rel),None)
  target=(D/'repo'/rel) if fact else R/next(x['origin'] for x in m['unchangedGsTBatons'] if x['path']==rel)
  if patch.startswith('S011'):base=(R/rel).read_text() if (R/rel).exists() else ''
  elif patch=='negative-tests-only.patch':base=''
  else:base=(R/fact['baseOrigin']).read_text() if fact['baseOrigin'] else ''
  assert apply(base,delta)==target.read_text();count+=1
 reconstructions.append({'patch':patch,'paths':count})
driver_patch_paths=[]
for name,delta in sections((D/'driver-only.patch').read_text()):
 base=(O/'run-unit.py').read_text() if name=='run-unit.py' else ''
 assert apply(base,delta)==(D/name).read_text()
 driver_patch_paths.append(name)
# Exact accepted reference bodies; docstrings do not carry executable ownership decisions.
reference=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
assert sha(reference.read_bytes())=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
def functions(path):return {x.name:x for x in ast.parse(path.read_text()).body if isinstance(x,ast.FunctionDef)}
a=functions(reference);b=functions(D/'driver_support.py');copied=[]
for name in ['owned_census_keys','classify_owned','pending_owned','ownership_drain_decision']:
 for node in [a[name],b[name]]:
  if node.body and isinstance(node.body[0],ast.Expr) and isinstance(node.body[0].value,ast.Constant) and isinstance(node.body[0].value.value,str):node.body.pop(0)
 assert ast.dump(a[name],include_attributes=False)==ast.dump(b[name],include_attributes=False),name
 copied.append(name)
for p in D.glob('*.py'):ast.parse(p.read_text(),filename=str(p))
plan=json.loads((D/'driver-plan.json').read_text());assert plan['sourceManifestSha256']==sha((D/'manifest.json').read_bytes())
assert plan['legacyCollectorBinding']['originalSha256']=='1bba89cc35982f8990af4f7112fb740f3fdc95397334a4d3787da08c73009cda'
assert plan['legacyCollectorBinding']['prospectiveSha256']=='fa90d844d6443285ada1ae1856fdef4bd23ddf607ab97ec21ccd52f2fc30cc3a'
conformance=json.loads((D/'conformance-results.json').read_text());assert conformance['testsRun']==48 and conformance['passed']
final=json.loads((D/'final-findings-conformance.json').read_text());assert final['testsRun']==8 and final['passed']
resources=json.loads((D/'resource-conformance-results.json').read_text());assert resources['testsRun']==7 and resources['passed']
assert resources['closedDiagnosticWitness']['positiveCodeAssessment'] and resources['closedDiagnosticWitness']['exactInheritedResources']==6
def test_names(path):
 return sorted(n.name for n in ast.walk(ast.parse(path.read_text())) if isinstance(n,ast.FunctionDef) and n.name.startswith('test_'))
assert test_names(D/'conformance.py')==test_names(previous/'conformance.py')
for name,delta in sections((D/'resume2-to-resume3-driver.patch').read_text()):
 base=(previous/name).read_text() if (previous/name).exists() else ''
 assert apply(base,delta)==(D/name).read_text()
out={'status':'STATIC_SOURCE_AND_FAKE_HELPER_CONFORMANCE_ONLY','original39ArtifactsPreserved':True,
 'sevenReviewedJavaCandidatesByteIdentical':True,'fiveReviewedMutantsAndPatchesByteIdentical':True,
 'sourceMapsBatonsCaseCatalogAndCompositionPatchesByteIdentical':True,
 'patchReconstructions':reconstructions,'driverPatchReconstructs':driver_patch_paths,'acceptedReferenceOwnershipBodyASTMatches':copied,
 'sealedResume2MembersPreserved':True,'prior48CaseNamesPreserved':True,'fakeHelperConformanceTests':63,'fakeHelperConformancePassed':True,'actualCommandParserAssessorContract':True,'threeActualFinalizerWitnessesHold':True,'exactStaticPolicyAndClosedDiagnosticWitness':True,
 'actualDriverLaunchOrNativeExecution':False,'actualProductSourceWrites':False,
 'actualPopenSubprocessSignalCallsInTests':False,'originalFullcheckCurrentlyRootOwnedNotInterpreted':True,
 'sourceProofAndGateCredit':False,'runtimeOrLaneQaLifecycleApproval':False}
(D/'static-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))

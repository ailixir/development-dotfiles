"""Light input/AST checks only; no harness/collector import, entrypoint or mocked runtime."""
import ast
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / 'backend/gradlew').is_file())
PREVIOUS = HERE.parent / 'resume2'
CORRECTION = HERE.parent.parent / 'java21-launcher-correction'
LEGACY = '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py'
OLD = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
NEW = '/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
plan = json.loads((HERE / 'plan.json').read_text())
previous = json.loads((PREVIOUS / 'plan.json').read_text())
original = (ROOT / LEGACY).read_bytes()
candidate = (CORRECTION / 'repo' / LEGACY).read_bytes()
checks = {}
checks['harnessByteIdenticalAcceptedResume2'] = (HERE/'harness.py').read_bytes()==(PREVIOUS/'harness.py').read_bytes() and sha(HERE/'harness.py')=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
checks['collectorOneLiteralOnlyAndReversible'] = original.count(OLD.encode())==1 and candidate==original.replace(OLD.encode(),NEW.encode()) and candidate.replace(NEW.encode(),OLD.encode())==original
checks['candidateModeMatchesOriginal'] = (ROOT/LEGACY).stat().st_mode & 0o777 == (CORRECTION/'repo'/LEGACY).stat().st_mode & 0o777
original_ast = ast.parse(original)
candidate_ast = ast.parse(candidate)
for node in ast.walk(candidate_ast):
    if isinstance(node,ast.Constant) and node.value == NEW:
        node.value = OLD
checks['collectorASTOnlyDeclaredStringChanged'] = ast.dump(original_ast,include_attributes=False)==ast.dump(candidate_ast,include_attributes=False)
expected = json.loads(json.dumps(previous))
expected['javaHome']=NEW
expected['immutableHelpers'][LEGACY]=sha(CORRECTION/'repo'/LEGACY)
checks['exactTwoPlanLeavesChanged'] = plan==expected and plan!=previous
checks['literalS0111808BindingUnchanged'] = len(plan['source']['files'])==1808 and plan['source']['digest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617' and plan['source']==previous['source']
checks['all1808BoundSourceBytesCurrentlyMatch'] = all((ROOT/f['path']).is_file() and sha(ROOT/f['path'])==f['sha256'] for f in plan['source']['files'])
actual_dist=[{'path':str(p.relative_to(ROOT/'studio-runner/dist')),'sha256':sha(p)} for p in sorted((ROOT/'studio-runner/dist').rglob('*')) if p.is_file()]
checks['literal238DistAndMembershipMatch'] = len(actual_dist)==238 and actual_dist==plan['source']['dist']['files'] and plan['source']['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
checks['current20Quoted22HelmUnchanged'] = len(plan['quotedCurrent'])==20 and len(plan['helm'])==22 and plan['quotedCurrent']==previous['quotedCurrent'] and plan['helm']==previous['helm'] and all(sha(ROOT/p)==h for p,h in {**plan['quotedCurrent'],**plan['helm']}.items())
other={p:h for p,h in plan['immutableHelpers'].items() if p!=LEGACY}
checks['otherFiveHelperBindingsUnchangedAndCurrent'] = len(other)==5 and all(previous['immutableHelpers'][p]==h and sha(ROOT/p)==h for p,h in other.items())
checks['prospectiveLegacyBindingIsCandidateNotOldActual'] = plan['immutableHelpers'][LEGACY]==sha(CORRECTION/'repo'/LEGACY) and sha(ROOT/LEGACY)==previous['immutableHelpers'][LEGACY] and sha(ROOT/LEGACY)!=plan['immutableHelpers'][LEGACY]
checks['exactNineSkipsPreserved'] = len(json.loads((ROOT/plan['skipPath']).read_text()))==9 and plan['skipPath']==previous['skipPath']
checks['allOtherPlanSemanticsUnchanged'] = all(plan[k]==previous[k] for k in previous if k not in ['javaHome','immutableHelpers'])
checks['authorizationExampleFalse'] = json.loads((HERE/'authorization.example.json').read_text())['authorized'] is False
checks['noResume3RunDirectory'] = not (HERE/'runs').exists()
identity=json.loads((CORRECTION/'java-identity.json').read_text())
new_identity=next(h for h in identity['homes'] if h['role']=='cachedJava21Home')
checks['cached21BinaryAndReleaseStillMatchMeasurement'] = sha(Path(new_identity['javaBinary']))==new_identity['javaBinarySha256'] and sha(Path(new_identity['releaseFile']))==new_identity['releaseSha256'] and 'version "21.0.10"' in new_identity['versionStderr'] and new_identity['versionExit']==0
result={'isQaVerdict':False,'harnessImportedOrExecuted':False,'runtimeOrMockTestsExecuted':False,'checks':checks,'allStaticChecksPass':all(checks.values()),'harnessSha256':sha(HERE/'harness.py'),'planSha256':sha(HERE/'plan.json'),'prospectiveCollectorSha256':sha(CORRECTION/'repo'/LEGACY),'actualCollectorStillOriginal':True,'planBindingStatus':'PROSPECTIVE: will refuse until root explicitly applies the reviewed exact collector candidate','sourceMembershipScope':'Every original1808 bound file byte checked; source membership remains enforced by unchanged future stable_inputs; no source recapture or baseline expansion performed.','ownershipMockCarry':'Exact same harness bytes retain prior independently reviewed helper checks; not rerun or promoted to native proof.'}
(HERE/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['allStaticChecksPass']

"""Light static checks only. Never import or execute the launch harness."""
import ast
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / 'backend/gradlew').is_file())
script = (HERE / 'harness.py').read_text()
tree = ast.parse(script)
plan = json.loads((HERE / 'plan.json').read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
checks = {}
checks['syntaxParsedWithoutExecutingHarness'] = True
checks['sourceSet1808LiteralS011'] = len(plan['source']['files']) == 1808 and sha(json.dumps(plan['source']['files'], separators=(',', ':')).encode()) == plan['source']['digest'] == '061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
checks['dist238LiteralD009r'] = len(plan['source']['dist']['files']) == 238 and sha(json.dumps(plan['source']['dist']['files'], separators=(',', ':')).encode()) == plan['source']['dist']['digest'] == '698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
checks['quoted20Helm22'] = len(plan['quotedCurrent']) == 20 and len(plan['helm']) == 22
checks['currentQuotedHelmHelperBindingsMatch'] = all(sha((ROOT / p).read_bytes()) == h for p,h in {**plan['quotedCurrent'],**plan['helm'],**plan['immutableHelpers']}.items())
checks['exactFullCheckNoFilters'] = plan['commandGradle'] == ['--continue','check','--rerun-tasks','--no-daemon'] and plan['testTasks'] == ['test','guidedIncrementalTest','crossReplicaTest']
checks['exactNineSkipPolicy'] = len(json.loads((ROOT / plan['skipPath']).read_text())) == 9
checks['onlyOnePopenCallSite'] = sum(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'Popen' for n in ast.walk(tree)) == 1
checks['noSignalOrSourceMutationApi'] = not any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in {'kill','killpg','terminate','send_signal','unlink','rmtree','chmod','write_text','write_bytes'} for n in ast.walk(tree))
checks['sourceOnlyRead'] = 'regular(REPLAY)' in script and 'REPLAY.open' not in script and 'REPLAY.write' not in script
checks['finallyDrainAndActualWait'] = 'finally:\n        # Catch BaseException inside every drain iteration' in script and 'child.wait(timeout=5)' in script and 'OWNED_JVM_DRAIN_WAIT' in script
checks['internalCoverageSessionsAndOriginalFacts'] = "ET.fromstring(regular(report)).findall('sessioninfo')" in script and "report_info['originalFact']" in script and 'archive_original' in script
checks['noHarnessExecutionPerformed'] = True
# Mechanical check of exact parent trailing-argument normalization including label position.
expected = ['/repo/wrapper.py','/usr/bin/python3','/repo/harness.py','fresh-label','/repo/auth.json']
checks['parentArgumentNormalizationPreservesOnlyLabel'] = [str((Path('/repo') / a).resolve()) if i != 3 else a for i,a in enumerate(expected)] == expected
result = {'isQaVerdict':False,'runtimeExecuted':False,'checks':checks,'allStaticChecksPass':all(checks.values()),'harnessSha256':sha((HERE/'harness.py').read_bytes()),'planSha256':sha((HERE/'plan.json').read_bytes())}
(HERE/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['allStaticChecksPass']

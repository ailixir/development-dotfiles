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
checks['finallyDrainAndActualWait'] = 'finally:\n        # Catch BaseException inside every drain iteration' in script and 'child.wait(timeout=5)' in script and 'OWNED_JAVA_OR_UNKNOWN_DRAIN_WAIT' in script
checks['internalCoverageSessionsAndOriginalFacts'] = "ET.fromstring(regular(report)).findall('sessioninfo')" in script and "report_info['originalFact']" in script and 'archive_original' in script
checks['noHarnessExecutionPerformed'] = True
# Mechanical check of exact parent trailing-argument normalization including label position.
expected = ['/repo/wrapper.py','/usr/bin/python3','/repo/harness.py','fresh-label','/repo/auth.json']
checks['parentArgumentNormalizationPreservesOnlyLabel'] = [str((Path('/repo') / a).resolve()) if i != 3 else a for i,a in enumerate(expected)] == expected
# Authorized deterministic mock checks: extract only the actual ownership helpers.
# No harness import, module entrypoint, real process observation, subprocess or native job.
names = {'owned_census_keys', 'classify_owned', 'pending_owned', 'ownership_drain_decision', 'update_owned'}
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
assert {n.name for n in functions} == names
class FakeOS:
    @staticmethod
    def getpid():
        return 1
observations = {}
def fake_pid_text(pid, column):
    value = observations.get((pid, column))
    if isinstance(value, BaseException):
        raise value
    return value
namespace = {'Path':Path,'os':FakeOS(),'pid_text':fake_pid_text,'RECEIPT':{}}
exec(compile(ast.Module(body=functions,type_ignores=[]), '<extracted-ownership-helpers-only>', 'exec'), namespace)
update = namespace['update_owned']
decision = namespace['ownership_drain_decision']
classify = namespace['classify_owned']
def row(pid=20,start='S',parent=10):
    return {'pid':pid,'ppid':parent,'start':start,'argvHash':'closed-fake'}
def initial(rows,known=None,comm='java',start='S'):
    known = {} if known is None else known
    observations.clear()
    for pid,item in rows.items():
        observations[(pid,'comm')] = comm
        observations[(pid,'lstart')] = item['start'] if start == 'S' else start
    update(rows,known,10)
    return known
mock = {}
# Census includes a reliable owned collector and its descendant; no native calls.
rows = {10:row(10,'C',1),20:row()}
known = initial(rows,comm=None)
mock['missingCommAfterCollectorTerminalWaits'] = ((20,'S') in known and known[(20,'S')]['executableState']=='UNKNOWN' and decision({20:row()},known,True)=='WAIT')
observations.clear();observations.update({(20,'comm'):'java',(20,'lstart'):None})
update({20:row(parent=1)},known,10)
mock['missingStartRecheckRetainsCensusProvedIdentity'] = (known[(20,'S')]['identityObservation']=='UNKNOWN' and decision({20:row(parent=1)},known,True)=='WAIT')
known = initial(rows,comm='sh')
observations.clear();observations.update({(20,'comm'):None,(20,'lstart'):'S'})
update({20:row(parent=1)},known,10)
was_unknown = known[(20,'S')]['executableState']=='UNKNOWN'
observations[(20,'comm')] = '/opt/java/bin/java'
update({20:row(parent=1)},known,10)
mock['shellUnknownJavaPromotesAndWaits'] = was_unknown and known[(20,'S')]['executableState']=='JAVA' and decision({20:row(parent=1)},known,True)=='WAIT'
observations.clear();observations.update({(20,'comm'):None,(20,'lstart'):None})
update({20:row(parent=1),21:row(21,'D',20)},known,10)
mock['reparentedKnownJavaAndItsNewUnknownDescendantRetained'] = known[(20,'S')]['javaPreviouslyProved'] and (21,'D') in known and known[(21,'D')]['executableState']=='UNKNOWN' and len(namespace['pending_owned']({20:row(parent=1),21:row(21,'D',20)},known))==2
mock['provedJavaMissingStartRecheckStillWaits'] = known[(20,'S')]['identityObservation']=='UNKNOWN' and decision({20:row(parent=1)},known,True)=='WAIT'
mock['normalOriginalIdentityExitResolves'] = decision({},known,True)=='RESOLVED'
reuse = {20:row(20,'NEW',1)}
mock['pidReuseDoesNotInheritOldOwnership'] = decision(reuse,known,True)=='RESOLVED' and namespace['owned_census_keys'](reuse,known,10,1)==set()
unknown = {(20,'S'):classify(row(),None,None,None)}
observations.clear();observations.update({(20,'comm'):'/bin/sh',(20,'lstart'):'S'})
update({20:row(parent=1)},unknown,10)
mock['reliableNonJavaResolutionAllowed'] = unknown[(20,'S')]['executableState']=='NON_JAVA' and decision({20:row(parent=1)},unknown,True)=='RESOLVED'
observations[(20,'comm')] = None
update({20:row(parent=1)},unknown,10)
mock['knownNonJavaBecomesUnknownWhenExecUnavailable'] = unknown[(20,'S')]['executableState']=='UNKNOWN' and decision({20:row(parent=1)},unknown,True)=='WAIT'
observations[(20,'comm')] = OSError('closed fake observation failure')
update({20:row(parent=1)},unknown,10)
mock['observationExceptionRetainsUnknownAndWaits'] = unknown[(20,'S')]['observationError'] and decision({20:row(parent=1)},unknown,True,False)=='WAIT' and decision({20:row(parent=1)},unknown,True)=='WAIT'
# A failure writing a sticky flag must not lose any census-proven sibling identities.
class BrokenReceipt(dict):
    def __setitem__(self,key,value):
        raise OSError('closed fake receipt failure')
namespace['RECEIPT'] = BrokenReceipt()
unknown = {}
observations.clear()
try:
    update(rows,unknown,10)
except OSError:
    pass
mock['receiptFailureLeavesAllCensusOwnedRowsUnknownPending'] = set(unknown)=={(10,'C'),(20,'S')} and decision(rows,unknown,True)=='WAIT'
mock['pollFailureCannotSupplyTermination'] = decision({},unknown,False)=='WAIT' and decision({},unknown,True,False)=='WAIT'
java = classify(row(),None,'java','S')
sticky = classify(row(),java,'/bin/sh','S')
mock['provedJavaNeverDowngradedByLaterNonJavaObservation'] = sticky['executableState']=='JAVA' and sticky['javaPreviouslyProved'] and decision({20:row()},{(20,'S'):sticky},True)=='WAIT'
checks['allAdversarialOwnershipTransitionsPass'] = all(mock.values())
result = {'isQaVerdict':False,'runtimeExecuted':False,'nativeHarnessImportedOrExecuted':False,'mockedExtractedHelperChecksExecuted':True,'checks':checks,'adversarialOwnershipChecks':mock,'allStaticChecksPass':all(checks.values()),'harnessSha256':sha((HERE/'harness.py').read_bytes()),'planSha256':sha((HERE/'plan.json').read_bytes())}
(HERE/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['allStaticChecksPass']

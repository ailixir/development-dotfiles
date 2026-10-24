"""Synthetic predicate checks only; does not import the runtime adapter or observe OS."""
import ast
import copy
import json
from pathlib import Path
from predicates import *

HERE = Path(__file__).parent
checks = []

def check(name, fn, failure=False):
    try:
        result = fn()
    except Hold:
        assert failure, name
    else:
        assert not failure, name
    checks.append({'check': name, 'passed': True})

retained = json.loads((HERE/'retained-contract.json').read_text())
a = {'protocol':PROTOCOL,'authorized':True,'authorizedBy':'root','unit':'obs011-t0-c8-check01','expectedWrapperExit':1,
     'dualException':{'newClosingEntrypoint':True,'noStandaloneCompileZeroRequired':True},'ordinaryRoute':'HARD_HOLD',
     'compileState':'NOT_STARTED','newNativeInvocations':0,'writers':[],
     'credit':{'C8':False,'main':False,'lane':False,'IR':False,'lifecycle':False},'sourceDigest':SOURCE,'historicalGapCodes':GAPS,
     'retainedContractSha256':'a'*64,'retainedContractCanonicalSha256':digest(compact(retained)),
     'pins':{'retained-contract.json':'a'*64},'codePins':{'failed_resource.py':'b'*64},
     'reviewPins':{k:'c'*64 for k in ('actualQa','architectureCode','qaCode','rootAdoption','terminalDesign','terminalDesignQa')},'activeLockSha256':'d'*64}
r = {'protocol':PROTOCOL,'kind':'QUALIFIED_FAILED_RESOURCE_READINESS','verificationExit':0,'releaseSha256':'e'*64,
     'retainedContractSha256':'a'*64,'expectedWrapperExit':1,'historicalGapCodes':GAPS,'C8Credit':False,'verifiedAtEpoch':100}
p = {'decision':'AUTHORIZE_ONE_FAILED_RESOURCE_EXIT','authorizedBy':'root','releaseSha256':'e'*64,'readinessSha256':'f'*64,
     'expectedWrapperExit':1,'retainedContractSha256':'a'*64,'C8Credit':False,'issuedAtEpoch':101}
ad = {'kind':'ROOT_NEW_GUARD_ADMISSION','authorizedBy':'root','releaseSha256':'e'*64,'activeLockSha256':'d'*64,
      'negativeActualStatus':1,'separateStatusCaptured':True,'sameOriginalHolderAfterDenial':True,'readinessAbsentAtDenial':True,
      'permitAbsentAtDenial':True,'originalExitAndBindingsUnchanged':True,'newReadonlyFunctionInspected':True}
live = {'observationOk':True,'metadataUnchanged':True,'codeUnchanged':True,'sourceDigest':SOURCE,'sourceExact':True,
        'recordedCount':2439,'liveOwned':[],'currentUnknown':[],'unexpectedDescendants':[],'ownedListeners':[],
        'inheritedMatched':6,'boundaryDefects':False,'clientsComplete':True,'priorClientsLive':[],
        'sameHolder':True,'kernelHeld':True,'controllersAbsentOrReused':True,'kernelFree':True}
base = {'a':a,'retained':retained,'expected':copy.deepcopy(retained),'ad':ad,'r':r,'p':p,'release_sha':'e'*64,
        'ready_sha':'f'*64,'live_before':live,'live_after':copy.deepcopy(live),'before':102,'after':103,'requested':1}
check('complete failed-resource synthetic allow retains failure', lambda: gate(**base))

def mutate(path, value):
    value_set = copy.deepcopy(base); cursor = value_set
    for k in path[:-1]: cursor = cursor[k]
    cursor[path[-1]] = value
    return lambda: gate(**value_set)

cases = [
 ('unauthorized',['a','authorized'],False),('wrong purpose unit',['a','unit'],'other'),
 ('wrong explicit exit',['requested'],0),('boolean exit',['requested'],True),
 ('entrypoint exception omitted',['a','dualException'],{'newClosingEntrypoint':False,'noStandaloneCompileZeroRequired':True}),
 ('build-zero exception omitted',['a','dualException'],{'newClosingEntrypoint':True,'noStandaloneCompileZeroRequired':False}),
 ('old route qualification',['a','ordinaryRoute'],'QUALIFIED'),('compile path invented',['a','compileState'],'TERMINAL'),
 ('source writer',['a','writers'],['writer']),('new native phase',['a','newNativeInvocations'],1),
 ('C8 credit fabricated',['a','credit','C8'],True),('main release fabricated',['a','credit','main'],True),
 ('missing review',['a','reviewPins'],{}),('unsafe code parent',['a','codePins'],{'../x':'a'*64}),
 ('missing admission',['ad'],None),('denial not actually captured',['ad','negativeActualStatus'],0),
 ('status inferred',['ad','separateStatusCaptured'],False),('holder not same',['ad','sameOriginalHolderAfterDenial'],False),
 ('old function modified',['ad','originalExitAndBindingsUnchanged'],False),('new function not inspected',['ad','newReadonlyFunctionInspected'],False),
 ('missing readiness',['r'],None),('wrong readiness release',['r','releaseSha256'],'0'*64),
 ('failed readiness',['r','verificationExit'],1),('readiness unretained gap',['r','historicalGapCodes'],[]),
 ('stale readiness entry',['before'],161),('stale readiness after observation',['after'],161),
 ('future readiness',['r','verifiedAtEpoch'],104),('clock reversed',['after'],101),
 ('missing permit',['p'],None),('wrong permit readiness hash',['p','readinessSha256'],'0'*64),
 ('permit issued before final',['p','issuedAtEpoch'],99),('wrong permit exit',['p','expectedWrapperExit'],0),
 ('stale permit',['p','issuedAtEpoch'],0),('root mismatch',['p','authorizedBy'],'other'),
 ('retained UNKNOWN erased',['retained','limits','historicalUnknown'],0),
 ('historical gap erased',['retained','summary','allStickyFlags','ownedIdentityObservationGap'],False),
 ('error omitted',['retained','errors','assessmentEvidenceErrors'],[]),
 ('build passing fabricated',['retained','build','overall'],'SUCCESSFUL'),
 ('cases passing fabricated',['retained','summary','statusCounts'],{'PASS':2774,'SKIP':0,'FAIL':0}),
]
for side in ('live_before','live_after'):
    for name,key,value in [
      ('source drift','sourceDigest','0'*64),('source mode drift','sourceExact',False),('survivor','liveOwned',[[1,'start']]),
      ('unknown current identity','currentUnknown',[1]),('unexpected descendant','unexpectedDescendants',[1]),
      ('owned listener','ownedListeners',[8080]),('inherited drift','inheritedMatched',5),('boundary incomplete','boundaryDefects',True),
      ('code changed','codeUnchanged',False),('evidence changed','metadataUnchanged',False),('holder changed','sameHolder',False),
      ('kernel uncertainty','kernelHeld',False),('client incomplete','clientsComplete',False),('prior client survives','priorClientsLive',[1]),
      ('finite union omission','recordedCount',2438),('observation failed','observationOk',False)]:
        cases.append((side+' '+name,[side,key],value))
for name,path,value in cases: check(name, mutate(path,value),True)
for name in ('a','b/c','a-b.py'):
    check('canonical '+name,lambda name=name: need(canonical(name),'PATH'))
for name in ('','/a','../a','a/../b','a//b','a/./b'):
    check('unsafe '+name,lambda name=name: need(canonical(name),'PATH'),True)
check('postclose current finite proof',lambda:current(live,True))
for key,value in [('controllersAbsentOrReused',False),('kernelFree',False)]:
    changed=copy.deepcopy(live);changed[key]=value
    check('postclose rejects '+key,lambda changed=changed:current(changed,True),True)
for path in HERE.glob('*.py'):
    ast.parse(path.read_text())
check('runtime contains no native phase branch',lambda:need("mode in ('final','gate','postclose')" in (HERE/'failed_resource.py').read_text(),'NATIVE_BRANCH'))
# Extract ONLY the path reader, inject synthetic Path/OS objects. No actual file
# or process observation occurs inside these calls. A rejected ancestor must
# prevent both leaf inspection and any open/body read.
import stat as stat_module
from types import SimpleNamespace
from pathlib import PurePosixPath
reader_node = next(n for n in ast.parse((HERE/'failed_resource.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name == 'safe_bytes')
for bad in ('/repo/link', '/repo/a/file'):
    touched = []
    class FakePath:
        def __init__(self,value): self.value = value.value if isinstance(value,FakePath) else str(value)
        def __eq__(self,other): return isinstance(other,FakePath) and self.value == other.value
        def is_absolute(self): return self.value.startswith('/')
        def is_relative_to(self,other): return self.value == other.value or self.value.startswith(other.value+'/')
        @property
        def parts(self): return PurePosixPath(self.value).parts
        @property
        def parents(self): return [FakePath(str(x)) for x in PurePosixPath(self.value).parents]
        def resolve(self): return self
        def lstat(self):
            touched.append(self.value)
            return SimpleNamespace(st_mode=(stat_module.S_IFLNK if self.value == bad else stat_module.S_IFDIR) | 0o600)
    attempted = []
    fake_os = SimpleNamespace(open=lambda *args: attempted.append(args), O_RDONLY=0, O_NOFOLLOW=0)
    ns = {'Path':FakePath,'ROOT':FakePath('/repo'),'sys':SimpleNamespace(executable='/python'),
          'stat':stat_module,'os':fake_os,'need':need}
    exec(compile(ast.Module(body=[reader_node],type_ignores=[]),'<synthetic-path-reader>', 'exec'),ns)
    target = '/repo/link/file' if bad == '/repo/link' else '/repo/a/file'
    check('link-before-body '+bad,lambda target=target:ns['safe_bytes'](target),True)
    check('no open after unsafe path '+bad,lambda:need(attempted == [],'READ_OCCURRED'))
    if bad == '/repo/link':check('unsafe ancestor blocks leaf metadata',lambda:need('/repo/link/file' not in touched,'LEAF_TOUCHED'))
for stamp in (float('nan'),float('inf'),-float('inf'),True,None):
    check('invalid freshness '+str(stamp),lambda stamp=stamp:age(stamp,103),True)
check('exact sixty-second readiness accepted',lambda:readiness(r,'e'*64,'a'*64,160))
check('sixty-second plus epsilon rejected',lambda:readiness(r,'e'*64,'a'*64,160.001),True)
result={'scope':'PURE_SYNTHETIC_ONLY_NO_RUNTIME_HELPER_OR_OS_OBSERVATION','checks':len(checks),'passed':len(checks),'failed':0,'results':checks,'actualRuntimeAction':False,'C8Credit':False}
with (HERE/'pure-check-results.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({k:result[k] for k in ('scope','checks','passed','failed')}))

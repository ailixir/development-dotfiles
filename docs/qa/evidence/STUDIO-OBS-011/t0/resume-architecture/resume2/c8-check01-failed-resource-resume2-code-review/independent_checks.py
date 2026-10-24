"""Source-only review: extracted actual definitions; synthetic boundaries only.
No runtime module import, main, helper adapter, OS/process/lock observation.
Only reads exact preparation/public metadata and writes this review directory.
"""
import ast, copy, hashlib, json, stat, types
from pathlib import Path, PurePosixPath
ROOT=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
PACK=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume2'
OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/c8-check01-failed-resource-resume2-code-review'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(name,value):
    with (OUT/name).open('x') as out:json.dump(value,out,indent=2);out.write('\n')
verified=[]
def pin(path,want=None,size=None,mode=None):
    path=Path(path);raw=path.read_bytes();got=sha(raw)
    assert want is None or got==want,(path,'sha')
    assert size is None or len(raw)==size,(path,'bytes')
    assert mode is None or stat.S_IMODE(path.stat().st_mode)==mode,(path,'mode')
    verified.append({'path':str(path.relative_to(ROOT)),'sha256':got,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)})
    return raw
manifest=json.loads(pin(PACK/'manifest.json','38c5d4cc0ae6477dc0f60a63d3c76792953daca72ab4233e54ae271405728b0b'))
assert len(manifest['files'])==24
for row in manifest['files']:pin(PACK/row['path'],row['sha256'],row['bytes'],row['mode'])
inputs=json.loads((PACK/'input-pins.json').read_bytes())
for row in inputs['records']:pin(ROOT/row['path'],row['sha256'],row['bytes'])
old=PACK.parent/'resume1';oldm=json.loads((old/'manifest.json').read_bytes());assert len(oldm['files'])==17
for row in oldm['files']:pin(old/row['path'],row['sha256'],row['bytes'],row['mode'])
ctxbase=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
for suffix in ('task.txt','context.json','preflight.json'):pin(ctxbase/('c8-check01-failed-resource-resume2-architecture-review-'+suffix))
change=json.loads((PACK/'changed-code-map.json').read_bytes())
for row in change['sourceAndTemplateCommonFiles']:
    assert sha((old/row['path']).read_bytes())==row['oldSha256']
    assert sha((PACK/row['path']).read_bytes())==row['newSha256']
    assert row['changed']==(row['oldSha256']!=row['newSha256'])
    assert stat.S_IMODE((old/row['path']).stat().st_mode)==row['oldMode']
    assert stat.S_IMODE((PACK/row['path']).stat().st_mode)==row['newMode']
pureold=(old/'pure_checks.py').read_text();purenew=(PACK/'pure_checks.py').read_text()
assert purenew==pureold.replace("mode in ('final','gate','postclose')","mode in ('final','gate','held-proof','postclose')")
assert (old/'retained-contract.json').read_bytes()==(PACK/'retained-contract.json').read_bytes()
# Independently compile definitions only, never the runtime module or its main.
def adapter_defs(target=None):
    import errno,fcntl,importlib,json,os,sys,time,hashlib,subprocess,re
    ns={'__file__':str(PACK/'failed_resource.py'),'__name__':'extracted_actual_definitions',
        'ast':ast,'errno':errno,'fcntl':fcntl,'importlib':importlib,'json':json,'os':os,'Path':Path,'stat':stat,'sys':sys,'time':time,'hashlib':hashlib,'subprocess':subprocess,'re':re}
    class Denied:
        def __init__(self,module):self.module=module
        def __getattr__(self,name):
            value=getattr(self.module,name)
            if callable(value):
                def denied(*a,**k):raise AssertionError('REAL_BOUNDARY_BLOCKED:'+name)
                return denied
            return value
    ns['os']=Denied(os);ns['fcntl']=Denied(fcntl);ns['subprocess']=Denied(subprocess)
    if target is not None:target.update(ns);ns=target
    tree=ast.parse((PACK/'failed_resource.py').read_text())
    names={'ROOT','UNIT','HERE','OLD_RELEASE','PIN','INDEX','CORE','CORE_SHA','OLD_GATE_SHA'}
    tree.body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) or isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in names for t in n.targets)]
    exec(compile(tree,'<extracted-actual-adapter-definitions-no-main>','exec'),ns)
    return ns
# Inspected pure predicates contain only stdlib imports/constant/definitions.
pred={'__name__':'inspected_pure_policy'}
exec(compile((PACK/'predicates.py').read_bytes(),'<pure-policy>','exec'),pred)
# Replay inspected author harness, replacing its module-definition exec with
# our AST definition extractor and deleting ONLY final sealed result write/print.
class Harness(ast.NodeTransformer):
    def visit_Expr(self,node):
        if isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='exec' and 'failed_resource.py' in ast.unparse(node):
            return ast.copy_location(ast.parse('adapter_defs(ns)').body[0],node)
        return node
h=Harness().visit(ast.parse((PACK/'adapter_checks.py').read_text()))
h.body=[n for n in h.body if not isinstance(n,ast.With) and not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='print')]
ast.fix_missing_locations(h)
hns={'__name__':'inspected_author_harness','__file__':str(PACK/'adapter_checks.py'),'adapter_defs':adapter_defs}
exec(compile(h,'<inspected-author-harness-no-output>','exec'),hns)
assert hns['result']['total']==164 and hns['result']['passed']==164
assert hns['result']==json.loads((PACK/'adapter-check-results.json').read_bytes())
assert hns['l']['result']==json.loads((PACK/'pure-check-results.json').read_bytes())
save('author-adapter-replay.json',hns['result']);save('author-legacy-replay.json',hns['l']['result'])
# Adversarial exact-byte pairs: all real OS/custody/code-body boundaries fake.
cases=[]
def note(name,**fields):cases.append({'case':name,**fields})
policy=(PACK/'predicates.py').read_bytes()
for variant in ('same verified bytes','wrong first pin','changed second read'):
    ns=adapter_defs();marker=[]
    import builtins
    builtins._c8_aria_review_marker=marker
    changed=b"import builtins\nbuiltins._c8_aria_review_marker.append('unverified policy executed')\n"+policy
    auth={'authorized':True,'authorizedBy':'root','codePins':{'failed_resource.py':sha(b'adapter'),'predicates.py':sha(policy) if variant!='wrong first pin' else '0'*64,'guard-failed-resource.bash':sha(b'guard')}}
    raw=json.dumps(auth).encode()
    class Fake:
        def __init__(self):self.reads=[];self.n=0
        def read(self,name):
            self.reads.append(name)
            if name=='predicates.py':
                self.n+=1
                return changed if variant=='changed second read' and self.n==2 else policy
            return {'root-disposition-authorization.json':raw,'failed_resource.py':b'adapter','guard-failed-resource.bash':b'guard'}[name]
        def check(self):pass
    fake=Fake();held=None
    try:ns['bootstrap'](fake,sha(raw))
    except Exception as e:held=str(e)
    if variant=='same verified bytes':assert held is None and marker==[]
    elif variant=='wrong first pin':assert held=='CODE_BEFORE_EXECUTION' and marker==[]
    else:assert held is None and marker==['unverified policy executed']
    note('bootstrap '+variant,hold=held,marker=list(marker),readOrder=fake.reads,actualAction=False)
    del builtins._c8_aria_review_marker
# CORE shares the same double-read defect. Change only fake returned source.
for variant in ('same verified bytes','wrong first pin','changed second read'):
    ns=adapter_defs();marker=[]
    import builtins
    builtins._c8_aria_review_marker=marker
    core=b'def sha(data):\n    return data\n'
    changed=b"def sha(data=__import__('builtins')._c8_aria_review_marker.append('unverified core executed')):\n    return data\n"
    ns['CORE_SHA']=sha(core) if variant!='wrong first pin' else '0'*64
    reads=[]
    def safe(path):
        reads.append(str(path));return changed if variant=='changed second read' and len(reads)==2 else core
    ns['safe_bytes']=safe;ns['load_fixed_module']=lambda *args:types.SimpleNamespace()
    held=None
    try:ns['helpers']({})
    except Exception as e:held=str(e)
    if variant=='same verified bytes':assert held is None and marker==[]
    elif variant=='wrong first pin':assert held=='CORE_HASH' and marker==[]
    else:assert held is None and marker==['unverified core executed']
    note('CORE '+variant,hold=held,marker=list(marker),reads=len(reads),actualAction=False)
    del builtins._c8_aria_review_marker
# Independent full sequential flow: each invocation starts with a FRESH b,
# one immutable shared fake custody, and nonempty per-client utility journals.
ns=adapter_defs();ns.update({k:v for k,v in pred.items() if not k.startswith('__')})
Mem=hns['MemCustody'];who=hns['who'];storage=Mem();pid=[20];epoch=[100.0];events=[]
ns['os']=types.SimpleNamespace(getpid=lambda:pid[0],getppid=lambda:11)
ns['time']=types.SimpleNamespace(time=lambda:epoch[0])
def capture(b,cmd,allowed=(0,)):
    b['utilityCounter']+=1
    record={'kind':'SYNCHRONOUS_BOUND_OBSERVATION_UTILITY','client':copy.deepcopy(b['client']),'releaseSha256':b['sha'],'pid':900+b['utilityCounter'],'command':cmd,'executableSha256':'c'*64,'terminal':True,'status':0,'allowedStatuses':list(allowed)}
    b['utilities'].append(record)
    if b.get('clientBound') is True:ns['write_new'](b,'utility-'+str(pid[0])+'-'+sha(b['client']['start'].encode())[:16]+'-'+str(b['utilityCounter'])+'.json',record)
    return who(pid[0])['start'] if cmd[-1]=='lstart=' else 'python fixture'
ns['utility_capture']=capture
ns['helpers']=lambda b:({'table':lambda:{pid[0]:who(pid[0])},'identity':lambda row:who(pid[0])},None)
base=copy.deepcopy(hns['l']['a']);base.update(pythonExecutable='/configured/Python',pythonExecutableSha256='b'*64,activeLockSha256=ns['PIN'])
retained=copy.deepcopy(hns['l']['retained'])
storage.files['input-pins.json']=json.dumps({'retainedContract':retained}).encode()
def fresh():return {'a':copy.deepcopy(base),'sha':'e'*64,'loaded':{},'custody':storage,'pin':{'shellPid':11},'retained':copy.deepcopy(retained),'utilities':[],'utilityCounter':0}
def observe(b,post=False):
    clients,prior=ns['inventory_clients'](b,{pid[0]:who(pid[0])})
    live=copy.deepcopy(hns['l']['live']);live.update(priorClientsLive=prior,clientIdentities=clients)
    return live
ns['observe']=observe
for mode,num in [('gate',20),('held-proof',21),('final',22),('gate',23),('postclose',24)]:
    pid[0]=num;b=fresh();ns['register_client'](b,mode)
    status=0;reason=None
    try:ns['operate'](b,mode,1 if mode in ('gate','held-proof') else None)
    except pred['Hold'] as e:status=1;reason=str(e)
    events.append({'mode':mode,'clientPid':num,'status':status,'reason':reason,'newUtilities':len(b['utilities'])})
    assert len(b['utilities'])==2
    if num==20:assert status==1 and reason=='MISSING_READINESS'
    else:assert status==0
    if mode=='held-proof':
        ad=copy.deepcopy(hns['l']['ad']);ad.update(activeLockSha256=ns['PIN'],negativeDenialSha256=sha(storage.read('negative-readiness-denial.json')),heldProofSha256=sha(storage.read('held-proof.json')),heldProofActualStatus=0,heldProofSeparateStatusCaptured=True)
        storage.write('root-admission.json',ad)
    if mode=='final':
        p=copy.deepcopy(hns['l']['p']);p.update(readinessSha256=sha(storage.read('readiness.json')),issuedAtEpoch=100)
        storage.write('permit.json',p)
    if mode=='gate' and num==23:
        storage.write('root-wrapper-result.json',{'actualWrapperExit':1,'separatelyCaptured':True,'releaseSha256':b['sha'],'gateAllowSha256':sha(storage.read('gate-allow.json'))})
assert len([x for x in storage.files if x.startswith('client-')])==5
assert len([x for x in storage.files if x.startswith('utility-')])==10
note('fresh-per-command complete flow with nonempty utility histories',events=events,clients=5,utilityJournals=10,postclosePresent='postclose.json' in storage.files,actualAction=False)
save('independent-check-results.json',{'scope':'ACTUAL_AST_DEFINITIONS_WITH_IN_MEMORY_BOUNDARIES_ONLY','cases':cases,'actualRuntimeImportMainOsProcessNativeActions':0,'sourceOrRuntimeEdits':0,'dependencyPinDefectReproduced':True})
save('input-pins.json',{'packetManifest':manifest,'verifiedInputs':verified,'verifiedPacketMembers':24,'verifiedOldMembers':17,'allInputRecordsVerified':len(inputs['records']),'sourceDeltaForwardReverseChecked':True,'legacy97OnlyModeAssertionAdaptation':True,'noPrivateBodiesRead':True})
print(json.dumps({'authorReplay':164,'independentCases':len(cases),'packetMembers':24,'oldMembers':17,'inputRecords':len(inputs['records']),'defect':'UNVERIFIED_SECOND_SOURCE_BUFFER_EXECUTED_IN_BOOTSTRAP_AND_HELPERS','actions':0}))

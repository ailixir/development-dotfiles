"""Exact held argv + finite continuation APIs; in-memory boundaries only."""
import ast,copy,hashlib,json,stat,types,errno
from pathlib import Path,PurePosixPath
D=Path(__file__).parent
# Reuse only inspected fake-world definitions; their underlying215 controls
# are replayed separately, never import a runtime module or call its main.
prefix=[]
for node in ast.parse((D/'boundary-controls.py').read_text()).body:
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in node.targets):break
    prefix.append(node)
world_ns={'__file__':str(D/'boundary-controls.py')}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-world-definitions>','exec'),world_ns)
World=world_ns['World'];results=[]
def check(name,fn,hold=False):
    try:fn()
    except (ValueError,KeyError,OSError,TimeoutError):
        if not hold:raise
    else:assert not hold,name
    results.append({'case':name,'passed':True})
old_tree=ast.parse((D.parent/'resume4/run-private.py').read_text());old_held=next(x for x in old_tree.body if isinstance(x,ast.FunctionDef) and x.name=='held')
for old in (True,False):
    w=World();calls=[];wrapper=w.H['wrapper']['pid'];lock=str(w.d.R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock')
    expected=['/usr/sbin/lsof','-nP','-a','-p',str(wrapper),'-F','pfin','--',lock]
    def command(argv,**kwargs):
        calls.append(argv)
        return types.SimpleNamespace(returncode=0 if argv==expected else 1,stdout='p'+str(wrapper)+'\nf3\ni'+str(w.H['lock']['ino'])+'\nn'+lock+'\n' if argv==expected else 'SYNTHETIC_USAGE',stderr='' if argv==expected else 'SYNTHETIC_OPTIONS_AFTER_FILE')
    w.ns['subprocess']=types.SimpleNamespace(run=command)
    w.ns['observation_binary']=lambda argv:(argv,'FAKE_BOUND_BINARY')
    w.ns['no_signal_process']=lambda argv,binary_sha:command(argv)
    w.C['capture']=w.ns['observe_capture']
    if old:
        fn=copy.deepcopy(old_held);fn.name='held_before';exec(compile(ast.Module(body=[fn],type_ignores=[]),'<old-actual-held>','exec'),w.ns);held=w.ns['held_before']
    else:held=w.ns['held']
    check('actual held '+('old order rejected' if old else 'options-first accepted'),lambda:held(w.A,w.C),old)
    assert len(calls)==1 and (calls[0]==expected)==(not old)

# All operational modules default to explicit denied stubs. Every exercised
# boundary below is supplied as a fake; safe_bytes/main/load_driver never run.
class Denied:
    def __getattr__(self,key):raise AssertionError('UNFAKED_BOUNDARY:'+key)
def definitions():
    n={'__name__':'extracted_capture_functions','__file__':str(D/'capture-admission.py'),'ast':ast,'copy':copy,'hashlib':hashlib,'json':json,'os':Denied(),'stat':stat,'subprocess':Denied(),'sys':Denied(),'time':Denied(),'types':types,'Path':PurePosixPath,'PurePosixPath':PurePosixPath,'R':PurePosixPath('/R'),'P':PurePosixPath('/R/P')}
    names={'HOLD_SHA','FAILURE_SHA','CLOSURE_SHA','LABEL','ROOT01_SHA'}
    nodes=[x for x in ast.parse((D/'capture-admission.py').read_text()).body if isinstance(x,ast.FunctionDef) or isinstance(x,ast.Assign) and all(isinstance(t,ast.Name) and t.id in names for t in x.targets)]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-capture-definitions-no-main>','exec'),n);return n
n=definitions();auth={'authorized':True,'authorizedBy':'root','decision':'CONTINUE_SAME_UNCONSUMED_GATEWAY_ADMISSION_ONCE','packetManifestSha256':'a'*64,'existingHoldSha256':n['HOLD_SHA'],'priorFailureSha256':n['FAILURE_SHA'],'c8ClosureAdoptionSha256':n['CLOSURE_SHA'],'label':n['LABEL'],'maximumCaptures':1,'readonlySameShellOneShotRequired':True,'sameWrapperPid':3720,'sameShellPid':3749,'nativeOrPhaseAuthorized':False,'workspaceCreationAuthorized':False,'automaticRetry':False,'historicalRepairClaim':False,'reviews':{k:{'sha256':'b'*64} for k in ('architecture','qa')}}
check('explicit continuation accepts exact authority',lambda:n['continuation'](auth,'a'*64))
for field,value in [('authorized',False),('packetManifestSha256','0'*64),('existingHoldSha256','0'*64),('sameWrapperPid',999),('sameShellPid',True),('maximumCaptures',True),('nativeOrPhaseAuthorized',True),('automaticRetry',True),('historicalRepairClaim',True)]:
    a=copy.deepcopy(auth);a[field]=value;check('continuation rejects '+field,lambda a=a:n['continuation'](a,'a'*64),True)

class Mini:
    def __init__(self,n):
        self.w=World();self.fs=self.w.fs;self.events=[];self.writes=[];self.E=self.fs.path('/R/E');self.W=self.fs.path('/W-ABSENT')
        self.fs.put('/R/E',kind='directory',mode=0o700)
        self.hold={'label':n['LABEL'],'wrapper':{'pid':3720,'start':'SAME_START','argvHash':'c'*64},'shell':{'pid':3749,'start':'SAME_START','argvHash':'d'*64},'lock':{}}
        self.raw=(json.dumps(self.hold)+'\n').encode();self.fs.put('/R/E/hold.json',self.raw,mode=0o600)
        self.original_digest=n['digest'];n['digest']=lambda raw:n['HOLD_SHA'] if raw==self.raw else self.original_digest(raw)
        n['safe_bytes']=lambda path:self.fs.nodes[str(path)]['data']
        n['os']=types.SimpleNamespace(getuid=lambda:42,getppid=lambda:3749,umask=lambda value:0o077)
        n['time']=types.SimpleNamespace(time=lambda:100)
        self.source_fail=False;self.holder_fail=False;self.source_calls=0
    def guard_directory(self,path):
        for p in [path,*path.parents]:
            if p.exists():assert not p.is_symlink()
    def guard_leaf(self,path):self.guard_directory(path.parent);assert path.is_file() and not path.is_symlink()
    def write_new(self,path,value):
        assert path.parent==self.E and path.name!='hold.json' and not path.exists();self.writes.append(path.name);self.events.append('write:'+path.name);self.fs.put(str(path),(json.dumps(value,indent=2)+'\n').encode(),mode=0o600)
    def file_hash(self,path):return self.n_digest(self.fs.nodes[str(path)]['data'])
    def core(self):return {'synthetic':True,'table':lambda:{}}
    def bind_observation_client(self,rows):self.events.append('client-anchor')
    def enable_observation_writes(self):self.events.append('enable-records')
    def no_signal_process(self,command,sha,kind):
        self.w.ns['subprocess']=self.n['subprocess']
        return self.w.ns['no_signal_process'](command,sha,kind=kind)
    def held(self,A,C):
        self.events.append('held')
        if self.holder_fail:raise ValueError('SYNTHETIC_HOLDER_CHANGED')
        return self.hold
    def guards(self,A,C):
        self.events.append('guards');self.source_calls+=1
        if self.source_fail:raise ValueError('SYNTHETIC_SOURCE_CHANGED')
        return {'sourceDigest':'f9c','fresh':True}
    def read(self,path):
        raw=self.__dict__.get('IMMUTABLE_BYTES',{}).get(str(path))
        return json.loads(raw) if raw is not None else self.fs.obj(str(path))
    def boundary(self,H,C,A):
        self.events.append('boundary');value=self.read(self.E/'candidate-baseline.json');assert value['capturedBeforeUnit'] is True
        assert not (self.E/'candidate-baseline.json').exists();return {'inheritedMatched':[{}]*6,'unknown':[]}

def mini():
    n=definitions();d=Mini(n);d.n=n;d.n_digest=n['digest'];return n,d
for scenario in ('valid H only','wrong parent','changed H','existing baseline','extra phase','workspace exists'):
    n,d=mini()
    if scenario=='wrong parent':n['os'].getppid=lambda:999
    if scenario=='changed H':d.fs.put('/R/E/hold.json','CHANGED',mode=0o600)
    if scenario=='existing baseline':d.fs.put('/R/E/candidate-baseline.json',{})
    if scenario=='extra phase':d.fs.put('/R/E/prepare.consumed.json',{})
    if scenario=='workspace exists':d.fs.put('/W-ABSENT',kind='directory')
    check('existing H validation '+scenario,lambda:n['existing_hold'](d,auth),scenario!='valid H only')
    assert not d.writes

for scenario in ('success','holder changed','source changed','authority false','preexisting candidate'):
    n,d=mini();a=copy.deepcopy(auth)
    n['prepare_proposal']=lambda *args:{'authorized':False,'nodeCanonicalPath':'/NODE','helmCanonicalPath':'/HELM','nodeSha256':'N','helmSha256':'H','holdFileSha256':n['HOLD_SHA']}
    def ver(d,A,name):
        value={'tool':name,'terminalWaitConfirmed':True,'actualExit':0};d.write_new(d.E/('admission-'+name+'-version.json'),value);return value
    n['version']=ver;n['candidate']=lambda *a:{'capturedBeforeUnit':True,'identities':[]}
    if scenario=='holder changed':d.holder_fail=True
    if scenario=='source changed':d.source_fail=True
    if scenario=='authority false':a['authorized']=False
    if scenario=='preexisting candidate':d.fs.put('/R/E/candidate-baseline.json',{})
    check('capture ordering '+scenario,lambda:n['capture'](d,{},'a'*64,a,'b'*64),scenario!='success')
    assert d.fs.nodes['/R/E/hold.json']['data']==d.raw
    if scenario=='success':
        assert d.source_calls==2 and d.events.count('held')==3
        assert d.events.index('write:candidate-baseline.json')>max(i for i,v in enumerate(d.events) if v in ('guards','held','boundary'))
        facts=d.fs.obj('/R/E/root-admission-facts.json');assert facts['authorized'] is False and facts['proposedAuthorization']['authorized'] is False
        check('successful capture cannot overwrite/replay',lambda:n['capture'](d,{},'a'*64,a,'b'*64),True)
    else:assert 'candidate-baseline.json' not in d.writes and 'root-admission-facts.json' not in d.writes

for scenario in ('waited0','stderr','timeout','bool status'):
    n,d=mini()
    class Child:
        pid=77;returncode=False if scenario=='bool status' else 0
        def communicate(self,timeout):
            if scenario=='timeout':raise TimeoutError('SYNTHETIC_TIMEOUT')
            return 'v24.20.0\n','SYNTHETIC_ERROR' if scenario=='stderr' else ''
    n['subprocess']=types.SimpleNamespace(Popen=lambda *a,**k:Child(),DEVNULL=-1,PIPE=-2)
    A={'nodeCanonicalPath':'/NODE','nodeSha256':'N'}
    check('version utility '+scenario,lambda:n['version'](d,A,'node'),scenario!='waited0')
    record=d.fs.obj('/R/E/admission-node-version.json');assert record['timeoutSignalSent'] is False
    assert 'SYNTHETIC_ERROR' not in json.dumps(record)

# Current-candidate reader uses supplied table/comm/identity only.
for complete in (True,False):
    n=definitions();n['os']=types.SimpleNamespace(getpid=lambda:500,getppid=lambda:3749);n['time']=types.SimpleNamespace(time=lambda:100)
    C={'table':lambda:{500:{'pid':500},3749:{'pid':3749},23:{'pid':23,'argvHash':'A'}},'capture':lambda *a:'500 /Python\n3749 /bin/bash\n23 /NODE\n','identity':lambda row:{'pid':23,'argvHash':'A','identityComplete':complete}}
    b={'candidate-baseline.template.json':(D/'candidate-baseline.template.json').read_bytes()}
    check('candidate identity '+str(complete),lambda:n['candidate'](None,C,b),not complete)

# New generation entrypoints must reference the newly reviewed packet. The
# function bodies/policy remain unchanged; these are required path bindings.
for name in ('guard-exit.bash','exit-gate.py','verify-final.py'):
    text=(D/name).read_text()
    check('exact new packet entry binding '+name,lambda text=text:world_ns['contracts']['require']('gateway80-proof-prep/resume6' in text and 'gateway80-proof-prep/resume5' not in text,'WRONG_GENERATION'))
result={'scope':'ACTUAL_FUNCTIONS_GUARDED_FAKE_IO_ONLY','count':len(results),'checks':results,'allExpected':True,'priorFunctionalControls':215,'actualLsofOrOSProcessNativeCalls':0,'actualRuntimeOrWorkspaceWrites':0,'historicalRepair':False}
(D/'admission-control-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'newAdmissionControls':len(results),'allExpected':True,'actualActions':0}))

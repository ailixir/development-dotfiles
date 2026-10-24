"""Actual source06 functions; EVERY OS/path/process/fcntl boundary guarded/faked.
No runtime/main/module import, actual observer, baseline body, tool, signal or native work.
"""
from pathlib import Path,PurePosixPath
import ast,copy,hashlib,json,types,stat,errno
D=Path(__file__).parent
DENIED=[]
class Denied:
    def __getattr__(self,key):
        DENIED.append(key);raise AssertionError('UNFAKED_OPERATIONAL_BOUNDARY:'+key)

def defs(name,ns):
    tree=ast.parse((D/name).read_text())
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef)]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual06-functions-fake-boundaries>','exec'),ns)
    return ns
prefix=[]
for node in ast.parse((D/'boundary-controls.py').read_text()).body:
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in node.targets):break
    prefix.append(node)
world={'__file__':str(D/'boundary-controls.py')}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected-fake-world-only>','exec'),world)
World=world['World'];results=[]
def check(name,fn,hold=False):
    try:result=fn()
    except (ValueError,KeyError,OSError,TimeoutError):
        if not hold:raise
        result='HOLD'
    else:assert not hold,name
    results.append({'case':name,'passed':True,'expected':'HOLD' if hold else 'ACCEPT'});return result

# Strict actual held parser, kernel boundary reached ONLY after exact associated fields.
for mode in ('valid','wrong-pid','missing-pid','duplicate-pid','missing-fd','duplicate-fd','malformed-fd','leading-zero-fd','wrong-inode','duplicate-inode','missing-name','wrong-name','trailing-field','no-final-newline'):
    w=World();lock=w.H['lock']['path'];pid=w.H['wrapper']['pid'];ino=w.H['lock']['ino']
    raw=f'p{pid}\nf3\ni{ino}\nn{lock}\n'
    raw={'wrong-pid':raw.replace(f'p{pid}',f'p{pid+1}',1),'missing-pid':raw[raw.index('\n')+1:],
         'duplicate-pid':f'p{pid}\n'+raw,'missing-fd':raw.replace('f3\n',''),
         'duplicate-fd':raw.replace('f3\n','f3\nf4\n'),'malformed-fd':raw.replace('f3','f3x'),
         'leading-zero-fd':raw.replace('f3','f03'),'wrong-inode':raw.replace(f'i{ino}',f'i{ino+1}'),
         'duplicate-inode':raw.replace(f'i{ino}\n',f'i{ino}\ni{ino}\n'),
         'missing-name':raw[:raw.index('\nn')+1],'wrong-name':raw.replace(lock,'/WRONG_LOCK'),
         'trailing-field':raw+'p999\n','no-final-newline':raw.rstrip('\n')}.get(mode,raw)
    original=w.C['capture'];w.C['capture']=lambda command,raw=raw:raw if command[0]=='/usr/sbin/lsof' else original(command)
    kernel=[]
    def flock(handle,flags):
        kernel.append(flags)
        if flags==3:raise BlockingIOError(errno.EAGAIN,'FAKE_HELD')
    w.ns['fcntl']=types.SimpleNamespace(LOCK_EX=2,LOCK_NB=1,LOCK_UN=8,flock=flock)
    check('actual-held-fields:'+mode,lambda:w.ns['held'](w.A,w.C),mode!='valid')
    assert len(kernel)==(1 if mode=='valid' else 0)

# All immutable JSON classes consume ONE original verified byte buffer, never second content.
for label,path in [('scope','/D/scope.json'),('package-manifest','/D/manifest.json'),('source-plan','/D/source-guards.json'),('copy-manifest','/D/input-manifest.json'),('case-map','/D/case-map.json'),('runtime-H','/E/hold.json'),('candidate','/E/candidate-baseline.json'),('release','/E/root-authorization.json'),('decision','/E/green.root-decision.json'),('receipt','/E/prepare.receipt.json'),('consumed','/E/red.consumed.json'),('readiness','/E/final-readiness-v1.json'),('permit','/E/close.root-permit.json'),('observation','/E/observation-fake.json')]:
    w=World();p=w.fs.path(path);good=b'{"closed":"ORIGINAL"}\n';bad=b'{"closed":"SUBSTITUTED"}\n';calls=[]
    w.fs.put(path,good);pin=hashlib.sha256(good).hexdigest();w.ns['IMMUTABLE_EXPECTED'][path]=pin
    w.ns['SAFE_READER']=lambda p:(calls.append(str(p)) or (good if len(calls)==1 else bad))
    assert w.ns['file_hash'](p)==pin
    assert w.ns['read'](p)=={'closed':'ORIGINAL'} and calls==[path]
    check('same-buffer:'+label,lambda:w.ns['read_verified'](p,pin))
    check('same-buffer-wrong-pin:'+label,lambda:w.ns['read_verified'](p,'0'*64),True)
# Unknown JSON cannot grant itself trust from its own hash.
w=World();p=w.fs.path('/E/UNBOUND.json');w.fs.put(str(p),{'authorized':True});w.ns['file_hash'](p)
check('unbound-control-does-not-self-authorize',lambda:w.ns['read'](p),True)

# Leaf actual no-follow FD custody reader and same-buffer JSON consumer, all FDs fake.
for mode in ('valid','leaf-link','parent-link','wrong-pin'):
    w=World();w.fs.put('/R/PACKAGE/input.json',b'{"qualified":true}\n')
    if mode=='leaf-link':w.fs.put('/R/PACKAGE/input.json','/R/OTHER',kind='symlink',mode=0o777)
    if mode=='parent-link':w.fs.put('/R/PACKAGE','/R/OTHER',kind='symlink',mode=0o777)
    leaf={'Path':w.fs.path,'PurePosixPath':PurePosixPath,'os':w.fakeOS,'stat':stat,'hashlib':hashlib,'json':json,'ast':ast,'types':types,'sys':Denied()}
    defs('verified-inputs.py',leaf)
    pin=hashlib.sha256(b'{"qualified":true}\n').hexdigest() if mode!='wrong-pin' else '0'*64
    check('actual-leaf-FD-JSON:'+mode,lambda:leaf['record'](w.fs.path('/R/PACKAGE/input.json'),pin),mode!='valid')
    assert not w.fakeOS.fds
# Actual package reader validates the same retained manifest/member buffers and bounded names.
for mode in ('valid','member-substitution','manifest-substitution','member-mode','member-parent-link'):
    w=World();code=b'pass\n';w.fs.put('/R/PACKAGE/member.py',code)
    manifest={'files':[{'path':'member.py','sha256':hashlib.sha256(code).hexdigest(),'bytes':len(code),'mode':0o644}]}
    raw=json.dumps(manifest).encode();w.fs.put('/R/PACKAGE/manifest.json',raw)
    if mode=='member-substitution':w.fs.put('/R/PACKAGE/member.py',b'import BAD\n')
    if mode=='manifest-substitution':w.fs.put('/R/PACKAGE/manifest.json',b'{"files":[]}')
    if mode=='member-mode':w.fs.nodes['/R/PACKAGE/member.py']['mode']=0o600
    if mode=='member-parent-link':w.fs.put('/R/PACKAGE','/R/OTHER',kind='symlink',mode=0o777)
    leaf={'Path':w.fs.path,'PurePosixPath':PurePosixPath,'os':w.fakeOS,'stat':stat,'hashlib':hashlib,'json':json,'ast':ast,'types':types,'sys':Denied(),'EXPECTED':w.fs.path('/R/PACKAGE')}
    defs('verified-inputs.py',leaf)
    check('actual-package-verified-buffer:'+mode,lambda:leaf['package_buffers'](w.fs.path('/R/PACKAGE'),hashlib.sha256(raw).hexdigest()),mode!='valid')
    assert not w.fakeOS.fds

# Actual CORE reader AST interprets the SAME verified source; no second read/import.
core_path=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py')
core_raw=core_path.read_bytes();assert hashlib.sha256(core_raw).hexdigest()=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
w=World();fakecore='/R/'+str(core_path);w.fs.put(fakecore,core_raw);calls=[]
w.ns['ast']=ast;w.ns['SAFE_READER']=lambda p:(calls.append(str(p)) or (core_raw if len(calls)==1 else b'import SOURCE_SUBSTITUTION_MUST_NEVER_EXECUTE\n')) if str(p)==fakecore else w.fs.nodes[str(p)]['data']
C=w.ns['core']();assert calls==[fakecore];check('actual-CORE-same-verified-AST-buffer',lambda:world['contracts']['require']('boundary_inventory' in C,'CORE'))
# Protected baseline reader is faked in memory; real baseline path is NEVER touched.
w=World();before=b'{"identities":[]}\n';pin=hashlib.sha256(before).hexdigest();w.H['baselineSha256']=pin;w.fs.put('/R/BASELINE',before);calls=[]
w.ns['SAFE_READER']=lambda p:(calls.append(str(p)) or (before if len(calls)==1 else b'{"identities":["BAD_SECOND_BUFFER"]}')) if str(p)=='/R/BASELINE' else w.fs.nodes[str(p)]['data']
C=copy.copy(w.C);C.update(ROOT=w.d.R,Path=w.fs.path,json=json)
C['regular']=lambda p:(_ for _ in ()).throw(AssertionError('UNVERIFIED_BASELINE_REOPEN'))
fn=next(n for n in ast.parse(core_raw).body if isinstance(n,ast.FunctionDef) and n.name=='boundary_inventory')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<actual-boundary-json-consumer>','exec'),C)
C['table']=lambda:{pid:{**row,'projectMarkerCandidate':False} for pid,row in w.rows.items()}
C['capture']=w.C['capture'];C['utc']=lambda:'FAKE_TIME';w.d.boundary(w.H,C,w.A)
assert calls==['/R/BASELINE'];check('actual-baseline-regular-same-buffer',lambda:None)

# Explicit actual Popen lifecycle: timeout/failure never invokes signal/context/wait workaround.
for mode in ('waited0','waited1','stderr','timeout','communication-error','spawn-error','bool-status','incomplete-output'):
    w=World();signals=[];calls=[]
    class Child:
        pid=77;returncode=None
        def communicate(self,timeout):
            calls.append(('communicate',timeout))
            if mode=='timeout':raise TimeoutError('SYNTHETIC_TIMEOUT')
            if mode=='communication-error':raise OSError('SYNTHETIC_COMMUNICATION')
            self.returncode=False if mode=='bool-status' else 1 if mode=='waited1' else 0
            return (None if mode=='incomplete-output' else 'PUBLIC_OUTPUT\n'),'SYNTHETIC_ERROR' if mode=='stderr' else ''
        def kill(self):signals.append('kill');raise AssertionError('SIGNAL_FORBIDDEN')
        def terminate(self):signals.append('terminate');raise AssertionError('SIGNAL_FORBIDDEN')
        def wait(self,*args,**kwargs):raise AssertionError('UNBOUNDED_OR_FABRICATED_WAIT')
        def __enter__(self):raise AssertionError('CONTEXT_MANAGER_FORBIDDEN')
    def popen(*args,**kwargs):
        calls.append(('Popen',args,kwargs))
        if mode=='spawn-error':raise OSError('SYNTHETIC_SPAWN')
        return Child()
    w.ns['subprocess']=types.SimpleNamespace(Popen=popen,DEVNULL=-1,PIPE=-2)
    expected_hold=mode in ('timeout','communication-error','spawn-error','bool-status','incomplete-output')
    check('actual-no-signal-lifecycle:'+mode,lambda:w.ns['no_signal_process'](['/bin/ps','FAKE_ARG'],'FAKE_BINARY'),expected_hold)
    rec=w.ns['OBSERVATION_RECORDS'][0];assert not signals and rec['timeoutSignalSent'] is False
    assert not any(p.startswith('/E/observation-') for p in w.fs.nodes)
    if mode in ('timeout','communication-error','spawn-error'):assert rec['terminalWaitConfirmed'] is False and rec['actualExit'] is None and rec['classification'].startswith('UNKNOWN_')
    if mode in ('waited0','waited1','stderr'):assert rec['terminalWaitConfirmed'] is True and type(rec['actualExit']) is int
    assert 'SYNTHETIC_ERROR' not in json.dumps(rec)

# After C4 a timed-out utility retains its partial identity in an exclusive record, without signals.
w=World();w.ns['bind_observation_client'](w.rows);signals=[]
class UnknownChild:
    pid=77;returncode=None
    def communicate(self,timeout):raise TimeoutError('SYNTHETIC_TIMEOUT')
    def kill(self):signals.append('kill')
    def terminate(self):signals.append('terminate')
w.ns['subprocess']=types.SimpleNamespace(Popen=lambda *a,**kw:UnknownChild(),DEVNULL=-1,PIPE=-2)
w.ns['enable_observation_writes']()
check('actual-timeout-post-C4-retains-partial-UNKNOWN',lambda:w.ns['no_signal_process'](['/bin/ps','FAKE_ARG'],'b'*64),True)
records=[w.fs.obj(p) for p in w.fs.nodes if p.startswith('/E/observation-')]
assert len(records)==1 and records[0]['childPid']==77 and records[0]['actualExit'] is None and records[0]['terminalWaitConfirmed'] is False and not signals
# No broad client/subtree exemption: prior same PID/start survives => HOLD; numeric reuse is separate.
for mode in ('prior-absent','prior-same-start','prior-reused','unknown-child','bool-status'):
    w=World();w.ns['bind_observation_client'](w.rows)
    rec={'client':{'pid':700,'start':'OLD_START'},'childPid':77,'command':['/bin/ps','FAKE_ARG'],'executableSha256':'b'*64,'classification':'WAITED_POPEN_CHILD','terminalWaitConfirmed':True,'actualExit':0,'stdoutComplete':True,'stderrComplete':True,'timeoutSignalSent':False}
    if mode=='prior-same-start':w.rows[700]={'pid':700,'start':'OLD_START'}
    if mode=='prior-reused':w.rows[700]={'pid':700,'start':'UNRELATED_NEW_START'}
    if mode=='unknown-child':rec.update(terminalWaitConfirmed=False,actualExit=None,classification='UNKNOWN_TIMEOUT_OR_COMMUNICATION_FAILURE_NO_SIGNAL')
    if mode=='bool-status':rec['actualExit']=False
    w.fs.put('/E/observation-prior.json',rec);w.ns['IMMUTABLE_EXPECTED']['/E/observation-prior.json']=w.fs.nodes['/E/observation-prior.json']['sha']
    check('actual-observer-history:'+mode,lambda:w.ns['observation_history'](w.C),mode in ('prior-same-start','unknown-child','bool-status'))

# Actual capture prequalification: actual held is exercised; other source observations are fake.
capns={'Path':PurePosixPath,'PurePosixPath':PurePosixPath,'ast':ast,'json':json,'hashlib':hashlib,'copy':copy,'types':types,'stat':stat,'os':Denied(),'subprocess':Denied(),'time':Denied(),'sys':Denied(),'R':PurePosixPath('/R'),'P':PurePosixPath('/D')}
for node in ast.parse((D/'capture-admission.py').read_text()).body:
    if isinstance(node,ast.Assign) and all(isinstance(t,ast.Name) and t.id in {'HOLD_SHA','FAILURE_SHA','CLOSURE_SHA','LABEL','ROOT01_SHA'} for t in node.targets):exec(compile(ast.Module(body=[node],type_ignores=[]),'<closed-pin-fixtures>','exec'),capns)
defs('capture-admission.py',capns)
basecap=capns.copy()
def capture_world(mode):
    w=World();n=basecap.copy();defs('capture-admission.py',n);events=[]
    # Move only synthetic controller identities into the exact required3720/3749 slots.
    for old,new in ((90,3720),(100,3749)):
        row=w.rows.pop(old);row.update(pid=new,ppid=1 if new==3720 else 3720);w.rows[new]=row;w.commands[new]=w.commands.pop(old);w.comms[new]=w.comms.pop(old)
    w.rows[500]['ppid']=3749;w.fakeOS.parent=3749
    w.H['wrapper']['pid']=3720;w.H['shell']['pid']=3749
    w.fs.put('/E/hold.json',w.H,mode=0o600);pin=w.fs.nodes['/E/hold.json']['sha'];n['HOLD_SHA']=pin;w.A['holdFileSha256']=pin
    # Exact H-only synthetic state; no actual runtime filesystem is queried.
    for path in list(w.fs.nodes):
        if path.startswith('/E/') and path!='/E/hold.json':w.fs.nodes.pop(path)
    for path in list(w.fs.nodes):
        if path=='/W' or path.startswith('/W/'):w.fs.nodes.pop(path)
    w.S['workspace']='/W';w.reset_inputs()
    n['safe_bytes']=lambda p:w.fs.nodes[str(p)]['data']
    n['os']=types.SimpleNamespace(getuid=lambda:42,getpid=lambda:500,getppid=lambda:w.fakeOS.parent,umask=lambda v:0o022 if mode=='umask' else 0o077)
    w.fakeOS.umask=n['os'].umask
    n['prepare_proposal']=lambda *a:{**w.A,'authorized':False}
    w.ns['SAFE_READER']=lambda p:w.fs.nodes[str(p)]['data']
    C=w.C;w.d.core=lambda:C
    oldheld=w.ns['held']
    def held(A,C):events.append('held');return oldheld(A,C)
    w.d.held=held
    oldbind=w.ns['bind_observation_client'];w.d.bind_observation_client=lambda rows:(events.append('client-bind'),oldbind(rows))[-1]
    oldwrite=w.ns['write_new']
    def write(path,value):events.append('write:'+path.name);oldwrite(path,value)
    w.d.write_new=write
    w.d.enable_observation_writes=lambda:events.append('enable-records')
    def version(d,A,name):value={'actualExit':0,'terminalWaitConfirmed':True,'timeoutSignalSent':False};write(d.E/('admission-'+name+'-version.json'),value);return value
    n['version']=version;n['candidate']=lambda *args:{'capturedBeforeUnit':True,'label':w.S['label'],'identities':[]}
    # Pending candidate is consumed via the ACTUAL read_verified path, with no file publication.
    def boundary(H,C,A):
        events.append('boundary');assert not (w.d.E/'candidate-baseline.json').exists()
        val=w.ns['read_verified'](w.d.E/'candidate-baseline.json',A['candidateBaselineSha256']);assert val['capturedBeforeUnit'] is True
        return {'inheritedMatched':[{'synthetic':True}]*6,'unknownCandidates':[]}
    w.d.boundary=boundary;w.d.guards=lambda *a:(events.append('guards') or {'sourceDigest':'FAKE_F9'})
    if mode=='controller-start':w.rows[3720]['start']='CHANGED'
    if mode=='controller-argv':w.commands[3720]='CHANGED'
    if mode=='controller-parent':w.rows[3749]['ppid']=1
    if mode=='observer-parent':w.fakeOS.parent=999
    if mode=='wrong-returned-pid':
        original=C['capture'];C['capture']=lambda cmd:original(cmd).replace('p3720\n','p999\n') if cmd[0]=='/usr/sbin/lsof' else original(cmd)
    if mode=='lost-fd':
        original=C['capture'];C['capture']=lambda cmd:'' if cmd[0]=='/usr/sbin/lsof' else original(cmd)
    if mode=='inode':w.fs.nodes[w.H['lock']['path']]['ino']+=1
    if mode=='kernel-free':w.ns['fcntl'].flock=lambda *a:None
    if mode=='H-mode':w.fs.nodes['/E/hold.json']['mode']=0o644
    if mode=='E-mode':w.fs.nodes['/E']['mode']=0o755
    if mode=='E-extra':w.fs.put('/E/UNEXPECTED.json',{})
    if mode=='W-present':w.fs.put('/W',kind='directory')
    a={'authorized':True,'authorizedBy':'root','decision':'CONTINUE_SAME_UNCONSUMED_GATEWAY_ADMISSION_ONCE','packetManifestSha256':'a'*64,'existingHoldSha256':pin,'priorFailureSha256':n['FAILURE_SHA'],'c8ClosureAdoptionSha256':n['CLOSURE_SHA'],'label':n['LABEL'],'maximumCaptures':1,'readonlySameShellOneShotRequired':True,'sameWrapperPid':3720,'sameShellPid':3749,'nativeOrPhaseAuthorized':False,'workspaceCreationAuthorized':False,'automaticRetry':False,'historicalRepairClaim':False,'reviews':{role:{'sha256':'b'*64} for role in ('architecture','qa')}}
    return w,n,a,events
for mode in ('valid','controller-start','controller-argv','controller-parent','observer-parent','wrong-returned-pid','lost-fd','inode','kernel-free','umask','H-mode','E-mode','E-extra','W-present'):
    w,n,a,events=capture_world(mode)
    check('actual-capture-zero-output-pre-C4:'+mode,lambda:n['capture'](w.d,{},'a'*64,a,'b'*64),mode!='valid')
    if mode!='valid':assert not any(e.startswith('write:') for e in events),events
    else:
        assert events[:3]==['held','client-bind','held']
        assert events[3]=='write:admission-capture-attempt.json'
        assert events[-2:]==['write:candidate-baseline.json','write:root-admission-facts.json']
        assert w.fs.obj('/E/root-admission-facts.json')['authorized'] is False
        assert not w.d.W.exists()
# Full legitimate actual capture flow: proposal/core/held/guards/versions/candidate/boundary all actual functions.
# Fixed-byte/process/FD/clock boundaries remain fake; six inherited identities are synthetic.
w,n,a,events=capture_world('valid')
for file,target,names in [('capture-admission.py',n,{'prepare_proposal','version','candidate'}),('run-private.py',w.ns,{'guards','boundary','core','enable_observation_writes'})]:
    tree=ast.parse((D/file).read_text());selected=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in names]
    exec(compile(ast.Module(body=selected,type_ignores=[]),'<actual-complete-capture-functions>','exec'),target)
class FakePathFactory:
    def __call__(self,path):return w.fs.path(path)
    def home(self):return w.fs.path('/FAKE_HOME')
n['Path']=FakePathFactory();n['R']=w.d.R;n['P']=w.d.D;n['time']=types.SimpleNamespace(time=lambda:100)
actual_digest=n['digest'];node_pin='9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a'
n['digest']=lambda raw:node_pin if raw==b'FAKE_NODE' else actual_digest(raw)
w.fs.nodes['/NODE']['sha']=node_pin
inherited=[];w.fs.put('/FAKE_DAEMON',b'FAKE_DAEMON_BINARY',mode=0o755)
for pid in range(1001,1007):
    argv='SYNTHETIC_INHERITED_'+str(pid);comm='/FAKE_DAEMON';start='Mon Oct 19 07:00:00 2026'
    row={'pid':pid,'ppid':1,'start':start,'argvHash':hashlib.sha256(argv.encode()).hexdigest()}
    w.rows[pid]=row;w.commands[pid]=argv;w.comms[pid]=comm
    inherited.append({**row,'identityComplete':True,'commHash':hashlib.sha256(comm.encode()).hexdigest(),'executableHash':hashlib.sha256(comm.encode()).hexdigest(),'executableFileHash':hashlib.sha256(b'FAKE_DAEMON_BINARY').hexdigest()})
w.fs.put('/R/BASELINE',{'identities':inherited});w.H['baselineSha256']=w.fs.nodes['/R/BASELINE']['sha']
w.fs.put('/E/hold.json',w.H,mode=0o600);holdpin=w.fs.nodes['/E/hold.json']['sha'];n['HOLD_SHA']=holdpin;a['existingHoldSha256']=holdpin
w.fs.put('/R/'+str(core_path),core_raw)
w.ns['IMMUTABLE_BYTES']={};w.ns['IMMUTABLE_EXPECTED']['/E/hold.json']=holdpin
w.ns['ast']=ast;original_core=w.ns['core']
def actual_fake_core():
    C=original_core();C['Path']=w.fs.path;C['os']=w.fakeOS
    C['datetime']=types.SimpleNamespace(datetime=types.SimpleNamespace(now=lambda tz:types.SimpleNamespace(isoformat=lambda:'FAKE_TIME')),timezone=types.SimpleNamespace(utc='UTC'))
    return C
w.d.core=actual_fake_core
w.ns['observation_binary']=lambda command:(command,'FAKE_ALREADY_BOUND_UTILITY')
childcount=[0]
def response(command):
    if command[0]=='git':return '\0'.join(x['path'] for x in world['G']['files'])+'\0'
    if command[0]=='/bin/ps':
        if '-axo' in command:
            if command[-1]=='pid=,comm=':return ''.join(str(pid)+' '+comm+'\n' for pid,comm in w.comms.items())
            return ''.join(f"{pid} {row['ppid']} {row['start']} {w.commands[pid]}\n" for pid,row in w.rows.items())
        pid=int(command[command.index('-p')+1]);col=command[-1].removesuffix('=')
        return str({'lstart':w.rows[pid]['start'],'ppid':w.rows[pid]['ppid'],'comm':w.comms[pid],'command':w.commands[pid]}[col])+'\n'
    if command[0]=='/usr/sbin/lsof':
        if '-iTCP' in command:return 'p999\nn127.0.0.1:9999\n'
        if 'txt' in command:return 'n/FAKE_DAEMON\n'
        return 'p3720\nf3\ni'+str(w.H['lock']['ino'])+'\nn'+w.H['lock']['path']+'\n'
    if command[0]=='/NODE':return 'v24.20.0\n'
    if command[0]=='/HELM':return 'vSYNTHETIC_HELM\n'
    raise AssertionError('UNFAKED_COMMAND:'+str(command))
class CompleteChild:
    def __init__(self,command):childcount[0]+=1;self.pid=9000+childcount[0];self.command=command;self.returncode=None
    def communicate(self,timeout):assert timeout==10;self.returncode=0;return response(self.command),''
    def kill(self):raise AssertionError('SIGNAL_FORBIDDEN')
    def terminate(self):raise AssertionError('SIGNAL_FORBIDDEN')
w.ns['subprocess']=types.SimpleNamespace(Popen=lambda command,**kw:CompleteChild(command),DEVNULL=-1,PIPE=-2)
# Re-enable the actual buffered record publisher; fake write_new records exact generated hashes.
w.d.enable_observation_writes=w.ns['enable_observation_writes']
buffers={name:(D/name).read_bytes() for name in ['root-authorization.template.json','source-guards.json','candidate-baseline.template.json']}
full=n['capture'](w.d,buffers,'a'*64,a,'b'*64)
assert full['authorized'] is False and full['proposedAuthorization']['authorized'] is False
assert len(full['boundary']['inheritedMatched'])==6 and not full['boundary']['incompleteStableIdentities']
assert full['beforeSource']['source1808'] and full['afterSource']['main506'] and full['afterSource']['dist238']
assert full['workspaceAbsent'] is True and not w.d.W.exists()
assert childcount[0]>20 and all(r['terminalWaitConfirmed'] and r['actualExit']==0 and r['timeoutSignalSent'] is False and r['client']['start'] for r in w.ns['OBSERVATION_RECORDS'])
assert len([path for path in w.fs.nodes if path.startswith('/E/observation-')])==len(w.ns['OBSERVATION_RECORDS'])
check('complete-actual-capture-flow-six-synthetic-inherited-all-boundaries-faked',lambda:None)

# readonly shell cap: enforce actual source ordering, then model only its finite builtins.
script=(D/'capture-once.bash').read_text();body=script[script.index('function gateway80_capture_once()'):script.index('readonly -f gateway80_capture_once')]
assert body.index('${GATEWAY80_CAPTURE_ATTEMPTED+x}')<body.index('readonly GATEWAY80_CAPTURE_ATTEMPTED=1')<body.index('"$GATEWAY80_CAPTURE_PYTHON" -B')
assert script.count('readonly GATEWAY80_CAPTURE_ATTEMPTED=1')==1 and 'unset ' not in script
for child_status in (0,1):
    env={};launches=[]
    def closed_guard_model():
        # The actual source above has exactly this finite test/readonly/launch/status sequence.
        if 'GATEWAY80_CAPTURE_ATTEMPTED' in env:return 1
        env['GATEWAY80_CAPTURE_ATTEMPTED']=('readonly',1);launches.append(child_status);return child_status
    assert closed_guard_model()==child_status and closed_guard_model()==1 and len(launches)==1
    check('readonly-cap-includes-prequalification-exit:'+str(child_status),lambda:None)
assert not DENIED,DENIED
out={'kind':'SOURCE06_ACTUAL_FUNCTIONS_ALL_EXERCISED_BOUNDARIES_FAKED','checks':results,'count':len(results),'allExpected':True,'unfakedBoundaryCalls':DENIED,'actualNativeProcessObserverLockBaselinePrivateOrRuntimeActions':0,'runtimeOrSourceRelease':False}
(D/'revision06-control-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'revision06Checks':len(results),'allExpected':True,'actualActions':0}))

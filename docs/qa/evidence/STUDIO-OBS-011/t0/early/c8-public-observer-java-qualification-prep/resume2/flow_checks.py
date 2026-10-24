"""Actual controller flow with one explicit cooperative READY yield; no real concurrency."""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
RAW={n:(HERE/n).read_bytes() for n in ('qualification_controller.py','qualification_custody.py','qualified_relay.py','public_contract.py','source_checks.py')}
CHECKS=[];BLOCKED=[];CASES=[]
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    CHECKS.append(dict(name=name,passed=True))
def module(name):
    value=types.ModuleType('flow_'+name[:-3]);exec(compile(RAW[name],'<prepared flow '+name+'>','exec'),value.__dict__)
    value.__source_sha256__=hashlib.sha256(RAW[name]).hexdigest();return value
C=module('qualification_controller.py');K=module('qualification_custody.py');R=module('qualified_relay.py');P=module('public_contract.py')
helpers=ast.parse(RAW['source_checks.py']);helpers.body=[n for n in helpers.body if isinstance(n,ast.FunctionDef) and n.name in ('spec','dump','release')]
H=dict(globals());exec(compile(helpers,'<finite model factories>','exec'),H)

# Preserve every original serve statement; one test-only yield immediately after READY
# models controller startup before enrollment. This is not real thread/platform evidence.
tree=ast.parse(RAW['qualified_relay.py']);original=copy.deepcopy(tree)
relayclass=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Relay')
serve=next(n for n in relayclass.body if isinstance(n,ast.FunctionDef) and n.name=='serve')
block=serve.body[0].body
ready=next(i for i,n in enumerate(block) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)
           and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='set')
block.insert(ready+1,ast.Expr(value=ast.Yield(value=ast.Constant(value='TEST_READY_ONLY'))))
ast.fix_missing_locations(tree)
namespace=R.__dict__;exec(compile(tree,'<single READY yield>','exec'),namespace)
restored=copy.deepcopy(tree)
for node in ast.walk(restored):
    if isinstance(node,ast.FunctionDef) and node.name=='serve':
        node.body[0].body=[n for n in node.body[0].body if not (isinstance(n,ast.Expr) and isinstance(n.value,ast.Yield))]
check('REMOVE_ONLY_YIELD_RESTORES_SERVE_AST',ast.dump(restored,include_attributes=False)==ast.dump(original,include_attributes=False))

class Event:
    def __init__(self,model):self.value=False;self.model=model
    def set(self):self.value=True
    def is_set(self):return self.value
    def wait(self,unused):
        if self.value and self.model.kind=='early':self.model.progress()
        return self.value
class Thread:
    def __init__(self,model,callback):self.model=model;self.callback=callback;self.alive=False;self.generator=None
    def start(self):
        self.generator=self.callback();self.alive=True;self.model.thread=self;next(self.generator)
    def is_alive(self):return self.alive
    def progress(self):
        if self.alive:
            try:next(self.generator)
            except StopIteration:self.alive=False
    def join(self,seconds):
        check('JOIN_BOUND_'+self.model.kind,seconds==5)
        if self.model.kind!='join_unknown':self.progress()
class Selector:
    def modify(self,*args):return None
    def register(self,*args):return None
    def select(self,seconds):check('SELECTOR_BOUND',0<=seconds<=0.1);return []
    def close(self):return None
class Connection:
    def __init__(self,model):self.model=model;self.pending=model.frames();self.sent=b'';self.closed=0
    def fileno(self):return 301
    def set_inheritable(self,value):check('CONNECTION_NOT_INHERITABLE',value is False)
    def setblocking(self,value):check('CONNECTION_NONBLOCKING',value is False)
    def getsockopt(self,level,option,amount):
        if self.model.kind=='abi':return b'x'
        if option==1:return struct.pack('=IIh',0,501,1)+b'\0'*66
        return struct.pack('=i',124 if self.model.kind=='foreign' else 123)
    def recv(self,amount):
        value=self.pending[:amount];self.pending=self.pending[amount:];return value
    def send(self,value):self.sent+=value;return len(value)
    def close(self):
        self.closed+=1
        if self.model.kind=='close_unknown':raise OSError('never published')
class Listener:
    def __init__(self,model):self.model=model;self.closed=0
    def fileno(self):return 300
    def set_inheritable(self,value):check('LISTENER_NOT_INHERITABLE',value is False)
    def setblocking(self,value):check('LISTENER_NONBLOCKING',value is False)
    def bind(self,path):check('EXACT_ENDPOINT',path==R.ENDPOINT);self.model.node=True
    def listen(self,count):check('ONE_BACKLOG',count==1)
    def getsockname(self):return R.ENDPOINT
    def accept(self):return Connection(self.model),None
    def close(self):self.closed+=1
class Directory:
    def __init__(self,model,path,mode,ownership):
        self.model,self.path,self.ownership,self.initialized=model,path,ownership,False
        self.fd=100+len(ownership.tokens);self.os=model;self.chain=[(None,'/',self.fd,(1,2,stat.S_IFDIR|0o700,501))]
        ownership.owner(self);self.token=ownership.acquire(self,self.fd,lambda unused:None,'DIRECTORY')
        if path==R.SHORT and model.kind=='partial_create':
            ownership.close(self.token);raise OSError('constructor failed')
        self.initialized=True
    def check(self):return None
    def read(self,name,mode,cap):
        path=self.path+'/'+name
        if name=='public-observation.json':raw=self.model.output
        else:raw=self.model.files[path]
        return raw,types.SimpleNamespace(st_uid=501,st_nlink=1)
    def close(self):self.ownership.close(self.token)
    def absent(self,name):return not self.model.created
    def members(self):return []
    def info(self,name):
        return types.SimpleNamespace(st_dev=1,st_ino=3 if name=='r.sock' else 2,
            st_mode=(stat.S_IFSOCK|0o600) if name=='r.sock' else (stat.S_IFDIR|0o700),st_uid=501)
    def write(self,name,raw,mode):
        check('EXCLUSIVE_PUBLIC_OUTPUT_NAME',name=='public-observation.json' and mode==0o600)
        if self.model.kind=='write_failed':raise OSError('writer fails')
        self.model.output=raw
class Model:
    platform='darwin'
    def __init__(self,kind):
        self.kind=kind;self.created=False;self.node=False;self.thread=None;self.now=0;self.output=None;self.files={};self.sequence=[]
        self.mode='parser' if kind=='parser' else 'relay'
        self.release=H['release'](self.mode)
        control=dict(schemaVersion=1,protocolVersion=2,**{k:P.CONSTANTS[k] for k in ('unit','class','method')},
            amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath=R.ENDPOINT,enrollmentNonce='1'*64,**R.LIMITS)
        self.controlraw=H['dump'](control);self.controlsha=hashlib.sha256(self.controlraw).hexdigest();self.release['launchControlSha256']=self.controlsha
        if kind=='invalid_release':self.release['ownerUid']=True
        raw=H['dump'](self.release);self.release_spec=H['spec']('/synthetic/control/release.json',raw);self.files[self.release_spec['path']]=raw
        decision=dict(schemaVersion=1,protocol=C.PROTOCOL,purpose='ONE_SYNTHETIC_MODE_ONLY',authorizedBy='root',releaseSha256=self.release_spec['sha256'],mode=self.mode,cap=1,attempt=1,operation='invoke')
        raw=H['dump'](decision);self.decision_spec=H['spec']('/synthetic/control/decision.json',raw);self.files[self.decision_spec['path']]=raw
        self.control_spec=H['spec']('/synthetic/control/control.json',self.controlraw);self.files[self.control_spec['path']]=self.controlraw
        for name,pin in self.release['codePins'].items():self.files[pin['path']]=RAW[name]
        for role,pin in self.release['inputPins'].items():self.files[pin['path']]={'JAVA':b'J','CLASS':b'C','JACKSON':b'K','ORDINARY_ADAPTER':b'A'}[role]
    def frames(self):
        observation=P.record('FINALIZING','NOT_REPRODUCED')
        data=dict(protocolVersion=2,controlSha256=self.controlsha,enrollmentNonce='1'*64,observation=observation,networkAccounting=observation['networkAccounting'])
        if self.kind=='nonce':data['enrollmentNonce']='2'*64
        raw=R.wire(observation)+b'\n';projection=hashlib.sha256(raw).hexdigest()
        commit=dict(protocolVersion=2,controlSha256=self.controlsha,projectionSha256=projection,status='CALLER_SAW_CUSTODIED_ACK',callerElapsedNs=10)
        if self.kind=='late_commit':commit['callerElapsedNs']=14999999999
        values=[data] if self.kind=='missing_commit' else [data,commit]
        framed=b''.join(struct.pack('!I',len(R.wire(x)))+R.wire(x) for x in values)
        return framed+(b'X' if self.kind=='extra' else b'')
    def mkdir(self,name,mode,**kwargs):
        check('EXCLUSIVE_SHORT_MODE',mode==0o700 and name=='obs011-pub-observe01');self.created=True
    def clock(self):self.now+=100;return self.now
    def uid(self):return 501
    def event(self):return Event(self)
    def thread_factory(self,callback):return Thread(self,callback)
    def selector(self):return Selector()
    def listener(self):return Listener(self)
    def fd_metadata(self,fd):return dict(dev=1,inode=fd,mode=stat.S_IFSOCK|0o600,uid=501)
    def progress(self):
        if self.thread:self.thread.progress()
class Ordinary:
    protocol=C.PROTOCOL
    def __init__(self,model):self.model=model;self.process=types.SimpleNamespace(pid=123);self.waits=0;self.source_sha256=hashlib.sha256(b'A').hexdigest()
    def validate_admission(self,*args):self.model.sequence.append('validated');return True
    def consume(self,*args):self.model.sequence.append('consumed');return True
    def record_ready(self,value):check('READY_BEFORE_LAUNCH',value['ready'] is True);self.model.sequence.append('ready')
    def launch(self,value):self.model.sequence.append('launched');return self.process
    def identity(self,process):
        return dict(pid=123,ppid=77,uid=501,start='SYNTHETIC',processImage='/synthetic/bin/java',executableFileHash=self.model.release['inputPins']['JAVA']['sha256'],
            identityComplete=True,kernelIdentityComplete=True,kernelStartSeconds=1,kernelStartMicroseconds=2,argvHash='7'*64)
    def controller_pid(self):return 77
    def wait(self,process):
        self.waits+=1
        if self.model.kind=='join_unknown':
            # Simulate protocol completed but owner thread still unresolved, independently
            # of its cooperative callback completion. No actual thread is created.
            self.model.progress();self.model.thread.alive=True
        else:self.model.progress()
        evidence=dict(case='relay',status='ROOT_RECEIPT_REQUIRED',nativeBusinessRequests=0) if self.model.mode=='relay' else dict(case='parser',status='PASS',originalChecks=18,addedChecks=6,checks=24,nativeBusinessRequests=0)
        request=dict(protocol=C.PROTOCOL,releaseSha256=self.model.release_spec['sha256'],mode=self.model.mode,
            argv=self.model.release['argv'],environmentSha256=self.model.release['environmentSha256'],launchControlSha256=self.model.controlsha)
        request_sha=hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
        return dict(directPid=123,directWaited=True,nativeStatus=1 if self.model.kind=='native_failed' else 0,
            stdoutComplete=True,stderrComplete=True,ownedWorkTerminated=True,descriptorsClosed=True,requestSha256=request_sha,modeEvidence=H['dump'](evidence),archiveSha256='e'*64)

def run(kind):
    model=Model(kind);ordinary=Ordinary(model)
    custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:Directory(model,path,mode,ownership))
    custody.__source_sha256__=K.__source_sha256__
    boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,
        selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
    modules=dict(custody=custody,relay=R,contract=P,controller=C)
    invocation=C.Invocation(ordinary,modules,model,boundary)
    result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    CASES.append(dict(name=kind,result=result))
    if kind in ('good','parser'):
        check('FLOW_ACCEPT_'+kind,result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and result['canonicalClosed'] is True)
        if kind=='good':check('STARTUP_ORDER',model.sequence==['validated','consumed','ready','launched'])
    else:
        check('FLOW_HOLD_'+kind,result['status']=='HOLD')
        if kind in ('close_unknown','join_unknown'):check('FLOW_RETAINS_'+kind,result['canonicalClosed'] is False and invocation in C.RETAINED)
        else:check('FLOW_CLEAN_FAILED_DRAIN_'+kind,result['canonicalClosed'] is True)
    if kind=='invalid_release':check('NO_MUTATION_BEFORE_FULL_SCHEMA',not model.created and model.sequence==[])
    if kind=='early':check('EARLY_ENROLLMENT_CONSUMED_HOLD',invocation.peer.consumed and result['primaryReason']=='EARLY_ENROLLMENT')
    if kind=='native_failed':check('NATIVE_FAILED_NOT_CONVERTED',result['primaryReason']=='NATIVE_FAILED' and result['nativeStatus']==1)
    if kind=='partial_create':check('PARTIAL_CREATE_RETAINED',result['partialShortCreated'] is True and result['namespaceMetadataState']=='CREATED_METADATA_UNQUALIFIED')
    before=list(model.sequence)
    try:invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
    except C.Hold:check('NO_SECOND_ATTEMPT_'+kind,model.sequence==before)
    else:check('NO_SECOND_ATTEMPT_'+kind,False)

def denied(*args,**kwargs):BLOCKED.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event=='open':
        if args[0]==str(HERE/'flow-check-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):raise AssertionError('AUDIT_DENIED_'+event)
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
      (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
      (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,denied))
    for kind in ('good','parser','invalid_release','early','foreign','abi','nonce','late_commit','missing_commit','extra','write_failed','native_failed','partial_create','close_unknown','join_unknown'):run(kind)
    check('ZERO_FORBIDDEN_REAL_CALLS',BLOCKED==[])
result=dict(kind='EXACT_CONTROLLER_SYNTHETIC_COOPERATIVE_FLOW',passed=len(CHECKS),failed=0,checks=CHECKS,cases=CASES,
    singleTestOnlyReadyYield=True,removeYieldRestoresServeAst=True,realConcurrency=False,forbiddenBoundaryCalls=BLOCKED,
    actualNativeJavaTlsUnixPeerPlatformActions=0)
(HERE/'flow-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),cases=len(CASES),failed=0,actualNativeActions=0)))

"""Finite affected source controls. Every reached target effect is synthetic in its namespace."""
import ast, builtins, copy, ctypes, fcntl, hashlib, io, json, os, re, selectors, socket, stat, struct, subprocess, sys, threading, time, types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
OLD=HERE.parents[2]/'early/c8-check01-public-evidence-prep/resume6'
NAMES=('qualification_controller.py','qualification_custody.py','qualified_relay.py','public_contract.py','entry_loader.py')
RAW={name:(HERE/name).read_bytes() for name in NAMES}
FRAGMENT=(HERE/'observer-fragment.java.txt').read_bytes()
HARNESS=(HERE/'ObserverBoundaryHarness.java').read_bytes()
BODY=(HERE/'java-harness-body.java.txt').read_bytes()
OLD_BODY=(OLD/'java-harness-body.java.txt').read_bytes()
OLD_ADAPTER=(OLD/'public_observation_unit.py').read_bytes()
OLD_RELAY=(OLD/'public_relay.py').read_bytes()
CHECKS=[];CASES=[];BLOCKED=[]

def check(name,ok):
    if ok is not True:raise AssertionError(name)
    CHECKS.append(dict(name=name,passed=True))

def denied(*args,**kwargs):
    BLOCKED.append('FORBIDDEN_REAL_BOUNDARY');raise AssertionError('FORBIDDEN_REAL_BOUNDARY')

def audit(event,args):
    if event=='open':
        if args[0]==str(HERE/'source-check-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):
        raise AssertionError('AUDIT_DENIED_'+event)

def module(name,opt=0):
    result=types.ModuleType('test_'+name[:-3])
    exec(compile(RAW[name],'<exact prepared '+name+'>','exec',optimize=opt),result.__dict__)
    result.__source_sha256__=hashlib.sha256(RAW[name]).hexdigest()
    return result

M={name:module(name) for name in NAMES}
C=M['qualification_controller.py'];K=M['qualification_custody.py'];R=M['qualified_relay.py'];P=M['public_contract.py'];L=M['entry_loader.py']

def rejected(name,callback,exception=Exception):
    try:callback()
    except exception:check(name,True)
    else:check(name,False)

def spec(path,raw,mode=0o600):
    return dict(path=path,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=mode,uid=501,aliases=[])

def dump(value):return json.dumps(value,separators=(',',':')).encode()

def release(mode='relay'):
    code={name:spec('/synthetic/code/'+name,RAW[name],0o644) for name in C.CODE_NAMES}
    inputs={'JAVA':spec('/synthetic/bin/java',b'J',0o755),'JACKSON':spec('/synthetic/jackson.jar',b'K',0o644),'ORDINARY_ADAPTER':spec('/synthetic/ordinary.py',b'A',0o644),
            'CLASS':spec('/synthetic/classes/ObserverBoundaryHarness.class',b'C',0o644)}
    if mode.startswith('tls-'):inputs['SYNTHETIC_PKCS12']=spec('/synthetic/fixture.p12',b'F',0o600)
    entries=[dict(kind='CLASS_DIRECTORY',path='/synthetic/classes',memberRoles=['CLASS']),dict(kind='JAR',path='/synthetic/jackson.jar',memberRoles=['JACKSON'])]
    argv=['/synthetic/bin/java','-cp','/synthetic/classes:/synthetic/jackson.jar','ObserverBoundaryHarness',mode]
    keys=['JAVA_HOME','PATH','LANG','LC_ALL']
    if mode.startswith('tls-'):argv+=['/synthetic/fixture.p12','ROOT_QUALIFIED_LOCAL_SYNTHETIC_ONLY'];keys+=['SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD']
    if mode=='relay':keys+=['CHECKS_PUBLIC_OBSERVER_CONTROL','CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256']
    chain=[[1,2,stat.S_IFDIR|0o700,501]]
    return dict(schemaVersion=1,protocol=C.PROTOCOL,purpose='SYNTHETIC_QUALIFICATION_ONLY',authorizedBy='root',selectedMode=mode,
        ownerUid=501,codePins=code,inputPins=inputs,javaRole='JAVA',classpathEntries=entries,harnessClass='ObserverBoundaryHarness',argv=argv,
        environmentKeys=keys,environmentSha256='e'*64,outputPath='/synthetic/output',launchControlSha256='a'*64,
        rootCustody=dict(ownerUid=501,outputChain=chain,shortParentChain=chain,createShortExactly0700=True),
        ordinaryAdmissionSha256='b'*64,gatewayClosedRootSha256='c'*64,sourceManifestSha256='b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1',
        productionFragmentSha256='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66',limits=dict(C.LIMITS))

def schema_controls():
    good=release()
    check('VALID_COMPLETE_RELEASE',C.validate_release(good,R,P) is good)
    changes=[('EXTRA',lambda x:x.update(extra=1)),('OWNER_BOOL',lambda x:x.update(ownerUid=True)),
        ('MISSING_INPUT',lambda x:x['inputPins'].pop('JAVA')),('WRONG_PURPOSE',lambda x:x.update(purpose='BUSINESS')),
        ('NO_GATEWAY_CLOSURE',lambda x:x.update(gatewayClosedRootSha256=None)),('LIMIT_BOOL',lambda x:x['limits'].update(selectorPollMs=True)),
        ('ARG_EXTRA',lambda x:x['argv'].append('retry')),('MISSING_CODE',lambda x:x['codePins'].pop('public_contract.py')),
        ('ALIAS_ROLE_CONFLICT',lambda x:x['inputPins']['CLASS'].update(path=x['inputPins']['JAVA']['path'])),
        ('CONTROL_SECRET_ARG',lambda x:x['argv'].append('password')),('MISSING_ENV',lambda x:x['environmentKeys'].pop()),
        ('NO_SOURCE_BINDING',lambda x:x.update(sourceManifestSha256='0'*64))]
    for name,change in changes:
        value=copy.deepcopy(good);change(value);rejected('RELEASE_DENIES_'+name,lambda:C.validate_release(value,R,P))
    for raw in (b'{"x":1,"x":2}',b'{}{}',b'\xff',b'{"x":NaN}'):
        rejected('STRICT_CLOSED_JSON_'+str(len(CHECKS)),lambda:C.strict(raw))
    decision=dict(schemaVersion=1,protocol=C.PROTOCOL,purpose='ONE_SYNTHETIC_MODE_ONLY',authorizedBy='root',releaseSha256='f'*64,mode='relay',cap=1,attempt=1,operation='invoke')
    check('VALID_DECISION',C.validate_decision(decision,good,'f'*64) is decision)
    for key,value in (('cap',True),('attempt',2),('mode','parser'),('authorizedBy','caller')):
        bad=dict(decision);bad[key]=value;rejected('DECISION_'+key,lambda:C.validate_decision(bad,good,'f'*64))

class Ordinary:
    protocol=C.PROTOCOL
    def __init__(self,mode='relay'):
        self.value=release(mode);self.process=types.SimpleNamespace(pid=123);self.sequence=[];self.failure=None
    def identity(self,process):
        self.sequence.append('identity')
        return dict(pid=process.pid,ppid=77,uid=501,start='SYNTHETIC_START',processImage='/synthetic/bin/java',
            executableFileHash=self.value['inputPins']['JAVA']['sha256'],identityComplete=True,kernelIdentityComplete=True,
            kernelStartSeconds=1,kernelStartMicroseconds=2,argvHash='7'*64)
    def controller_pid(self):return 77

def peer_controls():
    ordinary=Ordinary();peer=C.PeerBinding(ordinary,ordinary.value)
    rejected('EARLY_ENROLLMENT_HOLD',lambda:peer(123));check('EARLY_CONSUMED',peer.consumed and peer.primary=='EARLY_ENROLLMENT')
    rejected('EARLY_NO_REBIND',lambda:peer.bind(ordinary.process))
    for kind in ('matching','foreign','changed','wrong_parent'):
        ordinary=Ordinary();peer=C.PeerBinding(ordinary,ordinary.value)
        if kind=='wrong_parent':ordinary.controller_pid=lambda:78;rejected('WRONG_PARENT',lambda:peer.bind(ordinary.process));continue
        peer.bind(ordinary.process)
        if kind=='foreign':rejected('FOREIGN_PID',lambda:peer(124))
        elif kind=='changed':
            previous=ordinary.identity
            ordinary.identity=lambda process:dict(previous(process),start='CHANGED')
            rejected('FRESH_START_CHANGED',lambda:peer(123))
        else:
            check('MATCHING_PEER_BOUND',peer(123)['pid']==123)
            check('TWO_BEFORE_TWO_ENROLLMENT_OBSERVATIONS',ordinary.sequence==['identity']*4)
            rejected('ONE_ENROLLMENT',lambda:peer(123))

class Actual:
    def __init__(self,fail=False):self.closed=0;self.fail=fail
    def close(self):
        self.closed+=1
        if self.fail:raise OSError('not published')
    def accept(self):return Actual(self.fail),None

def resource_controls():
    for fail in (False,True):
        ledger=K.Ownership();actual=Actual(fail);wrapped=C.Resource(actual,ledger,object(),'SOCKET')
        check('IMMEDIATE_ACTUAL_REFERENCE_'+str(fail),ledger.tokens[0]['handle'] is actual and ledger.tokens[0]['state']=='TRANSFERRED')
        if fail:
            rejected('CLOSE_FAIL_UNKNOWN',wrapped.close);check('ACTUAL_RETAINED_UNKNOWN',ledger.tokens[0]['state']=='UNKNOWN')
            rejected('NO_UNKNOWN_RECLOSE',wrapped.close);check('CLOSE_ONCE',actual.closed==1)
        else:
            wrapped.close();wrapped.close();check('CONFIRMED_CLOSE_IDEMPOTENT',actual.closed==1 and not ledger.blockers())
    ledger=K.Ownership();wrapped=C.Resource(Actual(),ledger,object(),'LISTENER');child,_=wrapped.accept()
    check('ACCEPT_REGISTERED_BEFORE_RETURN',len(ledger.tokens)==2 and ledger.tokens[1]['handle'] is child.actual)
    wrapped.close();child.close();check('ALL_ASSIGNED_CLOSED',not ledger.blockers())

class FileSystem:
    O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
    def __init__(self,raw,fail_close=False,wrong_mode=False):self.raw=raw;self.next=10;self.handles={};self.closed=[];self.fail_close=fail_close;self.wrong_mode=wrong_mode
    def open(self,name,flags,**kwargs):
        self.next+=1;self.handles[self.next]=(name,bool(flags&self.O_DIRECTORY));return self.next
    def fstat(self,fd):
        name,directory=self.handles[fd]
        return types.SimpleNamespace(st_dev=1,st_ino=2 if directory else 3,st_mode=(stat.S_IFDIR|0o755) if directory else (stat.S_IFREG|(0o644 if self.wrong_mode else 0o600)),
            st_uid=501,st_nlink=1,st_size=0 if directory else len(self.raw),st_mtime_ns=1,st_ctime_ns=1)
    def stat(self,name,**kwargs):
        if name in ('/','synthetic'):return self.fstat(next(fd for fd,x in self.handles.items() if x[1]))
        return self.fstat(next(fd for fd,x in self.handles.items() if not x[1]))
    def read(self,fd,n):
        value=self.raw[:n];self.raw=self.raw[n:];return value
    def close(self,fd):
        self.closed.append(fd)
        if self.fail_close:raise OSError('private fake')

def loader_controls():
    # Read tests exercise actual bootstrap acquisition, metadata and close helpers.
    for opt in (0,2):
        loader=module('entry_loader.py',opt)
        for kind in ('good','wrong_sha','wrong_mode','close_unknown'):
            raw=b'pass\n';fs=FileSystem(raw,kind=='close_unknown',kind=='wrong_mode');load=loader.Load(fs)
            one=spec('/synthetic/qualification_custody.py',raw)
            if kind=='wrong_sha':one['sha256']='0'*64
            if kind=='good':
                # Stable fstat size is independent of the fake read offset.
                original=fs.fstat;fs.fstat=lambda fd:types.SimpleNamespace(**dict(vars(original(fd)),st_size=0 if fs.handles[fd][1] else len(raw)))
                check('BOOTSTRAP_GOOD_OPT'+str(opt),load.read(one)==raw);load.close_all()
                check('BOOTSTRAP_ALL_CLOSED_OPT'+str(opt),all(r['state']=='CLOSED' for r in load.records))
            else:
                original=fs.fstat;fs.fstat=lambda fd:types.SimpleNamespace(**dict(vars(original(fd)),st_size=0 if fs.handles[fd][1] else len(raw)))
                if kind=='close_unknown':load.read(one);load.close_all();check('BOOTSTRAP_UNKNOWN_OPT'+str(opt),load.cleanup=='BOOTSTRAP_CLOSE_UNCONFIRMED' and all(r['state']=='UNKNOWN' for r in load.records))
                else:rejected('BOOTSTRAP_DENY_'+kind+'_OPT'+str(opt),lambda:load.read(one));load.close_all()
            check('BOOTSTRAP_NO_FD_RETRY_'+kind+'_OPT'+str(opt),len(fs.closed)==len(set(fs.closed)))
        # Actual all-source load must not compile after any first-read failure in either optimization mode.
        load=loader.Load(FileSystem(b'x'))
        seen=[];load.read=lambda unused:(_ for _ in ()).throw(loader.BootstrapHold('FIRST_READ_INTEGRITY'))
        before=loader.__dict__.get('compile');loader.compile=lambda *a,**k:seen.append('compile')
        specs={name:spec('/synthetic/'+name,b'x') for name in loader.NAMES}
        rejected('BOOTSTRAP_NO_INTERPRETATION_OPT'+str(opt),lambda:load.load(specs,opt))
        check('BOOTSTRAP_COMPILE_NOT_REACHED_OPT'+str(opt),seen==[])

def relay_controls():
    control=dict(schemaVersion=1,protocolVersion=2,**{k:P.CONSTANTS[k] for k in ('unit','class','method')},
        amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath=R.ENDPOINT,enrollmentNonce='1'*64,**R.LIMITS)
    projection=P.record('FINALIZING','NOT_REPRODUCED')
    relay=object.__new__(R.SyntheticRelay);relay.contract=P;relay.control=control;relay.control_sha='2'*64
    data=dict(protocolVersion=2,controlSha256='2'*64,enrollmentNonce='1'*64,observation=projection,networkAccounting=projection['networkAccounting'])
    check('RELAY_EXACT_ZERO_HTTP_DATA',relay.validate_data(data)==projection)
    for kind in ('extra','nonce','control','captured','network'):
        bad=copy.deepcopy(data)
        if kind=='extra':bad['extra']=1
        elif kind=='nonce':bad['enrollmentNonce']='3'*64
        elif kind=='control':bad['controlSha256']='3'*64
        elif kind=='captured':bad['observation']=P.record('UNKNOWN','NO_DECISION')
        else:bad['networkAccounting']=P.network_completed()
        rejected('RELAY_DATA_DENY_'+kind,lambda:relay.validate_data(bad))
    relay.data_at=100;relay.b=types.SimpleNamespace(clock=lambda:200)
    commit=dict(protocolVersion=2,controlSha256='2'*64,projectionSha256='4'*64,status='CALLER_SAW_CUSTODIED_ACK',callerElapsedNs=10)
    check('RELAY_CONSERVATIVE_FULL_INTERVAL',relay.validate_commit(commit,'4'*64)==110)
    for key,value in (('callerElapsedNs',True),('callerElapsedNs',14999999999),('status','ACK'),('projectionSha256','5'*64)):
        bad=dict(commit);bad[key]=value;rejected('RELAY_COMMIT_DENY_'+key+str(value),lambda:relay.validate_commit(bad,'4'*64))

def mode_controls():
    parser=dict(case='parser',status='PASS',originalChecks=18,addedChecks=6,checks=24,nativeBusinessRequests=0)
    check('PARSER_DECLARED24_RESULT_SCHEMA',C.mode_evidence('parser',dump(parser),P) is True)
    bad=dict(parser,originalChecks=24);rejected('PARSER_COUNT_NOT_CONFLATED',lambda:C.mode_evidence('parser',dump(bad),P))
    check('RELAY_PRODUCER_HALF_ONLY',C.mode_evidence('relay',dump(dict(case='relay',status='ROOT_RECEIPT_REQUIRED',nativeBusinessRequests=0)),P) is True)
    for mode in C.MODES[1:-1]:
        a=P.network_completed();a['networkCompletionElapsedNs']=100
        if mode=='tls-stall-handshake':a.update(requestStarts=0,requestCompleted=False)
        if mode=='tls-stall-write':a.update(requestStarts=1,requestCompleted=False)
        stall=mode.startswith('tls-stall-') or mode=='tls-dribble'
        if stall:a['deadlineExceeded']=True;a['networkCompletionElapsedNs']=12000000001
        stages={'tls-good':'GOOD_RESPONSE_SENT','tls-oversize':'OVERSIZE_LENGTH_SENT','tls-stall-handshake':'STALL_HANDSHAKE','tls-stall-write':'STALL_WRITE_FIXTURE','tls-stall-body':'STALL_BODY','tls-stall-trailers':'STALL_TRAILERS','tls-dribble':'DRIBBLE_BODY'}
        value=dict(case=mode,status='PASS',connects=1,accepted=1,requests=0 if mode in ('tls-stall-handshake','tls-stall-write') else 1,
            stage=stages[mode],serverFailure='SERVER_INTERRUPTED' if stall else 'NONE',controllerFailure='NONE',serverListenerAcquired=True,
            serverPeerAcquired=True,serverListenerClose='CLOSED',serverPeerClose='CLOSED',cancellationRequested=stall,cancellationCount=1 if stall else 0,
            productionCancellationSet=stall,networkTerminated=True,serverTerminated=True,serverDrainElapsedNs=100,networkAccounting=a,elapsedNs=13000000000,
            closedProjection=dict(captureStatus='CAPTURED',publicOutcomeOrState='FAILED',errorCode='LOGIN_REQUIRED',codeQualified=True) if mode=='tls-good' else {})
        check('TLS_FINITE_MODE_'+mode,C.mode_evidence(mode,dump(value),P) is True)
        for field,replacement in (('connects',2),('stage','UNKNOWN'),('serverPeerClose','UNKNOWN'),('networkTerminated',False)):
            bad=copy.deepcopy(value);bad[field]=replacement;rejected('TLS_DENY_'+mode+'_'+field,lambda:C.mode_evidence(mode,dump(bad),P))
        if mode=='tls-stall-write':
            bad=copy.deepcopy(value);bad['networkAccounting']['requestCompleted']=True
            rejected('BUFFERED_WRITE_NEVER_WRITE_STALL',lambda:C.mode_evidence(mode,dump(bad),P))

def static_controls():
    check('PRODUCTION_FRAGMENT_EXACT',hashlib.sha256(FRAGMENT).hexdigest()=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
    check('FRAGMENT_EXACT_ONCE',HARNESS.count(FRAGMENT)==1)
    old_names=re.findall(rb'parserCase\("([^\"]+)"',OLD_BODY)
    names=re.findall(rb'parserCase\("([^\"]+)"',BODY)
    check('ORIGINAL15_ENTITY_IDENTITIES_RETAINED',names[:len(old_names)]==old_names and len(old_names)==15)
    check('SIX_ADDED_IDENTITIES',names[len(old_names):]==[b'chunk-line129',b'chunk-data-bad-CRLF',b'bare-LF-header',b'header-exact16384',b'trailer-exact8192',b'trailer-bad-CRLF'])
    check('ORIGINAL_THREE_JSON_REJECTS_LITERAL',b'bytes("{\\"x\\":1,\\"x\\":2}"),bytes("{}{}"),new byte[] {(byte) 0xff}' in BODY)
    check('HEADER_EXACT_BYTES',len(b'HTTP/1.1 200 OK\r\nX: '+b'x'*16360+b'\r\n\r\n')==16384)
    check('TRAILER_EXACT_BYTES',len(b'X: '+b'x'*8185+b'\r\n\r\n')==8192)
    check('TIMESTAMP_BEFORE_SERVER_JOIN',BODY.index(b'networkCompletionUpperNs=System.nanoTime()-start')<BODY.index(b'serverThread.join(5000)'))
    check('NO_WRITE_STALL_OVERRIDE',b'writeStall ? exchange.requests==1 && !exchange.completed' in BODY)
    check('SERVER_CLOSE_CONFIRMATION',b'peerClose="UNKNOWN";try { peer.close();peerClose="CLOSED";' in BODY)
    old=ast.parse(OLD_ADAPTER);new=ast.parse(RAW['qualification_custody.py'])
    for name in ('Ownership','Custody'):
        a=next(n for n in old.body if isinstance(n,ast.ClassDef) and n.name==name)
        b=next(n for n in new.body if isinstance(n,ast.ClassDef) and n.name==name)
        if name=='Custody':a.body=[n for n in a.body if not isinstance(n,ast.FunctionDef) or n.name!='replace_exact']
        check('EXACT_CUSTODY_EXTRACTION_'+name,ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False))
    before=ast.parse(OLD_RELAY);after=ast.parse(RAW['qualified_relay.py'])
    old_class=next(n for n in before.body if isinstance(n,ast.ClassDef) and n.name=='Relay')
    new_class=next(n for n in after.body if isinstance(n,ast.ClassDef) and n.name=='Relay')
    for node in old_class.body:
        if isinstance(node,ast.FunctionDef) and node.name not in ('__init__','serve'):
            current=next(n for n in new_class.body if isinstance(n,ast.FunctionDef) and n.name==node.name)
            check('UNCHANGED_RELAY_METHOD_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(current,include_attributes=False))

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
      (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
      (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,denied))
    schema_controls();peer_controls();resource_controls();loader_controls();relay_controls();mode_controls();static_controls()
    check('ZERO_FORBIDDEN_REAL_CALLS',BLOCKED==[])
result=dict(kind='JAVA_QUALIFICATION_SOURCE01_FAKE_BOUNDARY_CONTROLS',passed=len(CHECKS),failed=0,checks=CHECKS,
    forbiddenRealBoundaryCalls=BLOCKED,actualJavaCompilerFixtureTlsUnixPeerPlatformActions=0,
    actualNineModeQualificationResults='UNEXECUTED_OWED',java24DeclaredNotExecuted=True)
(HERE/'source-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),failed=0,actualNativeActions=0)))

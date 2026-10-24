"""One independent critical fake batch; no author24/old498 replay or real boundary.

Only explicit fixture effect providers are reused. All actual target functions run
in the same compiled namespaces with fake OS/native/socket/time boundaries under
the unchanged persistent author deny audit. Host output FD is opened first.
"""
import os,sys,stat,json,re,hashlib,types,time,subprocess,socket,selectors,struct,fcntl,errno,threading,base64,traceback,ast
from pathlib import Path,PurePosixPath
HERE=Path(__file__).absolute().parent;SUB=HERE.parents[2]/'early/c8-synthetic-local-report-prep/resume1'
NAMES=('profile.py','qualification_custody.py','storage.py','mode_predicates.py','public_contract.py','runtime.py','entry.py','controls.py')
SOURCES={n:(SUB/n).read_bytes() for n in NAMES};HARNESS=(SUB/'fake_check.py').read_bytes()
RESULT_FD=os.open(str(HERE/'critical-results.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644);HOST_WRITE=os.write;HOST_CLOSE=os.close
DENIED=[]
def audit(event,args):
    if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','shutil.','pathlib.')):
        DENIED.append(event);raise RuntimeError('PERSISTENT_DENY:'+event)
MODULES={}
for n,raw in SOURCES.items():
    m=types.ModuleType('_review_'+n[:-3]);exec(compile(raw,'<reviewed:'+n+'>','exec'),m.__dict__);MODULES[n]=m
P,K,F,M,C,R,E,Q=[MODULES[n] for n in NAMES];F.K=K;R.P=P;R.K=K;R.F=F;R.M=M;R.C=C
MODEL_CHECKS=0
def check(ok,message):
    global MODEL_CHECKS
    MODEL_CHECKS+=1
    if ok is not True:raise RuntimeError(message)
def wire(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def sha(v):return hashlib.sha256(v).hexdigest()
class StopForeground(BaseException):pass
names={'Clock','Node','FakeOS','Pipe','Proc','Selector','Connection','Listener','World','mode_stdout'}
tree=ast.parse(HARNESS);definitions=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names]
exec(compile(ast.Module(body=definitions,type_ignores=[]),'<literal-preloaded-fake-effects>','exec'),globals())
CASES=[];ASSERTIONS=0
def observe(name,condition,**details):
    global ASSERTIONS
    ASSERTIONS+=1
    if condition is not True:raise RuntimeError('REVIEW_EXPECTATION:'+name)
    return dict(observation=name,**details)
def raised(call):
    try:call()
    except BaseException as e:return e
    raise RuntimeError('EXPECTED_EXCEPTION')
def run(name,call):
    start=ASSERTIONS
    try:CASES.append(dict(name=name,passed=True,assertions=ASSERTIONS-start,details=call()))
    except BaseException as error:CASES.append(dict(name=name,passed=False,assertions=ASSERTIONS-start,errorClass=type(error).__name__,args=[str(x)[:256] for x in error.args]))
def ready_fixture():
    w=World();inputs=w.admitted_inputs();u=w.unit();held=u.native(inputs);u.finish();check(u.primary=='NONE','SYNTHETIC_HELD')
    hp=w.pin(w.release['evidenceRoot']+'/held-result.json');ho=w.outer('heldOuter',hp,0)
    u=w.unit();u.archive(dict(held=hp,heldOuter=ho));u.finish();ap=w.pin(w.release['evidenceRoot']+'/archive-receipt.json')
    qa=w.doc('/controls/qa-final.json',dict(acceptedBy='root',actualQaAccepted=True,archiveReceiptSha256=ap['sha256'],fullPrivateArchiveInspected=True,heldPrimaryReason='NONE'))
    u=w.unit();ready=u.final(dict(archive=ap,archiveQaRoot=qa));u.finish()
    return w,ready
def gate_inputs(w,ready):
    rp=w.save('readiness',ready);rs=w.outer('readinessStatus',rp,0)
    pp=w.save('permit',Q.permit(w.release['unit'],dict(path='/controls/release.json',sha256=w.release_sha,bytes=1,mode=0o600,uid=100),rp,w.clock.wall,w.clock.wall+60000000000,0))
    return dict(readiness=rp,readinessStatus=rs,permit=pp)
def utility_cap_case():
    w=World();u=w.unit();calls=[];proc=Proc(777,out=b'x'*(16777216+1));R.subprocess=types.SimpleNamespace(Popen=lambda *a,**kw:proc,DEVNULL=-3,PIPE=-1)
    original=proc.communicate
    def acquired(timeout):calls.append('COMPLETE_OVERSIZE_BUFFER_ALREADY_ACQUIRED');return original(timeout)
    proc.communicate=acquired;error=raised(lambda:u.inspector.utility('PS',[]));rec=u.inspector.records[0]
    return observe('utility rejects only AFTER full acquisition and loses known exit',calls==['COMPLETE_OVERSIZE_BUFFER_ALREADY_ACQUIRED'] and rec['waitReturned'] is True and rec['actualExit'] is None and rec['completion']=='UNKNOWN',exception=type(error).__name__,allocatedFakeBytes=16777217,waitReturned=rec['waitReturned'],knownExitOmitted=rec['actualExit'] is None)
def write_primary_case():
    World();s=F.Storage.__new__(F.Storage);events=[];first=ValueError('FIRST_WRITE');second=OSError('SECOND_CLOSE')
    s.create=lambda path:{}
    def writing(*args):events.append('FIRST_WRITE');raise first
    def closing(*args):events.append('SECOND_CLOSE');raise second
    s.write_fd=writing;s.close_sink=closing;error=raised(lambda:s.write('/fake/out',b'x'))
    return observe('write finally replaces original primary',error is second and events==['FIRST_WRITE','SECOND_CLOSE'],raisedClass=type(error).__name__,originalPrimaryPreserved=False)
def read_primary_case():
    w=World();w.os.file('/inputs/a',b'x');owner=K.Ownership();s=F.Storage(owner);read0=w.os.read;close0=w.os.close;first=ValueError('FIRST_READ')
    def reading(fd,count):
        if w.os.fds[fd]['path']=='/inputs/a':raise first
        return read0(fd,count)
    def closing(fd):
        if w.os.fds[fd]['path']=='/inputs/a':raise OSError('SECOND_CLOSE')
        return close0(fd)
    w.os.read=reading;w.os.close=closing;error=raised(lambda:s.read('/inputs/a'))
    return observe('read preserves original and separate cleanup/UNKNOWN',error is first and s.primary is first and bool(s.cleanup) and bool(owner.blockers()),primaryClass=type(error).__name__,cleanupCount=len(s.cleanup))
def self_text_case():
    World();value='é'*2049;fact=R.self_text(value)
    return observe('multibyte overflow returned UNKNOWN after encode',fact==dict(status='UNKNOWN',bytes=None,sha256=None),characters=len(value),utf8Bytes=4098,encodeBeforeBound='verified independently by AST')
def stale_ready_case():
    w,ready=ready_fixture();ready['createdAtNs']=1;inputs=gate_inputs(w,ready);u=w.unit();result=u.gate(inputs);u.finish()
    return observe('fresh permit admits stale original readiness',result['allow'] is True and w.clock.wall-ready['createdAtNs']>60000000000,readinessAgeNs=w.clock.wall-1)
def reversed_clock_case():
    w,ready=ready_fixture();inputs=gate_inputs(w,ready);start=w.clock.wall;times=iter([start+8000,start+2000]);w.clock.time_ns=lambda:next(times)
    u=w.unit();result=u.gate(inputs);u.finish();events=[x for x in result['events'] if x['kind'].startswith('PERMIT_')]
    return observe('PRE to POST reversal accepted',result['allow'] is True and events[-1]['value']['nowNs']<events[0]['value']['nowNs'],pre=events[0]['value']['nowNs'],post=events[-1]['value']['nowNs'])
def outer_expiry_case():
    w,ready=ready_fixture();inputs=gate_inputs(w,ready);expires=P.decode(w.os.nodes[inputs['permit']['path']].data)['expiresAtNs']
    w.os.file('/controls/operator',b'');w.os.fds[1]=dict(path='/controls/operator',pos=0,flags=1);write0=w.os.write
    def writing(fd,raw):
        result=write0(fd,raw)
        if fd==1:w.clock.wall=expires+1
        return result
    w.os.write=writing;u=w.unit();status=E.execute(u,'gate',inputs,0);raw=w.os.nodes['/controls/operator'].data
    return observe('outer allow publication completes after expiry with code0',status==0 and w.clock.wall>expires and P.decode(raw)['allow'] is True,status=status,expiredBeforeReturn=True)
def lease_expiry_case():
    w=World();inputs=w.admitted_inputs();write0=w.os.write;scope=P.decode(w.os.nodes[w.release['rootScope']['path']].data);expires=scope['lease']['expires']
    def writing(fd,raw):
        result=write0(fd,raw)
        if w.os.fds[fd]['path'].endswith('/attempt.json'):w.clock.wall=int((expires+1)*1000000000)
        return result
    w.os.write=writing;u=w.unit();u.native(inputs);u.finish()
    return observe('native launches after lease expired during setup',w.native_started is True and u.primary=='NONE' and w.clock.time()>expires,launchAfterExpiry=True)
def relevance_case():
    w=World();inputs=w.admitted_inputs();u=w.unit();held=u.native(inputs);u.finish()
    known=dict(pid=9292,ppid=1,legacyStart='Mon Oct 19 00:00:00 2026',argvSha256='d'*64,wasRelevant=True,identityAuthenticated=False,reuseAmbiguous=False)
    held['relevance'].append(known);hp=w.doc(w.release['evidenceRoot']+'/held-result.json',held);ho=w.outer('heldOuter',hp,0);ps0=w.ps
    def ps(args):
        raw=ps0(args)
        if '-axo' in args:raw+=b'9292 1 Mon Oct 19 00:00:00 2026 plain-unrelated-argv\n'
        return raw
    w.ps=ps;u=w.unit();result=u.archive(dict(held=hp,heldOuter=ho));u.finish()
    return observe('archive forgets held relevant PID when current argv changes',result['purpose']=='FULL_W_E_ARCHIVE' and 9292 not in u.inspector.relevance,knownPid=9292,knownPriorRelevanceIgnored=True)
def bootstrap_sink_case():
    w=World();written=[];E.os=types.SimpleNamespace(write=lambda fd,raw:(written.append(dict(fd=fd,bytes=len(raw))) or len(raw)))
    result=E.main([])
    return observe('bootstrap failure writes unchecked inherited stderr2',result==1 and written and all(x['fd']==2 for x in written),writes=written,privateSinkValidationReached=False)
def postclose_parent_case():
    w=World();w.os.holders_closed=True;w.os.getppid=lambda:999
    package='/public';rows=[dict(path=n,sha256=sha(SOURCES[n]),bytes=len(SOURCES[n]),mode=0o644) for n in E.CODE]
    mr=wire(dict(kind='C8_SYNTHETIC_LOCAL_REPORT_SOURCE01_PREPARATION',files=rows));mp=w.pin('/public/manifest.json',mr,0o644)
    for n in E.CODE:w.pin('/public/'+n,SOURCES[n],0o644)
    w.release['sourceManifestSha256']=mp['sha256'];rp=w.doc('/controls/release-full.json',w.release)
    dummy=w.doc('/controls/dummy.json',{});decision=Q.decision(rp,w.release['unit'],'postclose',None,dict(guard=dummy,wrapperOuter=dummy));dp=w.doc('/controls/decision-full.json',decision)
    stdout=w.pin('/controls/stdout',b'');desc=Q.descriptor(mp,package,rp,dp,'postclose',None,999,700,stdout)
    error=raised(lambda:E.launch(wire(desc),'postclose',None,mp['sha256'],rp['sha256']))
    return observe('new postclose caller rejected by original-holder equality',type(error)is ValueError and error.args==('BOOT_HOLDER',),newParent=999,oldHeldParent=800,reason='BOOT_HOLDER')
def serial_positive_case():
    w=World('relay');u=w.unit();w.os.directory(u.evidence);u.child.child=Proc(5000,polls=[None,None]);u.child.record['pid']=5000
    relay=R.RelayLoop(u,u.child,P.decode(w.os.nodes[w.release['launchControlPin']['path']].data),w.release['launchControlPin']['sha256']);relay.prepare();w.native_started=True
    yes=relay.accept();facts=list(u.child.record['pollFacts']);relay.finish();u.child.child=None;u.finish()
    return observe('same direct child credentials between two serialized live polls',yes is True and len(facts)==2 and all(x['live'] is True for x in facts) and relay.enrollments==1,livePolls=2,threadCreated=False)
sys.addaudithook(audit)
for name,call in [('utility-acquisition',utility_cap_case),('storage-write-primary',write_primary_case),('storage-read-primary',read_primary_case),('self-text-byte-bound',self_text_case),('stale-original-readiness',stale_ready_case),('reversed-permit-clock',reversed_clock_case),('expired-outer-publication',outer_expiry_case),('expired-lease-launch',lease_expiry_case),('persistent-prior-relevance',relevance_case),('bootstrap-private-channel',bootstrap_sink_case),('postclose-real-caller-parent',postclose_parent_case),('positive-serialized-peer',serial_positive_case)]:run(name,call)
result=dict(kind='INDEPENDENT_BOUNDED_ACTUAL_FUNCTION_FAKE_COUNTEREXAMPLES',cases=len(CASES),passed=sum(x['passed'] for x in CASES),failed=sum(not x['passed'] for x in CASES),independentObservations=ASSERTIONS,fakeModelBookkeeping=MODEL_CHECKS,deniedHostEvents=DENIED,checks=CASES,sourcePins={n:sha(raw) for n,raw in SOURCES.items()},authorFixtureDefinitionsOnly=True,author24NotReplayed=True,old498NotReplayed=True,actualTargetActions=0)
payload=(json.dumps(result,indent=2)+'\n').encode();offset=0
while offset<len(payload):offset+=HOST_WRITE(RESULT_FD,payload[offset:])
HOST_CLOSE(RESULT_FD)
print(json.dumps({k:v for k,v in result.items() if k not in ('checks','sourcePins')}));sys.exit(0 if result['failed']==0 and not DENIED else 1)

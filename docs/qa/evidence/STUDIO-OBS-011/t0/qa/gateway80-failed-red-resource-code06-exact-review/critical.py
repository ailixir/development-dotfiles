"""One independent bounded Source06 changed-path batch; explicit fakes only.

Definitions/preloads are bound to immutable source; no old test tail is executed.
The two operator exchanges run the exact pure helper in V8 memory, never Node.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types,shlex
from contextlib import ExitStack
from unittest.mock import patch
H=Path(__file__).absolute().parent;S=H.parents[1]/'early/gateway80-failed-red-resource-prep/resume6'
raw=(S/'critical_check.py').read_bytes();prefix=raw.split(b'RESULT_FD=os.open',1)[0]
ns={'__name__':'_quinn_preloaded_explicit_fakes','__file__':str(S/'critical_check.py')};exec(compile(prefix,'<source06-fixture-prefix-only>','exec'),ns)
tree=ast.parse(raw);definitions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('check','expect','operator','fake_tool','all_source_graph','build_install','creator','phase')]
exec(compile(ast.Module(body=definitions,type_ignores=[]),'<source06-explicit-effect-fixtures>','exec'),ns)
ns.update(CHECKS=[],HISTORY=[],DIAGNOSTICS=[],LAST_STATE=None,LAST_TOOL=None,COUNTER=0,REAL_EXEC=exec)
# The actual final shell argument, not an intended text slice.
ns['BODY']=shlex.split((S/'guard-failed-red.bash').read_text().split('-B -c ',1)[1])[0]
RESULT_FD=os.open(str(H/'critical-results.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644);WRITE=os.write;CLOSE=os.close
A,P,F,G,MemPath=[ns[n] for n in ('A','P','F','G','MemPath')]
CHECKS=[]
def check(n,v):
    if v is not True:raise AssertionError(n)
    CHECKS.append(dict(id=n,passed=True))
def deny(n,call,reason=None):
    try:call()
    except BaseException as e:
        if isinstance(e,(AssertionError,SystemExit)):raise
        check(n,reason is None or e.args==(reason,));return
    raise AssertionError('EXPECTED_DENIAL:'+n)
def tests():
    s,k,a,auth,b,state,actual=ns['build_install']()
    base=copy.deepcopy(a);base['newDirectoryPins']={};w=base.pop('binaryWitnesses');base.pop('binaryHashes');base.pop('binaryModes')
    records={p:s.fs.nodes[p]['raw'] for p in set(a['newCodeRecordPins'])|set(a['typedOwnerRecordPins'])}
    F.preflight(base,k,b,w,records);check('COMMON_FACTORY_EXACT_OWNER_POSITIVE',True)
    for name,field,value in [('bool_as_int','authorized',1),('false_as_int','legacyReportedCanonicalPredicateSatisfied',0),('float_bool','authorized',1.0),('float_pid','wrapperPid',3720.0),('bool_pid','pty',True)]:
        aa=copy.deepcopy(base);rr=dict(records);path=next(iter(aa['typedOwnerRecordPins']));owner=P.decode(rr[path]);owner[field]=value;rr[path]=P.packed(owner);aa['typedOwnerRecordPins'][path]=P.sha(rr[path])
        deny('OWNER_'+name,lambda:F.preflight(aa,k,b,w,rr),'TYPED_OWNER_EXACT_SCALAR_SCHEMA')
    facts=dict(separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,successfulSetupHelpers=[dict(pid=900101,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['physicalPythonRoles']['requestedLaunchBIN'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['FAKE_SEPARATE_HELPER0'])],actualToolEvidence=['FAKE_SETUP_ACTUAL0'])
    control,h,state,actual=ns['creator'](s,k,a,auth,b,state,actual,'SETUP_OWNERSHIP_ADMISSION',facts)
    outside=next(row for row in control['typedPriorActors'] if row['pid']==901001)
    check('OUTSIDE_WRITER_CARRIED_IN_ACTUAL_SOURCE_AUTHORED_CONTROL',outside['evidence']==str(A.N/'root-setup-ownership.json') and outside['actualStatus']==0 and outside['directWaitClaimed'] is False and any(type(x)is dict and x.get('toolCallId')=='FAKE_OUTSIDE_SCOPE_WRITER' for x in control['actualToolEvidence']))
    source=P.decode(s.fs.nodes[str(MemPath(S)/'manifest.json')]['raw']);producer={r['path']:r['sha256'] for r in source['files']}
    for variant in ('omitted','precompleted','wrong_producer'):
        value=copy.deepcopy(control);d=value['designatedControlAuthor']
        if variant=='omitted':value['typedPriorActors']=[r for r in value['typedPriorActors'] if r['pid']!=d['pid']]
        if variant=='precompleted':next(r for r in value['typedPriorActors'] if r['pid']==d['pid'])['actualStatus']=0
        if variant=='wrong_producer':d['producerEntrySha256']='0'*64
        deny('DESIGNATION_'+variant,lambda:P.designated_author(value,a,k,str(A.N/'root-setup-ownership.json'),'SETUP_OWNERSHIP_ADMISSION',producer))
    # Synthetic root-pinned control has allowed exact duplicate observations: the
    # consumer must reconcile each control before its cumulative input cap.
    row=copy.deepcopy(k['knownPostBaseActors'][0]);old=copy.deepcopy(control['typedPriorActors']);designation=control['designatedControlAuthor']
    control['typedPriorActors']=[row for _ in range(5000)]+[r for r in old if r['pid']!=row['pid']]
    check('DUPLICATE_CONTROL_INPUT_BELOW8192',len(control['typedPriorActors'])<8192)
    s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']=P.packed(control)+b'\n';h=P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    status,_,_=ns['phase'](s,k,a,auth,b,'negative',control,h)
    check('REAL_FINAL_GUARD_ENTRY_NEGATIVE_WITH_DUPLICATE_PRIOR_CONTROLS',status==1 and str(A.N/'negative-denial.json') in s.fs.nodes)
    check('ALL_UNIQUE_OUTSIDE_AND_PENDING_ACTORS_SURVIVE',all(r['pid'] in {x['pid'] for x in P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])['typedPriorActors']} for r in old))
    duplicate=P.actor_union(k,[row,row],allow_pending=True);check('EXACT_DUPLICATES_RECONCILE',sum(x['pid']==row['pid'] for x in duplicate)==1)
    conflict=dict(row,ppid=999);deny('DUPLICATE_CONFLICT_HOLD',lambda:P.actor_union(k,[row,conflict],allow_pending=True),'TYPED_ACTOR_ROSTER_CONFLICT')
    P.actor_union(k,[row]*8192,allow_pending=True);check('DECLARED8192_BOUND_ACCEPTS_EXACT_DUPLICATES',True)
    deny('ABOVE8192_HOLD',lambda:P.actor_union(k,[row]*8193,allow_pending=True),'TYPED_ACTOR_ROSTER_SCHEMA')
    # Real qualification/sink continuation, with every selected resource and clock
    # effect supplied as explicit fake facts. No actual clock or full-flow replay.
    for late in (False,True):
        emitted=[];sink=P.FailureSink(emitted.append,1,2);token=sink.claim_finalizer('GUARD');clock=[1002]
        u=types.SimpleNamespace(s=types.SimpleNamespace(now=lambda:clock[0],path=MemPath),failure_sink=sink,pending=[],auth_sha='a'*64,control_sha='b'*64,k=k,pins={str(A.N/'readiness.json'):'c'*64})
        q=P.GateQualification(u,1000,1001,1002);sink.gate_qualification=q;sink.resources=[]
        # This is the selected delivery preparation boundary; actual source calls
        # its unchanged packed serializer before the final original-permit check.
        packed=P.packed
        def serialize(value):
            result=packed(value)
            if late:clock[0]=1062
            return result
        with patch.object(P,'packed',serialize):result=sink.finalize(token)
        check('FINAL_ACCEPT_'+str(late),result==0 and type(result)is int and emitted==[] if not late else result is None and emitted[0]['primaryFailure']==dict(stage='FINAL_GUARDED_ACCEPTANCE',namespace='PROTOCOL_HOLD',reason='FRESHNESS_OR_CLOCK_REVERSE'))
    check('NO_REAL_TARGET_BOUNDARY',G['ns']['BLOCKED']==[])
failure=None
sys.addaudithook(G['ns']['audit'])
try:
    with ExitStack() as stack:
        for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
            for n in names:
                if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
        tests()
except BaseException as e:failure=dict(type=type(e).__name__,args=[str(x)[:200] for x in e.args])
result=dict(checks=CHECKS,passed=len(CHECKS),failure=failure,compositionChecks=ns['CHECKS'],operatorSteps=ns['HISTORY'],diagnostics=ns['DIAGNOSTICS'],realBoundaryCalls=G['ns']['BLOCKED'],sourcePins={n:hashlib.sha256(v).hexdigest() for n,v in ns['TARGET'].items()},whole13OrOldSuitesReplayed=False,sourceUnchanged=True,actualTargetEffects=0)
out=(json.dumps(result,indent=2)+'\n').encode();i=0
while i<len(out):i+=WRITE(RESULT_FD,out[i:])
CLOSE(RESULT_FD);print('QUINN_DONE:'+json.dumps(dict(passed=len(CHECKS),compositionChecks=len(ns['CHECKS']),failure=failure,operatorSteps=len(ns['HISTORY']))),flush=True);raise SystemExit(1 if failure else 0)

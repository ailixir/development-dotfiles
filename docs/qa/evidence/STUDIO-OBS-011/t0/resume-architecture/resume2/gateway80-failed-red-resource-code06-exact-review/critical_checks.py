"""Independent final Source06 changed-path composition; every target effect fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types,shlex
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume6').absolute()
manifest=(S/'manifest.json').read_bytes();assert hashlib.sha256(manifest).hexdigest()=='b751602e38355042033e1a1b86ad0996c30a0377e56fae064f1eb383866e7976'
CACHE={r['path']:(S/r['path']).read_bytes() for r in json.loads(manifest)['files']}
assert all(len(CACHE[r['path']])==r['bytes'] and hashlib.sha256(CACHE[r['path']]).hexdigest()==r['sha256'] for r in json.loads(manifest)['files'])
raw=CACHE['critical_check.py'];head=raw.split(b'RESULT_FD=os.open',1)[0]
definitions=b'CHECKS=[]'+raw.split(b'CHECKS=[]',1)[1].split(b'\nfailure=None\nsys.addaudithook',1)[0]
H={'__name__':'_aria_final_source06_fake_definitions','__file__':str(S/'critical_check.py')}
exec(compile(head+b'\n'+definitions,'<exact-fixture-definitions-without-author-artifact-writes-or-test-tail>','exec'),H)
A,P,F,CLI,G,MemPath=[H[n] for n in ('A','P','F','CLI','G','MemPath')]
CHECKS=[];CASES=[];OUTSIDE=900090;HELPER=900101
def check(name,value):
    if value is not True:raise AssertionError(name)
    CHECKS.append({'id':name,'passed':True,'effects':'FAKE'})
def deny(name,call,reason=None):
    try:call()
    except (P.Hold,ValueError,OSError) as error:
        check(name,reason is None or error.args==(reason,));return
    raise AssertionError('EXPECTED_DENIAL_'+name)
def tests():
    s,k,a,auth,b,state,actual=H['build_install']()
    check('CURRENT_INSTALL_SEVEN_PENDING_AND_NO_COMPLETION_CLAIM',len(a['binaryWitnesses'])==7 and a['designatedControlAuthor']['actualStatus'] is None)
    base=copy.deepcopy(a);base['newDirectoryPins']={};w=base.pop('binaryWitnesses');base.pop('binaryHashes');base.pop('binaryModes')
    records={p:s.fs.nodes[p]['raw'] for p in set(a['newCodeRecordPins'])|set(a['typedOwnerRecordPins'])}
    F.preflight(base,k,b,w,records);check('OWNER_EXACT_POSITIVE',True)
    for value in [1,1.0]:
        aa=copy.deepcopy(base);rr=dict(records);path=next(iter(aa['typedOwnerRecordPins']));record=P.decode(rr[path]);record['authorized']=value;rr[path]=P.packed(record);aa['typedOwnerRecordPins'][path]=P.sha(rr[path])
        deny('OWNER_NUMERIC_'+type(value).__name__+'_DENIES',lambda:F.preflight(aa,k,b,w,rr),'TYPED_OWNER_EXACT_SCALAR_SCHEMA')
    CASES.append('actual-installer-and-strict-owner')
    facts=dict(separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,successfulSetupHelpers=[dict(pid=HELPER,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['physicalPythonRoles']['requestedLaunchBIN'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['SYNTHETIC_ACTUAL_HELPER0'])],actualToolEvidence=['SYNTHETIC_SETUP0'])
    control,h,state,actual=H['creator'](s,k,a,auth,b,state,actual,'SETUP_OWNERSHIP_ADMISSION',facts)
    check('ACTUAL_PRODUCER_RETAINS_OUTSIDE_AND_HELPER_FACTS',{OUTSIDE,HELPER}<={r['pid'] for r in control['typedPriorActors']})
    check('CURRENT_AUTHOR_PENDING_AND_WHOLE_MAP',control['designatedControlAuthor']['actualStatus'] is None and len(control['inputPins'])>=7)
    source=P.decode(s.fs.nodes[str(MemPath(S)/'manifest.json')]['raw']);producer={r['path']:r['sha256'] for r in source['files']}
    for kind in ['omitted','precompleted','wrongsource']:
        bad=copy.deepcopy(control);d=bad['designatedControlAuthor']
        if kind=='omitted':bad['typedPriorActors']=[r for r in bad['typedPriorActors'] if r['pid']!=d['pid']]
        if kind=='precompleted':next(r for r in bad['typedPriorActors'] if r['pid']==d['pid'])['actualStatus']=0
        if kind=='wrongsource':d['producerEntrySha256']='0'*64
        deny('DESIGNATED_'+kind+'_DENIES',lambda:P.designated_author(bad,a,k,str(A.N/'root-setup-ownership.json'),'SETUP_OWNERSHIP_ADMISSION',producer))
    row=control['typedPriorActors'][-1];unique=P.actor_union(k,control['typedPriorActors'],allow_pending=True)
    check('INCREMENTAL_EXACT_DUPLICATES_RECONCILE',P.actor_union(k,[*unique,*unique],allow_pending=True)==unique)
    changed=copy.deepcopy(row);changed['ppid']=123
    deny('INCREMENTAL_CONFLICT_RETAINS_HOLD',lambda:P.actor_union(k,[*unique,changed],allow_pending=True),'TYPED_ACTOR_ROSTER_CONFLICT')
    CASES.append('concrete-author-state-and-pending-union')
    status,state,actual=H['phase'](s,k,a,auth,b,'negative',control,h)
    check('QUALIFIED_NEGATIVE_ONE_NOT_HELPER_ZERO',status==1 and state['header']['expectedExit']==1 and actual['actualStatus']==1)
    check('OUTSIDE_FACT_SURVIVES_CURRENT_OBSERVATION',OUTSIDE in {r['pid'] for r in state['header']['actorFacts']})
    adopted=H['operator']('aria_adopt_negative',state=state,actual=actual,sourceManifestSha256=P.source_subject(a))
    check('NEGATIVE_OUTER_ONE_ADOPTED_HONESTLY',adopted['stateAdoption']['actualStatus']==1)
    CASES.append('final-quoted-guard-negative-and-state-one')
    # Exercise the final shell's actual lexical Python argument and actual gate
    # qualification/finalizer, with a synthetic entry that represents only the
    # already-completed body. Unchanged production entry/run are bound by AST/reuse.
    body=shlex.split(CACHE['guard-failed-red.bash'].decode().split(' -B -c ',1)[1])[0] if ' -B -c ' in CACHE['guard-failed-red.bash'].decode() else shlex.split(CACHE['guard-failed-red.bash'].decode().split('-B -c ',1)[1])[0]
    for late in [False,True]:
        machine=G['Machine']();machine.fs.directory(A.N,0o700);machine.fs.directory(A.E,0o700);machine.epoch=1002
        entry=b'def execute(mode,authority,control,failure_sink=None,**unused):\n    return fake_completed_body(failure_sink)\n'
        machine.fs.put(A.N/'entry.py',entry,0o600);outer=[];active=[False];events=[];real=exec;closing=machine.api.close;opening=machine.api.open
        def fake_completed_body(sink):
            unit=A.Unit.__new__(A.Unit);unit.s=machine;unit.k=k;unit.auth_sha='a'*64;unit.control_sha='b'*64;unit.pins={str(A.N/'readiness.json'):'c'*64};unit.pending=[];unit.failure_sink=sink;unit.client=None;unit.prequalified=False;unit.utilities=[]
            unit.c=machine.custody(A.N,0o700);unit.old=machine.custody(A.E,0o700);sink.owner=unit;sink.resources=machine.resources
            qualification=P.GateQualification(unit,1000,1001,1002);sink.gate_qualification=qualification;unit.close();active[0]=True;return qualification
        def opened(name,flags,mode=0o600,dir_fd=None):
            fd=opening(name,flags,mode,dir_fd)
            if not outer and machine.fs.fds[fd]['path']==str(A.N/'entry.py'):outer.append(fd)
            return fd
        def closed(fd):
            result=closing(fd)
            if late and active[0] and outer and fd==outer[0]:machine.epoch=1062
            return result
        def track(code,env):env['fake_completed_body']=fake_completed_body;env['__builtins__']=dict(vars(builtins),exec=track);real(code,env)
        machine.api.open=opened;machine.api.close=closed
        comp=b'{}';argv=['-c',str(A.N/'entry.py'),P.sha(entry),'gate','a'*64,'b'*64,P.sha(comp),comp.decode()]
        env={'__name__':'_aria_actual_final_guard','__builtins__':dict(vars(builtins),exec=track,print=lambda v,**kw:events.append(json.loads(v)))}
        with ExitStack() as stack:
            for n in ['open','fstat','stat','close','read','getuid','getpid','getppid']:stack.enter_context(patch.object(os,n,getattr(machine.api,n)))
            stack.enter_context(patch.object(sys,'argv',argv))
            try:real(compile(body,'<actual-final-shell-Python-argument>','exec'),env)
            except SystemExit as end:code=end.code
            else:raise AssertionError('EXPLICIT_GUARD_STATUS_REQUIRED')
        check('FINAL_GUARD_'+str(late)+'_STATUS',code==(1 if late else 0) and env['sink'].finalized and not env['sink'].bootstrap_fds)
        if late:check('FINAL_GUARD_LATE_ORIGINAL_PERMIT_DENIES',events[-1]['primaryFailure']['reason']=='FRESHNESS_OR_CLOCK_REVERSE' and machine.epoch==1062)
        else:check('FINAL_GUARD_TIMELY_NO_FAILURE_RECORD',events==[] and machine.epoch==1002)
    CASES.append('actual-final-shell-argument-timely-late-outer-close')
    check('NO_REAL_TARGET_BOUNDARIES',G['ns']['BLOCKED']==[])

sys.addaudithook(G['ns']['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for n in names:
            if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
    tests()
print('ARIA_DONE:'+json.dumps({'passed':len(CHECKS),'checks':CHECKS,'caseGroups':CASES,'actualTargetEffects':0,'unexpectedBoundaryEvents':G['ns']['BLOCKED'],'sourceSafetyEdits':False,'persistentDenyAuditUnchanged':True,'targetHashes':{n:hashlib.sha256(CACHE[n]).hexdigest() for n in ['protocol.py','failed_gateway.py','control-author.py','control-author-cli.py','guard-failed-red.bash','operator-completion.js']},'authorFixtureChecksUsedNotIndependentCount':len(H['CHECKS'])},separators=(',',':')),flush=True)

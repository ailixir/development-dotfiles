"""Independent small QA batch; exact source buffers, inherited fake world only.

Preload stdlib/data/result FD before permanent deny audit. No target import or main.
Author fake classes are source reuse, not replay of its 24 cases. Cases below are new.
"""
import os,sys,stat,json,re,hashlib,types,time,subprocess,socket,selectors,struct,fcntl,errno,threading,base64,traceback,ast
from pathlib import Path,PurePosixPath
OUT=Path(__file__).parent
SRC=OUT.parents[1]/'early/c8-synthetic-local-report-prep/resume1'
NAMES=('profile.py','qualification_custody.py','storage.py','mode_predicates.py','public_contract.py','runtime.py','entry.py','controls.py')
SOURCES={name:(SRC/name).read_bytes() for name in NAMES}
fake_tree=ast.parse((SRC/'fake_check.py').read_bytes())
selected={'StopForeground','check','expect_hold','wire','sha','Clock','Node','FakeOS','Pipe','Proc','Selector','Connection','Listener','mode_stdout','World'}
fake_defs=ast.Module(body=[n for n in fake_tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in selected],type_ignores=[])
RESULT=os.open(str(OUT/'critical-results-attempt02.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
WRITE,CLOSE=os.write,os.close
DENIED=[]
def audit(event,args):
    if event=='open' or event.startswith(('os.','subprocess.','socket.','ctypes.','fcntl.','shutil.','pathlib.')):
        DENIED.append(event);raise RuntimeError('PERSISTENT_DENY:'+event)
sys.addaudithook(audit)
MODULES={}
for name,raw in SOURCES.items():
    mod=types.ModuleType('_qa_fake_'+name[:-3]);mod.__file__='<qa-fake:'+name+'>'
    exec(compile(raw,mod.__file__,'exec'),mod.__dict__);MODULES[name]=mod
P,K,F,M,C,R,E,Q=(MODULES[name] for name in NAMES)
F.K=K;R.P=P;R.K=K;R.F=F;R.M=M;R.C=C
CHECKS=0
exec(compile(fake_defs,'<reused-author-fake-classes-only>','exec'),globals())
RESULTS=[]
def case(name,fn):
    before=CHECKS
    try:details=fn();RESULTS.append(dict(id=name,outcome='PASS',checks=CHECKS-before,details=details))
    except BaseException as error:RESULTS.append(dict(id=name,outcome='FAIL',checks=CHECKS-before,failureClass=type(error).__name__,failureArgs=[str(x)[:256] for x in error.args]))

def utility_independent_facts():
    w=World();u=w.unit();proc=Proc(19292,b'',b'failure',status=7)
    R.subprocess=types.SimpleNamespace(Popen=lambda *a,**kw:proc,DEVNULL=-3,PIPE=-1)
    expect_hold(lambda:u.inspector.utility('PS',[]),'UTILITY_UNKNOWN')
    row=u.inspector.records[-1]
    check(proc.waits==1 and proc.returncode==7,'ACTUAL_RETURNED_STATUS')
    check(row['waitReturned'] is True and row['actualExit'] is None and row['stdoutComplete'] is False,'SOURCE_LOSES_INDEPENDENT_FACTS')
    check(u.inspector.pending[0]['child'] is proc and proc.stdout.closed is False,'REFERENCES_RETAINED')
    return dict(returnedStatus=7,recordedStatus=row['actualExit'],waitReturned=row['waitReturned'],completion=row['completion'])
case('QA-utility-nonzero-independent-wait-facts',utility_independent_facts)

def primary_cleanup():
    w=World();fs=F.Storage(K.Ownership());original=ValueError('FAKE_ORIGINAL');cleanup=OSError('FAKE_CLEANUP')
    fs.create=lambda path:dict(fake=True)
    def failwrite(sink,raw):raise original
    def failclose(sink):raise cleanup
    fs.write_fd=failwrite;fs.close_sink=failclose
    error=expect_hold(lambda:fs.write('/fake',b'x'))
    check(error is cleanup and error.__context__ is original,'FIRST_PRIMARY_REPLACED')
    return dict(propagated='CLEANUP',originalOnlyInContext=True)
case('QA-write-first-primary-replaced-by-close',primary_cleanup)

def self_text_failure_independence():
    w=World();u=w.unit();calls=[];old=F.digest
    def hashfail(raw):calls.append(len(raw));raise ValueError('FAKE_HASH')
    F.digest=hashfail
    try:expect_hold(u.self_roles)
    finally:F.digest=old
    check(len(calls)==1 and not hasattr(u,'self_report'),'SECOND_FIELD_NOT_COLLECTED')
    return dict(hashCalls=len(calls),separateOrigFactRetained=False)
case('QA-self-text-hash-failure-loses-other-field',self_text_failure_independence)

def frozen_gate(wall_values=None,created=1):
    w=World();u=w.unit();u.owners=lambda:None;u.current=lambda:None;u.archive_equal=lambda a:None
    ready=P.claim(purpose='FINAL_READINESS',unit=u.release['unit'],releaseSha256=u.release_sha,sourceManifestSha256=u.manifest_sha,
        operation='final',holder=u.release['holder'],ready=True,expectedWrapperExit=0,createdAtNs=created,archivePin={'key':'archive'},archiveQaRootPin={'key':'qa'})
    ready_pin=w.pin('/controls/ready.json',b'{}');permit=Q.permit(u.release['unit'],dict(path='/release',sha256=u.release_sha,bytes=1,mode=0o600,uid=100),ready_pin,1000000000000,1060000000000,0)
    u.matched=lambda spec,purpose,operation=None:ready if purpose=='FINAL_READINESS' else {'archive':True}
    docs={'status':dict(inspectedBy='root',separateInspection=True,receiptSha256=ready_pin['sha256'],actualExit=0,actualOuterCompletionCaptured=True),'permit':permit,'qa':dict(actualQaAccepted=True)}
    u.document=lambda spec:docs[spec['key']]
    if wall_values is not None:
        values=iter(wall_values);w.clock.time_ns=lambda:next(values)
    inputs=dict(readiness=ready_pin,readinessStatus={'key':'status'},permit={'key':'permit'})
    return w,u,inputs

def stale_readiness_and_reversal():
    w,u,inputs=frozen_gate([1000000009000,1000000003000])
    result=u.gate(inputs)
    check(result['allow'] is True,'ACCEPTED_COUNTEREXAMPLE')
    clocks=[row['value']['nowNs'] for row in u.events if row['kind'].startswith('PERMIT_')]
    check(clocks[1]<clocks[0],'REVERSED_CLOCK_WAS_ADMITTED')
    return dict(readinessCreatedAtNs=1,permitTimes=clocks,allow=result['allow'])
case('QA-gate-stale-original-readiness-and-reversed-clock',stale_readiness_and_reversal)

def late_operator_delivery():
    w,u,inputs=frozen_gate(created=1000000000000)
    u.dispatch=lambda op,unused:u.gate(inputs)
    u.finish=lambda:None
    fd=w.os.open('/operator',w.os.O_WRONLY|w.os.O_CREAT|w.os.O_EXCL,0o600);w.os.fds[1]=w.os.fds.pop(fd)
    oldwrite=w.os.write
    def later(fd,raw):w.clock.wall=1060000000001;return oldwrite(fd,raw)
    w.os.write=later
    code=E.execute(u,'gate',inputs,0)
    check(code==0 and w.clock.wall>1060000000000,'EXPIRED_DELIVERY_ACCEPTED')
    return dict(actualFakeDeliveryNs=w.clock.wall,permitExpiresNs=1060000000000,returnedGuardStatus=code)
case('QA-gate-delivery-expires-after-post',late_operator_delivery)

def empty_directory_and_entry_cap():
    w=World();w.os.directory('/inventory');w.os.directory('/inventory/empty')
    owner=K.Ownership();fs=F.Storage(owner);budget=F.Budget(entries=0,total=1,per_file=1)
    rows=fs.inventory('/inventory',budget=budget);fs.finish()
    check(rows==[] and budget.entries==0,'DIRECTORY_UNCOUNTED')
    return dict(actualFakeDirectoryCount=2,inventoryRows=len(rows),entryBudget=budget.entries,acceptedWithZeroEntries=True)
case('QA-empty-directory-omitted-and-zero-cap-admitted',empty_directory_and_entry_cap)

def duplicate_enrollment_and_invalid_wait():
    w=World('relay');u=w.unit();w.os.directory(u.evidence);w.native_started=True
    relay=R.RelayLoop(u,u.child,{},'b'*64)
    expect_hold(relay.prepare,'EARLY_OR_DUPLICATE_ENROLLMENT')
    check(relay.enrollments==1,'EARLY_NOT_CONSUMED')
    expect_hold(relay.accept,'EARLY_OR_DUPLICATE_ENROLLMENT');relay.finish();u.finish()
    w=World();u=w.unit();proc=Proc(199,status=None);u.child.child=proc
    expect_hold(u.child.wait_terminal,'NATIVE_UNKNOWN');u.child.wait_terminal()
    check(proc.waits==1 and u.child.record['waitReceived'] is True and u.child.record['directWaited'] is None,'INVALID_WAIT_RETRIED_OR_INVENTED')
    return dict(earlyEnrollmentConsumed=True,invalidReturnedWaitCount=proc.waits,directWaitFact=None)
case('QA-preserved-enrollment-cap-and-returned-null-wait',duplicate_enrollment_and_invalid_wait)

summary=dict(kind='QUINN_SOURCE01_INDEPENDENT_CRITICAL_FAKE_ONLY',declaredCases=7,executedCases=len(RESULTS),checks=CHECKS,
    results=RESULTS,failures=sum(r['outcome']!='PASS' for r in RESULTS),deniedHostEvents=DENIED,
    sourceHashes={name:sha(raw) for name,raw in SOURCES.items()},authorWorldClassesReused=True,authorCasesReplayed=0,
    peerCasesReplayed=0,actualJava=0,actualModes=0,actualPlatform=0,targetBoundaryGlobalsFaked=True,
    permanentDenyAudit=True,bytecodeDisabled=True,actualMainExecuted=False)
raw=json.dumps(summary,sort_keys=True,indent=2).encode()+b'\n';offset=0
while offset<len(raw):offset+=WRITE(RESULT,raw[offset:])
CLOSE(RESULT)
print(json.dumps(dict(cases=len(RESULTS),checks=CHECKS,failures=summary['failures'],deniedHostEvents=len(DENIED))))
raise SystemExit(1 if summary['failures'] or DENIED else 0)

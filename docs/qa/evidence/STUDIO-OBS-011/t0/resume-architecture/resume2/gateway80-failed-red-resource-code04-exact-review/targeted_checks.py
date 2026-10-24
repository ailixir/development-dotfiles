"""Independent source04 critical actual-function pairs, all effects fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
SOURCE=HERE.parents[2]/'early/gateway80-failed-red-resource-prep/resume4'
raw=(SOURCE/'source04_three_checks.py').read_bytes();prefix=raw.split(b'\nsys.addaudithook(audit)',1)[0]
H={'__name__':'_aria04_inspected_fixtures','__file__':str(SOURCE/'source04_three_checks.py')}
exec(compile(prefix,'<inspected-source04-fake-fixture-definitions>','exec'),H)
G=H['G'];ns=H['ns'];A,P,C=H['A'],H['P'],H['C'];checks=[];details=[]
output=str(HERE/'targeted-results.json')
def check(name,value):
    if value is not True:raise AssertionError(name)
    checks.append(dict(id=name,passed=True))
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==output and 'w' in str(args[1]):return
    ns['audit'](event,args)
def deny(name,action,reason):
    try:action()
    except BaseException as e:
        if getattr(type(e),'namespace',None)!='BOOTSTRAP_VALUE_ERROR':raise
        check(name,e.args==(reason,))
    else:raise AssertionError('EXPECTED_OWNER_DENIAL')
def capture_pair(publication_failure):
    s,k,a,auth,b=H['build']();records=[];sink=P.FailureSink(records.append,s.pid(),s.ppid());token=sink.claim_finalizer('CALLER')
    control=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    u=A.Unit(s,a,auth,k,control,P.sha(P.packed(control)),b,failure_sink=sink)
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',H['held']):u.register()
    s.timeout=True;old_write=s.api.write
    def writing(fd,data):
        if publication_failure and '/utility-' in s.fs.fds[fd]['path']:return 0
        return old_write(fd,data)
    s.api.write=writing;error=None
    try:u.capture(['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command='])
    except BaseException as actual:error=actual;sink.forward(actual)
    check('original_timeout_raised_'+str(publication_failure),isinstance(error,subprocess.TimeoutExpired))
    check('borrower_never_emits_'+str(publication_failure),records==[] and sink.finalized is False and len(u.pending)==1)
    u.close();sink.finalize(token);r=records[0]
    check('primary_and_pending_retained_'+str(publication_failure),r['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and r['errorType']=='TimeoutExpired' and r['children'][0]['waited'] is False and r['children'][0]['pid']==s.probe)
    check('publication_separate_exact_once_'+str(publication_failure),len([x for x in r['cleanupFailures'] if x['reason']=='WRITE_PARTIAL'])==(1 if publication_failure else 0))
    deny('finalized_rejects_mutation_'+str(publication_failure),lambda:sink.cleanup(OSError('UNEXPORTED')),'FAILURE_AFTER_FINALIZATION')
    details.append(dict(case='capture_'+str(publication_failure),primary=r['primaryFailure'],cleanup=r['cleanupFailures'],childrenPending=len(u.pending)))
def guard_pairs():
    for late in (False,True):
        s,env,records,status,fd=H['guard_case'](True,late);r=records[0]
        check('full_guard_final_trace_'+str(late),status==1 and len(records)==1 and r['finalizationOwner']=='GUARD' and env['sink'].finalized is True)
        check('full_guard_late_cleanup_complete_'+str(late),r['cleanupFailures']==env['sink'].cleanup_failures and any(x['namespace']=='OS_ERROR' for x in r['cleanupFailures']) is late and (fd in s.fs.fds) is late)
        check('full_guard_primary_stays_original_'+str(late),r['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and r['children'][0]['waited'] is False and r['descriptorSnapshotIsPostExitLeakProof'] is False)
        details.append(dict(case='guard_'+str(late),primary=r['primaryFailure'],cleanup=r['cleanupFailures'],retainedOuterFd=fd in s.fs.fds))
def installer_pairs():
    for late in (False,True):
        s,env,records,status,fd,outside=H['installer_case'](False,late)
        check('full_installer_owner_status_'+str(late),status==(1 if late else 0) and env['sink'].finalized is True and len(records)==(1 if late else 0))
        check('installer_created_known_identity_'+str(late),env['sink'].namespace_state['created'] is True and env['sink'].namespace_state['openedIdentity'] is not None)
        if late:check('installer_late_close_preserved',records[0]['finalizationOwner']=='INSTALL_LOADER' and records[0]['cleanupFailures']==env['sink'].cleanup_failures and records[0]['cleanupFailures'][0]['namespace']=='OS_ERROR' and fd in s.fs.fds)
    s,env,records,status,fd,outside=H['installer_case'](False,False,ctor=True)
    value=P.decode(s.fs.nodes[str(outside/'installation-failure.json')]['raw'])
    check('created_before_constructor_return',status==1 and str(A.N) in s.fs.nodes and value['partialNamespace'] is True and value['namespaceCreated'] is True and value['attemptConsumed'] is True)
    check('unknown_open_identity_never_invented',value['openedIdentity'] is None and records[0]['namespaceCreation']==dict(created=True,openedIdentity=None) and records[0]['qualified'] is False)
    details.append(dict(case='new_namespace_constructor_failure',failure=value,creation=records[0]['namespaceCreation']))
def owner_pairs():
    records=[];sink=P.FailureSink(records.append);deny('owner_required_before_entry',lambda:H['E'].execute('negative','a'*64,'b'*64,failure_sink=sink),'FINALIZATION_OWNER_REQUIRED')
    token=sink.claim_finalizer('CALLER');deny('opaque_token_identity',lambda:sink.finalize(object()),'FINALIZATION_OWNER_TOKEN')
    check('wrong_token_never_finalizes',sink.finalized is False and records==[])
    sink.finalize(token);check('clean_success_has_no_failure_trace',sink.finalized is True and records==[])
    deny('exact_once_finalization',lambda:sink.finalize(token),'FINALIZATION_OWNER_REQUIRED')
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    capture_pair(False);capture_pair(True);guard_pairs();installer_pairs();owner_pairs()
check('zero_reached_real_boundaries',ns['BLOCKED']==[])
result=dict(kind='INDEPENDENT_ARIA04_CRITICAL_ACTUAL_FUNCTION_PAIRS',passed=len(checks),failed=0,checks=checks,details=details,forbiddenBoundaryCalls=ns['BLOCKED'],subjectManifestSha256='cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e',actualTargetOperations=0)
Path(output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(passed=len(checks),failed=0,realBoundaryCalls=0)))

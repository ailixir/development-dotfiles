"""Independent source03 actual-function pairs; every reached effect remains fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
SUBJECT=HERE.parents[2]/'early/gateway80-failed-red-resource-prep/resume3'
raw=(SUBJECT/'source03_checks.py').read_bytes()
prefix=raw.split(b'\nsys.addaudithook(audit)',1)[0]
G={'__name__':'_independent_aria03_fixture','__file__':str(SUBJECT/'source03_checks.py')}
exec(compile(prefix,'<inspected-source03-fixture-definitions>','exec'),G)
ns=G['ns'];A,P,C=G['A'],G['P'],G['C'];F,I,CLI=G['F'],G['I'],G['CLI']
build,MemPath=G['build'],G['MemPath'];RESULTS=[];DETAILS=[]
output_path=str(HERE/'targeted-results.json')
def check(name,value):
    if value is not True:raise AssertionError(name)
    RESULTS.append(dict(id=name,passed=True))
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==output_path and 'w' in str(args[1]):return
    ns['audit'](event,args)
def expect_hold(action,reason):
    try:action()
    except BaseException as e:
        if getattr(type(e),'namespace',None) not in ('PROTOCOL_HOLD','CUSTODY_HOLD'):raise
        check(reason,str(e)==reason)
    else:raise AssertionError('EXPECTED_CLOSED_HOLD')

def critical_pairs():
    s,k,a,b,w,r=G['fixture']();before=copy.deepcopy(s.fs.nodes)
    draft=F.preflight(a,k,b,w,r)
    check('seven_factory_complete_acyclic_preflight',len(draft['candidate']['binaryModes'])==7 and draft['NFact'] is False and s.fs.nodes==before)
    missing=dict(w);missing.pop(k['binaryAncestors']['helm']['path'])
    expect_hold(lambda:F.preflight(a,k,b,missing,r),'FACTORY_SEVEN_WITNESSES')
    check('missing_binary_no_mutation',s.fs.nodes==before)
    s,k,scope,path,h,outside=G['install_fixture']()
    result=G['cli_execute'](str(path),h,system=s)
    check('actual_installer_cli_complete_seven',result['installationExit']==0 and len(P.decode(s.fs.nodes[str(A.N/'root-authorization.json')]['raw'])['binaryWitnesses'])==7)
    check('actual_installer_draft_remains_without_inode',P.decode(s.fs.nodes[str(outside/'pending-draft.json')]['raw'])['candidate']['newDirectoryPins']=={})
    s,k,scope,path,h,outside=G['install_fixture']();s.fs.put(A.PRIOR/'extra',b'X');before=set(s.fs.nodes)
    expect_hold(lambda:G['cli_execute'](str(path),h,system=s),'INSTALL_PRIOR_IDENTITY_MEMBERS')
    check('bad_prior_stops_before_attempt_or_namespace',set(s.fs.nodes)==before and str(A.N) not in s.fs.nodes and str(outside/'install-attempt.json') not in s.fs.nodes)
    s,k,a,auth,b=build();u=ns['new_unit'](s,a,auth,k,b);u.require_setup()
    check('actual_setup_helpers_loaded',u.setup_helpers[0]['pid']==900101)
    s.extra[900101]=dict(pid=900101,ppid=1,start='Mon Oct 19 17:00:00 2026',argv='unrelated',comm='/unrelated')
    expect_hold(u.table,'STARTLESS_NUMERIC_PRESENT_HOLD');u.close()

def primary_publish_pair(fail_publish):
    s,k,a,auth,b=build();records=[];sink=P.FailureSink(records.append,s.pid(),s.ppid())
    control=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    u=A.Unit(s,a,auth,k,control,P.sha(P.packed(control)),b,failure_sink=sink)
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',lambda fd,flags:(_ for _ in ()).throw(OSError(errno.EAGAIN,'HELD'))):u.register()
    s.timeout=True;oldwrite=s.api.write
    def write(fd,data):
        if fail_publish and '/utility-' in s.fs.fds[fd]['path']:return 0
        return oldwrite(fd,data)
    s.api.write=write;error=None
    try:u.capture(['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command='])
    except BaseException as actual:error=actual;sink.forward(actual)
    if error is None:raise AssertionError('UTILITY_MUST_FAIL')
    check('utility_child_retained_'+str(fail_publish),len(u.pending)==1 and records[0]['children'][0]['pid']==s.probe and records[0]['childCompletion']=='UNKNOWN')
    if fail_publish:
        check('counterexample_primary_replaced_by_publish',getattr(type(error),'namespace',None)=='CUSTODY_HOLD' and str(error)=='WRITE_PARTIAL' and isinstance(error.__context__,subprocess.TimeoutExpired) and records[0]['primaryFailure']['reason']=='WRITE_PARTIAL' and records[0]['cleanupFailures']==[])
    else:check('utility_primary_without_publish_failure',isinstance(error,subprocess.TimeoutExpired) and records[0]['primaryFailure']['namespace']=='UNMAPPED_FAILURE')
    DETAILS.append(dict(case='capture_publish_failure' if fail_publish else 'capture_timeout_only',raisedType=type(error).__name__,primary=records[0]['primaryFailure'],cleanup=records[0]['cleanupFailures'],unresolvedChildren=len(u.pending)))
    u.close()

def outer_cleanup_pair(fail_outer_close):
    s,k,a,auth,b=build();s.timeout=True;created=[];active=[False];outer_fd=[]
    real_open=s.api.open;real_close=s.api.close
    def opening(name,flags,mode=0o600,dir_fd=None):
        fd=real_open(name,flags,mode,dir_fd)
        if not active[0] and s.fs.fds[fd]['path']==str(A.N/'entry.py') and not outer_fd:outer_fd.append(fd)
        return fd
    def closing(fd):
        if fail_outer_close and active[0] and outer_fd and fd==outer_fd[0]:raise OSError('SYNTHETIC_UNEXPORTED_CLOSE')
        return real_close(fd)
    s.api.open=opening;s.api.close=closing
    outputs=[];real_exec=builtins.exec
    def tracked(code,namespace):
        namespace['__builtins__']=dict(vars(builtins),exec=tracked)
        real_exec(code,namespace)
        if code.co_filename=='<verified-failed-gateway>':
            namespace['System']=lambda:s;namespace['MANIFEST06']=s.package_sha;active[0]=True;created.append(namespace)
    env={'__name__':'_actual_outer_guard_aria','__builtins__':dict(vars(builtins),exec=tracked,print=lambda value,**kw:outputs.append(json.loads(value)))}
    body=G['REG']['body'];ch=P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])
    argv=['-c',str(A.N/'entry.py'),P.sha(b['entry.py']),'negative',auth,ch]
    with ExitStack() as nested:
        for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):nested.enter_context(patch.object(os,name,getattr(s.api,name)))
        nested.enter_context(patch.object(sys,'argv',argv))
        try:real_exec(compile(body,'<actual-outer-guard-aria>','exec'),env)
        except SystemExit as actual:status=actual.code
        else:raise AssertionError('ACTUAL_OUTER_EXIT_REQUIRED')
    check('outer_actual_dispatch_'+str(fail_outer_close),status==1 and len(created)==1 and len(outputs)==1 and outputs[0]['qualified'] is False)
    if fail_outer_close:
        check('counterexample_outer_cleanup_omitted',len(env['sink'].cleanup_failures)==1 and env['sink'].cleanup_failures[0]['namespace']=='OS_ERROR' and outputs[0]['cleanupFailures']==[] and outer_fd[0] in s.fs.fds)
    else:check('outer_clean_bootstrap_close',env['sink'].cleanup_failures==[] and outer_fd[0] not in s.fs.fds)
    DETAILS.append(dict(case='outer_close_failure' if fail_outer_close else 'outer_clean_close',emittedCleanup=outputs[0]['cleanupFailures'],actualSinkCleanup=list(env['sink'].cleanup_failures),outerBootstrapFdRetained=outer_fd[0] in s.fs.fds,descriptorSnapshotIsPostExitLeakProof=False))

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    critical_pairs();primary_publish_pair(False);primary_publish_pair(True);outer_cleanup_pair(False);outer_cleanup_pair(True)
check('zero_forbidden_real_boundaries',ns['BLOCKED']==[])
result=dict(kind='INDEPENDENT_ARIA03_ACTUAL_FUNCTION_CRITICAL_PAIRS',checks=RESULTS,passed=len(RESULTS),failed=0,details=DETAILS,forbiddenBoundaryCalls=ns['BLOCKED'],actualRuntimeActions=0,subjectManifestSha256='2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198')
Path(output_path).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(RESULTS),counterexamples=2,realBoundaryCalls=0)))

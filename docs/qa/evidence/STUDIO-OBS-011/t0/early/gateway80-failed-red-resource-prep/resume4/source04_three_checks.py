"""Exact three adopted findings, actual functions, all effects faked in same namespaces.

Inspected before first run. Persistent deny audit is inherited unchanged; only this
result artifact is additionally allowed. No target/private/frozen copy acquisition.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
raw=(HERE/'source03_checks.py').read_bytes();prefix=raw.split(b'\nsys.addaudithook(audit)',1)[0]
G={'__name__':'_source04_three_fake_fixture','__file__':str(HERE/'source03_checks.py')};exec(compile(prefix,'<inspected-source04-fixtures>','exec'),G)
ns=G['ns'];A,P,C=G['A'],G['P'],G['C'];build=G['build'];MemPath=G['MemPath'];RESULTS=[];DETAILS=[]
ENTRY=(HERE/'entry.py').read_bytes()
E=types.ModuleType('_actual_direct_entry');E.BootstrapValueError=P.BootstrapValueError;exec(compile(ENTRY,'<actual-direct-entry>','exec'),E.__dict__)
def check(name,value):
    if value is not True:raise AssertionError(name)
    RESULTS.append(dict(name=name,pass_=True))
def deny(name,action,reason):
    try:action()
    except BaseException as error:
        if getattr(type(error),'namespace',None)!='BOOTSTRAP_VALUE_ERROR':raise
        check(name,error.args==(reason,))
    else:raise AssertionError('EXPECTED_DENIAL')
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==str(HERE/'source04-three-results.json') and 'w' in str(args[1]):return
    ns['audit'](event,args)
def held(*args):raise OSError(errno.EAGAIN,'SYNTHETIC_HELD')

def publish_pairs():
    for fail in (False,True):
        s,k,a,auth,b=build();units=[];real_unit=A.Unit;old_popen=s.popen;old_write=s.api.write
        def construction(*args,**kw):
            u=real_unit(*args,**kw);units.append(u);return u
        def launching(argv):
            if units and units[0].prequalified:s.timeout=True
            return old_popen(argv)
        def writing(fd,data):
            if fail and units and units[0].pending and '/utility-' in s.fs.fds[fd]['path']:return 0
            return old_write(fd,data)
        s.popen=launching;s.api.write=writing;error=None
        with patch.object(A,'Unit',construction),patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',held):
            try:A.run('negative',auth,P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']),system=s,root_raw=P.packed(a),code_buffers=b)
            except BaseException as actual:error=actual
        label='PRIMARY_PUBLISH_'+('ADVERSE' if fail else 'CLEAN_PUBLICATION')
        record=s.operator_records[0];u=units[0]
        check(label+'_ORIGINAL_RAISED',isinstance(error,subprocess.TimeoutExpired))
        check(label+'_ONE_FINAL_DIRECT_TRACE',len(s.operator_records)==1 and record['finalizationOwner']=='DIRECT_RUN' and record['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and record['errorType']=='TimeoutExpired')
        check(label+'_PENDING_CHILD_RETAINED',len(u.pending)==1 and record['children'][0]['pid']==s.probe and record['children'][0]['waited'] is False and record['childCompletion']=='UNKNOWN')
        check(label+'_PUBLICATION_SEPARATE',any(row['reason']=='WRITE_PARTIAL' and row['namespace']=='CUSTODY_HOLD' for row in record['cleanupFailures']) is fail)
        check(label+'_NO_RAW_CONTEXT','SYNTHETIC_' not in json.dumps(record) and 'TimeoutExpired' not in json.dumps(record['primaryFailure']))
        DETAILS.append(dict(case=label,primary=record['primaryFailure'],cleanup=record['cleanupFailures']))

def guard_case(failure,late_close):
    s,k,a,auth,b=build();s.timeout=failure;outer_fd=[];active=[False];old_open=s.api.open;old_close=s.api.close;compiled=[];outputs=[];real_exec=builtins.exec
    def opening(name,flags,mode=0o600,dir_fd=None):
        fd=old_open(name,flags,mode,dir_fd)
        if not active[0] and not outer_fd and s.fs.fds[fd]['path']==str(A.N/'entry.py'):outer_fd.append(fd)
        return fd
    def closing(fd):
        if late_close and active[0] and outer_fd and fd==outer_fd[0]:raise OSError('PRIVATE_LATE_GUARD_CLOSE')
        return old_close(fd)
    def track(code,namespace):
        namespace['__builtins__']=dict(vars(builtins),exec=track);real_exec(code,namespace)
        if code.co_filename=='<verified-failed-gateway>':namespace['System']=lambda:s;namespace['MANIFEST06']=s.package_sha;active[0]=True
        compiled.append(code.co_filename)
    s.api.open=opening;s.api.close=closing
    env={'__name__':'_actual_guard_owner','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)))}
    argv=['-c',str(A.N/'entry.py'),P.sha(b['entry.py']),'negative',auth,P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw'])]
    with ExitStack() as guards:
        for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):guards.enter_context(patch.object(os,name,getattr(s.api,name)))
        guards.enter_context(patch.object(sys,'argv',argv));guards.enter_context(patch.object(fcntl,'flock',held))
        try:real_exec(compile(G['REG']['body'],'<actual-source04-guard>','exec'),env)
        except SystemExit as result:status=result.code
        else:raise AssertionError('OUTER_EXIT_REQUIRED')
    return s,env,outputs,status,outer_fd[0]

def outer_guard_pairs():
    for failure in (False,True):
        for late in (False,True):
            s,env,outputs,status,fd=guard_case(failure,late);label='GUARD_'+str(failure)+'_'+str(late)
            check(label+'_FINAL_STATUS_AND_OWNER',status==1 and env['sink'].finalized is True)
            check(label+'_EXACT_ONE_OR_ZERO_TRACE',len(outputs)==(1 if failure or late else 0))
            if outputs:
                record=outputs[0]
                check(label+'_CLEANUP_COMPLETE_AT_EMISSION',record['cleanupFailures']==env['sink'].cleanup_failures and any(x['namespace']=='OS_ERROR' for x in record['cleanupFailures']) is late and record['finalizationOwner']=='GUARD')
                check(label+'_OWNERSHIP_CURRENT_SNAPSHOT',record['descriptorSnapshotIsPostExitLeakProof'] is False and (fd in s.fs.fds) is late and (not late or record['unresolvedDescriptorCount']>=1))
                if failure:check(label+'_UTILITY_PRIMARY_NOT_REPLACED',record['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and record['children'][0]['waited'] is False)
                check(label+'_NO_RAW_CLOSE_MESSAGE','PRIVATE_LATE_GUARD_CLOSE' not in json.dumps(record))
            else:check(label+'_CLEAN_SUCCESS_NO_ERROR_RECORD',fd not in s.fs.fds and str(A.N/'negative-denial.json') in s.fs.nodes)

def installer_case(failure,late_close,ctor=False):
    s,k,scope,path,h,outside=G['install_fixture']();s.fs.put(MemPath(HERE)/'install-cli.py',G['EXTRA']['install-cli.py'],0o644)
    active=[False];outer_fd=[];old_open=s.api.open;old_close=s.api.close;old_write=s.api.write;old_stat=s.api.fstat;outputs=[];real_exec=builtins.exec
    def opening(name,flags,mode=0o600,dir_fd=None):
        fd=old_open(name,flags,mode,dir_fd)
        if not active[0] and not outer_fd and s.fs.fds[fd]['path']==str(MemPath(HERE)/'install-cli.py'):outer_fd.append(fd)
        return fd
    def closing(fd):
        if late_close and active[0] and outer_fd and fd==outer_fd[0]:raise OSError('PRIVATE_LATE_INSTALL_CLOSE')
        return old_close(fd)
    def writing(fd,data):
        if failure and s.fs.fds[fd]['path']==str(A.N/'custody.py'):return 0
        return old_write(fd,data)
    def metadata(fd):
        if ctor and s.fs.fds[fd]['path']==str(A.N):raise OSError('PRIVATE_NEW_N_CUSTODY')
        return old_stat(fd)
    def track(code,namespace):
        namespace['__builtins__']=dict(vars(builtins),exec=track);real_exec(code,namespace)
        if code.co_filename=='<verified-source04-system>':namespace['System']=lambda:s;active[0]=True
    s.api.open=opening;s.api.close=closing;s.api.write=writing;s.api.fstat=metadata
    loader=G['EXTRA']['install-loader.bash'].decode();body=loader.split("-B -c '",1)[1].split("\n' '/Users/",1)[0]
    env={'__name__':'_actual_installer_owner','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)))}
    argv=['-c',str(MemPath(HERE)/'install-cli.py'),P.sha(G['EXTRA']['install-cli.py']),str(path),h]
    with ExitStack() as guards:
        for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):guards.enter_context(patch.object(os,name,getattr(s.api,name)))
        guards.enter_context(patch.object(sys,'argv',argv))
        try:real_exec(compile(body,'<actual-source04-installer-loader>','exec'),env)
        except SystemExit as result:status=result.code
        else:raise AssertionError('INSTALL_OUTER_EXIT_REQUIRED')
    return s,env,outputs,status,outer_fd[0],outside

def outer_installer_pairs():
    for failure in (False,True):
        for late in (False,True):
            s,env,outputs,status,fd,outside=installer_case(failure,late);label='INSTALL_LOADER_'+str(failure)+'_'+str(late)
            check(label+'_EXACT_STATUS',status==(1 if failure or late else 0) and env['sink'].finalized is True)
            check(label+'_ONE_OR_ZERO_FINAL_TRACE',len(outputs)==(1 if failure or late else 0))
            if outputs:
                record=outputs[0]
                check(label+'_CLEANUP_AFTER_OUTERMOST_CLOSE',record['cleanupFailures']==env['sink'].cleanup_failures and record['finalizationOwner']=='INSTALL_LOADER' and any(r['namespace']=='OS_ERROR' for r in record['cleanupFailures']) is late)
                check(label+'_PARTIAL_STATE_AND_REFS',record['namespaceCreation']['created'] is True and record['namespaceCreation']['openedIdentity'] is not None and (fd in s.fs.fds) is late and record['NFact'] is False)
                if failure:check(label+'_PRIMARY_WRITE_FAILURE_PRESERVED',record['primaryFailure']['reason']=='WRITE_PARTIAL')
                check(label+'_NO_RAW_MESSAGES','PRIVATE_' not in json.dumps(record))
            else:check(label+'_CLEAN_INSTALL_RESULT',P.decode(s.fs.nodes[str(outside/'installation-result.json')]['raw'])['installationExit']==0 and fd not in s.fs.fds)
    s,env,outputs,status,fd,outside=installer_case(False,False,ctor=True)
    failure=P.decode(s.fs.nodes[str(outside/'installation-failure.json')]['raw'])
    check('PARTIAL_NAMESPACE_MKDIR_BEFORE_CUSTODY_FAILURE_TRUE',status==1 and str(A.N) in s.fs.nodes and failure['partialNamespace'] is True and failure['namespaceCreated'] is True and failure['attemptConsumed'] is True)
    check('PARTIAL_NAMESPACE_OPENED_IDENTITY_STAYS_UNKNOWN',failure['openedIdentity'] is None and outputs[0]['namespaceCreation']==dict(created=True,openedIdentity=None) and outputs[0]['qualified'] is False)
    check('PARTIAL_NAMESPACE_ATTEMPT_AND_CONSTRUCTOR_REFERENCES_RETAINED',str(outside/'install-attempt.json') in s.fs.nodes and any(str(getattr(c,'path',''))==str(A.N) for c in env['sink'].resources))

def direct_owners():
    s,k,a,auth,b=build();records=[];sink=P.FailureSink(records.append,s.pid(),s.ppid())
    deny('DIRECT_ENTRY_REQUIRES_EXPLICIT_OWNER',lambda:E.execute('negative',auth,'a'*64,failure_sink=sink),'FINALIZATION_OWNER_REQUIRED')
    token=sink.claim_finalizer('CALLER');s.timeout=True
    with patch.dict(A.__dict__,MANIFEST06=s.package_sha):
        try:A.run('negative',auth,P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']),system=s,root_raw=P.packed(a),code_buffers=b,failure_sink=sink)
        except subprocess.TimeoutExpired:pass
        else:raise AssertionError('RUN_TIMEOUT_REQUIRED')
    check('DIRECT_RUN_BORROWER_DOES_NOT_EMIT',records==[] and sink.finalized is False)
    sink.cleanup(OSError('PRIVATE_CALLER_CLOSE'));sink.finalize(token)
    check('DIRECT_RUN_CALLER_FINALIZES_COMPLETE_ONCE',len(records)==1 and records[0]['finalizationOwner']=='CALLER' and records[0]['cleanupFailures'][0]['namespace']=='OS_ERROR')
    deny('OWNER_REJECTS_SECOND_FINALIZATION',lambda:sink.finalize(token),'FINALIZATION_OWNER_REQUIRED')
    deny('OWNER_REJECTS_LATE_MUTATION',lambda:sink.cleanup(OSError('SECRET')),'FAILURE_AFTER_FINALIZATION')
    s,k,scope,path,h,outside=G['install_fixture']();records=[];sink=P.FailureSink(records.append,s.pid(),s.ppid());token=sink.claim_finalizer('CALLER')
    try:G['CLI'].execute(str(path),'0'*64,system=s,failure_sink=sink,verified_self_sha=P.sha(G['EXTRA']['install-cli.py']))
    except BaseException as error:
        if getattr(type(error),'namespace',None)!='BOOTSTRAP_VALUE_ERROR':raise
    else:raise AssertionError('CLI_BAD_SCOPE_SHA_REQUIRED')
    check('DIRECT_CLI_BORROWER_DEFERS_UNTIL_CALLER_CLEANUP',records==[] and sink.bootstrap_fds==[])
    sink.cleanup(OSError('PRIVATE_DIRECT_CLI_CLOSE'));sink.finalize(token)
    check('DIRECT_CLI_FINAL_TRACE_COMPLETE',len(records)==1 and records[0]['primaryFailure']['reason']=='INSTALL_EXTERNAL_SCOPE_SHA' and records[0]['cleanupFailures'][0]['namespace']=='OS_ERROR')
    s,k,a,auth,b=build();s.timeout=True;records=[];sink=P.FailureSink(records.append,s.pid(),s.ppid());token=sink.claim_finalizer('DIRECT_ENTRY')
    fd=s.api.open(str(A.N/'entry.py'),os.O_RDONLY|os.O_NOFOLLOW);sink.bootstrap_fds.append(fd);real_exec=builtins.exec
    def tracking(code,namespace):
        real_exec(code,namespace)
        if code.co_filename=='<verified-failed-gateway>':namespace['System']=lambda:s;namespace['MANIFEST06']=s.package_sha
    with ExitStack() as guards:
        for name in ('open','fstat','stat','close','read','getuid','getpid','getppid'):guards.enter_context(patch.object(os,name,getattr(s.api,name)))
        guards.enter_context(patch.object(builtins,'exec',tracking))
        try:E.execute('negative',auth,P.sha(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']),failure_sink=sink)
        except subprocess.TimeoutExpired:pass
        else:raise AssertionError('DIRECT_ENTRY_TIMEOUT_REQUIRED')
    check('DIRECT_ENTRY_BORROWER_PRESERVES_OUTER_OWNER',records==[] and sink.finalized is False and fd in s.fs.fds)
    old_close=s.api.close
    def failing_close(handle):
        if handle==fd:raise OSError('PRIVATE_DIRECT_ENTRY_OUTER_CLOSE')
        return old_close(handle)
    s.api.close=failing_close
    try:s.api.close(fd);sink.bootstrap_fds.remove(fd)
    except OSError as cleanup:sink.cleanup(cleanup)
    sink.finalize(token)
    check('DIRECT_ENTRY_FINALIZES_AFTER_CALLER_CLEANUP',len(records)==1 and records[0]['finalizationOwner']=='DIRECT_ENTRY' and records[0]['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and records[0]['cleanupFailures'][0]['namespace']=='OS_ERROR' and records[0]['children'][0]['waited'] is False and fd in s.fs.fds)
    check('ZERO_REAL_TARGET_BOUNDARIES',ns['BLOCKED']==[])

def tests():publish_pairs();outer_guard_pairs();outer_installer_pairs();direct_owners()
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    tests()
result=dict(kind='SOURCE04_COMPLETE_THREE_FINDING_ACTUAL_FUNCTION_PAIRS',passed=len(RESULTS),failed=0,checks=RESULTS,details=DETAILS,realBoundaryCalls=ns['BLOCKED'],sourcePins={**{n:P.sha(v) for n,v in ns['SRC'].items()},**{n:P.sha(v) for n,v in G['EXTRA'].items()}},harnessSha256=P.sha(raw),actualTargetActions=0,actualBashOrRuntimeCompatibilityProved=False)
(HERE/'source04-three-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('checks','details','sourcePins')}))

"""Focused composed delivery portion of the source05 bounded fake batch.

No replay of53/full flow. Inspect/preload all sources, inherit the SAME deny audit,
then execute actual guard/loader Python with explicit fake System and retained FDs.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
source=(HERE/'source05_checks.py').read_bytes();prefix=source.split(b"\nsys.addaudithook(ns['audit'])",1)[0]
G={'__name__':'_outer_source05_fakes','__file__':str(HERE/'source05_checks.py')};exec(compile(prefix,'<source05-preloaded-fixture-definitions>','exec'),G)
A,P,C,MemPath=[G[n] for n in ('A','P','C','MemPath')]
OLD_RESULT=(HERE/'bounded-flow-check-results.json').read_bytes();FROZEN=json.loads(OLD_RESULT)
TARGET={n:(HERE/n).read_bytes() for n in ('protocol.py','failed_gateway.py','custody.py','factory.py','installer.py','install-cli.py','entry.py','guard-failed-red.bash','install-loader.bash','contract.json')}
BODY=TARGET['guard-failed-red.bash'].decode().split("-B -c '",1)[1].split("' \"$GATEWAY_FR04_ENTRY\"",1)[0]
INSTALL_BODY=TARGET['install-loader.bash'].decode().split("-B -c '",1)[1].split("\n' '/Users/",1)[0]
RESULTS=[]
def check(name,value):
    if value is not True:raise AssertionError(name)
    RESULTS.append(dict(name=name,pass_=True))
def execute_guard(failed,late):
    s,k,a,auth,b=G['build']();s.timeout=failed;outer=[];active=[False];outputs=[];opening=s.api.open;closing=s.api.close;real_exec=builtins.exec
    def opened(name,flags,mode=0o600,dir_fd=None):
        fd=opening(name,flags,mode,dir_fd)
        if not active[0] and not outer and s.fs.fds[fd]['path']==str(A.N/'entry.py'):outer.append(fd)
        return fd
    def closed(fd):
        if late and active[0] and outer and fd==outer[0]:raise OSError('PRIVATE_LATE_CLOSE')
        return closing(fd)
    def track(code,env):
        env['__builtins__']=dict(vars(builtins),exec=track);real_exec(code,env)
        if code.co_filename=='<verified-failed-gateway>':env['System']=lambda:s;env['MANIFEST06']=s.package_sha;active[0]=True
    s.api.open=opened;s.api.close=closed
    control=P.decode(s.fs.nodes[str(A.N/'root-setup-ownership.json')]['raw']);ch=P.sha(P.packed(control));raw=G['completion'](s,k,ch,control['typedPriorActors'])
    argv=['-c',str(A.N/'entry.py'),P.sha(b['entry.py']),'negative',auth,ch,P.sha(raw),raw.decode()]
    env={'__name__':'_actual_source05_guard','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)))}
    with ExitStack() as stack:
        for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
        stack.enter_context(patch.object(sys,'argv',argv));stack.enter_context(patch.object(fcntl,'flock',G['held']))
        try:real_exec(compile(BODY,'<actual-source05-guard>','exec'),env)
        except SystemExit as end:status=end.code
        else:raise AssertionError('GUARD_EXIT_REQUIRED')
    return s,env,outputs,status,outer
def execute_loader(late):
    s,k,scope,path,h,outside=G['installer_fixture']();outer=[];active=[False];outputs=[];opening=s.api.open;closing=s.api.close;real_exec=builtins.exec
    def opened(name,flags,mode=0o600,dir_fd=None):
        fd=opening(name,flags,mode,dir_fd)
        if not active[0] and not outer and s.fs.fds[fd]['path']==str(HERE/'install-cli.py'):outer.append(fd)
        return fd
    def closed(fd):
        if late and active[0] and outer and fd==outer[0]:raise OSError('PRIVATE_LOADER_CLOSE')
        return closing(fd)
    def track(code,env):
        env['__builtins__']=dict(vars(builtins),exec=track);real_exec(code,env)
        if code.co_filename=='<verified-source05-system>':env['System']=lambda:s;active[0]=True
    s.api.open=opened;s.api.close=closed
    argv=['-c',str(HERE/'install-cli.py'),P.sha(TARGET['install-cli.py']),str(path),h]
    env={'__name__':'_actual_source05_install_loader','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)))}
    with ExitStack() as stack:
        for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
        stack.enter_context(patch.object(sys,'argv',argv))
        try:real_exec(compile(INSTALL_BODY,'<actual-source05-install-loader>','exec'),env)
        except SystemExit as end:status=end.code
        else:raise AssertionError('LOADER_EXIT_REQUIRED')
    return s,env,outputs,status,outer
def tests():
    for failed,late in [(False,False),(True,True)]:
        s,env,out,status,fds=execute_guard(failed,late);name='GUARD_'+str(failed)+'_'+str(late)
        check(name+'_EXPECTED_ONE_AND_FINAL_OWNER',status==1 and env['sink'].finalized is True and env['sink'].finalizer_label=='GUARD')
        check(name+'_ONE_OR_ZERO_FAILURE_RECORD',len(out)==(1 if failed or late else 0))
        if out:
            check(name+'_FINAL_CLEANUP_EQUALS_EMITTED',out[0]['cleanupFailures']==env['sink'].cleanup_failures and any(r['namespace']=='OS_ERROR' for r in out[0]['cleanupFailures']))
            check(name+'_PRIMARY_AND_UNKNOWN_CHILD_RETAINED',out[0]['primaryFailure']['namespace']=='UNMAPPED_FAILURE' and out[0]['children'][0]['waited'] is False and out[0]['childCompletion']=='UNKNOWN')
            check(name+'_NO_RAW_CLOSE_NO_LEAK_CLAIM','PRIVATE_' not in json.dumps(out[0]) and out[0]['descriptorSnapshotIsPostExitLeakProof'] is False and fds[0] in s.fs.fds)
        else:check(name+'_QUALIFIED_NEGATIVE_AND_CLOSED_OUTER',str(A.N/'negative-denial.json') in s.fs.nodes and fds[0] not in s.fs.fds)
    for late in (False,True):
        s,env,out,status,fds=execute_loader(late);name='LOADER_'+str(late)
        check(name+'_EXACT_STATUS_FINAL_OWNER',status==(1 if late else 0) and env['sink'].finalized is True and env['sink'].finalizer_label=='INSTALL_LOADER')
        check(name+'_ONE_OR_ZERO_FINAL_TRACE',len(out)==(1 if late else 0))
        if out:check(name+'_LATE_OUTER_CLOSE_AFTER_INSTALL_RETAINED',out[0]['cleanupFailures']==env['sink'].cleanup_failures and out[0]['descriptorCompletion']=='UNKNOWN' and fds[0] in s.fs.fds and 'PRIVATE_' not in json.dumps(out[0]))
        else:check(name+'_CLEAN_INSTALL_NO_FAILURE_EMISSION',fds[0] not in s.fs.fds)
    # The53 prior checks bind unchanged actual Python bodies; only duplicated
    # shell delivery scaffolding was normalized before this focused composition.
    unchanged={n:FROZEN['sourcePins'][n]==hashlib.sha256(TARGET[n]).hexdigest() for n in FROZEN['sourcePins'] if n in TARGET and n!='guard-failed-red.bash'}
    check('FLOW53_PRODUCTION_PYTHON_PINS_UNCHANGED',all(unchanged.values()))
    check('NO_REAL_TARGET_BOUNDARY',G['ns']['BLOCKED']==[])
sys.addaudithook(G['ns']['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for n in names:
            if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
    tests()
result=dict(kind='SOURCE05_COMPLETE_BOUNDED_FAKE_BATCH_WITH_COMPOSED_OUTER_DELIVERY',passed=FROZEN['passed']+len(RESULTS),failed=0,checks=FROZEN['checks']+RESULTS,realBoundaryCalls=G['ns']['BLOCKED'],sourcePins={n:hashlib.sha256(raw).hexdigest() for n,raw in TARGET.items()},flowBatch53NotReplayed=True,flowBatchResultSha256=hashlib.sha256(OLD_RESULT).hexdigest(),outerDeliveryChecks=len(RESULTS),normalizedShellScaffoldingOnly=True,actualTargetActions=0)
(HERE/'check-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'],flow53NotReplayed=True,outerDeliveryChecks=len(RESULTS),failed=0,realBoundaryCalls=result['realBoundaryCalls'])))

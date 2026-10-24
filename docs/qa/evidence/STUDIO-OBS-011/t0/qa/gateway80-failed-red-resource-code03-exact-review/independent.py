"""Quinn targeted actual-function pairs; synthetic machine and persistent deny audit."""
from pathlib import Path
import ast,builtins,ctypes,fcntl,io,json,os,socket,subprocess,sys,time
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3').absolute()
source=(S/'source03_checks.py').read_bytes().split(b'\nsys.addaudithook(audit)',1)[0]
ns={'__name__':'_quinn_independent_source03','__file__':str(S/'source03_checks.py')}
exec(compile(source,'<inspected-source03-fixture-definitions>','exec'),ns)
P,F=ns['P'],ns['F']; results=[]
def check(name,condition):
    if condition is not True:raise AssertionError(name)
    results.append(dict(name=name,pass_=True))
def run():
    s,k,a,b,w,r=ns['fixture']();old=dict(s.fs.nodes)
    candidate=F.preflight(a,k,b,w,r)
    check('INDEPENDENT_COMPLETE7_PURE_POSITIVE',len(candidate['candidate']['binaryHashes'])==7 and candidate['NFact'] is False and s.fs.nodes==old)
    missing=dict(w);missing.pop(k['binaryAncestors']['helm']['path'])
    try:F.preflight(a,k,b,missing,r)
    except P.Hold as e:check('INDEPENDENT_MISSING_HELM_DENY_BEFORE_MUTATION',str(e)=='FACTORY_SEVEN_WITNESSES' and s.fs.nodes==old)
    else:raise AssertionError('MISSING_HELM_ACCEPTED')
    row=dict(w[next(iter(w))]);row['mode']=True;bad=dict(w);bad[next(iter(w))]=row
    try:F.preflight(a,k,b,bad,r)
    except P.Hold as e:check('INDEPENDENT_BOOL_MODE_DENY_BEFORE_MUTATION',str(e)=='EXACT_BINARY_MODES_HASHES' and s.fs.nodes==old)
    else:raise AssertionError('BOOL_MODE_ACCEPTED')
    # Minimal isolated finite join uses the actual pure function and no OS boundary.
    current=dict(pid=900010,start='synthetic');probe=dict(pid=990010,terminal=True,status=0,observedStart='probe',command=['/synthetic/ps'],executableSha256='a'*64)
    rows={900010:dict(pid=900010,ppid=1,start='synthetic'),990010:dict(pid=990010,ppid=900010,start='probe')}
    helper=dict(pid=900101)
    good=P.finite_join(rows,k,[current],current,set(),probe,helpers=[helper])
    check('INDEPENDENT_DYNAMIC_HELPER_ABSENT_POSITIVE',good['setupHelperNumbersRequiredAbsent']==[900101] and good['effectiveFiniteNumericCount']==len(set(k['finiteUnion']['numericIds'])|{900101}))
    for pid in (900101,73492,86096,96486):
        changed=dict(rows);changed[pid]=dict(pid=pid,ppid=1,start='apparently-reused')
        try:P.finite_join(changed,k,[current],current,set(),probe,helpers=[helper])
        except P.Hold as e:check('INDEPENDENT_NUMERIC_ABSENCE_'+str(pid),str(e)==('SETUP_HELPER_NUMERIC_PRESENT_HOLD' if pid==900101 else 'STARTLESS_NUMERIC_PRESENT_HOLD'))
        else:raise AssertionError('NUMERIC_REUSE_ACCEPTED')
    for fail in (False,True):
        machine,contract,scope,path,h,outside=ns['install_fixture']()
        original_stat=machine.api.fstat
        def metadata(fd):
            if fail and machine.fs.fds[fd]['path']==str(ns['A'].N):raise OSError('SYNTHETIC_NEW_DIRECTORY_FSTAT_FAILURE')
            return original_stat(fd)
        machine.api.fstat=metadata
        try:outcome=ns['cli_execute'](str(path),h,system=machine)
        except OSError:
            failure=P.decode(machine.fs.nodes[str(outside/'installation-failure.json')]['raw'])
            check('INDEPENDENT_CREATED_NAMESPACE_MISREPORTED_ABSENT',fail is True and str(ns['A'].N) in machine.fs.nodes and failure['partialNamespace'] is False and failure['attemptConsumed'] is True)
            check('INDEPENDENT_CTOR_FAILURE_STILL_HOLD',len(machine.operator_records)==1 and machine.operator_records[0]['status']=='HOLD' and machine.operator_records[0]['qualified'] is False)
        else:check('INDEPENDENT_INSTALL_POSITIVE_ACTUAL_IDENTITY',fail is False and outcome['installationExit']==0 and outcome['N']['ino']==machine.fs.info(str(ns['A'].N)).st_ino)
    check('INDEPENDENT_ZERO_REAL_BOUNDARIES',ns['ns']['BLOCKED']==[])
sys.addaudithook(ns['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    run()
print(json.dumps(dict(kind='QUINN_TARGETED_FACTORY_AND_FINITE_JOIN_PAIRS',passed=len(results),failed=0,checks=results,actualBoundaryActions=0)))

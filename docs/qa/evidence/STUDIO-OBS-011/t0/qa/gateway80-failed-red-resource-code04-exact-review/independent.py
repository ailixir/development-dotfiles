"""Independent finalizer ownership/marker critical pairs; every effect fake."""
from pathlib import Path
import builtins,ctypes,fcntl,io,json,os,socket,subprocess,sys,time
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4').absolute()
raw=(S/'source03_checks.py').read_bytes().split(b'\nsys.addaudithook(audit)',1)[0]
G={'__name__':'_independent_quinn04','__file__':str(S/'source03_checks.py')}
exec(compile(raw,'<inspected-current-fake-fixtures>','exec'),G)
P,C,A=G['P'],G['C'],G['A'];rows=[]
def check(name,value):
    if value is not True:raise AssertionError(name)
    rows.append(dict(name=name,passed=True))
def rejected(name,call,reason):
    try:call()
    except P.BootstrapValueError as e:check(name,e.args==(reason,))
    else:raise AssertionError(name)
def tests():
    records=[];sink=P.FailureSink(records.append);token=sink.claim_finalizer('CALLER')
    sink.forward(P.Hold('ROOT_AUTHORITY'))
    check('INNER_FORWARD_ACCUMULATES_WITHOUT_EMITTING',records==[] and sink.finalized is False)
    sink.cleanup(OSError('SYNTHETIC_PRIVATE_CLOSE'));sink.finalize(token)
    check('FINAL_OWNER_EMITS_PRIMARY_AND_LATE_CLEANUP',len(records)==1 and records[0]['primaryFailure']['reason']=='ROOT_AUTHORITY' and records[0]['cleanupFailures']==[dict(stage='CLOSE_ACCOUNTING',namespace='OS_ERROR',reason='OS_ERROR')] and 'SYNTHETIC_' not in json.dumps(records))
    rejected('FINALIZED_MUTATION_DENIED',lambda:sink.primary(P.Hold('ROOT_AUTHORITY')),'FAILURE_AFTER_FINALIZATION')
    rejected('SECOND_FINALIZATION_DENIED',lambda:sink.finalize(token),'FINALIZATION_OWNER_REQUIRED')
    fresh=P.FailureSink(lambda value:records.append(value));fresh_token=fresh.claim_finalizer('CALLER')
    rejected('WRONG_OPAQUE_TOKEN_DENIED',lambda:fresh.finalize(object()),'FINALIZATION_OWNER_TOKEN')
    check('WRONG_TOKEN_DOES_NOT_FINALIZE',fresh.finalized is False)
    fresh.finalize(fresh_token);check('CLEAN_FINALIZATION_EMITS_NOTHING',len(records)==1)
    for fail in (False,True):
        s=G['Machine']();s.fs.directory(A.E,0o700);c=s.custody(A.E,0o700);marker=dict(created=False,openedIdentity=None);old=s.api.fchmod
        def chmod(fd,mode):
            if fail and s.fs.fds[fd]['path']==str(A.N):raise OSError('SYNTHETIC_AFTER_MKDIR')
            return old(fd,mode)
        s.api.fchmod=chmod
        try:c.mkdir(A.N.name,0o700,creation=marker)
        except OSError:check('MKDIR_MARKER_PRECEDES_FALLIBLE_FCHMOD',fail is True and marker==dict(created=True,openedIdentity=None) and str(A.N) in s.fs.nodes)
        else:check('MKDIR_MARKER_POSITIVE_WITHOUT_OPENED_FACT',fail is False and marker==dict(created=True,openedIdentity=None) and str(A.N) in s.fs.nodes)
        c.close()
    check('NO_REAL_TARGET_BOUNDARIES',G['ns']['BLOCKED']==[])
sys.addaudithook(G['audit'])
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,G['blocked']))
    tests()
print(json.dumps(dict(kind='QUINN04_INDEPENDENT_OWNER_AND_IMMEDIATE_MARKER',passed=len(rows),failed=0,checks=rows,actualTargetActions=0)))

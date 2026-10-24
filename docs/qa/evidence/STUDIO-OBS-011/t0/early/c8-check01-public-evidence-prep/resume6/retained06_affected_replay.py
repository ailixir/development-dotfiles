"""Replay only affected retained directory custody and first3 lock helper cases.

Unchanged pure311/other runtime121 cases are bound to sealed prior reviews, not rerun.
The two unchanged kernel/FFI cases at the end of concrete_system_tests are excluded.
"""
import ast,base64,builtins,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,resource,selectors,shlex,signal,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
raw=(HERE/'runtime_adapter_checks.py').read_bytes();adapter=(HERE/'public_observation_unit.py').read_bytes()
prior=json.loads((HERE/'source05-runtime-adapter-check-results.json').read_bytes())
A={'__name__':'_retained06_actual_adapter','__file__':'<inactive06>'};exec(compile(adapter,'<prepared06 adapter definitions>','exec'),A)
P=types.SimpleNamespace(Hold=A['Hold']);RESULTS=[];BLOCKED=[]
tree=ast.parse(raw);tree.body=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef))]
concrete=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='concrete_system_tests')
cut=next(i for i,n in enumerate(concrete.body) if isinstance(n,ast.ClassDef) and n.name=='Function')
concrete.body=concrete.body[:cut]
ns=dict(globals());exec(compile(tree,'<affected retained synthetic definitions>','exec'),ns)
def audit(event,args):
    if event=='open':
        if type(args[0]) is str and args[0]==str(HERE/'retained06-affected-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):raise AssertionError('AUDIT_DENIED_'+event)
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
      (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
      (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
    ns['low_level_custody_tests']();ns['concrete_system_tests']()
    if BLOCKED:raise AssertionError('REAL_BOUNDARY')
    if not all(x['name'] in {y['name'] for y in prior['checks']} for x in RESULTS):raise AssertionError('RETAINED_CASE_ID_CHANGED')
result=dict(kind='SOURCE06_AFFECTED_RETAINED_SUBSET_NOT_NEW_CASE_IDS',passed=len(RESULTS),failed=0,checks=RESULTS,realBoundaryCalls=BLOCKED,
    testInstrumentation='Only concrete_system_tests first3 lock cases selected; unchanged later2 kernel/FFI cases bound to prior review',actualActions=0)
(HERE/'retained06-affected-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(RESULTS),failed=0,allRetainedIds=True,actualActions=0)))

"""Actual guard Python compiled optimize0/1: paired exactSHA/wrongSHA fake effects.

No Bash/native/real filesystem/OS/main operation. A harmless synthetic entry isolates
outer integrity enforcement, whose expected hash is explicitly supplied to the loader.
"""
from pathlib import Path
import ast
import builtins
import copy
import ctypes
import fcntl
import hashlib
import io
import json
import os
import socket
import subprocess
import sys
import time
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
harness=(HERE/'checks.py').read_bytes();prefix=harness.split(b'\nsys.addaudithook(audit)',1)[0]
ns={'__name__':'_optimization_fake_fixture','__file__':str(HERE/'checks.py')};exec(compile(prefix,'<preloaded-fake-boundary-fixture>','exec'),ns)
guard=(HERE/'guard-failed-red.bash').read_bytes();body=guard.decode().split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
production={n:(HERE/n).read_bytes() for n in ('entry.py','failed_gateway.py','custody.py','protocol.py')}
for name,raw in production.items():assert not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(raw))),name
assert not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(body)))
checks=[];bad=[]
def check(name,value):
    assert value is True,name
    checks.append({'name':name,'pass':True})
def blocked(*args,**kwargs):bad.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event=='open' and type(args[0])is str and args[0]==str(HERE/'optimized-bootstrap-results.json') and 'w' in str(args[1]):return
    ns['audit'](event,args)
def test():
    for optimize in (0,1):
        for valid in (True,False):
            machine,k,a,auth,buffers=ns['build']();entry=ns['A'].N/'entry.py'
            harmless=b'def execute(mode, authority, control=None):\n    return 0\n'
            machine.fs.put(entry,harmless);expected=hashlib.sha256(harmless).hexdigest() if valid else '0'*64
            executed=[];outputs=[]
            real_exec=builtins.exec
            def track(code,namespace):
                executed.append(code.co_filename);return real_exec(code,namespace)
            environment={'__name__':'_actual_guard_under_optimization','__builtins__':dict(vars(builtins),exec=track,print=lambda value:outputs.append(value))}
            with ExitStack() as nested:
                for name in ('open','fstat','stat','close','read','getuid'):nested.enter_context(patch.object(os,name,getattr(machine.api,name)))
                nested.enter_context(patch.object(sys,'argv',['-c',str(entry),expected,'negative',auth]))
                try:real_exec(compile(body,'<exact-guard-body>','exec',optimize=optimize),environment)
                except SystemExit as status:actual=status.code
                else:raise AssertionError('GUARD_STATUS_REQUIRED')
            if valid:
                check('OPT'+str(optimize)+'_PINNED_BUFFER_COMPILED',actual==0 and executed==[str(entry)] and outputs==[])
            else:
                check('OPT'+str(optimize)+'_WRONG_SHA_REFUSED_BEFORE_COMPILE',actual==1 and executed==[] and len(outputs)==1 and json.loads(outputs[0])['status']=='HOLD')
    check('NO_RUNTIME_ASSERT_DEPENDENCY',all(not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(raw))) for raw in [*production.values(),body]))
    check('ZERO_REAL_BOUNDARY_CALLS',bad==[])
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
        (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
        (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    test()
result=dict(kind='ACTUAL_BOOTSTRAP_OPTIMIZE0_OPTIMIZE1_PAIRED_INTEGRITY_CASES',passed=len(checks),failed=0,checks=checks,realBoundaryCalls=bad,
    guardSha256=hashlib.sha256(guard).hexdigest(),sourcePins={n:hashlib.sha256(raw).hexdigest() for n,raw in production.items()},actualRuntimeOrNativeOrPrivateActions=0)
(HERE/'optimized-bootstrap-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('checks','sourcePins')}))

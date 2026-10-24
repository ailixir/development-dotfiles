"""Root's fixed GS-T native phases; reuse the sealed ownership drain under the live lock."""
from pathlib import Path
import ast
import errno
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys

os.umask(0o077)
D = Path(__file__).resolve().parent
R = D.parents[6]
U = R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-restricted-unit04'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
A = json.loads((D/'root-actual-unit-release.json').read_text())
assert A['sourceWriterReleased'] is True and A['nativeCommandReleased'] is True
assert A['phaseKeeperSha256'] == sha(Path(__file__))
phase = sys.argv[1]
assert phase in {'format', 'native', 'restore-compile'}
unit = A['nativePhases'][phase]
H = R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
assert sha(H) == 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
names = {'sha','utc','write_new','record','capture','pid_text','table',
         'owned_census_keys','classify_owned','pending_owned',
         'ownership_drain_decision','update_owned','run_owned'}
tree = ast.parse(H.read_text())
body = [n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom))
        or isinstance(n,ast.FunctionDef) and n.name in names]
scope = {}
exec(compile(ast.Module(body=body,type_ignores=[]),'<sealed-owned-process-drain>', 'exec'),scope)
pin = json.loads((D/'active-lock.json').read_text())
lock = R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock'
wrapper = lock.with_name('with-gradle-lock.py')

def prove_lock(*_):
    assert sha(wrapper) == '2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
    rows = scope['table']()
    assert pin['wrapperPid'] in rows and rows[pin['wrapperPid']]['start'] == pin['wrapperStart']
    cursor = os.getpid()
    while cursor != pin['wrapperPid']:
        assert cursor in rows and rows[cursor]['ppid'] > 0
        cursor = rows[cursor]['ppid']
    text = scope['capture'](['/usr/sbin/lsof','-nP','-p',str(pin['wrapperPid']),'-F','n'],(0,1))
    assert 'n'+str(lock) in text.splitlines()
    fd = os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        assert [st.st_dev,st.st_ino] == pin['lockDevInode']
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as e:
            assert e.errno in (errno.EAGAIN,errno.EACCES)
        else:
            fcntl.flock(fd,fcntl.LOCK_UN)
            raise RuntimeError('GST_HOLD_KERNEL_LOCK_NOT_HELD')
    finally:
        os.close(fd)

prove_lock()
phase_dir = D/('owned-'+phase)
phase_dir.mkdir(mode=0o700,exist_ok=False)
receipt = {'schemaVersion':1,'phase':phase,'status':'RUNNING',
           'phases':[],'evidenceErrors':[],
           'command':unit['argv'],'cwd':str(R/unit['cwd']),
           'rootUnitAuthorizationSha256':sha(D/'root-actual-unit-release.json'),
           'phaseKeeperSha256':sha(Path(__file__)),
           'ownershipCoreSha256':sha(H),'lockPin':pin,
           'sourceWriterScope':'Only the three released GS-T tests',
           'noLaneCredit':True,'automaticRetry':False}
scope.update(ROOT=R/unit['cwd'],RUN=phase_dir,RECEIPT=receipt,parent_lock=prove_lock)
env = dict(os.environ)
env['JAVA_HOME'] = A['java21Home']
env['PATH'] = A['node24Bin']+os.pathsep+A['java21Home']+'/bin'+os.pathsep+env.get('PATH','')
code = scope['run_owned'](unit['argv'],env,{},A['label'],A)
receipt['status'] = 'NATIVE_PHASE_TERMINAL'
scope['record']('NATIVE_PHASE_TERMINAL',exit=code)
destination = U/unit['logName']
assert not destination.exists()
shutil.copy2(phase_dir/'collector.private.log',destination)
print(json.dumps({'phase':phase,'exit':code,
    'ownedRecorded':len(receipt.get('ownedIdentities',[])),
    'ownedIdentityObservationGap':receipt.get('ownedIdentityObservationGap',False),
    'remainingOwnedNonJvmCount':len(receipt.get('remainingOwnedNonJvmFacts',[])),
    'logSha256':sha(destination),'noLaneCredit':True}))
sys.exit(code)

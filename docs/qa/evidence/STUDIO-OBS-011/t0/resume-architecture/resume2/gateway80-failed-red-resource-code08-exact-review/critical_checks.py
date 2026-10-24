"""One bounded Code08 affected pair plus explicit runtime conflict group, all fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume8').absolute()
manifest=(S/'manifest.json').read_bytes();assert hashlib.sha256(manifest).hexdigest()=='3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b'
CACHE={r['path']:(S/r['path']).read_bytes() for r in json.loads(manifest)['files']}
assert all(hashlib.sha256(CACHE[r['path']]).hexdigest()==r['sha256'] and len(CACHE[r['path']])==r['bytes'] for r in json.loads(manifest)['files'])
raw=CACHE['critical_check.py'];head=raw.split(b'RESULT_FD=os.open',1)[0];tail=raw.split(b'def check(name,ok):',1)[1].split(b'\nfailure=None\nsys.addaudithook',1)[0]
H={'__name__':'_aria08_exact_fake_definitions','__file__':str(S/'critical_check.py')}
exec(compile(head+b'\ndef check(name,ok):'+tail,'<exact-source08-fixture-definitions-no-writer-or-suite>','exec'),H)
A,P,G=[H[n] for n in ('A','P','G')];own=[]
def ck(n,v):
 if v is not True:raise AssertionError(n)
 own.append(dict(id=n,passed=True))
def denied(n,call,reason):
 try:call()
 except P.Hold as error:ck(n,error.args==(reason,));return
 raise AssertionError('EXPECTED_DENIAL_'+n)
def selected():
 # Fixed current seven-case harness subset; no whole41 or old suites replayed.
 H['run']('positive');H['run']('wrong_mode')
 # One additional concrete uncovered concern: explicit caller pin/mode cannot
 # override the new registry, including repeated reads after successful caching.
 s,k,a,b,path,scope,initial,private=H['build']('positive')
 u=A.Unit.__new__(A.Unit);u.s=s;u.k=k;u.a=a;u.external_inputs={str(A.R/p):v for p,v in P.external_input_specs(k).items()};u.pins={};u.file_facts={};u.buffers={}
 start=len(s.fs.events);denied('EXPLICIT_WRONG_MODE_BEFORE_FIRST_BODY',lambda:u.bound(private,mode=0o644),'IMMUTABLE_MODE_CONFLICT')
 denied('EXPLICIT_WRONG_SHA_BEFORE_FIRST_BODY',lambda:u.bound(private,expected='0'*64),'CONFLICTING_EXPLICIT_INPUT_PIN')
 ck('CONFLICTS_HAVE_NO_PRIVATE_BODY_READ',not [e for e in s.fs.events[start:] if e[0]=='read' and e[1]==private])
 wanted=s.fs.nodes[private]['raw'];ck('REGISTERED_RETAINED_CALLBACK_POSITIVE_FIXED600',u.retained_source_read(private)==wanted and s.fs.nodes[private]['mode']==0o600)
 start=len(s.fs.events);denied('CACHED_MODE_OVERRIDE_REJECTED_BEFORE_BODY',lambda:u.bound(private,mode=0o644),'IMMUTABLE_MODE_CONFLICT')
 ck('CACHED_OVERRIDE_NO_READ_OR_OPEN_FD',not [e for e in s.fs.events[start:] if e[0]=='read' and e[1]==private] and not s.fs.fds)
 ck('UNCHANGED_PERSISTENT_DENY_ZERO_REAL_BOUNDARIES',G['ns']['BLOCKED']==[])
failure=None
sys.addaudithook(G['ns']['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for n in names:
    if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
  selected()
except BaseException as error:failure=dict(type=type(error).__name__,args=[str(x)[:256] for x in error.args])
print(json.dumps(dict(kind='ARIA08_ONE_BOUNDED_FAKE_CHANGED_PATH_BATCH',fixedSubsetChecks=H['CHECKS'],fixedSubsetCases=H['CASES'],fixedSubsetDetails=H['DETAILS'],ownChecks=own,ownChecksCount=len(own),extraConcreteConcernGroups=1,failure=failure,sourceHashes={n:hashlib.sha256(v).hexdigest() for n,v in H['TARGET'].items()},fixtureSourceSha256=hashlib.sha256(H['RAW']).hexdigest(),synthetic29KeyFixture=True,originalPrivateBodyStatHashAcquired=False,persistentDenyAuditUnchanged=True,realBoundaryCalls=G['ns']['BLOCKED'],actualTargetEffects=0,positivePreflightSentinelNotInstallZero=True,oldSuitesReplayed=False),indent=2),flush=True)
raise SystemExit(1 if failure else 0)

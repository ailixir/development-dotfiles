"""Exact04 source/pin consistency, then actual loader bytecode over fake boundaries."""
from pathlib import Path
import ast,builtins,copy,hashlib,json,os,stat,sys,types
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume4').absolute();P=D.parent/'resume3';O=Path(__file__).absolute().parent
checks=[];pins=[];buffers={}
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
def pin(path,h=None,mode=None,size=None):
 path=Path(path).absolute();raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if h is not None:check('pin '+path.name,digest==h)
 if mode is not None:check('mode '+path.name,stat.S_IMODE(path.stat().st_mode)==mode)
 if size is not None:check('bytes '+path.name,len(raw)==size)
 pins.append({'path':str(path.relative_to(Path.cwd())),'sha256':digest,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)});return raw
mraw=pin(D/'manifest.json','8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310');m=json.loads(mraw)
for row in m['files']:buffers[row['path']]=pin(D/row['path'],row['sha256'],row['mode'],row['bytes'])
check('exact149payloads',len(buffers)==149 and {p.name for p in D.iterdir()}==set(buffers)|{'manifest.json'})
for line in buffers['SHA256SUMS'].decode().splitlines():
 h,name=line.split('  ',1);check('whole packet checksum '+name,hashlib.sha256(buffers[name]).hexdigest()==h)
for row in json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']:
 assert '/runtime/' not in row['path'] and not row['path'].endswith('preexisting-baseline.json')
 pin(row['path'],row['sha256'],row['mode'],row['bytes'])
oldraw=pin(P/'manifest.json','53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad')
for row in json.loads(oldraw)['files']:pin(P/row['path'],row['sha256'],row['mode'],row['bytes'])
for name in ['Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_relay.py','public_contract.py','unit_policy.py']:
 check('literal03 reviewed mechanism '+name,buffers[name]==(P/name).read_bytes())
for name in ['pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json']:
 current=json.loads(buffers[name]);previous=json.loads((P/name).read_bytes());check('retained536 semantic identity '+name,[x['name'] for x in current['checks']]==[x['name'] for x in previous['checks']])
for i,total in [(1,311),(2,121),(3,104),(4,191)]:
 out=(O/f'suite-{i}.stdout').read_text().splitlines();a,b=json.loads(out[0]),json.loads(out[-1]);check('actual guarded suite '+str(i),a['passed']==total and a['failed']==0 and b['executedChecks']==total)
impl=json.loads(buffers['runtime-implementation-map.json']);check('99sites15classes18callbacks9modes',len(impl['reachedInterpretationSites'])==99 and len(impl['inputClasses'])==15 and len(impl['requiredCallbacks'])==18 and len(impl['cli'])==9)
guard=buffers['guard-public-observe.bash'].decode();loader=buffers['entry-loader.py.txt'].decode();embedded=guard.split("readonly C8_PUBLIC_CONTROL_LOADER='",1)[1].split("'\nexit()",1)[0]
check('common entry loader and guard literal exactly equal',embedded.strip()==loader.strip())
for name in ['RECIPE.md','RUNTIME-RECIPE.md']:
 text=buffers[name].decode();check('active current digest and entry API '+name,'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35' not in text and 'entry-NNNN-pins.json' in text)
# Check that removing only the single READY yield reconstructs the exact original serve AST.
integration=buffers['integration04_checks.py'].decode();check('scheduler equality disclosed and asserted',"body.insert(where+1,ast.Expr(value=ast.Yield" in integration and 'ast.dump(proof,include_attributes=False)==ast.dump(original_serve,include_attributes=False)' in integration)
check('all original direct104 retained separately',json.loads(buffers['boundary03-check-results.json'])['passed']==104)
# No source, helper, process, real FD or native boundary may be reached from here.
denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args
  path=Path(name).absolute() if not isinstance(name,int) else None
  writing=(isinstance(mode,str) and any(x in mode for x in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if path is None or not writing or not (path==O or O in path.parents):denied.append(event);raise AssertionError('FORBIDDEN_REAL_OPEN')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn','ctypes.dlopen')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('FORBIDDEN_REAL_BOUNDARY')
sys.addaudithook(audit)
class FakeOS:
 O_RDONLY=os.O_RDONLY;O_DIRECTORY=os.O_DIRECTORY;O_NOFOLLOW=os.O_NOFOLLOW
 def __init__(self,raw):self.raw=raw;self.nextfd=0;self.closed=[];self.reads={}
 def open(self,*args,**kwargs):self.nextfd+=1;self.reads[self.nextfd]=0;return self.nextfd
 def fstat(self,fd):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=501,st_size=len(self.raw),st_dev=1,st_ino=7,st_mtime_ns=10,st_ctime_ns=11)
 def read(self,fd,n):
  at=self.reads[fd];out=self.raw[at:at+n];self.reads[fd]+=len(out);return out
 def close(self,fd):self.closed.append(fd)
 def getuid(self):return 501
cases=[];payload=b'pass\n';good=hashlib.sha256(payload).hexdigest()
for optimized,expected in [(0,good),(0,'0'*64),(1,good),(1,'0'*64)]:
 api=FakeOS(payload);calls=[]
 fake_sys=types.SimpleNamespace(argv=['-c','/owned/control/public_observation_unit.py',expected,'selected','a'*64,'entry-0001-pins.json','b'*64])
 modules={'os':api,'stat':stat,'sys':fake_sys,'hashlib':hashlib}
 def fake_import(name,*args,**kwargs):
  assert name in modules,'UNEXPECTED_IMPORT';return modules[name]
 def capture_compile(raw,name,mode):calls.append({'rawSha256':hashlib.sha256(raw).hexdigest(),'expectedSha256':expected});return builtins.compile(raw,name,mode)
 def prevent_execute(code,scope):calls[-1]['executionRequested']=True
 scoped_builtins=dict(vars(builtins),__import__=fake_import,compile=capture_compile,exec=prevent_execute)
 ns={'__builtins__':scoped_builtins}
 try:builtins.exec(builtins.compile(loader,'<exact common loader fake boundary>','exec',optimize=optimized),ns)
 except AssertionError:accepted=False
 else:accepted=True
 check('loader normal/optimized counterexample '+str((optimized,expected==good)),accepted==(optimized==1 or expected==good))
 cases.append({'optimizationLevel':optimized,'expectedShaMatchesPayload':expected==good,'loaderAccepted':accepted,'adapterCompileReached':bool(calls),'unverifiedAdapterExecutionPreventedByReviewer':True,'realBoundaryCalls':0})
check('wrong SHA denied normally but compiles under optimization',cases[1]['loaderAccepted'] is False and cases[3]['adapterCompileReached'] is True)
check('no denied actual boundaries',not denied)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':hashlib.sha256(mraw).hexdigest(),'pins':pins,'actualRuntimeBaselinePrivateOrJavaActions':0},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'guardedAuthorChecks':727,'independentLoaderCases':cases,'singleReadyYieldAndSingleSyntheticClientQualification':'Instrumented whole flow, not unchanged full serve/thread/runtime proof; retained104 unchanged function cases and9 real entry-load barriers separate.','deniedActualBoundaryCalls':denied,'actualAdapterMainOrRuntimeJavaPlatformProcessSocketKernelLockNativeActions':0},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'authorControls':727,'independentLoaderCases':len(cases),'mandatoryLoaderCounterexample':True,'actualActions':0}))

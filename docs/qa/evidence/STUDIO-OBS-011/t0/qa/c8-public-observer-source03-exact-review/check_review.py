"""Finite source03 QA: named immutable source inputs, then persistent fake-only deny audit."""
from pathlib import Path
import ast,base64,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,resource,selectors,shlex,signal,socket,stat,struct,subprocess,sys,threading,time,types,unittest.mock
import xml.etree.ElementTree,xml.parsers.expat
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume3').absolute();O=Path(__file__).absolute().parent
checks=[];pins=[];cases=[]
def check(label,ok):assert ok,label;checks.append({'check':label,'passed':True})
def pinned(p,want=None,mode=None):
 raw=p.read_bytes();h=hashlib.sha256(raw).hexdigest()
 if want is not None:check('pin '+str(p.relative_to(Path.cwd())),h==want)
 if mode is not None:check('mode '+p.name,stat.S_IMODE(p.stat().st_mode)==mode)
 pins.append({'path':str(p.relative_to(Path.cwd())),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(p.stat().st_mode)});return raw
mraw=pinned(D/'manifest.json','53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad');m=json.loads(mraw)
files={}
for row in m['files']:
 raw=pinned(D/row['path'],row['sha256'],row['mode']);check('size '+row['path'],len(raw)==row['bytes']);files[row['path']]=raw
check('exact96payload seal',len(files)==96 and {p.name for p in D.iterdir()}==set(files)|{'manifest.json'})
for line in files['SHA256SUMS'].decode().splitlines():
 h,name=line.split('  ',1);check('checksum '+name,hashlib.sha256(files[name]).hexdigest()==h)
for row in json.loads(files['runtime-input-pins.json'])['verifiedPreparedInputs']:
 needpath=row['path'];assert '/runtime/' not in needpath and not needpath.endswith('preexisting-baseline.json')
 raw=pinned(Path(needpath),row['sha256'],row['mode']);check('prepared reference bytes '+needpath,len(raw)==row['bytes'])
# Read exact amended root and design/QA/prior finding records; no current source capture.
for path,h in [('docs/qa/evidence/STUDIO-OBS-011/t0/resume2-c8-public-observer-source03-preparation-root-adoption.json','c2ea567e4ac63144563838a133997447d5023ba143e2251fd3afc634a9d4eed4'),('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/c8-public-observer-java-boundary-design/manifest.json','d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e'),('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-observer-java-boundary-design-review/manifest.json','e996ebcc3471a9d6e17e3914cf84711e97ccc5aae94a425182f6e93072fe7c52'),('docs/qa/evidence/STUDIO-OBS-011/t0/resume2-c8-public-observer-java-findings-root-adoption.json','adb831650f06c502a73364db104b08e8ffe2da937494a518bfc1d2588e94b65f')]:pinned(Path(path),h)
old=D.parent/'resume2';oldraw=pinned(old/'manifest.json','0e28194a11c236fac2708c489e486ec04f6577f4538194c93f2c6c873face15e')
for row in json.loads(oldraw)['files']:pinned(old/row['path'],row['sha256'],row['mode'])
for name in ['pure-check-results.json','runtime-adapter-check-results.json']:
 a=json.loads(files[name]);b=json.loads((old/name).read_bytes());check('retained semantic identities '+name,[r['name'] for r in a['checks']]==[r['name'] for r in b['checks']])
for i,total in [(1,311),(2,121),(3,104)]:
 out=(O/('suite-'+str(i)+'.stdout')).read_text().splitlines();a=json.loads(out[0]);b=json.loads(out[-1]);check('actual guarded suite '+str(i),a['failed']==0 and a['passed']==total and b['executedChecks']==total)
impl=json.loads(files['runtime-implementation-map.json']);check('reached93sites14classes18callbacks9modes',len(impl['reachedInterpretationSites'])==93 and len(impl['inputClasses'])==14 and len(impl['requiredCallbacks'])==18 and len(impl['cli'])==9)
# Extract only source-provided fake fixture definitions, never its tests or audit/output tail.
tree=ast.parse(files['boundary03_checks.py']);nodes=[]
for n in tree.body:
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='sys.addaudithook':break
 nodes.append(n)
fx={'__file__':str(D/'boundary03_checks.py'),'__name__':'quinn_only_inspected_fake_definitions'}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<inspected fake fixture definitions>','exec'),fx)
A=fx['A'];P=types.ModuleType('_quinn_actual_policy');exec(compile(files['unit_policy.py'],'<actual policy definitions>','exec'),P.__dict__)
# Required libraries and all source data are now loaded. No IO/OS/thread/socket/kernel effects may follow.
denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args
  path=Path(name).absolute() if not isinstance(name,int) else None
  write=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if path is None or not write or not(O==path or O in path.parents):denied.append(event);raise AssertionError('QA_AUDIT_FORBIDDEN_OPEN')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn','ctypes.dlopen')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('QA_AUDIT_FORBIDDEN_OPERATION')
sys.addaudithook(audit)
# Finding1: the actual Controller pre-native current check reaches the actual closed-namespace verifier.
b,e,kernel=fx['effects_world']();events=[]
e.c.absent=lambda name:str(A.CONTROL/name) not in b.files
# No selected marker yet is a legitimate pre-stage state; after claim no drain may exist yet.
b.files.pop(str(A.CONTROL/'selected-consumed.json'))
e.verify_relay_closed_namespace();check('pre-selected namespace check permits no drain',True)
class Mini:
 def __init__(self):self.docs={};self.invocations=0
 def claim_once(self,phase):
  events.append('claim:'+phase);b.files[str(A.CONTROL/(phase+'-consumed.json'))]=A.packed({'phase':phase,'attemptCap':1,'releaseSha256':e.a['releaseSha256']})
 def require_phase(self,*a,**k):return None
 def require_root_phase_decision(self,*a):return None
 def current(self):events.append('current');e.verify_relay_closed_namespace();return {}
 def run_owned(self,*a):self.invocations+=1;raise AssertionError('SHOULD_NOT_RUN')
 def finally_record_owned_drain(self,phase):events.append('finally:drain');self.docs[phase+'-drain.json']={'nativeNotStarted':True}
 def write_once(self,name,value):self.docs[name]=value
mini=Mini();controller=P.Controller.__new__(P.Controller);controller.a={};controller.effects=mini
result=controller.selected();check('selected consumed then fails before native',result['disposition']=='HOLD' and result['phaseExit']==1 and mini.invocations==0 and events==['claim:selected','current','finally:drain'])
cases.append({'finding':'OBS03-QA-01','events':events,'nativeInvocations':mini.invocations,'resultDisposition':result['disposition'],'cause':'actual verify_relay_closed_namespace demands absent selected-drain.json during pre-native current'})
# Finding2: actual main closes the relay's unit Custody even when its thread is unresolved.
original_load,original_operate,original_path=A.load,A.operate,A.Path
class Lexical:
 def __init__(self,value):self.value=value
 def absolute(self):return self
 def __str__(self):return self.value
A.Path=Lexical;A.__file__=str(A.CONTROL/'public_observation_unit.py')
for alive in [False,True]:
 events=[]
 class Namespace:
  def __init__(self,name):self.name=name
  def close(self):events.append('close:'+self.name)
 eff=types.SimpleNamespace(c=Namespace('control'),unit=Namespace('relay-output'),registration_complete=True,register=lambda mode:None,relay=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=lambda:alive)))
 eff.sys=types.SimpleNamespace(stdin_devnull=lambda:True,cwd=lambda:str(A.ROOT))
 A.load=lambda sys,sha:eff
 def unresolved(*args):raise A.Hold('RELAY_DRAIN_UNRESOLVED')
 A.operate=unresolved
 try:A.main(['selected','a'*64],eff.sys)
 except A.Hold:pass
 check('actual main unconditional closes '+str(alive),events==['close:control','close:relay-output'])
 cases.append({'finding':'OBS03-QA-02','relayThreadAlive':alive,'actualMainFinallyEvents':events})
A.load,A.operate,A.Path=original_load,original_operate,original_path
# Finding3: first-seen immutable root JSON receives no independent hash barrier.
for exitval in [0,1]:
 raw=A.packed({'authorizedBy':'root','expectedWrapperExit':exitval,'releaseSha256':'c'*64})
 obj=A.Effects.__new__(A.Effects);obj.loaded_local={};obj.c=types.SimpleNamespace(read=lambda *args:(raw,None))
 parsed=obj.root_document('root-actual-evidence-disposition.json')
 check('root first buffer self-pinned '+str(exitval),parsed['expectedWrapperExit']==exitval and obj.loaded_local['root-actual-evidence-disposition.json']==A.sha(raw))
 cases.append({'finding':'OBS03-QA-03','sameExternalRelease':'c'*64,'firstReadAcceptedExit':parsed['expectedWrapperExit'],'externalExpectedHashSupplied':False})
# Finding4: active recipe gives the historical virtual candidate rather than the actual03 digest.
old_digest='ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35';new_digest='3a6fddda4946106f143783640746464cf2c775256f2340b9d24d1a4701adadbd'
check('active recipe stale candidate digest established',old_digest in files['RECIPE.md'].decode() and new_digest not in files['RECIPE.md'].decode() and new_digest in files['unit_policy.py'].decode())
cases.append({'finding':'OBS03-QA-04','activeRecipeCandidate':old_digest,'actualPolicyCandidate':new_digest})
check('zero forbidden boundary attempts',not denied)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':hashlib.sha256(mraw).hexdigest(),'pins':pins,'runtimeBaselineJavaOrPlatformAccess':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'authorSourceControls':536,'independentCases':cases,'deniedBoundaryCalls':denied,'actualRuntimeJavaProcessSocketKernelLockNativePrivateActions':0,'observedPlatformQualification':False},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'authorControls':536,'counterexampleCases':len(cases),'allExpected':True,'actualActions':0}))

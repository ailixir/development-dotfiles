"""Independent source05 seals/maps, all-mode optimized loader, five-resource closure checks.

Only named prepared/public source is read. After pin collection, subject effects are
confined to fake namespaces and a persistent audit denies real boundary fallthrough.
"""
from pathlib import Path
import ast,builtins,copy,difflib,hashlib,json,os,stat,sys,types
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume5').absolute()
P=D.parent/'resume4';O=Path(__file__).absolute().parent
checks=[];pins={};buffers={}
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 checks.append({'name':name,'pass':True})
def sha(raw):return hashlib.sha256(raw).hexdigest()
def pin(path,h=None,mode=None,size=None):
 path=Path(path).absolute()
 assert '/runtime/' not in str(path) and not path.name=='preexisting-baseline.json'
 raw=path.read_bytes();s=path.stat();digest=sha(raw)
 if h is not None:check('SHA '+str(path.relative_to(Path.cwd())),digest==h)
 if mode is not None:check('mode '+path.name,stat.S_IMODE(s.st_mode)==mode)
 if size is not None:check('bytes '+path.name,len(raw)==size)
 pins[str(path.relative_to(Path.cwd()))]={'path':str(path.relative_to(Path.cwd())),'sha256':digest,'bytes':len(raw),'mode':stat.S_IMODE(s.st_mode)}
 return raw
mraw=pin(D/'manifest.json','4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f');m=json.loads(mraw)
for row in m['files']:buffers[row['path']]=pin(D/row['path'],row['sha256'],row['mode'],row['bytes'])
check('exact177members no extra',len(buffers)==177 and {p.name for p in D.iterdir()}==set(buffers)|{'manifest.json'})
for n in ('SHA256SUMS','RUNTIME-SHA256SUMS'):
 for line in buffers[n].decode().splitlines():
  digest,name=line.split('  ',1);check(n+' '+name,sha(buffers[name])==digest)
prepared=json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']
check('173 prepared pins',len(prepared)==173)
for row in prepared:pin(row['path'],row['sha256'],row['mode'],row['bytes'])
pmraw=pin(P/'manifest.json','8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310');pm=json.loads(pmraw);old={}
for row in pm['files']:old[row['path']]=pin(P/row['path'],row['sha256'],row['mode'],row['bytes'])
check('149 old members intact',len(old)==149)
for directory,h in [('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/c8-public-observer-source04-exact-review','018ef6e618bdc038ad1d764ca6e01753c9e731925ecbcffe6a875c28fcffd815'),('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-observer-source04-exact-review','4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29')]:
 prior=Path(directory);v=json.loads(pin(prior/'manifest.json',h))
 for row in v.get('files',v.get('members')):pin(prior/row['path'],row['sha256'],row['mode'],row['bytes'])
for n in ('Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_contract.py','unit_policy.py','launch-control.template.json','public-observation.schema.json'):
 check('literal prior mechanism '+n,buffers[n]==old[n])
a=json.loads(buffers['public-policy.json']);b=json.loads(old['public-policy.json']);b['sourceGeneration']=5
check('policy only active generation metadata change',a==b)
for n in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json'):
 current=json.loads(buffers[n]);previous=json.loads(old[n]);check('exact727 retained identity '+n,[x['name'] for x in current['checks']]==[x['name'] for x in previous['checks']] and current['failed']==0)
check('runtime121 and integrated191 test bytes exact',buffers['runtime_adapter_checks.py']==old['runtime_adapter_checks.py'] and buffers['integration04_checks.py']==old['integration04_checks.py'])
oldpure=old['pure_checks.py'].decode();newpure=buffers['pure_checks.py'].decode()
check('only necessary RuntimeError loader denial catch',newpure==oldpure.replace('CONTROL[\'Hold\'], AssertionError, TypeError','CONTROL[\'Hold\'], AssertionError, RuntimeError, TypeError'))
check('direct104 test bytes exact',buffers['boundary03_checks.py']==old['boundary03_checks.py'])
# Precisely bounded actual adapter delta; all other existing functions retain AST.
def function_asts(raw):
 tree=ast.parse(raw);out={}
 for node in tree.body:
  if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):out[node.name]=ast.dump(node,include_attributes=False)
  elif isinstance(node,ast.ClassDef):
   for f in node.body:
    if isinstance(f,(ast.FunctionDef,ast.AsyncFunctionDef)):out[node.name+'.'+f.name]=ast.dump(f,include_attributes=False)
 return out
adold=function_asts(old['public_observation_unit.py']);adnew=function_asts(buffers['public_observation_unit.py'])
check('adapter function membership unchanged',set(adold)==set(adnew))
for n in adnew:
 if n!='Effects.stop_relay':check('literal unchanged adapter AST '+n,adnew[n]==adold[n])
relold=function_asts(old['public_relay.py']);relnew=function_asts(buffers['public_relay.py'])
check('relay only new refresh function',set(relnew)-set(relold)=={'Relay.refresh_closure'})
for n in relold:
 if n not in ('Relay.__init__','Relay.stop'):check('literal unchanged relay AST '+n,relnew[n]==relold[n])
impl=json.loads(buffers['runtime-implementation-map.json'])
check('99 sites15classes18callbacks9modes',len(impl['reachedInterpretationSites'])==99 and len(impl['inputClasses'])==15 and len(impl['requiredCallbacks'])==18 and len(impl['cli'])==9)
trees={n:ast.parse(buffers[n]) for n in ('public_observation_unit.py','public_relay.py','unit_policy.py','public_contract.py','entry-loader.py.txt')}
for name,row in impl['functions'].items():
 fname,qual=name.split(':',1);parts=qual.split('.');nodes=trees[fname].body
 for part in parts:
  node=next(n for n in nodes if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==part);nodes=getattr(node,'body',[])
 check('function span '+name,node.lineno==row['line'] and node.end_lineno==row['endLine'])
for i,row in enumerate(impl['reachedInterpretationSites']):
 check('consumed interpretation site '+str(i),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['callee'] for n in ast.walk(trees[row['file']])))
for name,row in impl['requiredCallbacks'].items():
 check('callback span '+name,any(isinstance(n,ast.FunctionDef) and n.name==name and n.lineno==row['line'] and n.end_lineno==row['endLine'] for n in ast.walk(trees[row['file']])))
guard=buffers['guard-public-observe.bash'].decode();loader=buffers['entry-loader.py.txt'].decode()
check('guard common loader exact',guard.split("readonly C8_PUBLIC_CONTROL_LOADER='\n",1)[1].split("\n'\nexit()",1)[0]+'\n'==loader)
check('outer loader no assert',not any(isinstance(n,ast.Assert) for n in ast.walk(trees['entry-loader.py.txt'])))
install=json.loads(buffers['runtime-install-map.json'])
for row in install['members']:check('install pin '+row['source'],sha(buffers[row['source']])==row['sha256'] and row['runtimeMode']==0o600)
check('install common loader raw SHA',install['commonAdapterLoader']['sha256']==sha(buffers['entry-loader.py.txt']))
for n in ('RECIPE.md','RUNTIME-RECIPE.md'):
 text=buffers[n].decode();check('active current binding '+n,'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35' not in text and 'entry-NNNN-pins.json' in text)
check('exact candidate digest in source recipe','3a6fddda4946106f143783640746464cf2c775256f2340b9d24d1a4701adadbd' in buffers['RECIPE.md'].decode())
for i,count in ((1,79),(2,104),(3,191)):
 stdout=(O/f'suite-{i}.stdout').read_text().splitlines();first,last=json.loads(stdout[0]),json.loads(stdout[-1])
 check('actual guarded replay '+str(i),first['passed']==count and first['failed']==0 and last['executedChecks']==count and last['result']['failed']==0)
 check('empty suite stderr '+str(i),(O/f'suite-{i}.stderr').read_bytes()==b'')
# Once all public source reads complete, retain a deny audit through fake test and output.
denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args
  path=Path(name).absolute() if not isinstance(name,int) else None
  writing=(isinstance(mode,str) and any(x in mode for x in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if path is None or not writing or not (path==O or O in path.parents):denied.append(event);raise AssertionError('FORBIDDEN_OPEN')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn','ctypes.dlopen')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('FORBIDDEN_BOUNDARY')
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
loadercases=[];payload=b'NEVER_EXECUTE_SYNTHETIC_ADAPTER\n';good=sha(payload)
for opt in (0,1):
 for mode in impl['cli']:
  for correct in (True,False):
   api=FakeOS(payload);calls=[];status=['1'] if mode in ('held-proof','gate') else []
   if not correct:status=['unexpected'] if mode in ('held-proof','gate') else ['1']
   before=['-c','/owned/control/public_observation_unit.py',good,mode,'a'*64,'entry-0001-pins.json','b'*64,*status]
   fsys=types.SimpleNamespace(argv=list(before));mods={'os':api,'stat':stat,'sys':fsys,'hashlib':hashlib}
   def imp(name,*args,**kwargs):
    if name not in mods:raise AssertionError('UNEXPECTED_IMPORT')
    return mods[name]
   def capture(raw,path,kind):calls.append((raw,path,kind));return object()
   def prevent(code,scope):calls.append(('INTERCEPTED_EXEC',))
   safe=dict(vars(builtins),__import__=imp,compile=capture,exec=prevent)
   try:builtins.exec(builtins.compile(loader,'<source05-all-modes-fake-loader>','exec',optimize=opt),{'__builtins__':safe})
   except (RuntimeError,ValueError):accepted=False
   else:accepted=True
   check('all mode optimized argument barrier '+str((opt,mode,correct)),accepted==correct and bool(calls)==correct and api.closed==list(range(api.nextfd,0,-1)))
   if correct:check('all mode forwarded argv same raw '+str((opt,mode)),fsys.argv==before[1:2]+before[3:] and calls[0][0]==payload)
   loadercases.append({'optimization':opt,'mode':mode,'validStatusVector':correct,'accepted':accepted,'adapterExecutionIntercepted':True})
# Actual canonical closure function, with fake resource references/outcomes/thread observations.
relayclass=next(n for n in trees['public_relay.py'].body if isinstance(n,ast.ClassDef) and n.name=='Relay')
refresh=next(n for n in relayclass.body if isinstance(n,ast.FunctionDef) and n.name=='refresh_closure')
ns={};exec(compile(ast.Module(body=[refresh],type_ignores=[]),'<actual refresh_closure fake resources>','exec'),ns)
closurecases=[]
for missing in (None,'connection','listener','selector','short','parent','live-thread','unknown-thread','join-unconfirmed'):
 def observed():
  if missing=='unknown-thread':raise OSError('SYNTHETIC_UNKNOWN')
  return missing=='live-thread'
 owned=types.SimpleNamespace(thread=types.SimpleNamespace(is_alive=observed),join_confirmed=missing!='join-unconfirmed',result={'threadTerminated':True,'descriptorsClosed':True,'qualified':False,'failure':True},close_outcomes={n:n!=missing for n in ('connection','listener','selector','short','parent')},short_identity=None,node=None,fd_identities={})
 for n in ('connection','listener','selector','short','parent'):setattr(owned,n,object())
 actual=ns['refresh_closure'](owned)
 check('actual closure every acquired resource '+str(missing),actual['descriptorsClosed']==(missing is None) and owned.result==actual and actual['failure'] is True and actual['qualified'] is False)
 closurecases.append({'missingProof':missing,'completeClosure':actual['descriptorsClosed'],'failurePreserved':actual['failure']})
check('no forbidden boundary reached',not denied)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(mraw),'pins':list(pins.values()),'actualProtectedBaselinePrivateRuntimeActions':0},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'count':len(checks),'checks':checks,'guardedReplayedControls':374,'reusedPriorLiteralSemanticControls':432,'totalSourceControlCoverage':806,'independentAllModeLoaderCases':loadercases,'independentFiveResourceClosureCases':closurecases,'realBoundaryCalls':denied,'actualActions':0,'singleReadyYieldAndClientLimitation':'Instrumented cooperative composition; not unchanged complete serve, real thread or cross-process qualification.'},indent=2)+'\n')
print(json.dumps({'independentSourceChecks':len(checks),'guardedReplayControls':374,'reusedPriorControls':432,'loaderCases':len(loadercases),'closureCases':len(closurecases),'actualActions':0}))

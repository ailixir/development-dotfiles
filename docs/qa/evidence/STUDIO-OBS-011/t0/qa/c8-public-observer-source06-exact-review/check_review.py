"""Independent source06 seals/maps, all-mode optimized loader, five-resource closure checks.

Only named prepared/public source is read. After pin collection, subject effects are
confined to fake namespaces and a persistent audit denies real boundary fallthrough.
"""
from pathlib import Path
import ast,builtins,copy,difflib,hashlib,json,os,stat,sys,types
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume6').absolute()
P=D.parent/'resume5';O=Path(__file__).absolute().parent
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
mraw=pin(D/'manifest.json','b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1');m=json.loads(mraw)
for row in m['files']:buffers[row['path']]=pin(D/row['path'],row['sha256'],row['mode'],row['bytes'])
check('exact212members no extra',len(buffers)==212 and {p.name for p in D.iterdir()}==set(buffers)|{'manifest.json'})
for n in ('SHA256SUMS','RUNTIME-SHA256SUMS'):
 for line in buffers[n].decode().splitlines():
  digest,name=line.split('  ',1);check(n+' '+name,sha(buffers[name])==digest)
prepared=json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']
check('223 prepared pins',len(prepared)==223)
for row in prepared:pin(row['path'],row['sha256'],row['mode'],row['bytes'])
pmraw=pin(P/'manifest.json','4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f');pm=json.loads(pmraw);old={}
for row in pm['files']:old[row['path']]=pin(P/row['path'],row['sha256'],row['mode'],row['bytes'])
check('177 old members intact',len(old)==177)
for directory,h in [('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/c8-public-observer-source05-exact-review','36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67'),('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-observer-source05-exact-review','c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92')]:
 prior=Path(directory);v=json.loads(pin(prior/'manifest.json',h))
 for row in v.get('files',v.get('members')):pin(prior/row['path'],row['sha256'],row['mode'],row['bytes'])
for n in ('Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_contract.py','unit_policy.py','launch-control.template.json','public-observation.schema.json'):
 check('literal prior mechanism '+n,buffers[n]==old[n])
a=json.loads(buffers['public-policy.json']);b=json.loads(old['public-policy.json']);b['sourceGeneration']=6
check('policy only active generation metadata change',a==b)
for n in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json','targeted05-check-results.json'):
 current=json.loads(buffers[n]);previous=json.loads(old[n]);check('exact806 retained identity '+n,[x['name'] for x in current['checks']]==[x['name'] for x in previous['checks']] and current['failed']==0)
check('pure311 test bytes exact',buffers['pure_checks.py']==old['pure_checks.py'])
check('integration191 test bytes exact',buffers['integration04_checks.py']==old['integration04_checks.py'])
def test_predicates(raw):
 tree=ast.parse(raw)
 return [ast.dump(n,include_attributes=False) for n in ast.walk(tree) if isinstance(n,ast.Assert) or isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in ('check','denied')]
for n in ('runtime_adapter_checks.py','boundary03_checks.py','targeted05_checks.py'):
 check('retained check predicates exact '+n,test_predicates(buffers[n])==test_predicates(old[n]))
def function_asts(raw):
 tree=ast.parse(raw);out={}
 for node in tree.body:
  if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):out[node.name]=ast.dump(node,include_attributes=False)
  elif isinstance(node,ast.ClassDef):
   for f in node.body:
    if isinstance(f,(ast.FunctionDef,ast.AsyncFunctionDef)):out[node.name+'.'+f.name]=ast.dump(f,include_attributes=False)
 return out
adold=function_asts(old['public_observation_unit.py']);adnew=function_asts(buffers['public_observation_unit.py'])
allowed={'Custody.__init__','Custody.read','Custody.create_fd','Custody.write','Custody.replace_exact','Custody.close','System.custody','System.sink','System.lock_free','Effects.__init__','Effects.release_custody','Effects.start_relay','load','main'}
check('exact14 changed adapter methods',{n for n in adold if adold[n]!=adnew[n]}==allowed)
new={'Custody.close_fd','Custody.open_fd','Custody.token','Ownership.__init__','Ownership.acquire','Ownership.blockers','Ownership.close','Ownership.finish','Ownership.owner','Ownership.retain','Ownership.summary','Ownership.transfer','Ownership.view','System.__init__'}
check('exact14 new ownership functions',set(adnew)-set(adold)==new and not set(adold)-set(adnew))
for n in adold:
 if n not in allowed:check('literal unchanged adapter AST '+n,adnew[n]==adold[n])
relold=function_asts(old['public_relay.py']);relnew=function_asts(buffers['public_relay.py'])
check('relay only two changed functions',set(relnew)==set(relold) and {n for n in relold if relold[n]!=relnew[n]}=={'Relay.__init__','Relay.refresh_closure'})
for n in relold:
 if n not in ('Relay.__init__','Relay.refresh_closure'):check('literal unchanged relay AST '+n,relnew[n]==relold[n])
coverage=json.loads(buffers['proof-coverage06.json'])
check('coverage501current420reuse115new',coverage['currentExecuted']==501 and coverage['reusedPrior']==420 and coverage['retainedIds']==806 and coverage['newChecks']==115 and coverage['totalSourceCoverage']==921)
subset=json.loads(buffers['retained06-affected-results.json']);all121=json.loads(buffers['runtime-adapter-check-results.json'])
check('exact12 retained subset no new IDs',len(subset['checks'])==12 and len({x['name'] for x in subset['checks']})==12 and {x['name'] for x in subset['checks']}<={x['name'] for x in all121['checks']})
check('remaining420 historical exact results',buffers['pure-check-results.json']==old['pure-check-results.json'] and buffers['runtime-adapter-check-results.json']==old['runtime-adapter-check-results.json'] and 311+121-12==420)
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
for i,count in ((1,79),(2,104),(3,191),(4,55),(5,60),(6,12)):
 stdout=(O/f'suite-{i}.stdout').read_text().splitlines();first,last=json.loads(stdout[0]),json.loads(stdout[-1])
 check('actual guarded replay '+str(i),last['executedChecks']==count and last['result'].get('failed',0)==0)
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
   try:builtins.exec(builtins.compile(loader,'<source06-all-modes-fake-loader>','exec',optimize=opt),{'__builtins__':safe})
   except (RuntimeError,ValueError):accepted=False
   else:accepted=True
   check('all mode optimized argument barrier '+str((opt,mode,correct)),accepted==correct and bool(calls)==correct and api.closed==list(range(api.nextfd,0,-1)))
   if correct:check('all mode forwarded argv same raw '+str((opt,mode)),fsys.argv==before[1:2]+before[3:] and calls[0][0]==payload)
   loadercases.append({'optimization':opt,'mode':mode,'validStatusVector':correct,'accepted':accepted,'adapterExecutionIntercepted':True})
# Actual token state and borrowed-directory invariants, no actual FD or closer.
ownerclass=next(n for n in trees['public_observation_unit.py'].body if isinstance(n,ast.ClassDef) and n.name=='Ownership')
needfn=next(n for n in trees['public_observation_unit.py'].body if isinstance(n,ast.FunctionDef) and n.name=='need')
ns={'RETAINED_OWNERSHIP':[],'Hold':type('Hold',(Exception,),{})};exec(compile(ast.Module(body=[needfn,ownerclass],type_ignores=[]),'<actual ownership source fake resources>','exec'),ns)
closurecases=[]
for kind,state,initialized,exempt,clear in [('DIRECTORY','OPEN',True,True,True),('DIRECTORY','OPEN',False,True,False),('DIRECTORY','OPEN',True,False,False),('FILE','OPEN',True,True,False),('DIRECTORY','TRANSFERRED',True,True,False),('DIRECTORY','UNKNOWN',True,True,False),('FILE','UNKNOWN',True,True,False),('FILE','CLOSED',True,False,True)]:
 ledger=ns['Ownership']();owner=types.SimpleNamespace(initialized=initialized);ledger.owner(owner);token=ledger.acquire(owner,7,lambda fd:None,kind);token['state']=state
 view=ledger.view(owner) if exempt else ledger.view()
 check('only validated caller DIRECTORY OPEN borrowed '+str((kind,state,initialized,exempt)),view.clear() is clear)
 closurecases.append({'kind':kind,'state':state,'initialized':initialized,'callerBorrowed':exempt,'clear':view.clear()})
for failed in (False,True):
 ledger=ns['Ownership']();owner=object();ledger.owner(owner);calls=[]
 def closer(fd):
  calls.append(fd)
  if failed:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
 token=ledger.acquire(owner,9,closer,'FILE')
 try:ledger.close(token)
 except OSError:pass
 try:ledger.close(token)
 except ns['Hold']:pass
 check('confirmed idempotent / unknown never reclosed '+str(failed),calls==[9] and token['state']==('UNKNOWN' if failed else 'CLOSED') and bool(ledger.blockers()) is failed)
 if failed:check('actual failed token owner strongly retained',any(x is ledger for x in ns['RETAINED_OWNERSHIP']) and ledger.owners[0] is owner)
# Explicit transferred handle and closer must remain owned until confirmed close.
ledger=ns['Ownership']();owner=object();handle=object();calls=[];token=ledger.acquire(owner,11,lambda fd:None,'FILE');ledger.transfer(token,handle,lambda fd:calls.append(fd))
check('actual transferred handle retained',token['state']=='TRANSFERRED' and token['handle'] is handle and ledger.blockers()==[token])
ledger.close(token);check('actual transferred closer confirmed',calls==[11] and token['state']=='CLOSED' and ledger.blockers()==[])
check('no forbidden boundary reached',not denied)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(mraw),'pins':list(pins.values()),'actualProtectedBaselinePrivateRuntimeActions':0},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'count':len(checks),'checks':checks,'guardedReplayedControls':501,'reusedPriorLiteralSemanticControls':420,'totalSourceControlCoverage':921,'independentAllModeLoaderCases':loadercases,'independentBorrowStateCases':closurecases,'realBoundaryCalls':denied,'actualActions':0,'singleReadyYieldAndClientLimitation':'Instrumented cooperative composition; not unchanged complete serve, real thread or cross-process qualification.'},indent=2)+'\n')
print(json.dumps({'independentSourceChecks':len(checks),'guardedReplayControls':501,'reusedPriorControls':420,'loaderCases':len(loadercases),'borrowStateCases':len(closurecases),'actualActions':0}))

"""Exact04 static closure plus bounded actual bootstrap/custody counterexamples.
No author727 replay, generator, real adapter main, OS/process/thread/socket action.
"""
import ast,builtins,copy,hashlib,json,pathlib,re,stat,sys,types
if not __debug__:raise RuntimeError('REVIEWER_REQUIRES_NONOPTIMIZED_ASSERTIONS')
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'early/c8-check01-public-evidence-prep/resume4';P=D.parent/'resume3'
Q=T/'qa/c8-public-observer-source04-exact-review';O=pathlib.Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest();pins=[];checks=[];buffers={}
def check(name,ok):assert ok,name;checks.append({'case':name,'passed':True})
def pin(path,expected=None,mode=None,size=None):
 path=path.absolute()
 raw=path.read_bytes();h=sha(raw)
 if expected:check('sha:'+str(path.relative_to(R)),h==expected)
 if mode is not None:check('mode:'+str(path.relative_to(R)),stat.S_IMODE(path.stat().st_mode)==mode)
 if size is not None:check('bytes:'+str(path.relative_to(R)),len(raw)==size)
 pins.append({'path':str(path.relative_to(R)),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)});return raw
mb=pin(D/'manifest.json','8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310');m=json.loads(mb)
for row in m['files']:buffers[row['path']]=pin(D/row['path'],row['sha256'],row['mode'],row['bytes'])
check('all149',len(buffers)==149)
qb=pin(Q/'manifest.json','4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29');qm=json.loads(qb);qbuffers={}
for row in qm['files']:qbuffers[row['path']]=pin(Q/row['path'],row['sha256'],row['mode'],row['bytes'])
qchecks=json.loads(qbuffers['checks.json']);check('reuse-sealed727-and1298',qchecks['guardedAuthorChecks']==727 and qchecks['count']==1298 and qchecks['allExpected'] is True)
for i,count in [(1,311),(2,121),(3,104),(4,191)]:
 lines=qbuffers['suite-'+str(i)+'.stdout'].decode().splitlines();check('sealed-suite:'+str(i),json.loads(lines[0])['passed']==count and json.loads(lines[-1])['executedChecks']==count)
oldb=pin(P/'manifest.json','53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad');old=json.loads(oldb)
for row in old['files']:pin(P/row['path'],row['sha256'],row['mode'],row['bytes'])
for name in ['Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','public_relay.py','public_contract.py','unit_policy.py']:
 check('literal03:'+name,buffers[name]==(P/name).read_bytes())
for name,count in [('pure-check-results.json',311),('runtime-adapter-check-results.json',121),('boundary03-check-results.json',104)]:
 current=json.loads(buffers[name]);prior=json.loads((P/name).read_bytes());check('exact-retained-semantic-ids:'+name,[r['name'] for r in current['checks']]==[r['name'] for r in prior['checks']] and current['passed']==count)
for row in json.loads(buffers['runtime-input-pins.json'])['verifiedPreparedInputs']:
 path=pathlib.Path(row['path']);assert '/runtime/' not in str(path) and not str(path).endswith('preexisting-baseline.json')
 pin(path,row['sha256'],row['mode'],row['bytes'])
for rel,expected in [('resume-architecture/resume2/c8-public-observer-source03-exact-review','8001f78e8f9331e25281d55f2f1f1919adb0b2806bf854afce7700630d8eacf5'),('qa/c8-public-observer-source03-exact-review','c4513a286a638a6704f463035231b8a0c31e0df008f160b3842c0fef3f236d07'),('resume-architecture/resume2/c8-public-observer-java-boundary-design','d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e')]:
 p=T/rel;v=json.loads(pin(p/'manifest.json',expected))
 for row in v['files']:pin(p/row['path'],row['sha256'],row.get('mode'),row.get('bytes'))
pin(T/'resume2-c8-public-observer-source03-findings-root-adoption.json','7ed9ca437b970e0cc9769b8674f28ba4cefc1e5eb3fcc436c7f476336038c357')
impl=json.loads(buffers['runtime-implementation-map.json']);check('99-sites15classes18callbacks9modes',len(impl['reachedInterpretationSites'])==99 and len(impl['inputClasses'])==15 and len(impl['requiredCallbacks'])==18 and len(impl['cli'])==9)
loader=buffers['entry-loader.py.txt'].decode();guard=buffers['guard-public-observe.bash'].decode();check('literal common loader',guard.split("readonly C8_PUBLIC_CONTROL_LOADER='",1)[1].split("'\nexit()",1)[0].strip()==loader.strip())
for name in ['RECIPE.md','RUNTIME-RECIPE.md']:
 text=buffers[name].decode();check('active04-digest-api:'+name,'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35' not in text and 'entry-NNNN-pins.json' in text and '-B -c' in text)
# Independently reconstruct only the declared one-yield scheduling delta.
tree=ast.parse(buffers['public_relay.py']);relayclass=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Relay');serve=next(n for n in relayclass.body if isinstance(n,ast.FunctionDef) and n.name=='serve');original=copy.deepcopy(serve)
at=next(i for i,n in enumerate(serve.body[0].body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and ast.unparse(n.value.func)=='self.ready.set')
serve.body[0].body.insert(at+1,ast.Expr(value=ast.Yield(value=ast.Constant('READY_SCHEDULE_POINT'))));del serve.body[0].body[at+1]
check('single-yield-reconstruction-no-original-statement-delta',ast.dump(serve,include_attributes=False)==ast.dump(original,include_attributes=False))
integration=ast.parse(buffers['integration04_checks.py']);runwhole=next(n for n in integration.body if isinstance(n,ast.FunctionDef) and n.name=='run_whole');check('one registered synthetic client disclosed','one registered synthetic client' in buffers['SOURCE04-DECISIONS.md'].decode().lower())
# From this point every exercised boundary is fake. No actual source imports or mains.
blocked=[];guarded=True
def audit(event,args):
 if not guarded:return
 if event=='open' or event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')) or event in ('fcntl.flock','fcntl.lockf'):
  blocked.append(event);raise AssertionError('REAL_BOUNDARY_DENIED:'+event)
sys.addaudithook(audit)
class FakeOS:
 O_RDONLY=0;O_DIRECTORY=1;O_NOFOLLOW=2
 def __init__(self,raw):self.raw=raw;self.nextfd=0;self.reads={};self.closed=[]
 def open(self,*a,**kw):self.nextfd+=1;self.reads[self.nextfd]=0;return self.nextfd
 def fstat(self,fd):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_uid=501,st_size=len(self.raw),st_dev=1,st_ino=7,st_mtime_ns=10,st_ctime_ns=11)
 def read(self,fd,n):at=self.reads[fd];piece=self.raw[at:at+n];self.reads[fd]+=len(piece);return piece
 def close(self,fd):self.closed.append(fd)
 def getuid(self):return 501
loadercases=[];payload=b'pass\n';good=sha(payload)
for opt,expected in [(0,good),(0,'0'*64),(1,good),(1,'0'*64)]:
 api=FakeOS(payload);calls=[];fsys=types.SimpleNamespace(argv=['-c','/owned/control/public_observation_unit.py',expected,'selected','a'*64,'entry-0001-pins.json','b'*64]);mods={'os':api,'stat':stat,'sys':fsys,'hashlib':hashlib}
 def fakeimport(n,*a,**kw):assert n in mods;return mods[n]
 def interceptcompile(raw,name,mode):calls.append({'rawSha256':sha(raw),'expectedMatches':expected==sha(raw)});return builtins.compile(raw,name,mode)
 def preventexec(code,ns):calls[-1]['requestedExecIntercepted']=True
 ns={'__builtins__':dict(vars(builtins),__import__=fakeimport,compile=interceptcompile,exec=preventexec)}
 try:builtins.exec(builtins.compile(loader,'<actual-loader-fake-boundaries>','exec',optimize=opt),ns)
 except AssertionError:accepted=False
 else:accepted=True
 check('actual-loader:'+str((opt,expected==good)),accepted==(opt==1 or expected==good))
 loadercases.append({'optimize':opt,'expectedMatches':expected==good,'accepted':accepted,'adapterCompileReached':bool(calls),'requestedExecutionIntercepted':True})
# Use the actual Relay.start/stop/check_custody and actual Effects.stop_relay,
# release_custody and main. Native/thread execution is replaced completely.
rns={'json':json,'stat':stat,'re':re};rt=ast.parse(buffers['public_relay.py']);rnodes=[n for n in rt.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and getattr(n,'name','')!='Boundary' or isinstance(n,ast.Assign) and all(isinstance(x,ast.Name) and x.id in {'SHORT','ENDPOINT','CONTROL_FIELDS','LIMITS'} for x in n.targets)]
builtins.exec(builtins.compile(ast.Module(body=rnodes,type_ignores=[]),'<actual-relay-definitions-no-effects>','exec'),rns)
class FakePath(pathlib.PurePosixPath):
 def absolute(self):return self
ans={'Path':FakePath,'ROOT':FakePath('/R'),'CONTROL':FakePath('/R/UNIT/control'),'__file__':'/R/UNIT/control/public_observation_unit.py','sys':types.SimpleNamespace(),'re':re,'hashlib':hashlib,'RETAINED_EFFECTS':[],'PHASES':('selected',),'ENTRY_NAME':re.compile(r'entry-[0-9]{4}-pins\.json')}
atree=ast.parse(buffers['public_observation_unit.py']);acls=next(n for n in atree.body if isinstance(n,ast.ClassDef) and n.name=='Effects');selected=[n for n in acls.body if isinstance(n,ast.FunctionDef) and n.name in {'stop_relay','release_custody'}]
top=[n for n in atree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and getattr(n,'name','') in {'Hold','need','sha','hash_value','main'}]
builtins.exec(builtins.compile(ast.Module(body=top+selected,type_ignores=[]),'<actual-adapter-targeted-definitions>','exec'),ans)
class Event:
 def __init__(self):self.value=False
 def set(self):self.value=True
 def is_set(self):return self.value
 def wait(self,n):return True
class Custody:
 def __init__(self,tag,key):self.tag=tag;self.chain=[(None,'/',1,key)];self.closed=False;self.nodes={}
 def check(self):pass
 def absent(self,n):return n not in self.nodes
 def info(self,n):return self.nodes[n]
 def members(self):return list(self.nodes)
 def close(self):self.closed=True
class FakeEffects:
 stop_relay=ans['stop_relay'];release_custody=ans['release_custody']
 def __init__(self,relay,output):self.relay=relay;self.c=Custody('control',(1,1,1,501));self.unit=output;self.gaps={};self.client={'pid':500,'start':'FAKE_START','identityComplete':True};self.a={'releaseSha256':'a'*64};self.registration_complete=True;self.custody_retained=False;self.records=[]
 def write_once(self,n,v):self.records.append((n,copy.deepcopy(v)))
 def register(self,mode):pass
custodycases=[]
for case in ['joined-closed','parent-chain-rejected','parent-close-failed','live-thread']:
 key=(1,7,stat.S_IFDIR|0o700,501);output=Custody('output',key);parent=Custody('parent',key);short=Custody('short',key)
 root={'outputChain':[list(key)],'shortParentChain':[list(key)],'ownerUid':501,'createShortExactly0700':True}
 if case=='parent-chain-rejected':root['shortParentChain']=[[9,9,stat.S_IFDIR|0o700,501]]
 class Boundary:
  def event(self):return Event()
  def uid(self):return 501
  def mkdir_at(self,c,n):c.nodes[n]=types.SimpleNamespace(st_dev=1,st_ino=7,st_mode=stat.S_IFDIR|0o700,st_uid=501)
  def thread(self,callback):
   class Thread:
    def start(self):relay.result['ready']=True
    def join(self,n):pass
    def is_alive(self):return case=='live-thread'
   return Thread()
 control=dict(schemaVersion=1,protocolVersion=2,unit='u',**{'class':'c','method':'m'},amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath=rns['ENDPOINT'],enrollmentNonce='a'*64,**rns['LIMITS'])
 contract=types.SimpleNamespace(CONSTANTS={'unit':'u','class':'c','method':'m'})
 relay=rns['Relay'](Boundary(),lambda p,mode=None:parent if p=='/private/tmp' else short,output,control,'b'*64,{},contract,sha,lambda raw:{},lambda pid:{},root)
 e=FakeEffects(relay,output);e.sys=types.SimpleNamespace(stdin_devnull=lambda:True,cwd=lambda:'/R')
 if case=='parent-close-failed':
  def failclose():raise OSError('SYNTHETIC_CLOSE_FAILURE')
  parent.close=failclose
 def operate(effects,mode,arg):
  try:relay.start()
  except rns['RelayHold']:pass
  effects.stop_relay();return 1
 ans['load']=lambda *a:e;ans['operate']=operate
 try:status=ans['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys);mainHold=False
 except ans['Hold']:status=1;mainHold=True
 receipt=next(v for n,v in e.records if n=='relay-drain.json')['receipt']
 observed={'case':case,'status':status,'mainUnresolvedHold':mainHold,'outputClosed':e.unit.closed,'controlClosed':e.c.closed,'parentClosed':parent.closed,'shortClosed':short.closed,'strongEffectsRetained':any(x is e for x in ans['RETAINED_EFFECTS']),'actualRelayFlags':{'threadTerminated':relay.result['threadTerminated'],'descriptorsClosed':relay.result['descriptorsClosed']},'publishedDrainFlags':{'threadTerminated':receipt['threadTerminated'],'descriptorsClosed':receipt['descriptorsClosed']},'realBoundaryCalls':0,'realThreadOrServeExecuted':False}
 if case=='parent-chain-rejected':
  check('actual-check-custody-failure-causes-unconfirmed-parent-early-discharge',observed['outputClosed'] and observed['controlClosed'] and not observed['parentClosed'] and not observed['strongEffectsRetained'] and observed['actualRelayFlags']['descriptorsClosed'] and observed['publishedDrainFlags']['threadTerminated'] is False)
 elif case=='joined-closed':check('actual-joined-closed-positive',observed['outputClosed'] and observed['controlClosed'] and observed['parentClosed'] and observed['shortClosed'])
 else:check('actual-unresolved-negative:'+case,observed['mainUnresolvedHold'] and not observed['outputClosed'] and not observed['controlClosed'] and observed['strongEffectsRetained'])
 custodycases.append(observed)
check('zero actual boundary fallthrough',not blocked)
guarded=False
report={'subjectManifestSha256':sha(mb),'sourceChecks':checks,'sourceCheckCount':len(checks),'reusedIndependentQaManifestSha256':sha(qb),'reusedQaControls':727,'reusedQaSourceChecks':1298,'author727ReplayedByAria':False,'targetedLoaderCases':loadercases,'targetedCustodyCases':custodycases,'newCustodyCounterexample':True,'knownBootstrapCounterexampleConfirmed':True,'allExercisedOperationalBoundariesFaked':True,'deniedActualCalls':blocked,'actualRuntimeJavaNativeThreadSocketKernelBaselinePrivateActions':0}
(O/'checks.json').write_text(json.dumps(report,indent=2)+'\n');(O/'pins.json').write_text(json.dumps({'pins':pins,'count':len(pins),'sourceOnly':True,'actualRuntimeOrProtectedBodyAccess':False},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'reusedQaControls':727,'targetedLoaderCases':len(loadercases),'targetedCustodyCases':len(custodycases),'knownBootstrapDefect':True,'additionalCustodyDefect':True,'actualActions':0}))

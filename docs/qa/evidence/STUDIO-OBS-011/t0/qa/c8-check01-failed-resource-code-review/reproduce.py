"""Review-only AST and synthetic boundary checks; never imports/runs adapter/main."""
import ast,copy,hashlib,json,pathlib,stat,types,errno,io
from pathlib import PurePosixPath
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume1')
O=pathlib.Path(__file__).parent
R=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01')
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
pins=[];results=[]
def record(name,details):results.append({'check':name,**details})
assert sha(D/'manifest.json')=='1ab827247a9329cbadcea077595e57802cf8230ad77f5eaf11e8e223c17a7573'
for item in read(D/'manifest.json')['files']:
 p=D/item['path'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==item['sha256'] and len(b)==item['bytes'] and stat.S_IMODE(p.stat().st_mode)==item['mode'];pins.append({'path':str(p),'sha256':item['sha256'],'bytes':len(b),'mode':item['mode']})
pred={};exec(compile(ast.parse((D/'predicates.py').read_text()),'<inspected pure predicates>','exec'),pred)
test_tree=ast.parse((D/'pure_checks.py').read_text())
# Only remove the preparation-directory output write and import of the same
# already-inspected pure definitions. All synthetic tests remain intact.
test_tree.body=[n for n in test_tree.body if not isinstance(n,ast.With) and not (isinstance(n,ast.ImportFrom) and n.module=='predicates')]
ns={**pred,'__file__':str(D/'pure_checks.py')}
exec(compile(test_tree,'<inspected synthetic suite; output write removed>','exec'),ns)
record('sealed pure suite',{'passed':len(ns['checks']),'expected':97,'outputWriteRemoved':True})
tree=ast.parse((D/'failed_resource.py').read_text())
def extract(names,scope):
 nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual adapter functions, synthetic boundaries>','exec'),scope)
 return scope

# Concrete exact current package metadata; no helper/runtime execution.
release=read(R/'root-actual-unit-release.json')
for group,directory in [('executionPackagePins','execution'),('controlPackagePins','control')]:
 actual={directory+'/'+p.name for p in (R/directory).iterdir() if p.suffix in ('.py','.json') and p.name!='manifest.json'}
 expected=set(release[group]);record('package membership '+directory,{'accepts':actual==expected,'expected':len(expected),'actual':len(actual),'missing':sorted(expected-actual),'extra':sorted(actual-expected)})

# write_new actual implementation, fake directory replacement at the write.
class P:
 def __init__(self,s):self.s=str(s)
 def __truediv__(self,s):return P(self.s+'/'+s)
 def __str__(self):return self.s
 def __eq__(self,o):return isinstance(o,P) and self.s==o.s
 def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700)
 def exists(self):return False
 def is_symlink(self):return False
class Sink(io.BytesIO):
 def __exit__(self,*args):return False
 def fileno(self):return 7
for switched in [False,True]:
 calls=[];sink=Sink()
 def fakeopen(path,flags,mode):
  calls.append({'requested':str(path),'resolved':('/other-owned-target/'+str(path).split('/')[-1]) if switched else str(path),'dir_fd_retained':False});return 7
 fakeos=types.SimpleNamespace(open=fakeopen,fdopen=lambda *a: sink,fsync=lambda *a:None,O_WRONLY=1,O_CREAT=2,O_EXCL=4,O_NOFOLLOW=8)
 s=extract({'write_new'},{**pred,'HERE':P('/repo/unit/failed-resource-disposition01'),'UNIT':P('/repo/unit'),'os':fakeos,'json':json})
 s['write_new']('readiness.json',{'fake':True})
 record('write parent substitution' if switched else 'write unchanged parent',{'accepted':True,'calls':calls,'bytesWritten':len(sink.getvalue())})

# Actual observer function with all observations supplied by fakes. The paired
# unknown child and empty second census must HOLD but are accepted in this packet.
controller_rows={10:{'pid':10,'start':'wrapper','argvHash':'W','ppid':1},11:{'pid':11,'start':'shell','argvHash':'S','ppid':10},12:{'pid':12,'start':'client','argvHash':'C','ppid':11}}
pin={'wrapperPid':10,'wrapperStart':'wrapper','wrapperArgvSha256':'W','shellPid':11,'shellStart':'shell','shellArgvSha256':'S','lockDevInode':[1,2]}
owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
class Lock(P):
 def with_name(self,n):return self
 def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
class Unit(P):
 def __truediv__(self,s):return Unit(self.s+'/'+s)
for variant in ['clean','unbound child','unbound child listener','empty second census']:
 rows=copy.deepcopy(controller_rows)
 if variant.startswith('unbound child'):rows[13]={'pid':13,'ppid':12,'start':'unknown-child','argvHash':'unrelated'}
 sequence=[rows,{} if variant=='empty second census' else rows,controller_rows]
 def table():return sequence.pop(0)
 boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[{'pid':13,'port':8080}] if variant=='unbound child listener' else []}
 scope={'table':table,'boundary_inventory':lambda plan:boundary,'capture':lambda argv:'p10\ni2\n'}
 old=types.SimpleNamespace(WRAPPER=Lock('/lock/gradle-lock.py'),observe_source=lambda *args:pred['SOURCE'])
 def fake_read(path,*a):
  if str(path).endswith('owned-full-check/receipt.json'):return {'ownedIdentities':owned}
  if str(path).endswith('root-live-phase-lineage-01-limited.json'):return {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}}
  raise AssertionError('unexpected fake input')
 def flock(fd,flags):
  if flags==3:raise OSError(errno.EAGAIN,'held')
 fakeos=types.SimpleNamespace(getpid=lambda:12,getppid=lambda:11,open=lambda *a:7,close=lambda *a:None,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),O_RDONLY=0,O_NOFOLLOW=1)
 s=extract({'observe'},{**pred,'UNIT':Unit('/unit'),'Path':lambda x:x,'read':fake_read,'helpers':lambda b:(scope,old),'inventory_clients':lambda b,r:([{'pid':12,'start':'client'}],[]),'safe_bytes':lambda p:b'','os':fakeos,'stat':stat,'errno':errno,'fcntl':types.SimpleNamespace(flock=flock,LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),'time':types.SimpleNamespace(time=lambda:100)})
 result=s['observe']({'pin':pin,'plan':{'source':{'files':[]},'sourceModes':[]},'loaded':{}})
 record('actual observe '+variant,{'accepted':True,'currentUnknown':result['currentUnknown'],'unexpectedDescendants':result['unexpectedDescendants'],'ownedListeners':result['ownedListeners'],'recordedCount':result['recordedCount']})

# Pure sequence/freshness adversaries use actual predicate functions and the
# already-inspected author fixture, keeping the retained failures intact.
base=copy.deepcopy(ns['base'])
for label,change in [('future readiness',lambda x:x['r'].update(verifiedAtEpoch=104)),('expires after observation',lambda x:x.update(after=161)),('future permit',lambda x:x['p'].update(issuedAtEpoch=104)),('prior client survivor',lambda x:x['live_after'].update(priorClientsLive=[{'pid':99}]))]:
 v=copy.deepcopy(base);change(v)
 try:pred['gate'](**v)
 except pred['Hold'] as e:record(label,{'held':True,'reason':str(e)})
 else:record(label,{'held':False})

inputs=read(D/'input-pins.json');retained=read(D/'retained-contract.json');assess=read(R/'full-check/assessment.json')
record('retained contract',{'equalsInputCopy':retained==inputs['retainedContract'],'all22EvidencePreserved':retained['errors']['assessmentEvidenceErrors']==assess['evidenceErrors'],'all5ValidationPreserved':retained['errors']['assessmentValidationErrors']==assess['validationErrors']})

# Local predicate code is imported before safe_bytes/load_authority can validate
# any ancestor, member mode or expected code hash. The fake importer models the
# import boundary only; no runtime module or substitute body is imported here.
import_node=next(n for n in tree.body if isinstance(n,ast.ImportFrom) and n.module=='predicates')
import_events=[]
def fake_import(name,*args,**kwargs):
 import_events.append({'module':name,'importedBeforeCodePin':True});return types.SimpleNamespace(**{alias.name:pred[alias.name] for alias in import_node.names})
exec(compile(ast.Module(body=[import_node],type_ignores=[]),'<actual import statement, fake importer>','exec'),{'__builtins__':{'__import__':fake_import}})
record('predicate bootstrap import',{'importLine':import_node.lineno,'safeReaderDefinitionLine':next(n.lineno for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='safe_bytes'),'events':import_events})

# Exact register/inventory functions across four separate synthetic clients.
class JournalPath:
 def __init__(self,name):self.name=name
 def __lt__(self,other):return self.name<other.name
 def __str__(self):return self.name
class Journal:
 def iterdir(self):return [JournalPath(x) for x in files]
files={};client_pid=[20];current_rows=[{}]
def jwrite(name,value):
 if name in files:raise FileExistsError(name)
 files[name]=copy.deepcopy(value)
def who(row):return {**row,'identityComplete':True,'commHash':'comm','executableFileHash':'file'}
s=extract({'register_client','inventory_clients'},{**pred,'os':types.SimpleNamespace(getpid=lambda:client_pid[0]),'helpers':lambda b:({'table':lambda:current_rows[0],'identity':who},None),'write_new':jwrite,'HERE':Journal(),'read':lambda p,*a:files[p.name],'safe_bytes':lambda p,*a:pred['compact'](files[p.name])})
for mode,pid in [('negative-gate',20),('final',21),('positive-gate',22),('postclose',23)]:
 client_pid[0]=pid;current_rows[0]={pid:{'pid':pid,'start':'start-'+str(pid),'ppid':11,'argvHash':mode}}
 b={'sha':'e'*64,'loaded':{}};s['register_client'](b,mode);clients,prior=s['inventory_clients'](b,current_rows[0]);assert not prior
record('four sequential independent client journals',{'entries':len(files),'priorSurvivors':len(prior),'allCurrentClientRecorded':any(x==b['client'] for x in clients)})
try:s['register_client'](b,'postclose')
except FileExistsError:record('same PID/start journal collision',{'failsClosed':True,'overwrites':False})
else:record('same PID/start journal collision',{'failsClosed':False})

# Basename-only reuse of the core identity parser: aliases fail closed rather
# than establish identity. This is a supplied-data qualification, not a claim
# about the current installed interpreter or the old failed subpredicate.
core=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py')
ct=ast.parse(core.read_text());inode=next(n for n in ct.body if isinstance(n,ast.FunctionDef) and n.name=='identity')
class Image:
 def __init__(self,value):self.value=str(value)
 @property
 def name(self):return PurePosixPath(self.value).name
 def is_absolute(self):return self.value.startswith('/')
 def is_file(self):return True
 def resolve(self):return self
 def stat(self):return types.SimpleNamespace(st_dev=1,st_ino=9,st_size=3,st_mtime_ns=1)
 def read_bytes(self):return b'BIN'
 def __hash__(self):return hash(self.value)
 def __eq__(self,o):return isinstance(o,Image) and self.value==o.value
 def __str__(self):return self.value
for comm in ['/canonical/Python','/configured/python3.13']:
 fake={'Path':Image,'pid_text':lambda pid,key: {'lstart':'start','comm':comm,'command':'same-python-command'}[key],'capture':lambda *a:'n/canonical/Python\n','sha':lambda v:hashlib.sha256(v).hexdigest()}
 exec(compile(ast.Module(body=[inode],type_ignores=[]),'<core identity; fake process and mappings>','exec'),fake)
 result=fake['identity']({'pid':44,'start':'start'});record('synthetic Python mapping '+PurePosixPath(comm).name,{'identityComplete':result.get('identityComplete',False),'actualConfiguredInterpreterObserved':False})

# The actual reused boundary function drops a stable marker candidate when its
# role observation is unavailable, instead of returning a current unknown.
bnode=next(n for n in ct.body if isinstance(n,ast.FunctionDef) and n.name=='boundary_inventory')
baseline=[{'pid':i,'start':'inherited-'+str(i),'commHash':'c','argvHash':'a','executableHash':'e','executableFileHash':'f'} for i in range(1,7)]
rows={x['pid']:{**x,'projectMarkerCandidate':False} for x in baseline}
rows[90]={'pid':90,'start':'stable-candidate','projectMarkerCandidate':True}
for available in [True,False]:
 g={'table':lambda:rows,'regular':lambda p:json.dumps({'identities':baseline}).encode(),'json':json,'ROOT':PurePosixPath('/repo'),'identity':lambda row:{**row,'identityComplete':True},'project_role':lambda pid:'GRADLE_OR_TEST_JVM' if available else None,'capture':lambda *a:'','utc':lambda:'synthetic'}
 exec(compile(ast.Module(body=[bnode],type_ignores=[]),'<actual boundary inventory, fake observations>','exec'),g)
 observed=g['boundary_inventory']({'baselinePath':'baseline.json'})
 record('stable candidate role '+('observed' if available else 'unknown'),{'inheritedMatched':len(observed['inheritedMatched']),'otherProjectFacts':len(observed['otherProjectFacts']),'incompleteStableIdentities':len(observed['incompleteStableIdentities']),'currentCandidateUnknownExplicitlyReported':any(x.get('pid')==90 for x in observed['incompleteStableIdentities'])})

# All fourteen supplied public/source references are independently verified.
for item in inputs['records']:
 assert sha(item['path'])==item['sha256'];pins.append(item)
(O/'input-pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'members':pins},indent=2)+'\n')
(O/'independent-checks.json').write_text(json.dumps({'scope':'SOURCE_AND_SYNTHETIC_ONLY','actualAdapterOrHelperImports':False,'actualRuntimeOsPrivateActions':0,'results':results},indent=2)+'\n')
print(json.dumps(results,indent=2))

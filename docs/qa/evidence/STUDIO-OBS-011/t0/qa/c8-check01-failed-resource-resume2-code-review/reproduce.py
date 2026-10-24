"""Independent successor review. AST definitions and in-memory boundaries only."""
import ast,hashlib,json,pathlib,stat,types,copy,difflib
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume2')
B=D.parent/'resume1';O=pathlib.Path(__file__).parent
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
pins=[];results=[]
def record(name,**data):results.append({'check':name,**data})
assert sha(D/'manifest.json')=='38c5d4cc0ae6477dc0f60a63d3c76792953daca72ab4233e54ae271405728b0b'
for folder in [D,B]:
 for f in read(folder/'manifest.json')['files']:
  p=folder/f['path'];assert sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode'];pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
inputs=read(D/'input-pins.json')
for f in inputs['records']:assert sha(f['path'])==f['sha256'];pins.append(f)

# The author suite is inspected before execution. Its actual adapter loader is
# restricted to definitions/imports/constants, never main/operational top-level
# code. Only the preparation result write is removed.
def load_definitions(ns):
 tree=ast.parse((D/'failed_resource.py').read_text())
 tree.body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef)) or isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) for t in n.targets)]
 exec(compile(tree,'<inspected adapter definitions only>','exec'),ns)
 return ns
suite=ast.parse((D/'adapter_checks.py').read_text())
for n in suite.body:
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='exec':
  if 'inspected-adapter-definitions-no-main' in ast.unparse(n):n.value=ast.Call(func=ast.Name(id='load_definitions',ctx=ast.Load()),args=[ast.Name(id='ns',ctx=ast.Load())],keywords=[])
suite.body=[n for n in suite.body if not isinstance(n,ast.With)]
ast.fix_missing_locations(suite)
s={'__file__':str(D/'adapter_checks.py'),'load_definitions':load_definitions}
exec(compile(suite,'<inspected author synthetic checks, no output write>','exec'),s)
record('author synthetic cases reproduce',legacy=len(s['l']['checks']),adapter=len(s['results']),total=len(s['l']['checks'])+len(s['results']))
pred=s['pred'];tree=ast.parse((D/'failed_resource.py').read_text())
def extract(names,ns):
 nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual functions, supplied fake boundaries>','exec'),ns);return ns

# Pair the exact bootstrap with a stable predicate and with a changed second
# read. No filesystem/module import; both bodies are inspected pure source.
valid=(D/'predicates.py').read_bytes();changed=valid+b'\nSYNTHETIC_CHANGED_BODY_EXECUTED = True\n'
for swap in [False,True]:
 class FakeCustody:
  def __init__(self):self.calls=0
  def read(self,name):
   if name=='root-disposition-authorization.json':return raw
   if name=='failed_resource.py':return b'adapter'
   if name=='guard-failed-resource.bash':return b'guard'
   assert name=='predicates.py';self.calls+=1;return changed if swap and self.calls>1 else valid
  def check(self):pass
 a={'authorized':True,'authorizedBy':'root','codePins':{'failed_resource.py':pred['digest'](b'adapter'),'predicates.py':pred['digest'](valid),'guard-failed-resource.bash':pred['digest'](b'guard')}}
 raw=json.dumps(a).encode();executions=[]
 def traced_compile(source,*args):executions.append({'sourceSha256':pred['digest'](source),'matchesAuthorizedPin':pred['digest'](source)==a['codePins']['predicates.py']});return compile(source,*args)
 ns=extract({'bootstrap'},{**pred,'json':json,'compile':traced_compile})
 ns['bootstrap'](FakeCustody(),pred['digest'](raw))
 record('bootstrap '+('second read changed' if swap else 'unchanged'),accepted=True,execution=executions)

# The same check/read split exists in helpers: the first core buffer is hashed,
# a second buffer supplies imported code/functions. Compile trace binds both.
core=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py').read_bytes()
for swap in [False,True]:
 reads=[0];compiled=[]
 def safe(path):reads[0]+=1;return core+(b'\nimport math as SYNTHETIC_CHANGED_CORE\n' if swap and reads[0]>1 else b'')
 def traced_compile(source,*args):compiled.append(ast.unparse(source));return compile(source,*args)
 ns=extract({'helpers'},{**pred,'CORE':'core','CORE_SHA':pred['digest'](core),'safe_bytes':safe,'ast':ast,'compile':traced_compile,'ROOT':pathlib.PurePosixPath('/repo'),'UNIT':pathlib.PurePosixPath('/unit'),'OLD_GATE_SHA':'old','load_fixed_module':lambda *a:types.SimpleNamespace(),'utility_capture':lambda *a:None,'parse_census':lambda *a:None})
 ns['helpers']({})
 record('helper '+('second read changed' if swap else 'unchanged'),accepted=True,changedImportExecuted=any('SYNTHETIC_CHANGED_CORE' in x for x in compiled))

# Actual utility_capture receives a failed global-listener observation. It
# discards stderr and treats status1 as an allowed clean observation.
class P(pathlib.PurePosixPath):
 def resolve(self):return self
class BinaryCustody:
 def __init__(self,*a):pass
 def read(self,*a):return b'BIN'
 def close(self):pass
class Mem:
 def __init__(self):self.files={}
 def write(self,name,value):self.files[name]=copy.deepcopy(value)
for bad in [False,True]:
 class Child:
  pid=90;returncode=1 if bad else 0
  def communicate(self,timeout):return ('','permission denied: observation incomplete') if bad else ('p12\nn*:8080\n','')
 b={'a':{'observationExecutables':{'/usr/sbin/lsof':{'path':'/usr/sbin/lsof','sha256':pred['digest'](b'BIN')}}},'sha':'e'*64,'client':{'pid':12,'start':'start'},'clientBound':True,'utilityCounter':0,'utilities':[],'custody':Mem()}
 ns=extract({'utility_capture','write_new'},{**pred,'Path':P,'Custody':BinaryCustody,'subprocess':types.SimpleNamespace(Popen=lambda *a,**k:Child(),DEVNULL=-1,PIPE=-2)})
 output=ns['utility_capture'](b,['/usr/sbin/lsof','-nP','-iTCP','-sTCP:LISTEN','-F','pn'],(0,1))
 record('global listener '+('failed with stderr' if bad else 'complete client listener'),accepted=True,output=output,receipt=b['lastUtility'],stderrRetained='stderr' in b['lastUtility'])

# Actual observer dropped packet01's second forbidden-compile-path check.
# No native action is modeled: only a supplied forbidden marker appearing
# between its entry checks and successful result.
import errno
for appeared in [False,True]:
 state={'table':0,'forbidden':False}
 class U(pathlib.PurePosixPath):
  def exists(self):return state['forbidden']
  def is_symlink(self):return False
 class Lock:
  def with_name(self,n):return self
  def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
 pin={'wrapperPid':10,'wrapperStart':'wrapper','shellPid':11,'shellStart':'shell','lockDevInode':[1,2]}
 rows={10:{'pid':10,'ppid':1,'start':'wrapper','projectMarkerCandidate':False},11:{'pid':11,'ppid':10,'start':'shell','projectMarkerCandidate':False},12:{'pid':12,'ppid':11,'start':'client','projectMarkerCandidate':False},90:{'pid':90,'ppid':12,'start':'probe','projectMarkerCandidate':False}}
 def table():
  state['table']+=1
  if appeared and state['table']>1:state['forbidden']=True
  return rows
 boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[]}
 scope={'table':table,'project_role':lambda p:None,'boundary_inventory':lambda p:boundary,'capture':lambda *a:'p10\ni2\n'}
 owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
 def fake_read(path,*a):return {'ownedIdentities':owned} if str(path).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}}
 def flock(*args):raise OSError(errno.EAGAIN,'held')
 ns=extract({'observe'},{**pred,'UNIT':U('/unit'),'Path':lambda x:x,'helpers':lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE'])),'read':fake_read,'inventory_clients':lambda b,r:([{'pid':12,'start':'client'}],[]),'safe_bytes':lambda *a:b'','os':types.SimpleNamespace(getpid=lambda:12,open=lambda *a:7,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),close=lambda *a:None,O_RDONLY=0,O_NOFOLLOW=1),'fcntl':types.SimpleNamespace(flock=flock,LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),'errno':errno,'stat':stat,'time':types.SimpleNamespace(time=lambda:100)})
 b={'custody':s['MemCustody'](),'pin':pin,'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
 ns['observe'](b)
 record('forbidden compile marker '+('appears during observation' if appeared else 'remains absent'),accepted=True,forbiddenPresentAtReturn=state['forbidden'])

# Changeset forward/reverse check, without git or patch commands. Generated
# artifacts are deliberately excluded by the author's explicit map.
mapping=read(D/'changed-code-map.json');delta=[]
for f in mapping['sourceAndTemplateCommonFiles']:
 old=(B/f['path']).read_text();new=(D/f['path']).read_text()
 assert sha(B/f['path'])==f['oldSha256'] and sha(D/f['path'])==f['newSha256'] and (old!=new)==f['changed']
 forward=list(difflib.ndiff(old.splitlines(keepends=True),new.splitlines(keepends=True)))
 reverse=list(difflib.ndiff(new.splitlines(keepends=True),old.splitlines(keepends=True)))
 assert ''.join(difflib.restore(forward,1))==old and ''.join(difflib.restore(forward,2))==new
 assert ''.join(difflib.restore(reverse,1))==new and ''.join(difflib.restore(reverse,2))==old
 delta.append({'path':f['path'],'changed':f['changed'],'forwardReverseExact':True})
record('strict source/template map',members=len(delta),changed=sum(x['changed'] for x in delta),generatedExcluded=True)
record('retained failed contract unchanged',sameBytes=(B/'retained-contract.json').read_bytes()==(D/'retained-contract.json').read_bytes())
record('legacy test source only mode spelling adaptation',sameSemanticSource=(B/'pure_checks.py').read_text().replace("('final','gate','postclose')","('final','gate','held-proof','postclose')")==(D/'pure_checks.py').read_text())
(O/'input-pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins},indent=2)+'\n')
(O/'independent-results.json').write_text(json.dumps({'scope':'SOURCE_AST_AND_SYNTHETIC_ONLY_NO_RUNTIME_IMPORT_OR_MAIN','results':results,'sourceTemplateDelta':delta,'actualActions':0},indent=2)+'\n')
print(json.dumps(results,indent=2))

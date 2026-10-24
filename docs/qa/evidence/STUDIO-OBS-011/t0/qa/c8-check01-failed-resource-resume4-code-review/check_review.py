"""Independent guarded source review; baseline body and operational I/O forbidden."""
import ast,builtins,copy,difflib,hashlib,json,pathlib,stat,types
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume4')
B=D.parent/'resume3';O=pathlib.Path(__file__).parent
BASE='docs/qa/evidence/STUDIO-OBS-011/t0/early/diag-start1-harness/resume2/preexisting-baseline.json'
def allowed(p):assert not str(p).endswith(BASE),'ACTUAL_BASELINE_BODY_OR_METADATA_FORBIDDEN'
def read(p):allowed(p);return json.loads(pathlib.Path(p).read_text())
def sha(p):allowed(p);return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
checks=[];pins=[]
def check(name,value):assert value,name;checks.append({'check':name,'passed':True})
check('exact code04 manifest',sha(D/'manifest.json')=='e0cdc50f6970e595d3c1095b9b182e116d60663b0eb37d3c4793b56a8b2ada11')
for folder in [D,B,D.parent/'resume2',D.parent/'resume1']:
 for f in read(folder/'manifest.json')['files']:
  p=folder/f['path'];check('member '+str(p),sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
records=read(D/'input-pins.json')['records'];check('148 declared inputs',len(records)==148)
for f in records:check('input '+f['path'],sha(f['path'])==f['sha256']);pins.append(f)

# Narrow the legacy actual-module source loader to definitions/imports/constants;
# all new tests already use blocked modules/GuardPath in the SAME namespaces.
def load_definitions(ns):
 t=ast.parse((D/'failed_resource.py').read_text())
 t.body=[x for x in t.body if isinstance(x,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef)) or isinstance(x,ast.Assign) and all(isinstance(y,ast.Name) for y in x.targets)]
 builtins.exec(compile(t,'<inspected definitions only; never main>','exec'),ns)
adapter=ast.parse((D/'adapter_checks.py').read_text())
for node in adapter.body:
 if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and 'inspected-adapter-definitions-no-main' in ast.unparse(node):node.value=ast.Call(func=ast.Name(id='_load_definitions',ctx=ast.Load()),args=[ast.Name(id='ns',ctx=ast.Load())],keywords=[])
adapter.body=[x for x in adapter.body if not isinstance(x,ast.With)];ast.fix_missing_locations(adapter)
successor=ast.parse((D/'successor_checks.py').read_text());successor.body=[x for x in successor.body if not isinstance(x,ast.With)]
def guarded_exec(code,ns=None,locals=None):
 if getattr(code,'co_filename','')=='<inspected228-no-result-write>':
  ns['exec']=guarded_exec;return builtins.exec(compile(successor,'<inspected228 source/fakes only>','exec'),ns)
 if getattr(code,'co_filename','')=='<inspected164-no-result-write>':
  ns['_load_definitions']=load_definitions;return builtins.exec(compile(adapter,'<inspected164 definitions/fakes only>','exec'),ns)
 return builtins.exec(code,ns,locals)
focused=ast.parse((D/'focused_checks.py').read_text());focused.body=[x for x in focused.body if not isinstance(x,ast.With)]
s={'__file__':str(D/'focused_checks.py'),'exec':guarded_exec}
builtins.exec(compile(focused,'<inspected focused35; result write removed>','exec'),s)
check('263 supplied cases reproduce',s['result']['total']==263 and len(s['checks'])==35)
pred=s['pred'];Mem=s['p']['h']['MemCustody']

# Independent core reader: only synthetic payloads are supplied. Wrong/unbound
# scope rejects before body access; changed bytes reject before JSON parsing.
for variant in ['good','changed','missing plan pin','different path']:
 n=s['definitions']();good=b'{"identities":[]}';calls=[]
 actual_digest=n['digest'];n['digest']=lambda raw:n['BASELINE_SHA'] if raw==good else actual_digest(raw)
 n['safe_bytes']=lambda p:(calls.append(str(p)),good if variant!='changed' else b'{"identities":["ALTERED"]}')[1]
 plan={'baselinePath':n['BASELINE_PATH'],'immutableHelpers':{n['BASELINE_PATH']:n['BASELINE_SHA']}}
 if variant=='missing plan pin':plan['immutableHelpers']={}
 path=n['ROOT']/n['BASELINE_PATH'] if variant!='different path' else n['ROOT']/'UNBOUND.json'
 try:raw=n['core_regular']({'plan':plan},path)
 except Exception as e:check('independent baseline '+variant,variant!='good' and type(e).__name__=='Hold')
 else:check('independent baseline good',variant=='good' and raw==good)
 if variant in ['missing plan pin','different path']:check('baseline pre-read rejection '+variant,not calls)

# Real observe function in one guarded namespace per case. Recycled controller
# and prior-client numbers must never exempt a new descendant; exact bound self
# reuse and unrelated outside reuse must remain legitimate.
pid_results=[]
for role in ['wrapper','shell']:
 for variant in ['clean','outside reuse listener','new child middle','new child final','new child listener','bound self reuse']:
  n=s['definitions']();reused=10 if role=='wrapper' else 11;me=reused if variant=='bound self reuse' else 12
  class U(pathlib.PurePosixPath):
   def exists(self):return False
   def is_symlink(self):return False
  class Lock:
   def with_name(self,name):return self
   def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
  calls=[0]
  def table():
   calls[0]+=1;rows={me:{'pid':me,'ppid':99,'start':'bound-new-client','projectMarkerCandidate':False},99:{'pid':99,'ppid':1,'start':'outer','projectMarkerCandidate':False},90:{'pid':90,'ppid':me,'start':'probe','projectMarkerCandidate':False}}
   if variant not in ['clean','bound self reuse'] and (variant!='new child final' or calls[0]>=3):rows[reused]={'pid':reused,'ppid':me if variant.startswith('new child') else 1,'start':'REUSED_OTHER_IDENTITY','projectMarkerCandidate':False}
   return rows
  listeners=[{'pid':reused,'port':8080}] if variant in ['outside reuse listener','new child listener'] else []
  boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':listeners}
  scope={'table':table,'project_role':lambda p:None,'boundary_inventory':lambda p:boundary}
  owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
  clients=[{'pid':me,'start':'bound-new-client'}]+([{'pid':reused,'start':'PRIOR_OLD_CLIENT'}] if variant=='outside reuse listener' else [])
  n.update(UNIT=U('/unit'),helpers=lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE'])),verified_read=lambda b,p:{'ownedIdentities':owned} if str(p).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}},inventory_clients=lambda b,r:(clients,[]),safe_bytes=lambda *a:b'',os=types.SimpleNamespace(getpid=lambda:me,open=lambda *a:7,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),close=lambda *a:None,O_RDONLY=0,O_NOFOLLOW=1),fcntl=types.SimpleNamespace(flock=lambda *a:None,LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),time=types.SimpleNamespace(time=lambda:100))
  b={'custody':Mem(),'pin':{'wrapperPid':10,'wrapperStart':'W','shellPid':11,'shellStart':'S','lockDevInode':[1,2]},'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
  held=False
  try:n['observe'](b,True)
  except Exception as e:assert type(e).__name__=='Hold';held=True
  check('independent postclose '+role+' '+variant,held==variant.startswith('new child'))
  pid_results.append({'role':role,'case':variant,'held':held})

# Actual role checker with root05's requested BIN / observed APP distinction;
# root attestation is separate from an in-process observation claim.
fact=read(D.parent/'root-external-prospective-tool-bindings-05.json')
roles={'launch':fact['requestedLaunch'],'reported':fact['reportedBinary'],'process':fact['mappedProcessBinary'],'observedArgument':fact['mappedProcessBinary']}
for variant in ['root05','argument BIN','argument other','reported APP']:
 n=s['definitions']()
 class P(pathlib.PurePosixPath):
  def resolve(self):return self
 arg=roles['reported']['path'] if variant=='argument BIN' else '/other/APP' if variant=='argument other' else roles['observedArgument']['path']
 n.update(Path=P,sys=types.SimpleNamespace(executable=roles['process']['path'] if variant=='reported APP' else roles['reported']['path'],orig_argv=[arg]),external_buffer=lambda p:b'APP' if p==roles['process']['path'] else b'BIN',digest=lambda raw:roles['process']['sha256'] if raw==b'APP' else roles['reported']['sha256'])
 held=False
 try:n['validate_python_roles']({'pythonRoles':roles})
 except Exception as e:assert type(e).__name__=='Hold';held=True
 check('independent root05 roles '+variant,held==(variant!='root05'))

# Independent complete consumer-list and exact diff-byte comparisons.
source=ast.parse((D/'failed_resource.py').read_text());sites=[]
class Consumers(ast.NodeVisitor):
 def __init__(self):self.stack=[]
 def visit_FunctionDef(self,node):self.stack.append(node.name);self.generic_visit(node);self.stack.pop()
 def visit_Call(self,node):
  name=ast.unparse(node.func)
  if name in ['json.loads','ast.parse','exec','compile']:sites.append(('/'.join(self.stack),name,node.lineno))
  self.generic_visit(node)
Consumers().visit(source)
declared=read(D/'interpretation-sites.json')
check('exact actual interpreter-site map',sorted(sites)==sorted((x['function'],x['consumer'],x['line']) for x in declared['allRuntimeConsumerSites']))
check('interpretation map source hash',declared['runtimeSourceSha256']==sha(D/'failed_resource.py'))
forward=[];reverse=[];mapping=read(D/'changed-code-map.json')
for f in mapping['sourceAndTemplateCommonFiles']:
 old=(B/f['path']).read_text();new=(D/f['path']).read_text()
 check('mapped source '+f['path'],sha(B/f['path'])==f['oldSha256'] and sha(D/f['path'])==f['newSha256'] and (old!=new)==f['changed'])
 if old!=new:
  forward.extend(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='resume3/'+f['path'],tofile='resume4/'+f['path']))
  reverse.extend(difflib.unified_diff(new.splitlines(keepends=True),old.splitlines(keepends=True),fromfile='resume4/'+f['path'],tofile='resume3/'+f['path']))
check('exact forward diff',''.join(forward)==(D/'source-forward.diff').read_text())
check('exact reverse diff',''.join(reverse)==(D/'source-reverse.diff').read_text())
check('retained failed outcome unchanged',(D/'retained-contract.json').read_bytes()==(B/'retained-contract.json').read_bytes())
check('five fresh clients with ten utility journals',len(s['result']['freshFiveClientFlow'])==5 and all(x['utilityJournals']==2 for x in s['result']['freshFiveClientFlow']))
(O/'input-pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins,'baselineBodyReadStatHash':False},indent=2)+'\n')
(O/'independent-results.json').write_text(json.dumps({'authorCasesReproduced':263,'checks':checks,'allPassed':True,'postcloseCases':pid_results,'freshFiveClientFlow':s['result']['freshFiveClientFlow'],'actualBaselineBodyReadStatHash':False,'actualRuntimeImportsMainsOsNativePrivateActions':0},indent=2)+'\n')
print(json.dumps({'authorCases':263,'checks':len(checks),'allPassed':True}))

"""Quinn review: guarded AST/fakes only, no actual adapter import/main or OS."""
import ast,copy,difflib,hashlib,json,pathlib,stat,types,builtins
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume3')
B=D.parent/'resume2';O=pathlib.Path(__file__).parent
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
pins=[];checks=[]
def check(name,value):assert value,name;checks.append({'check':name,'passed':True})
check('exact code03 manifest',sha(D/'manifest.json')=='fd4195e7ec23851b6bd6b50529a8656cb17b29cd83f85ddcc4f270b85e06236f')
for folder in [D,B,D.parent/'resume1']:
 for f in read(folder/'manifest.json')['files']:
  p=folder/f['path'];check('member '+str(p),sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
for f in read(D/'input-pins.json')['records']:
 check('input '+f['path'],sha(f['path'])==f['sha256']);pins.append(f)

# The retained164 harness's whole-module source loader is narrowed to actual
# definitions/imports/constants. Every operational call remains fake. The new
#64 uses its own Blocked/GuardPath namespace exactly as inspected.
def load_definitions(ns):
 t=ast.parse((D/'failed_resource.py').read_text())
 t.body=[n for n in t.body if isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef)) or isinstance(n,ast.Assign) and all(isinstance(x,ast.Name) for x in n.targets)]
 builtins.exec(compile(t,'<inspected adapter AST definitions only>','exec'),ns)
adapter=ast.parse((D/'adapter_checks.py').read_text())
for n in adapter.body:
 if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and 'inspected-adapter-definitions-no-main' in ast.unparse(n):n.value=ast.Call(func=ast.Name(id='_load_definitions',ctx=ast.Load()),args=[ast.Name(id='ns',ctx=ast.Load())],keywords=[])
adapter.body=[n for n in adapter.body if not isinstance(n,ast.With)];ast.fix_missing_locations(adapter)
def guarded_exec(code,ns=None,locals=None):
 if getattr(code,'co_filename','')=='<inspected164-no-result-write>':
  ns['_load_definitions']=load_definitions;return builtins.exec(compile(adapter,'<retained164 inspected AST/fakes>','exec'),ns)
 return builtins.exec(code,ns,locals)
suite=ast.parse((D/'successor_checks.py').read_text());suite.body=[n for n in suite.body if not isinstance(n,ast.With)]
s={'__file__':str(D/'successor_checks.py'),'exec':guarded_exec}
builtins.exec(compile(suite,'<inspected successor64; preparation result write removed>','exec'),s)
check('228 inspected cases reproduce',s['result']['total']==228 and len(s['checks'])==64)
pred=s['pred'];Mem=s['h']['MemCustody']

# Independent actual bootstrap: a poisoned second read is offered, but the
# verified predicate is consumed only once. Wrong first pin executes nothing.
for bad in [False,True]:
 n=s['definitions']();valid=(D/'predicates.py').read_bytes();calls=[];executions=[]
 a={'authorized':True,'authorizedBy':'root','codePins':{'failed_resource.py':pred['digest'](b'adapter'),'predicates.py':'0'*64 if bad else pred['digest'](valid),'guard-failed-resource.bash':pred['digest'](b'guard')}}
 raw=json.dumps(a).encode()
 class C:
  def check(self):pass
  def read(self,name):
   calls.append(name)
   if name=='predicates.py':return valid if calls.count(name)==1 else valid+b'\nraise ValueError("UNVERIFIED")\n'
   return {'root-disposition-authorization.json':raw,'failed_resource.py':b'adapter','guard-failed-resource.bash':b'guard'}[name]
 def compiler(body,*args):executions.append(pred['digest'](body));return compile(body,*args)
 n['compile']=compiler
 try:n['bootstrap'](C(),pred['digest'](raw))
 except Exception as e:check('bad predicate first pin holds',bad and type(e).__name__=='Hold' and not executions)
 else:check('exact verified predicate buffer executed',not bad and calls.count('predicates.py')==1 and executions==[pred['digest'](valid)])

# Fresh strict JSON interpretation rejects a changed second body before loads.
for fn in ['verified_read','local']:
 n=s['definitions']();good=b'{"value":"bound"}';bad=b'{"records":[{"path":"NEVER_DEREFERENCE"}]}'
 p=n['HERE']/'input-pins.json';c=Mem({'input-pins.json':good});b={'custody':c,'loaded':{str(p):pred['digest'](good)}}
 n['safe_bytes']=lambda path: c.files['input-pins.json']
 arg=p if fn=='verified_read' else 'input-pins.json'
 check(fn+' first buffer',n[fn](b,arg)=={'value':'bound'})
 c.files['input-pins.json']=bad
 try:n[fn](b,arg)
 except Exception as e:check(fn+' changed body holds before indirection',type(e).__name__=='Hold')
 else:raise AssertionError(fn+' consumed changed JSON')

# A fresh namespace/binding per operation, persistent only in-memory files.
# This independently tests the complete five-client control/journal sequence.
n=s['definitions']();n.update({k:v for k,v in pred.items() if not k.startswith('__')})
pid=[120];clock=[100.0];files=Mem();pin=n['PIN'];roles=copy.deepcopy(s['roles'])
def who():return {'pid':pid[0],'ppid':11,'start':'start-'+str(pid[0]),'argvHash':pred['digest'](b'python fixture'),'commHash':'a'*64,'executableHash':pred['digest'](roles['process']['path'].encode()),'executableFileHash':roles['process']['sha256'],'identityComplete':True}
n['os']=types.SimpleNamespace(getpid=lambda:pid[0],getppid=lambda:11)
n['time']=types.SimpleNamespace(time=lambda:clock[0])
n['utility_capture']=lambda b,cmd,allowed=(0,):who()['start'] if cmd[-1]=='lstart=' else 'python fixture'
n['helpers']=lambda b:({'table':lambda:{pid[0]:who()}},None)
n['client_identity']=lambda b,scope,row:who()
def observe(b,post=False):
 clients,prior=n['inventory_clients'](b,{pid[0]:who()});live=copy.deepcopy(s['h']['l']['live'])
 live.update(priorClientsLive=prior,clientIdentities=clients,kernelHeld=not post,kernelFree=post,controllersAbsentOrReused=post)
 return live
n['observe']=observe
def fresh_b():
 a=copy.deepcopy(s['h']['l']['a']);a.update(activeLockSha256=pin,pythonRoles=roles)
 return {'a':a,'sha':'e'*64,'loaded':{},'custody':files,'pin':{'shellPid':11},'retained':copy.deepcopy(s['h']['l']['retained']),'utilities':[],'utilityCounter':0}
b=fresh_b();files.files['input-pins.json']=json.dumps({'retainedContract':b['retained']}).encode()
def operation(mode,num,requested=None):
 pid[0]=num;b=fresh_b();n['register_client'](b,mode);n['operate'](b,mode,requested)
try:operation('gate',120,1)
except Exception as e:check('fresh invocation negative denial1',type(e).__name__=='Hold' and str(e)=='MISSING_READINESS')
else:raise AssertionError('negative unexpectedly allowed')
operation('held-proof',121,1);check('fresh invocation held proof',read if False else 'held-proof.json' in files.files)
ad=copy.deepcopy(s['h']['l']['ad']);ad.update(activeLockSha256=pin,negativeDenialSha256=pred['digest'](files.read('negative-readiness-denial.json')),heldProofSha256=pred['digest'](files.read('held-proof.json')),heldProofActualStatus=0,heldProofSeparateStatusCaptured=True)
files.write('root-admission.json',ad)
operation('final',122);check('fresh invocation final', 'readiness.json' in files.files)
p=copy.deepcopy(s['h']['l']['p']);p.update(readinessSha256=pred['digest'](files.read('readiness.json')),issuedAtEpoch=100)
files.write('permit.json',p);operation('gate',123,1);check('fresh invocation permitted gate','gate-allow.json' in files.files)
files.write('root-wrapper-result.json',{'actualWrapperExit':1,'separatelyCaptured':True,'releaseSha256':'e'*64,'gateAllowSha256':pred['digest'](files.read('gate-allow.json'))})
operation('postclose',124);check('fresh invocation separate postclose','postclose.json' in files.files)
check('five distinct clients exactly',len([k for k in files.files if k.startswith('client-')])==5)

# Freshness remains pre/post bounded under independent exact boundary values.
base=copy.deepcopy(s['h']['l']['base'])
for after,expected in [(160,True),(160.000001,False)]:
 v=copy.deepcopy(base);v['after']=after
 try:pred['gate'](**v)
 except Exception as e:check('TTL after '+str(after),not expected and type(e).__name__=='Hold')
 else:check('TTL after '+str(after),expected)

# Check exact supplied forward/reverse diff bytes against independently
# generated unified changes, plus every declared old/new hash/mode pair.
mapping=read(D/'changed-code-map.json');forward=[];reverse=[]
for f in mapping['sourceAndTemplateCommonFiles']:
 old=(B/f['path']).read_text();new=(D/f['path']).read_text()
 check('source map '+f['path'],sha(B/f['path'])==f['oldSha256'] and sha(D/f['path'])==f['newSha256'] and (old!=new)==f['changed'])
 if old!=new:
  forward.extend(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='resume2/'+f['path'],tofile='resume3/'+f['path']))
  reverse.extend(difflib.unified_diff(new.splitlines(keepends=True),old.splitlines(keepends=True),fromfile='resume3/'+f['path'],tofile='resume2/'+f['path']))
check('exact supplied forward diff',''.join(forward)==(D/'source-forward.diff').read_text())
check('exact supplied reverse diff',''.join(reverse)==(D/'source-reverse.diff').read_text())
check('retained negative outcome byte-identical',(B/'retained-contract.json').read_bytes()==(D/'retained-contract.json').read_bytes())
template=read(D/'root-disposition-authorization.template.json');facts=read(D.parent/'root-external-python-role-bindings-03.json')['facts']
check('exact cached BIN reported/launch role',template['pythonRoles']['launch']==template['pythonRoles']['reported']=={'path':facts['reportedPython'],'sha256':facts['reportedPythonSha256']})
check('exact cached mapped APP role',template['pythonRoles']['process']=={'path':facts['processPython'],'sha256':facts['processPythonSha256']})
check('templates remain inactive',template['authorized'] is False and not any(template['dualException'].values()))

# Final independent PID/start scope check: a reused controller PID is allowed
# globally, but cannot exempt an unbound new child of the postclose client.
postclose_cases=[]
import errno
for variant in ['clean','unrelated controller PID reused','controller PID reused by client child']:
 n=s['definitions']();n.update({k:v for k,v in pred.items() if not k.startswith('__')})
 class U(pathlib.PurePosixPath):
  def exists(self):return False
  def is_symlink(self):return False
 class Lock:
  def with_name(self,name):return self
  def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
 rows={12:{'pid':12,'ppid':99,'start':'new-client','projectMarkerCandidate':False},99:{'pid':99,'ppid':1,'start':'outer','projectMarkerCandidate':False},90:{'pid':90,'ppid':12,'start':'probe','projectMarkerCandidate':False}}
 if variant!='clean':rows[10]={'pid':10,'ppid':12 if variant.endswith('client child') else 1,'start':'REUSED_NEW_IDENTITY','projectMarkerCandidate':False}
 boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[]}
 scope={'table':lambda:rows,'project_role':lambda pid:None,'boundary_inventory':lambda p:boundary}
 owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
 n.update(UNIT=U('/unit'),helpers=lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE'])),verified_read=lambda b,p:{'ownedIdentities':owned} if str(p).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}},inventory_clients=lambda b,r:([{'pid':12,'start':'new-client'}],[]),safe_bytes=lambda *a:b'',os=types.SimpleNamespace(getpid=lambda:12,open=lambda *a:7,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),close=lambda *a:None,O_RDONLY=0,O_NOFOLLOW=1),fcntl=types.SimpleNamespace(flock=lambda *a:None,LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),time=types.SimpleNamespace(time=lambda:100))
 b={'custody':Mem(),'pin':{'wrapperPid':10,'wrapperStart':'old-wrapper','shellPid':11,'shellStart':'old-shell','lockDevInode':[1,2]},'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
 result=n['observe'](b,True)
 postclose_cases.append({'case':variant,'accepted':True,'unexpectedDescendants':result['unexpectedDescendants'],'controllersAbsentOrReused':result['controllersAbsentOrReused']})

# The reused baseline parser still consumes regular() directly, independently
# of the earlier immutableHelpers hash check in observe_source. No actual old
# baseline body is read: both six-identity sets are synthetic supplied values.
core=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py').read_text()
boundary_node=next(x for x in ast.parse(core).body if isinstance(x,ast.FunctionDef) and x.name=='boundary_inventory')
baseline_cases=[]
for replaced in [False,True]:
 expected=[{'pid':i,'start':'approved-'+str(i),'commHash':'a','argvHash':'b','executableHash':'c','executableFileHash':'d'} for i in range(1,7)]
 substituted=[{**x,'pid':x['pid']+100,'start':'replacement-'+str(x['pid'])} for x in expected]
 consumed=substituted if replaced else expected
 scope={'ROOT':pathlib.PurePosixPath('/repo'),'json':json,'table':lambda:{x['pid']:{**x,'projectMarkerCandidate':False} for x in consumed},'regular':lambda p:json.dumps({'identities':consumed}).encode(),'identity':lambda row:{**row,'identityComplete':True},'project_role':lambda pid:None,'capture':lambda *a:'','utc':lambda:'synthetic'}
 builtins.exec(compile(ast.Module(body=[boundary_node],type_ignores=[]),'<actual reused boundary, fake baseline buffers>','exec'),scope)
 result=scope['boundary_inventory']({'baselinePath':'baseline.json'})
 baseline_cases.append({'case':'changed after earlier hash' if replaced else 'original verified baseline','inheritedMatched':len(result['inheritedMatched']),'consumedOriginalApprovedSet':{x['pid'] for x in result['inheritedMatched']}=={x['pid'] for x in expected},'defectCount':sum(len(result[k]) for k in ['originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'])})

# Supplemental root message supplies one new exact external-only metadata fact;
# no binary/process/OS observation is performed by this reviewer.
late_path=D.parent/'root-external-prospective-tool-bindings-05.json'
assert sha(late_path)=='af267068488221426368742557d1955b5817abc8ac081ad9d04661fc306ce67e'
late=read(late_path);pins.append({'path':str(late_path),'sha256':sha(late_path),'role':'SUPPLEMENTAL_EXTERNAL_SELF_ONLY_NOT_SUBJECT_MEMBER'})
role_cases=[]
for original_argv_role in ['launch','process']:
 n=s['definitions']();n.update({k:v for k,v in pred.items() if not k.startswith('__')})
 class P(pathlib.PurePosixPath):
  def resolve(self):return self
 n['Path']=P;n['sys']=types.SimpleNamespace(executable=roles['reported']['path'],orig_argv=[roles[original_argv_role]['path']])
 def fingerprint(raw):return roles['reported']['sha256'] if raw==b'BIN' else roles['process']['sha256']
 n['digest']=fingerprint;n['external_buffer']=lambda path:b'APP' if path==roles['process']['path'] else b'BIN'
 try:n['validate_python_roles']({'pythonRoles':roles})
 except Exception as e:role_cases.append({'origArgvRole':original_argv_role,'accepted':False,'reason':str(e)})
 else:role_cases.append({'origArgvRole':original_argv_role,'accepted':True})
(O/'input-pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins},indent=2)+'\n')
(O/'independent-results.json').write_text(json.dumps({'authorCases':228,'independentChecks':checks,'checksPassed':True,'sourceOnly':True,'actualRuntimeImportsMainsOsNativePrivateActions':0,'fullFreshInvocationSyntheticClients':5,'postclosePidScopeCounterexamples':postclose_cases,'unverifiedBaselineCounterexamples':baseline_cases,'supplementalOrigArgvRoleCases':role_cases,'supplementalExternalFactSha256':sha(late_path)},indent=2)+'\n')
print(json.dumps({'authorCases':228,'checks':len(checks),'postclosePidScopeCounterexamples':postclose_cases,'unverifiedBaselineCounterexamples':baseline_cases,'supplementalOrigArgvRoleCases':role_cases}))

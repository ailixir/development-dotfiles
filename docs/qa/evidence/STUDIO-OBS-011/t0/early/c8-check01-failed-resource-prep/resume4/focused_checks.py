"""Code04 focused fake pairs. No runtime import/main or operational boundary."""
import ast,copy,errno,fcntl,hashlib,json,os,stat,subprocess,types
from pathlib import Path,PurePosixPath
HERE=Path(__file__).parent
prior=ast.parse((HERE/'successor_checks.py').read_text());prior.body=[n for n in prior.body if not isinstance(n,ast.With)]
p={'__name__':'prior228_replay','__file__':str(HERE/'successor_checks.py')}
exec(compile(prior,'<inspected228-no-result-write>','exec'),p)
assert p['result']['total']==228
pred=p['pred'];sha=lambda b:hashlib.sha256(b).hexdigest();checks=[]
def check(name,fn,hold=False):
    try:fn()
    except Exception as error:
        assert type(error).__name__=='Hold' or isinstance(error,(OSError,KeyError,TypeError,ValueError)),(name,type(error).__name__,str(error))
        assert hold,(name,str(error))
    else:assert not hold,name
    checks.append({'case':name,'passed':True})
def definitions():
    n=p['definitions']();n.update({k:v for k,v in pred.items() if not k.startswith('__')});return n
core_path=HERE.parents[1]/'fullcheck-harness/resume3/harness.py'
# This is the explicitly bound source, not the inherited baseline body.
core=core_path.read_bytes()
base_expected=[{'pid':100+i,'start':'old-'+str(i),'commHash':'a','argvHash':'b','executableHash':'c','executableFileHash':'d'} for i in range(6)]
base_changed=[{**x,'pid':x['pid']+1000,'start':'REPLACED-'+x['start']} for x in base_expected]
good=json.dumps({'identities':base_expected}).encode();bad=json.dumps({'identities':base_changed}).encode()
for variant in ('valid','changed after earlier sourcehash','missing pin','wrong bound path','unexpected reader target'):
    n=definitions();events=[];parses=[];calls=[0]
    original_digest=n['digest'];n['digest']=lambda raw:n['BASELINE_SHA'] if raw==good else original_digest(raw)
    def body(path,mode=None):
        if path==n['CORE']:return core
        events.append(str(path));calls[0]+=1
        return bad if variant=='changed after earlier sourcehash' and calls[0]>1 else good
    n['safe_bytes']=body;n['load_fixed_module']=lambda *a:types.SimpleNamespace()
    plan={'baselinePath':n['BASELINE_PATH'],'immutableHelpers':{n['BASELINE_PATH']:n['BASELINE_SHA']}}
    if variant=='missing pin':plan['immutableHelpers']={}
    if variant=='wrong bound path':plan['baselinePath']='UNBOUND.json'
    b={'plan':plan};scope,_=n['helpers'](b)
    selected=base_changed if variant=='changed after earlier sourcehash' else base_expected
    rows={x['pid']:{'pid':x['pid'],'start':x['start'],'projectMarkerCandidate':False} for x in selected}
    scope.update(table=lambda:rows,identity=lambda row:next(dict(x,identityComplete=True) for x in selected if x['pid']==row['pid']),capture=lambda *a:'',utc=lambda:'synthetic')
    scope['json']=types.SimpleNamespace(loads=lambda raw:(parses.append(raw),json.loads(raw))[1])
    if variant=='changed after earlier sourcehash':assert n['digest'](body(n['ROOT']/n['BASELINE_PATH']))==n['BASELINE_SHA']
    if variant=='unexpected reader target':
        fn=lambda:scope['regular'](n['ROOT']/'UNBOUND.json')
    else:
        fn=lambda:scope['boundary_inventory'](plan)
    check('actual CORE baseline '+variant,fn,variant!='valid')
    if variant=='valid':assert parses==[good]
    else:assert parses==[]
    if variant in ('missing pin','wrong bound path','unexpected reader target'):assert events==[]

# Compare all reached interpretation sites against the declared barrier set.
# This assertion rejects a future added JSON/AST/code consumer without a map.
source=ast.parse((HERE/'failed_resource.py').read_text())
class Consumers(ast.NodeVisitor):
    def __init__(self):self.stack=[];self.items=[]
    def visit_FunctionDef(self,node):
        self.stack.append(node.name);self.generic_visit(node);self.stack.pop()
    def visit_Call(self,node):
        name=ast.unparse(node.func)
        if name in ('json.loads','ast.parse','compile','exec'):self.items.append(('/'.join(self.stack),name,node.lineno))
        self.generic_visit(node)
consumer=Consumers();consumer.visit(source)
barriers={'bootstrap','verified_read','local','load_fixed_module','load_authority','load_authority/verified_json','helpers'}
check('all runtime interpretation sites explicitly covered',lambda:pred['need']({x[0] for x in consumer.items}<=barriers and all(x[0] for x in consumer.items),'UNMAPPED_CONSUMER'))
check('generic unverified read API removed',lambda:pred['need'](not any(isinstance(x,ast.FunctionDef) and x.name=='read' for x in source.body),'UNVERIFIED_READER'))

# Exact old source-observer PLAN hash/parse prefix through the new verified
# returned-buffer reader. This closes the second reused parser boundary.
old_gate=HERE.parents[1]/'c8-fullcheck-prep/resume3/control/unlock_gate.py'
old_source=old_gate.read_bytes();assert sha(old_source)=='56020d0d3123339587bcf9e0a7f6968efe125a07a4331d9710b2a3be678d021e'
old_observer=next(x for x in ast.parse(old_source).body if isinstance(x,ast.FunctionDef) and x.name=='observe_source')
for variant in ('valid','wrong first','changed second'):
    n=definitions();plan_hash='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673';good_plan=b'{"plan":"VERIFIED"}';bad_plan=b'{"path":"NEVER_TOUCH"}';reads=[0];parsed_plans=[]
    n['digest']=lambda raw:plan_hash if raw==good_plan else sha(raw)
    def raw_plan(path):
        reads[0]+=1;return bad_plan if variant=='wrong first' or variant=='changed second' and reads[0]>1 else good_plan
    n['safe_bytes']=raw_plan;plan_path=PurePosixPath('/synthetic-plan.json')
    verified=lambda path:n['verified_bytes']({'loaded':{}},path,{str(plan_path):plan_hash})
    parse_scope={'PLAN':plan_path,'PLAN_SHA':plan_hash,'safe_bytes':verified,'digest':n['digest'],'need':pred['need'],'json':types.SimpleNamespace(loads=lambda raw:(parsed_plans.append(raw),json.loads(raw))[1])}
    def prefix():exec(compile(ast.Module(body=old_observer.body[:2],type_ignores=[]),'<exact-observe_source-PLAN-prefix>','exec'),parse_scope)
    check('old PLAN actual parse barrier '+variant,prefix,variant!='valid')
    assert parsed_plans==([good_plan] if variant=='valid' else [])

# Actual observe, both controller PIDs and BOTH censuses. Postclose unrelated
# reuse is allowed; any new client child/listener at the same number HOLDs.
for role in ('wrapper','shell'):
 for variant in ('clean','unrelated reuse','client child initial','client child final','listening child','prior-client unrelated reuse'):
    n=definitions()
    class U(PurePosixPath):
        def exists(self):return False
        def is_symlink(self):return False
    class Lock:
        def with_name(self,name):return self
        def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
    pin={'wrapperPid':10,'wrapperStart':'old-wrapper','shellPid':11,'shellStart':'old-shell','lockDevInode':[1,2]};reused=pin[role+'Pid']
    base_rows={12:{'pid':12,'ppid':99,'start':'new-client','projectMarkerCandidate':False},99:{'pid':99,'ppid':1,'start':'outer','projectMarkerCandidate':False},90:{'pid':90,'ppid':12,'start':'probe','projectMarkerCandidate':False}}
    calls=[0]
    def table():
        calls[0]+=1;rows=copy.deepcopy(base_rows)
        if variant!='clean' and (variant!='client child final' or calls[0]>=3):rows[reused]={'pid':reused,'ppid':12 if variant in ('client child initial','client child final','listening child') else 1,'start':'NEW_UNBOUND_IDENTITY','projectMarkerCandidate':False}
        return rows
    listeners=[{'pid':reused,'port':8080}] if variant in ('listening child','prior-client unrelated reuse') else []
    boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':listeners}
    scope={'table':table,'project_role':lambda pid:None,'boundary_inventory':lambda plan:boundary}
    owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
    clients=[{'pid':12,'start':'new-client'}]+([{'pid':reused,'start':'PRIOR_CLIENT_OLD_IDENTITY'}] if variant=='prior-client unrelated reuse' else [])
    n.update(UNIT=U('/unit'),helpers=lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE'])),verified_read=lambda b,path:{'ownedIdentities':owned} if str(path).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}},inventory_clients=lambda b,rows:(clients,[]),safe_bytes=lambda *a:b'',os=types.SimpleNamespace(getpid=lambda:12,open=lambda *a:7,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),close=lambda *a:None,O_RDONLY=0,O_NOFOLLOW=1),fcntl=types.SimpleNamespace(flock=lambda *a:None,LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),time=types.SimpleNamespace(time=lambda:100))
    b={'custody':p['h']['MemCustody'](),'pin':pin,'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
    check('postclose actual observe '+role+' '+variant,lambda:n['observe'](b,True),variant in ('client child initial','client child final','listening child'))

# Held-mode exemption helper accepts only exact original identities.
n=definitions();pin={'wrapperPid':10,'wrapperStart':'W','shellPid':11,'shellStart':'S'}
check('held exact controller exemptions',lambda:pred['need'](n['controller_exemptions']({10:{'start':'W'},11:{'start':'S'}},pin,False)=={10,11},'EXEMPTIONS'))
check('held recycled numbers not exempt',lambda:pred['need'](n['controller_exemptions']({10:{'start':'new'},11:{'start':'new'}},pin,False)==set(),'EXEMPTIONS'))
check('postclose no controller exemption even same start',lambda:pred['need'](n['controller_exemptions']({10:{'start':'W'},11:{'start':'S'}},pin,True)==set(),'EXEMPTIONS'))

# Root05 proves requested BIN -> origargv APP/report BIN/process APP. Test
# exact roles with a supplied binary/hash oracle; no tool executable is read.
fact=json.loads((HERE.parent/'root-external-prospective-tool-bindings-05.json').read_text())
roles={'launch':fact['requestedLaunch'],'reported':fact['reportedBinary'],'process':fact['mappedProcessBinary'],'observedArgument':fact['mappedProcessBinary']}
class RolePath(PurePosixPath):
    def resolve(self):return self
for variant in ('root05 positive','origargv wrongly BIN','wrong origargv alias','wrong reported','wrong process role','missing observed role'):
    n=definitions();rr=copy.deepcopy(roles);n['Path']=RolePath
    if variant=='wrong process role':rr['process']={'path':'/wrong/process','sha256':'0'*64}
    if variant=='missing observed role':rr.pop('observedArgument')
    argv=roles['reported']['path'] if variant=='origargv wrongly BIN' else '/wrong/alias' if variant=='wrong origargv alias' else roles['observedArgument']['path']
    n['sys']=types.SimpleNamespace(executable='/wrong/reported' if variant=='wrong reported' else roles['reported']['path'],orig_argv=[argv])
    n['digest']=lambda raw:roles['process']['sha256'] if raw==b'APP' else roles['reported']['sha256'] if raw==b'BIN' else sha(raw)
    n['external_buffer']=lambda path:b'APP' if path==roles['process']['path'] else b'BIN'
    check('root05 launch/reexec '+variant,lambda:n['validate_python_roles']({'pythonRoles':rr}),variant!='root05 positive')

# Requested launch provenance is root guard/operator evidence, not origargv.
# The prior full five-client flow has these concrete synthetic root fields.
h=p['h'];valid_files=copy.deepcopy(h['pre_final_files'])
for field,value in (('configuredLaunchInspected',False),('exactOperatorCommandEvidence',[]),('configuredLaunch',{'path':'WRONG','sha256':'0'*64})):
    n=definitions();files=copy.deepcopy(valid_files);ad=json.loads(files['root-admission.json']);ad[field]=value;files['root-admission.json']=json.dumps(ad).encode()
    check('configured launch authority '+field,lambda:n['validate_admission']({'custody':h['MemCustody'](files),'sha':'e'*64,'pin':{'shellPid':11},'a':h['b']['a']}),True)
# Full flow uses a fresh process-context b per command, shared immutable fake
# files, distinct clients and NONEMPTY per-client utility journals.
n=definitions();h=p['h'];storage=h['MemCustody']();pid=[50];events=[]
who=h['who'];a=copy.deepcopy(h['b']['a']);retained=copy.deepcopy(h['l']['retained'])
storage.files['input-pins.json']=json.dumps({'retainedContract':retained}).encode()
n['os']=types.SimpleNamespace(getpid=lambda:pid[0],getppid=lambda:11);n['time']=types.SimpleNamespace(time=lambda:100.0)
def capture(b,cmd,allowed=(0,)):
    b['utilityCounter']+=1
    item={'kind':'SYNCHRONOUS_BOUND_OBSERVATION_UTILITY','client':copy.deepcopy(b['client']),'releaseSha256':b['sha'],'pid':900+b['utilityCounter'],'command':cmd,'executableSha256':'c'*64,'terminal':True,'status':0,'allowedStatuses':list(allowed),'stdoutComplete':True,'stderrComplete':True,'stderrEmpty':True}
    b['utilities'].append(item)
    if b.get('clientBound') is True:n['write_new'](b,'utility-'+str(pid[0])+'-'+sha(b['client']['start'].encode())[:16]+'-'+str(b['utilityCounter'])+'.json',item)
    return who(pid[0])['start'] if cmd[-1]=='lstart=' else 'python fixture'
n['utility_capture']=capture;n['helpers']=lambda b:({'table':lambda:{pid[0]:who(pid[0])}},None);n['client_identity']=lambda b,scope,row:who(pid[0])
def observe(b,post=False):
    clients,prior=n['inventory_clients'](b,{pid[0]:who(pid[0])});live=copy.deepcopy(h['l']['live']);live.update(priorClientsLive=prior,clientIdentities=clients);return live
n['observe']=observe
def fresh():return {'a':copy.deepcopy(a),'sha':'e'*64,'loaded':{},'custody':storage,'pin':{'shellPid':11},'retained':copy.deepcopy(retained),'utilities':[],'utilityCounter':0}
def flow():
    for mode,num in (('gate',50),('held-proof',51),('final',52),('gate',53),('postclose',54)):
        pid[0]=num;b=fresh();n['register_client'](b,mode);status=0
        try:n['operate'](b,mode,1 if mode in ('gate','held-proof') else None)
        except Exception as error:
            assert type(error).__name__=='Hold' and num==50 and str(error)=='MISSING_READINESS';status=1
        assert status==(1 if num==50 else 0)
        assert len(b['utilities'])==2
        events.append({'mode':mode,'pid':num,'status':status,'utilityJournals':len(b['utilities'])})
        if mode=='held-proof':
            ad=copy.deepcopy(h['l']['ad']);ad.update(activeLockSha256=n['PIN'],negativeDenialSha256=sha(storage.read('negative-readiness-denial.json')),heldProofSha256=sha(storage.read('held-proof.json')),heldProofActualStatus=0,heldProofSeparateStatusCaptured=True,configuredLaunch=a['pythonRoles']['launch'],configuredLaunchInspected=True,exactOperatorCommandEvidence=['SYNTHETIC_ROOT_INSPECTED_GUARD_AND_EXACT_BIN_COMMAND'])
            storage.write('root-admission.json',ad)
        if mode=='final':
            permit=copy.deepcopy(h['l']['p']);permit.update(readinessSha256=sha(storage.read('readiness.json')),issuedAtEpoch=100);storage.write('permit.json',permit)
        if mode=='gate' and num==53:storage.write('root-wrapper-result.json',{'actualWrapperExit':1,'separatelyCaptured':True,'releaseSha256':'e'*64,'gateAllowSha256':sha(storage.read('gate-allow.json'))})
    assert len([x for x in storage.files if x.startswith('client-')])==5
    assert len([x for x in storage.files if x.startswith('utility-')])==10
    assert 'postclose.json' in storage.files
check('fresh-context five-client full flow with ten utility journals',flow)
result={'scope':'FOCUSED_CODE04_GUARDED_ACTUAL_DEFINITION_FAKE_PAIRS','priorCases':228,'newCases':len(checks),'total':228+len(checks),'passed':228+len(checks),'failed':0,'baselineBodyRead':False,'actualRuntimeImportsMainsOsNativePrivateActions':0,'cases':checks,'freshFiveClientFlow':events,'runtimeInterpretationSites':[{'function':f,'consumer':c,'line':ln} for f,c,ln in consumer.items]}
with (HERE/'focused-check-results.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({k:result[k] for k in ('priorCases','newCases','total','passed','failed')}))

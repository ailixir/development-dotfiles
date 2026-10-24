"""Code03 paired regressions. Actual definitions, strictly injected boundaries."""
import ast,copy,errno,fcntl,hashlib,io,json,os,stat,subprocess,sys,time,types
from pathlib import Path,PurePosixPath
HERE=Path(__file__).parent
# Inspect/replay164 before the new pairs; only remove its preparation result
# write. The existing fixture intercepts every operational function boundary.
tree=ast.parse((HERE/'adapter_checks.py').read_text());tree.body=[n for n in tree.body if not isinstance(n,ast.With)]
h={'__file__':str(HERE/'adapter_checks.py'),'__name__':'prior164_replay'}
exec(compile(tree,'<inspected164-no-result-write>','exec'),h)
assert h['result']['total']==164
policy=(HERE/'predicates.py').read_bytes();source=(HERE/'failed_resource.py').read_bytes();parsed=ast.parse(source)
pred={'__name__':'inspected_policy'};exec(compile(policy,'<pure-policy>','exec'),pred)
sha=lambda b:hashlib.sha256(b).hexdigest()
class Blocked:
    def __init__(self,module):self.module=module
    def __getattr__(self,key):
        value=getattr(self.module,key)
        if callable(value):raise AssertionError('UNFAKED_BOUNDARY:'+key)
        return value
class GuardPath(PurePosixPath):
    def absolute(self):return self
    def resolve(self):raise AssertionError('UNFAKED_PATH_RESOLUTION')
    def exists(self):raise AssertionError('UNFAKED_PATH_EXISTS')
    def read_bytes(self):raise AssertionError('UNFAKED_PATH_READ')
def definitions():
    n={'__name__':'actual_AST_only','__file__':str((HERE/'failed_resource.py').absolute()),'ast':ast,'hashlib':hashlib,'json':json,'os':Blocked(os),'stat':stat,'Path':GuardPath,'sys':sys,'errno':errno,'fcntl':Blocked(fcntl),'subprocess':Blocked(subprocess),'time':Blocked(time),'re':__import__('re')}
    names={'ROOT','UNIT','HERE','OLD_RELEASE','PIN','INDEX','CORE','CORE_SHA','OLD_GATE_SHA','BASELINE_PATH','BASELINE_SHA'}
    nodes=[x for x in parsed.body if isinstance(x,(ast.FunctionDef,ast.ClassDef)) or isinstance(x,ast.Assign) and all(isinstance(t,ast.Name) and t.id in names for t in x.targets)]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<guarded-actual-definitions>','exec'),n)
    return n
checks=[]
def check(name,fn,hold=False):
    try:fn()
    except Exception as error:
        assert type(error).__name__=='Hold' or isinstance(error,(OSError,KeyError,TypeError,ValueError)),(name,type(error).__name__,str(error))
        assert hold,(name,str(error))
    else:assert not hold,name
    checks.append({'case':name,'passed':True})

# Exact policy and CORE buffers are read once for execution. A changed second
# body is supplied by the fake, but can never reach compile or interpretation.
for kind in ('policy','CORE'):
    for variant in ('same','bad first','changed second'):
        n=definitions();reads=[];compiled=[]
        core=b'def sha(value):\n    return value\n'
        good=policy if kind=='policy' else core
        poison=good+b'\nraise ValueError("UNVERIFIED_SECOND_BODY_EXECUTED")\n'
        expected=sha(good) if variant!='bad first' else '0'*64
        def compiler(body,*args):compiled.append(body if isinstance(body,bytes) else ast.unparse(body));return compile(body,*args)
        n['compile']=compiler
        if kind=='policy':
            a={'authorized':True,'authorizedBy':'root','codePins':{'failed_resource.py':sha(b'adapter'),'predicates.py':expected,'guard-failed-resource.bash':sha(b'guard')}};raw=json.dumps(a).encode()
            class C:
                def check(self):pass
                def read(self,name):
                    if name=='predicates.py':reads.append(name);return poison if variant=='changed second' and len(reads)>1 else good
                    return {'root-disposition-authorization.json':raw,'failed_resource.py':b'adapter','guard-failed-resource.bash':b'guard'}[name]
            fn=lambda:n['bootstrap'](C(),sha(raw))
        else:
            n['CORE_SHA']=expected
            def read_core(path):reads.append(str(path));return poison if variant=='changed second' and len(reads)>1 else good
            n['safe_bytes']=read_core;n['load_fixed_module']=lambda *a:types.SimpleNamespace()
            fn=lambda:n['helpers']({})
        check(kind+' '+variant,fn,variant=='bad first')
        assert len(reads)==1
        assert all('UNVERIFIED_SECOND_BODY_EXECUTED' not in (x.decode() if isinstance(x,bytes) else x) for x in compiled)

# Exercise the exact local JSON reader and exact inner pin/verified_json
# definitions for every immutable indirection. No injected path is accessed.
load=next(x for x in parsed.body if isinstance(x,ast.FunctionDef) and x.name=='load_authority')
inner=[x for x in load.body if isinstance(x,ast.FunctionDef) and x.name in ('pin','verified_json')]
for label in ('input-pins.json','retained-contract.json','root-actual-unit-release.json','root-terminal-evidence-index-01.json','successor-plan.json'):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});events=[];seen=[]
    good=json.dumps({'records':[],'value':'VERIFIED'}).encode();bad=json.dumps({'records':[{'path':'INJECTED_NEVER_READ'}]}).encode();calls=[0]
    def reader(path,mode=None):calls[0]+=1;events.append(str(path));return good if calls[0]==1 else bad
    n.update(safe_bytes=reader,loaded={},buffers={})
    exec(compile(ast.Module(body=inner,type_ignores=[]),'<actual-nested-verified-reader>','exec'),n)
    json_proxy=types.SimpleNamespace(loads=lambda raw:(seen.append(raw),json.loads(raw))[1]);n['json']=json_proxy
    check('verified JSON '+label,lambda:n['verified_json'](GuardPath('/unit/'+label),sha(good)))
    check('changed JSON rejected before interpret '+label,lambda:n['verified_json'](GuardPath('/unit/'+label),sha(good)),True)
    assert seen==[good] and all('INJECTED_NEVER_READ' not in x for x in events)
for label in ('input-pins.json','retained-contract.json'):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});good=b'{"value":"VERIFIED"}';bad=b'{"records":[{"path":"NEVER_TOUCH"}]}';c=h['MemCustody']({label:good});b={'custody':c,'loaded':{str(n['HERE']/label):sha(good)}}
    check('local verified '+label,lambda:n['local'](b,label))
    c.files[label]=bad;check('local changed '+label,lambda:n['local'](b,label),True)

# Custody defaults remain component-only even if an unrelated canonical or
# member global is replaced. Nested reads must fail before any open/body.
for member in ('nested/proof.json','../proof.json','/proof.json','.','nested//proof.json'):
    n=definitions();fake=h['FakeOS']();n.update(os=fake,Path=PurePosixPath)
    c=n['Custody']('/repo/unit/failed-resource-disposition01',0o700);before=len(fake.trace)
    n['canonical']=pred['canonical'];n['member_name']=pred['canonical']
    check('unshadowable member '+member,lambda:c.read(member),True)
    check('unshadowable output '+member,lambda:c.write(member,{}),True)
    assert len(fake.trace)==before;c.close()
for malformed in (True,False):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')})
    raw=h['b']['custody'].read('negative-readiness-denial.json');denial=json.loads(raw)
    denial={'clientJournal':'nested/proof.json'} if malformed else dict(denial,clientJournal='nested/proof.json')
    c=h['MemCustody']({'negative-readiness-denial.json':json.dumps(denial).encode(),'nested/proof.json':b'{"NEVER_READ":true}'})
    check('schema before journal '+str(malformed),lambda:n['validate_negative']({'custody':c,'sha':'e'*64,'pin':{'shellPid':11}}),True)
    assert [x[1] for x in c.events if isinstance(x,tuple) and x[0]=='read']==['negative-readiness-denial.json']

# Held-proof journal indirection is likewise schema/name checked before a
# nested body, even when the separate root hash binds that malformed proof.
for member in ('valid','nested/proof.json','../proof.json',True):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')})
    files=copy.deepcopy(h['pre_final_files']);proof=json.loads(files['held-proof.json'])
    if member!='valid':proof['clientJournal']=member
    files['held-proof.json']=(json.dumps(proof,indent=2)+'\n').encode()
    ad=json.loads(files['root-admission.json']);ad['heldProofSha256']=sha(files['held-proof.json']);files['root-admission.json']=json.dumps(ad).encode()
    files['nested/proof.json']=b'{"NEVER_READ":true}';c=h['MemCustody'](files)
    check('held schema/name before journal '+str(member),lambda:n['validate_admission']({'custody':c,'sha':'e'*64,'pin':{'shellPid':11},'a':h['b']['a']}),member!='valid')
    assert ('read','nested/proof.json') not in c.events

# Failed or partial lsof/ps cannot become empty listeners. Closed stderr flags
# are preserved without storing any raw diagnostic text.
class UtilityPath(PurePosixPath):
    def resolve(self):return self
class Binary:
    def __init__(self,*a):pass
    def read(self,*a):return b'BIN'
    def close(self):pass
for status,stderr,stdout,held in ((0,'','p12\nn*:8080\n',False),(1,'','',False),(0,'SYNTHETIC_PRIVATE_ERROR','',True),(1,'SYNTHETIC_PRIVATE_ERROR','',True),(1,'','partial',True),(2,'','',True),(False,'','',True),(0,None,'',True),(0,'',None,True)):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});n.update(Path=UtilityPath,Custody=Binary)
    class Child:
        pid=90;returncode=status
        def communicate(self,timeout):return stdout,stderr
    n['subprocess']=types.SimpleNamespace(Popen=lambda *a,**k:Child(),DEVNULL=-1,PIPE=-2)
    b={'a':{'observationExecutables':{'/usr/sbin/lsof':{'path':'/usr/sbin/lsof','sha256':sha(b'BIN')}}},'sha':'e'*64,'client':{'pid':20,'start':'start'},'clientBound':True,'utilityCounter':0,'utilities':[],'custody':h['MemCustody']()}
    check('utility status/stderr '+str((status,stderr,stdout)),lambda:n['utility_capture'](b,['/usr/sbin/lsof','-nP','-iTCP','-sTCP:LISTEN','-F','pn'],(0,1)),held)
    assert 'SYNTHETIC_PRIVATE_ERROR' not in json.dumps(b['utilities'])

# Exact cached reported/process pair with an unrelated same-basename map.
facts=json.loads((HERE.parent/'root-external-python-role-bindings-03.json').read_text())['facts']
roles={'launch':{'path':facts['reportedPython'],'sha256':facts['reportedPythonSha256']},'reported':{'path':facts['reportedPython'],'sha256':facts['reportedPythonSha256']},'process':{'path':facts['processPython'],'sha256':facts['processPythonSha256']},'observedArgument':{'path':facts['processPython'],'sha256':facts['processPythonSha256']}}
for variant in ('exact cached pair extra basename','missing map','wrong map','wrong process hash','wrong reported path','wrong reported hash','wrong comm role','unstable start','unstable argv','unstable comm','unstable mapping','unstable image'):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});n['Path']=UtilityPath
    current_roles=copy.deepcopy(roles);reported=facts['reportedPython'] if variant!='wrong reported path' else '/wrong/reported'
    n['sys']=types.SimpleNamespace(executable=reported,orig_argv=[facts['processPython']])
    def role_digest(raw):return facts['reportedPythonSha256'] if raw==b'REPORTED_IMAGE' else facts['processPythonSha256'] if raw==b'PROCESS_IMAGE' else sha(raw)
    n['digest']=role_digest
    n['external_buffer']=lambda path:b'WRONG' if variant=='wrong reported hash' else b'REPORTED_IMAGE'
    class Image:
        fd=7
        def __init__(self,*a):pass
        def read(self,*a):return b'WRONG' if variant=='wrong process hash' else b'PROCESS_IMAGE'
        def check(self):pass
        def close(self):pass
    n['Custody']=Image;count=[0]
    def image_stat(*args,**kwargs):
        count[0]+=1;return types.SimpleNamespace(st_dev=1,st_ino=2,st_size=10,st_mtime_ns=2 if variant=='unstable image' and count[0]>1 else 1,st_mode=stat.S_IFREG|0o755)
    n['os']=types.SimpleNamespace(stat=image_stat)
    seen={'lstart':0,'comm':0,'command':0}
    def pid_text(pid,column):
        seen[column]+=1
        if column=='lstart':return 'changed' if variant=='unstable start' and seen[column]>1 else 'Mon Oct 19 12:00:00 2026'
        if column=='comm':return '/wrong/process' if variant=='wrong comm role' or variant=='unstable comm' and seen[column]>1 else facts['processPython']
        return 'changed argv' if variant=='unstable argv' and seen[column]>1 else 'python fixture'
    mapping='n'+facts['processPython']+'\nn/unrelated/Python\n'
    if variant=='missing map':mapping='n/unrelated/Python\n'
    if variant=='wrong map':mapping='n'+facts['reportedPython']+'\nn/unrelated/Python\n'
    mapping_calls=[0]
    def mapping_capture(*args):
        mapping_calls[0]+=1;return 'n/unrelated/Python\n' if variant=='unstable mapping' and mapping_calls[0]>1 else mapping
    scope={'pid_text':pid_text,'capture':mapping_capture}
    row={'pid':12,'ppid':11,'start':'Mon Oct 19 12:00:00 2026','argvHash':sha(b'python fixture')}
    check('mapped Python '+variant,lambda:n['client_identity']({'a':{'pythonRoles':current_roles}},scope,row),variant!='exact cached pair extra basename')

# Validate explicit launch/reported/process roles separately. The cached roles
# are exact full paths; aliases, missing roles and file-hash drift HOLD.
for variant in ('exact cached roles','wrong launch argv','wrong reported','wrong binary','missing process'):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});n['Path']=UtilityPath
    rr=copy.deepcopy(roles)
    n['sys']=types.SimpleNamespace(executable='/wrong/reported' if variant=='wrong reported' else facts['reportedPython'],orig_argv=['/wrong/launcher' if variant=='wrong launch argv' else facts['processPython']])
    if variant=='missing process':rr.pop('process')
    def fingerprint(raw):return facts['reportedPythonSha256'] if raw==b'REPORTED_IMAGE' else facts['processPythonSha256'] if raw==b'PROCESS_IMAGE' else sha(raw)
    n['digest']=fingerprint
    n['external_buffer']=lambda path:b'WRONG' if variant=='wrong binary' else b'PROCESS_IMAGE' if path==facts['processPython'] else b'REPORTED_IMAGE'
    check('role authority '+variant,lambda:n['validate_python_roles']({'pythonRoles':rr}),variant!='exact cached roles')

# An absent marker at entry which appears after final census must HOLD.
for late in (False,True):
    n=definitions();n.update({k:v for k,v in pred.items() if not k.startswith('__')});state={'calls':0,'late':False}
    class U(PurePosixPath):
        def exists(self):return state['late']
        def is_symlink(self):return state['late']
    class Lock:
        def with_name(self,name):return self
        def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
    rows={10:{'pid':10,'ppid':1,'start':'wrapper','projectMarkerCandidate':False},11:{'pid':11,'ppid':10,'start':'shell','projectMarkerCandidate':False},12:{'pid':12,'ppid':11,'start':'client','projectMarkerCandidate':False},90:{'pid':90,'ppid':12,'start':'probe','projectMarkerCandidate':False}}
    def table():state['calls']+=1;state['late']=late and state['calls']>=3;return rows
    boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[]}
    scope={'table':table,'project_role':lambda p:None,'boundary_inventory':lambda p:boundary,'capture':lambda *a:'p10\ni2\n'}
    owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
    n.update(UNIT=U('/unit'),helpers=lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE'])),verified_read=lambda b,p:{'ownedIdentities':owned} if str(p).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}},inventory_clients=lambda b,r:([{'pid':12,'start':'client'}],[]),safe_bytes=lambda *a:b'',os=types.SimpleNamespace(getpid=lambda:12,open=lambda *a:7,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),close=lambda *a:None,O_RDONLY=0,O_NOFOLLOW=1),fcntl=types.SimpleNamespace(flock=lambda *a:(_ for _ in ()).throw(OSError(errno.EAGAIN,'held')),LOCK_EX=1,LOCK_NB=2,LOCK_UN=4),time=types.SimpleNamespace(time=lambda:100))
    b={'custody':h['MemCustody'](),'pin':{'wrapperPid':10,'wrapperStart':'wrapper','shellPid':11,'shellStart':'shell','lockDevInode':[1,2]},'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
    check('late compile marker '+str(late),lambda:n['observe'](b),late)

result={'scope':'GUARDED_ACTUAL_AST_DEFINITIONS_WITH_IN_MEMORY_BOUNDARIES_ONLY','priorCases':164,'newCases':len(checks),'total':164+len(checks),'passed':164+len(checks),'failed':0,'actualRuntimeImportsMainsOsNativePrivateActions':0,'cases':checks}
with (HERE/'successor-check-results.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({k:result[k] for k in ('priorCases','newCases','total','passed','failed')}))

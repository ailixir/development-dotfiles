"""Inspected real adapter definitions exercised only with synthetic boundaries."""
import ast,copy,hashlib,io,json,stat,types
from pathlib import Path,PurePosixPath
HERE=Path(__file__).parent
pred={'__name__':'synthetic_verified_predicates'}
exec(compile((HERE/'predicates.py').read_bytes(),'<inspected-pure-policy>','exec'),pred)
ns={'__name__':'synthetic_adapter_definitions','__file__':str((HERE/'failed_resource.py').absolute())}
exec(compile((HERE/'failed_resource.py').read_bytes(),'<inspected-adapter-definitions-no-main>','exec'),ns)
ns.update({k:v for k,v in pred.items() if not k.startswith('__')})
original=dict(ns); results=[]
def check(name,fn,held=False):
    try:fn()
    except Exception as error:
        assert isinstance(error,(OSError,KeyError,TypeError,ValueError)) or type(error).__name__=='Hold',(name,type(error).__name__)
        assert held,name
    else:assert not held,name
    results.append({'check':name,'passed':True})

# Replay the exact 97 legacy semantics; only its exclusive output write/import
# is removed, plus its declared mode-list adaptation includes held-proof.
legacy=ast.parse((HERE/'pure_checks.py').read_text())
legacy.body=[n for n in legacy.body if not isinstance(n,ast.With) and not (isinstance(n,ast.ImportFrom) and n.module=='predicates')]
l={**pred,'__file__':str(HERE/'pure_checks.py')}
exec(compile(legacy,'<legacy97-no-output>','exec'),l)
assert len(l['checks'])==97

control={'control/unlock_gate.py','control/guard-exit.bash','control/policy.json','control/final_verifier.py','control/postclose.py'}
check('actual five-member original control accepted',lambda:ns['original_membership'](control,control))
check('missing .bash rejected',lambda:ns['original_membership'](control-{'control/guard-exit.bash'},control),True)
check('extra .bash rejected',lambda:ns['original_membership'](control|{'control/extra.bash'},control),True)

# Real descriptor custody with an in-memory OS. No real file descriptor, path
# enumeration, file write, process or kernel action is used in these cases.
class FakeOS:
    O_RDONLY=1;O_DIRECTORY=2;O_NOFOLLOW=4;O_WRONLY=8;O_CREAT=16;O_EXCL=32
    def __init__(self):
        self.nodes={};self.fds={};self.nextfd=10;self.trace=[];self.swap_on_write=False
        for i,p in enumerate(('/','/repo','/repo/unit','/repo/unit/failed-resource-disposition01')):self.nodes[p]=self.node(i+1,stat.S_IFDIR|0o700)
    def node(self,ino,mode,data=b''):return types.SimpleNamespace(st_dev=1,st_ino=ino,st_mode=mode,st_uid=42,st_size=len(data),st_mtime_ns=1,data=data)
    def path(self,name,dir_fd=None):
        if str(name).startswith('/'):return str(name)
        parent=self.fds[dir_fd][0];return parent.rstrip('/')+'/'+str(name)
    def open(self,name,flags,mode=None,dir_fd=None):
        p=self.path(name,dir_fd);self.trace.append(('open',p,dir_fd))
        if flags & self.O_CREAT:
            if p in self.nodes:raise FileExistsError(p)
            if self.swap_on_write:self.nodes['/repo/unit']=self.node(999,stat.S_IFLNK|0o777)
            n=self.node(100+len(self.nodes),stat.S_IFREG|mode);self.nodes[p]=n
        else:n=self.nodes[p]
        if stat.S_ISLNK(n.st_mode):raise OSError('NOFOLLOW')
        if flags & self.O_DIRECTORY and not stat.S_ISDIR(n.st_mode):raise OSError('NOTDIR')
        fd=self.nextfd;self.nextfd+=1;self.fds[fd]=(p,n);return fd
    def close(self,fd):self.fds.pop(fd,None)
    def fstat(self,fd):return self.fds[fd][1]
    def stat(self,name,dir_fd=None,follow_symlinks=False):
        p=self.path(name,dir_fd)
        if p not in self.nodes:raise FileNotFoundError(p)
        return self.nodes[p]
    def listdir(self,fd):self.trace.append(('enumerate',self.fds[fd][0]));return []
    def fdopen(self,fd,mode,closefd=False):
        node=self.fds[fd][1]
        class Stream(io.BytesIO):
            def __exit__(self,*args):node.data=self.getvalue();node.st_size=len(node.data);return False
        return Stream(node.data)
    def fsync(self,fd):pass

for scenario in ('unchanged','ancestor linked before open','ancestor replaced before enumeration','ancestor replaced before write','ancestor switched during write'):
    fake=FakeOS();ns['os']=fake
    if scenario=='ancestor linked before open':fake.nodes['/repo/unit']=fake.node(999,stat.S_IFLNK|0o777)
    def run():
        c=ns['Custody']('/repo/unit/failed-resource-disposition01',0o700)
        try:
            if scenario=='ancestor replaced before enumeration':fake.nodes['/repo/unit']=fake.node(999,stat.S_IFDIR|0o700)
            if scenario=='ancestor replaced before write':fake.nodes['/repo/unit']=fake.node(999,stat.S_IFLNK|0o777)
            c.members()
            if scenario=='ancestor switched during write':fake.swap_on_write=True
            c.write('proof.json',{'synthetic':True})
        finally:c.close()
    check('custody '+scenario,run,scenario!='unchanged')
    if scenario=='ancestor linked before open':assert not any(x[0]=='enumerate' for x in fake.trace)
    if scenario=='ancestor replaced before write':assert not any(x[0]=='open' and x[1].endswith('proof.json') for x in fake.trace)
    if scenario=='ancestor switched during write':assert all('/other' not in x[1] for x in fake.trace if x[0]=='open')
ns['os']=original['os']

class MemCustody:
    def __init__(self,files=None):self.files=files or {};self.events=[];self.moved=False
    def check(self):
        self.events.append('check');pred['need'](not self.moved,'MOVED')
    def read(self,name,mode=0o600):self.check();self.events.append(('read',name));return self.files[name]
    def members(self):self.check();self.events.append('enumerate');return list(self.files)
    def absent(self,name):self.check();return name not in self.files
    def write(self,name,value):
        self.check()
        if name in self.files:raise FileExistsError(name)
        self.files[name]=(json.dumps(value,indent=2)+'\n').encode()
    def close(self):pass

for good in (True,False):
    marker=[];body=b"EXECUTED.append('verified')\n";raw=json.dumps({'authorized':True,'authorizedBy':'root','codePins':{'failed_resource.py':pred['digest'](b'code'),'predicates.py':pred['digest'](body) if good else '0'*64,'guard-failed-resource.bash':pred['digest'](b'guard')}}).encode()
    c=MemCustody({'root-disposition-authorization.json':raw,'failed_resource.py':b'code','predicates.py':body,'guard-failed-resource.bash':b'guard'})
    # Actual bootstrap's exec receives a fake policy with marker side effect.
    # The code is executed only after all three body pins pass; wrong hash is
    # paired with a real policy body to avoid expected missing exports.
    valid=(HERE/'predicates.py').read_bytes();payload=b"import builtins\nbuiltins._c8_synthetic_marker.append('executed')\n"+valid
    import builtins
    builtins._c8_synthetic_marker=marker
    c.files['predicates.py']=payload;a=json.loads(raw);a['codePins']['predicates.py']=pred['digest'](payload) if good else '0'*64;c.files['root-disposition-authorization.json']=json.dumps(a).encode()
    check('dependency '+('verified executes' if good else 'bad pin never executes'),lambda:ns['bootstrap'](c,pred['digest'](c.files['root-disposition-authorization.json'])),not good)
    assert marker==(['executed'] if good else [])
    del builtins._c8_synthetic_marker
ns.update({k:v for k,v in pred.items() if not k.startswith('__')})

# Real utility capture with fake executable custody and fake Popen/wait. All
# commands/child terminal receipts are exercised without launching a process.
class UtilityPath(PurePosixPath):
    def resolve(self):return self
class BinaryCustody:
    def __init__(self,*args):pass
    def read(self,*args):return b'BIN'
    def close(self):pass
for variant in ('success','bad binary','bool status','bool pid','timeout','nonzero','allowed nonzero'):
    b={'a':{'observationExecutables':{'/bin/ps':{'path':'/bin/ps','sha256':pred['digest'](b'BIN') if variant!='bad binary' else '0'*64}}},'sha':'e'*64,'client':{'pid':20,'start':'start'},'clientBound':True,'utilityCounter':0,'utilities':[],'custody':MemCustody()}
    class Child:
        pid=True if variant=='bool pid' else 90
        returncode=False if variant=='bool status' else 1 if variant in ('nonzero','allowed nonzero') else 0
        def communicate(self,timeout):
            if variant=='allowed nonzero':return ('','')
            if variant=='timeout':raise TimeoutError('synthetic unknown wait')
            return ('90 20 Mon Oct 19 12:00:01 2026 /bin/ps -ww -axo pid=,ppid=,lstart=,command=','')
    ns['Path']=UtilityPath;ns['Custody']=BinaryCustody
    ns['subprocess']=types.SimpleNamespace(Popen=lambda *a,**k:Child(),DEVNULL=-1,PIPE=-2)
    allowed=(0,1) if variant=='allowed nonzero' else (0,)
    check('real utility capture '+variant,lambda b=b,allowed=allowed:original['utility_capture'](b,['/bin/ps','-ww','-p','999','-o','command='] if variant=='allowed nonzero' else ['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command='],allowed),variant not in ('success','allowed nonzero'))
    if variant=='timeout':assert next(iter(b['custody'].files.values())).find(b'"terminal": false')>=0
    if variant=='success':assert b['utilities'][0]['observedStart']=='Mon Oct 19 12:00:01 2026'
ns['Path']=original['Path'];ns['Custody']=original['Custody'];ns['subprocess']=original['subprocess']

# Full client registration integration, explicitly joins observed path/file to
# configured Python. Its utilities are synthetic supplied observations.
def who(pid):return {'pid':pid,'ppid':11,'start':'Mon Oct 19 12:00:00 2026','argvHash':pred['digest'](b'python fixture'),'commHash':'a'*64,'executableHash':pred['digest'](b'/configured/Python'),'executableFileHash':'b'*64,'identityComplete':True}
clock=[100.0];pid=[20];active_rows=[{}]
ns['os']=types.SimpleNamespace(getpid=lambda:pid[0],getppid=lambda:11)
ns['time']=types.SimpleNamespace(time=lambda:clock[0])
ns['utility_capture']=lambda b,cmd,allowed=(0,):who(pid[0])['start'] if cmd[-1]=='lstart=' else 'python fixture'
observed=[None]
ns['client_identity']=lambda b,scope,row:scope['identity'](row)
ns['helpers']=lambda b:({'table':lambda:{pid[0]:who(pid[0])},'identity':lambda row:observed[0] or who(pid[0])},None)
def newb():
    a=copy.deepcopy(l['a']);a.update(pythonExecutable='/configured/Python',pythonExecutableSha256='b'*64,pythonRoles={k:{'path':'/configured/Python','sha256':'b'*64} for k in ('launch','reported','process')},activeLockSha256=ns['PIN'])
    return {'a':a,'sha':'e'*64,'loaded':{},'custody':MemCustody(),'pin':{'shellPid':11},'retained':copy.deepcopy(l['retained']),'utilities':[]}
for bad in ('none','path','file','bool pid'):
    b=newb();observed[0]=who(pid[0])
    if bad=='path':observed[0]['executableHash']='0'*64
    if bad=='file':observed[0]['executableFileHash']='0'*64
    if bad=='bool pid':observed[0]['pid']=True
    check('register Python '+bad,lambda:ns['register_client'](b,'gate'),bad!='none')
    assert any(n.startswith('client-') for n in b['custody'].files)==(bad=='none')
observed[0]=None

# Actual parse_census with injected process identity. No table() implementation
# or OS subprocess is invoked.
ns['os']=types.SimpleNamespace(getpid=lambda:12,getppid=lambda:11)
pin={'wrapperPid':10,'wrapperStart':'Mon Oct 19 11:00:00 2026','wrapperArgvSha256':pred['digest'](b'wrapper'),'shellPid':11,'shellStart':'Mon Oct 19 11:00:00 2026','shellArgvSha256':pred['digest'](b'shell')}
lines=['10 1 Mon Oct 19 11:00:00 2026 wrapper','11 10 Mon Oct 19 11:00:00 2026 shell','12 11 Mon Oct 19 12:00:00 2026 python fixture','90 12 Mon Oct 19 12:00:01 2026 /bin/ps -ww -axo pid=,ppid=,lstart=,command=']
u={'pid':90,'terminal':True,'status':0,'command':['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command=']}
b={'pin':pin,'client':who(12)}
for name,text in [('complete','\n'.join(lines)),('empty',''),('missing client','\n'.join(lines[:2]+lines[3:])),('duplicate','\n'.join(lines+[lines[0]])),('missing controller','\n'.join(lines[1:])),('malformed','broken')]:
    check('census '+name,lambda text=text:ns['parse_census'](text,b,'gate',copy.deepcopy(u)),name!='complete')

# Actual helpers wrapper rejects the immutable core's formerly dropped stable
# candidate, and retains the census receipt across later role-observation calls.
core_source=original['CORE'].read_bytes()
ns['safe_bytes']=lambda path,*a:core_source
ns['load_fixed_module']=lambda *a:types.SimpleNamespace()
for available in (True,False):
    bb={'mode':'gate','pin':pin,'client':who(12)}
    def capture(b,cmd,allowed=(0,)):
        if cmd==['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command=']:
            b['lastUtility']=copy.deepcopy(u)
            return '\n'.join(lines+['91 1 Mon Oct 19 12:00:00 2026 GradleDaemon'])
        b['lastUtility']={'pid':99,'terminal':True}
        if cmd[-1]=='comm=':return '/bin/java' if available else ''
        if cmd[-1]=='command=':return '/bin/java GradleDaemon' if available else ''
        return ''
    ns['utility_capture']=capture
    scope,_=original['helpers'](bb)
    check('actual helper stable candidate '+('known' if available else 'UNKNOWN'),lambda:scope['table'](),not available)
    if available:assert bb['censusUtility']['pid']==90 and bb['lastUtility']['pid']==99
ns['load_fixed_module']=original['load_fixed_module']
# Actual observer accepts the waited, exactly bound census utility only. A
# separate arbitrary child/listener/current unknown is never exempted.
ns['os']=types.SimpleNamespace(getpid=lambda:12,getppid=lambda:11,open=lambda *a:7,close=lambda *a:None,fstat=lambda fd:types.SimpleNamespace(st_dev=1,st_ino=2),O_RDONLY=0,O_NOFOLLOW=1)
ns['fcntl']=types.SimpleNamespace(flock=lambda *a:(_ for _ in ()).throw(OSError(original['errno'].EAGAIN,'held')),LOCK_EX=1,LOCK_NB=2,LOCK_UN=4)
class Lock:
    def with_name(self,name):return self
    def lstat(self):return types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,st_dev=1,st_ino=2)
class FakeUnit(PurePosixPath):
    def exists(self):return False
    def is_symlink(self):return False
ns['UNIT']=FakeUnit('/synthetic-unit')
owned=[{'pid':1000+i,'start':'old'} for i in range(2438)]
ns['read']=lambda path,*a:{'ownedIdentities':owned} if str(path).endswith('receipt.json') else {'phaseKeeper':{'pid':5000,'start':'keeper'},'collector':{'pid':1000,'start':'old'}}
ns['safe_bytes']=lambda *a:b''
ns['verified_read']=lambda b,path:ns['read'](path)
ns['inventory_clients']=lambda b,rows:([who(12)],[])
for variant in ('clean','child','listening child','client listener','unknown candidate'):
    rows={10:{'pid':10,'ppid':1,'start':pin['wrapperStart']},11:{'pid':11,'ppid':10,'start':pin['shellStart']},12:who(12),90:{'pid':90,'ppid':12,'start':'probe','projectMarkerCandidate':False}}
    for v in rows.values():v.setdefault('projectMarkerCandidate',False)
    if variant in ('child','listening child','unknown candidate'):rows[91]={'pid':91,'ppid':1 if variant=='unknown candidate' else 12,'start':'unbound','projectMarkerCandidate':variant=='unknown candidate'}
    bb={'custody':MemCustody(),'pin':dict(pin,lockDevInode=[1,2]),'plan':{'source':{'files':[]},'sourceModes':{}},'loaded':{},'lastUtility':{'pid':90,'terminal':True,'observedStart':'probe'},'censusUtility':{'pid':90,'terminal':True,'observedStart':'probe'}}
    boundary={'inheritedMatched':[{}]*6,'originalIdentitiesAbsent':[],'inheritedIdentityChanged':[],'incompleteStableIdentities':[],'otherProjectFacts':[],'listeners':[{'pid':12 if variant=='client listener' else 91,'port':8080}] if variant in ('listening child','client listener') else []}
    scope={'table':lambda:rows,'project_role':lambda p:None,'boundary_inventory':lambda p:boundary,'capture':lambda *a:'p10\ni2\n'}
    ns['helpers']=lambda b:(scope,types.SimpleNamespace(WRAPPER=Lock(),observe_source=lambda *a:pred['SOURCE']))
    check('actual observer '+variant,lambda:original['observe'](bb),variant!='clean')

# Restore test-independent actual definitions and inject only operation I/O.
ns.update(original);ns.update({k:v for k,v in pred.items() if not k.startswith('__')})
ns['os']=types.SimpleNamespace(getpid=lambda:pid[0],getppid=lambda:11)
ns['time']=types.SimpleNamespace(time=lambda:clock[0])
ns['utility_capture']=lambda b,cmd,allowed=(0,):who(pid[0])['start'] if cmd[-1]=='lstart=' else 'python fixture'
ns['helpers']=lambda b:({'table':lambda:{pid[0]:who(pid[0])},'identity':lambda row:who(pid[0])},None)
ns['client_identity']=lambda b,scope,row:scope['identity'](row)
def synthetic_observe(b,post=False):
    rows={pid[0]:who(pid[0])};clients,prior=original['inventory_clients'](b,rows)
    live=copy.deepcopy(l['live']);live['priorClientsLive']=prior;live['clientIdentities']=clients
    return live
ns['observe']=synthetic_observe
b=newb();b['custody'].files['input-pins.json']=json.dumps({'retainedContract':b['retained']}).encode()
def operation(mode,num,requested=None):
    pid[0]=num;ns['register_client'](b,mode);return ns['operate'](b,mode,requested)
check('real flow negative denial1',lambda:operation('gate',20,1),True)
check('real flow held proof0 with new journal',lambda:operation('held-proof',21,1))
ad=copy.deepcopy(l['ad']);ad.update(activeLockSha256=ns['PIN'],negativeDenialSha256=pred['digest'](b['custody'].read('negative-readiness-denial.json')),heldProofSha256=pred['digest'](b['custody'].read('held-proof.json')),heldProofActualStatus=0,heldProofSeparateStatusCaptured=True)
b['custody'].write('root-admission.json',ad)
pre_final_files=copy.deepcopy(b['custody'].files)
check('real flow standalone final0',lambda:operation('final',22))
r=json.loads(b['custody'].read('readiness.json'));p=copy.deepcopy(l['p']);p.update(readinessSha256=pred['digest'](b['custody'].read('readiness.json')),issuedAtEpoch=100)
b['custody'].write('permit.json',p)
check('real flow permitted gate0',lambda:operation('gate',23,1))
b['custody'].write('root-wrapper-result.json',{'actualWrapperExit':1,'separatelyCaptured':True,'releaseSha256':b['sha'],'gateAllowSha256':pred['digest'](b['custody'].read('gate-allow.json'))})
check('real flow separate postclose0',lambda:operation('postclose',24))
assert len([n for n in b['custody'].files if n.startswith('client-')])==5
check('real same-client journal collision',lambda:ns['register_client'](b,'postclose'),True)

for field,value in [('status',True),('shellPid',True),('readinessAbsent',1),('permitAbsent',1),('unit','other')]:
    denial=json.loads(b['custody'].read('negative-readiness-denial.json'));denial[field]=value;journal=json.loads(b['custody'].read(denial['clientJournal']))
    check('strict denial '+field,lambda denial=denial,journal=journal:pred['negative_record'](denial,journal,b['sha'],ns['PIN'],11),True)
check('malformed negative {}',lambda:pred['negative_record']({}, {}, b['sha'],ns['PIN'],11),True)
for field,value in [('negativeActualStatus',True),('separateStatusCaptured',1)]:
    bad=copy.deepcopy(ad);bad[field]=value
    check('strict admission '+field,lambda bad=bad:pred['admission'](bad,b['sha'],ns['PIN']),True)
for field,value in [('verificationExit',False),('expectedWrapperExit',True),('verifiedAtEpoch',True)]:
    bad=copy.deepcopy(r);bad[field]=value
    check('strict readiness '+field,lambda bad=bad:pred['readiness'](bad,b['sha'],b['a']['retainedContractSha256'],100),True)
# Paired actual final/gate operations reject malformed input before output.
for label,target,field,value in [
 ('negative malformed','negative-readiness-denial.json',None,{}),
 ('negative bool status','negative-readiness-denial.json','status',True),
 ('negative wrong journal','negative-readiness-denial.json','clientJournalSha256','0'*64),
 ('admission bool status','root-admission.json','negativeActualStatus',True),
 ('held proof bool exit','held-proof.json','verificationExit',False),
 ('held proof wrong journal','held-proof.json','clientJournalSha256','0'*64),
 ('held actual status bool','root-admission.json','heldProofActualStatus',False)]:
    bad_b=newb();bad_b['custody'].files=copy.deepcopy(pre_final_files)
    payload=json.loads(bad_b['custody'].read(target))
    if field is None:payload=value
    else:payload[field]=value
    bad_b['custody'].files[target]=json.dumps(payload).encode()
    pid[0]=40;ns['register_client'](bad_b,'final')
    check('actual final rejects '+label,lambda bad_b=bad_b:ns['operate'](bad_b,'final'),True)
    assert 'readiness.json' not in bad_b['custody'].files
for field,value in [('verificationExit',False),('expectedWrapperExit',True),('verifiedAtEpoch',True),('verifiedAtEpoch',39.9),('verifiedAtEpoch',101)]:
    bad_b=newb();bad_b['custody'].files=copy.deepcopy(b['custody'].files)
    bad_b['custody'].files.pop('gate-allow.json');bad_b['custody'].files.pop('postclose.json')
    payload=json.loads(bad_b['custody'].read('readiness.json'));payload[field]=value
    bad_b['custody'].files['readiness.json']=json.dumps(payload).encode()
    pid[0]=41;ns['register_client'](bad_b,'gate')
    check('actual gate rejects '+field+' '+str(value),lambda bad_b=bad_b:ns['operate'](bad_b,'gate',1),True)
    assert 'gate-allow.json' not in bad_b['custody'].files
# Same-holder proof status0 must be independently root-bound, no Boolean aliases.
for key,value in [('newNativeInvocations',False),('expectedWrapperExit',True)]:
    bad=copy.deepcopy(l['a']);bad[key]=value
    check('strict authority '+key,lambda bad=bad:pred['authority'](bad),True)
for group,key,value in [('dualException','newClosingEntrypoint',1),('credit','C8',0)]:
    bad=copy.deepcopy(l['a']);bad[group][key]=value
    check('strict bool authority '+group,lambda bad=bad:pred['authority'](bad),True)
result={'scope':'REAL_ADAPTER_DEFINITIONS_WITH_ONLY_IN_MEMORY_OS_CLIENT_BOUNDARIES','legacyPreserved':97,'newPairedChecks':len(results),'total':97+len(results),'passed':97+len(results),'failed':0,'actualOSNativeHelperMainOrRuntimeActions':0,'results':results}
with (HERE/'adapter-check-results.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({k:result[k] for k in ('scope','legacyPreserved','newPairedChecks','total','passed','failed')}))

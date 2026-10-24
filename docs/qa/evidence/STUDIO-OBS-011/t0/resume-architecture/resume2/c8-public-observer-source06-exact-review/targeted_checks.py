"""Bounded independent actual acquisition/token/early-load/bootstrap pairs; all effects fake."""
from pathlib import Path
import ast,builtins,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,selectors,shlex,socket,stat,struct,subprocess,sys,threading,time,types
from contextlib import ExitStack
from unittest.mock import patch
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume6').absolute()
O=Path(__file__).absolute().parent
raw=(D/'public_observation_unit.py').read_bytes();loader=(D/'entry-loader.py.txt').read_bytes()
models=ast.parse((D/'acquisition06_checks.py').read_bytes())
models.body=[n for n in models.body if isinstance(n,ast.ClassDef) and n.name=='ParentAPI']
M=dict(globals());exec(compile(models,'<sealed explicit fake ParentAPI>','exec'),M)
A={'__name__':'_inactive06_architecture','__file__':'<prepared>'};exec(compile(raw,'<actual inactive06 definitions>','exec'),A)
checks,cases,blocked_calls=[],[],[]
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    checks.append(dict(name=name,**{'pass':True}))
def blocked(*args,**kwargs):blocked_calls.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event=='open':
        name,mode,flags=args
        writing=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
        if not(type(name) is str and name==str(O/'targeted-checks.json') and writing):raise AssertionError('FORBIDDEN_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.posix_spawn','os.fork','os.kill','os.system')):raise AssertionError('FORBIDDEN_'+event)
def run():
    for kind in ('clean-parent','root-fstat-unknown','child-fstat-unknown','validation-close-unknown'):
        ownership=A['Ownership']();api=M['ParentAPI'](kind);observed=[];fstat=api.fstat
        def tracked_fstat(fd):
            tokens=[t for t in ownership.tokens if t['fd']==fd and t['state']=='OPEN']
            check('registered before fstat '+kind+' '+str(len(observed)),len(tokens)==1 and tokens[0]['owner'] in ownership.owners)
            observed.append(fd);return fstat(fd)
        api.fstat=tracked_fstat;failed=False
        try:owner=A['Custody']('/private/tmp',api=api,ownership=ownership)
        except (A['Hold'],OSError):failed=True
        if not failed:owner.close()
        unknown=kind=='validation-close-unknown'
        check('actual constructor acquisition retained or closed '+kind,bool(ownership.blockers()) is unknown and bool(api.opened) is unknown)
        check('no unsafe duplicate directory close '+kind,len(api.close_attempts)==len(set(api.close_attempts)))
        if unknown:check('failed constructor actual strong reference '+kind,ownership in A['RETAINED_OWNERSHIP'] and len(ownership.owners)==1 and not ownership.owners[0].initialized)
        cases.append(dict(case=kind,failed=failed,blockers=bool(ownership.blockers()),ledger=ownership.summary()))
    for fail in (False,True):
        ledger=A['Ownership']();owner=types.SimpleNamespace(initialized=True);calls=[];ledger.owner(owner)
        def closer(fd):
            calls.append(fd)
            if fail:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
        token=ledger.acquire(owner,41,closer,'FILE');handle=object();ledger.transfer(token,handle,closer)
        check('actual handle and closer retained '+str(fail),token['handle'] is handle and token['closer'] is closer and not ledger.view(owner).clear())
        try:ledger.close(token)
        except OSError:pass
        try:ledger.close(token)
        except A['Hold']:pass
        check('one attempted close, precise terminal token '+str(fail),calls==[41] and token['state']==('UNKNOWN' if fail else 'CLOSED'))
        if fail:
            reused=ledger.acquire(owner,41,lambda fd:calls.append(fd),'DIRECTORY')
            ledger.close(reused)
            check('numeric FD reuse never repairs old unknown',token['state']=='UNKNOWN' and reused['state']=='CLOSED' and not ledger.view(owner).clear())
        else:check('confirmed close clears owner view',ledger.view(owner).clear())
        cases.append(dict(case='transferred-unknown' if fail else 'transferred-confirmed',ledger=ledger.summary(),closeCalls=calls))
    for kind in ('DIRECTORY','FILE'):
        ledger=A['Ownership']();owner=types.SimpleNamespace(initialized=True);ledger.owner(owner)
        token=ledger.acquire(owner,51,lambda fd:None,kind)
        check('only initialized caller directory borrowed '+kind,ledger.view(owner).clear() is (kind=='DIRECTORY'))
        owner.initialized=False
        check('failed/unreturned constructor never borrowed '+kind,not ledger.view(owner).clear())
        token['state']='UNKNOWN';owner.initialized=True
        check('unknown caller token never borrowed '+kind,not ledger.view(owner).clear())
        cases.append(dict(case='borrow-'+kind,unknownClear=ledger.view(owner).clear()))
    for unknown in (False,True):
        system=A['System']();owned=[];api=M['ParentAPI']('validation-close-unknown')
        class Control:
            initialized=True
            def __init__(self):
                self.closed=False;system.ownership.owner(self)
                self.token=system.ownership.acquire(self,61,lambda fd:setattr(self,'closed',True),'DIRECTORY')
            def close(self):system.ownership.close(self.token)
        def custody(path,mode=None):
            if owned:
                if unknown:return A['Custody']('/private/tmp',api=api,ownership=system.ownership)
                raise A['Hold']('SYNTHETIC_SECOND_FACTORY_REJECT')
            value=Control();owned.append(value);return value
        system.custody=custody;caught=False
        with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py')}):
            try:A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],system)
            except A['Hold']:caught=True
        check('actual load/main rejects partial setup '+str(unknown),caught)
        check('first caller preserved only while second acquisition unknown '+str(unknown),owned[0].closed is (not unknown) and bool(system.ownership.blockers()) is unknown)
        if unknown:check('bootstrap control and failed owner strongly retained',any(x is owned[0] for x in system.ownership.references) and any(not x.initialized for x in system.ownership.owners))
        cases.append(dict(case='load-unknown-constructor' if unknown else 'load-clean-rejection',firstControlClosed=owned[0].closed,ledger=system.ownership.summary()))
    for opt in (0,1):
        for outcome in ('valid','wrong-sha','one-close-unknown'):
            payload=b'NEVER_EXECUTE_SYNTHETIC_ADAPTER\n';calls=[];attempts=[]
            class API:
                O_RDONLY=os.O_RDONLY;O_DIRECTORY=os.O_DIRECTORY;O_NOFOLLOW=os.O_NOFOLLOW
                def __init__(self):self.nextfd=0;self.offset={}
                def open(self,*args,**kwargs):self.nextfd+=1;self.offset[self.nextfd]=0;return self.nextfd
                def fstat(self,fd):return types.SimpleNamespace(st_dev=1,st_ino=7,st_mode=stat.S_IFREG|0o600,st_uid=501,st_size=len(payload),st_mtime_ns=1,st_ctime_ns=1)
                def getuid(self):return 501
                def read(self,fd,n):value=payload[self.offset[fd]:self.offset[fd]+n];self.offset[fd]+=len(value);return value
                def close(self,fd):
                    attempts.append(fd)
                    if outcome=='one-close-unknown' and fd==2:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
            api=API();digest=hashlib.sha256(payload).hexdigest() if outcome!='wrong-sha' else '0'*64
            fsys=types.SimpleNamespace(argv=['-c','/owned/adapter.py',digest,'selected','a'*64,'entry-0001-pins.json','b'*64])
            modules={'os':api,'stat':stat,'sys':fsys,'hashlib':hashlib}
            safe=dict(vars(builtins),__import__=lambda name,*args:modules[name],compile=lambda *args:calls.append('compile'),exec=lambda *args:calls.append('exec'))
            ns={'__builtins__':safe};failed=False
            try:exec(compile(loader,'<actual06 commonloader fake boundaries>','exec',optimize=opt),ns)
            except RuntimeError:failed=True
            records=ns['C8_PUBLIC_BOOTSTRAP_OWNERSHIP']
            check('bootstrap denies before interpretation '+str((opt,outcome)),bool(calls) is (outcome=='valid') and failed is (outcome!='valid'))
            check('bootstrap every acquisition closes once '+str((opt,outcome)),len(attempts)==len(set(attempts))==len(records))
            check('bootstrap precise partial close record '+str((opt,outcome)),[r['state'] for r in records].count('UNKNOWN')==(1 if outcome=='one-close-unknown' else 0))
            cases.append(dict(case='bootstrap-'+outcome,optimization=opt,adapterExecutionIntercepted=True,states=[r['state'] for r in records]))
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),(subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),(threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    run();check('zero real boundary calls',blocked_calls==[])
result=dict(count=len(checks),checks=checks,caseCount=len(cases),cases=cases,realBoundaryCalls=blocked_calls,actualActions=0,limitations='Actual methods and literal loader over fake resources; synthetic factories; intercepted adapter execution; no actual FD/thread/platform/native qualification.')
(O/'targeted-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ('count','caseCount','actualActions')}))

"""Independent bounded ownership-transfer pairs; actual methods, fake resources only.

No target OS/thread/helper/import effect is permitted. Main's synthetic operate callback
models acquisition failure and failed teardown; it is not unchanged whole serve/native flow.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,datetime,fcntl,hashlib,io,json,math,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from contextlib import ExitStack
from unittest.mock import patch
D=Path(__file__).absolute().parent
O=D
adapter=(D/'public_observation_unit.py').read_bytes();relayraw=(D/'public_relay.py').read_bytes()
A={'__name__':'_architecture_inactive05','__file__':'<source-only>'};R=types.ModuleType('_architecture_relay05')
exec(compile(adapter,'<inactive05 actual adapter>','exec'),A)
exec(compile(relayraw,'<inactive05 actual relay>','exec'),R.__dict__)
checks,cases,blocked_calls=[],[],[]
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    checks.append({'name':name,'pass':True})
def blocked(*args,**kwargs):blocked_calls.append('FORBIDDEN_REAL_BOUNDARY');raise AssertionError('FORBIDDEN_REAL_BOUNDARY')
def audit(event,args):
    if event=='open':
        name,mode,flags=args
        writing=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
        if not (type(name) is str and name==str(O/'acquisition06-check-results.json') and writing):raise AssertionError('FORBIDDEN_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.posix_spawn','os.fork','os.kill','os.system')):raise AssertionError('FORBIDDEN_'+event)
class Event:
    def set(self):pass
    def wait(self,seconds):return True
    def is_set(self):return False
class FakeCustody:
    def __init__(self,key):self.chain=[(None,'/',1,key)];self.closed=False;self.nodes={}
    def check(self):pass
    def members(self):return []
    def close(self):self.closed=True
    def absent(self,name):return name not in self.nodes
class ParentAPI:
    def __init__(self,kind):self.kind=kind;self.nextfd=100;self.opened=set();self.closed=[];self.close_attempts=[];self.child=None
    def info(self,fd):return types.SimpleNamespace(st_dev=1,st_ino=fd,st_mode=stat.S_IFDIR|0o755,st_uid=501)
    def open(self,path,flags,dir_fd=None):self.nextfd+=1;self.opened.add(self.nextfd);return self.nextfd
    def fstat(self,fd):
        if (self.kind=='root-fstat-unknown' and fd==101) or (self.kind=='child-fstat-unknown' and fd==102):raise OSError('SYNTHETIC_FSTAT_UNKNOWN')
        return self.info(fd)
    def stat(self,path,dir_fd=None,follow_symlinks=False):
        if path=='/':return self.info(101)
        if path=='private':return self.info(102)
        if path=='tmp':return self.info(999 if self.kind in ('validation-clean-close','validation-close-unknown') else 103)
        if path=='obs011-pub-observe01' and self.child is not None:return self.child
        raise FileNotFoundError(path)
    def getuid(self):return 501
    def close(self,fd):
        self.close_attempts.append(fd)
        if self.kind=='validation-close-unknown' and fd==103:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
        self.opened.remove(fd);self.closed.append(fd)
class FileAPI:
    def __init__(self,failclose):self.failclose=failclose;self.nextfd=200;self.opened=set();self.close_attempts=[];self.offset={};self.written=b''
    def info(self,fd):
        directory=fd in (201,202)
        return types.SimpleNamespace(st_dev=2,st_ino=fd,st_mode=(stat.S_IFDIR|0o700) if directory else (stat.S_IFREG|0o600),st_uid=501,st_size=1,st_nlink=1,st_mtime_ns=1,st_ctime_ns=1)
    def open(self,path,flags,mode=0o777,dir_fd=None):self.nextfd+=1;self.opened.add(self.nextfd);self.offset[self.nextfd]=0;return self.nextfd
    def fstat(self,fd):return self.info(fd)
    def stat(self,path,dir_fd=None,follow_symlinks=False):return self.info({'/':201,'output':202,'public-observation.json':203}[path])
    def getuid(self):return 501
    def fsync(self,fd):pass
    def read(self,fd,n):
        raw=b'x'[self.offset[fd]:self.offset[fd]+n];self.offset[fd]+=len(raw);return raw
    def write(self,fd,raw):self.written+=raw;return len(raw)
    def close(self,fd):
        self.close_attempts.append(fd)
        if self.failclose and fd==203:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
        self.opened.remove(fd)
key=(1,7,stat.S_IFDIR|0o700,501)
def control():return dict(schemaVersion=1,protocolVersion=2,unit='u',**{'class':'c','method':'m'},amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath=R.ENDPOINT,enrollmentNonce='a'*64,**R.LIMITS)
def make_relay(output,root,factory,boundary=None):
    if boundary is None:boundary=types.SimpleNamespace(uid=lambda:501,event=Event)
    return R.Relay(boundary,factory,output,control(),'b'*64,{},types.SimpleNamespace(CONSTANTS={'unit':'u','class':'c','method':'m'}),lambda raw:hashlib.sha256(raw).hexdigest(),lambda raw:{},lambda pid:{},root,CURRENT_OWNERSHIP.view(output))
def effects(relay,output):
    e=A['Effects'].__new__(A['Effects']);e.ownership=CURRENT_OWNERSHIP;e.relay=relay;e.c=FakeCustody(key);e.unit=output;e.gaps={};e.client={'pid':500,'start':'SYNTHETIC_START','identityComplete':True};e.a={'releaseSha256':'a'*64};e.registration_complete=True;e.custody_retained=False;e.records=[]
    def write_once(name,value):e.records.append((name,copy.deepcopy(value)));e.c.nodes[name]=value
    e.write_once=write_once;e.register=lambda mode:None;e.sys=types.SimpleNamespace(stdin_devnull=lambda:True,cwd=lambda:str(A['ROOT']))
    return e
def invoke_main(e,operate):
    with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py'),'load':lambda *args:e,'operate':operate}):
        return A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys)
def run():
    global CURRENT_OWNERSHIP
    for kind in ('clean-parent','root-fstat-unknown','child-fstat-unknown','validation-clean-close','validation-close-unknown'):
        CURRENT_OWNERSHIP=A['Ownership']()
        api=ParentAPI(kind);output=FakeCustody(key);short=FakeCustody(key)
        root=dict(ownerUid=501,outputChain=[list(key)],shortParentChain=[[1,n,stat.S_IFDIR|0o755,501] for n in (101,102,103)],createShortExactly0700=True)
        def factory(path,mode=None):return short if str(path)==R.SHORT else A['Custody'](path,mode,api,ownership=CURRENT_OWNERSHIP)
        class Boundary:
            def uid(self):return 501
            def event(self):return Event()
            def mkdir_at(self,c,name):api.child=types.SimpleNamespace(st_dev=1,st_ino=42,st_mode=stat.S_IFDIR|0o700,st_uid=501)
            def thread(self,callback):
                class Thread:
                    def start(self):relay.result['ready']=True
                    def join(self,seconds):pass
                    def is_alive(self):return False
                return Thread()
        relay=make_relay(output,root,factory,Boundary());e=effects(relay,output);failed=[]
        def operate(owner,mode,arg):
            try:relay.start()
            except (R.RelayHold,A['Hold'],OSError):failed.append(True)
            owner.stop_relay();return 1
        try:status=invoke_main(e,operate)
        except A['Hold']:status=1
        receipt=next(v['receipt'] for n,v in e.records if n=='relay-drain.json')
        expected_leak=kind=='validation-close-unknown'
        check('actual acquisition retained or closed '+kind,bool(api.opened)==expected_leak)
        check('main remains failed '+kind,status==1)
        check('never reclose constructor descriptor '+kind,len(api.close_attempts)==len(set(api.close_attempts)))
        check('canonical and published complete closure '+kind,relay.result['descriptorsClosed'] is (not expected_leak) and receipt['descriptorsClosed'] is (not expected_leak))
        check('main discharges owner/control/output '+kind,(not e.c.closed and not output.closed and any(x is e for x in A['RETAINED_EFFECTS'])) if expected_leak else (e.c.closed and output.closed and not any(x is e for x in A['RETAINED_EFFECTS'])))
        check('constructor only assigned on success '+kind,(relay.parent is not None)==(kind=='clean-parent'))
        cases.append(dict(case=kind,mainStatus=status,fakeOpenDescriptors=sorted(api.opened),closeAttempts=api.close_attempts,parentAssigned=relay.parent is not None,canonicalClosed=relay.result['descriptorsClosed'],effectsRetained=any(x is e for x in A['RETAINED_EFFECTS'])))
    for operation in ('read','write'):
        for fail in (False,True):
            CURRENT_OWNERSHIP=A['Ownership']()
            api=FileAPI(fail);output=A['Custody']('/output',0o700,api,ownership=CURRENT_OWNERSHIP)
            root=dict(ownerUid=501,outputChain=[list(x[3]) for x in output.chain],shortParentChain=[],createShortExactly0700=True)
            relay=make_relay(output,root,blocked);e=effects(relay,output);failed=[]
            def operate(owner,mode,arg):
                try:
                    if operation=='read':owner.unit.read('public-observation.json',0o600)
                    else:owner.unit.write('public-observation.json',b'x',0o600)
                except OSError:failed.append(True)
                owner.stop_relay();return 1
            try:status=invoke_main(e,operate)
            except A['Hold']:status=1
            check('never reclose temporary descriptor '+str((operation,fail)),len(api.close_attempts)==len(set(api.close_attempts)))
            check('temporary FD expected outcome '+str((operation,fail)),bool(api.opened)==fail and bool(failed)==fail)
            check('temporary FD absent from completed chain '+str((operation,fail)),bool(output.chain) is fail)
            check('actual canonical closure/failed main '+str((operation,fail)),relay.result['descriptorsClosed'] is (not fail) and status==1)
            check('temporary FD owner not retained '+str((operation,fail)),(any(x is e for x in A['RETAINED_EFFECTS']) and not e.c.closed) if fail else (not any(x is e for x in A['RETAINED_EFFECTS']) and e.c.closed))
            cases.append(dict(case='temporary-'+operation+('-close-unknown' if fail else '-clean-close'),mainStatus=status,fakeOpenDescriptors=sorted(api.opened),closeAttempts=api.close_attempts,outputDirectoryChain=output.chain,canonicalClosed=relay.result['descriptorsClosed'],effectsRetained=any(x is e for x in A['RETAINED_EFFECTS'])))
    for fail in (False,True):
        owners=[]
        class LoadingSystem:
            def __init__(self):self.ownership=A['Ownership']()
            def custody(self,path,mode=None):
                if len(owners)==1 and fail:raise A['Hold']('SYNTHETIC_SECOND_ACQUISITION_FAILURE')
                owner=FakeCustody(key);owners.append(owner);return owner
            def read(self,*args):raise A['Hold']('SYNTHETIC_AFTER_BOTH_ACQUISITIONS')
        caught=False
        with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py')}):
            try:A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],LoadingSystem())
            except A['Hold']:caught=True
        check('load pair rejects '+str(fail),caught)
        check('load pair actual close coverage '+str(fail),len(owners)==(1 if fail else 2) and all(o.closed for o in owners))
        cases.append(dict(case='load-second-acquisition-failure' if fail else 'load-post-acquisition-rejection-cleanup',mainRejected=True,owners=len(owners),closed=[o.closed for o in owners],effectsCreated=False))
sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','kill','fork','system','getpid','getppid','getuid')),(subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),(threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    run();check('zero boundary calls06',blocked_calls==[])
(O/'acquisition06-check-results.json').write_text(json.dumps(dict(checks=checks,count=len(checks),cases=cases,caseCount=len(cases),actualActions=0,blockedRealCalls=blocked_calls,modelLimit='Fake acquisition and synthetic operate callback around actual main/stop/closure; no unchanged serve, real thread, FD or OS.'),indent=2)+'\n')
print(json.dumps(dict(checks=len(checks),cases=len(cases),actualActions=0)))

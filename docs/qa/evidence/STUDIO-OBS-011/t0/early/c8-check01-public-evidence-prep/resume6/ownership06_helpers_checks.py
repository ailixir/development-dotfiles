"""Bounded reached System/temporary/transfer/bootstrap ownership cases, synthetic only."""
import ast,base64,builtins,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,math,os,re,selectors,shlex,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path,PurePosixPath
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
PRE={n:(HERE/n).read_bytes() for n in ('public_observation_unit.py','acquisition06_checks.py','entry-loader.py.txt','targeted05_checks.py')}
A={'__name__':'_actual06_helpers','__file__':'<prepared06>'};exec(compile(PRE['public_observation_unit.py'],'<prepared06 adapter definitions>','exec'),A)
tree=ast.parse(PRE['acquisition06_checks.py']);tree.body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('ParentAPI','FileAPI')]
H=dict(globals());exec(compile(tree,'<explicit synthetic FD models>','exec'),H)
tree=ast.parse(PRE['targeted05_checks.py']);tree.body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='LoaderOS']
exec(compile(tree,'<explicit synthetic loader API>','exec'),H)
checks=[];blocked_calls=[];cases=[]
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    checks.append(dict(name=name,**{'pass':True}))
def blocked(*args,**kw):blocked_calls.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY')
def audit(event,args):
    if event=='open':
        if type(args[0]) is str and args[0]==str(HERE/'ownership06-helper-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')
    if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):raise AssertionError('AUDIT_DENIED_'+event)
class FileAPI(H['FileAPI']):
    def __init__(self,failclose=False,mode=0o600):super().__init__(failclose);self.mode=mode;self.value=b'x';self.fail_file_stat=False
    def info(self,fd):
        value=super().info(fd)
        if fd>=203:value.st_ino=500;value.st_mode=stat.S_IFREG|self.mode
        return value
    def fstat(self,fd):
        if self.fail_file_stat and fd>=203:raise OSError('SYNTHETIC_FILE_STAT_UNKNOWN')
        return self.info(fd)
    def close(self,fd):
        self.close_attempts.append(fd)
        if self.failclose and fd>=203:raise OSError('SYNTHETIC_FILE_CLOSE_UNKNOWN')
        self.opened.remove(fd)
    def read(self,fd,n):out=self.value[self.offset[fd]:self.offset[fd]+n];self.offset[fd]+=len(out);return out
    def write(self,fd,raw):self.value=bytes(raw);return len(raw)
    def ftruncate(self,fd,n):self.value=b''

def helpers():
    for op in ('create_fd','replace_exact','system_read','system_sink','lock_free'):
        for fail in (False,True):
            ownership=A['Ownership']();api=FileAPI(fail,0o644 if op=='replace_exact' else 0o600)
            class S(A['System']):
                def __init__(self):self.ownership=ownership
                def custody(self,path,mode=None):return A['Custody'](str(path),mode,api,ownership=ownership)
            system=S();c=system.custody('/output',0o700);error=False
            try:
                if op=='create_fd':
                    fd=c.create_fd('public-observation.json');c.close_fd(c.token(fd))
                elif op=='replace_exact':
                    identity=A['identity_key'](api.info(203))
                    c.replace_exact('public-observation.json',b'x',b'y',identity,0o644)
                elif op=='system_read':
                    # System.read uses a newly acquired custody owner in this same ledger.
                    c.close();system.read('/output/public-observation.json',0o600)
                elif op=='system_sink':
                    class Handle:
                        def __init__(self,fd):self.fd=fd
                        def fileno(self):return self.fd
                        def flush(self):pass
                        def close(self):api.close(self.fd)
                    with patch.object(os,'fdopen',lambda fd,mode:Handle(fd)),patch.object(os,'fstat',api.fstat),patch.object(os,'fsync',api.fsync):
                        handle=system.sink(c,'public-observation.json');handle.close()
                else:
                    with patch.object(os,'fstat',api.fstat),patch.object(fcntl,'flock',lambda *args:None):
                        check('LOCK_RESULT_'+str(fail),system.lock_free(c,'public-observation.json',[2,500]) is True)
            except (OSError,A['Hold']):error=True
            finished=ownership.finish(c)
            check('HELPER_COMPLETE_OR_RETAIN_'+op+'_'+str(fail),finished is (not fail) and bool(ownership.blockers()) is fail)
            check('HELPER_NO_DUPLICATE_CLOSE_'+op+'_'+str(fail),len(api.close_attempts)==len(set(api.close_attempts)))
            check('HELPER_CONFIRMED_CLEAN_NO_OPEN_'+op+'_'+str(fail),bool(api.opened) is fail)
            if fail:check('HELPER_UNKNOWN_STRONG_OWNER_'+op,any(x is ownership for x in A['RETAINED_OWNERSHIP']) and any(t['state']=='UNKNOWN' for t in ownership.tokens))
            cases.append(dict(operation=op,unknownClose=fail,failed=error,finished=finished,ledger=ownership.summary()))
    # Validation and handle-transfer failures before a sink factory can return.
    for kind in ('create-validation-close-confirmed','create-validation-close-unknown','fdopen-unknown','sink-stat-close-confirmed','sink-stat-close-unknown'):
        ownership=A['Ownership']();api=FileAPI('unknown' in kind);c=A['Custody']('/output',0o700,api,ownership=ownership)
        if kind.startswith('create-'):api.fail_file_stat=True
        caught=False
        try:
            if kind.startswith('create-'):c.create_fd('public-observation.json')
            else:
                class Handle:
                    def __init__(self,fd):self.fd=fd
                    def fileno(self):return self.fd
                    def close(self):api.close(self.fd)
                def fdopen(fd,mode):
                    if kind=='fdopen-unknown':raise OSError('SYNTHETIC_FDOPEN_OWNERSHIP_UNKNOWN')
                    return Handle(fd)
                def fstat(fd):raise OSError('SYNTHETIC_POST_TRANSFER_STAT_UNKNOWN')
                with patch.object(os,'fdopen',fdopen),patch.object(os,'fstat',fstat):A['System']().sink(c,'public-observation.json')
        except (OSError,A['Hold']):caught=True
        clean=kind.endswith('confirmed')
        check('PRE_RETURN_TRANSFER_FAILURE_'+kind,caught and ownership.finish(c) is clean)
        check('PRE_RETURN_NO_UNKNOWN_RETRY_'+kind,len(api.close_attempts)==len(set(api.close_attempts)))
        if not clean:check('PRE_RETURN_RETAINED_'+kind,bool(ownership.blockers()) and any(x is ownership for x in A['RETAINED_OWNERSHIP']))
    # Unknown token must never close a reused descriptor number; a new acquisition gets a new token.
    ownership=A['Ownership']();api=FileAPI(True);c=A['Custody']('/output',0o700,api,ownership=ownership)
    fd=c.create_fd('public-observation.json');token=c.token(fd)
    try:c.close_fd(token)
    except OSError:pass
    count=len(api.close_attempts)
    try:c.close_fd(token)
    except A['Hold']:pass
    check('UNKNOWN_TOKEN_NEVER_RECLOSE',len(api.close_attempts)==count and token['state']=='UNKNOWN')
    api.failclose=False;new=ownership.acquire(c,fd,api.close,'FILE');ownership.close(new)
    check('REUSED_NUMBER_DISTINCT_TOKEN_ONLY_NEW_CLOSED',new['state']=='CLOSED' and token['state']=='UNKNOWN' and bool(ownership.blockers()))

def bootstrap():
    # Actual load/main: first valid control owner must be retained if second constructor
    # has an unconfirmed close, and closed when a second acquisition simply rejects.
    for kind in ('second-before-open','second-constructor-unknown','after-both-reject'):
        system=A['System']();owners=[];api=H['ParentAPI']('validation-close-unknown')
        class Owner:
            def __init__(self):self.closed=False
            def close(self):self.closed=True
        def custody(path,mode=None):
            if owners:
                if kind=='second-before-open':raise A['Hold']('SYNTHETIC_SECOND_REJECT')
                if kind=='second-constructor-unknown':return A['Custody']('/private/tmp',api=api,ownership=system.ownership)
            value=Owner();owners.append(value);return value
        system.custody=custody;system.read=lambda *args:(_ for _ in ()).throw(A['Hold']('SYNTHETIC_AFTER_BOTH_REJECT'))
        with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py')}):
            try:A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],system)
            except A['Hold']:pass
        unknown=kind=='second-constructor-unknown'
        check('ACTUAL_LOAD_MAIN_PARTIAL_'+kind,all(o.closed is (not unknown) for o in owners) and bool(system.ownership.blockers()) is unknown)
        if unknown:check('ACTUAL_LOAD_FAILED_OWNER_REFERENCE_RETAINED',owners[0] in system.ownership.references and len(system.ownership.owners)==1)
    for opt in (0,1):
        raw=b'pass\n';api=H['LoaderOS'](raw,'valid');attempts=[];namespace={}
        def close(fd):attempts.append(fd);raise OSError('SYNTHETIC_BOOTSTRAP_CLOSE_UNKNOWN')
        api.close=close;fsys=types.SimpleNamespace(argv=['-c','/owned/control.py',hashlib.sha256(raw).hexdigest(),'selected','a'*64,'entry-0001-pins.json','b'*64])
        modules={'os':api,'stat':stat,'sys':fsys,'hashlib':hashlib};calls=[]
        safe=dict(vars(builtins),__import__=lambda name,*args:modules[name],compile=lambda *args:calls.append('compile'),exec=lambda *args:calls.append('exec'))
        namespace['__builtins__']=safe
        try:exec(compile(PRE['entry-loader.py.txt'],'<actual06 bootstrap fake boundaries>','exec',optimize=opt),namespace)
        except RuntimeError:pass
        records=namespace['C8_PUBLIC_BOOTSTRAP_OWNERSHIP']
        check('BOOTSTRAP_UNKNOWN_CLOSE_DENIES_COMPILE_OPT'+str(opt),not calls and records and all(r['state']=='UNKNOWN' for r in records))
        check('BOOTSTRAP_ALL_ACQUIRED_CLOSE_ONCE_OPT'+str(opt),len(attempts)==len(set(attempts))==len(records))

sys.addaudithook(audit)
with ExitStack() as stack:
    for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
      (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
      (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
      (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
        for name in names:
            if hasattr(obj,name):stack.enter_context(patch.object(obj,name,blocked))
    helpers();bootstrap();check('ZERO_REAL_BOUNDARY_CALLS',blocked_calls==[])
result=dict(kind='SOURCE06_BOUNDED_REACHED_SYSTEM_TRANSFER_BOOTSTRAP_CHECKS',passed=len(checks),failed=0,checks=checks,cases=cases,
    realBoundaryCalls=blocked_calls,actualSourceRuntimeJavaNativeThreadSocketOrPrivateActions=0,executionReady=False)
(HERE/'ownership06-helper-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=len(checks),failed=0,actualActions=0)))

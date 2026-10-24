"""Prospective failed-resource adapter. Preparation imports never observe or close."""
import ast
import errno
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
sys.dont_write_bytecode = True
import time
import hashlib
import subprocess
import re
class Hold(Exception): pass
def need(ok,reason):
    if not ok: raise Hold(reason)
def digest(data): return hashlib.sha256(data).hexdigest()
def compact(value): return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def member_name(name): return isinstance(name,str) and bool(name) and '/' not in name and name not in ('.','..') and '\x00' not in name
def canonical(name): return member_name(name)


ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
UNIT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01'
HERE = Path(__file__).absolute().parent
OLD_RELEASE = '9f347db3774a785a0b732392b2711976476ac4ae8743fcad839026c121fc3511'
PIN = 'a938fadcc56ddb8b8e86b80cb2a50589c558cb8a135e934c7443d2508b827b24'
INDEX = 'f3d5b283f86fe0196d570f0a04002c758a292689203ddb93a6fe1a4c8d62ebcb'
CORE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
CORE_SHA = 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
OLD_GATE_SHA = '56020d0d3123339587bcf9e0a7f6968efe125a07a4331d9710b2a3be678d021e'


def safe_bytes(path, mode=None):
    path = Path(path)
    need(path.is_absolute() and (path.is_relative_to(ROOT) or path == Path(sys.executable).resolve()) and '..' not in path.parts, 'UNSAFE_PATH')
    for part in [*reversed(path.parents), path]:
        if part == ROOT or part.is_relative_to(ROOT) or path == Path(sys.executable).resolve():
            st = part.lstat()
            need(not stat.S_ISLNK(st.st_mode), 'LINK_BEFORE_BODY')
            if part != path:
                need(stat.S_ISDIR(st.st_mode), 'UNSAFE_ANCESTOR')
    # Resolve every ancestor through nonfollowing directory descriptors. A parent
    # switched after lstat cannot redirect the body read through a symlink.
    directory_fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in path.parts[1:-1]:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
            os.close(directory_fd); directory_fd = next_fd
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    finally:
        os.close(directory_fd)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and (mode is None or stat.S_IMODE(before.st_mode) == mode), 'REGULAR_MODE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read()
        after = os.fstat(fd); outside = path.lstat()
        fields = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_mode)
        need(fields(before) == fields(after) == fields(outside), 'FILE_CHANGED')
        return data
    finally:
        os.close(fd)


def read(path, mode=None):
    return json.loads(safe_bytes(path, mode))


class Custody:
    """Retain every nonfollowing ancestor descriptor, revalidate names and objects."""
    def __init__(self,path,mode=None):
        self.path=Path(path); self.chain=[]
        need(self.path.is_absolute() and '..' not in self.path.parts,'CUSTODY_PATH')
        fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        self.chain.append((None,'/',fd,self.key(os.fstat(fd))))
        try:
            for name in self.path.parts[1:]:
                parent=fd; fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
                self.chain.append((parent,name,fd,self.key(os.fstat(fd))))
            self.fd=fd;self.check()
            need(mode is None or stat.S_IMODE(os.fstat(fd).st_mode)==mode,'CUSTODY_MODE')
        except BaseException:
            self.close();raise
    @staticmethod
    def key(st):return (st.st_dev,st.st_ino,st.st_mode,st.st_uid)
    def check(self):
        for parent,name,fd,want in self.chain:
            got=os.fstat(fd);need(self.key(got)==want and stat.S_ISDIR(got.st_mode),'DIRECTORY_CHANGED')
            named=os.stat('/',follow_symlinks=False) if parent is None else os.stat(name,dir_fd=parent,follow_symlinks=False)
            need(self.key(named)==want and stat.S_ISDIR(named.st_mode),'DIRECTORY_MOVED_OR_LINKED')
    def members(self,_member=member_name):
        self.check();names=os.listdir(self.fd);self.check()
        need(all(_member(n) for n in names) and len(names)==len(set(names)),'MEMBER_NAMES');return names
    def read(self,name,mode=0o600,_member=member_name):
        need(_member(name),'MEMBER_NAME');self.check()
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=self.fd)
        try:
            before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and (mode is None or stat.S_IMODE(before.st_mode)==mode),'MEMBER_MODE')
            with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read()
            after=os.fstat(fd);named=os.stat(name,dir_fd=self.fd,follow_symlinks=False)
            key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_size,x.st_mtime_ns)
            need(key(before)==key(after)==key(named),'MEMBER_CHANGED');self.check();return data
        finally:os.close(fd)
    def absent(self,name,_member=member_name):
        need(_member(name),'MEMBER_NAME');self.check()
        try:os.stat(name,dir_fd=self.fd,follow_symlinks=False)
        except FileNotFoundError:answer=True
        else:answer=False
        self.check();return answer
    def write(self,name,value,_member=member_name):
        need(_member(name),'OUTPUT_NAME');self.check()
        fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=self.fd)
        try:
            with os.fdopen(fd,'wb',closefd=False) as out:out.write(json.dumps(value,indent=2).encode()+b'\n');out.flush();os.fsync(fd)
            self.check()
        finally:os.close(fd)
    def close(self):
        for _,_,fd,_ in reversed(self.chain):os.close(fd)
        self.chain=[]


def bootstrap(c,release_sha):
    """No local module is imported/executed before exact retained custody/hash."""
    raw=c.read('root-disposition-authorization.json');need(digest(raw)==release_sha,'ROOT_RELEASE_HASH')
    a=json.loads(raw)
    need(a.get('authorized') is True and a.get('authorizedBy')=='root' and isinstance(a.get('codePins'),dict),'ROOT_BOOTSTRAP')
    buffers={}
    for name in ('failed_resource.py','predicates.py','guard-failed-resource.bash'):
        buffers[name]=c.read(name)
        need(digest(buffers[name])==a['codePins'].get(name),'CODE_BEFORE_EXECUTION')
    source=buffers['predicates.py'];c.check()
    scope={'__name__':'_exact_verified_failed_resource_policy'}
    exec(compile(source,'<verified-predicates>','exec'),scope)
    for name in ('PROTOCOL','SOURCE','GAPS','Hold','need','authority','preserved','current','admission','readiness','permit','gate','typed_identity','negative_record','held_record'):globals()[name]=scope[name]
    return a



def verified_bytes(b,path,extra=None):
    raw=safe_bytes(path);want=b.get('loaded',{}).get(str(path))
    if extra and str(path) in extra:want=extra[str(path)]
    if want is not None:need(digest(raw)==want,'IMMUTABLE_INTERPRET_BUFFER_CHANGED')
    return raw

def verified_read(b,path):
    need(str(path) in b['loaded'],'UNBOUND_IMMUTABLE_JSON')
    return json.loads(verified_bytes(b,path))

def external_buffer(path):
    custody=Custody(Path(path).parent)
    try:return custody.read(Path(path).name,None)
    finally:custody.close()

def validate_python_roles(a):
    roles=a['pythonRoles'];need(set(roles)=={'launch','reported','process'},'PYTHON_ROLE_SET')
    for role,item in roles.items():
        need(set(item)=={'path','sha256'} and isinstance(item['path'],str) and Path(item['path']).is_absolute() and str(Path(item['path']).resolve())==item['path'],'PYTHON_ROLE_PATH')
        need(digest(external_buffer(item['path']))==item['sha256'],'PYTHON_ROLE_BINARY')
    need(str(Path(sys.executable).resolve())==roles['reported']['path'],'PYTHON_REPORTED_ROLE')
    need(isinstance(sys.orig_argv,list) and bool(sys.orig_argv) and str(Path(sys.orig_argv[0]).resolve())==roles['launch']['path'],'PYTHON_LAUNCH_ROLE')

def client_identity(b,scope,row):
    """Exact configured process image, independent of unrelated basename maps."""
    pid=row['pid'];roles=b['a']['pythonRoles'];process=roles['process']
    before={key:scope['pid_text'](pid,key) for key in ('lstart','comm','command')}
    need(before['lstart']==row['start'] and isinstance(before['command'],str) and digest(before['command'].encode())==row['argvHash'],'CLIENT_OBSERVATION_START_ARGV')
    need(before['comm']==process['path'],'CLIENT_PROCESS_ROLE')
    mappings=scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pid),'-d','txt','-F','n'],(0,))
    need(isinstance(mappings,str) and 'n'+process['path'] in mappings.splitlines(),'CLIENT_PROCESS_MAP_MISSING')
    image=Path(process['path']);custody=Custody(image.parent)
    try:
        first=os.stat(image.name,dir_fd=custody.fd,follow_symlinks=False)
        key=lambda st:(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_mode)
        raw=custody.read(image.name,None);need(digest(raw)==process['sha256'],'CLIENT_PROCESS_FILE_HASH')
        need(str(Path(sys.executable).resolve())==roles['reported']['path'] and digest(external_buffer(roles['reported']['path']))==roles['reported']['sha256'],'CLIENT_REPORTED_ROLE')
        after={k:scope['pid_text'](pid,k) for k in ('lstart','comm','command')}
        need(before==after,'CLIENT_IDENTITY_UNSTABLE')
        final_mappings=scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pid),'-d','txt','-F','n'],(0,))
        need(isinstance(final_mappings,str) and 'n'+process['path'] in final_mappings.splitlines(),'CLIENT_PROCESS_MAP_UNSTABLE')
        need(str(Path(sys.executable).resolve())==roles['reported']['path'] and digest(external_buffer(roles['reported']['path']))==roles['reported']['sha256'],'CLIENT_REPORTED_ROLE_UNSTABLE')
        again=custody.read(image.name,None);last=os.stat(image.name,dir_fd=custody.fd,follow_symlinks=False)
        need(key(first)==key(last) and digest(again)==process['sha256'],'CLIENT_IMAGE_UNSTABLE');custody.check()
    finally:custody.close()
    return {**row,'identityComplete':True,'commHash':digest(before['comm'].encode()),'executableHash':digest(process['path'].encode()),'executableFileHash':process['sha256'],'reportedExecutableHash':digest(roles['reported']['path'].encode()),'reportedExecutableFileHash':roles['reported']['sha256'],'launchExecutableHash':digest(roles['launch']['path'].encode())}

def negative_header(denial,release_sha,pin_sha,shell_pid,_member=member_name):
    need(isinstance(denial,dict) and set(denial)=={'kind','unit','releaseSha256','activeLockSha256','status','shellPid','readinessAbsent','permitAbsent','client','clientJournal','clientJournalSha256'},'NEGATIVE_SCHEMA')
    typed_identity(denial['client'])
    need(_member(denial['clientJournal']),'NEGATIVE_JOURNAL_MEMBER')
    expected={'kind':'NEW_VERIFICATION_CLIENT','mode':'gate','releaseSha256':release_sha,'identity':denial['client']}
    negative_record(denial,expected,release_sha,pin_sha,shell_pid)


def original_membership(actual,wanted):
    need(set(actual)==set(wanted),'ORIGINAL_PACKAGE_SET_CHANGED')


def write_new(b,name,value):b['custody'].write(name,value)
def local_bytes(b,name):
    need(member_name(name),'MEMBER_NAME');raw=b['custody'].read(name)
    loaded=b.setdefault('loaded',{});key=str(HERE/name)
    want=loaded.get(key) or b.get('a',{}).get('pins',{}).get(name)
    if want is not None:need(digest(raw)==want,'LOCAL_IMMUTABLE_BUFFER_CHANGED')
    loaded[key]=digest(raw);return raw
def local(b,name):return json.loads(local_bytes(b,name))

def optional(b,name):return None if b['custody'].absent(name) else local(b,name)


def load_fixed_module(path,expected,name):
    source=safe_bytes(path);need(digest(source)==expected,'REUSE_CODE_HASH')
    module=type(sys)(name);module.__file__=str(path);exec(compile(source,str(path),'exec'),module.__dict__);return module


def load_authority(release_sha):
    need(HERE==UNIT/'failed-resource-disposition01','INSTALLATION')
    c=Custody(HERE,0o700);a=bootstrap(c,release_sha);authority(a)
    allowed={'predicates.py','failed_resource.py','guard-failed-resource.bash','retained-contract.json','input-pins.json','root-disposition-authorization.json','root-admission.json','negative-readiness-denial.json','held-proof.json','readiness.json','permit.json','gate-allow.json','root-wrapper-result.json','postclose.json'}
    for name in c.members():
        need(name in allowed or re.fullmatch(r'(client-[0-9]+-[0-9a-f]{16}|utility-[0-9]+-[0-9a-f]{16}-[0-9]+)\.json',name),'UNEXPECTED_NAMESPACE_MEMBER');c.read(name)
    need(a['originalReleaseSha256']==OLD_RELEASE and a['activeLockSha256']==PIN and a['terminalIndexSha256']==INDEX,'EXACT_ORIGINAL_AUTHORITY')
    loaded={str(HERE/'root-disposition-authorization.json'):release_sha}
    buffers={}
    def pin(path,want,mode=None):
        raw=safe_bytes(path,mode);need(digest(raw)==want,'IMMUTABLE_PIN_CHANGED');loaded[str(path)]=want;buffers[str(path)]=raw;return raw
    def verified_json(path,want):return json.loads(pin(path,want))
    need(set(a['codePins'])=={'predicates.py','failed_resource.py','guard-failed-resource.bash'},'CODE_SET')
    for n,h in a['codePins'].items():pin(HERE/n,h,0o600)
    need(set(a['pins'])=={'retained-contract.json','input-pins.json'},'LOCAL_PIN_SET')
    for n,h in a['pins'].items():pin(HERE/n,h,0o600)
    inputs=json.loads(buffers[str(HERE/'input-pins.json')])
    for row in inputs['records']:pin(ROOT/row['path'],row['sha256'])
    index=verified_json(UNIT/'root-terminal-evidence-index-01.json',INDEX);need(len(index['facts'])==27,'TERMINAL_INDEX_SET')
    for row in index['facts']:pin(ROOT/row['path'],row['sha256'])
    need(digest(safe_bytes(UNIT/'root-actual-unit-release.json'))==OLD_RELEASE and digest(safe_bytes(UNIT/'active-lock.json'))==PIN,'ANCESTRY')
    old=verified_json(UNIT/'root-actual-unit-release.json',OLD_RELEASE)
    for group,directory in (('executionPackagePins','execution'),('controlPackagePins','control')):
        for rel,h in old[group].items():pin(UNIT/rel,h,0o600)
        package=Custody(UNIT/directory,0o700)
        try:original_membership({directory+'/'+n for n in package.members()},old[group])
        finally:package.close()
    retained=json.loads(buffers[str(HERE/'retained-contract.json')]);preserved(a,retained,inputs['retainedContract'])
    for role,h in a['reviewPins'].items():
        row=a['reviewRecords'][role];need(row['sha256']==h,'REVIEW_BINDING');pin(ROOT/row['path'],h)
    validate_python_roles(a)
    c.check()
    return {'a':a,'sha':release_sha,'loaded':loaded,'retained':retained,'custody':c,'pin':verified_json(UNIT/'active-lock.json',PIN),'plan':verified_json(UNIT/'execution/successor-plan.json',old['executionPackagePins']['execution/successor-plan.json']),'utilities':[],'utilityCounter':0}


def utility_capture(b,command,allowed=(0,)):
    need(isinstance(allowed,tuple) and bool(allowed) and all(type(x) is int and x in (0,1) for x in allowed),'UTILITY_ALLOWED_STATUS_SCOPE')
    need(isinstance(command,list) and command and all(isinstance(x,str) for x in command),'UTILITY_COMMAND')
    key=command[0];need(key in b['a']['observationExecutables'],'UTILITY_EXECUTABLE')
    binding=b['a']['observationExecutables'][key];path=Path(binding['path'])
    need(path.is_absolute() and str(path.resolve())==str(path),'UTILITY_CANONICAL')
    external=Custody(path.parent)
    try:need(digest(external.read(path.name,None))==binding['sha256'],'UTILITY_BINARY')
    finally:external.close()
    actual=[str(path),*command[1:]]
    child=subprocess.Popen(actual,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    b['utilityCounter']+=1
    need(type(child.pid) is int and child.pid>0,'UTILITY_PID_TYPE')
    record={'kind':'SYNCHRONOUS_BOUND_OBSERVATION_UTILITY','client':b['client'],'releaseSha256':b['sha'],'pid':child.pid,'command':actual,'executableSha256':binding['sha256'],'terminal':False,'status':None,'allowedStatuses':list(allowed),'stderrComplete':False,'stderrEmpty':False,'stdoutComplete':False}
    try:
        output,error=child.communicate(timeout=15)
        record.update(terminal=True,status=child.returncode,stderrComplete=isinstance(error,str),stderrEmpty=error=='',stdoutComplete=isinstance(output,str))
        need(isinstance(output,str),'UTILITY_STDOUT_INCOMPLETE')
        if command==['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command=']:
            matching=[line.split(None,7) for line in output.splitlines() if line.split(None,1) and line.split(None,1)[0]==str(child.pid)]
            need(len(matching)==1 and len(matching[0])==8,'CENSUS_UTILITY_ROW_UNKNOWN')
            record['observedStart']=' '.join(matching[0][2:7]);record['observedArgvHash']=digest(matching[0][7].encode())
    finally:
        name='utility-'+str(b['client']['pid'])+'-'+digest(b['client']['start'].encode())[:16]+'-'+str(b['utilityCounter'])+'.json'
        b['utilities'].append(record)
        if b.get('clientBound') is True:write_new(b,name,record)
    need(record['stdoutComplete'] is True and record['stderrComplete'] is True and record['stderrEmpty'] is True and type(child.returncode) is int and child.returncode in allowed,'UTILITY_FAILED_OR_UNKNOWN')
    if child.returncode==1:need(output=='' and key in ('/bin/ps','/usr/sbin/lsof'),'NONEMPTY_NO_RESULT_UTILITY')
    b['lastUtility']=record;return output


def parse_census(text,b,mode,utility):
    need(type(utility.get('pid')) is int and utility['pid']>0,'CENSUS_UTILITY_PID_TYPE')
    rows={}
    for line in text.splitlines():
        words=line.split(None,7);need(len(words)==8,'CENSUS_INCOMPLETE')
        try:pid,parent=int(words[0]),int(words[1])
        except ValueError:raise Hold('CENSUS_PID')
        need(pid>0 and parent>=0 and pid not in rows,'CENSUS_DUPLICATE')
        rows[pid]={'pid':pid,'ppid':parent,'start':' '.join(words[2:7]),'argvHash':digest(words[7].encode()),'projectMarkerCandidate':any(marker in words[7] for marker in ('GradleDaemon','GradleWrapperMain','GradleWorkerMain','worker.org.gradle','obs007-joined-','obs015-prefix-sync-','checks-guided-'))}
    me=os.getpid();parent=os.getppid();need(rows and me in rows and parent in rows and rows[me]['ppid']==parent,'CENSUS_UNANCHORED')
    if 'client' in b:need(rows[me]['start']==b['client']['start'] and rows[me]['argvHash']==b['client']['argvHash'],'CLIENT_CENSUS_CHANGED')
    pin=b['pin']
    if mode!='postclose':
        need(parent==pin['shellPid'],'CENSUS_PARENT')
        for role in ('wrapper','shell'):
            need(type(pin[role+'Pid']) is int and pin[role+'Pid']>0,'CONTROLLER_PID_TYPE')
            row=rows.get(pin[role+'Pid']);need(row and row['start']==pin[role+'Start'] and row['argvHash']==pin[role+'ArgvSha256'],'CENSUS_CONTROLLER')
        need(rows[parent]['ppid']==pin['wrapperPid'],'CENSUS_DIRECT_PARENT')
    need(utility['terminal'] is True and type(utility['status']) is int and utility['status']==0,'CENSUS_UTILITY_TERMINAL')
    probe=rows.get(utility['pid']);need(probe and probe['ppid']==me and probe['argvHash']==digest(' '.join(utility['command']).encode()),'CENSUS_UTILITY_BINDING')
    utility['observedStart']=probe['start'];return rows


def helpers(b):
    core_buffer=safe_bytes(CORE);need(digest(core_buffer)==CORE_SHA,'CORE_HASH');nodes=ast.parse(core_buffer).body
    names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'};scope={'ROOT':ROOT}
    exec(compile(ast.Module(body=[n for n in nodes if isinstance(n,(ast.Import,ast.ImportFrom)) or isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'<pinned-readonly-core>','exec'),scope)
    scope['capture']=lambda cmd,allowed=(0,):utility_capture(b,cmd,allowed)
    def table():
        text=utility_capture(b,['/bin/ps','-ww','-axo','pid=,ppid=,lstart=,command='])
        census_utility=b['lastUtility']
        rows=parse_census(text,b,b['mode'],census_utility);b['censusUtility']=census_utility
        for pid,row in rows.items():
            if row['projectMarkerCandidate'] and scope['project_role'](pid) is None:raise Hold('CURRENT_PROJECT_CANDIDATE_UNKNOWN')
        return rows
    scope['table']=table
    old=load_fixed_module(UNIT/'control/unlock_gate.py',OLD_GATE_SHA,'_old_source_only');old.safe_bytes=lambda path:verified_bytes(b,path,{str(old.PLAN):old.PLAN_SHA})
    return scope,old


def register_client(b,mode):
    b['mode']=mode
    # Registration census has an anchored current client even before it has a journal.
    # Utility records need a provisional PID/start binding; obtain it from the
    # exact direct lstart/argv observation, then require the full fingerprint.
    provisional={'pid':os.getpid(),'start':'REGISTRATION_PENDING'}
    b['client']=provisional
    # The registration bootstrap's synchronous utilities are recorded against
    # that operation token; they never create an exclusion in a live census.
    scope,old=helpers(b)
    text=utility_capture(b,['/bin/ps','-ww','-p',str(os.getpid()),'-o','lstart='])
    start=text.strip();need(bool(start),'CLIENT_START_UNKNOWN')
    b['client']={'pid':os.getpid(),'start':start}
    # Full row anchor is completed before the first absence decision.
    argv=utility_capture(b,['/bin/ps','-ww','-p',str(os.getpid()),'-o','command=']).strip()
    b['client']['argvHash']=digest(argv.encode())
    rows=scope['table']();who=client_identity(b,scope,rows[os.getpid()]);typed_identity(who)
    need(who['executableHash']==digest(b['a']['pythonRoles']['process']['path'].encode()) and who['executableFileHash']==b['a']['pythonRoles']['process']['sha256'],'OBSERVED_CLIENT_WRONG_PYTHON')
    b['client']=who;name='client-'+str(who['pid'])+'-'+digest(who['start'].encode())[:16]+'.json'
    journal={'kind':'NEW_VERIFICATION_CLIENT','mode':mode,'releaseSha256':b['sha'],'identity':who}
    write_new(b,name,journal);b['clientJournal']=name;b['clientBound']=True
    for number,record in enumerate(b['utilities'],1):
        record['client']=who
        write_new(b,'utility-'+str(who['pid'])+'-'+digest(who['start'].encode())[:16]+'-'+str(number)+'.json',record)


def inventory_clients(b,rows):
    clients=[]
    for name in sorted(b['custody'].members()):
        if name.startswith('client-'):
            item=local(b,name);typed_identity(item['identity']);need(item['kind']=='NEW_VERIFICATION_CLIENT' and item['releaseSha256']==b['sha'],'CLIENT_HISTORY')
            who=item['identity'];need(name=='client-'+str(who['pid'])+'-'+digest(who['start'].encode())[:16]+'.json','CLIENT_FILENAME')
            b['loaded'][str(HERE/name)]=digest(local_bytes(b,name));clients.append(who)
    need(any(x==b['client'] for x in clients),'CLIENT_NOT_RECORDED')
    for name in b['custody'].members():
        if name.startswith('utility-'):
            item=local(b,name);typed_identity(item['client'])
            need(item['client'] in clients and item['releaseSha256']==b['sha'] and item['kind']=='SYNCHRONOUS_BOUND_OBSERVATION_UTILITY' and item['terminal'] is True and type(item['status']) is int and type(item['pid']) is int and item['pid']>0 and item.get('stdoutComplete') is True and item.get('stderrComplete') is True and item.get('stderrEmpty') is True and isinstance(item.get('allowedStatuses'),list) and all(type(x) is int for x in item['allowedStatuses']) and item['status'] in item['allowedStatuses'],'UTILITY_HISTORY_UNKNOWN')
            need(isinstance(item['command'],list) and item['command'] and all(isinstance(v,str) for v in item['command']),'UTILITY_HISTORY_COMMAND')
            token='utility-'+str(item['client']['pid'])+'-'+digest(item['client']['start'].encode())[:16]+'-'
            need(name.startswith(token) and name[len(token):-5].isdigit(),'UTILITY_HISTORY_NAME')
            b['loaded'][str(HERE/name)]=digest(local_bytes(b,name))
    return clients,[x for x in clients if x!=b['client'] and rows.get(x['pid'],{}).get('start')==x['start']]


def observe(b,postclose=False):
    b['custody'].check();scope,old=helpers(b);rows=scope['table']();pin=b['pin']
    for name in ('compile-reconcile','owned-compile-reconcile','compile-reconcile-authorization.json'):
        path=UNIT/name;need(not path.exists() and not path.is_symlink(),'UNAUTHORIZED_COMPILE_PATH_PRESENT')
    source=old.observe_source({'expectedFiles':b['plan']['source']['files'],'modes':b['plan']['sourceModes']},scope)
    receipt=verified_read(b,UNIT/'owned-full-check/receipt.json');roots=verified_read(b,UNIT/'root-live-phase-lineage-01-limited.json')
    recorded={(x['pid'],x['start']) for x in receipt['ownedIdentities']}
    for role in ('phaseKeeper','collector'):recorded.add((roots[role]['pid'],roots[role]['start']))
    need(len(recorded)==2439,'FINITE_RECORDED_UNION')
    rows=scope['table']();clients,prior=inventory_clients(b,rows)
    live=[x for x in recorded if rows.get(x[0],{}).get('start')==x[1]]
    roots_set={os.getpid()}
    if rows.get(pin['wrapperPid'],{}).get('start')==pin['wrapperStart']:roots_set.add(pin['wrapperPid'])
    descendants=set(roots_set)
    while True:
        more=descendants|{p for p,r in rows.items() if r['ppid'] in descendants}
        if more==descendants:break
        descendants=more
    utility=b['censusUtility'];probe=utility['pid']
    need(utility['terminal'] is True and utility.get('observedStart')==rows.get(probe,{}).get('start'),'CURRENT_PROBE_TERMINAL')
    # Exclude exactly this snapshot's already waited census utility, never its
    # descendants or arbitrary client children.
    unexpected=descendants-{os.getpid(),pin['wrapperPid'],pin['shellPid'],probe}
    unknown=[r for r in rows.values() if r['projectMarkerCandidate'] and scope['project_role'](r['pid']) is None]
    boundary=scope['boundary_inventory'](b['plan'])
    defects=any(boundary[x] for x in ('originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'))
    relevant={p for p,s in recorded if rows.get(p,{}).get('start')==s}|descendants|{x['pid'] for x in clients}
    listeners=[x for x in boundary['listeners'] if x['pid'] in relevant]
    lock=old.WRAPPER.with_name('gradle.lock');st=lock.lstat();need(stat.S_ISREG(st.st_mode) and [st.st_dev,st.st_ino]==pin['lockDevInode'],'LOCK_INODE')
    if not postclose:
        fields=scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pin['wrapperPid']),'-F','pfnil','--',str(lock)]).splitlines();need('p'+str(pin['wrapperPid']) in fields and 'i'+str(st.st_ino) in fields,'WRAPPER_FD')
    fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        need([os.fstat(fd).st_dev,os.fstat(fd).st_ino]==pin['lockDevInode'],'LOCK_OPEN_IDENTITY')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as e:need(e.errno in (errno.EAGAIN,errno.EACCES) and not postclose,'KERNEL_UNKNOWN');free=False
        else:fcntl.flock(fd,fcntl.LOCK_UN);free=True
    finally:os.close(fd)
    unchanged=all(digest(safe_bytes(Path(p)))==h for p,h in b['loaded'].items());b['custody'].check()
    final_rows=scope['table']()
    # Every current table is independently anchored; repeat negative decisions
    # against this final table, including all unbound current client children.
    final_desc={os.getpid()}
    if final_rows.get(pin['wrapperPid'],{}).get('start')==pin['wrapperStart']:final_desc.add(pin['wrapperPid'])
    while True:
        more=final_desc|{p for p,r in final_rows.items() if r['ppid'] in final_desc}
        if more==final_desc:break
        final_desc=more
    final_probe=b['censusUtility']['pid'];unexpected|=final_desc-{os.getpid(),pin['wrapperPid'],pin['shellPid'],final_probe}
    live += [x for x in recorded if final_rows.get(x[0],{}).get('start')==x[1]]
    _,final_prior=inventory_clients(b,final_rows);prior+=final_prior
    result={'observationOk':True,'metadataUnchanged':unchanged,'codeUnchanged':unchanged,'sourceDigest':source,'sourceExact':source==SOURCE,'recordedCount':len(recorded),'liveOwned':live,'currentUnknown':unknown,'unexpectedDescendants':sorted(unexpected),'ownedListeners':listeners,'inheritedMatched':len(boundary['inheritedMatched']),'boundaryDefects':defects,'clientsComplete':True,'priorClientsLive':prior,'sameHolder':not postclose,'kernelHeld':not free,'kernelFree':free,'controllersAbsentOrReused':all(final_rows.get(pin[r+'Pid'],{}).get('start')!=pin[r+'Start'] for r in ('wrapper','shell')),'clientIdentities':clients,'observedAtEpoch':time.time()}
    for name in ('compile-reconcile','owned-compile-reconcile','compile-reconcile-authorization.json'):
        path=UNIT/name;need(not path.exists() and not path.is_symlink(),'LATE_FORBIDDEN_COMPILE_PATH')
    b['custody'].check();current(result,postclose);return result


def pin_local(b,*names):
    for name in names:b['loaded'][str(HERE/name)]=digest(local_bytes(b,name))

def validate_negative(b):
    denial=local(b,'negative-readiness-denial.json');negative_header(denial,b['sha'],PIN,b['pin']['shellPid']);journal=local(b,denial['clientJournal'])
    negative_record(denial,journal,b['sha'],PIN,b['pin']['shellPid']);return denial


def validate_admission(b):
    ad=local(b,'root-admission.json');admission(ad,b['sha'],PIN);validate_negative(b)
    proof=local(b,'held-proof.json');held_record(proof,b['sha'],digest(local_bytes(b,'negative-readiness-denial.json')))
    need(type(ad.get('heldProofActualStatus')) is int and ad['heldProofActualStatus']==0 and ad.get('heldProofSeparateStatusCaptured') is True and ad.get('heldProofSha256')==digest(local_bytes(b,'held-proof.json')),'ADMISSION_HELD_PROOF')
    need(member_name(proof.get('clientJournal')) and proof['clientJournal']=='client-'+str(proof['client']['pid'])+'-'+digest(proof['client']['start'].encode())[:16]+'.json','HELD_JOURNAL_NAME')
    journal=local(b,proof['clientJournal']);need(journal=={'kind':'NEW_VERIFICATION_CLIENT','mode':'held-proof','releaseSha256':b['sha'],'identity':proof['client']} and proof['clientJournalSha256']==digest(compact(journal)),'HELD_PROOF_CLIENT_JOURNAL')
    need(ad['negativeDenialSha256']==digest(local_bytes(b,'negative-readiness-denial.json')),'NEGATIVE_HASH')
    pin_local(b,'root-admission.json','negative-readiness-denial.json','held-proof.json');return ad


def operate(b,mode,requested=None):
    if mode=='gate' and optional(b,'readiness.json') is None:
        need(requested==1 and type(requested) is int and optional(b,'permit.json') is None,'NEGATIVE_EXPLICIT_ONE')
        journal=local(b,b['clientJournal'])
        denial={'kind':'NEW_READINESS_MISSING_DENIAL','unit':'obs011-t0-c8-check01','releaseSha256':b['sha'],'activeLockSha256':PIN,'status':1,'shellPid':b['pin']['shellPid'],'readinessAbsent':True,'permitAbsent':True,'client':b['client'],'clientJournal':b['clientJournal'],'clientJournalSha256':digest(compact(journal))}
        negative_record(denial,journal,b['sha'],PIN,b['pin']['shellPid']);write_new(b,'negative-readiness-denial.json',denial);raise Hold('MISSING_READINESS')
    if mode=='held-proof':
        need(type(requested) is int and requested==1,'SEPARATE_NEGATIVE_STATUS_ONE');validate_negative(b)
        need(optional(b,'readiness.json') is None and optional(b,'permit.json') is None,'HELD_PROOF_ORDER')
        first=observe(b);second=observe(b)
        write_new(b,'held-proof.json',{'kind':'SAME_HOLDER_AFTER_NEGATIVE_PROOF','unit':'obs011-t0-c8-check01','releaseSha256':b['sha'],'negativeDenialSha256':digest(local_bytes(b,'negative-readiness-denial.json')),'verificationExit':0,'separateNegativeStatus':requested,'client':b['client'],'clientJournal':b['clientJournal'],'clientJournalSha256':digest(compact(local(b,b['clientJournal']))),'before':first,'after':second,'C8Credit':False});return
    if mode=='final':
        need(optional(b,'readiness.json') is None and optional(b,'permit.json') is None,'NO_REUSE');validate_admission(b)
        first=observe(b);second=observe(b)
        write_new(b,'readiness.json',{'protocol':PROTOCOL,'kind':'QUALIFIED_FAILED_RESOURCE_READINESS','verificationExit':0,'releaseSha256':b['sha'],'retainedContractSha256':b['a']['retainedContractSha256'],'expectedWrapperExit':1,'historicalGapCodes':GAPS,'C8Credit':False,'verifiedAtEpoch':time.time(),'before':first,'after':second,'admissionSha256':digest(local_bytes(b,'root-admission.json'))});return
    if mode=='gate':
        ad=validate_admission(b);ready=local(b,'readiness.json');p=local(b,'permit.json');ready_sha=digest(local_bytes(b,'readiness.json'));before=time.time()
        readiness(ready,b['sha'],b['a']['retainedContractSha256'],before);permit(p,ready,ready_sha,b['sha'],before,requested)
        need(ready['admissionSha256']==digest(local_bytes(b,'root-admission.json')),'ADMISSION_CHANGED');pin_local(b,'readiness.json','permit.json')
        first=observe(b);second=observe(b);after=time.time()
        decision=gate(b['a'],b['retained'],local(b,'input-pins.json')['retainedContract'],ad,ready,p,b['sha'],ready_sha,first,second,before,after,requested)
        write_new(b,'gate-allow.json',{'decision':decision,'releaseSha256':b['sha'],'readinessSha256':ready_sha,'permitSha256':digest(local_bytes(b,'permit.json')),'before':first,'after':second,'atEpoch':after,'expectedWrapperExit':1,'C8Credit':False});return
    need(mode=='postclose','MODE');validate_admission(b)
    result=local(b,'root-wrapper-result.json');allowed=local(b,'gate-allow.json')
    need(type(result['actualWrapperExit']) is int and result['actualWrapperExit']==1 and result['separatelyCaptured'] is True and result['releaseSha256']==b['sha'] and result['gateAllowSha256']==digest(local_bytes(b,'gate-allow.json')),'ACTUAL_WRAPPER_RESULT')
    need(allowed['decision']=='ALLOW_QUALIFIED_FAILED_RESOURCE_EXIT_ONE' and allowed['releaseSha256']==b['sha'] and allowed['readinessSha256']==digest(local_bytes(b,'readiness.json')) and allowed['permitSha256']==digest(local_bytes(b,'permit.json')),'CLOSE_CHAIN')
    ready=local(b,'readiness.json');p=local(b,'permit.json')
    need(type(allowed['expectedWrapperExit']) is int and allowed['expectedWrapperExit']==1 and allowed['C8Credit'] is False,'GATE_ALLOW_EXIT_TYPE')
    readiness(ready,b['sha'],b['a']['retainedContractSha256'],allowed['atEpoch']);permit(p,ready,digest(local_bytes(b,'readiness.json')),b['sha'],allowed['atEpoch'],1)
    pin_local(b,'root-wrapper-result.json','gate-allow.json','readiness.json','permit.json')
    first=observe(b,True);second=observe(b,True);write_new(b,'postclose.json',{'status':'QUALIFIED_FAILED_RESOURCE_POSTCLOSE_OBSERVED','releaseSha256':b['sha'],'actualWrapperExit':1,'before':first,'after':second,'historicalGapCodes':GAPS,'C8Credit':False})


def main():
    need(len(sys.argv) in (3,4),'ARGUMENTS');mode,release_sha=sys.argv[1:3]
    need(mode in ('final','gate','held-proof','postclose'),'MODE')
    b=load_authority(release_sha)
    try:
        register_client(b,mode);operate(b,mode,int(sys.argv[3]) if len(sys.argv)==4 else None)
    except BaseException:
        if b.get('clientBound') is not True:
            b['custody'].write('registration-failed-'+str(os.getpid())+'.json',{'kind':'UNQUALIFIED_CLIENT_REGISTRATION_HOLD','client':b.get('client'),'utilities':b['utilities'],'releaseSha256':b['sha']})
        raise
    finally:b['custody'].close()
    print(json.dumps({'status':'FAILED_RESOURCE_'+mode.upper()+'_VERIFIED','C8Credit':False}));return 0

if __name__=='__main__':
    try:status=main()
    except BaseException as error:print(json.dumps({'status':'HOLD','reason':str(error) if isinstance(error,Hold) else type(error).__name__,'C8Credit':False}));status=1
    sys.exit(status)

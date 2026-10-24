"""One dispatcher composition; actual callbacks/System/Custody, fixed fake metadata.

Preload only named public source and literal fake FS/audit definitions. No installer,
source window, owner/control author, observer or target resource operation is called.
"""
from pathlib import Path,PurePosixPath
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch

HERE=Path(__file__).absolute().parent
TARGET={n:(HERE/n).read_bytes() for n in ('failed_gateway.py','custody.py','protocol.py','contract.json')}
FIXTURE=(HERE.parent/'resume4/checks.py').read_bytes()
SOURCE_HASHES={n:hashlib.sha256(raw).hexdigest() for n,raw in TARGET.items()}
FIXTURE_HASH=hashlib.sha256(FIXTURE).hexdigest()
# Select the unchanged inherited boundary definitions only, never its preload,
# large build(), flow or tests. SAME namespaces persist for the full composition.
tree=ast.parse(FIXTURE)
wanted={'MemPath','FS','Handle','blocked','audit'}
selected=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in wanted]
assert {n.name for n in selected}==wanted
G=dict(HERE=HERE,Path=Path,PurePosixPath=PurePosixPath,os=os,stat=stat,types=types,errno=errno,BLOCKED=[])
exec(compile(ast.Module(body=selected,type_ignores=[]),'<literal-inherited-fake-fs-and-persistent-deny>','exec'),G)
MemPath,FS=G['MemPath'],G['FS']
C=types.ModuleType('_source08b_real_custody');P=types.ModuleType('_source08b_real_protocol');A=types.ModuleType('_source08b_real_adapter')
exec(compile(TARGET['custody.py'],'<source08b-custody>','exec'),C.__dict__)
exec(compile(TARGET['protocol.py'],'<source08b-protocol>','exec'),P.__dict__)
A.__dict__.update(Custody=C.Custody,P=P)
exec(compile(TARGET['failed_gateway.py'],'<source08b-adapter>','exec'),A.__dict__)
# Path and api are explicit fake boundaries; every actual method body is retained.
A.Path=MemPath
klass=next(n for n in ast.parse(TARGET['failed_gateway.py']).body if isinstance(n,ast.ClassDef) and n.name=='Unit')
load=next(n for n in klass.body if isinstance(n,ast.FunctionDef) and n.name=='load_libraries')
targets={'leaf.anchored_raw','d.SAFE_READER','d.TOOL_READER','d.sha'}
assignments=[n for n in load.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Attribute) and ast.unparse(t) in targets for t in n.targets)]
assert len(assignments)==4
ASSIGN=compile(ast.Module(body=assignments,type_ignores=[]),'<actual-source08b-four-callback-assignments>','exec')
K=json.loads(TARGET['contract.json'])
PRIVATE='docs/qa/evidence/STUDIO-OBS-011/t0/resume2-gateway80-source04-install-input-directory-facts.json'
assert K['externalInputModes'][PRIVATE]==0o600 and len(K['externalInputModes'])==29
RESULT_FD=os.open(str(HERE/'dispatcher-results.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
WRITE,CLOSE=os.write,os.close
CHECKS=[];DETAILS=[]
def check(name,value):
 if value is not True:raise AssertionError(name)
 CHECKS.append(name)
def build():
 fs=FS();MemPath.fs=fs
 s=A.System();s.api=types.SimpleNamespace(**{name:getattr(fs,name) for name in ('open','fstat','stat','close','read','getuid')});s.path=MemPath
 specs={}
 for rel in K['externalSourcePins']:
  raw=b'SYNTHETIC_SOURCE08B_REGISTERED_'+rel.encode('ascii')
  path=str(A.R/rel)
  # Fixed fake metadata is independent of the mode requested at read time.
  actual_mode=0o600 if rel==PRIVATE else 0o644
  fs.put(path,raw,actual_mode);specs[path]=(P.sha(raw),K['externalInputModes'][rel])
 unit=A.Unit.__new__(A.Unit);unit.s=s;unit.a={'binaryModes':{}};unit.external_inputs=specs;unit.pins={};unit.file_facts={};unit.buffers={}
 leaf=types.SimpleNamespace();driver=types.SimpleNamespace()
 exec(ASSIGN,dict(self=unit,leaf=leaf,d=driver,P=P))
 return fs,s,unit,leaf,driver
failure=None
sys.addaudithook(G['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for name in names:
    if hasattr(obj,name):stack.enter_context(patch.object(obj,name,G['blocked']))
  for scenario in ('accepted','wrong_mode','wrong_hash','unregistered'):
   fs,s,unit,leaf,d=build();private=str(A.R/PRIVATE)
   alias=private.rsplit('/',1)[0]+'/./'+private.rsplit('/',1)[1]
   callbacks=(('leaf.anchored_raw',leaf.anchored_raw),('d.SAFE_READER',d.SAFE_READER),('d.TOOL_READER',d.TOOL_READER),('d.sha',d.sha))
   check(scenario+'_actual_system_and_custody',type(s) is A.System and A.Custody is C.Custody)
   if scenario=='wrong_mode':fs.nodes[private]['mode']=0o644
   if scenario=='wrong_hash':fs.nodes[private]['raw']=b'SYNTHETIC_CHANGED_REGISTERED_BODY'
   if scenario=='unregistered':
    private='/synthetic/source08b-unregistered';alias='/synthetic/./source08b-unregistered';fs.put(private,b'SYNTHETIC_UNREGISTERED_BODY',0o755)
   before=copy.deepcopy(fs.nodes);before_reads=len([e for e in fs.events if e[0]=='read'])
   for name,callback in callbacks:
    used=[]
    spellings=(MemPath(private),private,alias) if scenario=='accepted' else (alias,)
    for spelling in spellings:
     if scenario in ('accepted','unregistered'):
      received=callback(spelling);expected=fs.nodes[private]['raw']
      check(scenario+'_'+name+'_'+str(len(CHECKS))+'_return',received==(P.sha(expected) if name=='d.sha' else expected))
     else:
      try:used.append(callback(spelling))
      except (C.Hold,P.Hold) as error:
       check(scenario+'_'+name+'_reason',error.args==(('FILE_OWNER_MODE_CAP',) if scenario=='wrong_mode' else ('VERIFIED_CONSUMED_BUFFER_CHANGED',)))
      else:raise AssertionError('EXPECTED_CALLBACK_DENIAL_'+scenario+'_'+name)
      check(scenario+'_'+name+'_not_used_or_retained',not used and private not in unit.buffers and private not in unit.file_facts)
   reads=len([e for e in fs.events if e[0]=='read'])-before_reads
   check(scenario+'_closed_and_no_mutation',not fs.fds and not C.Custody.OWNED and fs.nodes==before)
   if scenario=='accepted':check('canonical_path_string_alias_same_registered_buffer',unit.buffers[private]==fs.nodes[private]['raw'] and unit.pins[private]==unit.external_inputs[private][0])
   if scenario=='wrong_mode':check('wrong_mode_before_body',reads==0)
   if scenario=='wrong_hash':check('wrong_hash_read_before_reject_never_use',reads==4 and not unit.buffers and not unit.pins)
   if scenario=='unregistered':check('unregistered_existing_mode_none_cap_route',private not in unit.external_inputs and not unit.buffers and not unit.pins and reads==4)
   DETAILS.append(dict(scenario=scenario,fakeBodyReadCalls=reads,selectedDescriptorsClosed=not fs.fds))
  check('persistent_deny_no_real_boundaries',G['BLOCKED']==[])
except BaseException as error:failure=dict(type=type(error).__name__,args=[str(x)[:256] for x in error.args])
result=dict(kind='SOURCE08B_SINGLE_SMALL_CHANGED_DISPATCHER_COMPOSITION',checks=CHECKS,passed=len(CHECKS),scenarios=DETAILS,failure=failure,sourceHashes=SOURCE_HASHES,literalFakeFsAuditSourceSha256=FIXTURE_HASH,actualCallbackAssignments=4,actualSystemAndCustodyBodies=True,sameCompiledNamespaces=True,persistentDenyAuditUnchanged=True,preloadBeforeDeny=True,realBoundaryCalls=G['BLOCKED'],synthetic29KeyFixture=True,originalPrivateBodyStatHashAcquired=False,actualTargetEffects=0,oldSuitesReplayed=False,installationClaimed=False)
raw=(json.dumps(result,indent=2)+'\n').encode();offset=0
while offset<len(raw):offset+=WRITE(RESULT_FD,raw[offset:])
CLOSE(RESULT_FD)
print(json.dumps(dict(passed=len(CHECKS),scenarios=len(DETAILS),failure=failure)))
raise SystemExit(1 if failure else 0)

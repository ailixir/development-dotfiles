"""Aria bounded actual controller/loader pairs; no real target effects.

Reuses inspected exact model definitions with its single disclosed READY yield
and unchanged persistent audit. All approved source buffers are externally
verified before interpretation, then supplied to the fixture from that cache.
No subject safety AST edits, Java, sockets, threads or native execution.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch

S=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume1')
manifest_raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(manifest_raw).hexdigest()!='fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f':raise ValueError('EXTERNAL_SUBJECT_MANIFEST')
rows=json.loads(manifest_raw)['files'];verified={}
for row in rows:
 p=S/row['path'];raw=p.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=row['sha256'] or len(raw)!=row['bytes'] or stat.S_IMODE(p.stat().st_mode)!=row['mode']:raise ValueError('SUBJECT_MEMBER_'+row['path'])
 verified[str(p)]=raw
flow=verified[str(S/'flow_checks.py')];tree=ast.parse(flow)
cut=next(n.lineno for n in tree.body if isinstance(n,ast.With))
lines=flow.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=flow:raise ValueError('EXACT_FIXTURE_PREFIX_REVERSE_PROOF')
ns={'__file__':str(S/'flow_checks.py'),'__name__':'_aria_guarded_definition_prefix'}
def prepared_read(path):
 if str(path) not in verified:raise ValueError('UNAPPROVED_FIXTURE_READ')
 return verified[str(path)]
with patch.object(Path,'read_bytes',prepared_read):
 exec(compile(prefix,'<exact-inspected-source01-fixture-prefix>','exec'),ns)

check=ns['check'];CASES=[];C=ns['C'];K=ns['K'];R=ns['R'];P=ns['P']
source_tree=ast.parse(verified[str(S/'source_checks.py')])
fsnode=next(n for n in source_tree.body if isinstance(n,ast.ClassDef) and n.name=='FileSystem')
fsns=dict(ns);exec(compile(ast.Module(body=[fsnode],type_ignores=[]),'<exact-inspected-fake-filesystem>','exec'),fsns)
BaseFS=fsns['FileSystem'];loader_raw=verified[str(S/'entry_loader.py')]

class MultiFS(BaseFS):
 def __init__(self,unknown):super().__init__(b'pass\n');self.unknown=unknown;self.leaves=[]
 def open(self,name,flags,**kwargs):
  fd=super().open(name,flags,**kwargs)
  if not flags&self.O_DIRECTORY:self.raw=b'pass\n';self.leaves.append(fd)
  return fd
 def fstat(self,fd):
  value=super().fstat(fd)
  if not self.handles[fd][1]:value.st_size=5
  return value
 def close(self,fd):
  self.closed.append(fd)
  if self.unknown and len(self.leaves)==4 and fd==self.leaves[-1]:raise OSError('SYNTHETIC_LATE_CLOSE_UNKNOWN')

def invocation_case(bad):
 model=ns['Model']('parser');ordinary=ns['Ordinary'](model);wait=ordinary.wait
 if bad:
  def malformed_wait(process):wait(process);return ['SYNTHETIC_INVALID_NATIVE_CONTAINER']
  ordinary.wait=malformed_wait
 custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:ns['Directory'](model,path,mode,ownership))
 custody.__source_sha256__=K.__source_sha256__
 boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
 modules=dict(custody=custody,relay=R,contract=P,controller=C)
 invocation=C.Invocation(ordinary,modules,model,boundary);result=None;exception=None
 try:result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
 except BaseException as failure:exception=type(failure).__name__
 if not bad:
  check('ARIA_COMPLETE_PARSER_POSITIVE',exception is None and result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and result['canonicalClosed'] is True)
  check('ARIA_POSITIVE_TYPED_NATIVE_FIELDS',type(result['nativeStatus']) is int and len(result['nativeArchiveSha256'])==64)
 else:
  check('ARIA_MALFORMED_CONTAINER_FINAL_SNAPSHOT_ESCAPES',exception=='AttributeError' and result is None)
  check('ARIA_MALFORMED_CONTAINER_REJECTED_PRIMARY',invocation.primary=='SCHEMA')
  check('ARIA_MALFORMED_CONTAINER_CLEANUP_UNKNOWN_RETAINED',invocation.cleanup=='CLEANUP_UNCONFIRMED' and invocation in C.RETAINED and bool(invocation.ownership.blockers()))
  check('ARIA_MALFORMED_CONTAINER_NO_CLOSED_RESULT',invocation.result is None and invocation.consumed is True)
 CASES.append(dict(case='invalid_native_container' if bad else 'positive_parser',escapedExceptionClass=exception,typedResultReturned=result is not None,primary=invocation.primary,cleanup=invocation.cleanup,actualNativeActions=0))

with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
  (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
  (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
  (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
  for name in names:
   if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['denied']))
 invocation_case(False);invocation_case(True)
 for opt in (0,2):
  for unknown in (False,True):
   module=types.ModuleType('_aria_actual_loader');exec(compile(loader_raw,'<exact-source01-loader>','exec',optimize=opt),module.__dict__)
   fs=MultiFS(unknown);load=module.Load(fs);seen=[]
   def compiling(*args,**kwargs):seen.append(1);return compile(*args,**kwargs)
   module.compile=compiling
   specs={name:ns['H']['spec']('/synthetic/'+name,b'pass\n') for name in module.NAMES};result=None;exception=None
   try:result=load.load(specs,opt)
   except BaseException as failure:exception=type(failure).__name__
   if unknown:
    check('ARIA_LAST_CLOSE_DENIES_ALL_INTERPRETATION_O'+str(opt),exception=='BootstrapHold' and seen==[] and load.primary=='NONE' and load.cleanup=='BOOTSTRAP_CLOSE_UNCONFIRMED')
    check('ARIA_LAST_CLOSE_ACTUAL_UNKNOWN_RETAINED_O'+str(opt),len([x for x in load.records if x['state']=='UNKNOWN'])==1 and load in module.RETAINED)
   else:check('ARIA_ALL_CLOSED_BEFORE_FOUR_COMPILES_O'+str(opt),exception is None and len(result)==4 and len(seen)==4 and all(x['state']=='CLOSED' for x in load.records))
   check('ARIA_BOOTSTRAP_NO_RETRY_O'+str(opt)+'_'+str(unknown),len(fs.closed)==len(set(fs.closed)))
   CASES.append(dict(case='late_bootstrap_close_unknown' if unknown else 'clean_bootstrap',optimize=opt,compileCalls=len(seen),exceptionClass=exception,primary=load.primary,cleanup=load.cleanup))
 check('ARIA_PERSISTENT_AUDIT_ZERO_REAL_CALLS',ns['BLOCKED']==[])

print(json.dumps(dict(kind='ARIA_JAVA_QUALIFICATION_SOURCE01_TARGETED_CONTROLLER_LOADER_PAIRS',checks=len(ns['CHECKS']),results=ns['CHECKS'],cases=CASES,whole357Replayed=False,
 fixturePrefixReverseProof=True,fixtureSingleReadyYield=True,subjectSafetyAstEdited=False,actualJavaCompilerTlsUnixPeerPlatformActions=0,forbiddenBoundaryCalls=ns['BLOCKED'],
 limitations='Synthetic ordinary adapter/source/input/identity authority and cooperative READY scheduling only; no real threads or platform/native qualification.'),indent=2))

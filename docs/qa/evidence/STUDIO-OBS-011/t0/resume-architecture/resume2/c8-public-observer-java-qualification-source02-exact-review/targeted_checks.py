"""Aria: bounded actual Invocation projection/cleanup preservation pairs.

Exact inspected flow definition prefix and its original unchanged persistent
audit; one disclosed READY yield/reverse proof, no subject safety AST edits.
Every reached effect is fake in the same compiled namespace. No Java/native.
"""
import ast,builtins,copy,ctypes,fcntl,hashlib,io,json,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from pathlib import Path
from contextlib import ExitStack
from unittest.mock import patch

S=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume2')
raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f':raise ValueError('EXTERNAL_SUBJECT_MANIFEST')
verified={}
for row in json.loads(raw)['files']:
 p=S/row['path'];b=p.read_bytes()
 if hashlib.sha256(b).hexdigest()!=row['sha256'] or len(b)!=row['bytes'] or stat.S_IMODE(p.stat().st_mode)!=row['mode']:raise ValueError('EXACT_SOURCE_MEMBER')
 verified[str(p)]=b
flow=verified[str(S/'flow_checks.py')];tree=ast.parse(flow);cut=next(n.lineno for n in tree.body if isinstance(n,ast.With));lines=flow.decode().splitlines(keepends=True);prefix=''.join(lines[:cut-1])
if (prefix+''.join(lines[cut-1:])).encode()!=flow:raise ValueError('EXACT_FIXTURE_PREFIX_REVERSE_PROOF')
def preloaded(path):
 if str(path) not in verified:raise ValueError('UNAPPROVED_SOURCE_READ')
 return verified[str(path)]
ns={'__file__':str(S/'flow_checks.py'),'__name__':'_aria_source02_guarded_prefix'}
with patch.object(Path,'read_bytes',preloaded):exec(compile(prefix,'<exact-inspected-source02-model-prefix>','exec'),ns)
C=ns['C'];K=ns['K'];R=ns['R'];P=ns['P'];check=ns['check'];cases=[];dispatched=[]

class Hostile:
 def __bool__(self):dispatched.append('bool');raise AssertionError('ARBITRARY_METHOD')
 def __repr__(self):dispatched.append('repr');raise AssertionError('ARBITRARY_METHOD')
 def __str__(self):dispatched.append('str');raise AssertionError('ARBITRARY_METHOD')
 def get(self,*args):dispatched.append('get');raise AssertionError('ARBITRARY_METHOD')

def run(kind):
 model=ns['Model']('parser');ordinary=ns['Ordinary'](model);wait=ordinary.wait;returns=[]
 def changed(process):
  value=wait(process)
  if kind=='bad_status_archive':value.update(nativeStatus=True,archiveSha256=Hostile())
  if kind=='returned_null':value=None
  if kind=='known_failed_status_unknown_wait':value.update(nativeStatus=1,directWaited=False)
  returns.append(value);return value
 ordinary.wait=changed
 custody=types.SimpleNamespace(Ownership=K.Ownership,Custody=lambda path,mode=None,api=None,ownership=None:ns['Directory'](model,path,mode,ownership));custody.__source_sha256__=K.__source_sha256__
 boundary=types.SimpleNamespace(platform='darwin',clock=model.clock,uid=model.uid,event=model.event,thread=model.thread_factory,selector=model.selector,listener=model.listener,fd_metadata=model.fd_metadata)
 invocation=C.Invocation(ordinary,dict(custody=custody,relay=R,contract=P,controller=C),model,boundary)
 result=invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
 encoded=json.dumps(result,sort_keys=True,allow_nan=False)
 check('ARIA_TOTAL_SERIALIZABLE_'+kind,type(result)is dict and type(encoded)is str)
 check('ARIA_ONE_RETURN_NO_SECOND_WAIT_'+kind,ordinary.waits==1 and invocation.native_received is True and invocation.native is returns[0] and result['nativeResultReceived'] is True)
 if kind=='valid0':
  check('ARIA_VALID_PENDING_QA_PRESERVED',result['status']=='QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT' and result['nativeStatus']==0 and result['nativeDrainState']=='CONFIRMED' and result['canonicalClosed'] is True)
 elif kind=='bad_status_archive':
  check('ARIA_INVALID_FIELDS_NULL',result['status']=='HOLD' and result['primaryReason']=='NATIVE_UNKNOWN' and result['nativeStatus'] is None and result['nativeArchiveSha256'] is None)
  check('ARIA_INDEPENDENT_CONFIRMED_DRAIN_SURVIVES',result['nativeWaited'] is True and result['nativeDrainState']=='CONFIRMED' and result['canonicalClosed'] is True and result['cleanupReason']=='NONE')
 elif kind=='returned_null':
  check('ARIA_NULL_IS_RETURNED_NOT_UNATTEMPTED',result['status']=='HOLD' and result['primaryReason']=='SCHEMA' and result['nativeProjectionReason']=='ABSENT' and result['nativeWaited'] is None)
  check('ARIA_NULL_UNKNOWN_ACTUAL_REFS_RETAINED',result['nativeDrainState']=='UNKNOWN' and result['canonicalClosed'] is False and result['cleanupReason']=='CLEANUP_UNCONFIRMED' and invocation in C.RETAINED and invocation.process is ordinary.process and bool(invocation.ownership.blockers()))
 else:
  check('ARIA_FAILED_STATUS_CANNOT_INVENT_WAIT',result['status']=='HOLD' and result['primaryReason']=='NATIVE_UNKNOWN' and result['nativeStatus']==1 and result['nativeWaited'] is False)
  check('ARIA_FALSE_WAIT_RETAINS_BLOCKERS',result['nativeDrainState']=='UNKNOWN' and result['canonicalClosed'] is False and invocation.process is ordinary.process and invocation in C.RETAINED)
 before=list(model.sequence)
 try:invocation.invoke(model.release_spec,model.decision_spec,model.control_spec,'/synthetic/output')
 except C.Hold:check('ARIA_CAP_NOT_RESET_'+kind,model.sequence==before and ordinary.waits==1)
 else:check('ARIA_CAP_NOT_RESET_'+kind,False)
 cases.append(dict(kind=kind,result=result))

with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),
  (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','fdopen','kill','fork','system','getpid','getppid','getuid')),
  (subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),
  (threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
  for name in names:
   if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['denied']))
 for kind in ('valid0','bad_status_archive','returned_null','known_failed_status_unknown_wait'):run(kind)
 check('ARIA_NO_HOSTILE_CALLBACKS',dispatched==[])
 check('ARIA_UNCHANGED_PERSISTENT_AUDIT_ZERO_REAL',ns['BLOCKED']==[])

print(json.dumps(dict(kind='ARIA_SOURCE02_NATIVE_PROJECTION_CLEANUP_PRESERVATION',checks=len(ns['CHECKS']),results=ns['CHECKS'],cases=cases,
 whole498Replayed=False,unchanged135Replayed=False,prior921Replayed=False,prefixReverseProof=True,singleReadyYieldRetained=True,subjectSafetyAstEdited=False,
 arbitraryCallbacks=dispatched,forbiddenBoundaryCalls=ns['BLOCKED'],actualJavaCompilerFixtureTlsUnixPeerPlatformActions=0,
 limitations='Synthetic ordinary adapter/identity/source/input authority and cooperative scheduling; no real thread/host/native or qualification evidence.'),indent=2))

"""One targeted actual gate+outer-guard cleanup case, only fake clock/FD effects."""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume5').absolute()
source=(S/'outer_delivery_checks.py').read_bytes();prefix,tail=source.split(b"\nsys.addaudithook(G['ns']['audit'])",1);assert prefix+b"\nsys.addaudithook(G['ns']['audit'])"+tail==source
H={'__name__':'_quinn_afterallow_outer_fake','__file__':str(S/'outer_delivery_checks.py')};exec(compile(prefix,'<exact inspected source05 outer fake definitions>','exec'),H)
G=H['G'];A,P,MemPath=[H[n] for n in ('A','P','MemPath')];checks=[];case={}
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def tests():
 s,k,a,auth,b=G['build']()
 with patch.dict(A.__dict__,MANIFEST06=s.package_sha),patch.object(fcntl,'flock',G['held']):
  u,status=G['invoke'](s,k,a,auth,b,'negative');check('PREPARE_QUALIFIED_NEGATIVE_ONE',status==1)
  G['ns']['next_client'](s);v,h=G['root_control'](s,k,auth,'held-proof','NEGATIVE_ACTUAL_STATUS',actualNegativeStatus=1,separatelyCaptured=True,oldNormalBindingsUnchanged=True);u,status=G['invoke'](s,k,a,auth,b,'held-proof',v,h);check('PREPARE_SAME_HELD_ZERO',status==0)
  G['root_admission'](s,k,a,auth);G['ns']['next_client'](s);v,h=G['root_control'](s,k,auth,'archive','ARCHIVE_FAILED_STATE');u,status=G['invoke'](s,k,a,auth,b,'archive',v,h);check('PREPARE_ARCHIVE_ZERO',status==0)
  G['ns']['next_client'](s);v,h=G['root_control'](s,k,auth,'final','ACTUAL_ARCHIVE_REVIEW',actualArchiveExit=0,actualQaReviewed=True,archiveInspected=True,separatelyCaptured=True);u,status=G['invoke'](s,k,a,auth,b,'final',v,h);check('PREPARE_FINAL_ZERO',status==0)
 G['ns']['next_client'](s);v,h=G['root_control'](s,k,auth,'gate','FAILED_EXIT_PERMIT',expectedWrapperExit=1,actualFinalStatus=0,finalSeparateStatusCaptured=True,readinessInspected=True,oldNormalBindingsUnchanged=True,issuedAtEpoch=1001);s.epoch=1002
 actors=[]
 for path,node in s.fs.nodes.items():
  if MemPath(path).parent==MemPath(A.N) and MemPath(path).name in A.CONTROLS-{'root-authorization.json'}:actors.extend(P.decode(node['raw'])['typedPriorActors'])
 raw=G['completion'](s,k,h,actors);opening=s.api.open;closing=s.api.close;outer=[];active=[False];late=[];outputs=[];realexec=exec
 def opened(name,flags,mode=0o600,dir_fd=None):
  fd=opening(name,flags,mode,dir_fd)
  if not active[0] and not outer and s.fs.fds[fd]['path']==str(A.N/'entry.py'):outer.append(fd)
  return fd
 def closed(fd):
  value=closing(fd)
  if active[0] and outer and fd==outer[0]:s.epoch=1062;late.append(fd)
  return value
 def track(code,env):
  env['__builtins__']=dict(vars(builtins),exec=track);realexec(code,env)
  if code.co_filename=='<verified-failed-gateway>':env['System']=lambda:s;env['MANIFEST06']=s.package_sha;active[0]=True
 s.api.open=opened;s.api.close=closed
 argv=['-c',str(A.N/'entry.py'),P.sha(b['entry.py']),'gate',auth,h,P.sha(raw),raw.decode()]
 env={'__name__':'_quinn_actual_guard_gate','__builtins__':dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)))}
 with ExitStack() as stack:
  for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
  stack.enter_context(patch.object(sys,'argv',argv));stack.enter_context(patch.object(fcntl,'flock',G['held']))
  try:realexec(compile(H['BODY'],'<actual-code05-guard-gate>','exec'),env)
  except SystemExit as end:status=end.code
  else:raise AssertionError('EXPLICIT_GUARD_EXIT_REQUIRED')
 allow=P.decode(s.fs.nodes[str(A.N/'gate-allow.json')]['raw'])
 check('REPRO_GATE_ZERO_AFTER_LATE_OUTER_CLOSE',status==0 and allow['gateExit']==0 and s.epoch==1062 and len(late)==1)
 check('ORIGINAL_PERMIT_EXPIRED_NO_REFRESH',v['issuedAtEpoch']==1001 and s.epoch>v['issuedAtEpoch']+60 and allow['permitSha256']==h)
 check('CLEAN_FINALIZER_CANNOT_REPAIR_FRESHNESS',env['sink'].finalized is True and env['sink'].finalizer_label=='GUARD' and outputs==[] and outer[0] not in s.fs.fds)
 check('ZERO_REAL_BOUNDARIES',G['ns']['BLOCKED']==[])
 case.update(guardPythonStatus=status,gateAllowExit=allow['gateExit'],beforeGateClock=1002,afterSelectedOuterCloseClock=s.epoch,issuedAtEpoch=v['issuedAtEpoch'],originalPermitSha256=h,lateSelectedCloseCount=len(late),failureEmissionCount=len(outputs),outerFinalizer='GUARD',realShellBuiltinExitExecuted=False,actualTargetActions=0)
sys.addaudithook(G['ns']['audit'])
with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
  for n in names:
   if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
 tests()
print(json.dumps({'kind':'QUINN_ONE_CODE05_LATE_SELECTED_OUTER_GUARD_CLEANUP_CASE','checks':len(checks),'results':checks,'case':case,'prefixReverseProof':True,'persistentAuditUnchanged':True,'targetSafetyEdits':False,'realBoundaryCalls':G['ns']['BLOCKED']},indent=2))

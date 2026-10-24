"""Two concrete archive-boundary concerns; actual functions, synthetic IO only."""
import ast,builtins,collections,contextlib,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,pathlib,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,xml.etree.ElementTree
from contextlib import ExitStack
from unittest.mock import patch
if not __debug__:raise RuntimeError('REVIEWER_ASSERTIONS_REQUIRED')
R=pathlib.Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio');T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'early/gateway80-failed-red-resource-prep/resume1';O=pathlib.Path(__file__).parent
sink=(O/'targeted-results.json').open('x')
def audit(event,args):
 if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')) or event in ('fcntl.flock','fcntl.lockf'):raise AssertionError('REAL_BOUNDARY_DENIED:'+event)
 if event=='open':
  n,mode,flags=args;assert isinstance(n,(str,bytes))
  p=pathlib.Path(n).absolute();assert p==T/'early/fullcheck-harness/resume3/harness.py' or any(root==p or root in p.parents for root in (D,T/'early/gateway80-proof-prep/resume6'))
  assert mode is not None and all(c not in mode for c in 'wax+')
sys.addaudithook(audit)
raw=(D/'checks.py').read_bytes();prefix=raw.split(b'\nsys.addaudithook(audit)',1)[0];ns={'__name__':'_inspected_actual_fake_fixture','__file__':str(D/'checks.py')}
builtins.exec(builtins.compile(prefix,'<inspected-author-fixtures-no-tests>','exec'),ns)
A,P,registered,blocked=map(ns.get,('A','P','registered','blocked'));out=[]
with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(pathlib.Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
  (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
  (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
  for n in names:
   if hasattr(obj,n):stack.enter_context(patch.object(obj,n,blocked))
 # Total pre-read quota must use the consumed acquisition, not an older stat.
 s,k,a,auth,buffers,u=registered();cache=A.W/'cache'
 for name in ('a','b'):s.fs.put(cache/name,b'x',0o600)
 u.k['limits']['maximumArchiveBytes']=10;u.k['limits']['maximumFileBytes']=8
 original_open=s.api.open;grew=[]
 def grow_before_acquisition(p,flags,mode=0o600,dir_fd=None):
  absolute=s.fs.path(p,dir_fd)
  if absolute in {str(cache/'a'),str(cache/'b')} and absolute not in grew:
   s.fs.nodes[absolute]['raw']=b'12345678';s.fs.nodes[absolute]['mtime']+=1;grew.append(absolute)
  return original_open(p,flags,mode,dir_fd)
 s.api.open=grow_before_acquisition
 rows=u.bounded_inventory(cache);actual=sum(r.get('bytes',0) for r in rows)
 assert len(grew)==2 and actual==16 and actual>u.k['limits']['maximumArchiveBytes']
 out.append({'case':'metadata-growth-before-custodied-read','actualFunction':'Unit.bounded_inventory','syntheticTotalCap':10,'consumedBodyBytes':actual,'result':'ACCEPTED_OVER_TOTAL_CAP','sameInodeNewStableSizeAndMtimeBeforeRead':True,'actualHostReadsOrWrites':0})
 u.close()
 # Reused06 copyfileobj streams beyond its old inventory before a later denial.
 s,k,a,auth,buffers,u=registered();source=A.W/'cache'/'grow.bin';s.fs.put(source,b'x',0o600)
 rows=u.bounded_inventory(A.W);initial=sum(r.get('bytes',0) for r in rows);cap=initial+10;u.k['limits']['maximumArchiveBytes']=cap
 real_copy=shutil.copyfileobj;mutated=[]
 def grow_at_copy(src,dst):
  name=src.fs.fds[src.fd]['path']
  if name==str(source):s.fs.nodes[name]['raw']=b'x'*100;s.fs.nodes[name]['mtime']+=1;mutated.append(name)
  return real_copy(src,dst)
 failure=None
 with patch.object(u.d.shutil,'copyfileobj',grow_at_copy):
  try:u.copy_tree(s.path(A.W),s.path(A.N)/'complete-failed-workspace-archive',rows)
  except (P.Hold,ns['C'].Hold) as error:failure=str(error)
 prefix=str(A.N/'complete-failed-workspace-archive')+'/'
 copied=sum(len(n.get('raw',b'')) for path,n in s.fs.nodes.items() if path.startswith(prefix) and n['kind']=='file')
 assert mutated and copied>cap and failure=='ARCHIVE_TOTAL_BYTE_CAP'
 out.append({'case':'source-growth-at-legacy-copyfileobj','actualFunctions':['Unit.copy_tree','source06.safe_archive_tree','source06.safe_new_copy'],'syntheticTotalCap':cap,'alreadyWrittenArchiveBytes':copied,'result':'HOLD_ONLY_AFTER_OVER_BUDGET_COPY','denial':failure,'realCopyfileobjOverFakeHandles':True,'actualHostReadsOrWrites':0})
 u.close()
 assert ns['BLOCKED']==[]
sink.write(json.dumps({'cases':out,'count':len(out),'allExpected':True,'actualOperationalActions':0},indent=2)+'\n');sink.flush();sink.close()
print(json.dumps({'targetedCases':len(out),'archiveBoundDefectConfirmed':True,'actualOperationalActions':0}))

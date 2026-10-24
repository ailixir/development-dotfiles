"""Exact source/frozen-control review and two bounded actual-function fake schedules."""
from pathlib import Path
import ast,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,unittest.mock
import xml.etree.ElementTree
from contextlib import ExitStack
from unittest.mock import patch
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume1').absolute();O=Path(__file__).absolute().parent
checks=[];pins=[];raws={}
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
def pin(path,h=None,size=None,mode=None):
 path=Path(path).absolute();raw=path.read_bytes();value=hashlib.sha256(raw).hexdigest()
 if h is not None:check('hash '+path.name,value==h)
 if size is not None:check('bytes '+path.name,len(raw)==size)
 if mode is not None:check('mode '+path.name,stat.S_IMODE(path.stat().st_mode)==mode)
 pins.append({'path':str(path.relative_to(Path.cwd())),'sha256':value,'bytes':len(raw),'mode':stat.S_IMODE(path.stat().st_mode)});return raw
mraw=pin(D/'manifest.json','e9515051d3ce31bf075296b94dafcea5db7c3ac59c44850ba5a9c05d7323162b');m=json.loads(mraw)
for row in m['files']:raws[row['path']]=pin(D/row['path'],row['sha256'],row['bytes'],row['mode'])
check('exact66 payloads',len(raws)==66 and {p.name for p in D.iterdir()}==set(raws)|{'manifest.json'})
for line in raws['SHA256SUMS'].decode().splitlines():
 h,name=line.split('  ',1);check('checksum '+name,hashlib.sha256(raws[name]).hexdigest()==h)
inputs=json.loads(raws['input-pins.json'])
for row in inputs['preparedInputs']+inputs['additionalPreparedInputs']:
 assert '/runtime/' not in row['path'] and not row['path'].endswith('preexisting-baseline.json')
 pin(row['path'],row['sha256'],row['bytes'],row['mode'])
k=json.loads(raws['contract.json']);check('frozen exact counts',len(k['frozenEvidence']['oldMembers'])==2263 and len(k['finiteUnion']['numericIds'])==k['finiteUnion']['numericCountExcludingControllers']==2253 and len(k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused'])==7 and k['finiteUnion']['startlessCandidate']['pid']==73492)
check('native component never accepted',k['retainedFailure']['phaseAccepted'] is False and k['retainedFailure']['actualNativeExit']==k['retainedFailure']['actualCollectorStatus']==1 and k['retainedFailure']['oldFlagsRepairableByNewPointObservation'] is False)
mp=json.loads(raws['interpretation-map.json']);check('56sites12classes6runtime',len(mp['reachedInterpretationSites'])==56 and len(mp['inputClasses'])==12 and len(k['installedCode'])==6)
guard=raws['guard-failed-red.bash'].decode();binding=raws['bind-command.template.bash'].decode();check('exact embedded guard not source reopen',binding.split("<<'GATEWAY_FAILED_REVIEWED_SOURCE'\n",1)[1].rsplit('\nGATEWAY_FAILED_REVIEWED_SOURCE',1)[0]+'\n'==guard)
for name in ['entry.py','protocol.py','custody.py','failed_gateway.py']:
 check('nonremovable runtime checks '+name,not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(raws[name]))))
# Preload only inspected fake machine definitions; the target mains and real boundaries are never invoked.
prefix=raws['checks.py'].split(b'\nsys.addaudithook(audit)',1)[0];ns={'__file__':str(D/'checks.py'),'__name__':'quinn_inspected_fake_machine'}
exec(compile(prefix,'<inspected fake machine source definitions>','exec'),ns)
A,P=ns['A'],ns['P'];cases=[];denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args;path=Path(name).absolute() if not isinstance(name,int) else None
  writing=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if path is None or not writing or not(path==O or O in path.parents):denied.append(event);raise AssertionError('QA_DENY_OPEN')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn','ctypes.dlopen')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('QA_DENY_OPERATION')
sys.addaudithook(audit)
with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
  (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
  (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
  for name in names:
   if hasattr(obj,name):stack.enter_context(patch.object(obj,name,ns['blocked']))
 # Bound inventory reads original 3 bytes. At the third source open, the source
 # grows before actual inherited safe_new_copy reads it. No production function is patched.
 s,k,a,auth,buffers,u=ns['registered']();cap=1048576;u.k['limits']['maximumFileBytes']=cap
 growing=A.W/'cache/growing.bin';s.fs.put(growing,b'OLD',0o600);rows=u.bounded_inventory(A.W)
 original_open=s.api.open;opens=[1]
 def growing_open(p,flags,mode=0o600,dir_fd=None):
  actual=s.fs.path(p,dir_fd)
  if actual==str(growing) and not(flags&os.O_CREAT):
   opens[0]+=1
   if opens[0]==3:s.fs.nodes[actual]['raw']=b'G'*(cap+1)
  return original_open(p,flags,mode,dir_fd)
 s.api.open=growing_open
 try:u.copy_tree(ns['MemPath'](A.W),ns['MemPath'](A.N)/'complete-failed-workspace-archive',rows)
 except P.Hold as error:reason=str(error)
 else:raise AssertionError('GROWING_COPY_NOT_REJECTED_AT_ALL')
 target=str(A.N/'complete-failed-workspace-archive/cache/growing.bin');copied=len(s.fs.nodes[target]['raw'])
 check('copy exceeds cap before later inventory rejection',copied==cap+1 and reason=='ARCHIVE_FILE_CAP_TYPE')
 cases.append({'finding':'GFR01-QA-01','fixturePerFileCap':cap,'inventoryBytesBeforeCopy':3,'archiveBytesAlreadyCopied':copied,'eventualDenial':reason,'unboundedPhysicalCopyPrecededDenial':True,'realFsOrArchiveActions':0});u.close()
 # Actual run/constructor/register timeout before first qualification: no N output,
 # partial child identity exists only in private in-memory Unit/UNRESOLVED objects.
 s,k,a,auth,buffers=ns['build']();s.timeout=True;created=[];real=A.Unit
 def track(*args,**kwargs):
  unit=real(*args,**kwargs);created.append(unit);return unit
 before=set(s.fs.nodes)
 with patch.object(A,'Unit',track),patch.dict(A.__dict__,MANIFEST06=s.package_sha):
  try:A.run('negative',auth,system=s,root_raw=P.packed(a),code_buffers=buffers)
  except subprocess.TimeoutExpired:pass
  else:raise AssertionError('TIMEOUT_WAS_NOT_PRESERVED')
 unit=created[0];record=unit.utilities[-1];newfiles=[n for n in set(s.fs.nodes)-before if n.startswith(str(A.N)+'/')]
 body=guard.split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
 prints=[n for n in ast.walk(ast.parse(body)) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='print']
 payload=prints[0].args[0].args[0];keys=[x.value for x in payload.keys]
 check('prequalification unknown child has no durable identity output',unit.prequalified is False and unit.pending and record['pid'] is not None and not newfiles and set(keys)=={'status','errorType','credit'})
 cases.append({'finding':'GFR01-QA-02','partialChildPidKnownInMemory':True,'prequalified':False,'newNRecords':len(newfiles),'guardFailureFields':keys,'durablePartialIdentityOrClientReceipt':False,'unknownRecordClassification':record['classification'],'realChildOrOsActions':0})
check('zero actual denied boundaries',not denied and ns['BLOCKED']==[])
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':hashlib.sha256(mraw).hexdigest(),'pins':pins,'noRuntimeWNOldEOrBaselineAccess':True},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'counterexamples':cases,'authorControlsReplayPending':True,'deniedBoundaryCalls':denied,'actualRuntimeProcessOsKernelLockToolNativePrivateBaselineActions':0},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'counterexamples':len(cases),'allExpected':True,'actualActions':0}))

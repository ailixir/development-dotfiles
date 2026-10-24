"""Exact code02 review: source/pins and two original-defect fake-boundary regressions."""
from pathlib import Path
import ast,builtins,collections,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,re,resource,shlex,shutil,signal,socket,stat,subprocess,sys,time,types,unittest.mock
import xml.etree.ElementTree
from contextlib import ExitStack
from unittest.mock import patch
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume2').absolute();O=Path(__file__).absolute().parent
checks=[];pins=[];raws={}
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
def pin(path,h=None,size=None,mode=None):
 p=Path(path).absolute();raw=p.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if h is not None:check('hash '+p.name,digest==h)
 if size is not None:check('bytes '+p.name,len(raw)==size)
 if mode is not None:check('mode '+p.name,stat.S_IMODE(p.stat().st_mode)==mode)
 pins.append({'path':str(p.relative_to(Path.cwd())),'sha256':digest,'bytes':len(raw),'mode':stat.S_IMODE(p.stat().st_mode)});return raw
mraw=pin(D/'manifest.json','aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558');m=json.loads(mraw)
for row in m['files']:raws[row['path']]=pin(D/row['path'],row['sha256'],row['bytes'],row['mode'])
check('exact116payloads',len(raws)==116 and {p.name for p in D.iterdir()}==set(raws)|{'manifest.json'})
for line in raws['SHA256SUMS'].decode().splitlines():
 h,name=line.split('  ',1);check('checksum '+name,hashlib.sha256(raws[name]).hexdigest()==h)
ip=json.loads(raws['input-pins.json'])
for group in ['preparedInputs','additionalPreparedInputs','code02AdoptedInputs']:
 for row in ip[group]:
  assert '/runtime/' not in row['path'] and not row['path'].endswith('preexisting-baseline.json')
  pin(row['path'],row['sha256'],row['bytes'],row['mode'])
old=D.parent/'resume1';oldraw=pin(old/'manifest.json','e9515051d3ce31bf075296b94dafcea5db7c3ac59c44850ba5a9c05d7323162b')
for row in json.loads(oldraw)['files']:pin(old/row['path'],row['sha256'],row['bytes'],row['mode'])
check('contract literal code01/frozen ancestry',raws['contract.json']==(old/'contract.json').read_bytes())
for name in ['check-results.json','extra-check-results.json','optimized-bootstrap-results.json']:
 a=json.loads(raws[name]);b=json.loads((old/name).read_bytes());check('retained114semanticIDs '+name,[x['name'] for x in a['checks']]==[x['name'] for x in b['checks']])
k=json.loads(raws['contract.json']);mp=json.loads(raws['interpretation-map.json']);check('59sites13classes6runtimefiles',len(mp['reachedInterpretationSites'])==59 and len(mp['inputClasses'])==13 and len(k['installedCode'])==6)
guard=raws['guard-failed-red.bash'].decode();binding=raws['bind-command.template.bash'].decode()
check('exact embedded reviewed guard',binding.split("<<'GATEWAY_FAILED_REVIEWED_SOURCE'\n",1)[1].rsplit('\nGATEWAY_FAILED_REVIEWED_SOURCE',1)[0]+'\n'==guard)
for name in ['entry.py','failed_gateway.py','protocol.py','custody.py']:
 check('nonremovable safety '+name,not any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse(raws[name]))))
proto=raws['protocol.py'].decode();sink='class FailureSink:'+proto.split('class FailureSink:',1)[1].split('# END SINGLE OUTER FAILURE SINK',1)[0]
body=guard.split("-B -c '",1)[1].split("' \"$GATEWAY_FAILED_ENTRY\"",1)[0]
check('one exact outer protocol sink definition',sink in body)
check('new archive path does not invoke legacy unbounded copy',all(x not in raws['failed_gateway.py'].decode() for x in ['self.d.safe_archive_tree(','self.d.safe_new_copy(']))
check('archive shared budget across three destinations','rows,budget)' in raws['failed_gateway.py'].decode() and 'chart,budget)' in raws['failed_gateway.py'].decode() and "rawdir.copy_from(self.old,row['path'],expected,budget)" in raws['failed_gateway.py'].decode())
# Preload inspected fake definitions, never old suite calls/audits/output.
source=raws['code02_checks.py'];prefix=source.split(b'\nsys.addaudithook(audit)',1)[0];fx={'__name__':'quinn_independent_fake_regressions','__file__':str(D/'code02_checks.py')}
exec(compile(prefix,'<inspected code02 fake definitions>','exec'),fx)
A,P=fx['A'],fx['P'];cases=[];denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args;path=Path(name).absolute() if not isinstance(name,int) else None
  writing=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if path is None or not writing or not(path==O or O in path.parents):denied.append(event);raise AssertionError('QA_DENIED_OPEN')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn','ctypes.dlopen')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('QA_DENIED_OPERATION')
sys.addaudithook(audit)
with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),
  (os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),
  (socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
  for name in names:
   if hasattr(obj,name):stack.enter_context(patch.object(obj,name,fx['blocked']))
 # The former metadata-growth16under10 schedule must now stop before body acquisition.
 s,u=fx['small']();u.k['limits']['maximumFileBytes']=20
 s.fs.nodes[str(A.W/'a')]['raw']=b'A';s.fs.nodes[str(A.W/'b')]['raw']=b'B';oldopen=s.api.open
 def before_acquisition(name,flags,mode=0o600,dir_fd=None):
  path=s.fs.path(name,dir_fd)
  if path in [str(A.W/'a'),str(A.W/'b')] and not flags&os.O_DIRECTORY:s.fs.nodes[path]['raw']*=8
  return oldopen(name,flags,mode,dir_fd)
 s.api.open=before_acquisition
 try:u.bounded_inventory(A.W)
 except Exception as error:reason=str(error)
 else:raise AssertionError('METADATA_GROWTH_ACCEPTED')
 check('original aggregate acquisition growth rejected beforebody',reason=='READ_EXPECTED_METADATA' and fx['reads'](s)==0)
 cases.append({'case':'old_metadata_1plus1_to8plus8_cap10','denial':reason,'actualAcquiredBytes':fx['reads'](s),'realBoundaryActions':0});u.c.close()
 # A source that grows between inventory and copy cannot exceed its physical budget.
 s,u=fx['small']();rows=u.bounded_inventory(A.W);s.fs.events=[];oldopen=s.api.open
 def before_copy(name,flags,mode=0o600,dir_fd=None):
  path=s.fs.path(name,dir_fd)
  if path==str(A.W/'b') and not flags&os.O_DIRECTORY:s.fs.nodes[path]['raw']+=b'C'
  return oldopen(name,flags,mode,dir_fd)
 s.api.open=before_copy
 try:u.copy_tree(fx['MemPath'](A.W),fx['MemPath'](A.N)/'complete-failed-workspace-archive',rows)
 except Exception as error:reason=str(error)
 else:raise AssertionError('COPY_GROWTH_ACCEPTED')
 check('original copy growth rejected before overbudget',reason=='COPY_EXPECTED_METADATA' and fx['writes'](s)==4 and fx['reads'](s)==4)
 cases.append({'case':'old_postinventory_sameinode_growth','denial':reason,'actualAcquiredBytes':fx['reads'](s),'actualArchiveBytes':fx['writes'](s),'perFileCap':6,'aggregateCap':10,'realBoundaryActions':0});u.c.close()
check('zero real boundary attempts',not denied and fx['ns']['BLOCKED']==[])
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':hashlib.sha256(mraw).hexdigest(),'pins':pins,'actualRuntimeWENOOldEPrivateOrBaselineAccess':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'independentOriginalDefectCases':cases,'guardedAuthorResultsToBeBoundAfterCompletion':True,'deniedBoundaryCalls':denied,'actualRuntimeProcessOsKernelLockToolNativePrivateBaselineActions':0,'readHistory':[{'tool':'e7abec','actualExit':1,'reason':'Bounded source diff expected exit1; extra guessed adoption filename was absent. Exact adoption path/hash came from code02-adopted-inputs.json, then correct913a record readc86c25. No protected or operational access.'}]},indent=2)+'\n')
print(json.dumps({'sourceChecks':len(checks),'independentOriginalDefectCases':len(cases),'allExpected':True,'actualActions':0}))

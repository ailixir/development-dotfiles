"""One bounded metadata-author composition. All resource interfaces are FAKE."""
from pathlib import Path
import ast,builtins,copy,ctypes,datetime,errno,fcntl,hashlib,io,json,os,re,shlex,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
AUTHOR=(HERE/'metadata-author.py').read_bytes();CALLER=(HERE/'metadata-author.first-read.bash').read_text()
BODY=shlex.split(CALLER.split('-B -c ',1)[1],posix=True)[0]
MODULE={'__name__':'_actual_metadata_author_definitions'};exec(compile(AUTHOR,'<actual-current-metadata-author>','exec'),MODULE)
CFG=MODULE['CONFIG'];ROOT=Path(CFG['root']);T=Path(CFG['T']);S=Path(CFG['source']);E=MODULE['E'];OUTSIDE=MODULE['OUTSIDE'];APP=MODULE['APPLICABILITY']
MANIFEST=(S/'manifest.json').read_bytes();SOURCE={r['path']:(S/r['path']).read_bytes() for r in json.loads(MANIFEST)['files']}
specs=[*CFG['sourceInputs'].values(),*CFG['templates'].values(),*CFG['owners'].values()]
INPUTS={s['path']:(Path(s['path']).read_bytes(),s['mode']) for s in specs};INPUTS[str(S/'manifest.json')]=(MANIFEST,0o644)
for name in ('custody.py','protocol.py','failed_gateway.py','entry.py','guard-failed-red.bash','contract.json','factory.py','installer.py','install-cli.py'):INPUTS[str(S/name)]=(SOURCE[name],0o644)
FIXTURE_PATH=T/'early/gateway80-failed-red-resource-prep/resume4/checks.py';FIXTURE=FIXTURE_PATH.read_bytes();tree=ast.parse(FIXTURE)
SELECTED='\n'.join(ast.get_source_segment(FIXTURE.decode(),n) for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('MemPath','Handle','FS'))
BLOCKED=[]
def blocked(*args,**kwargs):BLOCKED.append('REAL_BOUNDARY');raise AssertionError('REAL_BOUNDARY_DENIED')
# The audit body is unchanged from the inherited fixture. Its original private
# result-file exception is not used; this harness preopens its own receipt FD.
audit_node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='audit')
EXECNS=dict(os=os,stat=stat,types=types,errno=errno,Path=Path,PurePosixPath=__import__('pathlib').PurePosixPath,HERE=FIXTURE_PATH.parent)
exec(compile(SELECTED+'\n'+ast.get_source_segment(FIXTURE.decode(),audit_node),'<literal-unchanged-fake-filesystem-and-deny-audit>','exec'),EXECNS)
FS,MemPath=EXECNS['FS'],EXECNS['MemPath']
CLI=types.ModuleType('_actual_source07_install_cli_schema');exec(compile(SOURCE['install-cli.py'],'<actual-source07-cli-schema>','exec'),CLI.__dict__)
P=types.ModuleType('_actual_source07_pure_policy');exec(compile(SOURCE['protocol.py'],'<actual-source07-policy>','exec'),P.__dict__)
RESULT_FD=os.open(str(HERE/'critical-attempt03.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
(HERE/'critical-attempt03.py.txt').write_bytes((HERE/'critical_check.py').read_bytes())
CHECKS=[];CASES=[];TERMINALS=[];DIAGNOSTICS=[]
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 CHECKS.append(dict(id=name,passed=True))
def build():
 fs=FS();MemPath.fs=fs
 for path,(raw,mode) in INPUTS.items():fs.put(path,raw,mode)
 fs.directory(E,0o700,ino=219110222);fs.directory(MODULE['PARENT'],0o700)
 app=dict(kind='ROOT_SOURCE07_ONE_UNIT_FAILED_GATEWAY_RESOURCE_DISPOSITION_APPLICABILITY',authorizedBy='root',subject=MODULE['UNIT'],pty=29815,wrapperPid=3720,shellPid=3749,recordedStart='Mon Oct 19 12:48:37 2026',subjectSource07ManifestSha256=CFG['sourceSha256'],exactSourceAdoptionSha256=CFG['sourceRootAdoptionSha256'],threeOwnerAdoptionSha256=CFG['ownerAdoptionSha256'],typedRoleContractSha256=CFG['roleContractSha256'],architectureManifestSha256=CFG['reviews']['Aria']['sha256'],qaManifestSha256=CFG['reviews']['Quinn']['sha256'],sourceEquality=MODULE['FRESH'],actualCurrentResourceOrSourceFactsAcquiredByThisDecision=False,actualInstallNegativeHeldArchiveFinalPermitWrapperPostcloseCompleted=False,cleanupAuthorized=False,newNativeInvocations=0,credit=False,normalRoute='HARD_HOLD',expectedWrapperExit=1,installationPreparationAuthorized=dict(outsideDirectory=str(OUTSIDE),copyThreeApprovedOwnersAndWriteScopeOnly=True))
 raw=MODULE['packed'](app);fs.put(APP,raw,0o644)
 request=dict(kind='ROOT_SOURCE07_INSTALL_INPUT_AUTHOR_AUTHORIZATION',authorizedBy='root',authorized=True,unit=MODULE['UNIT'],sourceManifestSha256=CFG['sourceSha256'],authorCodeSha256=hashlib.sha256(AUTHOR).hexdigest(),metadataDirectoryPreparationAuthorized=True,copyApprovedOwnersAndScopeOnly=True,actualRuntimeAuthorized=False,applicability=dict(path=str(APP),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=0o644))
 api=types.SimpleNamespace(**{n:getattr(fs,n) for n in ('open','fstat','stat','close','read','write','mkdir','fchmod','fsync','getuid')},getpid=lambda:990701,getppid=lambda:17932)
 return fs,api,request
def invoke(fs,api,request,case):
 outputs=[];ns={};raw=MODULE['packed'](request);argv=['-c',AUTHOR.decode('ascii'),hashlib.sha256(AUTHOR).hexdigest(),hashlib.sha256(raw).hexdigest(),raw.decode('ascii')]
 def printing(value,**kwargs):fs.events.append(('emit',));outputs.append(json.loads(value))
 ns.update(__name__='_actual_same_buffer_metadata_bootstrap',__builtins__=dict(vars(builtins),print=printing))
 with ExitStack() as stack:
  for name in ('open','fstat','stat','close','read','write','mkdir','fchmod','fsync','getuid','getpid','getppid'):stack.enter_context(patch.object(os,name,getattr(api,name)))
  stack.enter_context(patch.object(sys,'argv',argv))
  try:exec(compile(BODY,'<actual-metadata-caller-Python-argument>','exec'),ns)
  except SystemExit as end:code=end.code
  else:raise AssertionError('CALLER_EXPLICIT_STATUS_REQUIRED')
 terminal=next(v for v in outputs if v['kind']=='SOURCE07_INSTALL_METADATA_AUTHOR_TERMINAL');TERMINALS.append(dict(case=case,exit=code,terminal=terminal))
 check(case+'_EMIT_AFTER_SELECTED_CLEANUP',fs.events[-1][0]=='emit')
 check(case+'_SELF_KNOWN_BUT_COMPLETION_PENDING',terminal['process']['pid']==990701 and terminal['process']['ppid']==17932 and terminal['actualOwnCompletion'] is None)
 return code,terminal
def tests():
 fs,api,request=build();code,t=invoke(fs,api,request,'positive')
 check('POSITIVE_METADATA_ONLY_EXIT_ZERO',code==0 and t['primary'] is None and t['cleanup']==[] and not fs.fds)
 check('EXACT_FOUR_EXCLUSIVE_OUTPUTS',set(n for n in fs.nodes if str(MemPath(n).parent)==str(OUTSIDE))=={str(OUTSIDE/n) for n in ('root-install-scope.json','owner-ruling-Aria.json','owner-ruling-Quinn.json','owner-ruling-root.json')})
 for who,spec in CFG['owners'].items():
  node=fs.nodes[str(OUTSIDE/('owner-ruling-'+who+'.json'))];check('OWNER_'+who+'_EXACT_RAW_COPY_PRIVATE',node['raw']==INPUTS[spec['path']][0] and node['mode']==0o600)
 scope_raw=fs.nodes[str(OUTSIDE/'root-install-scope.json')]['raw'];scope=json.loads(scope_raw)
 check('SCOPE_SHA_FROM_SAME_WRITTEN_BUFFER',hashlib.sha256(scope_raw).hexdigest()==t['result']['scopeSha256'] and len(scope_raw)==t['result']['scopeBytes'])
 check('SCOPE_CURRENT_SOURCE07_PINS_NO_DERIVED_MAPS',scope['role']=='FAILED_RESOURCE_SOURCE07_INSTALL_ONLY' and scope['sourceManifestSha256']==CFG['sourceSha256'] and not({'loaderPins','inputPins'}&set(scope)) and not({'codePins','newCodeRecordPins','binaryHashes','binaryModes','binaryWitnesses','typedPriorActors','typedActorEvidencePins','typedOwnerRecordPins'}&set(scope['candidate'])))
 check('OLD_E_DIRECTORY_METADATA_ONLY',not any(e[0]=='read' and (e[1]==str(E) or e[1].startswith(str(E)+'/')) for e in fs.events))
 check('NO_NEW_N03_OR_ENUMERATION',str(E/'failed-red-resource-disposition03')not in fs.nodes and t['directoryEnumeration'] is False)
 # The actual current CLI accepts the produced scope/derived fields, stopping at
 # its REQUIRED unprovided initial-facts buffer before any physical install.
 k=json.loads(SOURCE['contract.json']);api.getpid=lambda:990702
 def sample(app):
  result={'origArgv0LiteralAppSatisfied':True}
  for key in ('reported','origArgv0'):
   expect=k['typedRoleContract']['selfTextConstraints'][key];result[key]=dict(kind='SELF_REPORTED_TEXT_DIGEST',status='COMPLETE',encoding='STRICT_UTF8',normalization='NONE',utf8Bytes=expect['expectedUtf8Bytes'],textSha256=expect['expectedTextSha256'])
  return result
 system=types.SimpleNamespace(api=api,pid=api.getpid,ppid=api.getppid,path=MemPath,python=sample,operator_emit=lambda v:None,resources=[])
 try:CLI.execute(str(OUTSIDE/'root-install-scope.json'),t['result']['scopeSha256'],system=system,verified_self_sha=hashlib.sha256(SOURCE['install-cli.py']).hexdigest())
 except BaseException as error:
  DIAGNOSTICS.append(dict(type=type(error).__name__,args=[str(v) for v in error.args]));check('CURRENT_CLI_SCOPE_REACHES_OWED_INITIAL_FACT_BOUNDARY',getattr(error,'args',())==('INITIAL_FACTS_RAW_PIN',))
 else:raise AssertionError('INITIAL_FACTS_MUST_STILL_BE_OWED')
 CASES.append('positive metadata/copies/current CLI required-boundary')
 fs,api,r=build();r['applicability']['sha256']='0'*64;code,t=invoke(fs,api,r,'wrong_pin')
 check('WRONG_PUBLIC_PIN_PRECREATE_HOLD',code==1 and t['primary']['reason']=='PUBLIC_INPUT_SHA' and t['creation']['attempted'] is False and str(OUTSIDE)not in fs.nodes);CASES.append('strict public input pin')
 fs,api,r=build();r['loaderPins']={};code,t=invoke(fs,api,r,'manual_map')
 check('CALLER_MAP_PRECREATE_HOLD',code==1 and t['primary']['reason']=='AUTHOR_REQUEST_SCOPE' and str(OUTSIDE)not in fs.nodes);CASES.append('no caller maps')
 fs,api,r=build();fs.directory(OUTSIDE,0o700);code,t=invoke(fs,api,r,'existing_path')
 check('EXISTING_PATH_CREATION_UNKNOWN_HOLD',code==1 and t['creation']==dict(attempted=True,created=None,openedIdentity=None) and not t['outputs']);CASES.append('exclusive existing-path hold')
 fs,api,r=build();writing=api.write;closing=api.close;partial=[None]
 def short_then_error(fd,raw):
  if partial[0] is None:partial[0]=fd;return writing(fd,raw[:5])
  raise OSError(errno.EIO,'FAKE_PARTIAL_WRITE')
 def close_unknown(fd):
  if fd==partial[0]:raise OSError(errno.EIO,'FAKE_CLOSE_UNKNOWN')
  return closing(fd)
 api.write=short_then_error;api.close=close_unknown;code,t=invoke(fs,api,r,'partial_cleanup')
 check('PARTIAL_PRIMARY_AND_CLEANUP_DISTINCT',code==1 and t['primary']['reason']=='OS_ERROR' and t['cleanup'][0]['reason']=='OS_ERROR' and t['descriptorCompletion']=='UNKNOWN')
 check('PARTIAL_BYTES_IDENTITY_AND_FD_RETAINED',t['creation']['created'] is True and t['creation']['openedIdentity'] is not None and t['outputs'][0]['writtenBytes']==5 and partial[0]in fs.fds and t['result'] is None)
 check('NO_FUTURE_OWN_ZERO',t['process']['actualStatus'] is None and t['outerCompletionOwed'] is True);CASES.append('partial write plus unknown cleanup preserves artifacts')
 check('NO_REAL_TARGET_BOUNDARY',BLOCKED==[])
failure=None
sys.addaudithook(EXECNS['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for n in names:
    if hasattr(obj,n):stack.enter_context(patch.object(obj,n,blocked))
  tests()
except BaseException as error:failure=dict(type=type(error).__name__,args=[str(v)[:256] for v in error.args])
result=dict(kind='ONE_BOUNDED_METADATA_AUTHOR_FAKE_COMPOSITION',passed=len(CHECKS),checks=CHECKS,cases=CASES,failure=failure,terminals=TERMINALS,diagnostics=DIAGNOSTICS,authorSha256=hashlib.sha256(AUTHOR).hexdigest(),callerSha256=hashlib.sha256(CALLER.encode()).hexdigest(),actualSource07CliSha256=hashlib.sha256(SOURCE['install-cli.py']).hexdigest(),literalFixtureSha256=hashlib.sha256(FIXTURE).hexdigest(),persistentDenyAuditUnchanged=True,realBoundaryCalls=BLOCKED,actualTargetResourceEffects=0,actualBashBuiltinsExecuted=False,actualMetadataAuthorizationIssued=False)
raw=json.dumps(result,indent=2).encode()+b'\n';offset=0
while offset<len(raw):offset+=os.write(RESULT_FD,raw[offset:])
os.close(RESULT_FD);print(json.dumps(dict(passed=len(CHECKS),failure=failure,cases=len(CASES))),flush=True)
raise SystemExit(1 if failure else 0)

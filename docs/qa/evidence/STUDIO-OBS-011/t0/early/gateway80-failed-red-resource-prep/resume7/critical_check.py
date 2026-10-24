"""One lean changed-path fake composition; interactive PURE V8 operator steps.

Only fake machine definitions are reused; no historical suite is replayed. Actual
corrected CLI/author/guard/loader bodies are compiled and called under the unchanged
inherited persistent deny audit. Root-like tool facts below are explicitly FAKE.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path(__file__).absolute().parent
RAW=(HERE.parent/'resume5/source05_checks.py').read_bytes();PREFIX=RAW.split(b"\nsys.addaudithook(ns['audit'])",1)[0]
PREFIX=PREFIX.replace(b'gateway80-failed-red-resource-prep/resume5',b'gateway80-failed-red-resource-prep/resume7').replace(b'code05-exact-review',b'code07-exact-review')
G={'__name__':'_source07_fake_definitions','__file__':str(HERE/'source05_checks.py')};exec(compile(PREFIX,'<source05-fake-definitions-only-current-targets>','exec'),G)
A,P,C,F,I,CLI,MemPath=[G[n] for n in ('A','P','C','F','I','CLI','MemPath')]
TARGET={n:(HERE/n).read_bytes() for n in ('failed_gateway.py','custody.py','protocol.py','entry.py','contract.json','guard-failed-red.bash','factory.py','installer.py','install-cli.py','control-author.py','control-author-cli.py','control-author-loader.bash','operator-completion.js','install-loader.bash')}
BODY=TARGET['guard-failed-red.bash'].decode().split("-B -c '",1)[1].split("' \"$GATEWAY_FR04_ENTRY\"",1)[0]
AUTH_BODY=next(n.value.value for n in ast.parse('x='+TARGET['control-author-loader.bash'].decode().split('readonly GATEWAY_FR04_AUTHOR_BODY= ',1)[1].split('\n# Own actual',1)[0]).body if isinstance(n,ast.Assign)) if False else None
# Shell single-quote concatenation is decoded with the already preloaded shlex,
# never evaluated by Bash or passed to a real target interpreter.
import shlex
AUTH_BODY=shlex.split(TARGET['control-author-loader.bash'].decode().split('readonly GATEWAY_FR04_AUTHOR_BODY= ',1)[1].split('\n# Own actual',1)[0])[0]

INSTALL_BODY=shlex.split(TARGET['install-loader.bash'].decode().split('-B -c ',1)[1],posix=True)[0]
CHECKS=[];HISTORY=[];DIAGNOSTICS=[];LAST_STATE=None;LAST_TOOL=None;COUNTER=0;CREATED=[];FAULT=None
REAL_EXEC=exec
RESULT_FD=os.open(str(HERE/'critical-attempt04.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
(HERE/'critical-attempt04.py.txt').write_bytes((HERE/'critical_check.py').read_bytes())
def check(name,value):
 if value is not True:raise AssertionError(name)
 CHECKS.append(dict(id=name,passed=True))

def expect(name,call,reason=None):
 try:call()
 except BaseException as error:
  if isinstance(error,(AssertionError,SystemExit)):raise
  check(name,reason is None or error.args==(reason,));return error
 raise AssertionError('EXPECTED_DENIAL:'+name)

def operator(kind,**value):
 global COUNTER
 COUNTER+=1;request=dict(kind=kind,step=COUNTER,**value)
 print('FR06_OPERATOR:'+json.dumps(request,separators=(',',':')),flush=True)
 parts=[];total=0
 for _ in range(4096):
  line=sys.stdin.readline()
  if not line:raise AssertionError('OPERATOR_RESPONSE_REQUIRED')
  if line.rstrip('\r\n')=='FR06_END':break
  piece=line.rstrip('\r\n');total+=len(piece)
  if len(piece)>1024 or total>2097152:raise AssertionError('OPERATOR_REPLY_CAP')
  parts.append(piece)
 else:raise AssertionError('OPERATOR_REPLY_CAP')
 result=json.loads(''.join(parts))
 if result.get('ok') is not True:raise AssertionError('OPERATOR_REJECTED:'+str(result.get('error')))
 HISTORY.append(dict(step=COUNTER,kind=kind,sourceHelperSha256=result['helperSha256']))
 return result['value']

def fake_tool(s,status):return dict(pid=s.pid(),ppid=s.ppid(),toolCallId='FAKE_ROOT_'+str(len(HISTORY)+1),actualStatus=status,separateStatusCaptured=True)

def all_source_graph(s,k,a,b):
 b['contract.json']=P.packed(k)
 for n,data in b.items():s.fs.put(A.N/n,data)
 a['codePins']={n:P.sha(data) for n,data in b.items()}
 payload={**TARGET,**b}
 for n,data in payload.items():s.fs.put(MemPath(HERE)/n,data,0o644)
 source=P.packed(dict(files=[dict(path=n,sha256=P.sha(data),bytes=len(data),mode=0o644) for n,data in payload.items()]))
 sourcepath=str(MemPath(HERE)/'manifest.json');s.fs.put(sourcepath,source,0o644)
 a['newCodeRecordPins']={sourcepath:P.sha(source)}
 for rel in ('resume-architecture/resume2/gateway80-failed-red-resource-code07-exact-review/manifest.json','qa/gateway80-failed-red-resource-code07-exact-review/manifest.json'):
  path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel);raw=P.packed(dict(subjectManifestSha256=P.sha(source),mandatoryFindingCount=0,verdict='SOURCE_ONLY_SUPPORT'));s.fs.put(path,raw,0o644);a['newCodeRecordPins'][path]=P.sha(raw)
 G['populate_owners'](s,k,a)
 return source

def creator(s,k,a,auth,b,state,actual,role,facts):
 global LAST_STATE,LAST_TOOL
 name={'SETUP_OWNERSHIP_ADMISSION':'root-setup-ownership.json','NEGATIVE_ACTUAL_STATUS':'root-negative-status.json','FAILED_GUARD_ADMISSION':'root-guard-admission.json','ARCHIVE_FAILED_STATE':'root-archive-decision.json','ACTUAL_ARCHIVE_REVIEW':'root-actual-review-adoption.json','FAILED_EXIT_PERMIT':'root-close-permit.json','ACTUAL_WRAPPER_RESULT':'root-wrapper-result.json'}[role]
 root=dict(kind='SOURCE07_CURRENT_CONTROL_AUTHOR_REQUEST',authorizedBy='root',authorized=True,role=role,releaseSha256=auth,sourceManifestSha256=P.source_subject(a),operatorFacts=facts)
 response=operator('author_request',state=state,actual=actual,base=root,controlPath=str(A.N/name),setupHelper=role=='SETUP_OWNERSHIP_ADMISSION')
 s.current+=10;s.parent=17932
 before=s.fs.events[:];outputs=[];env={};real=REAL_EXEC
 def track(code,ns):
  ns['__builtins__']=dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)));real(code,ns)
  if code.co_filename=='<verified-control-author-system>':ns['System']=lambda:s
 env.update(__name__='_actual_corrected_control_author_loader',__builtins__=dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value))))
 argv=['-c',P.sha(TARGET['control-author-cli.py']),P.source_subject(a),auth,response['sha256'],response['buffer']]
 with ExitStack() as stack:
  for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
  stack.enter_context(patch.object(sys,'argv',argv))
  try:real(compile(AUTH_BODY,'<actual-source07-control-loader>','exec'),env)
  except SystemExit as end:status=end.code
  else:raise AssertionError('AUTHOR_LOADER_EXIT_REQUIRED')
 DIAGNOSTICS.append(dict(authorRole=role,status=status,primary=env['sink'].primary_failure,cleanup=env['sink'].cleanup_failures,utilityJournals=sum(MemPath(path).name.startswith('utility-') for path in s.fs.nodes if MemPath(path).parent==MemPath(A.N))))
 if status!=0:raise AssertionError('AUTHOR_'+role+':'+json.dumps(env['sink'].primary_failure,sort_keys=True))
 check('AUTHOR_'+role+'_ACTUAL_CORRECTED_CALLER_ZERO',status==0)
 result=next(row for row in outputs if row.get('kind')=='SOURCE07_CURRENT_CONTROL_AUTHOR_RESULT')
 control=P.decode(s.fs.nodes[str(A.N/name)]['raw']);check('AUTHOR_'+role+'_PENDING_SELF_AND_DERIVED_MAP',control['designatedControlAuthor']['pid']==s.current and control['designatedControlAuthor']['actualStatus'] is None and len(control['inputPins'])>=7)
 LAST_STATE=result['namespaceState'];LAST_TOOL=fake_tool(s,0)
 return control,P.sha(s.fs.nodes[str(A.N/name)]['raw']),LAST_STATE,LAST_TOOL

def phase(s,k,a,auth,b,mode,control,h,fault=None):
 global LAST_STATE,LAST_TOOL
 s.current+=1;s.parent=900000 if mode=='postclose' else 3749;s.post=mode=='postclose'
 if s.post:
  for pid in (3720,3749):s.rows_base.pop(pid,None)
 response=operator('completion',actualAuthor=LAST_TOOL,unit=k['subject']['label'],controlSha256=h,sourceManifestSha256=P.source_subject(a),roleContractSha256=a['roleContractSha256'],pendingActors=[row for row in control['typedPriorActors'] if row['actualStatus'] is None])
 env={};outputs=[];outer=[];active=[False];opening=s.api.open;closing=s.api.close;writing=s.api.write;emit=s.operator_emit;real=REAL_EXEC
 def opened(name,flags,mode=0o600,dir_fd=None):
  fd=opening(name,flags,mode,dir_fd)
  if not active[0] and not outer and s.fs.fds[fd]['path']==str(A.N/'entry.py'):outer.append(fd)
  return fd
 def closed(fd):
  owner=env.get('sink').owner if env.get('sink') is not None else None
  path=s.fs.fds[fd]['path'];value=closing(fd)
  if fault=='outer_close' and active[0] and outer and fd==outer[0]:s.epoch=1062
  if fault=='unit_close' and active[0] and owner is not None and hasattr(owner,'c') and fd==owner.c.fd:s.epoch=1062
  return value
 def write(fd,raw):
  path=s.fs.fds[fd]['path'];value=writing(fd,raw)
  if fault=='allow_io' and path==str(A.N/'gate-allow.json'):s.epoch=1062
  return value
 def emitting(value):
  emit(value)
  if fault=='delivery' and value.get('kind')=='SOURCE07_UNIT_STATE_PUBLICATION' and value['namespaceState']['header']['mode']=='gate':s.epoch=1062
 def track(code,ns):
  ns['__builtins__']=dict(vars(builtins),exec=track);real(code,ns)
  if code.co_filename=='<verified-failed-gateway>':ns['System']=lambda:s;ns['MANIFEST06']=s.package_sha;active[0]=True
 s.api.open=opened;s.api.close=closed;s.api.write=write;s.operator_emit=emitting
 argv=['-c',str(A.N/'entry.py'),P.sha(b['entry.py']),mode,auth,h,response['sha256'],response['buffer']]
 env.update(__name__='_actual_source06_guard',__builtins__=dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value))))
 try:
  with ExitStack() as stack:
   for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
   stack.enter_context(patch.object(sys,'argv',argv));stack.enter_context(patch.object(fcntl,'flock',G['held']))
   try:real(compile(BODY,'<actual-source07-guard>','exec'),env)
   except SystemExit as end:status=end.code
   else:raise AssertionError('GUARD_EXIT_REQUIRED')
 finally:s.api.open=opening;s.api.close=closing;s.api.write=writing;s.operator_emit=emit
 DIAGNOSTICS.append(dict(mode=mode,status=status,fault=fault,primary=env['sink'].primary_failure,cleanup=env['sink'].cleanup_failures))
 if fault:
  check('ORIGINAL_PERMIT_LATE_'+fault+'_DENIES',status==1 and env['sink'].primary_failure is not None and env['sink'].finalized is True)
  check('ORIGINAL_PERMIT_LATE_'+fault+'_UNCHANGED',control['issuedAtEpoch']==1001 and s.epoch==1062 and str(A.N/'gate-attempt.json') in s.fs.nodes)
 else:
  check('REAL_GUARD_'+mode+'_EXPECTED_STATUS',status==(1 if mode=='negative' else 0))
  state=next(row['namespaceState'] for row in reversed(s.operator_records) if row.get('kind')=='SOURCE07_UNIT_STATE_PUBLICATION')
  LAST_STATE=state;LAST_TOOL=fake_tool(s,status)
 check('OUTER_FINAL_TRACE_AFTER_CLEANUP_'+mode+('_'+fault if fault else ''),env['sink'].finalized is True and not env['sink'].bootstrap_fds)
 return status,LAST_STATE,LAST_TOOL
def build_scope():
 s,k,a,auth,b=G['build']();s.current=900100;s.parent=17932
 a.update(freshnessProofSubject=k['freshnessProofSubject'],parentSchedulingIntervalProved=False)
 source=all_source_graph(s,k,a,b)
 a['newDirectoryPins']={}
 s.fs.nodes={p:n for p,n in s.fs.nodes.items() if p!=str(A.N) and not p.startswith(str(A.N)+'/')}
 for n in ('binaryHashes','binaryModes','binaryWitnesses','codePins','newCodeRecordPins','typedOwnerRecordPins','designatedControlAuthor','typedPriorActors','typedActorRosterComplete','typedActorEvidencePins','initialActualFactsBuffer','initialActualFactsSha256','initialInstallScopeSha256'):a.pop(n,None)
 outside=MemPath(next(iter(k['typedOwnerPaths'].values()))).parent;s.fs.nodes[str(outside)]['mode']=0o700
 def fact(path):
  st=s.fs.info(str(path));return dict(path=str(path),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,mode=stat.S_IMODE(st.st_mode))
 sourcepath=str(MemPath(HERE)/'manifest.json');reviews={sourcepath:P.sha(source)}
 for rel in ('resume-architecture/resume2/gateway80-failed-red-resource-code07-exact-review/manifest.json','qa/gateway80-failed-red-resource-code07-exact-review/manifest.json'):
  path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel);reviews[path]=P.sha(s.fs.nodes[path]['raw'])
 temp=dict(a,newCodeRecordPins=reviews,typedOwnerRecordPins={});G['populate_owners'](s,k,temp)
 scope=dict(role='FAILED_RESOURCE_SOURCE07_INSTALL_ONLY',authorizedBy='root',authorized=True,cleanup=False,nativeInvocations=0,sourceDirectory=str(HERE),destination=str(A.N),outsideDirectory=str(outside),outsideDirectoryFact=fact(outside),oldEDirectory=fact(A.E),sourceManifestSha256=P.sha(source),reviewPins=reviews,ownerPins=temp['typedOwnerRecordPins'],readsetPolicy='EXACT_FAILED_RESOURCE_SOURCE07_CONTRACT_REVIEWS_OWNERS_TYPED_METADATA_BOTH_PRIORS_AND_SEVEN_CANONICAL_BINARIES',candidate=a)
 path=outside/'root-install-scope.json';raw=P.packed(scope);s.fs.put(path,raw)
 # Original tool facts are explicitly synthetic; even the last scope/input writer
 # is separately complete BEFORE this SAME-argument envelope is serialized.
 actors=[]
 for pid,role,status,parent in [(900060,'EXTERNAL_ROOT_OWNER_RECORD_AUTHOR',0,17932),(900061,'EXTERNAL_ROOT_OWNER_RECORD_AUTHOR',0,17932),(900062,'EXTERNAL_ROOT_OWNER_RECORD_AUTHOR',0,17932),(900080,'EXTERNAL_ROOT_APPROVED_SOURCE_READER',0,17932),(900089,'EXTERNAL_ROOT_APPROVED_HELPER',1,17932),(900090,'EXTERNAL_ROOT_INSTALL_SCOPE_AUTHOR',0,17932),(900101,'EXTERNAL_ROOT_APPROVED_HELPER',0,3749)]:
  tool='FAKE_ORIGINAL_SEPARATE_'+str(pid)
  trace=dict(kind='ORIGINAL_SEPARATELY_CAPTURED_TOOL_TRACE',toolCallId=tool,pid=pid,ppid=parent,actualStatus=status,separateStatusCaptured=True,statusMeaning='ACTUAL_EXTERNAL_TOOL_EXIT_NOT_DIRECT_WAIT',unit=k['subject']['label'],sourceManifestSha256=P.sha(source),installScopeSha256=P.sha(raw))
  actors.append(dict(role=role,pid=pid,ppid=parent,actualStatus=status,toolCallId=tool,separateStatusCaptured=True,originalTrace=trace))
 value=dict(kind='SOURCE07_INITIAL_ACTUAL_FACTS',unit=k['subject']['label'],sourceManifestSha256=P.sha(source),installScopeSha256=P.sha(raw),authorizedBy='root',authorized=True,completeActualFacts=True,actors=actors)
 response=operator('initial_facts',envelope=value)
 binder=shlex.split(response['binder'],posix=True)
 check('INITIAL_PURE_HELPER_BINDER_SAME_BUFFER',binder[0]=='readonly' and binder[1]=='GATEWAY_FR04_INITIAL_FACTS_SHA='+response['sha256'] and binder[2]=='readonly' and binder[3]=='GATEWAY_FR04_INITIAL_FACTS_BUFFER='+response['buffer'])
 return s,k,a,b,path,raw,response,value

def tests():
 global LAST_STATE,LAST_TOOL
 s,k,base,b,path,scope_raw,response,envelope=build_scope();scope_sha=P.sha(scope_raw)
 # Only the new path's required adverse bindings; no old suite replay.
 original_nodes=copy.deepcopy(s.fs.nodes)
 for case in ('missing','raw_sha','scope','trace','self','conflict','caller_map'):
  value=copy.deepcopy(envelope);raw=response['buffer'].encode();h=response['sha256'];scope=copy.deepcopy(P.decode(scope_raw))
  if case=='missing':raw=None;h=None
  elif case=='raw_sha':h='0'*64
  elif case=='scope':value['installScopeSha256']='0'*64
  elif case=='trace':value['actors'][0]['originalTrace']['actualStatus']=1
  elif case=='self':
   value['actors'][0]['pid']=s.pid();value['actors'][0]['originalTrace']['pid']=s.pid()
  elif case=='conflict':
   item=copy.deepcopy(value['actors'][0]);item['ppid']+=1;item['originalTrace']['ppid']+=1;value['actors'].append(item)
  elif case=='caller_map':scope['candidate']['typedPriorActors']=[]
  if case not in ('missing','raw_sha','caller_map'):raw=P.packed(value);h=P.sha(raw)
  sr=P.packed(scope);s.fs.nodes[str(path)]['raw']=sr
  expect('INITIAL_'+case+'_DENIES',lambda:CLI.execute(str(path),P.sha(sr),initial_facts_raw=raw,initial_facts_sha=h,system=s,verified_self_sha=P.sha(TARGET['install-cli.py'])))
  s.fs.nodes[str(path)]['raw']=scope_raw
  check('INITIAL_'+case+'_BEFORE_MUTATION',s.fs.nodes==original_nodes)
 # Actual lexical install-loader Python argument, actual CLI/modules, SAME buffers.
 outputs=[];env={};real=REAL_EXEC
 def track(code,ns):
  ns['__builtins__']=dict(vars(builtins),exec=track,print=lambda v,**kw:outputs.append(json.loads(v)));real(code,ns)
  if code.co_filename=='<verified-failed_resource_source07-system>':ns['System']=lambda:s;check('SAME_NAMESPACE_CONCRETE_SYSTEM_FAKE',ns['System']() is s)
 env.update(__name__='_actual_source07_install_loader',__builtins__=dict(vars(builtins),exec=track,print=lambda v,**kw:outputs.append(json.loads(v))))
 argv=['-c',str(HERE/'install-cli.py'),P.sha(TARGET['install-cli.py']),str(path),scope_sha,response['sha256'],response['buffer']]
 with ExitStack() as stack:
  for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
  stack.enter_context(patch.object(sys,'argv',argv))
  try:real(compile(INSTALL_BODY,'<actual-source07-quoted-install-loader>','exec'),env)
  except SystemExit as end:status=end.code
  else:raise AssertionError('INSTALL_LOADER_EXIT_REQUIRED')
 DIAGNOSTICS.append(dict(installLoaderStatus=status,primary=env['sink'].primary_failure,cleanup=env['sink'].cleanup_failures))
 check('ACTUAL_QUOTED_INSTALL_LOADER_ZERO',status==0)
 result=P.decode(s.fs.nodes[str(path.parent/'installation-result.json')]['raw'])
 raw=s.fs.nodes[str(A.N/'root-authorization.json')]['raw'];a=P.decode(raw);auth=P.sha(raw)
 expected={i['pid'] for i in envelope['actors']};by_pid={r['pid']:r for r in a['typedPriorActors']}
 check('FIRST_IMMUTABLE_COMPLETE_AUTH_HAS_ALL_ORIGINAL_ACTORS',a['typedActorRosterComplete'] is True and expected<=set(by_pid))
 check('ORIGINAL_TRACE_AND_EXTERNAL_RAW_SCOPE_PINS_RETAINED',a['initialActualFactsBuffer']==response['buffer'] and a['initialActualFactsSha256']==response['sha256'] and a['initialInstallScopeSha256']==scope_sha)
 check('INSTALLER_STAYS_PENDING_NULL',by_pid[s.pid()]['actualStatus'] is None and a['designatedControlAuthor']['actualStatus'] is None)
 check('NONZERO_EXTERNAL_STATUS_NOT_DIRECT_WAIT',by_pid[900089]['actualStatus']==1 and by_pid[900089]['directWaitClaimed'] is False)
 check('SOURCE_PRODUCED_FIRST_INSTALL_STATE_COMPLETE',expected<={r['pid'] for r in result['namespaceState']['header']['actorFacts']})
 check('INITIAL_ROWS_DERIVED_CARRIER_NOT_OUTSIDE_RESIDENCY',all(by_pid[pid]['evidence'].startswith(str(A.N/'root-authorization.json')+'#SOURCE07_INITIAL_ACTUAL_FACTS:') for pid in expected))
 bad=copy.deepcopy(a);bad['typedPriorActors']=[row for row in bad['typedPriorActors'] if row['pid']!=900090]
 expect('CONSUMER_RECHECK_MISSING_INITIAL_ACTOR_DENIES',lambda:P.authority_shape(bad,k),'INITIAL_FACT_DERIVED_ROSTER')
 LAST_STATE=result['namespaceState'];LAST_TOOL=fake_tool(s,0)
 setup=dict(separatelyCaptured=True,oldBindingsUnchanged=True,newBindingsReadonly=True,setupHelperRosterComplete=True,readEofStatus=1,actualBufferVerificationExit=0,actualEvalExit=0,successfulSetupHelpers=[dict(pid=900101,ppid=3749,start=None,fullFingerprint=None,requestedLaunch=a['physicalPythonRoles']['requestedLaunchBIN'],actualForegroundWaitStatus=0,separatelyCaptured=True,toolEvidence=['FAKE_ORIGINAL_SEPARATE_900101'])],actualToolEvidence=['FAKE_SETUP0'])
 control,h,state,actual=creator(s,k,a,auth,b,LAST_STATE,LAST_TOOL,'SETUP_OWNERSHIP_ADMISSION',setup)
 check('FIRST_SETUP_CARRIER_RETAINS_INITIAL_EXACT_ROWS',all(next(row for row in control['typedPriorActors'] if row['pid']==pid)==by_pid[pid] for pid in expected))
 status,state,actual=phase(s,k,a,auth,b,'negative',control,h)
 check('FIRST_QUALIFYING_NEGATIVE_RETAINS_ALL_INITIAL_ACTORS',status==1 and expected<={row['pid'] for row in state['header']['actorFacts']})
 check('NO_REAL_TARGET_BOUNDARY',G['ns']['BLOCKED']==[])

failure=None
sys.addaudithook(G['ns']['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for n in names:
    if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
  tests()
except BaseException as error:failure=dict(type=type(error).__name__,args=[str(v)[:256] for v in error.args])
result=dict(kind='SOURCE07_SINGLE_INITIAL_AUTHORIZATION_AFFECTED_FAKE_COMPOSITION',passed=len(CHECKS),checks=CHECKS,failure=failure,diagnostics=DIAGNOSTICS,operatorSteps=HISTORY,sourceHashes={n:hashlib.sha256(raw).hexdigest() for n,raw in TARGET.items()},fixtureSourceSha256=hashlib.sha256(RAW).hexdigest(),persistentDenyAuditUnchanged=True,actualTargetEffects=0,realBoundaryCalls=G['ns']['BLOCKED'],old39or13Replayed=False,actualBashBuiltinExecuted=False,parentSchedulingIntervalProved=False)
encoded=json.dumps(result,indent=2).encode()+b'\n';offset=0
while offset<len(encoded):offset+=os.write(RESULT_FD,encoded[offset:])
os.close(RESULT_FD)
print('FR07_DONE:'+json.dumps(dict(passed=len(CHECKS),failure=failure,operatorSteps=len(HISTORY))),flush=True)
raise SystemExit(1 if failure else 0)

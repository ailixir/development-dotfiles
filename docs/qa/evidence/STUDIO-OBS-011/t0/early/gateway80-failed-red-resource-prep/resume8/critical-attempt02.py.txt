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
PREFIX=PREFIX.replace(b'gateway80-failed-red-resource-prep/resume5',b'gateway80-failed-red-resource-prep/resume8').replace(b'code05-exact-review',b'code08-exact-review')
G={'__name__':'_source07_fake_definitions','__file__':str(HERE/'source05_checks.py')};exec(compile(PREFIX,'<source05-fake-definitions-only-current-targets>','exec'),G)
A,P,C,F,I,CLI,MemPath=[G[n] for n in ('A','P','C','F','I','CLI','MemPath')]
TARGET={n:(HERE/n).read_bytes() for n in ('failed_gateway.py','custody.py','protocol.py','entry.py','contract.json','guard-failed-red.bash','factory.py','installer.py','install-cli.py','control-author.py','control-author-cli.py','control-author-loader.bash','operator-completion.js','install-loader.bash')}
BODY=TARGET['guard-failed-red.bash'].decode().split("-B -c '",1)[1].split("' \"$GATEWAY_FR05_ENTRY\"",1)[0]
AUTH_BODY=next(n.value.value for n in ast.parse('x='+TARGET['control-author-loader.bash'].decode().split('readonly GATEWAY_FR05_AUTHOR_BODY= ',1)[1].split('\n# Own actual',1)[0]).body if isinstance(n,ast.Assign)) if False else None
# Shell single-quote concatenation is decoded with the already preloaded shlex,
# never evaluated by Bash or passed to a real target interpreter.
import shlex
AUTH_BODY=shlex.split(TARGET['control-author-loader.bash'].decode().split('readonly GATEWAY_FR05_AUTHOR_BODY= ',1)[1].split('\n# Own actual',1)[0])[0]


def all_source_graph(s,k,a,b):
 b['contract.json']=P.packed(k)
 for n,data in b.items():s.fs.put(A.N/n,data)
 a['codePins']={n:P.sha(data) for n,data in b.items()}
 payload={**TARGET,**b}
 for n,data in payload.items():s.fs.put(MemPath(HERE)/n,data,0o644)
 source=P.packed(dict(files=[dict(path=n,sha256=P.sha(data),bytes=len(data),mode=0o644) for n,data in payload.items()]))
 sourcepath=str(MemPath(HERE)/'manifest.json');s.fs.put(sourcepath,source,0o644)
 a['newCodeRecordPins']={sourcepath:P.sha(source)}
 for rel in ('resume-architecture/resume2/gateway80-failed-red-resource-code08-exact-review/manifest.json','qa/gateway80-failed-red-resource-code08-exact-review/manifest.json'):
  path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel);raw=P.packed(dict(subjectManifestSha256=P.sha(source),mandatoryFindingCount=0,verdict='SOURCE_ONLY_SUPPORT'));s.fs.put(path,raw,0o644);a['newCodeRecordPins'][path]=P.sha(raw)
 G['populate_owners'](s,k,a)
 return source
INSTALL_BODY=shlex.split(TARGET['install-loader.bash'].decode().split('-B -c ',1)[1],posix=True)[0]
CHECKS=[];CASES=[];DETAILS=[];CAPTURES=[]
RESULT_FD=os.open(str(HERE/'critical-attempt02.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
(HERE/'critical-attempt02.py.txt').write_bytes((HERE/'critical_check.py').read_bytes())
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 CHECKS.append(dict(id=name,passed=True))
class PremutationStop(Exception):pass
def build(case):
 s,k,a,auth,b=G['build']();s.current=990801;s.parent=3749
 private=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-gateway80-source04-install-input-directory-facts.json')
 # This is synthetic hash/content under the same29-key fixture policy. Metadata
 # is FIXED in fake FS, never manufactured from the requested expected mode.
 s.fs.nodes[private]['mode']=0o600
 check(case+'_FIXED_FAKE_PRIVATE_MODE',s.fs.info(private).st_mode&0o7777==0o600)
 if case=='missing_registry':k['externalInputModes'].pop(next(iter(k['externalInputModes'])))
 if case=='extra_registry':k['externalInputModes']['docs/qa/evidence/STUDIO-OBS-011/t0/FAKE_UNDECLARED.json']=0o644
 a.update(freshnessProofSubject=k['freshnessProofSubject'],parentSchedulingIntervalProved=False)
 source=all_source_graph(s,k,a,b)
 a['newDirectoryPins']={}
 s.fs.nodes={p:n for p,n in s.fs.nodes.items() if p!=str(A.N) and not p.startswith(str(A.N)+'/')}
 for n in ('binaryHashes','binaryModes','binaryWitnesses','codePins','newCodeRecordPins','typedOwnerRecordPins','designatedControlAuthor','typedPriorActors','typedActorRosterComplete','typedActorEvidencePins','initialActualFactsBuffer','initialActualFactsSha256','initialInstallScopeSha256'):a.pop(n,None)
 outside=MemPath(next(iter(k['typedOwnerPaths'].values()))).parent;s.fs.nodes[str(outside)]['mode']=0o700
 def fact(path):
  st=s.fs.info(str(path));return dict(path=str(path),uid=st.st_uid,dev=st.st_dev,ino=st.st_ino,mode=stat.S_IMODE(st.st_mode))
 sourcepath=str(MemPath(HERE)/'manifest.json');reviews={sourcepath:P.sha(source)}
 for rel in ('resume-architecture/resume2/gateway80-failed-red-resource-code08-exact-review/manifest.json','qa/gateway80-failed-red-resource-code08-exact-review/manifest.json'):
  path=str(A.R/'docs/qa/evidence/STUDIO-OBS-011/t0'/rel);reviews[path]=P.sha(s.fs.nodes[path]['raw'])
 temp=dict(a,newCodeRecordPins=reviews,typedOwnerRecordPins={});G['populate_owners'](s,k,temp)
 scope=dict(role='FAILED_RESOURCE_SOURCE08_INSTALL_ONLY',authorizedBy='root',authorized=True,cleanup=False,nativeInvocations=0,sourceDirectory=str(HERE),destination=str(A.N),outsideDirectory=str(outside),outsideDirectoryFact=fact(outside),oldEDirectory=fact(A.E),sourceManifestSha256=P.sha(source),reviewPins=reviews,ownerPins=temp['typedOwnerRecordPins'],readsetPolicy='EXACT_FAILED_RESOURCE_SOURCE08_CONTRACT_REVIEWS_OWNERS_TYPED_METADATA_BOTH_PRIORS_AND_SEVEN_CANONICAL_BINARIES',candidate=a)
 path=outside/'root-install-scope.json';raw=P.packed(scope);s.fs.put(path,raw)
 # Narrow FAKE root facts retain the two actual failure status meanings. They
 # establish no actual Source08 original trace/qualification or future total.
 actors=[]
 for pid,status in ((39213,1),(65140,1),(990790,0)):
  tool='FAKE_SOURCE08_ORIGINAL_'+str(pid);parent=3749 if pid==65140 else 17932
  trace=dict(kind='ORIGINAL_SEPARATELY_CAPTURED_TOOL_TRACE',toolCallId=tool,pid=pid,ppid=parent,actualStatus=status,separateStatusCaptured=True,statusMeaning='ACTUAL_EXTERNAL_TOOL_EXIT_NOT_DIRECT_WAIT',unit=k['subject']['label'],sourceManifestSha256=P.sha(source),installScopeSha256=P.sha(raw))
  actors.append(dict(role='EXTERNAL_ROOT_INPUT_AUTHOR',pid=pid,ppid=parent,actualStatus=status,toolCallId=tool,separateStatusCaptured=True,originalTrace=trace))
 envelope=dict(kind='SOURCE08_INITIAL_ACTUAL_FACTS',unit=k['subject']['label'],sourceManifestSha256=P.sha(source),installScopeSha256=P.sha(raw),authorizedBy='root',authorized=True,completeActualFacts=True,actors=actors);initial=P.packed(envelope)
 if case=='wrong_mode':s.fs.nodes[private]['mode']=0o644
 if case=='wrong_owner':s.fs.nodes[private]['uid']=502
 if case=='raw_sha':s.fs.nodes[private]['raw']=b'FAKE_CHANGED_RAW_BYTES'
 if case=='oversize':
  info=s.fs.node_info;node=s.fs.nodes[private]
  def fixed_info(n):
   st=info(n)
   if n is node:st.st_size=k['limits']['maximumFileBytes']+1
   return st
  s.fs.node_info=fixed_info
 return s,k,a,b,path,raw,initial,private
def run(case):
 s,k,a,b,path,scope_raw,initial,private=build(case);before=copy.deepcopy(s.fs.nodes);start=len(s.fs.events);captured=[];outputs=[];ns={};real=exec
 def track(code,env):
  env['__builtins__']=dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value)));real(code,env)
  if code.co_filename=='<verified-failed_resource_source08-system>':env['System']=lambda:s
  if code.co_filename=='<verified-failed_resource_source08-factory>':
   original=env['preflight']
   def preflight(*args,**kwargs):
    draft=original(*args,**kwargs);captured.append(dict(draft=draft,base=args[0]));raise PremutationStop('TEST_STOP_AFTER_REAL_PREFLIGHT_BEFORE_MUTATION')
   env['preflight']=preflight
 ns.update(__name__='_actual_source08_quoted_loader',__builtins__=dict(vars(builtins),exec=track,print=lambda value,**kw:outputs.append(json.loads(value))))
 argv=['-c',str(HERE/'install-cli.py'),P.sha(TARGET['install-cli.py']),str(path),P.sha(scope_raw),P.sha(initial),initial.decode()]
 with ExitStack() as stack:
  for n in ('open','fstat','stat','close','read','getuid','getpid','getppid'):stack.enter_context(patch.object(os,n,getattr(s.api,n)))
  stack.enter_context(patch.object(sys,'argv',argv))
  try:real(compile(INSTALL_BODY,'<actual-source08-install-loader-argument>','exec'),ns)
  except SystemExit as end:status=end.code
  else:raise AssertionError('LOADER_EXPLICIT_EXIT_REQUIRED')
 sink=ns['sink'];reason=None if sink.primary_failure is None else sink.primary_failure['reason']
 events=s.fs.events[start:];private_reads=[e for e in events if e[0]=='read' and e[1]==private]
 check(case+'_NO_MUTATION',s.fs.nodes==before)
 check(case+'_SELECTED_DESCRIPTORS_CLOSED',not s.fs.fds and not sink.cleanup_failures)
 if case=='positive':
  check('POSITIVE_ACTUAL_MIXED_ACQUISITION_AND_PREFLIGHT',len(captured)==1 and len(private_reads)>0 and status==1 and sink.primary_type=='PremutationStop')
  base=captured[0]['base'];rows={r['pid']:r for r in base['typedPriorActors']}
  check('INITIAL_COMPLETE_PENDING_AND_OLD_STATUS_ONES',base['typedActorRosterComplete'] is True and base['designatedControlAuthor']['actualStatus'] is None and rows[39213]['actualStatus']==1 and rows[65140]['actualStatus']==1)
  unit=A.Unit.__new__(A.Unit);unit.s=s;unit.k=k;unit.a=base;unit.external_inputs={str(A.R/p):spec for p,spec in P.external_input_specs(k).items()};unit.pins={};unit.file_facts={};unit.buffers={}
  source=ast.parse(TARGET['failed_gateway.py']);klass=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='Unit');load=next(n for n in klass.body if isinstance(n,ast.FunctionDef) and n.name=='load_libraries')
  leaf=types.SimpleNamespace();driver=types.SimpleNamespace();targets={'leaf.anchored_raw','d.SAFE_READER','d.TOOL_READER','d.sha'}
  selected=[n for n in load.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Attribute) and ast.unparse(t)in targets for t in n.targets)]
  check('ALL_FOUR_ACTUAL_CALLBACK_BINDINGS_SELECTED',len(selected)==4)
  env=dict(self=unit,leaf=leaf,d=driver,P=P);real(compile(ast.Module(body=selected,type_ignores=[]),'<actual-mode-callback-assignments>','exec'),env)
  expected=s.fs.nodes[private]['raw'];check('RUNTIME_BOUND_PRIVATE600',unit.bound(private)==expected)
  check('REGISTERED_CALLBACKS_SAME_BOUND600',leaf.anchored_raw(private)==expected and driver.SAFE_READER(private)==expected and driver.TOOL_READER(private)==expected and driver.sha(private)==P.sha(expected))
  public=next(str(A.R/p) for p,mode in k['externalInputModes'].items() if mode==0o644);check('RUNTIME_BOUND_PUBLIC644',unit.bound(public)==s.fs.nodes[public]['raw'])
  check('CALLBACKS_KEEP_FIXED_METADATA_AND_CLOSED_CUSTODY',s.fs.nodes[private]['mode']==0o600 and not s.fs.fds)
 else:
  check(case+'_BEFORE_PREFLIGHT',not captured)
  if case in ('wrong_mode','wrong_owner','oversize'):check(case+'_NO_PRIVATE_BODY_READ',not private_reads and reason=='FILE_OWNER_MODE_CAP')
  elif case=='raw_sha':check('RAW_SHA_DENIES_AFTER_RETAINED_READ_BEFORE_USE',private_reads and reason=='INSTALL_VERIFIED_CONSUMED_INPUT')
  else:check(case+'_NO_FALLBACK',not private_reads and reason=='EXTERNAL_INPUT_MODE_REGISTRY')
 DETAILS.append(dict(case=case,status=status,primary=sink.primary_failure,preflightReached=bool(captured),privateReadCalls=len(private_reads),mutationReached=False));CASES.append(case)
failure=None
sys.addaudithook(G['ns']['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for n in names:
    if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
  for case in ('positive','wrong_mode','wrong_owner','oversize','raw_sha','missing_registry','extra_registry'):run(case)
  check('NO_REAL_TARGET_BOUNDARY',G['ns']['BLOCKED']==[])
except BaseException as error:failure=dict(type=type(error).__name__,args=[str(x)[:256] for x in error.args])
result=dict(kind='SOURCE08_FIXED_SEVEN_CHANGED_PATH_FAKE_COMPOSITION',passed=len(CHECKS),checks=CHECKS,cases=CASES,details=DETAILS,failure=failure,sourceHashes={n:hashlib.sha256(b).hexdigest() for n,b in TARGET.items()},literalFixtureSha256=hashlib.sha256(RAW).hexdigest(),persistentDenyAuditUnchanged=True,realBoundaryCalls=G['ns']['BLOCKED'],actualTargetEffects=0,synthetic29KeyFixture=True,originalPrivateBodyStatHashAcquired=False,preflightTestSentinelBeforeAnyMutation=True,oldSuitesReplayed=False)
raw=json.dumps(result,indent=2).encode()+b'\n';offset=0
while offset<len(raw):offset+=os.write(RESULT_FD,raw[offset:])
os.close(RESULT_FD);print(json.dumps(dict(passed=len(CHECKS),cases=len(CASES),failure=failure)),flush=True);raise SystemExit(1 if failure else 0)

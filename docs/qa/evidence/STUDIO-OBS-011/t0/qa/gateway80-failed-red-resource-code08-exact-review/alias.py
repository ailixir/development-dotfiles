"""One lean changed-path fake composition; interactive PURE V8 operator steps.

Only fake machine definitions are reused; no historical suite is replayed. Actual
corrected CLI/author/guard/loader bodies are compiled and called under the unchanged
inherited persistent deny audit. Root-like tool facts below are explicitly FAKE.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,errno,fcntl,hashlib,io,json,os,socket,stat,subprocess,sys,time,types
from contextlib import ExitStack
from unittest.mock import patch
HERE=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume8')
REVIEW=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-code08-exact-review')
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
RESULT_FD=os.open(str(REVIEW/'alias-results.json'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
WRITE=os.write;CLOSE=os.close
fixture=ast.parse((HERE/'critical_check.py').read_bytes())
definitions=[n for n in fixture.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in ('check','build')]
exec(compile(ast.Module(body=definitions,type_ignores=[]),'<source08-explicit-fake-build-only>','exec'),globals())
RESULT=None
sys.addaudithook(G['ns']['audit'])
try:
 with ExitStack() as stack:
  for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','stat','lstat','mkdir','iterdir','resolve','unlink','rglob','write_bytes','write_text')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','symlink','readlink','fdopen','fsync','fchmod','kill','fork','system','getpid','getppid','getuid','umask')),(socket,('socket','create_connection')),(subprocess,('Popen','run','call','check_output','check_call')),(fcntl,('flock','fcntl','ioctl')),(ctypes,('CDLL',)),(time,('time','sleep','monotonic_ns'))):
   for n in names:
    if hasattr(obj,n):stack.enter_context(patch.object(obj,n,G['ns']['blocked']))
  s,k,a,b,path,scope_raw,initial,private=build('positive')
  unit=A.Unit.__new__(A.Unit);unit.s=s;unit.k=k;unit.a=a;unit.external_inputs={str(A.R/p):spec for p,spec in P.external_input_specs(k).items()};unit.pins={};unit.file_facts={};unit.buffers={}
  alias=private.rsplit('/',1)[0]+'/./'+private.rsplit('/',1)[1]
  changed=b'SYNTHETIC_ALIAS_WRONG_MODE_AND_RAW_BODY';s.fs.nodes[private]['mode']=0o644;s.fs.nodes[private]['raw']=changed
  reads=lambda:len([e for e in s.fs.events if e[0]=='read' and e[1]==private])
  start=reads()
  try:unit.bound(alias)
  except C.Hold as error:direct_reason=error.args[0]
  else:raise AssertionError('DIRECT_BOUND_MUST_DENY_FIXED_WRONG_MODE')
  assert direct_reason=='FILE_OWNER_MODE_CAP' and reads()==start
  received=unit.retained_source_read(alias)
  assert received==changed and reads()>start and P.sha(received)!=unit.external_inputs[private][0] and private not in unit.buffers
  assert not s.fs.fds and G['ns']['BLOCKED']==[]
  RESULT=dict(kind='ONE_CONCRETE_REGISTERED_STRING_ALIAS_BOUNDARY_PAIR',directBoundDeniedBeforeBody=True,directReason=direct_reason,rawAliasMissesMembership=alias not in unit.external_inputs,normalizedAliasRegistered=str(s.path(alias)) in unit.external_inputs,fallbackReadWrongModeAndChangedRaw=True,registeredMode=unit.external_inputs[private][1],fixedFakeActualMode=s.fs.nodes[private]['mode'],privateReadCalls=reads()-start,hashMismatchReturned=True,registeredBuffersNotPopulated=private not in unit.buffers,selectedDescriptorsClosed=True,actualPrivateOriginalRead=False,realBoundaryCalls=G['ns']['BLOCKED'],extraCases=1,sourceUnchanged=True)
except BaseException as error:
 RESULT=dict(failure=dict(type=type(error).__name__,args=[str(x)[:256]for x in error.args]),actualPrivateOriginalRead=False)
raw=(json.dumps(RESULT,indent=2)+'\n').encode();offset=0
while offset<len(raw):offset+=WRITE(RESULT_FD,raw[offset:])
CLOSE(RESULT_FD);print(json.dumps(RESULT));raise SystemExit(1 if 'failure'in RESULT else 0)

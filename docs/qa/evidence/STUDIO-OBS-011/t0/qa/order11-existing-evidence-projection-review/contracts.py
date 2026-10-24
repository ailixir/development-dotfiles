"""Independent actual-core AST contracts. No entrypoint or real filesystem private IO.
Author Fake class is only an input builder; author witness loop and results are not executed.
Filesystem counterexamples use synthetic Paths/OS state exclusively.
"""
from pathlib import Path
from types import ModuleType,SimpleNamespace
import ast,copy,json,hashlib,datetime,xml.etree.ElementTree as ET,os as flags_os,stat
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-review'
source=(D/'project_existing.py').read_text();tree=ast.parse(source)
# Never execute top-level contract/file reads, main/CLI, imports of package entrypoints or real ExactIO.
P=ModuleType('qa_actual_core');P.__dict__.update(__file__=str(D/'project_existing.py'),HERE=D,ROOT=R,C=json.loads((D/'source-contract.json').read_text()))
body=[]
for n in tree.body:
 if isinstance(n,ast.If):continue
 if isinstance(n,ast.FunctionDef) and n.name in ['main','local_bindings']:continue
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ['HERE','ROOT','C'] for t in n.targets):continue
 body.append(n)
exec(compile(ast.Module(body=body,type_ignores=[]),'<actual-core-ast-no-entrypoints>','exec'),P.__dict__)
fixture=ast.parse((D/'contracts_fake.py').read_text());fake=next(n for n in fixture.body if isinstance(n,ast.ClassDef) and n.name=='Fake')
env=dict(P=P,BASE=copy.deepcopy(P.C),OUT=D,copy=copy,json=json,datetime=datetime,ET=ET,sha=P.digest,j=P.canonical)
exec(compile(ast.Module(body=[fake],type_ignores=[]),'<author-input-builder-class-only>','exec'),env);Fake=env['Fake'];results=[]
def check(name,edit=None,accept=False,zero_private=False,rebind=True):
 f=Fake()
 if edit:edit(f)
 if rebind:f.rebind()
 try:out=f.run();accepted=True;reason='CLOSED_PROJECTION_NOT_CAUSE'
 except P.Refused as e:out=None;accepted=False;reason=str(e)
 except Exception as e:out=None;accepted=False;reason='SAFE_MALFORMED_'+type(e).__name__
 assert accepted is accept,(name,accepted,reason)
 if zero_private:assert f.private_manifest_reads==f.native_reads==0
 if out:
  raw=P.canonical(out);assert f.sid.encode() not in raw and f.temp.encode() not in raw
  assert out['cause']=='UNPROVEN' and out['diagnosticCandidate']['association']=='CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION'
 results.append(dict(name=name,accepted=accepted,expected=accept,reason=reason,privateManifestCalls=f.private_manifest_reads,privateRootCalls=f.native_reads,fakeOnly=True))
 return out
check('valid-synthetic-terminal-red-release',accept=True)
check('qualified-terminal-red-incomplete-collector-positive',lambda f:f.receipt.update(taskCollectionComplete=False,coveragePass=False,cohortPass=False,outerPass=False,observationGap=True),accept=True)
for flag in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','sourceHoldVerified','quotesHelmHelpersHeld','observationGapSticky']:
 for kind in ['false','missing']:
  check('terminal-'+flag+'-'+kind,lambda f,k=flag,m=kind:f.terminal.update({k:False}) if m=='false' else f.terminal.pop(k),zero_private=True)
for flag in ['wholePublicArchiveFrozen','wholePublicAssessmentComplete','rawFailPreserved','observationGapPreserved','noLaneApproval']:
 check('assessment-'+flag+'-false',lambda f,k=flag:f.assessment.update({k:False}),zero_private=True)
for name,edit in {
 'unreleased':lambda f:setattr(f,'released',False),
 'root-refused':lambda f:setattr(f,'root_approved',False),
 'quinn-refused':lambda f:setattr(f,'quinn_approved',False),
 'timeout-inference':lambda f:f.terminal.update(terminalInferredFromTimeout=True),
 'no-closure-artifact-pins':lambda f:f.terminal.update(authoritativeClosureEvidenceSha256=[]),
 'postdated-terminal':lambda f:f.terminal.update(completedAtUtc='2026-10-19T12:01:00+00:00'),
 'expired':lambda f:setattr(f,'expires','2026-10-19T12:00:00+00:00'),
 'future-issued':lambda f:setattr(f,'issued','2026-10-19T12:01:00+00:00'),
 'too-long-approval':lambda f:setattr(f,'expires','2026-10-19T14:00:00+00:00'),
 'changed-source-capture':lambda f:f.after.update(digest='9'*64),
 'changed-capture-files':lambda f:f.after['files'].append({'synthetic':True}),
 'green-raw-gradle':lambda f:f.receipt.update(gradleExit=0),
 'partial-only-default':lambda f:f.receipt.update(explicitTestTasks=['test']),
 'target-not-failed':lambda f:f.receipt['testcases'][0].update(status='PASS'),
 'reused-output':lambda f:setattr(f,'output_exists',True)
}.items():check(name,edit,zero_private=True)
# Forge or corrupt actual pins after synthetic scope signing, without re-signing it.
for alias in ['authorization','root_approval','quinn_approval','terminal','assessment','receipt','before','after']:
 check('post-signing-'+alias+'-changed',lambda f,a=alias:f.public.update({a:f.public[a]+b' '}),zero_private=True,rebind=False)
for key in ['parserSha256','packageManifestSha256','sourceBindingsSha256']:
 check('executing-local-'+key+'-changed',lambda f,k=key:f.local.update({k:'9'*64}),zero_private=True,rebind=False)
for name,edit in {
 'snapshot-unknown-message':lambda f:f.snapshot.update(message='SECRET_MARKER_DO_NOT_EXPORT'),
 'snapshot-unknown-code':lambda f:f.snapshot.update(errorCode='SECRET_MARKER_DO_NOT_EXPORT'),
 'snapshot-unknown-field':lambda f:f.snapshot.update(stopTimestamp='secret'),
 'wrong-warning-session':lambda f:f.snapshot.update(sessionId='00000000-0000-4000-8000-000000000019'),
 'wrong-prefix':lambda f:f.event.update(session='0'*16),
 'missing-runtime-phase':lambda f:f.event['links'][0].pop('phase'),
 'invalid-runtime-phase':lambda f:f.event['links'][0].update(phase='START_SETTLE'),
 'missing-launch-phase':lambda f:f.event['links'][1].pop('phase'),
 'extra-private-message':lambda f:f.event['links'][0].update(message='SECRET_MARKER'),
 'extra-private-path':lambda f:f.event['links'][1].update(path='/synthetic/private'),
 'too-many-links':lambda f:f.event['links'].extend([{'name':'Error'}]*6),
 'noninteger-elapsed':lambda f:f.event.update(elapsedMs=1.2),
 'negative-elapsed':lambda f:f.event.update(elapsedMs=-1),
 'missing-worker-line':lambda f:setattr(f,'log',b'unrelated synthetic bytes\n'),
 'duplicate-worker-line':lambda f:setattr(f,'log',b'GUIDED_START_FAILED '+P.canonical(f.event)+b'\nGUIDED_START_FAILED '+P.canonical(f.event)+b'\n'),
 'wrong-generation':lambda f:f.manifest.update(generation=3),
 'unconfirmed-producer-exit':lambda f:f.events[-1].update(alive=True),
 'duplicate-producer-spawn':lambda f:f.events.append(copy.deepcopy(f.events[0])),
 'manifest-path-traversal':lambda f:next(r for r in f.manifest['files'] if r['role']=='snapshot_initial18').update(path='../synthetic.json'),
 'wrong-synthetic-root':lambda f:f.manifest['root'].update(path='/synthetic/obs007-joined-other')
}.items():check(name,edit)
def marker(f):f.event['links'][2].update(name='SecretMarkerName',code='SECRET_MARKER_DO_NOT_EXPORT',errno='ESECRETMARKER',exitCode=1,signal='SIGSECRET')
out=check('source-shaped-unknown-scalars-redacted',marker,accept=True)
for value in ['SecretMarkerName','SECRET_MARKER_DO_NOT_EXPORT','ESECRETMARKER','SIGSECRET']:
 assert value.encode() not in P.canonical(out) and P.digest(value.encode()).encode() not in P.canonical(out)
check('long-elapsed-not-invented-runtime-timer',lambda f:f.event.update(elapsedMs=120001),accept=True)
check('OTHER-not-no-error-empty-numeric-dictionaries-retained',accept=True)
for raw in [b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":Infinity}',b'['*18+b'0'+b']'*18]:
 try:P.decode(raw,65536);raise AssertionError('invalid JSON accepted')
 except P.Refused:pass
# Synthetic filesystem only: exact current read_inputs method follows resolved root symlink.
f=Fake();symlink_root=f.manifest['root']['path'];resolved_root='/synthetic/obs007-joined-target';root_stat=SimpleNamespace(st_dev=1,st_ino=2,st_uid=123,st_gid=0,st_mode=stat.S_IFDIR|448,st_size=0,st_mtime_ns=1,st_ctime_ns=1)
class FakePath:
 def __init__(self,value):self.value=str(value)
 def __str__(self):return self.value
 def __truediv__(self,part):return FakePath(self.value+'/'+str(part))
 def resolve(self,strict=False):
  assert self.value==symlink_root and strict is True
  return FakePath(resolved_root)
 def is_absolute(self):return self.value.startswith('/')
 @property
 def name(self):return self.value.rsplit('/',1)[-1]
class FakeOS:
 O_RDONLY=flags_os.O_RDONLY;O_DIRECTORY=flags_os.O_DIRECTORY;O_NOFOLLOW=flags_os.O_NOFOLLOW
 O_WRONLY=flags_os.O_WRONLY;O_CREAT=flags_os.O_CREAT;O_EXCL=flags_os.O_EXCL
 def __init__(self):self.fds={};self.counter=10;self.opens=[];self.output_followed=None
 def getuid(self):return 123
 def open(self,path,flags,mode=None,dir_fd=None):
  path=str(path);full=path if path.startswith('/') else self.fds[dir_fd]['path']+'/'+path
  self.opens.append(dict(path=full,flags=flags))
  if full.endswith('/released-projection-01/projection.json'):
   # Leaf O_NOFOLLOW does not stop following a swapped symlink in its parent.
   self.output_followed='/synthetic/unapproved-output/projection.json'
  self.counter+=1;fd=self.counter
  role=next((r for r in f.manifest['files'] if r['role']!='default_xml' and full==resolved_root+'/'+r['path']),None)
  self.fds[fd]=dict(path=full,role=role,offset=0);return fd
 def fstat(self,fd):
  row=self.fds[fd]['role']
  return root_stat if row is None else SimpleNamespace(st_dev=row['dev'],st_ino=row['ino'],st_uid=row['uid'],st_gid=0,st_mode=stat.S_IFREG|row['mode'],st_size=row['bytes'],st_mtime_ns=1,st_ctime_ns=1)
 def dup(self,fd):self.counter+=1;self.fds[self.counter]=copy.copy(self.fds[fd]);return self.counter
 def close(self,fd):pass
 def read(self,fd,count):
  entry=self.fds[fd];raw=f.inputs[entry['role']['role']];start=entry['offset'];entry['offset']+=count;return raw[start:start+count]
fos=FakeOS();old_path=P.Path;old_os=P.os;P.Path=FakePath;P.os=fos
try:
 accepted_inputs=P.ExactIO().read_inputs({'scope':{'purpose':P.C['purpose']}},f.manifest,f.xml)
 assert set(accepted_inputs)==P.ROLES and fos.opens[0]['path']==resolved_root
finally:P.Path=old_path;P.os=old_os
# AST-only output-open statement from main, not the main function or CLI.
main_ast=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
output_open=next(n for n in main_ast.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fd' for t in n.targets))
write_os=FakeOS();exec(compile(ast.Module(body=[output_open],type_ignores=[]),'<output-open-statement-only-synthetic-os>','exec'),{'os':write_os,'folder':FakePath('/synthetic/package/released-projection-01')})
assert write_os.output_followed=='/synthetic/unapproved-output/projection.json'
# Actual read_manifest also validates lstat metadata separately from the opened read handle.
class ManifestSwapOS:
 O_RDONLY=flags_os.O_RDONLY;O_NOFOLLOW=flags_os.O_NOFOLLOW
 def getuid(self):return 123
 def lstat(self,path):return SimpleNamespace(st_mode=stat.S_IFREG|384,st_uid=123)
 def open(self,path,flags):self.offset=0;return 7
 def fstat(self,fd):return SimpleNamespace(st_dev=9,st_ino=99,st_uid=999,st_gid=0,st_mode=stat.S_IFREG|420,st_size=len(f.manifest_raw),st_mtime_ns=1,st_ctime_ns=1)
 def read(self,fd,count):start=self.offset;self.offset+=count;return f.manifest_raw[start:start+count]
 def close(self,fd):pass
swap=ManifestSwapOS();old_os=P.os;P.os=swap
try:
 read_raw=P.ExactIO().read_manifest({'scope':{'purpose':P.C['purpose']}})
 assert read_raw==f.manifest_raw
finally:P.os=old_os
filesystem=[dict(id='O11-PROJ-FS-01A',result='ROOT_SYMLINK_RESOLVED_AND_ACCEPTED_BY_ACTUAL_READ_INPUTS_CORE',syntheticOnly=True,actualPrivateReads=0),dict(id='O11-PROJ-FS-01B',result='SWAPPED_OUTPUT_PARENT_FOLLOWED_BY_ACTUAL_OUTPUT_OPEN_STATEMENT',syntheticOnly=True,actualWrites=0),dict(id='O11-PROJ-FS-01C',result='MANIFEST_OPENED_HANDLE_UID999_MODE0644_ACCEPTED_AFTER_UID123_MODE0600_LSTAT',syntheticOnly=True,actualPrivateReads=0)]
report=dict(scope='INDEPENDENT_AST_CORE_SYNTHETIC_ONLY',parserSha256=P.digest(source.encode()),checks=len(results),accepted=sum(x['accepted'] for x in results),rejected=sum(not x['accepted'] for x in results),results=results,filesystemCounterexamples=filesystem,extraJsonShapeRejections=4,authorLoopExecuted=False,entrypointExecuted=False,actualPrivateEnumerationReadsGlobs=0,actualOsIoInContracts=False,rawPrivateExported=False)
(O/'contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['results']}))

"""Independent actual-core AST contracts. No entrypoint or real filesystem private IO.
Author Fake class is only an input builder; author witness loop and results are not executed.
Filesystem counterexamples use synthetic Paths/OS state exclusively.
"""
from pathlib import Path
from types import ModuleType,SimpleNamespace
import ast,copy,json,hashlib,datetime,xml.etree.ElementTree as ET,os as flags_os,stat
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection/resume2';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-resume2-review'
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

# AST-extract only synthetic FS input-model classes, never author's witness loop/expectations.
from pathlib import PurePosixPath
model=ast.parse((D/'contracts_fs.py').read_text());model_nodes=[n for n in model.body if isinstance(n,ast.ClassDef) and n.name in {'Node','FS'}]
model_env=dict(SimpleNamespace=SimpleNamespace,stat=stat,PurePosixPath=PurePosixPath,flags=flags_os)
exec(compile(ast.Module(body=model_nodes,type_ignores=[]),'<synthetic-os-input-model-classes-only>','exec'),model_env);FS=model_env['FS']
fs_results=[]
def setup(alias=None,edit=None):
 f=Fake()
 if alias:
  f.temp='/var/folders/owned/obs007-joined-closedfake';f.manifest['root']['path']=f.temp
  for row in f.events:row['ownedTemp']=f.temp
  xml=ET.fromstring(f.xml);xml.find('testcase/failure').set('message','[second explicit learning; logs '+f.temp+'] ');f.xml=ET.tostring(xml);P.C['publicFacts']['xmlSha256']=P.digest(f.xml)
 if edit:edit(f)
 f.rebind();fs=FS()
 if alias:fs.add('/private/var',mode=493,uid=0);fs.add('/var','link',target=alias,mode=511,uid=0)
 rootpath='/private'+f.temp if alias else f.temp;root=fs.add(rootpath,mode=448);root.ino=f.manifest['root']['ino']
 for row in f.manifest['files']:
  path=str(R/row['path']) if row['role']=='default_xml' else rootpath+'/'+row['path']
  node=fs.add(path,'file',mode=row['mode'],uid=row['uid'],data=f.inputs[row['role']]);node.dev=row['dev'];node.ino=row['ino']
 fs.add(D/'release',mode=448)
 fs.add(D/'release/private-input-manifest.json','file',mode=384,data=f.manifest_raw)
 for alias_name,raw in f.public.items():
  if alias_name in P.ExactIO.PUBLIC_FILES:path=D/'release'/P.ExactIO.PUBLIC_FILES[alias_name]
  else:path=R/'docs/qa/evidence/STUDIO-OBS-011/execution'/(P.C['executionLabel']+'-'+{'receipt':'results','before':'before','after':'after'}[alias_name]+'.json')
  fs.add(path,'file',mode=384,data=raw)
 return f,fs,rootpath
permit={'scope':{'purpose':P.C['purpose']}}
def native_inputs(reader,f,fs,path):assert reader.read_inputs(permit,f.manifest,f.xml)==f.inputs
def manifest_read(reader,f,fs,path):assert reader.read_manifest(permit)==f.manifest_raw
def output(reader,f,fs,path):
 reader.claim_output(permit);reader.write_output(f.run());assert fs.created[-1].data==P.canonical(f.run())+b'\n'
def pipeline(reader,f,fs,path):
 result=P.run(reader,f.expected,f.local,f.now);reader.write_output(result)
 assert result['cause']=='UNPROVEN' and result['rawTaskCollectionComplete']==f.receipt['taskCollectionComplete']
 assert result['diagnosticCandidate']['association']=='CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION'
def fscheck(name,action=native_inputs,edit=None,fixture_edit=None,alias=None,accept=False,zero_reads=False,zero_writes=False,no_private=False):
 f,fs,path=setup(alias,fixture_edit)
 if edit:edit(f,fs,path)
 reads=[];priorhook=fs.hook
 def observe(model,op,leaf,node):
  if op=='read':reads.append(leaf)
  if priorhook:priorhook(model,op,leaf,node)
 fs.hook=observe
 old_os=P.os;P.os=fs;reader=P.ExactIO();accepted=False
 try:
  action(reader,f,fs,path);reader.close();accepted=True;reason='ACTUAL_FD_CORE_ACCEPTED_SYNTHETIC_ONLY'
 except (P.Refused,OSError) as e:
  reason=str(e) if isinstance(e,P.Refused) else 'OS_FAILURE_QUALIFIED_BY_FIXED_MAIN_BOUNDARY'
  try:reader.close()
  except (P.Refused,OSError):pass
 finally:P.os=old_os
 assert accepted is accept,(name,accepted,reason)
 if zero_reads:assert fs.reads==0,(name,fs.reads)
 if zero_writes:assert fs.writes==0,(name,fs.writes)
 if no_private:assert not any(leaf=='private-input-manifest.json' or leaf.startswith('failed-test-state-') or leaf in {'guided.log','owned-worker-generations.jsonl'} for leaf in reads),(name,reads)
 assert fs.alternate_writes==0,(name,'alternate-directory-write')
 if accepted:assert not any(v['active'] for v in fs.fds.values()),(name,'unclosed-owned-fd')
 fs_results.append(dict(name=name,accepted=accepted,expected=accept,reason=reason,syntheticReadCalls=fs.reads,syntheticWriteCalls=fs.writes,alternateParentWrites=fs.alternate_writes,actualPrivateIo=0))
 return f,fs
fscheck('ordinary-anchored-input-positive',accept=True)
for target in ['private/var','/private/var']:fscheck('approved-var-alias-'+target,alias=target,accept=True)
fscheck('unapproved-var-alias-rejected',alias='/synthetic/elsewhere',zero_reads=True)
fscheck('original-A-root-symlink-rejected-before-content',edit=lambda f,fs,p:fs.add(p,'link',target='/synthetic/other'),zero_reads=True)
fscheck('ancestor-symlink-rejected-before-content',edit=lambda f,fs,p:fs.add('/synthetic','link',target='/synthetic/other'),zero_reads=True)
for attr,value in [('uid',999),('mode',493),('ino',999),('dev',99)]:
 fscheck('root-'+attr+'-mismatch',edit=lambda f,fs,p,k=attr,v=value:setattr(fs.locate(p),k,v),zero_reads=True)
def hook_for(leaf,operation,mutate):
 def edit(f,fs,path):
  fired=False
  def hook(model,op,name,node):
   nonlocal fired
   if not fired and op==operation and name==leaf:fired=True;mutate(f,model,path,node)
  fs.hook=hook
 return edit
fscheck('root-replaced-between-stat-and-open',edit=hook_for('obs007-joined-closedfake','before-open',lambda f,fs,p,n:fs.add(p,mode=448)),zero_reads=True)
fscheck('ancestor-replaced-after-open',edit=hook_for('synthetic','after-open',lambda f,fs,p,n:fs.add('/synthetic',mode=493)),zero_reads=True)
fscheck('manifest-same-fd-positive',action=manifest_read,accept=True)
for attr,value in [('uid',999),('mode',420),('ino',999),('dev',99)]:
 fscheck('original-C-manifest-stat-open-'+attr,action=manifest_read,edit=hook_for('private-input-manifest.json','before-open',lambda f,fs,p,n,k=attr,v=value:setattr(n,k,v)),zero_reads=True)
for alias_name,leaf in [('authorization','root-authorization.json'),('quinn_approval','quinn-approval.json')]:
 fscheck('release-'+alias_name+'-same-fd-owner',action=lambda r,f,fs,p,a=alias_name:r.read_public(a),edit=hook_for(leaf,'before-open',lambda f,fs,p,n:setattr(n,'uid',999)),zero_reads=True)
fscheck('release-parent-mode-refuses-before-content',action=manifest_read,edit=lambda f,fs,p:setattr(fs.locate(D/'release'),'mode',493),zero_reads=True)
fscheck('manifest-leaf-symlink-refuses-before-content',action=manifest_read,edit=lambda f,fs,p:fs.add(D/'release/private-input-manifest.json','link',target='/synthetic/private'),zero_reads=True)
for attr,value in [('uid',999),('mode',420),('ino',999),('dev',99)]:
 fscheck('xml-opened-'+attr+'-binding-before-content',action=lambda r,f,fs,p:r.read_default_xml(permit,next(x for x in f.manifest['files'] if x['role']=='default_xml')),edit=hook_for('TEST-'+P.FQCN+'.xml','before-open',lambda f,fs,p,n,k=attr,v=value:setattr(n,k,v)),zero_reads=True)
def leaf_swap(f,fs,p):
 name=next(x['path'] for x in f.manifest['files'] if x['role']=='snapshot_initial18')
 fs.hook=lambda model,op,leaf,n:model.add(p+'/'+name,'file',mode=384,data=n.data) if op=='read' and leaf==name else None
fscheck('input-leaf-swap-during-read-is-incomplete',edit=leaf_swap)
fscheck('output-relative-retained-fd-positive',action=output,accept=True)
fscheck('short-write-loop-completes',action=output,edit=lambda f,fs,p:setattr(fs,'chunk',13),accept=True)
fscheck('zero-write-refuses-success',action=output,edit=lambda f,fs,p:setattr(fs,'zero_write',True))
def swap_before(reader,f,fs,p):reader.claim_output(permit);fs.add(D/'released-projection-01',mode=448);reader.write_output(f.run())
fscheck('original-B-output-parent-swap-before-write',action=swap_before,zero_writes=True)
def ancestor_output(reader,f,fs,p):reader.claim_output(permit);fs.add(D,mode=493);reader.write_output(f.run())
fscheck('output-package-ancestor-swap-before-write',action=ancestor_output,zero_writes=True)
fscheck('output-parent-swap-at-leaf-open-no-alternate-write',action=output,edit=hook_for('projection.json','before-open',lambda f,fs,p,n:fs.add(D/'released-projection-01',mode=448)),zero_writes=True)
fscheck('output-parent-swap-during-write-no-alternate-write',action=output,edit=hook_for('projection.json','after-write',lambda f,fs,p,n:fs.add(D/'released-projection-01',mode=448)))
fscheck('output-leaf-swap-after-open-before-write',action=output,edit=hook_for('projection.json','after-open',lambda f,fs,p,n:fs.add(D/'released-projection-01/projection.json','file',mode=384)),zero_writes=True)
for attr,value in [('uid',999),('mode',420)]:
 fscheck('output-opened-'+attr+'-refused',action=output,edit=hook_for('projection.json','after-open',lambda f,fs,p,n,k=attr,v=value:setattr(n,k,v)),zero_writes=True)
def os_failure(f,fs,p,operation,kind=None):
 def hook(model,op,leaf,node):
  if op==operation and (kind is None or node.kind==kind):raise OSError('synthetic private marker must never export')
 fs.hook=hook
for operation in ['before-write','fsync']:
 fscheck('output-'+operation+'-failure-qualified',action=output,edit=lambda f,fs,p,op=operation:os_failure(f,fs,p,op))
for kind in ['file','dir']:
 fscheck('output-'+kind+'-close-failure-qualified',action=output,edit=lambda f,fs,p,k=kind:os_failure(f,fs,p,'close',k))
fscheck('input-close-failure-qualified',action=manifest_read,edit=lambda f,fs,p:os_failure(f,fs,p,'close','file'))
def raise_os(*args):raise OSError('synthetic private error text must not export')
fscheck('manifest-open-failure-qualified',action=manifest_read,edit=hook_for('private-input-manifest.json','before-open',raise_os),zero_reads=True)
fscheck('manifest-read-failure-qualified',action=manifest_read,edit=hook_for('private-input-manifest.json','read',raise_os))
fscheck('output-open-failure-qualified',action=output,edit=hook_for('projection.json','before-open',raise_os),zero_writes=True)
# Actual FD-relative complete pipeline controls: all release/grammar semantics have valid new IO fixtures.
fscheck('actual-fd-pipeline-ordinary-release-positive',action=pipeline,accept=True)
fscheck('actual-fd-pipeline-alias-release-positive',action=pipeline,alias='private/var',accept=True)
fscheck('actual-fd-pipeline-qualified-terminal-red-positive',action=pipeline,fixture_edit=lambda f:f.receipt.update(taskCollectionComplete=False,coveragePass=False,cohortPass=False,outerPass=False,observationGap=True),accept=True)
fscheck('actual-fd-pipeline-live-collector-zero-private',action=pipeline,fixture_edit=lambda f:f.terminal.update(collectorTerminal=False),no_private=True)
fscheck('actual-fd-pipeline-unknown-owner-zero-private',action=pipeline,fixture_edit=lambda f:f.terminal.update(ownedUnknownTerminal=False),no_private=True)
fscheck('actual-fd-pipeline-timeout-proof-zero-private',action=pipeline,fixture_edit=lambda f:f.terminal.update(terminalInferredFromTimeout=True),no_private=True)
fscheck('actual-fd-pipeline-valid-io-secret-field-rejected',action=pipeline,fixture_edit=lambda f:f.snapshot.update(message='SECRET_MARKER'))
report=dict(scope='INDEPENDENT_SOURCE_EXTRACTED_CORE_SYNTHETIC_ONLY',parserSha256=P.digest(source.encode()),semanticCalls=len(results),semanticAccepted=sum(x['accepted'] for x in results),semanticRejected=sum(not x['accepted'] for x in results),semanticResults=results,filesystemCalls=len(fs_results),filesystemAccepted=sum(x['accepted'] for x in fs_results),filesystemRejected=sum(not x['accepted'] for x in fs_results),filesystemResults=fs_results,extraJsonShapeRejections=4,authorWitnessLoopsExecuted=False,entrypointMainExecuted=False,actualPrivateEnumerationStatReadGlobCopyExport=0,actualOsIoInContracts=False,allModeledWritesUsedOriginalClaimedParent=True)
(O/'contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['semanticResults','filesystemResults']}))

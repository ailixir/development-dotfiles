SOURCE ONLY; no parser/syntax/guard/snapshot/binder/Docker/Node/browser/native/probe executed. Only these five preparation files are written. Original05/06 failures, old fixtures/packets/source/seals/QA remain immutable and NO_CREDIT. Underlying original active predicate staysUNKNOWN. No old leaf/log/media body was read; historical facts below use only root's already-sealed whole-known-public-summary hash assessment52caba.

Literal owner02 seal dc3c2724fbf0e7f79abba0aa2ce31a60058fa86757e42b02fc1e9ccfd0455803/7 binds fixtureb1d881b1d1a0669c83b1e630dbebd87b31bfa02b921b7a68dfeeb2d066dfb9a1 and schema9015f9683d7765e4dd207d07a9eaa6f32426de698491256024d2a395d49688bb. This is v2 only: missing core regex now records null/null; v1's unobserved false/false is not admitted. Removing diagnostic additions reconstructs original4a6inspection block; prepare/serve/auth suffix, all successful/failing predicates and original successful output lines remain exact. Shell ea56 and canonicalBash41e7/mode555 stay unchanged. The fixture is failure-only instrumentation, not a presumed predicate fix; source-QA and root acceptance must pin this exact v2/07 envelope dynamically before binding/runtime.

All original33product dependencies29same/4reviewed successors and9genuine image/deployment fields remain unchanged. SourceA1/1814/hostE19/238/BD83/fullSDK and deployment05 AFTERcache191everyvalue stay the baseline. Existing host/source/cache/image/physical/resource guards are unchanged, with only exact diagnostic owner/fixture/schema/QA admission added. New literal paths: execution07/bound05/unused label03/prefix03/output07. All earlier root dependency acceptances remain historical; new acceptance must cover v2/schema/QA/envelope in addition to existing product/Bash facts. No old-source hash union/exemption is added.

Projector delta is strictly failure-only. Active/after leaves are decoded once for event dispatch. Only source-declared D2_INSPECTION_FAILED with EXACT five top keys, correct mode, closed stage/reason enums and EXACT12 fact keys is recognized. Seven count fields are integer|null within0..9007199254740991, with Pythonbool excluded; five flag fields are bool|null. None staysNone; no missing field/value is synthesized, no default0/false, no freeform message/path/PID/key/auth/media is accepted. The one pinned schema supplies exact finite enums/types/bounds; this is not a general schema framework.

Validated failure is stored under inspectionFailureDiagnostics with missingSuccessObligation D2_ACTIVE or D2_AFTER. The corresponding success fact remains MISSING and projectionCompletefalse. It never populates the success slot. Existing successful key/enum/primitive predicates remain exact in meaning and the UID line remains byte-exact. Unknown/malformed fields or unlisted events still stop. The schema-declared reasonUNKNOWN is valid failure metadata, never success. Negative/drain/cleanup/image/event typed facts continue to be collected; incremental closed snapshots are written after each validated portion so a later malformed leaf cannot erase earlier typed facts. Incomplete attempts remain projectionCompletefalse. The native invocation/wait/raw0/source/timestamp/callback/result/cleanup acceptance and finally tail are BYTE-EXACT06; no failure-as-success path exists. The same original case/scenarios/order/90polls/30s/auth/grace/oracles are not changed.

New bounded four-payload binder source SHAa1f4d50e89ae715e1daf018c6684b551479d3e73289ec701157f4e4ca26f6963 is explicit and not claimed unchanged. It uses the SAMEea56script, exact newv2fixture, preserved originalNULLbindings and old command as data source; creates only newbound05 after exact provenance/rootfacts/QA checks. It adds inspectionDiagnosticSuccessor to the new binding/command/manifest, with owner/fixture/schema/QA and historical4a6 provenance; no old packet is rewritten. The inverse stays pre-runtime-only/exact-new-packet-only and separately root-authorized. Neither runs now.

Root must supply dynamic accepted inspection-QA path/SHA+acceptedtrue, new rootdependency reference covering diagnostic, ownerdc3/fixtureb1d/schema9015 fields, accepted07factsSHA, bound05manifestSHA and prepmanifestSHA in a NEW explicit sole-heavy runtime admission. Binding then runtime remain separate root releases. Original06 metadata-only assessment52caba establishes both expected public negative summaries and cleanup1/resources0 by exact COMPLETE known-byte hash equality, with zero raw reads; it does not repair absent original projection/QA, prove the active predicate or grant D2/backend credit.

Future execution remains one separately released instrumented invocation of the same required case, not a new scenario or automatic retry. The fixture reuses existing observations for diagnostic counts/flags and adds no source/product policy/timer/threshold change. Opaque raw/auth/media/log/IDs remain hashes; only declared closed fields may be exported. Inhibitor/owned waits and postguards remain as before. No unit/deployment repeat or new matrix/framework is proposed. All3 stories remainInProgress, cap/cutoff/functional scope/privacy/USD500unknown constraints unchanged.

Exact driver delta (source text only; unparsed/unexecuted here):

```diff
--- sealed06/run-d2.py
+++ prospective07/run-d2.py
@@ -6,8 +6,8 @@
 R=Path(__file__).resolve().parents[6]
 P=Path(__file__).resolve().parent
 B=P.parent
-O=B/'final-d2-execution06'
-PACKET=B/'linux-image-smoke-final-bound04'
+O=B/'final-d2-execution07'
+PACKET=B/'linux-image-smoke-final-bound05'
 E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
 def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
 def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
@@ -46,8 +46,18 @@
 sourceQa=admission['sourceCorrectionQa'];checked_ref(sourceQa)
 shell=correction['canonicalShell'];assert admission['canonicalShell']==shell
 checked_ref(binding['historicalFailed05']['producerManifest']);checked_ref(binding['historicalFailed05']['receipt'])
+inspection=binding['inspectionDiagnostic']
+inspectionOwner=checked_ref(inspection['ownerManifest'])
+assert admission['inspectionDiagnosticOwnerSha256']==inspection['ownerManifest']['sha256']=='dc3c2724fbf0e7f79abba0aa2ce31a60058fa86757e42b02fc1e9ccfd0455803'
+for row in json.loads(inspectionOwner.read_text())['artifacts']:checked_ref(row)
+checked_ref(inspection['fixture']);schemaPath=checked_ref(inspection['schema'])
+assert admission['inspectionDiagnosticFixtureSha256']==inspection['fixture']['sha256']=='b1d881b1d1a0669c83b1e630dbebd87b31bfa02b921b7a68dfeeb2d066dfb9a1'
+assert admission['inspectionDiagnosticSchemaSha256']==inspection['schema']['sha256']=='9015f9683d7765e4dd207d07a9eaa6f32426de698491256024d2a395d49688bb'
+assert admission['inspectionDiagnosticQaAccepted'] is True and admission['rootDependencyIncludesInspectionDiagnostic'] is True
+inspectionQa=admission['inspectionDiagnosticQa'];checked_ref(inspectionQa);inspectionSchema=json.loads(schemaPath.read_text())
+checked_ref(binding['historicalFailed06']['manifest']);checked_ref(binding['historicalFailed06']['receipt']);checked_ref(binding['historicalFailed06']['hashOnlyAssessment'])
 dep=admission['dependencyReview'];checked_ref(dep)
-assert dep['sha256']!='855a7ff18815776de5afb3ddcf09293f74cbdcb8ad1bba551f30421bbf2e29e0'
+assert dep['sha256'] not in ['855a7ff18815776de5afb3ddcf09293f74cbdcb8ad1bba551f30421bbf2e29e0','c33f3c59eb1b4fe6f2e1c4d6231be693ea5852b65b6c1a6edf51fc98ec4e8273']
 reviewRef=dep['reference'];assert isinstance(reviewRef,str) and reviewRef and not any(s in reviewRef for s in ['PENDING','UNBOUND','<','>'])
 factsPath=O/'accepted-final-measured-bindings.json'
 assert factsPath.is_file() and not factsPath.is_symlink() and sha(factsPath)==admission['acceptedFactsSha256']
@@ -55,6 +65,7 @@
 assert facts['acceptedFinalDependencyReviewReference']==reviewRef
 assert facts['sourceCorrectionManifestSha256']==correction['ownerManifest']['sha256'] and facts['sourceCorrectionQa']==sourceQa and facts['sourceCorrectionQaAccepted'] is True and facts['canonicalShell']==shell
 assert all(facts['rootDependencyAcceptance'][k]==dep[k] for k in ['path','sha256'])
+assert facts['inspectionDiagnosticOwnerSha256']==inspection['ownerManifest']['sha256'] and facts['inspectionDiagnosticFixtureSha256']==inspection['fixture']['sha256'] and facts['inspectionDiagnosticSchemaSha256']==inspection['schema']['sha256'] and facts['inspectionDiagnosticQa']==inspectionQa and facts['inspectionDiagnosticQaAccepted'] is True
 assert values['acceptedSourceDigest']==admission['expectedSourceDigest']=='a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
 assert values['acceptedDistDigest']==admission['expectedDistDigest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
 ID=values['measuredImmutableImageId'];assert ID==admission['expectedImageId']=='sha256:bd83d49256b5be0d2c8dc60b26ec92bef0bcf063eaa0a49de3d0db1fd154e753'
@@ -62,7 +73,7 @@
 for row in json.loads((PACKET/'manifest.json').read_text())['files']:
  p=PACKET/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256']
 assert sha(PACKET/'future-smoke.sh')=='ea56c0ef2c45b4107a726b3c26cfd5cb35a96e51d18820da5d28463f6a414455'
-assert sha(PACKET/'fixture.mjs')=='4a6c8474c7c609c25b3c40ea3116094eb9e504d5b3da35f66fe730fdf9f89f91'
+assert sha(PACKET/'fixture.mjs')=='b1d881b1d1a0669c83b1e630dbebd87b31bfa02b921b7a68dfeeb2d066dfb9a1'
 packetBinding=json.loads((PACKET/'bindings.json').read_text())
 assert packetBinding['finalBindings']==values and packetBinding['finalDependencySuccessor']['acceptedReviewReference']==reviewRef
 assert packetBinding['finalDependencySuccessor']['measuredFactsSha256']==sha(factsPath)
@@ -70,10 +81,12 @@
 assert packetBinding['sourceCorrectionSuccessor']==expectedCorrection
 assert json.loads((PACKET/'manifest.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
 assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
+expectedInspection={'ownerManifestSha256':inspection['ownerManifest']['sha256'],'fixtureSha256':inspection['fixture']['sha256'],'schemaSha256':inspection['schema']['sha256'],'sourceQa':inspectionQa,'historicalFixtureSha256':'4a6c8474c7c609c25b3c40ea3116094eb9e504d5b3da35f66fe730fdf9f89f91','failureOnly':True}
+assert packetBinding['inspectionDiagnosticSuccessor']==expectedInspection and json.loads((PACKET/'manifest.json').read_text())['inspectionDiagnosticSuccessor']==expectedInspection and json.loads((PACKET/'future-command-and-bindings.json').read_text())['inspectionDiagnosticSuccessor']==expectedInspection
 argv=commands['runtime']['argv'];assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['argv']==argv
 label=commands['expectedLabel'];prefix=commands['resourcePrefix'];out=O/'d2-execution01'
-assert label==admission['collectorLabel']=='obs011-recovery-20261020-final-linux-d2-smoke02'
-assert prefix==admission['resourcePrefix']=='obs011-d2-final-02' and str(out)==admission['outputDirectory']
+assert label==admission['collectorLabel']=='obs011-recovery-20261020-final-linux-d2-smoke03'
+assert prefix==admission['resourcePrefix']=='obs011-d2-final-03' and str(out)==admission['outputDirectory']
 assert argv==['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py'),label,'/bin/bash',str(PACKET/'future-smoke.sh'),ID,prefix,str(out)]
 assert sha(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py')=='edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f'
 assert not out.exists() and not (O/'driver-start.json').exists() and not any(E.glob(label+'*'))
@@ -164,23 +177,43 @@
   if 'reason' in v:assert v['reason'] in ['CONTEXT_LOST']
   rows.append(v)
  return rows
+def inspection_failure(v,expectedMode):
+ # This one pinned source schema only; no generic schema engine or defaults.
+ assert type(v) is dict and set(v)=={'event','mode','stage','reason','facts'}
+ properties=inspectionSchema['properties']
+ assert v['event']=='D2_INSPECTION_FAILED' and v['mode']==expectedMode and v['mode'] in properties['mode']['enum']
+ assert v['stage'] in properties['stage']['enum'] and v['reason'] in properties['reason']['enum']
+ facts=v['facts'];spec=properties['facts'];assert type(facts) is dict and set(facts)==set(spec['required'])==set(spec['properties'])
+ for name,value in facts.items():
+  allowed=spec['properties'][name]
+  if value is None:assert 'null' in allowed['type'];continue
+  if 'integer' in allowed['type']:assert type(value) is int and allowed['minimum']<=value<=allowed['maximum']
+  else:assert 'boolean' in allowed['type'] and type(value) is bool
+ return v
 def project_outputs():
  assert out.is_dir() and not out.is_symlink();inventory=[]
  for p in sorted(out.iterdir()):
   assert p.name in DECLARED;data=stable_bytes(p);inventory.append({'name':p.name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
- write('output-custody.json',inventory);closed={};missing=[]
+ write('output-custody.json',inventory);closed={};missing=[];inspectionFailures=[]
+ def persist(attemptComplete=False):
+  result={'closedFacts':closed,'missingSourceDeclaredFacts':missing,'projectionComplete':attemptComplete and not missing and not inspectionFailures,'projectionAttemptComplete':attemptComplete,'inspectionFailureDiagnostics':inspectionFailures,'opaqueIdsOnlyHashed':True,'privateNativeAuthPayloadsLogsMediaDecoded':False};write('closed-projection.json',result);return result
+ persist()
  for name in ['noinit.json','debug.json']:
-  if not (out/name).exists():missing.append(name);continue
+  if not (out/name).exists():missing.append(name);persist();continue
   v=obj(name,['exit','missedRefusalDeadline','pollBoundSeconds'],['exactExpectedRefusal','runnerStarted']);assert v['exit'] is None or type(v['exit']) is int;assert type(v['missedRefusalDeadline']) is bool;count(v['pollBoundSeconds'])
   for k in ['exactExpectedRefusal','runnerStarted']:
    if k in v:assert type(v[k]) is bool
-  closed[name]=v
+  closed[name]=v;persist()
  if (out/'active.json').exists():
-  fields=['event','observedAtMs','liveOwnedBrowserLeaders','linux','nodePid','journals','nonemptyJournals','owners','activeRecordingDirectories','recordingDirectoryHandles','tlsMode','tlsGid','readonlyRefusals','coreSoft','coreHard'];v=obj('active.json',fields);assert v['event']=='D2_ACTIVE' and type(v['linux']) is bool and v['tlsMode']=='0440'
-  for k in fields:
-   if k not in ['event','linux','tlsMode']:number(v[k])
-  pid=v.pop('nodePid');count(pid);v['nodeMainPidGreaterThanOne']=pid>1;closed['active.json']=v
- else:missing.append('active.json')
+  fields=['event','observedAtMs','liveOwnedBrowserLeaders','linux','nodePid','journals','nonemptyJournals','owners','activeRecordingDirectories','recordingDirectoryHandles','tlsMode','tlsGid','readonlyRefusals','coreSoft','coreHard'];v=json.loads(stable_bytes(out/'active.json'))
+  if type(v) is dict and v.get('event')=='D2_INSPECTION_FAILED':
+   inspectionFailures.append({'missingSuccessObligation':'D2_ACTIVE','diagnostic':inspection_failure(v,'inspect')});missing.append('active.json');persist()
+  else:
+   assert type(v) is dict and set(fields)<=set(v)<=set(fields);assert v['event']=='D2_ACTIVE' and type(v['linux']) is bool and v['tlsMode']=='0440'
+   for k in fields:
+    if k not in ['event','linux','tlsMode']:number(v[k])
+   pid=v.pop('nodePid');count(pid);v['nodeMainPidGreaterThanOne']=pid>1;closed['active.json']=v;persist()
+ else:missing.append('active.json');persist()
  if (out/'drain.json').exists():
   fields=['events','stopSeconds','exit','activeObservedAtMs','liveOwnedBrowserLeaders','lifecycleReceivedAtMs','lifecycleReason','recordingReceivedAtMs','settlementAfterActualDraining'];v=obj('drain.json',fields);assert type(v['events']) is list and v['lifecycleReason']=='CONTEXT_LOST' and type(v['settlementAfterActualDraining']) is bool
   for event in v['events']:
@@ -188,25 +221,32 @@
    if 'guidedClosed' in event:assert type(event['guidedClosed']) is bool
   for k in fields:
    if k not in ['events','lifecycleReason','settlementAfterActualDraining']:number(v[k])
-  closed['drain.json']=v
- else:missing.append('drain.json')
+  closed['drain.json']=v;persist()
+ else:missing.append('drain.json');persist()
  for name,fields in [('after.json',['event','activeRecordingDirectories']),('result.json',['allSevenD2StepsObserved','productionCredit','retryCount']),('cleanup.json',['commandExit','ownedResourcesRemaining'])]:
-  if not (out/name).exists():missing.append(name);continue
-  v=obj(name,fields)
+  if not (out/name).exists():missing.append(name);persist();continue
+  if name=='after.json':
+   v=json.loads(stable_bytes(out/name))
+   if type(v) is dict and v.get('event')=='D2_INSPECTION_FAILED':
+    inspectionFailures.append({'missingSuccessObligation':'D2_AFTER','diagnostic':inspection_failure(v,'inspect-after')});missing.append(name);persist();continue
+   assert type(v) is dict and set(fields)<=set(v)<=set(fields)
+  else:v=obj(name,fields)
   if name=='after.json':assert v['event']=='D2_AFTER';count(v['activeRecordingDirectories'])
   elif name=='result.json':assert type(v['allSevenD2StepsObserved']) is bool and type(v['productionCredit']) is bool;count(v['retryCount'])
   else:assert type(v['commandExit']) is int;count(v['ownedResourcesRemaining'])
-  closed[name]=v
+  closed[name]=v;persist()
  for name in ['pre-stop-fixture-events.jsonl','fixture-events.jsonl']:
   if (out/name).exists():closed[name]=fixture_events(name)
   else:missing.append(name)
+  persist()
  for name in ['image-before.txt','image-after.txt']:
   if (out/name).exists():
    v=obj(name,['Id','Os','Cmd','Entrypoint','User']);assert v=={'Id':ID,'Os':'linux','Cmd':['sh','-c','ulimit -c 0 && exec node dist/main.js'],'Entrypoint':None,'User':'pwuser'};closed[name]=v
   else:missing.append(name)
+  persist()
  if (out/'pwuser.txt').exists():closed['pwuserUidGid1001']=bool(re.match(rb'^uid=1001\(pwuser\) gid=1001\(pwuser\)',stable_bytes(out/'pwuser.txt')))
  else:missing.append('pwuser.txt')
- result={'closedFacts':closed,'missingSourceDeclaredFacts':missing,'projectionComplete':not missing,'opaqueIdsOnlyHashed':True,'privateNativeAuthPayloadsLogsMediaDecoded':False};write('closed-projection.json',result);return result
+ return persist(True)
 
 assert subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='v24.20.0'
 assert subprocess.run(['pnpm','--config.package-manager-strict=false','--version'],env=env,capture_output=True,text=True,check=True).stdout.strip()=='10.33.0'
```

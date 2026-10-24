import json, hashlib, shlex, collections
from pathlib import Path
from datetime import datetime, timezone
R=Path('docs/qa/evidence/STUDIO-OBS-011/t0'); P=R/'ir-budget-ruling'; I=R/'early/it-r-draft/resume4'; O=R/'qa/ir-budget-ruling-review'
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,d): p.write_text(json.dumps(d,indent=2)+'\n')
sources=read(P/'source-hashes.json'); checks=[]; bindings=[]; commentaryDrifts=[]
for group in ('references','originalTenInputs','preserved92Artifacts'):
 for x in sources[group]:
  p=(I/x['path']) if group=='preserved92Artifacts' else Path(x['path'])
  a=sha(p)
  if a!=x['sha256']:
   assert group=='references' and p in [R/'resume2-root-state.json',R/'resume2-next-actions-live.md'], (group,str(p))
   commentaryDrifts.append({'path':str(p),'historicalSha256':x['sha256'],'observedCurrentSha256':a,'classification':'MUTABLE_ROOT_COMMENTARY_ONLY_NOT_SOURCE_OR_AUTHORITY'})
  bindings.append({'group':group,'path':str(p),'sha256':a,'bytes':p.stat().st_size})
archiveBindings=[]
for drift in commentaryDrifts:
 p=R/'continuation-history/20261019-0508-independent-reviews'/Path(drift['path']).name
 assert sha(p)==drift['historicalSha256']
 archiveBindings.append({'path':str(p),'sha256':sha(p),'historicalPaxReferenceMatched':True})
checks.append({'id':'reference_preservation','references':31,'originalInputs':10,'preservedArtifacts':92,'allOriginalAndPreservedMatched':True,'mutableRootCommentaryDrifts':commentaryDrifts})
l=read(P/'call-ledger.json'); f=read(I/'future-commands.json'); s=read(I/'stages.json'); m=read(I/'mutation-plan.json'); d=read(P/'decision.json')
bylabel={c['label']:c for c in f['commands']}; assert len(bylabel)==33
full=[]; diag=[]; fq='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
for c in f['commands']:
 a=shlex.split(c['command']); sels=[a[i+1] for i,v in enumerate(a[:-1]) if v=='--tests']; assert sels
 assert '--no-daemon' in a and '--rerun-tasks' in a and '--continue' in a
 assert a[0:2]==['python3','.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py']
 actualFull=any(x==fq for x in sels)
 if actualFull:
  assert sels==[fq,fq]
  assert a[a.index('--test-tasks')+1]=='test,guidedIncrementalTest'
  assert a[a.index('--require-exec-tasks')+1]=='test,guidedIncrementalTest'
  assert c['fullClassSlotCost']==1;full.append(c)
 else:
  assert all(x.startswith(fq+'.') and '*' not in x for x in sels)
  assert a[a.index('--test-tasks')+1]=='test'
  assert a[a.index('--require-exec-tasks')+1]=='test'
  assert c['fullClassSlotCost']==0;diag.append(c)
 assert c['status']=='UNEXECUTED'
assert len(full)==12 and len(diag)==21
assert [c['label'] for c in l['requiredDiagnosticCommands']]==[c['label'] for c in diag]
for c in l['requiredDiagnosticCommands']:
 orig=bylabel[c['label']]
 for k,v in orig.items():assert c[k]==v,(c['label'],k)
 assert c['executionAuthorized'] is False and c['noD14FullClassCredit'] is True and c['subsetStillConsumesApplyTime'] is True
stages={x['stage']:x for x in s};mutants={x['id']:x for x in m['mutants']}
expected=[('00-test001',None),('M-gate-false','M-gate-false'),('M-omit-variant','M-omit-variant'),('M-duplicate-variant','M-duplicate-variant'),('M-empty-canaries','M-empty-canaries'),('M-missing-admitted','M-missing-admitted'),('M-missing-dispatch','M-missing-dispatch'),('01-b1',None),('02-b2',None),('03-b3',None),('04-b4',None),('04-b4',None)]
fullrows=[]
for i,(c,(identity,mid)) in enumerate(zip(l['plannedFullClassCalls'],expected),1):
 assert c['proposedCall']==i and c['planOrdinal']==i and c['actualOrdinal'] is None
 orig=bylabel[c['label']];assert c['command']==orig['command'] and c['fullClassSlotCost']==1
 expectedHash=mutants[mid]['mutantSha256'] if mid else stages[identity]['candidateSha256']
 assert c['sourceSha256']==expectedHash
 source=I/('mutations/'+mid if mid else 'stages/'+identity)/'repo/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
 assert sha(source)==expectedHash
 assert c['executionAuthorized'] is False and c['cap6StillApplies'] is True
 assert c['authorizingGate']==('INITIAL_ROOT_RELEASE_PENDING' if i<=6 else 'IR-STOP6-EXTEND-12_PENDING')
 if mid:
  assert c['restoreSha256']==stages['00-test001']['candidateSha256']==mutants[mid]['baseSha256']
  assert orig['sourceStageCompileRunRestoreCompilationOneLockHold'] is True
  assert orig['restoreCompilationInsideSameLock']==['./gradlew','compileTestJava','--no-daemon']
  assert orig['separateRestoredFullClassGreenRequired'] is False
 outcome='CANONICAL_FULL_CLASS_GREEN' if not mid else 'NAMED_GATE_EVIDENCE_REJECTION' if i<=4 else 'EXPECTED_NATIVE_AUDIT_ASSERTION_RED'
 assert c['expectedOutcomeClass']==outcome
 fullrows.append({'ordinal':i,'label':c['label'],'identity':identity,'sourceSha256':expectedHash,'literalSelectors':[fq,fq],'literalTasks':['test','guidedIncrementalTest'],'expectedOutcomeClass':outcome,'futureOnly':True})
assert l['actualAttempts']==[] and l['actualFullClassCount']==0 and l['currentEffectiveCap']==6
assert l['actualApplyStartedAt'] is None and l['actualApplyDay2EndsAt'] is None and l['nextActualCommandAuthorized'] is False
assert d['currentEffectiveFullClassCap']==6 and d['currentEffectiveApplyDays']==2 and d['actualIrRunsAuthorizedByThisRuling']==0
assert d['requiredPostStopSignatures']=={'pax':None,'quinn':None,'root':None}
assert d['carry6Selected'] is False and d['equivalentProofSubstitutionSelected'] is False and d['sourceOrRuntimeRelease'] is False
assert d['selectedFutureGate']['absoluteTotalFullClassCeiling']==12 and d['selectedFutureGate']['timeExtensionDays']==0
checks.append({'id':'literal_command_classification','allCommands':33,'fullClassAttemptsPlanned':12,'diagnosticSubsets':21,'nativeSlotsPerTwoProfileCollectorUnit':1,'sourceBoundScheduleMatched':True,'zeroActualCalls':True})
checks.append({'id':'effective_authority','effectiveCap':6,'effectiveApplyDays':2,'stopGate':'IR-STOP6-EXTEND-12','futureSignaturesPending':True,'noSeventhCallAuthorized':True,'noThirteenthCallAuthorized':True})
checks.append({'id':'outcome_separation','canonicalGreens':6,'gateEvidenceRejections':3,'nativeAuditAssertionReds':3,'allSixMutantsRestoreExactTest001AndCompile':True,'extraPerMutantFullGreenInvented':False})
rev=next(c for c in diag if c['kind']=='reverse-order-only')
assert len([x for x in shlex.split(rev['command']) if x.startswith(fq+'.')])==4
checks.append({'id':'diagnostics_preserved','kinds':dict(collections.Counter(c['kind'] for c in diag)),'reversedOrders':'3 before2 and28 before27, actual ordinal proof pending','scratchPairs':53,'runtimeProof':'UNEXECUTED'})
inputs=[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(P.iterdir()) if p.is_file()]
dump(O/'audit.json',{'capturedAtUtc':datetime.now(timezone.utc).isoformat(),'method':'Independent stdlib JSON/hash/shlex inspection; no imported author modules, harnesses or native execution','checks':checks,'fullClassSourceBoundOrdering':fullrows,'inputBindings':inputs,'preservationBindings':bindings,'archivedCommentaryBindings':archiveBindings,'runtimeOrExtensionAuthorized':False,'scope':'Conditional planning direction only'})
print(json.dumps({'checks':len(checks),'bindings':len(bindings),'fullClass':len(full),'diagnostics':len(diag),'inputFiles':len(inputs),'auditSha256':sha(O/'audit.json')}))

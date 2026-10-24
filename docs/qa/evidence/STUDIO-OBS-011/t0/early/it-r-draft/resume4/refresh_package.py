"""Only resume3 checker/package metadata. Supported source/patch/map/scratch bytes are never rewritten."""
from pathlib import Path
import json,hashlib,datetime,shutil
OUT=Path(__file__).resolve().parent;OLD=OUT.parent/'resume2';ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
write=lambda name,obj:(OUT/name).write_text(json.dumps(obj,indent=2)+'\n')
manifest=json.loads((OLD/'manifest.json').read_text());support=[]
protected={'sleep-table.tsv','row-classification-proof-map.json','interrupt-timeout-map.json','interruption-crosscheck.json','source-preservation-map.json','loop-sites.json','poll-edits.json','poll-capture-review.json','protected-registry-map.json','boundary-mutation-source-map.json','stages.json','expected-cases.json','input-hashes.json','input-refresh-policy.json','test001_helpers.java.txt'}
for row in manifest['artifacts']:
 name=row['path']
 if name.endswith(('.java','.patch','.block.java.txt')) or name in protected or name.startswith('scratch/') and Path(name).name in ['source-bindings.json','edge-proof-plan.json','classpath-manifest.json','classpath.txt']:
  assert (OUT/name).read_bytes()==(OLD/name).read_bytes();support.append(dict(path=name,sha256=row['sha256']))
write('resume3-preservation.json',dict(inheritedResume2ManifestSha256=sha((OLD/'manifest.json').read_bytes()),supportedArtifactsByteExact=support,
 protectedSourceCount=sum(r['path'].endswith('.java') for r in support),protectedPatchCount=sum(r['path'].endswith('.patch') for r in support),
 original10InputHistoryUnchanged=True,waitsAndOraclesChanged=False,scratch53PairsChanged=False,sourceBindingReanchor=False))
# Preserve previous receipts as explicitly historical, separate from current active receipt.
history=OUT/'history';history.mkdir(exist_ok=True)
for name in ['receipt.md','receipt.json']:shutil.copyfile(OLD/name,history/('resume2-'+name))
commands=json.loads((OLD/'future-commands.json').read_text())
for row in commands['commands']:
 for key in ['label','command','verifier']:
  if key in row:row[key]=row[key].replace('obs011-itr-r2-','obs011-itr-r3-').replace('/it-r-draft/resume2/','/it-r-draft/resume3/')
 row['requires']='Root writer/source-order/native-baseline gates; named PO/QA cap/proof ruling; no launch authorized here.'
 if 'full-class' in row['kind']:
  row['fullClassSlotCost']=1
  prefix='python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py '
  assert row['command'].startswith(prefix);row['nativeCommandInsideHeldWriterLock']=row['command'][len(prefix):]
  row['sourceStageCompileRunRestoreCompilationOneLockHold']=True
  if row['kind']=='full-class-mutation':
   row['restoreCandidateSha256']='e10c162d057c87a906a32e162614d29f3f4ba5a0e7000c52e9f77e46b0cdd616'
   row['restoreCompilationInsideSameLock']=['./gradlew','compileTestJava','--no-daemon']
   row['separateRestoredFullClassGreenRequired']=False
 else:row['fullClassSlotCost']=0;row['subsetStillConsumesApplyTime']=True;row['noD14FullClassCredit']=True
commands['status']='PREPARATION_ONLY_UNRESOLVED_CAP6_NO_LAUNCH'
full=[r for r in commands['commands'] if 'full-class' in r['kind']];canonical=[r for r in full if r['kind']=='full-class-budgeted'];mutants=[r for r in full if r['kind']=='full-class-mutation']
ordered=[canonical[0]]+mutants+canonical[1:]
assert len(ordered)==12 and len(mutants)==6
commands['fullClassSourceBoundOrdering']=[dict(proposedCall=i+1,label=r['label'],kind=r['kind'],sourceSha256=r.get('mutantSha256',r.get('candidateSha256')),restoreSha256=r.get('restoreCandidateSha256'),executionAuthorized=False,cap6StillApplies=True) for i,r in enumerate(ordered)]
write('future-commands.json',commands)
budget=json.loads((OLD/'budget-proof-conflict.json').read_text());budget.update(sourceBoundOrdering=commands['fullClassSourceBoundOrdering'],
 exactOrdering='T1G →6T1-based fullclassfault/control calls, each exact e10c restore+compile →B1/B2/B3 green →B4/B4 consecutive identical green',
 noPerMutantRestoredFullClassGreenInvented=True,diagnosticSubsetKinds=['force-gate-subset-negative','audit-content-negative-subset','old-red','independence-only','reverse-order-only'],
 subsetCost='0 FULL-CLASS slots; consumes two-day apply time; no D14 credit. No subset/proof/case omitted.',
 stop='Actual full-class counter includes every full-class mutation/error/interruption; stop at6 and obtain named PO/QA/root ruling. No authorized seventh run or automatic extension.',
 authorizedActualIrRuns=0)
write('budget-proof-conflict.json',budget)
# Only active future path references change; scratch Java/extracts/53-pair bindings stay exact.
scratch=json.loads((OLD/'scratch/future-commands.json').read_text())
scratch['commands']=[x.replace('/it-r-draft/resume2/','/it-r-draft/resume3/').replace('obs011-itr-r2-','obs011-itr-r3-') for x in scratch['commands']]
write('scratch/future-commands.json',scratch)
assignment={}
for name in ['itr-two-checker-fixes-intent.txt','itr-two-checker-fixes-context.txt','itr-two-checker-fixes-preflight.json']:
 path=Path('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011')/name;assignment[str(path)]=sha((ROOT/path).read_bytes())
review=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume2-review')
for name in ['review.md','audit.py','audit.json','path-witnesses.py','path-witnesses.json']:assignment[str(review/name)]=sha((ROOT/review/name).read_bytes())
write('assignment-inputs.json',dict(authority='Exact saved develop011InProgress-safe assignment, final Quinn review+independent audit',inputs=assignment,
 reviewSha256='f473ec7aa455d05cbdb473dc465d8f6741baffc2661603e5f43a8bcf508bb505',original10Manifest='input-hashes.json (unchanged history)',
 explicitFa90Refresh='input-refresh-policy.json (unchanged reviewed change)',additionalCollectorProvenance='checker-input-provenance.json; existing root plan pins, no helper change'))
# Source-derived profile/failure contracts from the actual corrected checker, not a model substitute.
import importlib.util
spec=importlib.util.spec_from_file_location('itr_current_checker_contract',OUT/'verify_mutation_run.py');checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
wanted=json.loads((OUT/'expected-cases.json').read_text());profiles=checker.profile_contract(wanted)
profile_map={task:dict(caseCount=p['caseCount'],singletons=sum(r['variant']=='singleton' for r in p['selected']),variants=sum(r['variant']!='singleton' for r in p['selected']),
 expectedOrder39BodyCalls=p['bodyChecks'],healthyFinalControls=2,healthyTotalCorpusChecks=p['bodyChecks']+2,
 vacuityFaultBeforeBoundaryCounters=dict(OWNED_SINKS={'body':p['bodyChecks'],'final':0},CONTEXT_CLOSED={'body':p['bodyChecks'],'final':0}),
 actualDefaultOrder39Provenance='Exact task-qualified PASS XML and cohort passed/afterEachComplete singleton required only where source registry selects Order39.') for task,p in profiles.items()}
write('profile-proof-map.json',dict(sourceSha256=sha((OUT/'ReplayIT.original.java').read_bytes()),expectedCasesSha256=sha((OUT/'expected-cases.json').read_bytes()),profiles=profile_map,
 sourceInvariant='Original SINGLETON_METHODS contains Order39; INCREMENTAL_METHODS excludes it. No Java/source selection edit. Faults occur before final/total corpus counter increments.',
 forcedTrueSubset=dict(task='test',actualCases=1,expectedFullCases=46,bodyCalls=0,finalCounter=0,genuineMultiplicityComplete=False)))
failure_contracts=[]
for mutation in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
 source=(OUT/'mutations'/mutation/'repo'/wanted['sourcePath']).read_text();failure_contracts.append(dict(mutation=mutation,sourceSha256=sha(source),**checker.failure_contract(source,mutation)))
write('failure-provenance-contract.json',dict(contracts=failure_contracts,
 shape='Exactly one executionError synthetic testcase per task. Exactly2 java.lang.AssertionError nodes: primary OWNED_SINKS, one suppressed CONTEXT_CLOSED. Both original assertion message prefixes/exact line+caller frames pinned; all other primary/suppressed/cause/setup/body/privacy/cleanup/retention failures reject.',
 sourceTrace='throwTeardownFailures rethrows first object and adds remaining objects suppressed; detachAuditCapture attempts stop then final boundary then retention. No source wrapper/type waiver inferred.',
 runtimeWireFormat='UNPROVED. Unknown actual framework/type/stack format is incomplete; named QA disposition required before any parser adaptation.',privateRawFailureExport=False))
source=(OUT/'ReplayIT.original.java').read_text()
traces=[]
for name,begin,end in [('finalOwnedIndependentAttempts','  private void scanFinalOwnedSinks(', '  private void scanFinalAuditBoundary('),('retentionLocalFailures','  private void retainFinalCohort(', '  public static final class OwnedContextCapture'),('twoBoundaryFailureAggregation','  @org.junit.jupiter.api.AfterAll\n  void detachAuditCapture()', '  static final GuidedContracts C =')]:
 a=source.index(begin);b=source.index(end,a);text=source[a:b];traces.append(dict(name=name,originalStartLine=source[:a].count('\n')+1,sha256=sha(text)))
write('unaffected-fact-source-trace.json',dict(originalSha256=sha(source),sourceTraces=traces,
 coupledOnly=['auditComplete=false (cohort and invocation privacy copies)','audit-final.json absent because final boundary throws before writer'],
 notWaived=['privacyComplete','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete','producersDrained','finalScansAttempted','zero retentionFailures','all actual body/afterEach passes','all final/after-each budget/response and privacy artifact joins'],
 contradiction='NONE_FOUND_STATICALLY: independent p3AttemptTeardown stages continue after audit fault; retentionFailures is local to retainFinalCohort. If actual allegedly unaffected fact fails, proof is rejected, not waived.',
 budgetMetadataScope='Original budget writer has ordinal/variantOrdinal/fixture ceiling/complete but no lane/method/class fields. Require exact path key containing task+ordinal+method+variant in same cohort folder plus those actual written fields; require response/privacy full identity fields. Actual phases are after-each and final, both required.',
 rawStatus='Keep collector exit/gradleExit nonzero, validationSucceeded=false and taskCollectionComplete=false for injected assertion faults. Only exact per-task audit-final missing errors allowed; any other gap rejects.'))
report=json.loads((OUT/'checker-contract-witnesses.json').read_text())
write('receipt.json',dict(atUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),role='Dex/aiox-dev/canonical dev',
 status='CHECKER_CORRECTIONS_PREPARED_INDEPENDENT_REVIEW_PENDING',reviewSha256='f473ec7aa455d05cbdb473dc465d8f6741baffc2661603e5f43a8bcf508bb505',
 ownedWriteScope=str(OUT.relative_to(ROOT)),sourceChange=False,allSupportedSourceAndProofBytes='resume3-preservation.json',
 fixes=['D5-R2-01 exact profile-derived default1/inc0 body provenance with unchanged46+62cases','D5-R2-02 unaffected semantic/retention/full-union/fresh-root-cohort/failure-tree checks, raw negative status preserved'],
 checkerSha256=sha((OUT/'verify_mutation_run.py').read_bytes()),pythonFakeContracts=dict(accepted=report['accepted'],rejected=report['rejected'],scope=report['scope'],nativeProof=False),
 sourceFacts=dict(completeCandidates=6,patchForms=34,censusRows=95,pollRows=74,deliberateSleeps=21,annotatedMethods=74,variants=35,originalAssertions=2686,textBlocks=10,unexecutedJavaScratchPairs=53),
 budget=dict(cap=6,requiredFullClassCalls=12,actualIrCalls=0,noNewBudgetOrCarry=True,sourceBoundOrdering='future-commands.json; no per-mutant restored full-class green added'),
 rootStatus='Parent fullcheck03 remains LIVE; parent reports actual Order11 native failure, terminal enum/cause not closed. No source/oracle/timer edit or native diagnosis authorized; root routes after terminal independently.',
 originalInputs='Original10 unchanged; explicit reviewed fa90 refresh unchanged; existing root plan collector pins supplemental only.',
 execution=dict(lightPythonOnly=True,javaCompilerProbeNative=False,gradleNodeBuildFormatterHelmDockerProviderSignalsGitSubagents=False),
 noQaW1LaneLifecycleCredit=True,sharedUsdCeiling=500,actualSpend='UNAVAILABLE'))
print(json.dumps({'preservedArtifacts':len(support),'sourceFiles':sum(r['path'].endswith('.java') for r in support),'patches':34,'pythonFakeAccept':report['accepted'],'pythonFakeReject':report['rejected'],'nativeExecution':False}))

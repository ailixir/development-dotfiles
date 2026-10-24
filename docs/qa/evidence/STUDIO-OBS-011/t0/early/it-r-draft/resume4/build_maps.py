"""Prepare correction maps and inert commands; no native tooling/runtime input capture."""
from pathlib import Path
import csv,json,hashlib,re,ast
OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
write=lambda n,d:(OUT/n).write_text(json.dumps(d,indent=2)+'\n')
loops=json.loads((OUT/'loop-sites.json').read_text()); edits=json.loads((OUT/'poll-edits.json').read_text())
rows=list(csv.DictReader((OUT/'sleep-table.tsv').open(),delimiter='\t'))
condition_first={1,2,3,5,9,10,11,14,15,17,23,29,31,32,33,42,43,47,49,67,69,74,79,93,94,95}
stages=json.loads((OUT/'stages.json').read_text())
final=(OUT/'stages/04-b4/repo/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java').read_text()
old=(OUT/'ReplayIT.original.java').read_text()
site_by_id={n:(l,e) for l,e in zip(loops,edits) for n in l['ids']}
maprows=[]
for r in rows:
 n=int(r['id']); row=dict(r)
 if r['class']=='DELIBERATE':
  row.update(disposition='RETAINED_LITERAL_OLD_STIMULUS',reason='Original DELIBERATE classification, call sequence, scope and configured duration unchanged; no POLL reclassification.')
 else:
  l,e=site_by_id[n]; ident=l['ids'][0]
  kind=('LEADING_SLEEP_THEN_READ' if ident in [83,86] else 'CONDITIONAL_BODY_SLEEP' if ident==5 else 'UNCONDITIONAL_H8_TERMINAL' if ident==84 else 'DO_TRAILING_DEADLINE' if l['kind']=='do' else 'CONDITION_FIRST_ASSERT_DEADLINE' if ident in [29,31,32,33] else 'CONDITION_FIRST_SHORT_CIRCUIT' if ident in condition_first else 'DEADLINE_FIRST_SHORT_CIRCUIT')
  a=old.index(l['source'],l['start']);assert a==l['start']
  row.update(disposition='COMPLETE_DRAFT_UNEXECUTED',siteIds=l['ids'],kind=kind,
   originalBlockSha256=sha(l['source']),replacementSha256=sha(e['replacement']),
   originalLine=l['line'],replacementLine=final[:final.index(e['replacement'])].count('\n')+1,
   originalGuard=l['condition'],configuredIntervalMs=int(re.search(r'Thread\.sleep\((\d+)\)',l['body'])[1]),
   initialTransition='Exactly one manual original step; initially satisfied guard creates no sleep/interrupt transition.',
   pendingTransition='Record original sleep boundary. At most one interval debt; no fresh condition/read/effect until due. First framework tick is cached/no-op.',
   finalTransition=('Entered iteration owes exactly one report/HTTP read after interval BEFORE next guard; copied actual report then original guard and unchanged final reads.' if ident in [83,86] else 'Blank body read owes interval/interrupt even after crossed clock. Nonblank success creates no debt and preserves interrupt flag.' if ident==5 else 'Original while(true) terminal observation writes CONFIRMED/TIMEOUT evidence exactly once and performs old assertions/return or throws; no normal nonterminal driver exit.' if ident==84 else 'Actual condition is evaluated before original deadline assertion; false condition executes original assertion. First condition Throwable preserved.' if ident in [29,31,32,33] else 'Copied original guard evaluation and short-circuit order. Final condition-first observations precede clock; deadline-first/do do not enter body after old clock guard fails.'),
   noAwait='Bound<=0 cannot leave pending: driver next original step consumes due interval then same original guard/body/terminal transition. If interval is not yet due it is a cached tick and bounded only by the already-owed interval.',
   timeout='No replacement timeout oracle. Latched success/first failure wins over library elapsed timeout; still-pending next step only, never terminal replay.',
   interrupt='At each actual pending old sleep edge Thread.interrupted throws/clears checked InterruptedException. During Awaitility interval restored flag checked before next old step. Genuine no-sleep success leaves flag unchanged; exact first Exception/Error object retained.',
   callerScopeAfterOriginalBlockSha256=sha(old[l['end']:l['end']+500]),
   callerHandling='Surrounding catch/reinterrupt/finally and independent final fresh reads unchanged: reversing only wait blocks restores exact TEST001 source.',
   proof='UNEXECUTED actual-block paired scratch for selected representative; all-site exact mapping/static undo, followed by required native full class/ownership/privacy/timing gates.',
   conditionalCarry=n in [1,2,4,6,93,95])
 maprows.append(row)
assert len(maprows)==95
write('row-classification-proof-map.json',maprows)
write('interrupt-timeout-map.json',[r for r in maprows if r['class']=='POLL'])
write('source-preservation-map.json',dict(originalSha256=sha(old),canonicalTest001Sha256=stages[0]['candidateSha256'],
 fullCandidateSha256=sha(final),reviewedOriginalAssertionChains=2686,annotatedMethods=74,parameterVariants=35,
 textBlocks=[dict(ordinal=i+1,sha256=sha(x)) for i,x in enumerate(re.findall(r'""".*?"""',old,re.S))],
 outsideWaitProof='Every cumulative candidate undoes literal present wait blocks to byte-identical supported TEST001. Original assertion/name/textblock checks in verify_static.py; native reachability unproved.',
 R10='Original10 embedded text blocks identical, including wrapper-only diagnostics; source-order/native UNKNOWN_OUTCOME/ACK/cleanup kept outside wait replacement spans.',
 exactFinalOwnership='No resource/cleanup owner changes. Same originally captured variables copied back in finally; sticky cleanupUnconfirmed, owned fixture roots, case generation, final sink/context boundaries unchanged. Native proof still required.',
 originalInputs='input-hashes.json unchanged10 identities; new review/current root/tooling receipts supplemental and explicit.'))

# Required commands are retained and updated to fresh labels; no implicit fallback or launch.
commands=json.loads((OUT.parent/'future-commands.json').read_text())
commands['commands']=[r for r in commands['commands'] if r['kind']!='conditional-full-class-mutation']
for row in commands['commands']:
 row['label']=row['label'].replace('obs011-itr-','obs011-itr-r2-')
 row['command']=row['command'].replace('obs011-itr-','obs011-itr-r2-')
 row['status']='UNEXECUTED';row['requires']='Root exact writer/lock/runtime approval plus named budget/proof disposition; no runnable schedule is authorized by this package.'
 row['fullClassSlotCost']=1 if 'full-class' in row['kind'] else 0
 if row['kind']=='full-class-budgeted':
  row['ordinalScope']='Canonical proposal index only; actual global <=6 ledger includes every full-class mutant/error. No launch before named budget/proof ruling.'
  if row['fullClassOrdinal'] in [5,6]:
   row['candidate']='04-b4'
   row['conditionalCarryAlternative']={'stage':'04-b4-carry6','candidateSha256':stages[5]['candidateSha256'],'status':'UNSELECTED_REQUIRES_ACTUAL_PROOF_TIMEBOX_PO_QA_RULING'}
  if row['fullClassOrdinal']==6:
   row['previousAttemptMustBeIdenticalSourceAndGreen']=True
   row['interleavedMutationOrErrorBreaksConsecutiveGreens']=True
 # Candidate hashes are refreshed from corrected stage, never from actual source.
 if row.get('candidate') in {s['stage'] for s in stages}:
  row['candidateSha256']=next(s['candidateSha256'] for s in stages if s['stage']==row['candidate'])
base='python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py '
fqcn='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
mutations=json.loads((OUT/'mutation-plan.json').read_text())['mutants']
for m in mutations:
 subset=m['id']=='M-gate-true-subset';label='obs011-itr-r2-'+m['id'].lower()
 tasks='test' if subset else 'test,guidedIncrementalTest'
 selected=fqcn+'.syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls' if subset else fqcn
 selection="test --tests '"+selected+"'" if subset else "test --tests '"+selected+"' guidedIncrementalTest --tests '"+selected+"'"
 command=base+label+' --test-tasks '+tasks+' --require-exec-tasks '+tasks+' -- '+selection+' --continue --rerun-tasks --no-daemon' 
 commands['commands'].append(dict(kind='force-gate-subset-negative' if subset else 'full-class-mutation',
  candidate='00-test001',mutationId=m['id'],mutantSha256=m['mutantSha256'],label=label,command=command,
  expected=m['proof'],gateCredit=False,status='UNEXECUTED',fullClassSlotCost=0 if subset else 1,
  verifier='python3 '+str(OUT.relative_to(ROOT))+'/verify_mutation_run.py <actual-results.json> --mutation-id '+m['id']))
commands['status']='UNEXECUTED_BLOCKED_FOR_NAMED_PO_QA_BUDGET_PROOF_DISPOSITION'
write('future-commands.json',commands)
write('budget-proof-conflict.json',dict(status='UNRESOLVED_REQUIRES_NAMED_PO_QA_RULING_NO_APPLICATION',
 capFullClassAttempts=6,capApplyDays=2,
 optimisticCanonical=[dict(slot=i+1,stage=s) for i,s in enumerate(['00-test001','01-b1','02-b2','03-b3','04-b4','04-b4-identical-repeat'])],
 canonicalAttemptsMinimum=6,threeVacuityBoundaryMutantsMinimum=3,existingGateFalseOmitDuplicateMinimum=3,
 literalIndependentTotalMinimum=12,deficit=6,
 evenIfIndependentEquivalentEvidenceReplacesExistingThreeGateRuns=dict(minimum=9,deficit=3,requires='Named QA ruling; not adopted here.'),
 forceTrueSubsetSlotCost=0,contentNegativeSubsetSlotCost=0,readerSingleReverseSlotCost=0,
 note='Every actual full-class command including red mutations, setup/compile errors or interrupted commands consumes a slot; error contingency is positive, never free. Subsets do not receive full-class credit. All required proofs remain carried as obligations, not chosen omissions.',
 carry='carry6 is complete optional source only. Not selected and not used to claim this schedule fits. A carry needs actual prescribed owner/timebox/proof and PO/QA ruling.',
 rulingRequested='Resolve prescribed full-class mutation evidence and six-slot canonical/baton obligation explicitly: authorize a lawful changed budget/schedule or independently accept exact equivalent proof/carry without dropping TEST001/last identical green twice. This preparation makes neither decision.',
 noHiddenSeventhRun=True,noAutomaticExtension=True,noLaneExit=True))

# Explicit supplemental source refresh: pin the separately reviewed one-literal JDK launcher fix.
application=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/java21-root-application/application-receipt.json'
app=json.loads(application.read_text());helper=ROOT/app['path']
assert sha(helper.read_bytes())==app['afterSha256']=='fa90d844d6443285ada1ae1856fdef4bd23ddf607ab97ec21ccd52f2fc30cc3a'
review=ROOT/app['independentReviewPath'];assert sha(review.read_bytes())==app['independentReviewSha256']
write('input-refresh-policy.json',dict(originalInputManifestSha256=sha((OUT/'input-hashes.json').read_bytes()),
 original10InputsNotRecaptured=True,reviewedChange=dict(path=app['path'],beforeSha256=app['beforeSha256'],afterSha256=app['afterSha256'],
 reviewPath=app['independentReviewPath'],reviewSha256=app['independentReviewSha256'],applicationReceiptPath=str(application.relative_to(ROOT)),applicationReceiptSha256=sha(application.read_bytes())),
 future='Before every real use verify frozen10 inputs, exact source/dist, current reviewed fullcheck harness and all helper hashes against root latest explicit baton. Further helper changes require exact before/after diff + named independent review + application receipt and a supplemental refresh here; never recapture a mismatch as baseline.',
 currentParentFacts='DIAG terminal108PASS; originalb8 restored/recompiled, no IT-R class credit. Fresh-check02 refused before collectors on launcher23. Separately reviewed JDK21 launcher fix now applied; fresh fullcheck03 root-owned running at preparation. No terminal inference or class/timing credit.',
 authorization='SUPPLEMENTAL_PROVENANCE_ONLY_NOT_A_LAUNCH_APPROVAL'))
write('review-inputs.json',dict(reviewPath='docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-draft-review/review.md',
 reviewSha256='84f6638d91910747bf7a9cc20b239d01f50c3eacb71d9c50b4833785b3cf8fb2',
 inheritedPackageManifestSha256=sha((OUT.parent/'SHA256SUMS').read_bytes()),
 rootState=dict(path='docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json',sha256=sha((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json').read_bytes()),authority='Observed snapshot only; later parent messages supersede live-state fields.'),
 noRuntimeExecution=True,declaredUsdCeiling=500,actualSpend='UNAVAILABLE'))
print(json.dumps({'rows':len(maprows),'pollRows':sum(x['class']=='POLL' for x in maprows),'commands':len(commands['commands']),'minimumFullClassAttempts':12,'cap':6}))

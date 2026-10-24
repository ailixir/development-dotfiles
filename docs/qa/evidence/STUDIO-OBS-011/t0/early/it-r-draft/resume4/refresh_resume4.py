"""Current wire-only package metadata. Never rewrites supported Java/patch/map/scratch bytes."""
from pathlib import Path
import json,hashlib,datetime,shutil
OUT=Path(__file__).resolve().parent;OLD=OUT.parent/'resume3';ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
write=lambda name,obj:(OUT/name).write_text(json.dumps(obj,indent=2)+'\n')
old_source=(OLD/'verify_mutation_run.py').read_text();new_source=(OUT/'verify_mutation_run.py').read_text()
a=new_source.index("ALLOWED_FAILURE_TYPE='java.lang.AssertionError'");b=new_source.index('def validate_failure(',a)
inverse=new_source[:a]+new_source[b:]
inverse=inverse.replace("require(element.attrib.get('type')==ALLOWED_FAILURE_TYPE,'UNEXPECTED_PRIMARY_FAILURE_TYPE')","require(element.attrib.get('type')=='java.lang.AssertionError','UNEXPECTED_PRIMARY_FAILURE_TYPE')",1)
a=inverse.index('    attribute_payload=normalize_gradle_throwable_message(');b=inverse.index('    for node,boundary in zip(',a)
inverse=inverse[:a]+"    require(element.attrib.get('message','').lstrip().startswith(desc),'WRONG_PRIMARY_MESSAGE')\n"+inverse[b:]
assert inverse==old_source
preservation=json.loads((OUT/'resume3-preservation.json').read_text())
for row in preservation['supportedArtifactsByteExact']:assert (OUT/row['path']).read_bytes()==(OLD/row['path']).read_bytes()
write('resume4-preservation.json',dict(inheritedResume3ManifestSha256=sha((OLD/'manifest.json').read_bytes()),supportedArtifactsByteExact=preservation['supportedArtifactsByteExact'],
 protectedSourceCount=19,protectedPatchCount=34,sourceMaps95AndJavaScratch53Unchanged=True,sourceReanchor=False,
 checkerOldSha256=sha(old_source),checkerNewSha256=sha(new_source),inverseWireDeltaRecoversExactOldChecker=True,inverseCheckerSha256=sha(inverse),
 reconcileAndAllNonWireFunctionsByteExact=new_source[new_source.index('def reconcile('):]==old_source[old_source.index('def reconcile('):]))
history=OUT/'history';history.mkdir(exist_ok=True)
for name in ['receipt.md','receipt.json','checker-contract-witnesses.json','checker-design.md']:
 shutil.copyfile(OLD/name,history/('resume3-'+name))
# Current active paths only; source hashes, selection, ordering, cost and proof roles remain identical.
for name in ['future-commands.json','scratch/future-commands.json']:
 text=(OLD/name).read_text().replace('/it-r-draft/resume3/','/it-r-draft/resume4/').replace('obs011-itr-r3-','obs011-itr-r4-')
 (OUT/name).write_text(text)
commands=json.loads((OUT/'future-commands.json').read_text());budget=json.loads((OLD/'budget-proof-conflict.json').read_text())
budget['sourceBoundOrdering']=commands['fullClassSourceBoundOrdering'];write('budget-proof-conflict.json',budget)
review=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume3-review';assignment={}
for name in ['itr-wire-fix-intent.txt','itr-wire-fix-context.txt','itr-wire-fix-preflight.json']:
 path=Path('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011')/name;assignment[str(path)]=sha((ROOT/path).read_bytes())
for name in ['review.md','audit.py','audit.json','core-contracts.py','core-contracts.json']:assignment[str((review/name).relative_to(ROOT))]=sha((review/name).read_bytes())
write('assignment-inputs.json',dict(authority='Exact saved wire-only develop011InProgress-safe task; final Quinn review/audit/core witnesses',inputs=assignment,
 reviewSha256='aa407fb5a662159dfe83278921e244dda7f2821e13b3694cfeb0bb61ddcba1c4',sourceInputHistory='Original10 input-hashes.json and explicit fa90 refresh unchanged; no recapture',
 priorResume3ManifestSha256='f840729b24cb0ea7b0d0502da8c5faa537c78889220fa6075d366ca48ddb0e97'))
old_qa=json.loads((review/'core-contracts.json').read_text());current_qa=json.loads((OUT/'wire-independent-contracts.json').read_text())
old_bad={r['name'] for r in old_qa['results'] if not r['accepted'] and 'issue' not in r};new_results={r['name']:r for r in current_qa['results']}
assert len(old_bad)==89 and all(name in new_results and not new_results[name]['accepted'] for name in old_bad)
old_counterexamples={r['name'] for r in old_qa['results'] if 'issue' in r};assert len(old_counterexamples)==4 and all(new_results[name]['accepted'] for name in old_counterexamples)
author=json.loads((OUT/'checker-contract-witnesses.json').read_text());wire=json.loads((OUT/'wire-contract-witnesses.json').read_text())
assert author['accepted']==7 and author['rejected']==99 and current_qa['accepted']==11 and current_qa['rejected']==89 and wire['accepted']==4 and wire['rejected']==149
assert all(report['checkerSha256']==sha(new_source) for report in [author,current_qa,wire])
write('wire-proof-summary.json',dict(checkerSha256=sha(new_source),priorIndependentInvalidNamesPreserved=89,
 priorFourWireCounterexamplesCorrectedWithCoherentRawCompatibleFixtures=sorted(old_counterexamples),
 suites=dict(author=dict(accepted=7,rejected=99),priorIndependentSelectionReplay=dict(accepted=11,rejected=89),focusedWireAndHistoricalTransplants=dict(accepted=4,rejected=149)),
 fakeContractsOnly=True,allRawStatusesUnchanged=True,historicalB1ValidMutant=False,rawPrivateTextExported=False,nativeCompilerProbe='NOT_RUN'))
write('wire-grammar.json',dict(allowedXmlType='java.lang.AssertionError',attributePrefix='java.lang.AssertionError: ',
 prefixRule='Require exact allowed XML@type; consume exactly one exact type+colon+ASCIIspace. Reject bare/missing/wrong/duplicated prefix. No lstrip, substring search or recursive normalization.',
 primaryBodyRule='Attribute payload must equal complete primary stack Throwable.toString payload after exactly one printStackTrace newline terminator is removed. Then require original source description line plus the source formatter single trailing ASCIIspace.',
 descriptionFormatter=wire['formatter'],rootTree='Exactly original primary OWNED_SINKS AssertionError plus one suppressed CONTEXT_CLOSED AssertionError; no wrapper/cause/extra nodes or allowed-type expansion.',
 otherCheckerLogic='Exact inverse wire delta recovers prior checker bytes; reconcile/profile/semantic/union/provenance/raw-status functions unchanged.',
 historical='Hash-bound B1 raw XML privately confirms prefix/header serialization. Its failures are never controlled-mutant positives, including when prefix primitive recognizes the plain AssertionError.',
 currentRuntime='Actual IR mutation wire/scratch/native proof unexecuted. Unknown actual formats remain incomplete pending named review, no automatic waiver.'))
# Old source-frame/body contract remains; add the active wire rule without changing source pins.
failure=json.loads((OLD/'failure-provenance-contract.json').read_text());failure['activeWireGrammar']='wire-grammar.json';failure['runtimeWireFormat']='Exact recorded Gradle type prefix handled; actual controlled mutation/native execution remains unproved. All other unknown shapes reject/incomplete.';write('failure-provenance-contract.json',failure)
receipt=dict(atUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),role='Dex/aiox-dev/canonical dev',status='WIRE_ONLY_CORRECTION_PREPARED_INDEPENDENT_REVIEW_PENDING',
 reviewSha256='aa407fb5a662159dfe83278921e244dda7f2821e13b3694cfeb0bb61ddcba1c4',ownedWriteScope=str(OUT.relative_to(ROOT)),
 finding='ITR-D5-R3-WIRE-01',checkerSha256=sha(new_source),sourceFilesChanged=0,supportedArtifactsByteExact=92,javaFiles=19,patches=34,censusRows=95,unexecutedJavaScratchPairs=53,
 fix='One exact XML type-bound Gradle Throwable prefix plus full attribute/root-body equality and source-bound description format; no fuzzy acceptance or type/tree expansion.',
 pythonFakeProof='wire-proof-summary.json',prior89InvalidControlsRetained=True,prior4WireCounterexamplesNowAccepted=True,
 history='Old artificial bare positives are historical only; current fixtures use exact coherent Throwable.toString attributes. Historical B1 is not a valid mutant; raw private text stays in memory.',
 unchangedChecks='All profile/default1/incremental0/full46+62 semantic/provenance/privacy/model/budget/response/retention/source-frame/raw-negative-status checks unchanged outside the narrow wire delta.',
 budget=dict(capFullClassCalls=6,errorFreeMinimum=12,actualIrCalls=0,applyDays=2,diagnosticSubsetsFullClassCost=0,noD14SubsetCredit=True,noExtensionCarryOrHiddenSeventh=True),
 rootStatus='03 still parent-owned LIVE with known Order11 guard failure; enum/cause/observer gap unresolved. No live-output assessment, stabilization or source action.',
 originalInputs='Original10 and reviewed fa90/task collector pins unchanged; no input recapture.',
 nativeCompilerProbeJavaSourceHelperStoryPlanGitSignalsProviderSubagents=False,noQaW1LaneRuntimeLifecycleCredit=True,sharedUsdCeiling=500,actualSpend='UNAVAILABLE')
write('receipt.json',receipt)
print(json.dumps({'checkerSha256':sha(new_source),'sourceFilesChanged':0,'priorIndependentInvalidControlsRetained':89,'correctedWireCounterexamples':4,'nativeExecution':False}))

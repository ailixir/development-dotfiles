"""Actual closed-native/held-lease review using safe metadata/source only.
No raw XML/log/exec/HTML/private body, producer/gate/phase main or live action.
"""
from pathlib import Path
from collections import Counter
import ast,datetime,hashlib,json,re,stat
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-gst-provisional-06';U=T/'runtime/gst-restricted-unit06';O=T/'qa/gst-unit06-actual-retention-review';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011';F=T/'early/gst-unit06-final-verifier-prep';S=T/'early/gs-t-draft/resume6-semantic-question';E=T.parent/'execution'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();date=lambda s:datetime.datetime.fromisoformat(s)
pins={'result':(E/'obs011-gst-provisional-06-results.json','55b22af567a893541578ebb1805a2576c2bf29028ac2af21cda57b8f404e34b0'),'native':(D/'owned-native/receipt.json','5f82304f10c6cfcf459968bc00a7de6c4118aaf4209391ec120c83d8110f45e4'),'format':(D/'owned-format/receipt.json','6a10aaf4e11fb1d1518749b01846b9eba2faeea8340acef2c9b307c64f270150'),'release':(D/'root-actual-unit-release.json','fdb83d69f9296ed21a18ba380f8ac642bfd5caeba43138e867774621049d3ef6'),'archive':(D/'formatted-candidate-archive/index.json','37b34ea917e21addfc4df8850f40f9f4306153ed7441a8a0214918ccaa4b9116'),'provenance':(D/'retained-build-source-provenance.json','9edfca62fdf9320a64f4ff6e8dab3cbcabeb1754768748ced1670e78547cb2f9'),'producer':(D/'verify-final-before-unlock.py','ca3b078da598dcd7a387013fa1840704b6f53131b03234b0d561540d9ab87b0e'),'binding':(D/'final-verifier-binding-review.json','e94508a83cae554993b117617e9b7a8d87c1827cdbd7c8bd7a4bd5ef7e8fdcfb')}
for path,digest in pins.values():assert sha(path)==digest,path
preflight=read(B/'gst-unit06-actual-retention-review-preflight.json');assert preflight['scan']['safe'] is True and preflight['budgetCeilingUsd']==500
actual=read(pins['result'][0]);A=read(pins['release'][0]);L=read(D/'active-lock.json');archive=read(pins['archive'][0]);prov=read(pins['provenance'][0]);binding=read(pins['binding'][0])
proposal=read(T/'runtime/gst-limited-start-proposal06/proposal.json')
identity=lambda x:(x['task'],x['class'],x['name'])
assert len(actual['testcases'])==99 and Counter(identity(x) for x in actual['testcases'])==Counter(identity(x) for x in proposal['expectedCases'])
assert actual['counts']=={'total':99,'passed':99,'failed':0,'errors':0,'skipped':0} and all(x['status']=='PASS' for x in actual['testcases'])
assert actual['exit']==actual['gradleExit']==0 and actual['validationSucceeded'] is True
assert all(actual[k] is True for k in ['sourceStable','distStable','testInputStable','taskCollectionComplete']) and not actual['taskCollectionErrors']
assert actual['explicitTestTasks']==actual['requiredFreshExecTasks']==['test'] and actual['expectedHistoricalSkips']==[] and actual['historicalSkipSource'] is None
task=actual['taskResults']['test'];assert task['freshXmlFiles']==5 and task['freshHtmlIndex'] is task['freshExec'] is task['execRequired'] is True
assert len(actual['jacocoExecFiles'])==1 and actual['jacocoExecFiles'][0]['nonempty'] is True and actual['jacocoExecFiles'][0]['bytes']>0
assert Counter(x['class'].rsplit('.',1)[-1] for x in actual['testcases'])=={'GuidedSessionIT':44,'GuidedServiceTransportFaultIT':39,'GuidedLifecycleReasonIT':5,'GuidedEvidencePendingAppendIT':8,'GuidedCommittedRefreshStateTest':3}
case=read(U/'case-proof.json');assert case['expected']==case['actual']==99 and case['identityMultisetExact'] is True and case['counts']==actual['counts'] and case['collectorExit']==case['gradleExit']==0 and case['C8OrLaneCredit'] is False
assert read(U/'native-exit.json')['exit']==read(U/'format-exit.json')['exit']==0
assert (L['wrapperPid'],L['shellPid'],L['toolSession'])==(39524,39525,65330)
N=read(D/'guard-admission-negative-result.json');assert N['pin']==L and N['rootReleaseSha256']==pins['release'][1] and N['actualDecision']=='HOLD' and N['actualFunctionExit']==1 and N['sourcePhasesNotStarted'] is True
assert N['sameShellPromptObserved'] is N['sameWrapperAndShellStartReverified'] is N['kernelStillHeld'] is True
receipts={};owned=set();policy=read(D/'policy.json')
for phase,count in [('format',3),('native',7)]:
    r=read(D/('owned-'+phase)/'receipt.json');receipts[phase]=r
    assert r['status']=='NATIVE_PHASE_TERMINAL' and r['phase']==phase and r['collectorExit']==0
    assert r['rootUnitAuthorizationSha256']==pins['release'][1] and r['lockPin']==L and r['phaseKeeperSha256']==A['phaseKeeperSha256'] and r['command']==A['nativePhases'][phase]['argv']
    assert [x['exit'] for x in r['phases'] if x['phase']=='NATIVE_PHASE_TERMINAL']==[0]
    assert not r['evidenceErrors'] and not r['remainingOwnedNonJvmFacts'] and not r.get('interrupted',False)
    assert all(r.get(k,False) is False for k in policy['gapKeys'])
    assert len(r['ownedIdentities'])==count and all(x['proof'] in ['PID_ABSENT','DIFFERENT_KERNEL_START'] for x in r['ownedJvmTerminalProof'])
    owned|={(x['pid'],x['start']) for x in r['ownedIdentities']}
assert len(owned)==10
assert date(N['atUtc'])<date(receipts['format']['collectorStartedAtUtc'])<date(receipts['native']['collectorStartedAtUtc'])<date(receipts['native']['collectorTerminatedAtUtc'])
for fact in actual['jacocoExecFiles']:
    assert date(actual['started']).timestamp()<=fact['mtimeNs']/1e9<=date(receipts['native']['collectorTerminatedAtUtc']).timestamp()+2

# Independent allowed formatter-token successor check, no formatter/compiler invocation.
phase_tree=ast.parse((T/'early/gst-restricted-unit-prep/resume6/phase.py').read_text());pure={'re':re}
nodes=[n for n in phase_tree.body if isinstance(n,ast.FunctionDef) and n.name in {'hold','java_tokens','split_imports','format_only'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TOKEN' for t in n.targets)]
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure-formatter-token-check>','exec'),pure)
successor=read(U/'format-successor.json');assert successor['acceptedUnformattedPatchSha256']==proposal['patchSha256']
overrides={}
assert archive['status']=='EXACT_FORMATTED_THREE_ARCHIVED_BEFORE_NATIVE' and archive['rootReleaseSha256']==pins['release'][1] and archive['formatExit']==archive['checkFormatExit']==0 and archive['recordedFormatGapFlags'] is False
assert len(archive['files'])==3 and archive['formatReceiptSha256']==pins['format'][1]
for row in archive['files']:
    path=R/row['archive'];assert sha(path)==row['sha256']==sha(R/row['source']) and path.stat().st_size==row['bytes']
    removed=pure['format_only']((S/'repo'/row['source']).read_bytes(),path.read_bytes());assert removed==successor['unusedExplicitImportsRemoved'][row['source']]==[]
    overrides[row['source']]=row['sha256']
assert overrides==successor['formattedSha256'] and successor['literalTokensExact'] is successor['otherJavaTokensExact'] is True
plan=read(T/'early/fullcheck-harness/resume3/plan.json');expected={x['path']:x['sha256'] for x in plan['source']['files']};expected.update(overrides)
modes=read(U/'original-modes.json')
for path,digest in expected.items():assert sha(R/path)==digest and stat.S_IMODE((R/path).stat().st_mode)==modes[path]
main={p for p in expected if p.startswith('backend/src/main/')};assert len(main)==506 and {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
for row in plan['source']['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():assert sha(R/path)==digest
checkpoint_paths=[U/'formatted.json',E/'obs011-gst-provisional-06-before.json',E/'obs011-gst-provisional-06-after.json',U/'after-native.json']
expected_files=[{'path':n,'sha256':expected[n]} for n in sorted(expected)]
for p in checkpoint_paths:
    cp=read(p);assert cp['files']==expected_files and cp['dist']==plan['source']['dist'] and hashlib.sha256(json.dumps(cp['files'],separators=(',',':')).encode()).hexdigest()==cp['digest']=='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
assert archive['sourceCheckpointSha256']==sha(checkpoint_paths[0]) and actual['testInputDigestBefore']==actual['testInputDigestAfter']==archive['sourceDigest']==read(checkpoint_paths[0])['digest']
assert prov['nativeReceiptSha256']==pins['native'][1] and prov['nativeGradleLogSha256']==actual['logSha256']
assert prov['sourceBeforeCheckpointSha256']==sha(checkpoint_paths[1]) and prov['sourceAfterCheckpointSha256']==sha(checkpoint_paths[2])
assert prov['sourceDigest']==archive['sourceDigest'] and prov['compileTestJavaActuallyExecuted'] is prov['sameSourceExactBeforeAndAfterCompile'] is prov['buildSuccessful'] is True and prov['collectorExit']==0 and prov['flags']=={}

# Installed producer SOURCE inspected; exact three-constant binding, never invoked.
assert sha(F/'manifest.json')=='74e9048b2efe99e05dc8270b3c99065557e8a9d04268af81083fac44965bedb8'
for row in read(F/'manifest.json')['files']:assert sha(F/row['path'])==row['sha256']
template=F/'verify-success-retain-three.template.py';assert sha(template)==binding['templateSha256']=='2702fb00ca455cddd2682f9b45d36d206352249a10b60e8815a63b39a7e3e98c'
installed=(D/'verify-final-before-unlock.py').read_text();bound=template.read_text()
assert len(binding['bindings'])==3
for old,new in binding['bindings'].items():assert bound.count(old)==1;bound=bound.replace(old,new)
assert bound==installed and sha(D/'verify-final-before-unlock.py')==binding['installedSha256']==pins['producer'][1]
assert binding['rootReleaseSha256']==pins['release'][1] and binding['actualNativeExit']==binding['expectedWrapperExit']==0
assert binding['actual99ResultSha256']==pins['result'][1] and binding['provenanceSha256']==pins['provenance'][1] and binding['producerNotInvoked'] is binding['readinessOrPermitNotWritten'] is True
tree=ast.parse(installed);assert "assert os.getppid()==pin['shellPid']" in installed
for fragment in ["SOURCE_DISPOSITION='RETAIN_AUTHORIZED_THREE'","assert not gaps","assert not (D/'owned-restore-compile/receipt.json').exists()","all(x['status']=='PASS' for x in result['testcases'])","assert '> Task :compileTestJava' in lines and '> Task :test' in lines","new(D/'preunlock-verification.json',ready)","'permitWritten':False,'exitInvoked':False"]:assert fragment in installed
assert not (D/'preunlock-verification.json').exists() and not (D/'unlock-permit.json').exists()
assert binding['templateArchitectureReviewSha256']=='8d8eef53febffbd6a8fe27e7a946ca24d63b1fffc1390699199a5bb475b5baa1'
architecture=T/'resume-architecture/resume2/gst-unit06-final-verifier-review'
assert sha(architecture/'review.md')==binding['templateArchitectureReviewSha256'] and sha(architecture/'manifest.json').startswith('90c553fa')
for row in read(architecture/'manifest.json')['files']:assert sha(architecture/row['path'])==row['sha256']
out={'disposition':'ACTUAL99_PASS_EXACT_THREE_RETENTION_ELIGIBLE_SUBJECT_FRESH_FINAL_VERIFICATION_AND_ORDERED_CLOSE','mandatoryFindings':[],'counts':actual['counts'],'exact99IdentityMultiset':True,'nineModesAndElevenSentinelsIncluded':True,'collectorGradleValidationCollectionStableAllPass':True,'freshTestExecMetadataOnly':True,'formatterJavaAndLiteralTokensIndependentlyEqual':True,'formattedSourceOverrides':overrides,'formattedDigest':archive['sourceDigest'],'current1808BytesModesOutsideThreeMain506Dist238AuxVerified':True,'recordedOwnedTerminalUnion':10,'allReceiptFlagsErrorsClear':True,'normalNoExternalDiagnosticOrAbortClaimFromScope':True,'compileSourceProvenanceBound':True,'rawNativeLogCompileTaskLinesReadByReviewer':False,'installedProducerSha256':pins['producer'][1],'templateOnlyThreeConstantsBound':True,'producerInvokedOrReadinessPermitPresent':False,'sameHeldLeaseSuppliedNotLiveRewitnessed':{'toolSession':65330,'wrapper':39524,'shell':39525},'rootFreshFinalVerification0ExplicitRetainPermitGuardedExit0AndPostcloseRequired':True,'unitClosed':False,'postcloseIndependentReviewOwed':True,'C8CoverageLaneBatonMainReplayGeneralW1IrOrLifecycleCredit':False,'historicalUnit03GapsRepaired':False,'rawXmlExecHtmlPrivateThreadBinaryTempJournalOrLocatorAccess':False,'runtimeProducerGatePhaseHelperMainProcessLockSignalAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

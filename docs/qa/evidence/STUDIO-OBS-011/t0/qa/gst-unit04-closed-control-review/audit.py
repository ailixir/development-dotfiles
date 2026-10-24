"""Closed explicit SOURCE/control/projection metadata only. No raw log/dump/binary,
producer/gate/helper execution, live census/kernel/shell/native or signal actions.
"""
from pathlib import Path
import ast,copy,datetime,hashlib,json,math,re,stat
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-gst-provisional-04';U=T/'runtime/gst-restricted-unit04';O=T/'qa/gst-unit04-closed-control-review';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();date=lambda s:datetime.datetime.fromisoformat(s)
ctx=read(B/'gst-unit04-closed-control-review-context.json');assert len(ctx['pins'])==27
for row in ctx['pins']:
    assert not any(s in row['path'] for s in ['diagnostic-thread-print.private','failed-test-output-protected-archive','output.bin'])
    assert sha(R/row['path'])==row['sha256'],row['path']
A=read(D/'root-actual-unit-release.json');L=read(D/'active-lock.json');C=read(D/'root-unit-closed.json');N=read(D/'guard-admission-negative-result.json');V=read(D/'preunlock-verification.json');P=read(D/'unlock-permit.json');prov=read(D/'restored-build-source-provenance.json')
assert C['rootReleaseSha256']==N['rootReleaseSha256']==V['rootReleaseSha256']==P['rootReleaseSha256']==sha(D/'root-actual-unit-release.json')
assert N['activeLockSha256']==V['activeLockSha256']==P['activeLockSha256']==sha(D/'active-lock.json')
assert (L['wrapperPid'],L['shellPid'],L['toolSession'])==(86481,86484,50975)
assert N['pin']==L and N['actualSetupExit']==0 and N['actualFunctionInspected'] is True
assert N['readinessAndPermitAbsent'] is N['sourcePhasesNotStarted'] is True
assert N['attemptedCommand']=='exit 1' and N['actualDecision']=='HOLD' and N['actualReason']=='FINAL_VERIFICATION_REQUIRED' and N['actualFunctionExit']==1
assert N['actualToolOutputChunk']=='a72bc3' and N['actualSeparateStatusChunk']=='cb3331'
for k in ['sameShellPromptObserved','sameWrapperAndShellStartReverified','sameParentAndWrapperArgvReverified','wrapperDescriptorAndDevInodeReverified','kernelStillHeld']:assert N[k] is True
assert N['rootDecision']=='ACCEPT_ACTUAL_NEGATIVE_ADMISSION_CONTROL_EVIDENCE_FOR_THIS_SAME_HOLD'
assert A['independentGuardReviewSha256']==sha(T/'qa/gst-unlock-guard-review/review.md') and A['independentOrderingSha256']==sha(T/'qa/gst-unit04-composed-start-review/review.md')
for name,digest in A['unlockGuard']['hashes'].items():assert sha(D/name)==digest

# Inspect the pinned final producer as SOURCE before extracting any pure gate nodes.
producer=(D/'verify-final-before-unlock.py').read_text();ast.parse(producer)
assert V['producerSha256']==sha(D/'verify-final-before-unlock.py')
assert "assert not gaps, 'Current gap requires separate exact independent qualification; keep hold'" in producer
assert "assert '> Task :compileTestJava' in lines" in producer and "s.startswith('BUILD SUCCESSFUL in ')" in producer
assert "assert before['files']==after['files']==plan['source']['files']" in producer
assert "assert provenance['restoreCompileReceiptSha256']==evidence['owned-restore-compile/receipt.json']" in producer
assert producer.index('assert not gaps')<producer.index("new(D/'preunlock-verification.json',ready)")
assert producer.count("new(D/'")==2 and "new(D/'unlock-permit" not in producer and 'builtin exit' not in producer
assert "'permitWritten':False,'exitInvoked':False" in producer
assert C['finalVerificationSha256']==P['readinessSha256']==sha(D/'preunlock-verification.json')
assert C['permitSha256']==sha(D/'unlock-permit.json') and P['actualFinalVerificationExitInspected']==V['verificationExit']==0
assert P['decision']=='AUTHORIZE_LOCK_RELEASE' and V['status']=='VERIFIED' and V['gaps']==V['manualGaps']==P['gaps']==[]
assert V['expectedWrapperExit']==P['expectedWrapperExit']==C['actualGuardExpectedWrapperExit']==1
assert C['actualGuardDecision']=='ALLOW_VERIFIED' and C['actualGuardExitOutputChunk']=='212abe' and C['toolExit']==1
assert C['bothControllersAbsent'] is C['kernelFreeObserved'] is True and C['sourceWriterLease']=='CLOSED'
assert C['retryReleased'] is C['credit'] is C['historicalRepairClaim'] is False
history=['GST03_FORMAT_IDENTITY_GAP','GST03_PREMATURE_UNLOCK_INTERVAL']
assert A['unlockGuard']['historicalGapCodes']==V['historicalGapCodes']==P['historicalGapCodes']==C['historicalGapCodesPreserved']==history
assert V['retroactiveRepairClaim'] is False
verified=datetime.datetime.fromtimestamp(V['verifiedAtEpoch'],datetime.timezone.utc)
assert verified<date(P['atUtc'])<date(C['atUtc']) and (date(P['atUtc'])-verified).total_seconds()<60

# Exact safe source checkpoints/modes named and hash-bound by this producer/readiness.
before=read(U/'restored.json');after=read(U/'after-restore-compile.json');modes=read(U/'original-modes.json')
assert sha(U/'restored.json')==V['build']['preCompileCheckpointSha256']==prov['sourceCheckpointSha256']
assert sha(U/'after-restore-compile.json')==V['build']['postCompileCheckpointSha256']
assert sha(U/'original-modes.json')==V['evidencePins']['original-modes.json']
assert V['build']['provenanceSha256']==C['buildSourceProvenanceSha256']==sha(D/'restored-build-source-provenance.json')
planpath=T/'early/fullcheck-harness/resume3/plan.json';assert sha(planpath)=='576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673';plan=read(planpath)
assert before['files']==after['files']==plan['source']['files'] and len(before['files'])==1808
assert before['digest']==after['digest']==V['source']['digest']==prov['sourceDigest']==V['build']['sourceDigest']==plan['source']['digest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
assert before['dist']==after['dist']==plan['source']['dist'] and len(after['dist']['files'])==238
assert V['source']['disposition']=='RESTORED' and V['source']['overrides']==P['sourceOverrides']=={}
assert prov['compileTestJavaActuallyExecuted'] is prov['buildSuccessful'] is prov['sameSourceExactBeforeAndAfterCompile'] is True
assert prov['collectorExit']==V['build']['exit']==0 and V['build']['phase']=='restore-compile'
assert set(modes)=={x['path'] for x in before['files']}
for row in before['files']:
    path=R/row['path'];assert not path.is_symlink() and sha(path)==row['sha256'] and stat.S_IMODE(path.stat().st_mode)==modes[row['path']]
main={x['path'] for x in before['files'] if x['path'].startswith('backend/src/main/')};assert len(main)==506
assert {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
for row in after['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
for group,count in [('helm',22),('quotedCurrent',20),('immutableHelpers',6)]:
    assert len(plan[group])==count
    for path,digest in plan[group].items():assert sha(R/path)==digest

receipts={};owned=set();evidence={'original-modes.json':sha(U/'original-modes.json')}
for phase,code,count in [('format',0,3),('native',1,7),('restore-compile',0,2)]:
    path=D/('owned-'+phase)/'receipt.json';r=read(path);receipts[phase]=r;evidence['owned-'+phase+'/receipt.json']=sha(path)
    assert r['phase']==phase and r['status']=='NATIVE_PHASE_TERMINAL' and r['collectorExit']==code
    assert r['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json') and r['lockPin']==L and r['phaseKeeperSha256']==A['phaseKeeperSha256']
    assert r['command']==A['nativePhases'][phase]['argv'] and not r['evidenceErrors'] and not r['remainingOwnedNonJvmFacts']
    assert len(r['ownedIdentities'])==count and all(not r.get(k,False) for k in read(D/'policy.json')['gapKeys'])
    assert [x['exit'] for x in r['phases'] if x['phase']=='NATIVE_PHASE_TERMINAL']==[code]
    owned|={(x['pid'],x['start']) for x in r['ownedIdentities']}
assert evidence==V['evidencePins']==P['evidencePins'] and len(owned)==12
assert prov['restoreCompileReceiptSha256']==evidence['owned-restore-compile/receipt.json']
assert date(N['atUtc'])<date(receipts['format']['collectorStartedAtUtc'])<date(receipts['native']['collectorStartedAtUtc'])
assert date(receipts['native']['collectorTerminatedAtUtc'])<date(before['capturedAt'])<date(receipts['restore-compile']['collectorStartedAtUtc'])<date(receipts['restore-compile']['collectorTerminatedAtUtc'])<date(after['capturedAt'])<verified

# Closed finite-only observations; do not open original raw test log or protected bodies.
projection=read(D/'closed-tool-case-line-projection.json');counts=projection['perClassToolCounts']
assert counts=={'GuidedCommittedRefreshStateTest':{'PASSED':3,'FAILED':0,'SKIPPED':0},'GuidedEvidencePendingAppendIT':{'PASSED':8,'FAILED':0,'SKIPPED':0},'GuidedLifecycleReasonIT':{'PASSED':5,'FAILED':0,'SKIPPED':0},'GuidedServiceTransportFaultIT':{'PASSED':17,'FAILED':13,'SKIPPED':1}}
assert projection['completedXmlCases']==C['completedXmlCases']==0 and projection['full99Proof'] is C['taskCollectionComplete'] is False
assert projection['sameRequestFirstCauseOrSqlStateProven'] is False
assert projection['finiteDiagnosticLines']==['GST_DIAG|site=CUT_PRIMARY|route=NONE|status=409|family=GUIDED_SESSION|code=UNKNOWN_OUTCOME|frame=CLIENT_SEND|line=296','GST_DIAG|site=CUT_PEER|route=NONE|status=NONE|family=DATA_INTEGRITY|code=UNPROVEN|frame=PEER_RELAY|line=5560']
assert read(D/'interim-projection-qualification.json')['anyCompletedCaseOrSkipCredit'] is False
assert read(D/'identity-preparation-qualification.json')['readOnlyAttemptFailuresDidNotAuthorizeDependentOperation'] is True
preservation=read(D/'failed-binary-preservation-control.json');assert preservation['bodyInspectedHashedOrExported'] is False and preservation['doNotReadStatHashProtectedBodiesAfterCopy'] is True

dr=read(D/'root-owned-thread-print-release.json');dv=read(D/'owned-thread-print-result.json');dp=read(D/'owned-thread-print-fixed-projection.json');rr=read(D/'root-owned-worker-recovery-release.json');rv=read(D/'owned-worker-recovery-result.json')
assert dr['rootUnitReleaseSha256']==rr['rootUnitReleaseSha256']==sha(D/'root-actual-unit-release.json')
assert dr['activeLockSha256']==rr['activeLockSha256']==sha(D/'active-lock.json')
target=dr['target']['identity'];assert target==rr['target']['identity']==dv['targetIdentity']==rv['targetIdentity'] and target['pid']==92785 and target['identityComplete'] is True
chain=dr['target']['ancestorChain'];assert chain==rr['target']['ancestorChain']
for child,parent in zip(chain,chain[1:]):assert child['ppid']==parent['pid']
assert chain[-2]['pid']==L['shellPid'] and chain[-2]['start']==L['shellStart'] and chain[-1]['pid']==L['wrapperPid'] and chain[-1]['start']==L['wrapperStart']
assert dv['releaseSha256']==sha(D/'root-owned-thread-print-release.json') and dv['clientExit']==0 and dv['elapsedSeconds']==0.149 and dv['bytesCaptured']==39129
assert dv['timeout'] is dv['truncated'] is dv['targetSignalSent'] is False and dv['clientReaped'] is True
assert dv['fixedProjectionSha256']==rr['fixedProjectionSha256']==sha(D/'owned-thread-print-fixed-projection.json')
assert dp['testWorkerState']=='WAITING' and dp['fixedFrames']==[{'kind':'STOP_OWNER_DRAIN','line':3436},{'kind':'CUT_CLEANUP','line':2952}]
assert rv['releaseSha256']==sha(D/'root-owned-worker-recovery-release.json') and rr['diagnosticResultSha256']==sha(D/'owned-thread-print-result.json')
assert rv['signalsSent']==1 and rv['signal']=='SIGTERM' and rv['disposition']=='TARGET_IDENTITY_ABSENT' and rv['SIGKILLSent'] is rv['otherProcessOrGroupSignalled'] is rv['semanticCompletionCauseOr99Claim'] is False
assert date(dr['atUtc'])<date(dv['atUtc'])<date(rr['atUtc'])<date(rv['signalAtUtc'])<date(rv['atUtc'])<date(receipts['native']['collectorTerminatedAtUtc'])
extra={(dv['clientPid'],dv['clientStart'])};assert {(x['pid'],x['start']) for x in V['resources']['extraOwned']}==extra
assert {(x['pid'],x['start']) for x in V['resources']['recordedOwned']}==owned|extra and len(owned|extra)==C['recordedOwnedAbsentOrReused']==13
boundaries=[read(D/n) for n in ['held-prestage-resource-boundary.json','final-resource-boundary.json','postclose-resource-boundary.json']]
for bnd in boundaries:
    assert len(bnd['inheritedMatched'])==6 and bnd['inheritedMatched']==boundaries[0]['inheritedMatched']
    assert all(not bnd[k] for k in ['originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'])
    assert bnd['quietHostClaimed'] is bnd['cleanupOwnershipClaimed'] is False
assert V['resourceBoundarySha256']==sha(D/'final-resource-boundary.json') and C['postcloseBoundarySha256']==sha(D/'postclose-resource-boundary.json')

# Pure historical decision replay only. Time/live state injected, never current authorization.
tree=ast.parse((D/'unlock_gate.py').read_text());scope={'hashlib':hashlib,'json':json,'math':math,'re':re,'CORE_SHA':'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae','PHASES':('format','native','restore-compile'),'TESTS':{x['file'] for x in A['writers']}}
nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in {'Hold','need','digest','identities','requirements','fresh','assess'}]
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<closed-metadata-pure-replay-only>','exec'),scope)
b={'policy':read(D/'policy.json'),'release':A,'permit':P,'ready':V,'pin':L,'releaseSha':sha(D/'root-actual-unit-release.json'),'expectedReleaseSha':sha(D/'root-actual-unit-release.json'),'activeSha':sha(D/'active-lock.json'),'readinessSha':sha(D/'preunlock-verification.json'),'codeHashes':A['unlockGuard']['hashes'],'receipts':receipts,'evidenceHashes':evidence,'installedUnit':A['label']}
live={'observationOk':True,'parentLockCurrent':True,'sourceDigest':V['source']['digest'],'modesMatch':True,'auxiliaryInputsMatch':True,'metadataUnchanged':True,'liveOwned':[],'unexpectedHolderDescendants':[],'liveOwnedPorts':[]}
assert scope['assess'](b,live,V['verifiedAtEpoch']+1,1)['decision']=='ALLOW_VERIFIED'
controls=[]
for name,modify,when in [('missing-readiness',lambda x:x.pop('ready'),V['verifiedAtEpoch']+1),('failed-readiness',lambda x:x['ready'].update(verificationExit=1),V['verifiedAtEpoch']+1),('stale-readiness',lambda x:None,V['verifiedAtEpoch']+61)]:
    fixture=copy.deepcopy(b);modify(fixture)
    try:scope['assess'](fixture,live,when,1)
    except Exception:controls.append({'case':name,'decision':'HOLD'})
    else:raise AssertionError(name)
out={'disposition':'FAILED_ABORTED_INCOMPLETE_ATTEMPT_CLOSURE_SUPPORTED','safeDispatchPinsVerified':27,'fixedProducerInspectedBeforePureReplay':True,'currentSourceFilesAndModesRehashed':1808,'mainMembershipAndBytes':506,'distFiles':238,'auxCounts':[22,20,6],'nativeFull99':'FAIL; zero completed XML/incomplete','toolLinesOnly':{'PASSED':33,'FAILED':13,'abortSKIPPED':1,'Session44Unexecuted':True},'caseOrSkipCredit':False,'peerDataIntegrityIsSqlStateRequestOrFirstCauseProof':False,'phaseOwnedCount':12,'diagnosticClientCount':1,'totalRecordedOwnedCount':13,'inheritedMatched':6,'otherProjectFacts':0,'recordedNewGaps':[],'originalCompileActuallyExecutedSupportedByProvenanceAndInspectedProducer':True,'rawCompileOrTestLogReadByReviewer':False,'guardNegativeActualRecorded':True,'negativeOutputChunk':'a72bc3','separateStatusChunk':'cb3331','actualFinalGuardRecorded':'ALLOW_VERIFIED/exit1','finalGuardOutputChunk':'212abe','pureReplayIsNewAuthorization':False,'pureHistoricalReplay':'ALLOW_VERIFIED at injected historical fresh time','pureNegativeControls':controls,'gst03Control01ProspectiveRemediation':'SUPPORTED_REMEDIATED_FOR_EXACT_REVIEWED_GUARDED_SEQUENCE','globalEffectivenessSecurityBypassCrashEofGuarantee':False,'historicalUnit03GapRepairOrOldPreunlockProof':False,'futureExecutionAdmissionReleased':False,'mainReplayGeneralW1IrLaneC8BatonOrLifecycleCredit':False,'rawThreadProtectedBinaryTempJournalBusinessOrLocatorReadStatHash':False,'newRuntimeProducerHelperMainProcessLockSignalAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

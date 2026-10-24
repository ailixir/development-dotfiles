"""Read-only SOURCE/PUBLIC projected receipt audit. Never inspect protected exclusions.
No helper import/main, native invocation, process census, signal, or lock operation.
"""
from pathlib import Path
from collections import Counter
import ast, datetime, hashlib, json, re, stat

R=Path.cwd(); T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'runtime/obs011-gst-provisional-02'; U=T/'runtime/gst-restricted-unit02'
O=T/'qa/gst-unit02-closed-runtime-review'; E=T.parent/'execution'
ctx=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-unit02-closed-runtime-review-context.json'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
C=read(ctx); assert len(C['pins'])==53
for row in C['pins']:
    assert not any(row['path'].startswith(x) for x in C['protectedExclusions'])
    assert sha(R/row['path'])==row['sha256'], row['path']
A=read(D/'root-actual-unit-release.json'); lock=read(D/'active-lock.json')
assert A['sourceWriterReleased'] is A['nativeCommandReleased'] is True
assert A['originalsAndNativeTempMustNotBeCleaned'] is True
assert lock['kernelExclusiveLockObserved'] is True
assert (lock['wrapperPid'],lock['shellPid'],lock['toolSession'])==(82456,82457,74865)
assert A['phaseKeeperSha256']==sha(D/'owned_native_phase.py')
P=T/'early/gst-restricted-unit-prep/resume2'
assert A['recipeManifestSha256']==sha(P/'manifest.json')
assert A['phaseCheckerSha256']==sha(P/'phase.py') and A['initSha256']==sha(P/'gst-three-only.init.gradle')
assert A['preparedBackupRecordSha256']==sha(D/'prepared-inputs-and-backups.json')
assert A['resourceBoundarySha256']==sha(D/'fresh-boundary-before-lock.json')
assert A['independentOrderingSha256']==sha(T/'qa/gst-limited-ordering-review/review.md')

# Independent exact source comparison, with no capture helper execution.
snapshots={n:read(U/(n+'.json')) for n in ['before','staged','formatted','restored','after-restore-compile']}
maps={n:{x['path']:x['sha256'] for x in v['files']} for n,v in snapshots.items()}
base=maps['before']; assert len(base)==1808
writers={x['file']:x for x in A['writers']}; assert len(writers)==3
successor=read(U/'format-successor.json'); formatted=successor['formattedSha256']
assert set(formatted)==set(writers)
assert maps['staged']==base|{p:x['afterSha256'] for p,x in writers.items()}
assert maps['formatted']==base|formatted
assert maps['restored']==maps['after-restore-compile']==base
assert snapshots['before']['digest']==snapshots['restored']['digest']==snapshots['after-restore-compile']['digest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
assert snapshots['formatted']['digest']=='5978e5ebe831172cdf9e454242e1decd2c75c6b9aeee68b3385df3b00eb3064f'
for s in snapshots.values(): assert s['dist']==snapshots['before']['dist'] and len(s['dist']['files'])==238
modes=read(U/'original-modes.json'); assert set(modes)==set(base)
for path,digest in base.items():
    p=R/path; assert not p.is_symlink() and sha(p)==digest and stat.S_IMODE(p.stat().st_mode)==modes[path], path
for row in snapshots['before']['dist']['files']: assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
main={p for p in base if p.startswith('backend/src/main/')}
assert len(main)==506
assert {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
plan=read(T/'early/fullcheck-harness/resume3/plan.json')
for group,count in [('helm',22),('quotedCurrent',20),('immutableHelpers',6)]:
    assert len(plan[group])==count
    for path,digest in plan[group].items(): assert sha(R/path)==digest
archive=read(D/'formatted-candidate-archive.json'); assert len(archive)==3
assert {x['source']:x['sha256'] for x in archive}==formatted
assert read(U/'owned-formatted-bytes.json')==read(U/'restoration-owned-bytes.json')==formatted
for row in archive:
    assert sha(R/row['archive'])==row['sha256'] and (R/row['archive']).stat().st_size==row['bytes']
backups=read(D/'prepared-inputs-and-backups.json')['backups']
for row in backups: assert sha(R/row['backup'])==base[row['source']]==writers[row['source']]['beforeSha256']

# Extract only pure token functions/constants, never import the phase checker.
tree=ast.parse((P/'phase.py').read_text()); ns={'re':re}
body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'hold','java_tokens','split_imports','format_only'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TOKEN' for t in n.targets)]
exec(compile(ast.Module(body=body,type_ignores=[]),'<pure-source-token-comparison>','exec'),ns)
for row in archive:
    original=T/'early/gs-t-draft/repo'/row['source']
    assert sha(original)==writers[row['source']]['afterSha256']
    assert ns['format_only'](original.read_bytes(),(R/row['archive']).read_bytes())==successor['unusedExplicitImportsRemoved'][row['source']]==[]
assert successor['literalTokensExact'] is successor['otherJavaTokensExact'] is True

# The recorded native command selects all five whole classes and requires fresh exec.
expected=A['expectedCases']; identity=lambda x:(x['task'],x['class'],x['name'])
assert len(expected)==len(set(identity(x) for x in expected))==99
assert Counter(x['class'].rsplit('.',1)[-1] for x in expected)=={'GuidedSessionIT':44,'GuidedServiceTransportFaultIT':39,'GuidedLifecycleReasonIT':5,'GuidedEvidencePendingAppendIT':8,'GuidedCommittedRefreshStateTest':3}
receipts={}; keepers={}
for phase,code,num in [('format',0,3),('native',1,7),('restore-compile',0,2)]:
    v=read(D/('owned-'+phase)/'receipt.json'); receipts[phase]=v
    assert v['phase']==phase and v['status']=='NATIVE_PHASE_TERMINAL' and v['collectorExit']==code
    assert v['command']==A['nativePhases'][phase]['argv'] and v['lockPin']==lock
    assert v['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json')
    assert v['phaseKeeperSha256']==A['phaseKeeperSha256'] and not v['evidenceErrors']
    assert v['automaticRetry'] is False and v['noLaneCredit'] is True
    assert len(v['ownedIdentities'])==num and not v['remainingOwnedNonJvmFacts']
    assert not v.get('ownedIdentityObservationGap',False)
    assert all(not x.get('observationError') for x in v['ownedIdentities'])
    assert all(x['proof']=='PID_ABSENT' for x in v['ownedJvmTerminalProof'])
    k=read(D/(phase+'-keeper.stdout.log')); keepers[phase]=k
    assert k['exit']==code and k['ownedRecorded']==num and k['ownedIdentityObservationGap'] is False
    assert k['remainingOwnedNonJvmCount']==0 and k['noLaneCredit'] is True
    assert k['logSha256']==sha(U/A['nativePhases'][phase]['logName'])
    exitrecord=read(U/(phase+'-exit.json'))
    assert exitrecord['exit']==code and exitrecord['logSha256']==k['logSha256'] and exitrecord['proofCredit'] is False
assert '> Task :spotlessJavaApply\n' in (U/'format.log').read_text()
compilelog=(U/'restore-compile.log').read_text()
assert '> Task :compileTestJava\n' in compilelog and 'BUILD SUCCESSFUL' in compilelog
result=read(E/'obs011-gst-provisional-02-results.json'); baseline=read(E/'obs011-gst-provisional-02-default-task-base-results.json')
assert result['exit']==result['gradleExit']==baseline['exit']==1
assert not result['testcases'] and not result['xmlFiles'] and not result['testHtmlFiles']
assert result['counts']==baseline['counts']=={'total':0,'passed':0,'failed':0,'errors':0,'skipped':0}
assert result['taskCollectionComplete'] is result['validationSucceeded'] is False
assert result['sourceStable'] is result['distStable'] is result['testInputStable'] is True
assert result['testInputDigestBefore']==result['testInputDigestAfter']==snapshots['formatted']['digest']
assert result['defaultTaskBaseReceipt']['sha256']==sha(E/'obs011-gst-provisional-02-default-task-base-results.json')
assert result['taskResults']['test']['freshExec'] is True and result['taskResults']['test']['freshXmlFiles']==0 and result['taskResults']['test']['freshHtmlIndex'] is False
assert {x['reason'] for x in result['taskCollectionErrors']}=={'MISSING_FRESH_NONEMPTY_XML','MISSING_FRESH_HTML_INDEX'}
assert len(result['jacocoExecFiles'])==1 and result['jacocoExecFiles'][0]['nonempty'] is True
case=read(U/'case-proof.json'); assert case['expected']==99 and case['actual']==0 and case['identityMultisetExact'] is False and case['C8OrLaneCredit'] is False
log=(E/'obs011-gst-provisional-02.log').read_text(); assert sha(E/'obs011-gst-provisional-02.log')==result['logSha256']
interim=[x for x in log.splitlines() if re.search(r' > .* (PASSED|FAILED)$',x)]
assert (sum(x.endswith('PASSED') for x in interim),sum(x.endswith('FAILED') for x in interim))==(20,26)
assert "Gradle Test Executor 1' finished with non-zero exit value 143" in log and 'BUILD FAILED' in log

# Diagnostic/recovery chain is checked as historical recorded facts only.
diagnostic_release=read(D/'root-owned-thread-print-release.json'); diagnostic=read(D/'owned-thread-print-result.json')
projection=read(D/'owned-thread-print-fixed-projection.json'); recovery_release=read(D/'root-owned-worker-recovery-release.json'); recovery=read(D/'owned-worker-recovery-result.json')
before=read(D/'owned-stall-pre-diagnostic-identities.json'); presignal=read(D/'owned-worker-recovery-pre-signal-identities.json')
target=diagnostic_release['target']; assert target['pid']==84782 and target['ppid']==84218 and target['identityComplete'] is True
assert next(x for x in before['identities'] if x['pid']==84782)==next(x for x in presignal['identities'] if x['pid']==84782)==target==diagnostic['targetIdentityBefore']
assert presignal['sameStartTargetComplete'] is True and presignal['incompleteRowsRetained'] is True
assert sum(x['identityComplete'] is False for x in presignal['identities'])==2
assert diagnostic_release['targetIdentitySourceSha256']==sha(D/'owned-stall-pre-diagnostic-identities.json')
assert diagnostic['releaseSha256']==sha(D/'root-owned-thread-print-release.json')
assert diagnostic['argv']==diagnostic_release['jcmdArgv'] and diagnostic['exit']==0 and diagnostic['elapsedSeconds']<=10 and diagnostic['bytes']<=2097152
assert diagnostic['timedOut'] is diagnostic['truncated'] is False
assert diagnostic['targetSignalsSent']==0 and diagnostic['targetSameStartAfter'] is diagnostic['diagnosticChildTerminated'] is diagnostic['kernelLockVerified'] is True
chain=diagnostic['targetAncestorChainBefore']; assert [x['pid'] for x in chain]==[84782,84218,84187,84179,84176,84172,82457,82456]
for child,parent in zip(chain,chain[1:]): assert child['ppid']==parent['pid']
assert projection['rawSha256']==diagnostic['rawSha256'] and projection['otherRawBodyReleased'] is False and projection['stackSnapshotDoesNotProveFullHistoryOrCause'] is True
transport=next(R/x['archive'] for x in archive if x['source'].endswith('/GuidedServiceTransportFaultIT.java'))
assert projection['candidateSourceSha256']==sha(transport)
source=transport.read_text().splitlines()
for frame in projection['fixedCandidateFramesOnly']:
    fragment=source[frame['sourceLine']-1]
    assert {'SourceStopOwner.drainUninterruptibly':'settled.await();','attemptGuidedCutCleanup':'action.run();','runGuidedControllerCut':'owner::drainUninterruptibly','actualConsumedGuidedControllerJvmCrashBeforeResolutionReconcilesWithoutReadOrPost':'runGuidedControllerCut(true);'}[frame['fixedCandidateFrame']] in fragment
assert recovery_release['fullIdentitySourceSha256']==sha(D/'owned-stall-pre-diagnostic-identities.json') and recovery_release['fixedSnapshotProjectionSha256']==sha(D/'owned-thread-print-fixed-projection.json')
assert (recovery_release['targetPid'],recovery_release['targetStart'],recovery_release['targetParent'])==(target['pid'],target['start'],target['ppid'])
assert recovery['releaseSha256']==sha(D/'root-owned-worker-recovery-release.json')
assert recovery['classification']=='ABORTED_FAILED_INCOMPLETE' and recovery['status']=='WORKER_IDENTITY_TERMINAL' and recovery['terminalProof']=='PID_ABSENT'
assert len(recovery['signals'])==1 and recovery['signals'][0]['signal']=='SIGTERM' and recovery['signals'][0]['pid']==84782 and recovery['signals'][0]['start']==target['start']
assert recovery['semanticCompletionClaimed'] is False and recovery['controllersNotSignalled'] is recovery['otherDescendantsNotSignalled'] is True
date=lambda s:datetime.datetime.fromisoformat(s)
assert date(diagnostic_release['atUtc'])<date(diagnostic['atUtc'])<date(recovery_release['atUtc'])<date(presignal['atUtc'])<date(recovery['signals'][0]['atUtc'])<date(recovery['atUtc'])<date(receipts['native']['collectorTerminatedAtUtc'])<date(receipts['restore-compile']['collectorStartedAtUtc'])

# Closure is a saved terminal/kernel observation, not a reviewer live census.
pre=read(D/'root-preunlock-restored-terminal.json'); closed=read(D/'root-unit-closed.json')
owned={(x['pid'],x['start']) for v in receipts.values() for x in v['ownedIdentities']}
assert len(owned)==12 and {(x['pid'],x['start']) for x in pre['recordedOwnedTerminal']}==owned
assert all(x['proof']=='PID_ABSENT' for x in pre['recordedOwnedTerminal'])
assert pre['nativeWorkerExit']==143 and pre['nativeGradleExit']==pre['nativeCollectorExit']==1
assert pre['full99Proof'] is pre['taskCollectionComplete'] is False and pre['collectedXmlCases']==0
assert pre['source1808OriginalRestored'] is pre['main506Original'] is pre['dist238Original'] is True
assert pre['restoreCompileExit']==0 and pre['originalNativeTempCleanup'] is pre['semanticStopCompletionClaimed'] is False
boundary_before=read(D/'fresh-boundary-before-lock.json')['inventory']; boundary_after=pre['boundary']
assert boundary_before['inheritedMatched']==boundary_after['inheritedMatched'] and len(boundary_after['inheritedMatched'])==6
for b in [boundary_before,boundary_after]:
    for key in ['originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts']: assert not b[key]
    assert b['quietHostClaimed'] is b['cleanupOwnershipClaimed'] is False
assert closed['preunlockRecordSha256']==sha(D/'root-preunlock-restored-terminal.json')
assert closed['status']=='CLOSED_ABORTED_FAILED_INCOMPLETE_SOURCE_ORIGINAL_COMPILE_RECONCILED' and closed['toolSession']==74865 and closed['toolExit']==1
assert closed['kernelLockFreeObserved'] is closed['sourceWriterLeaseClosed'] is closed['originalNativeTempNotCleaned'] is True
assert closed['retryReleased'] is closed['sourceMainOrReplayRelease'] is closed['C8OrLaneCredit'] is False
assert {x['pid'] for x in closed['wrapperAndShellTerminal']}=={82456,82457} and all(x['proof']=='PID_ABSENT' for x in closed['wrapperAndShellTerminal'])
assert date(receipts['restore-compile']['collectorTerminatedAtUtc'])<date(pre['atUtc'])<date(closed['atUtc'])

out={'disposition':'CLOSED_FAILED_INCOMPLETE_ATTEMPT_RESTORATION_SUPPORTED','dispatchPinsVerified':53,'rootReleaseSha256':sha(D/'root-actual-unit-release.json'),'closedReceiptSha256':sha(D/'root-unit-closed.json'),'formatterExit':0,'formatTokensIndependentlyEqual':True,'sourceDeltasExactlyThree':True,'nativeWorkerExit':143,'gradleExit':1,'collectorAndNativeKeeperExit':1,'freshXmlCases':0,'interimToolLinesOnly':{'passed':20,'failed':26},'full99Satisfied':False,'taskCollectionComplete':False,'freshExecAloneCoverageCredit':False,'sourceFilesCurrentlyRehashed':1808,'sourceModesCurrentlyChecked':1808,'mainMembershipAndHashes':506,'distFilesRehashed':238,'auxCounts':[22,20,6],'originalCompileExit':0,'compileTestJavaActuallyExecutedInSavedLog':True,'historicalOwnedIdentitiesTerminal':12,'remainingOwnedNonJvmRecorded':0,'recordedObservationGap':False,'inheritedExactIdentities':6,'otherProjectFactsRecorded':0,'savedToolExit':1,'savedKernelLockFree':True,'diagnosticAndRecoveryReviewedRetrospectively':True,'signalsRecorded':[{'pid':84782,'signal':'SIGTERM'}],'rawDiagnosticOrBinaryBodyReadStatHashByReviewer':False,'rawNativeTempBusinessOrJournalAccess':False,'newNativeHelperProcessOrLockAction':False,'semanticStopCompletionOrRootCauseProved':False,'attemptMayCloseWithoutCredit':True,'sourceOrNativeSuccessorReleased':False,'laneW1MainReplayC8LifecycleCredit':False,'originalsAndNativeTempMustRemainPreserved':True,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))

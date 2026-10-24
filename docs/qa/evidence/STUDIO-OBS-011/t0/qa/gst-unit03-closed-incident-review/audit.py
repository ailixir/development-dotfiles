"""Independent SOURCE/PUBLIC receipt audit. No raw diagnostic/binary/TEMP access,
helper main, native execution, live process census, signal or kernel-lock action.
"""
from pathlib import Path
from collections import Counter
import ast,datetime,hashlib,json,re,stat
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-gst-provisional-03'
U=T/'runtime/gst-restricted-unit03';E=T.parent/'execution';O=T/'qa/gst-unit03-closed-incident-review'
B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
date=lambda s:datetime.datetime.fromisoformat(s)
ctx=read(B/'gst-unit03-closed-incident-review-context.json');assert len(ctx['pins'])==53
for row in ctx['pins']:
    assert not any(s in row['path'] for s in ['diagnostic-thread-print.private','failed-test-output-protected-archive'])
    assert sha(R/row['path'])==row['sha256'],row['path']
A=read(D/'root-actual-unit-release.json');L=read(D/'active-lock.json');RL=read(D/'reconciliation-active-lock.json')
I=read(D/'root-premature-unlock-incident.json');Q=read(D/'qualified-post-unlock-reconciliation.json');C=read(D/'root-unit-closed.json')
assert A['phaseKeeperSha256']==sha(D/'owned_native_phase.py') and A['preparedBackupRecordSha256']==sha(D/'prepared-inputs-and-backups.json')
assert A['resourceBoundarySha256']==sha(D/'fresh-boundary-before-lock.json')
assert A['independentOrderingSha256']==sha(T/'qa/gst-unit03-composed-start-review/review.md')
assert A['independentArchitectureSha256']==sha(T/'resume-architecture/resume2/gst-unit03-composed-start-review/review.md')
P=T/'early/gst-restricted-unit-prep/resume3';DRAFT=T/'early/gs-t-draft/resume4-finite-observation'
assert sha(P/'manifest.json')==A['recipeManifestSha256'] and sha(P/'phase.py')==A['phaseCheckerSha256'] and sha(P/'gst-three-only.init.gradle')==A['initSha256']
assert sha(DRAFT/'manifest.json')==A['candidateManifestSha256'] and sha(DRAFT/'filtered-output.init.gradle')==A['observerInitSha256']
assert (L['toolSession'],L['wrapperPid'],L['shellPid'])==(70580,72960,72961)
assert (RL['toolSession'],RL['wrapperPid'],RL['shellPid'])==(29335,98997,98998)
assert L['kernelExclusiveLockObserved'] is RL['kernelExclusiveLockObserved'] is True and L['lockDevInode']==RL['lockDevInode']
assert RL['sourceWriterScope']=='READONLY post-unlock incident reconciliation; NO source or native writer'

# Exact source/restoration/current modes and outside-three binding comparisons.
snap={n:read(U/(n+'.json')) for n in ['before','staged','formatted','restored','after-restore-compile']}
maps={n:{x['path']:x['sha256'] for x in v['files']} for n,v in snap.items()};base=maps['before'];assert len(base)==1808
writers={x['file']:x for x in A['writers']};assert len(writers)==3
fmt=read(U/'format-successor.json');formatted=fmt['formattedSha256'];assert set(formatted)==set(writers)
assert maps['staged']==base|{p:x['afterSha256'] for p,x in writers.items()} and maps['formatted']==base|formatted
assert maps['restored']==maps['after-restore-compile']==base
assert snap['before']['digest']==snap['restored']['digest']==snap['after-restore-compile']['digest']==A['originalSourceDigest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
modes=read(U/'original-modes.json');assert set(modes)==set(base)
for path,digest in base.items():
    p=R/path;assert not p.is_symlink() and sha(p)==digest and stat.S_IMODE(p.stat().st_mode)==modes[path],path
main={p for p in base if p.startswith('backend/src/main/')};assert len(main)==506
assert {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
for v in snap.values():assert v['dist']==snap['before']['dist'] and len(v['dist']['files'])==238
for row in snap['before']['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
plan=read(T/'early/fullcheck-harness/resume3/plan.json')
for group,count in [('helm',22),('quotedCurrent',20),('immutableHelpers',6)]:
    assert len(plan[group])==count
    for path,digest in plan[group].items():assert sha(R/path)==digest
archive=read(D/'formatted-candidate-archive.json');assert len(archive)==3
assert {x['source']:x['sha256'] for x in archive}==formatted==read(U/'owned-formatted-bytes.json')==read(U/'restoration-owned-bytes.json')
for row in archive:assert sha(R/row['archive'])==row['sha256'] and (R/row['archive']).stat().st_size==row['bytes']
for row in read(D/'prepared-inputs-and-backups.json')['backups']:assert sha(R/row['backup'])==base[row['source']]==writers[row['source']]['beforeSha256']
tree=ast.parse((P/'phase.py').read_text());ns={'re':re}
body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'hold','java_tokens','split_imports','format_only'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TOKEN' for t in n.targets)]
exec(compile(ast.Module(body=body,type_ignores=[]),'<pure-token-checks-only>','exec'),ns)
for row in archive:
    draft=DRAFT/'repo'/row['source'];assert sha(draft)==writers[row['source']]['afterSha256']
    assert ns['format_only'](draft.read_bytes(),(R/row['archive']).read_bytes())==fmt['unusedExplicitImportsRemoved'][row['source']]==[]
assert fmt['literalTokensExact'] is fmt['otherJavaTokensExact'] is True

# Keep successful command execution distinct from the sticky ownership qualification.
receipts={};keepers={}
for phase,exitcode,count,gap in [('format',0,3,True),('native',1,7,False),('restore-compile',0,2,False)]:
    v=read(D/('owned-'+phase)/'receipt.json');receipts[phase]=v;k=read(D/(phase+'-keeper.stdout.log'));keepers[phase]=k
    assert v['status']=='NATIVE_PHASE_TERMINAL' and v['collectorExit']==k['exit']==exitcode
    assert v['command']==A['nativePhases'][phase]['argv'] and v['lockPin']==L and v['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json')
    assert v['phaseKeeperSha256']==A['phaseKeeperSha256'] and len(v['ownedIdentities'])==k['ownedRecorded']==count
    assert v.get('ownedIdentityObservationGap',False) is k['ownedIdentityObservationGap'] is gap
    assert not v['remainingOwnedNonJvmFacts'] and k['remainingOwnedNonJvmCount']==0 and v['automaticRetry'] is False
    assert k['logSha256']==sha(U/A['nativePhases'][phase]['logName'])
    er=read(U/(phase+'-exit.json'));assert er['exit']==exitcode and er['logSha256']==k['logSha256'] and er['proofCredit'] is False
    qr=next(x for x in Q['phaseEvidence'] if x['phase']==phase);assert qr['receiptSha256']==sha(D/('owned-'+phase)/'receipt.json')
    assert qr['retainedObservationFlags']['ownedIdentityObservationGap'] is gap
assert next(x for x in receipts['format']['ownedIdentities'] if x['pid']==73940)['identityObservation']=='UNKNOWN'
assert '> Task :spotlessJavaApply\n' in (U/'format.log').read_text()
compilelog=(U/'restore-compile.log').read_text();assert '> Task :compileTestJava\n' in compilelog and 'BUILD SUCCESSFUL' in compilelog
assert date(receipts['native']['collectorTerminatedAtUtc'])<date(snap['restored']['capturedAt'])<date(receipts['restore-compile']['collectorStartedAtUtc'])<date(receipts['restore-compile']['collectorTerminatedAtUtc'])<date(snap['after-restore-compile']['capturedAt'])<date(I['atUtc'])

# Actual failed collection and finite observation, not completed testcase evidence.
r=read(E/'obs011-gst-provisional-03-results.json');b=read(E/'obs011-gst-provisional-03-default-task-base-results.json');case=read(U/'case-proof.json')
assert r['exit']==r['gradleExit']==b['exit']==1 and not r['testcases'] and not r['xmlFiles'] and not r['testHtmlFiles']
assert r['counts']=={'total':0,'passed':0,'failed':0,'errors':0,'skipped':0}
assert r['taskCollectionComplete'] is r['validationSucceeded'] is False and r['taskResults']['test']['freshExec'] is True
assert r['testInputDigestBefore']==r['testInputDigestAfter']==snap['formatted']['digest']
assert r['defaultTaskBaseReceipt']['sha256']==sha(E/'obs011-gst-provisional-03-default-task-base-results.json')
assert case['expected']==99 and case['actual']==0 and case['identityMultisetExact'] is False
assert len(A['expectedCases'])==len(set((x['task'],x['class'],x['name']) for x in A['expectedCases']))==99
projection=read(D/'closed-tool-case-line-projection.json');log=(E/'obs011-gst-provisional-03.log').read_text()
assert sha(E/'obs011-gst-provisional-03.log')==r['logSha256']==projection['toolLogSha256']
interim=[x for x in log.splitlines() if re.search(r' > .* (PASSED|FAILED)$',x)]
assert Counter(x['status'] for x in projection['records'])=={'PASSED':32,'FAILED':14}
assert (sum(x.endswith('PASSED') for x in interim),sum(x.endswith('FAILED') for x in interim))==(32,14)
finite=[x for x in log.splitlines() if x.startswith('GST_DIAG|')]
assert finite==projection['finiteObserverRecords']==['GST_DIAG|site=CUT_PRIMARY|route=NONE|status=409|family=GUIDED_SESSION|code=UNKNOWN_OUTCOME|frame=CLIENT_SEND|line=296']
assert "Gradle Test Executor 1' finished with non-zero exit value 143" in log and 'BUILD FAILED' in log
client=R/'backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java';cl=client.read_text().splitlines()
assert 'throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);' in cl[295]
assert all(x in '\n'.join(cl[291:296]) for x in ['ExecutionException','TimeoutException','CancellationException'])

# Independently match saved diagnostic/recovery identities and chronology, no raw body.
dr=read(D/'root-owned-thread-print-release.json');dv=read(D/'owned-thread-print-result.json');dp=read(D/'owned-thread-print-fixed-projection.json')
rr=read(D/'root-owned-worker-recovery-release.json');rv=read(D/'owned-worker-recovery-result.json');pre=read(D/'owned-worker-recovery-pre-signal-identities.json');before=read(D/'owned-stall-pre-diagnostic-identities.json')
target=dr['target'];assert target['pid']==76623 and target['ppid']==76004 and target['identityComplete'] is True
assert target==before['targetWorker']==dv['targetIdentityBefore']==rr['target']==next(x for x in pre['identities'] if x['pid']==76623)
assert dr['targetIdentitySourceSha256']==sha(D/'owned-stall-pre-diagnostic-identities.json') and dv['releaseSha256']==sha(D/'root-owned-thread-print-release.json')
assert dv['argv']==dr['jcmdArgv'] and dv['exit']==0 and dv['elapsedSeconds']==0.107 and dv['bytes']==39888 and not dv['timedOut'] and not dv['truncated']
assert dv['targetSignalsSent']==0 and dv['targetSameStartAfter'] is dv['kernelLockVerified'] is dv['diagnosticChildTerminated'] is True
chain=dv['targetAncestorChainBefore'];assert chain==dr['targetAncestorChain']==before['targetAncestorChain']
assert [x['pid'] for x in chain]==[76623,76004,75961,75942,75939,75926,72961,72960]
for child,parent in zip(chain,chain[1:]):assert child['ppid']==parent['pid']
assert dp['captureResultSha256']==sha(D/'owned-thread-print-result.json') and dp['rawSha256']==dv['rawSha256']
transport=next(R/x['archive'] for x in archive if x['source'].endswith('/GuidedServiceTransportFaultIT.java'));sl=transport.read_text().splitlines()
assert list(dp['sourceBindings'].values())==[sha(transport)]
frames=dp['threads'][0]['fixedFrames'];assert frames==[{'frame':'STOP_OWNER_DRAIN','sourceLine':3436},{'frame':'CUT_CLEANUP','sourceLine':2999},{'frame':'CUT_RUN','sourceLine':2952}]
assert 'settled.await();' in sl[3435] and 'action.run();' in sl[2998] and 'owner::drainUninterruptibly' in sl[2951]
assert rr['preSignalIdentitySha256']==sha(D/'owned-worker-recovery-pre-signal-identities.json') and rr['diagnosticResultSha256']==sha(D/'owned-thread-print-result.json') and rr['fixedProjectionSha256']==sha(D/'owned-thread-print-fixed-projection.json')
assert rv['releaseSha256']==sha(D/'root-owned-worker-recovery-release.json') and rv['terminalProof']=='PID_ABSENT' and rv['status']=='WORKER_IDENTITY_TERMINAL'
assert len(rv['signals'])==1 and rv['signals'][0]['pid']==76623 and rv['signals'][0]['start']==target['start'] and rv['signals'][0]['signal']=='SIGTERM'
assert rv['controllersNotSignalled'] is rv['otherDescendantsNotSignalled'] is True and rv['semanticCompletionClaimed'] is False
assert date(dr['atUtc'])<date(dv['atUtc'])<date(pre['atUtc'])<date(rr['atUtc'])<date(rv['signals'][0]['atUtc'])<date(rv['atUtc'])<date(receipts['native']['collectorTerminatedAtUtc'])

# The later hold establishes later recorded facts; it cannot erase either old gap.
assert I['oldToolSession']==70580 and I['oldWrapperPid']==72960 and I['oldShellPid']==72961 and I['oldWrapperExit']==1 and I['gateCredit'] is False
assert Q['incidentSha256']==sha(D/'root-premature-unlock-incident.json')==C['incidentSha256']
assert C['qualifiedPostUnlockReconciliationSha256']==sha(D/'qualified-post-unlock-reconciliation.json')
assert Q['reconciliationLockPinSha256']==sha(D/'reconciliation-active-lock.json') and Q['reconciliationHeldSession']==29335
assert Q['oldPreunlockVerificationPassed'] is Q['oldTemporalGapRepaired'] is C['oldPreunlockProof'] is C['oldTemporalGapRepaired'] is False
assert Q['historicalObservationGapsPreserved'] is C['stickyFormatOwnedIdentityObservationGap'] is True
assert Q['originalCompilationBeforeOldUnlockExit']==0 and Q['compileTestJavaActuallyExecutedBeforeOldUnlock'] is Q['noNewCompilationOrSourceWriterUnderReconcileHold'] is True
owned={(x['pid'],x['start']) for v in receipts.values() for x in v['ownedIdentities']};assert len(owned)==12
assert {(x['pid'],x['start']) for x in Q['recordedOwnedTerminalNow']}==owned and all(x['proof']=='PID_ABSENT' for x in Q['recordedOwnedTerminalNow'])
assert Q['diagnosticClientTerminalNow']=={'pid':dv['diagnosticPid'],'start':dv['diagnosticStart'],'proof':'PID_ABSENT'}
oldboundary=read(D/'fresh-boundary-before-lock.json')['inventory'];nowboundary=Q['boundaryNow']
assert oldboundary['inheritedMatched']==nowboundary['inheritedMatched'] and len(nowboundary['inheritedMatched'])==6
for bnd in [oldboundary,nowboundary]:
    for k in ['originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts']:assert not bnd[k]
    assert bnd['quietHostClaimed'] is bnd['cleanupOwnershipClaimed'] is False
assert C['originalToolSession']==70580 and C['originalToolExit']==1 and C['reconciliationToolSession']==29335 and C['reconciliationToolExit']==1
assert {x['pid'] for x in C['wrapperAndShellTerminal']}=={72960,72961,98997,98998} and all(x['proof']=='PID_ABSENT' for x in C['wrapperAndShellTerminal'])
assert C['kernelLockFreeObservedNow'] is C['sourceWriterLeaseClosed'] is C['originalNativeTempNotCleaned'] is True
assert C['retryReleased'] is C['sourceMainOrReplayRelease'] is C['C8OrLaneCredit'] is False
assert date(I['atUtc'])<date(RL['atUtc'])<date(Q['atUtc'])<date(C['atUtc'])
out={'disposition':'QUALIFIED_CLOSED_FAILED_ABORTED_INCOMPLETE_WITH_UNREPAIRED_CONTROL_INCIDENT','dispatchPinsVerified':53,'sourceCurrentBytesAndModes':1808,'mainCurrentMembershipAndBytes':506,'distCurrentBytes':238,'auxCounts':[22,20,6],'exactThreeCandidateAndTokenCarry':True,'formatterCommandExit':0,'formatterOwnedIdentityObservationGapSticky':True,'nativeWorkerExit':143,'gradleCollectorAndCheckerExit':1,'freshCollectedXmlCases':0,'interimLinesOnly':{'passed':32,'failed':14},'complete99Proof':False,'finitePrimaryObservation':finite[0],'underlyingExceptionClassAmongThreeProved':False,'missingCallbackRecordsIsUnproven':True,'diagnosticClientExit':0,'diagnosticBytes':39888,'diagnosticSeconds':0.107,'signalsRecorded':[{'pid':76623,'signal':'SIGTERM'}],'semanticStopCompletionProved':False,'originalRestoreCompileExit':0,'compileTestJavaExecutedInSavedLog':True,'restoreAndCheckRestoredCheckpointBeforeIncident':True,'normalPreunlockProof':False,'oldTemporalGapRepaired':False,'historicalNoGapOwnershipProof':False,'incidentFinding':'GST03-CONTROL-01','incidentDisposition':'Confirmed premature unlock after failed preunlock assertion; future dependent-phase/status/qualified-close controls required before new execution admission.','originalHold':70580,'laterReadOnlyReconciliationHold':29335,'laterRecordedOwnedTerminal':12,'laterDiagnosticClientTerminal':True,'laterInheritedExact':6,'laterOtherProjectFacts':0,'savedLockFreeAfterBothHolds':True,'qualifiedFailedAttemptMayClose':True,'futureSourceOrNativeAdmissionReleased':False,'originalRedsGapsArchivesProtectedOutputsAndTempMustRemain':True,'reviewerLiveProcessLockOrSignalAction':False,'rawDiagnosticProtectedBinaryNativeTempBusinessJournalOrLocatorAccess':False,'helperNativeCompilerFormatterExecution':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

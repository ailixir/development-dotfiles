"""Postclose supplement using explicit safe metadata/source only.
No helpers, live census/kernel/PTY actions, private bodies or new authorization.
"""
from pathlib import Path
from collections import Counter
import ast,datetime,hashlib,json,stat
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-gst-provisional-06';U=T/'runtime/gst-restricted-unit06';O=T/'qa/gst-unit06-postclose-review';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
preflight=read(B/'gst-unit06-postclose-review-preflight.json');assert preflight['scan']['safe'] is True and preflight['budgetCeilingUsd']==500
pins={'ready':(D/'preunlock-verification.json','7f073840349ef394c074f4c74542df25ca803b4ef9f008af81400a5166810fa0'),'permit':(D/'unlock-permit.json','f1c3e24d3e1c8a812464ab3294583bd1845332ac2c00ee0d0278f5629872ff2e'),'closed':(D/'root-unit-closed.json','3caac8d7d617e3f28f89dd805bc33f57c81150316787b062a0fc0a10ee6992f1')}
for path,digest in pins.values():assert sha(path)==digest
V=read(pins['ready'][0]);P=read(pins['permit'][0]);C=read(pins['closed'][0]);A=read(D/'root-actual-unit-release.json');L=read(D/'active-lock.json')
prior=T/'qa/gst-unit06-actual-retention-review';assert sha(prior/'review.md')=='9bb280fa63eeef9235d4538aa8cd6950439138336d26d832b98de25fa3286645'
prior_review=read(prior/'review.json');prior_audit=read(prior/'audit.json')
assert prior_review['unitClosed'] is False and prior_audit['producerInvokedOrReadinessPermitPresent'] is False
assert V['producerSha256']==sha(D/'verify-final-before-unlock.py')=='ca3b078da598dcd7a387013fa1840704b6f53131b03234b0d561540d9ab87b0e'
assert V['rootReleaseSha256']==P['rootReleaseSha256']==C['rootReleaseSha256']==sha(D/'root-actual-unit-release.json')
assert V['activeLockSha256']==P['activeLockSha256']==sha(D/'active-lock.json')
assert V['status']=='VERIFIED' and V['verificationExit']==P['actualFinalVerificationExitInspected']==0 and V['expectedWrapperExit']==P['expectedWrapperExit']==C['actualWrapperExit']==0
assert V['phaseState']==P['phaseState']=={'format':'TERMINAL','native':'TERMINAL','restore-compile':'NOT_STARTED'}
assert V['gaps']==V['manualGaps']==P['gaps']==[] and V['retroactiveRepairClaim'] is False
assert V['source']['disposition']==C['sourceDisposition']=='RETAIN_AUTHORIZED_THREE'
assert V['source']['overrides']==P['sourceOverrides']==C['retainedOverrides']==prior_audit['formattedSourceOverrides']
assert V['source']['digest']==V['build']['sourceDigest']==C['sourceDigest']==prior_audit['formattedDigest']=='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
assert P['decision']=='AUTHORIZE_LOCK_RELEASE' and P['retainThreeAuthorized'] is True and P['actualQaReviewSha256']==sha(prior/'review.md')
assert P['readinessSha256']==C['readinessSha256']==pins['ready'][1] and C['unlockPermitSha256']==pins['permit'][1]
stamp=datetime.datetime.fromtimestamp(V['verifiedAtEpoch'],datetime.timezone.utc);permit_time=datetime.datetime.fromisoformat(P['atUtc']);closed_time=datetime.datetime.fromisoformat(C['atUtc'])
assert stamp<permit_time<closed_time and 0<(permit_time-stamp).total_seconds()<60
history=['GST03_FORMAT_IDENTITY_GAP','GST03_PREMATURE_UNLOCK_INTERVAL']
assert V['historicalGapCodes']==P['historicalGapCodes']==C['historicalGapCodes']==history and C['historicalGapsRepaired'] is False
assert C['guardToolOutputChunk']=='8185b2' and C['guardDecision']=='ALLOW_VERIFIED'
assert C['status']=='CLOSED_NATIVE99_PASS_RETAINED_THREE_VERIFIED_GUARDED_RELEASE'
assert C['wrapperAndShellAbsentOrReused'] is C['kernelFree'] is True and C['C8OrLaneCredit'] is C['generalMainReplayW1Release'] is False
assert (L['wrapperPid'],L['shellPid'],L['toolSession'])==(39524,39525,65330)
owned=set()
for phase in ['format','native']:
    path=D/('owned-'+phase)/'receipt.json';v=read(path)
    assert sha(path)==V['evidencePins']['owned-'+phase+'/receipt.json']==P['evidencePins']['owned-'+phase+'/receipt.json']
    assert v['status']=='NATIVE_PHASE_TERMINAL' and v['collectorExit']==0 and v['lockPin']==L and v['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json')
    assert not v['evidenceErrors'] and not v['remainingOwnedNonJvmFacts']
    assert all(not v.get(k,False) for k in read(D/'policy.json')['gapKeys'])
    owned|={(x['pid'],x['start']) for x in v['ownedIdentities']}
assert len(owned)==C['recordedOwnedAbsentOrReused']==10 and V['resources']['extraOwned']==[]
assert owned=={(x['pid'],x['start']) for x in V['resources']['recordedOwned']}
post_source=(D/'verify-postclose.py').read_text();ast.parse(post_source)
assert sha(D/'verify-postclose.py')==C['postcloseProducerSha256']=='ddc911a4a6c0be1dec5df9c4032cf0621976d5c9afabb2c8f4dcdd37f92fdc78'
for text in ["assert sys.argv[1]=='0'", "assert permit['readinessSha256']==h(D/'preunlock-verification.json')", "assert digest==ready['source']['digest']", "assert len(owned)==10", "rows.get(pin[k+'Pid'],{}).get('start')!=pin[k+'Start']",'fcntl.LOCK_EX|fcntl.LOCK_NB',"new(D/'root-unit-closed.json',x)"]:
    assert text in post_source,text
assert C['postcloseResourceBoundarySha256']==sha(D/'postclose-resource-boundary.json')
boundary=read(D/'postclose-resource-boundary.json');before_boundary=read(D/'final-resource-boundary.json')
assert V['resourceBoundarySha256']==sha(D/'final-resource-boundary.json') and boundary['inheritedMatched']==before_boundary['inheritedMatched'] and len(boundary['inheritedMatched'])==6
assert all(not boundary[k] for k in ['inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts']) and boundary['quietHostClaimed'] is boundary['cleanupOwnershipClaimed'] is False
resultpath=T.parent/'execution/obs011-gst-provisional-06-results.json';result=read(resultpath)
assert V['build']['resultSha256']==C['actualResultSha256']==sha(resultpath)=='55b22af567a893541578ebb1805a2576c2bf29028ac2af21cda57b8f404e34b0'
assert result['counts']==C['actualCounts']=={'total':99,'passed':99,'failed':0,'errors':0,'skipped':0} and result['taskCollectionComplete'] is True and result['exit']==result['gradleExit']==0
proposal=read(T/'runtime/gst-limited-start-proposal06/proposal.json');identity=lambda x:(x['task'],x['class'],x['name'])
assert Counter(identity(x) for x in result['testcases'])==Counter(identity(x) for x in proposal['expectedCases']) and all(x['status']=='PASS' for x in result['testcases'])
plan=read(T/'early/fullcheck-harness/resume3/plan.json');expected={x['path']:x['sha256'] for x in plan['source']['files']};expected.update(V['source']['overrides']);modes=read(U/'original-modes.json')
assert sha(U/'original-modes.json')==V['evidencePins']['original-modes.json'] and set(expected)==set(modes)
for name,digest in expected.items():assert sha(R/name)==digest and stat.S_IMODE((R/name).stat().st_mode)==modes[name]
assert hashlib.sha256(json.dumps([{'path':n,'sha256':expected[n]} for n in sorted(expected)],separators=(',',':')).encode()).hexdigest()==C['sourceDigest']
main={p for p in expected if p.startswith('backend/src/main/')};assert len(main)==506 and {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
for row in plan['source']['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():assert sha(R/path)==digest
out={'disposition':'ACCEPT_ACTUAL_CLOSED_UNIT06_AND_COMPLETE_UNCHANGED_MAIN_GST_TEST_PORT_PREREQUISITE','mandatoryFindings':[],'actual99Pass':True,'properOrderedFinalVerificationPermitGuardedExit0PostcloseSupported':True,'finalProducerOutputChunk':'95dfff','separateFinalStatusChunk':'3c66f7','guardExitChunk':'8185b2','postcloseOutputChunk':'2422a6','readinessSha256':pins['ready'][1],'permitSha256':pins['permit'][1],'closedSha256':pins['closed'][1],'readinessToPermitSeconds':(permit_time-stamp).total_seconds(),'retainedSourceDigest':C['sourceDigest'],'current1808BytesModesOutsideThreeMain506Dist238AuxReverified':True,'recordedOwnedTerminal':10,'sixInheritedExactNoOtherFactsRecorded':True,'oldPTY65330ClosedNotReusable':True,'preclose9bbReviewPreservedAsHistoricalConditionalState':True,'completeUnchangedMainGstTestPortPrerequisiteAcceptedForExactRetainedSource':True,'laneExitBatonC8CoverageMainReplayGeneralW1IrOrLifecycleRelease':False,'newC8ValidationNeedsSeparateReviewAndRelease':True,'historicalUnit03GapsOrIncidentRepaired':False,'prior05FailureRetained':True,'reviewerLiveCensusKernelHelperRuntimePrivateBodyAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

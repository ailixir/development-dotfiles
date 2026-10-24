"""Safe source/control/finite-metadata review only. No producer/helper/gate main,
native/process/lock action, raw XML/log/thread/binary/TEMP or locator access.
"""
from pathlib import Path
from collections import Counter
import ast,datetime,hashlib,json,re,stat,uuid
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs011-gst-provisional-05';U=T/'runtime/gst-restricted-unit05';O=T/'qa/gst-unit05-closed-and-port-constraint-review';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();date=lambda s:datetime.datetime.fromisoformat(s)
ctx=read(B/'gst-unit05-closed-and-port-constraint-review-context.json');assert len(ctx['pins'])==11
for row in ctx['pins']:assert sha(R/row['path'])==row['sha256']
packages=[T/'early/gst-semantic-port-amendment-proposal',T/'early/gs-t-draft/unit05-session-fixture-source-audit',T/'early/gs-t-draft/unit05-cut-coordinate-source-audit']
members=0
for root in packages:
    for row in read(root/'manifest.json')['files']:
        assert sha(root/row['path'])==row['sha256'] and (root/row['path']).stat().st_size==row['bytes'];members+=1
proposal=read(packages[0]/'proposal.json');session_inputs=read(packages[1]/'inputs.json');cut_inputs=read(packages[2]/'inputs.json');witness=read(packages[2]/'source-witness.json')
for row in session_inputs['sourcePins']+session_inputs['taskPins']+cut_inputs['taskPins']:assert sha(R/row['path'])==row['sha256']
for row in witness['sourcePinsAndExcerpts']:
    p=R/row['path'];assert sha(p)==row['sha256'];lines=p.read_text().splitlines(keepends=True)
    for excerpt in row['excerpts']:assert ''.join(lines[excerpt['firstLine']-1:excerpt['lastLine']])==excerpt['text']
fixture=witness['publicContractFixture'];assert sha(R/fixture['path'])==fixture['sha256']
public=read(R/fixture['path'])['documents'];step=public['secretReference']['stepId'];assert step==fixture['closedCoordinateProjection']['secretReferenceStepId']==public['secretAction']['coordinate']['stepId']
def canonical_reference(step_id,secret,slot):
    # Independent Java nameUUIDFromBytes rule from fixed known inputs; no SUT call or output.
    raw=bytearray(hashlib.md5((step_id+':secret:'+secret+':'+slot).encode('utf-8')).digest())
    raw[6]=(raw[6]&15)|48;raw[8]=(raw[8]&63)|128
    return 'cfg-'+str(uuid.UUID(bytes=bytes(raw)))
expected=canonical_reference(step,'PASS','fill.value')
assert expected!='ref-PASS' and expected.startswith('cfg-')
assert len({expected,canonical_reference(step,'OTHER','fill.value'),canonical_reference(step,'PASS','other.slot'),canonical_reference('different-step','PASS','fill.value')})==4

# Normative scope, source contradiction, and bounded allowed mapping are checked independently.
story=(R/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md').read_text();lanes=read(T/'lanes.v7.json');lane=next(x for x in lanes['lanes'] if x['id']=='11-GS-T')
for text in ['Move positive admissions','Seed no plan, obligation, admission, manifest or translation-state row.','Keep hand-crafted proposals only as negative probes','Keep method names and counts']:assert text in story
assert 'all three green against the UNCHANGED main' in lane['exit'] and 'any src/main edit' in lane['prohibited']
service=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java').read_text();questions=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedClarificationContextStore.java').read_text()
translation_question=service.split('  public JsonNode translationQuestion(',2)[2].split('  /**',1)[0]
assert 'translationTransaction(' in translation_question and 'questions.create(session.document(), question, meanings, capture);' in translation_question
assert 'clarification(controller, id, fence, key, question)' in translation_question and 'translation.continuation(id, "AWAITING_CLARIFICATION")' in translation_question
raw_clarification=service.split('  public JsonNode clarification(',1)[1].split('  public ObjectNode prepareAssignment',1)[0]
assert 'questions.create' not in raw_clarification and 'session.progress().set("clarification", question.deepCopy())' in raw_clarification
assert 'require(!rows.isEmpty(), "MISSING_SOURCE", 409);' in questions
source_classifier=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceClassifier.java').read_text()
assert '(id + ":secret:" + name + ":fill.value").getBytes(StandardCharsets.UTF_8)' in source_classifier
transport=(D/'formatted-candidate-archive/GuidedServiceTransportFaultIT.java').read_text();session=(D/'formatted-candidate-archive/GuidedSessionIT.java').read_text()
assert transport.count('summary.get("source_reference_id").equals("ref-PASS")')==1
for text in ['summary.get("coordinate_step_id").equals(STEP_ID)','((Number) summary.get("coordinate_ordinal")).intValue() == 0','summary.get("attempt_id").equals(id + ":1")']:assert text in transport
assert session.count('pendingClarification();')==4
assert 'service.clarification(controller, id, 1, "ask", question);' in session
partial=(packages[1]/'GuidedSessionIT.java').read_text()
assert sha(packages[1]/'GuidedSessionIT.java')=='18dd014435195df240db8221720b5d2cfec8d991df2c42a4ab00a63d7e9bb457'
assert 'new GuidedCsiBudgetProperties(1000, 5242880, 640000)' in partial and 'installFixtureGovernance(result);' in partial

# Actual normal failed collection, exact catalog, safe metadata only (no XML/log bodies).
C=read(D/'root-unit-closed.json');A=read(D/'root-actual-unit-release.json');L=read(D/'active-lock.json');N=read(D/'guard-admission-negative-result.json');V=read(D/'preunlock-verification.json');P=read(D/'unlock-permit.json')
producer=(D/'verify-final-before-unlock.py').read_text();ast.parse(producer)
assert sha(D/'verify-final-before-unlock.py')==V['producerSha256']
assert "assert '> Task :compileTestJava' in lines" in producer and "s.startswith('BUILD SUCCESSFUL in ')" in producer
assert "extra=[]  # Unit05 completed normally; no diagnostic client or target signal was used." in producer
assert "new(D/'preunlock-verification.json',ready)" in producer and "new(D/'unlock-permit" not in producer
for field,name in [('rootReleaseSha256','root-actual-unit-release.json'),('guardAdmissionSha256','guard-admission-negative-result.json'),('finalVerificationSha256','preunlock-verification.json'),('permitSha256','unlock-permit.json'),('buildSourceProvenanceSha256','restored-build-source-provenance.json'),('postcloseBoundarySha256','postclose-resource-boundary.json')]:assert C[field]==sha(D/name)
assert C['counts']=={'total':99,'passed':91,'failed':8,'errors':0,'skipped':0} and C['nativeEndedNormally'] is True and C['diagnosticOrTargetSignalUsed'] is False
resultpath=T.parent/'execution/obs011-gst-provisional-05-results.json';assert sha(resultpath)==C['nativeResultReceiptSha256'];actual=read(resultpath)
key=lambda x:(x['task'],x['class'],x['name'])
assert len(actual['testcases'])==99 and Counter(key(x) for x in actual['testcases'])==Counter(key(x) for x in A['expectedCases'])
assert Counter(x['status'] for x in actual['testcases'])=={'PASS':91,'FAIL':8}
assert actual['counts']==C['counts'] and actual['exit']==actual['gradleExit']==1 and actual['taskCollectionComplete'] is True and actual['taskCollectionErrors']==[]
projection=read(D/'closed-failure-source-frame-projection.json');assert projection['counts']==C['counts'] and len(projection['failures'])==8
assert {(x['class'],x['name']) for x in projection['failures']}=={(x['class'],x['name']) for x in actual['testcases'] if x['status']=='FAIL'}
assert C['full99PassingGate'] is False and C['completedXmlCases']==99
assert C['actualGuardDecision']=='ALLOW_VERIFIED' and C['toolExit']==C['actualGuardExpectedWrapperExit']==1 and C['actualGuardExitOutputChunk']=='a838fd'
assert (L['wrapperPid'],L['shellPid'],L['toolSession'])==(38764,38765,36703)
assert N['pin']==L and N['actualFunctionExit']==1 and N['actualDecision']=='HOLD' and N['actualReason']=='FINAL_VERIFICATION_REQUIRED'
assert N['actualToolOutputChunk']=='6b2ee2' and N['actualSeparateStatusChunk']=='6c8f07'
assert N['sourcePhasesNotStarted'] is N['kernelStillHeld'] is N['sameShellPromptObserved'] is N['sameWrapperAndShellStartReverified'] is True
assert P['readinessSha256']==sha(D/'preunlock-verification.json') and P['actualFinalVerificationExitInspected']==V['verificationExit']==0 and P['decision']=='AUTHORIZE_LOCK_RELEASE'
assert P['expectedWrapperExit']==V['expectedWrapperExit']==1 and V['gaps']==V['manualGaps']==[]
assert C['bothControllersAbsent'] is C['kernelFreeObserved'] is True and C['sourceWriterLease']=='CLOSED'
assert C['historicalRepairClaim'] is C['retryReleased'] is C['credit'] is False
assert C['historicalGapCodesPreserved']==V['historicalGapCodes']==P['historicalGapCodes']==['GST03_FORMAT_IDENTITY_GAP','GST03_PREMATURE_UNLOCK_INTERVAL']
assert datetime.datetime.fromtimestamp(V['verifiedAtEpoch'],datetime.timezone.utc)<date(P['atUtc'])<date(C['atUtc'])

before=read(U/'restored.json');after=read(U/'after-restore-compile.json');modes=read(U/'original-modes.json');prov=read(D/'restored-build-source-provenance.json')
assert sha(U/'restored.json')==V['build']['preCompileCheckpointSha256']==prov['sourceCheckpointSha256'] and sha(U/'after-restore-compile.json')==V['build']['postCompileCheckpointSha256']
assert V['build']['provenanceSha256']==sha(D/'restored-build-source-provenance.json')
plan=read(T/'early/fullcheck-harness/resume3/plan.json')
assert before['files']==after['files']==plan['source']['files'] and len(before['files'])==1808
assert before['digest']==after['digest']==V['source']['digest']==prov['sourceDigest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
assert prov['compileTestJavaActuallyExecuted'] is prov['sameSourceExactBeforeAndAfterCompile'] is prov['buildSuccessful'] is True
assert sha(U/'original-modes.json')==V['evidencePins']['original-modes.json']
for row in before['files']:
    p=R/row['path'];assert sha(p)==row['sha256'] and stat.S_IMODE(p.stat().st_mode)==modes[row['path']]
main={x['path'] for x in before['files'] if x['path'].startswith('backend/src/main/')};assert len(main)==506
assert {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
assert after['dist']==before['dist']==plan['source']['dist']
for row in after['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():assert sha(R/path)==digest
owned=set();receipts={}
for phase,code in [('format',0),('native',1),('restore-compile',0)]:
    path=D/('owned-'+phase)/'receipt.json';r=read(path);receipts[phase]=r
    assert V['evidencePins']['owned-'+phase+'/receipt.json']==sha(path)
    assert r['collectorExit']==code and r['rootUnitAuthorizationSha256']==sha(D/'root-actual-unit-release.json') and r['lockPin']==L and not r['evidenceErrors'] and not r['remainingOwnedNonJvmFacts']
    assert all(not r.get(k,False) for k in read(D/'policy.json')['gapKeys'])
    owned|={(x['pid'],x['start']) for x in r['ownedIdentities']}
assert len(owned)==C['recordedOwnedAbsentOrReused']==12 and V['resources']['extraOwned']==[]
assert owned=={(x['pid'],x['start']) for x in V['resources']['recordedOwned']}
assert prov['restoreCompileReceiptSha256']==sha(D/'owned-restore-compile/receipt.json')
assert date(N['atUtc'])<date(receipts['format']['collectorStartedAtUtc'])<date(receipts['native']['collectorStartedAtUtc'])<date(receipts['native']['collectorTerminatedAtUtc'])<date(before['capturedAt'])<date(receipts['restore-compile']['collectorStartedAtUtc'])<date(receipts['restore-compile']['collectorTerminatedAtUtc'])<date(after['capturedAt'])
for name in ['held-prestage-resource-boundary.json','final-resource-boundary.json','postclose-resource-boundary.json']:
    b=read(D/name);assert len(b['inheritedMatched'])==6 and all(not b[k] for k in ['inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'])

out={'actualDisposition':'CLOSED_NORMAL_FAILED_NATIVE_FULL99_COLLECTION_COMPLETE_RESTORATION_SUPPORTED','actualCounts':C['counts'],'exact99IdentityMultiset':True,'diagnosticAbortOrSignalUsed':False,'properGuardedExit1AndRecordedKernelFree':True,'sourceOriginalBytesModes':1808,'mainMembershipAndBytes':506,'distBytes':238,'ownedRecordedTerminalCount':12,'currentRecordedGaps':[],'historicalUnit03Repair':False,'proposalManifestSha256':sha(packages[0]/'manifest.json'),'semanticRuling':'BOUNDED_DESIGN_ADMISSIBLE_UNDER_EXISTING_AC2_F1B_NO_USER_WAIVER','explicitOldExactnessQualification':['one direct positive clarification setup/API call and necessary legitimate inputs; other79 annotated bodies exact','one canonical expected-reference operand in shared four-field assertion; other750 original expressions exact'],'partialTrustFixtureSourceSupported':True,'realTranslationQuestionSetupPermittedWithExactPreservationMapping':True,'canonicalReferenceInputDerivedExpected':expected,'expectedDerivedFromSutOrSummary':False,'actualWhichConjunctOrPrivateRowValueProved':False,'completeSuccessorCandidateReviewed':False,'new99PassingProofRequired':True,'full99PassingGate':'FAIL','sourceNativeRetryOrCreditReleased':False,'rawXmlLogBusinessTempJournalThreadBinaryOrLocatorAccess':False,'producerGateHelperMainNativeProcessLockSignalAction':False,'dispatchPinsVerified':11,'proposalAuditManifestMembersVerified':members,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
# Supplemental count interpretation: original751 versus actual813, never delete additions.
supplement=T/'resume2-gst-assertion-count-supplement.json'
assert sha(supplement)=='51eb0ae0a8470ed6d469885beba21b8655634bf577f221a4e11404875de51aa6'
count_note=read(supplement)
helper=R/session_inputs['pureHelper']['path'];assert sha(helper)==session_inputs['pureHelper']['sha256']
parser_tree=ast.parse(helper.read_text());pure={'re':re}
exec(compile(ast.Module(body=[n for n in parser_tree.body if isinstance(n,ast.FunctionDef) and n.name in {'masked','method_span','methods','assertions'}],type_ignores=[]),'<inspected-pure-text-extractors-only>','exec'),pure)
count_rows=[];method_total=0
for name,old_count,new_count in [('GuidedSessionIT',212,234),('GuidedLifecycleReasonIT',18,38),('GuidedServiceTransportFaultIT',521,541)]:
    rel='backend/src/test/java/com/citi/put/checks/studio/guided/session/'+name+'.java'
    old=(R/rel).read_text();new=(D/'formatted-candidate-archive'/(name+'.java')).read_text()
    old_assertions=pure['assertions'](old);new_assertions=pure['assertions'](new)
    assert (len(old_assertions),len(new_assertions))==(old_count,new_count)
    assert not (Counter(old_assertions)-Counter(new_assertions))
    old_methods=pure['methods'](old);new_methods=pure['methods'](new)
    assert [(x['name'],x['annotation']) for x in old_methods]==[(x['name'],x['annotation']) for x in new_methods]
    method_total+=len(old_methods);count_rows.append({'file':name,'originalAssertions':old_count,'unit05Assertions':new_count})
assert count_rows==count_note['files'] and method_total==80
assert sum(x['originalAssertions'] for x in count_rows)==751 and sum(x['unit05Assertions'] for x in count_rows)==813
assert [x['body'] for x in pure['methods'](session)]==[x['body'] for x in pure['methods'](partial)]
assert pure['assertions'](session)==pure['assertions'](partial)
for name,digest in A['unlockGuard']['hashes'].items():assert sha(D/name)==digest
out.update(assertionCountSupplementSha256=sha(supplement),assertionCounts=count_rows,baselineOriginalExpressions=751,unit05Expressions=813,unit05AdditionalChecks=62,otherOriginalExpressionsMustRemainExact=750,otherUnit05ExpressionsMustRemainExact=812,noAdditiveCheckDeletionPermitted=True)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

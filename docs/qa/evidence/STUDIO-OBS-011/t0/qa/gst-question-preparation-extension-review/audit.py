"""Prospective design/source checks only. No prototype, runtime or helper main."""
from pathlib import Path
import hashlib,json,re
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011';O=T/'qa/gst-question-preparation-extension-review';A=T/'resume-architecture/resume2/gst-session-meaning-contract-audit';X=T/'early/gst-clarification-provenance-extension-proposal';F=T/'early/gs-t-draft/unit05-session-semantic-port'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ctx=read(B/'gst-question-preparation-extension-qa-review-context.json');assert len(ctx['pins'])==10
for row in ctx['pins']:assert sha(R/row['path'])==row['sha256']
members=0
for directory in [A,X,F]:
    for row in read(directory/'manifest.json')['files']:
        assert sha(directory/row['path'])==row['sha256'] and (directory/row['path']).stat().st_size==row['bytes'];members+=1
author=read(A/'audit.json')
for row in author['pinChecks']:assert sha(R/row['path'])==row['expectedSha256']
for row in author['selectedPublicSourceHashes']:assert sha(R/row['path'])==row['sha256']
base=(T/'runtime/obs011-gst-provisional-05/formatted-candidate-archive/GuidedSessionIT.java').read_text()
fixture=read(R/'backend/src/test/resources/studio/guided/session-it-documents.json')['documents'];observation=fixture['observation'];question=fixture['clarification']
assert len(observation['nodes'])==1 and observation['nodes'][0]['nodeId']=='node-0'
assert observation['nodes'][0]['name']=='Order number' and observation['nodes'][0]['role']=='text'
assert len(question['choices'])==1 and question['choices'][0]['nodeId']=='node-1' and question['choices'][0]['role']=='textbox' and question['choices'][0]['safeLabel']=='Order reference'
assert question['choices'][0]['bindingId'] is question['choices'][0]['region'] is None
assert question['coordinate']=={'stepId':'00000000-0000-4000-8000-0000000000a1','ordinal':0} and question['documentId']=='document-1' and question['generation']==1
replay=read(R/'docs/specs/studio-observed-authoring/contracts/v3/replay-validation.schema.json');meaning=replay['definitions']['ObservedQuestionMeaning'];fields={'obligationId','nodeId','bindingId','locator'}
assert set(meaning['properties'])==set(meaning['required'])==fields and meaning['additionalProperties'] is False
model=read(R/'docs/specs/studio-observed-authoring/contracts/v3/guided-model-response.schema.json')
def shapes(v):
    out=[]
    if isinstance(v,dict):
        if set(v.get('required',[]))==fields:out.append(v)
        for child in v.values():out+=shapes(child)
    elif isinstance(v,list):
        for child in v:out+=shapes(child)
    return out
assert shapes(model) and all(x.get('additionalProperties') is False and set(x['properties'])==fields for x in shapes(model))
service=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java').read_text()
assert 'return translationQuestion(controller, id, fence, key, question, meanings, null);' in service
assert 'questions.create(session.document(), question, meanings, capture);' in service and 'clarification(controller, id, fence, key, question)' in service
translation=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java').read_text()
for text in ['node = item;','require(node != null, "STALE_GENERATION", 409);','corresponds |= hint.equals(meaning.path("locator"));','require(corresponds, "STALE_GENERATION", 409);','validator.remaining(','disputed.path("stepId").equals(currentStep.path("stepId"))','disputed.path("occurrence").asLong() == ordinal','questions.acceptedObserved(','selected.path("locator")']:
    assert text in translation,text
bootstrap=base.split('    synchronized void bootstrap(String id) {',1)[1].split('\n    }',1)[0]
assert 'translation.plan(controller, id, 1, "gs-t-plan-" + id, command(id));' in bootstrap
assert 'firstObservationWindow(repository, id);' in bootstrap
assert not any(x in bootstrap for x in ['reserve','advance','admit','acceptPlan','attachAdmission'])
window=base.split('  private static void firstObservationWindow(',1)[1].split('  private static void firstObservationCommitted',1)[0]
for text in ['isEqualTo("PROPOSING")','isEqualTo("READY")','isEqualTo(2)','isEqualTo("initialBlank")','assertThat(repository.actions(id)).isEmpty();','current.document().path("counters").path("actions").asInt()).isZero();','JsonNode beforeProgress = current.progress().deepCopy();','current.document().put("state", "OBSERVING");','assertThat(repository.lock(id).progress()).isEqualTo(beforeProgress);']:
    assert text in window,text
assert window.count('.isZero();')==2
observing=base.split('  private String observing() {',1)[1].split('  /**',1)[0]
assert 'service.prepareAssignment(' in observing and 'service.claim(' in observing and 'service.acknowledgeAssignment(' in observing
assert 'if (admissionSubject) planner(id).bootstrap(id);' in observing and 'service.materialize(' in observing
assert base.count('pendingClarification();')==4 and 'service.observe(worker, id, 1, "observe", observation(id, 1));' in base
collector=(R/'studio-runner/src/run/observationCollector.ts').read_text()
assert "classification: rule?.classification ?? 'structuralOnly'" in collector
assert "policyRuleId: rule?.policyRuleId ?? options.applicationPolicy?.policyRuleId ?? ''" in collector
assert "emitted.locatorHints.push({ kind: 'role', role, name, exact: true })" in collector
obs_schema=read(R/'docs/specs/studio-observed-authoring/contracts/v3/observation.schema.json');node=obs_schema['properties']['nodes']['items']
assert {'nodeId','documentId','generation','role','name','elementType','controlType','classification','policyRuleId','visible','actionable','depth','parentNodeId','regionId','formId','labelNodeIds','locatorHints'}==set(node['required'])
assert observation['coverage']['passwordControls']==0 and observation['coverage']['mode']=='semantic'
assert read(F/'manifest.json')['implementedSemanticCandidate'] is False
assert read(X/'proposal.json')['actualSourceOrNativeReleased'] is False
counts=read(T/'resume2-gst-assertion-count-supplement.json');assert counts['originalTotal']==751 and counts['unit05Total']==813
decision=read(A/'decision.json');assert decision['sessionAssertionsExact']==234 and decision['combinedExactAssertionsAfterSeparateCutOperandPort']==812
storypath=R/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md';story=storypath.read_text()
assert 'Move positive admissions' in story and 'Seed no plan, obligation, admission, manifest or translation-state row.' in story and 'Keep method names and counts' in story
cases=['clarificationIsBoundToGenerationChoiceAndOriginalDeadline','acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping','selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState','clarificationSelectionAndPauseChangeRollBackTogether','renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer']
assert all('void '+case+'()' in base for case in cases)
out={'disposition':'BOUNDED_FIVE_CASE_PREPARATION_REFINEMENT_SUPPORTED_IN_PRINCIPLE','dispatchPinsVerified':10,'manifestMembersVerified':members,'selectedPrimarySourcePinsVerified':len(author['selectedPublicSourceHashes']),'meaningContract':'canonical closed obligationId/nodeId/bindingId/locator; no custom session-only alternative approved','sixArgumentApiOnlyOmitsCapture':True,'existingRealBootstrapAndAllR5ChecksSupported':True,'reserveAdvanceAdmitOrAuthoritySeedAllowed':False,'fiveCasesOnly':cases,'ordinaryInputExtensionProspectivelyQualified':True,'oldNode0MustRemainExact':True,'newNode1MustUseCommittedOwnLocatorAndMaterializedExistingPolicy':True,'newPolicyContentReadGrantBudgetOrValueAllowed':False,'all234SessionAssertionsAndOther43BodiesRequiredExact':True,'unit05Checks':813,'combinedExactAfterSeparateTransportOperand':812,'additiveChecksRequiredRetained':62,'methods':80,'cases':99,'modes':9,'sentinels':11,'newUserWaiverOrAcMeaningChangeRequired':False,'prototypeInspectedOrApproved':False,'conflictPackageRetroactivelyFixed':False,'implementationOrRuntimeRemedyReadinessProved':False,'sourceOrderNativeRetryOrCreditReleased':False,'privateBodyLocatorOrRuntimeAction':False,'storyAuthoritySha256':sha(storypath),'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

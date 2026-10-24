"""Exact source/recipe/control metadata review; inspected pure text functions only.
No verifier/phase/keeper/gate/producer main, binary/private I/O or process/native action.
"""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,re,stat
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011';D=T/'early/gs-t-draft/resume6-semantic-question';P=T/'early/gst-restricted-unit-prep/resume6';Q=T/'runtime/gst-limited-start-proposal06';U=T/'runtime/obs011-gst-provisional-06';O=T/'qa/gst-unit06-exact-review'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=[(D,'c18a6bb5c943a7d756eb184988ef11ae4d4287406dbf014acd66b2c60e1bf192'),(P,'f999867a5406db62d55bf15852b5276dd0c716ce702e81e2140ebcb97534eedc'),(Q,'1a924c8725bcb44b554634471c3a7d64897110b28db8a53d74819972004ecc8d')]
members=0
for root,digest in expected:
    assert sha(root/'manifest.json')==digest
    for row in read(root/'manifest.json')['files']:assert sha(root/row['path'])==row['sha256'] and (root/row['path']).stat().st_size==row['bytes'];members+=1
preflight=read(B/'gst-unit06-exact-qa-preflight.json');assert preflight['scan']['safe'] is True and preflight['budgetCeilingUsd']==500 and preflight['story']['status']=='InProgress'
assert sha(T/'resume2-gst-question-preparation-design-root-adoption.json')=='732fa204f5d925faeeffd0848c44d62dd0aa090563a81579c1cdbe5843d506b7'
inputs=read(D/'inputs.json')
for pin in inputs['taskPins']:assert sha(R/pin['path'])==pin['sha256']
# Only five inspected pure text declarations, never the source helper's cached-binary main.
pt=ast.parse((R/inputs['pureHelper']).read_text());pure={'re':re}
exec(compile(ast.Module(body=[n for n in pt.body if isinstance(n,ast.FunctionDef) and n.name in {'masked','method_span','methods','assertions','apply_strict'}],type_ignores=[]),'<inspected-pure-source-functions>','exec'),pure)
rows=read(D/'candidate-bindings.json');assert rows==inputs['sourceRows'] and len(rows)==3
body_map=[];expr_map=[];orig_map=[];additions=[];total=Counter();texts={}
assertion_map=read(D/'full-assertion-map.json');oldexpr=assertion_map['mappedOperand']['oldFullExpression'];newexpr=assertion_map['mappedOperand']['newFullExpression']
for row in rows:
    rel=row['file'];paths=[R/inputs['originalRoot']/rel,R/inputs['unit05ArchiveRoot']/Path(rel).name,D/'repo'/rel]
    assert [sha(p) for p in paths]==[row['beforeSha256'],row['unit05Sha256'],row['afterSha256']]
    values=[p.read_text() for p in paths];texts[rel]=values;methods=[pure['methods'](x) for x in values];expr=[pure['assertions'](x) for x in values]
    assert [(x['name'],x['annotation']) for x in methods[0]]==[(x['name'],x['annotation']) for x in methods[1]]==[(x['name'],x['annotation']) for x in methods[2]]
    for x,y,z in zip(*methods):body_map.append({'file':rel,'name':x['name'],'annotation':x['annotation'],'originalS011Body':x['body'],'unit05Body':y['body'],'successorBody':z['body'],'unit05BodyExact':y['body']==z['body']})
    orig_map.append({'file':rel,'expressions':expr[0]});assert len(expr[1])==len(expr[2])
    for key,value in zip(['originalS011','unit05','successor'],expr):total[key]+=len(value)
    for i,(x,y) in enumerate(zip(expr[1],expr[2])):expr_map.append({'file':rel,'ordinal1Based':i+1,'unit05Expression':x,'successorExpression':y,'disposition':'EXACT' if x==y else 'ONE_SOURCE_BOUND_EXPECTED_OPERAND_MAP'})
    original,old,new=map(Counter,expr);assert not(original-old);mapped=original.copy()
    if Path(rel).name=='GuidedServiceTransportFaultIT.java':mapped[oldexpr]-=1;mapped[newexpr]+=1
    assert not(mapped-new) and new-mapped==old-original
    additions += [{'file':rel,'expression':e,'count':n,'retainedCount':new[e]} for e,n in (old-original).items()]
assert body_map==read(D/'full-body-map.json') and orig_map==assertion_map['originalS011'] and expr_map==assertion_map['unit05ToSuccessor'] and additions==assertion_map['additive62']
assert total=={'originalS011':751,'unit05':813,'successor':813} and len(body_map)==80 and sum(x['unit05BodyExact'] for x in body_map)==79
assert [x['name'] for x in body_map if not x['unit05BodyExact']]==['clarificationIsBoundToGenerationChoiceAndOriginalDeadline']
assert sum(x['disposition']=='EXACT' for x in expr_map)==812 and sum(x['count'] for x in additions)==62
for filename,left,right in [('gs-t-draft.patch',0,2),('restore-s011.patch',2,0),('delta-from-unit05.patch',1,2),('restore-unit05.patch',2,1)]:
    seen=set()
    for block in filter(None,re.split(r'(?=^--- a/)',(D/filename).read_text(),flags=re.M)):
        rel=block.splitlines()[0][6:];assert rel not in seen;seen.add(rel);assert pure['apply_strict'](texts[rel][left],block)==texts[rel][right]
    assert seen=={rel for rel,t in texts.items() if t[left]!=t[right]}
session_rel=next(r['file'] for r in rows if r['file'].endswith('/GuidedSessionIT.java'));base=texts[session_rel][1];session=texts[session_rel][2]
assert len(pure['assertions'](session))==234 and pure['assertions'](session)==pure['assertions'](base)
partial=(T/'early/gs-t-draft/unit05-session-fixture-source-audit/GuidedSessionIT.java').read_text();rebuilt=partial
for replacement in read(D/'components/session-exact-replacements.json'):
    assert rebuilt.count(replacement['old'])==replacement.get('count',1);rebuilt=rebuilt.replace(replacement['old'],replacement['new'])
assert rebuilt==session
def method(source,name):
    a,b=pure['method_span'](source,name);return source[a:b]
cases={'clarificationIsBoundToGenerationChoiceAndOriginalDeadline','acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping','selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState','clarificationSelectionAndPauseChangeRollBackTogether','renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer'}
selector=session.split('CLARIFICATION_SUBJECTS =',1)[1].split(';',1)[0];assert set(re.findall(r'"([A-Za-z0-9]+)"',selector))==cases
assert 'if (admissionSubject || clarificationSubject) planner(id).bootstrap(id);' in method(session,'observing')
assert method(session,'firstObservationWindow')==method(base,'firstObservationWindow')
assert 'translation.plan(' in session and 'firstObservationWindow(repository, id);' in session
ask=method(session,'askObservedQuestion');observation=method(session,'observation')
assert 'service.translationTransaction(' in ask and 'service.translationQuestion(controller, id, 1, "ask", question, meanings);' in ask
for text in ['new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts)','store.state(id).path("plan")','duplicate clarification obligation','missing real clarification obligation','.remaining(plan, obligation.path("obligationId").asText())','duplicate clarification observed node','node.path("locatorHints").size() != 1','matches != 1','ObservedQuestionMeaning']:
    assert text in ask,text
assert set(re.findall(r'meaning\.set\("([^"]+)"',ask))=={'obligationId','nodeId','bindingId','locator'}
assert not any(x in ask for x in ['reserveObligation','acceptPlan','attachAdmission','prepareAndAdmit','translation.advance','jdbc.update','questions.create','QuestionCapture','UUID.randomUUID'])
assert 'if (clarificationSubject)' in observation and 'context(id).path("applicationPolicy")' in observation
for text in ['"allowStructuralDiscovery"','"structuralOnly"','"textbox"','"Order reference"','"input"','"text"','node.putArray("labelNodeIds")','node.putArray("locatorHints")']:
    assert text in observation,text
assert method(session,'context')==method(base,'context') and 'materialization.context(repository.lock(id).document())' in method(session,'context')
service=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java').read_text();store=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationStore.java').read_text();validator=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProposalValidator.java').read_text()
assert 'public <T> T translationTransaction(' in service and 'return translationQuestion(controller, id, fence, key, question, meanings, null);' in service
assert 'public JsonNode remaining(JsonNode plan, String id)' in validator and 'public ObjectNode state(String sessionId)' in store
assert 'name.split("#", 2)' in (R/'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java').read_text()
obs_schema=read(R/'docs/specs/studio-observed-authoring/contracts/v3/observation.schema.json');node_schema=obs_schema['properties']['nodes']['items']
node_part=observation.split('ObjectNode node =',1)[1].split('    }\n    return o;',1)[0]
node_fields=set(re.findall(r'\.put(?:Null|Array)?\("([^"]+)"',node_part.split('node.putArray("locatorHints")',1)[0]))|{'locatorHints'}
assert node_fields==set(node_schema['required'])
meaning=read(R/'docs/specs/studio-observed-authoring/contracts/v3/replay-validation.schema.json')['definitions']['ObservedQuestionMeaning'];assert set(meaning['required'])=={'obligationId','nodeId','bindingId','locator'} and meaning['additionalProperties'] is False
assert method(session,'installFixtureGovernance')==method(partial,'installFixtureGovernance')

# Exact recipe/control transformation; inherited protected/cache bindings never opened.
transform=read(P/'transformation.json');phase=(P/'phase.py').read_text();reversed_phase=phase
for old,new in transform['phasePointerSubstitutions'].items():assert reversed_phase.count(new)==1;reversed_phase=reversed_phase.replace(new,old)
oldrecipe=P.parent/'resume5';assert reversed_phase==(oldrecipe/'phase.py').read_text()
assert ast.dump(ast.parse(reversed_phase))==ast.dump(ast.parse((oldrecipe/'phase.py').read_text()))
for name in ['gst-three-only.init.gradle','cache-metadata.json','case-catalog.json','source-crosscheck.json']:assert (P/name).read_bytes()==(oldrecipe/name).read_bytes()
old_bindings=read(oldrecipe/'bindings.json');new_bindings=read(P/'bindings.json');assert all(new_bindings[n]==h for n,h in old_bindings.items())
assert set(new_bindings)==set(old_bindings)|set(transform['addedBindings'])
for path in transform['addedBindings']:assert sha(R/path)==new_bindings[path]
proposal=read(Q/'proposal.json');prior=read(T/'runtime/gst-limited-start-proposal05/proposal.json');carry=read(D/'preservation.json')
assert sha(Q/'proposal.json')=='3837adfa81c4c46215e1b9a13f1c2a66b7305acee3886925c916de866f284ea4' and sha(P/'phase.py')==proposal['phaseSha256']=='8bf6af832251d6255e8c48b372ed84c885d9ea9c2bb341909f50126b9898138d'
assert proposal['expectedCases']==prior['expectedCases']==read(P/'case-catalog.json')==carry['fullExpectedCases'] and len(proposal['expectedCases'])==99
transport=texts[next(r['file'] for r in rows if r['file'].endswith('/GuidedServiceTransportFaultIT.java'))][2]
mode_body=re.search(r'  enum Mode \{([\s\S]*?)\n  \}',transport).group(1)
assert re.findall(r'^\s*(\w+)\s*[,;]?\s*$',mode_body,re.M)==carry['modeVariants'] and len(carry['modeVariants'])==9
assert carry['modeVariantsCount']==9 and carry['unchangedSentinelInvocations']==11
assert sum(x['class'].rsplit('.',1)[-1] not in {Path(r['file']).stem for r in rows} for x in proposal['expectedCases'])==11
assert proposal['proposedNativeCommandUnderImmutableLock']==['obs011-gst-provisional-06' if x=='obs011-gst-provisional-05' else x for x in prior['proposedNativeCommandUnderImmutableLock']]
assert proposal['writerBindings']==[dict(x,currentMode='0644') for x in read(D/'draft-manifest.json')]
assert proposal['previousClosedUnitSha256']==sha(T/'runtime/obs011-gst-provisional-05/root-unit-closed.json')=='ddbf393be29f1b62912fe081676573b55d76c75fcf44f3da266a40c40887ae0d'
for k in ['sourceWriteReleased','sourceReleased','sourceWriterReleased','nativeReleased','nativeCommandReleased','retryReleased','actualExecution','nativeCredit','automaticRetry','IRClockStarted','credit','sourceReady','readiness']:assert proposal[k] is False
assert sha(U/'owned_native_phase.py')==proposal['keeperSha256']=='e4a64776e712409867990ce7b848a2db7fbfe84f42ddafe26c499512a30cc3a1'
assert (U/'owned_native_phase.py').read_text().replace('gst-restricted-unit06','gst-restricted-unit05')==(T/'runtime/obs011-gst-provisional-05/owned_native_phase.py').read_text()
for name,digest in proposal['guardHashes'].items():assert sha(U/name)==digest
runtime=read(U/'prepared-inputs-and-backups.json');assert runtime['sourceWriterReleased'] is runtime['nativeCommandReleased'] is False and runtime['freshBoundGuardAdmissionTestRequired'] is True
for row in runtime['backups']:assert sha(R/row['backup'])==row['sha256']==sha(R/row['source']) and stat.S_IMODE((R/row['source']).stat().st_mode)==0o644
plan=read(T/'early/fullcheck-harness/resume3/plan.json');modes=read(T/'runtime/gst-restricted-unit05/original-modes.json')
for row in plan['source']['files']:assert sha(R/row['path'])==row['sha256'] and stat.S_IMODE((R/row['path']).stat().st_mode)==modes[row['path']]
for row in plan['source']['dist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
main={x['path'] for x in plan['source']['files'] if x['path'].startswith('backend/src/main/')};assert len(main)==506 and {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}==main
for group in ['helm','quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():assert sha(R/path)==digest
out={'disposition':'CONDITIONAL_EXACT_UNIT06_SOURCE_RECIPE_AND_LIMITED_ORDERING_SUPPORT','mandatoryCorrections':[],'sourceManifestSha256':sha(D/'manifest.json'),'recipeManifestSha256':sha(P/'manifest.json'),'proposalManifestSha256':sha(Q/'manifest.json'),'proposalSha256':sha(Q/'proposal.json'),'manifestMembersVerified':members,'actualJavaApiSchemaAndLineageSourceInspected':True,'methods':80,'rawAnnotatedBodiesExact':79,'sessionExpressionsExact':234,'baselineOriginalExpressions':751,'otherBaselineExact':750,'unit05Expressions':813,'otherUnit05Exact':812,'mappedTransportOperand':1,'additiveChecksRetained':62,'cases':99,'modes':9,'sentinels':11,'allFourStrictSourcePatchDirectionsVerified':True,'phaseSourceAndAstOnlyThreePointers':True,'nativeArgvOnly05To06Label':True,'keeperOnly05To06Pointer':True,'guardBytesUnchanged':True,'currentOriginalSourceAndModesRehashed':1808,'mainMembershipAndBytesRehashed':506,'distRehashed':238,'actualJavaCompileSqlRuntimePassProved':False,'sourceNativeRelease':False,'newRootLeaseAndActual06GuardAdmissionStillRequired':True,'mainReplayGeneralW1C8IrLaneBatonOrLifecycleCredit':False,'privateBodyRuntimeHelperMainProcessLockSignalAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

"""Pure fixed-public-source checks only; no Java/compiler/schema engine/native/private IO."""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,re
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    inputs=json.loads((O/'inputs.json').read_text())
    for pin in inputs['pins']:
        assert sha(R/pin['path'])==pin['sha256'],pin['path']
    helper=ast.parse((R/inputs['pureHelper']).read_text())
    names={'masked','method_span','methods','assertions','apply_strict'}
    nodes=[n for n in helper.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(nodes)==5
    scope={'re':re}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<inspected-pure-functions>','exec'),scope)
    before=(R/inputs['base']).read_text();after=(O/'GuidedSessionIT.java').read_text()
    assert scope['apply_strict'](before,(O/'delta-from-18dd.patch').read_text())==after
    assert scope['apply_strict'](after,(O/'restore-18dd.patch').read_text())==before
    replacements=json.loads((O/'exact-replacements.json').read_text())
    recovered=after
    for row in reversed(replacements):
        assert recovered.count(row['new'])==row.get('count',1)
        recovered=recovered.replace(row['new'],row['old'])
    assert recovered==before
    old,new=scope['methods'](before),scope['methods'](after)
    assert len(old)==len(new)==44
    assert [(m['name'],m['annotation']) for m in old]==[(m['name'],m['annotation']) for m in new]
    changed=[]
    for a,b in zip(old,new):
        if a['body']!=b['body']:
            changed.append(a['name'])
            assert b['body'].replace('askObservedQuestion(id, question);','service.clarification(controller, id, 1, "ask", question);')==a['body']
    assert changed==['clarificationIsBoundToGenerationChoiceAndOriginalDeadline']
    oa,na=scope['assertions'](before),scope['assertions'](after)
    assert oa==na and len(na)==234
    for name in ['firstObservationWindow','sourceFixture','installFixtureGovernance','clarificationAnswer']:
        a,b=scope['method_span'](before,name);c,d=scope['method_span'](after,name)
        assert before[a:b]==after[c:d],name
    a,b=scope['method_span'](before,'observation');c,d=scope['method_span'](after,'observation')
    prefix=before[a:b].split('    return o;')[0]
    assert after[c:d].startswith(prefix) # original node0 preparation and generation loop exact
    a,b=scope['method_span'](after,'askObservedQuestion');ask=after[a:b]
    assert ask.count('service.translationQuestion(')==1
    assert 'service.translationQuestion(controller, id, 1, "ask", question, meanings);' in ask
    for word in ['reserve(','.advance(','.prepareAndAdmit(','.attachAdmission(','.create(','jdbc.update(','put("expiresAt"','put("clarificationId"','UUID.randomUUID']:
        assert word not in ask,word
    assert ask.count('meaning.set(')==4
    assert 'new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts)' in ask
    assert 'current.progress().path("observation")' in ask
    assert '.remaining(plan, obligation.path("obligationId").asText())' in ask
    selected=after.split('private static final java.util.Set<String> CLARIFICATION_SUBJECTS =',1)[1].split(');',1)[0]
    assert re.findall(r'"(\w+)"',selected)==[
        'clarificationIsBoundToGenerationChoiceAndOriginalDeadline',
        'acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping',
        'selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState',
        'clarificationSelectionAndPauseChangeRollBackTogether',
        'renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer']
    assert before.count('"reuse-question"')==after.count('"reuse-question"')==1
    # Pure injected controls: wrong base cannot stage; unrelated test edit and removed oracle cannot pass.
    try:
        scope['apply_strict'](before.replace('service.clarification(controller, id, 1, "ask", question);', 'changedBaseCall();',1),(O/'delta-from-18dd.patch').read_text())
    except AssertionError: pass
    else: raise AssertionError('wrong-base control escaped')
    mutant=after.replace('void selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState() {','void selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState() {\n    ;',1)
    assert scope['methods'](mutant)!=scope['methods'](after)
    removed=after.replace('assertThat(', 'removedOracle(',1)
    assert scope['assertions'](removed)!=scope['assertions'](after)
    # No other changed text, including timers/budgets/SQL/cleanup/old assertions, can pass exact reversal.
    report={'status':'PROPOSED_SOURCE_ONLY_CHECKS_PASS','sourceMethods':44,'unchangedAnnotatedBodies':43,'onlyChangedBody':changed[0],'assertionExpressionsExact':234,'strictForwardAndInverse':True,'exactEnumeratedDeltaRecovery':True,'originalObservationPrefixExact':True,'R5SeamExact':True,'trustedPolicyFixtureExact':True,'questionMutationInMappingHelper':False,'newPositiveCoreApiCalls':1,'modelOrPublicationCapture':False,'javaCompileOrNativeProof':False,'release':False}
    expected=json.loads((O/'static-receipt.json').read_text())
    assert report==expected
    print(json.dumps(report,sort_keys=True))
if __name__=='__main__': main()

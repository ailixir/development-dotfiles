"""Pure source/text preservation only. No Java, SQL, helper main or private inputs."""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,re
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
    i=read(O/'inputs.json')
    for p in i['taskPins']+i['sourcePins']+[i['taskContext'],i['pureHelper']]:assert sha(R/p['path'])==p['sha256'],p['path']
    helper=ast.parse((R/i['pureHelper']['path']).read_text())
    names={'masked','method_span','methods','assertions','apply_strict'}
    scope={'re':re}
    nodes=[n for n in helper.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(nodes)==5
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<inspected-pure-text>','exec'),scope)
    before=(R/i['baseSessionPath']).read_text();after=(O/'GuidedSessionIT.java').read_text()
    bm,am=scope['methods'](before),scope['methods'](after)
    assert bm==am and len(am)==44
    assert scope['assertions'](before)==scope['assertions'](after)
    assert scope['apply_strict'](before,(O/'delta-from-unit05.patch').read_text())==after
    assert scope['apply_strict'](after,(O/'restore-unit05.patch').read_text())==before
    # Entire delta is one helper call replacement plus one new helper; recover base exactly.
    a,b=scope['method_span'](after,'installFixtureGovernance')
    stripped=after[:a]+after[b+2:]
    start,end=scope['method_span'](before,'newService')
    old=before[start:end]
    c,d=scope['method_span'](stripped,'newService')
    # New helper's preceding source comment is removed explicitly, not silently ignored.
    stripped=stripped.replace('  /** Same governed policies and CSI limits; trusted pins cover both raced applications. */\n','')
    c,d=scope['method_span'](stripped,'newService')
    assert stripped[:c]+old+stripped[d:]==before
    assert 'new GuidedCsiBudget(jdbc, new GuidedCsiBudgetProperties(1000, 5242880, 640000))' in after
    assert 'translationQuestion' not in after and 'studio_guided_clarification_contexts' not in after
    count=0;assertions=0
    parent=R/i['baseSessionPath'];parent=parent.parent
    for name in ['GuidedSessionIT.java',*i['unchangedCandidateBases']]:
        old=(R/i['originalSourceRoot']/'backend/src/test/java/com/citi/put/checks/studio/guided/session'/name).read_text()
        candidate=after if name=='GuidedSessionIT.java' else (parent/name).read_text()
        if name!='GuidedSessionIT.java':assert sha(parent/name)==i['unchangedCandidateBases'][name]
        om,cm=scope['methods'](old),scope['methods'](candidate);count+=len(om)
        assert [(x['name'],x['annotation']) for x in om]==[(x['name'],x['annotation']) for x in cm]
        expr=Counter(scope['assertions'](old));assertions+=sum(expr.values());assert not(expr-Counter(scope['assertions'](candidate)))
    assert count==80 and assertions==751
    carry=read(R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/peer-relay-sql-source-audit/preservation.json')
    assert len(carry['fullExpectedCases'])==99 and carry['modeVariantsCount']==9 and carry['unchangedSentinelInvocations']==11
    print(json.dumps({'status':'PARTIAL_SOURCE_ONLY_PRESERVATION_PASS','methods':count,'originalAssertions':assertions,'sessionAnnotatedBodiesExact':44,'unit05AllAssertionsExact':True,'strictDeltaInverseExact':True,'allOtherSessionSourceRecovered':True,'catalog':99,'modes':9,'sentinels':11,'clarificationFive':'UNRESOLVED_UNCHANGED_ANNOTATED_CALLER_COMPOSITION','compileSqlOrRuntimeProof':False}))
if __name__=='__main__':main()

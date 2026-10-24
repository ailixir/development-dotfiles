"""Read-only pure source verifier; no build, formatter, Java, or product writes."""
import ast
import json
import re
from pathlib import Path
import source_tools as s

out=Path(__file__).resolve().parent
# Inspect all executable source in this package before consumption: imports and calls are finite.
for name in ('source_tools.py','verify_source.py'):
    tree=ast.parse((out/name).read_text())
    imports=[]
    for n in ast.walk(tree):
        if isinstance(n,ast.Import):imports.extend(x.name for x in n.names)
        if isinstance(n,ast.ImportFrom):imports.append(n.module)
    assert set(imports)<= {'difflib','hashlib','json','re','pathlib','ast','source_tools'}
    assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in {'exec','eval','compile','__import__','open'} for n in ast.walk(tree))
pb=s.PROJECTION.read_bytes();assert s.sha(pb)=='b6525dcc62872239ab328718bb4d3c37e93206df96894ad159e4bac347983ade'
facts=json.loads(pb)['facts'];mapping=json.loads((out/'source-location-map.json').read_text())
results=[];locations=[]
for name,pin in s.PINS.items():
    old=(out/'preimages'/name).read_text();new=(out/'postimages'/name).read_text()
    assert s.sha(old.encode())==pin==s.sha((s.BASE/name).read_bytes())
    rows=[f for f in facts if Path(f['file']).name==name]
    result=s.check_pair(old,new,rows)
    for direction,a,b in [('forward',old,new),('reverse',new,old)]:
        assert s.apply_unified(a,(out/(name+'.'+direction+'.patch')).read_text())==b
    nt=s.lex(new);values=[t[0] for t in nt]
    for entry in mapping['files'][name]:
        target=entry['oldHeadTokens']+['{']+entry['oldBodyTokens']+['}']
        matches=[i for i in range(len(nt)-len(target)+1) if values[i:i+len(target)]==target]
        assert len(matches)==1,(name,entry['oldLine'],matches)
        i=matches[0];start=nt[i][1];end=nt[i+len(target)-1][2]
        # Single existing expression/return/throw statement only; no declaration, label or nested control.
        body=entry['oldBodyTokens'];assert body[-1]==';'
        assert not set(body)&{'if','else','for','while','switch','try','break','continue','var'}
        locations.append({'file':name,'rule':'NeedBraces','oldLine':entry['oldLine'],
                          'newLine':new.count('\n',0,start)+1,'newClosingLine':new.count('\n',0,end)+1,
                          'headTokensExact':True,'bodyTokensExact':True,'oneStatementOnly':True})
    result.update({'file':name,'currentBoundPreimageExact':True,'strictForwardReverse':True})
    results.append(result)
old_map=re.findall(r'case "([^"]+)" -> "([^"]+)";',s.OLD_SWITCH)
new_map=re.findall(r'case "([^"]+)" -> fixedRoute = "([^"]+)";',s.NEW_SWITCH)
assert old_map==new_map==[('claim','CLAIM'),('observations','OBSERVATIONS'),('bootstrap-evidence','BOOTSTRAP_EVIDENCE'),('outcomes','OUTCOMES')]
assert 'default -> "OTHER";' in s.OLD_SWITCH and 'default -> fixedRoute = "OTHER";' in s.NEW_SWITCH
assert s.OLD_SWITCH.count('switch (route)')==s.NEW_SWITCH.count('switch (route)')==1
assert 'case null' not in s.OLD_SWITCH+s.NEW_SWITCH
assert s.NEW_SWITCH.count('fixedRoute =')==5
transport=(out/'postimages/GuidedServiceTransportFaultIT.java').read_text()
enum=re.search(r'enum Mode\s*\{([^;]+);',transport).group(1)
modes=re.findall(r'\b[A-Z][A-Z_0-9]+\b',enum)
assert len(modes)==9 and transport.count('@EnumSource(Mode.class)')==1
assert sum(x['methods'] for x in results)==80
assert sum(x['assertionEntryPoints'] for x in results)==813
assert len(locations)==43
switchpos=transport.index(s.NEW_SWITCH)
for fact in facts:
    if fact['rule']=='Indentation':
        locations.append({'file':Path(fact['file']).name,'rule':'Indentation','oldLine':fact['line'],
                          'newSwitchStartLine':transport.count('\n',0,switchpos)+1,'mapping':'switch-equivalence.md'})
assert len(locations)==50
result={'kind':'READ_ONLY_SOURCE_VERIFICATION_NOT_NATIVE_PROOF','files':results,'mappedDiagnostics':locations,
        'methods':80,'assertionEntryPoints':813,'threeFileExpandedCaseCount':79+len(modes),
        'threeFileExpandedCasesDefinition':'79 @Test + one @EnumSource(Mode.class) over nine modes',
        'acceptedFiveClassCaseCohort':99,'otherUnchangedClassCases':11,'nativeRerun':False,
        'switchCaseMap':old_map,'switchDefault':'OTHER','selectorEvaluations':1,
        'nullCaseAbsentBoth':True,'externalCallsOrSubprocessOrNativeInvocations':0}
print(json.dumps(result,indent=2))

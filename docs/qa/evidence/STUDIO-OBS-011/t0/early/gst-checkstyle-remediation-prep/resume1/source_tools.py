"""Pure source transforms; no Java/native/parser, subprocess, network, or runtime observer."""
import difflib
import hashlib
import json
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent
PROJECTION = Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01/public-checkstyle-projection01/projection.json')
PINS = {
    'GuidedSessionIT.java': '0a9cd30bf501089b5cbc17922e1f9809efd5f176c83f42359ad4ba0105a8ac59',
    'GuidedLifecycleReasonIT.java': '353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5',
    'GuidedServiceTransportFaultIT.java': '5317d3805950e562da4530433fcfdf660b1744e3b17cf58c5fa3f047b2176b15',
}
BASE = Path('backend/src/test/java/com/citi/put/checks/studio/guided/session')
OLD_SWITCH = '''      String fixedRoute =
          switch (route) {
            case "claim" -> "CLAIM";
            case "observations" -> "OBSERVATIONS";
            case "bootstrap-evidence" -> "BOOTSTRAP_EVIDENCE";
            case "outcomes" -> "OUTCOMES";
            default -> "OTHER";
          };'''
NEW_SWITCH = '''      String fixedRoute;
      switch (route) {
        case "claim" -> fixedRoute = "CLAIM";
        case "observations" -> fixedRoute = "OBSERVATIONS";
        case "bootstrap-evidence" -> fixedRoute = "BOOTSTRAP_EVIDENCE";
        case "outcomes" -> fixedRoute = "OUTCOMES";
        default -> fixedRoute = "OTHER";
      }'''
LEX = re.compile(r'(?P<space>\s+)|(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|(?P<literal>"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|(?P<word>[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+)|(?P<op>->|::|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|[^\s])')

def sha(b):
    return hashlib.sha256(b).hexdigest()

def lex(s, comments=False):
    rows=[]; end=0
    for m in LEX.finditer(s):
        assert m.start()==end
        end=m.end()
        if m.lastgroup!='space' and (comments or m.lastgroup!='comment'):
            rows.append((m.group(),m.start(),m.end(),m.lastgroup))
    assert end==len(s)
    return rows

def transform(old, facts):
    toks=lex(old); edits=[]; mapping=[]
    for fact in facts:
        if fact['rule']!='NeedBraces': continue
        line=fact['line']; off=sum(len(x) for x in old.splitlines(keepends=True)[:line-1])
        line_end=old.find('\n',off)
        choices=[i for i,t in enumerate(toks) if off<=t[1]<line_end and t[0] in ('if','else')]
        assert choices, (line,'no control')
        # Lines with existing closing braces have only the diagnosed else keyword.
        k=choices[0]; keyword=toks[k][0]
        if keyword=='if':
            assert toks[k+1][0]=='('
            depth=0
            for j in range(k+1,len(toks)):
                if toks[j][0]=='(':depth+=1
                if toks[j][0]==')':depth-=1
                if depth==0:break
            body=j+1; head_end=toks[j][2]
        else:
            body=k+1;head_end=toks[k][2]
        assert toks[body][0] not in ('{','if','for','while','switch','try','else'),(line,toks[body])
        depth=0
        for stop in range(body,len(toks)):
            v=toks[stop][0]
            if v in ('(','['):depth+=1
            elif v in (')',']'):depth-=1
            assert v not in ('{','}'),(line,'non-simple body')
            if v==';' and depth==0:break
        assert toks[stop][0]==';'
        indent=len(old[off:line_end])-len(old[off:line_end].lstrip())
        body_text=old[toks[body][1]:toks[stop][2]]
        # Existing continuation lines retain their relative indentation.
        edits.append((head_end,toks[body][1],' {\n'+' '*(indent+2)))
        edits.append((toks[stop][2],toks[stop][2],'\n'+' '*indent+'}'))
        mapping.append({'oldLine':line,'rule':'NeedBraces','keyword':keyword,
                        'oldHeadTokens':[t[0] for t in toks[k:body]],
                        'oldBodyTokens':[t[0] for t in toks[body:stop+1]],
                        'oldBodyText':body_text,'oldBodyStart':toks[body][1],
                        'oldBodyEnd':toks[stop][2],
                        'insertedOpeningAfter':head_end,'insertedClosingAfter':toks[stop][2]})
    last=-1
    for start,end,repl in sorted(edits):
        assert start>=last;last=end
    new=old
    for start,end,repl in sorted(edits,reverse=True):new=new[:start]+repl+new[end:]
    # A brace and its existing else belong on one line; no token changes.
    new=re.sub(r'}\n[ ]*else\b','} else',new)
    if any(f['rule']=='Indentation' for f in facts):
        assert new.count(OLD_SWITCH)==1
        new=new.replace(OLD_SWITCH,NEW_SWITCH)
    return new,mapping

def apply_unified(source, patch):
    lines=source.splitlines(keepends=True); out=[]; pos=0; body=patch.splitlines(keepends=True)
    assert body[0].startswith('--- ') and body[1].startswith('+++ ')
    i=2
    while i<len(body):
        m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',body[i]);assert m,body[i]
        start=int(m[1])-1; oldn=int(m[2] or 1);newn=int(m[4] or 1)
        assert start>=pos
        out.extend(lines[pos:start]);pos=start;i+=1;oc=nc=0
        while i<len(body) and not body[i].startswith('@@ '):
            kind=body[i][0];payload=body[i][1:];assert kind in ' +-'
            if kind in ' -':assert pos<len(lines) and lines[pos]==payload;pos+=1;oc+=1
            if kind in ' +':out.append(payload);nc+=1
            i+=1
        assert (oc,nc)==(oldn,newn)
    out.extend(lines[pos:]);return ''.join(out)

def check_pair(old,new,facts):
    expected,mapping=transform(old,facts)
    assert new==expected,'candidate differs from exact authorized transformation'
    a=old;b=new
    if any(f['rule']=='Indentation' for f in facts):
        assert a.count(OLD_SWITCH)==b.count(NEW_SWITCH)==1
        a=a.replace(OLD_SWITCH,'SWITCH_EQUIVALENCE_ANCHOR;')
        b=b.replace(NEW_SWITCH,'SWITCH_EQUIVALENCE_ANCHOR;')
    at=[x[0] for x in lex(a,True)];bt=[x[0] for x in lex(b,True)]
    inserts=[]
    for tag,i,j,k,l in difflib.SequenceMatcher(a=at,b=bt,autojunk=False).get_opcodes():
        if tag=='equal':continue
        assert tag=='insert' and all(v in ('{','}') for v in bt[k:l]),(tag,at[i:j],bt[k:l])
        inserts.extend(bt[k:l])
    assert inserts.count('{')==inserts.count('}')==len(mapping)
    assert [x[0] for x in lex(old,True) if x[3] in ('literal','comment')]==[x[0] for x in lex(new,True) if x[3] in ('literal','comment')]
    tests=len(re.findall(r'@(?:Test|ParameterizedTest)\b',old))
    assertions=len(re.findall(r'\bassertThat(?:ThrownBy)?\s*\(',old))
    assert tests==len(re.findall(r'@(?:Test|ParameterizedTest)\b',new))
    assert assertions==len(re.findall(r'\bassertThat(?:ThrownBy)?\s*\(',new))
    return {'methods':tests,'assertionEntryPoints':assertions,'bracedBodies':len(mapping),
            'literalAndCommentSequenceExact':True,'allOtherTokensExact':True}

def main():
    pb=PROJECTION.read_bytes();assert sha(pb)=='b6525dcc62872239ab328718bb4d3c37e93206df96894ad159e4bac347983ade'
    facts=json.loads(pb)['facts'];assert len(facts)==50
    maps={};stats={};records=[];negative=[]
    for name,pin in PINS.items():
        oldb=(BASE/name).read_bytes();assert sha(oldb)==pin
        old=oldb.decode();rows=[x for x in facts if Path(x['file']).name==name]
        new,mapping=transform(old,rows);stats[name]=check_pair(old,new,rows);maps[name]=mapping
        for folder,text in [('preimages',old),('postimages',new)]:
            d=OUT/folder;d.mkdir(exist_ok=True);p=d/name
            with p.open('x') as f:f.write(text)
        patches={}
        for label,a,b,an,bn in [('forward',old,new,'a/'+str(BASE/name),'b/'+str(BASE/name)),('reverse',new,old,'b/'+str(BASE/name),'a/'+str(BASE/name))]:
            patch=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile=an,tofile=bn,n=3))
            assert apply_unified(a,patch)==b
            p=OUT/(name+'.'+label+'.patch');p.write_text(patch);patches[label]=p.name
        # Meaningful source-integrity mutations: condition, oracle/literal, missing body, extra statement, extra scope.
        mutants=[('condition',new.replace('if (','if (!',1)),
                 ('literal',new.replace('"GS-T source"','"GS-T changed"',1)),
                 ('dropped-body',new.replace(mapping[0]['oldBodyText'],';',1)),
                 ('extra-operation',new.replace('class '+name[:-5]+' {','class '+name[:-5]+' { int unwanted;',1)),
                 ('extra-scope',new+'\n{}\n')]
        for label,mutant in mutants:
            assert mutant!=new,(name,label)
            try:check_pair(old,mutant,rows)
            except AssertionError:negative.append({'file':name,'mutation':label,'rejected':True})
            else:raise AssertionError(('mutant accepted',name,label))
        # A corrupted exact patch context must fail closed.
        patch=(OUT/patches['forward']).read_text();bad=patch.replace('\n ','\n !',1)
        try:apply_unified(old,bad)
        except AssertionError:negative.append({'file':name,'mutation':'patch-context','rejected':True})
        else:raise AssertionError('corrupt patch accepted')
        records.append({'source':str(BASE/name),'sourceSha256':pin,'postimageSha256':sha(new.encode()),'sourceMode':'0644','futurePostimageMode':'0644','patches':patches})
        assert sha((BASE/name).read_bytes())==pin
    assert sum(v['methods'] for v in stats.values())==80
    assert sum(v['assertionEntryPoints'] for v in stats.values())==813
    assert sum(v['bracedBodies'] for v in stats.values())==43
    (OUT/'source-location-map.json').write_text(json.dumps({'files':maps,'switchOldLines':list(range(5283,5290)),'switchOld':OLD_SWITCH,'switchNew':NEW_SWITCH},indent=2)+'\n')
    (OUT/'source-records.json').write_text(json.dumps(records,indent=2)+'\n')
    (OUT/'pure-source-checks.json').write_text(json.dumps({'kind':'PURE_SOURCE_CHECKS_NOT_NATIVE_EXECUTION','files':stats,'testMethods':80,'assertionEntryPoints':813,'retainedNativeCaseCohort':99,'caseCohortRerun':False,'bracedBodies':43,'switchMappings':1,'negativeChecks':negative,'strictForwardReverse':True,'sourcePreimagesStillExact':True,'nativeOrFormatterOrCompilerInvocations':0,'allExercisedExternalBoundaries':'ABSENT: pure source text and bounded filesystem only; no subprocess/API/observer calls'},indent=2)+'\n')
    print(json.dumps({'files':stats,'negativeChecks':len(negative),'nativeInvocations':0}))

if __name__=='__main__':main()

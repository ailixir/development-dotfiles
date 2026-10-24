#!/usr/bin/env python3
"""Static source preservation and exact narrow SQL lexical witness; no Java/SQL/native."""
from pathlib import Path
from collections import Counter
import ast,re,json,hashlib,difflib,zipfile
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def masked(source):
    pattern = re.compile('"""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\])*"|\\\'(?:\\\\.|[^\\\'\\\\])*\\\'|//[^\\n]*|/\\*[\\s\\S]*?\\*/')
    return pattern.sub(lambda m: ''.join(('\n' if x == '\n' else ' ' for x in m.group())), source)

def method_span(source, name):
    mask = masked(source)
    matches = list(re.finditer('\\b' + re.escape(name) + '\\s*\\([^;{}]*\\)(?:\\s*throws\\s+[\\w., ]+)?\\s*\\{', mask))
    matches = [m for m in matches if re.search('\\b(?:void|JsonNode|ObjectNode|String|GuidedSessionService|Sources|Snapshot|boolean|HeldRowFixture|GuidedControllerCutFixture)\\s*$', mask[max(0, m.start() - 50):m.start()])]
    if name == 'prepareGuidedControllerCut' and len(matches) == 2:
        matches = [matches[-1]]
    if len(matches) != 1:
        raise ValueError((name, len(matches)))
    match = matches[0]
    start = source.rfind('\n', 0, match.start()) + 1
    depth = 0
    for pos in range(mask.index('{', match.start()), len(mask)):
        if mask[pos] == '{':
            depth += 1
        elif mask[pos] == '}':
            depth -= 1
            if depth == 0:
                return (start, pos + 1)
    raise ValueError(name)

def methods(source):
    out = []
    for annotation in re.finditer('^\\s*@(Test|ParameterizedTest)\\b', source, re.M):
        match = re.search('\\bvoid\\s+(\\w+)\\s*\\(', source[annotation.end():])
        name = match.group(1)
        a, b = method_span(source, name)
        body = source[a:b]
        flat = masked(body)
        assertions = []
        for call in re.finditer('\\bassertThat(?:ThrownBy|ExceptionOfType|Code)?\\s*\\(', flat):
            parentheses = 0
            braces = 0
            for end in range(call.start(), len(flat)):
                if flat[end] == '(':
                    parentheses += 1
                elif flat[end] == ')':
                    parentheses -= 1
                elif flat[end] == '{':
                    braces += 1
                elif flat[end] == '}':
                    braces -= 1
                elif flat[end] == ';' and parentheses == 0 and (braces == 0):
                    assertions.append(re.sub('\\s+', '', body[call.start():end + 1]))
                    break
        out.append({'name': name, 'annotation': annotation.group(1), 'body': body, 'assertions': assertions})
    return out

def assertions(source):
    """Match an assertion call and its fluent chain, including lambda-contained calls.

    Stop before a surrounding lambda's closing parentheses. Preserve literal contents.
    This is a textual carry check, not a Java parser or oracle-equivalence proof.
    """
    flat = masked(source)
    result = []
    for match in re.finditer('\\bassertThat(?:ThrownBy|ExceptionOfType|Code)?\\s*\\(', flat):
        pos = flat.index('(', match.start()) + 1
        depth = 1
        while depth:
            depth += (flat[pos] == '(') - (flat[pos] == ')')
            pos += 1
        while True:
            tail = re.match('\\s*\\.\\s*\\w+\\s*\\(', flat[pos:])
            if not tail:
                break
            pos += tail.end()
            depth = 1
            while depth:
                depth += (flat[pos] == '(') - (flat[pos] == ')')
                pos += 1
        parts = re.findall('"""[\\s\\S]*?"""|"(?:\\\\.|[^"\\\\])*"|\\\'(?:\\\\.|[^\\\'\\\\])*\\\'|//[^\\n]*|/\\*[\\s\\S]*?\\*/|[^\\s]', source[match.start():pos])
        result.append(''.join((p for p in parts if not p.startswith(('//', '/*')))))
    return result

def apply_strict(original,patch):
    src=original.splitlines(True);lines=patch.splitlines(True);i=2;cursor=0;dst=[]
    assert lines[0].startswith('--- a/') and lines[1].startswith('+++ b/')
    while i<len(lines):
        m=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',lines[i]);assert m
        start,n,end,k=map(int,m.groups());start-=1;assert start>=cursor
        dst+=src[cursor:start];old=[];new=[];i+=1
        while i<len(lines) and not lines[i].startswith('@@ '):
            op=lines[i][0];value=lines[i][1:];assert op in ' +-'
            if op in ' -':old.append(value)
            if op in ' +':new.append(value)
            i+=1
        assert len(old)==n and len(new)==k and src[start:start+n]==old
        assert len(dst)==end-1;dst+=new;cursor=start+n
    return ''.join(dst+src[cursor:])

def main():
    inputs=json.loads((O/'inputs.json').read_text())
    for pin in inputs['taskPins']+[inputs['pureHelper']]:assert sha(R/pin['path'])==pin['sha256'],pin['path']
    rows=json.loads((O/'candidate-bindings.json').read_text());carry=json.loads((O/'preservation.json').read_text())
    assert len(rows)==3
    patches={k:[] for k in ['delta-from-unit04.patch','restore-unit04.patch','delta-from-s011.patch','restore-s011.patch']}
    methods_count=0;assertions_count=0
    for row in rows:
        rel=Path(row['file']);old=R/inputs['originalRoot']/rel;before=R/inputs['unit04ArchiveRoot']/rel.name;after=O/'repo'/rel
        assert [sha(p) for p in [old,before,after]]==[row['originalSha256'],row['unit04FormattedSha256'],row['successorSha256']]
        a,b,c=[p.read_text() for p in [old,before,after]]
        assert (after.stat().st_mode&0o777)==0o644
        if rel.stem=='GuidedServiceTransportFaultIT':
            assert b.count(inputs['originalQuery'])==1
            assert b.replace(inputs['originalQuery'],inputs['successorQuery'])==c and len(c)==len(b)+1
            assert c.replace(inputs['successorQuery'],inputs['originalQuery'])==b
        else:assert b==c
        om,bm,am=map(methods,[a,b,c]);methods_count+=len(om)
        assert [(m['name'],m['annotation']) for m in om]==[(m['name'],m['annotation']) for m in am]
        assert [m['body'] for m in bm]==[m['body'] for m in am]
        original_assertions=Counter(assertions(a));assertions_count+=sum(original_assertions.values())
        assert not(original_assertions-Counter(assertions(c))) and assertions(b)==assertions(c)
        for name,l,r in [('delta-from-unit04.patch',b,c),('restore-unit04.patch',c,b),('delta-from-s011.patch',a,c),('restore-s011.patch',c,a)]:
            patches[name]+=list(difflib.unified_diff(l.splitlines(True),r.splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
    assert methods_count==80 and assertions_count==751
    for name,lines in patches.items():assert (O/name).read_text()==''.join(lines),name
    for patch_name,base,expected,flat in [('delta-from-unit04.patch',R/inputs['unit04ArchiveRoot'],O/'repo',True),('restore-unit04.patch',O/'repo',R/inputs['unit04ArchiveRoot'],False),('delta-from-s011.patch',R/inputs['originalRoot'],O/'repo',False),('restore-s011.patch',O/'repo',R/inputs['originalRoot'],False)]:
        for block in re.split(r'(?=^--- a/)',(O/patch_name).read_text(),flags=re.M):
            if block:
                rel=Path(block.splitlines()[0][6:]);src=base/(rel.name if flat else rel);dst=expected/(rel.name if patch_name=='restore-unit04.patch' else rel)
                assert apply_strict(src.read_text(),block)==dst.read_text()
    assert (O/'gs-t-draft.patch').read_bytes()==(O/'delta-from-s011.patch').read_bytes()
    assert (O/'filtered-output.init.gradle').read_bytes()==(R/inputs['predecessorRoot']/'filtered-output.init.gradle').read_bytes()
    prior=json.loads((R/inputs['predecessorRoot']/'preservation.json').read_text())
    assert carry['fullExpectedCases']==prior['fullExpectedCases'] and len(carry['fullExpectedCases'])==99
    assert carry['modeVariantsCount']==9 and len(carry['modeVariants'])==9 and carry['unchangedSentinelInvocations']==11
    transport=(O/'repo'/rows[-1]['file']).read_text()
    mode_body=re.search(r'  enum Mode \{([\s\S]*?)\n  \}',transport).group(1)
    assert re.findall(r'^\s*(\w+)\s*[,;]?\s*$',mode_body,re.M)==carry['modeVariants']
    sentinel_cases=[x for x in carry['fullExpectedCases'] if x['class'].rsplit('.',1)[-1] not in [Path(r['file']).stem for r in rows]]
    assert len(sentinel_cases)==11 and len(carry['fullExpectedCases'])-len(sentinel_cases)==88
    witness=json.loads((O/'primary-source-witness.json').read_text())
    for item in witness['cachedArtifacts']:
        p=Path(item['path']);assert sha(p)==item['sha256']
        with zipfile.ZipFile(p) as z:
            for entry in item['classEntries']:assert hashlib.sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
    assert sha(Path(witness['cachedBootBom']['path']))==witness['cachedBootBom']['sha256']
    assert [{k:x[k] for k in ['file','beforeSha256','afterSha256']} for x in json.loads((O/'draft-manifest.json').read_text())]==[{'file':x['file'],'beforeSha256':x['originalSha256'],'afterSha256':x['successorSha256']} for x in rows]
    # Narrow literal inspection of this exact query, using the documented Parser branch.
    # This Python text operation is not an execution or conformance test of pgjdbc.
    old,new=inputs['originalQuery'],inputs['successorQuery']
    assert old=="SELECT NOT (progress ? 'executionEvidence') FROM studio_guided_sessions WHERE session_id=?"
    assert new=="SELECT NOT (progress ?? 'executionEvidence') FROM studio_guided_sessions WHERE session_id=?"
    assert old.count('?')==2 and new.count('??')==1 and new.replace('??','?')==old
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256']
    print(json.dumps({'staticOnly':True,'completeCandidates':3,'methods':80,'originalAssertions':751,'unit04AnnotatedBodiesAndAssertionsExact':True,'sessionLifecycleBytesExact':True,'transportAddedAsciiQuestionMarks':1,'cases':99,'modeVariants':9,'sentinels':11,'exactDeltaAndBothReversals':True,'compileSqlNativeOrRuntimeProof':False}))
if __name__=='__main__':main()

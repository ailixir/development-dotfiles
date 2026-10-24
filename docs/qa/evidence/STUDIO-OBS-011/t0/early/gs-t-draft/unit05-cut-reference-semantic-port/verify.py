#!/usr/bin/env python3
"""Pure source/text/hash/splice verification; no SUT, Java, SQL or native execution."""
from pathlib import Path
from collections import Counter
import ast,re,json,hashlib,difflib,uuid
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def h(s):return hashlib.sha256(s.encode()).hexdigest()
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
    for pin in inputs['taskPins']+[inputs['pureHelper'],inputs['predecessorPreservation']]:assert sha(R/pin['path'])==pin['sha256'],pin['path']
    rows=json.loads((O/'bindings.json').read_text());m=json.loads((O/'setup-input-assertion-map.json').read_text());p=json.loads((O/'preservation.json').read_text());w=json.loads((O/'source-witness.json').read_text())
    rel=Path(inputs['primaryFile']);before=(R/inputs['unit05ArchiveRoot']/rel.name).read_text();after=(O/'repo'/rel).read_text();insert=m['setupInsertion']['insertedLocalExact'];anchor=m['setupInsertion']['beforeAnchorExact']
    oldop='summary.get("source_reference_id").equals("ref-PASS")';newop='summary.get("source_reference_id").equals(expectedReference)'
    assert before.count(anchor)==before.count(oldop)==1 and after.count(insert)==after.count(newop)==1
    assert before.replace(anchor,insert+anchor).replace(oldop,newop)==after
    assert after.replace(insert,'',1).replace(newop,oldop,1)==before
    assert before.count('ref-PASS')==after.count('ref-PASS')+1
    a,b=method_span(before,'runGuidedControllerCut');assert anchor in before[a:b] and oldop in before[a:b]
    a,b=method_span(after,'runGuidedControllerCut');assert insert in after[a:b] and after[a:b].index(insert)<after[a:b].index(anchor)
    bm,am=map(methods,[before,after]);assert len(bm)==len(am)==31
    assert [(x['name'],x['annotation'],x['body']) for x in bm]==[(x['name'],x['annotation'],x['body']) for x in am]
    ba,aa=map(assertions,[before,after]);assert len(ba)==len(aa)==541
    idx=m['assertionMap']['ordinal1Based']-1;assert [i for i,(a,b) in enumerate(zip(ba,aa)) if a!=b]==[idx]
    assert ba[idx]==m['assertionMap']['oldFullExpression'] and aa[idx]==m['assertionMap']['newFullExpression'] and ba[idx].replace(oldop,newop)==aa[idx]
    for c in m['assertionMap']['unchangedOtherThreeConjuncts']:assert c in ba[idx] and c in aa[idx]
    assert m['allTransportAssertionOccurrences']==[{'ordinal1Based':i+1,'oldExpressionSha256':h(a),'newExpressionSha256':h(b),'disposition':'ONE_EXPLICIT_EXPECTED_OPERAND_MAP' if i==idx else 'EXACT'} for i,(a,b) in enumerate(zip(ba,aa))]
    for call in m['annotatedCallerMap']:
        a,b=method_span(before,call['annotatedMethod']);assert before[a:b]==call['originalAndSuccessorBody'] and h(before[a:b])==call['bodySha256']
    for name,l,r in [('delta-from-unit05.patch',before,after),('restore-unit05.patch',after,before)]:
        expected=''.join(difflib.unified_diff(l.splitlines(True),r.splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
        assert (O/name).read_text()==expected and apply_strict(l,expected)==r
    origTotal=0;unitTotal=0;additiveTotal=0;methodsTotal=0
    for row in rows:
        r=Path(row['file']);original=R/inputs['originalRoot']/r;archive=R/inputs['unit05ArchiveRoot']/r.name
        assert sha(original)==row['originalS011Sha256'] and sha(archive)==row['unit05ArchiveSha256']
        originalAssertions=Counter(assertions(original.read_text()));currentAssertions=Counter(assertions(archive.read_text()))
        assert not(originalAssertions-currentAssertions)
        origTotal+=sum(originalAssertions.values());unitTotal+=sum(currentAssertions.values());methodsTotal+=len(methods(archive.read_text()));additiveTotal+=sum((currentAssertions-originalAssertions).values())
        if r==rel:
            assert sha(O/'repo'/r)==row['successorSha256'] and row['copiedOrEditedHere']
            assert originalAssertions[ba[idx]]==1
            mapped=originalAssertions.copy();mapped[ba[idx]]-=1;mapped[aa[idx]]+=1
            assert not(mapped-Counter(aa)) and Counter(aa)-mapped==currentAssertions-originalAssertions
        else:assert row['successorSha256']==row['unit05ArchiveSha256'] and not row['copiedOrEditedHere'] and not (O/'repo'/r).exists()
    assert (methodsTotal,origTotal,unitTotal,additiveTotal)==(80,751,813,62)
    assert len(list((O/'repo').rglob('*.java')))==1
    prior=json.loads((R/inputs['predecessorPreservation']['path']).read_text())
    assert p['fullExpectedCases']==prior['fullExpectedCases'] and len(p['fullExpectedCases'])==99
    sentinel=[x for x in p['fullExpectedCases'] if x['class'].rsplit('.',1)[-1] not in [Path(r['file']).stem for r in rows]];assert len(sentinel)==11
    modebody=re.search(r'  enum Mode \{([\s\S]*?)\n  \}',after).group(1)
    assert re.findall(r'^\s*(\w+)\s*[,;]?\s*$',modebody,re.M)==p['modeVariants'] and len(p['modeVariants'])==9
    c=w['classifier'];cp=R/c['path'];assert sha(cp)==c['sha256'];assert '\n'.join(cp.read_text().splitlines()[c['firstLine']-1:c['lastLine']])+'\n'==c['text']
    archiveWitness=w['ordinaryInputArchiveWitness'];ap=R/archiveWitness['path'];assert sha(ap)==archiveWitness['sha256'];lines=ap.read_text().splitlines()
    for e in archiveWitness['excerpts']:assert '\n'.join(lines[e['firstLine']-1:e['lastLine']])+'\n'==e['text']
    f=w['publicFixture'];fp=R/f['path'];assert sha(fp)==f['sha256'];docs=json.loads(fp.read_text())['documents'];assert docs['secretReference']['stepId']==f['stepId'] and docs['secretAction']['coordinate']==f['secretActionCoordinate']
    inp=f['stepId']+':secret:PASS:fill.value';assert inp==w['calculationInputUtf8']
    expected='cfg-'+str(uuid.UUID(bytes=hashlib.md5(inp.encode('utf-8')).digest(),version=3))
    assert expected==w['independentlyCalculatedExpectedReference']=='cfg-0d0b8087-472c-3972-b1ba-7eec3eb4518e'
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256'],item['path']
    print(json.dumps({'staticOnly':True,'primaryPreviewFiles':1,'otherTwoBindingsOnly':True,'transportAnnotatedBodiesExact':31,'orderedMethodsRetained':80,'transportExpressions':541,'exactOtherTransportExpressions':540,'originalBaselineExpressionsRetained':751,'exactOtherBaselineExpressions':750,'unit05ExpressionsRetained':813,'exactOtherUnit05Expressions':812,'additiveChecksRetained':62,'expectedOperandMaps':1,'cases':99,'modes':9,'sentinels':11,'strictWholeSourceSpliceAndPatchReversal':True,'independentPublicInputCalculation':expected,'actualRowFirstCauseRemedyOrRuntimeProof':False}))
if __name__=='__main__':main()

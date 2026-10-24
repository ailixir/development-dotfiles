#!/usr/bin/env python3
"""Static source and unchanged-base audit; no SQL/Java/native/process/private evidence."""
from pathlib import Path
from collections import Counter
import ast,re,json,hashlib
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

def main():
    inputs=json.loads((O/'inputs.json').read_text())
    for pin in inputs['taskPins']+[inputs['pureHelper']]:assert sha(R/pin['path'])==pin['sha256'],pin['path']
    rows=json.loads((O/'base-bindings.json').read_text());carry=json.loads((O/'preservation.json').read_text());assert len(rows)==3
    count=0;assertions_count=0
    for row in rows:
        rel=Path(row['file']);old=R/inputs['originalRoot']/rel;archive=R/inputs['unit05ArchiveRoot']/rel.name;base=O/'base'/rel
        assert [sha(old),sha(archive),sha(base)]==[row['originalS011Sha256'],row['unit05ArchiveSha256'],row['baseSha256']]
        assert base.read_bytes()==archive.read_bytes() and not row['candidateProposed']
        assert (base.stat().st_mode&0o777)==0o644
        a,b=old.read_text(),base.read_text();om,bm=map(methods,[a,b]);count+=len(om)
        assert [(m['name'],m['annotation']) for m in om]==[(m['name'],m['annotation']) for m in bm]
        original=Counter(assertions(a));assertions_count+=sum(original.values());assert not(original-Counter(assertions(b)))
    assert count==80 and assertions_count==751
    prior=json.loads((R/inputs['predecessorRoot']/'preservation.json').read_text())
    assert carry['fullExpectedCases']==prior['fullExpectedCases'] and len(carry['fullExpectedCases'])==99
    sentinel=[x for x in carry['fullExpectedCases'] if x['class'].rsplit('.',1)[-1] not in [Path(r['file']).stem for r in rows]]
    assert len(sentinel)==11
    transport=(O/'base'/rows[-1]['file']).read_text()
    mode_body=re.search(r'  enum Mode \{([\s\S]*?)\n  \}',transport).group(1)
    assert re.findall(r'^\s*(\w+)\s*[,;]?\s*$',mode_body,re.M)==carry['modeVariants'] and len(carry['modeVariants'])==9
    assert 'summary.get("source_reference_id").equals("ref-PASS")' in transport
    w=json.loads((O/'source-witness.json').read_text())
    for pin in w['sourcePinsAndExcerpts']:
        p=R/pin['path'];assert sha(p)==pin['sha256'];lines=p.read_text().splitlines()
        for e in pin['excerpts']:assert '\n'.join(lines[e['firstLine']-1:e['lastLine']])+'\n'==e['text']
    fixture=w['publicContractFixture'];p=R/fixture['path'];assert sha(p)==fixture['sha256'];j=json.loads(p.read_text())['documents']
    assert {'secretReferenceStepId':j['secretReference']['stepId'],'secretActionCoordinate':j['secretAction']['coordinate']}==fixture['closedCoordinateProjection']
    assert not w['contradiction']['assertedLiteral'].startswith(w['contradiction']['generatedReferencePrefix'])
    assert not list(O.glob('*.patch')) and not (O/'draft-manifest.json').exists()
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256'],item['path']
    print(json.dumps({'staticOnly':True,'unchangedBaseFiles':3,'candidateFiles':0,'methods':80,'originalAssertions':751,'cases':99,'modeVariants':9,'sentinels':11,'unit05AllBytesExact':True,'sourceReferencePrefixContradiction':True,'actualWhichConjunctOrRowValueProven':False,'compileSqlNativeOrRuntimeProof':False,'status':'UNRESOLVED_REQUIRES_CONSTRAINT_RULING'}))
if __name__=='__main__':main()

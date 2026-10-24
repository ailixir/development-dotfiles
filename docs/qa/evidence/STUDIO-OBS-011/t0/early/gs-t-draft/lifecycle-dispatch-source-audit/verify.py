#!/usr/bin/env python3
"""Read-only source/text/ASCII branch witness; no production code or runtime execution."""
from pathlib import Path
from collections import Counter
import re,json,hashlib,difflib,unicodedata
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

def normalize_ascii_branch(text):
    # Source witness only: these concrete literals are ASCII. This does not execute Java
    # or claim equivalence for arbitrary Unicode/collation/locale inputs.
    assert text.isascii()
    return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKC',text).lower()).strip()

def grounded_ascii_branch(label,text):
    name=normalize_ascii_branch(label);source=normalize_ascii_branch(text)
    return (' '+name+' ') in (' '+source+' ') or set(name.split())<=set(source.split())

def main():
    inputs=json.loads((O/'inputs.json').read_text())
    for pin in inputs['taskPins']+inputs['sourcePins']+inputs['sourceControlPins']+[inputs['taskContext'],inputs['originalInventory'],inputs['oldPureVerifier']]:
        assert sha(R/pin['path'])==pin['sha256'],pin['path']
    rows=json.loads((O/'candidate-bindings.json').read_text())
    rt=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-03'
    originals=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02/source-original-backups'
    patches={k:[] for k in ['delta-from-unit03.patch','delta-from-s011.patch','restore-s011.patch']}
    count=0;assertion_count=0
    for row in rows:
        rel=Path(row['file']);old=(originals/rel).read_bytes();before=(rt/'formatted-candidate-archive'/rel).read_bytes();after=(O/'repo'/rel).read_bytes()
        assert [hashlib.sha256(x).hexdigest() for x in [old,before,after]]==[row['originalSha256'],row['unit03FormattedSha256'],row['successorSha256']]
        left=methods(old.decode());middle=methods(before.decode());right=methods(after.decode());count+=len(left)
        assert [(m['name'],m['annotation']) for m in left]==[(m['name'],m['annotation']) for m in right]
        assert [m['body'] for m in middle]==[m['body'] for m in right]
        expr=Counter(assertions(old.decode()));assert not(expr-Counter(assertions(after.decode())));assertion_count+=sum(expr.values())
        assert assertions(before.decode())==assertions(after.decode())
        if rel.stem=='GuidedLifecycleReasonIT':
            a,b=method_span(before.decode(),'sourceFixture');c,d=method_span(after.decode(),'sourceFixture')
            assert before.decode()[:a]==after.decode()[:c] and before.decode()[b:]==after.decode()[d:]
            block=before.decode()[a:b];assert block.count('Click Order reference.')==2
            assert block.replace('Click Order reference.','Click Order number.')==after.decode()[c:d]
        else:assert before==after
        for name,a,b in [('delta-from-unit03.patch',before,after),('delta-from-s011.patch',old,after),('restore-s011.patch',after,old)]:
            patches[name].extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
    assert count==80 and assertion_count==751
    for name,lines in patches.items():assert (O/name).read_text()==''.join(lines),name
    fixture=json.loads((R/'backend/src/test/resources/studio/guided/session-it-documents.json').read_text())['documents']
    node=fixture['observation']['nodes'][0]
    assert node['name']=='Order number'
    assert fixture['action']['target']['nodeId']==node['nodeId']
    assert fixture['action']['target']['locator']['value']=='order-reference'
    assert node['name'].strip() and not grounded_ascii_branch(node['name'],'Click Order reference.')
    assert grounded_ascii_branch(node['name'],'Click Order number.')
    assert normalize_ascii_branch(fixture['action']['target']['locator']['value'])=='order reference'
    proposal=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal03/proposal.json').read_text())
    assert len(proposal['expectedCases'])==99
    carry=json.loads((O/'preservation.json').read_text())
    assert carry['fullExpectedCases']==proposal['expectedCases']
    assert carry['modeVariantsCount']==9 and carry['unchangedSentinelInvocations']==11
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256'],item['path']
    print(json.dumps({'staticOnly':True,'methods':count,'originalAssertions':assertion_count,'unit03TestBodiesExact':True,'changedFileCount':1,'changedLiteralOccurrences':2,'oldFixtureGrounding':False,'correctedFixtureGrounding':True,'casesRetained':99,'runtimeCodeRecovered':False,'productionJavaExecuted':False}))

if __name__=='__main__': main()

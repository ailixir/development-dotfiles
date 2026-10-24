#!/usr/bin/env python3
"""Pure in-memory overlap/source/hash checks. No old helper main, live source or subprocess."""
from pathlib import Path
from collections import Counter
import re,json,hashlib,difflib
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

def port(source):
    for row in json.loads((O/'type-port-map.json').read_text()):
        source=re.sub(r'(?<![\w$])'+re.escape(row['before'])+r'(?![\w$])',
                      lambda m:row['after'],source)
    return source

def apply_one(source,patch):
    old=source.splitlines(True);lines=patch.splitlines(True)
    assert lines[0].startswith('--- ') and lines[1].startswith('+++ ')
    result=[];cursor=0;i=2
    while i<len(lines):
        m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);assert m
        start=int(m[1])-1;amount=int(m[2] or 1);newstart=int(m[3])-1;newamount=int(m[4] or 1)
        assert start>=cursor;result+=old[cursor:start];before=[];after=[];i+=1
        while i<len(lines) and not lines[i].startswith('@@ '):
            op=lines[i][0];body=lines[i][1:];assert op in ' +-'
            if op in ' -':before.append(body)
            if op in ' +':after.append(body)
            i+=1
        assert before==old[start:start+amount] and len(before)==amount and len(after)==newamount
        assert len(result)==newstart;result+=after;cursor=start+amount
    return ''.join(result+old[cursor:])

def main():
    inputs=json.loads((O/'inputs.json').read_text())
    for pin in inputs['taskPins']+[inputs['taskContext'],inputs['pureLexicalHelper'],
                                  inputs['foldPostClient']]+inputs['originalS011SourceBackups']:
        assert sha(R/pin['path'])==pin['sha256'],pin['path']
    overlay=json.loads((O/'overlap-manifest.json').read_text())
    atomic=json.loads((R/overlay['originalAtomicManifestPath']).read_text())
    fold=(R/overlay['originalAtomicManifestPath']).parent
    paths={x['path'] for x in overlay['overlaps']}
    remaining=[x for x in atomic['operations'] if x['path'] not in paths]
    assert len(atomic['operations'])==37 and len(paths)==2 and len(remaining)==35
    assert remaining==json.loads((O/'unchanged-35-operations.json').read_text())
    for row in atomic['operations']:assert sha(fold/'patches'/row['patch'])==row['patchSha256']
    forward=[];reverse=[];method_count=0
    for row in overlay['overlaps']:
        record=next(x for x in atomic['operations'] if x['path']==row['path'])
        assert row['originalAtomicOperation']==record
        prepared=(R/row['preparedPreimagePath']).read_text()
        final=(R/row['preparedFOLDPath']).read_text()
        gs=(R/row['gs05ArchivePath']).read_text()
        preview=(O/row['previewPath']).read_text()
        assert sha(R/row['preparedPreimagePath'])==record['preimageSha256']
        assert sha(R/row['preparedFOLDPath'])==record['candidateSha256']
        assert port(prepared)==final
        assert apply_one(prepared,(fold/'patches'/record['patch']).read_text())==final
        assert sha(R/row['gs05ArchivePath'])==row['gs05PreimageSha256']
        assert port(gs)==preview and sha(O/row['previewPath'])==row['previewSha256']
        patch=(O/row['patch']).read_text()
        restore=(O/'patches'/('restore__'+record['patch'])).read_text()
        assert apply_one(gs,patch)==preview and apply_one(preview,restore)==gs
        expected=''.join(difflib.unified_diff(gs.splitlines(True),preview.splitlines(True),
                         fromfile='a/'+row['path'],tofile='b/'+row['path']))
        assert expected==patch;forward.append(patch);reverse.append(restore)
        left=methods(gs);right=methods(preview);method_count+=len(left)
        assert [(m['name'],m['annotation']) for m in left]==[(m['name'],m['annotation']) for m in right]
        assert all(port(a['body'])==b['body'] for a,b in zip(left,right))
        assert [port(x) for x in assertions(gs)]==assertions(preview)
        assert not any(x in preview for x in ('GuidedRunnerClient','ObservedValidationClient',
                                               'GuidedPublicationAuthorization'))
    assert method_count==75
    assert ''.join(forward)==(O/'overlap.patch').read_text()
    assert ''.join(reverse)==(O/'restore-gst05.patch').read_text()
    findings=json.loads((O/'findings.json').read_text());unresolved=findings['unresolvedLifecycle']
    assert unresolved['status']=='UNRESOLVED' and unresolved['notAnOriginalFoldOperation'] is True
    assert not (O/'preview'/unresolved['path']).exists()
    life_pin=next(x for x in inputs['taskPins'] if x['path'].endswith('/GuidedLifecycleReasonIT.java'))
    life=(R/life_pin['path']).read_text();owner_patch=(O/unresolved['unappliedHunk']).read_text()
    old=unresolved['legacyType'];new='com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient'
    assert life.count(old)==1 and apply_one(life,owner_patch)==life.replace(old,new)
    assert not any(x['path']==unresolved['path'] for x in atomic['operations'])
    assert any(x['path']==unresolved['deletedByOriginalAtomicOperation'] and x['operation']=='delete'
               for x in remaining)
    assert len(findings['intendedDeletesCarriedUnchanged'])==4
    preserved=json.loads((O/'preservation.json').read_text())
    original_count=0
    for pin in inputs['originalS011SourceBackups']:
        name=Path(pin['path']).name;original=(R/pin['path']).read_text()
        target=next((O/x['previewPath'] for x in overlay['overlaps'] if Path(x['path']).name==name),None)
        current=target.read_text() if target is not None else life
        original_assertions=assertions(original)
        expected_assertions=[port(x) for x in original_assertions] if target is not None else original_assertions
        assert not(Counter(expected_assertions)-Counter(assertions(current)))
        original_count+=len(original_assertions)
    assert original_count==751 and method_count+len(methods(life))==80
    assert preserved['sourceMethodsAcrossThreeGsFiles']==80
    assert preserved['originalAssertionExpressionsAcrossThreeGsFiles']==751
    assert preserved['gsExpectedCases']==99 and preserved['gsModeVariants']==9
    assert preserved['unchangedSentinels']==11 and preserved['runtimeOrLaneProof'] is False
    assert overlay['fullFoldOrApplicationReady'] is False and overlay['actualNativeOutcome']=='UNKNOWN'
    if (O/'manifest.json').is_file():
        for x in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/x['path'])==x['sha256']
    print(json.dumps({'staticOnly':True,'exactFoldDeltaTypeMapProved':2,
        'overlapFiles':2,'preparedDeltaReconstructionAndGsForwardReverseExact':True,
        'remainingOperationsExact':35,'intendedDeletesRetained':4,
        'gsMethodsAcrossThree':80,'originalAssertionsCarried':751,'gsCasesRetained':99,
        'additionalFrameTypePortExplicit':True,'unresolvedLifecycleOutsideFoldOwnership':True,
        'fullFoldOrRuntimeReadiness':False,'irScratchClockOrCall':False,
        'sourceCompilerNativeProcessPrivateAction':False}))
if __name__=='__main__':main()

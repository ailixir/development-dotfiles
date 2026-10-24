#!/usr/bin/env python3
"""Read-only textual source verifier; no product writes or runtime execution."""
from pathlib import Path
import re,json,hashlib,difflib
from collections import Counter
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'.aiox').is_dir())

def sha(value):
    return hashlib.sha256(value).hexdigest()

def expected_fk_block(before):
    parent = '''      var principal = ((BffAuthenticationToken) user).getPrincipal();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES (?,'GS-T fixture',?)",
          principal.userId(),
          principal.email());
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
              + "VALUES ('CSI-123','GS-T fixture','Test','LOW',?,'Development')",
          principal.email());
'''
    marker = '      jdbc.update(\n          "INSERT INTO ui_tests'
    assert before.count(marker) == 1
    assert before.count("?::jsonb,'user-1')") == 1
    assert before.count('                  authoring, Map.of())));') == 1
    return before.replace(marker, parent + marker).replace("?::jsonb,'user-1')", '?::jsonb,?)').replace('                  authoring, Map.of())));', '                  authoring, Map.of())),\n          principal.email());')
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
    inputs=json.loads((HERE/'inputs.json').read_text())
    for pin in inputs['assignedPinsVerified']+inputs['additionalSourcePins']+inputs['schemaSqlPins']+inputs['priorSourceInputs']['relevantMainSource']+[inputs['taskContext'],inputs['sourceInventory']]:
        assert sha((ROOT/pin['path']).read_bytes())==pin['sha256'],pin['path']
    prior=ROOT/inputs['predecessorPath']
    seal=json.loads((prior/'manifest.json').read_text())
    for pin in seal['files']:
        assert sha((prior/pin['path']).read_bytes())==pin['sha256'],pin['path']
    rt=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02'
    bindings=json.loads((HERE/'candidate-bindings.json').read_text())
    patches={name:[] for name in ['delta-from-predecessor.patch','delta-from-formatted.patch','delta-from-s011.patch','restore-s011.patch']}
    total=0; all_original_assertions=0
    for row in bindings:
        rel=Path(row['file']); old=(rt/'source-original-backups'/rel).read_bytes();fmt=(rt/'formatted-candidate-archive'/rel).read_bytes();before=(prior/'repo'/rel).read_bytes();after=(HERE/'repo'/rel).read_bytes()
        assert [sha(old),sha(fmt),sha(before),sha(after)]==[row['originalSha256'],row['formattedSha256'],row['predecessorSha256'],row['successorSha256']]
        left=methods(old.decode());right=methods(after.decode());middle=methods(before.decode())
        assert [(m['name'],m['annotation']) for m in left]==[(m['name'],m['annotation']) for m in right]
        assert [m['body'] for m in middle]==[m['body'] for m in right]
        total+=len(left)
        orig=Counter(assertions(old.decode())); assert not(orig-Counter(assertions(after.decode())))
        all_original_assertions+=sum(orig.values())
        assert assertions(before.decode())==assertions(after.decode())
        literals=lambda s:re.findall(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"',s)
        sql=lambda s:[x for x in literals(s) if re.search(r'\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b',x)]
        timers=lambda s:re.findall(r'(?:Thread\.sleep|Duration\.of\w+|TimeUnit\.\w+\.to\w+)\([^()]*\)',s)
        assert not(Counter(sql(old.decode()))-Counter(sql(after.decode())))
        assert not(Counter(timers(old.decode()))-Counter(timers(after.decode())))
        if rel.stem=='GuidedServiceTransportFaultIT':
            assert before==after
        else:
            a,b=method_span(before.decode(),'sourceFixture');c,d=method_span(after.decode(),'sourceFixture')
            assert before.decode()[:a]==after.decode()[:c] and before.decode()[b:]==after.decode()[d:]
            assert expected_fk_block(before.decode()[a:b])==after.decode()[c:d]
        assert masked(after.decode()).count('{')==masked(after.decode()).count('}')
        for name,a,b in [('delta-from-predecessor.patch',before,after),('delta-from-formatted.patch',fmt,after),('delta-from-s011.patch',old,after),('restore-s011.patch',after,old)]:
            patches[name].extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
    for name,lines in patches.items(): assert (HERE/name).read_text()==''.join(lines),name
    carry=json.loads((HERE/'preservation-map.json').read_text())
    proposal=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json').read_text())
    assert carry['fullExpectedCases']==proposal['expectedCases'] and len(carry['fullExpectedCases'])==99
    assert total==80 and all_original_assertions==751 and len(carry['modeVariants'])==9
    print(json.dumps({'staticOnly':True,'completeCandidates':3,'newFkSourceHelpers':2,'orderedMethods':total,'originalAssertionExpressionsPreserved':all_original_assertions,'expectedCases':99,'predecessorSealVerified':True,'allPredecessorTestBodiesExact':True,'transportExactToResume2':True,'patchesReconstructed':4,'runtimeVerified':False}))

if __name__=='__main__': main()

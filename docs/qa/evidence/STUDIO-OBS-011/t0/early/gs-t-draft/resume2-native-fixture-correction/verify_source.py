#!/usr/bin/env python3
"""Read-only static SOURCE checks. No native execution or product writes."""
from pathlib import Path
import re, json, hashlib, difflib
from collections import Counter
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'.aiox').is_dir())
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
    for match in re.finditer(r'\bassertThat(?:ThrownBy|ExceptionOfType|Code)?\s*\(', flat):
        pos = flat.index('(', match.start()) + 1
        depth = 1
        while depth:
            depth += (flat[pos] == '(') - (flat[pos] == ')')
            pos += 1
        while True:
            tail = re.match(r'\s*\.\s*\w+\s*\(', flat[pos:])
            if not tail:
                break
            pos += tail.end()
            depth = 1
            while depth:
                depth += (flat[pos] == '(') - (flat[pos] == ')')
                pos += 1
        parts = re.findall(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[^\s]', source[match.start():pos])
        result.append(''.join(p for p in parts if not p.startswith(('//', '/*'))))
    return result
def sha(b): return hashlib.sha256(b).hexdigest()
def main():
    rows=json.loads((HERE/'candidate-bindings.json').read_text())
    inputs=json.loads((HERE/'inputs.json').read_text())
    for binding in inputs['assignedPinsVerified']+inputs['relevantMainSource']+[inputs['assignedContext']]:
        assert sha((ROOT/binding['path']).read_bytes())==binding['sha256'],binding['path']
    rt=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02'
    total=0; count=0; all_count=0
    patches={'delta-from-formatted.patch':[], 'delta-from-s011.patch':[], 'restore-s011.patch':[]}
    for row in rows:
        rel=Path(row['file']); old=(rt/'source-original-backups'/rel).read_bytes(); archived=(rt/'formatted-candidate-archive'/rel).read_bytes(); new=(HERE/'repo'/rel).read_bytes()
        assert [sha(old),sha(archived),sha(new)]==[row['originalSha256'],row['formattedSha256'],row['successorSha256']]
        for name,a,b in [('delta-from-formatted.patch',archived,new),('delta-from-s011.patch',old,new),('restore-s011.patch',new,old)]:
            patches[name].extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
        left=methods(old.decode());right=methods(new.decode());assert [(x['name'],x['annotation']) for x in left]==[(x['name'],x['annotation']) for x in right]
        total+=len(left)
        for a,b in zip(left,right):
            # Existing extractor normalizes whitespace; exact raw test bodies are separately identical to formatted archive.
            pos=0
            for assertion in a['assertions']:
                pos=b['assertions'].index(assertion,pos)+1;count+=1
        before=methods(archived.decode());assert [m['body'] for m in before]==[m['body'] for m in right]
        original_assertions=Counter(assertions(old.decode()))
        assert not (original_assertions-Counter(assertions(new.decode())))
        assert assertions(archived.decode())==assertions(new.decode())
        all_count+=sum(original_assertions.values())
        assert masked(new.decode()).count('{')==masked(new.decode()).count('}')
    assert total==80
    for name,lines in patches.items(): assert (HERE/name).read_text()==''.join(lines),name
    proposal=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json').read_text())
    assert len(proposal['expectedCases'])==99 and proposal['expectedExpandedCases']==99
    carry=json.loads((HERE/'preservation-map.json').read_text())
    assert carry['fullExpectedCases']==proposal['expectedCases']
    assert carry['orderedMethods']==80 and carry['allOriginalAssertionExpressions']==751
    assert carry['editedFileExpandedCases']+carry['unchangedSentinelCases']==99
    # Delta reconstruction is independently mechanical, with no patch utility or application.
    transport=rows[-1]
    assert Path(transport['file']).stem=='GuidedServiceTransportFaultIT'
    rel=Path(transport['file']); archived=(rt/'formatted-candidate-archive'/rel).read_text(); new=(HERE/'repo'/rel).read_text()
    mode=re.search(r'enum Mode\s*\{([\s\S]*?);',new).group(1)
    assert [s.strip() for s in mode.split(',')]==carry['modeVariants']
    assert len(carry['modeVariants'])==9
    statement="""    sessions.installTranslation(
        new GuidedTranslationStore(actualJdbc, C),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            actualJdbc, C));
"""
    assert archived.count(statement)==1 and new==archived.replace(statement,'')
    for row in rows[:2]: assert not row['changedFromFormatted']
    assert all_count==751
    print(json.dumps({'staticOnly':True,'methods':total,'originalTestBodyAssertionExtractorCount':count,'allOriginalAssertionExpressionsPreserved':all_count,'exactArchivedTestBodies':True,'publicExpectedCases':99,'runtimeVerified':False}))
if __name__=='__main__':main()

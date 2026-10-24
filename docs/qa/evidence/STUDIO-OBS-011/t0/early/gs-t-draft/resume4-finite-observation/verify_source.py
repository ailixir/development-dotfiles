#!/usr/bin/env python3
"""Read-only textual composition verifier. No phase main, native/Java/Groovy execution or writes."""
from pathlib import Path
from collections import Counter
import re,json,hashlib,ast,difflib
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'AGENTS.md').is_file())
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

def reverse_observer(source,helper):
    assert source.count(helper)==1;source=source.replace(helper,'')
    for line in ['      observeGstCutPrimary(failure);\n','      observeGstCallback(route, response.statusCode(), response.body());\n']:
        assert source.count(line)==1;source=source.replace(line,'')
    return source

def main():
    data=json.loads((HERE/'inputs.json').read_text());prior=ROOT/data['predecessorRoot'];observer=ROOT/data['observerRoot'];recipe=ROOT/data['recipeRoot']
    for pin in data['taskPins']+[data['taskContext'],data['observerManifest'],data['fkReview'],data['proposal03'],data['phase03'],data['supplementalObserverReview'],data['errorSchemaSource']]:assert sha(ROOT/pin['path'])==pin['sha256'],pin['path']
    for pin in json.loads((prior/'manifest.json').read_text())['files']:assert sha(prior/pin['path'])==pin['sha256'],pin['path']
    for pin in json.loads((observer/'artifact-manifest.json').read_text())['artifacts']:assert sha(ROOT/pin['path'])==pin['sha256'],pin['path']
    source_inputs=data['sourceInputs']
    for pin in source_inputs['schemaSqlPins']+source_inputs['additionalSourcePins']+source_inputs['priorSourceInputs']['relevantMainSource']+[source_inputs['sourceInventory']]:assert sha(ROOT/pin['path'])==pin['sha256'],pin['path']
    for name in ['helper.java.fragment','filtered-output.init.gradle','projection-contract.json']:assert (HERE/name).read_bytes()==(observer/name).read_bytes(),name
    helper=(HERE/'helper.java.fragment').read_text();rows=json.loads((HERE/'candidate-bindings.json').read_text());rt=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02'
    patches={n:[] for n in ['delta-from-predecessor.patch','delta-from-formatted.patch','gs-t-draft.patch','restore-s011.patch']};total=0;count=0
    for row in rows:
        rel=Path(row['file']);old=(rt/'source-original-backups'/rel).read_bytes();fmt=(rt/'formatted-candidate-archive'/rel).read_bytes();before=(prior/'repo'/rel).read_bytes();after=(HERE/'repo'/rel).read_bytes()
        assert [hashlib.sha256(x).hexdigest() for x in [old,fmt,before,after]]==[row['originalSha256'],row['formattedSha256'],row['predecessorSha256'],row['successorSha256']]
        left=methods(old.decode());middle=methods(before.decode());right=methods(after.decode());total+=len(left)
        assert [(m['name'],m['annotation']) for m in left]==[(m['name'],m['annotation']) for m in right]
        assert [m['body'] for m in middle]==[m['body'] for m in right]
        original=Counter(assertions(old.decode()));assert not(original-Counter(assertions(after.decode())));count+=sum(original.values())
        assert assertions(before.decode())==assertions(after.decode())
        if rel.stem=='GuidedServiceTransportFaultIT':
            assert reverse_observer(after.decode(),helper).encode()==before
            reference=apply_strict(fmt.decode(),(observer/'observation-only.patch').read_text())
            assert hashlib.sha256(reference.encode()).hexdigest()=='604135fefd392f1cee1b7fcf9b2faf972d727dbf2d76c75f20580d6dd7f607ab'
            duplicate="""    sessions.installTranslation(
        new GuidedTranslationStore(actualJdbc, C),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            actualJdbc, C));
"""
            assert reference.count(duplicate)==1 and reference.replace(duplicate,'').encode()==after
        else: assert before==after
        for name,a,b in [('delta-from-predecessor.patch',before,after),('delta-from-formatted.patch',fmt,after),('gs-t-draft.patch',old,after),('restore-s011.patch',after,old)]:patches[name].extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
        assert masked(after.decode()).count('{')==masked(after.decode()).count('}')
    assert total==80 and count==751
    for name,lines in patches.items():assert (HERE/name).read_text()==''.join(lines),name
    assert (HERE/'delta-from-s011.patch').read_bytes()==(HERE/'gs-t-draft.patch').read_bytes()
    proposal=json.loads((ROOT/data['proposal03']['path']).read_text());oldproposal=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json').read_text());carry=json.loads((HERE/'preservation-map.json').read_text())
    assert proposal['expectedCases']==oldproposal['expectedCases']==carry['fullExpectedCases'] and len(proposal['expectedCases'])==99
    assert proposal['nativeTestClasses']==oldproposal['nativeTestClasses'] and len(proposal['nativeTestClasses'])==5
    assert proposal['proposedNativeCommandUnderImmutableLock']==[('obs011-gst-provisional-03' if x=='obs011-gst-provisional-02' else x) for x in oldproposal['proposedNativeCommandUnderImmutableLock']]+['--init-script',str(HERE/'filtered-output.init.gradle')]
    for key in ['sourceWriteReleased','sourceReleased','nativeReleased','retryReleased','actualExecution','nativeCredit','remediationClaim']:assert proposal[key] is False,key
    contract=json.loads((HERE/'projection-contract.json').read_text());schema=json.loads((ROOT/'docs/specs/studio-observed-authoring/contracts/v3/error.schema.json').read_text());codes=re.findall(r'"([A-Z_]+)"',re.search(r'private static String gstFixedCode.*?case (.*?) -> code;',helper,re.S).group(1))
    assert codes==schema['properties']['code']['enum'] and contract['codes']==codes+['UNPROVEN'] and len(codes)==28
    filter_source=(HERE/'filtered-output.init.gradle').read_text();grammar=re.search(r'record ==~ /(.*)/\) t.logger',filter_source).group(1)
    good=['GST_DIAG|site=CALLBACK_STATUS|route=CLAIM|status=409|family=HTTP_ERROR|code=REVISION_CONFLICT|frame=NONE|line=0','GST_DIAG|site=CUT_PRIMARY|route=NONE|status=409|family=GUIDED_SESSION|code=RUNTIME_INCOMPATIBLE|frame=CLAIM|line=99999','GST_DIAG|site=OBSERVER_UNPROVEN|route=NONE|status=NONE|family=OTHER|code=UNPROVEN|frame=NONE|line=0']
    bad=[good[0]+'|body=PRIVATE',good[0]+'\n'+good[0],good[0].replace('CLAIM','URL'),good[0].replace('409','418'),good[0].replace('HTTP_ERROR','PRIVATE'),good[0].replace('REVISION_CONFLICT','UNKNOWN_SECRET'),good[0].replace('frame=NONE','frame=raw.Class'),good[0].replace('line=0','line=100000')]
    assert all(re.fullmatch(grammar,x) and len(x)<=768 for x in good)
    assert all(not re.fullmatch(grammar,x) for x in bad)
    oldrecipe=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-restricted-unit-prep/resume2'
    assert (recipe/'gst-three-only.init.gradle').read_bytes()==(oldrecipe/'gst-three-only.init.gradle').read_bytes()
    phase=(recipe/'phase.py').read_text();reverse=phase.replace("early/gs-t-draft/resume4-finite-observation';U=", "early/gs-t-draft';U=").replace('runtime/gst-restricted-unit03','runtime/gst-restricted-unit02').replace('runtime/gst-limited-start-proposal03/proposal.json','runtime/gst-limited-start-proposal02/proposal.json')
    assert reverse==(oldrecipe/'phase.py').read_text() and ast.dump(ast.parse(reverse))==ast.dump(ast.parse((oldrecipe/'phase.py').read_text()))
    print(json.dumps({'staticOnly':True,'completeCandidates':3,'methods':total,'originalAssertions':count,'observerHooks':2,'exactObserverReversalToFkPredecessor':True,'sessionLifecycleExactFk':True,'cases':99,'modes':9,'sentinels':11,'grammarAccepted':len(good),'grammarRejected':len(bad),'phasePointersOnly':3,'spotlessInitExact':True,'runtimeVerified':False}))

if __name__=='__main__': main()

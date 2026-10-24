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
    inputs=json.loads((O/'inputs.json').read_text());P=R/inputs['predecessorRoot'];A=R/inputs['peerRoot']
    for pin in inputs['taskPins']+[inputs['taskContext'],inputs['predecessorVerifier'],inputs['strictHelperSource']]:assert sha(R/pin['path'])==pin['sha256'],pin['path']
    prior_inputs=inputs['originalInputs']
    for pin in prior_inputs['taskPins']+prior_inputs['sourcePins']+prior_inputs['sourceControlPins']+[prior_inputs['taskContext'],prior_inputs['originalInventory'],prior_inputs['oldPureVerifier']]:assert sha(R/pin['path'])==pin['sha256'],pin['path']
    for item in json.loads((P/'manifest.json').read_text())['files']:assert sha(P/item['path'])==item['sha256']
    for item in json.loads((A/'artifact-manifest.json').read_text())['artifacts']:assert sha(R/item['path'])==item['sha256']
    rows=json.loads((O/'candidate-bindings.json').read_text());rt=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-03';originals=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02/source-original-backups'
    patches={k:[] for k in ['delta-from-predecessor.patch','delta-from-unit03.patch','delta-from-s011.patch','restore-s011.patch']};count=0;assertion_count=0
    for row in rows:
        rel=Path(row['file']);old=(originals/rel).read_bytes();fmt=(rt/'formatted-candidate-archive'/rel).read_bytes();before=(P/'repo'/rel).read_bytes();after=(O/'repo'/rel).read_bytes()
        assert [hashlib.sha256(x).hexdigest() for x in [old,fmt,before,after]]==[row['originalSha256'],row['unit03FormattedSha256'],row['predecessorSha256'],row['successorSha256']]
        left=methods(old.decode());middle=methods(fmt.decode());right=methods(after.decode());count+=len(left)
        assert [(m['name'],m['annotation']) for m in left]==[(m['name'],m['annotation']) for m in right]
        assert [m['body'] for m in middle]==[m['body'] for m in right]
        expr=Counter(assertions(old.decode()));assert not(expr-Counter(assertions(after.decode())));assertion_count+=sum(expr.values());assert assertions(fmt.decode())==assertions(after.decode())
        if rel.stem=='GuidedSessionIT':
            a,b=method_span(before.decode(),'sourceFixture');c,d=method_span(after.decode(),'sourceFixture');assert before.decode()[:a]==after.decode()[:c] and before.decode()[b:]==after.decode()[d:]
            block=before.decode()[a:b];assert block.count('Click Order reference.')==2;assert block.replace('Click Order reference.','Click Order number.')==after.decode()[c:d]
        elif rel.stem=='GuidedLifecycleReasonIT':assert after==before
        else:
            assert rel.stem=='GuidedServiceTransportFaultIT' and before==fmt
            assert apply_strict(fmt.decode(),(A/'peer-observation.patch').read_text()).encode()==after
            # Exact classifier/ref reversal plus untouched original ownership helper bodies.
            peer=json.loads((A/'contract-addendum.json').read_text());assert row['successorSha256']==peer['proposedPostimageSha256']
            for class_name in ['SourceStopOwner','TrackingTransactionTemplate']:
                def body(s):
                    m=masked(s);start=m.index('class '+class_name);a=m.index('{',start);depth=1;end=a+1
                    while depth:depth+=(m[end]=='{')-(m[end]=='}');end+=1
                    return s[start:end]
                assert body(fmt.decode())==body(after.decode())
        for name,a,b in [('delta-from-predecessor.patch',before,after),('delta-from-unit03.patch',fmt,after),('delta-from-s011.patch',old,after),('restore-s011.patch',after,old)]:patches[name].extend(difflib.unified_diff(a.decode().splitlines(True),b.decode().splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
    assert count==80 and assertion_count==751
    for name,lines in patches.items():assert (O/name).read_text()==''.join(lines),name
    # Reuse the existing strict single-file patch checker for each full delta section.
    for patch_name,base_root,expected_root in [('delta-from-predecessor.patch',P/'repo',O/'repo'),('delta-from-unit03.patch',rt/'formatted-candidate-archive',O/'repo'),('delta-from-s011.patch',originals,O/'repo'),('restore-s011.patch',O/'repo',originals)]:
        for block in re.split(r'(?=^--- a/)',(O/patch_name).read_text(),flags=re.M):
            if block:
                rel=Path(block.splitlines()[0][6:]);assert apply_strict((base_root/rel).read_text(),block)==(expected_root/rel).read_text(),(patch_name,str(rel))
    assert (O/'gs-t-draft.patch').read_bytes()==(O/'delta-from-s011.patch').read_bytes()
    assert (O/'filtered-output.init.gradle').read_bytes()==(A/'filtered-output.init.gradle').read_bytes()
    assert (O/'peer-observation.patch').read_bytes()==(A/'peer-observation.patch').read_bytes()
    fixture=json.loads((R/'backend/src/test/resources/studio/guided/session-it-documents.json').read_text())['documents'];node=fixture['observation']['nodes'][0];assert node['name']=='Order number'
    assert not grounded_ascii_branch(node['name'],'Click Order reference.') and grounded_ascii_branch(node['name'],'Click Order number.')
    proposal=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal03/proposal.json').read_text());carry=json.loads((O/'preservation.json').read_text());assert carry['fullExpectedCases']==proposal['expectedCases'] and len(carry['fullExpectedCases'])==99
    assert carry['modeVariantsCount']==9 and carry['unchangedSentinelInvocations']==11
    draft=json.loads((O/'draft-manifest.json').read_text());assert [{k:x[k] for k in ['file','beforeSha256','afterSha256']} for x in draft]==[{'file':x['file'],'beforeSha256':x['originalSha256'],'afterSha256':x['successorSha256']} for x in rows]
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256'],item['path']
    print(json.dumps({'staticOnly':True,'completeCandidates':3,'methods':count,'originalAssertions':assertion_count,'unit03AnnotatedTestBodiesExact':True,'sessionNewFixtureLiteralChanges':2,'lifecycleExactReviewedPredecessor':True,'transportExactSealedPeerPatch':True,'filteredInitExactPeer':True,'ownershipClassBodiesExact':2,'cases':99,'modeVariants':9,'sentinels':11,'originalGrounding':False,'correctedGrounding':True,'runtimeCodeRecovered':False,'compileNativeOrSqlExecuted':False}))

if __name__=='__main__': main()

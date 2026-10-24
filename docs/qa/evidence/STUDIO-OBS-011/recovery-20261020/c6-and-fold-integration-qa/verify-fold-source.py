"""Review-only FOLD/LEFT text reconstruction. No author helper or source-language parser."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[5]
BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020'
PACK=BASE/'fold-final-c6-successor';OLD=BASE/'fold-final-current'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
manifest=load(PACK/'manifest.json')
assert sha((PACK/'manifest.json').read_bytes())=='d2ca2f6485721bb4f030ada707242f33e6f59770d14d739773c8000ee4dfeb68'
for row in manifest['files']:
    raw=(ROOT/row['path']).read_bytes()
    assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
binding=load(PACK/'application-bindings.json');old_binding=load(OLD/'manifest.json')
assert sha((OLD/'manifest.json').read_bytes())==binding['oldManifestSha256']=='b25715ad81a400a76a4cb25693808a6fcf69486aba7493e0d3ed0117657ad1f5'
historical=load(PACK/'historical-preservation.json')['originalPacketFiles']
assert len(historical)==82
for row in historical:
    assert sha((ROOT/row['path']).read_bytes())==row['sha256']
name='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
before={};after={};operations=[]
for entry,old in zip(binding['files'],old_binding['files'],strict=True):
    assert entry['path']==old['path'] and entry['operation']==old['operation']
    for label,pinfield,evidencefield in [('before','beforeSha256','incomingEvidence'),('after','afterSha256','candidateEvidence')]:
        evidence=entry[evidencefield]
        raw=(ROOT/evidence).read_bytes() if evidence else None
        assert (sha(raw) if raw is not None else None)==entry[pinfield]
        (before if label=='before' else after)[entry['path']]=raw
    if entry['path']!=name:
        assert entry['beforeSha256']==old['prospectiveIncomingSha256'] and entry['afterSha256']==old['finalSha256']
        assert entry['sameAsHistoricalOperation'] is True
        assert entry['beforeMode']==old['incomingMode'] and entry['afterMode']==old['finalMode']
        actual=ROOT/entry['path']
        assert (sha(actual.read_bytes()) if actual.is_file() else None)==entry['beforeSha256']
    operations.append(entry['operation'])
assert Counter(operations)==Counter(edit=33,add=1,delete=4) and len(before)==len(after)==38
assert sha(before[name])==binding['beforeReplay']=='abb4773016aa3499b76cf1aae3ac0da0f0b820ac4df19fb66887188c7dfe53f4'
assert sha(after[name])==binding['afterReplay']=='cf38d0c1314db3f4ae81c827846a97d144fdca5e9adb78de86e0723e8663a297'

def reconstruct(buffers,patch):
    lines=patch.decode().splitlines(keepends=True);i=0;outputs={};hunks=[]
    while i<len(lines):
        assert lines[i].startswith('--- ')
        old_path=lines[i][4:].rstrip('\n');new_path=lines[i+1][4:].rstrip('\n')
        assert lines[i+1].startswith('+++ ')
        target=(new_path[2:] if old_path=='/dev/null' else old_path[2:])
        assert old_path=='/dev/null' or old_path=='a/'+target
        assert new_path=='/dev/null' or new_path=='b/'+target
        old=buffers[target]
        assert (old is None)==(old_path=='/dev/null')
        source=(old or b'').decode().splitlines(keepends=True)
        i+=2;pos=0;result=[]
        while i<len(lines) and not lines[i].startswith('--- '):
            header=lines[i];match=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',header);assert match
            start,count,new_start,new_count=[int(x) if x is not None else 1 for x in match.groups()]
            offset=start-1 if count else start
            assert offset>=pos
            result.extend(source[pos:offset]);pos=offset
            assert len(result)==(new_start-1 if new_count else new_start)
            i+=1;consumed=produced=0;old_block=[];new_block=[]
            while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
                line=lines[i];assert line[0] in ' +-'
                if line[0] in ' -':
                    assert source[pos]==line[1:];pos+=1;consumed+=1;old_block.append(line[1:])
                if line[0] in ' +':result.append(line[1:]);produced+=1;new_block.append(line[1:])
                i+=1
            assert (consumed,produced)==(count,new_count)
            hunks.append({'path':target,'header':header.rstrip('\n'),
                          'oldBlockSha256':sha(''.join(old_block).encode()),'newBlockSha256':sha(''.join(new_block).encode())})
        result.extend(source[pos:]);candidate=''.join(result).encode()
        assert target not in outputs
        if new_path=='/dev/null':assert not candidate;candidate=None
        outputs[target]=candidate
    return outputs,hunks

patch=(PACK/'final-from-repaired-b4.patch').read_bytes()
output,hunks=reconstruct(before,patch);assert output==after and len(hunks)==142
assert reconstruct(after,(PACK/'rollback-final-to-repaired-b4.patch').read_bytes())[0]==before
old_patch=(OLD/'final-from-incoming-rebased.patch').read_bytes()
assert sha(old_patch)==binding['oldPatchSha256']
strip_headers=lambda b:b''.join(line for line in b.splitlines(keepends=True) if not line.startswith(b'@@ '))
assert strip_headers(old_patch)==strip_headers(patch)
old_headers=[x for x in old_patch.decode().splitlines() if x.startswith('@@ ')]
new_headers=[x for x in patch.decode().splitlines() if x.startswith('@@ ')]
changed=[{'old':a,'new':b} for a,b in zip(old_headers,new_headers,strict=True) if a!=b]
exact=load(PACK/'exact-hunks.json')
assert exact['count']==142 and changed==exact['changedHeaderPairs'] and len(changed)==2
for actual,record in zip(hunks,exact['hunks'],strict=True):
    assert actual['path']==record['path'] and actual['oldBlockSha256']==record['oldBlockSha256'] and actual['newBlockSha256']==record['newBlockSha256']
    assert record['exactMatches']==1 and record['allOriginalContextPreserved'] is True and record['contextRelaxed'] is False

# Same accepted C6 transformation on both inherited Replay buffers; preserve every other byte.
c6=BASE/'slot3-release-observation-fix'
original=(c6/'before'/name).read_text();fixed_helper=(c6/'green-helper.java.txt').read_text()
a=original.index('  private static boolean p8TerminatedUnsignalled(ProcessHandle pinned) {')
b=original.index('\n  // R10-rev2 I3',a);old_helper=original[a:b]
a=original.index('  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() {')
b=original.index('\n  @Test',a);old_support=original[a:b]
controls=(c6/'appended-controls.java.txt').read_text()
old_header='  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() {\n'
new_header='  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() throws Exception {\n    itrEnsureClassFixtures();\n'
new_support=(old_support[:-4]+controls+'  }\n').replace(old_header,new_header,1)
for label,folder,buffers,review_patch in [('incoming','incoming',before,'c6-incoming-review-delta.patch'),('final','candidates',after,'c6-final-review-delta.patch')]:
    inherited=(OLD/folder/name).read_text()
    assert inherited.count(old_helper)==inherited.count(old_support)==1
    composed=inherited.replace(old_helper,fixed_helper,1).replace(old_support,new_support,1)
    assert composed.encode()==buffers[name]
    assert composed.replace(fixed_helper,old_helper,1).replace(new_support,old_support,1)==inherited
    assert reconstruct({name:inherited.encode()},(PACK/review_patch).read_bytes())[0][name]==buffers[name]
    assert composed.count('Thread.sleep(')==inherited.count('Thread.sleep(')==20
    assert composed.count('TimeUnit.NANOSECONDS.sleep(')==inherited.count('TimeUnit.NANOSECONDS.sleep(')==1
    assert controls in composed and fixed_helper in composed

left=load(BASE/'left-required-current/manifest.json');left_patch=(BASE/'left-required-current/left-required.patch').read_bytes()
assert sha(left_patch)=='5735402e8d1d48a1df3c4f1587d7f3027bd1e1db7594d5826620adb13eb3548a'
left_before={e['path']:(ROOT/e['path']).read_bytes() for e in left['files']}
assert set(left_before).isdisjoint(before) and len(left_before)==10
for e in left['files']:assert sha(left_before[e['path']])==e['beforeSha256']
left_after=reconstruct(left_before,left_patch)[0]
for e in left['files']:assert sha(left_after[e['path']])==e['afterSha256']
combined_before={**left_before,**before};combined_after={**left_after,**after}
combined_output,combined_hunks=reconstruct(combined_before,(PACK/'combined-left10-fold38.patch').read_bytes())
assert combined_output==combined_after and len(combined_hunks)==manifest['combinedHunkCount']==162
assert reconstruct(combined_after,(PACK/'rollback-combined-to-repaired-b4.patch').read_bytes())[0]==combined_before
assert reconstruct(left_after,(PACK/'rollback-left10.patch').read_bytes())[0]==left_before
composition=load(PACK/'left-fold-composition.json')
assert composition['overlapPaths']==[] and composition['combinedOperationCount']==48
for path,wanted in binding['protectedReadOnlySourceBindings'].items():
    assert path not in combined_before and sha((ROOT/path).read_bytes())==wanted

out={'sourceVerdict':'CLEAN_EXACT_C6_FOLD_SUCCESSOR_AND_DISJOINT_LEFT_COMPOSITION','mandatoryFindings':[],
     'manifestSha256':sha((PACK/'manifest.json').read_bytes()),'applicationBindingsSha256':sha((PACK/'application-bindings.json').read_bytes()),
     'foldPatchSha256':sha(patch),'rollbackPatchSha256':sha((PACK/'rollback-final-to-repaired-b4.patch').read_bytes()),
     'beforeReplay':binding['beforeReplay'],'afterReplay':binding['afterReplay'],'operationCount':38,'hunkCount':142,
     'same37OtherOperationsAndOutputs':True,'onlyTwoReplayHeadersChanged':changed,
     'c6ExactBoundedTransformationOnInheritedIncomingAndTypedBuffers':True,'originalAssertionsAnd21DeliberateSleepsPreserved':True,
     'left10PathsDisjoint':True,'combined48ForwardInverseExact':True,'historical82ArtifactsUnchanged':True,
     'actualReplayEqualityRequired':False,'sourceApplied':False,'runtimeExecuted':False,'finalPairCredit':False}
(HERE/'fold-source-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'sourceVerdict':out['sourceVerdict'],'checksSha256':sha((HERE/'fold-source-checks.json').read_bytes())}))

"""Pure source/AST/metadata checks; no phase main, source writes or native execution."""
from pathlib import Path
import ast,hashlib,json,re
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
OLD=O.parent/'resume2'
D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/resume4-finite-observation'
Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal03'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    assert sha(OLD/'manifest.json')=='7f620220c7d676e0203869f1072f93a53e9ec1b26ba1d8a1ffca3bb3c45ba022'
    for name,h in json.loads((OLD/'manifest.json').read_text())['files'].items():assert sha(OLD/name)==h,name
    for directory in [D,Q]:
        for item in json.loads((directory/'manifest.json').read_text())['files']:assert sha(directory/item['path'])==item['sha256'],item['path']
    phase=(O/'phase.py').read_text()
    reverse=phase.replace("early/gs-t-draft/resume4-finite-observation';U=", "early/gs-t-draft';U=").replace('runtime/gst-restricted-unit03','runtime/gst-restricted-unit02').replace('runtime/gst-limited-start-proposal03/proposal.json','runtime/gst-limited-start-proposal02/proposal.json')
    assert reverse==(OLD/'phase.py').read_text()
    assert ast.dump(ast.parse(reverse))==ast.dump(ast.parse((OLD/'phase.py').read_text()))
    assert (O/'gst-three-only.init.gradle').read_bytes()==(OLD/'gst-three-only.init.gradle').read_bytes()
    for name in ['cache-metadata.json','case-catalog.json','source-crosscheck.json']:assert (O/name).read_bytes()==(OLD/name).read_bytes(),name
    old=json.loads((OLD/'bindings.json').read_text());new=json.loads((O/'bindings.json').read_text());change=json.loads((O/'binding-transformation.json').read_text())
    assert sha(OLD/'bindings.json')==change['oldBindingsSha256']
    mapping={x['from']:x for x in change['retargetedBindings']}
    assert len(mapping)==7
    for name,h in old.items():
        if name in mapping:
            x=mapping[name];assert new[x['to']]==x['sha256']==sha(R/x['to'])
        else:
            # Preserve the inherited requirement as a literal binding. Do not newly read
            # historical protected logs or cached binaries merely to prepare this recipe.
            assert new[name]==h,name
    for name in change['newBindings']:assert new[name]==sha(R/name),name
    assert set(new)=={mapping[n]['to'] if n in mapping else n for n in old}|set(change['newBindings'])
    proposal=json.loads((Q/'proposal.json').read_text())
    assert proposal['expectedCases']==json.loads((O/'case-catalog.json').read_text()) and len(proposal['expectedCases'])==99
    for flag in ['sourceWriteReleased','sourceReleased','nativeReleased','actualExecution','retryReleased']:assert proposal[flag] is False
    rows=json.loads((D/'draft-manifest.json').read_text())
    assert [{k:x[k] for k in ['file','beforeSha256','afterSha256']} for x in rows]==[{k:x[k] for k in ['file','beforeSha256','afterSha256']} for x in proposal['writerBindings']]
    recipe=(O/'RECIPE.md').read_text()
    assert 'ONE command line' in recipe and 'ENTIRE keeper invocation' in recipe and 'wait for its actual prompt' in recipe
    assert 'early/gst-restricted-unit-prep/resume3' in recipe and 'runtime/gst-restricted-unit02/' not in recipe
    fences=re.findall(r'\x60\x60\x60bash\n(.*?)\n\x60\x60\x60',recipe,re.S)
    for fence in fences:
        assert len(fence.splitlines())==1
        if fence.startswith(('./gradlew ','python3 "$GST_RECIPE/phase.py"','python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py ')):assert fence.endswith('< /dev/null')
        if 'with-gradle-lock.py /bin/bash' in fence:assert '< /dev/null' not in fence
    native=[s for s in fences if s.startswith('python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py ')]
    expected=' '.join(proposal['proposedNativeCommandUnderImmutableLock'])+' > docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-restricted-unit03/native-collector.stdout.log 2>&1 < /dev/null'
    assert native==[expected]
    assert 'GST_RESTORE_COMPILE_EXIT=$?' in recipe and 'restore-compile-exit "$GST_RESTORE_COMPILE_EXIT"' in recipe
    assert 'claim-owned < /dev/null' in recipe and 'restore < /dev/null' in recipe and 'check-restored < /dev/null' in recipe
    if (O/'manifest.json').is_file():
        for item in json.loads((O/'manifest.json').read_text())['files']:assert sha(O/item['path'])==item['sha256'],item['path']
    print(json.dumps({'staticOnly':True,'oldRecipeSealExact':True,'spotlessInitByteExact':True,'phaseOnlyPointerChanges':3,'phaseSourceAndAstRecovered':True,'retargetedBindings':7,'allInheritedRequirementsRetained':True,'historicalProtectedOrCachedInputsNotFreshlyRead':True,'caseCatalog':99,'nativeCommandCount':1,'commandArgvExact':True,'stdinAndOneCommandProcedureRetained':True,'actualPhaseOrNativeInvocations':0}))
if __name__=='__main__':main()

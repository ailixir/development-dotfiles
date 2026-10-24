"""Static recipe verification only; never invoke a source phase, shell or native code."""
from pathlib import Path
import ast,hashlib,json
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
OLD=O.parent/'resume3'
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
D=T/'early/gs-t-draft/resume5-wording-peer'
Q=T/'runtime/gst-limited-start-proposal04'
G=T/'early/gst-lock-release-guard-prep'
U=T/'runtime/obs011-gst-provisional-04'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
    for directory in (OLD,D,Q,G):
        for row in read(directory/'manifest.json')['files']:
            assert sha(directory/row['path'])==row['sha256'],row['path']
    change=read(O/'transformation.json');phase=(O/'phase.py').read_text()
    for before,after in change['phasePointerSubstitutions'].items():phase=phase.replace(after,before)
    assert phase==(OLD/'phase.py').read_text()
    assert ast.dump(ast.parse(phase))==ast.dump(ast.parse((OLD/'phase.py').read_text()))
    for name in ('gst-three-only.init.gradle','cache-metadata.json','case-catalog.json','source-crosscheck.json'):
        assert (O/name).read_bytes()==(OLD/name).read_bytes(),name
    old=read(OLD/'bindings.json');new=read(O/'bindings.json')
    assert all(new[n]==h for n,h in old.items())
    # Literal old bindings preserved; do not freshly read old protected logs/cached binaries.
    assert set(new)==set(old)|set(change['addedBindings'])
    for n in change['addedBindings']:assert sha(R/n)==new[n],n
    proposal=read(Q/'proposal.json')
    assert proposal['expectedCases']==read(O/'case-catalog.json') and len(proposal['expectedCases'])==99
    rows=read(D/'draft-manifest.json')
    assert [{k:x[k] for k in ('file','beforeSha256','afterSha256')} for x in rows]==[{k:x[k] for k in ('file','beforeSha256','afterSha256')} for x in proposal['writerBindings']]
    command=read(T/'runtime/gst-limited-start-proposal03/proposal.json')['proposedNativeCommandUnderImmutableLock']
    command=[x.replace('obs011-gst-provisional-03','obs011-gst-provisional-04').replace('resume4-finite-observation','resume5-wording-peer') for x in command]
    assert command==proposal['proposedNativeCommandUnderImmutableLock']
    assert all(proposal[k] is False for k in ('sourceWriteReleased','sourceReleased','nativeReleased','retryReleased','actualExecution','nativeCredit','automaticRetry','IRClockStarted'))
    for n in ('unlock_gate.py','guard-exit.bash','policy.json'):assert (U/n).read_bytes()==(G/n).read_bytes()
    keeper=(U/'owned_native_phase.py').read_text().replace('gst-restricted-unit04','gst-restricted-unit03')
    assert keeper==(T/'runtime/obs011-gst-provisional-03/owned_native_phase.py').read_text()
    if (O/'manifest.json').is_file():
        for row in read(O/'manifest.json')['files']:assert sha(O/row['path'])==row['sha256']
    print(json.dumps({'status':'STATIC_PASS','phaseOnlyThreePointerChanges':True,'phaseSourceAndAstRecovered':True,'spotlessInitAndMetadataExact':True,'allInheritedBindingsRetained':True,'newBindingsChecked':len(change['addedBindings']),'catalogCases':99,'nativeArgvOnlyFreshLabelAndFilterPointer':True,'guardCopiedExact':True,'keeperOnlyUnitPointerChange':True,'historicalProtectedOrCachedBodiesFreshlyRead':False,'phaseShellLockJavaNativeInvoked':False}))
if __name__=='__main__':main()

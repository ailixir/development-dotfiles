"""Pure source/metadata checks only. Never call phase, guard, keeper or source helper main."""
from pathlib import Path
import ast,hashlib,json
O=Path(__file__).resolve().parent
R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
OLD=O.parent/'resume4';D=T/'early/gs-t-draft/peer-relay-sql-source-audit'
Q=T/'runtime/gst-limited-start-proposal05';QOLD=T/'runtime/gst-limited-start-proposal04'
G=T/'early/gst-lock-release-guard-prep';U=T/'runtime/obs011-gst-provisional-05'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
    pins=read(O/'inputs.json')
    for pin in pins['taskPins']+[pins['taskContext']]:
        assert sha(R/pin['path'])==pin['sha256'],pin['path']
    for directory in (OLD,D,G):
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
    # Old protected/cached bodies are NOT reopened. Only their sealed binding literals carry.
    assert set(new)==set(old)|set(change['addedBindings'])
    for name in change['addedBindings']:assert sha(R/name)==new[name],name
    proposal=read(Q/'proposal.json');prior=read(QOLD/'proposal.json')
    assert proposal['expectedCases']==prior['expectedCases']==read(O/'case-catalog.json')
    assert len(proposal['expectedCases'])==proposal['expectedExpandedCases']==99
    assert proposal['nativeTestClasses']==prior['nativeTestClasses']
    assert proposal['proposedNativeCommandUnderImmutableLock']==[
        'obs011-gst-provisional-05' if x=='obs011-gst-provisional-04' else x
        for x in prior['proposedNativeCommandUnderImmutableLock']]
    assert proposal['observerFilterSha256']=='5f85c7e5da10ce67730bd33ca4bcb4c0c22bcf0edb91a42b65457f550e0e0311'
    filter_path=Path(proposal['proposedNativeCommandUnderImmutableLock'][-1])
    assert sha(filter_path)==proposal['observerFilterSha256']==sha(D/'filtered-output.init.gradle')
    rows=read(D/'draft-manifest.json')
    assert [{k:x[k] for k in ('file','beforeSha256','afterSha256')} for x in rows]==[
        {k:x[k] for k in ('file','beforeSha256','afterSha256')} for x in proposal['writerBindings']]
    assert proposal['writerBindings'][0]['afterSha256']=='372310ef566be885eef60b6129974827d754e35aee37ce8925b38fceb2427558'
    assert proposal['writerBindings'][1]['afterSha256']=='353bc8ebcf75d373203c58b016ead65648661cfdf47fa950d6230ac238ac7aa5'
    assert proposal['writerBindings'][2]['afterSha256']=='7856020f0fb27e9bca9c1d1f235bd9a0c2eecd3bf135b7c16c6c7aa4ad4f269d'
    source_manifest=read(D/'manifest.json')
    assert [source_manifest[k] for k in ('methods','originalAssertionExpressions','expectedInvocations','modeVariants','unchangedSentinels')]==[80,751,99,9,11]
    assert proposal['patchSha256']==sha(D/'gs-t-draft.patch')
    assert proposal['draftManifestSha256']==sha(D/'draft-manifest.json')
    assert proposal['candidateManifestSha256']==sha(D/'manifest.json')
    assert proposal['sourceRootUsedDirectlyNoCopy'] is True
    assert all(proposal[k] is False for k in ('sourceWriteReleased','sourceReleased','sourceWriterReleased',
        'nativeReleased','nativeCommandReleased','retryReleased','actualExecution','nativeCredit',
        'automaticRetry','IRClockStarted','credit','completeCauseBackedRemedyClaim'))
    assert proposal['previousClosedUnitSha256']=='742eb97d3aab2db3b4924fc958c92d8887007d63cc97bde616861a9fd0277baf'
    assert proposal['previousUnitIndependentControlReview'].startswith('PENDING')
    for n,h in proposal['guardHashes'].items():
        assert sha(G/n)==h==sha(U/n),n
    assert sha(U/'owned_native_phase.py')=='d557d425947dfb64703133f03e3ac53c6dbc2888f545409566a29e4ded92c00c'
    keeper=(U/'owned_native_phase.py').read_text().replace('gst-restricted-unit05','gst-restricted-unit04')
    assert keeper==(T/'runtime/obs011-gst-provisional-04/owned_native_phase.py').read_text()
    ast.parse((O/'phase.py').read_text());ast.parse((U/'owned_native_phase.py').read_text())
    runtime=read(U/'prepared-inputs-and-backups.json')
    assert runtime['sourceWriterReleased'] is False and runtime['nativeCommandReleased'] is False
    assert runtime['guardAdmissionTestReexecutionRequiredUnderFreshActual05Authority'] is True
    for backup in runtime['backups']:
        assert sha(R/backup['backup'])==backup['sha256']
    if (O/'manifest.json').is_file():
        for row in read(O/'manifest.json')['files']:assert sha(O/row['path'])==row['sha256']
    if (Q/'manifest.json').is_file():
        for row in read(Q/'manifest.json')['files']:assert sha(Q/row['path'])==row['sha256']
    print(json.dumps({'status':'STATIC_PASS','phaseOnlyThreePointerChanges':True,
        'phaseSourceAndAstRecovered':True,'spotlessAndCatalogExact':True,
        'allInheritedBindingsLiteral':True,'newBindingsChecked':len(change['addedBindings']),
        'directSealedThreeCandidatesNoSourceCopy':True,'methods':80,'assertions':751,
        'cases':99,'modes':9,'sentinels':11,'nativeArgvOnlyFreshLabel':True,
        'peerFilterAndGuardExact':True,'rootKeeperOnlyUnitPointerChange':True,
        'actualUnit04IndependentReviewNotAssumed':True,
        'historicalProtectedOrCachedBodiesFreshlyRead':False,
        'phaseGateKeeperShellLockJavaSqlNativeInvoked':False}))
if __name__=='__main__':main()

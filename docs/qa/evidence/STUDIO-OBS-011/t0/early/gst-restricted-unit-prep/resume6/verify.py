"""Pure source/control metadata verification only. No phase/gate/keeper or protected/cached body main."""
from pathlib import Path
import ast,hashlib,json
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
OLD=O.parent/'resume5';D=T/'early/gs-t-draft/resume6-semantic-question';Q=T/'runtime/gst-limited-start-proposal06';QP=T/'runtime/gst-limited-start-proposal05';U=T/'runtime/obs011-gst-provisional-06';G=T/'early/gst-lock-release-guard-prep'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
 i=read(O/'inputs.json')
 for p in i['taskPins']+[i['taskContext'],i['supplementalQuestionQaDesignOnly']]:assert sha(R/p['path'])==p['sha256'],p['path']
 for folder in [OLD,D,Q,G]:
  for x in read(folder/'manifest.json')['files']:assert sha(folder/x['path'])==x['sha256'],x['path']
 t=read(O/'transformation.json');phase=(O/'phase.py').read_text()
 for a,b in t['phasePointerSubstitutions'].items():assert phase.count(b)==1;phase=phase.replace(b,a)
 assert phase==(OLD/'phase.py').read_text()
 assert ast.dump(ast.parse(phase))==ast.dump(ast.parse((OLD/'phase.py').read_text()))
 for n in ['gst-three-only.init.gradle','cache-metadata.json','case-catalog.json','source-crosscheck.json']:assert (O/n).read_bytes()==(OLD/n).read_bytes()
 assert sha(O/'gst-three-only.init.gradle')=='6db51b2342e5f4058f006101085c4e53321eff05ff95d18a29c6df7d4684cec0'
 a=read(OLD/'bindings.json');b=read(O/'bindings.json');assert all(b[n]==h for n,h in a.items())
 assert set(b)==set(a)|set(t['addedBindings'])
 # Inherited protected/cache paths are preserved as literal bindings, never freshly opened here.
 for n in t['addedBindings']:assert sha(R/n)==b[n],n
 p=read(Q/'proposal.json');prior=read(QP/'proposal.json')
 assert p['expectedCases']==prior['expectedCases']==read(O/'case-catalog.json') and len(p['expectedCases'])==99
 assert p['nativeTestClasses']==prior['nativeTestClasses']
 assert p['proposedNativeCommandUnderImmutableLock']==['obs011-gst-provisional-06' if x=='obs011-gst-provisional-05' else x for x in prior['proposedNativeCommandUnderImmutableLock']]
 assert p['observerFilterSha256']=='5f85c7e5da10ce67730bd33ca4bcb4c0c22bcf0edb91a42b65457f550e0e0311'
 assert sha(Path(p['proposedNativeCommandUnderImmutableLock'][-1]))==p['observerFilterSha256']
 assert p['writerBindings']==[dict(x,currentMode='0644') for x in read(D/'draft-manifest.json')]
 assert p['candidateManifestSha256']==sha(D/'manifest.json') and p['patchSha256']==sha(D/'gs-t-draft.patch') and p['draftManifestSha256']==sha(D/'draft-manifest.json')
 assert p['phaseSha256']==sha(O/'phase.py')
 assert p['status']=='PROPOSED_ONLY_NOT_SOURCE_READY_NOT_RELEASED'
 for k in ['sourceWriteReleased','sourceReleased','sourceWriterReleased','nativeReleased','nativeCommandReleased','retryReleased','actualExecution','nativeCredit','automaticRetry','IRClockStarted','credit','completeCauseBackedRemedyClaim','sourceReady','readiness','exactPrototypeOrCompositionReviewComplete']:assert p[k] is False,k
 assert [p[k] for k in ['originalAssertions','exactOtherOriginalAssertions','unit05Assertions','exactOtherUnit05Assertions','mappedExpectationCount','additiveChecksRetained','exactOtherAnnotatedBodies']]==[751,750,813,812,1,62,79]
 assert p['previousQualifiedRootAdoptionSha256']=='9f65eba05258ff63a283749b5712b0dcc5a81f2651f7112c80e0d82edc37d645'
 assert p['questionDesignQuinnSha256']=='8ab650dbfe2edb1578355942ea3624b803dd90001d91b46f321a0b4e80af1aba'
 for n,h in p['guardHashes'].items():assert sha(G/n)==h==sha(U/n)
 assert sha(U/'owned_native_phase.py')=='e4a64776e712409867990ce7b848a2db7fbfe84f42ddafe26c499512a30cc3a1'
 keeper=(U/'owned_native_phase.py').read_text().replace('gst-restricted-unit06','gst-restricted-unit05')
 assert keeper==(T/'runtime/obs011-gst-provisional-05/owned_native_phase.py').read_text()
 ast.parse((U/'owned_native_phase.py').read_text())
 runtime=read(U/'prepared-inputs-and-backups.json')
 assert runtime['sourceWriterReleased'] is False and runtime['nativeCommandReleased'] is False and runtime['freshBoundGuardAdmissionTestRequired'] is True
 for row in runtime['backups']:assert sha(R/row['backup'])==row['sha256']
 if (O/'manifest.json').exists():
  for x in read(O/'manifest.json')['files']:assert sha(O/x['path'])==x['sha256']
 print(json.dumps({'status':'STATIC_POINTER_RECIPE_PASS_NOT_RELEASED','phaseSourceAndAstExactAfter3Pointers':True,'allInheritedBindingsLiteral':True,'addedBindingsVerified':len(t['addedBindings']),'spotlessMetadataCatalogExact':True,'fullCases':99,'methods':80,'unit05Assertions':813,'exactPlusMapped':[812,1],'additiveChecksRetained':62,'nativeArgvOnlyLabelChanged':True,'guardExact':True,'keeperOnlyUnitPointerChanged':True,'protectedOrCachedBodiesOpened':False,'actualExecution':False}))
if __name__=='__main__':main()

"""Seal only inactive06 prepared bytes and public inputs. No runtime observation or native call.

Run only after the four documented fake-boundary suites completed0. Do not redirect this
sealer's stdout/stderr into this directory: the manifest enumerates every member exactly.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat

HERE=Path(__file__).absolute().parent
assert HERE.name=='resume6' and HERE.parent.name=='c8-check01-public-evidence-prep'
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
OLD=HERE.parent/'resume5'
BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def get(name):return json.loads((HERE/name).read_bytes())
def put(name,value):(HERE/name).write_text(json.dumps(value,indent=2)+'\n')
def entry(path,name=None):
    raw=path.read_bytes();info=path.stat()
    assert stat.S_ISREG(info.st_mode) and not path.is_symlink()
    return dict(path=path.name if name is None else name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(info.st_mode))
def packet(path,expected):
    raw=(path/'manifest.json').read_bytes();assert sha(raw)==expected
    value=json.loads(raw);rows=[entry(path/'manifest.json',str((path/'manifest.json').relative_to(ROOT)))]
    for item in value['files']:
        check=entry(path/item['path']);assert check=={k:item[k] for k in ('path','sha256','bytes','mode')}
        rows.append(dict(check,path=str((path/item['path']).relative_to(ROOT))))
    return value,rows
old,pins=packet(OLD,'4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f')
assert len(old['files'])==177
assert (HERE/'source05-manifest.json').read_bytes()==(OLD/'manifest.json').read_bytes()
aria,ap=packet(BASE/'resume-architecture/resume2/c8-public-observer-source05-exact-review','36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67')
qa,qp=packet(BASE/'qa/c8-public-observer-source05-exact-review','c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92')
assert len(aria['files'])==15 and len(qa['files'])==23
pins+=ap+qp
scope=BASE/'resume2-c8-public-observer-source05-findings-root-adoption.json'
sc=entry(scope,str(scope.relative_to(ROOT)));assert sc['sha256']=='246e36e051568cdf538ccc57010f08eb90f731bf49cdc3f7a57209d61da249a4'
assert json.loads(scope.read_bytes())['actualResourceOrOsOrNativeOrPrivateOrBaselineOrSourceWindowActionsAuthorized'] is False
pins.append(sc)
for name in ('c8-public-observer-source06-fix-task.txt','c8-public-observer-source06-fix-context.json'):
    p=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/name;pins.append(entry(p,str(p.relative_to(ROOT))))
for name,expected in [('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py','a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'),
 ('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json','9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313')]:
    row=entry(ROOT/name,name);assert row['sha256']==expected;pins.append(row)
put('runtime-input-pins.json',dict(kind='SOURCE06_PUBLIC_PREPARED_PROVENANCE_NOT_CURRENT_RUNTIME_FACTS',
    verifiedPreparedInputs=pins,verifiedPreparedInputCount=len(pins),
    retainedHistoricalDeclarations=get('input-pins.json'),oldSource05VerifiedMembers=177,oldArchitecture15Qa23Verified=True,
    rootCompleteAcquisitionCategoryPreparationScopeSha256=sc['sha256'],originalBaselineAndRuntimeInputReverificationPerformed=False,
    actualProtectedBaselineBodyReadStatHash=False,actualCurrentSourcePrivateRuntimeKernelOrNativeActions=0))
results={n:get(n) for n in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json','targeted05-check-results.json')}
assert [x['passed'] for x in results.values()]==[311,121,104,191,79]
assert all(v['failed']==0 for v in results.values())
acquisition=get('acquisition06-check-results.json');helpers=get('ownership06-helper-results.json');subset=get('retained06-affected-results.json')
assert acquisition['count']==55 and helpers['passed']==60 and subset['passed']==12
assert acquisition['blockedRealCalls']==[] and helpers['realBoundaryCalls']==[] and subset['realBoundaryCalls']==[]

for name in list(results)[:5]:
    oldresult=json.loads((OLD/name).read_bytes())
    assert [x['name'] for x in oldresult['checks']]==[x['name'] for x in results[name]['checks']]
    assert (HERE/('source05-'+name)).read_bytes()==(OLD/name).read_bytes()
source=get('source-binding.json')
for name in ('Replay.preimage.java','Replay.postimage.java','observer-fragment.java.txt','observer.patch','observer.reverse.patch','ObserverBoundaryHarness.java','java-harness-body.java.txt','java-harness-status.json'):
    assert (HERE/name).read_bytes()==(OLD/name).read_bytes(),name
assert sha((HERE/'Replay.preimage.java').read_bytes())==source['preimageSha256']=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
assert sha((HERE/'Replay.postimage.java').read_bytes())==source['postimageSha256']=='0d98bb1931d3e6a2e433cfa8609867dd017a4331424a07de676117ab8db3d436'
plan=json.loads((ROOT/source['sourcePlanPath']).read_bytes())
rows=[dict(x) for x in plan['source']['files']]
assert len(rows)==1808 and len([r for r in rows if r['path'].startswith('backend/src/main/')])==506
assert sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode())==source['acceptedWholeSourceDigest']
matches=[r for r in rows if r['path']==source['path']];assert len(matches)==1 and matches[0]['sha256']==source['preimageSha256']
matches[0]['sha256']=source['postimageSha256']
assert sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode())==source['candidateVirtualWholeSourceDigest']=='3a6fddda4946106f143783640746464cf2c775256f2340b9d24d1a4701adadbd'
assert get('java-harness-status.json')['compiled'] is False
a=get('runtime-root-release.template.json')
assert a['rootAuthorized'] is False and a['actualReleased'] is False and a['releaseSha256'] is None and a['activeLockSha256'] is None
assert a['installedPlatformQualificationReviewed'] is False and a['auxiliaryNamespaceActuallyAuthorized'] is False
for name,pin in a['artifactPins'].items():assert sha((HERE/name).read_bytes())==pin
assert len(a['artifactPins'])==12
guard=(HERE/'guard-public-observe.bash').read_text()
loader=guard.split("readonly C8_PUBLIC_CONTROL_LOADER='\n",1)[1].split("\n'\nexit()",1)[0]+'\n'
assert loader.encode()==(HERE/'entry-loader.py.txt').read_bytes()
for name in ('RECIPE.md','RUNTIME-RECIPE.md'):
    raw=(HERE/name).read_text();assert 'ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35' not in raw
    assert 'entry-NNNN-pins.json ENTRY_RAW_SHA' in raw

functions={};methods={};interpretations=[]
files=('public_observation_unit.py','public_relay.py','unit_policy.py','public_contract.py','entry-loader.py.txt')
for filename in files:
    tree=ast.parse((HERE/filename).read_bytes())
    for node in tree.body:
        if isinstance(node,ast.FunctionDef):functions[filename+':'+node.name]=dict(file=filename,line=node.lineno,endLine=node.end_lineno)
        if isinstance(node,ast.ClassDef):
            for child in node.body:
                if isinstance(child,ast.FunctionDef):methods[filename+':'+node.name+'.'+child.name]=dict(file=filename,line=child.lineno,endLine=child.end_lineno)
    for node in ast.walk(tree):
        if isinstance(node,ast.Call):
            token=ast.unparse(node.func)
            if token in {'exec','compile','decode','json.loads','ast.parse','struct.unpack','struct.unpack_from','base64.urlsafe_b64decode'} or token.endswith(('.raw','.document','.module','.root_document','.collect_records','.validate_record','.validate_data','.validate_commit','.read_frame','.loads','.decode')):
                interpretations.append(dict(file=filename,line=node.lineno,callee=token))
boundary=get('runtime-effects-boundary.json');callbacks=[n for row in boundary['effects'] for n in row['methods']]
assert len(callbacks)==18 and len(set(callbacks))==18 and all('public_observation_unit.py:Effects.'+n in methods for n in callbacks)
oldmap=json.loads((OLD/'runtime-implementation-map.json').read_bytes())
classes=oldmap['inputClasses']
for cl in classes:
    if cl['inputClass']=='active pin/phase decisions/readiness/permit/root disposition/current journals':
        cl['rule']='Independent explicit entry root pin map BEFORE FIRST parse; exact existing JSON membership and same verified consumed buffer. Current invocation exclusive-generated raw buffers are separately retained; next invocation needs new independent pins.'
    if cl['inputClass']=='root-release/artifact/immutable modules':
        cl['rule']='Common reviewed loader verifies adapter raw buffer before compile for all9 modes; explicit release SHA; verified entry SHA before parse; release artifact/review/immutable module pins before interpretation.'
put('runtime-implementation-map.json',dict(kind='SOURCE06_COMPLETE_CALLBACK_CLI_BOOTSTRAP_AND_FIRST_CONTROL_INTERPRETATION_CLOSURE',
    functions=functions,methods=methods,requiredCallbacks={n:methods['public_observation_unit.py:Effects.'+n] for n in callbacks},requiredCallbackCount=18,
    cli={n:('Effects.collect_public' if n=='collect-public' else 'operate' if n in ('held-proof','gate') else 'Controller.'+n.replace('-','_')) for n in boundary['cli']},
    commonVerifiedEntryLoader=dict(source='entry-loader.py.txt',sameBytesAsReadonlyGuardLiteral=True,allNineModes=True,sha256=sha(loader.encode())),
    reachedInterpretationSites=interpretations,reachedInterpretationSiteCount=len(interpretations),inputClasses=classes,inputClassCount=len(classes),
    exactFirstControlBarrier=['entry_controls independent external SHA and root/release/mode validation','root_document independent external map OR current successful exclusive-generated raw buffer','SAME consumed buffer decode/compile/AST, all loaded bytes reverified by current'],
    allEighteenCallbacksImplemented=True,allNineModesImplemented=True,retainedSemanticCases=806,newGuardedChecks=115,totalSourceChecks=921,
    JavaOrRuntimeQualificationPerformed=False))
put('control-interpretation-map.json',dict(kind='SOURCE06_ACYCLIC_INDEPENDENT_FIRST_CONTROL_AUTHORITY',
    explicitOperatorArgs=['adapter raw SHA to common verified loader','release raw SHA','exact entry-NNNN-pins.json basename','entry raw SHA','CLI mode','gate/held literal status only'],
    authorityEdges=['operator release SHA -> SAME release buffer','operator entry SHA -> SAME root entry buffer','entry root -> exact mode/release and existing-control raw pins',
      'release -> literal holder, installed artifact/review/current immutable input pins','entry root -> active-lock raw SHA','active-lock -> release SHA + literal holder',
      'each current phase/root decision -> independently pinned earlier actual evidence','root_document -> independent external pin before first parse',
      'successful exclusive current write -> retained raw generated buffer, no external grant','next entry -> new independent pins for every prior JSON/journal'],
    noSelfHashOrReciprocalReleaseCycle=True,noFirstSeenControlHashGrant=True,noWildcardOrDirectoryDerivedGrant=True,
    unchangedFreshObservationClasses=['source/dist/Helm/modes/aux/tools/dependencies','PID/start/argv/images/census/FD/kernel/lock','new scoped JUnit/cohort metadata','relay DATA/projection and typed current custody metadata'],
    protectedActualBaselineBodyReadStatHash=False,controlFamiliesTested=20,negativeCases='integration04-check-results.json FIRST_READ_*/ENTRY_*',actualAuthorityIssued=False))
put('proof-coverage06.json',dict(kind='SOURCE06_EXPLICIT_CURRENT_REPLAY_AND_HISTORICAL_REUSE',
 retainedIds=806,newChecks=115,totalSourceCoverage=921,currentExecuted=501,
 currentRetainedReplayed=dict(directRelay=104,integration=191,loaderAndAssignedClosure=79,affectedCustodyLockSubset=12),
 reusedPrior=420,reusedPriorFiles=['pure-check-results.json','runtime-adapter-check-results.json'],
 reusedPriorFilesRetainHistoricalSourcePins=True,source05QaManifestSha256='c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92',
 source05AriaManifestSha256='36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67',
 reusedQaSourceChecks=2290,reusedAriaSourceChecks=3218,newAcquisitionChecks=55,newReachedHelperChecks=60,
 noFull806ReplayClaim=True,noRuntimeOrPlatformQualification=True))
put('ownership-transfer-map.json',dict(kind='SOURCE06_COMPLETE_ACQUISITION_TRANSFER_AND_DISCHARGE',
 designBeforeCode='OWNERSHIP06-DESIGN.md',states=['OPEN','TRANSFERRED','CLOSED','UNKNOWN'],
 entryOwner='System.ownership exists before load; main try includes load',
 immediateAcquisitions=['Custody owner registration before open','Custody.open_fd token before fstat/validation','common loader owned_open before validation'],
 temporaryPaths=['Custody.read','Custody.create_fd/write','Custody.replace_exact','System.read','System.sink fdopen handle','System.lock_free'],
 transfer='Sink token actual handle/closer before fstat; fdopen failure UNKNOWN',
 canonical='Relay ownership view borrows ONLY validated caller directory owners; all temporary/unknown/orphan tokens remain blockers',
 discharge='Effects release checks full ledger before caller close and complete finish after; load partial factories retain before Effects; main retains before load failure',
 closeProgress='UNKNOWN before closer, CLOSED only after successful return; never retry UNKNOWN/CLOSED bare descriptor; reuse distinct token',
 constructorAndTransientTests='acquisition06-check-results.json',reachedHelpersAndEarlyLoadTests='ownership06-helper-results.json',
 allOriginalActualPlatformAndSourceGatesOwed=True))
put('static-verification.json',dict(kind='SOURCE06_SOURCE_ONLY_PROOFS',source=source,JavaFragmentPostimagePatchesHarnessLiteral03=True,
    strictForwardReverseAndChangedHunkRefusal=True,proof='retained311 exact STRICT_FORWARD/STRICT_REVERSE/FORWARD_REJECTS_CHANGED_HUNK and original oracle/count/poll checks',
    derivedVirtual1808Main506OnlyFromPreparedPlan=True,actualSourceSnapshot=False,actualJavaCompilerOrNativeExecuted=False,
    commonVerifiedLoaderGuardLiteralEquality=True,allActiveRecipeDigestsCorrect=True))
historical=['amend_adapter03.py','compose03.py','generate_java_harness.py','prepare03_metadata.py','seal_runtime_packet.py',
    'SOURCE03-DECISIONS.md','prior-manifest.json','adapter02-manifest.json','pure-check-results-initial260.json',
    'author-seal-attempt01-manifest.json','amend04.py','adapt04_controls.py','prepare04_metadata.py','seal04.py','SOURCE04-DECISIONS.md','prepare05_metadata.py','seal05.py','SOURCE05-DECISIONS.md']
put('historical-members.json',dict(kind='INERT_PRESEAL_HISTORY_NOT_CURRENT_OPERATOR_AUTHORITY',
    preservedMembers=historical,preservedOlderAuthorOutputs='author-* except author06-* are preserved03/04/05 historical records',
    copiedHistoricalScriptsAreNotCurrentGenerationEntrypoints=True,currentGenerationEntrypoints=['prepare06_metadata.py','seal06.py'],
    currentChecks=['pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py','targeted05_checks.py'],
    noHistoryGrantsRuntimeOrCurrentSourceFacts=True))
derived={'runtime-input-pins.json','runtime-implementation-map.json','control-interpretation-map.json','runtime-generation-map.json',
 'static-verification.json','implementation-decisions.json','preparation-iterations.json','runtime-review.md','review.md',
 'SHA256SUMS','RUNTIME-SHA256SUMS'}
changes=[]
for row in old['files']:
    now=entry(HERE/row['path']);deferred=row['path'] in derived
    changes.append(dict(path=row['path'],priorSha256=row['sha256'],currentSha256=None if deferred else now['sha256'],
       currentHashBoundBy='final manifest' if deferred else 'current final payload',changed=None if deferred else now['sha256']!=row['sha256'],
       priorMode=row['mode'],currentMode=now['mode']))
put('runtime-generation-map.json',dict(kind='SOURCE06_COMPLETE_SUCCESSOR_ONE_ACQUISITION_CUSTODY_CATEGORY',sourceGeneration=6,
    priorManifestSha256='4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f',old177OutsideNewDirectoryVerifiedUnchanged=True,
    priorArchitectureManifestSha256='36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67',priorQaManifestSha256='c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92',
    preparationScopeSha256=sc['sha256'],oldToNewDelta=changes,
    exact806SemanticIdentitiesPreserved=True,literalOldTestFixturesPreserved=False,
    necessaryExplicitFixtureAmendments=['source05 loader denial uses explicit RuntimeError in retained311 catch fixture; all727 IDs preserved','remaining04 fixture amendments below are inherited history','guard loader forwards mode+independent entry basename/raw SHA','load has explicit mode/entry API and synthetic independently authored pin record',
       'actual Effects fixtures initialize external pins/current generated buffers/pending lifecycle','native unit tests bind explicit synthetic pending claim authority before setup; complete composition uses actual controller/decision',
       'mutated already-written utility is now rejected by earlier immutable hash barrier before semantic parse under same old semantic ID',
       'persistent deny audits added to retained311/121 suites; direct104 audit retained'],
    handAuthoredFinalCodeAndTests=['public_observation_unit.py','guard-public-observe.bash','integration04_checks.py','retained suite fixture adaptations','SOURCE06-DECISIONS.md'],
    JavaFragmentFullReplayPatchesAndHarnessLiteral03=True,currentMetadataEntrypoints=['prepare06_metadata.py','seal06.py'],
    presealAmendmentScriptsAreHistoryNotIdempotentReproduction=['amend04.py','adapt04_controls.py'],
    sourceTestCommands=['python3 -B '+n for n in ('pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py','targeted05_checks.py')],
    currentCheckCounts=dict(retainedSemantic=311,retainedAdapter=121,retainedRelayBoundary=104,retainedIntegratedControls=191,retainedTargeted=79,newAcquisition=55,newReachedHelpers=60,totalCoverage=921,currentExecutedChecks=501,currentExecutedRetainedUnique=386,reusedPrior=420),
    integratedSchedulerLimitation=results['integration04-check-results.json']['cooperativeSchedulerInstrument'],
    integratedPhaseClientLimit='One synthetic registered client composes actual controller methods; all9 exact bootstrap/control-pin entries tested separately. No actual cross-process/thread timing proof.',
    noJavaRuntimeOrNamespaceActions=True,noSourceWindowPrivateOrBaselineBodyAuthority=True,executionReady=False))
attempts=[]
failed={'author06-helpers-attempt01':'Only test checker fixture converted a nonempty blocker list explicitly to bool; source/audit unchanged; preserved failed output.'}
for path in sorted(HERE.glob('author06-*.stdout')):
    stem=path.name[:-7];err=HERE/(stem+'.stderr');assert err.is_file()
    attempts.append(dict(stem=stem,actualStatus=1 if stem in failed else 0,
        reason=failed.get(stem,'Guarded source-only suite completed0; no actual boundary'),stdoutSha256=sha(path.read_bytes()),stderrSha256=sha(err.read_bytes())))
put('preparation-iterations.json',dict(kind='SOURCE06_AUTHOR_PRESEAL_HISTORY',attempts=attempts,
    earlierSource03HistoryRetained=True,allFailuresPreserved=True,sourceOnlyFixtureAndImplementationCorrections=True,
    nativeRuntimeJavaPlatformNamespaceAttempts=0,finalProofInputs=[entry(HERE/n) for n in results],
    sourceCoverage921_CurrentExecuted501=True,noAuditDisabled=True))
put('implementation-decisions.json',dict(status='COMPLETE_INACTIVE_SOURCE06_PENDING_EXACT_NEW_ARIA_QA_AND_ROOT_ADOPTION',
    detailedDecisions='SOURCE06-DECISIONS.md',preparationScopeSha256=sc['sha256'],
    addressedFindings=['OBS05-ARCH-CUSTODY-01/OBS05-QA-CUSTODY-01'],
    rootControlsRequireIndependentPerEntryPins=True,unresolvedAsyncCustodyRetained=True,
    exactJavaPlatformQualification='UNEXECUTED_OWED',operationalAuthority=False,sourceWindow=False,
    allExistingGatewayC8MainIRF1LaneLifecycleExternalHoldsRemain=True))
review="""# Source06 author handoff; no independent verdict or execution authority

One complete acquired-resource custody category: immediate per-open/object ownership before
fstat/validation/next factory, explicit handle transfer and confirmed/UNKNOWN close accounting.
Invocation ledger covers failed/unreturned constructors, temporary files, System helpers and
pre-Effects load. Relay canonical closure and Effects/main discharge include the ledger;
unknown or orphan acquisitions retain actual owner/control/output/authority references.
No UNKNOWN or CLOSED token is blindly reclosed, including after numeric descriptor reuse.
Clean fully closed failed operations retain status1 and may discharge. Common non-removable
loader also tracks immediate bootstrap acquisition/close progress before adapter compile.

All806 retained semantic identities remain. Current replay374 (104+191+79) plus12 affected
retained custody/lock cases;420 remaining prior controls are explicitly reused from exact
sealed05 reviews. New55 exact acquisition11-case checks plus60 reached helper/transfer/load/
bootstrap checks pass. Current executed checks501, complete source coverage921. No full806
current replay or real resource/platform proof is claimed. One helper checker boolean-fixture
failure is preserved; source/audit unchanged. Old result-file source pins remain historical.

Original one synthetic phase client/one READY-yield integration limitation remains. New
constructor/System/main cases use explicit fake factory/operate resources, not unchanged whole
serve, actual FD/thread/native behavior. All actual boundaries stay blocked under persistent
audits. Java/fullReplay0d98/patches/harness remain literal05/04/03; virtual3a6f unchanged.

No actual runtime/source/namespace/OS/kernel/holder/lock/native/Java/private/baseline body
operation, source window, lease, platform qualification, readiness, permit, closure or credit.
All177 old05 members unchanged. Exact full Aria/QA/root review and all actual platform/source/
Gateway/onecase/restoration/compile/QA/final/permit/wrapper/postclose gates remain owed.
See OWNERSHIP06-DESIGN.md, SOURCE06-DECISIONS.md and proof-coverage06.json.
"""
(HERE/'review.md').write_text(review);(HERE/'runtime-review.md').write_text(review)
files=sorted(p for p in HERE.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS','RUNTIME-SHA256SUMS'))
assert all(p.suffix!='.pyc' for p in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'SHA256SUMS');files.sort()
(HERE/'RUNTIME-SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'RUNTIME-SHA256SUMS');files.sort()
assert len(list(HERE.iterdir()))==len(files)+int((HERE/'manifest.json').exists()),'UNEXPECTED_DIRECTORY_OR_SPECIAL'
entries=[entry(p) for p in files]
put('manifest.json',dict(kind='SEALED_COMPLETE_INACTIVE_PUBLIC_OBSERVER_SOURCE06_PENDING_INDEPENDENT_REVIEW',
    files=entries,memberCount=len(entries),sourceGeneration=6,
    priorSource05ManifestSha256='4ee4fabed829952e235d1c2ff820c4a7f37e43970aab03d3b47d446a0436267f',
    priorArchitectureManifestSha256='36c2b9c8c4c2796669b9f86dc1c546912043d65c2452bceda35c03ac9f346a67',
    priorQaManifestSha256='c128434100f0b123bccd54636fc19738fcffb15b38c85909ba98ce0a94a6fb92',
    rootCompleteAcquisitionCategoryPreparationScopeSha256=sc['sha256'],allOld177PayloadBytesModesVerifiedUnchanged=True,
    sourcePostimageSha256=source['postimageSha256'],candidateVirtualSourceDigest=source['candidateVirtualWholeSourceDigest'],
    payloadsInstalledProspectively=12,requiredEffectsCallbacksImplemented=18,cliModesImplemented=9,
    retainedSemanticCaseIdentities=806,newGuardedIntegratedAndControlChecks=115,totalChecksPassed=921,testFailures=0,
    interpretationSites=len(interpretations),inputClasses=len(classes),verifiedPreparedInputs=len(pins),
    commonGuardAndAllNineEntryLoaderLiteralEqual=True,independentFirstControlHashBarrier=True,
    actualJavaThreadOrRuntimeQualification=False,cooperativeSchedulerInstrumentDisclosed=True,
    realBoundaryCalls=0,actualNativeJavaOrRuntimeInvocations=0,actualSharedSourceWrites=0,actualPublicRequests=0,
    actualAuxiliaryNamespaceOrLockCensusObservation=False,actualBaselineBodyReadStatHash=False,
    localSyntheticJavaHarnessCompiledOrExecuted=False,allActualJavaPlatformObligationsRemainOwed=True,
    executionReady=False,newSourceWindowExceptionOrOperationalNamespaceAuthorization=False,IRClockStarted=False,
    C8MainSourceIRF1LaneLifecycleCredit=False,manifestSelfExcluded=True,exactHashBytesModeMembershipSeal=True))
print(json.dumps(dict(status='SEALED_SOURCE06_ONLY',manifestSha256=sha((HERE/'manifest.json').read_bytes()),
    payloadMembers=len(entries),retainedChecks=806,newChecks=115,totalChecks=921,interpretationSites=len(interpretations),
    inputClasses=len(classes),verifiedPreparedInputs=len(pins),actualActions=0,executionReady=False)))

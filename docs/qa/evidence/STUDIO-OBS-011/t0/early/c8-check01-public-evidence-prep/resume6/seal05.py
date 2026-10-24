"""Seal only inactive05 prepared bytes and public inputs. No runtime observation or native call.

Run only after the four documented fake-boundary suites completed0. Do not redirect this
sealer's stdout/stderr into this directory: the manifest enumerates every member exactly.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat

HERE=Path(__file__).absolute().parent
assert HERE.name=='resume5' and HERE.parent.name=='c8-check01-public-evidence-prep'
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
OLD=HERE.parent/'resume4'
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
old,pins=packet(OLD,'8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310')
assert len(old['files'])==149
assert (HERE/'source04-manifest.json').read_bytes()==(OLD/'manifest.json').read_bytes()
aria,ap=packet(BASE/'resume-architecture/resume2/c8-public-observer-source04-exact-review','018ef6e618bdc038ad1d764ca6e01753c9e731925ecbcffe6a875c28fcffd815')
qa,qp=packet(BASE/'qa/c8-public-observer-source04-exact-review','4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29')
assert len(aria['files'])==6 and len(qa['files'])==10
pins+=ap+qp
scope=BASE/'resume2-c8-public-observer-source04-findings-root-adoption.json'
sc=entry(scope,str(scope.relative_to(ROOT)));assert sc['sha256']=='c1b5ed617c10acaf81b05a2f22bb5d750873645e440bdf0aeb8f2dd4258fccec'
assert json.loads(scope.read_bytes())['actualRuntimeJavaNativeSourceWindowLeaseIpcShortNamespaceOsActionsAuthorized'] is False
pins.append(sc)
for name in ('c8-public-observer-source05-fix-task.txt','c8-public-observer-source05-fix-context.json'):
    p=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/name;pins.append(entry(p,str(p.relative_to(ROOT))))
for name,expected in [('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py','a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'),
 ('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json','9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313')]:
    row=entry(ROOT/name,name);assert row['sha256']==expected;pins.append(row)
put('runtime-input-pins.json',dict(kind='SOURCE05_PUBLIC_PREPARED_PROVENANCE_NOT_CURRENT_RUNTIME_FACTS',
    verifiedPreparedInputs=pins,verifiedPreparedInputCount=len(pins),
    retainedHistoricalDeclarations=get('input-pins.json'),oldSource04VerifiedMembers=149,oldArchitecture6Qa10Verified=True,
    rootTwoCategoryPreparationScopeSha256=sc['sha256'],originalBaselineAndRuntimeInputReverificationPerformed=False,
    actualProtectedBaselineBodyReadStatHash=False,actualCurrentSourcePrivateRuntimeKernelOrNativeActions=0))
results={n:get(n) for n in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json','targeted05-check-results.json')}
assert [x['passed'] for x in results.values()]==[311,121,104,191,79]
assert all(v['failed']==0 for v in results.values())
for name in list(results)[:4]:
    oldresult=json.loads((OLD/name).read_bytes())
    assert [x['name'] for x in oldresult['checks']]==[x['name'] for x in results[name]['checks']]
    assert (HERE/('source04-'+name)).read_bytes()==(OLD/name).read_bytes()
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
put('runtime-implementation-map.json',dict(kind='SOURCE05_COMPLETE_CALLBACK_CLI_BOOTSTRAP_AND_FIRST_CONTROL_INTERPRETATION_CLOSURE',
    functions=functions,methods=methods,requiredCallbacks={n:methods['public_observation_unit.py:Effects.'+n] for n in callbacks},requiredCallbackCount=18,
    cli={n:('Effects.collect_public' if n=='collect-public' else 'operate' if n in ('held-proof','gate') else 'Controller.'+n.replace('-','_')) for n in boundary['cli']},
    commonVerifiedEntryLoader=dict(source='entry-loader.py.txt',sameBytesAsReadonlyGuardLiteral=True,allNineModes=True,sha256=sha(loader.encode())),
    reachedInterpretationSites=interpretations,reachedInterpretationSiteCount=len(interpretations),inputClasses=classes,inputClassCount=len(classes),
    exactFirstControlBarrier=['entry_controls independent external SHA and root/release/mode validation','root_document independent external map OR current successful exclusive-generated raw buffer','SAME consumed buffer decode/compile/AST, all loaded bytes reverified by current'],
    allEighteenCallbacksImplemented=True,allNineModesImplemented=True,retainedSemanticCases=727,newGuardedChecks=79,totalSourceChecks=806,
    JavaOrRuntimeQualificationPerformed=False))
put('control-interpretation-map.json',dict(kind='SOURCE05_ACYCLIC_INDEPENDENT_FIRST_CONTROL_AUTHORITY',
    explicitOperatorArgs=['adapter raw SHA to common verified loader','release raw SHA','exact entry-NNNN-pins.json basename','entry raw SHA','CLI mode','gate/held literal status only'],
    authorityEdges=['operator release SHA -> SAME release buffer','operator entry SHA -> SAME root entry buffer','entry root -> exact mode/release and existing-control raw pins',
      'release -> literal holder, installed artifact/review/current immutable input pins','entry root -> active-lock raw SHA','active-lock -> release SHA + literal holder',
      'each current phase/root decision -> independently pinned earlier actual evidence','root_document -> independent external pin before first parse',
      'successful exclusive current write -> retained raw generated buffer, no external grant','next entry -> new independent pins for every prior JSON/journal'],
    noSelfHashOrReciprocalReleaseCycle=True,noFirstSeenControlHashGrant=True,noWildcardOrDirectoryDerivedGrant=True,
    unchangedFreshObservationClasses=['source/dist/Helm/modes/aux/tools/dependencies','PID/start/argv/images/census/FD/kernel/lock','new scoped JUnit/cohort metadata','relay DATA/projection and typed current custody metadata'],
    protectedActualBaselineBodyReadStatHash=False,controlFamiliesTested=20,negativeCases='integration04-check-results.json FIRST_READ_*/ENTRY_*',actualAuthorityIssued=False))
put('static-verification.json',dict(kind='SOURCE05_SOURCE_ONLY_PROOFS',source=source,JavaFragmentPostimagePatchesHarnessLiteral03=True,
    strictForwardReverseAndChangedHunkRefusal=True,proof='retained311 exact STRICT_FORWARD/STRICT_REVERSE/FORWARD_REJECTS_CHANGED_HUNK and original oracle/count/poll checks',
    derivedVirtual1808Main506OnlyFromPreparedPlan=True,actualSourceSnapshot=False,actualJavaCompilerOrNativeExecuted=False,
    commonVerifiedLoaderGuardLiteralEquality=True,allActiveRecipeDigestsCorrect=True))
historical=['amend_adapter03.py','compose03.py','generate_java_harness.py','prepare03_metadata.py','seal_runtime_packet.py',
    'SOURCE03-DECISIONS.md','prior-manifest.json','adapter02-manifest.json','pure-check-results-initial260.json',
    'author-seal-attempt01-manifest.json','amend04.py','adapt04_controls.py','prepare04_metadata.py','seal04.py','SOURCE04-DECISIONS.md']
put('historical-members.json',dict(kind='INERT_PRESEAL_HISTORY_NOT_CURRENT_OPERATOR_AUTHORITY',
    preservedMembers=historical,preservedOlderAuthorOutputs='author-* except author05-* are preserved03/04 historical records',
    copiedHistoricalScriptsAreNotCurrentGenerationEntrypoints=True,currentGenerationEntrypoints=['prepare05_metadata.py','seal05.py'],
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
put('runtime-generation-map.json',dict(kind='SOURCE05_COMPLETE_SUCCESSOR_TWO_SOURCE04_FINDING_CATEGORIES',sourceGeneration=5,
    priorManifestSha256='8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310',old149OutsideNewDirectoryVerifiedUnchanged=True,
    priorArchitectureManifestSha256='018ef6e618bdc038ad1d764ca6e01753c9e731925ecbcffe6a875c28fcffd815',priorQaManifestSha256='4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29',
    preparationScopeSha256=sc['sha256'],oldToNewDelta=changes,
    exact727SemanticIdentitiesPreserved=True,literalOldTestFixturesPreserved=False,
    necessaryExplicitFixtureAmendments=['source05 loader denial uses explicit RuntimeError in retained311 catch fixture; all727 IDs preserved','remaining04 fixture amendments below are inherited history','guard loader forwards mode+independent entry basename/raw SHA','load has explicit mode/entry API and synthetic independently authored pin record',
       'actual Effects fixtures initialize external pins/current generated buffers/pending lifecycle','native unit tests bind explicit synthetic pending claim authority before setup; complete composition uses actual controller/decision',
       'mutated already-written utility is now rejected by earlier immutable hash barrier before semantic parse under same old semantic ID',
       'persistent deny audits added to retained311/121 suites; direct104 audit retained'],
    handAuthoredFinalCodeAndTests=['public_observation_unit.py','guard-public-observe.bash','integration04_checks.py','retained suite fixture adaptations','SOURCE05-DECISIONS.md'],
    JavaFragmentFullReplayPatchesAndHarnessLiteral03=True,currentMetadataEntrypoints=['prepare05_metadata.py','seal05.py'],
    presealAmendmentScriptsAreHistoryNotIdempotentReproduction=['amend04.py','adapt04_controls.py'],
    sourceTestCommands=['python3 -B '+n for n in ('pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py','targeted05_checks.py')],
    currentCheckCounts=dict(retainedSemantic=311,retainedAdapter=121,retainedRelayBoundary=104,retainedIntegratedControls=191,newBoundedTargeted=79,total=806),
    integratedSchedulerLimitation=results['integration04-check-results.json']['cooperativeSchedulerInstrument'],
    integratedPhaseClientLimit='One synthetic registered client composes actual controller methods; all9 exact bootstrap/control-pin entries tested separately. No actual cross-process/thread timing proof.',
    noJavaRuntimeOrNamespaceActions=True,noSourceWindowPrivateOrBaselineBodyAuthority=True,executionReady=False))
attempts=[]
failed={}
for path in sorted(HERE.glob('author05-*.stdout')):
    stem=path.name[:-7];err=HERE/(stem+'.stderr');assert err.is_file()
    attempts.append(dict(stem=stem,actualStatus=1 if stem in failed else 0,
        reason=failed.get(stem,'Guarded source-only suite completed0; no actual boundary'),stdoutSha256=sha(path.read_bytes()),stderrSha256=sha(err.read_bytes())))
put('preparation-iterations.json',dict(kind='SOURCE05_AUTHOR_PRESEAL_HISTORY',attempts=attempts,
    earlierSource03HistoryRetained=True,allFailuresPreserved=True,sourceOnlyFixtureAndImplementationCorrections=True,
    nativeRuntimeJavaPlatformNamespaceAttempts=0,finalProofInputs=[entry(HERE/n) for n in results],
    sourceChecksFinal806=True,noAuditDisabled=True))
put('implementation-decisions.json',dict(status='COMPLETE_INACTIVE_SOURCE05_PENDING_EXACT_NEW_ARIA_QA_AND_ROOT_ADOPTION',
    detailedDecisions='SOURCE05-DECISIONS.md',preparationScopeSha256=sc['sha256'],
    addressedFindings=['OBS04-ARCH-BOOTSTRAP-01/OBS04-QA-BOOTSTRAP-01','OBS04-ARCH-CUSTODY-02'],
    rootControlsRequireIndependentPerEntryPins=True,unresolvedAsyncCustodyRetained=True,
    exactJavaPlatformQualification='UNEXECUTED_OWED',operationalAuthority=False,sourceWindow=False,
    allExistingGatewayC8MainIRF1LaneLifecycleExternalHoldsRemain=True))
review="""# Source05 author handoff; no independent review verdict

Complete inactive05 fixes only the two root-adopted04 categories: non-removable common
loader checks before adapter compilation, and canonical all-acquired-resource closure
before caller custody discharge. Same literal binds guard/all9 ordinary/postclose paths.
Partial start/check/stop exceptions update the owned result and published receipt consistently;
partial/unknown/live resources retain Effects/control/output/relay/thread/authority references.
Fully joined/closed failed-native/protocol teardown remains possible while status stays failed.

All727 prior semantic IDs pass plus79 bounded targeted checks (22 normal/optimized loader
worlds and10 actual start/stop/Effects/main custody worlds):806 total, no failed checks.
Original one-client/one-READY-yield integration limitation remains; direct104 relay tests
exercise the changed stop with unchanged identities. No actual thread/serve is executed
in the targeted partial-custody cases. No actual adapter is interpreted by loader tests.

Java fragment/full Replay/patches/harness remain literal04/03; virtual3a6f unchanged.
All prior lifecycle, control-pin, privacy, one-case/restoration/compile and closure gates
remain. No actual runtime/source/namespace/Java/native/OS/holder/baseline/private operation,
qualification, readiness, permit, scope exception or credit is issued. Source04/03 HOLD
history and all149 old04 members remain immutable. Exact full Aria/QA/root review is next.
See SOURCE05-DECISIONS.md. FutureGateway07 contract is separate and is not integrated.
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
put('manifest.json',dict(kind='SEALED_COMPLETE_INACTIVE_PUBLIC_OBSERVER_SOURCE05_PENDING_INDEPENDENT_REVIEW',
    files=entries,memberCount=len(entries),sourceGeneration=5,
    priorSource04ManifestSha256='8322146c8638cdce1a2ab90aed1f8902983d767fa2bf231c13b33990e8db3310',
    priorArchitectureManifestSha256='018ef6e618bdc038ad1d764ca6e01753c9e731925ecbcffe6a875c28fcffd815',
    priorQaManifestSha256='4f9d8295ec592246d72cb55acff6e61642b30c55770c7f9756205cae929f5a29',
    rootTwoCategoryPreparationScopeSha256=sc['sha256'],allOld149PayloadBytesModesVerifiedUnchanged=True,
    sourcePostimageSha256=source['postimageSha256'],candidateVirtualSourceDigest=source['candidateVirtualWholeSourceDigest'],
    payloadsInstalledProspectively=12,requiredEffectsCallbacksImplemented=18,cliModesImplemented=9,
    retainedSemanticCaseIdentities=727,newGuardedIntegratedAndControlChecks=79,totalChecksPassed=806,testFailures=0,
    interpretationSites=len(interpretations),inputClasses=len(classes),verifiedPreparedInputs=len(pins),
    commonGuardAndAllNineEntryLoaderLiteralEqual=True,independentFirstControlHashBarrier=True,
    actualJavaThreadOrRuntimeQualification=False,cooperativeSchedulerInstrumentDisclosed=True,
    realBoundaryCalls=0,actualNativeJavaOrRuntimeInvocations=0,actualSharedSourceWrites=0,actualPublicRequests=0,
    actualAuxiliaryNamespaceOrLockCensusObservation=False,actualBaselineBodyReadStatHash=False,
    localSyntheticJavaHarnessCompiledOrExecuted=False,allActualJavaPlatformObligationsRemainOwed=True,
    executionReady=False,newSourceWindowExceptionOrOperationalNamespaceAuthorization=False,IRClockStarted=False,
    C8MainSourceIRF1LaneLifecycleCredit=False,manifestSelfExcluded=True,exactHashBytesModeMembershipSeal=True))
print(json.dumps(dict(status='SEALED_SOURCE05_ONLY',manifestSha256=sha((HERE/'manifest.json').read_bytes()),
    payloadMembers=len(entries),retainedChecks=727,newChecks=79,totalChecks=806,interpretationSites=len(interpretations),
    inputClasses=len(classes),verifiedPreparedInputs=len(pins),actualActions=0,executionReady=False)))

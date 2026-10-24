"""Seal only inactive04 prepared bytes and public inputs. No runtime observation or native call.

Run only after the four documented fake-boundary suites completed0. Do not redirect this
sealer's stdout/stderr into this directory: the manifest enumerates every member exactly.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat

HERE=Path(__file__).absolute().parent
assert HERE.name=='resume4' and HERE.parent.name=='c8-check01-public-evidence-prep'
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
OLD=HERE.parent/'resume3'
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
old,pins=packet(OLD,'53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad')
assert len(old['files'])==96
assert (HERE/'source03-manifest.json').read_bytes()==(OLD/'manifest.json').read_bytes()
aria,ap=packet(BASE/'resume-architecture/resume2/c8-public-observer-source03-exact-review','8001f78e8f9331e25281d55f2f1f1919adb0b2806bf854afce7700630d8eacf5')
qa,qp=packet(BASE/'qa/c8-public-observer-source03-exact-review','c4513a286a638a6704f463035231b8a0c31e0df008f160b3842c0fef3f236d07')
assert len(aria['files'])==13 and len(qa['files'])==11
pins+=ap+qp
scope=BASE/'resume2-c8-public-observer-source03-findings-root-adoption.json'
sc=entry(scope,str(scope.relative_to(ROOT)));assert sc['sha256']=='7ed9ca437b970e0cc9769b8674f28ba4cefc1e5eb3fcc436c7f476336038c357'
assert json.loads(scope.read_bytes())['actualRuntimeSourceWindowLeaseNativeJavaIpcOrShortNamespaceAuthorized'] is False
pins.append(sc)
for name in ('c8-public-observer-source04-fix-task.txt','c8-public-observer-source04-fix-context.json'):
    p=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/name;pins.append(entry(p,str(p.relative_to(ROOT))))
for name,expected in [('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py','a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'),
 ('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json','9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313')]:
    row=entry(ROOT/name,name);assert row['sha256']==expected;pins.append(row)
put('runtime-input-pins.json',dict(kind='SOURCE04_PUBLIC_PREPARED_PROVENANCE_NOT_CURRENT_RUNTIME_FACTS',
    verifiedPreparedInputs=pins,verifiedPreparedInputCount=len(pins),
    retainedHistoricalDeclarations=get('input-pins.json'),oldSource03VerifiedMembers=96,oldArchitecture13Qa11Verified=True,
    rootAllFourPreparationScopeSha256=sc['sha256'],originalBaselineAndRuntimeInputReverificationPerformed=False,
    actualProtectedBaselineBodyReadStatHash=False,actualCurrentSourcePrivateRuntimeKernelOrNativeActions=0))
results={n:get(n) for n in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json','integration04-check-results.json')}
assert [x['passed'] for x in results.values()]==[311,121,104,191]
assert all(v['failed']==0 for v in results.values())
for name in list(results)[:3]:
    oldresult=json.loads((OLD/name).read_bytes())
    assert [x['name'] for x in oldresult['checks']]==[x['name'] for x in results[name]['checks']]
    assert (HERE/('source03-'+name)).read_bytes()==(OLD/name).read_bytes()
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
classes.append(dict(inputClass='independent per-entry pin root document and generated-current trust branch',
    methods=['entry_controls','load','Effects.root_document','Effects.write_once','main','common entry loader/guard'],
    rule='Operator supplies entry basename+expected raw SHA separately. Exact release/mode/root role and no-self exact existing control membership; all buffers hash-before-first-parse. Generated raw trust only after successful current exclusive write; external/new invocations never learn first-read authority.'))
put('runtime-implementation-map.json',dict(kind='SOURCE04_COMPLETE_CALLBACK_CLI_BOOTSTRAP_AND_FIRST_CONTROL_INTERPRETATION_CLOSURE',
    functions=functions,methods=methods,requiredCallbacks={n:methods['public_observation_unit.py:Effects.'+n] for n in callbacks},requiredCallbackCount=18,
    cli={n:('Effects.collect_public' if n=='collect-public' else 'operate' if n in ('held-proof','gate') else 'Controller.'+n.replace('-','_')) for n in boundary['cli']},
    commonVerifiedEntryLoader=dict(source='entry-loader.py.txt',sameBytesAsReadonlyGuardLiteral=True,allNineModes=True,sha256=sha(loader.encode())),
    reachedInterpretationSites=interpretations,reachedInterpretationSiteCount=len(interpretations),inputClasses=classes,inputClassCount=len(classes),
    exactFirstControlBarrier=['entry_controls independent external SHA and root/release/mode validation','root_document independent external map OR current successful exclusive-generated raw buffer','SAME consumed buffer decode/compile/AST, all loaded bytes reverified by current'],
    allEighteenCallbacksImplemented=True,allNineModesImplemented=True,retainedSemanticCases=536,newGuardedChecks=191,totalSourceChecks=727,
    JavaOrRuntimeQualificationPerformed=False))
put('control-interpretation-map.json',dict(kind='SOURCE04_ACYCLIC_INDEPENDENT_FIRST_CONTROL_AUTHORITY',
    explicitOperatorArgs=['adapter raw SHA to common verified loader','release raw SHA','exact entry-NNNN-pins.json basename','entry raw SHA','CLI mode','gate/held literal status only'],
    authorityEdges=['operator release SHA -> SAME release buffer','operator entry SHA -> SAME root entry buffer','entry root -> exact mode/release and existing-control raw pins',
      'release -> literal holder, installed artifact/review/current immutable input pins','entry root -> active-lock raw SHA','active-lock -> release SHA + literal holder',
      'each current phase/root decision -> independently pinned earlier actual evidence','root_document -> independent external pin before first parse',
      'successful exclusive current write -> retained raw generated buffer, no external grant','next entry -> new independent pins for every prior JSON/journal'],
    noSelfHashOrReciprocalReleaseCycle=True,noFirstSeenControlHashGrant=True,noWildcardOrDirectoryDerivedGrant=True,
    unchangedFreshObservationClasses=['source/dist/Helm/modes/aux/tools/dependencies','PID/start/argv/images/census/FD/kernel/lock','new scoped JUnit/cohort metadata','relay DATA/projection and typed current custody metadata'],
    protectedActualBaselineBodyReadStatHash=False,controlFamiliesTested=20,negativeCases='integration04-check-results.json FIRST_READ_*/ENTRY_*',actualAuthorityIssued=False))
put('static-verification.json',dict(kind='SOURCE04_SOURCE_ONLY_PROOFS',source=source,JavaFragmentPostimagePatchesHarnessLiteral03=True,
    strictForwardReverseAndChangedHunkRefusal=True,proof='retained311 exact STRICT_FORWARD/STRICT_REVERSE/FORWARD_REJECTS_CHANGED_HUNK and original oracle/count/poll checks',
    derivedVirtual1808Main506OnlyFromPreparedPlan=True,actualSourceSnapshot=False,actualJavaCompilerOrNativeExecuted=False,
    commonVerifiedLoaderGuardLiteralEquality=True,allActiveRecipeDigestsCorrect=True))
historical=['amend_adapter03.py','compose03.py','generate_java_harness.py','prepare03_metadata.py','seal_runtime_packet.py',
    'SOURCE03-DECISIONS.md','prior-manifest.json','adapter02-manifest.json','pure-check-results-initial260.json',
    'author-seal-attempt01-manifest.json','amend04.py','adapt04_controls.py']
put('historical-members.json',dict(kind='INERT_PRESEAL_HISTORY_NOT_CURRENT_OPERATOR_AUTHORITY',
    preservedMembers=historical,preservedOlderAuthorOutputs='author-* except author04-* are literal03 historical records',
    copiedHistoricalScriptsAreNotCurrentGenerationEntrypoints=True,currentGenerationEntrypoints=['prepare04_metadata.py','seal04.py'],
    currentChecks=['pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py'],
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
put('runtime-generation-map.json',dict(kind='SOURCE04_COMPLETE_SUCCESSOR_ALL_FOUR_SOURCE03_FINDINGS',sourceGeneration=4,
    priorManifestSha256='53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad',old96OutsideNewDirectoryVerifiedUnchanged=True,
    priorArchitectureManifestSha256='8001f78e8f9331e25281d55f2f1f1919adb0b2806bf854afce7700630d8eacf5',priorQaManifestSha256='c4513a286a638a6704f463035231b8a0c31e0df008f160b3842c0fef3f236d07',
    preparationScopeSha256=sc['sha256'],oldToNewDelta=changes,
    exact536SemanticIdentitiesPreserved=True,literalOldTestFixturesPreserved=False,
    necessaryExplicitFixtureAmendments=['guard loader forwards mode+independent entry basename/raw SHA','load has explicit mode/entry API and synthetic independently authored pin record',
       'actual Effects fixtures initialize external pins/current generated buffers/pending lifecycle','native unit tests bind explicit synthetic pending claim authority before setup; complete composition uses actual controller/decision',
       'mutated already-written utility is now rejected by earlier immutable hash barrier before semantic parse under same old semantic ID',
       'persistent deny audits added to retained311/121 suites; direct104 audit retained'],
    handAuthoredFinalCodeAndTests=['public_observation_unit.py','guard-public-observe.bash','integration04_checks.py','retained suite fixture adaptations','SOURCE04-DECISIONS.md'],
    JavaFragmentFullReplayPatchesAndHarnessLiteral03=True,currentMetadataEntrypoints=['prepare04_metadata.py','seal04.py'],
    presealAmendmentScriptsAreHistoryNotIdempotentReproduction=['amend04.py','adapt04_controls.py'],
    sourceTestCommands=['python3 -B '+n for n in ('pure_checks.py','runtime_adapter_checks.py','boundary03_checks.py','integration04_checks.py')],
    currentCheckCounts=dict(retainedSemantic=311,retainedAdapter=121,retainedRelayBoundary=104,newIntegrationAndControls=191,total=727),
    integratedSchedulerLimitation=results['integration04-check-results.json']['cooperativeSchedulerInstrument'],
    integratedPhaseClientLimit='One synthetic registered client composes actual controller methods; all9 exact bootstrap/control-pin entries tested separately. No actual cross-process/thread timing proof.',
    noJavaRuntimeOrNamespaceActions=True,noSourceWindowPrivateOrBaselineBodyAuthority=True,executionReady=False))
attempts=[]
failed={'author04-pure_checks.py-attempt01':'Old fake guard argv lacked the new independently pinned entry arguments; amended fixture only.',
 'author04-runtime_adapter_checks.py-attempt01':'Old claim fixture lacked actual selected mode; amended exact fixture and main argument shape.',
 'author04-integration-attempt01':'Synthetic negative journal mode/hash ordering was inconsistent; corrected separate synthetic gate identity.',
 'author04-integration-attempt02':'Synthetic root admission omitted required separately captured status/inspection fields; completed exact fixture.',
 'author04-integration-attempt03':'Synthetic worker argv lacked literal Gradle Test Executor marker, preventing actual census identification; no real native action.',
 'author04-integration-attempt04':'Bounded synthetic diagnostic confirmed worker fixture mismatch; original output preserved, fixed exact worker marker.'}
for path in sorted(HERE.glob('author04-*.stdout')):
    stem=path.name[:-7];err=HERE/(stem+'.stderr');assert err.is_file()
    attempts.append(dict(stem=stem,actualStatus=1 if stem in failed else 0,
        reason=failed.get(stem,'Guarded source-only suite completed0; no actual boundary'),stdoutSha256=sha(path.read_bytes()),stderrSha256=sha(err.read_bytes())))
put('preparation-iterations.json',dict(kind='SOURCE04_AUTHOR_PRESEAL_HISTORY',attempts=attempts,
    earlierSource03HistoryRetained=True,allFailuresPreserved=True,sourceOnlyFixtureAndImplementationCorrections=True,
    nativeRuntimeJavaPlatformNamespaceAttempts=0,finalProofInputs=[entry(HERE/n) for n in results],
    sourceChecksFinal727=True,noAuditDisabled=True))
put('implementation-decisions.json',dict(status='COMPLETE_INACTIVE_SOURCE04_PENDING_EXACT_NEW_ARIA_QA_AND_ROOT_ADOPTION',
    detailedDecisions='SOURCE04-DECISIONS.md',preparationScopeSha256=sc['sha256'],
    addressedFindings=['OBS03-LIFECYCLE-01/OBS03-QA-01','OBS03-QA-02','OBS03-QA-03','OBS03-QA-04'],
    rootControlsRequireIndependentPerEntryPins=True,unresolvedAsyncCustodyRetained=True,
    exactJavaPlatformQualification='UNEXECUTED_OWED',operationalAuthority=False,sourceWindow=False,
    allExistingGatewayC8MainIRF1LaneLifecycleExternalHoldsRemain=True))
review='''# Source04 author handoff; no independent review verdict

Complete inactive source04 addresses all four exact source03 findings. Original536 semantic
case IDs replay exactly with necessary explicit control-API fixture amendments, plus191 new
guarded actual-function integration/control/custody checks:727 total, all0 failures.
The exact Java fragment/full Replay/strict patches/harness remain literal03 bytes.

Pending selected now has an exact newly claimed/external-authorized pre-setup state; cap1
remains before setup. Every existing root/control/journal first interpretation requires an
independent explicit per-entry root pin record and SHA. Current successful exclusive-written
buffers are a distinct local branch. Main retains actual unresolved asynchronous custody and
cannot return0 while it remains unresolved. All active recipes use the correct3a6f candidate.

The whole actual controller/current/native-core/relay/collection/restore/compile/final/gate/
postclose fake composition passes. A disclosed one-yield-after-READY scheduler has exact AST
removal equality; it does not establish unchanged full serve execution or real thread behavior.
One synthetic client composes phases; all9 exact entry loads/barriers are tested separately.
Direct unchanged relay function coverage remains in the retained104 cases.

No actual source/window/lease/current holder/kernel/lock/native/Java/TLS/Unix/short namespace/
private/log/report/baseline body operation, readiness, permit, resource closure or credit is
performed or inferred. Installed Java21/Darwin/provider/ABI/bounds/stalls/cancellation and
actual socket/thread/native termination qualification remain UNEXECUTED and OWED. Exact new
complete architecture/privacy QA and root adoption, proper Gateway closure/postclose, owning
source exceptions/pre-F1 restoration/NON-IR certification and all future actual gates remain.
See SOURCE04-DECISIONS.md, current recipes and historical-members.json. Historical failures
and old sealed packets remain unchanged. Source completion is not operational release.
'''
(HERE/'review.md').write_text(review);(HERE/'runtime-review.md').write_text(review)
files=sorted(p for p in HERE.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS','RUNTIME-SHA256SUMS'))
assert all(p.suffix!='.pyc' for p in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'SHA256SUMS');files.sort()
(HERE/'RUNTIME-SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'RUNTIME-SHA256SUMS');files.sort()
assert len(list(HERE.iterdir()))==len(files)+int((HERE/'manifest.json').exists()),'UNEXPECTED_DIRECTORY_OR_SPECIAL'
entries=[entry(p) for p in files]
put('manifest.json',dict(kind='SEALED_COMPLETE_INACTIVE_PUBLIC_OBSERVER_SOURCE04_PENDING_INDEPENDENT_REVIEW',
    files=entries,memberCount=len(entries),sourceGeneration=4,
    priorSource03ManifestSha256='53d3d2fddc2022a4e58de136adf75b5bfe4e971b919b604ea38476848508fcad',
    priorArchitectureManifestSha256='8001f78e8f9331e25281d55f2f1f1919adb0b2806bf854afce7700630d8eacf5',
    priorQaManifestSha256='c4513a286a638a6704f463035231b8a0c31e0df008f160b3842c0fef3f236d07',
    rootAllFourPreparationScopeSha256=sc['sha256'],allOld96PayloadBytesModesVerifiedUnchanged=True,
    sourcePostimageSha256=source['postimageSha256'],candidateVirtualSourceDigest=source['candidateVirtualWholeSourceDigest'],
    payloadsInstalledProspectively=12,requiredEffectsCallbacksImplemented=18,cliModesImplemented=9,
    retainedSemanticCaseIdentities=536,newGuardedIntegratedAndControlChecks=191,totalChecksPassed=727,testFailures=0,
    interpretationSites=len(interpretations),inputClasses=len(classes),verifiedPreparedInputs=len(pins),
    commonGuardAndAllNineEntryLoaderLiteralEqual=True,independentFirstControlHashBarrier=True,
    actualJavaThreadOrRuntimeQualification=False,cooperativeSchedulerInstrumentDisclosed=True,
    realBoundaryCalls=0,actualNativeJavaOrRuntimeInvocations=0,actualSharedSourceWrites=0,actualPublicRequests=0,
    actualAuxiliaryNamespaceOrLockCensusObservation=False,actualBaselineBodyReadStatHash=False,
    localSyntheticJavaHarnessCompiledOrExecuted=False,allActualJavaPlatformObligationsRemainOwed=True,
    executionReady=False,newSourceWindowExceptionOrOperationalNamespaceAuthorization=False,IRClockStarted=False,
    C8MainSourceIRF1LaneLifecycleCredit=False,manifestSelfExcluded=True,exactHashBytesModeMembershipSeal=True))
print(json.dumps(dict(status='SEALED_SOURCE04_ONLY',manifestSha256=sha((HERE/'manifest.json').read_bytes()),
    payloadMembers=len(entries),retainedChecks=536,newChecks=191,totalChecks=727,interpretationSites=len(interpretations),
    inputClasses=len(classes),verifiedPreparedInputs=len(pins),actualActions=0,executionReady=False)))

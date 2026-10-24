"""Seal inactive source03 only. No OS/kernel/process/native/namespace or source capture.

Reads named PREPARED packets and prior static plan, never baseline/private/runtime bodies.
No subprocess or import of the concrete System/adapter is performed by this sealer.
Do NOT redirect stdout into this enumerated source directory; use the tool result.
"""
import ast
import hashlib
import json
from pathlib import Path
import stat

HERE=Path(__file__).absolute().parent
assert HERE.name=='resume3' and HERE.parent.name=='c8-check01-public-evidence-prep'
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
OLD=HERE.parent/'resume2'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(name,value):
    assert '/' not in name and name not in ('.','..')
    (HERE/name).write_text(json.dumps(value,indent=2)+'\n')
def entry(path,relative=None):
    raw=path.read_bytes();meta=path.stat();assert stat.S_ISREG(meta.st_mode) and not path.is_symlink()
    return dict(path=relative if relative is not None else path.name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(meta.st_mode))
def verify_packet(directory,expected):
    raw=(directory/'manifest.json').read_bytes();assert sha(raw)==expected
    obj=json.loads(raw);out=[entry(directory/'manifest.json',str((directory/'manifest.json').relative_to(ROOT)))]
    for row in obj['files']:
        actual=entry(directory/row['path']);assert actual=={k:row[k] for k in ('path','sha256','bytes','mode')}
        out.append(dict(actual,path=str((directory/row['path']).relative_to(ROOT))))
    return obj,out

old,old_pins=verify_packet(OLD,'0e28194a11c236fac2708c489e486ec04f6577f4538194c93f2c6c873face15e')
assert len(old['files'])==44
base=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
design,design_pins=verify_packet(base/'resume-architecture/resume2/c8-public-observer-java-boundary-design','d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e')
qa,qa_pins=verify_packet(base/'qa/c8-public-observer-java-boundary-design-review','e996ebcc3471a9d6e17e3914cf84711e97ccc5aae94a425182f6e93072fe7c52')
root_scope=base/'resume2-c8-public-observer-source03-preparation-root-adoption.json'
root_entry=entry(root_scope,str(root_scope.relative_to(ROOT)))
assert root_entry['sha256']=='c2ea567e4ac63144563838a133997447d5023ba143e2251fd3afc634a9d4eed4'
assert json.loads(root_scope.read_bytes())['actualApplicationHttpOrIpcAuthorized'] is False
pins=old_pins+design_pins+qa_pins+[root_entry]
for name in ('c8-public-observer-source03-develop-task.txt','c8-public-observer-source03-develop-context.json'):
    path=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/name
    pins.append(entry(path,str(path.relative_to(ROOT))))
put('runtime-input-pins.json',dict(kind='SOURCE03_PREPARED_INPUT_PROVENANCE_NOT_CURRENT_RUNTIME_FACTS',
    verifiedPreparedInputs=pins,verifiedPreparedInputCount=len(pins),
    retained27HistoricalInputDeclarations=json.loads((HERE/'input-pins.json').read_bytes()),
    original27FreshRuntimeSourceOrBaselineReverificationPerformed=False,
    staticOwnershipCoreSha256='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae',
    staticSourcePlanSha256='9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313',
    additionalStaticReadWithoutFreshnessClaim=dict(path='backend/build.gradle.kts',purpose='control delivery uses inherited child env; no build change/property forwarding assumption',freshHashNotClaimed=True),
    actualBaselineBodyReadStatHash=False,actualSourceCaptureRuntimePrivateKernelOrNativeActions=0))

results={name:json.loads((HERE/name).read_bytes()) for name in ('pure-check-results.json','runtime-adapter-check-results.json','boundary03-check-results.json')}
assert [x['passed'] for x in results.values()]==[311,121,104]
for name,result in results.items():
    assert result['failed']==0 and len(result['checks'])==result['passed'] and all(x['pass'] is True for x in result['checks'])
    assert len({x['name'] for x in result['checks']})==result['passed']
    assert result.get('blockedRealBoundaryCalls',result.get('realBoundaryCalls'))==[]
    for file,pin in result['sourceSha256Pins'].items():assert sha((HERE/file).read_bytes())==pin,(name,file)
for name in ('pure-check-results.json','runtime-adapter-check-results.json'):
    assert [x['name'] for x in json.loads((OLD/name).read_bytes())['checks']]==[x['name'] for x in results[name]['checks']]

source=json.loads((HERE/'source-binding.json').read_bytes())
assert sha((HERE/'Replay.preimage.java').read_bytes())==source['preimageSha256']=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
assert sha((HERE/'Replay.postimage.java').read_bytes())==source['postimageSha256']
assert json.loads((HERE/'java-harness-status.json').read_bytes())['compiled'] is False
# No source is changed after the test inputs above. Metadata below is derived only.
a=json.loads((HERE/'runtime-root-release.template.json').read_bytes())
assert a['rootAuthorized'] is False and a['actualReleased'] is False and a['installedPlatformQualificationReviewed'] is False and a['auxiliaryNamespaceActuallyAuthorized'] is False
assert a['releaseSha256'] is None and a['activeLockSha256'] is None and a['launchControlBase64'] is None and a['observerControlSha256'] is None
assert all(v=={'path':None,'sha256':None} for v in a['reviewRecords'].values())
for name,pin in a['artifactPins'].items():assert sha((HERE/name).read_bytes())==pin
assert len(a['artifactPins'])==12
# The old short release template becomes an explicit inert alias to the current binding.
put('root-release.template.json',dict(a,templateAliasOf='runtime-root-release.template.json',aliasIsNotRuntimeAuthority=True))
phase=json.loads((HERE/'phase-commands.json').read_bytes());phase.update(source=source,schemaVersion=2,relayProtocol='DATA_ACK_COMMIT',relaySetupConsumesSelectedAttempt=True,actualReleased=False)
put('phase-commands.json',phase)

boundary=json.loads((OLD/'runtime-effects-boundary.json').read_bytes())
callbacks=[name for row in boundary['effects'] for name in row['methods']]
functions={};methods={};interpretations=[]
for filename in ('public_observation_unit.py','public_relay.py','unit_policy.py','public_contract.py'):
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
assert len(callbacks)==18 and all('public_observation_unit.py:Effects.'+name in methods for name in callbacks)
put('runtime-effects-boundary.json',dict(kind='COMPLETE_SOURCE03_PROSPECTIVE_EFFECTS_IMPLEMENTED',actualRuntimeAdapterWritten=True,
    actualRuntimeInstalledOrReleased=False,requiredCallbackCount=18,cli=['held-proof','stage','selected','collect-public','restore','compile-restored','final','gate','postclose'],
    effects=boundary['effects'],allRequiredCallbacksMapped=True,relayModule='public_relay.py',noDefaultOrOldMainFallback=True,
    installedJavaDarwinAbiProviderValidation='UNEXECUTED_OWED',noExecutionAuthority=True))
readers=[
 dict(inputClass='root-release/artifact/immutable modules',methods=['load','Verified.raw','Verified.module'],rule='hash verified consumed buffer; no unverified interpretation reread'),
 dict(inputClass='active pin/phase decisions/readiness/permit/root disposition/current journals',methods=['Effects.root_document','Effects.local_hash'],rule='first consumed raw buffer pinned, every subsequent read exact same raw hash'),
 dict(inputClass='source plan/ownership core AST',methods=['Verified.document','core_scope'],rule='exact fixed SHA consumed buffer, AST only8 functions and imports; sole Popen stdin=DEVNULL delta'),
 dict(inputClass='inherited6 baseline',methods=['Effects.current','Verified.document'],rule='future authorized same hash-checked consumed buffer; NO actual body/stat/hash during preparation'),
 dict(inputClass='fresh source/dist/Helm/modes/aux/tool/cache/identity/census/FD/lock',methods=['Effects.source','Effects.current','Effects.utility','Effects.fingerprint','validate_lock_fields','System.process_identity'],rule='fresh future root-scoped observations, never static pin substituted as runtime proof'),
 dict(inputClass='public JUnit/cohort metadata',methods=['xml_metadata','Effects.selected_metadata'],rule='new single class/run/cohort scope, no messages/text/private siblings'),
 dict(inputClass='launch control',methods=['load','Effects.start_relay','validate_control','p3ObserverControl'],rule='root-pinned raw SHA/canonical bounded base64url/strict duplicate-free JSON from SAME consumed buffer; selected child env only'),
 dict(inputClass='public HTTPS body',methods=['P3PublicExchange','P3HttpEntity','p3StrictJson'],rule='one raw numeric connect+TLS+GET, caps BEFORE accumulation, strict framing/UTF8/schema3/ownedsubject/state/code; Java UNEXECUTED'),
 dict(inputClass='Darwin peer UID/PID',methods=['peer_credentials','Effects.table','Effects.relay_peer'],rule='exact76/4-byte qualified ABI and already recorded single current selected executor plus fresh kernel PID/start/image/UID; unknown consumes enrollment/HOLD'),
 dict(inputClass='DATA ACK COMMIT',methods=['Relay.read_frame','Relay.validate_data','Relay.write_frame','Relay.validate_commit','p3Relay'],rule='strict bounded framing/control/nonce/projection; root provisional file not sufficient; conservative15s and EOF'),
 dict(inputClass='public projection/relay receipt',methods=['Effects.collect_public','collect_records','relay_qualified'],rule='sole fixed file/receipt, exact schemas/pins/control/native and relay drain; no private discovery/fallback'),
 dict(inputClass='short directory/socket/FD metadata',methods=['Relay.check_custody','Relay.stop','Effects.verify_relay_closed_namespace'],rule='separate root-approved parent/output chains, exclusive0700 creation+frozen READY identity, exact named metadata; socket never opened/read/hashed; descriptors distinct from node inode'),
 dict(inputClass='native own stdout/stderr',methods=['Effects.run_owned'],rule='root-owned retained0600 private sink and fixed task/build markers only, no raw text export'),
 dict(inputClass='actual QA/root/wrapper/final/gate/postclose',methods=['Effects.require_actual_evidence_review','Controller.final','Controller.gate','Controller.postclose'],rule='actual independent reviews/statuses/root records; source restore+compile0; actual fresh wrapper and outer postclose remain owed')]
put('runtime-implementation-map.json',dict(kind='SOURCE03_COMPLETE_CALLBACK_CLI_INTERPRETATION_CLOSURE',functions=functions,methods=methods,
    requiredCallbacks={name:methods['public_observation_unit.py:Effects.'+name] for name in callbacks},requiredCallbackCount=18,
    cli={name:('Effects.collect_public' if name=='collect-public' else 'operate' if name in ('held-proof','gate') else 'Controller.'+name.replace('-','_')) for name in phase.get('cli',['held-proof','stage','selected','collect-public','restore','compile-restored','final','gate','postclose'])},
    reachedInterpretationSites=interpretations,reachedInterpretationSiteCount=len(interpretations),inputClasses=readers,inputClassCount=len(readers),
    JavaInterpretedInputSites=['p3ObserverControl bounded env JSON','P3HttpEntity bounded HTTP framing','p3StrictJson strict body','p3Relay exact ACK'],
    actualFunctionAndSemanticChecks=536,JavaOrRuntimeQualificationPerformed=False))
put('runtime-install-map.json',dict(kind='INERT_SOURCE03_FIXED_CONTROL_INSTALLATION',unitMode=0o700,controlMode=0o700,
    members=[dict(source=name,destination='control/'+name,sha256=pin,sourceMode=0o644,runtimeMode=0o600) for name,pin in a['artifactPins'].items()],
    futureExclusiveShortNamespace='/private/tmp/obs011-pub-observe01',futureSocket='/private/tmp/obs011-pub-observe01/r.sock',
    actualShortNamespaceAuthorizedOrObserved=False,copyOnlyListed12Payloads=True,doNotInstallTestsTemplatesOrHarness=True))
generated_here={'runtime-input-pins.json','root-release.template.json','phase-commands.json','runtime-effects-boundary.json','runtime-implementation-map.json','runtime-install-map.json','runtime-generation-map.json','static-verification.json','implementation-decisions.json','preparation-iterations.json','runtime-review.md','review.md','SHA256SUMS','RUNTIME-SHA256SUMS'}
changes=[]
for row in old['files']:
    current=entry(HERE/row['path'])
    changes.append(dict(path=row['path'],priorSha256=row['sha256'],currentSha256=None if row['path'] in generated_here else current['sha256'],currentHashBoundBy='final manifest' if row['path'] in generated_here else 'this exact preseal code/test artifact',changed=True if row['path'] in generated_here else current['sha256']!=row['sha256'],
        priorMode=row['mode'],currentMode=current['mode']))
put('runtime-generation-map.json',dict(kind='HONEST_SOURCE03_AMENDED_COMPLETE_COMPOSITION',priorManifestSha256=sha((OLD/'manifest.json').read_bytes()),
    immutableOld44OutsideNewDirectoryVerified=True,oldPacketsModified=False,oldToNewDelta=changes,
    prior311And121CaseIdentitiesPreserved=True,literalOldFixturesPreserved=False,
    explicitFixtureAmendments=['schema2 networkAccounting everywhere','closed synthetic network/relay/native drain fixtures','historical STRICT_RAW_1258/649 IDs retained despite v2 length changes',
        'raw connect/request and root sole-writing replace rejected HttpClient/Java output source checks','retained121 native tests fake only newly added relay component;104 new tests exercise actual component',
        'strict associated lsof fixture adds selected name, not observed runtime FD inference','actual-evidence fixture15 pins now includes relay launch/READY/drain','7 review records now bind actual platform/auxiliary adoption'],
    handAuthored=['observer-fragment.java.txt','public_relay.py','public_observation_unit.py composition','public_contract.py amendment','boundary03_checks.py','java-harness-body.java.txt','SOURCE03-DECISIONS.md','JAVA-QUALIFICATION.md'],
    generationEntries=['compose03.py','generate_java_harness.py','prepare03_metadata.py','seal_runtime_packet.py'],
    sourceDerived=['Replay.postimage.java','observer.patch','observer.reverse.patch','source-binding.json','virtual-source-delta.json','ObserverBoundaryHarness.java','inert templates and maps','SHA256SUMS','RUNTIME-SHA256SUMS','manifest.json'],
    checkCommands=['python3 -B pure_checks.py','python3 -B runtime_adapter_checks.py','python3 -B boundary03_checks.py'],
    currentCheckCounts=dict(retainedSemantic=311,retainedAdapter=121,newActualRelayContractAdapterAndJavaSource=104,total=536),
    noJavaOrNativeOrRuntimeActions=True,sourceDigestPriorPlanDerivedNotCurrentCapture=True,
    noActualNamespaceSourceWindowPrivateOrBaselineBodyAuthority=True,executionReady=False))
put('static-verification.json',dict(kind='SOURCE03_STATIC_AND_GUARDED_PROOF_ONLY',source=source,
    strictForwardReverse=True,strictChangedHunkRefusal=True,proof='pure-check-results.json exact STRICT_FORWARD/STRICT_REVERSE/FORWARD_REJECTS_CHANGED_HUNK and original oracle/count/poll checks',
    allOtherReplayBytesProtected=True,virtual1808DerivedFromPriorPlan=True,JavaCompilerOrNativeExecuted=False))
put('implementation-decisions.json',dict(status='CURRENT_SOURCE03_OFFTREE_IMPLEMENTATION_COMPLETE_PENDING_INDEPENDENT_REVIEW',
    detailedDecisions='SOURCE03-DECISIONS.md',designManifestSha256=sha((base/'resume-architecture/resume2/c8-public-observer-java-boundary-design/manifest.json').read_bytes()),
    designQaManifestSha256=sha((base/'qa/c8-public-observer-java-boundary-design-review/manifest.json').read_bytes()),
    rootPreparationScopeSha256=root_entry['sha256'],operationalAuthority=False,
    rootCreationRuleRequiresArchitectureAcceptance=True,conservativeCommitTimeBoundRequiresReview=True,
    exactJavaPlatformQualification='UNEXECUTED_OWED'))
iterations=[]
for stem,status,reason in [
 ('author-pure-attempt01',1,'Author reference incorrectly reset network fixture after producer result; removed erroneous reset, no production Java execution'),
 ('author-pure-attempt02',0,'311 semantic cases pass; two historical bytecount-derived names still changed'),
 ('author-pure-attempt03',0,'311 original names preserved with explicit v2 fixture byte-count mapping'),
 ('author-adapter-attempt01',1,'Fixture omitted new relay actual-evidence members; added exact15 member fixture'),
 ('author-adapter-attempt02',0,'121 retained adapter identities pass'),
 ('author-boundary-attempt01',1,'New identity test caught changed STRICT_RAW names; fixed honest historical-ID fixture mapping'),
 ('author-boundary-attempt02',1,'Adverse custody test expected start to return instead of catching correct custody refusal; corrected harness catch'),
 ('author-boundary-attempt03',0,'88 initial actual relay/contract/source checks pass'),
 ('author-boundary-attempt04',1,'New adapter fake Directory.read lacked production default cap; fixed fake interface'),
 ('author-boundary-attempt05',1,'New adapter fake Directory.write lacked production default mode; fixed fake interface'),
 ('author-boundary-attempt06',0,'97 actual relay/contract/adapter/source checks pass'),
 ('author-final-1',0,'311 checks pass before final consumed-pin additions'),
 ('author-final-2',0,'121 checks pass before final consumed-pin additions'),
 ('author-final-3',0,'104 checks pass before final consumed-pin additions'),
 ('author-seal-suite-1',0,'Final311 semantic case identities and exact consumed buffers pass'),
 ('author-seal-suite-2',0,'Final121 adapter case identities and exact consumed buffers pass'),
 ('author-seal-suite-3',0,'Final104 actual relay/contract/adapter and Java source checks pass'),
 ('author-seal-attempt01',0,'Rejected provisional seal: redirecting seal stdout into an enumerated payload changed that member after hashing. Preserved initial manifest/output. Final seal emits stdout only to the tool, then exact membership/hash verification is separate.')]:
    if (HERE/(stem+'.stdout')).exists():iterations.append(dict(stem=stem,actualStatus=status,reason=reason,stdoutSha256=sha((HERE/(stem+'.stdout')).read_bytes()),stderrSha256=sha((HERE/(stem+'.stderr')).read_bytes())))
put('preparation-iterations.json',dict(kind='HONEST_SOURCE03_AUTHOR_ITERATIONS',attempts=iterations,earlierFailuresRetained=True,denyAuditNeverDisabled=True,
    nativeJavaOrRuntimeAttempts=0,finalProofInputs=[entry(HERE/n) for n in results]))
text='''# Source03 author handoff; no QA verdict

The complete inactive composition implements the exact chosen rawSocket/TLS worker and
root sole-writer Darwin relay across Java/full Replay/strict patches/schema2/collector/actual
adapter/CLI/authority/membership/final/permit/postclose. Guarded checks536: original311+121
semantic identities and104 new actual relay/contract/adapter/source checks. Real boundary
calls0. Java harness source is uncompiled/unexecuted. No actual source, namespace, lease,
lock, kernel, native, baseline/private body, platform qualification, source exception,
readiness, permit, IR clock or credit. See SOURCE03-DECISIONS.md and JAVA-QUALIFICATION.md.

Independent exact architecture/privacy QA and actual installed-platform qualification remain
mandatory. Review the creation-and-READY inode binding and conservative COMMIT time bound
explicitly. Source preparation is complete; operational execution is not released. Original
4 Java findings remain review/platform-validation obligations, not auto-closed findings.
'''
(HERE/'runtime-review.md').write_text(text);(HERE/'review.md').write_text(text)
# Exact full payload seal; checksums never self-hash and manifest is separately hashed.
files=sorted(p for p in HERE.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS','RUNTIME-SHA256SUMS'))
assert all(p.suffix!='.pyc' for p in files)
(HERE/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'SHA256SUMS');files.sort()
(HERE/'RUNTIME-SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files))
files.append(HERE/'RUNTIME-SHA256SUMS');files.sort()
assert len(list(HERE.iterdir()))==len(files)+int((HERE/'manifest.json').exists()),'UNEXPECTED_DIRECTORY_OR_SPECIAL'
entries=[entry(p) for p in files]
put('manifest.json',dict(kind='SEALED_COMPLETE_INACTIVE_PUBLIC_OBSERVER_SOURCE03_PENDING_INDEPENDENT_REVIEW',files=entries,memberCount=len(entries),
    priorAdapter02ManifestSha256='0e28194a11c236fac2708c489e486ec04f6577f4538194c93f2c6c873face15e',
    designManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',
    designQaManifestSha256='e996ebcc3471a9d6e17e3914cf84711e97ccc5aae94a425182f6e93072fe7c52',
    rootPreparationScopeSha256=root_entry['sha256'],sourcePostimageSha256=source['postimageSha256'],candidateVirtualSourceDigest=source['candidateVirtualWholeSourceDigest'],
    payloadsInstalledProspectively=12,requiredEffectsCallbacksImplemented=18,cliModesImplemented=9,
    retainedSemanticCaseIdentities=311,retainedAdapterCaseIdentities=121,newGuardedActualFunctionAndJavaSourceChecks=104,totalChecksPassed=536,testFailures=0,
    interpretationSites=len(interpretations),inputClasses=len(readers),verifiedPreparedInputs=len(pins),
    realBoundaryCalls=0,actualNativeJavaOrRuntimeInvocations=0,actualSharedSourceWrites=0,actualPublicRequests=0,
    actualAuxiliaryNamespaceOrLockCensusObservation=False,actualBaselineBodyReadStatHash=False,
    localSyntheticJavaHarnessCompiledOrExecuted=False,original4JavaFindingsRequireIndependentExactCodeAndPlatformReview=True,
    executionReady=False,newSourceWindowExceptionOrOperationalNamespaceAuthorization=False,IRClockStarted=False,C8MainSourceLaneLifecycleCredit=False,
    manifestSelfExcluded=True,exactHashBytesModeMembershipSeal=True))
print(json.dumps(dict(status='SEALED_SOURCE03_ONLY',manifestSha256=sha((HERE/'manifest.json').read_bytes()),payloadMembers=len(entries),checks=536,
    interpretationSites=len(interpretations),inputClasses=len(readers),sourcePostimageSha256=source['postimageSha256'],actualActions=0,executionReady=False)))

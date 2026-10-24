"""Source-author finite metadata/seal. Does not import or invoke target code."""
import ast,hashlib,json,stat
from pathlib import Path
HERE=Path(__file__).absolute().parent

def save(name,value):
    (HERE/name).write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')
def constant(tree,name):
    node=next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in n.targets))
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='frozenset':return sorted(ast.literal_eval(node.args[0]))
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='dict':return {k.arg:ast.literal_eval(k.value) for k in node.keywords}
    return ast.literal_eval(node)
controller=ast.parse((HERE/'qualification_controller.py').read_bytes())
relay=ast.parse((HERE/'qualified_relay.py').read_bytes())
contract=ast.parse((HERE/'public_contract.py').read_bytes())
snap=next(n for n in ast.walk(controller) if isinstance(n,ast.FunctionDef) and n.name=='snapshot')
resultcall=next(n for n in ast.walk(snap) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='dict' and any(k.arg=='protocol' for k in n.keywords))
resultfields=sorted(k.arg for k in resultcall.keywords)
schemas=dict(schemaVersion=1,kind='EXACT_CLOSED_PYTHON_OBJECT_AND_JSON_CONTROL_SCHEMAS',
    integerRule='type(value) is int; bool is rejected',extraFields='REJECT',duplicateJsonMembers='REJECT',nonfinite='REJECT',
    serialization='Controls/results are JSON. NativeWait is an internal exact Python object; its modeEvidence is immutable bounded bytes, not a JSON string or archive record.',
    definitions={
      'Release':dict(fields=constant(controller,'RELEASE_FIELDS'),validator='qualification_controller.validate_release',version=1,
        modePurpose='SYNTHETIC_QUALIFICATION_ONLY',metadata='All exact pins/roles/paths/aliases/modes/UIDs/class-directory membership must qualify before mutation; no future node/PID/inode values.',
        classpathEntryFields=['kind','path','memberRoles'],classpathKinds=['JAR','CLASS_DIRECTORY'],limits=constant(controller,'LIMITS'),
        inputBounds=dict(maxInputs=128,totalBytes=67108864,perFileBytes=16777216),requiredInputRoles=['ORDINARY_ADAPTER','JAVA_ROLE','exact finite classpath/classfiles','SYNTHETIC_PKCS12 for TLS']),
      'Pin':dict(fields=constant(controller,'PIN_FIELDS'),validator='qualification_controller.pin',types=dict(path='absolute canonical-form string',sha256='lowercase hex64',bytes='int1..16777216',mode='int0..0777',uid='int>=0',aliases='finite list max8 unique absolute strings'),sourcePolicy='source600or644 from external pin; root controls exactly600; actual owner from explicit external pin'),
      'Decision':dict(fields=constant(controller,'DECISION_FIELDS'),validator='qualification_controller.validate_decision',version=1,purpose='ONE_SYNTHETIC_MODE_ONLY',cap=1,attempt=1,operation='invoke'),
      'StandaloneJvmIdentity':dict(fields=constant(controller,'IDENTITY_FIELDS'),validator='qualification_controller.identity / PeerBinding',
        types=dict(pid='int>0 equals actual owned process.pid',ppid='int>0 equals actual controller PID',uid='exact admitted int',kernelStartSeconds='int>0',kernelStartMicroseconds='int0..999999',
            processImage='exact admitted JAVA path',executableFileHash='exact admitted JAVA SHA',start='nonempty actual start string',argvHash='hex64 actual ordinary observation',identityComplete='literal True',kernelIdentityComplete='literal True'),
        source='existing ordinary observation contract only; unsupported/incomplete HOLD; no new API/provider'),
      'NativeWait':dict(fields=constant(controller,'NATIVE_FIELDS'),validator='qualification_controller.validate_native',
        types=dict(directPid='actual int process PID',directWaited='literal True',nativeStatus='actual int status',stdoutComplete='literal True',stderrComplete='literal True',ownedWorkTerminated='literal True',descriptorsClosed='literal True',requestSha256='exact canonical request hash',modeEvidence='bytes1..16384: complete immutable stdout consumed by strict mode_evidence',archiveSha256='hex64 exact actual ordinary archive'),
        actualAdapterImplementationReview='OWED'),
      'LaunchControl':dict(fields=constant(relay,'CONTROL_FIELDS'),validator='qualified_relay.validate_control',version=1,protocolVersion=2,protectedFields=['enrollmentNonce'],source='literal source06 production control; raw SHA independently pinned before interpretation'),
      'ReadyAndDrainRelayReceipt':dict(fields=constant(contract,'RELAY_FIELDS'),validator='public_contract.relay_qualified plus actual qualified_relay state',protocolVersion=2,
        note='READY uses the same closed receipt with pending facts null; complete qualified acceptance requires one enrollment/DATA/ACK/COMMIT/EOF, native/worker/thread/FD close and current custody. No pending receipt is qualified.',
        metadataFields=['dev','inode','mode','uid'],closeNames=['connection','listener','selector','short','parent']),
      'QualificationResult':dict(fields=resultfields,producer='Invocation.snapshot',protocol=constant(controller,'PROTOCOL'),
        statuses=['HOLD','QUALIFICATION_EVIDENCE_COMPLETE_PENDING_QA_ROOT'],
        primaryCleanupSeparate=True,noRawSecretOrExceptionFields=True,actualAcceptanceRequiresIndependentQaRoot=True),
      'Data':dict(fields=['protocolVersion','controlSha256','enrollmentNonce','observation','networkAccounting'],cap=16384,validator='SyntheticRelay.validate_data',
        additionalConstraint='FINALIZING/NOT_REPRODUCED and exact NOT_STARTED zero accounting only'),
      'Ack':dict(fields=['protocolVersion','controlSha256','projectionSha256','status'],cap=256,status='WRITTEN_CUSTODIED'),
      'Commit':dict(fields=['protocolVersion','controlSha256','projectionSha256','status','callerElapsedNs'],cap=512,status='CALLER_SAW_CUSTODIED_ACK',
        validator='Relay.validate_commit',elapsed='exact int0..<15e9 and callerElapsed+full local DATA-to-COMMIT <15e9; exact EOF required'),
    },
    actualQualification='UNEXECUTED_OWED',templatesAreAuthority=False)
save('schemas.json',schemas)
release_template={name:None for name in constant(controller,'RELEASE_FIELDS')}
release_template.update(schemaVersion=1,protocol=constant(controller,'PROTOCOL'),purpose='SYNTHETIC_QUALIFICATION_ONLY',
    codePins={},inputPins={},classpathEntries=[],environmentKeys=[],limits=constant(controller,'LIMITS'),
    sourceManifestSha256='b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1',
    productionFragmentSha256='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
save('qualification-release.template.json',release_template)
save('one-mode-decision.template.json',dict(schemaVersion=1,protocol=constant(controller,'PROTOCOL'),
    purpose='ONE_SYNTHETIC_MODE_ONLY',authorizedBy=None,releaseSha256=None,mode=None,cap=1,attempt=1,operation='invoke'))
launch={name:None for name in constant(relay,'CONTROL_FIELDS')}
launch.update(schemaVersion=1,protocolVersion=2,unit='obs011-t0-c8-public-error-observe01',
    **{'class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT',
       'method':'actualPublishedWrongPasswordAnnotatesEarlierSecretFill'},
    amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',
    loopback='127.0.0.1',tlsHost='localhost',relayPath='/private/tmp/obs011-pub-observe01/r.sock',
    **constant(relay,'LIMITS'))
save('launch-control.template.json',launch)
source_map=[]
for name in ('qualification_controller.py','qualification_custody.py','qualified_relay.py','entry_loader.py','public_contract.py'):
    raw=(HERE/name).read_bytes();tree=ast.parse(raw)
    funcs=[]
    def visit(nodes,prefix=''):
        for n in nodes:
            if isinstance(n,(ast.ClassDef,ast.FunctionDef)):
                funcs.append(dict(name=prefix+n.name,line=n.lineno,endLine=n.end_lineno))
                if isinstance(n,ast.ClassDef):visit(n.body,prefix+n.name+'.')
    visit(tree.body)
    source_map.append(dict(path=name,sha256=hashlib.sha256(raw).hexdigest(),functions=funcs))
save('implementation-map.json',source_map)
save('first-read-and-ownership-map.json',dict(schemaVersion=1,
    loaderRoot='Root externally verifies consumed entry_loader.py raw SHA before compile; never a self/future pin',
    bootstrap='Load records every FD immediately, verifies all four external source buffers and closes every acquired FD before compiling any; UNKNOWN retains owner/buffers and denies interpretation normal/optimized.',
    graph=['external loader literal pin','external four code specs','same verified code buffers','protected release/decision/control raw pins','finite current inputs+ordinary adapter/admission','consumed one-mode decision','actual exclusive READY metadata','actual launched JVM + repeated exact identities','DATA/provisional closed projection/ACK/COMMIT/EOF','actual native/receiver/ledger drain','archive actualQA/root/final/permit/wrapper/postclose'],
    inputFamilies=[dict(name=n,firstInterpreter=i,pin=p) for n,i,p in (
        ('release','strict + validate_release','external release spec/raw SHA/600/UID/bytes/current metadata'),
        ('decision','strict + validate_decision','external decision spec/raw SHA/600/UID/bytes'),
        ('launch control','strict + validate_control','external spec/raw SHA/600/UID/bytes and release control SHA'),
        ('source code','Load.load before compile','all four external specs and actual current source SHA equals loaded buffer SHA'),
        ('tools/classes/Jackson/fixture/ordinary adapter','Invocation.verify_inputs before and after native','finite literal pin graph plus ordinary current admission/aliases/closed class-directory membership'),
        ('peer identity','identity/PeerBinding','actual owned process + exact release JAVA + actual controller parent; twice before and twice during enrollment'),
        ('native/output','validate_native/mode_evidence','actual owned handle/wait/request SHA/complete immutable bounded stdout/actual archive'),
        ('DATA/COMMIT','SyntheticRelay.validate_data/Relay.validate_commit','actual enrolled peer/control/nonce/closed schemas/caps/deadline/current custody'))],
    immediateOwners=['bootstrap FD before fstat','Custody owner before first open; token before fstat/validation/return','Resource actual selector/listener/connection before fileno/flags/metadata/return','Boundary actual event/thread reference before return','ordinary native process and output ownership before metadata/factory return including partial launch','controller returned native handle token before identity','partial directory creation flag before postcreate custody check'],
    states=['OPEN','TRANSFERRED','CLOSED','UNKNOWN'],unknown='retain actual owner/handle/closer; never bare-FD retry',
    exemptions='Only two initialized caller DIRECTORY owners during relay closure; no process/subtree/pending exemption',
    cleanup='Every safe owned close/drain is attempted while preserving primary and cleanup independently; unresolved receiver/native/bootstrap/temp stays retained. No force close/signal/unlink/reuse.',
    partialMetadata='created flag records successful mkdir even if a subsequent constructor/check fails; shortNamespace/socketNode stay null until actually acquired; no inode fiction',
    actualNamespaces='UNCREATED_UNOBSERVED'))

source_results=json.loads((HERE/'source-check-results.json').read_bytes())
flow_results=json.loads((HERE/'flow-check-results.json').read_bytes())
save('proof-coverage.json',dict(kind='TRUTHFUL_CURRENT_SOURCE_EVIDENCE_ATTRIBUTION',
    executedPythonSourceChecks=source_results['passed'],executedPythonFlowChecks=flow_results['passed'],flowCases=len(flow_results['cases']),
    totalCurrentPythonChecks=source_results['passed']+flow_results['passed'],
    sameCompiledFakeBoundaries=True,persistentDenyAudit=True,realBoundaryCalls=0,
    singleFlowTestReadyYield=True,removeYieldRestoresServeAst=True,actualThreadsOrProcesses=False,
    javaDeclaredVectors=dict(original=18,added=6,total=24,executed=0),
    actualNineModes={m:'UNEXECUTED_OWED' for m in constant(controller,'MODES')},
    exactPriorProof=dict(source06Manifest='b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1',
        qaManifest='8f53da49d167dbf13c391dc2c90e3615b9445cb9db6e39f9cabcb99c98c23ea2',
        ariaManifest='c334a8113638ed3b1628340e9c8d7231982a498f7ab92266904fac81d5bb7ca4',
        priorSourceCoverage=921,priorExecuted=501,priorReuse=420,
        attributionOnlyNotAddedToCurrentTotals=True,
        applicableReuse='Unchanged public_contract bytes, Ownership/Custody extraction ASTs (unused replace_exact omitted), unchanged Relay methods; complete old501/420/921 history retained and not replayed/relabelled. Changed serve reason and SyntheticRelay/controller are covered by current paired source/flow controls.'),
    allActualCompilerFixtureTlsUnixAbiTimingNamespaceBusinessWork='OWED',actualBlockedWriteSupport='UNKNOWN',
    ordinaryAdapterImplementationAndExactCallerReviews='OWED_BEFORE_ACTUAL_USE'))
save('author-history.json',dict(kind='PRESERVED_SOURCE_PREPARATION_HISTORY',
    records=[
      dict(event='Absent guessed task-context filename read',tool='initial task read',status=1,classification='bookkeeping only; no target action or discovery; exact supplied context read next'),
      dict(event='prepare_source.py metadata generation',tool='e3062b',status=0,targetNativeActions=0),
      dict(event='source checks first attempt',tool='3aa767',status=1,stdout='author-check01.stdout',stderr='author-check01.stderr',classification='Real source predicate defect: nonempty classpath list reached strict bool-only need; corrected to explicit bool. No platform action.'),
      dict(event='source checks after predicate correction',tool='8380a9',status=0,stdout='author-check02.stdout',stderr='author-check02.stderr'),
      dict(event='source checks after affected controller additions',tool='072c0f',status=0,stdout='author-check03.stdout',stderr='author-check03.stderr'),
      dict(event='whole controller15-scenario flow',tool='ff484f',status=0,stdout='author-flow01.stdout',stderr='author-flow01.stderr'),
      dict(event='Final source and flow verification',record='final-verification.json',classification='Read actual captured statuses and outputs; no inferred native/platform qualification')],
    earlierFailuresAndPacketsUnchanged=True,actualActions=0))

# Include every authored payload in this exact new directory. No recursive discovery or
# read outside this approved source output; seal and checksum files exclude themselves.
files=[]
for path in sorted(HERE.iterdir()):
    if path.name in ('manifest.json','SHA256SUMS'):continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('SOURCE_OUTPUT_NOT_REGULAR')
    raw=path.read_bytes();files.append(dict(path=path.name,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
(HERE/'SHA256SUMS').write_text(''.join(f"{r['sha256']}  {r['path']}\n" for r in files))
sha=(HERE/'SHA256SUMS').read_bytes();files.append(dict(path='SHA256SUMS',sha256=hashlib.sha256(sha).hexdigest(),bytes=len(sha),mode=stat.S_IMODE((HERE/'SHA256SUMS').stat().st_mode)))
manifest=dict(kind='SEALED_INACTIVE_JAVA_QUALIFICATION_SOURCE01_PENDING_EXACT_ARIA_QUINN_ROOT_REVIEW',files=files,
    productionFragmentSha256='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66',fragmentByteIdentical=True,
    designManifestSha256='11c18feae978bafbd9af35b5c760abe33e99377d889986102a83353bbe155f99',designQaManifestSha256='50d2ffcedeacd0a9251f8d66ff56e0bfbffe728f9f06ce0ee82d597b96a3a70b',
    rootDesignAdoptionSha256='bb29f911f7a6c835cb9394af1fd438f1db1c48c5b0976c77ac056f0df1c2d873',
    actualQualifications='UNEXECUTED_OWED',actualAuthority=False)
save('manifest.json',manifest)
print(json.dumps(dict(files=len(files),manifestSha256=hashlib.sha256((HERE/'manifest.json').read_bytes()).hexdigest(),actualNativeActions=0)))

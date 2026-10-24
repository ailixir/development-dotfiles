"""Finite author metadata maps/seal only. No target import, helper or runtime call."""
from pathlib import Path
import json,hashlib,stat,ast
OUT=Path(__file__).parent

def sha(raw):return hashlib.sha256(raw).hexdigest()
def put(name,value):(OUT/name).write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
def get(name):return json.loads((OUT/name).read_bytes())
results=get('fake-results-attempt2.json')
if results['failures']!=0 or results['executedCases']!=24 or results['deniedHostEvents']:raise RuntimeError('FAKE_BATCH_NOT_COMPLETE')
for name,pin in results['sourceHashes'].items():
    if sha((OUT/name).read_bytes())!=pin:raise RuntimeError('POST_FAKE_SOURCE_DRIFT:'+name)
immutables={'observer-fragment.java.txt':'0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66',
    'ObserverBoundaryHarness.java':'82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f'}
for name,value in immutables.items():
    if sha((OUT/name).read_bytes())!=value:raise RuntimeError('FROZEN_INPUT_DRIFT:'+name)
methods=[];imports=[]
for name in ('entry.py','profile.py','qualification_custody.py','storage.py','runtime.py','mode_predicates.py','controls.py'):
    tree=ast.parse((OUT/name).read_bytes(),filename=name)
    def visit(node,prefix=''):
        for item in getattr(node,'body',[]):
            if isinstance(item,(ast.FunctionDef,ast.ClassDef)):
                full=prefix+item.name
                methods.append(dict(file=name,name=full,line=item.lineno,kind=type(item).__name__,
                    calls=sorted({ast.unparse(call.func) for call in ast.walk(item) if isinstance(call,ast.Call)}) if isinstance(item,ast.FunctionDef) else []))
                if isinstance(item,ast.ClassDef):visit(item,full+'.')
    visit(tree)
    imports.extend(dict(file=name,module=ast.unparse(item)) for item in tree.body if isinstance(item,(ast.Import,ast.ImportFrom)))
put('finite-method-dependency-map.json',dict(kind='FINITE_SOURCE_AST_MAP',methods=methods,imports=imports,
    loaderOrder=['external readonly shell first-read cap/EOF/hash/same buffer','entry literal','manifest raw SHA/metadata','all six CODE buffers raw SHA/metadata',
        'release and decision raw SHA/metadata','compile consumed buffers only','wire verified modules','release/control/ruling/decision validation','operation dispatch','outer finalizer','typed private inherited operator sink','external actual completion OWED'],
    localImportPathsUsed=False,providerInjected=False,receiverThreadCreated=False,serializedPollWaitOwner='ChildOwner.thread / in_wait',
    allActualBoundariesNowExecuted=False))
put('role-input-phase-map.json',dict(protocol='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1',adopted=False,
    canonicalRoles={name:dict(use='OPERATIONAL' if name in ('BIN','APP','PS','LSOF') else 'METADATA_ONLY',
        actualPin='REQUIRED_IN_FUTURE_RELEASE' if name in ('BIN','APP','PS','LSOF') else None,
        actualCurrentQualification=False) for name in ('BIN','APP','PS','LSOF','GIT','NODE','HELM')},
    selfText=dict(policy='MEMORY_ONLY_BOUNDED_DIGEST_NOT_PATH',actualMetadata05Role='OTHER',reportedBytes=44,reportedSha256='6ca8f35c51bc4625b88aba368e0e3e6b52bd4f043902a68ceae684135a43d0f2',
        origArgv0Role='APP',origArgv0Bytes=124,origArgv0Sha256='246e02e7d1db128f0eb0625c3692aad64a4bc811387aa4a58d4914b479242165',rawReportedText='UNKNOWN',roleGrant=False),
    phaseInputs=dict(fixture=['JDK_RELEASE','PHASE_AUTHORIZATION','KEYTOOL','PASSWORD'],compile=['JDK_RELEASE','PHASE_AUTHORIZATION','JAVAC','CLASSPATH_INDEX','HARNESS_SOURCE'],
        mode=['JDK_RELEASE','PHASE_AUTHORIZATION','JAVA','CLASSPATH_INDEX','CLASSES_INDEX'],tlsAdditional=['FIXTURE','PASSWORD']),
    allInputs='exact root pins, no guessed hash, discovery, optional provider, cache/vendor scan or transferred owner grant',
    sourceEquality='finite per-member comparison to root-pinned f9 ancestry; not a newly recomputed f9',
    JavaModes=dict(declared=list(('parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay')),actualExecuted=0,status='UNEXECUTED_OWED'),
    parser=dict(original=18,added=6,declared=24,javaExecuted=0),immutablePins=immutables))
put('ownership-constructor-interpreter-map.json',dict(
    resources=[dict(kind=k,retainedBy=owner,partial=partial,completion=completion) for k,owner,partial,completion in (
        ('bootstrap ancestor/leaf FD','entry.BOOT_OWNED before fstat','UNKNOWN set before close; retained globally','actual closer return only'),
        ('custody ancestor/leaf FD','Ownership token / Custody.owned before fstat','partial owner retained; no bare-FD retry','actual close return and full named/opened revalidation'),
        ('native process','ChildOwner token before Popen; actual handle before PID validation','unreturned constructor UNKNOWN foreground HOLD','sole serial direct terminal wait actual int32; no repeated returned wait'),
        ('utility process/pipes','Inspector record/token before Popen; actual returned child/each pipe retained','partial actual references + pending record retained','actual communicate/direct completion and bounded accepted buffers; acquisition bound owner review OWED'),
        ('selector/listener','RelayLoop.construct attempt before constructor','unreturned failure UNKNOWN foreground HOLD','per-token actual close return'),
        ('accepted connection','RelayLoop.accepted attempt before accept; actual handle retained','nonblocking no-return EWOULDBLOCK known none; other unreturned exception UNKNOWN','one consumed enrollment and actual retained connection close'),
        ('native file sinks','Storage exclusive FD transfer and named equality','actual FD retained before validation/close','fsync / actual close / bounded reread'),
        ('operator stdout sink','exact actual root wrapper retains inherited FD1','external wrapper/sink custody actual evidence OWED','actual entry completion then wrapper-confirmed sink close; never in-process postexit proof'))],
    callbacks=['Ownership token closer exact actual object','selectors registration serial root owner; no receiver thread','Popen communicate/poll/wait owned concrete handles','no injected identity/evidence provider'],
    interpreter='entry executes only fully pinned consumed six code buffers; all stdlib preloaded for fake checks; no path-based target imports',
    unknownDisposition='NONRETURNING_RETAINED_FOREGROUND_HOLD_NO_NORMAL_RETURN_OR_INTERPRETER_TEARDOWN',
    externalUnknownDisposition='UNIMPLEMENTED_EXACT_REVIEW_HOLD_PREREQUISITE',
    firstPrimary='native/entry latch before finalization/publication; Storage retains original exception and separate cleanup errors',
    publicErrors='closed typed reason/projection; arbitrary exception bodies/raw outputs/objects never projected'))
review={'Aria':'resume-architecture/resume2/c8-synthetic-local-report-source01-exact-review/review-record.json','Quinn':'qa/c8-synthetic-local-report-source01-exact-review/review-record.json'}
owner={'Aria':'resume-architecture/resume2/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Aria.json','Quinn':'qa/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Quinn.json','root':'resume2-c8-synthetic-local-report-source01-owner-ruling-root.json'}
put('control-owner-dag-map.json',dict(protocol='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1',claim='LOCAL_SYNTHETIC_MODE_REPORT_WITH_SAMPLED_OBSERVATIONS',principal='OWNED_DIRECT_CHILD_CHANNEL_MATCH_V1',
    codeReviewPaths=review,technicalSecurityOwnerPaths=owner,ownExactAllRulings='OWED_BEFORE_USE',historicalDesignImplementationAuthorized=False,separateS0Task='SOURCE_IMPLEMENTATION_ONLY',
    perUnitDag=['capture2-before-Ewrite','capture0-actual-outer-inspection','negative2','separate-negative2-actual-inspection','SAME-holder-held-once','actual-owned-work-output-receiver-FD-drain',
        'full-W-E-archive','actual-archiveQA-root','final0','separate-final0-inspection','distinct-readiness-bound60s-permit','same-permit-PRE-afterallow-POST','guard0-expected-wrapper0or1',
        'actual-wrapper-outer-completion','postclose-original-holder-absent-original-lock-free-source/archive-equality','actual-postclose0-QA-root-before-next-heavy'],
    units=['F0','C0','parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'],
    everyUnitSeparatelyClosed=True,noAggregateNineModeClosingGate=True,actualControlsAllocated=False,actualNamespaceAllocated=False,
    inputSchemaSources=['profile.release','profile.holder','profile.pin','profile.decision','entry.INPUT_KEYS','controls.INPUTS','runtime.validate_launch_control','runtime.permit_check'],
    controlConstruction='controls.py pure constructors require exact actual values; no owner grant/default/future hash',
    currentFailedGateway='proper archiveQA/final/separate60s permit/wrapper1/postclose0/actualQAroot still prerequisite before every heavy action',
    dependencyCycles='none: sealed source excludes own manifest/checksums; release and decisions are external future pins; owner docs bind sealed manifest after seal'))
# Closed generic claim schema: further operation schemas are exact executable field
# validators above, not a permissive claim that these JSON objects grant authority.
guarantees=['strongExecutableObjectIdentityProved','kernelMainMappedVnodeEqualityProved','highResolutionProcessIdentityProved','launchTimeExecutableObjectBound','completeIntervalHistoryProved','exhaustiveDescendantDiscoveryProved','adversarialReplacementRaceExcluded','globalQuietProved','legacyOrdinaryGateSatisfied','intervalCaptureClaimed']
unsupported=['kernelStartSeconds','kernelStartMicroseconds','kernelMainExecutableObject','mainMappedObjectEquality','launchTimeObjectBinding','strongPlatformCertificateSha256']
put('claim.schema.json',{'$schema':'https://json-schema.org/draft/2020-12/schema','title':'UNADOPTED C8 synthetic claim envelope','type':'object',
    'required':['protocol','claimSet','guarantees','unsupportedEvidence','historicalIdentityUncertainty','identityComplete','kernelIdentityComplete','C8','credit','cleanupAuthorized','sourceWrites'],
    'properties':{'protocol':{'const':'C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1'},'claimSet':{'const':'LOCAL_SYNTHETIC_MODE_REPORT_WITH_SAMPLED_OBSERVATIONS'},
        'guarantees':{'type':'object','additionalProperties':False,'required':guarantees,'properties':{name:{'const':False} for name in guarantees}},
        'unsupportedEvidence':{'type':'object','additionalProperties':False,'required':unsupported,'properties':{name:{'const':{'value':None,'reason':'NOT_PROVED_BY_SYNTHETIC_LOCAL_REPORT_PROFILE'}} for name in unsupported}},
        'historicalIdentityUncertainty':{'const':True},'identityComplete':{'const':False},'kernelIdentityComplete':{'const':False},'C8':{'const':False},'credit':{'const':False},'cleanupAuthorized':{'const':False},'sourceWrites':{'const':[]}},
    'description':'Envelope only; purpose-specific exact executable schemas and pinned root/owner rulings mandatory. This file grants no authority.'})
history=get('attempt-history.json');history['attempts'].append(dict(number=2,command='python3 -B '+str(OUT/'fake_check.py'),actualExit=0,toolChunk='3d447d',executed=24,passed=24,failed=0,
    stdout='fake-attempt2.stdout',stderr='fake-attempt2.stderr',result='fake-results-attempt2.json',sourceHashesCaptured=True,sourceHashes=results['sourceHashes'],
    noCaseExpansion=True,checks=results['checks'],deniedHostEvents=0))
put('attempt-history.json',history)
put('verification.json',dict(status='SOURCE_PREP_COMPLETE_REVIEW_OWED_HOLD_BEFORE_USE',declaredCases=24,finalExecutedCases=24,finalPassedCases=24,
    finalCheckCount=results['checks'],checkMeaning='includes fake model/FD bookkeeping; not independent case count',firstAttempt=dict(exit=1,passed=23,failed=1),finalAttempt=dict(exit=0,passed=24,failed=0),
    dynamicAssertionsReused=0,priorHugeSuitesReplayed=False,immutableSourceReuseByPin=True,actualJava=0,actualCompiler=0,actualFixture=0,actualTls=0,actualPeerAbi=0,actualPlatform=0,actualCurrentResource=0,
    fakeTargetBoundaryGlobals=True,permanentDenyAudit=True,bytecodeDisabled=True,hostDeniedEvents=0,rootShellActualExecution=False,fullLoaderActualExecution=False,
    staticPythonAst=True,exactFinalSourceHashesChecked=True,allNineFakeUnitFlowsPassed=True,actualNineModeOutcomes='UNEXECUTED_OWED',writeStall='UNKNOWN_ACTUAL_REQUEST_COMPLETED_FALSE_AND_STAGE_OWED',
    actualResourceClosure=False,unknownExternalDisposition='UNIMPLEMENTED_EXACT_REVIEW_HOLD',wrapperSinkAndExternalCompletion='OWED_ACTUAL_INPUTS_AND_REVIEW',
    ordinaryAdapterAndCaller='OWED_STRICT_INTERFACE_UNBRIDGEABLE_BY_FLAG_COPY',businessObserver='SELECTED_WORKER_BINDING_UNPROVED_HOLD',USD500SharedAggregate='UNKNOWN',C8=False,credit=False))
put('inherited-holds-and-provenance.json',dict(task='.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-synthetic-local-report-source01-task.txt',
    context='.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-synthetic-local-report-source01-context.json',actualSAFE=dict(id='79dfe3',exit=0,inspection='3a6f06',safe=True,threats=[]),
    designManifest='4de71b8fd5986ea8be023e58fe8dd549960630e1a51b03b35d84089a4adadfc6',designQa='fb0b3d401ff0484406698f6c40e39e6f803a27c08d34af5c9c70a359ac86a03d',designRoot='14d53e384f92b52ede6fc4ed52b423582d6a3441ad07895451f70afe690d1789',
    java02='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f',java02Root='18f7cc159d785cd46d2f20ec0367e34e5e1a18065363ba71bd41148c583e44e1',gateway09='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7',
    reviewedInputs='verified-preparation-inputs.json complete author source metadata pins; no actual qualification grant',
    skill='aiox-dev/Dex; no delegation; conflicting Node greeting and broad checks skipped per exact saved scope',
    bookkeepingOnly=['configured docs/framework coding-standards/tech-stack/source-tree paths absent; finite docs filename lookup found no fallback; no runtime/new discovery authority inferred'],
    changedScope='only named new S0 preparation directory; no production/strict/old packet/runtime edits',
    externalHolds=['default4000','Order17','T0root731','preF1','NONIR','Replayb8-wholef9 restore','atmostone compile','C8-before-credit','IR','skip','21 external holds',
        'currentGateway-held','Java actual nine outcomes UNEXECUTED_OWED','strict Java02 ordinary adapter/caller OWED','business06 selected-worker HOLD','actual sourcewindow/runtime/lease/cleanup/credit/lifecycle/push not authorized'],
    USD500SharedAggregate='UNKNOWN'))
# No cycles: these two integrity outputs are deliberately outside the member list.
files=[]
for path in sorted(OUT.iterdir()):
    if not path.is_file() or path.name in ('manifest.json','SHA256SUMS'):continue
    raw=path.read_bytes();files.append(dict(path=path.name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode)))
put('manifest.json',dict(kind='C8_SYNTHETIC_LOCAL_REPORT_SOURCE01_PREPARATION',sourceOnly=True,status='INACTIVE_UNADOPTED_HOLD_BEFORE_USE',files=files,
    filesCount=len(files),actualRuntimeAuthorized=False,actualResourceClosure=False,actualJavaModesExecuted=0,ownExactReviewsAndOwnerRulings='OWED',
    unknownExternalDisposition='UNIMPLEMENTED_EXACT_REVIEW_HOLD_PREREQUISITE',USD500SharedAggregate='UNKNOWN'))
(OUT/'SHA256SUMS').write_text(''.join(row['sha256']+'  '+row['path']+'\n' for row in files)+sha((OUT/'manifest.json').read_bytes())+'  manifest.json\n')
print(json.dumps(dict(manifestSha256=sha((OUT/'manifest.json').read_bytes()),files=len(files),finalCases=24,passed=24,actualJava=0,status='HOLD_BEFORE_USE')))

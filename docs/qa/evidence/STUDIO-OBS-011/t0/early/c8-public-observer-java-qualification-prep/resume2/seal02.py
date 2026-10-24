"""Finite SOURCE02 author metadata/seal. No target import/helper invocation."""
from pathlib import Path
import ast,hashlib,json,stat
HERE=Path(__file__).absolute().parent
OLD=HERE.parent/'resume1'
CHECKS=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def save(name,value):(HERE/name).write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')
def load(name):return json.loads((HERE/name).read_bytes())
def sha(raw):return hashlib.sha256(raw).hexdigest()
controller_raw=(HERE/'qualification_controller.py').read_bytes();controller=ast.parse(controller_raw)
old_raw=(OLD/'qualification_controller.py').read_bytes();old=ast.parse(old_raw)
for node in old.body:
    if isinstance(node,(ast.ClassDef,ast.FunctionDef)) and node.name!='Invocation':
        current=next(n for n in controller.body if isinstance(n,type(node)) and n.name==node.name)
        check('UNCHANGED_CONTROLLER_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(current,include_attributes=False))
before=next(n for n in old.body if isinstance(n,ast.ClassDef) and n.name=='Invocation')
after=next(n for n in controller.body if isinstance(n,ast.ClassDef) and n.name=='Invocation')
changed={'__init__','invoke','confirm_native','validate_native','cleanup_owned','snapshot'}
for node in before.body:
    if isinstance(node,ast.FunctionDef) and node.name not in changed:
        current=next(n for n in after.body if isinstance(n,ast.FunctionDef) and n.name==node.name)
        check('UNCHANGED_INVOCATION_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(current,include_attributes=False))
for name in ('ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt',
    'java-harness-status.json','qualification_custody.py','qualified_relay.py','entry_loader.py','public_contract.py',
    'public-observation.schema.json','flow_checks.py','source_checks.py','FIXTURE-RECIPE.md','acceptance-matrix.md','finite-input-requirements.json'):
    check('BYTE_IDENTICAL_'+name,(HERE/name).read_bytes()==(OLD/name).read_bytes())
check('LITERAL_FRAGMENT0153',sha((HERE/'observer-fragment.java.txt').read_bytes())=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
check('LITERAL_HARNESS82a9',sha((HERE/'ObserverBoundaryHarness.java').read_bytes())=='82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f')
check('NO_RAW_NATIVE_GET',b'self.native.get(' not in controller_raw)
check('NO_RAW_NATIVE_TRUTHINESS',b'if self.native else' not in controller_raw)

prior_source=load('source01-source-check-results.json');prior_flow=load('source01-flow-check-results.json')
flow=load('flow-check-results.json');projection=load('projection02-check-results.json')
check('ALL222_FLOW_SEMANTIC_IDS_RETAINED',[x['name'] for x in prior_flow['checks']]==[x['name'] for x in flow['checks']])
check('ALL135_SOURCE_IDS_BOUND',len(prior_source['checks'])==135 and prior_source['failed']==0)
check('FLOW222_PASSED',flow['passed']==222 and flow['failed']==0 and len(flow['cases'])==15)
check('PROJECTION276_PASSED',projection['passed']==276 and projection['failed']==0 and len(projection['cases'])==28)

schemas=load('source01-schemas.json');schemas['schemaVersion']=2
schemas['kind']='EXACT_SOURCE02_CLOSED_TYPED_NATIVE_PROJECTION_SCHEMAS'
schemas['definitions']['NativeWait']['types']['nativeStatus']='actual exact int32 status; bool or unbounded integer rejected'
schemas['definitions']['NativeWait']['projection']='Every success/failure crosses native_projection before output/drain confirmation; rejected raw objects/mode bytes are retained internally and never exported.'
native_func=next(n for n in controller.body if isinstance(n,ast.FunctionDef) and n.name=='native_projection')
native_out=next(n for n in ast.walk(native_func) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='dict')
schemas['definitions']['NativeProjection']=dict(fields=sorted(k.arg for k in native_out.keywords),
    validator='qualification_controller.native_projection',total=True,
    rawContainer='Only exact dict; exact-string known keys considered. No arbitrary truthiness/get/repr/str/container methods.',
    publicScalars=dict(nativeStatus='exact int32 or null; bool excluded',nativeWaited='exact bool or null',nativeArchiveSha256='hex64 or null'),
    invalidOrUnavailable='null; reason NONE/ABSENT/SCHEMA/NATIVE_UNKNOWN; no raw buffers/unknown keys/arbitrary values exported',
    independentlyKnownFacts='Matching-PID direct wait/work/descriptor facts may confirm actual closed process token despite rejected status/archive; result remains failed.',
    unknown='Actual raw return/process/owner/closer references retained; no retry/reset/invented completion')
snapshot=next(n for n in after.body if isinstance(n,ast.FunctionDef) and n.name=='snapshot')
out=next(n for n in ast.walk(snapshot) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='dict' and any(k.arg=='protocol' for k in n.keywords))
schemas['definitions']['QualificationResult']['fields']=sorted(k.arg for k in out.keywords)
schemas['definitions']['QualificationResult']['nativeDerivedPublicTypes']=dict(nativeStatus='exact int32 or null',nativeWaited='exact bool or null',nativeArchiveSha256='hex64 or null',
    nativeProjectionReason='NONE/ABSENT/SCHEMA/NATIVE_UNKNOWN',nativeResultReceived='bool: wait method returned any object; never proof of direct wait/drain',nativeDrainState='CONFIRMED only after actual owned process token close confirmation; otherwise UNKNOWN')
save('schemas.json',schemas)

maps=[]
for name in ('qualification_controller.py','qualification_custody.py','qualified_relay.py','entry_loader.py','public_contract.py'):
    raw=(HERE/name).read_bytes();tree=ast.parse(raw);functions=[]
    def visit(nodes,prefix=''):
        for node in nodes:
            if isinstance(node,(ast.ClassDef,ast.FunctionDef)):
                functions.append(dict(name=prefix+node.name,line=node.lineno,endLine=node.end_lineno))
                if isinstance(node,ast.ClassDef):visit(node.body,prefix+node.name+'.')
    visit(tree.body);maps.append(dict(path=name,sha256=sha(raw),functions=functions))
save('implementation-map.json',maps)
ownership=load('source01-first-read-and-ownership-map.json')
ownership['schemaVersion']=2
ownership['nativeProjection']=dict(boundary='native_projection',consumers=['validate_native','confirm_native','cleanup_owned relay native-drain gating','snapshot'],
    output='Only independently typed scalar facts; null/closed reasons for rejected/unavailable data. Raw NativeWait object/mode bytes/unknown keys never exported.',
    receive='native_received records a returned value separately from unavailable/thrown wait; null/malformed return does not trigger another wait',
    closure='Actual process token CLOSED means matching-PID wait/work/descriptor facts confirmed. Invalid status/archive alone does not erase independently known drain; invalid wait/container retains UNKNOWN actual refs and HOLD.',
    provenance='SOURCE01 complete one-category QA/Aria findings and root961c6912; no native adapter implementation/integration selected')
save('first-read-and-ownership-map.json',ownership)

if not (HERE/'source01-verified-inputs.json').exists():
    (HERE/'source01-verified-inputs.json').write_bytes((HERE/'verified-inputs.json').read_bytes())
pins=load('verified-source01-and-review-inputs.json')
current=[]
for name in ('qualification_controller.py','qualification_custody.py','qualified_relay.py','public_contract.py','entry_loader.py',
    'ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt','source_checks.py','flow_checks.py','projection02_checks.py'):
    path=HERE/name;raw=path.read_bytes();current.append(dict(path=str(path),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode)))
save('verified-inputs.json',dict(kind='SOURCE02_CURRENT_CODE_AND_EXACT_PRIOR_REVIEW_PIN_GRAPH',currentPrepared=current,source01AndBothCompleteReviews=pins,
    actualToolClassFixtureOrdinaryAdapterInputs='UNQUALIFIED_OWED',actualCurrentResourceFacts=False))
save('code-pin-requirements.json',dict(kind='SOURCE02_EXTERNAL_FIRST_READ_REQUIREMENTS',
    externalLoaderPin=next(row for row in current if row['path'].endswith('/entry_loader.py')),
    externalCodeSpecs=[row for row in current if row['path'].rsplit('/',1)[-1] in ('qualification_controller.py','qualification_custody.py','qualified_relay.py','public_contract.py')],
    requirement='Root externally verifies the consumed loader buffer; all four external code specs must match consumed buffers and the later release codePins. Actual root caller/ordinary adapter complete review remains owed.',
    installed=False,actualAuthority=False))

save('proof-coverage.json',dict(kind='SOURCE02_TRUTHFUL_CURRENT_AND_REUSED_EVIDENCE',
    executed=dict(controllerFlowChecks=222,controllerFlowCases=15,nativeProjectionChecks=276,nativeProjectionCases=28,totalPythonChecks=498),
    reused=dict(unchangedSourceChecks=135,source01SourceResultSha256=sha((HERE/'source01-source-check-results.json').read_bytes()),
        reason='Exact source_checks.py and all exercised non-Invocation functions/loader/custody/Relay/harness/Java bytes bound unchanged; no unchanged135 replay.'),
    sourceControlCoverage=633,retainedSemanticIdentities=357,
    identityRule='Suite-qualified IDs; all old135 source and222 flow identities retained. Projection276 includes its own repeated guard/reverse-proof checks, not additional Java/platform proof.',
    persistentUnchangedDenyAudit=True,sameCompiledFakeBoundaries=True,singleReadyYield=True,removeYieldRestoresServeAst=True,actualThreads=False,
    priorSource06Proof='921 remains exactly attributed historical501+420, not replayed or added to current counts',
    javaVectors=dict(original=18,added=6,declared=24,executed=0),allNineActualModes='UNEXECUTED_OWED',blockedWrite='UNKNOWN',
    ordinaryAdapterImplementationAndExactRootCallerReview='OWED_NOT_THIS_FIX',actualAuthority=False))
save('final-verification.json',dict(kind='SOURCE02_ONE_CATEGORY_AFFECTED_VERIFICATION',
    flow=dict(tool='3dfedb',actualStatus=0,checks=222,cases=15,stdout='author02-flow01.stdout',stderr='author02-flow01.stderr'),
    projection=dict(tool='6d1071',actualStatus=0,checks=276,cases=28,stdout='author02-projection01.stdout',stderr='author02-projection01.stderr'),
    outputsSeparatelyRead=True,forbiddenRealBoundaryCalls=0,actualNativeJavaCompilerFixturePlatformActions=0,
    allNewCasesDeclaredBeforeExecution=True,noTargetExpansionAfterPassing=True))
save('author-history.json',dict(kind='SOURCE02_PRESERVED_FULL_HISTORY',source01History='source01-author-history.json',
    source01HoldQaManifest='346afb412109878078b96c83fb0a4b60f017b9231f8493df8ffc13b728434426',
    source01HoldAriaManifest='d36eedcf73ebc7e9da3638a5c83c7808bd50589c49fb4f99bcf7e94dd1bc4e45',
    rootCompleteCategoryAdoption='961c691211ee3d47f2e696ce99476d3ad568bd39d1cdc14d71c19dd0716523fd',
    records=[dict(event='Single guessed short review paths absent',status=1,classification='bookkeeping read only; complete exact names obtained from completed-agent metadata, no broad discovery'),
        dict(event='Complete49 SOURCE01 and34 review payload integrity/copy metadata',tool='94f794',actualStatus=0),
        dict(event='Complete15 affected controller-flow replay',tool='3dfedb',actualStatus=0,checks=222),
        dict(event='Complete28 declared actual Invocation native-projection pairs',tool='6d1071',actualStatus=0,checks=276)],
    source02TargetAttemptsFailed=0,source01StrictBooleanFailureRetained=True,actualActions=0))
save('metadata-checks.json',dict(kind='FINITE_SOURCE02_METADATA_ONLY_BINDINGS',passed=len(CHECKS),failed=0,checks=CHECKS,
    targetFunctionsExecuted=0,actualActions=0))

files=[]
for path in sorted(HERE.iterdir()):
    if path.name in ('manifest.json','SHA256SUMS'):continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('REGULAR_SOURCE_OUTPUT')
    raw=path.read_bytes()
    files.append(dict(path=path.name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
(HERE/'SHA256SUMS').write_text(''.join(row['sha256']+'  '+row['path']+'\n' for row in files))
raw=(HERE/'SHA256SUMS').read_bytes();files.append(dict(path='SHA256SUMS',sha256=sha(raw),bytes=len(raw),mode=420))
save('manifest.json',dict(kind='SEALED_COMPLETE_INACTIVE_JAVA_QUALIFICATION_SOURCE02_PENDING_EXACT_ARIA_QUINN_ROOT',files=files,
    priorSource01ManifestSha256='fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f',
    adoptedFindingCategory='C8JQ01-QA-01/ARCH-01 total typed closed NativeWait projection',
    rootAllFindingsAdoptionSha256='961c691211ee3d47f2e696ce99476d3ad568bd39d1cdc14d71c19dd0716523fd',
    productionFragmentSha256='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66',
    harnessSha256='82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f',
    actualNineQualifications='UNEXECUTED_OWED',ordinaryAdapterAndExactCallerReview='OWED',actualAuthority=False))
print(json.dumps(dict(payloads=len(files),manifestSha256=sha((HERE/'manifest.json').read_bytes()),metadataChecks=len(CHECKS),actualActions=0)))

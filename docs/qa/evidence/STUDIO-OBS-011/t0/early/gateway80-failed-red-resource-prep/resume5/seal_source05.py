"""Public source/pin/AST author verification and metadata seal. No target execution."""
import ast,hashlib,json,stat
from pathlib import Path
H=Path(__file__).absolute().parent;O=H.parent/'resume4';T=H.parents[2];R=next(p for p in H.parents if p.name=='ui-studio')
def sha(b):return hashlib.sha256(b).hexdigest()
def put(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
def load(n):return json.loads((H/n).read_bytes())
def need(v,name):
    if v is not True:raise ValueError(name)
pins=[]
def bind(p,expected=None):
    b=p.read_bytes();s=p.lstat();need(stat.S_ISREG(s.st_mode) and not p.is_symlink(),'PUBLIC_REGULAR')
    need(expected is None or sha(b)==expected,'PUBLIC_SHA')
    pins.append(dict(path=str(p.relative_to(R)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(s.st_mode)))
    return b
def packet(d,expected):
    m=json.loads(bind(d/'manifest.json',expected))
    for row in m.get('files',m.get('members',[])):
        b=bind(d/row['path'],row['sha256']);need(len(b)==row['bytes'],'PUBLIC_BYTES');need(pins[-1]['mode']==(int(row['mode'],8) if type(row['mode'])is str else row['mode']),'PUBLIC_MODE')
    return m
old=packet(O,'cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e')
packet(T/'resume-architecture/resume2/gateway-failed-resource-typed-python-role-design','057a1eec581db2f2ace5185d7478815128be9fe94d3fc0d53bec6a7c34465cd9')
packet(T/'qa/gateway-failed-resource-typed-python-role-design-review','1fdb6457b8455cfc8ff1fd12fc7aaedd30483cea1bbbe50841685eb6a60dbabd')
packet(T/'resume-architecture/resume2/gateway80-failed-red-resource-code04-exact-review','3ed25439337305de249cfbbc815d2b739131f1d85749fcb26325499bb7523448')
packet(T/'qa/gateway80-failed-red-resource-code04-exact-review','6ed355b231a86e9d697a380d85d09eca94feb0129579bcd4d99ee05881c2fec4')
bind(T/'resume2-gateway-failed-resource-typed-role-design-qa-root-adoption.json','fa8f1fbbd57a8c9f6531ff6f89fca6abe1b2e1417f33e040e530f7798029459c')
root04=bind(T/'resume2-gateway80-failed-resource-source04-exact-source-root-adoption.json','1ed3fc136b75950ed7ed00a47f6cf803849d41ea7dcc5743fe2134547a6b7df7')
(H/'ancestor04-root-exact-source-adoption.json').write_bytes(root04)
k=load('contract.json')
for p,h in k['typedMetadataPins'].items():bind(Path(p),h)
for p,h in k['priorIndexPins'].items():bind(Path(p),h)
for suffix in ('task.txt','context.json'):bind(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/('gateway-failed-resource-source05-'+suffix))
runtime=['protocol.py','custody.py','failed_gateway.py','factory.py','installer.py','install-cli.py','entry.py','buffer-bootstrap-inline.py','buffer-verifier-inline.py','shell-buffer-verify.py']
functions={};sites=[];old_asts={};new_asts={}
for n in runtime:
    raw=(H/n).read_bytes();tree=ast.parse(raw);need(not any(isinstance(x,ast.Assert) for x in ast.walk(tree)),'NONREMOVABLE_'+n)
    oldtree=ast.parse((O/n).read_bytes())
    for target,where in ((tree,new_asts),(oldtree,old_asts)):
        for node in target.body:
            if isinstance(node,ast.FunctionDef):where[n+':'+node.name]=node
            elif isinstance(node,ast.ClassDef):
                for fn in node.body:
                    if isinstance(fn,ast.FunctionDef):where[n+':'+node.name+'.'+fn.name]=fn
    for key,node in new_asts.items():
        if key.startswith(n+':'):functions[key]=dict(file=n,line=node.lineno,endLine=node.end_lineno,signature=ast.unparse(node.args),astSha256=sha(ast.dump(node,include_attributes=False).encode()))
    for node in ast.walk(tree):
        if isinstance(node,ast.Call):
            callee=ast.unparse(node.func)
            if callee in ('exec','compile','json.loads','P.decode','ast.parse') or callee.endswith(('.bound','.local','.document','.read','.root_read','.bootstrap_read','.copy_from','.preflight','.finalize','.source_call','.acquire','.install','.verify','.require_setup','.claim_finalizer','.primary','.cleanup','.python','.owner_records','.completion_attestation','.resolve_actor_completions','.prior_index_bindings')):sites.append(dict(file=n,line=node.lineno,callee=callee))
unchanged=[dict(function=key,astSha256=sha(ast.dump(fn,include_attributes=False).encode())) for key,fn in new_asts.items() if key in old_asts and ast.dump(fn,include_attributes=False)==ast.dump(old_asts[key],include_attributes=False)]
for required in ['failed_gateway.py:Unit.capture','custody.py:Custody.mkdir','protocol.py:FailureSink.primary','protocol.py:FailureSink.cleanup','protocol.py:FailureSink.claim_finalizer','protocol.py:FailureSink.require_finalizer','protocol.py:FailureSink.forward']:
    need(required in {r['function'] for r in unchanged},'UNCHANGED_CRITICAL_'+required)
need((H/'custody.py').read_bytes()==(O/'custody.py').read_bytes(),'LITERAL_CUSTODY')
protocol=(H/'protocol.py').read_text();block=protocol[protocol.index('STAGES='):protocol.index('# END SINGLE OUTER FAILURE SINK')]
for n in ('guard-failed-red.bash','install-loader.bash','install-cli.py'):need(block in (H/n).read_text(),'SAME_SINK_'+n)
for n,label in [('guard-failed-red.bash','GUARD'),('install-loader.bash','INSTALL_LOADER')]:
    text=(H/n).read_text();body=text.split("-B -c '",1)[1].split("' ",1)[0];tree=ast.parse(body)
    need(not any(isinstance(x,ast.Assert) for x in ast.walk(tree)),'NONREMOVABLE_INLINE')
    need('claim_finalizer("'+label+'")' in body and body.count('sink.finalize(finalizer)')==1,'ONE_FINALIZER_'+n)
    for node in ast.walk(tree):
        if isinstance(node,ast.Call) and ast.unparse(node.func) in ('exec','compile','json.loads','hashlib.sha256','ns[\'execute\']'):
            sites.append(dict(file=n,lineInPythonBody=node.lineno,callee=ast.unparse(node.func),embeddedPython=True,selectedFinalizer=label))
need((H/'binding-functions.bash').read_bytes()==(H/'guard-failed-red.bash').read_bytes(),'SAME_BINDING')
need(k['sourceGeneration']==5 and len(k['priorNamespaces'])==2 and [len(p['members']) for p in k['priorNamespaces']]==[7,8],'TWO_PRIORS')
need(len(k['knownPostBaseActors'])==11 and len({r['pid'] for r in k['knownPostBaseActors']})==11,'KNOWN11')
need(set(k['finiteUnion']['numericIds']).isdisjoint({r['pid'] for r in k['knownPostBaseActors']}),'DISJOINT_KNOWN')
need(k['finiteUnion']['numericCountExcludingControllers']==2255,'BASE2255')
need(len(k['finiteUnion']['historicalPidStartsRequiringAbsentOrReused'])==7,'SEVEN_STARTS')
for n in ('factory.py','failed_gateway.py'):
    text=(H/n).read_text();need('gateway80-failed-red-resource-code05-exact-review' in text and 'code04-exact-review' not in text and 'gateway80-failed-red-resource-source05-exact-review' not in text,'CODE05_REVIEW_PATHS')
# Raw process self strings occur only in System.python, the bounded memory converter.
adapter=ast.parse((H/'failed_gateway.py').read_bytes());system=next(x for x in adapter.body if isinstance(x,ast.ClassDef) and x.name=='System');sample=next(x for x in system.body if isinstance(x,ast.FunctionDef) and x.name=='python')
selfsites=[x for x in ast.walk(adapter) if isinstance(x,ast.Attribute) and isinstance(x.value,ast.Name) and x.value.id=='sys' and x.attr in ('executable','orig_argv')]
need(len(selfsites)==2 and all(sample.lineno<=x.lineno<=sample.end_lineno for x in selfsites),'RAW_MEMORY_ONLY')
put('api-map.json',dict(sourceGeneration=5,functions=functions,installedRuntimePayloads=k['installedCode'],operationalNamespace=k['namespace'],operationNames='gateway80_failed_red04_*/gateway80_fr04_*/GATEWAY_FR04_*',finalizer='Preserved selected opaque outer owner; after all selected cleanup; borrowed layers never emit',currentRuntimeAuthority=False))
shell={}
for name in ('guard-failed-red.bash','binding-functions.bash','binding-wrapper.bash','install-loader.bash'):
    for number,line in enumerate((H/name).read_text().splitlines(),1):
        if line.startswith('gateway80_') and line.endswith('() {'):shell[name+':'+line.split('(')[0]]=dict(file=name,line=number,readonlyDeclarationRequired=True,actualCompatibility='UNEXECUTED')
api=load('api-map.json');api['shellFunctions']=shell;api['completionDelivery']='invoke MODE CONTROL_SHA COMPLETION_SHA SAME_READONLY_BUFFER; negative/exit binder and gate exit have exact distinct argument shapes in control-schema/RECIPE05';put('api-map.json',api)
classes=['exact code05source/two source reviews','three exact independent outside owner records','typed fresh bounded memory self-text','seven independent physical executable witnesses','both prior immutable namespace indices/membership','old2263 regulars/newN03 strict membership','known2255+11 and all dynamic actual actors','current/prior SHA-pinned root controls','finite readonly root/operator completion argv attestation','fresh ps/lsof/holder/kernel/inherited/listeners/source/resources','retainedFD/Popen/native-wait uncertainty','full failedW/original22/helper/raw4 archive','fresh final/readiness60s permit/wrapper1/postclose0','shared closed reason/finalizer ownership']
put('interpretation-map.json',dict(sourceGeneration=5,functions=functions,reachedInterpretationSites=sites,reachedInterpretationSiteCount=len(sites),inputClasses=classes,inputClassCount=len(classes),rawSelfTextUses='Only strict bounded local memory count/hash and origAPP literal equality; never file/path/exec/environment/alias/output',loaderOrder='external rawSHA before parse/compile SAME consumed buffer',currentRuntimeFacts=False))
put('ownership-map.json',dict(sourceGeneration=5,oldNumericBase=2255,knownPostBaseActors=k['knownPostBaseActors'],knownMetadataUnion=2266,futureCount='actual set union, never fixed count',allIncompleteNumericAbsenceEveryApplicableTableAndBothJoins=True,priorNamespaces=k['priorNamespaces'],directEEntriesBeforeN3=2265,directEEntriesAfterExclusiveN3=2266,lastAuthor='Null in immutable file; distinct actual separately completed ROOT_OPERATOR_ATTESTATION readonly SAME argv buffer, exact pending set. Existing pinned controls retain all prior authors. Unknown/conflict/nonzero/precompletion HOLD. No writer recursion/direct-wait/physical claim.',successfulSetupHelpers='Separate strict foreground0 list, never metadata/failed/external coercion',currentObserverCompletion='Real external tool result after actual observer exit; no recursive observer',retainedUnchangedCriticalFunctions=unchanged,primaryAndCleanupSeparate=True,partialNamespace='Immediate created marker; opened identity null until observed; no reset or cleanup',actualRuntimeFacts=False))
put('reuse-analysis.json',dict(ancestor04ManifestSha256=sha((O/'manifest.json').read_bytes()),ancestor04Executed313=True,ancestor04PriorReused19=True,ancestor04ResultsPreservedLiterally=True,currentReplayOf313=False,currentReplayOf19=False,unchangedFunctionCount=len(unchanged),unchangedFunctions=unchanged,retained19='Bound prior-source03 proof through exact source04 reused result/20unchanged source04-referenced cap/custody method ASTs; source04 and its exact reviews remain authoritative historical attribution',changedCompositions='Role/factory/client/namespace/control/history/completion flows require the new bounded actual-function fake batch. No ancestral result becomes current execution merely by copying it.',total332NotClaimedExecutedHere=True))
put('input-pins.json',dict(kind='SOURCE05_EXACT_PUBLIC_INPUTS',inputs=pins,currentRuntimeFrozenPrivateBaselineAcquisitions=0,referencedRuntimePinsNotFollowed=True))
design_schemas=load('adopted-design-schemas.json')
put('runtime-schemas.json',dict(kind='SOURCE05_CLOSED_RUNTIME_FIELD_CONTRACTS',qualifiedTypedClient=design_schemas['schemas']['qualifiedTypedClient'],selfTextDigest=design_schemas['schemas']['selfTextDigest'],physicalFileWitness=design_schemas['schemas']['physicalFileWitness'],typedActor=dict(fields=list(k['knownPostBaseActors'][0]),knownRows=k['knownPostBaseActors'],strictValidator='protocol.actor_union',completionPending='Only newly recorded external/foreground authors may retain null before separate root completion; unknown must resolve before use; no guessed status',actualEvidence='Evidence path raw SHA checked before parse; current/previous externally pinned N controls may be named without self/future hashes',duplicates='Exact duplicates reconcile; conflicting PID/parent/start/argv/status/provenance HOLD',knownIncompleteNumericallyAbsent=True),rootCompletion=dict(kind='ROOT_OPERATOR_ATTESTATION',closedFields=['kind','unit','controlSha256','roleContractSha256','readonlyBuffer','separatelyCaptured','actors'],actorClosedFields=['pid','ppid','completionKind','actualStatus','toolEvidence'],toolClosedFields=['toolCallId','separateStatusCaptured','actualStatus'],binding='Exact current controlSHA/contractSHA/SAME readonly argv bytes and externalSHA; real separately captured0 after author completed; exact pending PID/parent/provenance set',notDirectWaitPhysicalOrSelfCompletion=True),authorityAllowedFields=k['authorityAllowedFields'],controlAllowedFields=k['controlAllowedFields'],qualifiedJournal='FAILED_RESOURCE_TYPED_CLIENT_JOURNAL_V1 wraps exact closed qualifiedTypedClient plus mode/release/parentIdentity/parentBinaryFingerprintClaimedfalse/typedRoleBinding',allQualifiedResults='Unit.write adds the exact binding of profile/legacyfalse/non-equivalence/contractSHA/threeownerSHAs/code+reviewSHAs; root controls and all local readers require that same binding',runtimeValidators='protocol.py/Unit.validate_root/Unit.require_setup/Unit.clients/Unit.write',actualAuthority=False))
owner_schema=dict(kind='UNIT_SPECIFIC_TYPED_ROLE_TECHNICAL_OWNER_DECISION',owner=None,decision='NOT_ISSUED',authorized=False,unit=k['subject']['label'],pty=k['subject']['pty'],wrapperPid=k['subject']['wrapper']['pid'],shellPid=k['subject']['shell']['pid'],proposal=k['typedRoleContract']['kind'],designManifestSha256=k['typedRoleContract']['designManifestSha256'],code05ManifestSha256=None,code05AriaReviewManifestSha256=None,code05QuinnReviewManifestSha256=None,typedRoleContractSha256=sha(json.dumps(k['typedRoleContract'],sort_keys=True,separators=(',',':'),allow_nan=False).encode()),legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,acceptNarrowResourceOnlyProofSubjectCorrection=False,physicalSevenAndAllActualIdentitySecurityObligationsPreserved=False,unknownUnpreservedInvariant='HOLD_NOT_ISSUED',source09Borrowed=False,C8Waiver=False,actualRuntimeAuthorized=False,nativeCompilerSourceWindowLeaseCleanupCreditAuthority=False)
for who in ('Aria','Quinn','root'):put('owner-ruling-'+who+'.template.json',dict(owner_schema,owner=who))
put('install-map.json',dict(sourceGeneration=5,sourceDirectory=str(H),destination=k['namespace'],outsideDirectory=str(Path(next(iter(k['typedOwnerPaths'].values()))).parent),sourceReviews=[str(T/'resume-architecture/resume2/gateway80-failed-red-resource-code05-exact-review/manifest.json'),str(T/'qa/gateway80-failed-red-resource-code05-exact-review/manifest.json')],ownerPaths=k['typedOwnerPaths'],derivedReadset='Reviewed CLI derives code/loader/complete inputs; factory checks same source/review/owner buffers and all7actual witnesses before pending/attempt/mkdir/write',priorNamespaces=k['priorNamespaces'],priorIndexPins=k['priorIndexPins'],rootMaySupplyMaps=False,actualInstallationAuthorized=False))
put('installer-input-shape.json',dict(sourceGeneration=5,scope='install-scope.template.json',owners='Exact0600 outside actual records, closed schema protocol.owner_expected; inert templates rejected',readset='EXACT_SOURCE05_CONTRACT_REVIEWS_OWNERS_TYPED_METADATA_BOTH_PRIORS_AND_SEVEN_CANONICAL_BINARIES',sourceReviewPinsExternal=True,rootBinaryModesMapsForbidden=True,physicalNFact='Only acquired after exclusive mkdir through retained oldE; same pending draft finalization',partialFailure='Consumed cap/attempt/partial bytes/null unknown identity and refs retained/HOLD, no retry/repair/delete',actualCurrentFacts=False))
put('source-input-loader-role-owning-map.json',dict(sourceGeneration=5,sourceFiles={n:sha((H/n).read_bytes()) for n in runtime+['guard-failed-red.bash','binding-functions.bash','binding-wrapper.bash','install-loader.bash','contract.json']},physicalRoles=k['expectedPhysicalPythonRoles'],selfTextConstraints=k['typedRoleContract']['selfTextConstraints'],selfTextPhysicalRole=False,utilityRoles=k['expectedObservationExecutables'],remainingPhysicalRoles=k['binaryAncestors'],rawSelfReads='Exactly two attributes in System.python; bounded conversion returns only metadata; orig literal independently required',ownerRulings=dict(paths=k['typedOwnerPaths'],validator='protocol.owner_records/owner_expected',firstRead='External raw ownerSHA checked before JSON, before pending/attempt/mkdir',notTemplatesOrPhaseAuthority=True),codeReviewPaths=load('install-map.json')['sourceReviews'],loaders=dict(installer='install-loader SAME verified CLI bytes; CLI same verified source manifest/helper bytes; factory derives all maps/7witnesses',runtime='guard SAME verified entry bytes; entry authority SHA before parse then code SHA before compile; Unit owner/index/external metadata buffers before qualification',binding='Actual readonly SAME variable verify before eval; no producer/reopen/settings change',completion='Parent/operator actual completed status0 -> readonly bounded memory argv+externalSHA -> same rawSHA check before parse -> exact accumulated pending set/PID/parent/provenance -> numeric absence; no writer recursion',finalizers='GUARD/INSTALL_LOADER/DIRECT_RUN/DIRECT_INSTALL_CLI or explicit CALLER tokens; selected cleanup complete before sole emission'),authorityGraph=['code05source and exact independent reviews','three outside actual owner rulings against that exactcode','raw root install scope and approved current directory facts','complete finite input+7physical witness acquisition and PURE preflight','outside pending draft/attempt','exclusive N03 marker/actualopenedfact/same draft finalize','six exactcode+auth0600','SHA-pinned setup/current controls excluding self/future hashes','actual separately captured last-author completion and SAME readonly argv memory attestation','each distinct actual phase/QA/root/final/permit/wrapper/postclose'],actualRuntimeAuthority=False))
put('source-preparation-limitations.json',dict(sourceOnly=True,implementationSourcePrepared=True,exactIndependentCode05ReviewsOwed=True,threeExactNamedOwnerDecisionsOwed=True,currentSource04InstalledN02NegativeConsumedUnqualified=True,currentLegacyPredicateSatisfied=False,newN03AndFR04='PROSPECTIVE_UNOBSERVED_UNCREATED',allActualSixGatesOwed=True,freshSourceNodeOnlyApplicabilityOwed=True,actualLastAuthorCompletionDelivery='UNEXECUTED_UNQUALIFIED',actualPlatformBashPhysicalProcessCompatibility='UNKNOWN',protectedBaselineReads=0,rawSelfReportedPath='UNKNOWN_NEVER_GUESSED_OR_FOLLOWED',actualRuntimeInstallNativeCompilerSourceWindowLeaseCleanupCreditAuthority=False,budgetUsd=500,aggregateSpend='UNKNOWN'))
proof=load('check-results.json');need(proof['failed']==0 and proof['realBoundaryCalls']==[],'FAKE_BATCH_REQUIRED')
for n,h in proof['sourcePins'].items():need(sha((H/n).read_bytes())==h,'CURRENT_FAKE_SOURCE_PIN_'+n)
history=[]
for p in sorted(H.glob('author-*.stderr')):history.append(dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size,stdout=p.with_suffix('.stdout').name if p.with_suffix('.stdout').exists() else None,failed=bool(p.read_bytes())))
put('author-history.json',dict(attempts=history,actualToolCompletions=[dict(batch='initial changed-role/full-flow',assertions=53,launchTool='2e6ac5',completionTool='e1b328',actualExit=0),dict(batch='initial composed outer delivery',assertions=16,launchTool='29b553',completionTool='de2e30',actualExit=0),dict(batch='necessary final closed-client/control schema verification',assertions=62,launchTool='2d1321',completionTool='e4bfdd',actualExit=0),dict(batch='final schema composed outer delivery',assertions=16,launchTool='3b520d',completionTool='d7de9b',actualExit=0)],actualAssertionsAcrossCandidateAndFinalBatches=147,finalSupportedUniqueChecks=proof['passed'],finalBatchComposition='62 affected final-schema/full-flow +16 composed guard/loader. No old313/332 replay.',initial69='Exact snapshot pre-final-schema-check-results.json retains53+16 and original resultSHA. Candidate-flow53-check-results.json reconstructed byte-for-byte only after matching that previously captured whole-resultSHA, from unchanged fixture prefix and deterministic pre-normalization generator repetition; no new test execution or runtime facts.',metadataLabel='The inherited outer harness/result key flow53NotReplayed remains a historical label. The final frozen flow result contains62 checks, not53; final total78 is62+16. Exact run bytes/logs remain unchanged.',allPriorSource04AttemptsRetainedThroughExactAncestorManifest=True,priorResultsNotCurrentRuns=True,currentFakeCheckCount=proof['passed'],currentTargetActions=0))
put('generation-map.json',dict(sourceGeneration=5,generators=['prepare_source05.py','finish_source05.py','seal_source05.py'],subjectDesignManifestSha256='057a1eec581db2f2ace5185d7478815128be9fe94d3fc0d53bec6a7c34465cd9',subjectDesignQaManifestSha256='1fdb6457b8455cfc8ff1fd12fc7aaedd30483cea1bbbe50841685eb6a60dbabd',subjectRootAdoptionSha256='fa8f1fbbd57a8c9f6531ff6f89fca6abe1b2e1417f33e040e530f7798029459c',newProfile=k['typedRoleContract']['kind'],legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,physicalSevenUnchanged=True,ancestor04Current313AndReused19KeepAttribution=True,currentFakeChecks=proof['passed'],noCurrent313Or332Replay=True,actualTargetOperations=0,allActualGatesOwed=True))
(H/'review.md').write_text('''# SOURCE05 author handoff — no QA or operating verdict

Complete inactive typed-role failed-resource successor. Exact fresh bounded self-text
count/SHA replaces only the old reported-canonical memory operand. Legacy false and
non-equivalence are explicit; seven independent physical files and all original
process/source/resource/holder/security predicates remain. Three exact named owner
records are independently raw-SHA pinned and closed-schema consumed before use.

Both immutable N01/N02 and their exact public indices are bound and freshly checked
by separately scoped future readers. All eleven known later actors preserve their
actual status meanings/null unknowns. All prior pinned controls retain dynamic author
history. Finite last-author delivery uses a distinct root/operator readonly SAME
argv attestation only AFTER real separately captured status0; no file author declares
its own completion, no extra writer/probe/direct-wait/physical inference is added.
Missing/conflicting/extra/precompletion facts HOLD. All this delivery and its schema
remain subject to exact independent code05 reviews, owner decisions and actual scopes.

Source04 custody and critical primary/publication/finalizer/mkdir functions retain
literal/AST bindings. Its313 executed and19 reused controls remain historical evidence;
neither is reclassified as current execution. The new bounded fake batch exercises
changed roles/factory/installer/history and closing compositions with every reached
effect fake under the unchanged persistent deny audit. Test and attempt counts are
in manifest/check-results/author-history. No actual native or resource fact is proved.

Read RECIPE05.md, all adopted complete conditions and source-preparation-limitations.
Current SOURCE04 is installed in N02 and its negative consumed/unqualified. N03/FR04
remain prospective; old caps/readonly/history unchanged. No installation, policy,
phase, source-window/lease, compiler/native/main/IR/lifecycle/cleanup/credit authority.
All six actual closure modes and separate independent actual QA/root remain owed.
''')
files=sorted(p for p in H.iterdir() if p.name not in ('manifest.json','SHA256SUMS'))
need(all(p.is_file() and not p.is_symlink() for p in files),'FLAT_PACKET')
(H/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in files));files.append(H/'SHA256SUMS');files.sort()
rows=[dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size,mode=stat.S_IMODE(p.stat().st_mode)) for p in files]
put('manifest.json',dict(kind='SEALED_INACTIVE_GATEWAY_FAILED_RESOURCE_SOURCE05',sourceGeneration=5,files=rows,memberCount=len(rows),manifestSelfExcluded=True,ancestor04ManifestSha256=sha((O/'manifest.json').read_bytes()),profile=k['typedRoleContract']['kind'],legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,installedRuntimePayloadCount=6,physicalUniqueFiles=7,priorNamespaceMemberCounts=[7,8],knownPostBaseActors=11,historicalNumericBase=2255,knownMetadataUnionOnly=2266,futureNumericUnionNeverGuessed=True,currentFakeChecksPassed=proof['passed'],testFailures=0,ancestral313NotReplayed=True,ancestral19NotExecutedHere=True,unchangedFunctionCount=len(unchanged),functionSpanCount=len(functions),reachedInterpretationSiteCount=len(sites),inputClassCount=len(classes),currentRuntimeFrozenPrivateBaselineReads=0,actualTargetOperations=0,executionReady=False,actualOwnerRulingsIssued=False,allActualGatesOwed=True,normalRoute='HARD_HOLD',cleanupOrCredit=False))
print(json.dumps(dict(status='SEALED_SOURCE05',manifestSha256=sha((H/'manifest.json').read_bytes()),payloadMembers=len(rows),currentFakeChecks=proof['passed'],unchangedFunctions=len(unchanged),functions=len(functions),interpretationSites=len(sites),inputClasses=len(classes),actualTargetActions=0,executionReady=False)))

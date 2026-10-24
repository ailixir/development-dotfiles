"""Build off-tree review schemas/examples/source maps. SOURCE/approved PUBLIC inputs only."""
from pathlib import Path
import ast,hashlib,json,re
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
C=json.loads((O/'source-contract.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,obj):
 p=O/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,indent=2)+'\n')
def const(x):return {'const':x}
def enum(xs):return {'type':'string','enum':xs}
def obj(props,required=None):return {'type':'object','properties':props,'required':list(props) if required is None else required,'additionalProperties':False}
integer={'type':'integer','minimum':0,'maximum':9007199254740991};hashfield={'type':'string','pattern':'^[a-f0-9]{64}$'}
link=obj({'name':enum(C['errorNames']+['REDACTED_UNKNOWN']),'code':enum(C['codes']+['REDACTED_UNKNOWN']),'phase':enum(C['runtimePhases']+C['launchPhases']),'loss':enum(C['lossReasons']),'errno':const('REDACTED_UNKNOWN'),'kind':enum(['TARGET_CLOSED','TIMEOUT']),'exitCode':{'type':['integer','null'],'minimum':-999,'maximum':999},'signal':enum(['NONE','REDACTED_UNKNOWN'])},['name'])
link['dependentRequired']={'exitCode':['signal'],'signal':['exitCode']}
link['allOf']=[{'if':{'required':['phase']},'then':{'oneOf':[{'properties':{'name':const('GuidedStartFailure'),'phase':enum(C['runtimePhases'])}},{'properties':{'name':const('GuidedLaunchFailure'),'phase':enum(C['launchPhases'])}}]}},{'if':{'required':['loss']},'then':{'properties':{'name':const('GuidedStartFailure')}}},{'if':{'properties':{'name':const('GuidedLaunchFailure')},'required':['name']},'then':{'required':['phase']}}]
props={'schemaVersion':const(1),'status':const('BOUNDED_EXISTING_EVIDENCE_ONLY_CAUSE_UNPROVEN'),'caseAlias':const('ORDER11_INVOCATION12_SCOPE4_SESSION18'),'warningOrdinalJoin':const('EXACT_WARNING_TO_POST_CLEANUP_SOURCE_SNAPSHOT'),'warningTimestampUtc':const(C['publicFacts']['warningTimestampUtc']),
 'snapshot':obj({'phase':const('AFTER_INNER_CLEANUP_NOT_ASSERTION_ENTRY'),'state':enum(C['snapshotStates']),'errorCode':enum(C['snapshotCodes']),'bootstrapPhase':enum(C['bootstrapPhases']),'materializationPresent':{'type':'boolean'}}),
 'diagnosticCandidate':obj({'operation':const('context'),'elapsedMs':integer,'runtimePhase':enum(C['runtimePhases']),'launchPhase':enum(C['launchPhases']+['UNPROVEN_NOT_RECORDED']),'loss':enum(C['lossReasons']+['UNPROVEN_NOT_RECORDED']),'producerAssociation':const('SOURCE_OWNED_GUIDED_GENERATION_INTERVAL_AT_PUBLIC_WARNING'),'links':{'type':'array','minItems':1,'maxItems':6,'items':link,'prefixItems':[{'allOf':[link,{'properties':{'name':const('GuidedStartFailure'),'code':const('CONTEXT_LOST'),'phase':enum(C['runtimePhases'])},'required':['name','code','phase']}]}]},'workerLineOrdinal':{'type':'integer','minimum':1,'maximum':16777216},'association':const('CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION'),'timestamp':const('UNPROVEN_NOT_RECORDED'),'causeCompleteness':const('UNPROVEN_NOT_RECORDED'),'sourceLinkCapReached':{'type':'boolean'}}),
 'firstStoppingWriter':const('UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE'),'stateChronology':const('UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE'),'assignmentChronology':const('UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD'),'contextDeliveryChronology':const('UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD'),'cause':const('UNPROVEN'),
 'rawCollectorExit':{'type':'integer','minimum':-255,'maximum':255,'not':{'const':0}},'rawGradleExit':{'type':'integer','minimum':-255,'maximum':255,'not':{'const':0}},'rawTaskCollectionComplete':{'type':'boolean'},'rawReceiptSha256':hashfield,'rawOutcomeDisposition':const('WHOLE_RAW_RECEIPT_RETAINED_WITHOUT_WAIVER'),'observationGapSticky':const(True),
 'inputBindings':{'type':'array','minItems':4,'maxItems':4,'items':obj({'role':enum(['default_xml','snapshot_initial18','guided_log','owned_events']),'sha256':hashfield,'bytes':{'type':'integer','minimum':0,'maximum':33554432},'mode':enum(['0o600','0o640','0o644'])})},'privateRawExported':const(False),'nativeOrLaneCredit':const(False)}
schema={'$schema':'https://json-schema.org/draft/2020-12/schema',**obj(props),'$comment':'Executable validate_output additionally enforces exact role-set uniqueness, link cap boolean and source summaries; serialized output capped16KiB. Schema is review documentation; parser has no external dependency.'}
write('output-schema.json',schema)
tree=ast.parse((O/'project_existing.py').read_text());codes=set()
for node in ast.walk(tree):
 if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
  n=1 if node.func.id=='require' else 0 if node.func.id=='Refused' else -1
  if n>=0 and len(node.args)>n and isinstance(node.args[n],ast.Constant) and isinstance(node.args[n].value,str):codes.add(node.args[n].value)
codes.add('MISSING_CHANGED_OR_UNSUPPORTED_INPUT')
write('refusal-schema.json',{'$schema':'https://json-schema.org/draft/2020-12/schema',**obj({'status':const('UNPROVEN_PROJECTION_REFUSED'),'reason':enum(sorted(codes)),'privateRawExported':const(False),'nativeOrLaneCredit':const(False)})})
# These are non-releases, not captured actual private facts.
write('examples/root-authorization.example.json',{'schemaVersion':1,'released':False,'scope':None,'rootApprovalSha256':None,'quinnApprovalSha256':None})
for role in ['ROOT','QUINN']:write('examples/'+role.lower()+'-approval.example.json',{'schemaVersion':1,'role':role,'approved':False,'scopeSha256':None})
write('examples/terminal-proof.example.json',{'schemaVersion':1,'executionLabel':C['executionLabel'],'collectorTerminal':False,'sameStartOwnedJvmTerminal':False,'ownedUnknownTerminal':False,'wholeExecutionClosed':False,'observationGapSticky':True,'authoritativeClosureEvidenceSha256':[],'completedAtUtc':None,'status':'UNPROVEN_NO_CURRENT_RELEASE'})
write('examples/public-assessment.example.json',{'schemaVersion':1,'executionLabel':C['executionLabel'],'wholePublicArchiveFrozen':False,'wholePublicAssessmentComplete':False,'rawFailPreserved':True,'observationGapPreserved':True,'noLaneApproval':True})
write('examples/private-input-manifest.example.json',{'schemaVersion':1,'executionLabel':C['executionLabel'],'root':None,'generation':None,'wrapperSha256':None,'configSha256':None,'files':[]})
paths=['.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-private-projection-prep-'+suffix for suffix in ['intent.txt','context.txt','preflight.json']]+['.codex/skills/aiox-dev/SKILL.md','.aiox-core/development/agents/dev.md']
write('assignment-inputs.json',{'scope':'SOURCE_AND_AUTHORIZED_ASSIGNMENT_ONLY','sha256':{p:sha((R/p).read_bytes()) for p in paths}})
anchors={
 '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py':['def read_xml','receipt["explicitTestTasks"]','receipt["taskCollectionComplete"]','receipt["gradleExit"]'],
 '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py':["'testInputStable'","'sourceStable'"],
 '.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py':["d={'capturedAt'","d['dist']"],
 'studio-runner/src/guided/diagnostics.ts':['export class GuidedStartFailure','const CLOSED_CODE','export function describeStartFailure','export class GuidedDiagnostics'],
 'studio-runner/src/guided/transport.ts':["if(code==='CONTEXT_LOST'"],
 'studio-runner/src/guided/runtime.ts':['export type GuidedStartPhase','get startFailure','private startPhase','private lossReason','private async closeResources','async stop('],
 'studio-runner/src/guided/ownership.ts':['async context(','private async stopEntry'],
 'studio-runner/src/guided/journal.ts':['export class GuidedJournal'],
 'studio-runner/src/guided/contracts.ts':['export function canonical','export function hash'],
 'studio-runner/src/run/guidedBrowser.ts':['export type GuidedLossReason','export type GuidedLaunchPhase','export class GuidedLaunchFailure'],
 'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java':['public JsonNode assignmentLifecycle','public JsonNode lifecycle','public void failTranslation'],
 'backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java':['Guided runner refused'],
 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java':['private static synchronized void ownedProcessEvent','private static void archiveOwnedGeneration','Files.createTempDirectory("obs007-joined-")','"failed-test-state-"','private ObjectNode safeFailureMetadata','private static String safeDiagnosticCode','second explicit learning; logs','guided.redirectErrorStream(true)']}
write('source-map.json',{'meaning':'Source anchors; no runtime/private observation. Whole hashes in source-bindings.json. First-cause/state chronology not established by source.','anchors':{p:{a:[i for i,l in enumerate((R/p).read_text().splitlines(),1) if a in l] for a in aa} for p,aa in anchors.items()}})
print(json.dumps({'reviewArtifacts':'written only assigned off-tree package','actualPrivateReads':0,'schemaRefusalCodes':len(codes)}))

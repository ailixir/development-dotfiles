"""One finite public pin/AST/protocol design batch. No target/model runtime replay."""
import ast,hashlib,json,stat
from pathlib import Path
B=Path('docs/qa/evidence/STUDIO-OBS-011/t0');S=B/'resume-architecture/resume2/gst-style-ordinary-port-integration-design';O=B/'qa/gst-style-ordinary-port-integration-design-review';checks=[];pins=[];cache={}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def bound(p,r):
 p=Path(p);assert '/runtime/' not in str(p) and '..' not in p.parts
 b=p.read_bytes();i=p.lstat();mode=r['mode'];mode=int(mode,0) if isinstance(mode,str) and mode.startswith('0o') else int(mode,8) if isinstance(mode,str) else mode
 check('EXACT_PUBLIC_PIN_'+str(len(pins)),sha(b)==r['sha256'] and len(b)==r['bytes'] and stat.S_IMODE(i.st_mode)==mode and stat.S_ISREG(i.st_mode))
 pins.append({'path':str(p),'sha256':sha(b),'bytes':len(b),'mode':stat.S_IMODE(i.st_mode)});cache[str(p)]=b;return b
p=S/'manifest.json';b=p.read_bytes();m=json.loads(b);check('EXACT_SUBJECT',sha(b)=='ae9ffe100a7229af660f99910f9dfc471104cc90ee95df4c7ab59215345c7533');bound(p,{'sha256':sha(b),'bytes':len(b),'mode':420})
for r in m['files']:bound(S/r['path'],r)
x=json.loads((S/'input-pins.json').read_bytes());count=0
for packet in x['completePackets']:
 p=Path(packet['manifest']['path']);doc=json.loads(bound(p,packet['manifest']));rows=doc.get('files',doc.get('members'));check('COMPLETE_PACKET_'+str(p),len(rows)==packet['payloadCount'] and rows==packet['payloads'])
 for r in rows:bound(p.parent/r['path'],r);count+=1
for r in x['rootMetadata']+[x['savedTask'],x['savedContext']]:bound(Path(r['path']),r)
# The explicit algorithm list is metadata, with exact public paths only.
printkeys=list(x['selectedAlgorithmSources'])
for r in x['selectedAlgorithmSources']:
 if isinstance(r,dict) and {'path','sha256','bytes','mode'}<=set(r):bound(Path(r['path']),r)
check('FIVE241_19',len(x['completePackets'])==5 and count==241 and len(m['files'])==19)
mp=json.loads((S/'method-map.json').read_bytes());caller=json.loads((S/'caller-controls.json').read_bytes());ownership=json.loads((S/'ownership-publication.json').read_bytes());claims=json.loads((S/'claim-map.json').read_bytes());blockers=json.loads((S/'blockers.json').read_bytes());schemas=json.loads((S/'receipt-schemas.json').read_bytes());dag=json.loads((S/'task-dag.json').read_bytes());loader=json.loads((S/'loader-input-map.json').read_bytes());owners=json.loads((S/'owner-rulings.template.json').read_bytes());conditions=json.loads((S/'conditions.json').read_bytes());text=(S/'DESIGN.md').read_text()
P=B/'early/gst-style-isolated-validation-prep/resume3';raw=cache[str(P/'pure_controller.py')].decode();t=ast.parse(raw);actual=[]
for node in ast.walk(t):
 if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Attribute) and isinstance(node.func.value.value,ast.Name) and node.func.value.value.id=='self' and node.func.value.attr=='port':actual.append((node.lineno,node.func.attr,ast.get_source_segment(raw,node)))
actual.sort();mapped=sorted((r['line'],r['portMethod'],r['call']) for r in mp['allActualPortCallSites']);check('ALL33_CALLS_EXACT',actual==mapped and len(actual)==33 and len({r[1] for r in actual})==25)
check('ALL25_METHODS_EXACT',{r['method'] for r in mp['methods']}=={r[1] for r in actual} and len(mp['methods'])==25)
for r in mp['methods']:check('CONCRETE_METHOD_'+r['method'],all(k in r and isinstance(r[k],str) and r[k] for k in ('source03Contract','implementationOwner','concreteProcedure','returnContract','actualEvidence','failure')) and r['currentImplementation']=='NOT_SELECTED_NOT_IMPLEMENTED' and r['requiresSeparateActualScope'] is True)
adapter=ast.parse(cache[str(P/'selected_adapter.py')]);check('SELECTED_ADAPTER_ZERO_PORT',not any(isinstance(n,ast.Attribute) and n.attr=='port' for n in ast.walk(adapter)))
check('FOUR_BLOCKERS_NO_WAIVER',len(blockers['blockers'])==4 and {r['id'] for r in blockers['blockers']}=={'GST-ORDINARY-STRONG-IDENTITY','GST-PUBLICATION-LAST-FALLIBLE','GST-KNOWN-WORK-DRAIN','GST-AFTERALLOW-PHYSICAL-CLOSE'} and blockers['actualAuthority'] is False)
claim=claims['candidate'];check('GST_CANDIDATE_UNADOPTED',claim['protocol']=='GST_LOCAL_BUILD_REPORT_WITH_FINITE_SAMPLED_OBSERVATIONS_V1' and claim['policySelected'] is False and claim['actualAuthority'] is False and all(v is None for v in claim['namedOwnerDecisions'].values()))
check('TEN_FALSE_SIX_NULL',len(claim['guarantees'])==10 and all(v is False for v in claim['guarantees'].values()) and len(claim['unsupportedEvidence'])==6 and all(v['value'] is None and 'GST' in v['reason'] for v in claim['unsupportedEvidence'].values()))
check('REPORT_NOT_RESOURCE_CLOSURE',claim['historicalIdentityUncertainty'] is True and claim['legacyOrdinaryGateSatisfied'] is False and claim['intervalCaptureClaimed'] is False and claim['resourceClosureAccepted'] is False and claim['C8'] is False)
check('NO_SOURCE_GRANT_TRANSFER',mp['source03ApprovalTransfers'] is False and claims['algorithmReuseIsGrantReuse'] is False and claims['GatewayProfileBorrowed'] is False and claims['C8WaiverBorrowed'] is False)
state=ownership['stateOrder'];check('EXACT_COMPLETION_STAGE_ORDER',state==['CAP_CONSUMED','BODY_ACTIVE','BODY_DRAINED','STAGE_PENDING_BYTES_CLOSED','FINAL_SOURCE_OWNED_CLOSED','LOGICALLY_ELIGIBLE','DELIVERY_OBSERVED','OUTER_COMPLETION_OBSERVED','ROOT_OUTCOME_ADOPTED'])
candidate=schemas['candidate'];completion=schemas['completion'];adoption=schemas['externalAdoption']
for name,obj in [('candidate',candidate),('completion',completion),('externalAdoption',adoption)]:check('CLOSED_SCHEMA_'+name,obj['additionalProperties'] is False and set(obj['required'])==set(obj['properties']))
check('NO_ACCEPTED_BIT_PRE_GUARD','accepted' not in candidate['properties'] and candidate['properties']['acceptance']=={'const':'PENDING_EXTERNAL_COMPLETION'} and candidate['properties']['gateAuthority']=={'const':False} and candidate['properties']['resourceClosureAccepted']=={'const':False})
check('LOGICAL_COMPLETION_NOT_PERSISTENCE_AUTHORITY',completion['properties']['physicalPublicationAccepted']==completion['properties']['gateAuthority']=={'const':False} and completion['properties']['claim']['const']==claim)
check('ROOT_ADOPTION_SEPARATE_ACTUAL_OUTER',adoption['properties']['actualSeparateOuterStatus']=={'type':'integer','const':0} and adoption['properties']['scope']=={'const':'ONE_EXACT_GST_LOCAL_REPORT_PHASE_OUTCOME_NOT_WRAPPER_CLOSURE'} and set(('stageRawSha256','completionBufferSha256','actualToolEvidencePin','previousExternalOutcome','exactCodeCallerClaimOwnerPins'))<=set(adoption['required']))
check('OLD_API_BLOCKED',ownership['oldApiDisposition']=='BLOCKED_NO_INFALLIBLE_FILESYSTEM_COMMIT' and 'no successfuloldreturn' in next(r['concreteProcedure'] for r in mp['methods'] if r['method']=='publish_receipt'))
check('ALL_STATE_READER_CHANGES_REQUIRED',all(s in text for s in ('every last/previousReceipt/status/adoption reader','staging all successful phase state transitions','ATTEMPTED_UNKNOWN','root confirmation')))
check('ONE_FINAL_OBSERVER_AFTER_STAGE','after body finish and after all staging operations' in text and 'close every own reader/parent reference' in text and 'There is no second collector' in text)
check('ORIGINAL_CLOCK_ALL_ACTIVE_HISTORY','before the first active admission' in text and 'Append each actually consumed active fact before strict integer' in text and 'never reset on bind/failure/deactivation' in text)
clock=loader['admittedClockBinding'];check('CLOCK_DOMAIN_IS_HARD_MISSING_INPUT',all(clock[k] is None for k in ('actualDomain','existingGetterSourcePin','leaseAndPermitSameDomainProof','crossInvocationAfterAllowHistoryBinding')) and 'HARD_INPUT' in clock['status'])
check('AFTERALLOW_PHYSICAL_TIMING_NOT_WAIVED','If policy requires the physical wrapper exit itself atomically within60s' in text and 'keep the close gate HOLD' in text and 'no final sample proves an unobserved scheduling interval' in (S/'review.md').read_text())
check('DELIVERY_NO_COMMIT_INFERENCE','Fallibleandclockadvancing' in ownership['deliveryZone'] and 'Onlyexactexternallyadoptedpreviousoutcomechain' in ownership['stateRestoration'])
check('FUTURE_CODE_NULL_NO_IMPLEMENTATION',all(r['sha256'] is None and r['actualCreated'] is False for r in loader['proposedFiles']) and m['implementationSelected'] is False and m['policySelected'] is False and caller['rootsObservedOrAllocated'] is False)
check('OWNER_RULINGS_INERT',len(owners['records'])==3 and {r['owner'] for r in owners['records']}=={'Aria','Quinn','root'} and all(r['decision']=='NOT_ISSUED' and r['authorized'] is False and r['newCodeManifestSha256'] is None and r['oldSource03PublicationContractSatisfied'] is False for r in owners['records']))
check('NATIVE_PHASE_CAPS_AND_DEADLINES',len(caller['phaseOperations'])==8 and all(r['cap']==1 for r in caller['phaseOperations']) and {r['phase']:r['nativeDeadlineIncludesSetupFailure'] for r in caller['phaseOperations'] if r['phase'] in ('format','verify','regression')}=={'format':900,'verify':3600,'regression':7200})
check('REPORTS_SAME_BYTES','BytesIO(verifiedbytes)' in next(r['concreteProcedure'] for r in mp['methods'] if r['method']=='verify_regression') and 'both fresh XML' in text and 'five whole classes99PASS0fail/error/skip' in text)
check('ARCHIVE_HARD_MISSING_INPUT',loader['archiveRuntimeContract']['actualGeneratedMemberManifest'] is None and loader['archiveRuntimeContract']['actualCaps'] is None)
nodes={r['id']:r for r in dag['nodes']};check('DAG16_NO_ACTUAL_EXECUTION',len(nodes)==len(dag['nodes'])==16 and dag['actualExecutionAuthorized'] is False)
done=set()
while len(done)<len(nodes):
 nxt={k for k,r in nodes.items() if set(r['requires'])<=done};check('DAG_PROGRESS_'+str(len(done)),bool(nxt-done));done|=nxt
check('GATE_TAIL_DEPENDENCY',nodes['actual_wrapper0']['requires']==['actual_gate_delivery_status_afterallow_guard'] and nodes['outside_postclose0_completion_actual_QA_root']['requires']==['actual_wrapper0'])
spec=json.loads((S/'finite-model-spec.json').read_bytes());a=json.loads((S/'check-attempt01.stdout').read_bytes());check('AUTHOR402_12_ATTRIBUTED',a['passed']==402 and a['failed']==0 and all(r['passed'] for r in a['checks']) and len(spec['cases'])==12 and spec['targetExecuted'] is False)
check('FORMAL_SUCCESS_NOT_ACTUAL_AUTHORITY',all(r['expectedActualAuthority'] is False and r['strictStrongOrAfterAllowStillRequired'] is True for r in spec['cases']))
check('ALL_INHERITED_CONDITIONS_BOUND',conditions['allActualAuthority'] is False and conditions['source09OwnerPolicyBorrowed'] is False and len(conditions['newConditions'])==6)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':'ae9ffe100a7229af660f99910f9dfc471104cc90ee95df4c7ab59215345c7533','pins':pins,'pinRecords':len(pins),'completePublicInputPayloads':241,'currentResourcesRead':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'QUINN_GST_PORT_INTEGRATION_DESIGN_FINITE_CHECKS','checks':len(checks),'results':checks,'pinRecords':len(pins),'completeInputPayloads':241,'portMethods':25,'portCallSites':33,'selectedAdapterPortCalls':0,'attributedAuthorFiniteChecks':402,'attributedDeclarativeCases':12,'targetExecutions':0,'actualRuntimeActions':0,'mandatoryDesignFindings':0,'retainedInvariantBlockers':4},indent=2)+'\n')
(O/'condition-bindings.json').write_text(json.dumps({'sourceConditionPin':{'path':str(S/'conditions.json'),'sha256':sha((S/'conditions.json').read_bytes()),'bytes':len((S/'conditions.json').read_bytes()),'mode':420},'completeInheritedConditions':conditions,'historicalScopesAreNotCurrentAuthority':True},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pinRecords':len(pins),'inputPayloads':241,'portMethods':25,'portCalls':33,'mandatoryDesignFindings':0,'retainedBlockers':4,'targetExecutions':0}))

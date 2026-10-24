"""Finite public-source metadata/AST/DAG/declarative review; no target calls."""
import ast
import hashlib
import json
from pathlib import Path
import stat

B=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
S=B/'early/gst-style-isolated-validation-prep/resume3'
O=B/'resume-architecture/resume2/gst-style-ordinary-port-integration-design'
checks=[]
def check(name, value):
    checks.append({'id':name,'passed':bool(value)})
    if not value:raise AssertionError(name)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def load(path):return json.loads(path.read_bytes())
pins=load(O/'input-pins.json')
for packet in pins['completePackets']:
    reference=packet['manifest'];p=Path(reference['path']);raw=p.read_bytes()
    check('MANIFEST-'+str(p),sha(raw)==reference['sha256'] and len(raw)==reference['bytes'])
    rows=packet['payloads']
    check('COUNT-'+str(p),len(rows)==packet['payloadCount'] and len({r['path'] for r in rows})==len(rows))
    for r in rows:
        q=p.parent/r['path'];b=q.read_bytes()
        check('PAYLOAD-'+str(q),sha(b)==r['sha256'] and len(b)==r['bytes'] and stat.S_IMODE(q.stat().st_mode)==r['mode'])
        if q.suffix=='.json':json.loads(b)
    check('MEMBERSHIP-'+str(p),{str(q.relative_to(p.parent)) for q in p.parent.rglob('*') if q.is_file()}=={r['path'] for r in rows}|{'manifest.json'})
for reference in pins['rootMetadata']+[pins['savedTask'],pins['savedContext']]+pins['selectedAlgorithmSources']:
    p=Path(reference['path']);raw=p.read_bytes()
    check('EXACT-PUBLIC-PIN-'+str(p),sha(raw)==reference['sha256'] and len(raw)==reference['bytes'] and stat.S_IMODE(p.stat().st_mode)==reference['mode'])
    if p.suffix=='.py':
        ast.parse(raw)
        check('ALGORITHM-AST-'+p.name,True)
port=load(S/'port-contract.json');methods=load(O/'method-map.json');mapping={r['method']:r for r in methods['methods']}
check('ALL25-METHODS',len(mapping)==len(methods['methods'])==methods['methodCount']==25 and set(mapping)==set(port['methods']))
for name,r in mapping.items():
    check('CONCRETE-METHOD-'+name,r['source03Contract']==port['methods'][name] and all(type(r[k])is str and len(r[k])>10 for k in ['implementationOwner','concreteProcedure','returnContract','actualEvidence','failure']) and r['currentImplementation']=='NOT_SELECTED_NOT_IMPLEMENTED' and r['requiresSeparateActualScope'] is True)
calls=[]
for filename in ['pure_controller.py','selected_adapter.py']:
    t=ast.parse((S/filename).read_bytes());parents={c:n for n in ast.walk(t) for c in ast.iter_child_nodes(n)}
    for n in ast.walk(t):
        if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Attribute) and isinstance(n.func.value.value,ast.Name) and n.func.value.value.id=='self' and n.func.value.attr=='port':
            parent=n
            while parent in parents and not isinstance(parent,ast.FunctionDef):parent=parents[parent]
            calls.append({'file':filename,'line':n.lineno,'controllerMethod':parent.name,'portMethod':n.func.attr,'call':ast.unparse(n)})
check('ALL33-PORT-CALL-SITES',methods['allActualPortCallSites']==sorted(calls,key=lambda r:(r['file'],r['line'])) and len(calls)==methods['portCallSiteCount']==33)
for name,r in mapping.items():
    check('METHOD-CALL-BINDING-'+name,r['callSites']==sorted([x for x in calls if x['portMethod']==name],key=lambda x:x['line']))
check('SELECTED-ADAPTER-NO-PORT-CALLS',methods['selectedAdapter']['actualPortCalls']==0 and not [r for r in calls if r['file']=='selected_adapter.py'])
check('EXPLICIT-OLD-PUBLICATION-BLOCKED',mapping['publish_receipt']['returnContract']=='BLOCKED_OLD_RAW_SHA_AFTER_ATOMIC_COMMIT' and 'stage_receipt' in mapping['publish_receipt']['concreteProcedure'])
check('EXPLICIT-STRONG-ORDINARY-BLOCKED',mapping['verify_ordinary_ownership']['returnContract']=='BLOCKED_STRICT_ORDINARY_HOLD' and mapping['admission']['returnContract']=='STRICT_OLD_SCHEMA_BLOCKED_BY_STRONG_OWNERSHIP')
claimmap=load(O/'claim-map.json');claim=claimmap['candidate'];sourceclaim=load(B/'early/gateway80-proof-prep/resume9/claim.schema.json')
check('DISTINCT-GST-NOT-GATEWAY-OR-C8',claim['protocol']=='GST_LOCAL_BUILD_REPORT_WITH_FINITE_SAMPLED_OBSERVATIONS_V1' and claim['protocol']!=sourceclaim['properties']['protocol']['const'] and claimmap['GatewayProfileBorrowed'] is False and claimmap['C8WaiverBorrowed'] is False)
check('EXACT-TEN-FALSE',set(claim['guarantees'])==set(sourceclaim['properties']['guarantees']['properties']) and len(claim['guarantees'])==10 and all(v is False for v in claim['guarantees'].values()))
check('EXACT-SIX-NULL-GST-REASONS',set(claim['unsupportedEvidence'])==set(sourceclaim['properties']['unsupportedEvidence']['properties']) and len(claim['unsupportedEvidence'])==6 and all(v=={'value':None,'reason':'NOT_PROVED_BY_GST_LOCAL_BUILD_REPORT_CONTRACT'} for v in claim['unsupportedEvidence'].values()))
check('HISTORY-LEGACY-INTERVAL',claim['historicalIdentityUncertainty'] is True and claim['legacyOrdinaryGateSatisfied'] is False and claim['intervalCaptureClaimed'] is False and claim['resourceClosureAccepted'] is False)
check('NO-POLICY-ACTUAL-AUTHORITY',claim['policySelected'] is False and claim['actualAuthority'] is False and all(v is None for v in claim['namedOwnerDecisions'].values()))
model=load(O/'ownership-publication.json');order=model['stateOrder']
check('STAGE-BEFORE-FINAL-SOURCE-GUARD',order.index('BODY_DRAINED')<order.index('STAGE_PENDING_BYTES_CLOSED')<order.index('FINAL_SOURCE_OWNED_CLOSED')<order.index('LOGICALLY_ELIGIBLE')<order.index('DELIVERY_OBSERVED')<order.index('OUTER_COMPLETION_OBSERVED')<order.index('ROOT_OUTCOME_ADOPTED'))
check('PERSISTENT-CANDIDATE-NO-ACCEPTED-AUTHORITY',model['persistentCandidate']['acceptedFieldAllowed'] is False and model['persistentCandidate']['gateAuthority'] is False and model['persistentCandidate']['resourceClosureAccepted'] is False and model['persistentCandidate']['acceptance']=='PENDING_EXTERNAL_COMPLETION')
check('SIX-EXPLICIT-OWNERS',len(model['resourceOwners'])==6 and all(r.get('unknown') for r in model['resourceOwners']))
check('COMPOUND-EXTERNAL-OUTCOME',model['externalOutcomeIdentity']==['stageRawSha256','completionBufferSha256','actualOuterStatusEvidencePin','rootOutcomeAdoptionSha256'])
check('NO-SOURCE03-APPROVAL-TRANSFER',methods['source03ApprovalTransfers'] is False)
blockers=load(O/'blockers.json')
check('ALL4-REAL-BLOCKERS',{r['id'] for r in blockers['blockers']}=={'GST-ORDINARY-STRONG-IDENTITY','GST-PUBLICATION-LAST-FALLIBLE','GST-KNOWN-WORK-DRAIN','GST-AFTERALLOW-PHYSICAL-CLOSE'})
dag=load(O/'task-dag.json');nodes={r['id']:r['requires'] for r in dag['nodes']};visited=set();active=set()
def visit(n):
    check('DAG-DECLARED-'+n,n in nodes)
    if n in active:raise AssertionError('DAG-CYCLE')
    if n in visited:return
    active.add(n)
    for p in nodes[n]:visit(p)
    active.remove(n);visited.add(n)
for n in nodes:visit(n)
check('DAG-ACYCLIC-COMPLETE16',len(visited)==16 and dag['actualExecutionAuthorized'] is False)
check('FAILED-GATEWAY-BEFORE-HEAVY','prior_gateway_failed_close' in nodes['new_unit_actual_scope_H_negative_held'])
caller=load(O/'caller-controls.json');phases={r['phase']:r for r in caller['phaseOperations']}
plan=load(S/'unit-plan.json')
check('EXACT8-PHASES',set(phases)=={'prepare','format','verify','regression','archive','final','gate','postclose'} and all(r['cap']==1 for r in phases.values()))
for name,seconds in [('format',900),('verify',3600),('regression',7200)]:
    check('EXACT-NATIVE-SPEC-'+name,phases[name]['spec']==next(r for r in plan['phases'] if r['id']==name) and phases[name]['nativeDeadlineIncludesSetupFailure']==seconds)
check('EXACT-ROOTS-ENV',caller['roots']==plan['roots'] and caller['environment']==plan['nativeEnvironment'] and caller['rootsObservedOrAllocated'] is False)
check('SOURCE2092-MODES284',len(plan['finiteCopy']['members'])==2092 and sum(r['mode'] is None for r in plan['finiteCopy']['members'])==284 and sum(r['origin']=='SOURCE1808' for r in plan['finiteCopy']['members'])==1808)
check('THREE-OVERLAYS-FOUR-PROPERTIES',len(plan['overlay'])==3 and len((S/'owned-gradle.properties').read_text().strip().splitlines())==4)
owners=load(O/'owner-rulings.template.json')
check('THREE-INERT-NAMED-GST-OWNERS',{r['owner'] for r in owners['records']}=={'Aria','Quinn','root'} and all(r['decision']=='NOT_ISSUED' and r['authorized'] is False and r['gstLocalBuildReportSubjectAdopted'] is False and r['strongOrdinaryPredicateSatisfied'] is False and r['source03ApprovalTransfers'] is False and r['actualOperationAuthority'] is False and r['claim']==claim for r in owners['records']))
schema=load(O/'receipt-schemas.json')
for name in ['candidate','completion','externalAdoption']:
    r=schema[name];check('CLOSED-NEW-SCHEMA-'+name,r['additionalProperties'] is False and set(r['required'])==set(r['properties']))
check('COMPLETION-NOT-PHYSICAL-PUBLICATION',schema['completion']['properties']['physicalPublicationAccepted']=={'const':False} and schema['completion']['properties']['gateAuthority']=={'const':False})
loader=load(O/'loader-input-map.json')
check('CONCRETE14-PROSPECTIVE-FILES',len(loader['proposedFiles'])==14 and all(r['sha256'] is None and r['actualCreated'] is False for r in loader['proposedFiles']) and loader['noActualPathsObservedOrAllocated'] is True)
check('NO-INVENTED-CLOCK-DOMAIN',loader['admittedClockBinding']['actualDomain'] is None and loader['admittedClockBinding']['existingGetterSourcePin'] is None)
check('NO-INVENTED-ARCHIVE-CONTRACT',loader['archiveRuntimeContract']['actualGeneratedMemberManifest'] is None and loader['archiveRuntimeContract']['actualCaps'] is None)
spec=load(O/'finite-model-spec.json')
for row in spec['cases']:
    f=row['syntheticFields']
    logical=all(f[k] is True for k in ['bodyDrained','stageClosed','finalSourceClosed','originalGuard','stagedTransitionQualified'])
    external=logical and all(f[k] is True for k in ['delivery','outer0','rootAdoption'])
    check('DECLARATIVE-'+row['case'],logical is row['expectedLogicalEligible'] and external is row['expectedSyntheticExternalOutcome'] and row['expectedActualAuthority'] is False)
check('12-DECLARATIVE-CASES-NO-TARGET',len(spec['cases'])==12 and spec['targetExecuted'] is False)
conditions=load(O/'conditions.json');root=load(B/'resume2-gst-isolated-source03-exact-protocol-root-adoption.json')
check('ROOT-B99C-COMPLETE-CONDITIONS',conditions['rootSource03FullAdoption']==root and conditions['source03CompletePriorConditionCarrier']==load(B/'qa/gst-style-isolated-validation-source03-exact-review/complete-adopted-conditions.json'))
check('CURRENT-PORT-CONTRACT-COMPLETE',conditions['source03PortContractFull']==port)
check('NO-ACTUAL-RESEARCH-EXECUTION',conditions['allActualAuthority'] is False and pins['sourceFunctionsExecuted'] is False and pins['currentResourceReads'] is False and pins['oldWholeTestSuitesReplayed'] is False and claimmap['newProviderResearchSelected'] is False)
print(json.dumps({'kind':'GST_ORDINARY_PORT_INTEGRATION_DESIGN_FINITE_CHECKS','passed':len(checks),'failed':0,'checks':checks,'mappedPortMethods':25,'mappedPortCalls':33,'declarativeCases':12,'targetFunctionsExecuted':0,'actualRuntimeActions':0,'old84And27OrHugeSuitesReplayed':False,'implementationSelected':False,'policySelected':False},indent=2))

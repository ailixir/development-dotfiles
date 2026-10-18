"""Independent ARCH015-02 synthetic graph facets, not app/authentication evidence."""
import copy
import datetime
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
BASE=HERE.parent
ROOT=BASE.parents[5]
read=lambda p:json.loads(Path(p).read_text())
canon=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
h=lambda x:hashlib.sha256(canon(x).encode()).hexdigest()
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
fixture=read(BASE/'fixtures.json')
checks=[]

def require(ok,why):
    if not ok:raise ValueError(why)

def unique(rows,key):
    result={key(x):x for x in rows}
    require(len(result)==len(rows),'duplicate identity')
    return result

def argument(op):return op.get('expected')if op['kind']=='assert'else op.get('value')
def slot(op):return op['kind']+('.expected'if op['kind']=='assert'else'.value')
def pair(c):return(c['stepId'],c['argumentSlot'])

def project(f,history):
    before=canon(f)
    raw=unique(f['rawAllocations'],lambda a:a['bindingId'])
    producers=unique(f['rawProducers'],lambda p:p['bindingId'])
    effective=unique(f['effectiveActions'],lambda a:a['admissionId'])
    unique(f['effectiveActions'],lambda a:canon(a['coordinate']))
    needs=unique(f['finalNeeds'],lambda n:n['bindingId'])
    require(f['bootstrap']['allocationHash']==h(f['rawAllocations']),'raw allocation hash retained')
    switch=f['switch'];receipt=f['driftReceipt'];acceptance=f['firstSuffixAcceptance']
    require(switch['reason']=='DRIFT'and acceptance is not None,'committed unique first suffix authority')
    require(receipt['nativeInvocationStarted']is False and receipt['attemptOrdinal']==0 and receipt['reason']in('TARGET_DRIFT','LOCATOR_AMBIGUOUS','STALE_GENERATION'),'positive no-native only')
    require(receipt['sessionId']==acceptance['sessionId']==f['sessionId'],'session scope')
    require(receipt['requestDigest']==h(f['prefixRequest'])and receipt['coordinate']==f['prefixRequest']['coordinate'],'original issued request')
    require(receipt['receiptHash']==h({k:v for k,v in receipt.items()if k!='receiptHash'})==switch['driftReceiptHash'],'receipt integrity is not authentication')
    require(acceptance['retainedPrefixAdmissionIds']==switch['retainedPrefixAdmissionIds'],'retained admissions exact')
    require(acceptance['previousPlanRevision']+1==acceptance['planRevision']<=f['translationRevision'],'first suffix revisions')
    require(len(f['excludedAttempts'])<=1,'sole excluded attempt')
    spent=None
    if receipt['phase']=='PRE_ADMISSION':
        require(not f['excludedAttempts']and receipt['admissionId']is None and receipt['preparationId']is None,'pre-admission has no spent action or edge')
    else:
        require(receipt['phase']=='ADMITTED_PRE_INVOCATION'and len(f['excludedAttempts'])==1,'admitted original exclusion')
        excluded=f['excludedAttempts'][0];spent=excluded['action'];prep=excluded['preparation'];assoc=excluded['obligationAssociation']
        require(spent['admissionId']==receipt['admissionId']and spent['coordinate']==receipt['coordinate']and spent['operationHash']==receipt['operationHash'],'spent original identity')
        require((spent['state'],spent['outcomeCode'],spent['dispatchCount'],spent['attemptOrdinal'])==('FAILED','TARGET_CHANGED',1,0),'only positively uninvoked spent failure')
        require(prep['preparationId']==receipt['preparationId']and prep['coordinate']==spent['coordinate']and prep['operationHash']==spent['operationHash']and prep['requestDigest']==receipt['requestDigest'],'original prep facet joins')
        require(assoc['admissionId']==spent['admissionId']and assoc['coordinate']==spent['coordinate']and assoc['attemptOrdinal']==0,'original attempt association')
        require(all(prep[k]==receipt[k]for k in('workerId','ownerFence','contextId','contextRevision','authoredInputsHash')),'exact historical prep identity')
    position=lambda c:(f['sourceStepIds'].index(c['stepId']),c['ordinal'])
    boundary=(switch['effectiveStepIndex'],switch['nextSemanticOrdinal'])
    imports={}
    for binding in f['baseBindings']:
        reads=[a for a in f['program']['actions']if a['operation']['kind']=='read'and a['operation']['bindingId']==binding['bindingId']and a['coordinate']==binding['producer']]
        if not reads:continue
        imported_pairs=set()
        for edge in binding['consumers']:
            if edge['coordinate']['stepId']not in f['program']['sourceStepIds']:continue
            if any(a['coordinate']==edge['coordinate']and(argument(a['operation'])or{}).get('kind')=='binding'and argument(a['operation']).get('bindingId')==binding['bindingId']and slot(a['operation'])==edge['argumentSlot']for a in f['program']['actions']):
                imported_pairs.add((edge['coordinate']['stepId'],edge['argumentSlot']))
        imports[binding['bindingId']]={'binding':binding,'read':reads[0],'pairs':imported_pairs}
    # This sidecar is deliberately backend-only. It is NOT an asserted wire basis field.
    history_by_revision=unique(history,lambda p:p['revision'])
    old=history_by_revision[acceptance['previousPlanRevision']];first=history_by_revision[acceptance['planRevision']]
    require(first['parent']==old['revision'],'exact immutable first parent')
    require(set(old['successMeanings'])<=set(first['successMeanings']),'no successful meaning lost at first suffix')
    for revision in sorted(r for r in history_by_revision if r>first['revision']):
        row=history_by_revision[revision];parent=history_by_revision[row['parent']]
        require(row['revision']==parent['revision']+1,'later parent chain')
        # Preserve all prior meanings, including ones not yet executed at the previous head.
        require(set(parent['successMeanings']+parent['unperformedMeanings'])<=set(row['successMeanings']+row['unperformedMeanings']),'later ordinary obligation disappeared')
        for n in parent['needs']:
            next_need=next((x for x in row['needs']if x['needId']==n['needId']),None)
            require(next_need is not None and next_need['bindingId']==n['bindingId']and next_need['producerStepId']==n['producerStepId'],'later need identity')
            require(set(map(pair,n['consumers']))<=set(map(pair,next_need['consumers'])),'later consumer shedding refused')
    head=history_by_revision[f['translationRevision']]
    require(head['needs']==f['finalNeeds'],'exact audited final head')
    require(set(effective)<=set(head['successMeanings']),'head conserves successful admission meanings')
    live=[];excluded_edges=[];edge_ids=set()
    for edge in f['rawConsumerEdges']:
        identity=(edge['consumerAdmissionId'],edge['argumentSlot']);require(identity not in edge_ids,'edge unique by admission and slot');edge_ids.add(identity)
        consumer=effective.get(edge['consumerAdmissionId'])
        excluded_consumer=spent if spent is not None and spent['admissionId']==edge['consumerAdmissionId']else None
        require(consumer is not None or excluded_consumer is not None,'every raw edge accounted')
        action=consumer or excluded_consumer;prod=producers.get(edge['bindingId']);arg=argument(action['operation'])
        require(prod is not None and edge['producerAdmissionId']==prod['producerAdmissionId'],'exact raw producer')
        require(arg is not None and arg.get('kind')=='binding'and arg.get('bindingId')==edge['bindingId']and slot(action['operation'])==edge['argumentSlot'],'exact binding and slot')
        require(edge['coordinate']==action['coordinate']and edge['destinationOrigin']==action['origin']==prod['origin'],'exact coordinate and origin')
        require(position(prod['coordinate'])<position(edge['coordinate']),'producer before consumer')
        (live if consumer is not None else excluded_edges).append(edge)
    for action in effective.values():
        require(action['state']=='SUCCEEDED'and action['dispatchCount']==1,'effective action actual success')
        arg=argument(action['operation'])
        if arg and arg.get('kind')=='binding':require(sum(e['consumerAdmissionId']==action['admissionId']and e['bindingId']==arg['bindingId']for e in live)==1,'successful use edge bijection')
        if action['operation']['kind']=='read':require(producers.get(action['operation']['bindingId'],{}).get('producerAdmissionId')==action['admissionId'],'all successful reads retained')
    bindings=[];stable=[]
    for binding_id,prod in producers.items():
        action=effective.get(prod['producerAdmissionId']);allocation=raw.get(binding_id);need=needs.get(binding_id)
        require(action is not None and action['operation']['kind']=='read'and action['operation']['bindingId']==binding_id and action['coordinate']==prod['coordinate']and action['operation']['recipe']==prod['recipe']and action['origin']==prod['origin'],'producer all actual joins')
        require(prod['availability']=={'bindingId':binding_id,'producerAdmissionId':prod['producerAdmissionId'],'contextId':receipt['contextId'],'workerId':receipt['workerId'],'ownerFence':receipt['ownerFence']},'producer historical availability facet')
        require(allocation is not None and need is not None and need['needId']==allocation['needId']and need['producerStepId']==allocation['producerStepId']==prod['coordinate']['stepId'],'exact need/raw identity')
        edges=[e for e in live if e['bindingId']==binding_id];uses={(e['coordinate']['stepId'],e['argumentSlot'])for e in edges};final_pairs=list(map(pair,need['consumers']))
        require(len(final_pairs)==len(set(final_pairs))and set(final_pairs)==uses,'exact successful coarse consumer pairs')
        raw_pairs=set(map(pair,allocation['consumers']));require(uses<=raw_pairs,'successful use was raw allocated')
        imported=imports.get(binding_id)
        for missing in raw_pairs-uses:
            require(imported is not None and missing in imported['pairs']and f['sourceStepIds'].index(missing[0])>=boundary[0],'only proven prefix import can be removed')
        if not edges:require(imported is not None and prod['producerAdmissionId']in switch['retainedPrefixAdmissionIds'],'zero-consumer only retained successful imported read')
        binding={'schemaVersion':3,'bindingId':binding_id,'valueType':'string','producer':prod['coordinate'],'recipe':prod['recipe'],'sourceOrigin':prod['origin'],'consumers':edges,'provenance':{'sessionId':f['sessionId'],'producerAdmissionId':prod['producerAdmissionId'],'sourceIntentStepId':allocation['producerStepId']},'transferPolicy':'sameOrigin','preserveBytes':True}
        if imported is not None and prod['producerAdmissionId']in switch['retainedPrefixAdmissionIds']:
            def projected(value):
                v=copy.deepcopy(value);del v['consumers'];del v['provenance']['sessionId'];del v['provenance']['producerAdmissionId'];return v
            require(h(projected(binding))==h(projected(imported['binding'])),'producer semantic projection remains stable')
            stable.append(binding_id)
        bindings.append(binding)
    require(len(bindings)==len(needs),'final needs exactly actual successful producers')
    for binding_id,allocation in raw.items():
        if binding_id in producers:continue
        imported=imports.get(binding_id)
        require(imported is not None and position(imported['read']['coordinate'])>=boundary,'never-produced raw allocation imported after boundary')
        require(binding_id not in needs and not any(e['bindingId']==binding_id for e in f['rawConsumerEdges']),'no hidden consumer edge or executable orphan')
        require(all(pair(c)in imported['pairs']for c in allocation['consumers']),'no model-only stale intent')
    require(canon(f)==before,'raw inputs byte-for-byte unchanged')
    return{'bindingIds':[b['bindingId']for b in bindings],'consumerAdmissions':[e['consumerAdmissionId']for e in live],'excludedEdges':len(excluded_edges),'stableProducerSemanticHashes':stable,'rawAllocationHash':h(f['rawAllocations']),'effectiveAllocationHash':h([{**raw[b['bindingId']],'consumers':needs[b['bindingId']]['consumers']}for b in bindings]),'rawEdgeHash':h(f['rawConsumerEdges'])}

def case(name,facet,history,reject=False,expected=None):
    try:
        result=project(facet,history)
        if expected:require(result['bindingIds']==expected['expectedBindings']and result['consumerAdmissions']==expected['expectedConsumerAdmissions'],'expected exact graph')
        checks.append({'name':name,'ok':not reject,'expected':'REJECT'if reject else'ACCEPT','result':result})
    except (ValueError,KeyError,TypeError,StopIteration,IndexError)as error:
        checks.append({'name':name,'ok':reject,'expected':'REJECT'if reject else'ACCEPT','reason':str(error)})
for c in fixture['positives']:case(c['name'],c['facet'],c['backendPlanHistory'],expected=c)
for c in fixture['negatives']:case(c['name'],c['facet'],c['backendPlanHistory'],True)
sample=fixture['positives'][0]
for name,mutate in [('wrong-edge-origin',lambda f:f['rawConsumerEdges'][0].update(destinationOrigin='https://other.example.test')),('unaccounted-pending-edge',lambda f:f['rawConsumerEdges'][0].update(consumerAdmissionId='pending-unknown')),('second-excluded-spent-attempt',lambda f:f['excludedAttempts'].append(copy.deepcopy(f['excludedAttempts'][0]))),('different-historical-owner-fence',lambda f:f['excludedAttempts'][0]['preparation'].update(ownerFence=99)),('producer-availability-wrong-context',lambda f:f['rawProducers'][0]['availability'].update(contextId='other-context'))]:
    f=copy.deepcopy(sample['facet']);mutate(f);case(name,f,sample['backendPlanHistory'],True)
history=copy.deepcopy(sample['backendPlanHistory']);history[1]['unperformedMeanings'].append('unperformed-model-obligation')
case('later-unperformed-obligation-cannot-disappear',sample['facet'],history,True)
manifest=read(BASE/'manifest.json');require(sha(BASE/'manifest.json')=='879aaa09344878f846b34dc4d1c98c8d117c2fd51e27ffe445d505e16dbb838a','exact delegated manifest')
file_checks=[{'file':f,'expected':v,'actual':sha(BASE/f),'ok':sha(BASE/f)==v}for f,v in manifest['files'].items()]
historical=[]
for file,info in manifest['preservedManifests'].items():
    p=ROOT/file;prior=read(p);require(sha(p)==info['sha256'],'preserved prior manifest exact')
    for f,v in prior['files'].items():
        source=ROOT/f if f.startswith('docs/')else p.parent/f
        historical.append({'file':str(source.relative_to(ROOT)),'ok':sha(source)==v})
receipt=read(BASE/'completion-receipt.json');sources=[{'file':f,'captured':v,'observed':sha(ROOT/f),'unchanged':sha(ROOT/f)==v}for f,v in receipt['sourceSnapshots'].items()]
result={'classification':'INDEPENDENT_ISOLATED_SYNTHETIC_PROJECTION_DESIGN_ONLY','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':sha(BASE/'manifest.json'),'boundFiles':file_checks,'preservedHistoricalFiles':historical,'diagnosticSourceSnapshots':sources,'checks':checks,'errors':[c for c in checks if not c['ok']]+[c for c in file_checks+historical if not c['ok']],'applicationTestsExecuted':0,'databaseCommandsExecuted':0,'browserCommandsExecuted':0,'buildsExecuted':0,'limits':'Facets assume core basis/import/receipt authority prevalidation. Sidecar history is backend DB-only proof obligation, never a new wire field or actual authentication/native evidence.'}
result['status']='FAIL'if result['errors']else'PASS';(HERE/'independent-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'cases':len(checks),'boundFiles':len(file_checks),'preservedHistoricalFiles':len(historical),'sourceDrift':[c['file']for c in sources if not c['unchanged']],'errors':result['errors']},indent=2));raise SystemExit(bool(result['errors']))

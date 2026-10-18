"""Independent bounded synthetic correction audit; no application or service imports."""
import copy
import datetime
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = BASE.parents[5]
read = lambda p: json.loads(Path(p).read_text())
canonical = lambda x: json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
h = lambda x: hashlib.sha256(canonical(x).encode('utf-8')).hexdigest()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
fixture = read(BASE / 'fixtures.json')
schema_results = read(HERE / 'schema-results.json')
schema_validity = {x['name']: x['schemaValid'] for x in schema_results['cases']}
checks = []


def require(ok, name):
    if not ok:
        raise ValueError(name)


def refs(identity, context, text=''):
    declared = identity['authoredDeclarations']
    names = {d['referenceId']: d for d in declared}
    require(len(names) == len(declared), 'duplicate declaration')
    require(list(names) == sorted(names, key=lambda s: s.encode()), 'UTF8 declaration order')
    direct = {}
    for d in declared:
        if d['kind'] == 'secretRef':
            entry = {**d, 'referenceId': d['secretId']}
            require(d['secretId'] not in direct or direct[d['secretId']] == entry, 'secret alias conflict')
            direct[d['secretId']] = entry
            named = names.get(d['secretId'])
            require(named is None or named == entry, 'direct/name ambiguity')
    used = {}

    def add(d, kind):
        require(d is not None and d['kind'] == kind, 'missing or wrong-kind reference')
        require(d['referenceId'] not in used or used[d['referenceId']] == d, 'ambiguous scope reference')
        used[d['referenceId']] = d

    for e in context['entries']:
        r = e['value'] if e['kind'] == 'default' else e
        if r['kind'] in ('variableRef', 'secretRef'):
            add(names.get(r['referenceId']), 'plain' if r['kind'] == 'variableRef' else 'secretRef')
    for kind, key in re.findall(r'<(var|secret)\s+([A-Za-z0-9_.-]{1,64})>', text):
        add(names.get(key) if kind == 'var' else direct.get(key), 'plain' if kind == 'var' else 'secretRef')
    return [used[k] for k in sorted(used, key=lambda s: s.encode())]


def derive_graph(b):
    order = {s['stepId']: i for i, s in enumerate(b['sourceSteps'])}
    preps = {p['preparationId']: p for p in b['preparations']}
    actions = []
    for fact in sorted(b['actions'], key=lambda f: (order[f['ledger']['coordinate']['stepId']], f['ledger']['coordinate']['ordinal'])):
        l = fact['ledger']; p = preps[fact['preparationId']]['proposal']
        require(l['state'] == 'SUCCEEDED' and l['dispatchCount'] == 1, 'effective success')
        shape = {'coordinate': l['coordinate'], 'origin': p['executionEvidence']['origin'],
                 'locator': p['target'].get('locator'), 'operation': p['operation']}
        require(h(shape) == l['operationHash'], 'operation independently hashed')
        actions.append({**shape, 'admissionId': l['admission']['admissionId'], 'operationHash': h(shape)})
    bindings = []
    for p in b['producers']:
        producer = next(a for a in actions if a['admissionId'] == p['producerAdmissionId'])
        require(producer['coordinate'] == p['coordinate'] and producer['operation']['kind'] == 'read', 'actual producer')
        edges = sorted([e for e in b['consumerEdges'] if e['bindingId'] == p['bindingId']],
                       key=lambda e: (order[e['coordinate']['stepId']], e['coordinate']['ordinal'], e['argumentSlot'].encode(), e['bindingId'].encode()))
        for e in edges:
            require(any(a['admissionId'] == e['consumerAdmissionId'] and a['coordinate'] == e['coordinate'] for a in actions), 'actual consumer')
        bindings.append({'schemaVersion': 3, 'bindingId': p['bindingId'], 'valueType': 'string', 'producer': p['coordinate'],
                         'recipe': p['recipe'], 'sourceOrigin': p['origin'], 'consumers': edges,
                         'provenance': {'sessionId': b['sessionId'], 'producerAdmissionId': p['producerAdmissionId'], 'sourceIntentStepId': p['coordinate']['stepId']},
                         'transferPolicy': 'sameOrigin', 'preserveBytes': True})
    bindings.sort(key=lambda p: (order[p['producer']['stepId']], p['producer']['ordinal'], p['bindingId'].encode()))
    require(bindings == b['bindings'], 'bindings reconstructed from actual producer/consumer facts')
    return {'actions': actions, 'bindings': bindings}


def snapshots(identity, config, graph):
    a = identity['authoring']; used = {}
    global_refs = refs(identity, a['globalContext'])
    used.update((d['referenceId'], d) for d in global_refs)
    test_config = {'domain': 'studio.test-config', 'version': 1,
                   **{k: config[k] for k in ('environment', 'browser', 'viewport', 'timeoutSeconds', 'waitStrategy')},
                   'globalContextHash': h(a['globalContext']), 'globalReferences': global_refs}
    previous = h(test_config); result = {}; rows = []
    require(len({s['id'] for s in a['steps']}) == len(a['steps']), 'unique source IDs')
    for s in a['steps']:
        declarations = refs(identity, s['context'], s['text']); used.update((d['referenceId'], d) for d in declarations)
        inp = {'domain': 'studio.step-input', 'version': 1, 'stepId': s['id'], 'text': s['text'], 'context': s['context'], 'references': declarations}
        chain = {'domain': 'studio.step-chain', 'version': 1, 'stepId': s['id'], 'stepInputHash': h(inp), 'previous': previous}
        previous = h(chain)
        actions = [{k: v for k, v in x.items() if k != 'admissionId'} for x in graph['actions'] if x['coordinate']['stepId'] == s['id']]
        actions.sort(key=lambda x: x['coordinate']['ordinal'])
        produced = []; consumed = []
        for binding in graph['bindings']:
            if binding['producer']['stepId'] == s['id']:
                p = copy.deepcopy(binding); del p['consumers']; del p['provenance']['sessionId']; del p['provenance']['producerAdmissionId']; produced.append(p)
            for edge in binding['consumers']:
                if edge['coordinate']['stepId'] == s['id']:
                    consumed.append({k: v for k, v in edge.items() if k not in ('producerAdmissionId', 'consumerAdmissionId')})
        produced.sort(key=lambda x: (x['producer']['ordinal'], x['bindingId'].encode()))
        consumed.sort(key=lambda x: (x['coordinate']['ordinal'], x['argumentSlot'].encode(), x['bindingId'].encode()))
        content = {'actions': actions, 'producedBindings': produced, 'consumedBindings': consumed}
        snapshot = {'domain': 'studio.step-snapshot', 'version': 1, 'stepId': s['id'], 'inputChain': previous, 'learnedStepHash': h(content)}
        result[s['id']] = h(snapshot); rows.append({'stepInput': inp, 'stepChain': chain, 'learnedContent': content, 'stepSnapshot': snapshot, 'snapshotHash': h(snapshot)})
    require(identity['authoredDeclarations'] == [used[k] for k in sorted(used, key=lambda s: s.encode())], 'exact referenced union')
    return result, {'testConfig': test_config, 'rows': rows}


def verify(b, artifact=None):
    e = b['snapshotEvidence']; current = e['current']; authoring = current['authoring']
    require([{'stepId': s['id'], 'ordinal': i, 'source': s['text']} for i, s in enumerate(authoring['steps'])] == b['sourceSteps'], 'exact current source')
    require(h([s['source'] for s in b['sourceSteps']]) == b['sourceHash'] and h(b['sourceSteps']) == b['authoringHash'] and h(b['configuration']) == b['configurationHash'], 'current original hash commitments')
    graph = derive_graph(b); maps, computation = snapshots(current, b['configuration'], graph)
    if artifact is not None:
        require(graph['actions'] == artifact['learnedPlan']['actions'] and graph['bindings'] == artifact['learnedPlan']['bindings'], 'candidate graph from basis, not candidate')
        require(maps == artifact['learnedPlan']['stepSnapshotHashes'], 'candidate map independently derived')
    inc = b['incrementalEvidence']; reuse = {}
    if inc is None:
        require(e['pinnedBase'] is None and e['baseProof'] is None, 'ordinary null base')
    else:
        pin = e['pinnedBase']; p = inc['plan']; program = inc['program']; switch = inc['switch']; index = p['initialFirstLearnIndex']
        require(pin is not None and pin['revisionId'] == p['baseRevisionId'] == program['baseRevisionId'] == switch['baseRevisionId'] and pin['revisionDigest'] == program['baseRevisionDigest'], 'exact original base pin')
        require(h(program) == p['prefixProgramHash'], 'program commitment')
        require(authoring['steps'][index]['id'] == p['initialFirstLearnStepId'], 'initial current coordinate')
        if index == 0:
            require(e['baseProof'] is None and switch['reason'] == 'EMPTY_PREFIX' and not program['sourceStepIds'] and not program['actions'] and not inc['prefixRequests'] and not inc['excludedAttempts'] and inc['driftReceipt'] is None and not switch['retainedPrefixAdmissionIds'], 'explicit empty prefix null proof')
        else:
            base = e['baseProof']; require(base is not None, 'original nonempty prefix requires base proof even drift1')
            revision = base['revision']; identity = revision['identity']; art = base['artifact']; old_source = base['authoringIdentity']['authoring']['steps']
            require(revision['id'] == pin['revisionId'] and h(identity) == revision['revisionDigest'] == pin['revisionDigest'], 'immutable revision digest')
            require(identity['testId'] == b['testId'] and identity['csiId'] == b['csiId'], 'base same test CSI')
            old_maps, _ = snapshots(base['authoringIdentity'], base['configuration'], art['learnedPlan'])
            require(old_maps == revision['stepSnapshotHashes'] == art['learnedPlan']['stepSnapshotHashes'], 'base map recomputed from own facts')
            require(revision['reusedFrom'] == art['learnedPlan']['reusedFrom'], 'base own reuse map agreement')
            recomputed = {'sourceHash': h([s['text'] for s in old_source]), 'authoringHash': h([{'stepId':s['id'],'ordinal':i,'source':s['text']} for i,s in enumerate(old_source)]),
                          'configurationHash':h(base['configuration']), 'artifactHash':h(art), 'learnedPlanHash':h(art['learnedPlan']), 'referencePolicyHash':h(art['replayPolicy']), 'profileHash':h(art['profile']),
                          'operationEquivalenceHash':h({'operations':[o for s in art['steps'] for o in s['operations']], 'guards':art['guards'], 'inputRecipes':art['inputRecipes'], 'bindings':art['replayPolicy']['bindings'], 'transfers':art['replayPolicy']['transfers']})}
            require(all(identity[k] == v for k,v in recomputed.items()), 'every available base identity hash preimage')
            require(all(art[k] == identity[k] for k in ('sourceHash','configurationHash','authoringHash','learnedPlanHash')), 'artifact identity headers')
            require(all(art['replayPolicy'][k] == identity[k] for k in ('learnedPlanHash','admissionProvenanceHash','publicationEvidenceHash','runAuthorizationHash')), 'historical receipt policy commitment agreement')
            prefix = [s['id'] for s in authoring['steps'][:index]]
            require(prefix == program['sourceStepIds'] == [s['id'] for s in old_source[:index]], 'exact contiguous initial prefix')
            guards={g['guardId']:g for g in art['guards']}; operations={canonical(o['coordinate']):o for s in art['steps'] for o in s['operations']}
            expected=[]
            for action in art['learnedPlan']['actions']:
                if action['coordinate']['stepId'] in prefix:
                    expected.append({**{k:v for k,v in action.items() if k!='admissionId'},'guard':guards[operations[canonical(action['coordinate'])]['guardId']]})
            require(expected == program['actions'], 'program exact verified actions and matched guards')
            require(switch['completedPrefixCount'] == switch['effectiveFirstLearnIndex'] <= index, 'effective contiguous prefix')
            for step in authoring['steps'][:switch['completedPrefixCount']]:
                require(maps[step['id']] == old_maps[step['id']], 'current prefix byte equality')
                reuse[step['id']]={'revisionId':pin['revisionId'],'stepId':step['id']}
    if artifact is not None:
        require(artifact['learnedPlan']['reusedFrom'] == reuse, 'derived immediate reuse map')
    return maps, computation


def case(name, function, reject=False):
    try:
        function()
        checks.append({'name':name,'ok':not reject,'expected':'REJECT' if reject else 'ACCEPT'})
    except (ValueError,KeyError,TypeError,StopIteration,IndexError) as error:
        checks.append({'name':name,'ok':reject,'expected':'REJECT' if reject else 'ACCEPT','reason':str(error)})


for x in fixture['positives']:
    def positive(x=x):
        maps, computation=verify(x['basis'],x['expectedArtifact'])
        require(computation == x['snapshotComputation'], 'all five complete envelopes agree')
        b=x['basis']; preimage={'version':1,'basisHash':h(b),'runAuthorizationHash':h(b['runAuthorization']),'translationHash':b['translationHash'],'bootstrapHash':h(b['bootstrap']),'sourceManifestHash':b['sourceManifestHash']}
        require(preimage==x['publicationEvidencePreimage'] and h(preimage)==x['publicationEvidenceHash'],'unchanged publication preimage')
    case('complete-basis-'+x['name'],positive)
for x in fixture['semanticNegatives']:
    def negative(x=x):
        require(schema_validity[x['name']], 'closed schema refuses malformed input')
        verify(x['basis'])
    case('owner-negative-'+x['name'],negative,True)
ordinary=fixture['positives'][0]; boundary=fixture['positives'][1]; counter=fixture['underdeterminationCounterexample']; graph=derive_graph(ordinary['basis'])
case('missing-context-counterexample-A',lambda:require(snapshots(counter['identityA'],counter['oldBasis']['configuration'],graph)[0]==counter['snapshotMapA'],'counterA'))
case('missing-context-counterexample-B',lambda:require(snapshots(counter['identityB'],counter['oldBasis']['configuration'],graph)[0]==counter['snapshotMapB'],'counterB'))
case('missing-context-changes-exact-tail',lambda:require([i+1 for i,s in enumerate(counter['identityA']['authoring']['steps']) if counter['snapshotMapA'][s['id']]!=counter['snapshotMapB'][s['id']]]==[2,3],'counter causal tail'))

baseline=snapshots(ordinary['basis']['snapshotEvidence']['current'],ordinary['basis']['configuration'],graph)[0]
def changed(name,mutate,expected):
    identity=copy.deepcopy(ordinary['basis']['snapshotEvidence']['current']);config=copy.deepcopy(ordinary['basis']['configuration']);mutate(identity,config)
    m,_=snapshots(identity,config,graph); actual=[i+1 for i,s in enumerate(identity['authoring']['steps']) if m[s['id']]!=baseline[s['id']]]
    case(name,lambda:require(actual==expected,'affected positions '+str(actual)))
changed('plain-value-hash-affects-reference-step-only',lambda i,c:i['authoredDeclarations'][0].update(valueHash=h('different-private-value-never-stored')),[3])
changed('global-context-affects-all-input-chains',lambda i,c:i['authoring']['globalContext']['entries'].append({'kind':'text','value':'different global source'}),[1,2,3])
changed('test-config-affects-all-input-chains',lambda i,c:c.update(timeoutSeconds=c['timeoutSeconds']+1),[1,2,3])
changed('authored-step-order-affects-causal-tail',lambda i,c:i['authoring']['steps'].reverse(),[1,2,3])
changed('normalized-nullable-target-hint-is-part-of-source',lambda i,c:i['authoring']['steps'][1]['context']['entries'].append({'kind':'targetHint','strategy':'role','value':'Save','scope':None,'exact':None}),[2,3])
changed('authored-evidence-ISO-string-remains-source',lambda i,c:i['authoring']['steps'][1]['context']['evidenceReferences'].append({'id':'00000000-0000-4000-8000-000000000777','revision':1,'source':'supplied','csiId':'CSI-123','environment':'fixture','route':'/orders','state':'Ready','stepId':i['authoring']['steps'][1]['id'],'capturedAt':'2026-10-15T04:00:00.123456789Z','completeness':'complete','hash':'f'*64}),[2,3])
hint_identity=copy.deepcopy(ordinary['basis']['snapshotEvidence']['current']);hint_identity['authoring']['steps'][1]['context']['entries'].append({'kind':'targetHint','strategy':'role','value':'Save','scope':None,'exact':None})
null_hint=snapshots(hint_identity,ordinary['basis']['configuration'],graph)[0];hint_identity['authoring']['steps'][1]['context']['entries'][-1]['exact']=False
case('nullable-target-exact-is-not-false',lambda:require(snapshots(hint_identity,ordinary['basis']['configuration'],graph)[0]!=null_hint,'null and false preimages differ'))
private_entry=next(i for i in read(ROOT/'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json')['incrementalContracts']['privateInputReconstruction']['envelope']['inputs']if i['inputId']=='input-config')
case('plain-reference-hash-verified-against-private-fixture-value',lambda:require(ordinary['basis']['snapshotEvidence']['current']['authoredDeclarations'][0]['valueHash']==h(private_entry['value']),'exact private plain string hash'))
b=copy.deepcopy(boundary['basis']);b['incrementalEvidence']['switch'].update(effectiveFirstLearnIndex=0,completedPrefixCount=0,effectiveFirstLearnStepId=b['sourceSteps'][0]['stepId'],reason='DRIFT');b['snapshotEvidence']['baseProof']=None
case('nonempty-original-prefix-nullproof-after-drift1',lambda:verify(b),True)
for name,mutator in [('claimed-candidate-map',lambda a:a['learnedPlan']['stepSnapshotHashes'].update({a['learnedPlan']['sourceSteps'][0]:'f'*64})),('gap-in-reused-prefix',lambda a:a['learnedPlan']['reusedFrom'].pop(a['learnedPlan']['sourceSteps'][0])),('older-immediate-revision-map',lambda a:a['learnedPlan']['reusedFrom'][a['learnedPlan']['sourceSteps'][0]].update(revisionId='00000000-0000-4000-8000-000000000999'))]:
    artifact=copy.deepcopy(boundary['expectedArtifact']);mutator(artifact);case(name,lambda a=artifact:verify(boundary['basis'],a),True)
manifest=read(BASE/'manifest.json'); files=[{'file':f,'expected':v,'actual':sha(BASE/f),'ok':sha(BASE/f)==v}for f,v in manifest['files'].items()]
sources=[{'file':f,'captured':v,'currentObserved':sha(ROOT/f),'unchanged':sha(ROOT/f)==v}for f,v in manifest['sourceSnapshots'].items()]
result={'classification':'INDEPENDENT_SYNTHETIC_DESIGN_RECONSTRUCTION_ONLY','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':sha(BASE/'manifest.json'),'boundFiles':files,'diagnosticSourceSnapshots':sources,'sourceScope':'Live backend/data edits may advance diagnostic source anchors; they are not final implementation baseline claims. Frozen design artifacts must remain exact.','checks':checks,'errors':[x for x in checks if not x['ok']]+[x for x in files if not x['ok']],'applicationTestsExecuted':0,'databaseCommandsExecuted':0,'browserCommandsExecuted':0,'buildsExecuted':0}
result['status']='FAIL' if result['errors']else'PASS';(HERE/'independent-reconstruction.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(checks),'boundFiles':len(files),'sourceDrift':[x['file']for x in sources if not x['unchanged']],'errors':result['errors']},indent=2))
raise SystemExit(bool(result['errors']))

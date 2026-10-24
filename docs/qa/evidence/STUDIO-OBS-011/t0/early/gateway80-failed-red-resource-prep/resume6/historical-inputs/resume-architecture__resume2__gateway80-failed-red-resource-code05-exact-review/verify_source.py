"""Exact bounded public-source metadata/AST/reuse checks; no target execution."""
from pathlib import Path
import ast,hashlib,json,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume5')
OLD=S.parent/'resume4'
O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway80-failed-red-resource-code05-exact-review')
checks=[];pins=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_bytes())
def check(name,value):
    checks.append({'id':name,'passed':bool(value)})
    if not value:raise AssertionError(name)
def verify(p,row):
    raw=p.read_bytes();check('PIN-'+str(p),sha(raw)==row['sha256'] and len(raw)==row['bytes'] and stat.S_IMODE(p.stat().st_mode)==row['mode'])
    pins.append({'path':str(p),'sha256':sha(raw),'bytes':len(raw),'mode':stat.S_IMODE(p.stat().st_mode)})
    if p.suffix=='.json':json.loads(raw)
    return raw
raw=(S/'manifest.json').read_bytes();check('EXACT-MANIFEST',sha(raw)=='bd9da067c9d56545171050373a1926f9cd9d061966847ad35db680841cc8e9aa' and len(raw)==17740)
m=json.loads(raw);check('EXACT92',len(m['files'])==92 and len({r['path'] for r in m['files']})==92)
cache={r['path']:verify(S/r['path'],r) for r in m['files']}
check('EXACT-MEMBERSHIP',{p.name for p in S.iterdir()}=={r['path'] for r in m['files']}|{'manifest.json'})
for row in load(S/'input-pins.json')['inputs']:
    check('PUBLIC-READSET-'+row['path'],'/runtime/' not in row['path'] and 'baseline' not in row['path'])
    verify(Path(row['path']),row)
def functions(p):
    t=ast.parse(p.read_bytes());out={}
    for node in t.body:
        if isinstance(node,ast.FunctionDef):out[node.name]=node
        if isinstance(node,ast.ClassDef):
            for f in node.body:
                if isinstance(f,ast.FunctionDef):out[node.name+'.'+f.name]=f
    return out
api=load(S/'api-map.json');interpret=load(S/'interpretation-map.json')
check('API132-INTERPRET140-CLASS14',len(api['functions'])==132 and interpret['functions']==api['functions'] and interpret['reachedInterpretationSiteCount']==len(interpret['reachedInterpretationSites'])==140 and interpret['inputClassCount']==len(interpret['inputClasses'])==14)
trees={};oldtrees={}
for key,row in api['functions'].items():
    name=row['file']
    if name not in trees:trees[name]=functions(S/name)
    symbol=key.split(':',1)[1];node=trees[name][symbol]
    check('API-FUNCTION-'+key,node.lineno==row['line'] and node.end_lineno==row['endLine'] and ast.unparse(node.args)==row['signature'] and sha(ast.dump(node,include_attributes=False).encode())==row['astSha256'])
reuse=load(S/'reuse-analysis.json');check('UNCHANGED88',len(reuse['unchangedFunctions'])==reuse['unchangedFunctionCount']==88)
for row in reuse['unchangedFunctions']:
    filename,symbol=row['function'].split(':',1)
    if filename not in oldtrees:oldtrees[filename]=functions(OLD/filename)
    new=trees[filename][symbol];old=oldtrees[filename][symbol]
    check('REUSED-AST-'+row['function'],ast.dump(new,include_attributes=False)==ast.dump(old,include_attributes=False) and sha(ast.dump(new,include_attributes=False).encode())==row['astSha256'])
check('CUSTODY-LITERAL-UNCHANGED',cache['custody.py']==(OLD/'custody.py').read_bytes())
check('CRITICAL-PRIMARY-PUBLICATION-UNCHANGED',ast.dump(trees['failed_gateway.py']['Unit.capture'],include_attributes=False)==ast.dump(oldtrees['failed_gateway.py']['Unit.capture'],include_attributes=False))
check('CRITICAL-MKDIR-UNCHANGED',ast.dump(trees['custody.py']['Custody.mkdir'],include_attributes=False)==ast.dump(oldtrees['custody.py']['Custody.mkdir'],include_attributes=False))
check('BINDING-GUARD-SAME',cache['binding-functions.bash']==cache['guard-failed-red.bash'])
def embedded(raw,kind):
    text=raw.decode()
    return text.split("-B -c '",1)[1].split("' \"$GATEWAY_FR04_ENTRY\"",1)[0] if kind=='guard' else text.split("-B -c '",1)[1].split("\n' '/Users/",1)[0]
sinknodes=[];registries=[];stages=[]
for label,text in [('protocol',cache['protocol.py'].decode()),('cli',cache['install-cli.py'].decode()),('guard',embedded(cache['guard-failed-red.bash'],'guard')),('loader',embedded(cache['install-loader.bash'],'loader'))]:
    t=ast.parse(text);sink=next(x for x in t.body if isinstance(x,ast.ClassDef) and x.name=='FailureSink');sinknodes.append(ast.dump(sink,include_attributes=False))
    for field,dest in [('REASON_REGISTRY',registries),('STAGES',stages)]:
        assignment=next(x for x in t.body if isinstance(x,ast.Assign) and any(isinstance(v,ast.Name) and v.id==field for v in x.targets));dest.append(ast.literal_eval(assignment.value))
check('FOUR-SINK-CLASS-ASTS',len(set(sinknodes))==1)
check('FOUR-LITERAL-REASON-REGISTRIES',all(r==registries[0] for r in registries))
check('FOUR-STAGE-REGISTRIES',all(r==stages[0] for r in stages))
k=load(S/'contract.json');role=k['typedRoleContract'];check('TYPED-SUBJECT-ONLY',role['kind']=='FAILED_RESOURCE_TYPED_SELF_TEXT_AND_PHYSICAL_ROLES_V1' and role['legacyReportedCanonicalPredicateSatisfied'] is False and role['oldAndNewPredicatesEquivalent'] is False)
check('EXACT-TEXT-COUNTS-HASHES',role['selfTextConstraints']['reported']['expectedUtf8Bytes']==44 and role['selfTextConstraints']['reported']['expectedTextSha256']=='6ca8f35c51bc4625b88aba368e0e3e6b52bd4f043902a68ceae684135a43d0f2' and role['selfTextConstraints']['origArgv0']['expectedUtf8Bytes']==124 and role['selfTextConstraints']['origArgv0']['expectedTextSha256']=='246e02e7d1db128f0eb0625c3692aad64a4bc811387aa4a58d4914b479242165')
check('EXACT7-ROLES',len({r['path'] for r in [*k['expectedPhysicalPythonRoles'].values(),*k['expectedObservationExecutables'].values(),*k['binaryAncestors'].values()]})==7)
check('BOTH-PRIORS-7-8',[len(p['members']) for p in k['priorNamespaces']]==[7,8] and [Path(p['directory']['path']).name for p in k['priorNamespaces']]==['failed-red-resource-disposition01','failed-red-resource-disposition02'])
actors=k['knownPostBaseActors'];check('ALL11',len(actors)==11 and {r['pid'] for r in actors}=={83174,87046,92696,98057,25986,26057,76659,31100,9355,78232,11779})
check('SET-UNION2266-NOT-FUTUREGUESS',len(set(k['finiteUnion']['numericIds'])|{r['pid'] for r in actors})==2266 and len(k['finiteUnion']['numericIds'])==2255 and k['finiteUnion']['numericOnlyAbsent']==[73492,86096,96486])
check('NO-ACTUAL-N03',api['operationalNamespace']=='failed-red-resource-disposition03' and load(S/'source-preparation-limitations.json')['currentTargetActions']==0 if 'currentTargetActions' in load(S/'source-preparation-limitations.json') else api['operationalNamespace']=='failed-red-resource-disposition03')
author=load(S/'check-results.json');flow=load(S/'bounded-flow-check-results.json');history=load(S/'author-history.json')
check('AUTHOR78-62PLUS16-REUSE',author['passed']==78 and author['failed']==0 and len(author['checks'])==78 and flow['passed']==62 and author['outerDeliveryChecks']==16 and all(r.get('pass_',r.get('pass')) is True for r in author['checks']))
check('AUTHOR147-EXECUTED-NOT-UNIQUE',history['actualAssertionsAcrossCandidateAndFinalBatches']==147 and history['finalSupportedUniqueChecks']==78 and sum(r['assertions'] for r in history['actualToolCompletions'])==147)
for filename,h in author['sourcePins'].items():check('AUTHOR-CURRENT-SOURCE-'+filename,sha(cache[filename])==h)
for filename,h in flow['sourcePins'].items():check('FLOW-CURRENT-SOURCE-'+filename,sha(cache[filename])==h)
check('FLOW-RESULT-PIN',author['flowBatchResultSha256']==sha(cache['bounded-flow-check-results.json']))
productionNames=['protocol.py','failed_gateway.py','factory.py','installer.py','install-cli.py','entry.py','guard-failed-red.bash','install-loader.bash','binding-functions.bash']
symbols=[key for key in api['functions'] if key.endswith((':author_control',':write_control',':setup_control',':current_control'))]
# This is a concrete inventory observation, not an assertion that missing caller is supported.
callerGap={'productionControlAuthorSymbols':symbols,'installationMapsDerivedIn':'install-cli.execute / installer.input_specs','setupAndCurrentControlAuthorImplementationFound':bool(symbols),'recipeDelegation':'Root supplies current inputPins/control/actor data; completion SHA externally computed; no sealed finite helper-free root/operator construction/hash entrypoint.'}
check('CALLER-GAP-INVENTORY-RECORDED',symbols==[])
print(json.dumps({'kind':'ARIA_SOURCE05_FINITE_EXACT_SOURCE_AST_REUSE_REVIEW','passed':len(checks),'failed':0,'checks':checks,'pins':pins,'uniqueNamedPins':len({r['path'] for r in pins}),'callerGap':callerGap,'targetFunctionsExecuted':0,'actualTargetActions':0,'author78Replayed':False,'old313Or332Replayed':False},indent=2))

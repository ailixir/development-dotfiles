"""Source-only successor author. Reads approved public packets; never runtime paths."""
import ast, hashlib, json
from pathlib import Path
H=Path(__file__).absolute().parent
T=H.parents[2]
R=next(p for p in H.parents if p.name=='ui-studio')
O=H.parent/'resume4'
D=T/'resume-architecture/resume2/gateway-failed-resource-typed-python-role-design'
def digest(b):return hashlib.sha256(b).hexdigest()
def put(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
def load(p):return json.loads(p.read_bytes())
def verify(d,expected):
    raw=(d/'manifest.json').read_bytes()
    if digest(raw)!=expected:raise ValueError('AUTHOR_MANIFEST')
    m=json.loads(raw)
    for row in m.get('files',m.get('members',[])):
        b=(d/row['path']).read_bytes()
        if digest(b)!=row['sha256'] or len(b)!=row['bytes']:raise ValueError('AUTHOR_PAYLOAD')
    return m
verify(O,'cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e')
verify(D,'057a1eec581db2f2ace5185d7478815128be9fe94d3fc0d53bec6a7c34465cd9')
verify(T/'qa/gateway-failed-resource-typed-python-role-design-review','1fdb6457b8455cfc8ff1fd12fc7aaedd30483cea1bbbe50841685eb6a60dbabd')
def replace(s):
    for a,b in [('failed-red-resource-disposition02','failed-red-resource-disposition03'),('gateway80_failed_red03_','gateway80_failed_red04_'),('gateway80_fr03_','gateway80_fr04_'),('GATEWAY_FR03_','GATEWAY_FR04_'),('gateway80-fr03-root-install01','gateway80-fr04-root-install01'),('gateway80-failed-red-resource-prep/resume4','gateway80-failed-red-resource-prep/resume5'),('code04-exact-review','code05-exact-review'),('SOURCE04','SOURCE05'),('source04','source05'),('N02_CUSTODY','N03_CUSTODY'),('N02_MEMBERSHIP','N03_MEMBERSHIP')]:s=s.replace(a,b)
    return s
names=['protocol.py','custody.py','failed_gateway.py','factory.py','installer.py','install-cli.py','entry.py','guard-failed-red.bash','binding-functions.bash','binding-wrapper.bash','buffer-bootstrap-inline.py','buffer-verifier-inline.py','shell-buffer-verify.py','install-loader.bash','bind-command.template.bash']
for n in names:(H/n).write_text(replace((O/n).read_text()))
for p in O.glob('*.template.json'):
    put(p.name,json.loads(replace(p.read_text())))
for n in ['contract.json','control-schema.json','install-map.json','installer-input-shape.json']:
    put(n,json.loads(replace((O/n).read_text())))
for n in ['manifest.json','check-results.json','code02-check-results.json','extra-check-results.json','optimized-bootstrap-results.json','source03-check-results.json','source04-three-results.json','reuse-analysis.json','case-preservation.json','author-history.json','review.md']:
    (H/('ancestor04-'+n)).write_bytes((O/n).read_bytes())
for n in ['DESIGN.md','adaptation-plan.json','role-contract.json','conditions.json','dependency-map.json','schemas.json','actor-union.json','namespace-plan.json','future-controls.template.json','owner-decisions.template.json']:
    (H/('adopted-design-'+n)).write_bytes((D/n).read_bytes())
root=T/'resume2-gateway-failed-resource-typed-role-design-qa-root-adoption.json'
if digest(root.read_bytes())!='fa8f1fbbd57a8c9f6531ff6f89fca6abe1b2e1417f33e040e530f7798029459c':raise ValueError('ROOT_ADOPTION')
(H/'design-root-adoption.json').write_bytes(root.read_bytes())
k=load(H/'contract.json');role=load(D/'role-contract.json');ns=load(D/'namespace-plan.json');actors=load(D/'actor-union.json')
k['sourceGeneration']=5
k.pop('expectedPythonRoles')
k['typedRoleContract']={n:role[n] for n in ['physicalPythonRoles','selfTextConstraints','unit','legacyReportedCanonicalPredicateSatisfied']}
k['typedRoleContract'].update(kind='FAILED_RESOURCE_TYPED_SELF_TEXT_AND_PHYSICAL_ROLES_V1',oldAndNewPredicatesEquivalent=False,designManifestSha256='057a1eec581db2f2ace5185d7478815128be9fe94d3fc0d53bec6a7c34465cd9')
k['expectedPhysicalPythonRoles']=role['physicalPythonRoles']
k['knownPostBaseActors']=actors['knownPostBaseActors']
prior2=ns['priorN02']
k['priorNamespaces'].append(dict(type='IMMUTABLE_PRIOR_FAILED_PREQUALIFICATION_NAMESPACE',directory=prior2['directory'],members=prior2['members'],indexSha256='64775b9a524c86ea7ed8b061b11c603042f8bcf827b41a58634b0e403c4fab36'))
outside=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-fr04-root-install01'
k['typedOwnerPaths']={who:str(outside/('owner-ruling-'+who+'.json')) for who in ['Aria','Quinn','root']}
# Public exact bytes only. These are metadata/control provenance, not current facts.
pins={
 'resume2-gateway80-source04-n02-frozen-code-control-index.json':'64775b9a524c86ea7ed8b061b11c603042f8bcf827b41a58634b0e403c4fab36',
 'resume2-gateway80-source04-n02-freeze-index-root-actual-inspection.json':'1019e45ade617a55042aeac52d1b6fa3925504449645d0555478c40a2c126779',
 'resume2-gateway-self-text05-actual-metadata-root-inspection.json':'279ba9a0125c87b28f0b98492d7753ca3aa574838283e92f582ddbafafe26496',
 'resume2-gateway80-source04-actual-negative-prequalification-failure.json':'38f14013be9722b539aa443f73d6c56b8697b233cf7aa5e2acc74a1d698b4711',
 'resume2-gateway-selfrole04-actual-metadata-root-inspection.json':'7434fed0c03fa3104ecc392aca5b61054f171c29ec39138790d5fc4f3a167ee3',
 'resume2-gateway-failed-resource-typed-role-design-qa-root-adoption.json':'fa8f1fbbd57a8c9f6531ff6f89fca6abe1b2e1417f33e040e530f7798029459c'}
for row in actors['knownPostBaseActors']:
    rel=row['evidence'].split('#',1)[0]
    if rel not in pins:pins[rel]=digest((T/rel).read_bytes())
for rel,h in pins.items():
    if digest((T/rel).read_bytes())!=h:raise ValueError('AUTHOR_METADATA_PIN')
    k['externalSourcePins'][str((T/rel).relative_to(R))]=h
k['typedMetadataPins']={str(T/rel):h for rel,h in pins.items()}
put('contract.json',k)
for n in ['authorization.template.json','root-candidate.template.json']:
    a=load(H/n);a.pop('pythonRoles',None)
    a.update(physicalPythonRoles=k['expectedPhysicalPythonRoles'],typedRoleContract=k['typedRoleContract'],roleContractSha256=digest(json.dumps(k['typedRoleContract'],sort_keys=True,separators=(',',':'),allow_nan=False).encode()),legacyReportedCanonicalPredicateSatisfied=False,typedOwnerRecordPins={p:None for p in k['typedOwnerPaths'].values()},priorNamespaces=k['priorNamespaces'],externalPins={str(R/p):h for p,h in k['externalSourcePins'].items()})
    a.pop('binaryHashes',None);a.pop('binaryModes',None);a.pop('binaryWitnesses',None)
    put(n,a)
scope=load(H/'install-scope.template.json');scope['candidate']=load(H/'root-candidate.template.json');scope['ownerPins']={p:None for p in k['typedOwnerPaths'].values()};scope['readsetPolicy']='EXACT_SOURCE05_CONTRACT_REVIEWS_OWNERS_TYPED_METADATA_BOTH_PRIORS_AND_SEVEN_CANONICAL_BINARIES';put('install-scope.template.json',scope)
put('owner-decisions.template.json',load(D/'owner-decisions.template.json'))
print(json.dumps(dict(status='INITIAL_SOURCE05_ONLY',physicalAcquisition=False,actualTargetOperations=0)))

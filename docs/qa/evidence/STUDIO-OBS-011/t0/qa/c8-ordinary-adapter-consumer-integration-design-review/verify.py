"""Finite exact public pin/AST/design review only. No target compilation or execution."""
import ast,hashlib,json,stat
from pathlib import Path
R=Path.cwd();B=Path('docs/qa/evidence/STUDIO-OBS-011/t0');S=B/'resume-architecture/resume2/c8-ordinary-adapter-consumer-integration-design';O=B/'qa/c8-ordinary-adapter-consumer-integration-design-review'
checks=[];pins=[];cache={}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def bind(p,digest,size=None,mode=None):
 p=Path(p);rel=p.relative_to(R).as_posix() if p.is_absolute() else p.as_posix()
 assert '/runtime/' not in rel and '..' not in p.parts
 b=p.read_bytes();s=p.lstat();check('EXACT_PUBLIC_PIN_'+str(len(pins)),sha(b)==digest and (size is None or len(b)==size) and (mode is None or stat.S_IMODE(s.st_mode)==mode) and stat.S_ISREG(s.st_mode))
 row={'path':rel,'sha256':sha(b),'bytes':len(b),'mode':stat.S_IMODE(s.st_mode)};pins.append(row);cache[rel]=b;return b
manifest=bind(S/'manifest.json','4de71b8fd5986ea8be023e58fe8dd549960630e1a51b03b35d84089a4adadfc6');m=json.loads(manifest)
for r in m['files']:bind(S/r['path'],r['sha256'],r['bytes'],r['mode'])
authorpins=json.loads((S/'input-pins.json').read_bytes())
for r in authorpins:bind(r['path'],r['sha256'],r['bytes'],r['mode'])
check('EXACT12_470',len(m['files'])==12 and len(authorpins)==470)
loc=json.loads((S/'source-locations.json').read_bytes());check('EXACT61_MAPPED',len(loc)==61)
selected={}
for r in loc:
 rel=Path(r['path']).relative_to(R).as_posix();raw=cache[rel];t=ast.parse(raw);found={}
 for node in t.body:
  if isinstance(node,ast.FunctionDef):found[node.name]=node
  elif isinstance(node,ast.ClassDef):
   found.update({node.name+'.'+n.name:n for n in node.body if isinstance(n,ast.FunctionDef)})
 n=found[r['name']];check('MAPPED_SOURCE_'+r['name'],sha(raw)==r['sha256'] and n.lineno==r['line'] and n.end_lineno==r['endLine']);selected[(Path(rel).name,r['name'])]=ast.get_source_segment(raw.decode(),n)
claims=json.loads((S/'claim-and-mode-map.json').read_bytes());methods=json.loads((S/'method-map.json').read_bytes());dag=json.loads((S/'task-dag.json').read_bytes());review=json.loads((S/'review.json').read_bytes());author=json.loads((S/'checks.json').read_bytes());text=(S/'design.md').read_text()
check('AUTHOR1465_REUSED',author['passed']==1465 and author['failed']==0 and all(r['passed'] for r in author['checks']) and author['subjectFunctionsExecuted']==0)
check('NO_PROFILE_ADOPTION',claims['profileAuthorized'] is False and claims['actualEvidenceAccepted'] is False and m['prospectiveProfileAuthorized'] is False)
check('TEN_FALSE_SIX_NULL',len(claims['guarantees'])==10 and all(v is False for v in claims['guarantees'].values()) and len(claims['unsupportedEvidence'])==6 and all(x['value'] is None and type(x['reason']) is str and x['reason'] for x in claims['unsupportedEvidence'].values()))
check('NO_STRONG_EQUIVALENCE',claims['identityComplete'] is False and claims['kernelIdentityComplete'] is False and claims['historicalIdentityUncertainty'] is True and claims['guarantees']['legacyOrdinaryGateSatisfied'] is False)
identity=selected[('qualification_controller.py','identity')];strict=selected[('public_contract.py','relay_qualified')]
check('STRICT_JAVA_NOT_AMENDED',"value['identityComplete'] is True" in identity and "value['kernelIdentityComplete'] is True" in identity)
check('STRICT_BUSINESS_NOT_AMENDED',"peer['kernelIdentityComplete'] is not True" in strict and "get('identityComplete') is not True" in strict)
cred=selected[('public_relay.py','peer_credentials')]
check('EXISTING76_4_ONLY','getsockopt(0, 1, 76)' in cred and 'getsockopt(0, 2, 4)' in cred and "platform == 'darwin'" in cred)
check('NO_BUSINESS_BRIDGE',claims['business06']['status']=='NO_ACCEPTANCE_BRIDGE_ESTABLISHED' and claims['business06']['reason']=='SELECTED_WORKER_BINDING_UNPROVED' and claims['business06']['ordinaryGateSatisfied'] is False and claims['business06']['publicObservationAuthenticated'] is False and claims['business06']['sameCookieSoleUuidOneGetZeroHttpMustRemainLiteral'] is True)
channel=claims['specificProspectiveChannelProperty'];check('CHANNEL_UNADOPTED',channel['name']=='OWNED_DIRECT_CHILD_CHANNEL_MATCH_V1' and channel['value'] is None and 'DESIGN_ONLY' in channel['status'] and len(channel['requirements'])==5)
check('SECURITY_NOT_FLAG_ONLY','control nonce possession or a same-UID sample alone does not establish' in text and 'cookie equality, exactly one owned UUID, fixed endpoint/TLS host, one-send and zero-HTTP checks' in text)
check('NO_IMAGE_AUTH_CLAIM','does **not** establish that the child never execed another image' in text and 'this bridge is inadmissible and remains HOLD' in text)
check('OWNED_PRINCIPAL_DEFINED','exclusive ownership of wait/reap operations' in text and 'actual live-child poll observations immediately before and after enrollment' in text and 'retained accepted connection' in text)
check('STRICT_PRODUCTION_UNCHANGED','Production Java/harness/body/driver/control wire, TLS identity, limits and application schema3 remain unchanged' in text)
check('SOLE_WRITER_PROTECTED_ARTIFACTS','Root is the sole fixed0600 writer' in text and 'Protected fixture password/control nonce never enter public records' in text)
check('NO_STANDALONE_TRANSFER','root the test worker\'s directly owned Popen handle' in text and 'no business acceptance bridge is established' in text)
expected={'parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'}
check('NINE_EXACT_UNEXECUTED_MODES',len(claims['modeRows'])==9 and {x['mode'] for x in claims['modeRows']}==expected and all(x['actual'].startswith('UNEXECUTED_OWED') for x in claims['modeRows']))
mode={r['mode']:r['preservedAcceptance'] for r in claims['modeRows']}
check('STAGE_WRITE_STALL_LITERAL','requestCompletedfalse' in mode['tls-stall-write'] and 'UNKNOWN' in mode['tls-stall-write'])
check('RELAY_CAPS_UNCHANGED',all(x in mode['relay'] for x in ('DATA16384','ACK256','COMMIT512','<15s','zeroHTTP')))
check('DEADLINES_NOT_BORROWED','not Gateway300s' in claims['outerNativeDeadline'] and 'work12/network14/producer15/aggregate20/server5' in claims['javaInvariant'])
check('THIRTEEN_CONCRETE_METHOD_BOUNDARIES',len(methods['rows'])==13 and all(set(r)=={'boundary','current','reuse','owed'} and r['owed'] for r in methods['rows']))
nodes={n['id']:n for n in dag['nodes']};check('FINITE_DAG_NO_AUTHORITY',len(nodes)==len(dag['nodes'])==13 and dag['implementationSelected'] is False and all(n['authorityNow'] is False for n in nodes.values()))
done=set()
while len(done)<len(nodes):
 nxt={k for k,n in nodes.items() if set(n['depends'])<=done};check('DAG_PROGRESS_'+str(len(done)),bool(nxt-done));done|=nxt
check('CODE_OWN_RULINGS_BEFORE_INPUTS',nodes['S1']['depends']==['S0'] and set(nodes['I0']['depends'])=={'G0','S1'})
check('FIXTURE_COMPILER_ONCE_SEPARATE',nodes['F0']['depends']==['I1'] and nodes['C0']['depends']==['I1'] and 'separate once-only decisions' in text)
check('NO_BUSINESS_EXECUTION_INFERENCE',nodes['B1']['depends']==['B0','Q0'] and 'cannot execute by inference' in dag['businessBlock'])
check('NO_CREDIT_AUTHORITY',m['policyAmendment'] is False and m['actualAuthority'] is False and m['credit'] is False and m['targetExecutions']==0 and claims['C8'] is False and claims['cleanupAuthorized'] is False)
root=json.loads(cache[str(B/'resume2-gateway-source09-owner-ruling-root.json')]);adopt=json.loads(cache[str(B/'resume2-gateway-source09-local-profile-owner-rulings-root-adoption.json')])
check('SOURCE09_GATEWAY_ONLY',root['protocol']=='GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1' and root['actualOperationalAuthority'] is False and root['actualEvidenceAccepted'] is False and adopt['otherConsumerOrC8Amendment'] is False)
check('OLD_ROOT_CONSUMER_GATES_REMAIN','Ordinary' not in claims['proposedProtocol'] and review['ordinaryAdapterAndExactCallerImplemented'] is False and review['businessAcceptanceBridgeEstablished'] is False)
check('NO_RESEARCH_OR_TARGET_TESTS',review['newProviderApiResearch'] is False and review['verification']['subjectFunctionsExecuted']==0 and m['actualActions']==0)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(manifest),'pins':pins,'pinRecords':len(pins),'authorInputPinRecords':470,'exactPublicOnly':True,'runtimePrivateBaselineReads':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'QUINN_C8_CONSUMER_INTEGRATION_DESIGN_STATIC_REVIEW','checks':len(checks),'results':checks,'pinRecords':len(pins),'mappedDefinitions':61,'attributedAuthorFiniteChecks':1465,'targetExecutions':0,'actualRuntimeActions':0,'mandatoryFindings':0,'policyAdoption':False},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pinRecords':len(pins),'mappedDefinitions':61,'targetExecutions':0,'mandatoryFindings':0,'policyAdoption':False}))

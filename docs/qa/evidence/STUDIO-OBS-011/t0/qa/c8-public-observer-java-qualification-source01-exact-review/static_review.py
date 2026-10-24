"""Independent finite source/pin/AST/API/Java text checks; no target execution."""
from pathlib import Path
import ast,hashlib,json,stat,re
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume1');O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-observer-java-qualification-source01-exact-review')
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def pin(r,prefix=None):
 p=Path(r['path']) if prefix is None else prefix/r['path'];check('PUBLIC_NAMED_ONLY_'+str(p),'/runtime/' not in str(p) and '/.gradle/' not in str(p) and not str(p).endswith('preexisting-baseline.json'))
 b=p.read_bytes();st=p.stat();check('SHA_'+str(p),h(b)==r['sha256']);check('BYTES_'+str(p),len(b)==r['bytes']);check('MODE_'+str(p),stat.S_IMODE(st.st_mode)==(int(r['mode'],0) if type(r['mode'])is str else r['mode']));pins.append({'path':str(p),'sha256':h(b),'bytes':len(b),'mode':stat.S_IMODE(st.st_mode)})
raw=(S/'manifest.json').read_bytes();check('EXACT_SUBJECT',h(raw)=='fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f');m=json.loads(raw);check('SOURCE49',len(m['files'])==49)
for r in m['files']:pin(r,S)
input_rows=json.loads((S/'verified-inputs.json').read_bytes());check('NAMED283_PIN_ROWS',type(input_rows)is list and len(input_rows)==283)
for r in input_rows:pin(r)
for line in (S/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split(None,1);check('CHECKSUM_'+name,h((S/name).read_bytes())==sha)
mp=json.loads((S/'implementation-map.json').read_bytes());check('MAP_FIVE_RUNTIME_SOURCES',type(mp)is list and len(mp)==5)
for row in mp:
 b=(S/row['path']).read_bytes();check('MAP_SOURCE_'+row['path'],h(b)==row['sha256']);tree=ast.parse(b);check('NO_REMOVABLE_ASSERT_'+row['path'],not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
 for f in row['functions']:check('SPAN_'+row['path']+f['name'],any(isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==f['name'].split('.')[-1] and n.lineno==f['line'] and n.end_lineno==f['endLine'] for n in ast.walk(tree)))
fragment=(S/'observer-fragment.java.txt').read_bytes();harness=(S/'ObserverBoundaryHarness.java').read_bytes();body=(S/'java-harness-body.java.txt').read_bytes();old=S.parents[1]/'c8-check01-public-evidence-prep/resume6'
check('PRODUCTION0153',h(fragment)=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66' and fragment==(old/'observer-fragment.java.txt').read_bytes())
check('HARNESS82A9',h(harness)=='82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f')
check('FRAGMENT_ONCE_DRIVER_ONCE',harness.count(fragment)==harness.count(body)==1)
oldbody=(old/'java-harness-body.java.txt').read_bytes();oldnames=re.findall(rb'parserCase\("([^\"]+)"',oldbody);names=re.findall(rb'parserCase\("([^\"]+)"',body)
check('ORIGINAL15_IDENTITIES',len(oldnames)==15 and names[:15]==oldnames)
check('SIX_ADDED_DECLARED_IDENTITIES',names[15:]==[b'chunk-line129',b'chunk-data-bad-CRLF',b'bare-LF-header',b'header-exact16384',b'trailer-exact8192',b'trailer-bad-CRLF'])
check('EXACT24_DECLARED0_EXECUTED',json.loads((S/'proof-coverage.json').read_bytes())['javaDeclaredVectors']=={'original':18,'added':6,'total':24,'executed':0})
check('NETWORK_BEFORE_SERVER_DRAIN',body.index(b'networkCompletionUpperNs=System.nanoTime()-start')<body.index(b'serverThread.join(5000)'))
check('WRITE_STALL_CANNOT_BUFFER_PASS',b'writeStall ? exchange.requests==1 && !exchange.completed' in body)
for token in [b'262144',b'8192',b'16384',b'128',b'12000000000L',b'14000000000L',b'15000000000L',b'java.net.Proxy.NO_PROXY',b'new byte[] {127,0,0,1}',b'setEndpointIdentificationAlgorithm("HTTPS")',b'setApplicationProtocols(new String[] {"http/1.1"})']:check('PRODUCTION_LITERAL_'+token.decode(),token in fragment)
check('CONTEXT_NO_GLOBAL_TLS_OVERRIDE',b'TLS=javax.net.ssl.SSLContext.getInstance("TLS")' in body and b'SSLContext.setDefault' not in body)
check('UNCHANGED_PUBLIC_CONTRACT',h((S/'public_contract.py').read_bytes())==h((old/'public_contract.py').read_bytes()))
# Closed interface/result schema field correspondence only; malformed publication is
# independently exercised by targeted_native_result.py and reported as a finding.
controller=ast.parse((S/'qualification_controller.py').read_bytes());values={n.targets[0].id:ast.literal_eval(n.value.args[0] if isinstance(n.value,ast.Call) else n.value) for n in controller.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['MODES','RELEASE_FIELDS','DECISION_FIELDS','PIN_FIELDS','IDENTITY_FIELDS','NATIVE_FIELDS']}
schema=json.loads((S/'schemas.json').read_bytes())['definitions']
for key,const in [('Release','RELEASE_FIELDS'),('Decision','DECISION_FIELDS'),('Pin','PIN_FIELDS'),('StandaloneJvmIdentity','IDENTITY_FIELDS'),('NativeWait','NATIVE_FIELDS')]:check('SCHEMA_SOURCE_FIELDS_'+key,set(schema[key]['fields'])==set(values[const]))
check('NINE_MODES',values['MODES']==('parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'))
interface=(S/'ORDINARY-INTERFACE.md').read_text();recipe=(S/'RECIPE.md').read_text();fixture=(S/'FIXTURE-RECIPE.md').read_text()
check('ORDINARY_IMPLEMENTATION_CALLER_OWED','complete implementation and root caller must be independently reviewed/pinned before actual use' in interface)
check('NO_LIMITED_PROFILE_BORROW','Gateway limited profile is unintegrated' in recipe)
check('ADAPTER_PARTIAL_LAUNCH_RETENTION','partial failure must retain/persist its actual handle/lineage' in interface)
check('INDEPENDENT_COMPLETE_STDOUT','complete bounded stdout byte buffer' in interface and 'persist' in interface.lower())
check('FIXTURE_NO_PASSWORD_ARGV','-storepass:env SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD' in fixture and '-keypass:env SYNTHETIC_PUBLIC_KEYSTORE_PASSWORD' in fixture and 'never' not in '')
check('FIXTURE_LOCAL_ONLY','changes no host/global trust/provider setting' in fixture and 'before fixture preparation' in recipe)
check('ROOT_CALLER_NOT_UNREVIEWED','No root-authored unreviewed wrapper is permitted' in recipe)
check('ACTUAL_GATES_OWED',all(term in recipe for term in ['proper failed-resource archive','outer postclose0','ordinary holder/lease/admission','60s readiness permit','at most one restored compile0']))
check('EARLY_ENROLLMENT_SCOPE','Early/foreign/unknown peer consumes/HOLD' in recipe and 'No Gradle-worker' in recipe)
def result(name):
 text=(O/name).read_text();summary,offset=json.JSONDecoder().raw_decode(text);return summary,json.loads(text[offset:])['result']
summary,src=result('source.stdout');summary,flow=result('flow.stdout')
check('CURRENT135',src['passed']==135 and src['failed']==0 and len(src['checks'])==135 and all(c['passed'] for c in src['checks']))
check('CURRENT222_15',flow['passed']==222 and flow['failed']==0 and len(flow['cases'])==15 and all(c['passed'] for c in flow['checks']))
check('ZERO_REAL_BOUNDARIES',src['forbiddenRealBoundaryCalls']==flow['forbiddenBoundaryCalls']==[])
check('ONE_READY_YIELD_ONLY',flow['singleTestOnlyReadyYield'] is True and flow['removeYieldRestoresServeAst'] is True and flow['realConcurrency'] is False)
check('STDERR_EMPTY',(O/'source.stderr').read_bytes()==(O/'flow.stderr').read_bytes()==(O/'targeted.stderr').read_bytes()==b'')
check('EXACT_PRIOR_COVERAGE_ATTRIBUTION',json.loads((S/'proof-coverage.json').read_bytes())['exactPriorProof']['attributionOnlyNotAddedToCurrentTotals'] is True)
existing=json.loads((O/'pins.json').read_text());existing['pins']=pins;existing.update(approvedInputPinRows=283,protectedBaselineBodyStatHash=False);(O/'pins.json').write_text(json.dumps(existing,indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'INDEPENDENT_EXACT_SOURCE01_FINITE_REVIEW_CHECKS','count':len(checks),'checks':checks,'allExpected':True,'requiredPythonControls':357,'requiredSourceControls':135,'requiredFlowControls':222,'flowScenarios':15,'javaDeclared':24,'javaExecuted':0,'prior921Replayed':0,'actualActions':0,'noSubjectFunctionsExecutedByStaticChecker':True},indent=2)+'\n')
print(json.dumps({'staticChecks':len(checks),'requiredPythonPassed':357,'javaDeclared':24,'javaExecuted':0,'actualActions':0}))

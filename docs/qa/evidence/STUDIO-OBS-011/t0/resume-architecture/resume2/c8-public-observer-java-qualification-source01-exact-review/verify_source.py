"""Independent approved-source integrity/map checks, with no subject evaluation."""
from pathlib import Path
import ast,hashlib,json,re,stat
T=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
S=T/'early/c8-public-observer-java-qualification-prep/resume1'
O=T/'resume-architecture/resume2/c8-public-observer-java-qualification-source01-exact-review'
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if ok is not True:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def verify(row,prefix=None):
 p=Path(row['path']) if prefix is None else prefix/row['path'];name=str(p)
 approved=(name.startswith(str(T)+'/') or name.startswith('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/'+str(T)+'/')) and '/runtime/' not in name and not name.endswith('preexisting-baseline.json')
 check('APPROVED_PUBLIC_'+name,approved)
 raw=p.read_bytes();info=p.stat();mode=row['mode']
 if type(mode)is str:mode=int(mode,8) if mode.startswith('0') and not mode.startswith('0o') else int(mode,0)
 check('SHA_'+name,h(raw)==row['sha256']);check('BYTES_'+name,len(raw)==row['bytes']);check('MODE_'+name,stat.S_IMODE(info.st_mode)==mode)
 pins.append({'path':name,'sha256':h(raw),'bytes':len(raw),'mode':mode});return raw
raw=(S/'manifest.json').read_bytes();check('EXACT_SOURCE_MANIFEST',h(raw)=='fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f')
m=json.loads(raw);check('PAYLOADS49',len(m['files'])==49)
for row in m['files']:verify(row,S)
inputs=json.loads((S/'verified-inputs.json').read_bytes());check('PREPARATION_INPUTS283',len(inputs)==283)
for row in inputs:verify(row)
for line in (S/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split(None,1);check('CHECKSUM_'+name,h((S/name).read_bytes())==expected)
trees={};maps=json.loads((S/'implementation-map.json').read_bytes());check('MAP_FIVE_MODULES',len(maps)==5)
for row in maps:
 raw=(S/row['path']).read_bytes();check('MAP_SOURCE_'+row['path'],h(raw)==row['sha256']);tree=ast.parse(raw);trees[row['path']]=tree
 check('EXPLICIT_CHECKS_'+row['path'],not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
 # This packet's declared map covers top-level definitions/classes and direct
 # class methods, not local closures inside function bodies.
 actual=set()
 def mapped(nodes):
  for n in nodes:
   if isinstance(n,(ast.FunctionDef,ast.ClassDef)):actual.add((n.name,n.lineno,n.end_lineno))
   if isinstance(n,ast.ClassDef):mapped(n.body)
 mapped(tree.body)
 declared={(x['name'].split('.')[-1],x['line'],x['endLine']) for x in row['functions']}
 check('COMPLETE_MAP_'+row['path'],actual==declared)
 for name,line,end in declared:check('SPAN_'+row['path']+'_'+str(line),(name,line,end) in actual)
fragment=(S/'observer-fragment.java.txt').read_bytes();body=(S/'java-harness-body.java.txt').read_bytes();harness=(S/'ObserverBoundaryHarness.java').read_bytes();driver=(S/'tls-driver.java.txt').read_bytes()
check('FRAGMENT0153_LITERAL',h(fragment)=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
check('PRODUCTION_FRAGMENT_ONCE',harness.count(fragment)==1)
check('SYNTHETIC_BODY_AND_DRIVER_ONCE',harness.count(body)==1 and body.count(driver)==1)
old=T/'early/c8-check01-public-evidence-prep/resume6'
check('PRODUCTION_SOURCE06_UNCHANGED',fragment==(old/'observer-fragment.java.txt').read_bytes())
check('PUBLIC_CONTRACT_SOURCE06_LITERAL',(S/'public_contract.py').read_bytes()==(old/'public_contract.py').read_bytes())
oldbody=(old/'java-harness-body.java.txt').read_bytes();before=re.findall(rb'parserCase\("([^\"]+)"',oldbody);after=re.findall(rb'parserCase\("([^\"]+)"',body)
check('ORIGINAL15_ENTITY_IDENTITIES',len(before)==15 and after[:15]==before)
check('EXACT6_BOUNDARY_IDENTITIES',after[15:]==[b'chunk-line129',b'chunk-data-bad-CRLF',b'bare-LF-header',b'header-exact16384',b'trailer-exact8192',b'trailer-bad-CRLF'])
check('ORIGINAL3_JSON_IDENTITIES',b'bytes("{\\"x\\":1,\\"x\\":2}"),bytes("{}{}"),new byte[] {(byte) 0xff}' in body)
check('BEFORE_SERVER_JOIN_COMPLETION_SNAPSHOT',body.index(b'networkCompletionUpperNs=System.nanoTime()-start')<body.index(b'serverThread.join(5000)'))
check('WRITE_STALL_NOT_BUFFERED_COMPLETED',b'writeStall ? exchange.requests==1 && !exchange.completed && REQUESTS.get()==0' in body)
check('SERVER_CLOSE_BEFORE_CLOSED_STATE',b'peerClose="UNKNOWN";try { peer.close();peerClose="CLOSED";' in driver and b'listenerClose="UNKNOWN";try { listener.close();listenerClose="CLOSED";' in driver)
check('SERVER_UNKNOWN_REFERENCES_RETAINED',b'SYNTHETIC_RETAINED.add(owned)' in driver and b'SYNTHETIC_RETAINED.add(this)' in driver)
coverage=json.loads((S/'proof-coverage.json').read_bytes())
check('JAVA24_DECLARED_ZERO_EXECUTED',coverage['javaDeclaredVectors']=={'original':18,'added':6,'total':24,'executed':0})
check('NINE_ACTUAL_MODES_OWED',len(coverage['actualNineModes'])==9 and all(v=='UNEXECUTED_OWED' for v in coverage['actualNineModes'].values()))
check('PRIOR921_NOT_NEW_CREDIT',coverage['exactPriorProof']['priorExecuted']==501 and coverage['exactPriorProof']['priorReuse']==420 and coverage['exactPriorProof']['priorSourceCoverage']==921 and coverage['exactPriorProof']['attributionOnlyNotAddedToCurrentTotals'] is True)
check('ORDINARY_ADAPTER_EXPLICITLY_OWED',coverage['ordinaryAdapterImplementationAndExactCallerReviews']=='OWED_BEFORE_ACTUAL_USE')
interface=(S/'ORDINARY-INTERFACE.md').read_text();recipe=(S/'RECIPE.md').read_text()
check('NO_UNREVIEWED_ROOT_CALLER_GAP_HIDDEN','complete implementation and root caller must be independently reviewed/pinned before actual use' in interface and 'No root-authored unreviewed wrapper is permitted' in recipe)
check('NO_SOURCE09_PROFILE_BORROW','future Gateway limited profile is unintegrated' in recipe)
check('CANONICAL_REQUEST_EXPLICIT',"sort_keys=True,separators=(',',':'),allow_nan=False" in interface)
check('CURRENT_SCHEMA_TYPED_PRIVATE_PROJECTION',json.loads((S/'schemas.json').read_bytes())['definitions']['QualificationResult']['noRawSecretOrExceptionFields'] is True)
target=json.loads((O/'targeted-attempt01.stdout').read_bytes());check('ARIA18_CHECKS_ALL_EXPECTED',target['checks']==18 and all(x['passed'] is True for x in target['results']))
check('ARIA6_CASES_ZERO_BOUNDARIES',len(target['cases'])==6 and target['forbiddenBoundaryCalls']==[] and target['actualJavaCompilerTlsUnixPeerPlatformActions']==0)
check('ARIA_STDERR_EMPTY',(O/'targeted-attempt01.stderr').read_bytes()==b'')
check('KNOWN_FAILURE_IS_EXPLICIT',target['cases'][1]['escapedExceptionClass']=='AttributeError' and target['cases'][1]['typedResultReturned'] is False)
Q=T/'qa/c8-public-observer-java-qualification-source01-exact-review'
qraw=(Q/'manifest.json').read_bytes();check('EXACT_QUINN_MANIFEST',h(qraw)=='346afb412109878078b96c83fb0a4b60f017b9231f8493df8ffc13b728434426')
qm=json.loads(qraw);check('COMPLETE_QUINN16',len(qm['files'])==16)
for row in qm['files']:verify(row,Q)
qc=json.loads((Q/'checks.json').read_bytes());qf=json.loads((Q/'findings.json').read_bytes())
check('QUINN357_AND1560_BOUND_NOT_REPLAYED',qc['requiredPythonControls']==357 and qc['requiredSourceControls']==135 and qc['requiredFlowControls']==222 and qc['flowScenarios']==15 and qc['count']==1560 and qc['allExpected'] is True)
check('QUINN_FULL_HOLD1_BOUND',qf['subjectManifestSha256']==m.get('subjectManifestSha256','fd7cce1e0ee7da9c41cb0746f00b78b35fd41269f822776719ba1d2f6f18aa6f') and qf['mandatoryFindingCount']==1 and len(qf['mandatoryFindings'])==1)
check('QUINN_STDERR_EMPTY',(Q/'source.stderr').read_bytes()==(Q/'flow.stderr').read_bytes()==(Q/'targeted.stderr').read_bytes()==b'')
check('EXACT_ARIA_CORROBORATION_BOUND',(Q/'aria-targeted-evidence.json').read_bytes()==(O/'targeted-attempt01.stdout').read_bytes())
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':h((S/'manifest.json').read_bytes()),'pins':pins,'protectedBaselineBodyStatHash':False,'currentOperationalResourceReads':0},indent=2)+'\n')
(O/'source-checks.json').write_text(json.dumps({'kind':'ARIA_JAVA_QUALIFICATION_SOURCE01_FINITE_SOURCE_PIN_MAP_CHECKS','checks':len(checks),'results':checks,'pinRecords':len(pins),'subjectFunctionsExecutedHere':0,'javaVectorsExecuted':0,'actualTargetActions':0},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pins':len(pins),'allPassed':True,'actualTargetActions':0}))

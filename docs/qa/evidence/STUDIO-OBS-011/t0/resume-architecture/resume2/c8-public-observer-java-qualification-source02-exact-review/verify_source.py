"""Finite approved public source/AST/pin verification; no subject execution."""
from pathlib import Path
import ast,collections,hashlib,json,stat
T=Path('docs/qa/evidence/STUDIO-OBS-011/t0');S=T/'early/c8-public-observer-java-qualification-prep/resume2';B=S.parent/'resume1';Q=T/'qa/c8-public-observer-java-qualification-source02-exact-review';O=T/'resume-architecture/resume2/c8-public-observer-java-qualification-source02-exact-review'
h=lambda b:hashlib.sha256(b).hexdigest();checks=[];pins=[]
def check(name,ok):
 if ok is not True:raise ValueError(name)
 checks.append(dict(id=name,passed=True))
def verify(row,prefix=None):
 p=Path(row['path']) if prefix is None else prefix/row['path'];name=str(p)
 check('APPROVED_PUBLIC_'+name,(name.startswith(str(T)+'/') or name.startswith('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/'+str(T)+'/')) and '/runtime/' not in name and not name.endswith('preexisting-baseline.json'))
 b=p.read_bytes();info=p.stat();mode=row['mode']
 if type(mode)is str:mode=int(mode,8) if mode.startswith('0') and not mode.startswith('0o') else int(mode,0)
 check('SHA_'+name,h(b)==row['sha256']);check('BYTES_'+name,len(b)==row['bytes']);check('MODE_'+name,stat.S_IMODE(info.st_mode)==mode)
 pins.append(dict(path=name,sha256=h(b),bytes=len(b),mode=mode));return b
def packet(p,want):
 raw=(p/'manifest.json').read_bytes();check('EXACT_MANIFEST_'+str(p),h(raw)==want);check('MANIFEST_MODE_'+str(p),stat.S_IMODE((p/'manifest.json').stat().st_mode)==0o644)
 m=json.loads(raw)
 for row in m['files']:verify(row,p)
 return m
m=packet(S,'5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f');qm=packet(Q,'4eaeff5ae3ff969dcceecbfa6ad38381fc1b90ed7d1a22a1a69b65591b7a714e')
check('COUNTS74_18',len(m['files'])==74 and len(qm['files'])==18)
graph=json.loads((S/'verified-inputs.json').read_bytes());prior=json.loads((S/'verified-source01-and-review-inputs.json').read_bytes())
check('EXACT87_PRIOR_ROWS',graph['source01AndBothCompleteReviews']==prior and len(prior)==87 and len(graph['currentPrepared'])==12)
for row in prior+graph['currentPrepared']:verify(row)
for line in (S/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split(None,1);check('CHECKSUM_'+name,h((S/name).read_bytes())==expected)
for name in ('observer-fragment.java.txt','ObserverBoundaryHarness.java','java-harness-body.java.txt','tls-driver.java.txt','qualification_custody.py','qualified_relay.py','entry_loader.py','public_contract.py','source_checks.py','flow_checks.py','FIXTURE-RECIPE.md','acceptance-matrix.md'):
 check('UNCHANGED_BYTES_'+name,(S/name).read_bytes()==(B/name).read_bytes())
check('UNCHANGED135_RESULT',(S/'source01-source-check-results.json').read_bytes()==(B/'source-check-results.json').read_bytes())
trees={};maps=json.loads((S/'implementation-map.json').read_bytes())
for row in maps:
 raw=(S/row['path']).read_bytes();check('MAP_SOURCE_'+row['path'],h(raw)==row['sha256']);tree=ast.parse(raw);trees[row['path']]=tree
 check('NONREMOVABLE_'+row['path'],not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
 actual=set()
 def walk(nodes):
  for n in nodes:
   if isinstance(n,(ast.FunctionDef,ast.ClassDef)):actual.add((n.name,n.lineno,n.end_lineno))
   if isinstance(n,ast.ClassDef):walk(n.body)
 walk(tree.body)
 declared={(x['name'].split('.')[-1],x['line'],x['endLine']) for x in row['functions']}
 check('COMPLETE_DECLARED_MAP_'+row['path'],actual==declared)
 for name,line,end in declared:check('SPAN_'+row['path']+'_'+str(line),(name,line,end) in actual)
before=ast.parse((B/'qualification_controller.py').read_bytes());after=trees['qualification_controller.py']
def outside(tree):return collections.Counter(ast.dump(n,include_attributes=False) for n in tree.body if not (isinstance(n,ast.ClassDef) and n.name=='Invocation') and not (isinstance(n,ast.FunctionDef) and n.name=='native_projection'))
check('ONLY_PROJECTION_AND_INVOCATION_RUNTIME_DELTA',outside(before)==outside(after))
prior_inv=next(n for n in before.body if isinstance(n,ast.ClassDef) and n.name=='Invocation');current_inv=next(n for n in after.body if isinstance(n,ast.ClassDef) and n.name=='Invocation')
methods={n.name:n for n in current_inv.body if isinstance(n,ast.FunctionDef)}
changed={'__init__','invoke','confirm_native','receive_native','validate_native','cleanup_owned','snapshot'}
for n in prior_inv.body:
 if isinstance(n,ast.FunctionDef) and n.name not in changed:check('UNCHANGED_INVOCATION_'+n.name,ast.dump(n,include_attributes=False)==ast.dump(methods[n.name],include_attributes=False))
for name in ('confirm_native','validate_native','cleanup_owned','snapshot'):check('COMMON_TOTAL_BOUNDARY_'+name,any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='native_projection' for n in ast.walk(methods[name])))
check('NO_RAW_NATIVE_GET',not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='get' and isinstance(n.func.value,ast.Attribute) and isinstance(n.func.value.value,ast.Name) and n.func.value.value.id=='self' and n.func.value.attr=='native' for n in ast.walk(after)))
text=(S/'qualification_controller.py').read_text()
check('NO_RAW_NATIVE_TRUTHINESS','if self.native else' not in text and 'and self.native is not None' not in ast.get_source_segment(text,methods['snapshot']))
check('RETURNED_FLAG_SEPARATE_FROM_NULL','self.native=value;self.native_received=True' in text and 'if not self.native_received:self.receive_native()' in text)
projection=next(n for n in after.body if isinstance(n,ast.FunctionDef) and n.name=='native_projection');projection_text=ast.get_source_segment(text,projection)
for phrase in ('if type(value) is not dict:return out','dict.items(value)','type(key) is str','type(item) is bool','type(item) is int and -2147483648<=item<2147483648','if hash_value(item):'):
 check('TOTAL_TYPE_BARRIER_'+phrase,phrase in projection_text)
specs=json.loads((S/'code-pin-requirements.json').read_bytes())
for row in [specs['externalLoaderPin'],*specs['externalCodeSpecs']]:verify(row)
check('EXTERNAL_FOUR_CODE_SPECS',len(specs['externalCodeSpecs'])==4 and specs['installed'] is False and specs['actualAuthority'] is False)
schema=json.loads((S/'schemas.json').read_bytes());check('CLOSED_PROJECTION_SCHEMA',schema['definitions']['NativeProjection']['total'] is True and schema['definitions']['QualificationResult']['noRawSecretOrExceptionFields'] is True)
check('ADDED_THREE_CLOSED_FIELDS',all(x in schema['definitions']['QualificationResult']['fields'] for x in ('nativeResultReceived','nativeProjectionReason','nativeDrainState')))
coverage=json.loads((S/'proof-coverage.json').read_bytes());check('498_EXECUTED_135_REUSED_633_COVERAGE',coverage['executed']['totalPythonChecks']==498 and coverage['executed']['controllerFlowChecks']==222 and coverage['executed']['nativeProjectionChecks']==276 and coverage['reused']['unchangedSourceChecks']==135 and coverage['sourceControlCoverage']==633 and coverage['retainedSemanticIdentities']==357)
check('24_DECLARED_ZERO_JAVA',coverage['javaVectors']==dict(original=18,added=6,declared=24,executed=0))
check('ALL_ACTUAL_GATES_OWED',coverage['allNineActualModes']=='UNEXECUTED_OWED' and coverage['actualAuthority'] is False and coverage['ordinaryAdapterImplementationAndExactRootCallerReview']=='OWED_NOT_THIS_FIX')
qc=json.loads((Q/'checks.json').read_bytes());qf=json.loads((Q/'findings.json').read_bytes())
check('EXACT_QUINN_COMPLETE_CLEAN_SOURCE_SUPPORT',qf['subjectManifestSha256']=='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f' and qf['mandatoryFindings']==[] and len(qf['limits'])==7)
check('QUINN1005_498_135_REUSED',qc['count']==1005 and qc['allExpected'] is True and qc['affectedExecutedPython']==498 and qc['reusedUnchangedSource']==135 and qc['sourceCoverage']==633)
target=json.loads((O/'targeted-attempt01.stdout').read_bytes());check('ARIA22_ALL_EXPECTED',target['checks']==22 and all(x['passed'] is True for x in target['results']) and len(target['cases'])==4)
check('ARIA_FAKE_ONLY_NO_CALLBACKS',target['arbitraryCallbacks']==target['forbiddenBoundaryCalls']==[] and target['actualJavaCompilerFixtureTlsUnixPeerPlatformActions']==0 and target['subjectSafetyAstEdited'] is False)
check('ARIA_STDERR_EMPTY',(O/'targeted-attempt01.stderr').read_bytes()==b'')
(O/'pins.json').write_text(json.dumps(dict(subjectManifestSha256='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f',pins=pins,protectedBaselineBodyStatHash=False,currentOperationalReads=0),indent=2)+'\n')
(O/'source-checks.json').write_text(json.dumps(dict(kind='ARIA_SOURCE02_FINITE_SOURCE_PIN_AST_REUSE_CHECKS',checks=len(checks),results=checks,pinRecords=len(pins),subjectFunctionsExecuted=0,actualActions=0),indent=2)+'\n')
print(json.dumps(dict(checks=len(checks),pins=len(pins),allPassed=True,subjectFunctionsExecuted=0,actualActions=0)))

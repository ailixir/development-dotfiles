"""Finite exact SOURCE02 integrity/AST/schema/reuse checks; no target execution."""
from pathlib import Path
import ast,hashlib,json,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-public-observer-java-qualification-prep/resume2');OLD=S.parent/'resume1';O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-observer-java-qualification-source02-exact-review')
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(n,ok):
 if not ok:raise ValueError(n)
 checks.append({'id':n,'passed':True})
def pin(r,prefix=None):
 p=Path(r['path']) if prefix is None else prefix/r['path'];check('PUBLIC_ONLY_'+str(p),'/runtime/' not in str(p) and '/.gradle/' not in str(p) and not str(p).endswith('preexisting-baseline.json'))
 b=p.read_bytes();st=p.stat();mode=int(r['mode'],0) if type(r['mode'])is str else r['mode'];check('HASH_'+str(p),h(b)==r['sha256']);check('BYTES_'+str(p),len(b)==r['bytes']);check('MODE_'+str(p),stat.S_IMODE(st.st_mode)==mode);pins.append({'path':str(p),'sha256':h(b),'bytes':len(b),'mode':mode})
raw=(S/'manifest.json').read_bytes();check('EXACT_SOURCE02_MANIFEST',h(raw)=='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f');m=json.loads(raw);check('ALL74',len(m['files'])==74)
for r in m['files']:pin(r,S)
prior=json.loads((S/'verified-source01-and-review-inputs.json').read_bytes());check('EXACT87_PRIOR_SOURCE_REVIEW_ROOT_ROWS',len(prior)==87)
for r in prior:pin(r)
verified=json.loads((S/'verified-inputs.json').read_bytes())
for r in verified['currentPrepared']:pin(r)
for line in (S/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split(None,1);check('CHECKSUM_'+name,h((S/name).read_bytes())==sha)
immutable=['ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt','java-harness-status.json','qualification_custody.py','qualified_relay.py','entry_loader.py','public_contract.py','public-observation.schema.json','flow_checks.py','source_checks.py','FIXTURE-RECIPE.md','acceptance-matrix.md','finite-input-requirements.json']
for n in immutable:check('LITERAL_SOURCE01_'+n,(S/n).read_bytes()==(OLD/n).read_bytes())
check('FRAGMENT0153',h((S/'observer-fragment.java.txt').read_bytes())=='0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
check('HARNESS82A9',h((S/'ObserverBoundaryHarness.java').read_bytes())=='82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f')
newtree=ast.parse((S/'qualification_controller.py').read_bytes());oldtree=ast.parse((OLD/'qualification_controller.py').read_bytes())
def identity(n):return (type(n).__name__,getattr(n,'name',None),ast.dump(n.targets[0],include_attributes=False) if isinstance(n,ast.Assign) else None)
newmap={identity(n):n for n in newtree.body}
for n in oldtree.body:
 if isinstance(n,ast.ClassDef) and n.name=='Invocation':continue
 check('UNCHANGED_NON_INVOCATION_'+str(identity(n)),ast.dump(n,include_attributes=False)==ast.dump(newmap[identity(n)],include_attributes=False))
oldclass=next(n for n in oldtree.body if isinstance(n,ast.ClassDef) and n.name=='Invocation');newclass=next(n for n in newtree.body if isinstance(n,ast.ClassDef) and n.name=='Invocation')
changed={'__init__','invoke','confirm_native','receive_native','validate_native','cleanup_owned','snapshot'}
for n in oldclass.body:
 if isinstance(n,ast.FunctionDef) and n.name not in changed:
  other=next(x for x in newclass.body if isinstance(x,ast.FunctionDef) and x.name==n.name);check('UNCHANGED_INVOCATION_'+n.name,ast.dump(n,include_attributes=False)==ast.dump(other,include_attributes=False))
check('ONLY_NEW_PROJECTION_FUNCTION',{getattr(n,'name',None) for n in newtree.body if isinstance(n,ast.FunctionDef)}-{getattr(n,'name',None) for n in oldtree.body if isinstance(n,ast.FunctionDef)}=={'native_projection'})
for row in json.loads((S/'implementation-map.json').read_bytes()):
 b=(S/row['path']).read_bytes();check('MAP_HASH_'+row['path'],h(b)==row['sha256']);tree=ast.parse(b);check('NONREMOVABLE_'+row['path'],not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
 for f in row['functions']:check('SPAN_'+row['path']+f['name'],any(isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==f['name'].split('.')[-1] and n.lineno==f['line'] and n.end_lineno==f['endLine'] for n in ast.walk(tree)))
text=(S/'qualification_controller.py').read_text();check('NO_RAW_NATIVE_GET_OR_TRUTHINESS','self.native.get' not in text and 'if self.native else' not in text and 'if self.native is None' not in text)
for n in ['confirm_native','validate_native','cleanup_owned','snapshot']:
 node=next(x for x in newclass.body if isinstance(x,ast.FunctionDef) and x.name==n);check('COMMON_PROJECTION_'+n,any(isinstance(x,ast.Call) and isinstance(x.func,ast.Name) and x.func.id=='native_projection' for x in ast.walk(node)))
schemas=json.loads((S/'schemas.json').read_bytes());check('SCHEMA_VERSION2',schemas['schemaVersion']==2 and schemas['definitions']['NativeProjection']['total'] is True)
check('STRICT_NATIVE_PUBLIC_FIELDS',schemas['definitions']['QualificationResult']['nativeDerivedPublicTypes']=={'nativeStatus':'exact int32 or null','nativeWaited':'exact bool or null','nativeArchiveSha256':'hex64 or null','nativeProjectionReason':'NONE/ABSENT/SCHEMA/NATIVE_UNKNOWN','nativeResultReceived':'bool: wait method returned any object; never proof of direct wait/drain','nativeDrainState':'CONFIRMED only after actual owned process token close confirmation; otherwise UNKNOWN'})
req=json.loads((S/'code-pin-requirements.json').read_bytes())
for r in [req['externalLoaderPin'],*req['externalCodeSpecs']]:pin(r)
check('SOURCE_SPECS4',len(req['externalCodeSpecs'])==4 and req['installed'] is False and req['actualAuthority'] is False)
def decode(name):
 s=(O/name).read_text();summary,at=json.JSONDecoder().raw_decode(s);return summary,json.loads(s[at:])['result']
_,flow=decode('flow.stdout');_,projection=decode('projection.stdout')
check('FLOW222_15',flow['passed']==222 and flow['failed']==0 and len(flow['cases'])==15 and all(x['passed'] for x in flow['checks']))
check('PROJECTION276_28',projection['passed']==276 and projection['failed']==0 and len(projection['cases'])==28 and all(x['passed'] for x in projection['checks']))
check('CURRENT498',flow['passed']+projection['passed']==498)
check('REAL_BOUNDARIES0',flow['forbiddenBoundaryCalls']==projection['forbiddenBoundaryCalls']==[])
oldflow=json.loads((OLD/'flow-check-results.json').read_bytes());oldsource=json.loads((OLD/'source-check-results.json').read_bytes());check('ALL222_OLD_IDS',[x['name'] for x in flow['checks']]==[x['name'] for x in oldflow['checks']]);check('REUSED135_SOURCE',oldsource['passed']==135 and (S/'source_checks.py').read_bytes()==(OLD/'source_checks.py').read_bytes())
coverage=json.loads((S/'proof-coverage.json').read_bytes());check('COVERAGE633_NOT_EXECUTED',coverage['executed']['totalPythonChecks']==498 and coverage['reused']['unchangedSourceChecks']==135 and coverage['sourceControlCoverage']==633 and coverage['retainedSemanticIdentities']==357)
check('JAVA24_UNEXECUTED',coverage['javaVectors']=={'original':18,'added':6,'declared':24,'executed':0} and coverage['allNineActualModes']=='UNEXECUTED_OWED')
check('135_EXACT_RESULT_SHA',h((OLD/'source-check-results.json').read_bytes())==coverage['reused']['source01SourceResultSha256'])
check('SINGLE_READY_MODEL_ONLY',flow['singleTestOnlyReadyYield'] is True and flow['removeYieldRestoresServeAst'] is True and flow['realConcurrency'] is False)
for name in ['flow.stderr','projection.stderr','independent.stderr']:check('EMPTY_STDERR_'+name,(O/name).read_bytes()==b'')
interface=(S/'ORDINARY-INTERFACE.md').read_text();recipe=(S/'RECIPE.md').read_text()
check('ADAPTER_CALLER_EXPLICITLY_OWED','complete implementation and root caller must be independently reviewed/pinned before actual use' in interface and 'No root-authored unreviewed wrapper' in recipe)
check('NO_PROFILE_BORROW','future Gateway limited profile is unintegrated' in recipe)
metadata=json.loads((S/'metadata-checks.json').read_bytes());check('42_AUTHOR_METADATA_ATTRIBUTION',metadata['passed']==42 and metadata['failed']==0 and metadata['targetFunctionsExecuted']==0)
existing=json.loads((O/'pins.json').read_bytes());existing['pins']=pins;existing['priorSourceAndReviewRows']=87;existing['protectedBaselineBodyStatHash']=False;(O/'pins.json').write_text(json.dumps(existing,indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'INDEPENDENT_SOURCE02_FINITE_INTEGRITY_AST_REUSE_CHECKS','count':len(checks),'checks':checks,'allExpected':True,'affectedExecutedPython':498,'reusedUnchangedSource':135,'sourceCoverage':633,'retainedSource01SemanticIds':357,'prior921Replayed':0,'declaredJava':24,'executedJava':0,'subjectFunctionsExecutedByStaticChecker':0,'actualActions':0,'newBookkeepingFailures':[]},indent=2)+'\n')
print(json.dumps({'staticChecks':len(checks),'affected498Passed':True,'reused135':True,'coverage633NotExecutions':True,'actualActions':0}))

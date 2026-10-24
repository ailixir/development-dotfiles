"""Actual new PURE boundaries only. No packet/main/observer/OS or runtime-artifact invocation."""
from pathlib import Path
import ast,builtins,copy,hashlib,json,math,re,runpy,sys,types
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());E=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume3/execution'
def H(x):return hashlib.sha256(x if isinstance(x,bytes) else x.encode()).hexdigest()
def pure_gate():
 tree=ast.parse((O/'unlock_gate.py').read_text());scope={'re':re,'json':json,'builtins':builtins,'types':types,'hashlib':hashlib,'ast':ast}
 constants={'REDUCER_ASSESSOR_SHA','REPORT_INVENTORY_SHA','EXECUTION_CHECKS_SHA','CLASSIFICATION_SHA'}
 for n in tree.body:
  if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants:scope[n.targets[0].id]=ast.literal_eval(n.value)
 names={'Hold','need','digest','task_reducer','load_pure_execution','blocked_report_rule','report_manifest_requirements','selected_build_task_requirements','native_task_log_requirements','loaded_metadata_unchanged'}
 nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names];assert len(nodes)==len(names)
 exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-pure-integration-boundaries>','exec'),scope);return scope

def main():
 g=pure_gate();checks=(E/'execution_checks.py').read_bytes();inventory=(E/'report_inventory.py').read_bytes();assessor=(E/'assessor.py').read_bytes();classification=(E/'evidence_classification.py').read_bytes()
 module=g['load_pure_execution'](checks,inventory,g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA'])
 reducer=g['task_reducer'](assessor,g['REDUCER_ASSESSOR_SHA']);blocked=g['blocked_report_rule'](classification,g['CLASSIFICATION_SHA'])
 api=json.loads((E/'pure-api.json').read_text());tree=ast.parse(assessor.decode())
 for name in ('task_event_proof','task_statuses'):
  node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
  assert H(ast.dump(node,include_attributes=False))==api['sources']['assessor.py']['functionAstSha256'][name]
 results=[]
 def accepted(name,run):run();results.append({'control':name,'expected':'ACCEPT','observed':'ACCEPT'})
 def denied(name,run):
  try:run()
  except (g['Hold'],ValueError,KeyError,TypeError):results.append({'control':name,'expected':'HOLD','observed':'HOLD'})
  else:raise AssertionError('escaped: '+name)
 def selected(log,exit=0):
  ev=reducer['task_event_proof'](log);proof={'taskEventProof':ev,'exit':exit,'taskStatus':ev['statuses'].get('compileTestJava','ABSENT'),'buildSuccessful':ev['buildSuccessfulMarker'] and not ev['buildFailedMarker']}
  return g['selected_build_task_requirements'](reducer,log,proof,{'collectorExit':exit})
 def native(log,outcome='PASS',exit=0):
  ev=reducer['task_event_proof'](log);required={t:ev['statuses'].get(t,'ABSENT') for t in module['TASKS']}
  a={'validationOutcome':outcome,'taskEventProof':ev,'requiredTaskStatuses':required};c={'taskEventProof':copy.deepcopy(ev),'requiredTaskStatuses':copy.deepcopy(required)}
  return g['native_task_log_requirements'](reducer,log,a,c,exit)
 green='\n'.join(['> Task :compileTestJava']*3+['> Task :'+t for t in module['TASKS'] for _ in range(2)]+['BUILD SUCCESSFUL in 5s'])
 failed='\n'.join(['> Task :test']*41+['> Task :test FAILED','BUILD FAILED in 5s'])
 accepted('repeated-context-green-native-boundary',lambda:native(green))
 accepted('repeated-context-successful-compile-boundary',lambda:selected(green))
 accepted('41-context-then-one-FAILED-native-pair',lambda:native(failed,'FAIL',1))
 ev=native(failed,'FAIL',1);assert ev['statuses']['test']=='FAILED' and ev['states']['test']=='FAILED_TERMINAL' and len(ev['events'])==42 and ev['events'][40]['lineOrdinal']==41 and ev['events'][41]['rawLine']=='> Task :test FAILED' and ev['unadornedHeadersAreCompletionProof'] is False
 denied('41-context-FAILED-cannot-be-green',lambda:native(failed,'PASS',0))
 accepted('failed-native-then-distinct-real-compile0-pair',lambda:(native(failed,'FAIL',1),selected('> Task :compileTestJava\n> Task :compileTestJava\nBUILD SUCCESSFUL in 2s')))
 denied('header-alone-is-not-build-completion',lambda:selected('> Task :compileTestJava'))
 denied('success-marker-with-nonzero-native',lambda:selected('> Task :compileTestJava\nBUILD SUCCESSFUL in 2s',1))
 denied('missing-required-task',lambda:native(green.replace('> Task :crossReplicaTest\n','')))
 for name,suffix in [('FAILED','FAILED'),('SKIPPED','SKIPPED'),('UP-TO-DATE','UP-TO-DATE'),('FROM-CACHE','FROM-CACHE'),('NO-SOURCE','NO-SOURCE')]:
  denied('explicit-'+name+'-compile-not-success',lambda suffix=suffix:selected('> Task :compileTestJava\n> Task :compileTestJava '+suffix+'\nBUILD SUCCESSFUL in 2s'))
 for name,log in [('header-after-terminal','> Task :test FAILED\n> Task :test'),('repeated-terminal','> Task :test FAILED\n> Task :test FAILED'),('conflicting-terminal','> Task :test FAILED\n> Task :test SKIPPED'),('unknown-status','> Task :test UNKNOWN')]:
  denied(name,lambda log=log:reducer['task_event_proof'](log))
 denied('wrong-assessor-source-pin',lambda:g['task_reducer'](assessor+b'\n# drift',g['REDUCER_ASSESSOR_SHA']))
 denied('wrong-task-event-proof',lambda:g['selected_build_task_requirements'](reducer,green,{'taskEventProof':{},'exit':0,'taskStatus':'EXECUTED','buildSuccessful':True},{'collectorExit':0}))
 # This is the same actual private pair loader used by load_packet; no sys.path setup.
 def minimal_coverage():
  roots=list(module['_pinned_report_inventory']['ROOT_PAGES'])
  return {'currentXmlDynamicInventory':{'complete':True,'linksValid':True,'allExpectedFresh':True,'errors':[],'expectedPaths':roots,'actualPaths':roots,'xmlCounts':{'packages':0,'classes':0,'sourcefiles':0,'sourceIndexes':0},'currentXmlSha256':H('xml')},'requiredTaskStatuses':{t:'EXECUTED' for t in module['TASKS']},'execTasks':['test','guidedIncrementalTest','crossReplicaTest'],'allExecsFreshNonempty':True,'staticOutputOccurrences':29,'staticDistinctResources':23,'lineRatios':{k:.99 for k in module['FLOORS']},**{k:True for k in ('mergedSessionsExactExecUnion','allInternalSessionsCurrent','dynamicArtifactsFresh','dynamicInventoryComplete','dynamicLinksValid','allExpectedDynamicFresh','staticResourcesExact','freshReport','nativeReportAndVerificationSuccessful')}}
 def clean_loader():
  saved=sys.modules.pop('report_inventory',None)
  try:
   n=g['load_pure_execution'](checks,inventory,g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA']);assert n['coverage_errors'](minimal_coverage())==[] and 'report_inventory' not in sys.modules
  finally:
   if saved is not None:sys.modules['report_inventory']=saved
 accepted('clean-module-real-loader-and-coverage-API',clean_loader)
 def poison_loader():
  poison=types.ModuleType('report_inventory');poison.ROOT_PAGES=('POISON',);poison.canonical_path=lambda _:False
  saved=sys.modules.get('report_inventory');sys.modules['report_inventory']=poison
  original=g['builtins'];proxy=types.ModuleType('_injected_builtins');proxy.__dict__.update(vars(builtins));delegations=[]
  def trap(name,*args,**kwargs):
   if name=='report_inventory':delegations.append(name);raise AssertionError('global path/cache lookup used')
   return builtins.__import__(name,*args,**kwargs)
  proxy.__import__=trap;g['builtins']=proxy
  try:
   n=g['load_pure_execution'](checks,inventory,g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA']);assert n['coverage_errors'](minimal_coverage())==[] and not delegations and sys.modules['report_inventory'] is poison
  finally:
   g['builtins']=original
   if saved is None:sys.modules.pop('report_inventory',None)
   else:sys.modules['report_inventory']=saved
 accepted('poisoned-cache-and-global-import-trap-ignored',poison_loader)
 for name,bits,pin in [('missing-inventory',b'',g['REPORT_INVENTORY_SHA']),('tampered-inventory',inventory+b'\n# drift',g['REPORT_INVENTORY_SHA']),('unbound-inventory',inventory,'UNBOUND'),('wrong-inventory-pin',inventory,H('wrong'))]:
  denied(name,lambda bits=bits,pin=pin:g['load_pure_execution'](checks,bits,g['EXECUTION_CHECKS_SHA'],pin))
 denied('tampered-checker',lambda:g['load_pure_execution'](checks+b'\n# drift',inventory,g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA']))
 denied('swapped-sibling',lambda:g['load_pure_execution'](checks,checks,g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA']))
 # Genuine synthetic current parser output; no actual XML/HTML/JAR/report artifact is read.
 inv=module['_pinned_report_inventory'];xml=b'<report name="pure-fixture"/>'
 bodies={'jacocoTestReport.xml':xml,'html/index.html':b'<a href="jacoco-sessions.html">sessions</a>','html/jacoco-sessions.html':b'<a href="index.html">index</a>'}
 rows=[{'path':p,'data':data,'sha256':H(data),'bytes':len(data),'mtimeNs':1050_000_000_000,'mode':'0o644','stable':True,'symlink':False} for p,data in sorted(bodies.items())]
 catalog=json.loads((E/'static-resource-catalog.json').read_text());static=[c for c in catalog['resources'] if c['generator']=='JaCoCo0.8.12-html-report'];assert len(static)==20
 static=sorted(static,key=lambda x:x['reportRelativePath']);paths=[c['reportRelativePath'] for c in static]
 current=inv['validate_dynamic_report'](xml,rows,paths,1000.,1100.);assert current['complete'] is True
 facts=[{'reportRelativePath':x['path'],'path':'backend/build/reports/jacoco/test/'+x['path'],**{k:x[k] for k in ('sha256','bytes','mtimeNs','mode')}} for x in rows]
 facts +=[{'reportRelativePath':x['reportRelativePath'],'path':'backend/build/reports/jacoco/test/'+x['reportRelativePath'],'sha256':x['resourceSha256'],'bytes':x['resourceBytes'],'mtimeNs':1_000_000_000,'mode':'0o644'} for x in static];facts.sort(key=lambda x:x['reportRelativePath'])
 metadata=[{'path':x['reportRelativePath'],**{k:x[k] for k in ('bytes','mtimeNs','mode')},'regular':True,'stable':True,'uncredited':True} for x in facts]
 manifest={'currentXmlDynamicInventory':current,'originalFacts':facts,'staticReportPaths':paths,'originalFactsCapturedBeforeArchive':True,'historicalInventoryUsed':False,'uncreditedExistingReportMetadata':metadata}
 cov={'currentXmlDynamicInventory':copy.deepcopy(current),'reportManifestBeforeArchiveSha256':H(json.dumps(manifest,sort_keys=True)),'reportDisposition':'CURRENT_REPORT_CLAIM','reportArtifacts':[{'original':{k:v for k,v in x.items() if k!='reportRelativePath'},'archive':{'path':'synthetic-copy/'+x['reportRelativePath']}} for x in facts],'staticResources':[{'catalog':x} for x in static],'reportObservation':{'complete':True,'noCurrentFiles':False,'metadata':metadata}}
 def verify_manifest(m,c,claimed_sha=None,preserved=None):
  actual_sha=H(json.dumps(m,sort_keys=True))
  g['report_manifest_requirements'](m,c,preserved or {'coverageProofSha256':H('coverage')},actual_sha if claimed_sha is None else claimed_sha,H('coverage'),1000.,inv,blocked)
 accepted('current-before-archive-real-schema-crosslinks',lambda:verify_manifest(manifest,cov))
 def mutate(name,change,coherent=False):
  m,c=copy.deepcopy(manifest),copy.deepcopy(cov);change(m,c)
  if coherent:c['reportManifestBeforeArchiveSha256']=H(json.dumps(m,sort_keys=True))
  denied(name,lambda:verify_manifest(m,c))
 mutate('physical-manifest-drift',lambda m,c:m.__setitem__('originalFactsCapturedBeforeArchive',False))
 mutate('coherent-current-incomplete-inventory-hard-HOLD',lambda m,c:(m['currentXmlDynamicInventory'].__setitem__('complete',False),c['currentXmlDynamicInventory'].__setitem__('complete',False)),True)
 mutate('manifest-inventory-mismatch',lambda m,c:c['currentXmlDynamicInventory'].__setitem__('linksValid',False))
 mutate('precopy-original-vs-archive-original-drift',lambda m,c:m['originalFacts'][0].__setitem__('sha256',H('other')),True)
 mutate('current-xml-fact-hash-drift',lambda m,c:(m['currentXmlDynamicInventory'].__setitem__('currentXmlSha256',H('other')),c['currentXmlDynamicInventory'].__setitem__('currentXmlSha256',H('other'))),True)
 mutate('dynamic-original-facts-drift',lambda m,c:(m['currentXmlDynamicInventory']['originalFacts'][0].__setitem__('mode','0o777'),c['currentXmlDynamicInventory']['originalFacts'][0].__setitem__('mode','0o777')),True)
 mutate('static-report-path-drift',lambda m,c:m['staticReportPaths'].pop(),True)
 denied('preserved-proof-coverage-link-drift',lambda:verify_manifest(manifest,cov,preserved={'coverageProofSha256':H('other')}))
 denied('missing-physical-manifest',lambda:verify_manifest({},cov))
 report_key='full-check/report-manifest-before-archive.json';stored={report_key:b'original'};pins={report_key:H(stored[report_key])}
 assert g['loaded_metadata_unchanged'](pins,stored.__getitem__) is True;stored[report_key]=b'changed';assert g['loaded_metadata_unchanged'](pins,stored.__getitem__) is False
 results.append({'control':'same-loaded-manifest-current-recheck-detects-drift','expected':'HOLD','observed':'HOLD'})
 required={t:'EXECUTED' for t in module['TASKS']};required.update(test='FAILED',**{t:'ABSENT' for t in module['TASKS'][3:]})
 conditions={k:True for k in ('caseIdentitiesAndSkipsExact','xmlCollectorMultisetExact','taskCollectionComplete','sourceAndTestInputsStable','taskOutputEvidenceClean','publicProofEvidenceClean','ownedObservationClean','threeExecsFreshAndCurrent','bothCohortBoundariesComplete','retentionTasksExecuted','testFailureMatchesXml','reportObservationComplete','noCurrentReportFiles')}
 conditions.update(nativeGradleExit=1,collectorExit=1,ownedForegroundExit=1,taskEventStates={'test':'FAILED_TERMINAL'},frozenGradleBuildSha256='fee7af874cc0875d8dd299f8f9e1a0739ae79347ba0b0de665c81931045cbe74')
 empty={'complete':False,'linksValid':False,'allExpectedFresh':False,'errors':['CURRENT_REPORT_XML_MISSING'],'expectedPaths':[],'actualPaths':[]}
 stale_meta=[{'path':'old-index.html','mtimeNs':1_000_000_000,'bytes':1,'mode':'0o644','regular':True,'stable':True,'uncredited':True}]
 bm={'currentXmlDynamicInventory':empty,'originalFacts':[],'staticReportPaths':[],'originalFactsCapturedBeforeArchive':True,'historicalInventoryUsed':False,'uncreditedExistingReportMetadata':stale_meta}
 bc={'currentXmlDynamicInventory':copy.deepcopy(empty),'reportManifestBeforeArchiveSha256':H(json.dumps(bm,sort_keys=True)),'reportDisposition':'BLOCKED_AFTER_EXPLICIT_FAILED_TEST','requiredTaskStatuses':required,'failedTestReportEvidence':conditions,'allExecsFreshNonempty':True,'allInternalSessionsCurrent':True,'staticOutputOccurrences':9,'staticDistinctResources':3,'lineRatios':{},'freshReport':False,'reportArtifacts':[],'reportObservation':{'complete':True,'noCurrentFiles':True,'metadata':stale_meta}}
 accepted('known-failed-no-current-report-zero-body-zero-ratio',lambda:verify_manifest(bm,bc))
 for name,change in [('blocked-current-old-metadata',lambda m,c:m['uncreditedExistingReportMetadata'][0].__setitem__('mtimeNs',1050_000_000_000)),('blocked-unstable-metadata',lambda m,c:m['uncreditedExistingReportMetadata'][0].__setitem__('stable',False)),('blocked-copied-body',lambda m,c:c['reportArtifacts'].append({'original':{}})),('blocked-ratios-forbidden',lambda m,c:c['lineRatios'].__setitem__('bundle',.99)),('blocked-not-actual-Test-failure',lambda m,c:c['requiredTaskStatuses'].__setitem__('test','EXECUTED'))]:
  m,c=copy.deepcopy(bm),copy.deepcopy(bc);change(m,c);c['reportManifestBeforeArchiveSha256']=H(json.dumps(m,sort_keys=True));denied(name,lambda m=m,c=c:verify_manifest(m,c))
 # Exercise hard new execution admission errors through actual current gate predicates,
 # even with fully matching synthetic QA/root qualification records.
 prior,fixture,refresh,full_gate,live=runpy.run_path(str(O/'pure_controls.py'),run_name='pure_fixture_definitions')['main'](True)
 assert prior['count']==61
 for label,mutate in [('assessment-evidence-hard-not-qualifiable',lambda b:b['proofs']['assessment'].__setitem__('evidenceErrors',['TASK_COLLECTION_INCOMPLETE'])),
                      ('prior-owned-gap-hard-not-qualifiable',lambda b:b['receipts']['full-check'].__setitem__('ownedIdentityObservationGap',True))]:
  b=fixture(True);mutate(b);refresh(b)
  assert any(x.startswith('STANDARD_RECONCILE_') for x in b['executionErrors'])
  basis=full_gate['qualification_basis'](b['ready']);b['qaSha']=H('qa');b['rootQualificationSha']=H('root')
  q={'unitLabel':b['release']['label'],'rootReleaseSha256':b['releaseSha'],'qualificationEvidenceSha256':basis,'gaps':b['ready']['gaps'],'acceptCurrentQualifiedClosure':True,'historicalRepairClaim':False}
  b['qa']=dict(q,role='independent-qa',independentOfRunner=True);b['rootQualification']=dict(q,role='root',qaQualificationSha256=b['qaSha'])
  b['permit'].update(qualificationEvidenceSha256=basis,qaQualificationSha256=b['qaSha'],rootQualificationSha256=b['rootQualificationSha'])
  try:full_gate['assess'](b,live,1001.,1)
  except full_gate['Hold'] as error:
   assert str(error)=='EXECUTION_PROOF_INCOHERENT';results.append({'control':label,'expected':'HOLD','observed':'HOLD'})
  else:raise AssertionError('generic qualification widened admission')
 return {'status':'PURE_ACTUAL_INTEGRATION_BOUNDARIES_PASS','count':len(results),'controls':results,'pinnedReducerAstExact':True,'actualPurePairLoaderAndCoverageAPIExercised':True,'actualGatePacketProducerObserverOrOSMainExecuted':False,'actualRuntimePrivateNativeSourceAction':False,'readinessOrRelease':False}
if __name__=='__main__':print(json.dumps(main(),indent=2))

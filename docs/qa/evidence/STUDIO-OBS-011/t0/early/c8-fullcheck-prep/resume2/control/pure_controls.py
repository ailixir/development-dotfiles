"""Injected synthetic/pinned-public-data controls only; no gate main, observer or subprocess."""
from pathlib import Path
from collections import Counter
import ast,builtins,collections,copy,hashlib,json,math,re,types
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';E=T/'early/c8-fullcheck-prep/resume3/execution'
def read(p):return json.loads(p.read_text())
def H(s):return hashlib.sha256(s.encode()).hexdigest()
def pure_scope(path,names,constants=()):
    tree=ast.parse(path.read_text());scope={'Path':Path,'json':json,'hashlib':hashlib,'re':re,'math':math,'collections':collections,'builtins':builtins,'types':types}
    for n in tree.body:
        if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants:scope[n.targets[0].id]=ast.literal_eval(n.value)
    selected=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names]
    assert len(selected)==len(names)
    exec(compile(ast.Module(body=selected,type_ignores=[]),'<injected-pure-only>','exec'),scope)
    return scope

def main(return_fixture_context=False):
 g=pure_scope(O/'unlock_gate.py',{'Hold','need','digest','compact','identities','accepted_files','source_snapshot','validation_record','qualification_basis','ready_requirements','requirements','fresh','current_observation_requirements','assess','load_pure_execution'}, {'SOURCE','DIST','CORE_SHA','PLAN_SHA','PHASES','OVERLAY','QUALIFIABLE_EXECUTION_ERRORS','SUCCESSOR_PLAN_SHA','SUCCESSOR_CATALOG_SHA','ACCEPTED_MODES_SHA','EXECUTION_CHECKS_SHA','REPORT_INVENTORY_SHA'})
 e=g['load_pure_execution']((E/'execution_checks.py').read_bytes(),(E/'report_inventory.py').read_bytes(),g['EXECUTION_CHECKS_SHA'],g['REPORT_INVENTORY_SHA'])
 core=T/'early/fullcheck-harness/resume3/harness.py'
 own=pure_scope(core,{'owned_census_keys','classify_owned','pending_owned','ownership_drain_decision'})
 base=read(T/'early/fullcheck-harness/resume3/plan.json');files=g['accepted_files'](base)
 modes=read(T/'runtime/gst-restricted-unit06/original-modes.json');policy=read(O/'policy.json')
 def fixture(failed=False):
  evidence={n:H(n) for n in ['input-modes.json','closure-input.json','owned-full-check/receipt.json','full-check/outer-receipt.json','full-check/public-join-proof.json','full-check/preserved-public-evidence.json','full-check/assessment.json','full-check/catalog-proof.json','full-check/coverage-proof.json','full-check/report-manifest-before-archive.json','full-check/source-before.json','full-check/source-after.json','full-check/build-provenance.json']}
  if failed:
   for n in ['owned-compile-reconcile/receipt.json','compile-reconcile-authorization.json','compile-reconcile/source-before.json','compile-reconcile/source-after.json','compile-reconcile/build-provenance.json']:evidence[n]=H(n)
  r={'authorizedBy':'root','immutableBasePlanSha256':g['PLAN_SHA'],'sourceDigest':g['SOURCE'],'label':'obs011-t0-c8-check01','writers':[],'nativeCommandReleased':True,'fullAcceptedSuccessorFreshCheckAuthorized':True,'maximumCollectorInvocations':1,'maximumCompileReconcileInvocations':1,'expectedPlanSha256':g['SUCCESSOR_PLAN_SHA'],'expectedCatalogSha256':g['SUCCESSOR_CATALOG_SHA'],'phaseKeeperSha256':H('keeper'),'controlPackagePins':{'control/final_verifier.py':H('producer')},'unlockGuard':{'enabled':True,'protocol':'C8_UNLOCK_V1','hashes':{'unlock_gate.py':H('gate'),'guard-exit.bash':H('bash'),'policy.json':H('policy')},'historicalGapCodes':copy.deepcopy(policy['requiredHistoricalGapCodes'])}}
  r['sourceLease']={'exclusive':True,'sourceDigest':g['SOURCE'],'expectedPlanSha256':r['expectedPlanSha256'],'wholeSourceModes':True,'productWrites':False}
  pin={'wrapperPid':100,'shellPid':101,'wrapperStart':'wrapper-start','shellStart':'shell-start','lockDevInode':[1,2],'rootUnitAuthorizationSha256':H('release'),'kernelExclusiveLockObserved':True}
  def receipt(phase,code,pid):return {'phase':phase,'status':'NATIVE_PHASE_TERMINAL','rootUnitAuthorizationSha256':H('release'),'lockPin':copy.deepcopy(pin),'phaseKeeperSha256':r['phaseKeeperSha256'],'ownershipCoreSha256':g['CORE_SHA'],'collectorExit':code,'phaseExit':code,'rawNativePhaseExit':code,'validationErrors':[],'phases':[{'phase':'NATIVE_PHASE_TERMINAL','exit':code}],'ownedIdentities':[{'pid':pid,'start':'owned-'+str(pid)}],'remainingOwnedNonJvmFacts':[],'evidenceErrors':[],'sourceWrites':0,'automaticRetry':False,'collectorInvocations':1 if phase=='full-check' else 0,'compileReconcileInvocations':1 if phase=='compile-reconcile' else 0}
  receipts={'full-check':receipt('full-check',1 if failed else 0,200)}
  if failed:receipts['compile-reconcile']=receipt('compile-reconcile',0,201)
  source={'sourceDigest':g['SOURCE'],'sourceFiles':1808,'files':copy.deepcopy(files),'distDigest':g['DIST'],'distFiles':238,'mainFiles':506,'modesExact':True,'auxiliariesExact':True,'modes':copy.deepcopy(modes)}
  phase='compile-reconcile' if failed else 'full-check'
  build={'phase':phase,'exit':0,'taskStatus':'EXECUTED','buildSuccessful':True,'acceptedSourceEqual':True,'sourceDigest':g['SOURCE'],'taskLogSha256':H('actual-log'),'sourceBeforeSha256':evidence[phase+'/source-before.json'],'sourceAfterSha256':evidence[phase+'/source-after.json'],'phaseReceiptSha256':evidence['owned-'+phase+'/receipt.json'],'command':['./gradlew','--offline','compileTestJava','--rerun-tasks','--no-daemon'] if failed else ['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon']}
  a={'validationOutcome':'FAIL' if failed else 'PASS','fullGateSucceeded':not failed,'nativeGradleExit':1 if failed else 0,'collectorExit':1 if failed else 0,'rawHarnessExit':1 if failed else 0,'validationErrors':['ACCOUNTED_NATIVE_FAILURE'] if failed else [],'evidenceErrors':[],'errorClassificationComplete':True,'unknownClassificationErrors':[]}
  coverage={'requiredTaskStatuses':{t:'EXECUTED' for t in e['TASKS']},'execTasks':['test','guidedIncrementalTest','crossReplicaTest'],'allExecsFreshNonempty':True,'mergedSessionsExactExecUnion':True,'allInternalSessionsCurrent':True,'dynamicArtifactsFresh':True,'staticResourcesExact':True,'freshReport':True,'nativeReportAndVerificationSuccessful':True,'staticOutputOccurrences':29,'staticDistinctResources':23,'lineRatios':{k:.99 for k in e['FLOORS']}}
  coverage.update(dynamicInventoryComplete=True,dynamicLinksValid=True,allExpectedDynamicFresh=True,
      currentXmlDynamicInventory={'complete':True,'linksValid':True,'allExpectedFresh':True,'errors':[],
       'expectedPaths':list(e['_pinned_report_inventory']['ROOT_PAGES']),'actualPaths':list(e['_pinned_report_inventory']['ROOT_PAGES']),
       'xmlCounts':{'packages':0,'classes':0,'sourcefiles':0,'sourceIndexes':0},'currentXmlSha256':H('current-xml')})
  auth=None
  if failed:auth={'decision':'AUTHORIZE_ONE_COMPILE_RECONCILE','rootReleaseSha256':H('release'),'activeLockSha256':H('pin'),'fullCheckReceiptSha256':evidence['owned-full-check/receipt.json'],'assessmentSha256':evidence['full-check/assessment.json'],'maximumInvocations':1,'sourceDigest':g['SOURCE'],'authorizedBy':'root','authorized':True,'phase':'compile-reconcile','preservedEvidenceSha256':evidence['full-check/preserved-public-evidence.json'],'sourceBeforeSha256':evidence['full-check/source-before.json'],'sourceAfterSha256':evidence['full-check/source-after.json']}
  b={'policy':copy.deepcopy(policy),'release':r,'releaseSha':H('release'),'expectedReleaseSha':H('release'),'activeSha':H('pin'),'installedUnit':r['label'],'planSha':g['SUCCESSOR_PLAN_SHA'],'catalogSha':g['SUCCESSOR_CATALOG_SHA'],'plan':{'source':{'files':copy.deepcopy(files),'digest':g['SOURCE']},'sourceModes':copy.deepcopy(modes)},'catalog':{},'expectedFiles':copy.deepcopy(files),'modes':copy.deepcopy(modes),'acceptedModes':copy.deepcopy(modes),'pin':pin,'codeHashes':copy.deepcopy(r['unlockGuard']['hashes']),'receipts':receipts,'evidenceHashes':evidence,'readinessSha':H('ready'),'closureInput':{'manualGaps':[],'ownedPorts':[],'expectedWrapperExit':1 if failed else 0},'proofs':{'assessment':a,'catalogProof':{'passed':True,'errors':[]},'coverageProof':coverage,'sourceBefore':source,'sourceAfter':copy.deepcopy(source),'buildProvenance':build,'reconcileAuthorization':auth,'reconcileSourceBefore':source,'reconcileSourceAfter':copy.deepcopy(source)}}
  refresh(b);return b
 def refresh(b):
  failed=b['proofs']['assessment']['validationOutcome']!='PASS';phase='compile-reconcile' if failed else 'full-check'
  b['executionErrors']=e['validate_close_evidence']({'fullCheckReceipt':b['receipts'].get('full-check'),'assessment':b['proofs']['assessment'],'catalogProof':b['proofs']['catalogProof'],'coverageProof':b['proofs']['coverageProof'],'buildProvenance':b['proofs']['buildProvenance'],'reconcileReceipt':b['receipts'].get('compile-reconcile'),'reconcileAuthorization':b['proofs']['reconcileAuthorization'],'sourceBefore':b['proofs']['sourceBefore'],'sourceAfter':b['proofs']['sourceAfter'],'evidencePins':b['evidenceHashes'],'expectedWrapperExit':b['closureInput']['expectedWrapperExit']})
  gaps=set(b['closureInput']['manualGaps'])
  for r in b['receipts'].values():
   gaps|={k for k in policy['gapKeys'] if r.get(k,False)}
   if r['evidenceErrors'] or r.get('interrupted',False) or r.get('sourceObservationGap',False):gaps.add('resourceObservationGap')
  if b['executionErrors'] or b['proofs']['assessment']['evidenceErrors']:gaps.add('resourceObservationGap')
  owned=set().union(*(g['identities'](r['ownedIdentities']) for r in b['receipts'].values()))
  v={'protocol':'C8_UNLOCK_V1','unitLabel':b['release']['label'],'rootReleaseSha256':b['releaseSha'],'activeLockSha256':b['activeSha'],'status':'QUALIFIED_VERIFIED' if gaps else 'VERIFIED','verificationExit':0,'verifiedAtEpoch':1000.,'expectedWrapperExit':b['closureInput']['expectedWrapperExit'],'retroactiveRepairClaim':False,'historicalGapCodes':b['release']['unlockGuard']['historicalGapCodes'],'evidencePins':b['evidenceHashes'],'phaseState':{'full-check':'TERMINAL','compile-reconcile':'TERMINAL' if failed else 'NOT_STARTED'},'source':{'disposition':'UNCHANGED_ACCEPTED_SUCCESSOR','digest':g['SOURCE'],'overrides':{},'expectedPlanSha256':b['release']['expectedPlanSha256']},'build':{'phase':phase,'exit':0,'sourceDigest':g['SOURCE'],'provenanceSha256':b['evidenceHashes'][phase+'/build-provenance.json']},'validation':g['validation_record'](b),'resources':{'foregroundTerminal':True,'recordedSetComplete':True,'extraOwned':[],'recordedOwned':[{'pid':pid,'start':start} for pid,start in sorted(owned)],'ownedPorts':b['closureInput']['ownedPorts']},'manualGaps':b['closureInput']['manualGaps'],'gaps':sorted(gaps),'producerSha256':H('producer')}
  b['ready']=v;b['permit']={k:copy.deepcopy(v[k]) for k in ['unitLabel','rootReleaseSha256','activeLockSha256','expectedWrapperExit','evidencePins','phaseState','source','build','validation','resources','gaps','historicalGapCodes']};b['permit'].update(decision='AUTHORIZE_LOCK_RELEASE',readinessSha256=b['readinessSha'])
 live={'observationOk':True,'parentLockCurrent':True,'sourceDigest':g['SOURCE'],'modesMatch':True,'auxiliaryInputsMatch':True,'metadataUnchanged':True,'liveOwned':[],'unexpectedHolderDescendants':[],'liveOwnedPorts':[],'inheritedMatched':6,'boundaryDefects':False}
 results=[]
 def allow(name,b,observation=None):
  value=g['assess'](b,observation or live,1001.,b['ready']['expectedWrapperExit']);assert value['C8Credit'] is False;results.append({'control':name,'expected':'ALLOW','observed':'ALLOW'})
 def deny(name,mutate,failed=False,update=True,observation=None):
  b=fixture(failed);mutate(b)
  try:
   if update:refresh(b)
   g['assess'](b,observation or live,1001.,b['ready']['expectedWrapperExit'])
  except (g['Hold'],KeyError,TypeError,ValueError):results.append({'control':name,'expected':'HOLD','observed':'HOLD'})
  else:raise AssertionError('negative escaped: '+name)
 allow('complete-green-no-reconcile',fixture())
 allow('accounted-failed-separate-actual-compile0-nonzero',fixture(True))
 deny('source-overlay-extra',lambda b:b['plan']['source']['files'].append({'path':'extra','sha256':H('extra')}))
 def drift_source(b,predicate):
  next(x for x in b['proofs']['sourceAfter']['files'] if predicate(x['path']))['sha256']=H('source-drift')
 deny('changed-main',lambda b:drift_source(b,lambda n:n.startswith('backend/src/main/')))
 deny('changed-Replay',lambda b:drift_source(b,lambda n:n.endswith('/GuidedPublicationReplayIT.java')))
 deny('mode-drift',lambda b:b['modes'].__setitem__(next(iter(modes)),0o777))
 deny('dist-drift',lambda b:b['proofs']['sourceAfter'].__setitem__('distDigest',H('dist')))
 deny('missing-source-proof',lambda b:b['proofs'].pop('sourceAfter'),update=False)
 deny('writer-fiction',lambda b:b['release'].__setitem__('writers',[{'file':'any'}]))
 deny('wrong-source-lease',lambda b:b['release']['sourceLease'].__setitem__('exclusive',False))
 deny('missing-fresh-exec',lambda b:b['proofs']['coverageProof'].__setitem__('allExecsFreshNonempty',False))
 deny('cached-task',lambda b:b['proofs']['coverageProof']['requiredTaskStatuses'].__setitem__('check','UP-TO-DATE'))
 deny('stale-internal-session',lambda b:b['proofs']['coverageProof'].__setitem__('allInternalSessionsCurrent',False))
 deny('stale-dynamic-report',lambda b:b['proofs']['coverageProof'].__setitem__('dynamicArtifactsFresh',False))
 deny('static-resource-mismatch',lambda b:b['proofs']['coverageProof'].__setitem__('staticResourcesExact',False))
 deny('coverage-floor',lambda b:b['proofs']['coverageProof']['lineRatios'].__setitem__('bundle',.69))
 deny('catalog-proof-missing-case',lambda b:b['proofs']['catalogProof'].__setitem__('passed',False))
 deny('code-hash-mismatch',lambda b:b['codeHashes'].__setitem__('unlock_gate.py',H('other-code')))
 deny('wrong-status',lambda b:b['ready'].__setitem__('status','READY'),update=False)
 deny('wrong-inode-pin',lambda b:b['pin'].__setitem__('lockDevInode',[9,9]))
 deny('nonfinite-floor',lambda b:b['proofs']['coverageProof']['lineRatios'].__setitem__('bundle',float('nan')))
 deny('infinite-floor',lambda b:b['proofs']['coverageProof']['lineRatios'].__setitem__('bundle',float('inf')))
 deny('wrong-root-sha',lambda b:b.__setitem__('expectedReleaseSha',H('wrong')))
 deny('wrong-active-pin',lambda b:b['pin'].__setitem__('shellStart','changed'))
 deny('wrong-ready-hash',lambda b:b['permit'].__setitem__('readinessSha256',H('wrong')),update=False)
 deny('stale-60seconds',lambda b:b['ready'].__setitem__('verifiedAtEpoch',940.),update=False)
 deny('future-readiness',lambda b:b['ready'].__setitem__('verifiedAtEpoch',1002.),update=False)
 deny('failed-without-reconcile',lambda b:b['receipts'].pop('compile-reconcile'),failed=True)
 deny('failed-without-root-compile-decision',lambda b:b['proofs'].__setitem__('reconcileAuthorization',None),failed=True)
 deny('failed-cached-compile',lambda b:b['proofs']['buildProvenance'].__setitem__('taskStatus','UP-TO-DATE'),failed=True)
 deny('failed-compile-nonzero',lambda b:b['proofs']['buildProvenance'].__setitem__('exit',1),failed=True)
 deny('failed-source-provenance-hash',lambda b:b['proofs']['buildProvenance'].__setitem__('sourceBeforeSha256',H('other')),failed=True)
 deny('failed-close-zero',lambda b:b['closureInput'].__setitem__('expectedWrapperExit',0),failed=True)
 deny('receipt-write-error-unqualified',lambda b:b['receipts']['full-check'].__setitem__('receiptWriteFailed',True),failed=True)
 deny('unknown-error-classification',lambda b:b['proofs']['assessment'].__setitem__('unknownClassificationErrors',['UNCLASSIFIED']),failed=True)
 deny('raw-error-erasure',lambda b:b['ready']['validation'].__setitem__('validationErrors',[]),failed=True,update=False)
 for name,key,value in [('wrong-holder','parentLockCurrent',False),('kernel-unheld','parentLockCurrent',False),('source-current-drift','sourceDigest',H('drift')),('observer-IO','observationOk',False),('owned-JVM-still-live','liveOwned',[(200,'owned-200')]),('unexpected-holder-child','unexpectedHolderDescendants',[999]),('owned-port-live','liveOwnedPorts',[12345]),('missing-inherited','inheritedMatched',5)]:
  changed=copy.deepcopy(live);changed[key]=value;deny(name,lambda b:None,observation=changed)
 # Missing readiness is represented by absent ready data, not an actual gate invocation.
 deny('no-readiness',lambda b:b.pop('ready'),update=False)
 # Conservative identity algorithms are reused exactly against injected tables only.
 row={'pid':7,'ppid':1,'start':'A'}
 for name,comm,start,error in [('missing-comm',None,'A',False),('blank-comm','','A',False),('missing-start','/usr/bin/java',None,False),('observer-failure','/usr/bin/java','A',True)]:
  classified=own['classify_owned'](row,None,comm,start,error);assert classified['executableState']=='UNKNOWN'
  assert own['ownership_drain_decision']({7:row},{(7,'A'):classified},True)=='WAIT';results.append({'control':name,'expected':'WAIT_UNKNOWN','observed':'WAIT_UNKNOWN'})
 java=own['classify_owned'](row,None,'/usr/bin/java','A');promoted=own['classify_owned'](row,java,'/usr/bin/node','A');assert promoted['executableState']=='JAVA'
 assert own['owned_census_keys']({7:dict(row,ppid=999)},{(7,'A'):java},123,456)=={(7,'A')}
 assert own['ownership_drain_decision']({7:dict(row,ppid=999)},{(7,'A'):java},True)=='WAIT';results.append({'control':'reparented-known-java-still-owned','expected':'WAIT','observed':'WAIT'})
 results.append({'control':'JAVA-promotion-sticky','expected':'JAVA','observed':promoted['executableState']})
 assert own['ownership_drain_decision']({7:dict(row,start='B')},{(7,'A'):java},True)=='RESOLVED';results.append({'control':'PID-reuse-not-same-start-owned','expected':'OLD_IDENTITY_ABSENT','observed':'OLD_IDENTITY_ABSENT'})
 assert own['ownership_drain_decision']({7:row},{(7,'A'):java},True,False)=='WAIT';results.append({'control':'observation-gap-never-terminal','expected':'WAIT','observed':'WAIT'})
 # Exact catalog/skip/static-resource predicates use public metadata, never binaries or outputs.
 catalog=read(E/'successor-catalog.json');skips=read(T/'qa/approved-skips.json');actual=[{'task':x['task'],'class':x['class'],'name':x['name'],'status':x['expectedStatus']} for x in catalog['expectedCaseIdentities']]
 assert not e['catalog_errors'](actual,catalog,skips)
 for name,mutant in [('missing2774',actual[:-1]),('extra-executionError',actual+[{'task':'test','class':'executionError','name':'synthetic','status':'FAIL'}]),('skip-mismatch',[dict(x,status='PASS') if x['status']=='SKIP' else x for x in actual])]:
  assert e['catalog_errors'](mutant,catalog,skips);results.append({'control':name,'expected':'REJECT','observed':'REJECT'})
 item=read(E/'static-resource-catalog.json')['resources'][0];output={'generator':item['generator'],'reportRelativePath':item['reportRelativePath'],'sha256':item['resourceSha256'],'bytes':item['resourceBytes']};jar={'path':item['dependencyJarPath'],'sha256':item['dependencyJarSha256']};entry={'entry':item['dependencyEntry'],'sha256':item['resourceSha256'],'bytes':item['resourceBytes']}
 assert e['static_match'](output,item,jar,entry)
 for name,obj,key in [('static-wrong-path',output,'reportRelativePath'),('static-wrong-jar',jar,'sha256'),('static-wrong-entry',entry,'entry')]:
  changed=copy.deepcopy(obj);changed[key]='WRONG';assert not e['static_match'](changed if obj is output else output,item,changed if obj is jar else jar,changed if obj is entry else entry);results.append({'control':name,'expected':'REJECT','observed':'REJECT'})
 # A qualified failed unit preserves every gap and closes nonzero; changing its basis rejects.
 b=fixture(True);b['receipts']['compile-reconcile']['ownedIdentityObservationGap']=True;b['receipts']['compile-reconcile']['phaseExit']=2;refresh(b);basis=g['qualification_basis'](b['ready']);gaps=b['ready']['gaps']
 b['qaSha']=H('qa');b['rootQualificationSha']=H('rootQualification')
 q={'unitLabel':b['release']['label'],'rootReleaseSha256':b['releaseSha'],'qualificationEvidenceSha256':basis,'gaps':gaps,'acceptCurrentQualifiedClosure':True,'historicalRepairClaim':False}
 b['qa']=dict(q,role='independent-qa',independentOfRunner=True);b['rootQualification']=dict(q,role='root',qaQualificationSha256=b['qaSha']);b['permit'].update(qualificationEvidenceSha256=basis,qaQualificationSha256=b['qaSha'],rootQualificationSha256=b['rootQualificationSha'])
 allow('qualified-reconcile-sticky-gap-nonzero',b)
 b['qa']['qualificationEvidenceSha256']=H('different')
 try:g['assess'](b,live,1001.,1)
 except g['Hold']:results.append({'control':'qualification-basis-mismatch','expected':'HOLD','observed':'HOLD'})
 else:raise AssertionError('qualification escaped')
 result={'status':'PURE_SYNTHETIC_CONTROLS_PASS','controls':results,'count':len(results),'actualGateOrProducerOrObserverOrHelperMainExecuted':False,'actualSourceProcessLockNativeOrPrivateAction':False,'readinessOrPermitWritten':False}
 if return_fixture_context:return result,fixture,refresh,g,live
 return result
if __name__=='__main__':print(json.dumps(main(),indent=2))

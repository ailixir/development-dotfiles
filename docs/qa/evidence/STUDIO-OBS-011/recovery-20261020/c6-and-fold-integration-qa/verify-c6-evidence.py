"""Closed public metadata and artifact hashing only; no raw failure-body inspection."""
from pathlib import Path
import hashlib
import json
import datetime

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[5]
BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020'
RUN=BASE/'itr-execution/c6-observation-resume2-execution'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
compact=lambda rows:sha(json.dumps(rows,separators=(',',':')).encode())
assert sha((RUN/'terminal-assessment.json').read_bytes())=='c6b67514821f8fb6b34f9fdc06c383f94d770b153699b260250fb032215b3d06'
assert sha((RUN/'execution.json').read_bytes())=='4da335c970b6d10089949beb0f90d50adf5b60b62e4a3e917e739470255f71bf'
t=load(RUN/'terminal-assessment.json');execution=load(RUN/'execution.json')
name='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
FQCN='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
stages=BASE/'slot3-release-observation-fix/resume2'
pins={'red':'cd1c81f9c5ace7b107a314c0f4baf9c6cb5dadacf9576a1213ee8e9455eb95e3',
      'green':'ab429398f750bb493982be321bea550f16823d5b5a58111a1a3d180bff2ece1c'}
for stage,pin in pins.items():assert sha((stages/stage/name).read_bytes())==pin
canonical=load(RUN/'canonical-before.json');final=load(RUN/'final-source.json')
old={r['path']:r['sha256'] for r in canonical['files']};new={r['path']:r['sha256'] for r in final['files']}
assert old.keys()==new.keys() and [k for k in old if old[k]!=new[k]]==[name]
assert old[name]=='e10c162d057c87a906a32e162614d29f3f4ba5a0e7000c52e9f77e46b0cdd616'
assert new[name]==pins['green']
assert compact(canonical['files'])==canonical['digest'] and compact(final['files'])==final['digest']==t['finalSourceDigest']
assert canonical['dist']==final['dist'] and canonical['dist']['digest']==t['finalDistDigest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
assert len(final['dist']['files'])==238 and compact(final['dist']['files'])==final['dist']['digest']
all_flags=['auditComplete','budgetEvidenceComplete','finalScansAttempted','modelEvidenceComplete',
           'privacyComplete','producersDrained','responseEvidenceComplete']
start_prev=None;run_facts=[]
for summary,record in zip(t['runs'],execution['runs'],strict=True):
    assert summary['id']==record['id'] and record['status']=='TERMINAL'
    expected_source=pins['red' if 'red' in summary['id'] else 'green']
    assert record['sourceSha256']==expected_source
    p=ROOT/summary['resultPath'];raw=p.read_bytes();assert sha(raw)==summary['resultSha256']==record['resultSha256']
    d=json.loads(raw);label=record['label'];assert p.name==label+'-results.json'
    assert d['exit']==summary['exit']==record['exit']==(1 if summary['id']=='r2-red-support01' else 0)
    assert d['counts']==summary['counts']
    assert d['sourceStable'] is d['testInputStable'] is d['distStable'] is True
    b=load(p.parent/(label+'-before.json'));a=load(p.parent/(label+'-after.json'))
    assert b['files']==a['files'] and b['digest']==a['digest']==d['testInputDigestBefore']==d['testInputDigestAfter']
    assert compact(b['files'])==b['digest']
    captured={r['path']:r['sha256'] for r in b['files']}
    assert captured[name]==expected_source and captured.keys()==old.keys()
    assert all(captured[k]==old[k] for k in old if k!=name)
    assert b['dist']==a['dist']==canonical['dist']
    log=p.parent/(label+'.log');assert sha(log.read_bytes())==d['logSha256']
    started=datetime.datetime.fromisoformat(record['startedUtc']);ended=datetime.datetime.fromisoformat(record['endedUtc'])
    assert started<ended and (start_prev is None or started>=start_prev);start_prev=ended
    compiled='compile' in summary['id']
    if compiled:
        assert d['testcases']==[] and d['counts']['total']==0
        run_facts.append({'id':summary['id'],'exit':d['exit'],'resultSha256':sha(raw),'sourceSha256':expected_source})
        continue
    method=('actualGuidedOwnedPrimaryBrowserLossWhileNativePasswordWorldPending' if 'native' in summary['id'] else
            'syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls')
    assert d['command']==['caffeinate','-i','./gradlew','test','--tests',FQCN+'.'+method,'--continue','--rerun-tasks','--no-daemon']
    expected={'total':1,'passed':int(summary['id']!='r2-red-support01'),'failed':int(summary['id']=='r2-red-support01'),'errors':0,'skipped':0}
    assert d['counts']==expected
    assert d['testcases']==[{'task':'test','class':FQCN,'name':method+'()','status':'FAIL' if summary['id']=='r2-red-support01' else 'PASS'}]
    assert d['explicitTestTasks']==d['requiredFreshExecTasks']==['test']
    assert d['expectedHistoricalSkips']==[] and d['historicalSkipSource'] is None
    assert d['taskCollectionErrors']==[] and d['taskCollectionComplete'] is True
    assert d['validationSucceeded'] is (summary['id']!='r2-red-support01')
    assert d['taskResults']==summary['taskResults']
    facts=d['taskResults']['test'];assert facts['counts']==expected and facts['freshXmlFiles']==facts['freshJoinCohorts']==1
    assert all(facts[k] is True for k in ['freshExec','execRequired','freshHtmlIndex','joinCasesPresent'])
    started_ns=int(datetime.datetime.fromisoformat(d['started']).timestamp()*1e9)
    hashed=[]
    for field in ['xmlFiles','jacocoExecFiles','testHtmlFiles','guidedCohortFiles']:
        assert d[field]
        for artifact in d[field]:
            artifact_path=ROOT/artifact['path'];body=artifact_path.read_bytes()
            assert len(body)==artifact['bytes'] and sha(body)==artifact['sha256']
            assert artifact['task']=='test'
            if field!='testHtmlFiles' or artifact_path.name=='index.html':
                assert artifact['mtimeNs']>=started_ns
            if field=='jacocoExecFiles':assert body
            # Never decode XML/log/HTML failure or protected private evidence bodies.
            hashed.append({'path':artifact['path'],'sha256':artifact['sha256']})
    assert [r['sha256'] for r in d['xmlFiles']]==summary['freshXmlHashes']
    cohort_artifacts=[x for x in d['guidedCohortFiles'] if Path(x['path']).name=='cohort.json']
    audit_artifacts=[x for x in d['guidedCohortFiles'] if Path(x['path']).name=='audit-final.json']
    assert len(cohort_artifacts)==len(audit_artifacts)==1
    cohort=load(ROOT/cohort_artifacts[0]['path']);audit=load(ROOT/audit_artifacts[0]['path'])
    assert cohort_artifacts[0]['sha256']==summary['cohorts'][0]['sha256']
    assert all(cohort[k] is True for k in all_flags) and cohort['retentionFailures']==0
    assert cohort['declaredOutputCeiling']==4000 and cohort['profile']=='original4000' and cohort['lane']=='test'
    assert len(cohort['invocations'])==len(summary['cohorts'][0]['invocations'])==1
    assert all(cohort['invocations'][0][key]==value for key,value in summary['cohorts'][0]['invocations'][0].items())
    invocation=cohort['invocations'][0]
    assert invocation['method']==method and invocation['variant']=='singleton' and invocation['variantOrdinal']==0 and invocation['invocationOrdinal']==1
    assert invocation['passed'] is (summary['id']!='r2-red-support01') and invocation['afterEachComplete'] is True
    assert all(audit[k] is True for k in ['auditComplete','producersDrained','contextClosed'])
    if summary['id']=='r2-red-support01':
        classification=record['classification']
        assert classification['genuineControlledAssertionRed'] is True
        assert classification['publicSourceLine']==20888 and classification['expected'] is True and classification['actual'] is False
        assert classification['rawFailureTextExported'] is False
    run_facts.append({'id':summary['id'],'resultSha256':sha(raw),'sourceSha256':expected_source,'counts':expected,
                      'closedCohortHash':cohort_artifacts[0]['sha256'],'auditFinalHash':audit_artifacts[0]['sha256'],
                      'completeFlags':True,'afterEachComplete':True,'retentionFailures':0,'hashedArtifacts':hashed})
assert t['fullClassSlotsConsumed']==0 and t['fullClassAttemptsTotalRemains']==3 and t['fullClassGateCredit'] is False
assert t['historicalC6CauseProved'] is False and t['originalSlot3FailurePreserved'] is True
out={'decision':'ACCEPT_SCOPED_C6_CONTROLLED_AND_ONE_NATIVE_EVIDENCE','mandatoryFindings':[],
     'terminalAssessmentSha256':sha((RUN/'terminal-assessment.json').read_bytes()),
     'executionSha256':sha((RUN/'execution.json').read_bytes()),'acceptedReplaySha256AtCapture':pins['green'],
     'allOtherCapturedInputsUnchanged':True,'capturedDistUnchanged':final['dist']['digest'],'runs':run_facts,
     'redFailureAssessment':'Exact closed public classification line20888 expectedtrue/actualfalse; one failed body, clean AfterEach/final flags, no collection or synthetic AfterAll case. Raw failure body not inspected.',
     'currentReplayEqualityRequired':False,'runtimeReplayed':False,'sourceApplied':False,
     'privateOrRawFailureBodyInspected':False,'fullClassOrHistoricalCauseCredit':False}
(HERE/'c6-evidence-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'decision':out['decision'],'checksSha256':sha((HERE/'c6-evidence-checks.json').read_bytes())}))

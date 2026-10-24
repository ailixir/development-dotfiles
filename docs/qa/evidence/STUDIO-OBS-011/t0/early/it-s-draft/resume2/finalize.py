from pathlib import Path
import json,hashlib,re,csv
O=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((O/'manifest.json').read_text());rows=json.loads((O/'sleep-table.json').read_text());cases=json.loads((O/'case-preservation.json').read_text())
budgets={('GuidedServiceTransportFaultIT',1366):('5000ms','20ms','deadline first; return exact observed single owned pg blocker row, otherwise exact FAIL_TO_REACH_OWN_ROW_LOCK AssertionError'),('GuidedServiceTransportFaultIT',1681):('5000ms','20ms','route idle first, then deadline; preserve BEFORE/AFTER/failure-finally diagnostics and original idle assertions'),('GuidedServiceTransportFaultIT',2019):('5000ms','20ms','route idle first, then deadline; preserve aggregated cleanup errors and InterruptedException reinterrupt handler'),('GuidedServiceTransportFaultIT',2749):('25000ms','10ms','initial content read before first wait; subsequent marker read after interval, then exact content/deadline/childAlive guard; final original marker assertion'),('GuidedServiceTransportFaultIT',4699):('20000ms','20ms','condition first; timeout check remains inside body with original Teardown condition not reached AssertionError; exact InterruptedException rethrow'),('GuidedServiceTransportFaultIT',4870):('20000ms','20ms','deadline first; exact work failure/read/materialization/stop-confirmed assertions fail fast; final original closure AssertionError'),('GuidedPlanningIntegrationTest',3902):('timeout parameter unchanged','25ms','condition first then deadline; final fresh condition assertion retained'),('SecretUseAuditIT',1858):('5000ms','20ms','deadline first; actual pg_stat_activity Lock condition; final waited assertion preserved through local field'),('GuidedPublicationRaceTest',453):('500ms','10ms','deadline first then waiting; exact pg backend lock read; final waiting assertion preserved through local field'),('GuidedFocusMutationJoinedIT',1609):('timeout parameter unchanged','25ms','condition first then deadline; final fresh condition assertion retained'),('GuidedEvidencePendingAppendJoinedIT',1034):('90000ms','50ms','recording count first then deadline; original value-free state/delivery/runner-tail detailed failure assertion retained'),('GuidedEvidencePendingAppendJoinedIT',1440):('timeout parameter unchanged','25ms','condition first then deadline; final fresh condition assertion retained')}
for r in rows:
 name=Path(r['file']).stem;k=(name,r['originalLine']);base=(O/'preimages'/r['file']).read_text();actual=Path(r['file']).read_text();before=list(re.finditer(r'\.sleep\([^;]+\);',base));olds=list(re.finditer(r'\.sleep\([^;]+\);',actual));idx=next(i for i,x in enumerate(olds) if actual.count('\n',0,x.start())+1==r['originalLine']);r['preimageLine']=base.count('\n',0,before[idx].start())+1
 if r['classification']=='POLL':r['budget'],r['pollInterval'],r['terminationMapping']=budgets[k]
 else:r['budget']='exact deliberate elapsed stimulus';r['pollInterval']='not polling';r['terminationMapping']=r['reason']
 r['thread']='original caller thread; pollInSameThread/dontCatchUncaughtExceptions for POLL; deliberate owner thread unchanged'
 r['transaction']='no new transaction, executor or JDBC connection; existing per-observation calls, lock holder/writer lifetimes and release/finally order retained'
(O/'sleep-table.json').write_text(json.dumps(rows,indent=2)+'\n')
with (O/'sleep-table.tsv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),delimiter='\t');w.writeheader();w.writerows(rows)
# Expand every parameterized invocation from unchanged source annotations, not source method totals.
inv=[]
for c in cases:
 for item in c['testHeaders']:
  name=item['method'];header=item['header']
  if name=='actualServicesJoinOneConsumedSecretReadAndPostWithAuthenticatedRecovery':
   values=['COMPLETE_200_NO_CALLBACK','COMPLETE_200_OWNER_OK','COMPLETE_200_OWNER_FAILED','COMPLETE_503_NO_CALLBACK','COMPLETE_503_OWNER_OK','PARTIAL_200_NO_EOF','PARTIAL_503_NO_EOF','CALLER_EXPIRY_AFTER_CONSUME','INTERRUPT_AFTER_HEADERS']
  else:
   ann=re.search(r'@(?:[\w$]+\.)*(ValueSource|CsvSource)\s*\(([\s\S]*?)\)\s*(?:public |private |protected |void |final |static |\n)',header)
   if ann:
    text=ann[2]
    literals=re.findall(r'"(?:\\.|[^"\\])*"',text)
    if literals:values=[json.loads(v) for v in literals]
    else:
     content=re.search(r'\{([\s\S]*)\}',text)[1]
     values=[v.strip() for v in content.split(',') if v.strip()]
   else:
    assert not re.search(r'@(?:[\w$]+\.)*ParameterizedTest\b',header),(name,header)
    values=[None]
  for value in values:inv.append(dict(fqcn=c['fqcn'],method=name,variant=value,sourceExpected=True,runtimeObserved=False))
assert len(inv)==149,len(inv)
(O/'source-expected-invocations.json').write_text(json.dumps(inv,indent=2)+'\n')
# Future full prescribed commands; never execute this file during preparation.
commands='''# FUTURE ONLY. Root must release GS-M(b), four FOLD handoffs and two direct-release files, tree and Gradle lock first.
# Labels below are fresh-at-execution proposals, not evidence of execution. Use fresh labels if consumed.
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
lsof -nP -iTCP -sTCP:LISTEN
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-its-01 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT' --tests 'com.citi.put.checks.studio.guided.secret.SecretUseAuditIT' --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationRaceTest' --rerun-tasks --no-daemon
lsof -nP -iTCP -sTCP:LISTEN
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-its-02 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedPlanningIntegrationTest' --tests 'com.citi.put.checks.studio.guided.translation.GuidedFocusMutationJoinedIT' --tests 'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendJoinedIT' --rerun-tasks --no-daemon
# No historical --allowed-skips-file for this subset. Report native counts and collector policy separately.
# Lane checks are non-evidentiary under R-T0-4; full11-G with exact case/timing/privacy reconciliation remains owed.
'''
(O/'future-commands.sh').write_text(commands)
proof=json.loads((O/'static-verification.json').read_text());proof['namedTestMethods']=112;proof['sourceExpectedInvocations']=149;proof['namedDrops']=[];proof['namedTestAdditions']=[];proof['localStepMethodsAdded']=12;proof['assertionExpressionCount']=sum(c['assertionExpressionsBefore'] for c in cases)
proof['sourceCaseMapSha256']=sha(O/'source-expected-invocations.json');proof['sleepTableSha256']=sha(O/'sleep-table.tsv');proof['allRuntimeEvidenceMissing']=True
(O/'static-verification.json').write_text(json.dumps(proof,indent=2)+'\n')
audit_path=O.parents[2]/'qa/b1-terminal/audit.json'
audit=json.loads(audit_path.read_text());fq={c['fqcn'] for c in cases}
timings=[r for r in audit['classTimings'] if r['task']=='test' and r['class'] in fq]
assert len(timings)==6
for t in timings:assert sum(v['fqcn']==t['class'] for v in inv)==t['tests'],t['class']
for t in timings:assert sha(Path(t['xml']))==t['sha256']
baseline=dict(source='historical T0 B1; whole check failed, never a green whole-run claim',auditSha256=sha(audit_path),classes=timings,sixClassSuiteSeconds=sum(x['suiteTimeSeconds'] for x in timings),tests=sum(x['tests'] for x in timings),after=None,newRunExecuted=False)
(O/'historical-baseline-timings.json').write_text(json.dumps(baseline,indent=2)+'\n')
artifacts={str(p.relative_to(O)):sha(p) for p in sorted(O.rglob('*')) if p.is_file() and p.name not in ['artifact-manifest.json','receipt.json','receipt.md']}
(O/'artifact-manifest.json').write_text(json.dumps(artifacts,indent=2)+'\n')
receipt=dict(scope='STUDIO-OBS-01111-IT-S preparation only',staticVerified=True,compileVerified=False,runtimeVerified=False,sourceApplied=False,W1Approved=False,actualSourceUnchanged=True,gsTPreimageSha256=manifest[0]['preimageSha256'],incrementalPatchSha256=sha(O/'it-s-incremental.patch'),composedPatchSha256=sha(O/'it-s-from-s011.patch'),artifactManifestSha256=sha(O/'artifact-manifest.json'),counts=proof['files'],namedTestMethods=112,sourceExpectedInvocations=149,assertionExpressions=proof['assertionExpressionCount'],drops=[],testAdditions=[],localStepMethodsAdded=12,foldBatons=[c['path'] for c in cases if c['foldBaton']],directRelease=[c['path'] for c in cases if not c['foldBaton']],runtimeCarries=['all six compile and full prescribed class runs','same-thread transaction visibility/exception and interruption behavior','actual elapsed wall time before/after with exact149 invocation multiset','all native privacy/cleanup/negative oracles','root exact runtime-accepted GS-T/GS-M(b) preimage refresh and atomic apply','four FOLD_TESTS exact batons only','full11-G evidence; no lane exit or QA/lifecycle claim'])
receipt['corrections']=['BRIDGE-WAIT-01/02 in sibling complete GS-T2 resume2','ITS-WAIT-01 terminal-latched step and guarded fallback at12sites','ITS-META-01 final literal-block metadata regenerated'];receipt['independentReviewSha256']='3b5eaa17edcd2d30b708989b1a0b60592f0ef064e3e44a2f4975e949942e3f0d';receipt['conformance']='234 hash-bound differential comparisons UNEXECUTED, not native-gate proof'
(O/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['incrementalPatchSha256','composedPatchSha256','artifactManifestSha256','namedTestMethods','sourceExpectedInvocations','assertionExpressions']},indent=2))

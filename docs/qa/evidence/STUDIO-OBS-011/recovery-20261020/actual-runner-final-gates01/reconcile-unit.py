from pathlib import Path
import json,hashlib,collections,datetime,shutil,fnmatch,re
R=Path.cwd();O=Path(__file__).resolve().parent;E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';P=O.parent/'actual-runner-final-gates-preparation01';L='obs011-recovery-20261020-actual-final-unit01'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
term=json.loads((O/'unit-terminal.json').read_text());assert term['rawOuterExit']==0 and term['postGuardComplete']
report=E/(L+'-vitest.json');data=json.loads(report.read_text());expected=json.loads((P/'expected-unit-cases.json').read_text());rows=[];suites=[]
for suite in data['testResults']:
 file='studio-runner/'+str(Path(suite['name']).relative_to(R/'studio-runner'));suites.append({'file':file,'status':suite['status'],'message':suite.get('message',''),'assertionCount':len(suite['assertionResults'])})
 for case in suite['assertionResults']:
  assert not case.get('failureMessages',[])
  rows.append({'file':file,**{k:case[k] for k in ['ancestorTitles','title','fullName','status']}})
key=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'))
actualCounter=collections.Counter(map(key,rows));expectedCounter=collections.Counter(map(key,expected['cases']));assert actualCounter==expectedCounter
def perfile(xs):
 d=collections.defaultdict(list)
 for r in xs:d[r['file']].append(r)
 return dict(d)
assert perfile(rows)==perfile(expected['cases']);counts=dict(collections.Counter(x['status'] for x in rows));assert counts=={'passed':2692,'skipped':25} and len(rows)==2717 and len(actualCounter)==2713
assert data['success'] is True and data['numFailedTests']==0 and not any(x['message'] for x in suites)
assert len({x['file'] for x in rows})==118
skips=[x for x in rows if x['status']=='skipped'];deferred=[x for x in skips if x['file']=='studio-runner/test/deferred.test.ts'];helper=[x for x in rows if x['file']=='studio-runner/test/run/bootstrapProcessTreeObservation.test.ts'];assert len(deferred)==15 and len(helper)==41 and all(x['status']=='passed' for x in helper)
log=(E/(L+'.log')).read_text();banners=['Unhandled Errors','Unhandled Rejection','Uncaught Exception'];found=[x for x in banners if x in log];assert not found
runtimeKeys={k:v for k,v in data.items() if re.search('runtime.*error|unhandled',k,re.I)}
write('unit-reconciliation.json',{'accepted':True,'report':str(report.relative_to(R)),'reportSha256':sha(report),'forecastSha256':sha(P/'expected-unit-cases.json'),'counts':counts,'total':len(rows),'physicalTestFiles':118,'reportedSuiteCounts':{k:v for k,v in data.items() if 'suites' in k.lower()},'distinctFullIdentityStatusKeys':len(actualCounter),'duplicateExcessMultiplicity':len(rows)-len(actualCounter),'duplicateRows':[{'identity':json.loads(k),'multiplicity':v} for k,v in actualCounter.items() if v>1],'exactCounterIncludingStatusesAndMultiplicity':True,'perFileCaseOrderExact':True,'crossFileOrderRequired':False,'allCaseFailureMessagesAndSuiteMessagesEmpty':True,'controlledUnhandledBanners':found,'optionalRuntimeErrorSummary':runtimeKeys if runtimeKeys else 'NOT_EMITTED','skipped':skips,'genuineDeferredCount':15,'helperCount':41,'cases':rows,'files':suites,'collectorOuterExit':0,'configuredCoverageEnabled':True})
summary=R/'studio-runner/coverage/coverage-summary.json';collected=E/(L+'-coverage-summary.json');assert sha(summary)==sha(collected);started=datetime.datetime.fromisoformat(term['startedAtUtc']).timestamp();assert summary.stat().st_mtime>=started
cov=json.loads(summary.read_text());binding=json.loads((O/'coverage-original-config-binding.json').read_text());assert sha(R/'studio-runner/vitest.config.ts')==binding['configSha256'];shutil.copy2(summary,O/'fresh-coverage-summary.json')
groups={'global':cov['total']};scopeFiles={}
for pattern in binding['thresholds']['scopes']:
 files=[(n,v) for n,v in cov.items() if n!='total' and fnmatch.fnmatch(str(Path(n).relative_to(R/'studio-runner')),pattern)];assert files;scopeFiles[pattern]=[str(Path(n).relative_to(R/'studio-runner')) for n,v in files];tot={}
 for metric in ['lines','statements','functions','branches']:
  total=sum(v[metric]['total'] for n,v in files);covered=sum(v[metric]['covered'] for n,v in files);tot[metric]={'total':total,'covered':covered,'pct':100*covered/total if total else 100}
 groups[pattern]=tot
checks=[]
for group,metrics in groups.items():
 floors=binding['thresholds']['global'] if group=='global' else binding['thresholds']['scopes'][group]
 for metric,floor in floors.items():checks.append({'scope':group,'metric':metric,'required':floor,'measured':metrics[metric]['pct'],'passed':metrics[metric]['pct']>=floor})
assert all(x['passed'] for x in checks)
outputs=[{'path':str(p.relative_to(R)),'sha256':sha(p),'bytes':p.stat().st_size,'mtimeNs':p.stat().st_mtime_ns} for p in sorted((R/'studio-runner/coverage').rglob('*')) if p.is_file()]
write('coverage-reconciliation.json',{'allOriginalThresholdsPassed':True,'rawCollectorAndChildExit':0,'freshSummarySha256':sha(summary),'collectorCopySha256':sha(collected),'summaryMtimeNs':summary.stat().st_mtime_ns,'startedAtUtc':term['startedAtUtc'],'freshSummaryAfterStart':True,'configSha256':binding['configSha256'],'configUnchanged':True,'enabled':True,'globalAndSixScopedChecks':checks,'metrics':groups,'scopeMembers':scopeFiles,'generatedOutputs':outputs,'globalAndSixScopedThresholdsUnchanged':True})
print(json.dumps({'accepted':True,'total':len(rows),'counts':counts,'files':118,'duplicateExcessMultiplicity':4,'allOriginalThresholdsPassed':True,'coverage':groups['global']}))

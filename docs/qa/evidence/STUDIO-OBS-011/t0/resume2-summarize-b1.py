"""Root evidence projection; terminal original B1 only, never starts tests."""
from pathlib import Path
import collections, datetime, hashlib, json, re, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[5]
t0=root/'docs/qa/evidence/STUDIO-OBS-011/t0'
out=t0/'resume2-b1-terminal-summary.json'
if out.exists(): raise SystemExit('Refusing to overwrite terminal summary')
if 'B1-DONE' not in (t0/'status.txt').read_text(): raise SystemExit('Original B1 not terminal')
result=root/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json'
d=json.loads(result.read_text())
a=json.loads((t0/'start-capture.json').read_text()); b=json.loads((t0/'end-capture.json').read_text())
log=root/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01.log'
text=log.read_text()
tasks={}
for line in text.splitlines():
 m=re.match(r'> Task :(\w+)(?: (.*))?$',line)
 if m: tasks[m[1]]=m[2] or 'EXECUTED'
ratios=[]
for f in sorted((t0/'b1-jacoco').rglob('*.xml')):
 doc=ET.parse(f).getroot()
 sessions=doc.findall('sessioninfo')
 latest_dump=max((int(x.attrib['dump'])/1000 for x in sessions),default=0)
 original=root/'backend/build/reports/jacoco'/f.relative_to(t0/'b1-jacoco')
 started=datetime.datetime.fromisoformat(d['started']).timestamp()
 fresh=(tasks.get('requireFreshGuidedPartitions')=='EXECUTED' and tasks.get('jacocoTestReport')=='EXECUTED' and latest_dump>=started and original.is_file() and original.stat().st_mtime>=started and hashlib.sha256(original.read_bytes()).digest()==hashlib.sha256(f.read_bytes()).digest())
 if not fresh:
  ratios.append({'path':str(f.relative_to(root)),'fresh':False,'credited':False,'reason':'No task-bound current report/session/source freshness proof; copied mtime ignored','latestSessionDumpEpoch':latest_dump}); continue
 for element in [doc]+list(doc.findall('package')):
  c=element.find("counter[@type='LINE']")
  if c is not None:
   missed=int(c.attrib['missed']); covered=int(c.attrib['covered'])
   ratios.append({'path':str(f.relative_to(root)),'fresh':True,'scope':'BUNDLE' if element is doc else element.attrib['name'],'covered':covered,'missed':missed,'ratio':covered/(covered+missed) if covered+missed else None})
timing_classes = {'GuidedPublicationReplayIT','GuidedServiceTransportFaultIT','GuidedBridgePlannedIT','GuidedPublicationRaceTest','GuidedFocusMutationJoinedIT','GuidedEvidencePendingAppendJoinedIT','GuidedBridgeIntegrationTest','GuidedPlanningIntegrationTest','SecretUseAuditIT'}
class_timings=[]
for fact in d.get('xmlFiles',[]):
 f=root/fact['path']; doc=ET.parse(f).getroot(); name=doc.attrib.get('name','')
 if name.rsplit('.',1)[-1] not in timing_classes: continue
 class_timings.append({'task':fact.get('task'),'class':name,'suiteTimeSeconds':float(doc.attrib.get('time',0)),'xml':fact['path'],'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'tests':int(doc.attrib.get('tests',0)),'failures':int(doc.attrib.get('failures',0)),'errors':int(doc.attrib.get('errors',0)),'skipped':int(doc.attrib.get('skipped',0)),'cases':[{'class':c.attrib.get('classname'),'name':c.attrib.get('name'),'timeSeconds':float(c.attrib.get('time',0)),'status':'FAIL' if c.find('failure') is not None or c.find('error') is not None else 'SKIP' if c.find('skipped') is not None else 'PASS'} for c in doc.iter('testcase')]})
summary={
 'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'isQaVerdict':False,
 'collectorResult':str(result.relative_to(root)),'collectorSha256':hashlib.sha256(result.read_bytes()).hexdigest(),
 'exit':d.get('exit'),'gradleExit':d.get('gradleExit'),'counts':d.get('counts'),'taskResults':d.get('taskResults'),
 'taskCollectionComplete':d.get('taskCollectionComplete'),'taskCollectionErrors':d.get('taskCollectionErrors'),
 'stability':{key:d.get(key) for key in ['sourceStable','distStable','testInputStable']},
 'endSourceEqualsStart':a['digest']==b['digest'],'endDistEqualsStart':a['dist']['digest']==b['dist']['digest'],
 'failures':[x for x in d.get('testcases',[]) if x.get('status') in ['FAIL','ERROR']],
 'skips':[x for x in d.get('testcases',[]) if x.get('status')=='SKIP'],
 'checkTasks':{key:tasks.get(key,'ABSENT') for key in ['spotlessJavaCheck','spotlessCheck','checkstyleMain','checkstyleTest','spotbugsMain','test','guidedIncrementalTest','crossReplicaTest','retainOriginalGuidedCohort','requireFreshGuidedPartitions','jacocoTestReport','jacocoTestCoverageVerification','check']},
 'jacocoLineRatios':ratios,
 'ac5ClassTimings':class_timings,
 'timingLimitation':'Failed/fail-stop-truncated before samples are attempted timing evidence, never a green baseline; root/QA must rule comparison limits',
 'rootOutcome':'UNRULED: assess actual failures, freshness and coverage; no automatic W1 authorization',
}
out.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['failures','skips','jacocoLineRatios','ac5ClassTimings']},indent=2))

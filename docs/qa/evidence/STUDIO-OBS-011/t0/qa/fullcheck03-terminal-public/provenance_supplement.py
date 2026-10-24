"""Additional closed public provenance checks, without executing the primary assessor."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import os
import re
import stat
import xml.etree.ElementTree as ET

ROOT=Path.cwd()
T=ROOT/'docs/qa/evidence/STUDIO-OBS-011'
OUT=T/'t0/qa/fullcheck03-terminal-public'
def read(p):
    for parent in [p,*p.parents]:assert not parent.is_symlink()
    a=p.lstat();assert stat.S_ISREG(a.st_mode)
    b=p.read_bytes();c=p.lstat()
    assert (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns,a.st_mode)==(c.st_dev,c.st_ino,c.st_size,c.st_mtime_ns,c.st_ctime_ns,c.st_mode)
    return b
def sha(b):return hashlib.sha256(b).hexdigest()
h=json.loads(read(T/'t0/early/fullcheck-harness/resume3/runs/obs011-t0-fresh-check03/receipt.json'))
assert sha(read(T/'t0/early/fullcheck-harness/resume3/runs/obs011-t0-fresh-check03/receipt.json'))=='091d93b782a45406413d132e2e5d8fb921e4d21e22f3c7579773f8378afc4ff0'
c=json.loads(read(ROOT/h['primaryCollectorReceipt']['path']))
start=dt.datetime.fromisoformat(c['started']).timestamp();end=dt.datetime.fromisoformat(h['collectorTerminatedAtUtc']).timestamp()
times=[]
for item in c['xmlFiles']:
    b=read(ROOT/item['path']);assert sha(b)==item['sha256']
    timestamp=ET.fromstring(b).get('timestamp');assert timestamp
    value=dt.datetime.fromisoformat(timestamp)
    if value.tzinfo is None:value=value.replace(tzinfo=dt.timezone.utc)
    assert start<=value.timestamp()<=end+2
    times.append(value.timestamp())
log=read(T/'execution/obs011-t0-fresh-check03.log');assert sha(log)==c['logSha256']
statuses={}
for line in log.decode(errors='replace').splitlines():
    m=re.fullmatch(r'> Task :([\w]+)(?: (.*))?',line)
    if m:statuses[m[1]]=m[2] or 'EXECUTED'
retentions={x:statuses[x] for x in ['retainOriginalGuidedCohort','retainIncrementalGuidedCohort']}
assert all(x=='EXECUTED' for x in retentions.values())
cohorts=[]
for item in c['guidedCohortFiles']:
    p=ROOT/item['path']
    if p.name not in ['cohort.json','audit-final.json']:continue
    b=read(p);assert sha(b)==item['sha256'];v=json.loads(b)
    relative=p.relative_to(T/'execution/obs011-t0-fresh-check03-task-outputs'/item['task']/'cohorts')
    assert len(relative.parts)==3 and v['runId']==relative.parts[0] and v['cohortId']==relative.parts[1] and v['lane']==item['task']
    cohorts.append({'task':item['task'],'kind':p.name,'publicDirectoryIdentityEqualsManifest':True,'sha256':sha(b)})
assert len(cohorts)==4
out={'kind':'SUPPLEMENTAL_PUBLIC_PROVENANCE_COMPLETE','primaryAssessmentSha256':sha(read(OUT/'assessment.md')),'xmlSuiteTimestamps':{'count':len(times),'withinNativeInterval':True,'earliestUtc':dt.datetime.fromtimestamp(min(times),dt.timezone.utc).isoformat(),'latestUtc':dt.datetime.fromtimestamp(max(times),dt.timezone.utc).isoformat(),'timezoneRule':'Gradle Test XML timestamps are UTC; unzoned values interpreted as UTC'},'actualRetentionTaskStatuses':retentions,'cohortDirectoryAndManifestIdentityBindings':cohorts,'privateRuntimeInputsRead':0,'rawIdentityOrUuidExported':False,'nativeFailureCoverageAndObserverDispositionUnchanged':True,'testOrBuildCalls':0}
fd=os.open(OUT/'provenance-supplement.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(out,f,indent=2);f.write('\n')
print(json.dumps({'xmlTimestampsVerified':len(times),'retentionTasks':retentions,'cohortPathBindings':len(cohorts)}))

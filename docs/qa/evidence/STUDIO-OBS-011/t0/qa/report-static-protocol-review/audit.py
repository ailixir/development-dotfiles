"""Independent read/hash/ZIP/source audit; never imports author tools or reads live03 output."""
from pathlib import Path
import ast,collections,datetime,hashlib,json,stat,zipfile,xml.etree.ElementTree as ET
R=Path.cwd(); Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/report-static-protocol-review'; A=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/report-static-assets-review'
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected={'review.md':'0416ce0fce705608a0860fed32de71718a30973ac938846d9e326c96f036c4de','post-terminal-protocol.md':'b15f9aa304e75709032fc756769cabfffee85c3ce22102869146c2fba5544f0d','proposed-static-resource-catalog.json':'3be436be6ec4784ee393c16aee0aaf65d7620b4aed9fabfb73c68b4be09e359e'}
for n,h in expected.items():assert H(A/n)==h
catalog=json.loads((A/'proposed-static-resource-catalog.json').read_text())['resources'];assert len(catalog)==23
assert len({(r['generator'],r['reportRelativePath']) for r in catalog})==23
jars={}; resources=[]
for r in catalog:
 p=Path(r['dependencyJarPath']);assert not p.is_symlink()
 if str(p) not in jars:
  assert H(p)==r['dependencyJarSha256'];jars[str(p)]=H(p)
 with zipfile.ZipFile(p) as z:
  assert z.namelist().count(r['dependencyEntry'])==1
  content=z.read(r['dependencyEntry']);assert hashlib.sha256(content).hexdigest()==r['resourceSha256'];assert len(content)==r['resourceBytes']
 assert not r['reportRelativePath'].endswith(('.html','.xml','.exec','.json'))
 resources.append({k:r[k] for k in ['generator','reportRelativePath','dependencyEntry','resourceSha256','resourceBytes']})
assert collections.Counter(r['generator'] for r in catalog)=={'Gradle8.10.2-test-report':3,'JaCoCo0.8.12-html-report':20}
# Exact jar resource membership, rather than suffix inference.
jacoco=[r for r in catalog if r['generator'].startswith('JaCoCo')]; jp=Path(jacoco[0]['dependencyJarPath'])
with zipfile.ZipFile(jp) as z:
 prefix='org/jacoco/report/internal/html/resources/'
 assert {n for n in z.namelist() if n.startswith(prefix) and not n.endswith(('/', '.class'))}=={r['dependencyEntry'] for r in jacoco}
 # The four additional entries are implementation classes, never report assets.
 assert {n.removeprefix(prefix) for n in z.namelist() if n.startswith(prefix) and n.endswith('.class')}=={'Resources$1.class','Resources.class','Styles.class','package-info.class'}
 manifest=z.read('META-INF/MANIFEST.MF').decode();assert 'Bundle-Version: 0.8.12.' in manifest
build=(R/'backend/build.gradle.kts').read_text();wrapper=(R/'backend/gradle/wrapper/gradle-wrapper.properties').read_text()
assert 'gradle-8.10.2-bin.zip' in wrapper;assert 'toolVersion = "0.8.12"' in build
merged='executionData.setFrom(layout.buildDirectory.file("jacoco/test.exec"), layout.buildDirectory.file("jacoco/guidedIncrementalTest.exec"))'
assert build.count(merged)==2
# The only runtime artifact read here is the already closed diagnostic and historical B1.
p=R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-diag-start1-full01-results.json';d=json.loads(p.read_text());assert H(p)=='9b991d479cbe6176a4631c43abcc28f1c14f2e7f3d2d269e920c40b44013babe'
t=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/diag-start1-harness/resume2/runs/obs011-diag-start1-full01/receipt.json';closed=json.loads(t.read_text());assert closed['status']=='TERMINAL_INCOMPLETE_OBSERVATION';assert closed['ownedIdentityObservationGap'] is True
end=datetime.datetime.fromisoformat(next(v['terminatedAtUtc'] for v in closed['processes'] if v['phase']=='single-full-class')).timestamp();start=datetime.datetime.fromisoformat(d['started']).timestamp()
assert d['counts']=={'total':108,'passed':108,'failed':0,'errors':0,'skipped':0};assert d['exit']==d['gradleExit']==0
checks={};html=[]
for group in ['testHtmlFiles','xmlFiles','jacocoExecFiles','guidedCohortFiles','guardTallies']:
 for f in d[group]:
  path=R/f['path'];before=path.lstat();assert stat.S_ISREG(before.st_mode)
  current=path.parent
  while current!=R:assert not current.is_symlink();current=current.parent
  digest=H(path);after=path.lstat();assert before==after
  assert (digest,before.st_size,before.st_mtime_ns,oct(stat.S_IMODE(before.st_mode)))==(f['sha256'],f['bytes'],f['mtimeNs'],f['mode'])
  fresh=start<=f['mtimeNs']/1e9<=end+2
  if group=='testHtmlFiles':
   rel=f['path'].split('/html/',1)[1];known=next((r for r in catalog if r['generator'].startswith('Gradle') and r['reportRelativePath']==rel),None)
   if known:assert digest==known['resourceSha256'] and before.st_size==known['resourceBytes'] and not fresh
   else:assert fresh and rel.endswith('.html')
   html.append({'task':f['task'],'relativePath':rel,'sha256':digest,'originalMtimeNs':f['mtimeNs'],'bytes':f['bytes'],'freshUnderExactOldRule':fresh,'exactPinnedStaticMatch':known is not None})
  else:assert fresh
 checks[group]=len(d[group])
assert checks=={'testHtmlFiles':12,'xmlFiles':2,'jacocoExecFiles':2,'guidedCohortFiles':546,'guardTallies':1}
assert sum(h['exactPinnedStaticMatch'] for h in html)==6 and sum(h['freshUnderExactOldRule'] for h in html)==6
cases=[]
for f in d['xmlFiles']:
 for event,node in ET.iterparse(R/f['path'],events=['end']):
  if node.tag=='testcase':
   status='FAIL' if node.find('failure') is not None or node.find('error') is not None else 'SKIP' if node.find('skipped') is not None else 'PASS'
   cases.append((f['task'],node.get('classname'),node.get('name'),status));node.clear()
key=lambda c:(c['task'],c['class'],c['name'],c['status'])
assert collections.Counter(cases)==collections.Counter(map(key,d['testcases']));assert len(cases)==108
cohorts=[];flags=['auditComplete','privacyComplete','producersDrained','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete']
for f in d['guidedCohortFiles']:
 if Path(f['path']).name!='cohort.json':continue
 c=json.loads((R/f['path']).read_text());assert all(c[v] is True for v in flags);assert c['retentionFailures']==0
 assert all(i['passed'] is True and i['afterEachComplete'] is True for i in c['invocations'])
 assert collections.Counter((i['displayLabel'],'PASS' if i['passed'] else 'FAIL') for i in c['invocations'])==collections.Counter((v[2],v[3]) for v in cases if v[0]==f['task'])
 cohorts.append({'task':f['task'],'invocations':len(c['invocations']),'allSixFlags':True,'allAfterEachCompleteAndPassed':True})
# Reconfirm the literal current script condition without invoking an assessor or archiver.
harness=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py';hs=harness.read_text();assert H(harness)=='a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
tree=ast.parse(hs);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='assess_and_archive')
assert "for group in ('xmlFiles', 'testHtmlFiles', 'jacocoExecFiles', 'guidedCohortFiles', 'guardTallies')" in ast.get_source_segment(hs,fn)
assert "if not started <= item['mtimeNs'] / 1e9 <= ended + 2:" in hs
assert "if all(started <= f['mtimeNs'] / 1e9 <= ended + 2 for f in original_facts):" in hs
assert "report_info['fresh'] = False" in hs and "'GENUINELY_FRESH_MERGED_COVERAGE_NOT_PROVEN'" in hs
# No current03 files, reports, process state or terminal assessment are read.
p=R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json';b1=json.loads(p.read_text());assert len(b1['testcases'])==2775
synthetic={'task':'test','class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT','name':'executionError','status':'FAIL'}
assert [c for c in b1['testcases'] if c['name']=='executionError']==[synthetic]
remaining=[c for c in b1['testcases'] if c!=synthetic];assert len(remaining)==2774
partition=dict(collections.Counter(c['task'] for c in remaining));assert partition=={'test':2710,'guidedIncrementalTest':62,'crossReplicaTest':2}
result={'status':'STATIC_ONLY_PROTOCOL_REVIEW_NO03_OUTCOME','bindingHashes':expected,'harnessSha256':H(harness),'producerJars':jars,'exactResources':resources,'closedDiagnostic':{'resultsSha256':d and H(R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-diag-start1-full01-results.json'),'counts':d['counts'],'nativeCollectorExit':d['exit'],'nativeGradleExit':d['gradleExit'],'rawOuterStatus':closed['status'],'rawObserverGapPreserved':closed['ownedIdentityObservationGap'],'artifactCounts':checks,'htmlCounterexample':html,'cohorts':cohorts},'historicalB1':{'rawCounts':b1['counts'],'rawSyntheticFailurePreserved':synthetic,'candidateCatalogAfterOnlyExactSyntheticExclusion':2774,'candidatePartitions':partition,'candidateNotYetAcceptedSourceDerivedFullCatalog':True},'current03OutputsReadOrAssessed':False,'postterminalArchivePerformed':False,'actualRunOrSourceOrHarnessMutation':False}
(Q/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'resourceCount':len(resources),'producerJars':len(jars),'closedHtml':len(html),'oldRuleFalseRejects':sum(v['exactPinnedStaticMatch'] for v in html),'otherClosedArtifacts':checks,'cohorts':cohorts,'candidateHistoricalPartitions':partition,'current03Assessed':False}))

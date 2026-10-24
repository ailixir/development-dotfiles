"""Independent immutable-source and historical XML binding audit; no current03 outputs."""
from pathlib import Path
import json,hashlib,collections,datetime,xml.etree.ElementTree as ET,re
R=Path.cwd();Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-source-catalog';E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';C=R/'docs/qa/evidence/STUDIO-OBS-011/t0/fullcheck03-case-catalog-candidate/resume2/expected-catalog.json'
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert H(C)=='164e9d53985b7e1108d66952ae85d6293d83af907aa2d4c14ac94604e1d5b5b7';cat=json.loads(C.read_text());bpath=E/'obs011-t0-baseline-check01-results.json';b=json.loads(bpath.read_text())
assert H(bpath)==cat['baselineReceipt']['sha256']=='914dcb06ea1d074f0bb3497a84e8b586752f63127717fc9fb12372bd6a8deb7a'
before=E/'obs011-t0-baseline-check01-before.json';after=E/'obs011-t0-baseline-check01-after.json';old=json.loads(before.read_text());end=json.loads(after.read_text());assert H(before)==cat['baselineSourceCapture']['sha256'];assert old['files']==end['files'] and old['dist']==end['dist'];assert len(old['files'])==1808
assert hashlib.sha256(json.dumps(old['files'],separators=(',',':')).encode()).hexdigest()==old['digest']==cat['sourceDigest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
pins={v['path']:v['sha256'] for v in old['files']}
for p,h in pins.items():assert H(R/p)==h,p
assert len(old['dist']['files'])==238
actual_dist=[{'path':str(p.relative_to(R/'studio-runner/dist')),'sha256':H(p)} for p in sorted((R/'studio-runner/dist').rglob('*')) if p.is_file()];assert actual_dist==old['dist']['files']
source=json.loads((Q/'source-methods.json').read_text());assert len(source['files'])==356
inventory={r['path']:r['sha256'] for r in cat['sourceTestJavaInventory']};assert inventory=={r['path']:r['sha256'] for r in source['files']}
for r in source['files']:assert pins[r['path']]==r['sha256']
selected=[r for r in source['files'] if Path(r['path']).stem.endswith(('Test','IT'))];assert len(selected)==318
classes={m['class'] for m in source['methods']};assert len(classes)==332;assert sorted(c for c in classes if '$' in c)==cat['nestedBinaryClassNamesPreserved'] and len(cat['nestedBinaryClassNamesPreserved'])==15
allclasses={c['binaryName']:c for c in source['classes']}
for row in cat['sourceClassMappings']:
 assert row['class'] in classes;decl=allclasses[row['class']];assert decl['path']==row['source'] and pins[row['source']]==row['sha256']
assert len(cat['sourceClassMappings'])==332
for row in cat['nonPrimarySourceDeclarations']:
 assert row['source'].endswith('/GuidedTranslationTest.java');assert row['class'].split('.')[-1] in ['GuidedDisabledWiringTest','GuidedProductionWiringTest'];assert 'class '+row['class'].split('.')[-1] in (R/row['source']).read_text()
assert cat['actualRunCaseExclusions']==[]
assert b['command']==['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon'];assert b['explicitTestTasks']==['test','guidedIncrementalTest','crossReplicaTest'];assert set(b['requiredFreshExecTasks'])==set(b['explicitTestTasks']);assert b['taskCollectionComplete'] is True and b['taskCollectionErrors']==[]
assert all(b[k] for k in ['sourceStable','distStable','testInputStable']);assert not b.get('explicitDisjointValidationExclusions')
start=datetime.datetime.fromisoformat(b['started']).timestamp();native_end=start+b['elapsedSeconds'];xmlrows=[];xmlclasses=[]
for f in b['xmlFiles']:
 p=R/f['path'];assert H(p)==f['sha256'] and p.stat().st_size==f['bytes'];assert p.stat().st_mtime_ns==f['mtimeNs'];assert start<=f['mtimeNs']/1e9<=native_end+2
 for event,node in ET.iterparse(p,events=['end']):
  if node.tag=='testcase':
   state='FAIL' if node.find('failure') is not None or node.find('error') is not None else 'SKIP' if node.find('skipped') is not None else 'PASS'
   xmlrows.append({'task':f['task'],'class':node.get('classname'),'name':node.get('name'),'status':state});node.clear()
 xmlclasses.append((f['task'],ET.parse(p).getroot().get('name')))
key=lambda c:(c['task'],c['class'],c['name'],c['status']);assert collections.Counter(map(key,xmlrows))==collections.Counter(map(key,b['testcases']));assert len(xmlrows)==2775 and len(xmlclasses)==333
assert len(set(xmlclasses))==333
for f in b['jacocoExecFiles']:
 p=R/f['path'];assert H(p)==f['sha256'] and p.stat().st_size==f['bytes'] and f['bytes']>0;assert start<=f['mtimeNs']/1e9<=native_end+2
assert len(b['jacocoExecFiles'])==3
synthetic=cat['historicalSyntheticProjectionOnly'];assert xmlrows.count(synthetic)==1 and synthetic=={'task':'test','class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT','name':'executionError','status':'FAIL'}
assert not any(m['method']=='executionError' for m in source['methods'])
expected=[{'task':r['task'],'class':r['class'],'name':r['name'],'expectedStatus':'SKIP' if r['status']=='SKIP' else 'PASS'} for r in xmlrows if r!=synthetic]
ekey=lambda c:(c['task'],c['class'],c['name'],c['expectedStatus']);assert collections.Counter(map(ekey,expected))==collections.Counter(map(ekey,cat['expectedCaseIdentities']))
policy=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/approved-skips.json';skips=json.loads(policy.read_text());ikey=lambda r:(r['task'],r['class'],r['name'])
assert len(skips)==9 and collections.Counter(map(ikey,skips))==collections.Counter(ikey(r) for r in expected if r['expectedStatus']=='SKIP')
assert sum(r['status']=='FAIL' for r in xmlrows)==15
facts={str(p.relative_to(R)):H(p) for p in [C,bpath,before,after,policy,R/'backend/build.gradle.kts',R/'backend/gradle/wrapper/gradle-wrapper.properties',R/'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',R/'backend/src/main/java/com/citi/put/checks/studio/dispatch/DispatchState.java',R/'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelRequest.java',R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/b1-terminal/audit.json',R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/b1-terminal/assessment.md',R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts-rereview/review.md']}
result={'decisionScope':'FULL_UNCHANGED_S011_EXPECTED_IDENTITY_CATALOG_ONLY','inputHashes':facts,'sourceDigest':old['digest'],'all1808PinnedCurrentHashesMatch':True,'currentAll356JavaTestMembershipAndHashesMatch':True,'dist238PinnedCurrentMembershipAndHashesMatch':True,'primaryTestITFiles':318,'binaryTestClasses':332,'taskQualifiedClasses':333,'nestedBinaryNamesPreserved':cat['nestedBinaryClassNamesPreserved'],'secondaryDeclarationsVerified':cat['nonPrimarySourceDeclarations'],'rawB1CountsPreserved':b['counts'],'rawB1XmlCount':len(xmlclasses),'rawB1XmlMultisetEqualsReceipt':True,'historicalSyntheticProjectedOnlyFromExpectedCatalog':synthetic,'expectedCatalogCases':len(expected),'exactApprovedSkips':skips,'historicalThreeExecFreshNonempty':True,'nativeBaselinePassed':False,'current03OutputReadOrOutcomeAssessed':False,'currentActualErrorProjectionAllowed':False,'sourceOrBuildSelectionChanged':False,'coverageOrC8OrW1OrLifecycleCredit':False}
(Q/'binding-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['decisionScope','all1808PinnedCurrentHashesMatch','currentAll356JavaTestMembershipAndHashesMatch','primaryTestITFiles','binaryTestClasses','taskQualifiedClasses','rawB1XmlCount','expectedCatalogCases','current03OutputReadOrOutcomeAssessed']}))

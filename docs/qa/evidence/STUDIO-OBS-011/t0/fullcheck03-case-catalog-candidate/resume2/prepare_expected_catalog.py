from pathlib import Path
import json,hashlib,re,collections,datetime
r=Path.cwd();t=r/'docs/qa/evidence/STUDIO-OBS-011/t0';out=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpath=r/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json';cpath=r/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-before.json';baseline=json.loads(bpath.read_text());capture=json.loads(cpath.read_text());plan=json.loads((t/'early/fullcheck-harness/resume3/plan.json').read_text());assert capture['files']==plan['source']['files'] and capture['digest']==plan['source']['digest'];pins={x['path']:x['sha256'] for x in capture['files']};assert all(baseline[k] for k in ['taskCollectionComplete','sourceStable','distStable','testInputStable']);raw=baseline['testcases'];synthetic={'task':'test','class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT','name':'executionError','status':'FAIL'};assert raw.count(synthetic)==1
policy=json.loads((r/plan['skipPath']).read_text());key=lambda x:(x['task'],x['class'],x['name']);assert collections.Counter(key(x) for x in raw if x['status']=='SKIP')==collections.Counter(map(key,policy))
# Only the HISTORICAL expected projection excludes its one proved framework event.
# A current actual executionError MUST remain a failure/extra case; no actual-run exclusions.
rows=[{'task':x['task'],'class':x['class'],'name':x['name'],'expectedStatus':'SKIP' if x['status']=='SKIP' else 'PASS'} for x in raw if x!=synthetic];assert len(rows)==2774
sources=[];primary=collections.defaultdict(list);texts={}
for p in sorted((r/'backend/src/test').rglob('*.java')):
 name=str(p.relative_to(r));s=p.read_text();texts[name]=s;m=re.search(r'(?m)^package\s+([\w.]+)\s*;',s)
 if m:
  assert name in pins and sha(p)==pins[name],name
  primary[m[1]+'.'+p.stem].append(name);sources.append({'path':name,'package':m[1],'primaryName':p.stem,'sha256':pins[name],'selectedFilenameShape':p.stem.endswith(('Test','IT'))})
classes=sorted({x['class'] for x in rows});classmap=[]
for cls in classes:
 top=cls.split('$')[0];matches=primary.get(top,[]);kind='package+primaryFilename'
 if not matches:
  pkg,short=top.rsplit('.',1);matches=[x['path'] for x in sources if x['package']==pkg and re.search(r'(?m)^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*(?:class|record|enum)\s+'+re.escape(short)+r'\b',texts[x['path']])];kind='explicitSecondaryDeclaration'
 assert len(matches)==1,(cls,matches)
 classmap.append({'class':cls,'source':matches[0],'sha256':pins[matches[0]],'mapping':kind})
# Outer-name normalization applies ONLY to source-file coverage, NEVER to actual case identities.
classset={c.split('$')[0] for c in classes};selected=[x for x in sources if x['selectedFilenameShape']];unrepresented=[x for x in selected if x['package']+'.'+x['primaryName'] not in classset];assert not unrepresented,unrepresented
catalog={'schemaVersion':1,'state':'PROPOSED EXPECTED CATALOG; INDEPENDENT QA SOURCE ACCEPTANCE REQUIRED','createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceDigest':capture['digest'],'baselineReceipt':{'path':str(bpath.relative_to(r)),'sha256':sha(bpath),'rawCounts':baseline['counts']},'baselineSourceCapture':{'path':str(cpath.relative_to(r)),'sha256':sha(cpath)},'generatorSha256':sha(Path(__file__)),'historicalSyntheticProjectionOnly':synthetic,'actualRunCaseExclusions':[],'expectedCaseCount':len(rows),'expectedTaskCounts':dict(collections.Counter(x['task'] for x in rows)),'expectedStatusCounts':dict(collections.Counter(x['expectedStatus'] for x in rows)),'expectedCaseIdentities':rows,'sourceClassMappings':classmap,'sourceTestJavaInventory':sources,'selectedTestITPrimaryFilesAllRepresented':True,'selectedPrimaryFileCount':len(selected),'uniqueClasses':len(classes),'taskQualifiedClasses':len({(x['task'],x['class']) for x in rows}),'nestedBinaryClassNamesPreserved':[c for c in classes if '$' in c],'nonPrimarySourceDeclarations':[x for x in classmap if x['mapping']!='package+primaryFilename'],'limits':['Historical independently audited same-source B1 identities plus original source hash/class inventory; not exhaustive Jupiter MethodSource/display-name parser. Independent Quinn acceptance of complete selection/variant multiplicity still required.','No current03 XML/testcase/result output read to construct expectation. Filename coverage/classsource binding alone does not assert actual execution or allpass.','Raw B1 all15failures and allcoverage/cohortqualifications preserved; exactone historical frameworkevent excluded only from expected projection. Anyactual03executionError remains actualfailure/extracase.']}
for name,data in [('expected-catalog.json',catalog),('receipt.json',{**{k:catalog[k] for k in ['state','sourceDigest','expectedCaseCount','expectedTaskCounts','expectedStatusCounts','selectedPrimaryFileCount','uniqueClasses','taskQualifiedClasses','nonPrimarySourceDeclarations','limits']},'catalogSha256':None})]:
 path=out/name
 if name=='receipt.json':data['catalogSha256']=sha(out/'expected-catalog.json')
 with path.open('x') as f:f.write(json.dumps(data,indent=2)+'\n')
print(json.dumps(json.loads((out/'receipt.json').read_text()),indent=2))

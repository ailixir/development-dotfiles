"""Metadata correction only. Reads source/review inputs; writes this exclusive folder only."""
from pathlib import Path
import json,re,ast,hashlib,collections,itertools,csv,io
from source_inventory import scan_source,lex_java,token_pairs
ROOT=Path.cwd();OUT=Path(__file__).parent;PRE=OUT/'virtual-pre-final';FINAL=OUT/'final-candidates';ORIG=OUT.parent
QA=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-source-catalog'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
catpath=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/fullcheck03-case-catalog-candidate/resume2/expected-catalog.json';cat=json.loads(catpath.read_text());assert h(catpath)=='164e9d53985b7e1108d66952ae85d6293d83af907aa2d4c14ac94604e1d5b5b7'
review=QA/'review.md';assert h(review)=='f8b43809a5243b69856a0c87fe721bd03a48826f0930de11cf4cbd6a0f001775'
# Isolate only pure QA definitions and regex globals. Never import/execute QA modules/entrypoints.
qafile=QA/'derive_catalog.py';qsource=qafile.read_text();qast=ast.parse(qsource);ns={'re':re,'json':json};funcbind={}
for node in qast.body:
 if isinstance(node,ast.Assign) and all(isinstance(t,ast.Name) and t.id in ['string','comment','lex'] for t in node.targets):exec(compile(ast.Module(body=[node],type_ignores=[]),'<bound pure QA regex>','exec'),ns)
 if isinstance(node,ast.FunctionDef) and node.name in ['tokens','inside','split','jstr','strings','constants','scalar','split_plus','stream_rows','literal_set']:
  exec(compile(ast.Module(body=[node],type_ignores=[]),'<bound pure QA definition>','exec'),ns);funcbind[node.name]=sha(ast.get_source_segment(qsource,node))
inside,split,strings,constants,scalar,stream_rows,literal_set=[ns[n] for n in ['inside','split','strings','constants','scalar','stream_rows','literal_set']]
# Pure old normalization also extracted only as definitions (not its author/reconstruction entrypoint).
auditast=ast.parse((ORIG/'audit_and_package.py').read_text());authast=ast.parse((ORIG/'author.py').read_text());normns={'re':re}
for tree,names in [(authast,['matching','splitargs']),(auditast,['normalize'])]:
 for node in tree.body:
  if isinstance(node,ast.FunctionDef) and node.name in names:exec(compile(ast.Module(body=[node],type_ignores=[]),'<bound pure port normalizer>','exec'),normns)
normalize=normns['normalize']
roottexts={str(p.relative_to(ROOT)):p.read_text() for p in sorted((ROOT/'backend/src/test/java').rglob('*.java'))}
rootscan={p:scan_source(s,p) for p,s in roottexts.items()};rootmethods=[m for x in rootscan.values() for m in x['methods']]
qmethods=json.loads((QA/'source-methods.json').read_text())['methods'];key=lambda m:(m['path'],m['class'],m['method'],m['kind'])
assert collections.Counter(map(key,rootmethods))==collections.Counter(map(key,qmethods))
# Actual factory declaration/body extraction, not a stored count or a Java method invocation.
def factory_body(text,name):
 ts=lex_java(text);v=[x[0] for x in ts];pairs=token_pairs(ts);found=[]
 for i,t in enumerate(v[:-1]):
  if t!=name or v[i+1]!='(' or (i and v[i-1] in ['.','new']):continue
  end=pairs[i+1];j=end+1
  if j<len(v) and v[j]=='throws':
   while j<len(v) and v[j] not in ['{',';']:j+=1
  if j<len(v) and v[j]=='{':found.append(text[ts[j][1]:ts[pairs[j]][2]])
 if len(found)!=1:raise ValueError(('Factory declaration resolution',name,len(found)))
 return found[0]
qfactories=json.loads((QA/'methodsource-bodies.json').read_text());baseline_factories={(r['path'],r['provider']):factory_body(roottexts[r['path']],r['provider']) for r in qfactories}
# Some accepted QA bodies include method signature before body; compare normalized tokens where applicable.
factorybind=[{'path':p,'provider':n,'actualSourceBodySha256':sha(b),'acceptedProviderRecordSha256':sha(next(r['body'] for r in qfactories if r['path']==p and r['provider']==n))} for (p,n),b in baseline_factories.items()]
pubpath=ROOT/'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json';doc=json.loads(pubpath.read_text())
def vec(section,field,pred=lambda v:True):return [[section+':'+v['name']] for v in doc[section][field] if pred(v)]
def provider_rows_for(texts):
 bodies={(p,n):factory_body(texts.get(p,roottexts[p]),n) for p,n in baseline_factories}
 rows={}
 for (path,name),body in bodies.items():
  const=constants(texts.get(path,roottexts[path]))
  if name=='internalBodies':value=[['v3/replay-job']]
  elif name=='positives':value=vec('snapshotCorrection','positives')+vec('graphTimingConformance','graphCases',lambda v:v['expected']=='ACCEPT')
  elif name in ['snapshotNegatives','candidateSnapshotNegatives']:
   names=literal_set(body);value=vec('snapshotCorrection','negatives',lambda v:v['name'] in names);assert len(value)==len(names)
  elif name=='admittedHistoryNegatives':
   names=literal_set(body);value=vec('graphTimingConformance','graphCases',lambda v:v['name'] in names);assert len(value)==len(names)
  elif name=='graphNegatives':
   excludes=['receipt-transport-authority-cannot-be-inferred-from-hash','raw-edge-cannot-name-pending-action'];assert all(x in body for x in excludes);value=vec('graphTimingConformance','graphCases',lambda v:v['expected']=='REJECT' and v['name'] not in excludes)
  elif name=='fullyResealedCandidateAttacks':
   names=literal_set(body);candidates=literal_set(bodies[(path,'candidateSnapshotNegatives')]);value=vec('snapshotCorrection','negatives',lambda v:v['name'] in candidates)+vec('graphTimingConformance','graphCases',lambda v:v['name'] in names);assert len(value)==len(candidates)+len(names)
  elif name=='malformedIdentity':
   names=strings(inside(texts.get(path,roottexts[path]),'REQUEST_FIELDS ='));variants=strings(inside(body,'Stream.of'));value=[list(v) for v in itertools.product(names,variants)];assert len(names)==19 and variants==['missing','null','wrong-type']
  elif name=='pairedChoiceMutations':continue
  else:value=stream_rows(body,const)
  rows[(path,name)]=value
 for (path,name),body in bodies.items():
  if name=='pairedChoiceMutations':
   names=set(strings(inside(body,'List.of')));source='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilderTest.java';value=[r for r in rows[(source,'brokenChoiceJoins')] if r[0] in names];assert len(value)==len(names);rows[(path,name)]=value
 return rows,bodies
build=(ROOT/'backend/build.gradle.kts').read_text();inc=set(strings(inside(build,'joinedIncrementalMethods ='))+strings(inside(build,'joinedPrefixSyncMethods ='))+strings(inside(build,'joinedAddedLowMethods =')));default=set(strings(inside(build,'joinedDefaultMethods =')));assert len(inc)==28 and len(default)==46
comment=ns['comment']
def enum_registry(texts):
 registry={};extra=['backend/src/main/java/com/citi/put/checks/studio/dispatch/DispatchState.java','backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelRequest.java']
 for path,text in list(texts.items())+[(p,(ROOT/p).read_text()) for p in extra]:
  stripped=comment.sub('',text)
  for hit in re.finditer(r'\benum\s+(CallerFlush|DispatchState|Cut|Mode|Kind)\s*\{',stripped):
   body=stripped[hit.end():];values=body[:re.search('[;}]',body).start()];registry[(path,hit[1])]=[v.strip() for v in values.split(',') if v.strip()]
 return registry

def derive(methods,texts,providers,enums):
 rows=[];details=[]
 for m in methods:
  text=texts[m['path']];const=constants(text);ann={a['name']:a['text'] for a in m['annotations']};cls=m['class'];method=m['method'];task='crossReplicaTest' if cls.endswith('.SseCrossReplicaIT') else 'test'
  if cls.endswith('.GuidedPublicationReplayIT'):
   assert method in inc|default,(method,'unregistered Replay method')
   if method in inc:task='guidedIncrementalTest'
  if m['kind']=='Test':
   if 'DisplayName' in ann:name=scalar(inside(ann['DisplayName'],'DisplayName'),const)
   else:name=method+'('+', '.join(p.strip().rsplit(None,1)[0].rsplit('.',1)[-1] for p in split(m['parameterText']))+')'
   names=[name];origin='plain source method/signature/DisplayName';arguments=[]
  else:
   if m['kind']!='ParameterizedTest':raise ValueError(('Unsupported live test kind, never filtered away',m))
   origin=next((k for k in ['ValueSource','EnumSource','MethodSource','CsvSource'] if k in ann),None)
   if origin is None:raise ValueError(('Unresolved parameterized source',m))
   if origin=='ValueSource':
    arg=inside(ann[origin],'ValueSource');arg=arg[arg.index('=')+1:].strip();values=split(arg[1:-1]) if arg.startswith('{') else [arg];arguments=[[scalar(v,const)] for v in values]
    if 'NullAndEmptySource' in ann:arguments=[[None],['']]+arguments
   elif origin=='CsvSource':arguments=[next(csv.reader([v],skipinitialspace=True)) for v in strings(inside(ann[origin],'CsvSource'))]
   elif origin=='MethodSource':
    arguments=[]
    for factory in m['factoryReferences']:
     if '#' in factory:raise ValueError(('External method factory requires explicit resolver, not filtered',factory))
     arguments+=providers[(m['path'],factory)]
   else:
    enum=re.search(r'([\w.]+)\.class',ann[origin])[1].split('.')[-1];matches=[v for (p,n),v in enums.items() if n==enum and (p==m['path'] or enum=='DispatchState' and p.endswith('/dispatch/DispatchState.java') or enum=='Kind' and p.endswith('/translation/GuidedModelRequest.java'))];assert len(matches)==1,(m['path'],enum,matches);values=matches[0]
    if 'names' in ann[origin]:chosen=set(strings(ann[origin]));values=[v for v in values if v in chosen];assert set(values)==chosen
    arguments=[[v] for v in values]
   found=re.search(r'name\s*=\s*("(?:\\.|[^"\\])*")',ann['ParameterizedTest']);param_names=[p.rsplit(None,1)[-1] for p in split(m['parameterText'])];names=[]
   for i,arg in enumerate(arguments,1):
    render=lambda v:'null' if v is None else v
    if found:
     name=json.loads(found[1])
     for j,value in enumerate(arg):name=name.replace('{'+str(j)+'}',render(value))
    else:name='['+str(i)+'] '+', '.join(n+'='+render(value) for n,value in zip(param_names,arg))
    assert '<UNUSED_DYNAMIC_ARGUMENT>' not in name,(method,name);names.append(name)
  ids=[{'task':task,'class':cls,'name':name} for name in names];rows+=ids
  details.append({'path':m['path'],'class':cls,'method':method,'kind':m['kind'],'task':task,'sourceLine':m['line'],'signature':m['signature'],'parameters':m['parameters'],'annotations':m['annotations'],'factoryReferences':m['factoryReferences'],'origin':origin,'sourceProjectedInvocationCount':len(names),'argumentsProjection':arguments,'identities':ids,'bodySha256':m['bodySha256']})
 return rows,details
baselineproviders,_=provider_rows_for(roottexts);rootids,rootdetail=derive(rootmethods,roottexts,baselineproviders,enum_registry(roottexts));idkey=lambda x:(x['task'],x['class'],x['name']);difference={'missingFromAccepted':list((collections.Counter(map(idkey,rootids))-collections.Counter(map(idkey,cat['expectedCaseIdentities']))).elements()),'acceptedNotDerived':list((collections.Counter(map(idkey,cat['expectedCaseIdentities']))-collections.Counter(map(idkey,rootids))).elements())};assert not any(difference.values()),difference
nested=sorted({m['class'] for m in rootmethods if '$' in m['class']});secondary=sorted({m['class'] for m in rootmethods if '$' not in m['class'] and m['class'].rsplit('.',1)[1]!=Path(m['path']).stem});assert len(nested)==15 and len(secondary)==2
(OUT/'accepted-S011-source-reconciliation.json').write_text(json.dumps({'kind':'STATIC_SOURCE_PROJECTION_ACCEPTED_2774_NOT_ACTUAL_FRESH_JUNIT_COLLECTION','catalog':{'path':str(catpath.relative_to(ROOT)),'sha256':h(catpath)},'independentQAReview':{'path':str(review.relative_to(ROOT)),'sha256':h(review)},'plainMethods':sum(m['kind']=='Test' for m in rootmethods),'parameterizedMethods':sum(m['kind']=='ParameterizedTest' for m in rootmethods),'parameterizedInvocations':sum(d['sourceProjectedInvocationCount'] for d in rootdetail if d['kind']=='ParameterizedTest'),'derivedCount':len(rootids),'taskCounts':dict(collections.Counter(x['task'] for x in rootids)),'all15NestedBinaryNames':nested,'all2SecondaryClasses':secondary,'difference':difference,'noActualRunCaseFiltering':True,'nativeFailuresRemoved':False},indent=2)+'\n')
# Exact scoped before/after sources, plus all named read-only verification subjects from gate manifests.
plan=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text());ops=[r for r in plan['resolvedAliases']['FOLD_TESTS'] if not r['path'].endswith('/PublicationGrantClockIT.java')]
subjects=set(r['path'] for r in ops);fqncommands=[]
for lane in plan['lanes']:
 if lane['id'] in ['11-FOLD-prep','11-FOLD-final']:fqncommands+=lane.get('verify',[])
for fq in re.findall(r"--tests '([^']+)'",'\n'.join(fqncommands)):
 name=fq.rsplit('.',1)[1];paths=[p for p in roottexts if p.endswith('/'+name+'.java')]+[str(p.relative_to(FINAL)) for p in FINAL.rglob(name+'.java') if str(p.relative_to(FINAL)) not in roottexts]
 assert len(set(paths))==1,(fq,paths);subjects.update(paths)
subjects.update(['backend/src/test/java/com/citi/put/checks/studio/dispatch/DispatchAuthorizationIT.java','backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/publication/PublicationGrantClockIT.java'])
pretexts=dict(roottexts);finaltexts=dict(roottexts)
for p in subjects:
 if (PRE/p).exists():pretexts[p]=(PRE/p).read_text()
 if (FINAL/p).exists():finaltexts[p]=(FINAL/p).read_text()
 elif (PRE/p).exists():finaltexts.pop(p,None)
preparsed={p:scan_source(pretexts[p],p) for p in sorted(subjects) if p in pretexts};finalparsed={p:scan_source(finaltexts[p],p) for p in sorted(subjects) if p in finaltexts}
preproviders,prebodies=provider_rows_for(pretexts);finalproviders,finalbodies=provider_rows_for(finaltexts)
preids,predetail=derive([m for f in preparsed.values() for m in f['methods']],pretexts,preproviders,enum_registry(pretexts));finalids,finaldetail=derive([m for f in finalparsed.values() for m in f['methods']],finaltexts,finalproviders,enum_registry(finaltexts))
cases=[];failures=[];origold=json.loads((ORIG/'test-case-assertion-preservation.json').read_text());oldnames={r['source']:{n[1] for n in r['oldMethods']} for r in origold['cases']}
for op in ops:
 p=op['path'];target='backend/src/test/java/com/citi/put/checks/studio/dispatch/DispatchAuthorizationIT.java' if op['operation']=='delete' else p;a=preparsed[p]['methods'];b=finalparsed[target]['methods'];bym={(m['class'].rsplit('.',1)[-1],m['method'],m['kind']):m for m in b};rows=[]
 for m in a:
  possible=[n for n in b if n['method']==m['method'] and n['kind']==m['kind'] and (op['operation']=='delete' or n['class']==m['class'])];assert len(possible)==1,(p,m['method'],possible);n=possible[0]
  flags={'bodyTokensEqualAfterBoundedPorts':normalize(m['body'])==normalize(n['body']),'annotationsExact':[x['text'] for x in m['annotations']]==[x['text'] for x in n['annotations']],'parameterSignatureExact':m['parameterText']==n['parameterText'],'factoryReferencesExact':m['factoryReferences']==n['factoryReferences']}
  if not all(flags.values()):failures.append({'path':p,'method':m['method'],'flags':flags})
  rows.append({'before':{k:v for k,v in m.items() if k!='body'},'after':{k:v for k,v in n.items() if k!='body'},'proof':flags,'beforeAssertionMarkers':m['body'].count('assertThat'),'afterAssertionMarkers':n['body'].count('assertThat')})
 cases.append({'source':p,'target':target,'operation':op['operation'],'beforeCount':len(a),'afterCount':len(b),'wholeSourceEqualAfterListedPortsExcludingImports':normalize(re.sub(r'(?m)^import[^\n]*\n','',pretexts[p]))==normalize(re.sub(r'(?m)^import[^\n]*\n','',finaltexts[target])) if op['operation']!='delete' else None,'methods':rows,'previouslyOmittedMethods':[m['method'] for m in a if m['method'] not in oldnames[p]]})
assert not failures,failures
recovered=[{'path':c['source'],'method':n} for c in cases for n in c['previouslyOmittedMethods']];assert len(recovered)==13,recovered
for suffix,count in [('GuidedPublicationReplayIT.java',74),('GuidedPlanningIntegrationTest.java',35),('GuidedSecretByteBodyTest.java',4)]:assert next(c['beforeCount'] for c in cases if c['source'].endswith('/'+suffix))==count
(OUT/'test-case-assertion-preservation.json').write_text(json.dumps({'status':'FOLD_META_01_CORRECTED_METADATA_ONLY_NOT_RUNTIME','normalization':'Same original bounded type/package/observer/percall-bounds/TLS-field port normalization; whole-source tokens unchanged for all20 survivors. New scanner includes all qualified/additional annotation chains. No assertion/timer/oracle/source edits.','cases':cases,'failures':failures,'recovered13Methods':recovered,'readOnlyAndNewVerificationSubjects':[{'path':p,'methods':[{k:v for k,v in m.items() if k!='body'} for m in finalparsed[p]['methods']]} for p in sorted(finalparsed) if p not in {o['path'] for o in ops}]},indent=2)+'\n')
# Source-scoped identity mapping never blindly reuses deleted class IDs.
legacy='com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorizationIT';destination='com.citi.put.checks.studio.dispatch.DispatchAuthorizationIT'
oldrows=[x for x in preids if x['class']==legacy];assert len(oldrows)==7
renamed=[dict(x,**{'class':destination}) for x in oldrows];finalcount=collections.Counter(map(idkey,finalids));assert all(finalcount[idkey(x)]==1 for x in renamed)
accepted=collections.Counter(map(idkey,cat['expectedCaseIdentities']));projected=[]
for d in finaldetail:
 for row in d['identities']:
  origin='accepted S011 exact identity retained' if accepted[idkey(row)] else 'explicit original7 authority class relocation' if idkey(row) in set(map(idkey,renamed)) else 'separately source-derived prepared/new verification case (not inherited S011 ID)'
  projected.append(dict(row,method=d['method'],path=d['path'],origin=origin))
# All parameterized variants are sourced from the actual scanned annotations/factory bodies.
replaydetail=next(d for d in finaldetail if d['method']=='incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser');assert replaydetail['sourceProjectedInvocationCount']==35
(OUT/'expected-discovery.json').write_text(json.dumps({'kind':'COMPLETE_SCOPED_STATIC_SOURCE_VARIANT_PROJECTION_NOT_ACTUAL_JUNIT_DISCOVERY','acceptedBaselineSourceIDs':2774,'baselineReconciliation':'accepted-S011-source-reconciliation.json','scope':'All21 original FOLD operations plus every named prep/final verification subject; nested binary declaring identities preserved','allMethods':finaldetail,'projectedIdentities':projected,'taskCounts':dict(collections.Counter(r['task'] for r in projected)),'sourceProjectedIdentityCount':len(projected),'sourceParameterizedMethodCount':sum(d['kind']=='ParameterizedTest' for d in finaldetail),'sourceParameterizedInvocationCount':sum(d['sourceProjectedInvocationCount'] for d in finaldetail if d['kind']=='ParameterizedTest'),'original7AuthorityRelocation':{'oldClass':legacy,'newClass':destination,'oldClassDeleted':True,'sourceDerivedNewIdentities':renamed,'eachOccursOnce':True,'workerNegativeAdditional':[r for r in projected if r['method']=='workerWithoutPublicationCollaboratorRefusesEveryPublicationOperation']},'Clock3':[d for d in finaldetail if d['class'].endswith('.PublicationGrantClockIT')],'35ReplayJoinedVariants':replaydetail,'recovered13Methods':recovered,'TSOneRenameZeroAddDrop':json.loads((OUT/'ts-metadata-proposals.json').read_text()),'runtimeCollection':'UNEXECUTED; source projection must never filter away live FAIL cases or claim fresh native discovery. Actual XML/task/variant accounting remains owed.'},indent=2)+'\n')
verification=[]
for p in sorted(finalparsed):
 if p in {o['path'] for o in ops}:continue
 before=preparsed.get(p,{'methods':[]})['methods'];after=finalparsed[p]['methods'];rows=[]
 for a in before:
  matches=[b for b in after if (b['class'],b['method'],b['kind'])==(a['class'],a['method'],a['kind'])];assert len(matches)==1,(p,a['method'])
  b=matches[0]
  flags={'bodyEqual':normalize(a['body'])==normalize(b['body']),'annotationsExact':[x['text'] for x in a['annotations']]==[x['text'] for x in b['annotations']],'parametersExact':a['parameterText']==b['parameterText'],'factoryReferencesExact':a['factoryReferences']==b['factoryReferences']}
  assert all(flags.values()),(p,a['method'],flags)
  rows.append({'class':a['class'],'method':a['method'],'kind':a['kind'],'beforeBodySha256':a['bodySha256'],'afterBodySha256':b['bodySha256'],'proof':flags})
 assert len(before)==len(after),(p,len(before),len(after))
 verification.append({'path':p,'sourceBeforeSha256':sha(pretexts[p]),'sourceAfterSha256':sha(finaltexts[p]),'methodCount':len(rows),'methods':rows,'scope':'named read-only/prepared verification subject; ClockIT whole-file legacy fallback cleanup separately exact-bound; no method changes'})
(OUT/'verification-subject-preservation.json').write_text(json.dumps({'runtimeVerified':False,'subjects':verification,'newSourceDerivedCases':'Three folded-client +threeClock +oneworker refusal independently projected from current source, never borrowed old catalog IDs'},indent=2)+'\n')
(OUT/'scanner-and-factory-provenance.json').write_text(json.dumps({'pureScannerSha256':h(OUT/'source_inventory.py'),'acceptedQAPureHelperFile':{'path':str(qafile.relative_to(ROOT)),'sha256':h(qafile)},'extractedPureFunctionHashes':funcbind,'QAEntryPointImportedOrExecuted':False,'QAOutputWrites':False,'actualSourceFactoryBodies':factorybind,'publicationFixtureSha256':h(pubpath),'rootAndProspectiveMethodSources':[{'path':p,'provider':n,'beforeBodySha256':sha(prebodies[(p,n)]),'afterBodySha256':sha(finalbodies[(p,n)]),'normalizedBodyEqual':normalize(prebodies[(p,n)])==normalize(finalbodies[(p,n)])} for p,n in preproviders if p in subjects]},indent=2)+'\n')
(OUT/'metadata-correction-results.json').write_text(json.dumps({'status':'AUTHOR_METADATA_CORRECTION_FOR_NARROW_INDEPENDENT_REVIEW','recovered13Methods':recovered,'rootPlain':sum(m['kind']=='Test' for m in rootmethods),'rootParameterizedMethods':sum(m['kind']=='ParameterizedTest' for m in rootmethods),'rootParameterizedInvocations':sum(d['sourceProjectedInvocationCount'] for d in rootdetail if d['kind']=='ParameterizedTest'),'rootIdentities':len(rootids),'rootTaskCounts':dict(collections.Counter(r['task'] for r in rootids)),'nested15':nested,'secondary2':secondary,'all20SurvivingWholeSourcesPreserved':all(c['wholeSourceEqualAfterListedPortsExcludingImports'] for c in cases if c['operation']!='delete'),'allMethodsAnnotationsParametersFactoriesBodiesPreserved':not failures,'scopedProjectedIdentities':len(projected),'sourceOrPatchChanges':False,'runtimeVerified':False,'nativeFAILCasesExcluded':False},indent=2)+'\n')
print(json.dumps({'recovered':recovered,'baselineIdentities':len(rootids),'scopedIdentities':len(projected),'allBodyAnnotationFactoryProofs':not failures},indent=2))

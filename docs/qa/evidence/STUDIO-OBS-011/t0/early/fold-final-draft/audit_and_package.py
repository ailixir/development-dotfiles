from pathlib import Path
import hashlib,json,re,difflib,ast
ROOT=Path.cwd();OUT=Path(__file__).parent;PRE=OUT/'virtual-pre-final';FINAL=OUT/'final-candidates';EARLY=OUT.parent
base='backend/src/main/java/com/citi/put/checks/studio/';test='backend/src/test/java/com/citi/put/checks/studio/'
plan=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text());main=plan['resolvedAliases']['FOLD_PREP_MAIN'];tests=plan['resolvedAliases']['FOLD_TESTS'];origtests=[x for x in tests if not x['path'].endswith('/PublicationGrantClockIT.java')]
legacy=[base+'guided/bridge/GuidedRunnerClient.java',base+'guided/publication/ObservedValidationClient.java',base+'guided/publication/GuidedPublicationAuthorization.java'];projector=base+'guided/publication/GuidedPublicationResultProjector.java';observer=test+'dispatch/DispatchTestAccess.java';clock=test+'guided/publication/PublicationGrantClockIT.java'
sha=lambda b:hashlib.sha256(b).hexdigest();h=lambda p:sha(p.read_bytes())
# Reuse pure lexical delimiter/patch utility definitions only, never execute predecessor scripts.
ns={'re':re}
source=ast.parse((EARLY/'fold-prep-draft/resume2/verify_reconstruction.py').read_text())
for node in source.body:
 if isinstance(node,ast.FunctionDef) and node.name=='balanced_java':exec(compile(ast.Module(body=[node],type_ignores=[]),'<pure lexical helper>','exec'),ns)
# Local structural Java expression scanner (not compiler/AST type verification).
source=ast.parse((OUT/'author.py').read_text())
for node in source.body:
 if isinstance(node,ast.FunctionDef) and node.name in ['matching','splitargs']:exec(compile(ast.Module(body=[node],type_ignores=[]),'<pure argument helper>','exec'),ns)
matching=ns['matching'];splitargs=ns['splitargs']

def methods(s):
 out=[]
 for m in re.finditer(r'@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)(?:\([^)]*\))?\s*(?:@[\s\S]*?\n\s*)?(?:public\s+|protected\s+|private\s+)?(?:void|[\w<>.?]+)\s+(\w+)\s*\([^)]*\)(?:\s+throws[^\{]+)?\s*\{',s):
  start=s.index('{',m.start());end=matching(s,start,'{','}')
  out.append({'kind':m[1],'name':m[2],'body':s[start:end+1]})
 return out

def normalize(s):
 # Approved receiver-only observer bridge.
 s=re.sub(r'DispatchTestAccess\.observeRequestBytes\((\w+),\s*([^;]+)\);',r'\1.observeRequestBytes(\2);',s)
 # Preserve original validation constructor and per-call limits by separately bound site map.
 edits=[]
 for m in re.finditer(r'new (?:ObservedValidationClient|HttpRunnerDispatchClient)\s*\(',s):
  a=s.index('(',m.start());b=matching(s,a);args=splitargs(s,a+1,b)
  if len(args)==5 and 'GuidedPublicationProperties' in s[args[4][0]:args[4][1]]:edits.append((args[3][1],b,''))
 for a,b,t in reversed(edits):s=s[:a]+t+s[b:]
 edits=[]
 for m in re.finditer(r'\b(?:client|tight|validator)\.validate\s*\(',s):
  a=s.index('(',m.start());b=matching(s,a);args=splitargs(s,a+1,b)
  if len(args)==4:edits.append((args[1][1],b,''))
 for a,b,t in reversed(edits):s=s[:a]+t+s[b:]
 for prefix in ['com.citi.put.checks.studio.guided.bridge.','com.citi.put.checks.studio.guided.publication.','com.citi.put.checks.studio.dispatch.']:
  for name in ['GuidedRunnerClient','ObservedValidationClient','HttpRunnerDispatchClient']:
   s=s.replace(prefix+name,'FOLDEDCLIENT')
  for name in ['GuidedPublicationAuthorization','DispatchAuthorization','PublicationGrantAuthority']:
   s=s.replace(prefix+name,'AUTHORITY')
 s=re.sub(r'\b(GuidedRunnerClient|ObservedValidationClient|HttpRunnerDispatchClient)\b','FOLDEDCLIENT',s)
 s=re.sub(r'\b(GuidedPublicationAuthorization|DispatchAuthorization|PublicationGrantAuthority)\b','AUTHORITY',s)
 s=s.replace('field(bridge, "guidedClient")','field(bridge, "client")').replace('field(validation, "validationClient")','field(validation, "client")')
 # Exclude formatting/comments only; preserve every actual literal/operator/statement after listed ports.
 tokens=re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|\w+|[^\s]',s)
 return [x for x in tokens if not x.startswith(('//','/*'))]

cases=[];failures=[]
for row in origtests:
 rel=row['path'];old=(PRE/rel).read_text()
 target=test+'dispatch/DispatchAuthorizationIT.java' if row['operation']=='delete' else rel
 new=(FINAL/target).read_text();ob=methods(old);nb=methods(new)
 oldnames=[(x['kind'],x['name']) for x in ob];newnames=[(x['kind'],x['name']) for x in nb]
 same=all(pair in newnames for pair in oldnames) if row['operation']=='delete' else oldnames==newnames
 matches=[]
 for entry in ob:
  candidates=[x for x in nb if x['name']==entry['name'] and x['kind']==entry['kind']]
  equal=bool(candidates) and normalize(entry['body'])==normalize(candidates[0]['body'])
  matches.append({'name':entry['name'],'kind':entry['kind'],'bodyEqualAfterListedMechanicalPorts':equal,'oldBodySha256':sha(entry['body'].encode()),'newBodySha256':sha(candidates[0]['body'].encode()) if candidates else None})
  if not equal:failures.append({'path':rel,'method':entry['name']})
 cases.append({'source':rel,'target':target,'operation':row['operation'],'oldClass':Path(rel).stem,'newClass':Path(target).stem,'oldMethods':oldnames,'newMethods':newnames,'namesAndKindsPreserved':same,'wholeSourceEqualAfterListedPortsExcludingImports':normalize(re.sub(r'(?m)^import[^\n]*\n','',old))==normalize(re.sub(r'(?m)^import[^\n]*\n','',new)) if row['operation']!='delete' else None,'assertionMarkerCountBefore':old.count('assertThat'),'assertionMarkerCountAfter':new.count('assertThat'),'methods':matches})
(OUT/'test-case-assertion-preservation.json').write_text(json.dumps({'normalization':'Only bound class/package names, observer test-side receiver, explicit validation constructor-to-call limits and TLS reflection field names; comments/whitespace excluded. No other operators/literals/statements ignored.','cases':cases,'failures':failures},indent=2)+'\n')
# Scope, modes, complete perpath/incremental/atomic patch, including deletions.
allowed=set(main+[projector]+legacy+[r['path'] for r in tests]+[observer,'studio-runner/test/fixtures-tier/guidedCloseBound.test.ts','studio-runner/test/guided/runtime.test.ts'])
allpaths={str(p.relative_to(PRE)) for p in PRE.rglob('*') if p.is_file()}|{str(p.relative_to(FINAL)) for p in FINAL.rglob('*') if p.is_file()}
operations=[];atomic='';patchdir=OUT/'patches';patchdir.mkdir(exist_ok=True)
for rel in sorted(allpaths):
 a=PRE/rel;b=FINAL/rel;old=a.read_text() if a.exists() else '';new=b.read_text() if b.exists() else ''
 if old==new:continue
 assert rel in allowed,('unowned mutation',rel)
 diff=''.join(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+rel if a.exists() else '/dev/null',tofile='b/'+rel if b.exists() else '/dev/null'))
 name=rel.replace('/','__')+'.patch';(patchdir/name).write_text(diff);atomic+=diff
 operations.append({'path':rel,'operation':'delete' if not b.exists() else 'add' if not a.exists() else 'edit','preimageSha256':h(a) if a.exists() else None,'candidateSha256':h(b) if b.exists() else None,'preimageMode':oct(a.stat().st_mode&0o777) if a.exists() else None,'candidateMode':oct(b.stat().st_mode&0o777) if b.exists() else None,'patch':name,'patchSha256':sha(diff.encode()),'ownership':'PROPOSED_TS_METADATA_ONLY' if rel.startswith('studio-runner/') else 'v7 exact FOLD-final'})
(patchdir/'atomic-final-from-prepared-inputs.patch').write_text(atomic)
# Incremental logical groups are review forms ONLY, never independently compile-clean application units.
groups={'01-main-projector-config-and-legacy-retirement':lambda p:'/src/main/' in p,'02-test-ports-observer-and-clock-cleanup':lambda p:'/src/test/' in p,'03-PROPOSED-TS-metadata':lambda p:p.startswith('studio-runner/')}
for name,predicate in groups.items():(patchdir/(name+'.patch')).write_text(''.join((patchdir/o['patch']).read_text() for o in operations if predicate(o['path'])))
# Strict in-memory apply proves every context/deletion and each whole-tree output.
def apply_patch(text,tree):
 lines=text.splitlines(keepends=True);i=0
 while i<len(lines):
  assert lines[i].startswith('--- ')
  before=lines[i][4:].strip();after=lines[i+1][4:].strip();i+=2;rel=(before if after=='/dev/null' else after)[2:]
  original=tree.get(rel,'').splitlines(keepends=True);result=[];cursor=0
  if before=='/dev/null':assert rel not in tree
  while i<len(lines) and lines[i].startswith('@@'):
   m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]);assert m
   count=int(m[2] or 1);at=int(m[1])-1 if count else int(m[1]);result+=original[cursor:at];cursor=at;i+=1;olds=news=0
   while i<len(lines) and not lines[i].startswith(('@@','--- ')):
    r=lines[i];prefix=r[0];body=r[1:];assert prefix in ' +-'
    if prefix in ' -':assert cursor<len(original) and original[cursor]==body,(rel,cursor);cursor+=1;olds+=1
    if prefix in ' +':result.append(body);news+=1
    i+=1
   assert olds==count and news==int(m[4] or 1)
  result+=original[cursor:]
  if after=='/dev/null':assert not result;tree.pop(rel)
  else:tree[rel]=''.join(result)
 return tree
initial={str(p.relative_to(PRE)):p.read_text() for p in PRE.rglob('*') if p.is_file()};expected={str(p.relative_to(FINAL)):p.read_text() for p in FINAL.rglob('*') if p.is_file()}
replay=apply_patch(atomic,dict(initial));incremental=dict(initial)
for name in groups:incremental=apply_patch((patchdir/(name+'.patch')).read_text(),incremental)
# Exact normalized full grep over current root source plus prospective overlay (not a narrow filename scan).
pattern=re.compile(r'\b(GuidedRunnerClient|ObservedValidationClient|GuidedPublicationAuthorization)\b')
hits=[];beforehits=[]
for folder in ['backend/src','studio-runner/src','studio-runner/test']:
 paths={str(p.relative_to(ROOT)) for p in (ROOT/folder).rglob('*') if p.is_file()}
 paths|={p for p in expected if p.startswith(folder+'/')}
 for rel in sorted(paths):
  raw=(ROOT/rel).read_text(errors='replace') if (ROOT/rel).exists() else ''
  for n,line in enumerate(raw.splitlines(),1):
   if pattern.search(line):beforehits.append({'path':rel,'line':n,'text':line})
  if rel in initial and rel not in expected:continue
  value=expected.get(rel,raw)
  for n,line in enumerate(value.splitlines(),1):
   if pattern.search(line):hits.append({'path':rel,'line':n,'text':line})
rt='studio-runner/src/run/guidedBrowser.ts';rtcandidate=EARLY/'runner-draft/repo'/rt
rtfacts={'path':rt,'currentSourceSha256':h(ROOT/rt),'approvedRTCandidateSha256':h(rtcandidate),'owner':'11-RT; source copyback only11-MERGE W5','candidateOldNameCount':len(pattern.findall(rtcandidate.read_text())),'interimFullGrepHits':hits,'adoption':'PROPOSED root/Aria/QA bounded FOLD exit one known RT-owned JSDoc pendingMERGE; original grep rerun afterMERGE beforeDone must be0; no finalstateexception'}
(OUT/'grep-and-RT-ownership.json').write_text(json.dumps({'literalOriginalCommand':"grep -rnw 'GuidedRunnerClient\\|ObservedValidationClient\\|GuidedPublicationAuthorization' backend/src studio-runner/src studio-runner/test",'positiveControlsBefore':beforehits,'prospectiveAfter':hits,'rt':rtfacts},indent=2)+'\n')
checks={'fullAtomicReconstructsEveryInputAndDeletion':replay==expected,'threeIncrementalReviewFormsReconstructSameFullTree':incremental==expected,'allMain17CandidatesPresent':all((FINAL/p).exists() for p in main),'exact21OriginalTestOperations':len(origtests)==21,'allThreeRetiredMainClassesDeleted':all(not (FINAL/p).exists() for p in legacy),'retiredAuthorityITDeletedAfterByNameMap':not (FINAL/(test+'guided/publication/GuidedPublicationAuthorizationIT.java')).exists(),'newObserverTestSideOnly':(FINAL/observer).exists(),'exactClockCleanup':h(FINAL/clock)==h(EARLY/'fold-prep-draft/resume2/final-clock-test-baton'/clock),'noUnexpectedSourceOwnership':True,'JavaLexicalDelimitersBalanced':all(ns['balanced_java'](p.read_text()) for p in FINAL.rglob('*.java')),'allOriginalMethodNamesAndKindsPreserved':all(x['namesAndKindsPreserved'] for x in cases),'allMethodBodiesPreservedAfterExplicitPorts':not failures,'interimGrepOnlyOneRTOwnedComment':len(hits)==1 and hits[0]['path']==rt,'LEFTAndGSMSharedPassthroughByteExact':all(h(PRE/p)==h(FINAL/p) for p in allpaths if p not in allowed),'noRuntimeVerified':True}
(OUT/'atomic-manifest.json').write_text(json.dumps({'status':'PROSPECTIVE_OFF_TREE_ONLY_ALL_BATONS_UNRELEASED','runtimeVerified':False,'operations':operations,'atomicPatchSha256':sha(atomic.encode()),'allCandidateHashes':{p:h(FINAL/p) for p in expected}},indent=2)+'\n')
(OUT/'static-audit.json').write_text(json.dumps({'kind':'LIGHTWEIGHT_STRUCTURAL_AND_RECONSTRUCTION_ONLY_NOT_JAVA_COMPILATION','checks':checks,'bodyNormalizationFailures':failures},indent=2)+'\n')
print(json.dumps({'operations':len(operations),'checks':checks,'failures':failures},indent=2))

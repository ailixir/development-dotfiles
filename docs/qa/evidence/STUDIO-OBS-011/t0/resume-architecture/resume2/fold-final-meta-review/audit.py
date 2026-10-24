"""Independent read-only FOLD metadata review. Writes only this review directory."""
from pathlib import Path
import ast, collections, hashlib, json, re, stat
R=Path.cwd(); T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'; O=T/'early/fold-final-draft'; N=O/'resume2'; Q=T/'qa/fullcheck03-source-catalog'; HERE=Path(__file__).parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
S=lambda x:hashlib.sha256(x.encode()).hexdigest()
J=lambda p:json.loads(p.read_text())
results={}; checks=0
def check(value, context):
 global checks
 checks+=1
 if not value:raise AssertionError(context)

# Independent lexical mask; preserve offsets, remove literal/comment delimiter effects.
def mask(source):
 out=list(source);i=0
 while i<len(source):
  start=i
  if source.startswith('//',i):
   j=source.find('\n',i+2);i=len(source) if j<0 else j
  elif source.startswith('/*',i):
   j=source.find('*/',i+2);check(j>=0,'comment closure');i=j+2
  elif source.startswith('"""',i):
   i+=3
   while i<len(source):
    if source[i]=='\\':i+=2
    elif source.startswith('"""',i):i+=3;break
    else:i+=1
  elif source[i] in ['"',"'"]:
   quote=source[i];i+=1
   while i<len(source):
    if source[i]=='\\':i+=2
    elif source[i]==quote:i+=1;break
    else:i+=1
  else:i+=1;continue
  for j in range(start,i):
   if out[j]!='\n':out[j]=' '
 return ''.join(out)

def scan(source,path):
 m=mask(source); stack=[];pairs={}
 for i,c in enumerate(m):
  if c in '({[':stack.append((c,i))
  elif c in ')}]':
   a,j=stack.pop();check(a=={')':'(',']':'[','}':'{'}[c],('balance',path,i));pairs[j]=i
 check(not stack,('unclosed',path))
 package=re.search(r'\bpackage\s+([\w.]+)\s*;',m);package=package[1]+'.' if package else ''
 classes=[]
 for match in re.finditer(r'(?<![\w$.])(?:class|interface|enum|record)\s+([\w$]+)',m):
  k=match.end()
  while k<len(m) and m[k] not in '{;':
   k=pairs[k]+1 if m[k] in '([' else k+1
  if m[k]=='{':classes.append((match.start(),k,pairs[k],match[1]))
 methods=[];pos=0
 while True:
  a=m.find('@',pos)
  if a<0:break
  p=a;anns=[]
  while p<len(m):
   while p<len(m) and m[p].isspace():p+=1
   if m[p:p+1]=='@':
    z=re.match(r'@([\w$]+(?:\s*\.\s*[\w$]+)*)',m[p:])
    if not z:break
    start=p;name=re.sub(r'\s','',z[1]);p+=z.end()
    while p<len(m) and m[p].isspace():p+=1
    if m[p:p+1]=='(':p=pairs[p]+1
    else:p=start+z.end()
    anns.append((name,source[start:p]));continue
   mod=re.match(r'(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default)\b',m[p:])
   if mod:p+=mod.end();continue
   break
  pos=max(a+1,p)
  kinds=[n.rsplit('.',1)[-1] for n,t in anns if n.rsplit('.',1)[-1] in {'Test','ParameterizedTest','RepeatedTest','TestFactory','TestTemplate'}]
  if not kinds:continue
  par=m.find('(',p); boundary=min([z for c in '{};' if (z:=m.find(c,p))>=0] or [len(m)])
  check(par>=0 and par<boundary,('annotated declaration',path,a))
  hit=re.search(r'([\w$]+)\s*$',m[p:par]);check(bool(hit),('method name',path,a));name=hit[1];namepos=p+hit.start(1)
  end=pairs[par];body=end+1
  while body<len(m) and m[body] not in '{;':body+=1
  owner=[c for c in classes if c[1]<a<c[2]];owner.sort();check(bool(owner),('owner',path,name))
  ownername=package+'$'.join(c[3] for c in owner)
  bodytext=source[body:pairs[body]+1] if m[body]=='{' else None
  methods.append({'path':path,'class':ownername,'method':name,'kind':kinds[0], 'annotations':[t for n,t in anns], 'parameterText':source[par+1:end], 'signature':source[namepos:body], 'bodySha256':S(bodytext) if bodytext else None,'body':bodytext})
 return methods

immut={}
for folder,count in [('final-candidates',61),('virtual-pre-final',64),('patches',41),('mutants',15)]:
 old={str(p.relative_to(O/folder)):(H(p),stat.S_IMODE(p.stat().st_mode)) for p in (O/folder).rglob('*') if p.is_file()}
 new={str(p.relative_to(N/folder)):(H(p),stat.S_IMODE(p.stat().st_mode)) for p in (N/folder).rglob('*') if p.is_file()}
 check(old==new and len(old)==count,('immutable tree',folder));immut[folder]=count
for name,h in J(N/'metadata-only-immutability.json')['allOriginalArtifactBindings'].items():check(H(O/name)==h,('original artifact',name))
for name,row in J(N/'artifact-hashes.json').items():
 expected=row if isinstance(row,str) else row['sha256'];check(H(N/name)==expected,('new artifact seal',name))
check(H(N/'atomic-manifest.json')=='d857284d9cf38d78572cd43f40914db1997edf6edcfad196305b068094508593','manifest')
check(H(N/'patches/atomic-final-from-prepared-inputs.patch')=='d3e340f96ea4ef832ae4435c29322676a9335f3e9715c64dee195d4a33dd935e','atomic patch')
ops=J(N/'atomic-manifest.json')['operations'];check(len(ops)==37,'37 ops');check(collections.Counter(x['operation'] for x in ops)=={'edit':32,'delete':4,'add':1},'operation types')
results['byteAndModePreservation']=immut

# Every source-projected metadata declaration must resolve to independently parsed source.
caseproof=J(N/'test-case-assertion-preservation.json');inventories={};declared=0
for case in caseproof['cases']:
 for side,folder,key in [('before','virtual-pre-final','source'),('after','final-candidates','target')]:
  path=case[key];p=N/folder/path;rows=scan(p.read_text(),path);inventories[(folder,path)]=rows
  check(len(rows)==case[side+'Count'],('count',side,path))
  lookup={(r['class'],r['method'],r['kind']):r for r in rows}
  for proof in case['methods']:
   recorded=proof[side];actual=lookup[(recorded['class'],recorded['method'],recorded['kind'])]
   for k in ['parameterText','signature','bodySha256']:check(actual[k]==recorded[k],('method proof',side,path,actual['method'],k))
   check(actual['annotations']==[a['text'] for a in recorded['annotations']],('annotations',path,actual['method']))
   refs=[]
   for a in recorded['annotations']:
    check(S(a['text'])==a['sha256'],('annotation hash',path))
    if a['name']=='MethodSource':refs=re.findall(r'"([^"\\]*)"',a['argumentsText']) or [actual['method']]
   check(refs==recorded['factoryReferences'],('factory refs',path,actual['method']));declared+=1
check(len(caseproof['cases'])==21,'all21')
recovered=caseproof['recovered13Methods'];check(len(recovered)==13,'13recoveries')
expected=J(N/'expected-discovery.json');details=expected['allMethods'];idkey=lambda r:(r['task'],r['class'],r['name'])
for d in details:
 path=d['path'];p=N/'final-candidates'/path
 if not p.exists():p=R/path
 if ('final-candidates',path) not in inventories:inventories[('final-candidates',path)]=scan(p.read_text(),path)
 rows=inventories[('final-candidates',path)];matches=[r for r in rows if (r['class'],r['method'],r['kind'])==(d['class'],d['method'],d['kind'])]
 check(len(matches)==1,('expected declaring identity',path,d['method']));actual=matches[0]
 check(actual['bodySha256']==d['bodySha256'] and actual['signature']==d['signature'],'expected actual source hashes')
 check(actual['annotations']==[a['text'] for a in d['annotations']],'expected annotations')
 check(len(d['identities'])==d['sourceProjectedInvocationCount'],'invocation count')
check(collections.Counter(idkey(x) for d in details for x in d['identities'])==collections.Counter(idkey(x) for x in expected['projectedIdentities']),'projected union')
check(len(expected['projectedIdentities'])==637,'637')

# Reuse the independently accepted identity expansion only under rehashed source/case bindings.
root=J(Q/'source-methods.json');rootmethods=[]
for f in root['files']:
 check(H(R/f['path'])==f['sha256'],('accepted source hash',f['path']));rootmethods+=scan((R/f['path']).read_text(),f['path'])
methodkey=lambda m:(m['path'],m['class'],m['method'],m['kind'])
check(collections.Counter(map(methodkey,rootmethods))==collections.Counter(map(methodkey,root['methods'])),'full independent root inventory')
coverage=J(Q/'derived-method-coverage.json');cov={(m['class'],m['method']):m for m in coverage['methods']}
cat=J(T/'fullcheck03-case-catalog-candidate/resume2/expected-catalog.json');check(H(T/'fullcheck03-case-catalog-candidate/resume2/expected-catalog.json')=='164e9d53985b7e1108d66952ae85d6293d83af907aa2d4c14ac94604e1d5b5b7','accepted catalog')
accepted=collections.Counter(map(idkey,cat['expectedCaseIdentities']));check(sum(accepted.values())==2774,'2774')
origins=collections.Counter()
for d in details:
 c=cov.get((d['class'],d['method']))
 if c is None and d['class'].endswith('.DispatchAuthorizationIT'):c=cov.get(('com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorizationIT',d['method']))
 names=[r['name'] for r in d['identities']]
 if c:
  check(d['task']==c['task'] and len(names)==c['invocations'],'accepted method invocation/task')
  check(S(json.dumps(names,ensure_ascii=False))==c['displayNamesSha256'],'accepted display IDs')
 else:
  check(d['kind']=='Test' and not d['parameters'] and names==[d['method']+'()'],'independent new plain case')
 for row in d['identities']:
  if accepted[idkey(row)]:origins['retained']+=1
  elif row['class'].endswith('.DispatchAuthorizationIT') and accepted[(row['task'],'com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorizationIT',row['name'])]:origins['relocated']+=1
  else:origins['new']+=1
check(origins=={'retained':623,'relocated':7,'new':7},'origin split')
check(not any(r['class'].endswith('.GuidedPublicationAuthorizationIT') for r in expected['projectedIdentities']),'old authority removed')
scoped=collections.Counter(map(idkey,expected['projectedIdentities']))
for key,n in scoped.items():
 if key[1].endswith('.DispatchAuthorizationIT'):check(n==1,'relocated authority identity occurs once')
 elif accepted[key]:check(n==accepted[key],'accepted display-name multiplicity preserved')
 else:check(n==1,'new case identity occurs once')
counts={}
for suffix,want in [('GuidedPublicationReplayIT.java',(74,108)),('GuidedPlanningIntegrationTest.java',(35,57)),('GuidedSecretByteBodyTest.java',(4,5))]:
 ds=[d for d in details if d['path'].endswith('/'+suffix)];counts[suffix]=[len(ds),sum(d['sourceProjectedInvocationCount'] for d in ds)];check(tuple(counts[suffix])==want,('required count',suffix))
check(sum(d['sourceProjectedInvocationCount'] for d in details if d['method']=='incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser')==35,'joined35')
check(any(r['name']=='actualCoreGuidedSameSecretIdStaysWithinPersistedScope()' for r in expected['projectedIdentities']),'live native failure retained')
for row in J(N/'ts-metadata-proposals.json'):
 a=(N/'virtual-pre-final'/row['path']).read_text();b=(N/'final-candidates'/row['path']).read_text();check(a.replace('GuidedRunnerClient','HttpRunnerDispatchClient')==b,'exact TS typename metadata replace')
 if row['path'].endswith('/runtime.test.ts'):
  tests=lambda s:re.findall(r"\bit\('([^']+)'",s)
  aa,bb=tests(a),tests(b);check(len(aa)==len(bb) and sum(x!=y for x,y in zip(aa,bb))==1,'single title rename')

# Bound pure scanner definitions only; no file access, module/QA/author entrypoint executed.
ns={};tree=ast.parse((N/'source_inventory.py').read_text())
for node in tree.body:
 if isinstance(node,(ast.Import,ast.ImportFrom,ast.Assign,ast.FunctionDef)):
  exec(compile(ast.Module(body=[node],type_ignores=[]),'<pure scanner definition>','exec'),ns)
fake='''package p; class Outer { @org.junit.jupiter.params.ParameterizedTest(name="{{{0}}}") @a.X(values={@b.Y(v="})")}) @c.Z @d.Q @org.junit.jupiter.params.provider.MethodSource("factory") void method(String v) { String s="""\n @Test void falseTest() { }\n """; } class Inner { @org.junit.jupiter.api.Test @x.Y @x.Z void nested() {} } } class Secondary { @org.junit.jupiter.api.Test void other() {} }'''
mine=scan(fake,'<scanner-edge>');theirs=ns['scan_source'](fake,'<scanner-edge>')['methods']
check(collections.Counter(map(methodkey,mine))==collections.Counter(map(methodkey,theirs)),'qualified stacked balanced/text-block/nested/secondary scanner')
check([(r['class'],r['method']) for r in mine]==[('p.Outer','method'),('p.Outer$Inner','nested'),('p.Secondary','other')],'edge expected identities')

def factory_body(text,name):
 masked=mask(text);out=[]
 for match in re.finditer(r'\b'+re.escape(name)+r'\s*\(',masked):
  par=masked.index('(',match.start());n=1;i=par+1
  while n:
   n+=(masked[i]=='(')-(masked[i]==')');i+=1
  tail=re.match(r'\s*(?:throws\s+[\w.,\s]+)?\{',masked[i:])
  if not tail:continue
  start=i+tail.end()-1;n=1;i=start+1
  while n:
   n+=(masked[i]=='{')-(masked[i]=='}');i+=1
  out.append(text[start:i])
 check(len(out)==1,('factory body resolution',name));return out[0]
factorybindings=[]
for row in J(N/'scanner-and-factory-provenance.json')['rootAndProspectiveMethodSources']:
 path=row['path'];texts=[]
 for folder in ['virtual-pre-final','final-candidates']:
  p=N/folder/path
  if not p.exists():p=R/path
  texts.append(factory_body(p.read_text(),row['provider']))
 check(S(texts[0])==row['beforeBodySha256'] and S(texts[1])==row['afterBodySha256'],'actual factory proof hashes')
 check(texts[0]==texts[1]==factory_body((R/path).read_text(),row['provider']),'accepted factory source unchanged')
 factorybindings.append({'path':path,'provider':row['provider'],'sha256':S(texts[0])})
results['independentFactoryBodyBindings']=factorybindings

# Separate IR convention disposition evidence, not application or runtime conformance.
I=T/'early/it-r-draft/resume4';I2=I.parent/'resume2';REL='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
irsource={};patchcount=0
for row in J(I/'stages.json'):
 p=Path('stages')/row['stage']/'repo'/REL
 check(H(I/p)==H(I2/p)==row['candidateSha256'],('IR exact reviewed source',row['stage']));irsource[row['stage']]=H(I/p)
for path in I2.rglob('*.patch'):
 rel=path.relative_to(I2);check(H(path)==H(I/rel),('IR patch unchanged',str(rel)));patchcount+=1
check(patchcount==34,'34 IR forms')
edits=J(I/'poll-edits.json');sites=J(I/'loop-sites.json');original=(I/'ReplayIT.original.java').read_text();b4=(I/'stages/04-b4/repo'/REL).read_text();test001=(I/'stages/00-test001/repo'/REL).read_text()
check(len(edits)==len(sites)==73,'73 direct sites')
rowmap=J(I/'row-classification-proof-map.json');mapped={int(x['id']):x for x in rowmap if x.get('replacementSha256')}
for e,site in zip(edits,sites):
 check(e['ids']==site['ids'] and original[site['start']:site['end']]==e['source'],'original native block identity')
 check(b4.count(e['replacement'])==1,'replacement once')
 for num in e['ids']:check(S(e['replacement'])==mapped[num]['replacementSha256'],'mapped replacement hash')
 n=f"{e['ids'][0]:03}";b=e['replacement']
 for required in [f'long itrBound{n} = Math.max(itrRemaining{n}, itrOwed{n});',f'while (!itr{n}.terminal)',f'if (itr{n}.intervalOwed)',f'if (System.nanoTime() < itr{n}.owedUntil) return false;',f'if (itr{n}.terminal) return true;',f'if (itr{n}.firstException != null) throw itr{n}.firstException;',f'if (itr{n}.firstError != null) throw itr{n}.firstError;',f'if (itrFirstTick{n}[0])', '.pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()']:
  check(required in b,('bounded direct wait structure',n,required))
 check(b.count('org.awaitility.Awaitility.await(')==1,'one direct Await')
 check(b.index('if (Thread.interrupted()) throw new InterruptedException();')<b.index(f'if (System.nanoTime() < itr{n}.owedUntil) return false;'),'interrupt before owed consume')
 check(b.count(f'itrRead{n}_{mapped[e["ids"][0]]["original_deadline"]} =')<=1,'no deadline reset alias')
for row in J(I/'stages.json'):
 restored=(I/'stages'/row['stage']/'repo'/REL).read_text()
 for e in edits:
  if e['replacement'] in restored:restored=restored.replace(e['replacement'],e['source'],1)
 check(restored==test001,('only local wait edits',row['stage']))
for num,read in [(83,'itr083.report = P3_FINAL_REPORTS.get(execution);'),(86,'itr086.report = p3RunnerReport(execution);')]:
 e=next(e for e in edits if num in e['ids']);b=e['replacement'];guard=b.index('if (!(')
 if num==86:read='itr086.report = p3Call('
 check(b.index(read)<guard,('already owed native read precedes original guard',num))
h8=next(e['replacement'] for e in edits if 84 in e['ids'])
check(h8.count('privateImmutableJson(')==1 and 'if (itr084.methodReturned) return;' in h8,'H8 one write and explicit method return')
check(h8.index('jdbc.queryForMap(')<h8.index('if (confirmed || now >= itrRead084_deadline)'),'H8 native observation before original outcome guard')
check(h8.index('privateImmutableJson(')<h8.index('if (!confirmed)')<h8.index('itr084.methodReturned = true; itr084.terminal = true; return true;'),'H8 write then original timeout/assertions then terminal')
wait={'candidateSourceHashes':irsource,'unchangedPatchForms':patchcount,'directBlocks':len(edits),'pollRows':sum(len(e['ids']) for e in edits),'allBlocksUndoToExactTest001':True,'semanticDeadlineReset':False,'nativeRuntimeVerified':False,'reviewedConvention':'only Math.max(original remaining, already-owed single original interval remaining), site-local original guard/body order and terminal/first-failure/debt/cached-tick guards','rootAdoptionRequired':True}
(HERE/'wait-bound-audit.json').write_text(json.dumps(wait,indent=2)+'\n')
results.update({'methodDeclarationBindings':declared,'independentRootMethodCount':len(rootmethods),'acceptedBaseline':{'plain':2055,'parameterizedMethods':101,'parameterizedInvocations':719,'identities':2774,'tasks':{'test':2710,'guidedIncrementalTest':62,'crossReplicaTest':2}},'scopedCounts':counts,'scopedIdentities':637,'origins':origins,'nativeFailIdentityRetained':True,'originalSourceAndRuntimeBatonsUnreleased':True,'checks':checks,'sourceWrites':0,'nativeCalls':0})
(HERE/'audit.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))

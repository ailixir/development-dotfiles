"""Static in-memory patch reconstruction; no compiler/test/build/source writes."""
from pathlib import Path
import re,json,hashlib,difflib
ROOT=Path.cwd();OUT=Path(__file__).parent;ORIG=OUT.parent;TREE=OUT/'tree';ALT=OUT/'proposed-final-wiring'
sha=lambda value:hashlib.sha256(value).hexdigest()
manifest=json.loads((OUT/'draft-manifest.json').read_text());paths=[r['path'] for r in manifest['files']]
originals=json.loads((OUT/'original-artifact-hashes.json').read_text())
checks={'originalArtifactsByteUnchanged':all((ORIG/p).exists() and sha((ORIG/p).read_bytes())==h for p,h in originals.items())}
# Strict unified-diff replay: every context/deletion must match the current virtual preimage.
def apply_patch(text,tree):
 lines=text.splitlines(keepends=True);i=0
 while i<len(lines):
  assert lines[i].startswith('--- '),lines[i]
  before=lines[i][4:].strip();after=lines[i+1][4:].strip();i+=2
  rel=after[2:];source=tree.get(rel,'').splitlines(keepends=True)
  if before=='/dev/null':assert rel not in tree or not tree[rel]
  result=[];cursor=0
  while i<len(lines) and lines[i].startswith('@@'):
   match=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]);assert match
   start=int(match[1]);oldcount=int(match[2] or 1);newcount=int(match[4] or 1);target=start-1 if oldcount else start
   assert target>=cursor,(rel,target,cursor)
   result+=source[cursor:target];cursor=target;i+=1;oldseen=newseen=0
   while i<len(lines) and not lines[i].startswith(('@@','--- ')):
    row=lines[i];prefix=row[0];body=row[1:];assert prefix in ' +-'
    if prefix in ' -':assert cursor<len(source) and source[cursor]==body,(rel,cursor,body);cursor+=1;oldseen+=1
    if prefix in ' +':result.append(body);newseen+=1
    i+=1
   assert (oldseen,newseen)==(oldcount,newcount),(rel,oldseen,newseen,oldcount,newcount)
  result+=source[cursor:];tree[rel]=''.join(result)
 return tree
initial={p:(ROOT/p).read_text() for p in paths if (ROOT/p).exists()}
assembled=dict(initial)
for name in ['01-red-first-clock.patch','02-prep-main-preserving-old-wiring.patch','03-prep-tests.patch']:
 assembled=apply_patch((OUT/'patches'/name).read_text(),assembled)
checks['threeStagePatchReplayEqualsAll20PrepFiles']=all(assembled.get(p)==(TREE/p).read_text() for p in paths)
alternate=apply_patch((OUT/'patches/04-PROPOSED-final-wiring-baton.patch').read_text(),dict(assembled))
checks['wiringPatchReplayEqualsAll20AlternateFiles']=all(alternate.get(p)==(ALT/p).read_text() for p in paths)
mut=[]
for record in manifest['mutants']:
 virtual=apply_patch((OUT/'patches'/record['patch']).read_text(),dict(assembled))
 actual=sha(virtual[record['path']].encode());mut.append({'id':record['id'],'declaredEqualsReconstruction':actual==record['mutantSha256'],'sha256':actual})
checks['mutantReconstructions']=mut
service='backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchService.java'
text=(TREE/service).read_text();baseline=(ROOT/service).read_text()
checks['distinctOverloadSlots']={f'sender{n}':text.count(f'this.sender{n} = runner::send;')==2 for n in [2,3,4]}
checks['exactHelperForwarding']=all(s in text for s in ['return sender2.send(operation, body);','return sender3.send(operation, body, key);','return sender4.send(operation, body, key, deadline);'])
checks['secretOverloadForwarding']=text.count('this.secretSender = runner::sendSecret;')==2
checks['noNullOrGeneratedKeyCollapsedAdapter']='return sender.send(' not in text and 'return send(operation, body, java.util.UUID.randomUUID().toString())' not in text
start='  public void installReferences('
expected=baseline[baseline.index(start):].replace('runner.send(', 'send(').replace('runner.sendSecret(', 'secretSender.send(').replace('GuidedRunnerClient.definiteContextRefusal','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal')
checks['dispatchDownstreamAlgorithmByteIdenticalAfterTypeOnlyNormalization']=expected==text[text.index(start):]
clock='backend/src/test/java/com/citi/put/checks/studio/guided/publication/PublicationGrantClockIT.java'
ct=(TREE/clock).read_text()
checks['actualFixtureTranslationScopeInBothSets']=all(k in ct and k in (ALT/clock).read_text() for k in ['registry.add("studio.guided-authoring.translation.applications", () -> ObservedPublicationFixture.APPLICATION);','registry.add("studio.guided-authoring.translation.environments", () -> ObservedPublicationFixture.ENVIRONMENTS.getFirst());'])
oldct=(ORIG/'tree'/clock).read_text()
oldmethods=re.findall(r'@Test\s+void\s+(\w+)\(',oldct);newmethods=re.findall(r'@Test\s+void\s+(\w+)\(',ct)
checks['threeClockTestNamesPreserved']=oldmethods==newmethods and len(newmethods)==3
checks['clockOnlyScopeSetupChanged']=oldct.replace('  static void properties(DynamicPropertyRegistry registry) { ObservedPublicationFixture.register(registry); }', '''  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    registry.add("studio.guided-authoring.translation.applications", () -> ObservedPublicationFixture.APPLICATION);
    registry.add("studio.guided-authoring.translation.environments", () -> ObservedPublicationFixture.ENVIRONMENTS.getFirst());
  }''')==ct
# Exact final test-only ownership baton; never part of prep application.
finaltest=ct.replace('  @Autowired private GuidedPublicationAuthorization legacyAuthority;\n','')
old='''    // Compiles before the new class exists, allowing a genuine red-first run on JVM-clock main.
    return context.containsBean("publicationGrantAuthority")
        ? context.getBean("publicationGrantAuthority") : legacyAuthority;'''
assert old in finaltest
finaltest=finaltest.replace(old,'    return context.getBean("publicationGrantAuthority");')
finalpath=OUT/'final-clock-test-baton'/clock;finalpath.parent.mkdir(parents=True,exist_ok=True);finalpath.write_text(finaltest)
patch=''.join(difflib.unified_diff(ct.splitlines(keepends=True),finaltest.splitlines(keepends=True),fromfile='a/'+clock,tofile='b/'+clock))
(OUT/'patches/05-FINAL-ONLY-clock-fallback-removal.patch').write_text(patch)
finaloverlay=apply_patch(patch,dict(alternate));checks['finalClockCleanupExact']=finaloverlay[clock]==finaltest and 'GuidedPublicationAuthorization' not in finaltest and 'legacyAuthority' not in finaltest
# Java delimiters outside strings/comments; lexical only, not Java compilation/type checking.
def balanced_java(text):
 stack=[];i=0;state='normal';pairs={')':'(',']':'[','}':'{'}
 while i<len(text):
  c=text[i];n=text[i:i+2];triple=text[i:i+3]
  if state=='line':
   if c=='\n':state='normal'
  elif state=='block':
   if n=='*/':state='normal';i+=1
  elif state=='textblock':
   if triple=='"""':state='normal';i+=2
  elif state in ('string','char'):
   if c=='\\':i+=1
   elif c==('"' if state=='string' else "'"):state='normal'
  elif n=='//':state='line';i+=1
  elif n=='/*':state='block';i+=1
  elif triple=='"""':state='textblock';i+=2
  elif c=='"':state='string'
  elif c=="'":state='char'
  elif c in '([{':stack.append(c)
  elif c in ')]}':
   if not stack or stack.pop()!=pairs[c]:return False
  i+=1
 return not stack and state in ['normal','line']
checks['lexicalJavaDelimitersBalancedAllSets']=all(balanced_java(p.read_text()) for folder in [TREE,ALT,OUT/'final-clock-test-baton'] for p in folder.rglob('*.java'))
result={'kind':'STATIC_RECONSTRUCTION_NOT_RUNTIME','isQaVerdict':False,'runtimeVerified':False,'checks':checks}
(OUT/'reconstruction-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))

"""Preparation checks only: read SOURCE/cache metadata, reconstruct patch IN MEMORY; no tools run."""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,re
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,h in json.loads((O/'bindings.json').read_text()).items():assert sha(Path(name) if name.startswith('/') else R/name)==h,name
for name in ['inspect_cache.py','phase.py','verify.py']:ast.parse((O/name).read_text())
P=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal01/proposal.json';proposal=json.loads(P.read_text());D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft'
patch=(D/'gs-t-draft.patch').read_text().splitlines(True);rebuilt={};i=0
while i<len(patch):
 assert patch[i].startswith('--- a/');path=patch[i][6:].strip();i+=1;assert patch[i].strip()=='+++ b/'+path;i+=1
 original=(R/path).read_text().splitlines(True);out=[];cursor=0
 while i<len(patch) and not patch[i].startswith('--- a/'):
  h=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n?',patch[i]);assert h,patch[i];i+=1;start=int(h[1])-1;out.extend(original[cursor:start]);cursor=start
  oldcount=newcount=0
  while i<len(patch) and not patch[i].startswith(('@@ ','--- a/')):
   line=patch[i];i+=1
   if line.startswith((' ','-')):assert original[cursor]==line[1:];cursor+=1;oldcount+=1
   if line.startswith((' ','+')):out.append(line[1:]);newcount+=1
  assert oldcount==int(h[2] or 1) and newcount==int(h[4] or 1)
 out.extend(original[cursor:]);raw=''.join(out).encode();assert raw==(D/'repo'/path).read_bytes();rebuilt[path]=hashlib.sha256(raw).hexdigest()
assert rebuilt=={x['file']:x['afterSha256'] for x in proposal['writerBindings']} and len(rebuilt)==3
review=json.loads((D/'static-review.json').read_text());assert review['sourceMethodsBefore']==review['sourceMethodsAfter']==80
transport=(D/'repo/backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java').read_text();modes=re.findall(r'[A-Z][A-Z0-9_]+',re.search(r'enum Mode\s*\{([^;]+);',transport)[1]);assert len(modes)==9
catalog=json.loads((O/'case-catalog.json').read_text());assert catalog==proposal['expectedCases'] and len(catalog)==99 and len({(x['task'],x['class'],x['name']) for x in catalog})==99
meta=json.loads((O/'cache-metadata.json').read_text());assert meta['jarSha256']=='f5eb908a4c5da46299e7543faada0402d2c4b77d58c7b432d4b6e59349b280a3'
def method(c,n):return next(x for x in meta['classes'][c]['selectedMethods'] if x['name']==n)['instructions']
assert any(x['op']=='putfield' and x.get('reference','').endswith('.targetLorg/gradle/api/file/FileCollection;') for x in method('FormatExtension','target'))
assert any(x['op']=='putfield' and x.get('reference','').endswith('.targetLorg/gradle/api/file/FileCollection;') for x in method('SpotlessTask','setTarget'))
assert any('SpotlessTaskImpl.target' in x.get('reference','') for x in method('SpotlessTaskImpl','performAction'))
assert any('outputDirectory' in x.get('reference','') for x in method('SpotlessTaskImpl','lambda$performAction$0'))
assert any('Files.copy' in x.get('reference','') for x in method('SpotlessApply$1','visitFile'))
init=(O/'gst-three-only.init.gradle').read_text();assert init.count("'src/test/java/")==3 and 'javaTask.setTarget(exactFiles)' in init and 'GST_HOLD_STAGED_OUTPUT' in init and 'GST_HOLD_GRAPH' in init and 'projectsEvaluated' in init
# Exercise only pure format-delta functions extracted from source. Never import or execute phase main.
tree=ast.parse((O/'phase.py').read_text());nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'hold','java_tokens','split_imports','format_only'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TOKEN' for t in n.targets)];env={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure-format-check-only>','exec'),env);fmt=env['format_only']
for row in proposal['writerBindings']:raw=(D/'repo'/row['file']).read_bytes();assert fmt(raw,raw)==[]
assert fmt(b'import a.Unused; class C { int n=3; }',b'class C {\nint n = 3;\n}')==['importa.Unused;']
assert fmt(b'import a.A; import b.B; class C { A a; B b; }',b'import b.B; import a.A; class C { A a; B b; }')==[]
for a,b in [(b'class C { String s="x"; }',b'class C { String s="y"; }'),(b'class C { int n=3; }',b'class C { int n=30; }'),(b'import a.A; class C { A a; }',b'class C { A a; }'),(b'class C {}',b'import a.A; class C {}'),(b'class C { String s="""\n x\n"""; }',b'class C { String s="""\n  x\n"""; }')]:
 try:fmt(a,b);raise AssertionError('non-formatting delta accepted')
 except RuntimeError:pass
assert 'subprocess.run' in (O/'phase.py').read_text() # Only future immutable SOURCE capture, not invoked here.
manifest=O/'manifest.json'
if manifest.is_file():
 for n,h in json.loads(manifest.read_text())['files'].items():assert sha(O/n)==h,n
 for line in (O/'SHA256SUMS').read_text().splitlines():h,n=line.split('  ',1);assert sha(O/n)==h,n
print(json.dumps({'status':'PREPARATION_STATIC_ONLY','patchReconstructionThreeFilesExact':True,'orderedSourceMethods':80,'ModeVariants':9,'fiveClassCases':99,'targetReplacementAndApplyStageMetadataVerified':True,'pureFormatDeltaControls':10,'phaseMainRun':False,'formatterGradleJavaJavapCompilerNativeRun':False,'sourceWrites':False,'manifestChecked':manifest.is_file()}))

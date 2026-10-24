"""Seal only this off-tree correction package after static checks. No Java/compiler/probe/source application."""
from pathlib import Path
import re,json,hashlib,ast
from inspect_loops import SRC,mask_java
OUT=Path(__file__).resolve().parent
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
stages=json.loads((OUT/'stages.json').read_text())
blocks=[]
for name in ['INCREMENTAL_VARIANTS','SINGLETON_METHODS','INCREMENTAL_METHODS']:
 a=SRC.rfind('  private static final',0,SRC.index(name+' ='));b=SRC.index(';',SRC.index(name+' ='))+1
 text=SRC[a:b];assert name in text
 blocks.append(dict(name=name,sha256=sha(text),text=text))
a=SRC.index('  private enum FixtureProfile {');b=SRC.index('\n  private static final',a)
blocks.append(dict(name='FixtureProfile_selected_unknown_refusal',sha256=sha(SRC[a:b]),text=SRC[a:b]))
for s in stages:
 candidate=(OUT/'stages'/s['stage']/'repo'/REL).read_text()
 for block in blocks:assert candidate.count(block['text'])==1,(s['stage'],block['name'])
headers=re.findall(r'(?ms)^  @(?:org\.junit\.jupiter\.(?:params\.)?)?(?:Test|ParameterizedTest)\b.*?^  void \w+\(',SRC)
assert len(headers)==74
for s in stages:
 candidate=(OUT/'stages'/s['stage']/'repo'/REL).read_text()
 for header in headers:assert candidate.count(header)==1
report=dict(originalSha256=sha(SRC),registryBlocks=[{k:v for k,v in b.items() if k!='text'} for b in blocks],
 originalOrderedAnnotatedHeaderHashes=[sha(h) for h in headers],all6CanonicalPreserveExactRegistryProviderAnnotationTokens=True,
 actualInvocationCorpora='default46 + incremental27singleton+35variants62 =108; expected-cases.json',
 staticOnly=True,javaSyntaxTypesRuntime='NOT_PROVED')
(OUT/'protected-registry-map.json').write_text(json.dumps(report,indent=2)+'\n')
# Lexical balance only for new variant/scratch full files; canonical files separately verified.
checked=[]
for top in ['mutations','negative-controls','variants','scratch']:
 for path in (OUT/top).rglob('*.java'):
  source=path.read_text();masked=mask_java(source);stack=[]
  for c in masked:
   if c in '({[':stack.append(c)
   elif c in ')}]':assert stack and '({['.index(stack.pop())==')}]'.index(c),str(path)
  assert not stack,str(path)
  checked.append(dict(path=str(path.relative_to(OUT)),sha256=sha(source),lexicalBalance=True))
for path in OUT.rglob('*.py'):ast.parse(path.read_text(),filename=str(path))
(OUT/'supplemental-static.json').write_text(json.dumps(dict(scope='LEXICAL_ONLY_NO_JAVA_SYNTAX_TYPE_OR_RUNTIME_PROOF',files=checked),indent=2)+'\n')
artifacts=[]
for path in sorted(OUT.rglob('*')):
 if path.is_file() and '__pycache__' not in path.parts and path.name not in ['manifest.json','SHA256SUMS']:
  artifacts.append(dict(path=str(path.relative_to(OUT)),sha256=sha(path.read_bytes()),bytes=path.stat().st_size))
manifest=dict(schemaVersion=1,status='UNEXECUTED_CORRECTION_PACKAGE_FOR_INDEPENDENT_REVIEW',artifacts=artifacts)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
sums=[(a['path'],a['sha256']) for a in artifacts]+[('manifest.json',sha((OUT/'manifest.json').read_bytes()))]
(OUT/'SHA256SUMS').write_text(''.join(digest+'  '+name+'\n' for name,digest in sorted(sums)))
print(json.dumps(dict(artifacts=len(artifacts),manifestSha256=sha((OUT/'manifest.json').read_bytes()),sha256sumsSha256=sha((OUT/'SHA256SUMS').read_bytes()),javaRuntime='NOT_RUN')))

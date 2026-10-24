"""Seal only current wire proof/package metadata; no source authoring or native tools."""
from pathlib import Path
import ast,json,hashlib
OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
for path in OUT.rglob('*.py'):ast.parse(path.read_text(),filename=str(path))
preservation=json.loads((OUT/'resume4-preservation.json').read_text())
for row in preservation['supportedArtifactsByteExact']:assert sha((OUT/row['path']).read_bytes())==row['sha256']
old=OUT.parent/'resume3';prior=json.loads((OUT/'inherited-resume3-manifest.json').read_text())
for row in prior['artifacts']:assert sha((old/row['path']).read_bytes())==row['sha256']
artifacts=[]
for path in sorted(OUT.rglob('*')):
 if path.is_file() and '__pycache__' not in path.parts and path.name not in ['manifest.json','SHA256SUMS']:
  raw=path.read_bytes();artifacts.append(dict(path=str(path.relative_to(OUT)),sha256=sha(raw),bytes=len(raw)))
(OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,status='WIRE_ONLY_CORRECTION_FOR_INDEPENDENT_REVIEW_NO_NATIVE_OR_APPLICATION_CREDIT',artifacts=artifacts),indent=2)+'\n')
sums=[(r['path'],r['sha256']) for r in artifacts]+[('manifest.json',sha((OUT/'manifest.json').read_bytes()))]
(OUT/'SHA256SUMS').write_text(''.join(digest+'  '+path+'\n' for path,digest in sorted(sums)))
print(json.dumps(dict(artifactCount=len(artifacts),manifestSha256=sha((OUT/'manifest.json').read_bytes()),sha256sumsSha256=sha((OUT/'SHA256SUMS').read_bytes()),receiptMdSha256=sha((OUT/'receipt.md').read_bytes()),sourceByteChanges=0,nativeCompilerProbe='NOT_RUN')))

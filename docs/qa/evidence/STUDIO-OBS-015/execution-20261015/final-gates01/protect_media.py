import hashlib,json,shutil,sys
from pathlib import Path
phase,label,root,fg=sys.argv[1],sys.argv[2],Path(sys.argv[3]),Path(sys.argv[4])
scopes=[root/'docs/qa/evidence/STUDIO-OBS-007',root/'docs/qa/evidence/STUDIO-OBS-013/r13']
targets=[p for s in scopes for p in s.rglob('*') if p.is_file() and not p.is_symlink() and p.suffix.lower() in {'.json','.png','.webm','.jpg','.jpeg'}]
targets+=list((root/'docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation').glob('kill-facts-*.json'))
before=fg/f'{label}-artifact-before'; after=fg/f'{label}-artifact-after'
if phase=='before':
  if before.exists(): sys.exit('backup dir exists; use a new label')
  for p in targets:
    b=before/p.relative_to(root); b.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,b)
  print(len(targets),'files backed up')
else:
  changed=[]
  for b in (x for x in before.rglob('*') if x.is_file()):
    rel=b.relative_to(before); p=root/rel
    if p.exists() and p.read_bytes()==b.read_bytes(): continue
    a=after/rel
    if p.exists(): a.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,a)
    changed.append({'originalPath':str(rel),'beforeSha256':hashlib.sha256(b.read_bytes()).hexdigest(),
      'newArtifactPath':str(a.relative_to(root)) if p.exists() else None,'deletedDuringRun':not p.exists(),'historicalOriginalRestored':True})
    shutil.copy2(b,p)
  (fg/f'{label}-artifact-index.json').write_text(json.dumps(changed,indent=2)+'\n'); print(len(changed),'changed; originals restored')

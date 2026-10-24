# Evidence-only inventory of the existing reviewed COPY profile; no product mutation.
from pathlib import Path
import hashlib,json,os
O=Path(__file__).resolve().parent;R=Path.cwd();S=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def digest(rows):return hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()
def inventory(base):
 c=json.loads((O/'fresh-copy-catalog.json').read_text());rows=[]
 for name in c['copyPaths']:
  start=base/name;assert start.exists(),name
  if start.is_dir():
   for directory,subdirs,files in os.walk(start,followlinks=True):
    current=Path(directory)
    if name=='studio-runner' and current==start:subdirs[:]=sorted(set(subdirs)-set(c['topLevelRunnerOmissions']));files=sorted(set(files)-set(c['topLevelRunnerOmissions']))
    else:subdirs.sort()
    for filename in sorted(files):
     p=current/filename;rows.append({'path':p.relative_to(base).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size})
  else:rows.append({'path':name,'sha256':sha(start),'bytes':start.stat().st_size})
 return sorted(rows,key=lambda r:r['path'])
def dist(base):
 start=base/'studio-runner/dist';rows=[{'path':p.relative_to(start).as_posix(),'sha256':sha(p)} for p in sorted(start.rglob('*')) if p.is_file()]
 assert rows;return {'digest':digest(rows),'files':rows}
def snapshot(base):
 rows=inventory(base);inputs=[r for r in rows if not r['path'].startswith('studio-runner/dist/')]
 return {'copyProfileFiles':rows,'copyProfileDigest':digest(rows),'inputFiles':inputs,'inputDigest':digest(inputs),'dist':dist(base)}

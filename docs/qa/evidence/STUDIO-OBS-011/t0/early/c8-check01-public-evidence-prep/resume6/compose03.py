"""Inactive source-only composer. Reads only this prepared packet and named static plan."""
from pathlib import Path
import ast,difflib,hashlib,json,re
P=Path(__file__).absolute().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
# Replace exactly the rejected fragment in the complete old postimage; preserve every
# other selected-only call site and the literal original poll/oracle/private hooks.
old=(P.parent/'resume2'/'observer-fragment.java.txt').read_text()
post=(P.parent/'resume2'/'Replay.postimage.java').read_text()
fragment=(P/'observer-fragment.java.txt').read_text()
assert post.count(old)==1
post=post.replace(old,fragment)
pre=(P/'Replay.preimage.java').read_text()
(P/'Replay.postimage.java').write_text(post)
path='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
for name,a,b in [('observer.patch',pre,post),('observer.reverse.patch',post,pre)]:
 (P/name).write_text(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+path,tofile='b/'+path,n=3)))
s=json.loads((P/'source-binding.json').read_text()); s.update(postimageSha256=sha(post.encode()),postimageBytes=len(post.encode()))
planpath=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json')
planraw=planpath.read_bytes();assert sha(planraw)=='9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
rows=json.loads(planraw)['source']['files'];assert len(rows)==1808
rows=[dict(x,sha256=s['postimageSha256']) if x['path']==path else x for x in rows]
candidate=sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode());s['candidateVirtualWholeSourceDigest']=candidate
(P/'source-binding.json').write_text(json.dumps(s,indent=2)+'\n')
u=(P/'unit_policy.py').read_text();u=re.sub(r"CANDIDATE = '[0-9a-f]{64}'",f"CANDIDATE = '{candidate}'",u)
(P/'unit_policy.py').write_text(u)
x=json.loads((P/'virtual-source-delta.json').read_text())
x.update(candidateVirtualWholeSourceDigest=candidate,postimageSha256=s['postimageSha256'],sourceRowsChanged=1,schemaVersion=2,sourceCapturePerformed=False)
(P/'virtual-source-delta.json').write_text(json.dumps(x,indent=2)+'\n')
print(json.dumps({'postimageSha256':s['postimageSha256'],'candidateVirtualWholeSourceDigest':candidate,'actualSourceWritten':False}))

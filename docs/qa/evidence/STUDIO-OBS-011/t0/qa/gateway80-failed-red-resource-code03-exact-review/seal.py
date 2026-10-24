"""Seal review-owned artifacts only; exact inactive subject binding, no runtime action."""
import hashlib,json,stat
from pathlib import Path
O=Path(__file__).parent
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3/manifest.json')
subject=hashlib.sha256(S.read_bytes()).hexdigest()
if subject!='2e4f6203a252cae88239d37513e7f956f9dc1dd1d8345d1c79086023a1a8a198':raise RuntimeError('SUBJECT_CHANGED')
if (O/'manifest.json').exists():raise RuntimeError('SEAL_EXISTS')
def row(p):
    d=p.read_bytes();return dict(path=p.name,sha256=hashlib.sha256(d).hexdigest(),bytes=len(d),mode=stat.S_IMODE(p.stat().st_mode))
members=sorted((p for p in O.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS')),key=lambda p:p.name)
for p in members:
    if p.suffix=='.json':json.loads(p.read_bytes())
(O/'SHA256SUMS').write_text(''.join(row(p)['sha256']+'  '+p.name+'\n' for p in members))
rows=[row(p) for p in members]+[row(O/'SHA256SUMS')]
f=json.loads((O/'findings.json').read_bytes())
manifest=dict(kind='EXACT_INACTIVE_SOURCE03_QUINN_REVIEW',reviewer='Quinn',subjectManifestSha256=subject,verdict=f['verdict'],mandatoryFindingCount=3,mandatoryFindings=[r['id'] for r in f['mandatoryFindings']],members=rows,memberCount=len(rows),manifestSelfExcluded=True,currentRequiredControls=269,retainedControls=197,newFocusedControls=72,sourceChecks=997,sourcePins=263,quinnTargetedDistinctChecks=12,ariaTargetedChecksAttributed=18,ariaManifestSha256=f['ariaManifestSha256'],actualRuntimeActions=0,operationalAuthority=False,executionReady=False,credit=False,reviewHistoryScopeDeviation='One skill-driven local Node greeting invocation; separate completion/status UNQUALIFIED; no target/current fact inferred.')
raw=(json.dumps(manifest,indent=2)+'\n').encode();(O/'manifest.json').write_bytes(raw)
for r in rows:
    if row(O/r['path'])!=r:raise RuntimeError('REVIEW_MEMBER_CHANGED')
print(json.dumps(dict(manifestSha256=hashlib.sha256(raw).hexdigest(),reviewSha256=hashlib.sha256((O/'review.md').read_bytes()).hexdigest(),findingsSha256=hashlib.sha256((O/'findings.json').read_bytes()).hexdigest(),members=len(rows),mandatoryFindings=3)))

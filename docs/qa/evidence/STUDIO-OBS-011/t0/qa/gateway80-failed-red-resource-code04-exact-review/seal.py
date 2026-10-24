"""Seal only this exact review; no target operation or source mutation."""
import hashlib,json,stat
from pathlib import Path
O=Path(__file__).parent
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4/manifest.json')
expected='cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e'
if hashlib.sha256(S.read_bytes()).hexdigest()!=expected:raise RuntimeError('SUBJECT_CHANGED')
if (O/'manifest.json').exists():raise RuntimeError('SEAL_EXISTS')
binding=json.loads((O/'aria-seal-binding.json').read_bytes())
def row(p):
    b=p.read_bytes();return dict(path=p.name,sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),mode=stat.S_IMODE(p.stat().st_mode))
members=sorted((p for p in O.iterdir() if p.is_file() and p.name not in ('manifest.json','SHA256SUMS')),key=lambda p:p.name)
for p in members:
    if p.suffix=='.json':json.loads(p.read_bytes())
(O/'SHA256SUMS').write_text(''.join(row(p)['sha256']+'  '+p.name+'\n' for p in members))
rows=[row(p) for p in members]+[row(O/'SHA256SUMS')]
manifest=dict(kind='EXACT_SOURCE04_QUINN_SOURCE_REVIEW',reviewer='Quinn',subjectManifestSha256=expected,verdict='CONDITIONAL_EXACT_SOURCE_SUPPORT',mandatoryFindingCount=0,mandatoryFindings=[],members=rows,memberCount=len(rows),manifestSelfExcluded=True,currentExecutedControls=313,boundPriorReusedControls=19,totalSupportedSemanticControls=332,retainedSemanticIds=269,newThreeFindingControls=63,sourceChecks=1217,sourcePins=318,quinnIndependentChecks=10,ariaIndependentChecksAttributed=29,ariaManifestSha256=binding['ariaManifestSha256'],actualRuntimeActions=0,operationalAuthority=False,executionReady=False,credit=False)
raw=(json.dumps(manifest,indent=2)+'\n').encode();(O/'manifest.json').write_bytes(raw)
for r in rows:
    if row(O/r['path'])!=r:raise RuntimeError('REVIEW_MEMBER_CHANGED')
print(json.dumps(dict(manifestSha256=hashlib.sha256(raw).hexdigest(),reviewSha256=hashlib.sha256((O/'review.md').read_bytes()).hexdigest(),findingsSha256=hashlib.sha256((O/'findings.json').read_bytes()).hexdigest(),members=len(rows),mandatoryFindings=0)))

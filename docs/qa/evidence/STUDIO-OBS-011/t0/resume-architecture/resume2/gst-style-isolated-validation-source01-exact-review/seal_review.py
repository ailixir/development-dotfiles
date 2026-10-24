"""Seal only this exact review; no target/model invocation."""
from pathlib import Path
import hashlib,json,stat
HERE=Path(__file__).absolute().parent
S=HERE.parents[2]/'early/gst-style-isolated-validation-prep/resume1'
raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!='67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26':raise RuntimeError('SUBJECT_MANIFEST_CHANGED')
for row in json.loads(raw)['files']:
    path=S/row['path'];data=path.read_bytes()
    if hashlib.sha256(data).hexdigest()!=row['sha256'] or len(data)!=row['bytes'] or stat.S_IMODE(path.stat().st_mode)!=row['mode']:raise RuntimeError('SUBJECT_MEMBER_CHANGED')
replay=json.loads((HERE/'replay43.stdout').read_bytes());critical=json.loads((HERE/'critical01.stdout').read_bytes());checks=json.loads((HERE/'checks.json').read_bytes())
if replay['passed']!=43 or critical['passed']!=8 or len(critical['cases'])!=6 or checks['passed']!=4552:raise RuntimeError('EVIDENCE_COUNTS')
for name in ('replay43.stderr','critical01.stderr','static02.stderr'):
    if (HERE/name).read_bytes()!=b'':raise RuntimeError('FINAL_STDERR_NONEMPTY')
summary=dict(kind='ARIA_GST_INACTIVE_SOURCE01_COMPLETE_REVIEW_EVIDENCE',subjectPayloadsUnchanged=35,
    replay=dict(tool='c6c00e',actualStatus=0,checks=43,replayedOnce=True),
    independent=dict(tool='3c71ae',actualStatus=0,checks=8,cases=6),
    static=dict(tool='8310ca',actualStatus=0,checks=4552,pins=116),
    mandatoryFindings=2,subjectSafetyEdits=False,permanentAuditUnchanged=True,unexpectedRealBoundaryEffects=0,
    ordinaryPortImplemented=False,actualQualificationOrSourceWindowAuthority=False)
(HERE/'verification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
files=[]
for path in sorted(HERE.iterdir()):
    if path.name=='manifest.json':continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('REVIEW_NOT_REGULAR')
    data=path.read_bytes();files.append(dict(path=path.name,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),mode=stat.S_IMODE(info.st_mode)))
manifest=dict(kind='SEALED_ARIA_INACTIVE_GST_ISOLATED_SOURCE01_PROTOCOL_REVIEW',subjectManifestSha256='67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26',
    verdict='HOLD_EXACT_INACTIVE_PROTOCOL_CORRECTION_REQUIRED',mandatoryFindingCount=2,subjectPayloads=35,files=files,
    fullFakeFlowChecks=43,independentCriticalChecks=8,independentCriticalCases=6,staticChecks=4552,
    ordinaryRuntimePortImplemented=False,actualAuthority=False,credit=False,manifestSelfExcluded=True)
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(payloads=len(files),manifestSha256=hashlib.sha256((HERE/'manifest.json').read_bytes()).hexdigest(),mandatoryFindings=2,subjectPayloadsUnchanged=35)))

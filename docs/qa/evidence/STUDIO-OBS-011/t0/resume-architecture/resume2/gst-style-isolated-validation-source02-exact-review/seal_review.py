"""Seal this exact inactive protocol review; no target function executes."""
from pathlib import Path
import hashlib,json,stat
HERE=Path(__file__).absolute().parent
S=HERE.parents[2]/'early/gst-style-isolated-validation-prep/resume2'
raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!='0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2':raise RuntimeError('SUBJECT_MANIFEST')
for row in json.loads(raw)['files']:
    p=S/row['path'];data=p.read_bytes()
    if hashlib.sha256(data).hexdigest()!=row['sha256'] or len(data)!=row['bytes'] or stat.S_IMODE(p.stat().st_mode)!=row['mode']:raise RuntimeError('SUBJECT_CHANGED')
critical=json.loads((HERE/'critical.stdout').read_bytes());checks=json.loads((HERE/'checks.json').read_bytes())
if critical['passed']!=25 or len(critical['cases'])!=12 or checks['passed']!=530:raise RuntimeError('COUNTS')
for name in ('critical.stderr','static.stderr'):
    if (HERE/name).read_bytes()!=b'':raise RuntimeError('STDERR')
summary=dict(kind='ARIA_GST_SOURCE02_REVIEW_EVIDENCE',subjectPayloadsUnchanged=65,
    independentCriticalChecks=25,independentCriticalCases=12,finiteChecks=530,pinRecords=150,
    author74And20Reused=True,oldSuitesReplayed=False,subjectSafetyAstEdited=False,persistentAuditUnchanged=True,
    sourceCategoriesCorrected=2,remainingSamePermitCategory='Initial active-gate admission clock not retained before permit binding',
    actualOrdinaryPortImplemented=False,actualActions=0,mandatoryFindings=1)
(HERE/'verification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
files=[]
for path in sorted(HERE.iterdir()):
    if path.name=='manifest.json':continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('REVIEW_NOT_REGULAR')
    data=path.read_bytes();files.append(dict(path=path.name,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),mode=stat.S_IMODE(info.st_mode)))
manifest=dict(kind='SEALED_ARIA_GST_SOURCE02_EXACT_INACTIVE_PROTOCOL_REVIEW',
    subjectManifestSha256='0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2',files=files,
    verdict='HOLD_EXACT_INACTIVE_PROTOCOL_CORRECTION_REQUIRED',mandatoryFindingCount=1,
    independentCriticalChecks=25,independentCriticalCases=12,finiteChecks=530,pinRecords=150,
    ordinaryRuntimePortImplemented=False,actualAuthority=False,credit=False,manifestSelfExcluded=True)
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(payloads=len(files),manifestSha256=hashlib.sha256((HERE/'manifest.json').read_bytes()).hexdigest(),subjectPayloadsUnchanged=65,mandatoryFindings=1)))

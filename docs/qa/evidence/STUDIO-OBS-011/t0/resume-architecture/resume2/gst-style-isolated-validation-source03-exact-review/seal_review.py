"""Seal this exact source-only review, no target function invocation."""
from pathlib import Path
import hashlib,json,stat
HERE=Path(__file__).absolute().parent
S=HERE.parents[2]/'early/gst-style-isolated-validation-prep/resume3'
raw=(S/'manifest.json').read_bytes()
if hashlib.sha256(raw).hexdigest()!='35c8502962094fcf16150328e6f4f533f597bbe4674b17d9dd87acd6ce562ec9':raise RuntimeError('SUBJECT_MANIFEST')
for row in json.loads(raw)['files']:
    path=S/row['path'];data=path.read_bytes()
    if hashlib.sha256(data).hexdigest()!=row['sha256'] or len(data)!=row['bytes'] or stat.S_IMODE(path.stat().st_mode)!=row['mode']:raise RuntimeError('SUBJECT_CHANGED')
critical=json.loads((HERE/'critical.stdout').read_bytes());static=json.loads((HERE/'checks.json').read_bytes())
if critical['passed']!=59 or len(critical['cases'])!=12 or static['passed']!=689:raise RuntimeError('COUNTS')
for name in ('critical.stderr','static.stderr'):
    if (HERE/name).read_bytes()!=b'':raise RuntimeError('STDERR')
summary=dict(kind='ARIA_SOURCE03_COMPLETE_EXACT_PROTOCOL_REVIEW_EVIDENCE',subjectPayloadsUnchanged=88,
    independentChecks=59,independentCases=12,finiteChecks=689,pinRecords=186,mandatoryFindings=0,
    author84And27ExactlyBoundReuse=True,wholeOldSuitesReplayed=False,subjectSafetyAstEdited=False,
    permanentAuditUnchanged=True,actualOrdinaryPortImplemented=False,actualActions=0)
(HERE/'verification-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
files=[]
for path in sorted(HERE.iterdir()):
    if path.name=='manifest.json':continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('REVIEW_NOT_REGULAR')
    data=path.read_bytes();files.append(dict(path=path.name,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),mode=stat.S_IMODE(info.st_mode)))
manifest=dict(kind='SEALED_ARIA_GST_SOURCE03_EXACT_INACTIVE_PROTOCOL_REVIEW',files=files,
    subjectManifestSha256='35c8502962094fcf16150328e6f4f533f597bbe4674b17d9dd87acd6ce562ec9',
    verdict='CONDITIONAL_EXACT_INACTIVE_PROTOCOL_SUPPORT',mandatoryFindingCount=0,
    independentChecks=59,independentCases=12,finiteChecks=689,pinRecords=186,
    ordinaryRuntimePortImplemented=False,actualAuthority=False,policyAmendment=False,credit=False,manifestSelfExcluded=True)
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(payloads=len(files),manifestSha256=hashlib.sha256((HERE/'manifest.json').read_bytes()).hexdigest(),subjectPayloadsUnchanged=88,mandatoryFindings=0)))

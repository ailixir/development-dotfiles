"""Seal exact architecture-only output. No target code executes."""
from pathlib import Path
import hashlib,json,stat
HERE=Path(__file__).absolute().parent
verification=json.loads((HERE/'checks.json').read_bytes())
if verification['passed']!=1465 or verification['failed']!=0 or verification['subjectFunctionsExecuted']!=0:raise RuntimeError('FINITE_VERIFICATION')
if (HERE/'verification.stderr').read_bytes()!=b'':raise RuntimeError('STDERR')
files=[]
for path in sorted(HERE.iterdir()):
    if path.name=='manifest.json':continue
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode):raise RuntimeError('DESIGN_NOT_REGULAR')
    raw=path.read_bytes();files.append(dict(path=path.name,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
manifest=dict(kind='SEALED_INACTIVE_C8_CONSUMER_INTEGRATION_FEASIBILITY_DESIGN',files=files,
    java02ManifestSha256='5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f',
    business06ManifestSha256='b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1',
    gateway09ManifestSha256='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7',
    prospectiveProtocol='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1',prospectiveProfileAuthorized=False,
    strongOrdinaryCompleteness='NOT_ESTABLISHED',businessAcceptanceBridgeEstablished=False,
    independentQaAndRootDesignAdoption='OWED',exactSourceImplementationReviewsAndOwnConsumerOwnerRulings='OWED',
    finiteChecks=1465,inputPinRecords=470,mappedDefinitions=61,targetExecutions=0,actualActions=0,
    policyAmendment=False,actualAuthority=False,credit=False,manifestSelfExcluded=True)
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(payloads=len(files),manifestSha256=hashlib.sha256((HERE/'manifest.json').read_bytes()).hexdigest(),actualActions=0)))

"""Record real shared-lock invocation and preserve the complete private chart unit."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys

os.umask(0o077)
D = Path(__file__).resolve().parent
R = D.parents[6]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(D/'root-authorization.json') == '3fd3a6bd1c299f19bc3a5b15b977a89b93ba2a59619bd4de05a113800567bfd8'
A = json.loads((D/'root-authorization.json').read_text())
with (D/'launch-consumed.json').open('x') as f:
    json.dump({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'automaticRetry':False},f)
lock = R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
assert sha(lock) == '2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
argv = [sys.executable,str(lock),sys.executable,str(D/'run_private.py')]
with (D/'wrapper.stdout').open('xb') as out,(D/'wrapper.stderr').open('xb') as err:
    p = subprocess.Popen(argv,cwd=R,stdout=out,stderr=err)
    identity = subprocess.run(['ps','-p',str(p.pid),'-o','pid=,ppid=,lstart=,command='],capture_output=True,text=True,check=True)
    (D/'wrapper-identity.json').write_text(json.dumps({'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'pid':p.pid,'argv':argv,'kernelObservation':identity.stdout,
        'rootWrapperSha256':sha(Path(__file__)),'innerRunnerSha256':sha(D/'run_private.py')},indent=2)+'\n')
    code = p.wait()
end = subprocess.run(['ps','-p',str(p.pid),'-o','pid=,lstart='],capture_output=True,text=True)
S = Path(A['scratch'])
if S.exists():
    shutil.copytree(S,D/'complete-workspace-archive',symlinks=True)
archive = D/'complete-workspace-archive'
files = {str(f.relative_to(archive)):sha(f) for f in sorted(archive.rglob('*')) if f.is_file() and not f.is_symlink()}
C = json.loads((Path(A['package'])/'chart-bindings.json').read_text())
actual_chart_unchanged = all(sha(R/C['sourceChart']/x['path'])==x['sourceSha256'] for x in C['files'])
result = {'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'wrapperExit':code,
    'wrapperPid':p.pid,'endPsExit':end.returncode,'endPsOutput':end.stdout,
    'archiveFiles':files,'actual22ChartFilesUnchanged':actual_chart_unchanged,
    'workspaceRetainedForIndependentReview':True,'cleanup':'HELD until independent complete restoration and archive verification',
    'sourceApplied':False,'nativeOrLaneCredit':False,'automaticRetry':False}
(D/'root-terminal-archive.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='archiveFiles'},indent=2))
sys.exit(code)

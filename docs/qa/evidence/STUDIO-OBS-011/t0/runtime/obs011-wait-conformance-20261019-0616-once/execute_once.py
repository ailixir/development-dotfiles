"""Root-owned one-shot archival wrapper for the reviewed standalone234-comparison probe."""
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
auth_path = D / 'root-authorization.json'
assert sha(auth_path) == 'd29c6f29873c716ba9a6fed4aaec18cc5b1d0df54be1d7caee8e0ba278fabe87'
A = json.loads(auth_path.read_text())
assert A['authorized'] is True
with (D / 'launch-consumed.json').open('x') as f:
    json.dump({'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'oneShot': True, 'automaticRetry': False}, f)
lock = R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
launcher = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-s-draft/resume2/conformance/run_later.py'
assert sha(lock) == A['lockWrapperSha256']
assert sha(launcher) == A['launcherSha256']
scratch = Path(A['scratch'])
assert not scratch.exists()
command = [sys.executable, str(lock), sys.executable, str(launcher), '--execute',
           '--java-home', A['java21Home'], '--scratch-directory', str(scratch)]
with (D / 'wrapper.stdout').open('xb') as out, (D / 'wrapper.stderr').open('xb') as err:
    process = subprocess.Popen(command, cwd=R, stdout=out, stderr=err)
    identity = subprocess.run(['ps', '-p', str(process.pid), '-o', 'pid=,ppid=,lstart=,command='],
                              capture_output=True, text=True, check=True)
    (D / 'wrapper-identity.json').write_text(json.dumps({
        'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'pid': process.pid, 'command': command, 'kernelObservation': identity.stdout,
        'authorizationSha256': sha(auth_path), 'wrapperSourceSha256': sha(Path(__file__))}, indent=2)+'\n')
    code = process.wait()
end = subprocess.run(['ps', '-p', str(process.pid), '-o', 'pid=,ppid=,lstart=,command='],
                     capture_output=True, text=True)
if scratch.exists():
    shutil.copytree(scratch, D / 'complete-scratch-archive')
for p in D.rglob('*'):
    p.chmod(0o700 if p.is_dir() else 0o600)
archive = D / 'complete-scratch-archive'
files = {str(p.relative_to(archive)): sha(p) for p in sorted(archive.rglob('*')) if p.is_file()}
source = json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/plan.json').read_text())['source']
source_equal = all(sha(R/x['path']) == x['sha256'] for x in source['files'])
dist_equal = all(sha(R/'studio-runner/dist'/x['path']) == x['sha256'] for x in source['dist']['files'])
result = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'wrapperExit': code, 'wrapperPid': process.pid, 'endPsExit': end.returncode,
          'endPsOutput': end.stdout, 'completeScratchFiles': files,
          'archiveMatchesScratch': files == {str(p.relative_to(scratch)): sha(p) for p in sorted(scratch.rglob('*')) if p.is_file()},
          'original1808SourceBindingsUnchanged': source_equal,
          'original238DistBindingsUnchanged': dist_equal,
          'nativeGateCredit': False, 'IRApplyClockStarted': False,
          'sourceApplied': False, 'automaticRetry': False,
          'independentRuntimeReview': 'OWED'}
(D / 'root-terminal-archive.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k != 'completeScratchFiles'}, indent=2))
sys.exit(code)

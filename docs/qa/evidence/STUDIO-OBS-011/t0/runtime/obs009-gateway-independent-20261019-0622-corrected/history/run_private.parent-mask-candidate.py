"""One reviewed two-case Helm counterfactual unit, called inside the shared lock."""
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
A = json.loads((D/'root-authorization.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(D/'root-authorization.json') == '716079f965cea83eea5b54796aae5f834b909b273cc6bab9a4cdaa973a6cfabe'
assert A['authorized'] is True
O = Path(A['package']); S = Path(A['scratch'])
assert sha(O/'manifest.json') == A['manifestSha256']
assert sha(Path(A['node'])) == A['nodeSha256']
assert sha(Path(A['helm'])) == A['helmSha256']
assert not S.exists()
shutil.copytree(O/'private-repo', S)
S.chmod(0o700)
(S/'studio-runner/node_modules').symlink_to(A['dependencies'], target_is_directory=True)
env = dict(os.environ)
env['PATH'] = str(Path(A['node']).parent)+os.pathsep+env['PATH']
env['GATEWAY_QA_PACKAGE_DIR'] = str(O)
env['GATEWAY_QA_EVIDENCE_DIR'] = str(S/'render-evidence-exit2')
versions = {}
for alias, command in [('node',[A['node'],'--version']),('helm',[A['helm'],'version','--short'])]:
    p = subprocess.run(command, capture_output=True, text=True, timeout=10, check=True, env=env)
    versions[alias] = p.stdout.strip()
assert versions['node'] == 'v24.20.0'
(D/'versions.json').write_text(json.dumps(versions,indent=2)+'\n')
argv = [A['node'],*A['runCommand'][1:]]
# Root-owned directories remain0700; actual chart copies must retain their bound0644 modes.
os.umask(0o022)
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
try:
    p = subprocess.run(argv, cwd=S/'studio-runner', env=env, capture_output=True,
                       text=True, timeout=A['maximumSeconds'])
    code = p.returncode
    (D/'vitest.stdout').write_text(p.stdout)
    (D/'vitest.stderr').write_text(p.stderr)
except subprocess.TimeoutExpired as e:
    code = 124
    for alias,data in [('stdout',e.stdout),('stderr',e.stderr)]:
        if data is not None:
            (D/('vitest.'+alias)).write_bytes(data if isinstance(data,bytes) else data.encode())
(D/'actual-command.json').write_text(json.dumps({'startedAtUtc':started,
    'endedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'argv':argv,'cwd':str(S/'studio-runner'),'exit':code,
    'evidenceDirectory':env['GATEWAY_QA_EVIDENCE_DIR'],
    'automaticRetry':False,'nativeOrLaneCredit':False},indent=2)+'\n')
sys.exit(code)

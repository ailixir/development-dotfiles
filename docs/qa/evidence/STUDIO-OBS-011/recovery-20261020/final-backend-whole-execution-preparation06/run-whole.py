"""Prospective root-admitted one-shot original reserved whole check6 only. No retry."""
from pathlib import Path
import datetime, hashlib, json, os, re, runpy, stat, subprocess, sys

R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
B = R / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020'
P = B / 'final-backend-admission-preparation04'
E = R / 'docs/qa/evidence/STUDIO-OBS-011/execution'
LEDGER = B / 'resumed-implementation-record.json'
NODE = '/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin'
JDK = '/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home'
SOURCE = 'a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
DIST = 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
REPLAY = '5d800923b60c64ecf086a522223254877f23a78cd9abd3fd18fc0275f2c1d5a8'
CLIENT = '072ce61b3c0f94d94076ef18c7acd170a4331e53d0968a132c08c85f15628c9c'
IMAGE = 'sha256:bd83d49256b5be0d2c8dc60b26ec92bef0bcf063eaa0a49de3d0db1fd154e753'
REQUIRED = {'applicationBuild', 'runnerFiveGates', 'frontendCarry', 'sourceLive', 'p7SourceCarry', 'c10SourceCarry', 'imagePinsQa', 'deployment722Qa', 'g9Qa', 'd2Qa', 'finalTupleReview', 'diagnosticCompatibility', 'pairExecutionQa'}
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p): return json.loads(Path(p).read_text())
def now(): return datetime.datetime.now(datetime.timezone.utc)
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
def write(name, value):
    p = O / name
    assert not p.exists()
    p.write_text(json.dumps(value, indent=2) + '\n')
def artifact(ref):
    assert set(ref) >= {'path', 'sha256'} and type(ref['sha256']) is str and re.fullmatch('[0-9a-f]{64}', ref['sha256'])
    p = Path(ref['path']); p = p if p.is_absolute() else R / p
    assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(R)
    assert sha(p) == ref['sha256']
    return p
def host():
    b = subprocess.run(['/usr/bin/pmset', '-g', 'batt'], capture_output=True, text=True, check=True)
    l = subprocess.run(['/usr/sbin/ioreg', '-r', '-k', 'AppleClamshellState', '-d1'], capture_output=True, text=True, check=True)
    states = re.findall(r'"AppleClamshellState"\s*=\s*(Yes|No|true|false)', l.stdout)
    facts = {'atUtc': now().isoformat(), 'acPower': "'AC Power'" in b.stdout, 'lidOpen': bool(states) and set(states) <= {'No', 'false'}, 'rawHostBodiesExported': False}
    assert facts['acPower'] and facts['lidOpen']
    return facts
def image():
    fmt = '{"Id":{{json .Id}},"User":{{json .Config.User}},"Cmd":{{json .Config.Cmd}},"Entrypoint":{{json .Config.Entrypoint}},"Os":{{json .Os}},"Architecture":{{json .Architecture}}}'
    p = subprocess.run(['docker', 'image', 'inspect', IMAGE, '--format', fmt], capture_output=True, text=True, check=True)
    v = json.loads(p.stdout)
    assert v['Id'] == IMAGE and v['Os'] == 'linux' and v['Architecture'] == 'arm64' and v['User'] == 'pwuser'
    assert v['Entrypoint'] in [None, []] and v['Cmd'] == ['sh', '-c', 'ulimit -c 0 && exec node dist/main.js']
    return v
def clock(slot):
    assert slot == 6 and cutoff <= datetime.datetime.fromisoformat('2026-10-22T04:35:27.361777+00:00')
    reserve = a['reservedTailBefore6Seconds']
    assert type(reserve) in (int, float) and reserve >= 13303.245
    remaining = (cutoff - now()).total_seconds()
    assert remaining >= reserve
    return {'atUtc': now().isoformat(), 'cutoffUtc': cutoff.isoformat(), 'remainingSeconds': remaining, 'reservedTailSeconds': reserve, 'planningAllowanceNotRuntimeTimeout': True}
def guard(name):
    cap = O / (name + '-source.json')
    p = subprocess.run(['python3', str(captureScript), str(cap)], cwd=R, env=env, capture_output=True)
    assert p.returncode == 0
    c = load(cap)
    assert c['digest'] == SOURCE and len(c['files']) == 1814 and c['dist']['digest'] == DIST and len(c['dist']['files']) == 238
    assert c['files'] == sourceBase['files'] and c['dist'] == sourceBase['dist']
    assert sha(NODE + '/node') == a['nodeExecutableSha256'] and sha(JDK + '/bin/java') == a['javaExecutableSha256']
    full = snapshot(R)
    write(name + '-full-catalog.json', full)
    assert full == inputBase  # Fresh POST-D2 baseline; never the old image04/cache baseline.
    for row in meta['actualCanonical5Pins']:
        p = R / 'studio-runner/node_modules' / row['relativePath']
        assert sha(p) == row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode)) == row['mode']
    for row in meta['protected']:
        p = R / row['path']; assert sha(p) == row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode)) == row['mode']
    links = []
    for p in sorted((R / 'studio-runner/node_modules/.bin').iterdir()):
        s = p.lstat(); assert stat.S_ISLNK(s.st_mode)
        links.append({'path': str(p.relative_to(R)), 'target': os.readlink(p), 'mode': oct(stat.S_IMODE(s.st_mode)), 'device': s.st_dev, 'inode': s.st_ino})
    assert len(links) == 21 and links == binBase
    browser = load(artifact(a['browserBinding']))
    assert sha(browser['actualExecutablePath']) == browser['actualExecutableSha256'] == meta['browserSha256']
    assert {k: {'present': k in env, 'valueSha256': hashlib.sha256(env[k].encode()).hexdigest() if k in env else None} for k in meta['environment']} == meta['environment']
    charts = []
    for p in sorted((R / 'helm-chart/put-checks').rglob('*')):
        s = p.lstat(); assert not stat.S_ISLNK(s.st_mode)
        if p.is_file(): charts.append({'path': str(p.relative_to(R)), 'sha256': sha(p), 'mode': oct(stat.S_IMODE(s.st_mode))})
    assert len(charts) == 22 and charts == quotes['chart22']
    assert len(quotes['quoted6']) == 6
    for row in quotes['quoted6']:
        p = R / row['path']; assert p.is_file() and not p.is_symlink() and sha(p) == row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode)) == row['mode']
    rollout = next(x for x in quotes['quoted6'] if x['path'] == 'docs/runbooks/studio-inference-rollout.md')
    assert rollout['sha256'] == '10ab0f1361689a2737c8dff3c339a6e58a2f55b57c327daf2ac445e7f6c891f9'
    facts = {'sourceRowsAndDistExact': True, 'postD2FullInputsExact': True, 'protected21CanonicalBrowserEnvironmentExact': True, 'chart22Quotes6Exact': True, 'image': image(), 'host': host()}
    write(name + '-guard.json', facts)
def ledger(slot, fields, charge=False):
    raw = LEDGER.read_bytes(); doc = json.loads(raw); active = doc['fullClassLedger']
    assert active['maximum'] == 6 and active['timeboxNotReset'] is True
    assert digest(active['actual'][:3]) == a['priorThreeActualCanonicalSha256']
    assert digest(active['actual'][:5]) == a['priorFiveActualCanonicalSha256']
    want = list(range(1, slot)) if charge else list(range(1, slot + 1))
    assert [x['slot'] for x in active['actual']] == want
    if charge:
        assert slot == 6 and all(row['status'] == 'PAIR_SLOT_TERMINAL_PASS' and row['postguardsPassed'] is True for row in active['actual'][3:5])
        active['actual'].append({'slot': slot, **fields})
    else:
        assert active['actual'][-1]['slot'] == slot
        active['actual'][-1].update(fields)
    assert digest(active['actual'][:3]) == a['priorThreeActualCanonicalSha256']
    assert digest(active['actual'][:5]) == a['priorFiveActualCanonicalSha256']
    temp = LEDGER.with_name(LEDGER.name + '.pair-' + str(os.getpid()) + '.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, stat.S_IMODE(LEDGER.stat().st_mode))
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(doc, f, indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
        assert LEDGER.read_bytes() == raw  # Refuse a concurrent pointer change; no history overwrite.
        os.replace(temp, LEDGER)
    finally:
        if temp.exists(): temp.unlink()

assert len(sys.argv) == 3
admissionPath = Path(sys.argv[1]); assert re.fullmatch('[0-9a-f]{64}', sys.argv[2]) and sha(admissionPath) == sys.argv[2]
a = load(admissionPath)
assert a['rootReleasedWhole6'] is True and a['authorizedSlots'] == [6] and a['driverSha256'] == sha(__file__)
assert type(a['mutationProducingPrerequisitesRemaining']) is int and a['mutationProducingPrerequisitesRemaining'] == 0
assert set(a['prerequisites']) == REQUIRED
for item in a['prerequisites'].values():
    assert item['accepted'] is True
    artifact(item['acceptanceArtifact'])
assert a['finalSourceDigest'] == SOURCE and a['finalDistDigest'] == DIST and a['finalReplaySha256'] == REPLAY and a['finalClientSha256'] == CLIENT and a['finalImageId'] == IMAGE
assert sha(P / 'manifest.json') == '986d9ed6eeb628d57af08650639194083421d3e02c1b3f59516b802e5a8bf20c'
for row in load(P / 'manifest.json')['files']: assert sha(P / row['path']) == row['sha256']
commands = load(P / 'commands.json'); job = commands['jobs'][2]; assert job['slot'] == 6 and job['label'] == 'obs011-lean-ir-integrated01'
assert job['readerArgvAfterActualTerminal'] is None
assert commands['whole6Acceptance'] == a['whole6Acceptance']
artifact({'path': commands['whole6Acceptance']['expectedIdentitiesPath'], 'sha256': commands['whole6Acceptance']['expectedIdentitiesSha256']})
artifact({'path': commands['whole6Acceptance']['exactSkipPolicyPath'], 'sha256': commands['whole6Acceptance']['exactSkipPolicySha256']})
for pin in a['artifactPins']: artifact(pin)
for name, expected in {'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py': '2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df', '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py': 'fa90d844d6443285ada1ae1856fdef4bd23ddf607ab97ec21ccd52f2fc30cc3a', '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py': '799ead7c9c622b7a8b1500d1e89762a689b11e472a8d2bf16101cb9b54f29cd4'}.items(): assert sha(R / name) == expected
pair = load(artifact(a['pairTerminal']))
assert pair['pairAccepted'] is True and pair['completedSlots'] == [4, 5] and pair['sourceInputsIdentical'] is True and pair['whole6Launched'] is False
sourceBase = load(artifact(a['postD2SourceCapture'])); inputBase = load(artifact(a['postD2InputSnapshot']))
meta = load(artifact(a['runtimeMeta'])); binBase = load(artifact(a['bin21Baseline'])); quotes = load(artifact(a['postD2ChartQuotes']))
captureScript = artifact(a['captureScript']); snapshotScript = artifact(a['snapshotScript']); artifact(a['snapshotCopyProfile'])
assert captureScript == R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'
assert snapshotScript == B / 'bootstrap-process-tree-pure-proof-execution01/input-snapshot.py'
assert artifact(a['snapshotCopyProfile']) == snapshotScript.with_name('fresh-copy-catalog.json')
assert sha(captureScript) == 'cc943d9dfcf1ff07e463cfcc266e906704a5f04ae621b0355c6a5022f75f5e63'
assert sha(snapshotScript) == 'b6d962a6aaba1c0135e3cee63cb66341bfd42dba3238deef8a7187992ba01849'
assert sha(snapshotScript.with_name('fresh-copy-catalog.json')) == '2624360a76136f37b4e1bc267734eb1954aff16fbd54e56984356ed192eb33a2'
assert a['nodeVersion'] == 'v24.20.0' and a['javaHome'] == JDK
assert re.fullmatch('[0-9a-f]{64}', a['nodeExecutableSha256']) and re.fullmatch('[0-9a-f]{64}', a['javaExecutableSha256'])
assert not any(key in os.environ for key in ('NODE_OPTIONS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS'))
snapshot = runpy.run_path(str(snapshotScript))['snapshot']
env = dict(os.environ, PATH=NODE + ':' + os.environ['PATH'], JAVA_HOME=JDK)
cutoff = datetime.datetime.fromisoformat(a['cutoffUtc']); assert cutoff.tzinfo is not None
assert R == Path.cwd()
O = Path(a['executionDirectory']); assert O.parent == B and O.name == 'final-backend-whole-execution06' and not O.exists()
label = job['label']; assert not any(E.glob(label + '*'))
clock(6); host(); O.mkdir()
inhibitor = subprocess.Popen(['/usr/bin/caffeinate', '-i'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
proc = None; nativeCollectionComplete = False
try:
    assert inhibitor.poll() is None
    guard('before6')
    timing = clock(6)
    assert not any(E.glob(label + '*')) and inhibitor.poll() is None
    ledger(6, {'label': label, 'status': 'CHARGED_BEFORE_ORIGINAL_COLLECTOR_LAUNCH', 'chargedAtUtc': now().isoformat(), 'driverPid': os.getpid(), 'admissionSha256': sys.argv[2], 'sourceDigest': SOURCE, 'distDigest': DIST, 'clock': timing}, charge=True)
    with (O / (label + '-collector-outer.log')).open('wb') as log:
        proc = subprocess.Popen(job['collectorArgv'], cwd=R, env=env, stdout=log, stderr=subprocess.STDOUT)
        ledger(6, {'collectorPid': proc.pid, 'launchedAtUtc': now().isoformat()})
        write('6-launch.json', {'driverPid': os.getpid(), 'collectorPid': proc.pid, 'inhibitorPid': inhibitor.pid, 'argv': job['collectorArgv'], 'cwd': str(R)})
        print(json.dumps({'event': 'ORIGINAL_WHOLE_COLLECTOR_STARTED', 'slot': 6, 'driverPid': os.getpid(), 'collectorPid': proc.pid, 'inhibitorPid': inhibitor.pid}), flush=True)
        code = proc.wait()
    write('6-native-wait.json', {'slot': 6, 'rawOuterExit': code, 'collectorPid': proc.pid, 'originalPopenWaitReturned': True})
    ledger(6, {'status': 'NATIVE_TERMINAL_PENDING_RECEIPT', 'rawOuterExit': code, 'nativeWaitAtUtc': now().isoformat()})
    resultPath = E / (label + '-results.json'); result = load(resultPath)
    nativeOk = code == 0 and result['exit'] == 0 and result['gradleExit'] == 0 and result['counts'] == {'total': 2792, 'passed': 2783, 'failed': 0, 'errors': 0, 'skipped': 9}
    terminal = {'slot': 6, 'rawOuterExit': code, 'rawTaskedExit': result['exit'], 'rawGradleExit': result['gradleExit'], 'resultSha256': sha(resultPath), 'counts': result['counts'], 'nativeCollectionComplete': nativeOk, 'pairReaderRun': False, 'wholeAcceptancePendingSeparateAssessment': True}
    write('6-terminal.json', terminal)
    ledger(6, {'status': 'TERMINAL_PENDING_POSTGUARDS', **terminal, 'endedAtUtc': now().isoformat()})
    guard('after6')
    assert nativeOk
    ledger(6, {'status': 'WHOLE_SLOT_NATIVE_PASS_PENDING_ACCEPTANCE', 'postguardsPassed': True})
    nativeCollectionComplete = True
    write('whole-terminal.json', {'slot': 6, 'nativeCollectionComplete': True, 'separateCounterCoverageCohortDiagnosticAndIndependentQaRequired': True, 'pairReaderRun': False, 'sourceInputsIdentical': True, 'originalInhibitorHeldThroughNativeAndPostguards': inhibitor.poll() is None, 'gradleJvmPids': 'NOT_RETAINED_UNLESS_ORIGINAL_COLLECTOR_EXPOSES_THEM', 'numericPidAbsenceClaim': False, 'retryOrSeventhSlotPermitted': False})
finally:
    if proc is not None and proc.poll() is None: proc.wait()  # Retain original job; no quiet restart or unrelated kill.
    if inhibitor.poll() is None: inhibitor.terminate()
    inhibitor.wait()
    write('owned-inhibitor-reaped.json', {'pid': inhibitor.pid, 'waitExit': inhibitor.returncode, 'ownedOnly': True, 'nativeCollectionComplete': nativeCollectionComplete, 'failureClosureNotAutomaticallyEstablished': not nativeCollectionComplete})

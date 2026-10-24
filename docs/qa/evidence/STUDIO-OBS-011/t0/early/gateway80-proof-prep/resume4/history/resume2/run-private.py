"""PREPARED ONLY. Separate copy-aware phases under an actual root-held sequence.

No install, retries, signals, cleanup, implicit phase chaining or product writes.
Timeout leaves the unit HOLD and retains its workspace and live identities.
"""
from pathlib import Path
import ast
import datetime
import errno
import fcntl
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from contracts import assess, require, transition_allowed

D = Path(__file__).resolve().parent
SCOPE = json.loads((D / 'scope.json').read_text())
R = Path(SCOPE['repository'])
W = Path(SCOPE['workspace'])
E = Path(SCOPE['runtime'])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()


def write_new(path, data):
    payload = (json.dumps(data, indent=2) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def file_hash(path):
    require(not path.is_symlink() and path.is_file(), 'EXPECTED_REGULAR_FILE')
    before = path.stat()
    value = sha(path)
    after = path.stat()
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), 'READ_RACE')
    return value


def inventory(root):
    """Own tree only. Record symlink itself, never traverse its dependency target."""
    result = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in sorted(dirs + files):
            p = Path(directory) / name
            st = p.lstat()
            row = {'path': str(p.relative_to(root)), 'uid': st.st_uid,
                   'mode': stat.S_IMODE(st.st_mode), 'dev': st.st_dev, 'ino': st.st_ino}
            if stat.S_ISLNK(st.st_mode):
                row.update(kind='symlink', target=os.readlink(p))
            elif stat.S_ISREG(st.st_mode):
                row.update(kind='file', sha256=file_hash(p), bytes=st.st_size)
            elif stat.S_ISDIR(st.st_mode):
                row.update(kind='directory')
            else:
                raise ValueError('UNEXPECTED_WORKSPACE_ENTRY')
            result.append(row)
    return sorted(result, key=lambda x: x['path'])


def owned_root_identity():
    st = W.lstat()
    require(not W.is_symlink() and stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid()
            and stat.S_IMODE(st.st_mode) == 0o700, 'UNSAFE_WORKSPACE_ROOT')
    return {'path': str(W), 'uid': st.st_uid, 'dev': st.st_dev, 'ino': st.st_ino, 'mode': 0o700}


def core():
    p = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
    require(file_hash(p) == 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae',
            'OWNERSHIP_CORE_CHANGED')
    names = {'sha', 'utc', 'regular', 'capture', 'pid_text', 'table', 'identity',
             'project_role', 'boundary_inventory'}
    nodes = [n for n in ast.parse(p.read_text()).body if isinstance(n, (ast.Import, ast.ImportFrom))
             or isinstance(n, ast.FunctionDef) and n.name in names]
    ns = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned-readonly-ownership>', 'exec'), ns)
    ns['ROOT'] = R
    def bounded_capture(argv):
        p = subprocess.run(argv, capture_output=True, text=True, timeout=10, check=False)
        require(p.returncode in (0, 1), 'BOUNDED_OBSERVATION_FAILED')
        return p.stdout
    ns['bounded_capture'] = bounded_capture
    return ns


def held(A, C):
    require(file_hash(E / 'hold.json') == A['holdFileSha256'], 'HOLD_BINDING_CHANGED')
    H = read(E / 'hold.json')
    require(H['label'] == SCOPE['label'], 'WRONG_HOLD')
    for key in ('wrapper', 'shell'):
        f = H[key]
        require(C['pid_text'](f['pid'], 'lstart') == f['start'], 'HOLDER_IDENTITY_LOST')
        require(hashlib.sha256((C['pid_text'](f['pid'], 'command') or '').encode()).hexdigest()
                == f['argvHash'], 'HOLDER_ARGV_CHANGED')
    require(int(C['pid_text'](H['shell']['pid'], 'ppid')) == H['wrapper']['pid'], 'HOLDER_PARENT')
    require(os.getppid() == H['shell']['pid'], 'NOT_DIRECT_HELD_SHELL_CHILD')
    lock = Path(H['lock']['path'])
    require(lock == R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock', 'WRONG_LOCK_PATH')
    st = lock.stat()
    require((st.st_dev, st.st_ino) == (H['lock']['dev'], H['lock']['ino']), 'LOCK_REPLACED')
    # Prove wrapper still has exactly this inode open, then independently kernel-held.
    raw = C['capture'](['/usr/sbin/lsof', '-nP', '-a', '-p', str(H['wrapper']['pid']),
                        str(lock), '-F', 'pfin'])
    require('i' + str(st.st_ino) in raw.splitlines(), 'HOLDER_FD_MISSING')
    with lock.open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            require(exc.errno in (errno.EAGAIN, errno.EACCES), 'KERNEL_LOCK_UNKNOWN')
        else:
            fcntl.flock(handle, fcntl.LOCK_UN)
            raise ValueError('KERNEL_LOCK_NOT_HELD')
    return H


def chart_guard(root, fixed=False):
    I = read(D / 'input-manifest.json')
    expected = {r['destination'].removeprefix('repo/helm-chart/put-checks/'): r
                for r in I['finiteCopies'] if r['destination'].startswith('repo/helm-chart/put-checks/')}
    actual = inventory(root)
    require(not any(r['kind'] == 'symlink' for r in actual), 'CHART_SYMLINK_FORBIDDEN')
    files = {r['path']: r for r in actual if r['kind'] != 'directory'}
    require(set(files) == set(expected) and len(files) == 22, 'CHART_EXACT_22_PATH_SET')
    # Only directories that contain one of those22 files are legitimate.
    directories = {str(Path(n).parent) for n in expected if str(Path(n).parent) != '.'}
    require({r['path'] for r in actual if r['kind'] == 'directory'} == directories,
            'CHART_DIRECTORY_PATH_SET')
    for n, row in files.items():
        h = I['helperBanks']['fixed']['sha256'] if fixed and n == 'templates/_helpers.tpl' else expected[n]['sha256']
        require(row['kind'] == 'file' and row['sha256'] == h
                and row['mode'] == expected[n]['mode'], 'CHART_BYTES_OR_MODE')
    return True


def guards(A, C):
    G = read(D / 'source-guards.json')
    require(A['sourceDigest'] == G['sourceDigest'], 'SOURCE_RELEASE_DIGEST')
    output = C['capture'](['git', '-C', str(R), 'ls-files', '--cached', '--others',
                           '--exclude-standard', '-z', '--', *G['captureScope']])
    actual = {n for n in output.split('\0') if n and (R / n).is_file()
              and '.claude' not in Path(n).parts}
    require(actual == {r['path'] for r in G['files']} and len(actual) == 1808, 'SOURCE_PATH_SET')
    for row in G['files']:
        p = R / row['path']
        require(file_hash(p) == row['sha256'] and stat.S_IMODE(p.stat().st_mode) == row['mode'],
                'SOURCE_BYTES_OR_MODE_CHANGED')
    require(sum(n.startswith('backend/src/main/') for n in actual) == 506, 'MAIN_506')
    dist = R / 'studio-runner/dist'
    expected = {r['path']: r['sha256'] for r in G['dist']['files']}
    names = {str(p.relative_to(dist)) for p in dist.rglob('*') if p.is_file()}
    require(names == set(expected) == set(A['distModes']) and len(names) == 238, 'DIST_PATH_SET')
    for n in names:
        require(file_hash(dist / n) == expected[n]
                and stat.S_IMODE((dist / n).stat().st_mode) == A['distModes'][n], 'DIST_CHANGED')
    aux_names = {n for group in G['auxiliaryGroups'].values() for n in group}
    require(set(A['auxModes']) == aux_names, 'AUXILIARY_MODE_BINDINGS')
    for group in G['auxiliaryGroups'].values():
        for n, h in group.items():
            require(file_hash(R / n) == h
                    and stat.S_IMODE((R / n).stat().st_mode) == A['auxModes'][n], 'AUXILIARY_CHANGED')
    chart_guard(R / 'helm-chart/put-checks')
    require(file_hash(Path(SCOPE['node'])) == A['nodeSha256'], 'NODE_CHANGED')
    require(file_hash(Path(SCOPE['helm']).resolve()) == A['helmSha256'], 'HELM_CHANGED')
    dep = Path(SCOPE['dependencies']).resolve()
    require(str(dep) == A['dependenciesRealpath'], 'DEPENDENCY_TARGET_CHANGED')
    # Exact release-bound dependency inventory is read-only, before and after phases.
    require(inventory(dep) == A['dependencyInventory'], 'DEPENDENCY_TREE_CHANGED')
    return {'sourceDigest': G['sourceDigest'], 'source1808': True, 'main506': True,
            'dist238': True, 'modesExact': True, 'auxiliariesExact': True,
            'dependenciesExact': True, 'atUtc': utc()}


def worker_candidates(A, C, rows=None, native_ids=()):
    """Bounded resident-role observation, not global Node ownership or interval capture.

    A new verified Node Tinypool/Vitest role is UNKNOWN until current/recorded
    native lineage proves ownership. Disappearance cannot erase its sticky gap.
    Other ordinary Node processes are not waited on merely for being Node.
    """
    baseline_path = E / 'candidate-baseline.json'
    require(file_hash(baseline_path) == A['candidateBaselineSha256'], 'CANDIDATE_BASELINE_CHANGED')
    baseline = read(baseline_path)
    require(baseline['capturedBeforeUnit'] is True and baseline['label'] == SCOPE['label'],
            'PREUNIT_CANDIDATE_BASELINE_REQUIRED')
    rows = C['table']() if rows is None else rows
    require(len(rows) <= 16384, 'CANDIDATE_TABLE_BOUND')
    node_rows = C['bounded_capture'](['/bin/ps', '-ww', '-axo', 'pid=,comm='])
    nodes = []
    for line in node_rows.splitlines():
        words = line.strip().split(None, 1)
        require(len(words) == 2 and words[0].isdigit(), 'CANDIDATE_COMM_PARSE')
        if Path(words[1]).name.lower() == 'node':
            nodes.append(int(words[0]))
    require(len(nodes) <= 64, 'NODE_CANDIDATE_BOUND')
    old = {(r['pid'], r['start']): r for r in baseline['identities']}
    current, unknown, inherited = [], [], []
    fields = ('pid', 'start', 'argvHash', 'commHash', 'executableHash', 'executableFileHash')
    native_ids = set(native_ids)
    for pid in nodes:
        row = rows.get(pid)
        if row is None:
            continue
        key = (pid, row['start'])
        argv = C['pid_text'](pid, 'command')
        if not argv:
            unknown.append({'pid': pid, 'start': row['start'], 'classification': 'UNKNOWN_ARGV'})
            continue
        role = ('tinypool/dist/entry/process.js' in argv or 'vitest.mjs' in argv
                or '/vitest/' in argv or '/@vitest/' in argv)
        # Cwd and open files provide concrete workspace association when argv is neutral.
        if not role and key not in old and key not in native_ids:
            locations = C['bounded_capture'](['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid),
                                               '-d', 'cwd', '-F', 'n'])
            role = any(line.startswith('n' + str(W) + '/') or line == 'n' + str(W)
                       for line in locations.splitlines())
        if not role and key not in old and key not in native_ids:
            continue  # No concrete unit/role association; do not globally wait on Node.
        identity = C['identity'](row)
        if identity is None or not identity.get('identityComplete'):
            unknown.append({'pid': pid, 'start': row['start'], 'classification': 'UNKNOWN_IDENTITY'})
            continue
        if key in old:
            require(all(identity.get(k) == old[key].get(k) for k in fields), 'INHERITED_NODE_CHANGED')
            inherited.append(identity)
        elif identity['executableFileHash'] != A['nodeSha256']:
            unknown.append({**identity, 'classification': 'UNKNOWN_NODE_EXECUTABLE'})
        elif key in native_ids:
            current.append({**identity, 'classification': 'RECORDED_NATIVE'})
        else:
            unknown.append({**identity, 'classification': 'UNKNOWN_NEW_RESIDENT_ROLE'})
    return {'currentNative': current, 'unknownCandidates': unknown,
            'inheritedMatched': inherited, 'baselineSha256': A['candidateBaselineSha256'],
            'sampledObservationOnly': True}


def boundary(H, C, A):
    require(file_hash(R / H['baselinePath']) == H['baselineSha256'], 'BASELINE_CHANGED')
    facts = C['boundary_inventory']({'baselinePath': H['baselinePath']})
    require(not facts['inheritedIdentityChanged'] and not facts['incompleteStableIdentities']
            and not facts['otherProjectFacts'], 'RESOURCE_BOUNDARY_HOLD')
    # The shared core's project vocabulary predates this gateway unit. Check the
    # new exact workspace/config markers as read-only candidates, never cleanup ownership.
    raw = C['capture'](['/bin/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,command='])
    candidates = []
    for line in raw.splitlines():
        words = line.split(None, 7)
        require(len(words) >= 8, 'GATEWAY_BOUNDARY_CENSUS_INCOMPLETE')
        if str(W) in words[7] or 'vitest.gateway80.config.mjs' in words[7]:
            candidates.append({'pid': int(words[0]), 'ppid': int(words[1]),
                               'start': ' '.join(words[2:7]),
                               'argvHash': hashlib.sha256(words[7].encode()).hexdigest()})
    facts['gatewayMarkerCandidates'] = candidates
    require(not candidates, 'GATEWAY_MARKER_SURVIVOR_OR_UNOWNED_CANDIDATE')
    worker_state = worker_candidates(A, C)
    require(not worker_state['currentNative'] and not worker_state['unknownCandidates'],
            'RESIDENT_WORKER_OR_UNKNOWN_CANDIDATE')
    facts['workerCandidates'] = worker_state
    return facts


def workspace_guard(helper):
    I = read(D / 'input-manifest.json')
    require(owned_root_identity() == read(E / 'prepare.receipt.json')['workspace'], 'OWNED_ROOT_CHANGED')
    for row in [*I['finiteCopies'], I['fixture'], I['config']]:
        p = W / row['destination']
        h = I['helperBanks'][helper]['sha256'] if row['destination'].endswith('/_helpers.tpl') else row['sha256']
        require(file_hash(p) == h and stat.S_IMODE(p.stat().st_mode) == row['mode'], 'COPIED_INPUT_CHANGED')
    entry = W / 'repo/studio-runner/node_modules'
    require(entry.is_symlink() and os.readlink(entry) == SCOPE['dependencies'], 'DEPENDENCY_SYMLINK_CHANGED')
    chart_guard(W / 'repo/helm-chart/put-checks', fixed=helper == 'fixed')


def make_copy():
    require(not W.exists() and not W.is_symlink(), 'WORKSPACE_ALREADY_EXISTS')
    W.mkdir(mode=0o700)
    for n in ('tmp', 'cache'):
        (W / n).mkdir(mode=0o700)
    I = read(D / 'input-manifest.json')
    for row in [*I['finiteCopies'], I['fixture'], I['config']]:
        src, dst = D / row['bank'], W / row['destination']
        require(file_hash(src) == row['sha256'], 'BANK_CHANGED')
        dst.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        require(not dst.exists(), 'DUPLICATE_COPY_DESTINATION')
        shutil.copyfile(src, dst)
        dst.chmod(row['mode'])
    (W / 'repo/studio-runner/node_modules').symlink_to(SCOPE['dependencies'], target_is_directory=True)
    return {'workspace': owned_root_identity(), 'inventory': inventory(W)}


def run_native(phase, A, C):
    spec = next(x for x in SCOPE['phases'] if x['id'] == phase)
    cwd = W / 'repo/studio-runner'
    # Allowlist environment rather than inherit CI/node/provider overrides.
    env = dict(A['safeEnvironment'])
    require(all(isinstance(k, str) and isinstance(v, str) for k, v in env.items()), 'UNBOUND_SAFE_ENV')
    require(set(env) == {'HOME', 'LANG', 'LC_ALL'}, 'UNREVIEWED_ENV_KEY')
    env.update(PATH=os.pathsep.join([str(Path(SCOPE['node']).parent),
                                   str(Path(SCOPE['helm']).parent), A['boundBasePath']]),
               TMPDIR=str(W / 'tmp'), XDG_CACHE_HOME=str(W / 'cache'),
               VITE_CACHE_DIR=str(W / 'repo/studio-runner/.vite-gateway80'))
    argv = spec['argv']
    require(not (W / ('repo/' + phase + '-vitest.json')).exists(), 'REPORT_ALREADY_EXISTS')
    known, gaps, candidate_history = {}, set(), []
    started = utc()
    # Raw native output is archived unchanged in the new evidence directory.
    with (E / (phase + '.stdout')).open('xb') as out, (E / (phase + '.stderr')).open('xb') as err:
        child = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                 stdout=out, stderr=err, umask=0o022)
        write_new(E / (phase + '.launched.json'), {'pid': child.pid, 'argv': argv,
                  'cwd': str(cwd), 'safeEnvironment': env, 'startedAtUtc': started,
                  'childUmask': '022', 'maximumSeconds': 300})
        begin = time.monotonic()
        timed_out = False
        while True:
            try:
                rows = C['table']()
                # Include only native child ancestry, not this observer's transient ps/lsof.
                owned = {child.pid}
                changed = True
                while changed:
                    previous = len(owned)
                    owned |= {pid for pid, row in rows.items() if row['ppid'] in owned}
                    changed = len(owned) != previous
                for pid in owned:
                    if pid not in rows:
                        continue
                    row = rows[pid]
                    key = str(pid) + ':' + row['start']
                    if key not in known:
                        identity = C['identity'](row)
                        if identity is None:
                            # May have exited between table and identity; do not claim observed identity.
                            gaps.add('OWNED_IDENTITY_RACE')
                        elif identity.get('identityComplete'):
                            known[key] = identity
                        else:
                            gaps.add('OWNED_IDENTITY_INCOMPLETE')
                state = worker_candidates(A, C, rows, ((f['pid'], f['start']) for f in known.values()))
                candidate_history.append(state)
                if state['unknownCandidates']:
                    gaps.add('RESIDENT_REPARENTED_OR_UNKNOWN_CANDIDATE')
                code = child.poll()
                live = [f for f in known.values() if (rows.get(f['pid']) or {}).get('start') == f['start']]
                if time.monotonic() - begin >= spec['maximumSeconds']:
                    timed_out = True
                    gaps.add('PHASE_TIMEOUT_NOT_TERMINALITY')
                    break
                if code is not None and not live:
                    break
            except BaseException:
                gaps.add('OWNED_OBSERVATION_ERROR')
            if time.monotonic() - begin >= spec['maximumSeconds']:
                timed_out = True
                gaps.add('PHASE_TIMEOUT_NOT_TERMINALITY')
                code = child.poll()
                break
            time.sleep(0.25)
    # No kill/terminate/group signal or automatic retry is authorized here.
    result = {'startedAtUtc': started, 'endedAtUtc': utc(), 'argv': argv, 'cwd': str(cwd),
              'safeEnvironment': env, 'nativeExit': code, 'timedOut': timed_out,
              'ownedIdentities': list(known.values()), 'stickyFlags': sorted(gaps),
              'candidateObservations': candidate_history,
              'status': 'HOLD' if gaps or code is None else 'TERMINAL', 'automaticRetry': False}
    result['stdoutSha256'] = file_hash(E / (phase + '.stdout'))
    result['stderrSha256'] = file_hash(E / (phase + '.stderr'))
    result['launchSha256'] = file_hash(E / (phase + '.launched.json'))
    report = W / ('repo/' + phase + '-vitest.json')
    if report.is_file() and not report.is_symlink():
        shutil.copyfile(report, E / (phase + '-vitest.json'))
        result['reportSha256'] = file_hash(report)
    return result


def archive():
    before = inventory(W)
    destination = E / 'complete-workspace-archive'
    require(not destination.exists(), 'ARCHIVE_ALREADY_EXISTS')
    shutil.copytree(W, destination, symlinks=True)
    after = inventory(W)
    archive_rows = inventory(destination)
    compare = lambda rows: [{k: v for k, v in r.items() if k not in ('dev', 'ino')} for r in rows]
    require(before == after and compare(after) == compare(archive_rows), 'ARCHIVE_EQUALITY_FAILED')
    chart = W / 'repo/helm-chart/put-checks'
    require(sum(r['kind'] == 'file' for r in inventory(chart)) == 22, 'FINAL_CHART_NOT_22')
    shutil.copytree(chart, E / 'final-fixed-chart-archive', symlinks=True)
    require(compare(inventory(chart)) == compare(inventory(E / 'final-fixed-chart-archive')),
            'FINAL_CHART_ARCHIVE_MISMATCH')
    return {'workspace': owned_root_identity(), 'workspaceInventory': after,
            'archiveInventory': archive_rows, 'archiveEqual': True,
            'finalChartInventory': inventory(chart),
            'finalChartArchiveInventory': inventory(E / 'final-fixed-chart-archive'),
            'finalChart22': True, 'cleanupAuthorized': False, 'credit': False}


def main():
    require(__debug__, 'OPTIMIZED_PYTHON_FORBIDDEN')
    require(len(sys.argv) == 5, 'USAGE: phase release-path exact-release-sha decision-sha')
    phase, release_path, release_sha, decision_sha = sys.argv[1:]
    require(phase in SCOPE['phaseIds'], 'UNKNOWN_PHASE')
    old_mask = os.umask(0o077)
    require(old_mask == 0o077, 'PARENT_UMASK_MUST_ALREADY_BE_077')
    require(E.is_dir() and not E.is_symlink() and E.stat().st_uid == os.getuid()
            and stat.S_IMODE(E.stat().st_mode) == 0o700, 'UNSAFE_EVIDENCE_ROOT')
    require(Path(release_path) == E / 'root-authorization.json', 'RELEASE_PATH')
    require(file_hash(Path(release_path)) == release_sha, 'RELEASE_SHA_MISMATCH')
    A = read(Path(release_path))
    require(A['authorized'] is True and A['label'] == SCOPE['label'], 'ACTUAL_ROOT_RELEASE_REQUIRED')
    require(A['independentArchitectureReviewSha256'] and A['independentQaReviewSha256'], 'REVIEWS_REQUIRED')
    require(A['sourceWrites'] is False and A['C8'] is False and A['credit'] is False
            and A['automaticRetry'] is False, 'SCOPE_WIDENING')
    require(file_hash(D / 'manifest.json') == A['packetManifestSha256'], 'PACKET_SEAL')
    for row in read(D / 'manifest.json')['files']:
        require(file_hash(D / row['path']) == row['sha256'], 'PACKET_MEMBER_CHANGED')
    C = core()
    H = held(A, C)
    pre_source = guards(A, C)
    pre_resources = boundary(H, C, A)
    decision_path = E / (phase + '.root-decision.json')
    require(file_hash(decision_path) == decision_sha, 'DECISION_SHA')
    decision = read(decision_path)
    require(decision['releaseSha256'] == release_sha, 'DECISION_RELEASE')
    receipts = {}
    for previous in SCOPE['phaseIds']:
        p = E / (previous + '.receipt.json')
        if p.exists():
            receipts[previous] = read(p)
    transition_allowed(phase, decision, receipts)
    for previous, h in decision.get('precedingReceipts', {}).items():
        require(file_hash(E / (previous + '.receipt.json')) == h, 'PRECEDING_RECEIPT_SHA')
    requirements = {'prepare': [], 'red': ['prepare'], 'install-fixed': ['red'],
                    'green': ['install-fixed'], 'archive': ['green']}[phase]
    require(set(decision.get('precedingReceipts', {})) == set(requirements), 'PREDECESSOR_BINDINGS')
    # Once this exists, the phase can never be repeated, including after collector failure.
    write_new(E / (phase + '.consumed.json'), {'releaseSha256': release_sha,
              'decisionSha256': decision_sha, 'startedAtUtc': utc(), 'phase': phase})
    result = {'phase': phase, 'releaseSha256': release_sha, 'accepted': False,
              'status': 'HOLD', 'stickyFlags': [], 'preSource': pre_source,
              'preResources': pre_resources, 'nativeExecuted': False}
    try:
        require(not (E / (phase + '.receipt.json')).exists(), 'PHASE_RECEIPT_EXISTS')
        if phase == 'prepare':
            result.update(make_copy())
        else:
            helper = 'original' if phase in ('red', 'install-fixed') else 'fixed'
            workspace_guard(helper)
            result['beforeInventory'] = inventory(W)
            if phase == 'install-fixed':
                require(receipts['red']['assessment']['qualification'] == 'EXPECTED_RED_48_INTENDED_ASSERTIONS',
                        'INTENDED_RED_REQUIRED')
                target = W / 'repo/helm-chart/put-checks/templates/_helpers.tpl'
                shutil.copyfile(D / 'banks/fixed-helper.tpl', target)
                target.chmod(0o644)
                workspace_guard('fixed')
            elif phase in ('red', 'green'):
                require(not list((W / 'tmp').iterdir()), 'TMPDIR_NOT_EMPTY_BEFORE_PHASE')
                result['nativeExecuted'] = True
                result['native'] = run_native(phase, A, C)
                require(result['native']['status'] == 'TERMINAL' and not result['native']['stickyFlags'],
                        'NATIVE_OWNERSHIP_HOLD')
                result['assessment'] = assess(read(E / (phase + '-vitest.json')), phase,
                                               result['native']['nativeExit'], read(D / 'case-map.json'))
                require(not list((W / 'tmp').iterdir()), 'FIXTURE_SCRATCH_CLEANUP_FAILED')
                workspace_guard(helper)
            else:
                result.update(archive())
            result['afterInventory'] = inventory(W)
        result['postSource'] = guards(A, C)
        result['postResources'] = boundary(H, C, A)
        held(A, C)
        result.update(status='TERMINAL_ACCEPTED_LOCAL_ONLY', accepted=True)
    except BaseException as exc:
        # Exception class is public control metadata; no arbitrary bodies printed.
        result['stickyFlags'].append('PHASE_FAILED_' + type(exc).__name__)
        result['failureCode'] = str(exc) if isinstance(exc, ValueError) else 'UNEXPECTED_CONTROL_FAILURE'
    write_new(E / (phase + '.receipt.json'), result)
    # Red's native1 remains raw in native.nativeExit; collector qualification is distinct.
    return 0 if result['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())

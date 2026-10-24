#!/usr/bin/env python3
"""One explicit root-launched diagnostic unit; MUST be a child of with-gradle-lock.py."""
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shlex
import signal
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / 'backend/gradlew').is_file())
PLAN_SHA = '6d5284a95d08463a1611268c393ed980ff5088ef55a5135dd420569ca83b3897'
ORIGINAL = 'b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
CANDIDATE = 'd5cafe9818f29587cd646d2ac96c70c9b2c9c47c6433645fc0b80ec84d880d6d'
FQCN = 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
SOURCE = ROOT / 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
LOCK_WRAPPER = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
LOCK = LOCK_WRAPPER.with_name('gradle.lock')
COLLECTOR = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py'
EXECUTION = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/execution'
PARENT = os.getppid()
RECEIPT = {'schemaVersion': 1, 'status': 'STARTING', 'phases': [], 'processes': [],
           'sourceRestored': False, 'originalCompileSucceeded': False, 'collectorInvocations': 0,
           'interrupted': False, 'notQaVerdict': True, 'declaredBudgetUsd': 500,
           'actualSpend': 'UNAVAILABLE'}
RUN = None
PARENT_ID = None
BASELINE = {}
EXECUTABLE_CACHE = {}
CLOSED_FAILURES = {
    'UNSAFE_FILE', 'SYMLINK_PARENT', 'READ_ONLY_OBSERVATION_FAILED',
    'INCOMPLETE_PROCESS_OBSERVATION', 'LOCK_PARENT_LOST', 'LOCK_PARENT_IDENTITY_CHANGED',
    'UNEXPECTED_LOCK_PARENT_COMMAND', 'UNEXPECTED_LOCK_PARENT_CHILD', 'LOCK_WRAPPER_CHANGED',
    'UNSAFE_LOCK_FILE', 'PARENT_DOES_NOT_OWN_LOCK_DESCRIPTOR', 'LOCK_INODE_CHANGED',
    'KERNEL_LOCK_NOT_HELD', 'FROZEN_TREE_MEMBERSHIP_CHANGED', 'HASH_BOUND_INPUT_CHANGED',
    'POSSIBLE_PREEXISTING_GRADLE_FIXTURE_OR_BROWSER', 'UNEXPECTED_SOURCE_REFUSE_OVERWRITE',
    'SOURCE_CHANGED_BEFORE_REPLACE', 'ONE_SAFE_FRESH_LABEL_REQUIRED',
    'SOURCE_MODE_CHANGED', 'OWNED_TEMP_CHANGED',
    'RUN_FROM_REPOSITORY_ROOT', 'HARNESS_PLAN_CHANGED', 'FRESH_LABEL_OUTPUT_REQUIRED',
    'UNSAFE_RUNS_DIRECTORY', 'REQUIRED_NODE24_OR_JAVA21_MISSING', 'BACKUP_CHANGED',
    'RESTORE_REFUSED_UNEXPECTED_SOURCE',
    'BASELINE_IDENTITY_CHANGED', 'NEW_UNRECOGNIZED_PROJECT_JOB',
    'PROCESS_IDENTITY_OBSERVATION_GAP', 'EXECUTABLE_IDENTITY_UNCONFIRMED',
}


def failure_code(error):
    return error.args[0] if error.args and isinstance(error.args[0], str) and error.args[0] in CLOSED_FAILURES else 'OTHER'


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
        raise RuntimeError('UNSAFE_FILE')
    for parent in path.parents:
        if parent == ROOT:
            break
        if parent.is_symlink():
            raise RuntimeError('SYMLINK_PARENT')
    return path.read_bytes()


def private_write(path, data, exclusive=False):
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_EXCL if exclusive else os.O_TRUNC)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def phase(name, **fields):
    RECEIPT['phases'].append({'phase': name, 'atUtc': utc(), **fields})
    if RUN:
        temporary = RUN / 'receipt.next'
        private_write(temporary, (json.dumps(RECEIPT, indent=2) + '\n').encode())
        os.replace(temporary, RUN / 'receipt.json')


def observe_phase(name, **fields):
    # Receipt I/O failure must never unwind past an actually live native/JVM child.
    try:
        phase(name, **fields)
    except Exception:
        RECEIPT['receiptWriteFailed'] = True


def capture(command, allowed=(0,)):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode not in allowed:
        raise RuntimeError('READ_ONLY_OBSERVATION_FAILED')
    return result.stdout


def pid_column(pid, column):
    value = capture(['/bin/ps', '-ww', '-p', str(pid), '-o', column + '='], (0, 1)).rstrip('\n')
    return value.strip() if value else None


def complete_identity(row):
    before = pid_column(row['pid'], 'lstart')
    executable = pid_column(row['pid'], 'comm')
    arguments = pid_column(row['pid'], 'command')
    after = pid_column(row['pid'], 'lstart')
    if not before or before != row['start'] or before != after or not executable or arguments is None:
        raise RuntimeError('PROCESS_IDENTITY_OBSERVATION_GAP')
    # macOS comm may be merely "node". Bind the actual executable mapping, not PATH lookup.
    mappings = capture(['/usr/sbin/lsof', '-nP', '-a', '-p', str(row['pid']),
                        '-d', 'txt', '-F', 'n'], (0, 1))
    candidates = {Path(line[1:]).resolve() for line in mappings.splitlines()
                  if line.startswith('n') and Path(line[1:]).is_absolute()
                  and Path(line[1:]).name == Path(executable).name and Path(line[1:]).is_file()}
    if len(candidates) != 1:
        raise RuntimeError('EXECUTABLE_IDENTITY_UNCONFIRMED')
    path = candidates.pop()
    info = path.stat()
    key = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
    if key not in EXECUTABLE_CACHE:
        binary_hash = digest(path.read_bytes())
        after_info = path.stat()
        if key != (after_info.st_dev, after_info.st_ino, after_info.st_size, after_info.st_mtime_ns):
            raise RuntimeError('EXECUTABLE_IDENTITY_UNCONFIRMED')
        EXECUTABLE_CACHE[key] = binary_hash
    if pid_column(row['pid'], 'lstart') != before or pid_column(row['pid'], 'comm') != executable or pid_column(row['pid'], 'command') != arguments:
        raise RuntimeError('PROCESS_IDENTITY_OBSERVATION_GAP')
    return {**row, 'commHash': digest(executable.encode()), 'executableHash': digest(str(path).encode()),
            'argvHash': digest(arguments.encode()), 'executableFileHash': EXECUTABLE_CACHE[key],
            'executableSource': 'UNIQUE_MATCHING_LSOF_TEXT_MAPPING', 'identityComplete': True}


def same_identity(left, right):
    fields = ('pid', 'start', 'role', 'executableKind', 'commHash', 'executableHash', 'argvHash', 'executableFileHash')
    return all(left.get(field) == right.get(field) for field in fields)


def process_rows():
    rows = {}
    output = capture(['/bin/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,comm=,command='])
    for line in output.splitlines():
        words = line.split(None, 8)
        if len(words) < 9:
            raise RuntimeError('INCOMPLETE_PROCESS_OBSERVATION')
        pid, ppid = int(words[0]), int(words[1])
        start = ' '.join(words[2:7])
        executable, arguments = words[7], words[8]
        role, kind = 'OTHER', 'OTHER'
        markers = ['GradleDaemon', 'GradleWrapperMain', 'GradleWorkerMain', 'worker.org.gradle',
                   'obs007-joined-', 'obs015-prefix-sync-', 'checks-guided-']
        if any(marker in arguments for marker in markers) or pid in BASELINE:
            full_comm = pid_column(pid, 'comm')
            if full_comm is None:
                raise RuntimeError('PROCESS_IDENTITY_OBSERVATION_GAP')
            basename = Path(full_comm).name.lower()
            if basename in ('java', 'java.exe'):
                kind = 'JAVA'
            elif basename in ('node', 'node.exe'):
                kind = 'NODE'
            elif basename.startswith(('google chrome', 'chromium', 'chrome')):
                kind = 'CHROME'
        if kind == 'JAVA' and ('GradleDaemon' in arguments or 'GradleWrapperMain' in arguments):
            role = 'GRADLE'
        elif kind == 'JAVA' and ('GradleWorkerMain' in arguments or 'worker.org.gradle' in arguments):
            role = 'TEST_JVM'
        elif kind == 'NODE' and any(marker in arguments for marker in ['obs007-joined-', 'obs015-prefix-sync-']):
            role = 'FIXTURE'
        elif kind == 'CHROME' and 'checks-guided-' in arguments:
            role = 'NATIVE_BROWSER'
        rows[pid] = {'pid': pid, 'ppid': ppid, 'start': start, 'role': role, 'executableKind': kind,
                     'executableHash': digest(executable.encode()), 'identityComplete': False}
        if role != 'OTHER' or pid in BASELINE:
            rows[pid] = complete_identity(rows[pid])
    return rows


def inventory_disposition(rows, owned=None):
    owned = owned or {}
    matches, missing, changed = [], [], []
    for pid, old in BASELINE.items():
        current = rows.get(pid)
        if current is None:
            missing.append({'pid': pid, 'start': old['start']})
        elif same_identity(old, current):
            matches.append(current)
        else:
            changed.append({'baseline': old, 'current': current})
    unowned = [row for pid, row in rows.items() if row['role'] != 'OTHER'
               and not (pid in BASELINE and same_identity(BASELINE[pid], row))
               and not ((pid, row['start']) in owned and same_identity(owned[(pid, row['start'])], row))]
    return {'inheritedMatched': matches, 'oldIdentitiesAbsent': missing,
            'inheritedIdentityChanged': changed, 'newUnownedProjectFacts': unowned,
            'quietHostClaimed': False, 'inheritedCleanupClaimed': False}


def note_disposition(disposition):
    if disposition['inheritedIdentityChanged']:
        RECEIPT['baselineIdentityDrift'] = True
    if disposition['newUnownedProjectFacts']:
        RECEIPT['newUnownedProjectFactsSeen'] = True
    history = RECEIPT.setdefault('unownedProjectFactHistory', [])
    for row in disposition['newUnownedProjectFacts']:
        if row not in history:
            history.append(row)
    drift = RECEIPT.setdefault('baselineIdentityDriftHistory', [])
    for row in disposition['inheritedIdentityChanged']:
        if row not in drift:
            drift.append(row)


def host_sample():
    sample = {'atUtc': utc(), 'monotonicMs': int(time.monotonic() * 1000),
              'load': list(os.getloadavg()), 'cpuCount': os.cpu_count() or 0,
              'totalMemoryBytes': int(capture(['/usr/sbin/sysctl', '-n', 'hw.memsize']).strip()),
              'selfMaxRssBytes': int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),
              'childrenMaxRssBytes': int(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)}
    text = capture(['/usr/bin/vm_stat'])
    page_size = re.search(r'page size of (\d+) bytes', text)
    if page_size is None:
        raise RuntimeError('READ_ONLY_OBSERVATION_FAILED')
    sample['pageSizeBytes'] = int(page_size[1])
    names = {'Pages free': 'freePages', 'Pages active': 'activePages',
             'Pages inactive': 'inactivePages', 'Pages speculative': 'speculativePages',
             'Pages wired down': 'wiredPages', 'Pages occupied by compressor': 'compressedPages'}
    for line in text.splitlines():
        match = re.fullmatch(r'([^:]+):\s*(\d+)\.?', line.strip())
        if match and match[1] in names:
            sample[names[match[1]]] = int(match[2])
    if not all(name in sample for name in names.values()):
        raise RuntimeError('READ_ONLY_OBSERVATION_FAILED')
    return sample


def held_parent_lock(plan):
    if os.getppid() != PARENT:
        raise RuntimeError('LOCK_PARENT_LOST')
    identity = process_rows().get(PARENT)
    if identity is None or (PARENT_ID is not None and identity['start'] != PARENT_ID['start']):
        raise RuntimeError('LOCK_PARENT_IDENTITY_CHANGED')
    command = shlex.split(capture(['/bin/ps', '-p', str(PARENT), '-o', 'command=']).strip())
    # Exact approved wrapper argument, then interpreter, then this harness and its sole label.
    index = next((i for i, arg in enumerate(command)
                  if (ROOT / arg).resolve() == LOCK_WRAPPER), -1)
    if index < 0 or len(command[index + 1:]) != 3:
        raise RuntimeError('UNEXPECTED_LOCK_PARENT_COMMAND')
    if (ROOT / command[index + 2]).resolve() != Path(__file__).resolve() or command[-1] != sys.argv[1]:
        raise RuntimeError('UNEXPECTED_LOCK_PARENT_CHILD')
    if digest(checked(LOCK_WRAPPER)) != plan['files'][str(LOCK_WRAPPER.relative_to(ROOT))]:
        raise RuntimeError('LOCK_WRAPPER_CHANGED')
    lock_stat = LOCK.stat(follow_symlinks=False)
    if not stat.S_ISREG(lock_stat.st_mode) or LOCK.is_symlink():
        raise RuntimeError('UNSAFE_LOCK_FILE')
    observation = capture(['/usr/sbin/lsof', '-nP', '-a', '-p', str(PARENT),
                           '-F', 'pfnil', '--', str(LOCK)])
    if 'p' + str(PARENT) not in observation.splitlines() or not any(
            line == 'i' + str(lock_stat.st_ino) for line in observation.splitlines()):
        raise RuntimeError('PARENT_DOES_NOT_OWN_LOCK_DESCRIPTOR')
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if (os.fstat(fd).st_dev, os.fstat(fd).st_ino) != (lock_stat.st_dev, lock_stat.st_ino):
            raise RuntimeError('LOCK_INODE_CHANGED')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno not in (errno.EAGAIN, errno.EACCES):
                raise
        else:
            fcntl.flock(fd, fcntl.LOCK_UN)
            raise RuntimeError('KERNEL_LOCK_NOT_HELD')
    finally:
        os.close(fd)
    return identity


def validate_tree(plan, staged=False):
    expected = set(plan['treeFiles'])
    actual = {str(file.relative_to(ROOT)) for directory in plan['trees']
              for file in (ROOT / directory).rglob('*') if file.is_file() or file.is_symlink()}
    if actual != expected:
        raise RuntimeError('FROZEN_TREE_MEMBERSHIP_CHANGED')
    for relative, expected_hash in plan['files'].items():
        actual_hash = digest(checked(ROOT / relative))
        allowed = CANDIDATE if staged and ROOT / relative == SOURCE else expected_hash
        if actual_hash != allowed:
            raise RuntimeError('HASH_BOUND_INPUT_CHANGED')


def preflight():
    rows = process_rows()
    disposition = inventory_disposition(rows)
    raw = capture(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], (0, 1))
    listeners, pid = [], None
    for line in raw.splitlines():
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None:
            port = line.rsplit(':', 1)[-1]
            if port.isdigit():
                listeners.append({'pid': pid, 'port': int(port)})
    phase('READ_ONLY_PREFLIGHT', listeners=listeners, **disposition)
    if disposition['inheritedIdentityChanged']:
        raise RuntimeError('BASELINE_IDENTITY_CHANGED')
    if disposition['newUnownedProjectFacts']:
        raise RuntimeError('NEW_UNRECOGNIZED_PROJECT_JOB')


def run_child(name, command, cwd, environment, plan):
    held_parent_lock(plan)
    log = RUN / (name + '.private.log')
    with log.open('xb') as output:
        launched = utc()
        child = subprocess.Popen(command, cwd=cwd, env=environment, stdout=output,
                                 stderr=subprocess.STDOUT)
        entry = {'phase': name, 'pid': child.pid, 'launchedAtUtc': launched, 'kernelStart': None,
                 'command': command, 'descendants': [], 'exit': None}
        RECEIPT['processes'].append(entry)
        known = {}
        while True:
            try:
                rows = process_rows()
                if child.pid in rows:
                    if entry['kernelStart'] is None:
                        entry['kernelStart'] = rows[child.pid]['start']
                owned = {child.pid}
                for _ in range(len(rows)):
                    expanded = owned | {pid for pid, row in rows.items() if row['ppid'] in owned}
                    if expanded == owned:
                        break
                    owned = expanded
                for pid in owned - {child.pid}:
                    if pid in rows:
                        key, row = (pid, rows[pid]['start']), rows[pid]
                        if key in known and known[key]['identityComplete'] and not same_identity(known[key], row):
                            RECEIPT['ownedIdentityObservationGap'] = True
                        elif key not in known or not known[key]['identityComplete']:
                            known[key] = row
                entry['descendants'] = list(known.values())
                disposition = inventory_disposition(rows, known)
                # The directly launched Gradle JVM is owned by Popen even if not a descendant.
                disposition['newUnownedProjectFacts'] = [row for row in disposition['newUnownedProjectFacts']
                    if row['pid'] != child.pid or row['start'] != entry['kernelStart']]
                note_disposition(disposition)
                entry['latestInventory'] = disposition
                held_parent_lock(plan)
            except Exception:
                # Lost observations do not terminate/restart the real child or release source.
                RECEIPT['observationFailure'] = True
            observe_phase(name + '_WAIT', pid=child.pid, live=child.returncode is None)
            try:
                code = child.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                continue
            except BaseException:
                # A failed wait observation is never proof of termination.
                RECEIPT['subprocessWaitObservationFailed'] = True
                time.sleep(5)
                continue
        entry['exit'], entry['terminatedAtUtc'] = code, utc()
        # A terminal collector alone is insufficient when an observed JVM child survived it.
        while True:
            try:
                rows = process_rows()
                pending = [row for (pid, start), row in known.items()
                           if row['role'] in ('GRADLE', 'TEST_JVM') and pid in rows
                           and rows[pid]['start'] == start]
                for row in pending:
                    if not same_identity(row, rows[row['pid']]):
                        RECEIPT['ownedIdentityObservationGap'] = True
                disposition = inventory_disposition(rows, known)
                note_disposition(disposition)
                entry['terminalInventory'] = disposition
            except Exception:
                RECEIPT['observationFailure'] = True
                observe_phase(name + '_JVM_OBSERVATION_UNAVAILABLE')
                time.sleep(5)
                continue
            if not pending:
                entry['ownedJvmTerminalProof'] = [{'pid': pid, 'start': start,
                    'proof': 'PID_ABSENT' if pid not in rows else 'DIFFERENT_KERNEL_START'}
                    for (pid, start), row in known.items() if row['role'] in ('GRADLE', 'TEST_JVM')]
                entry['remainingNativeOrFixtureFacts'] = [row for (pid, start), row in known.items()
                    if row['role'] in ('FIXTURE', 'NATIVE_BROWSER') and pid in rows and rows[pid]['start'] == start]
                if entry['remainingNativeOrFixtureFacts']:
                    RECEIPT['nativeOrFixtureUnresolved'] = True
                break
            observe_phase(name + '_WAIT_JVM_DESCENDANTS', processes=pending)
            time.sleep(5)
    entry['logSha256'] = digest(checked(log))
    phase(name + '_TERMINAL', pid=child.pid, exit=code)
    held_parent_lock(plan)
    return code


def replace_source(data, expected_hash, mode):
    if digest(checked(SOURCE)) != expected_hash:
        raise RuntimeError('UNEXPECTED_SOURCE_REFUSE_OVERWRITE')
    before = SOURCE.stat(follow_symlinks=False)
    if stat.S_IMODE(before.st_mode) != mode:
        raise RuntimeError('SOURCE_MODE_CHANGED')
    temporary = SOURCE.with_name('.diag-start1-' + str(os.getpid()) + '.tmp')
    created, temporary_identity = False, None
    try:
        private_write(temporary, data, exclusive=True)
        created = True
        temporary_stat = temporary.stat(follow_symlinks=False)
        temporary_identity = (temporary_stat.st_dev, temporary_stat.st_ino)
        os.chmod(temporary, mode)
        current_temp = temporary.stat(follow_symlinks=False)
        if (current_temp.st_dev, current_temp.st_ino) != temporary_identity or digest(checked(temporary)) != digest(data):
            raise RuntimeError('OWNED_TEMP_CHANGED')
        current = SOURCE.stat(follow_symlinks=False)
        if (current.st_dev, current.st_ino, current.st_mode) != (before.st_dev, before.st_ino, before.st_mode) or digest(checked(SOURCE)) != expected_hash:
            raise RuntimeError('SOURCE_CHANGED_BEFORE_REPLACE')
        os.replace(temporary, SOURCE)
        created = False
    finally:
        if created:
            current = temporary.stat(follow_symlinks=False)
            if stat.S_ISREG(current.st_mode) and (current.st_dev, current.st_ino) == temporary_identity:
                temporary.unlink()


def main():
    global RUN, PARENT_ID, BASELINE
    os.umask(0o077)
    if len(sys.argv) != 2 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', sys.argv[1]):
        raise RuntimeError('ONE_SAFE_FRESH_LABEL_REQUIRED')
    if Path.cwd().resolve() != ROOT:
        raise RuntimeError('RUN_FROM_REPOSITORY_ROOT')
    plan_bytes = checked(HERE / 'plan.json')
    if digest(plan_bytes) != PLAN_SHA:
        raise RuntimeError('HARNESS_PLAN_CHANGED')
    plan = json.loads(plan_bytes)
    inventory_bytes = checked(HERE / 'preexisting-baseline.json')
    if digest(inventory_bytes) != plan['baselineSha256']:
        raise RuntimeError('HASH_BOUND_INPUT_CHANGED')
    inventory = json.loads(inventory_bytes)
    BASELINE = {row['pid']: row for row in inventory['identities']}
    PARENT_ID = held_parent_lock(plan)
    validate_tree(plan)
    label = sys.argv[1]
    if list(EXECUTION.glob(label + '*')) or (HERE / 'runs' / label).exists():
        raise RuntimeError('FRESH_LABEL_OUTPUT_REQUIRED')
    runs = HERE / 'runs'
    runs.mkdir(exist_ok=True, mode=0o700)
    runs_stat = runs.stat(follow_symlinks=False)
    if runs.is_symlink() or not stat.S_ISDIR(runs_stat.st_mode) or stat.S_IMODE(runs_stat.st_mode) != 0o700 or runs_stat.st_uid != os.getuid():
        raise RuntimeError('UNSAFE_RUNS_DIRECTORY')
    RUN = HERE / 'runs' / label
    RUN.mkdir(mode=0o700)
    RECEIPT.update(label=label, startedAtUtc=utc(), parentLockIdentity=PARENT_ID,
                   planSha256=PLAN_SHA, originalHash=ORIGINAL, candidateHash=CANDIDATE)
    phase('LOCK_AND_INPUTS_VERIFIED')
    RECEIPT['startHostSample'] = host_sample()
    preflight()
    original = checked(SOURCE)
    mode = stat.S_IMODE(SOURCE.stat(follow_symlinks=False).st_mode)
    RECEIPT['sourceBefore'] = {'sha256': digest(original), 'mode': oct(mode)}
    private_write(RUN / 'ReplayIT.original.java', original, exclusive=True)
    candidate = checked(ROOT / plan['candidate'])
    environment = dict(os.environ)
    environment['JAVA_HOME'] = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
    node = Path('/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin')
    if not (node / 'node').is_file() or not Path(environment['JAVA_HOME']).is_dir():
        raise RuntimeError('REQUIRED_NODE24_OR_JAVA21_MISSING')
    environment['PATH'] = str(node) + os.pathsep + environment.get('PATH', '')
    compile_command = ['./gradlew', 'compileTestJava', '--no-daemon']
    code, staged, owned_stat = 2, False, None
    try:
        held_parent_lock(plan)
        validate_tree(plan)
        # Revalidate inherited identity and new conflicts immediately before staging too.
        preflight()
        staged = True
        RECEIPT['sourceStageAttempted'] = True
        replace_source(candidate, ORIGINAL, mode)
        owned_stat = SOURCE.stat(follow_symlinks=False)
        phase('CANDIDATE_STAGED', sourceHash=digest(checked(SOURCE)), originalMode=oct(mode))
        validate_tree(plan, staged=True)
        code = run_child('diagnostic-compile', compile_command, ROOT / 'backend', environment, plan)
        if code == 0 and not RECEIPT['interrupted']:
            validate_tree(plan, staged=True)
            RECEIPT['collectorInvocations'] += 1
            command = [sys.executable, str(COLLECTOR), label, '--test-tasks',
                       'test,guidedIncrementalTest', '--require-exec-tasks',
                       'test,guidedIncrementalTest', '--', 'test', '--tests', FQCN,
                       'guidedIncrementalTest', '--tests', FQCN, '--continue',
                       '--rerun-tasks', '--no-daemon']
            code = run_child('single-full-class', command, ROOT, environment, plan)
    except BaseException as error:
        RECEIPT['failureType'] = type(error).__name__
        RECEIPT['failureCode'] = failure_code(error)
        code = 2
    finally:
        if staged:
            try:
                held_parent_lock(plan)
                current, info = checked(SOURCE), SOURCE.stat(follow_symlinks=False)
                if digest(current) == ORIGINAL and stat.S_IMODE(info.st_mode) == mode:
                    phase('ORIGINAL_ALREADY_EXACT')
                elif digest(current) == CANDIDATE and owned_stat is not None and (info.st_dev, info.st_ino, info.st_mode) == (owned_stat.st_dev, owned_stat.st_ino, owned_stat.st_mode):
                    backup = checked(RUN / 'ReplayIT.original.java')
                    if digest(backup) != ORIGINAL:
                        raise RuntimeError('BACKUP_CHANGED')
                    replace_source(backup, CANDIDATE, mode)
                else:
                    raise RuntimeError('RESTORE_REFUSED_UNEXPECTED_SOURCE')
                RECEIPT['sourceRestored'] = digest(checked(SOURCE)) == ORIGINAL and stat.S_IMODE(SOURCE.stat().st_mode) == mode
                phase('ORIGINAL_RESTORED', sourceHash=digest(checked(SOURCE)))
                validate_tree(plan)
                restore_exit = run_child('restored-compile', compile_command, ROOT / 'backend', environment, plan)
                RECEIPT['originalCompileSucceeded'] = restore_exit == 0
                validate_tree(plan)
                if restore_exit:
                    code = 2
            except BaseException as error:
                RECEIPT['restorationFailureType'] = type(error).__name__
                RECEIPT['restorationFailureCode'] = failure_code(error)
                code = 2
        try:
            RECEIPT['sourceAfterHash'] = digest(checked(SOURCE))
            RECEIPT['sourceAfterMode'] = oct(stat.S_IMODE(SOURCE.stat(follow_symlinks=False).st_mode))
            RECEIPT['sourceRestored'] = RECEIPT['sourceRestored'] and RECEIPT['sourceAfterHash'] == ORIGINAL and RECEIPT['sourceAfterMode'] == oct(mode)
        except Exception:
            RECEIPT['sourceAfterHashUnavailable'] = True
            code = 2
        try:
            RECEIPT['endHostSample'] = host_sample()
        except Exception:
            RECEIPT['hostSampleIncomplete'] = True
        incomplete_flags = ('receiptWriteFailed', 'nativeOrFixtureUnresolved', 'interrupted',
                            'observationFailure', 'subprocessWaitObservationFailed',
                            'ownedIdentityObservationGap', 'newUnownedProjectFactsSeen',
                            'baselineIdentityDrift', 'hostSampleIncomplete')
        RECEIPT['nativeEvidenceComplete'] = not any(RECEIPT.get(flag) for flag in incomplete_flags)
        if not RECEIPT['nativeEvidenceComplete']:
            code = 2
        restored = RECEIPT['sourceRestored'] and RECEIPT['originalCompileSucceeded'] and not RECEIPT.get('restorationFailureCode')
        RECEIPT['status'] = ('TERMINAL' if RECEIPT['nativeEvidenceComplete'] else 'TERMINAL_INCOMPLETE_OBSERVATION') if restored else 'RESTORATION_OR_BUILD_INCOMPLETE'
        RECEIPT['exit'] = code
        phase('FINISHED', exit=code)
    return code


if __name__ == '__main__':
    def defer_interrupt(number, _frame):
        RECEIPT['interrupted'] = True
    signal.signal(signal.SIGINT, defer_interrupt)
    signal.signal(signal.SIGTERM, defer_interrupt)
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        RECEIPT['status'] = 'RESTORATION_OR_BUILD_INCOMPLETE' if RECEIPT.get('sourceStageAttempted') else 'PREFLIGHT_FAILED_NO_STAGE'
        RECEIPT['failureType'] = type(error).__name__
        RECEIPT['failureCode'] = failure_code(error)
        if RUN is not None and 'endHostSample' not in RECEIPT:
            try:
                RECEIPT['endHostSample'] = host_sample()
            except Exception:
                RECEIPT['hostSampleIncomplete'] = True
        observe_phase('REFUSED_OR_INCOMPLETE')
        sys.stderr.write(json.dumps({'status': RECEIPT['status'], 'failureType': RECEIPT['failureType'],
                                     'failureCode': RECEIPT['failureCode']}) + '\n')
        sys.exit(2)

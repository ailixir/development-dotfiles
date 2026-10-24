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
import shlex
import signal
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / 'backend/gradlew').is_file())
PLAN_SHA = '778ad943ec2a27b1e5edcbdf408c976118c3d0ea0eba2a61c133ddd56951967d'
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


def process_rows():
    rows = {}
    output = capture(['/bin/ps', '-axo', 'pid=,ppid=,lstart=,comm=,command='])
    for line in output.splitlines():
        words = line.split(None, 8)
        if len(words) < 9:
            raise RuntimeError('INCOMPLETE_PROCESS_OBSERVATION')
        pid, ppid = int(words[0]), int(words[1])
        start = ' '.join(words[2:7])
        executable, arguments = words[7], words[8]
        role = 'OTHER'
        if 'GradleDaemon' in arguments or 'GradleWrapperMain' in arguments:
            role = 'GRADLE'
        elif 'GradleWorkerMain' in arguments or 'worker.org.gradle' in arguments:
            role = 'TEST_JVM'
        elif any(marker in arguments for marker in ['obs007-joined-', 'obs015-prefix-sync-']):
            if 'node' in executable.lower() or 'java' in executable.lower():
                role = 'FIXTURE'
        elif 'checks-guided-' in arguments and ('chrom' in executable.lower() or 'chrome' in arguments.lower()):
            role = 'NATIVE_BROWSER'
        rows[pid] = {'pid': pid, 'ppid': ppid, 'start': start, 'role': role,
                     'executableHash': digest(executable.encode())}
    return rows


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
    suspects = [row for row in rows.values() if row['role'] != 'OTHER']
    raw = capture(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], (0, 1))
    listeners, pid = [], None
    for line in raw.splitlines():
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None:
            port = line.rsplit(':', 1)[-1]
            if port.isdigit():
                listeners.append({'pid': pid, 'port': int(port)})
    phase('READ_ONLY_PREFLIGHT', listeners=listeners, possibleOrphans=suspects)
    if suspects:
        raise RuntimeError('POSSIBLE_PREEXISTING_GRADLE_FIXTURE_OR_BROWSER')


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
                        known[(pid, rows[pid]['start'])] = rows[pid]
                entry['descendants'] = list(known.values())
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
                known_ids = {row['pid'] for row in pending}
                pending.extend(row for row in rows.values()
                               if row['role'] in ('GRADLE', 'TEST_JVM') and row['pid'] not in known_ids)
            except Exception:
                observe_phase(name + '_JVM_OBSERVATION_UNAVAILABLE')
                time.sleep(5)
                continue
            if not pending:
                entry['remainingNativeOrFixtureFacts'] = [row for (pid, start), row in known.items()
                    if row['role'] in ('FIXTURE', 'NATIVE_BROWSER') and pid in rows and rows[pid]['start'] == start]
                if entry['remainingNativeOrFixtureFacts']:
                    RECEIPT['nativeOrFixtureUnresolved'] = True
                entry['remainingProjectLikeProcesses'] = [row for row in rows.values()
                    if row['role'] in ('FIXTURE', 'NATIVE_BROWSER')]
                if entry['remainingProjectLikeProcesses']:
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
    global RUN, PARENT_ID
    os.umask(0o077)
    if len(sys.argv) != 2 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', sys.argv[1]):
        raise RuntimeError('ONE_SAFE_FRESH_LABEL_REQUIRED')
    if Path.cwd().resolve() != ROOT:
        raise RuntimeError('RUN_FROM_REPOSITORY_ROOT')
    plan_bytes = checked(HERE / 'plan.json')
    if digest(plan_bytes) != PLAN_SHA:
        raise RuntimeError('HARNESS_PLAN_CHANGED')
    plan = json.loads(plan_bytes)
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
        if RECEIPT.get('receiptWriteFailed') or RECEIPT.get('nativeOrFixtureUnresolved') or RECEIPT['interrupted']:
            code = 2
        RECEIPT['status'] = 'TERMINAL' if RECEIPT['sourceRestored'] and RECEIPT['originalCompileSucceeded'] and not RECEIPT.get('restorationFailureCode') else 'RESTORATION_OR_BUILD_INCOMPLETE'
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
        observe_phase('REFUSED_OR_INCOMPLETE')
        sys.stderr.write(json.dumps({'status': RECEIPT['status'], 'failureType': RECEIPT['failureType'],
                                     'failureCode': RECEIPT['failureCode']}) + '\n')
        sys.exit(2)

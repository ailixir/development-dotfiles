"""GSMb-only lock/native/file safety. Import has no process or filesystem side effects.

Ownership decisions derive from accepted fullcheck resume3 harness a1e7d05ff991965fae636077
...a6c4709e8aae: owned_census_keys/classify_owned/pending_owned/ownership_drain_decision.
They are copied below, with the same conservative JAVA/UNKNOWN/reparent/exec semantics.
Runtime supervision is generalized only to this unit's compile/collector/restored compile.
"""
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import time


def sha(data):
    return hashlib.sha256(data).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def safe_path(root, name):
    p = Path(name)
    if not p.is_absolute():
        p = root / p
    p.relative_to(root)
    if '..' in p.parts or not p.resolve(strict=False).is_relative_to(root):
        raise ValueError('PATH_ESCAPE')
    for item in (p, *p.parents):
        if item.is_symlink():
            raise ValueError('SYMLINK_PATH')
        if item == root:
            break
    return p


def file_state(path):
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(before.st_mode) or path.is_symlink():
        raise ValueError('REGULAR_FILE_REQUIRED')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read()
        after = os.fstat(fd)
        again = path.lstat()
        keys = lambda i: (i.st_dev, i.st_ino, i.st_size, i.st_mtime_ns, stat.S_IMODE(i.st_mode))
        if keys(before) != keys(after) or keys(after) != keys(again):
            raise ValueError('FILE_CHANGED_DURING_READ')
        return {'bytes': data, 'sha256': sha(data), 'mode': stat.S_IMODE(after.st_mode),
                'dev': after.st_dev, 'ino': after.st_ino, 'mtimeNs': after.st_mtime_ns}
    finally:
        os.close(fd)


def same_state(a, b, identity=True):
    if a is None or b is None:
        return a is None and b is None
    keys = ['sha256', 'mode'] + (['dev', 'ino'] if identity else [])
    return all(a[k] == b[k] for k in keys)


def capture(command, allowed=(0,)):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode not in allowed:
        raise ValueError('OBSERVATION_COMMAND_FAILED')
    return result.stdout


def pid_text(pid, column):
    return capture(['/bin/ps', '-ww', '-p', str(pid), '-o', column + '='], (0, 1)).strip() or None


def table():
    rows = {}
    for line in capture(['/bin/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,command=']).splitlines():
        words = line.split(None, 7)
        if len(words) < 8:
            raise ValueError('PROCESS_CENSUS_INCOMPLETE')
        pid, parent = int(words[0]), int(words[1])
        rows[pid] = {'pid': pid, 'ppid': parent, 'start': ' '.join(words[2:7]),
                     'argvHash': sha(words[7].encode())}
    return rows


def owned_census_keys(rows, known, child_pid, owner_pid):
    """Pure closure: census establishes ownership before executable observations."""
    direct = {child_pid} if child_pid in rows and rows[child_pid]['ppid'] == owner_pid else set()
    owned = direct | {pid for (pid, start) in known if pid in rows and rows[pid]['start'] == start}
    for _ in range(len(rows)):
        more = owned | {pid for pid, row in rows.items() if row['ppid'] in owned}
        if more == owned:
            break
        owned = more
    return {(pid, rows[pid]['start']) for pid in owned if pid in rows}


def classify_owned(row, previous, comm, rechecked_start, observation_error=False):
    """Pure conservative classification. Missing observations never prove non-JVM."""
    previous = previous or {}
    proved_java = previous.get('javaPreviouslyProved', False)
    identity_matched = not observation_error and rechecked_start == row['start']
    executable_observed = identity_matched and isinstance(comm, str) and bool(comm.strip())
    current_java = executable_observed and Path(comm).name.lower() == 'java'
    proved_java = proved_java or current_java
    state = ('JAVA' if proved_java else 'NON_JAVA' if executable_observed else 'UNKNOWN')
    return {**row, 'javaPreviouslyProved': proved_java, 'executableState': state,
            'identityObservation': 'MATCHED' if identity_matched else 'UNKNOWN',
            'executableObservation': ('JAVA' if current_java else 'NON_JAVA') if executable_observed else 'UNKNOWN',
            'observationError': observation_error}


def pending_owned(rows, known):
    """Only reliable current non-JVM or original identity absence resolves."""
    return [row for (pid, start), row in known.items()
            if pid in rows and rows[pid]['start'] == start
            and (row['executableState'] != 'NON_JAVA' or row['identityObservation'] != 'MATCHED')]


def ownership_drain_decision(rows, known, child_terminal, observation_succeeded=True):
    if not observation_succeeded or not child_terminal:
        return 'WAIT'
    return 'WAIT' if pending_owned(rows, known) else 'RESOLVED'


def canonical_executable(value):
    p = Path(value) if '/' in value else Path(shutil.which(value) or '/__unresolved_python__')
    return str(p.resolve())


def normalize_parent_tail(tokens, root):
    # Exact trailing grammar: wrapper interpreter driver phase label --authorization path ...
    if len(tokens) < 7 or tokens[5] != '--authorization':
        raise ValueError('EXACT_PARENT_COMMAND_REQUIRED')
    out = list(tokens)
    for index in [0, 2, 6]:
        p = Path(out[index]); out[index] = str((p if p.is_absolute() else root / p).resolve())
    out[1] = canonical_executable(out[1])
    return out


def parent_command_matches(actual, expected, root, interpreter):
    try:
        return (len(actual) == len(expected) + 1
                and canonical_executable(actual[0]) == canonical_executable(interpreter)
                and normalize_parent_tail(actual[1:], root) == normalize_parent_tail(expected, root))
    except (ValueError, IndexError):
        return False


def matching_descriptor(output, pid, dev, ino, lock_path):
    """Bind fields on the SAME actual parent's numeric descriptor, not unrelated lsof rows."""
    records, current, owner = [], None, None
    for line in output.splitlines():
        if not line:
            continue
        key, value = line[0], line[1:]
        if key == 'p':
            owner = int(value)
        elif key == 'f':
            if current is not None:
                records.append(current)
            current = {'pid': owner, 'f': value}
        elif current is not None:
            current[key] = value
    if current is not None:
        records.append(current)
    for record in records:
        try:
            device = int(record['D'], 16)
            descriptor = re.fullmatch(r'(\d+)[a-z]*', record['f'])
            if (record['pid'] == pid and descriptor and device == dev
                    and int(record['i']) == ino and Path(record['n']).resolve() == lock_path.resolve()):
                return {'pid': pid, 'fd': int(descriptor[1]), 'device': device, 'inode': ino,
                        'kernelLockField': record.get('l')}
        except (KeyError, ValueError):
            continue
    raise ValueError('PARENT_SAME_FD_DEVICE_INODE_UNPROVEN')


class ParentLock:
    def __init__(self, root, wrapper, immutable_hash, expected_tail, interpreter):
        self.root, self.wrapper = root, wrapper
        self.immutable_hash, self.expected_tail = immutable_hash, expected_tail
        self.interpreter = interpreter
        self.parent = os.getppid()
        self.start = pid_text(self.parent, 'lstart')
        if not self.start:
            raise ValueError('PARENT_START_UNPROVEN')
        self.initial = None

    def verify(self):
        if os.getppid() != self.parent or pid_text(self.parent, 'lstart') != self.start:
            raise ValueError('LOCK_PARENT_LOST_OR_REUSED')
        actual = shlex.split(pid_text(self.parent, 'command') or '')
        if not parent_command_matches(actual, self.expected_tail, self.root, self.interpreter):
            raise ValueError('EXACT_PARENT_COMMAND_REQUIRED')
        if file_state(self.wrapper)['sha256'] != self.immutable_hash:
            raise ValueError('IMMUTABLE_WRAPPER_CHANGED')
        lock = safe_path(self.root, self.wrapper.with_name('gradle.lock'))
        info = lock.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('REGULAR_LOCK_REQUIRED')
        output = capture(['/usr/sbin/lsof', '-nP', '-a', '-p', str(self.parent),
                          '-F', 'pfnDil', '--', str(lock)])
        descriptor = matching_descriptor(output, self.parent, info.st_dev, info.st_ino, lock)
        fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise ValueError('LOCK_INODE_CHANGED')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                if error.errno not in (errno.EAGAIN, errno.EACCES):
                    raise
            else:
                fcntl.flock(fd, fcntl.LOCK_UN)
                raise ValueError('KERNEL_LOCK_DENIAL_ABSENT')
        finally:
            os.close(fd)
        if (pid_text(self.parent, 'lstart') != self.start or os.getppid() != self.parent
                or shlex.split(pid_text(self.parent, 'command') or '') != actual
                or file_state(self.wrapper)['sha256'] != self.immutable_hash
                or (lock.lstat().st_dev, lock.lstat().st_ino) != (info.st_dev, info.st_ino)):
            raise ValueError('PARENT_LOCK_CHANGED_DURING_BIND')
        bound = {'pid': self.parent, 'start': self.start, 'argvSha256': sha(json.dumps(actual).encode()),
                 'fd': descriptor['fd'], 'device': info.st_dev, 'inode': info.st_ino,
                 'wrapperSha256': self.immutable_hash, 'kernelDenial': True}
        if self.initial is not None and bound != self.initial:
            raise ValueError('PARENT_LOCK_BINDING_CHANGED')
        self.initial = bound
        return bound


class Recorder:
    """Sticky observation errors cannot prevent ownership drain or independent restore attempts."""
    def __init__(self, folder, receipt):
        self.folder, self.receipt = folder, receipt

    def error(self, code):
        self.receipt['errors'].append(code)

    def emit(self, phase, **values):
        self.receipt['events'].append({'phase': phase, 'atUtc': utc(), **values})
        temporary = self.folder / ('receipt-' + str(time.monotonic_ns()) + '.tmp')
        try:
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                with os.fdopen(fd, 'wb', closefd=False) as stream:
                    stream.write((json.dumps(self.receipt, indent=2) + '\n').encode())
                    stream.flush(); os.fsync(fd)
                os.replace(temporary, self.folder / 'receipt.json')
            finally:
                os.close(fd)
        except BaseException:
            self.error('RECEIPT_PERSISTENCE_FAILED')

    def nap(self):
        try:
            time.sleep(5)
        except BaseException:
            self.error('DEFERRED_WAIT_INTERRUPT')

    def hold(self, reason, lock):
        self.error(reason)
        while True:
            # No source/native mutation or automatic retry/release in this disposition.
            try:
                bound = lock.verify()
                self.emit('HELD_LOCK_FAILURE_REQUIRES_ROOT_RECOVERY', reason=reason, lock=bound)
            except BaseException:
                self.emit('LOCK_UNPROVEN_FAILURE_REQUIRES_ROOT_RECOVERY', reason=reason)
            self.nap()


class OwnedNative:
    def __init__(self, lock, recorder):
        self.lock, self.recorder = lock, recorder
        self.child, self.known, self.child_start = None, {}, None
        self.closed = True

    def update(self, rows):
        keys = owned_census_keys(rows, self.known, self.child.pid, os.getpid())
        # Preserve EVERY census-proven key before executable observations can fail.
        for pid, start in sorted(keys):
            self.known[(pid, start)] = classify_owned(rows[pid], self.known.get((pid, start)), None, None)
            if pid == self.child.pid and rows[pid]['ppid'] == os.getpid():
                if self.child_start not in (None, start):
                    self.recorder.error('CHILD_PID_START_CHANGED')
                self.child_start = self.child_start or start
        for pid, start in sorted(keys):
            comm, checked, failed = None, None, False
            try:
                comm = pid_text(pid, 'comm'); checked = pid_text(pid, 'lstart')
            except BaseException:
                failed = True
            self.known[(pid, start)] = classify_owned(rows[pid], self.known[(pid, start)], comm, checked, failed)
            if self.known[(pid, start)]['identityObservation'] != 'MATCHED':
                self.recorder.error('OWNED_IDENTITY_OBSERVATION_GAP')

    def drain(self):
        """Never unwind with actual child, observed JAVA or unresolved UNKNOWN still pending."""
        if self.child is None or self.closed:
            return
        while True:
            try:
                rows = table()
                self.update(rows)
                self.lock.verify()
                terminal = self.child.poll() is not None
                # Initial identity absence is observation uncertainty, never positive closure.
                if self.child_start is None:
                    self.recorder.emit('INITIAL_CHILD_IDENTITY_UNPROVEN_STILL_HOLDING')
                    self.recorder.nap(); continue
                if ownership_drain_decision(rows, self.known, terminal) == 'RESOLVED':
                    self.closed = True
                    self.recorder.emit('OWNED_NATIVE_CLOSED', pid=self.child.pid, start=self.child_start,
                        exit=self.child.returncode, identities=list(self.known.values()),
                        terminalProof=[{'pid': pid, 'start': start,
                            'proof': 'PID_ABSENT' if pid not in rows else
                                     'DIFFERENT_START' if rows[pid]['start'] != start else 'RELIABLE_NON_JAVA'}
                            for pid, start in self.known])
                    return
                self.recorder.emit('OWNED_NATIVE_DRAIN_WAIT', pid=self.child.pid,
                    pending=[{'pid': p['pid'], 'start': p['start']} for p in pending_owned(rows, self.known)])
                try:
                    self.child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
                except BaseException:
                    self.recorder.error('OWNED_WAIT_INTERRUPTED')
                self.recorder.nap()
            except BaseException:
                self.recorder.error('OWNERSHIP_OR_LOCK_OBSERVATION_GAP')
                self.recorder.emit('OBSERVATION_UNAVAILABLE_STILL_HOLDING_LOCK')
                self.recorder.nap()

    def run(self, command, cwd, env, log, phase):
        self.drain()
        self.lock.verify()
        self.child, self.known, self.child_start = None, {}, None
        self.closed = True
        output = None
        try:
            output = log.open('xb')
            self.child = subprocess.Popen(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
            self.closed = False
            self.recorder.emit('OWNED_NATIVE_STARTED', phaseName=phase, pid=self.child.pid, command=command)
            self.drain()
            return self.child.returncode
        finally:
            # Even signal, log/receipt IO, census/identity or wait errors cannot bypass drain.
            self.drain()
            if output is not None:
                try:
                    output.close()
                except BaseException:
                    self.recorder.error('NATIVE_LOG_CLOSE_FAILED')


class Journal:
    """This exact unit only: atomic same-directory writes, owned inode journal and independent restores."""
    def __init__(self, root, folder, changes, recorder, boundary):
        self.root, self.folder, self.recorder, self.boundary = root, folder, recorder, boundary
        self.entries = []
        for index, (name, candidate) in enumerate(changes.items()):
            target = safe_path(root, name)
            original = file_state(target)
            entry = {'path': name, 'original': original, 'candidate': candidate,
                     'candidateSha256': sha(candidate), 'mode': original['mode'] if original else 0o644,
                     'stagedIdentity': None, 'temp': None, 'restoreIdentity': None}
            self.entries.append(entry)
            if original is not None:
                backup = folder / ('original-' + str(index) + '.private')
                fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(original['bytes']); stream.flush(); os.fsync(stream.fileno())
                entry['backupPath'] = str(backup.relative_to(root))
                if sha(backup.read_bytes()) != original['sha256']:
                    raise ValueError('JOURNAL_BACKUP_NOT_EXACT')
        self.record('JOURNAL_BOUND_BEFORE_SOURCE_WRITES')

    def record(self, phase):
        def public(value):
            if isinstance(value, dict):
                return {k: public(v) for k, v in value.items() if k != 'bytes'}
            return value
        summary = []
        for e in self.entries:
            summary.append({k: public(v) for k, v in e.items() if k not in ['candidate', 'original']}
                           | {'original': None if e['original'] is None else
                              {k: v for k, v in e['original'].items() if k != 'bytes'}})
        self.recorder.receipt['journal'] = summary
        self.recorder.emit(phase)

    def cleanup_temp(self, entry):
        temp = entry.get('temp')
        if temp is None:
            return
        try:
            p = safe_path(self.root, temp['path'])
            info = p.lstat()
            if (info.st_dev, info.st_ino) == (temp['dev'], temp['ino']) and stat.S_ISREG(info.st_mode):
                p.unlink()
            else:
                self.recorder.error('UNEXPECTED_TEMP_IDENTITY_PRESERVED')
        except FileNotFoundError:
            pass
        except BaseException:
            self.recorder.error('OWNED_TEMP_CLEANUP_FAILED')

    def atomic_replace(self, entry, data, mode, restoring=False):
        self.boundary()
        target = safe_path(self.root, entry['path'])
        temp = target.with_name('.' + target.name + '.obs011-' + str(time.monotonic_ns()) + '.tmp')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        info = os.fstat(fd)
        entry['temp'] = {'path': str(temp.relative_to(self.root)), 'dev': info.st_dev, 'ino': info.st_ino}
        try:
            self.record('RESTORE_TEMP_OWNED' if restoring else 'STAGE_TEMP_OWNED')
            with os.fdopen(fd, 'wb', closefd=False) as stream:
                written = stream.write(data)
                if written != len(data):
                    raise OSError('SHORT_WRITE')
                stream.flush(); os.fchmod(fd, mode); os.fsync(fd)
            current = file_state(target)
            expected = entry['stagedIdentity'] if restoring else entry['original']
            if not same_state(current, expected):
                raise ValueError('UNEXPECTED_SOURCE_EDIT_PRESERVED')
            ready = file_state(temp)
            if ready['sha256'] != sha(data) or ready['mode'] != mode:
                raise ValueError('TEMP_BYTES_MODE_INCOMPLETE')
            identity_key = 'restoreIdentity' if restoring else 'stagedIdentity'
            entry[identity_key] = ready
            self.record('RESTORE_RENAME_INTENT' if restoring else 'STAGE_RENAME_INTENT')
            self.boundary()
            if not same_state(file_state(target), expected):
                raise ValueError('UNEXPECTED_SOURCE_EDIT_PRESERVED')
            os.replace(temp, target)
            parent_fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
            if not same_state(file_state(target), ready):
                raise ValueError('ATOMIC_RENAME_NOT_EXACT')
            entry['temp'] = None
            self.record('RESTORED_ATOMIC' if restoring else 'STAGED_ATOMIC')
        finally:
            os.close(fd)
            self.cleanup_temp(entry)

    def stage(self):
        for entry in self.entries:
            self.atomic_replace(entry, entry['candidate'], entry['mode'])
            if self.recorder.receipt['errors']:
                raise ValueError('STICKY_STAGE_OR_PERSISTENCE_FAILURE')

    def originals_match(self):
        return all(same_state(file_state(safe_path(self.root, e['path'])), e['original'], identity=False)
                   for e in self.entries)

    def restore(self):
        results = []
        for entry in self.entries:
            result = {'path': entry['path'], 'restored': False}
            try:
                self.boundary()
                target = safe_path(self.root, entry['path'])
                current = file_state(target)
                original = entry['original']
                # Never-staged original or already atomically restored, including bytes+mode.
                if same_state(current, original) or (entry['restoreIdentity'] is not None
                        and same_state(current, entry['restoreIdentity'])
                        and same_state(current, original, identity=False)):
                    result['restored'] = True
                elif not same_state(current, entry['stagedIdentity']):
                    raise ValueError('UNEXPECTED_SOURCE_EDIT_PRESERVED')
                elif original is None:
                    self.boundary()
                    if not same_state(file_state(target), entry['stagedIdentity']):
                        raise ValueError('UNEXPECTED_NEW_FILE_EDIT_PRESERVED')
                    target.unlink()  # Only journal-owned new inode, exact bytes and mode.
                    result['restored'] = file_state(target) is None
                else:
                    self.atomic_replace(entry, original['bytes'], original['mode'], restoring=True)
                    result['restored'] = same_state(file_state(target), original, identity=False)
                self.cleanup_temp(entry)
                result['bytesAndModeMatch'] = same_state(file_state(target), original, identity=False)
                result['restored'] = result['restored'] and result['bytesAndModeMatch']
            except BaseException as error:
                result['failureCode'] = type(error).__name__
                self.recorder.error('SOURCE_RESTORE_INCOMPLETE:' + entry['path'])
                self.cleanup_temp(entry)
            results.append(result)
            # A persistence error cannot stop remaining independent restoration attempts.
            self.recorder.receipt['sourceRestore'] = results
            self.recorder.emit('INDEPENDENT_SOURCE_RESTORE_ATTEMPT', **result)
        return bool(results) and all(item['restored'] for item in results)


def finalized_keep_allowed(phase, explicit_keep, runs, proof_matches, errors, interrupted):
    return (phase == 'freeze' and explicit_keep and len(runs) == 3
            and [r.get('suffix') for r in runs] == ['b01', 'b02', 'b03']
            and all(r.get('validatedComplete') is True for r in runs)
            and proof_matches and not errors and not interrupted)

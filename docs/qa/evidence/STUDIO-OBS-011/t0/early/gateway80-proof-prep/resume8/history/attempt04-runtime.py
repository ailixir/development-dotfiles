"""Inactive Gateway local-runner implementation. Installed only by later root scope.

All external effects use the existing os/fcntl/Popen/ps/lsof/git workflow.
No strong executable-object or high-resolution identity mechanism is provided.
"""
import ast
import collections
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import time
import types

PROTOCOL = 'GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1'
STATUS = 'TERMINAL_LOCAL_RUNNER_REPORT_ONLY'
DISPOSITION = 'LOCAL_TEST_RESULT_WITH_SAMPLED_OBSERVATIONS'
LABEL = 'obs009-gateway80-offtree04-20261019'
PHASES = ('prepare', 'red', 'install-fixed', 'green', 'archive')
GUARANTEE_NAMES = ('strongExecutableObjectIdentityProved', 'kernelMainMappedVnodeEqualityProved',
    'highResolutionProcessIdentityProved', 'launchTimeExecutableObjectBound',
    'completeIntervalHistoryProved', 'exhaustiveDescendantDiscoveryProved',
    'adversarialReplacementRaceExcluded', 'globalQuietProved',
    'legacyOrdinaryGateSatisfied', 'intervalCaptureClaimed')
UNSUPPORTED_NAMES = ('kernelStartSeconds', 'kernelStartMicroseconds', 'kernelMainExecutableObject',
    'mainMappedObjectEquality', 'launchTimeObjectBinding', 'strongPlatformCertificateSha256')
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
STATIC = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6'
PACKAGE = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8'
E = R / ('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/' + LABEL)
W = Path('/private/tmp') / LABEL
CORE_PATH = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
CORE_SHA = 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
BASELINE_PATH = 'docs/qa/evidence/STUDIO-OBS-011/t0/early/diag-start1-harness/resume2/preexisting-baseline.json'
BASELINE_SHA = 'fd39b45fd27689034742d5a3205461e9aa4a316baa810f8488216f8f49b7101a'
PREDECESSORS = {'prepare': (), 'red': ('prepare',), 'install-fixed': ('red',),
                'green': ('install-fixed',), 'archive': ('green',)}


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def digest(raw):
    require(type(raw) is bytes, 'BYTE_BUFFER_REQUIRED')
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def claim(**values):
    return {'protocol': PROTOCOL, 'claimSet': DISPOSITION,
            'guarantees': {name: False for name in GUARANTEE_NAMES},
            'historicalIdentityUncertainty': True,
            'credit': False, 'C8': False, 'cleanupAuthorized': False, 'sourceWrites': [],
            'unsupportedEvidence': {name: {'value': None, 'reason': 'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'}
                                    for name in UNSUPPORTED_NAMES}, **values}


def validate_claim(value):
    require(value.get('protocol') == PROTOCOL and value.get('claimSet') == DISPOSITION, 'LOCAL_PROFILE_REQUIRED')
    flags = value.get('guarantees')
    require(type(flags) is dict and set(flags) == set(GUARANTEE_NAMES)
            and all(flags[n] is False for n in GUARANTEE_NAMES), 'TEN_LITERAL_FALSE_GUARANTEES_REQUIRED')
    require(value.get('historicalIdentityUncertainty') is True, 'HISTORY_MUST_REMAIN_UNCERTAIN')
    require(value.get('credit') is False and value.get('C8') is False and value.get('cleanupAuthorized') is False
            and value.get('sourceWrites') == [], 'LOCAL_PROFILE_CANNOT_GRANT_SOURCE_CLEANUP_OR_CREDIT')
    unsupported = value.get('unsupportedEvidence')
    require(type(unsupported) is dict and set(unsupported) == set(UNSUPPORTED_NAMES), 'UNSUPPORTED_FIELDS_REQUIRED')
    require(all(type(unsupported[n]) is dict and unsupported[n].get('value') is None
                and unsupported[n].get('reason') == 'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'
                for n in UNSUPPORTED_NAMES), 'UNSUPPORTED_FIELDS_CANNOT_BECOME_PROOF')


def sha_pin(value):
    require(type(value) is str and len(value) == 64 and set(value) <= set('0123456789abcdef'), 'EXTERNAL_RAW_SHA_REQUIRED')
    return value


def safe_relative(name):
    require(type(name) is str and name and not name.startswith('/') and '\\' not in name
            and '..' not in PurePosixPath(name).parts and str(PurePosixPath(name)) == name,
            'CANONICAL_RELATIVE_PATH_REQUIRED')
    return name


class Ownership:
    """Register before fstat, construction validation or subsequent acquisition.

    Failed/unknown closes are never retried. Actual handles remain strongly held.
    """
    def __init__(self):
        self.tokens = []
        self.children = []
        self.waited = {}
        self.utility = []

    def acquire(self, kind, handle, closer):
        token = {'token': len(self.tokens) + 1, 'kind': kind, 'handle': handle,
                 'closer': closer, 'closeState': 'NOT_ATTEMPTED', 'closed': False}
        self.tokens.append(token)
        return token

    def close(self, token):
        require(type(token.get('token')) is int and 0 < token['token'] <= len(self.tokens)
                and self.tokens[token['token'] - 1] is token and token['closeState'] == 'NOT_ATTEMPTED',
                'CLOSE_RETRY_OR_FOREIGN_TOKEN')
        token['closeState'] = 'UNKNOWN'
        try:
            token['closer'](token['handle'])
        except BaseException as exc:
            token['failureClass'] = type(exc).__name__
            raise ValueError('OWNED_CLOSE_UNKNOWN') from None
        token.update(closeState='CONFIRMED', closed=True)

    def finish(self):
        failures = False
        for token in reversed(self.tokens):
            if token['closeState'] == 'NOT_ATTEMPTED':
                try:
                    self.close(token)
                except BaseException:
                    failures = True
        require(not failures and all(t['closed'] for t in self.tokens), 'OWNED_RESOURCES_RETAINED_UNKNOWN')

    def metadata(self):
        return [{'token': t['token'], 'kind': t['kind'], 'closed': t['closed'],
                 'closeState': t['closeState'], 'failureClass': t.get('failureClass')} for t in self.tokens]


def file_key(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_size, info.st_mtime_ns)


class Files:
    """Absolute no-follow FD custody. No symlink alias or bare-FD retry fallback."""
    def __init__(self, owner):
        self.owner = owner
        self.directory_pins = {}

    def open(self, path, flags, mode=0o600, parent=None):
        fd = os.open(path, flags, mode, dir_fd=parent)
        return self.owner.acquire('FD', fd, os.close)

    def parent(self, path):
        path = Path(path)
        require(path.is_absolute() and '..' not in path.parts and len(path.parts) <= 64, 'ABSOLUTE_CUSTODY_PATH')
        token = self.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        current = Path('/')
        for part in path.parts[1:-1]:
            previous = token
            token = self.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, parent=previous['handle'])
            require(stat.S_ISDIR(os.fstat(token['handle']).st_mode), 'CUSTODY_PARENT_NOT_DIRECTORY')
            current = current / part
            if str(current) in self.directory_pins:
                info = os.fstat(token['handle'])
                actual = {'dev': info.st_dev, 'ino': info.st_ino, 'uid': info.st_uid,
                          'mode': stat.S_IMODE(info.st_mode)}
                require(actual == self.directory_pins[str(current)], 'RETAINED_PARENT_FD_CUSTODY_CHANGED')
            self.owner.close(previous)
        return token

    def info(self, path):
        parent = self.parent(path)
        try:
            return os.stat(Path(path).name, dir_fd=parent['handle'], follow_symlinks=False)
        finally:
            self.owner.close(parent)

    def absent(self, path):
        try:
            self.info(path)
        except FileNotFoundError:
            return True
        return False

    def read(self, path, maximum=16 * 1024 * 1024):
        parent = self.parent(path)
        token = self.open(Path(path).name, os.O_RDONLY | os.O_NOFOLLOW, parent=parent['handle'])
        fd = token['handle']
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and 0 <= before.st_size <= maximum, 'READ_TYPE_OR_CAP')
        chunks, used = [], 0
        while used < before.st_size:
            remaining = min(65536, before.st_size - used, maximum - used)
            require(remaining > 0, 'READ_CAP_BEFORE_READ')
            chunk = os.read(fd, remaining)
            require(type(chunk) is bytes and 0 < len(chunk) <= remaining, 'SHORT_OR_OVERSIZE_READ')
            used += len(chunk)
            chunks.append(chunk)
        after = os.fstat(fd)
        named = os.stat(Path(path).name, dir_fd=parent['handle'], follow_symlinks=False)
        require(file_key(before) == file_key(after) == file_key(named), 'READ_OBJECT_OR_SIZE_CHANGED')
        self.owner.close(token)
        self.owner.close(parent)
        return b''.join(chunks)

    def verified(self, path, expected, maximum=16 * 1024 * 1024):
        sha_pin(expected)
        raw = self.read(path, maximum)
        require(digest(raw) == expected, 'VERIFIED_BUFFER_MISMATCH_BEFORE_INTERPRETATION')
        return raw

    def mkdir(self, path, mode=0o700):
        parent = self.parent(path)
        os.mkdir(Path(path).name, 0o700, dir_fd=parent['handle'])
        token = self.open(Path(path).name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, parent=parent['handle'])
        os.fchmod(token['handle'], mode)
        info = os.fstat(token['handle'])
        require(stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode) == mode
                and info.st_uid == os.getuid(), 'NEW_DIRECTORY_IDENTITY_MODE')
        self.directory_pins[str(path)] = {'dev': info.st_dev, 'ino': info.st_ino, 'uid': info.st_uid, 'mode': mode}
        self.owner.close(token)
        self.owner.close(parent)
        return info

    def create(self, path, mode=0o600, append=False):
        parent = self.parent(path)
        token = self.open(Path(path).name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
                          | (os.O_APPEND if append else 0), mode, parent['handle'])
        os.fchmod(token['handle'], mode)
        info = os.fstat(token['handle'])
        require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == mode
                and info.st_uid == os.getuid(), 'EXCLUSIVE_FILE_MODE_OWNER')
        self.owner.close(parent)
        return token

    def write_fd(self, token, raw):
        require(type(raw) is bytes and token['closeState'] == 'NOT_ATTEMPTED', 'WRITE_LIVE_OWNED_FD')
        offset = 0
        while offset < len(raw):
            count = os.write(token['handle'], raw[offset:])
            require(type(count) is int and 0 < count <= len(raw) - offset, 'WRITE_SHORT_OR_INVALID_COUNT')
            offset += count

    def write(self, path, raw, mode=0o600):
        require(len(raw) <= 16 * 1024 * 1024, 'WRITE_BUFFER_CAP')
        token = self.create(path, mode)
        self.write_fd(token, raw)
        os.fsync(token['handle'])
        require(os.fstat(token['handle']).st_size == len(raw), 'WRITE_SIZE_MISMATCH')
        self.owner.close(token)
        return digest(raw)

    def copy(self, source, destination, mode, budget, expected=None):
        budget.reserve_entry()
        if expected is not None:
            budget.check_file(expected['bytes'])
        parent = self.parent(source)
        token = self.open(Path(source).name, os.O_RDONLY | os.O_NOFOLLOW, parent=parent['handle'])
        before = os.fstat(token['handle'])
        require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == mode, 'COPY_SOURCE_TYPE_MODE')
        budget.check_file(before.st_size)
        if expected is not None:
            require((before.st_dev, before.st_ino, before.st_size, before.st_uid)
                    == (expected['dev'], expected['ino'], expected['bytes'], expected['uid']), 'COPY_INVENTORY_DRIFT_BEFORE_STREAM')
        out = self.create(destination, mode)
        used = 0
        hashed = hashlib.sha256()
        while used < before.st_size:
            current = os.fstat(token['handle'])
            require(file_key(current) == file_key(before), 'COPY_SOURCE_GROWTH_BEFORE_READ')
            amount = min(65536, before.st_size - used, budget.remaining)
            require(amount > 0, 'COPY_CAP_BEFORE_READ')
            raw = os.read(token['handle'], amount)
            require(type(raw) is bytes and 0 < len(raw) <= amount, 'COPY_ACTUAL_READ_COUNT')
            budget.consume(len(raw))
            require(file_key(os.fstat(token['handle'])) == file_key(before), 'COPY_SOURCE_GROWTH_BEFORE_WRITE')
            self.write_fd(out, raw)
            hashed.update(raw)
            used += len(raw)
        require(file_key(os.fstat(token['handle'])) == file_key(before)
                == file_key(os.stat(Path(source).name, dir_fd=parent['handle'], follow_symlinks=False)),
                'COPY_SOURCE_CHANGED_AFTER_STREAM')
        os.fsync(out['handle'])
        after = os.fstat(out['handle'])
        require(after.st_size == used == before.st_size and stat.S_IMODE(after.st_mode) == mode,
                'COPY_TARGET_SIZE_OR_MODE')
        self.owner.close(out)
        self.owner.close(token)
        self.owner.close(parent)
        require(digest(self.read(destination, budget.file_limit)) == hashed.hexdigest(), 'COPY_TARGET_BYTES')
        return {'bytes': used, 'sha256': hashed.hexdigest(), 'mode': mode}


class Budget:
    def __init__(self, entries=8192, total=512 * 1024 * 1024, per_file=128 * 1024 * 1024):
        self.entries = entries
        self.remaining = total
        self.file_limit = per_file

    def reserve_entry(self):
        require(self.entries > 0, 'ENTRY_CAP_BEFORE_ACQUISITION')
        self.entries -= 1

    def check_file(self, size):
        require(type(size) is int and 0 <= size <= self.file_limit and size <= self.remaining,
                'FILE_OR_AGGREGATE_CAP_BEFORE_COPY')

    def consume(self, size):
        require(type(size) is int and 0 <= size <= self.remaining, 'ACTUAL_AGGREGATE_CAP')
        self.remaining -= size


class Ledger:
    def __init__(self, fs, path, records=131072, size=67108864):
        self.fs = fs
        self.token = fs.create(path, 0o600, append=True)
        self.path = path
        self.sequence = 0
        self.bytes = 0
        self.previous = '0' * 64
        self.hashed = hashlib.sha256()
        self.max_records, self.max_bytes = records, size
        self.closed = False

    def append(self, kind, value):
        require(not self.closed and self.sequence < self.max_records, 'LEDGER_RECORD_CAP_OR_CLOSED')
        raw = encoded({'sequence': self.sequence + 1, 'previousSha256': self.previous,
                       'kind': kind, 'value': value})
        require(self.bytes + len(raw) <= self.max_bytes, 'LEDGER_BYTE_CAP_BEFORE_APPEND')
        self.fs.write_fd(self.token, raw)
        os.fsync(self.token['handle'])
        self.sequence += 1
        self.bytes += len(raw)
        self.previous = digest(raw)
        self.hashed.update(raw)
        return self.sequence

    def freeze(self):
        require(not self.closed, 'LEDGER_ALREADY_CLOSED')
        require(os.fstat(self.token['handle']).st_size == self.bytes, 'LEDGER_SIZE_DRIFT')
        self.fs.owner.close(self.token)
        self.closed = True
        return {'path': self.path.name, 'sha256': self.hashed.hexdigest(), 'bytes': self.bytes,
                'firstSequence': 1 if self.sequence else None, 'lastSequence': self.sequence,
                'mode': 0o600, 'appendOnly': True}


class PendingHolder:
    def __init__(self, proposal, proposal_sha):
        require(proposal.get('label') == LABEL and proposal.get('authorized') is False
                and proposal.get('maximumCaptures') == 1 and type(proposal['maximumCaptures']) is int,
                'PENDING_PROPOSAL_SCOPE')
        require(proposal.get('baselinePath') == BASELINE_PATH and proposal.get('baselineSha256') == BASELINE_SHA,
                'ORIGINAL_INHERITED_BASELINE_METADATA_REQUIRED')
        holder_fields(proposal)
        self.value = claim(**{key: proposal[key] for key in ('label', 'wrapper', 'shell', 'lock', 'baselinePath', 'baselineSha256')})
        self.value.update(proposalSha256=sha_pin(proposal_sha), protocol=PROTOCOL)
        self.raw = encoded(self.value)
        self.sha256 = digest(self.raw)
        self.physical = False

    def get(self):
        require(digest(self.raw) == self.sha256 and json.loads(self.raw) == self.value, 'PENDING_BUFFER_CHANGED')
        return self.value


def scoped_text(ctx, pid, column):
    require(type(pid) is int and pid > 0, 'STRICT_POSITIVE_SCOPED_PID_REQUIRED')
    require(column in ('lstart', 'command', 'ppid', 'uid', 'comm'), 'SCOPED_COLUMN')
    raw = ctx.observe(['/bin/ps', '-ww', '-p', str(pid), '-o', column + '='], absence=True)
    return raw.strip() or None


def qualify_controller_lock(ctx, holder, postclose=False):
    H = holder.get() if isinstance(holder, PendingHolder) else holder
    for role in ('wrapper', 'shell'):
        old = H[role]
        now = scoped_text(ctx, old['pid'], 'lstart')
        if postclose:
            require(now is None or now != old['start'], 'ORIGINAL_CONTROLLER_STILL_OBSERVED')
            continue
        require(now == old['start'] and digest((scoped_text(ctx, old['pid'], 'command') or '').encode()) == old['argvHash'],
                'CONTROLLER_LEGACY_FACT_CHANGED')
        require(scoped_text(ctx, old['pid'], 'uid') == str(old['uid']), 'CONTROLLER_UID_CHANGED')
    if not postclose:
        require(os.getppid() == H['shell']['pid']
                and scoped_text(ctx, H['shell']['pid'], 'ppid') == str(H['wrapper']['pid']), 'DIRECT_HELD_PARENT_REQUIRED')
        require(scoped_text(ctx, os.getpid(), 'ppid') == str(H['shell']['pid']), 'CURRENT_CLIENT_PARENT_UNPROVED')
        ctx.client.update(legacyStart=scoped_text(ctx, os.getpid(), 'lstart'),
                          observedArgvSha256=digest((scoped_text(ctx, os.getpid(), 'command') or '').encode()))
        require(ctx.client['legacyStart'], 'CURRENT_CLIENT_START_UNAVAILABLE')
    else:
        ctx.client.update(legacyStart=scoped_text(ctx, os.getpid(), 'lstart'),
                          observedArgvSha256=digest((scoped_text(ctx, os.getpid(), 'command') or '').encode()))
        require(ctx.client['legacyStart'] and scoped_text(ctx, os.getpid(), 'ppid') == str(os.getppid()),
                'OUTER_OBSERVER_SAMPLE_UNAVAILABLE')
    lock = Path(H['lock']['path'])
    require(lock == R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock', 'LOCK_PATH_SCOPE')
    parent = ctx.fs.parent(lock)
    token = ctx.fs.open(lock.name, os.O_RDWR | os.O_NOFOLLOW, parent=parent['handle'])
    info = os.fstat(token['handle'])
    require(stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == (H['lock']['dev'], H['lock']['ino']), 'LOCK_OBJECT_CHANGED')
    if not postclose:
        ctx.legacy.strict_lock_fields(ctx.observe(['/usr/sbin/lsof', '-nP', '-a', '-p', str(H['wrapper']['pid']),
            '-F', 'pfin', '--', str(lock)]), H['wrapper']['pid'], info.st_ino, str(lock))
    acquired = False
    try:
        fcntl.flock(token['handle'], fcntl.LOCK_EX | fcntl.LOCK_NB)
        acquired = True
    except OSError as exc:
        require(not postclose and exc.errno in (errno.EAGAIN, errno.EACCES), 'KERNEL_LOCK_UNKNOWN_OR_NOT_FREE')
    if acquired:
        fcntl.flock(token['handle'], fcntl.LOCK_UN)
        require(postclose, 'KERNEL_LOCK_NOT_HELD')
    ctx.owner.close(token)
    ctx.owner.close(parent)
    return H


def materialized_holder(ctx):
    raw = ctx.fs.verified(E / 'hold.json', ctx.release['holdFileSha256'])
    info = ctx.fs.info(E / 'hold.json')
    require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == os.getuid(), 'PHYSICAL_H_MODE_OWNER')
    holder = json.loads(raw)
    validate_claim(holder)
    holder_fields(holder)
    require(holder['label'] == LABEL and holder['protocol'] == PROTOCOL, 'MATERIALIZED_H_PROFILE')
    return holder


def holder_fields(value):
    for role in ('wrapper', 'shell'):
        row = value[role]
        require(type(row) is dict and type(row.get('pid')) is int and row['pid'] > 0
                and type(row.get('uid')) is int and row['uid'] >= 0
                and type(row.get('start')) is str and bool(row['start']), 'HOLDER_FIELD_TYPES_BEFORE_OBSERVATION')
        sha_pin(row['argvHash'])
    lock = value['lock']
    require(type(lock) is dict and type(lock.get('dev')) is int and lock['dev'] >= 0
            and type(lock.get('ino')) is int and lock['ino'] > 0 and type(lock.get('path')) is str,
            'LOCK_FIELD_TYPES_BEFORE_OBSERVATION')


def no_signal_process(ctx, command, binary_sha, maximum=15, kind='UTILITY'):
    require(type(command) is list and command and all(type(s) is str for s in command)
            and 0 < maximum <= 15, 'UTILITY_REQUEST')
    record = {'kind': kind, 'sequence': len(ctx.owner.utility) + 1, 'client': dict(ctx.client),
              'commandSha256': digest(encoded(command)), 'requestedBinarySha256': sha_pin(binary_sha),
              'childPid': None, 'actualExit': None, 'terminalWaitConfirmed': False,
              'stdoutComplete': False, 'stderrComplete': False, 'classification': 'UNKNOWN_BEFORE_CONSTRUCTION',
              'signalsSent': False, 'strongExecutableObjectIdentityProved': False}
    ctx.owner.utility.append(record)
    attempt = ctx.owner.acquire('CHILD_CONSTRUCTION', None, lambda _: None)
    try:
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except BaseException as exc:
        attempt['closeState'] = 'UNKNOWN'
        record.update(classification='UNKNOWN_CONSTRUCTOR_FAILURE', failureClass=type(exc).__name__)
        raise ValueError('UTILITY_CONSTRUCTOR_UNKNOWN') from None
    ctx.owner.children.append(child)
    ctx.owner.waited[id(child)] = False
    attempt.update(handle=child, closer=lambda h: require(ctx.owner.waited.get(id(h)) is True, 'CHILD_COMPLETION_UNCONFIRMED'))
    pipe_tokens = []
    for attribute in ('stdout', 'stderr'):
        pipe = getattr(child, attribute)
        if pipe is not None:
            pipe_tokens.append(ctx.owner.acquire('CHILD_PIPE', pipe, lambda h: h.close()))
    record['childPid'] = child.pid
    require(type(child.pid) is int and child.pid > 0, 'UTILITY_CHILD_PID_UNAVAILABLE')
    try:
        out, err = child.communicate(timeout=maximum)
    except BaseException as exc:
        attempt['closeState'] = 'UNKNOWN'
        for token in pipe_tokens:
            token['closeState'] = 'RETAINED_CHILD_COMPLETION_UNCONFIRMED'
        record.update(classification='UNKNOWN_COMMUNICATION_OR_TIMEOUT', failureClass=type(exc).__name__,
                      actualExit=child.returncode if type(child.returncode) is int else None)
        for key, attr in (('partialStdout', 'output'), ('partialStderr', 'stderr')):
            partial = getattr(exc, attr, None)
            if type(partial) is str:
                partial = partial.encode()
            record[key] = {'available': type(partial) is bytes,
                           'bytes': len(partial) if type(partial) is bytes else None,
                           'sha256': digest(partial) if type(partial) is bytes else None}
        raise ValueError('UTILITY_COMPLETION_UNKNOWN_NO_SIGNAL') from None
    require(type(out) is bytes and type(err) is bytes and len(out) <= 16 * 1024 * 1024
            and len(err) <= 16 * 1024 * 1024 and type(child.returncode) is int, 'UTILITY_OUTPUT_OR_WAIT_INCOMPLETE')
    record.update(actualExit=child.returncode, terminalWaitConfirmed=True, stdoutComplete=True, stderrComplete=True,
                  stdoutSha256=digest(out), stderrSha256=digest(err), stdoutBytes=len(out), stderrBytes=len(err),
                  classification='DIRECT_HANDLE_WAITED_COMPLETE_OUTPUT')
    ctx.owner.waited[id(child)] = True
    ctx.owner.close(attempt)
    return types.SimpleNamespace(returncode=child.returncode, stdout=out.decode('utf-8', errors='strict'),
                                 stderr=err.decode('utf-8', errors='strict'), record=record)


class Context:
    def __init__(self, buffers, external, manifest_sha, entry, owner=None, fs=None):
        self.owner = owner if owner is not None else Ownership()
        self.fs = fs if fs is not None else Files(self.owner)
        self.buffers, self.external, self.manifest_sha, self.entry = buffers, external, manifest_sha, entry
        self.client = {'pid': os.getpid(), 'ppid': os.getppid(), 'legacyStart': None,
                       'requestedEntryArgvSha256': digest(encoded(list(sys.orig_argv))), 'completionCapturedExternally': False}
        self.control_raw = {}
        self.release = None
        self.ledger = None
        self.events = []
        self.episodes = {}
        self.encounters = []
        self.deadline = None
        self.boundary_failed = False
        self.prior_samples = {}
        self.wrote_e = False
        self.legacy = load_legacy(self)

    def observe(self, command, absence=False):
        binaries = self.external['observationBinaries']
        require(command and command[0] in binaries, 'UNREVIEWED_OBSERVATION_BINARY')
        row = binaries[command[0]]
        self.fs.verified(Path(row['path']), row['sha256'], 128 * 1024 * 1024)
        result = no_signal_process(self, [row['path'], *command[1:]], row['sha256'])
        require(result.stderr == '', 'OBSERVATION_STDERR')
        if absence and result.returncode == 1 and result.stdout == '':
            return ''
        require(result.returncode == 0 and result.stdout.strip(), 'OBSERVATION_FAILED_OR_EMPTY')
        if command[0] == '/bin/ps' and '-axo' in command:
            seen = set()
            lines = result.stdout.splitlines()
            require(0 < len(lines) <= 16384, 'GLOBAL_PS_ROW_CAP')
            markers = {}
            for line in lines:
                words = line.split(None, 7) if command[-1] == 'pid=,ppid=,lstart=,command=' else line.split(None, 1)
                require(len(words) == (8 if command[-1] == 'pid=,ppid=,lstart=,command=' else 2)
                        and words[0].isdigit() and int(words[0]) not in seen, 'GLOBAL_PS_DUPLICATE_OR_PARTIAL')
                seen.add(int(words[0]))
                if len(words) == 8:
                    require(words[1].isdigit(), 'GLOBAL_PS_PARENT_PARSE')
                    if any(text in words[7] for text in (str(W), str(E), 'vitest.gateway80.config.mjs')):
                        markers[int(words[0])] = {'start': ' '.join(words[2:7]), 'argvHash': digest(words[7].encode())}
            if command[-1] == 'pid=,ppid=,lstart=,command=':
                self.last_table_markers = markers
        return result.stdout

    def output(self, name, value):
        safe_relative(name)
        require('/' not in name and name.endswith('.json'), 'OWNED_JSON_OUTPUT_NAME')
        raw = encoded(value)
        self.wrote_e = True
        result = self.fs.write(E / name, raw)
        self.control_raw[name] = raw
        return result

    def control(self, name):
        require(name in self.control_raw, 'FIRST_READ_CONTROL_NOT_IN_ENTRY_MAP')
        return json.loads(self.control_raw[name])

    def start_segment(self, operation):
        require(self.ledger is None, 'SEGMENT_ALREADY_STARTED')
        self.wrote_e = True
        self.ledger = Ledger(self.fs, E / (operation + '.samples.jsonl'))
        return self.ledger

    def event(self, kind, value):
        require(self.ledger is not None, 'NO_SAMPLE_DETAIL_BEFORE_LEDGER')
        sequence = self.ledger.append(kind, value)
        self.events.append({'sequence': sequence, 'kind': kind, 'value': value})
        return sequence

    def finish_segment(self):
        require(self.ledger is not None, 'SEGMENT_NOT_STARTED')
        return self.ledger.freeze()

    def failure(self, reason):
        return claim(status='HOLD', accepted=False, failureCode=reason if re.fullmatch('[A-Z0-9_]+', reason) else 'CONTROL_FAILURE',
                     actualResources=self.owner.metadata(), utilityClientJournals=self.owner.utility,
                     childCompletions=[{'pid': getattr(h, 'pid', None), 'actualExit': getattr(h, 'returncode', None),
                                        'terminalWaitConfirmed': self.owner.waited.get(id(h), False)}
                                       for h in self.owner.children], outputDirectoryWriteAttempted=self.wrote_e)


def load_legacy(ctx):
    """Only selected, exact pinned source definitions; no old main/bootstrap."""
    names = {'directory_fact', 'guard_directory', 'guard_leaf', 'custody_facts', 'owned_write_path',
             'owned_root_identity', 'chart_guard', 'guards', 'workspace_guard', 'ensure_owned_dirs',
             'make_copy', 'archive', 'strict_lock_fields'}
    ns = {'__name__': '_gateway8_static_definitions', 'D': STATIC, 'R': R, 'W': W, 'E': E,
          'SCOPE': json.loads(ctx.buffers['scope.json']), 'Path': Path, 'os': os, 'stat': stat,
          'hashlib': hashlib, 'json': json, 'require': require,
          'utc': lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'CUSTODY_PINS': {}}
    source = ctx.buffers['legacy-driver.py']
    tree = ast.parse(source)
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    require({n.name for n in nodes} == names, 'EXACT_LEGACY_FUNCTION_SELECTION')
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<verified-selected06-definitions>', 'exec'), ns)
    static_map = {str(STATIC / n): raw for n, raw in ctx.buffers.items() if n.startswith('banks/')
                  or n in ('input-manifest.json', 'source-guards.json', 'case-map.json')}
    def read_static_or_control(path):
        if str(path) in static_map:
            return json.loads(static_map[str(path)])
        require(Path(path).parent == E, 'STATIC_OR_BOUND_CONTROL_ONLY')
        return ctx.control(Path(path).name)
    def get_raw(path, expected=None):
        if str(path) in static_map:
            raw = static_map[str(path)]
        else:
            raw = ctx.fs.read(path, 128 * 1024 * 1024)
        if expected is not None:
            require(digest(raw) == expected, 'EXACT_STATIC_BUFFER')
        return raw
    ns.update(read=read_static_or_control, file_hash=lambda p: digest(get_raw(p)),
              inventory=lambda p: inventory(ctx, p),
              safe_mkdir=lambda p, mode=0o700: ctx.fs.mkdir(p, mode),
              safe_new_copy=lambda src, dst, mode=0o644: stage_buffer(ctx, src, dst, mode),
              safe_archive_tree=lambda src, dst: archive_tree(ctx, src, dst),
              anchored_parent=lambda p: ctx.fs.parent(p)['handle'],
              current_verified_bytes=lambda p, h: ctx.fs.verified(p, h),
              retained_bytes=get_raw)
    # Legacy make_copy/symlink helper closes parent bare FD; replace that integration.
    # Other selected functions use fresh overrides above, never unbounded reads/copies.
    return types.SimpleNamespace(**ns)


def inventory(ctx, root):
    root = Path(root)
    entries, budget = [], Budget(entries=32768, total=2 * 1024 * 1024 * 1024)
    for directory, dirs, files in os.walk(root, followlinks=False):
        require(not Path(directory).is_symlink(), 'INVENTORY_LINK_PARENT')
        for name in sorted(dirs + files):
            budget.reserve_entry()
            path = Path(directory) / name
            info = ctx.fs.info(path)
            row = {'path': str(path.relative_to(root)), 'uid': info.st_uid,
                   'mode': stat.S_IMODE(info.st_mode), 'dev': info.st_dev, 'ino': info.st_ino}
            if stat.S_ISLNK(info.st_mode):
                row.update(kind='symlink', target=os.readlink(path))
                if name in dirs:
                    dirs.remove(name)
            elif stat.S_ISDIR(info.st_mode):
                row['kind'] = 'directory'
            elif stat.S_ISREG(info.st_mode):
                budget.check_file(info.st_size)
                raw = ctx.fs.read(path, budget.file_limit)
                budget.consume(len(raw))
                row.update(kind='file', sha256=digest(raw), bytes=len(raw))
            else:
                raise ValueError('INVENTORY_UNSUPPORTED_ENTRY')
            entries.append(row)
    return sorted(entries, key=lambda r: r['path'])


def stage_buffer(ctx, source, target, mode):
    key = str(Path(source).relative_to(STATIC))
    require(key in ctx.buffers and (key.startswith('banks/') or key == 'vitest.gateway80.config.mjs'), 'NATIVE_BANK_SCOPE')
    raw = ctx.buffers[key]
    ctx.fs.write(target, raw, mode)
    require(digest(ctx.fs.read(target)) == digest(raw), 'STAGED_BANK_CHANGED')


def create_workspace(ctx):
    require(ctx.fs.absent(W), 'NEW_WORKSPACE_MUST_BE_ABSENT')
    ctx.fs.mkdir(W)
    for name in ('tmp', 'cache'):
        ctx.fs.mkdir(W / name)
    inputs = json.loads(ctx.buffers['input-manifest.json'])
    created = {W, W / 'tmp', W / 'cache'}
    for row in [*inputs['finiteCopies'], inputs['fixture'], inputs['config']]:
        target = W / safe_relative(row['destination'])
        parents = []
        p = target.parent
        while p != W:
            require(W in p.parents, 'STAGE_DESTINATION_SCOPE')
            parents.append(p)
            p = p.parent
        for p in reversed(parents):
            if p not in created:
                ctx.fs.mkdir(p)
                created.add(p)
        require(digest(ctx.buffers[row['bank']]) == row['sha256'], 'UNCHANGED_NATIVE_BANK_REQUIRED')
        stage_buffer(ctx, STATIC / row['bank'], target, row['mode'])
    target = W / 'repo/studio-runner/node_modules'
    parent = ctx.fs.parent(target)
    os.symlink(ctx.legacy.SCOPE['dependencies'], target.name, dir_fd=parent['handle'])
    ctx.owner.close(parent)
    return {'workspace': ctx.legacy.owned_root_identity(), 'inventory': inventory(ctx, W),
            'directoryPins': {str(p): ctx.legacy.directory_fact(p) for p in created}}


def install_fixed(ctx):
    ctx.legacy.workspace_guard('original')
    inputs = json.loads(ctx.buffers['input-manifest.json'])
    target = W / 'repo/helm-chart/put-checks/templates/_helpers.tpl'
    parent = ctx.fs.parent(target)
    token = ctx.fs.open(target.name, os.O_RDWR | os.O_NOFOLLOW, parent=parent['handle'])
    info = os.fstat(token['handle'])
    require(stat.S_ISREG(info.st_mode) and info.st_size <= 16 * 1024 * 1024, 'INSTALL_TYPE_SIZE')
    old = b''
    while len(old) < info.st_size:
        part = os.read(token['handle'], min(65536, info.st_size - len(old)))
        require(type(part) is bytes and 0 < len(part) <= info.st_size - len(old), 'INSTALL_PREIMAGE_READ')
        old += part
    require(file_key(os.fstat(token['handle'])) == file_key(info)
            and digest(old) == inputs['helperBanks']['original']['sha256'], 'EXACT_ORIGINAL_PREIMAGE')
    raw = ctx.buffers['banks/fixed-helper.tpl']
    require(digest(raw) == inputs['helperBanks']['fixed']['sha256'], 'EXACT_FIXED_BANK')
    os.lseek(token['handle'], 0, os.SEEK_SET)
    ctx.fs.write_fd(token, raw)
    os.ftruncate(token['handle'], len(raw))
    os.fchmod(token['handle'], 0o644)
    os.fsync(token['handle'])
    ctx.owner.close(token)
    ctx.owner.close(parent)
    ctx.legacy.workspace_guard('fixed')


def archive_tree(ctx, source, target):
    require(source in (W, W / 'repo/helm-chart/put-checks') and E in target.parents, 'ARCHIVE_SCOPE')
    before = inventory(ctx, source)
    budget = Budget()
    ctx.fs.mkdir(target)
    pins = {str(target): ctx.legacy.directory_fact(target)}
    for row in sorted(before, key=lambda r: (len(Path(r['path']).parts), r['path'])):
        src, dst = source / safe_relative(row['path']), target / row['path']
        if row['kind'] == 'directory':
            budget.reserve_entry()
            ctx.fs.mkdir(dst, row['mode'])
            pins[str(dst)] = ctx.legacy.directory_fact(dst)
        elif row['kind'] == 'file':
            copied = ctx.fs.copy(src, dst, row['mode'], budget, expected=row)
            require(copied['sha256'] == row['sha256'] and copied['bytes'] == row['bytes'], 'ARCHIVE_INVENTORY_STREAM_DRIFT')
        else:
            budget.reserve_entry()
            require(row['path'] == 'repo/studio-runner/node_modules'
                    and row['target'] == ctx.legacy.SCOPE['dependencies'], 'ONLY_DEPENDENCY_LINK_ENTRY')
            info = ctx.fs.info(src)
            require(stat.S_ISLNK(info.st_mode) and (info.st_dev, info.st_ino) == (row['dev'], row['ino'])
                    and os.readlink(src) == row['target'], 'ARCHIVE_LINK_ENTRY_DRIFT')
            parent = ctx.fs.parent(dst)
            os.symlink(row['target'], dst.name, dir_fd=parent['handle'])
            ctx.owner.close(parent)
    require(inventory(ctx, source) == before, 'ARCHIVE_SOURCE_CHANGED')
    return pins


def load_core(ctx, holder, postclose=False):
    source = ctx.buffers['ownership-core.py']
    require(digest(source) == CORE_SHA, 'IMMUTABLE_CORE_SOURCE_REQUIRED')
    names = {'pid_text', 'table', 'project_role'}
    nodes = [n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name in names]
    require({n.name for n in nodes} == names, 'CORE_SELECTION')
    ns = {'Path': Path, 'sha': digest, 'capture': lambda command, allowed=(0,): ctx.observe(command, absence=1 in allowed)}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<verified-existing-observation-definitions>', 'exec'), ns)
    original_table = ns['table']
    def table_with_current_markers():
        rows = original_table()
        for pid, marker in getattr(ctx, 'last_table_markers', {}).items():
            require(pid in rows and rows[pid]['start'] == marker['start'] and rows[pid]['argvHash'] == marker['argvHash'],
                    'CURRENT_MARKER_ROW_INCONSISTENT')
            rows[pid]['gatewayMarkerCandidate'] = True
        return rows
    ns['table'] = table_with_current_markers
    ns['bounded_capture'] = ns['capture']
    ns['identity'] = lambda row: legacy_identity(ctx, row)
    return ns


def legacy_identity(ctx, row):
    """Existing finite path/text/file samples, explicitly not strong identity."""
    pid = row['pid']
    start = scoped_text(ctx, pid, 'lstart')
    command = scoped_text(ctx, pid, 'command')
    comm = scoped_text(ctx, pid, 'comm')
    if start != row['start'] or not command or not comm:
        return None
    mapped = ctx.observe(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'txt', '-F', 'n'], absence=True)
    paths = {Path(line[1:]).resolve() for line in mapped.splitlines() if line.startswith('n')
             and Path(line[1:]).is_absolute() and Path(line[1:]).name == Path(comm).name}
    if len(paths) != 1:
        return None
    path = paths.pop()
    raw = ctx.fs.read(path, 128 * 1024 * 1024)
    if (scoped_text(ctx, pid, 'lstart') != start or scoped_text(ctx, pid, 'command') != command
            or scoped_text(ctx, pid, 'comm') != comm or digest(command.encode()) != row['argvHash']):
        return None
    return {**row, 'legacySampleComplete': True, 'commHash': digest(comm.encode()),
            'argvHash': digest(command.encode()), 'executableHash': digest(str(path).encode()),
            'executableFileHash': digest(raw), 'strongExecutableObjectIdentityProved': False}


def sample(ctx, C, attributed=(), baseline=()):
    rows = C['table']()
    require(type(rows) is dict and rows and len(rows) <= 16384 and os.getpid() in rows, 'CENSUS_INCOMPLETE')
    observer = rows[os.getpid()]
    require(observer['ppid'] == os.getppid() and observer['start'] == ctx.client['legacyStart']
            and observer['argvHash'] == ctx.client['observedArgvSha256'], 'CURRENT_OBSERVER_CENSUS_UNBOUND')
    raw = ctx.observe(['/bin/ps', '-ww', '-axo', 'pid=,comm='])
    comms = {}
    for line in raw.splitlines():
        pieces = line.split(None, 1)
        require(len(pieces) == 2 and pieces[0].isdigit() and int(pieces[0]) not in comms, 'COMM_CENSUS_INCOMPLETE')
        comms[int(pieces[0])] = pieces[1]
    require(os.getpid() in comms, 'COMM_CLIENT_MISSING')
    require(len([pid for pid, comm in comms.items() if Path(comm).name.lower() == 'node']) <= 64,
            'NODE_CANDIDATE_BOUND')
    inherited = {r['pid']: r for r in baseline}
    attributed = list(attributed)
    relevant = set(inherited) | {r['pid'] for r in attributed}
    relevant |= {pid for pid, row in rows.items() if row.get('projectMarkerCandidate') or row.get('gatewayMarkerCandidate')}
    relevant |= {pid for pid, comm in comms.items() if Path(comm).name.lower() == 'node'}
    # Existing sampled parent relations select candidates, never authenticated edges.
    related = {r['pid'] for r in attributed}
    while True:
        expanded = related | {pid for pid, row in rows.items() if row['ppid'] in related}
        if expanded == related:
            break
        related = expanded
    relevant |= related
    # Preserve prior encounters without claiming a numeric PID is an identity.
    relevant |= {x['pid'] for x in ctx.encounters}
    relevant.discard(os.getpid())
    current = []
    for pid in sorted(relevant):
        row = rows.get(pid)
        encounter = {'encounterId': len(ctx.encounters) + 1, 'pid': pid,
                     'legacyStart': row.get('start') if row else None,
                     'legacyPrecision': 'DISPLAY_SECONDS_WITH_SAME_SECOND_REUSE_AMBIGUITY',
                     'numericPidIsIdentity': False, 'presentInCensus': row is not None,
                     'presentInComm': pid in comms}
        # Durable before any pid-specific identity/detail observation, even failure.
        ctx.event('CANDIDATE_ENCOUNTER_BEFORE_DETAIL', encounter)
        ctx.encounters.append(encounter)
        if row is None and pid not in comms:
            current.append({**encounter, 'state': 'NO_LONGER_OBSERVED_NOT_EXIT_PROOF'})
            continue
        require(row is not None and pid in comms, 'CURRENT_CENSUS_CONTRADICTION')
        key = 'pid-encounter-' + str(pid)
        prior_episode = ctx.episodes.get(key)
        if prior_episode is not None and prior_episode['attempts'] >= 3 and prior_episode.get('unresolved'):
            who = None
        else:
            who = C['identity'](row)
            if who is None:
                if key not in ctx.episodes:
                    failed_at = time.monotonic()
                    ctx.episodes[key] = {'start': failed_at, 'attempts': 0, 'last': failed_at, 'unresolved': True}
                for attempt in range(3):
                    state = ctx.episodes.get(key)
                    if state is not None and state['attempts'] >= 3:
                        break
                    who = episode(ctx, key, lambda: C['identity'](row))
                    ctx.episodes[key]['unresolved'] = who is None
                    if who is not None:
                        break
        if who is not None:
            previous = ctx.prior_samples.get(pid)
            if previous is not None and previous['start'] == who['start']:
                fields = ('argvHash', 'commHash', 'executableHash', 'executableFileHash')
                require(all(previous.get(k) == who.get(k) for k in fields), 'RELEVANT_SAMPLE_CHANGE_OR_COARSE_REUSE_AMBIGUITY')
            ctx.prior_samples[pid] = who
            if any(x['pid'] == pid for x in attributed):
                require(who.get('executableFileHash') == ctx.release['nodeSha256'], 'OBSERVED_DIRECT_RUNNER_FILE_CONTRADICTION')
        ctx.event('CANDIDATE_DETAIL_RESULT', {'encounterId': encounter['encounterId'], 'sample': who})
        old = inherited.get(pid)
        if old is not None:
            fields = ('pid', 'start', 'argvHash', 'commHash', 'executableHash', 'executableFileHash')
            require(who is not None and all(who.get(k) == old.get(k) for k in fields), 'INHERITED_SAMPLE_DRIFT_OR_AMBIGUITY')
            current.append({**encounter, 'state': 'INHERITED_LEGACY_SAMPLE_MATCHED'})
            continue
        if any(x['pid'] == pid for x in attributed) or pid in related:
            # Coarse-time replacement cannot rescue positively attributed live work.
            current.append({**encounter, 'state': 'CURRENT_ATTRIBUTED_WORK_OR_REUSE_AMBIGUITY'})
            continue
        if who is None:
            current.append({**encounter, 'state': 'CURRENT_UNKNOWN'})
            continue
        command = scoped_text(ctx, pid, 'command') or ''
        marker = any(text in command for text in (str(W), str(E), 'vitest.gateway80.config.mjs',
            'tinypool/dist/entry/process.js', 'vitest.mjs', 'GradleDaemon', 'GradleWrapperMain', 'GradleWorkerMain', 'checks-guided-'))
        if marker:
            current.append({**encounter, 'state': 'CURRENT_RELEVANT_UNATTRIBUTED'})
        else:
            cwd_raw = ctx.observe(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'cwd', '-F', 'n'])
            locations = [line[1:] for line in cwd_raw.splitlines() if line.startswith('n')]
            require(len(locations) == 1 and Path(locations[0]).is_absolute(), 'CANDIDATE_CWD_UNAVAILABLE')
            require(scoped_text(ctx, pid, 'lstart') == row['start'], 'CANDIDATE_DETAIL_TORN')
            state = 'CURRENT_RELEVANT_UNATTRIBUTED' if locations[0] == str(W) or locations[0].startswith(str(W) + '/') else 'UNRELATED_SAMPLED_NOT_OWNED'
            current.append({**encounter, 'state': state})
    raw_listeners = ctx.observe(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], absence=True)
    listeners, listening_pid = [], None
    for line in raw_listeners.splitlines():
        if line.startswith('p'):
            require(line[1:].isdigit(), 'LISTENER_PID_PARSE')
            listening_pid = int(line[1:])
        elif line.startswith('n'):
            require(listening_pid is not None and line.rsplit(':', 1)[-1].isdigit(), 'LISTENER_RECORD_PARSE')
            listeners.append({'pid': listening_pid, 'port': int(line.rsplit(':', 1)[-1])})
        else:
            raise ValueError('LISTENER_FIELDS_UNEXPECTED')
    ctx.event('FINITE_LISTENER_SAMPLE_NOT_GLOBAL_QUIET', {'listeners': listeners})
    return {'currentSampleStates': current, 'censusComplete': True, 'commComplete': True, 'listeners': listeners,
            'atMonotonic': time.monotonic(), 'historicalIdentityUncertainty': True}


def episode(ctx, key, observe):
    now = time.monotonic()
    state = ctx.episodes.setdefault(key, {'start': now, 'attempts': 0, 'last': None})
    require(state['attempts'] < 3 and now - state['start'] <= 5
            and (ctx.deadline is None or now < ctx.deadline), 'EPISODE_CAP_OR_DEADLINE')
    if state['last'] is not None:
        delay = 0.25 - (now - state['last'])
        if delay > 0:
            time.sleep(delay)
    now = time.monotonic()
    require(now - state['start'] <= 5 and (ctx.deadline is None or now < ctx.deadline), 'EPISODE_WINDOW_EXPIRED')
    state['attempts'] += 1
    state['last'] = now
    ctx.event('REOBSERVATION_ATTEMPT', {'episode': key, **state})
    return observe()


def boundaries(ctx, C, attributed=(), baseline=()):
    require(not ctx.boundary_failed, 'FAILED_BOUNDARY_CANNOT_BE_RETRIED')
    result = []
    try:
        for index in range(2):
            if index:
                time.sleep(0.25)
            require(ctx.deadline is None or time.monotonic() < ctx.deadline, 'ORIGINAL_ACCEPTANCE_DEADLINE')
            value = sample(ctx, C, attributed, baseline)
            require(value['censusComplete'] is True and value['commComplete'] is True, 'BOUNDARY_INCOMPLETE')
            require(all(row['state'] in ('NO_LONGER_OBSERVED_NOT_EXIT_PROOF', 'INHERITED_LEGACY_SAMPLE_MATCHED',
                                        'UNRELATED_SAMPLED_NOT_OWNED') for row in value['currentSampleStates']),
                    'CURRENT_UNRESOLVED_OR_LIVE_ATTRIBUTED_WORK')
            result.append(value)
        return result
    except BaseException:
        ctx.boundary_failed = True
        raise


def owner_ruling(ctx, release):
    validate_claim(release)
    require(release.get('authorized') is True and release.get('authorizedBy') == 'root'
            and release.get('label') == LABEL and release.get('packetManifestSha256') == ctx.manifest_sha,
            'EXACT_NEW_ROOT_RELEASE_REQUIRED')
    pins = release.get('ownerRulingPins')
    reviews = release.get('independentCodeReviewPins')
    require(type(reviews) is dict and set(reviews) == {'Aria', 'Quinn'}, 'EXACT_INDEPENDENT_SOURCE8_CODE_REVIEWS_REQUIRED')
    for role, row in reviews.items():
        raw = ctx.fs.verified(Path(row['path']), row['sha256'])
        review = json.loads(raw)
        require(review.get('reviewer') == role and review.get('subjectManifestSha256') == ctx.manifest_sha
                and review.get('protocol') == PROTOCOL and review.get('mandatoryFindings') == [], 'INDEPENDENT_CODE_REVIEW_SUBJECT_OR_FINDINGS')
    require(type(pins) is dict and set(pins) == {'Aria', 'Quinn', 'root'}, 'NAMED_LOCAL_OWNER_RULING_REQUIRED')
    for role, row in pins.items():
        require(row['name'] in ctx.control_raw and digest(ctx.control_raw[row['name']]) == sha_pin(row['sha256']), 'OWNER_RULING_BUFFER_PIN')
        ruling = ctx.control(row['name'])
        validate_claim(ruling)
        require(ruling.get('owner') == role and ruling.get('profileAuthorized') is True
                and ruling.get('packetManifestSha256') == ctx.manifest_sha
                and ruling.get('independentCodeReviewPins') == reviews
                and ruling.get('strongInitialSubjectReplacedOnlyForThisLocalProfile') is True,
                'NAMED_OWNER_SCOPE')
    require(release.get('sourceWrites') == [] and release.get('cleanupAuthorized') is False
            and release.get('credit') is False and release.get('C8') is False
            and release.get('previousFailedUnitProperlyClosedAndAdopted') is True, 'NO_SCOPE_WIDENING')
    previous_closure(ctx, release['previousFailedUnitClosure'])


def previous_closure(ctx, closure):
    raw = ctx.fs.verified(Path(closure['path']), closure['sha256'])
    closed = json.loads(raw)
    require(closed.get('actualWrapperExit') == 1 and type(closed.get('actualWrapperExit')) is int
            and closed.get('actualPostcloseExit') == 0 and type(closed.get('actualPostcloseExit')) is int
            and closed.get('actualQaRootAdopted') is True, 'PREVIOUS_FAILED_UNIT_CLOSURE_REQUIRED')


def bind_entry(ctx):
    entry = ctx.entry
    require(type(entry.get('inputPins')) is dict, 'COMPLETE_ENTRY_INPUT_MAP')
    active = entry['entryName']
    require(type(active) is str and active.endswith('.json') and '/' not in active, 'ACTIVE_ENTRY_NAME')
    actual = {p.name for p in E.iterdir() if p.name.endswith('.json')}
    require(actual - {active} == set(entry['inputPins']), 'COMPLETE_PREEXISTING_JSON_MAP_REQUIRED')
    require(active not in entry['inputPins'], 'ACYCLIC_ENTRY_SELF_EXCLUSION')
    # Hash every control before first parse; no map derived from self-hashed controls.
    for name, expected in entry['inputPins'].items():
        require('/' not in safe_relative(name) and name.endswith('.json'), 'DIRECT_JSON_CONTROL_NAME')
        ctx.control_raw[name] = ctx.fs.verified(E / name, expected)
    release = ctx.control('root-authorization.json')
    ctx.release = release
    require(digest(ctx.control_raw['hold.json']) == release['holdFileSha256']
            and digest(ctx.control_raw['candidate-baseline.json']) == release['candidateBaselineSha256'],
            'ENTRY_H_OR_CANDIDATE_CONFLICT_WITH_RELEASE')
    owner_ruling(ctx, release)
    ctx.legacy.CUSTODY_PINS.update(release['directoryRoots'])
    ctx.fs.directory_pins.update({name: {k: value[k] for k in ('dev', 'ino', 'uid', 'mode')}
                                 for name, value in release['directoryRoots'].items()})
    for name in release['directoryRoots']:
        ctx.legacy.guard_directory(Path(name))
    return release


def fresh_source(ctx, C):
    require(ctx.release is not None, 'SOURCE_AUTHORITY_REQUIRED')
    return ctx.legacy.guards(ctx.release, C)


def source_tuple(value):
    return {key: item for key, item in value.items() if key != 'atUtc'}


def inherited_samples(ctx, H):
    # Actual reads only in later authorized operation, never during preparation.
    raw = ctx.fs.verified(R / safe_relative(H['baselinePath']), H['baselineSha256'])
    inherited = json.loads(raw)['identities']
    candidate = ctx.control('candidate-baseline.json')['identities']
    result = {}
    for row in [*inherited, *candidate]:
        if row['pid'] in result:
            require(result[row['pid']] == row, 'BASELINE_PID_AMBIGUITY')
        result[row['pid']] = row
    return list(result.values())


def journals(ctx, C):
    current = ctx.client
    for name, raw in ctx.control_raw.items():
        if not name.endswith('.journal.json'):
            continue
        journal = json.loads(raw)
        old = journal['client']
        require(old.get('legacyStart') and type(old.get('pid')) is int, 'PRIOR_CLIENT_LEGACY_SAMPLE_REQUIRED')
        completion = ctx.control(name.replace('.journal.json', '.actual-completion.json'))
        validate_claim(completion)
        require(completion.get('authorizedBy') == 'root' and completion.get('separatelyCaptured') is True
                and completion.get('actualToolCompleted') is True and completion.get('actualCollectorExit') == 0
                and type(completion['actualCollectorExit']) is int and completion.get('journalSha256') == digest(raw),
                'PRIOR_CLIENT_ACTUAL_TOOL_COMPLETION_REQUIRED')
        require(old['pid'] != current['pid'], 'CURRENT_PID_PRIOR_CLIENT_AMBIGUITY')
        seen = scoped_text(ctx, old['pid'], 'lstart')
        require(seen is None or seen != old['legacyStart'], 'PRIOR_CLIENT_STILL_OBSERVED_OR_REUSE_AMBIGUITY')
        for record in journal['utilityClientJournals']:
            require(record['terminalWaitConfirmed'] is True and type(record['actualExit']) is int
                    and record['stdoutComplete'] is True and record['stderrComplete'] is True
                    and record['signalsSent'] is False, 'PRIOR_UTILITY_INCOMPLETE')
    require(all(r['terminalWaitConfirmed'] is True and r['stdoutComplete'] is True and r['stderrComplete'] is True
                for r in ctx.owner.utility), 'CURRENT_UTILITY_INCOMPLETE')
    return True


def publish_journal(ctx, operation, segment):
    return ctx.output(operation + '.journal.json', claim(client=dict(ctx.client),
        utilityClientJournals=ctx.owner.utility, frozenLedgerSegments=[segment],
        currentObserverCompletion='OWED_SEPARATE_ACTUAL_TOOL_RESULT', ownerRulingPins=ctx.release.get('ownerRulingPins') if ctx.release else None))


def transition(ctx, phase, decision):
    validate_claim(decision)
    require(phase in PHASES and decision.get('phase') == phase and decision.get('authorized') is True
            and decision.get('releaseSha256') == digest(ctx.control_raw['root-authorization.json']), 'ROOT_PHASE_DECISION')
    require(set(decision.get('precedingReceipts', {})) == set(PREDECESSORS[phase]), 'EXACT_PREDECESSOR_SET')
    for old, expected in decision['precedingReceipts'].items():
        raw = ctx.control_raw[old + '.receipt.json']
        require(digest(raw) == expected, 'PREDECESSOR_PIN')
        receipt = json.loads(raw)
        validate_claim(receipt)
        require(receipt['status'] == STATUS and receipt['disposition'] == DISPOSITION and receipt['accepted'] is True
                and receipt['ownerRulingPins'] == ctx.release['ownerRulingPins'], 'LOCAL_PREDECESSOR_REQUIRED')
    if phase == 'install-fixed':
        require(decision.get('redNativeStatusSeparatelyInspected') == 1
                and type(decision['redNativeStatusSeparatelyInspected']) is int
                and decision.get('redReceiptAndExactAssertionsInspected') is True, 'SEPARATE_RED_INSPECTION_REQUIRED')


def run_native(ctx, phase, C, inherited):
    spec = next(s for s in ctx.legacy.SCOPE['phases'] if s['id'] == phase)
    env = dict(ctx.release['safeEnvironment'])
    require(set(env) == {'HOME', 'LANG', 'LC_ALL'} and all(type(x) is str for x in env.values()), 'UNCHANGED_ENV_ALLOWLIST')
    env.update(PATH=os.pathsep.join([str(Path(ctx.legacy.SCOPE['node']).parent),
        str(Path(ctx.legacy.SCOPE['helm']).parent), ctx.release['boundBasePath']]),
        TMPDIR=str(W / 'tmp'), XDG_CACHE_HOME=str(W / 'cache'),
        VITE_CACHE_DIR=str(W / 'repo/studio-runner/.vite-gateway80'))
    argv, cwd = list(spec['argv']), W / 'repo/studio-runner'
    require(ctx.fs.absent(W / ('repo/' + phase + '-vitest.json')), 'FRESH_NATIVE_REPORT_REQUIRED')
    out = ctx.fs.create(E / (phase + '.stdout'))
    err = ctx.fs.create(E / (phase + '.stderr'))
    request = {'argv': argv, 'cwd': str(cwd), 'environment': env, 'childUmask': '022',
               'maximumSeconds': 300, 'packetManifestSha256': ctx.manifest_sha,
               'nodeFileSampleSha256': ctx.release['nodeSha256'], 'strongExecutableObjectIdentityProved': False}
    ctx.output(phase + '.launch-request.json', claim(launchRequest=request))
    ctx.deadline = time.monotonic() + 300
    attempt = ctx.owner.acquire('NATIVE_CONSTRUCTION', None, lambda _: None)
    try:
        child = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                 stdout=out['handle'], stderr=err['handle'], umask=0o022)
    except BaseException:
        attempt['closeState'] = 'UNKNOWN'
        raise ValueError('NATIVE_CONSTRUCTOR_UNKNOWN') from None
    ctx.owner.children.append(child)
    ctx.owner.waited[id(child)] = False
    attempt.update(handle=child, closer=lambda h: require(ctx.owner.waited.get(id(h)) is True, 'NATIVE_NOT_WAITED'))
    launch = {'launchId': phase, 'pid': child.pid, 'directPopenHandle': 'THIS_INVOCATION_OWNED_HANDLE',
              'numericPidIsStrongIdentity': False}
    try:
        ctx.event('DIRECT_POPEN_ENCOUNTER_BEFORE_DETAIL', launch)
        # Observe while the actual direct handle remains live. No native retry or signal.
        while child.poll() is None:
            require(time.monotonic() < ctx.deadline, 'NATIVE_DEADLINE_UNCONFIRMED_NO_SIGNAL')
            value = sample(ctx, C, attributed=[launch], baseline=inherited)
            ctx.event('NATIVE_RUNNING_SAMPLE', value)
            time.sleep(0.25)
        code = child.wait(timeout=max(0.001, ctx.deadline - time.monotonic()))
        require(type(code) is int and code >= 0 and time.monotonic() < ctx.deadline, 'NATIVE_WAIT_SIGNAL_OR_DEADLINE')
        ctx.owner.waited[id(child)] = True
    except BaseException:
        # A ledger/detail failure cannot discard the actual direct handle. Attempt
        # its real wait within the original deadline; failure stays UNKNOWN/HOLD.
        if not ctx.owner.waited[id(child)]:
            remaining = ctx.deadline - time.monotonic()
            if remaining > 0:
                try:
                    observed = child.wait(timeout=remaining)
                    ctx.owner.waited[id(child)] = type(observed) is int
                except BaseException:
                    pass
        raise
    ctx.owner.close(attempt)
    os.fsync(out['handle'])
    os.fsync(err['handle'])
    ctx.owner.close(out)
    ctx.owner.close(err)
    current = boundaries(ctx, C, attributed=[launch], baseline=inherited)
    report = W / ('repo/' + phase + '-vitest.json')
    copied = ctx.fs.copy(report, E / (phase + '-vitest.json'), 0o644, Budget())
    # Raw report is interpreted only by this exact retained assessor buffer.
    raw = ctx.fs.verified(E / (phase + '-vitest.json'), copied['sha256'])
    assessment = ctx.assess(json.loads(raw), phase, code, json.loads(ctx.buffers['case-map.json']))
    return {'launchRequest': request, 'sourceAuthorizedArgvSha256': digest(encoded(argv)),
            'runnerCompletion': {'completed': True, 'returnedExit': code},
            'directWaitRecord': {'launchId': phase, 'pid': child.pid, 'actualExit': code,
                                 'terminalWaitConfirmed': True, 'source': 'ACTUAL_DIRECT_POPEN_HANDLE_WAIT'},
            'outputCompleteness': {'stdoutComplete': True, 'stderrComplete': True,
                                  'stdoutSha256': digest(ctx.fs.read(E / (phase + '.stdout'), 128 * 1024 * 1024)),
                                  'stderrSha256': digest(ctx.fs.read(E / (phase + '.stderr'), 128 * 1024 * 1024))},
            'nativeExit': code, 'reportPins': {phase + '-vitest.json': copied['sha256']},
            'exactCaseReconciliation': assessment, 'currentBoundaryProofs': current,
            'attributedEncounters': [launch], 'historicalCandidateEncounters': list(ctx.encounters)}


def phase_operation(ctx, phase):
    release = bind_entry(ctx)
    decision = ctx.control(phase + '.root-decision.json')
    transition(ctx, phase, decision)
    H = materialized_holder(ctx)
    qualify_controller_lock(ctx, H)
    C = load_core(ctx, H)
    inherited = inherited_samples(ctx, H)
    ctx.start_segment(phase)
    ctx.output(phase + '.consumed.json', claim(phase=phase, decisionSha256=digest(ctx.control_raw[phase + '.root-decision.json']),
        releaseSha256=digest(ctx.control_raw['root-authorization.json']), automaticRetry=False))
    result = claim(phase=phase, status='HOLD', disposition=DISPOSITION, accepted=False, nativeExecuted=False,
                   ownerRulingPins=release['ownerRulingPins'], packetManifestSha256=ctx.manifest_sha,
                   releaseSha256=digest(ctx.control_raw['root-authorization.json']))
    try:
        require(ctx.control('guard-admission.json').get('negativeExitActualStatus') == 1
                and type(ctx.control('guard-admission.json')['negativeExitActualStatus']) is int
                and ctx.control('guard-admission.json').get('heldProofActualStatus') == 0
                and type(ctx.control('guard-admission.json')['heldProofActualStatus']) is int
                and ctx.control('guard-admission.json').get('readonlyParentGuardInspected') is True,
                'NEGATIVE_GUARD_AND_SEPARATE_HELD_ADMISSION_REQUIRED')
        result['preSource'] = fresh_source(ctx, C)
        result['preResources'] = boundaries(ctx, C, baseline=inherited)
        if phase == 'prepare':
            result.update(create_workspace(ctx))
        else:
            helper = 'original' if phase in ('red', 'install-fixed') else 'fixed'
            ctx.legacy.workspace_guard(helper)
            if phase == 'install-fixed':
                install_fixed(ctx)
            elif phase in ('red', 'green'):
                require(not list((W / 'tmp').iterdir()), 'FIXTURE_SCRATCH_NOT_EMPTY')
                result['nativeExecuted'] = True
                result.update(run_native(ctx, phase, C, inherited))
                require(not list((W / 'tmp').iterdir()), 'FIXTURE_SCRATCH_CLEANUP_FAILED')
                ctx.legacy.workspace_guard(helper)
            else:
                result.update(ctx.legacy.archive())
        result['postSource'] = fresh_source(ctx, C)
        require(source_tuple(result['preSource']) == source_tuple(result['postSource']), 'SOURCE_BEFORE_AFTER_DRIFT')
        result['postResources'] = boundaries(ctx, C, baseline=inherited)
        require(ctx.deadline is None or time.monotonic() < ctx.deadline, 'ACCEPTANCE_DEADLINE_AFTER_ALL_OBSERVATIONS')
        journals(ctx, C)
        qualify_controller_lock(ctx, H)
        require(ctx.deadline is None or time.monotonic() < ctx.deadline, 'ACCEPTANCE_DEADLINE_AFTER_FINAL_HOLDER')
        result.update(status=STATUS, accepted=True, collectorExit=0, phaseExit=0)
    except BaseException as exc:
        reason = str(exc) if isinstance(exc, ValueError) else 'PHASE_CONTROL_FAILURE'
        result.update(failureCode=reason if re.fullmatch('[A-Z0-9_]+', reason) else 'PHASE_CONTROL_FAILURE',
                      collectorExit=1, phaseExit=1)
    segment = ctx.finish_segment()
    result['frozenLedgerSegments'] = [segment]
    publish_journal(ctx, phase, segment)
    ctx.output(phase + '.receipt.json', result)
    return 0 if result['accepted'] else 1


def ancestor_custody(ctx, bindings):
    require(type(bindings) is dict and bindings, 'EXISTING_ANCESTOR_BINDINGS_REQUIRED')
    for path in (R, PACKAGE, STATIC, E.parent, W.parent):
        require(str(path) in bindings, 'REQUIRED_PENDING_ANCESTOR_MISSING')
    for name, expected in bindings.items():
        path = Path(name)
        require(path not in (E, W) and E not in path.parents and W not in path.parents, 'PENDING_CUSTODY_MUST_NOT_STAT_E_H_OR_W')
        info = ctx.fs.info(path)
        require(stat.S_ISDIR(info.st_mode) and {'dev': info.st_dev, 'ino': info.st_ino,
            'uid': info.st_uid, 'mode': stat.S_IMODE(info.st_mode)} == expected, 'ANCESTOR_CUSTODY_CHANGED')


def capture(ctx, proposal, proposal_sha, consumed_token):
    require(consumed_token == '--same-shell-once-consumed', 'CAP_CONSUMED_BEFORE_PYTHON_REQUIRED')
    validate_claim(proposal)
    require(proposal.get('packetManifestSha256') == ctx.manifest_sha and proposal.get('nativeOrPhaseAuthorized') is False
            and proposal.get('previousFailedUnitProperlyClosedAndAdopted') is True, 'FRESH_CAPTURE_SCOPE')
    holder = PendingHolder(proposal, proposal_sha)
    previous_closure(ctx, proposal['previousFailedUnitClosure'])
    ctx.fs.directory_pins.update(proposal['existingAncestorBindings'])
    # This reads only existing ancestors, scoped controllers/observer and exact lock.
    require(os.umask(0o077) == 0o077, 'PARENT_UMASK_MUST_ALREADY_BE_077')
    for _ in range(2):
        ancestor_custody(ctx, proposal['existingAncestorBindings'])
        require(ctx.fs.absent(E) and ctx.fs.absent(W), 'FRESH_E_W_ABSENCE_REQUIRED')
        qualify_controller_lock(ctx, holder)
    # First E mutation occurs only here. Partial failure is retained, never repaired.
    ctx.wrote_e = True
    ctx.fs.mkdir(E, 0o700)
    ctx.fs.write(E / 'hold.json', holder.raw, 0o600)
    require(ctx.fs.verified(E / 'hold.json', holder.sha256) == holder.raw, 'PUBLISHED_H_BYTES')
    require(stat.S_IMODE(ctx.fs.info(E / 'hold.json').st_mode) == 0o600, 'REAL_H_MODE_ONLY_AFTER_CREATION')
    ctx.output('capture.consumed.json', claim(proposalSha256=proposal_sha, holdSha256=holder.sha256,
        sameShellOneShotConsumedBeforePython=True, nativeExecuted=False, authorized=False))
    ctx.release = dict(proposal['proposedAuthorization'])
    ctx.release.update(authorized=False, holdFileSha256=holder.sha256, label=LABEL,
                       packetManifestSha256=ctx.manifest_sha)
    ctx.legacy.CUSTODY_PINS.update(ctx.release['directoryRoots'])
    ctx.legacy.CUSTODY_PINS[str(E)] = ctx.legacy.directory_fact(E)
    ctx.release['directoryRoots'][str(E)] = ctx.legacy.directory_fact(E)
    # Fresh actual observations populate the proposed release; they are not cached root attestations.
    G = json.loads(ctx.buffers['source-guards.json'])
    ctx.release['dependencyInventory'] = inventory(ctx, Path(ctx.release['dependenciesRealpath']))
    ctx.release['distModes'] = {r['path']: stat.S_IMODE(ctx.fs.info(R / 'studio-runner/dist' / r['path']).st_mode)
                               for r in G['dist']['files']}
    ctx.release['auxModes'] = {name: stat.S_IMODE(ctx.fs.info(R / name).st_mode)
                             for group in G['auxiliaryGroups'].values() for name in group}
    C = load_core(ctx, holder.get())
    ctx.start_segment('capture')
    source_before = fresh_source(ctx, C)
    versions = {}
    for name in ('node', 'helm'):
        command = [ctx.release[name + 'CanonicalPath'], '--version'] if name == 'node' else [ctx.release[name + 'CanonicalPath'], 'version', '--short']
        observed = no_signal_process(ctx, command, ctx.release[name + 'Sha256'], kind='TOOL_VERSION')
        require(observed.returncode == 0 and observed.stderr == '' and 0 < len(observed.stdout.strip()) <= 4096,
                'TOOL_VERSION_UNQUALIFIED')
        versions[name] = observed.stdout.strip()
    # Fresh global candidate encounters can now be durably appended before detail.
    H = holder.get()
    old_raw = ctx.fs.verified(R / safe_relative(H['baselinePath']), H['baselineSha256'])
    old = json.loads(old_raw)['identities']
    old_pids = {r['pid'] for r in old}
    first = sample(ctx, C, baseline=old)
    candidates = []
    for record in ctx.events:
        if record['kind'] == 'CANDIDATE_DETAIL_RESULT' and record['value']['sample'] is not None:
            who = record['value']['sample']
            if who['pid'] not in old_pids:
                candidates.append(who)
    require(all(row['state'] in ('UNRELATED_SAMPLED_NOT_OWNED', 'INHERITED_LEGACY_SAMPLE_MATCHED',
                                 'NO_LONGER_OBSERVED_NOT_EXIT_PROOF') for row in first['currentSampleStates']),
            'FRESH_CANDIDATE_BASELINE_UNRESOLVED_OR_RELEVANT')
    raw = encoded(claim(label=LABEL, capturedBeforeUnit=True, identities=candidates, authorized=False))
    ctx.fs.write(E / 'candidate-baseline.json', raw)
    ctx.control_raw['candidate-baseline.json'] = raw
    ctx.release['candidateBaselineSha256'] = digest(raw)
    resources = boundaries(ctx, C, baseline=[*old, *candidates])
    source_after = fresh_source(ctx, C)
    require(source_tuple(source_before) == source_tuple(source_after), 'ADMISSION_SOURCE_DRIFT')
    qualify_controller_lock(ctx, holder)
    segment = ctx.finish_segment()
    publish_journal(ctx, 'capture', segment)
    ctx.release['actualFreshToolVersions'] = versions
    ctx.output('admission-facts.json', claim(authorized=False, holdSha256=holder.sha256,
        proposedAuthorization=ctx.release, beforeSource=source_before, afterSource=source_after,
        currentBoundaryProofs=resources, frozenLedgerSegments=[segment], actualNativeInvocations=0,
        ownerMustSeparatelyInspectAndRelease=True))
    return 0


def immutable_tuple(ctx):
    receipts = {}
    reports = {}
    for phase in PHASES:
        name = phase + '.receipt.json'
        value = ctx.control(name)
        validate_claim(value)
        require(value.get('accepted') is True and value.get('status') == STATUS
                and value.get('disposition') == DISPOSITION and value.get('phase') == phase
                and value.get('ownerRulingPins') == ctx.release['ownerRulingPins'], 'FIVE_NEW_LOCAL_PHASES_REQUIRED')
        receipts[phase] = digest(ctx.control_raw[name])
        for segment in value['frozenLedgerSegments']:
            require(digest(ctx.fs.read(E / safe_relative(segment['path']), 67108864)) == segment['sha256'], 'CLOSED_SAMPLE_SEGMENT_CHANGED')
        if phase in ('red', 'green'):
            native = value['nativeExit']
            expected = 1 if phase == 'red' else 0
            require(type(native) is int and native == expected and value['directWaitRecord']['terminalWaitConfirmed'] is True
                    and value['outputCompleteness']['stdoutComplete'] is True
                    and value['outputCompleteness']['stderrComplete'] is True, 'NATIVE_STATUS_OUTPUT_CHAIN')
            report_name = phase + '-vitest.json'
            raw = ctx.fs.verified(E / report_name, value['reportPins'][report_name])
            ctx.assess(json.loads(raw), phase, native, json.loads(ctx.buffers['case-map.json']))
            reports[report_name] = digest(raw)
            for suffix in ('stdout', 'stderr'):
                require(digest(ctx.fs.read(E / (phase + '.' + suffix), 128 * 1024 * 1024))
                        == value['outputCompleteness'][suffix + 'Sha256'], 'RAW_OUTPUT_DRIFT')
    archived = ctx.control('archive.receipt.json')
    require(archived.get('archiveEqual') is True and archived.get('finalChart22') is True, 'ACTUAL_ARCHIVE_REQUIRED')
    project = lambda rows: [{k: v for k, v in r.items() if k not in ('dev', 'ino')} for r in rows]
    require(project(inventory(ctx, W)) == project(inventory(ctx, E / 'complete-workspace-archive'))
            == project(archived['workspaceInventory']), 'FULL_WORKSPACE_ARCHIVE_DRIFT')
    require(project(inventory(ctx, W / 'repo/helm-chart/put-checks'))
            == project(inventory(ctx, E / 'final-fixed-chart-archive'))
            == project(archived['finalChartInventory']), 'FIXED_CHART_ARCHIVE_DRIFT')
    return {'packetManifestSha256': ctx.manifest_sha,
            'releaseSha256': digest(ctx.control_raw['root-authorization.json']),
            'phaseReceiptPins': receipts, 'reportPins': reports,
            'archiveReceiptSha256': receipts['archive'], 'ownerRulingPins': ctx.release['ownerRulingPins'],
            'sourceDigest': ctx.release['sourceDigest'], 'credit': False}


def checked_actual_adoption(ctx):
    adoption = ctx.control('actual-review.root-adoption.json')
    validate_claim(adoption)
    require(adoption.get('authorizedBy') == 'root' and adoption.get('actualPhaseAndArchiveQaAdopted') is True
            and adoption.get('ownerRulingPins') == ctx.release['ownerRulingPins'], 'ACTUAL_QA_ROOT_ADOPTION_REQUIRED')
    qa = ctx.control(adoption['actualQaReviewName'])
    validate_claim(qa)
    require(qa.get('reviewer') == 'Quinn' and qa.get('actualPhaseAndArchiveReviewed') is True
            and qa.get('mandatoryFindings') == [] and qa.get('immutableTuple') == immutable_tuple(ctx), 'EXACT_ACTUAL_QA_REVIEW_REQUIRED')
    require(adoption.get('actualQaReviewSha256') == digest(ctx.control_raw[adoption['actualQaReviewName']]), 'ACTUAL_QA_REVIEW_PIN')
    return adoption


def fresh_current(ctx, operation, postclose=False):
    H = materialized_holder(ctx)
    qualify_controller_lock(ctx, H, postclose)
    C = load_core(ctx, H, postclose)
    ctx.start_segment(operation)
    before = fresh_source(ctx, C)
    attributed = [x for p in ('red', 'green') for x in ctx.control(p + '.receipt.json')['attributedEncounters']]
    ctx.encounters.extend(x for p in ('red', 'green')
                          for x in ctx.control(p + '.receipt.json')['historicalCandidateEncounters'])
    current = boundaries(ctx, C, attributed, inherited_samples(ctx, H))
    after = fresh_source(ctx, C)
    require(source_tuple(before) == source_tuple(after), 'CURRENT_SOURCE_DRIFT')
    journals(ctx, C)
    qualify_controller_lock(ctx, H, postclose)
    segment = ctx.finish_segment()
    publish_journal(ctx, operation, segment)
    return {'source': source_tuple(after), 'currentBoundaryProofs': current, 'frozenLedgerSegments': [segment]}


def final_operation(ctx):
    bind_entry(ctx)
    ctx.output('final.consumed.json', claim(packetManifestSha256=ctx.manifest_sha, automaticRetry=False))
    checked_actual_adoption(ctx)
    immutable = immutable_tuple(ctx)
    current = fresh_current(ctx, 'final')
    result = claim(status=STATUS, disposition=DISPOSITION, accepted=True, finalExit=0,
        issuedAtEpoch=time.time(), immutableTuple=immutable, currentFacts=current,
        ownerRulingPins=ctx.release['ownerRulingPins'], separatelyCapturedStatusAndRootInspectionOwed=True)
    ctx.output('final-readiness.json', result)
    ctx.output('final-result.json', claim(actualFinalCollectorReturnIntended=0, readinessSha256=digest(encoded(result)),
        ownerRulingPins=ctx.release['ownerRulingPins'], immutableTuple=immutable))
    return 0


def freshness(now, issued):
    require(type(now) in (int, float) and type(issued) in (int, float) and 0 <= now - issued <= 60, 'SIXTY_SECOND_FRESHNESS')


def gate_operation(ctx):
    bind_entry(ctx)
    permit = ctx.control('close.root-permit.json')
    readiness = ctx.control('final-readiness.json')
    final = ctx.control('final-result.json')
    for value in (permit, readiness, final):
        validate_claim(value)
    freshness(time.time(), readiness['issuedAtEpoch'])
    freshness(time.time(), permit['issuedAtEpoch'])
    require(permit.get('authorizedBy') == 'root' and permit.get('actualFinalStatus') == 0
            and type(permit['actualFinalStatus']) is int and permit.get('finalResultAndReadinessSeparatelyInspected') is True
            and permit.get('expectedWrapperExit') == 0 and type(permit['expectedWrapperExit']) is int
            and permit.get('ownerRulingPins') == ctx.release['ownerRulingPins'], 'SEPARATE_ROOT_PERMIT_AFTER_FINAL_INSPECTION')
    require(permit['readinessSha256'] == digest(ctx.control_raw['final-readiness.json'])
            and permit['finalResultSha256'] == digest(ctx.control_raw['final-result.json'])
            and final['readinessSha256'] == permit['readinessSha256'], 'PERMIT_FINAL_BINDINGS')
    require(immutable_tuple(ctx) == readiness['immutableTuple'] == final['immutableTuple'], 'IMMUTABLE_TUPLE_CHANGED')
    current = fresh_current(ctx, 'gate')
    require(current['source'] == readiness['currentFacts']['source'], 'FINAL_GATE_SOURCE_INVARIANT')
    freshness(time.time(), readiness['issuedAtEpoch'])
    freshness(time.time(), permit['issuedAtEpoch'])
    ctx.output('allow-close.json', claim(allow=True, wrapperExit=0, permitSha256=digest(ctx.control_raw['close.root-permit.json']),
        immutableTuple=readiness['immutableTuple'], currentFacts=current, ownerRulingPins=ctx.release['ownerRulingPins']))
    freshness(time.time(), readiness['issuedAtEpoch'])
    freshness(time.time(), permit['issuedAtEpoch'])
    return 0


def held_operation(ctx):
    bind_entry(ctx)
    negative = ctx.control('negative-exit.root-status.json')
    validate_claim(negative)
    require(negative.get('actualNegativeStatus') == 1 and type(negative['actualNegativeStatus']) is int
            and negative.get('sameOriginalHeldShell') is True and negative.get('separatelyCaptured') is True,
            'SEPARATE_NEGATIVE_STATUS_REQUIRED')
    H = materialized_holder(ctx)
    qualify_controller_lock(ctx, H)
    C = load_core(ctx, H)
    ctx.start_segment('held-proof')
    source = fresh_source(ctx, C)
    current = boundaries(ctx, C, baseline=inherited_samples(ctx, H))
    qualify_controller_lock(ctx, H)
    segment = ctx.finish_segment()
    publish_journal(ctx, 'held-proof', segment)
    ctx.output('held-proof.json', claim(status='HELD_PROOF_ONLY', source=source, currentBoundaryProofs=current,
        frozenLedgerSegments=[segment], ownerRulingPins=ctx.release['ownerRulingPins'], negativeActualStatus=1))
    return 0


def postclose_operation(ctx):
    bind_entry(ctx)
    wrapper = ctx.control('actual-wrapper.root-result.json')
    validate_claim(wrapper)
    require(type(wrapper.get('actualWrapperExit')) is int and wrapper['actualWrapperExit'] == 0
            and wrapper.get('separatelyCaptured') is True and wrapper.get('authorizedBy') == 'root'
            and wrapper.get('allowCloseSha256') == digest(ctx.control_raw['allow-close.json']), 'ACTUAL_GATED_WRAPPER_ZERO_REQUIRED')
    require(ctx.control('allow-close.json')['immutableTuple'] == immutable_tuple(ctx), 'POSTCLOSE_IMMUTABLE_TUPLE')
    current = fresh_current(ctx, 'postclose', postclose=True)
    ctx.output('postclose.json', claim(status='POSTCLOSE_LOCAL_SAMPLES_ONLY', actualWrapperExit=0,
        currentFacts=current, ownerRulingPins=ctx.release['ownerRulingPins'], credit=False,
        actualOuterCompletionAndIndependentQaRootOwed=True))
    return 0


def dispatch(ctx):
    operation = ctx.entry['operation']
    if operation == 'author-control':
        return author_control(ctx)
    if operation == 'capture':
        require(ctx.entry.get('proposalSha256') and ctx.entry.get('sameShellToken'), 'CAPTURE_ENTRY_FIELDS')
        raw = ctx.fs.verified(Path(ctx.entry['proposalPath']), ctx.entry['proposalSha256'])
        return capture(ctx, json.loads(raw), ctx.entry['proposalSha256'], ctx.entry['sameShellToken'])
    if operation in PHASES:
        return phase_operation(ctx, operation)
    handlers = {'negative': negative_operation, 'held-proof': held_operation, 'final': final_operation, 'gate': gate_operation, 'postclose': postclose_operation}
    require(operation in handlers, 'UNKNOWN_OPERATION')
    return handlers[operation](ctx)


def negative_operation(ctx):
    bind_entry(ctx)
    require(ctx.fs.absent(E / 'final-readiness.json') and ctx.fs.absent(E / 'final-result.json'), 'NEGATIVE_ONLY_BEFORE_FINAL')
    qualify_controller_lock(ctx, materialized_holder(ctx))
    ctx.output('negative-exit.denial.json', claim(allow=False, reason='FINAL_READINESS_AND_RESULT_REQUIRED',
        intendedNegativeReturn=1, sameHeldShell=True, ownerRulingPins=ctx.release['ownerRulingPins']))
    return 1


def author_control(ctx):
    """Root authors explicit attestations/entries; this produces no observed fact.

    Its independently pinned exterior input is the root's exact proposed document.
    Operational entry maps bind current raw JSON bytes without parsing their claims.
    """
    entry = ctx.entry
    require(entry.get('authorizedBy') == 'root' and entry.get('role') == 'ROOT_ATTESTATION_AUTHOR_ONLY', 'ROOT_CONTROL_AUTHOR_SCOPE')
    name = entry['outputName']
    require('/' not in safe_relative(name) and name.endswith('.json'), 'ROOT_CONTROL_OUTPUT_NAME')
    allowed = (name.endswith('.entry.json') or name.endswith('.root-decision.json')
               or name.endswith('.actual-completion.json') or name.startswith('owner-ruling-')
               or name in ('root-authorization.json', 'negative-exit.root-status.json', 'guard-admission.json',
                           'actual-review.root-adoption.json', 'actual-qa-review.json',
                           'close.root-permit.json', 'actual-wrapper.root-result.json'))
    require(allowed, 'ROOT_AUTHOR_CANNOT_CREATE_RUNTIME_RECEIPTS_OR_SAMPLES')
    info = ctx.fs.info(E)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700
            and (info.st_dev, info.st_ino) == (entry['runtimeIdentity']['dev'], entry['runtimeIdentity']['ino']),
            'ROOT_AUTHOR_EXACT_EXISTING_E_IDENTITY')
    value = dict(entry['document'])
    if name.endswith('.entry.json'):
        require(value.get('operation') in (*PHASES, 'negative', 'held-proof', 'final', 'gate', 'postclose'), 'OPERATIONAL_ENTRY_NAME')
        require(name == value['operation'] + '.entry.json', 'ENTRY_FILENAME_MUST_MATCH_OPERATION')
        value.update(entryName=name, packetManifestSha256=ctx.manifest_sha)
        value['inputPins'] = {p.name: digest(ctx.fs.read(p)) for p in E.iterdir() if p.name.endswith('.json')}
    else:
        validate_claim(value)
    ctx.output(name, value)
    return 0

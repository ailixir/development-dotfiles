"""Prospective exact one-selected public-observation adapter. Import performs no effects.

Only main constructs System. Every adapter method takes that explicit boundary, so blocked
tests execute these actual functions without falling through to filesystem/process effects.
No old unit main, private body reader, retry, timeout signal, cleanup or credit exists here.
"""
import ast
import ctypes
import datetime
import errno
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import stat
import subprocess
import sys
import time
import types
import xml.parsers.expat

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
LABEL = 'obs011-t0-c8-public-error-observe01'
UNIT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime' / LABEL
CONTROL = UNIT / 'control'
REPLAY = 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
CORE = 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
CORE_SHA = 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
PLAN = 'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json'
PLAN_SHA = '9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
WRAPPER = '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
WRAPPER_SHA = '2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
JAVA_SHA = '19f2cd660267f4fb79a83debff11e8c3d509cd06beb499297e6558b030b8789a'
JAVA_RELEASE_SHA = 'c0396ee69271e1a2c323e62c7d38dfd94206acab6def9b3ab6a99f7d75ce509a'
NODE_SHA = '9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a'
LOCK = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock'
LEASE = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/obs011-t0-c8-public-error-observe01-source-lease.json'
CLASS = 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
METHOD = 'actualPublishedWrongPasswordAnnotatesEarlierSecretFill'
XML = ROOT / ('backend/build/test-results/test/TEST-' + CLASS + '.xml')
COHORTS = ROOT / 'backend/build/guided-cohorts/test'
CANONICAL_GUARD = ROOT / 'backend/build/guard-tally/GuidedPublicationReplayIT.json'
UUID = re.compile('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
PHASES = ('held-proof', 'stage', 'selected', 'collect-public', 'restore', 'compile-restored', 'final', 'gate', 'postclose')
ARTIFACTS = {'public_observation_unit.py', 'unit_policy.py', 'public_contract.py', 'guard-public-observe.bash', 'public-observation.schema.json', 'public-policy.json', 'source-binding.json', 'Replay.preimage.java', 'Replay.postimage.java', 'observer.patch', 'observer.reverse.patch'}
CONTROL_MEMBERS = ARTIFACTS | {'root-release.json', 'active-lock.json', 'root-admission.json', 'negative-readiness-denial.json', 'held-proof.json', 'Replay.actual-backup.java', 'source-backup.json', 'preunlock-verification.json', 'root-close-permit.json', 'guard-allow.json', 'root-wrapper-result.json', 'root-actual-evidence-disposition.json', 'public-collection.json'}
CONTROL_MEMBERS |= {p + '-consumed.json' for p in PHASES}
CONTROL_MEMBERS |= {p + suffix for p in ('selected', 'compile-restored') for suffix in ('-native.private.log', '-native-result.json', '-drain.json')}
CONTROL_MEMBERS |= {p + '-result.json' for p in ('stage', 'selected', 'restore', 'compile-restored')}
CONTROL_MEMBERS |= {'root-' + p + '-decision.json' for p in ('selected', 'restore', 'compile-restored', 'collect-public')}
CONTROL_MEMBERS |= {'postclose-verification.json'}
ENVIRONMENT_KEYS = {'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'JAVA_HOME', 'GRADLE_USER_HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'TESTCONTAINERS_RYUK_DISABLED', 'TESTCONTAINERS_HOST_OVERRIDE'}
DEPENDENCY_CACHE = Path('/Users/brunobuger/.gradle/caches/modules-2/files-2.1')
GRADLE_DISTRIBUTIONS = Path('/Users/brunobuger/.gradle/wrapper/dists')
ACTUAL_QA_REVIEW = 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-public-error-observe01-actual-unit-review/review.md'


class Hold(Exception):
    pass


def need(value, reason):
    if value is not True:
        raise Hold(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def packed(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def hash_value(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def member(name):
    return type(name) is str and bool(name) and '/' not in name and '\x00' not in name and name not in ('.', '..')


def relative(name):
    return type(name) is str and bool(name) and not name.startswith('/') and str(PurePosixPath(name)) == name and '..' not in PurePosixPath(name).parts and '\x00' not in name


def absolute(name):
    return type(name) is str and name.startswith('/') and str(PurePosixPath(name)) == name and '..' not in PurePosixPath(name).parts and '\x00' not in name


def pairs(items):
    out = {}
    for key, value in items:
        need(key not in out, 'DUPLICATE_JSON_MEMBER')
        out[key] = value
    return out


def decode(raw):
    need(type(raw) is bytes and len(raw) <= 16 * 1024 * 1024, 'BOUNDED_JSON_BYTES')
    return json.loads(raw.decode('utf-8', 'strict'), object_pairs_hook=pairs,
                      parse_constant=lambda unused: (_ for _ in ()).throw(Hold('NONFINITE_JSON')))


def identity_key(st):
    return st.st_dev, st.st_ino, st.st_mode, st.st_uid


def file_key(st):
    return identity_key(st) + (st.st_size, st.st_mtime_ns, st.st_ctime_ns)


class Custody:
    """Retain every ancestor descriptor, and revalidate both named and opened objects."""
    def __init__(self, path, mode=None, api=os):
        self.os, self.path, self.chain = api, Path(path), []
        need(self.path.is_absolute() and '..' not in self.path.parts and str(self.path) == str(path), 'CUSTODY_PATH')
        try:
            fd = api.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            self.chain.append((None, '/', fd, identity_key(api.fstat(fd))))
            for name in self.path.parts[1:]:
                parent = fd
                fd = api.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                self.chain.append((parent, name, fd, identity_key(api.fstat(fd))))
            self.fd = fd
            self.check()
            info = api.fstat(fd)
            need(mode is None or (stat.S_IMODE(info.st_mode) == mode and info.st_uid == api.getuid()), 'DIRECTORY_OWNER_MODE')
        except BaseException:
            self.close()
            raise

    def check(self):
        for parent, name, fd, expected in self.chain:
            actual = self.os.fstat(fd)
            named = self.os.stat(name, follow_symlinks=False) if parent is None else self.os.stat(name, dir_fd=parent, follow_symlinks=False)
            need(stat.S_ISDIR(actual.st_mode) and identity_key(actual) == expected == identity_key(named), 'DIRECTORY_CUSTODY_CHANGED')

    def members(self):
        self.check()
        names = self.os.listdir(self.fd)
        self.check()
        need(all(member(n) for n in names) and len(names) == len(set(names)), 'MEMBERS')
        return sorted(names)

    def info(self, name):
        need(member(name), 'MEMBER')
        self.check()
        value = self.os.stat(name, dir_fd=self.fd, follow_symlinks=False)
        self.check()
        return value

    def absent(self, name):
        try:
            self.info(name)
        except FileNotFoundError:
            return True
        return False

    def read(self, name, mode=None, cap=16 * 1024 * 1024):
        need(member(name), 'MEMBER')
        self.check()
        fd = self.os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            before = self.os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid in (0, self.os.getuid()) and
                 (mode is None or stat.S_IMODE(before.st_mode) == mode) and 0 <= before.st_size <= cap, 'FILE_OWNER_MODE_CAP')
            pieces, remaining = [], before.st_size
            while remaining:
                piece = self.os.read(fd, min(remaining, 1024 * 1024))
                need(bool(piece), 'SHORT_READ')
                pieces.append(piece)
                remaining -= len(piece)
            need(self.os.read(fd, 1) == b'', 'GROWING_FILE')
            after, named = self.os.fstat(fd), self.info(name)
            need(file_key(before) == file_key(after) == file_key(named), 'FILE_CHANGED')
            self.check()
            return b''.join(pieces), before
        finally:
            self.os.close(fd)

    def create_fd(self, name, mode=0o600):
        need(member(name), 'OUTPUT_MEMBER')
        self.check()
        fd = self.os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=self.fd)
        try:
            info = self.os.fstat(fd)
            need(stat.S_ISREG(info.st_mode) and info.st_uid == self.os.getuid() and stat.S_IMODE(info.st_mode) == mode and info.st_nlink == 1, 'EXCLUSIVE_OUTPUT')
            need(identity_key(info) == identity_key(self.info(name)), 'OUTPUT_NAME_CHANGED')
            self.check()
            return fd
        except BaseException:
            self.os.close(fd)
            raise

    def write(self, name, raw, mode=0o600):
        need(type(raw) is bytes, 'WRITE_BYTES')
        fd = self.create_fd(name, mode)
        try:
            offset = 0
            while offset < len(raw):
                count = self.os.write(fd, raw[offset:])
                need(type(count) is int and count > 0, 'SHORT_WRITE')
                offset += count
            self.os.fsync(fd)
            need(identity_key(self.os.fstat(fd)) == identity_key(self.info(name)), 'OUTPUT_REPLACED')
            self.check()
            self.os.fsync(self.fd)
        finally:
            self.os.close(fd)

    def replace_exact(self, name, before_raw, after_raw, expected_identity, mode=0o644):
        """Transfer only the leased exact current inode; never reset/fallback/rename another path."""
        current, current_info = self.read(name, mode)
        need(current == before_raw and identity_key(current_info) == tuple(expected_identity) and current_info.st_nlink == 1, 'SOURCE_PREIMAGE_IDENTITY')
        fd = self.os.open(name, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            need(file_key(self.os.fstat(fd)) == file_key(current_info) == file_key(self.info(name)), 'SOURCE_BEFORE_WRITE_RACE')
            # Existing inode stays retained. Root's exclusive one-path lease is necessary here.
            self.os.ftruncate(fd, 0)
            offset = 0
            while offset < len(after_raw):
                count = self.os.write(fd, after_raw[offset:])
                need(type(count) is int and count > 0, 'SOURCE_SHORT_WRITE')
                offset += count
            self.os.fsync(fd)
            need(identity_key(self.os.fstat(fd)) == tuple(expected_identity) == identity_key(self.info(name)), 'SOURCE_AFTER_WRITE_RACE')
            self.check()
        finally:
            self.os.close(fd)
        actual, info = self.read(name, mode)
        need(actual == after_raw and identity_key(info) == tuple(expected_identity), 'SOURCE_EXACT_TRANSFER_FAILED')

    def close(self):
        for _, _, fd, _ in reversed(self.chain):
            self.os.close(fd)
        self.chain = []


class System:
    """Concrete explicit syscall boundary. No method is called during preparation imports."""
    def custody(self, path, mode=None):
        return Custody(path, mode)

    def read(self, path, mode=None, cap=16 * 1024 * 1024):
        c = self.custody(Path(path).parent)
        try:
            return c.read(Path(path).name, mode, cap)
        finally:
            c.close()

    def pid(self):
        return os.getpid()

    def uid(self):
        return os.getuid()

    def ppid(self):
        return os.getppid()

    def now(self):
        return time.time()

    def monotonic(self):
        return time.monotonic_ns()

    def sleep(self, seconds):
        time.sleep(seconds)

    def python(self):
        return {'reported': sys.executable, 'observedArgument': sys.orig_argv[0]}

    def popen(self, argv, **kwargs):
        return subprocess.Popen(argv, **kwargs)

    def utility_identity(self, pid, expected_path):
        """Darwin kernel identity immediately after Popen's successful exec handshake.

        No observation subprocess is spawned to observe another observation subprocess.
        A short-lived child that cannot be bound is an explicit HOLD, never an exemption.
        """
        class BsdInfo(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint32) for name in
                        ('flags', 'status', 'xstatus', 'pid', 'ppid', 'uid', 'gid', 'ruid', 'rgid', 'svuid', 'svgid', 'rfu')]
            _fields_ += [('comm', ctypes.c_char * 16), ('name', ctypes.c_char * 32)]
            _fields_ += [(name, ctypes.c_uint32) for name in ('nfiles', 'pgid', 'pjobc', 'e_tdev', 'e_tpgid')]
            _fields_ += [('nice', ctypes.c_int32), ('startSeconds', ctypes.c_uint64), ('startMicroseconds', ctypes.c_uint64)]
        need(sys.platform == 'darwin' and ctypes.sizeof(BsdInfo) == 136, 'DARWIN_KERNEL_IDENTITY_ABI')
        proc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        proc.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int]
        proc.proc_pidinfo.restype = ctypes.c_int
        proc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
        proc.proc_pidpath.restype = ctypes.c_int
        before, after, image = BsdInfo(), BsdInfo(), ctypes.create_string_buffer(4096)
        need(proc.proc_pidinfo(pid, 3, 0, ctypes.byref(before), 136) == 136 and proc.proc_pidpath(pid, image, 4096) > 0 and proc.proc_pidinfo(pid, 3, 0, ctypes.byref(after), 136) == 136, 'UTILITY_KERNEL_START_UNAVAILABLE')
        fields = lambda value: (value.pid, value.ppid, value.startSeconds, value.startMicroseconds)
        need(fields(before) == fields(after) and before.pid == pid and before.ppid == os.getpid() and before.startSeconds > 0 and image.value.decode('utf-8', 'strict') == expected_path, 'UTILITY_KERNEL_START_IMAGE_CHANGED')
        return {'pid': pid, 'ppid': before.ppid, 'kernelStartSeconds': before.startSeconds,
                'kernelStartMicroseconds': before.startMicroseconds, 'processImage': expected_path,
                'kernelIdentityComplete': True}

    def sink(self, c, name):
        handle = os.fdopen(c.create_fd(name), 'wb')
        expected = identity_key(os.fstat(handle.fileno()))
        class RetainedSink:
            def fileno(self):
                c.check()
                need(identity_key(os.fstat(handle.fileno())) == expected == identity_key(c.info(name)), 'NATIVE_SINK_REPLACED')
                return handle.fileno()
            def close(self):
                try:
                    handle.flush()
                    os.fsync(handle.fileno())
                    c.check()
                    need(identity_key(os.fstat(handle.fileno())) == expected == identity_key(c.info(name)), 'NATIVE_SINK_CHANGED')
                finally:
                    handle.close()
        return RetainedSink()

    def lock_free(self, c, name, devino):
        c.check()
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=c.fd)
        try:
            info = os.fstat(fd)
            need(stat.S_ISREG(info.st_mode) and [info.st_dev, info.st_ino] == devino and identity_key(info) == identity_key(c.info(name)), 'LOCK_INODE')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                need(error.errno in (errno.EAGAIN, errno.EACCES), 'LOCK_PROBE_UNKNOWN')
                result = False
            else:
                fcntl.flock(fd, fcntl.LOCK_UN)
                result = True
            c.check()
            return result
        finally:
            os.close(fd)

    def environment(self):
        # No API tokens/credentials/Java injection options copied into a public release.
        return {key: value for key, value in os.environ.items() if key in ENVIRONMENT_KEYS}

    def stdin_devnull(self):
        actual, devnull = os.fstat(0), os.stat('/dev/null', follow_symlinks=False)
        return stat.S_ISCHR(actual.st_mode) and stat.S_ISCHR(devnull.st_mode) and actual.st_rdev == devnull.st_rdev

    def cwd(self):
        return os.getcwd()


class Verified:
    def __init__(self, system):
        self.system, self.pins, self.modes = system, {}, {}

    def raw(self, path, expected=None, mode=None, cap=512 * 1024 * 1024):
        key = str(path)
        if key in self.modes:
            need(mode is None or mode == self.modes[key], 'IMMUTABLE_MODE_REBIND')
            mode = self.modes[key]
        value, info = self.system.read(path, mode, cap)
        wanted = expected or self.pins.get(key)
        need(wanted is not None and hash_value(wanted) and sha(value) == wanted, 'IMMUTABLE_CONSUMED_BUFFER_CHANGED')
        if key in self.pins:
            need(self.pins[key] == wanted, 'IMMUTABLE_REBIND')
        self.pins[key] = wanted
        if mode is not None:
            self.modes[key] = mode
        return value

    def document(self, path, expected=None, mode=None):
        return decode(self.raw(path, expected, mode, 16 * 1024 * 1024))

    def module(self, path, expected, name):
        raw = self.raw(path, expected, 0o600, 2 * 1024 * 1024)
        module = types.ModuleType(name)
        exec(compile(raw, str(path), 'exec'), module.__dict__)
        return module


def core_scope(raw):
    """The only AST delta is stdin=DEVNULL. No assignments/mains from the old unit execute."""
    need(sha(raw) == CORE_SHA, 'OWNERSHIP_CORE_CONSUMED_BUFFER')
    names = {'utc', 'pid_text', 'owned_census_keys', 'classify_owned', 'pending_owned',
             'ownership_drain_decision', 'update_owned', 'run_owned'}
    tree = ast.parse(raw)
    body = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom)) or isinstance(n, ast.FunctionDef) and n.name in names]
    need({n.name for n in body if isinstance(n, ast.FunctionDef)} == names, 'CORE_READER_CLOSURE')
    replacements = 0
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'subprocess' and node.func.attr == 'Popen':
            need(not any(k.arg == 'stdin' for k in node.keywords), 'CORE_STDIN_ALREADY_CHANGED')
            node.keywords.append(ast.keyword(arg='stdin', value=ast.Attribute(value=ast.Name(id='subprocess', ctx=ast.Load()), attr='DEVNULL', ctx=ast.Load())))
            replacements += 1
    need(replacements == 1, 'SOLE_CORE_AST_DELTA')
    scope = {}
    exec(compile(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), '<verified-ownership-core-plus-DEVNULL>', 'exec'), scope)
    return scope


def census(raw, me, parent, utility):
    rows = {}
    for line in raw.splitlines():
        words = line.split(None, 7)
        need(len(words) == 8 and words[0].isdigit() and words[1].isdigit(), 'CENSUS_INCOMPLETE')
        pid, ppid = int(words[0]), int(words[1])
        need(pid > 0 and ppid >= 0 and pid not in rows, 'CENSUS_PID_DUPLICATE')
        rows[pid] = {'pid': pid, 'ppid': ppid, 'start': ' '.join(words[2:7]), 'argvHash': sha(words[7].encode()),
                     'projectMarkerCandidate': any(t in words[7] for t in ('GradleDaemon', 'GradleWrapperMain', 'GradleWorkerMain', 'worker.org.gradle', 'obs007-joined-', 'obs015-prefix-sync-', 'checks-guided-'))}
    need(bool(rows) and me in rows and parent in rows and rows[me]['ppid'] == parent, 'CENSUS_UNANCHORED')
    probe = rows.get(utility['pid'])
    need(utility['terminal'] is True and type(utility['status']) is int and utility['status'] == 0 and probe is not None and probe['ppid'] == me and probe['argvHash'] == sha(' '.join(utility['command']).encode()), 'CENSUS_EXACT_WAITED_PROBE')
    utility['start'] = probe['start']
    return rows


def descendants(rows, roots):
    found = set(roots)
    while True:
        more = found | {pid for pid, row in rows.items() if row['ppid'] in found}
        if found == more:
            return found
        found = more


def xml_metadata(raw):
    """Only testcase attributes and child element names. No message/text/system-stream export."""
    need(type(raw) is bytes and len(raw) <= 16 * 1024 * 1024 and b'<!DOCTYPE' not in raw and b'<!ENTITY' not in raw, 'XML_BOUNDED_NO_ENTITIES')
    result, active = [], []
    parser = xml.parsers.expat.ParserCreate()
    def start(name, attributes):
        if name == 'testcase':
            need(not active, 'XML_NESTED_TESTCASE')
            active.append({'task': 'test', 'class': attributes.get('classname'), 'name': attributes.get('name'), 'status': 'PASS'})
        elif active and name in ('failure', 'error', 'skipped'):
            if name == 'skipped':
                active[0]['status'] = 'SKIP'
            elif active[0]['status'] != 'SKIP':
                active[0]['status'] = 'FAIL'
    def end(name):
        if name == 'testcase':
            need(len(active) == 1, 'XML_CASE_CLOSE')
            result.append(active.pop())
    parser.StartElementHandler, parser.EndElementHandler = start, end
    parser.ExternalEntityRefHandler = lambda *unused: 0
    parser.Parse(raw, True)
    need(not active and len(result) == 1 and result[0]['class'] == CLASS and result[0]['name'] == METHOD + '()' and result[0]['status'] != 'SKIP', 'ONE_EXACT_CURRENT_SELECTED_ZERO_SKIP')
    return result[0]


class Effects:
    def __init__(self, system, verified, authority, policy, contract, namespace, unit):
        self.sys, self.v, self.a, self.policy, self.contract = system, verified, authority, policy, contract
        self.c, self.unit = namespace, unit
        self.client, self.utilities, self.sequence, self.loaded_local = None, [], 0, {}
        self.observation_sequence = 0
        self.registration_complete = False
        self.gaps = {key: False for key in policy.GAPS}
        self.scope, self.receipt = None, None
        self.plan = self.v.document(ROOT / PLAN, PLAN_SHA)
        self.pin = self.root_document('active-lock.json', authority['activeLockSha256'])
        need(self.pin.get('rootUnitAuthorizationSha256') == authority['releaseSha256'] and self.pin.get('kernelExclusiveLockObserved') is True, 'NEW_LOCK_RELEASE_BINDING')
        holder_fields = ('wrapperPid', 'shellPid', 'wrapperStart', 'shellStart', 'wrapperArgvSha256', 'shellArgvSha256', 'lockDevInode', 'wrapperLockFd')
        need(authority.get('holderIdentity') == {key: self.pin.get(key) for key in holder_fields}, 'ROOT_LITERAL_HOLDER_IDENTITY')

    def root_document(self, name, expected=None):
        raw = self.c.read(name, 0o600)[0]
        wanted = expected or self.loaded_local.get(name)
        # First-seen root records are actual future immutable decisions; pin their consumed bytes.
        need(wanted is None or sha(raw) == wanted, 'LOCAL_IMMUTABLE_CHANGED')
        self.loaded_local[name] = sha(raw)
        return decode(raw)

    def local_hash(self, name):
        self.root_document(name)
        return self.loaded_local[name]

    def write_once(self, name, value):
        need(member(name), 'OUTPUT_NAME')
        self.c.write(name, packed(value) + b'\n')

    def claim_once(self, phase):
        need(phase in PHASES, 'CLAIM_PHASE')
        self.write_once(phase + '-consumed.json', {'phase': phase, 'releaseSha256': self.a['releaseSha256'], 'client': self.client, 'atEpoch': self.now(), 'attemptCap': 1})

    def now(self):
        value = self.sys.now()
        need(type(value) in (int, float) and math.isfinite(value), 'FINITE_CLOCK')
        return value

    def utility(self, command, allowed=(0,)):
        need(type(command) is list and command and all(type(x) is str for x in command) and type(allowed) is tuple and all(type(x) is int and x in (0, 1) for x in allowed), 'UTILITY_SCOPE')
        binding = self.a['observationExecutables'].get(command[0])
        need(type(binding) is dict, 'UNBOUND_UTILITY')
        self.v.raw(Path(binding['path']), binding['sha256'])
        actual = [binding['path'], *command[1:]]
        # No subprocess.run(timeout), communicate(timeout), signal or implicit kill.
        child = self.sys.popen(actual, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        record = {'kind': 'WAITED_UTILITY', 'client': self.client, 'releaseSha256': self.a['releaseSha256'], 'pid': child.pid,
                  'command': actual, 'executableSha256': binding['sha256'], 'terminal': False, 'status': None,
                  'stdoutComplete': False, 'stderrComplete': False, 'stderrEmpty': False, 'allowedStatuses': list(allowed)}
        self.sequence += 1
        try:
            record['kernelIdentity'] = self.sys.utility_identity(child.pid, binding['path'])
            output, error = child.communicate()
            record.update(terminal=True, status=child.returncode, stdoutComplete=type(output) is str, stderrComplete=type(error) is str, stderrEmpty=error == '')
            need(type(child.returncode) is int and child.returncode in allowed and type(output) is str and type(error) is str and error == '', 'UTILITY_TERMINAL_OUTPUT_UNKNOWN')
            if child.returncode == 1:
                need(output == '' and command[0] in ('/bin/ps', '/usr/sbin/lsof'), 'UTILITY_NO_RESULT_SCOPE')
            record['stdoutSha256'], record['stdoutBytes'] = sha(output.encode()), len(output.encode())
            self.v.raw(Path(binding['path']), binding['sha256'])
            return output, record
        finally:
            # Waiting is unconditional after successful Popen, including identity/capture errors.
            while child.poll() is None:
                try:
                    # Drain both pipes even if identity acquisition failed before capture.
                    child.communicate()
                except BaseException:
                    self.gaps['waitObservationGap'] = True
                    self.sys.sleep(1)
            record['waitedStatus'] = child.wait()
            self.utilities.append(record)
            if self.client is not None and self.client.get('identityComplete') is True:
                self.write_once(self.utility_name(self.sequence), record)

    def utility_name(self, number):
        return 'utility-' + str(self.sys.pid()) + '-' + sha(self.client['start'].encode())[:16] + '-' + str(number) + '.json'

    def table(self):
        text, probe = self.utility(['/bin/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,command='])
        rows = census(text, self.sys.pid(), self.sys.ppid(), probe)
        self.last_probe = probe
        return rows

    def pid_text(self, pid, column):
        need(type(pid) is int and pid > 0 and column in ('lstart', 'comm', 'command'), 'PID_FIELD_SCOPE')
        return self.utility(['/bin/ps', '-ww', '-p', str(pid), '-o', column + '='], (0, 1))[0].strip() or None

    def fingerprint(self, row, python=False):
        pid = row['pid']
        before = {k: self.pid_text(pid, k) for k in ('lstart', 'comm', 'command')}
        need(before['lstart'] == row['start'] and type(before['comm']) is str and type(before['command']) is str and sha(before['command'].encode()) == row['argvHash'], 'IDENTITY_START_ARGV')
        image = Path(before['comm'])
        need(image.is_absolute(), 'ABSOLUTE_PROCESS_IMAGE')
        mapping = self.utility(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'txt', '-F', 'n'])[0]
        need('n' + str(image) in mapping.splitlines(), 'EXACT_PROCESS_IMAGE_MAPPING')
        binary, info = self.sys.read(image)
        if python:
            roles, reported = self.a['pythonRoles'], self.sys.python()
            need(str(image) == roles['process']['path'] and sha(binary) == roles['process']['sha256'], 'CLIENT_PROCESS_ROLE')
            need(reported == {'reported': roles['reported']['path'], 'observedArgument': roles['observedArgument']['path']}, 'CLIENT_REPORT_ARGUMENT_ROLE')
            for item in roles.values():
                self.v.raw(Path(item['path']), item['sha256'])
        after = {k: self.pid_text(pid, k) for k in ('lstart', 'comm', 'command')}
        last, last_info = self.sys.read(image)
        mapping2 = self.utility(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'txt', '-F', 'n'])[0]
        need(before == after and file_key(info) == file_key(last_info) and binary == last and 'n' + str(image) in mapping2.splitlines(), 'IDENTITY_CHANGED')
        return {**row, 'identityComplete': True, 'commHash': sha(before['comm'].encode()), 'executableHash': sha(str(image).encode()), 'executableFileHash': sha(binary)}

    def register(self, mode):
        self.mode = mode
        self.client = {'pid': self.sys.pid(), 'start': 'REGISTRATION_PENDING'}
        rows = self.table()
        self.client = self.fingerprint(rows[self.sys.pid()], True)
        need(self.client['ppid'] == self.sys.ppid(), 'CLIENT_PARENT')
        self.client_name = 'client-' + str(self.client['pid']) + '-' + sha(self.client['start'].encode())[:16] + '.json'
        self.write_once(self.client_name, {'kind': 'VERIFICATION_CLIENT', 'mode': mode, 'releaseSha256': self.a['releaseSha256'], 'identity': self.client})
        for number, record in enumerate(self.utilities, 1):
            record['client'] = self.client
            self.write_once(self.utility_name(number), record)
        self.registration_complete = True

    def source(self):
        plan = self.plan
        text = self.utility(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', *plan['captureScope']])[0]
        names = sorted(set(x for x in text.split('\0') if x and '.claude' not in PurePosixPath(x).parts))
        expected = {x['path']: x['sha256'] for x in plan['source']['files']}
        need(all(relative(x) for x in names) and set(names) == set(expected), 'WHOLE_SOURCE_INVENTORY')
        rows, modes, replay_info = [], {}, None
        for name in names:
            data, info = self.sys.read(ROOT / name)
            need(stat.S_ISREG(info.st_mode), 'SOURCE_REGULAR')
            need(info.st_uid == self.sys.uid(), 'SOURCE_OWNER')
            rows.append({'path': name, 'sha256': sha(data)})
            modes[name] = stat.S_IMODE(info.st_mode)
            if name == REPLAY:
                replay_info = info
            if name != REPLAY:
                need(sha(data) == expected[name], 'NONLEASE_SOURCE_CHANGED')
        need(len(rows) == 1808 and sum(x['path'].startswith('backend/src/main/') for x in rows) == 506 and modes == plan['sourceModes'], 'SOURCE_COUNTS_MODES')
        replay_hash = next(x['sha256'] for x in rows if x['path'] == REPLAY)
        disposition = 'RESTORED' if replay_hash == self.a['preimageSha256'] else 'CANDIDATE' if replay_hash == self.a['postimageSha256'] else 'UNKNOWN'
        expected_digest = self.policy.BASE if disposition == 'RESTORED' else self.policy.CANDIDATE
        need(disposition != 'UNKNOWN' and sha(packed(rows)) == expected_digest, 'SOURCE_WHOLE_DIGEST')
        if not self.c.absent('source-backup.json'):
            backup = self.root_document('source-backup.json')
            lease = self.v.document(LEASE, backup['leaseSha256'], 0o600)
            need(lease.get('rootReleaseSha256') == self.a['releaseSha256'] and lease.get('activeLockSha256') == self.a['activeLockSha256'] and lease.get('path') == REPLAY and lease.get('exclusive') is True and lease.get('onlyWriter') is True and lease.get('nonIrCertified') is True and tuple(lease.get('sourceIdentity', [])) == tuple(backup['sourceIdentity']) == identity_key(replay_info), 'CURRENT_EXACT_SOURCE_LEASE_INODE')
            need(sha(self.c.read('Replay.actual-backup.java', 0o600)[0]) == backup['preimageSha256'] == self.a['preimageSha256'], 'CURRENT_OWN_BACKUP')
        else:
            need(disposition == 'RESTORED', 'CANDIDATE_WITHOUT_OWN_SOURCE_LEASE')
        dist = self.tree_files(ROOT / 'studio-runner/dist')
        dist_rows = [{'path': x, 'sha256': sha(self.sys.read(ROOT / 'studio-runner/dist' / x)[0])} for x in dist]
        need(dist_rows == plan['source']['dist']['files'] and len(dist_rows) == 238, 'DIST_LITERAL')
        helm = {str(Path('helm-chart') / x): sha(self.sys.read(ROOT / 'helm-chart' / x)[0]) for x in self.tree_files(ROOT / 'helm-chart')}
        need(helm == plan['helm'], 'HELM_LITERAL')
        for name, value in {**plan['quotedCurrent'], **plan['immutableHelpers']}.items():
            if name == REPLAY:
                need(value == self.a['preimageSha256'], 'AUX_REPLAY_PREIMAGE')
                continue
            self.v.raw(ROOT / name, value)
        return {'sourceDisposition': disposition, 'sourceDigest': expected_digest, 'replaySha256': replay_hash, 'replayMode': modes[REPLAY], 'allOtherSourceModesEqualF9': True}

    def tree_files(self, path):
        c = self.sys.custody(path)
        try:
            output = []
            for name in c.members():
                info = c.info(name)
                if stat.S_ISDIR(info.st_mode):
                    output += [name + '/' + x for x in self.tree_files(Path(path) / name)]
                else:
                    need(stat.S_ISREG(info.st_mode), 'TREE_LINK_OR_SPECIAL')
                    output.append(name)
            c.check()
            return sorted(output)
        finally:
            c.close()

    def history(self, rows):
        clients, owned = [], []
        for name in self.c.members():
            need(name in self.a['controlMembers'] or re.fullmatch(r'(?:client-[0-9]+-[0-9a-f]{16}|(?:utility|observation)-[0-9]+-[0-9a-f]{16}-[0-9]+|native-(?:selected|compile-restored)-[0-9]+)\.json', name) is not None, 'UNEXPECTED_CONTROL_MEMBER')
            info = self.c.info(name)
            need(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == self.sys.uid() and info.st_nlink == 1, 'CONTROL_MEMBER_OWNER_MODE_IDENTITY')
            if name.startswith('client-'):
                value = self.root_document(name)
                who = value['identity']
                need(value['kind'] == 'VERIFICATION_CLIENT' and value['releaseSha256'] == self.a['releaseSha256'] and value['mode'] in PHASES and who.get('identityComplete') is True and type(who.get('pid')) is int and who['pid'] > 0 and type(who.get('ppid')) is int and who['ppid'] > 0 and type(who.get('start')) is str and bool(who['start']) and all(hash_value(who.get(k)) for k in ('argvHash', 'commHash', 'executableHash', 'executableFileHash')) and name == 'client-' + str(who['pid']) + '-' + sha(who['start'].encode())[:16] + '.json', 'CLIENT_JOURNAL')
                clients.append(who)
            elif name.startswith('utility-'):
                value = self.root_document(name)
                need(value['kind'] == 'WAITED_UTILITY' and value['releaseSha256'] == self.a['releaseSha256'] and value['terminal'] is True and type(value['status']) is int and value['status'] == value['waitedStatus'] and value['status'] in value['allowedStatuses'] and value['stdoutComplete'] is True and value['stderrComplete'] is True and value['stderrEmpty'] is True and type(value['pid']) is int and value['pid'] > 0 and value.get('kernelIdentity', {}).get('kernelIdentityComplete') is True and value['kernelIdentity']['pid'] == value['pid'], 'UTILITY_HISTORY_INCOMPLETE')
            elif name in ('selected-drain.json', 'compile-restored-drain.json'):
                receipt = self.root_document(name)
                need(all(receipt.get(k) is False for k in self.policy.GAPS), 'STICKY_NATIVE_GAP')
                owned += receipt['ownedIdentities']
            elif name.startswith('observation-'):
                observation = self.root_document(name)
                need(observation.get('releaseSha256') == self.a['releaseSha256'] and observation.get('activeLockSha256') == self.a['activeLockSha256'], 'OBSERVATION_JOURNAL_BINDING')
        need(self.client in clients, 'CURRENT_CLIENT_NOT_JOURNALED')
        need(not any(x != self.client and rows.get(x['pid'], {}).get('start') == x['start'] for x in clients), 'PRIOR_CLIENT_STILL_LIVE')
        return clients, owned

    def holder(self, rows, postclose=False):
        pin = self.pin
        exact = {pin[r + 'Pid'] for r in ('wrapper', 'shell') if rows.get(pin[r + 'Pid'], {}).get('start') == pin[r + 'Start']}
        if not postclose:
            need(len(exact) == 2 and self.sys.ppid() == pin['shellPid'] and rows[pin['shellPid']]['ppid'] == pin['wrapperPid'], 'SAME_CONTROLLER_START_PARENT')
            for role in ('wrapper', 'shell'):
                need(rows[pin[role + 'Pid']]['argvHash'] == pin[role + 'ArgvSha256'], 'CONTROLLER_ARGV')
            wrapper = shlex.split(self.pid_text(pin['wrapperPid'], 'command') or '')
            need(wrapper[-5:] in ([str(ROOT / WRAPPER), '/bin/bash', '--noprofile', '--norc', '-i'], [WRAPPER, '/bin/bash', '--noprofile', '--norc', '-i']) and shlex.split(self.pid_text(pin['shellPid'], 'command') or '') == ['/bin/bash', '--noprofile', '--norc', '-i'], 'EXACT_WRAPPER_SHELL_COMMAND')
            fields = self.utility(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pin['wrapperPid']), '-F', 'pfnil', '--', str(LOCK)])[0].splitlines()
            need(type(pin.get('wrapperLockFd')) is int and pin['wrapperLockFd'] >= 0 and 'p' + str(pin['wrapperPid']) in fields and 'i' + str(pin['lockDevInode'][1]) in fields and 'f' + str(pin['wrapperLockFd']) in fields and 'lW' in fields, 'WRAPPER_LOCK_DESCRIPTOR')
        else:
            need(not exact, 'CONTROLLER_STILL_LIVE')
        c = self.sys.custody(LOCK.parent)
        try:
            free = self.sys.lock_free(c, LOCK.name, pin['lockDevInode'])
        finally:
            c.close()
        need(free is postclose, 'KERNEL_HOLD_OR_FREE')
        self.v.raw(ROOT / WRAPPER, WRAPPER_SHA)
        return exact

    def current(self, postclose=False):
        before = self.source()
        snapshots = []
        for unused in range(2):
            rows = self.table()
            self.fingerprint(rows[self.sys.pid()], True)
            controllers = self.holder(rows, postclose)
            clients, owned = self.history(rows)
            baseline = self.v.document(ROOT / self.plan['baselinePath'], self.plan['immutableHelpers'][self.plan['baselinePath']])
            need(len(baseline['identities']) == 6 and {x['pid'] for x in baseline['identities']} == {2366, 5083, 5095, 13577, 13581, 64376}, 'INHERITED_EXACT_SIX')
            inherited = {(x['pid'], x['start']) for x in baseline['identities']}
            fields = ('pid', 'start', 'commHash', 'argvHash', 'executableHash', 'executableFileHash')
            for old in baseline['identities']:
                row = rows.get(old['pid'])
                need(row is not None and row['start'] == old['start'], 'INHERITED_ABSENT_OR_REUSED')
                observed = self.fingerprint(row)
                need(all(observed[k] == old[k] for k in fields), 'INHERITED_CHANGED')
            live = [x for x in owned if rows.get(x['pid'], {}).get('start') == x['start']]
            need(not live, 'FINITE_OWNED_LIVE')
            roots = {self.sys.pid()} | controllers
            tree = descendants(rows, roots)
            # Exempt only PID/start qualified controllers and this census's waited ps probe.
            probe = self.last_probe
            need(rows.get(probe['pid'], {}).get('start') == probe['start'], 'WAITED_CENSUS_PROBE_START')
            unexpected = tree - roots - {probe['pid']}
            need(not unexpected, 'UNBOUND_DESCENDANTS')
            need(not [r for r in rows.values() if r['projectMarkerCandidate'] and (r['pid'], r['start']) not in inherited], 'CURRENT_PROJECT_RESOURCE')
            listeners = self.utility(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], (0, 1))[0]
            relevant = tree | {x['pid'] for x in owned if rows.get(x['pid'], {}).get('start') == x['start']} | {x['pid'] for x in clients if rows.get(x['pid'], {}).get('start') == x['start']}
            listener_pids = {int(line[1:]) for line in listeners.splitlines() if line.startswith('p') and line[1:].isdigit()}
            need(not (listener_pids & relevant), 'OWNED_LISTENER')
            snapshots.append({'censusRows': len(rows), 'censusProbe': probe, 'inheritedMatched': 6, 'ownedIdentities': len(owned), 'observedAtEpoch': self.now()})
        after = self.source()
        need(before == after, 'SOURCE_CHANGED_ACROSS_RESOURCE_OBSERVATION')
        for path, expected in list(self.v.pins.items()):
            self.v.raw(Path(path), expected)
        for name in list(self.loaded_local):
            self.root_document(name)
        self.c.check()
        facts = {**after, 'releaseSha256': self.a['releaseSha256'], 'activeLockSha256': self.a['activeLockSha256'],
                 'inheritedSixExactUnchanged': True, 'ownedLive': [], 'unexpectedDescendants': [], 'ownedListeners': [],
                 'completeAnchoredCensuses': True, 'allUtilityCapturesWaitedComplete': all(x['terminal'] is True and x['stdoutComplete'] is True and x['stderrComplete'] is True and x['stderrEmpty'] is True for x in self.utilities),
                 'priorClientsAbsentOrQualifiedReuse': True, 'currentClientFullyFingerprinted': True,
                 'sameOriginalWrapperShellStart': not postclose, 'sameKernelLockHeld': not postclose,
                 'controllersAbsentOrQualifiedReuse': postclose, 'sameLockInodeKernelFree': postclose, 'snapshots': snapshots, **self.gaps}
        self.policy.current(facts, self.a, after['sourceDisposition'], held=not postclose)
        self.observation_sequence += 1
        name = 'observation-' + str(self.client['pid']) + '-' + sha(self.client['start'].encode())[:16] + '-' + str(self.observation_sequence) + '.json'
        self.write_once(name, facts)
        return dict(facts, observationJournal=name, observationJournalSha256=sha(packed(facts) + b'\n'))

    def require_phase(self, phase, **wanted):
        value = self.root_document(phase + '-result.json')
        need(value.get('phase') == phase and all(type(value.get(k)) is type(v) and value[k] == v for k, v in wanted.items()), 'PHASE_RESULT')
        consumed = self.root_document(phase + '-consumed.json')
        need(consumed['releaseSha256'] == self.a['releaseSha256'] and consumed['phase'] == phase and type(consumed['attemptCap']) is int and consumed['attemptCap'] == 1, 'PHASE_CONSUMED')
        return value

    def require_phase_terminal(self, phase):
        result = self.require_phase(phase)
        need(type(result.get('phaseExit')) is int and result.get('disposition') != 'RUNNING', 'PHASE_NOT_TERMINAL')
        self.finally_record_owned_drain(phase, existing=True)

    def require_root_phase_decision(self, decision):
        names = {'AUTHORIZE_ONE_SELECTED_NATIVE': 'selected', 'AUTHORIZE_EXACT_REPLAY_RESTORE': 'restore', 'AUTHORIZE_ONE_RESTORED_COMPILE_ONLY': 'compile-restored', 'AUTHORIZE_ONE_PUBLIC_RECORD_COLLECTION': 'collect-public'}
        need(decision in names, 'ROOT_PHASE_DECISION_SCOPE')
        value = self.root_document('root-' + names[decision] + '-decision.json')
        need(value.get('authorizedBy') == 'root' and value.get('decision') == decision and value.get('releaseSha256') == self.a['releaseSha256'] and value.get('activeLockSha256') == self.a['activeLockSha256'] and type(value.get('maximumInvocations')) is int and value['maximumInvocations'] == 1 and type(value.get('actualPriorEvidence')) is dict and bool(value['actualPriorEvidence']), 'ROOT_PHASE_DECISION')
        for name, expected in value['actualPriorEvidence'].items():
            need(member(name) and hash_value(expected) and self.local_hash(name) == expected, 'ROOT_PRIOR_EVIDENCE_PIN')
        need(value.get('operatorSeparateDecision') is True, 'SEPARATE_ROOT_PHASE')
        need(value.get('priorActualToolStatusesSeparatelyCaptured') is True and type(value.get('actualToolEvidence')) is list and bool(value['actualToolEvidence']) and all(type(x) is str and bool(x) for x in value['actualToolEvidence']), 'PRIOR_ACTUAL_TOOL_STATUS_EVIDENCE')
        required = {'selected': {'stage-result.json', 'root-admission.json', 'held-proof.json'},
                    'restore': {'selected-result.json', 'selected-drain.json'},
                    'compile-restored': {'restore-result.json'},
                    'collect-public': {'selected-result.json', 'selected-drain.json'}}[names[decision]]
        need(required <= set(value['actualPriorEvidence']), 'ROOT_PHASE_REQUIRED_PRIOR_FACTS')
        return value

    def validate_negative(self):
        denial = self.root_document('negative-readiness-denial.json')
        need(denial.get('reason') == 'MISSING_READINESS' and type(denial.get('status')) is int and denial['status'] == 1 and denial.get('releaseSha256') == self.a['releaseSha256'] and denial.get('activeLockSha256') == self.a['activeLockSha256'] and type(denial.get('shellPid')) is int and denial['shellPid'] == self.pin['shellPid'] and denial.get('readinessAbsent') is True and denial.get('permitAbsent') is True, 'EXACT_ACTUAL_NEGATIVE')
        name = denial.get('clientJournal')
        need(member(name), 'NEGATIVE_CLIENT_JOURNAL_NAME')
        journal = self.root_document(name)
        need(journal.get('kind') == 'VERIFICATION_CLIENT' and journal.get('mode') == 'gate' and journal.get('releaseSha256') == self.a['releaseSha256'] and journal.get('identity', {}).get('identityComplete') is True and journal['identity'].get('ppid') == self.pin['shellPid'] and denial.get('clientJournalSha256') == self.local_hash(name), 'NEGATIVE_CLIENT_JOURNAL_CHAIN')
        return denial

    def require_negative_and_held_admission(self, unused):
        ad = self.root_document('root-admission.json')
        denial, held = self.validate_negative(), self.root_document('held-proof.json')
        need(ad.get('authorizedBy') == 'root' and ad.get('releaseSha256') == self.a['releaseSha256'] and ad.get('activeLockSha256') == self.a['activeLockSha256'], 'ROOT_ADMISSION')
        for key, value in {'setupActualStatus': 0, 'negativeActualStatus': 1, 'heldProofActualStatus': 0}.items():
            need(type(ad.get(key)) is int and ad[key] == value, 'SEPARATE_ADMISSION_STATUS')
        need(all(ad.get(k) is True for k in ('setupSeparateStatusCaptured', 'negativeSeparateStatusCaptured', 'heldProofSeparateStatusCaptured', 'newReadonlyFunctionInspected', 'sameOriginalHolderAfterDenial', 'configuredLaunchInspected')), 'ADMISSION_INSPECTION')
        need(ad.get('configuredLaunch') == self.a['pythonRoles']['launch'] and type(ad.get('exactOperatorCommandEvidence')) is list and bool(ad['exactOperatorCommandEvidence']), 'ACTUAL_REQUESTED_LAUNCH_TRACE')
        need(ad.get('negativeDenialSha256') == self.local_hash('negative-readiness-denial.json') and ad.get('heldProofSha256') == self.local_hash('held-proof.json') and held.get('negativeDenialSha256') == ad['negativeDenialSha256'], 'ADMISSION_CHAIN')
        need(denial.get('reason') == 'MISSING_READINESS' and type(denial.get('status')) is int and denial['status'] == 1 and denial.get('readinessAbsent') is True and denial.get('permitAbsent') is True and denial.get('releaseSha256') == self.a['releaseSha256'] and held.get('releaseSha256') == self.a['releaseSha256'] and type(held.get('verificationExit')) is int and held['verificationExit'] == 0, 'NEGATIVE_HELD_RECORD')
        need(member(held.get('clientJournal')) and held.get('clientJournalSha256') == self.local_hash(held['clientJournal']), 'HELD_CLIENT_JOURNAL_HASH')
        journal = self.root_document(held['clientJournal'])
        need(journal.get('kind') == 'VERIFICATION_CLIENT' and journal.get('mode') == 'held-proof' and journal.get('releaseSha256') == self.a['releaseSha256'] and journal.get('identity', {}).get('identityComplete') is True and journal['identity'].get('ppid') == self.pin['shellPid'], 'HELD_CLIENT_JOURNAL_CHAIN')
        for facts in (held['first'], held['second']):
            self.policy.current(facts, self.a, 'RESTORED')

    def install_exact_replay(self, preimage, postimage, mode):
        need(preimage == self.a['preimageSha256'] and postimage == self.a['postimageSha256'] and mode == 0o644, 'INSTALL_LITERAL')
        # New lease path is never reused/removed; no generic source pathname enters this operation.
        lease_parent = self.sys.custody(LEASE.parent)
        source_parent = self.sys.custody((ROOT / REPLAY).parent)
        try:
            need(lease_parent.absent(LEASE.name), 'LEASE_ALREADY_EXISTS')
            before, info = source_parent.read(Path(REPLAY).name, mode)
            need(sha(before) == preimage and info.st_uid == self.sys.uid(), 'STAGE_CURRENT_PREIMAGE_OWNER')
            lease = {'label': LABEL, 'exclusive': True, 'rootReleaseSha256': self.a['releaseSha256'], 'activeLockSha256': self.a['activeLockSha256'], 'path': REPLAY, 'sourceIdentity': list(identity_key(info)), 'preimageSha256': preimage, 'postimageSha256': postimage, 'onlyWriter': True, 'nonIrCertified': True}
            lease_parent.write(LEASE.name, packed(lease) + b'\n')
            self.write_once('source-backup.json', {'leaseSha256': sha(packed(lease) + b'\n'), 'sourceIdentity': list(identity_key(info)), 'preimageSha256': sha(before), 'mode': mode})
            self.c.write('Replay.actual-backup.java', before)
            candidate = self.v.raw(CONTROL / 'Replay.postimage.java', postimage, 0o600)
            reviewed = self.v.raw(CONTROL / 'Replay.preimage.java', preimage, 0o600)
            need(before == reviewed, 'OWN_BACKUP_EQUALS_REVIEWED')
            source_parent.replace_exact(Path(REPLAY).name, before, candidate, identity_key(info), mode)
        finally:
            source_parent.close()
            lease_parent.close()

    def restore_exact_replay(self, postimage, preimage, mode):
        need(postimage == self.a['postimageSha256'] and preimage == self.a['preimageSha256'] and mode == 0o644, 'RESTORE_LITERAL')
        backup = self.root_document('source-backup.json')
        lease = self.v.document(LEASE, backup['leaseSha256'], 0o600)
        need(lease['rootReleaseSha256'] == self.a['releaseSha256'] and lease['path'] == REPLAY and lease['exclusive'] is True and lease['sourceIdentity'] == backup['sourceIdentity'], 'OWN_SOURCE_LEASE')
        raw = self.c.read('Replay.actual-backup.java', 0o600)[0]
        need(sha(raw) == backup['preimageSha256'] == preimage and raw == self.v.raw(CONTROL / 'Replay.preimage.java', preimage, 0o600), 'OWN_EXACT_BACKUP')
        candidate = self.v.raw(CONTROL / 'Replay.postimage.java', postimage, 0o600)
        c = self.sys.custody((ROOT / REPLAY).parent)
        try:
            current, info = c.read(Path(REPLAY).name, mode)
            need(identity_key(info) == tuple(backup['sourceIdentity']) and current in (candidate, raw), 'RESTORE_ONLY_OWNED_BYTES')
            if current == candidate:
                c.replace_exact(Path(REPLAY).name, candidate, raw, backup['sourceIdentity'], mode)
        finally:
            c.close()

    def cohort_roots(self):
        # Directory metadata only, no traversal of any private artifact body.
        try:
            c = self.sys.custody(COHORTS)
        except FileNotFoundError:
            return []
        try:
            names = c.members()
            need(all(UUID.fullmatch(n) and stat.S_ISDIR(c.info(n).st_mode) for n in names), 'COHORT_RUN_NAMES')
            return names
        finally:
            c.close()

    def fresh_metadata(self, path, started, ended, cap=16 * 1024 * 1024):
        raw, info = self.sys.read(path, cap=cap)
        need(started <= info.st_mtime_ns / 1e9 <= ended + 2 and len(raw) > 0, 'METADATA_NOT_CURRENT_NONEMPTY')
        return raw

    def selected_metadata(self, receipt, log_events):
        case = xml_metadata(self.fresh_metadata(XML, receipt['startedAtEpoch'], receipt['endedAtEpoch']))
        new_runs = set(self.cohort_roots()) - set(receipt['cohortRunDirectoriesBefore'])
        need(len(new_runs) == 1, 'EXACT_ONE_NEW_COHORT_RUN')
        run = new_runs.pop()
        c = self.sys.custody(COHORTS / run)
        try:
            names = c.members()
            need(len(names) == 1 and UUID.fullmatch(names[0]) is not None and stat.S_ISDIR(c.info(names[0]).st_mode), 'EXACT_ONE_NEW_COHORT')
            cohort_id = names[0]
        finally:
            c.close()
        path = COHORTS / run / cohort_id
        cohort = decode(self.fresh_metadata(path / 'cohort.json', receipt['startedAtEpoch'], receipt['endedAtEpoch']))
        guard = self.fresh_metadata(path / 'guard-tally.json', receipt['startedAtEpoch'], receipt['endedAtEpoch'])
        canonical = self.fresh_metadata(CANONICAL_GUARD, receipt['startedAtEpoch'], receipt['endedAtEpoch'])
        need(guard == canonical and type(decode(guard)) is dict, 'EXACT_GUARD_CONSISTENCY')
        invocations = cohort.get('invocations')
        need(cohort.get('lane') == 'test' and cohort.get('profile') == 'original4000' and cohort.get('runId') == run and cohort.get('cohortId') == cohort_id and type(invocations) is list and len(invocations) == 1, 'EXACT_SELECTED_COHORT')
        invocation = invocations[0]
        need(invocation.get('method') == METHOD and invocation.get('displayLabel') == METHOD + '()' and invocation.get('variant') == 'singleton' and type(invocation.get('passed')) is bool and invocation['passed'] == (case['status'] == 'PASS') and invocation.get('afterEachComplete') is True, 'SELECTED_AFTER_EACH_XML_JOIN')
        need(all(cohort.get(k) is True for k in self.policy.COHORT_FLAGS) and type(cohort.get('retentionFailures')) is int and cohort['retentionFailures'] == 0, 'SELECTED_LIFECYCLE_FLAGS')
        need(log_events.get('retainOriginalGuidedCohort') == 'EXECUTED', 'REAL_COHORT_FINALIZER')
        return {'junitInvocations': 1, 'exactMethod': CLASS + '.' + METHOD, 'skips': 0, 'case': case,
                'afterEachComplete': True, 'classLifecycleAccounted': True, 'normalFixturePrivateArtifactsSealed': True,
                'retainOriginalGuidedCohortTaskSuccess': True, **{k: cohort[k] for k in self.policy.COHORT_FLAGS},
                'metadataProof': {'xmlSha256': sha(self.fresh_metadata(XML, receipt['startedAtEpoch'], receipt['endedAtEpoch'])), 'cohortSha256': sha(packed(cohort)), 'guardSha256': sha(guard), 'rawBodyOrPrivateSiblingRead': False}}

    def run_owned(self, command, cwd, phase):
        need(cwd == 'backend' and phase in ('selected', 'compile-restored') and command == (self.policy.SELECTED if phase == 'selected' else self.policy.COMPILE), 'EXACT_NATIVE_PHASE')
        need(self.a['metadataScope'] == {'xml': str(XML.relative_to(ROOT)), 'cohortRoot': str(COHORTS.relative_to(ROOT)), 'cohortMembers': ['cohort.json', 'guard-tally.json'], 'canonicalGuard': str(CANONICAL_GUARD.relative_to(ROOT)), 'newRunOnly': True, 'privateBodies': False}, 'EXACT_METADATA_SCOPE')
        scope = core_scope(self.v.raw(ROOT / CORE, CORE_SHA))
        environment = self.sys.environment()
        need(set(environment) <= ENVIRONMENT_KEYS and all(type(v) is str for v in environment.values()), 'CLOSED_NATIVE_ENVIRONMENT')
        environment['JAVA_HOME'], environment['LC_ALL'] = self.plan['javaHome'], 'C'
        environment['PATH'] = self.plan['nodeBin'] + os.pathsep + self.plan['javaHome'] + '/bin' + os.pathsep + environment.get('PATH', '')
        need(environment == self.a['nativeEnvironment'], 'EXACT_NATIVE_ENVIRONMENT')
        need(environment.get('JAVA_HOME') == self.plan['javaHome'] and environment.get('LC_ALL') == 'C', 'JAVA_ENVIRONMENT')
        if phase == 'selected':
            need(self.unit.absent('public-observation.json'), 'UNUSED_PUBLIC_OUTPUT_REQUIRED')
        required_native = [{'path': self.plan['javaHome'] + '/bin/java', 'sha256': JAVA_SHA},
                           {'path': self.plan['javaHome'] + '/release', 'sha256': JAVA_RELEASE_SHA},
                           {'path': self.plan['nodeBin'] + '/node', 'sha256': NODE_SHA}]
        need(self.a['nativeExecutablePins'] == required_native, 'EXACT_JAVA21_NODE24_BINDINGS')
        for row in self.a['nativeExecutablePins']:
            need(type(row) is dict and set(row) == {'path', 'sha256'}, 'NATIVE_BINARY_RECORD')
            self.v.raw(Path(row['path']), row['sha256'])
        receipt = {'phase': phase, 'command': command, 'cwd': str(ROOT / 'backend'), 'fixtureProfile': 'original4000', 'startedAtEpoch': self.now(), 'nativeExit': None, 'phaseExit': 1, 'collectorInvocations': 1, 'phases': [], 'evidenceErrors': [], 'ownedIdentities': [], 'cohortRunDirectoriesBefore': self.cohort_roots() if phase == 'selected' else [], **{k: False for k in self.policy.GAPS}}
        self.receipt, self.scope = receipt, scope
        effects = self
        class SinkName:
            def open(self, mode):
                need(mode == 'xb', 'CORE_EXCLUSIVE_SINK_MODE')
                return effects.sys.sink(effects.c, phase + '-native.private.log')
        class RunSink:
            def __truediv__(self, name):
                need(name == 'collector.private.log', 'CORE_SINGLE_SINK_PATH')
                return SinkName()
        class NativeProcesses:
            DEVNULL, STDOUT, TimeoutExpired = subprocess.DEVNULL, subprocess.STDOUT, subprocess.TimeoutExpired
            @staticmethod
            def Popen(actual, **kwargs):
                need(actual == command and kwargs.get('cwd') == ROOT / 'backend' and kwargs.get('env') == environment and kwargs.get('stdin') == subprocess.DEVNULL and kwargs.get('stderr') == subprocess.STDOUT, 'CORE_NATIVE_POPEN_SCOPE')
                return effects.sys.popen(actual, **kwargs)
        def record(event, **values):
            receipt['phases'].append({'phase': event, 'atUtc': scope['utc'](), **values})
            try:
                self.write_once('native-' + phase + '-' + str(len(receipt['phases'])) + '.json', receipt)
            except BaseException:
                receipt['receiptWriteFailed'] = True
        def held(*unused):
            rows = self.table()
            self.holder(rows)
            self.v.raw(CONTROL / 'root-release.json', self.a['releaseSha256'], 0o600)
            return self.pin
        scope.update(ROOT=ROOT / 'backend', RUN=RunSink(), RECEIPT=receipt, table=self.table, capture=lambda argv, allowed=(0,): self.utility(argv, allowed)[0], record=record, parent_lock=held, subprocess=NativeProcesses, os=types.SimpleNamespace(getpid=self.sys.pid), time=types.SimpleNamespace(sleep=self.sys.sleep), utc=lambda: datetime.datetime.fromtimestamp(self.now(), datetime.timezone.utc).isoformat())
        try:
            code = scope['run_owned'](command, environment, self.plan, LABEL, CONTROL / 'root-release.json')
            need(type(code) is int, 'NATIVE_RAW_STATUS')
            receipt['nativeExit'], receipt['phaseExit'] = code, code
        except BaseException:
            receipt['phaseExit'] = receipt['nativeExit'] or 1
            raise
        finally:
            receipt['endedAtEpoch'] = self.now()
            receipt['nativeExit'] = receipt.get('collectorExit', receipt['nativeExit'])
            # Core's finally completes before this point, including BaseException paths.
            self.finally_record_owned_drain(phase)
        log, unused = self.sys.read(CONTROL / (phase + '-native.private.log'), 0o600, 128 * 1024 * 1024)
        events = {}
        successful, failed = False, False
        # Project fixed task markers only. Raw text remains in exclusive private sink.
        for line in log.decode('utf-8', 'replace').splitlines():
            match = re.fullmatch(r'> Task :([A-Za-z0-9_]+)(?: (EXECUTED|FAILED|SKIPPED|UP-TO-DATE|NO-SOURCE|FROM-CACHE))?', line)
            if match:
                events[match[1]] = match[2] or 'EXECUTED'
            successful |= re.fullmatch(r'BUILD SUCCESSFUL in [0-9hms .]+', line) is not None
            failed |= re.fullmatch(r'BUILD FAILED in [0-9hms .]+', line) is not None
        output = {'nativeExit': receipt['nativeExit'], 'command': command, 'fixtureProfile': 'original4000', 'collectionComplete': True, **{k: receipt.get(k, False) for k in self.policy.GAPS}}
        try:
            if phase == 'selected':
                output.update(self.selected_metadata(receipt, events))
            else:
                need(not any(k in events for k in ('test', 'guidedIncrementalTest', 'crossReplicaTest')), 'RESTORED_COMPILE_INVOKED_TESTS')
                output.update(task='compileTestJava', testsInvoked=False, compileTaskSuccess=events.get('compileTestJava') == 'EXECUTED', buildSuccessful=successful and not failed)
        except BaseException:
            output['collectionComplete'] = False
            output['metadataValidationFailed'] = True
        self.write_once(phase + '-native-result.json', output)
        return output

    def finally_record_owned_drain(self, phase, existing=False):
        name = phase + '-drain.json'
        if existing or not self.c.absent(name):
            receipt = self.root_document(name)
            need(receipt.get('phase') == phase and receipt.get('releaseSha256') == self.a['releaseSha256'], 'DRAIN_RECEIPT_BINDING')
            return receipt
        receipt = self.receipt if self.receipt is not None and self.receipt.get('phase') == phase else {'phase': phase, 'ownedIdentities': [], 'nativeExit': None, 'nativeNotStarted': True, **{k: False for k in self.policy.GAPS}}
        # If native started, no invented drain: exact extracted core has supplied both terminal sets.
        need(receipt.get('collectorPid') is None or (type(receipt.get('collectorExit')) is int and type(receipt.get('ownedJvmTerminalProof')) is list and type(receipt.get('remainingOwnedNonJvmFacts')) is list), 'CORE_DRAIN_NOT_COMPLETE')
        value = {**receipt, 'releaseSha256': self.a['releaseSha256']}
        self.write_once(name, value)
        return value

    def actual_selected_result(self):
        return self.require_phase('selected')

    def collect_public(self):
        self.claim_once('collect-public')
        self.require_phase_terminal('selected')
        self.require_root_phase_decision('AUTHORIZE_ONE_PUBLIC_RECORD_COLLECTION')
        self.require_negative_and_held_admission(self.a)
        self.current()
        # Fixed single public file only. Missing file has explicit UNAVAILABLE semantics.
        raw_records = []
        if not self.unit.absent('public-observation.json'):
            raw, info = self.unit.read('public-observation.json', 0o600, 1024 * 1024)
            receipt = self.root_document('selected-drain.json')
            need(type(receipt.get('startedAtEpoch')) in (int, float) and type(receipt.get('endedAtEpoch')) in (int, float) and receipt['startedAtEpoch'] <= info.st_mtime_ns / 1e9 <= receipt['endedAtEpoch'] + 2, 'PUBLIC_OUTPUT_CURRENT_NATIVE_INTERVAL')
            raw_records.append(raw)
        provenance = dict(self.a['collectorProvenance'], rootReleaseSha256=self.a['releaseSha256'])
        value = self.contract.collect_records(raw_records, provenance, provenance)
        self.current()
        self.write_once('public-collection.json', value)
        return value

    def public_observation_status(self):
        value = self.root_document('public-collection.json')
        need(value.get('C8Credit') is False and value.get('originalCause') == 'UNKNOWN' and value.get('runtimeStage') == 'UNKNOWN', 'PUBLIC_COLLECTION_NO_CAUSE_CREDIT')
        self.contract.validate_record(value['publicObservation'])
        need(value['provenance'] == dict(self.a['collectorProvenance'], rootReleaseSha256=self.a['releaseSha256']), 'PUBLIC_COLLECTION_PROVENANCE')
        return value['publicObservation']['captureStatus']

    def qualified_expected_wrapper_exit(self):
        value = self.root_document('root-actual-evidence-disposition.json')
        need(value.get('authorizedBy') == 'root' and value.get('releaseSha256') == self.a['releaseSha256'] and type(value.get('expectedWrapperExit')) is int and value['expectedWrapperExit'] in (0, 1), 'ROOT_QUALIFIED_DISPOSITION')
        return value['expectedWrapperExit']

    def require_actual_evidence_review(self, expected):
        value = self.root_document('root-actual-evidence-disposition.json')
        need(value.get('expectedWrapperExit') == expected and type(value.get('expectedWrapperExit')) is int and value.get('C8Credit') is False and value.get('IRCredit') is False and value.get('actualEvidenceQaReviewed') is True and value.get('restorationAccepted') is True and value.get('standaloneCompileActualExit') == 0 and type(value.get('standaloneCompileActualExit')) is int, 'ACTUAL_EVIDENCE_DISPOSITION')
        selected = self.actual_selected_result()
        need(type(value.get('selectedActualToolStatus')) is int and value['selectedActualToolStatus'] == selected['phaseExit'] and value.get('selectedSeparateStatusCaptured') is True and value.get('standaloneCompileSeparateStatusCaptured') is True and all(type(value.get(k)) is list and bool(value[k]) and all(type(x) is str and bool(x) for x in value[k]) for k in ('selectedActualToolEvidence', 'standaloneCompileActualToolEvidence')), 'SEPARATE_ACTUAL_PHASE_TOOL_RESULTS')
        for name in ('selected-result.json', 'public-collection.json', 'restore-result.json', 'compile-restored-result.json', 'selected-drain.json', 'compile-restored-drain.json', 'selected-native-result.json', 'compile-restored-native-result.json', 'source-backup.json', 'root-admission.json', 'held-proof.json', 'negative-readiness-denial.json'):
            need(value.get('actualEvidencePins', {}).get(name) == self.local_hash(name), 'ACTUAL_EVIDENCE_PIN')
        review = value.get('independentQaRecord')
        need(type(review) is dict and review.get('path') == ACTUAL_QA_REVIEW and hash_value(review.get('sha256')), 'ACTUAL_INDEPENDENT_QA_RECORD')
        self.v.raw(ROOT / review['path'], review['sha256'])

    def read_readiness_and_separate_root_permit(self):
        if self.c.absent('preunlock-verification.json'):
            need(type(self.explicit_exit) is int and self.explicit_exit == 1, 'NEGATIVE_GATE_EXPLICIT_ONE')
            need(self.c.absent('root-close-permit.json'), 'PERMIT_BEFORE_READINESS')
            self.write_once('negative-readiness-denial.json', {'reason': 'MISSING_READINESS', 'status': 1, 'releaseSha256': self.a['releaseSha256'], 'activeLockSha256': self.a['activeLockSha256'], 'readinessAbsent': True, 'permitAbsent': True, 'clientJournal': self.client_name, 'clientJournalSha256': self.local_hash(self.client_name), 'shellPid': self.sys.ppid()})
            raise Hold('MISSING_READINESS')
        proof = self.root_document('preunlock-verification.json')
        permit = self.root_document('root-close-permit.json')
        need(permit.get('finalActualStatus') == 0 and type(permit.get('finalActualStatus')) is int and permit.get('finalSeparateStatusCaptured') is True and permit.get('finalReadinessInspected') is True and type(permit.get('actualToolEvidence')) is list and bool(permit['actualToolEvidence']), 'ACTUAL_FINAL_INSPECTION')
        issued = permit.get('issuedAtEpoch')
        need(type(issued) in (int, float) and math.isfinite(issued) and 0 <= self.now() - issued <= 60, 'PERMIT_FUTURE_OR_STALE')
        return {'proof': proof, 'permit': permit, 'actualReadinessSha256': self.local_hash('preunlock-verification.json')}

    def actual_wrapper_tool_result(self):
        result = self.root_document('root-wrapper-result.json')
        allow = self.root_document('guard-allow.json')
        need(result.get('releaseSha256') == self.a['releaseSha256'] and result.get('guardAllowSha256') == self.local_hash('guard-allow.json') and type(result.get('actualToolResultEvidence')) is str and bool(result['actualToolResultEvidence']), 'ACTUAL_WRAPPER_TOOL_CHAIN')
        need(allow.get('releaseSha256') == self.a['releaseSha256'] and allow.get('readinessSha256') == self.local_hash('preunlock-verification.json') and type(allow.get('exit')) is int and allow['exit'] == 0, 'ACTUAL_GUARD_CHAIN')
        return dict(result, guardAllowExactlyBound=True)


def load(system, release_sha):
    need(hash_value(release_sha), 'RELEASE_ARGUMENT')
    c, unit = system.custody(CONTROL, 0o700), system.custody(UNIT, 0o700)
    verified = Verified(system)
    try:
        a = verified.document(CONTROL / 'root-release.json', release_sha, 0o600)
        need(a.get('releaseSha256') is None and a.get('rootAuthorized') is True and a.get('actualReleased') is True and a.get('allLiveNativeSourcePrivateCallsAuthorized') is True and a.get('metadataOnlyPublicScopeAuthorized') is True and a.get('privateBodyReadingAuthorized') is False, 'NEW_ACTUAL_ROOT_RELEASE')
        a['releaseSha256'] = release_sha
        # One-way binding: release -> literal holder facts; active pin -> release; admission
        # -> both raw hashes. Serializing either raw file's own/future hash would be a cycle.
        need(a.get('activeLockSha256') is None, 'NO_RELEASE_ACTIVE_PIN_HASH_CYCLE')
        active_raw = c.read('active-lock.json', 0o600)[0]
        a['activeLockSha256'] = sha(active_raw)
        need(a.get('adapterAbsolutePath') == str(CONTROL / 'public_observation_unit.py'), 'FIXED_NEW_INSTALLATION')
        need(type(a.get('artifactPins')) is dict and set(a['artifactPins']) == ARTIFACTS and a.get('controlMembers') == sorted(CONTROL_MEMBERS), 'EXACT_INSTALLED_CODE_DATA_SET')
        need(set(unit.members()) <= {'control', 'public-observation.json'} and stat.S_ISDIR(unit.info('control').st_mode), 'STRICT_NEW_UNIT_MEMBERSHIP')
        for name in c.members():
            need(name in CONTROL_MEMBERS or re.fullmatch(r'(?:client-[0-9]+-[0-9a-f]{16}|(?:utility|observation)-[0-9]+-[0-9a-f]{16}-[0-9]+|native-(?:selected|compile-restored)-[0-9]+)\.json', name) is not None, 'BOOTSTRAP_NAMESPACE_MEMBERSHIP')
            item = c.info(name)
            need(stat.S_ISREG(item.st_mode) and stat.S_IMODE(item.st_mode) == 0o600 and item.st_uid == system.uid() and item.st_nlink == 1, 'BOOTSTRAP_MEMBER_CUSTODY')
        for name, expected in a['artifactPins'].items():
            verified.raw(CONTROL / name, expected, 0o600)
        need(a['adapterSha256'] == a['artifactPins']['public_observation_unit.py'] and a['guardSha256'] == a['artifactPins']['guard-public-observe.bash'], 'ADAPTER_GUARD_PINS')
        # Compiling policy/collector consumes the already hash-verified buffer, not a second path read.
        policy = verified.module(CONTROL / 'unit_policy.py', a['artifactPins']['unit_policy.py'], '_verified_public_unit_policy')
        contract = verified.module(CONTROL / 'public_contract.py', a['artifactPins']['public_contract.py'], '_verified_public_contract')
        policy.authority(a)
        need(set(a['reviewRecords']) == {'architectureCode', 'qaCodePrivacy', 'sourceWindowRoot', 'gatewayPostcloseRoot', 'nonIrCertification'}, 'REQUIRED_INDEPENDENT_AUTHORITIES')
        for row in a['reviewRecords'].values():
            need(type(row) is dict and set(row) == {'path', 'sha256'} and relative(row.get('path')) and row['path'].startswith('docs/qa/evidence/STUDIO-OBS-011/t0/') and '/runtime/' not in row['path'] and Path(row['path']).suffix in ('.json', '.md') and hash_value(row.get('sha256')), 'REVIEW_RECORD')
            verified.raw(ROOT / row['path'], row['sha256'])
        roles = a['pythonRoles']
        need(set(roles) == {'launch', 'reported', 'process', 'observedArgument'} and roles['process'] == roles['observedArgument'], 'FOUR_EXACT_PYTHON_ROLES')
        for row in roles.values():
            need(type(row) is dict and set(row) == {'path', 'sha256'} and absolute(row['path']) and hash_value(row['sha256']), 'PYTHON_CANONICAL_BINDING')
            verified.raw(Path(row['path']), row['sha256'])
        need(set(a['observationExecutables']) == {'/bin/ps', '/usr/sbin/lsof', 'git'}, 'EXACT_OBSERVATION_TOOLS')
        for row in a['observationExecutables'].values():
            need(type(row) is dict and set(row) == {'path', 'sha256'} and absolute(row['path']) and hash_value(row['sha256']), 'UTILITY_CANONICAL_BINDING')
            verified.raw(Path(row['path']), row['sha256'])
        records = a.get('currentInputRecords')
        need(type(records) is list and 2 <= len(records) <= 4096 and {x.get('kind') for x in records} == {'cachedDependency', 'gradleDistribution'}, 'EXPLICIT_CURRENT_CACHE_RECORDS')
        seen = set()
        for row in records:
            need(type(row) is dict and set(row) == {'kind', 'path', 'sha256', 'bytes', 'mode'} and absolute(row['path']) and row['path'] not in seen and hash_value(row['sha256']) and type(row['bytes']) is int and 0 < row['bytes'] <= 512 * 1024 * 1024 and type(row['mode']) is int, 'CACHE_RECORD_SCHEMA')
            allowed_root = DEPENDENCY_CACHE if row['kind'] == 'cachedDependency' else GRADLE_DISTRIBUTIONS
            need(Path(row['path']).is_relative_to(allowed_root), 'CACHE_RECORD_SCOPE')
            need(len(verified.raw(Path(row['path']), row['sha256'], row['mode'])) == row['bytes'], 'CACHE_RECORD_BYTES')
            seen.add(row['path'])
        need(a['collectorProvenance']['observerPostimageSha256'] == a['postimageSha256'] == a['artifactPins']['Replay.postimage.java'] and a['collectorProvenance']['schemaSha256'] == a['artifactPins']['public-observation.schema.json'] and a['collectorProvenance']['collectorSha256'] == a['artifactPins']['public_contract.py'], 'COLLECTOR_EXACT_PROVENANCE')
        return Effects(system, verified, a, policy, contract, c, unit)
    except BaseException:
        c.close()
        unit.close()
        raise


def operate(effects, mode, argument=None):
    need(mode in PHASES, 'CLI_MODE')
    controller = effects.policy.Controller(effects.a, effects)
    if mode == 'held-proof':
        need(type(argument) is int and argument == 1, 'SEPARATE_NEGATIVE_STATUS_ONE')
        effects.validate_negative()
        need(effects.c.absent('preunlock-verification.json') and effects.c.absent('root-close-permit.json'), 'HELD_PROOF_ORDER')
        first, second = effects.current(), effects.current()
        proof = {'verificationExit': 0, 'releaseSha256': effects.a['releaseSha256'], 'negativeDenialSha256': effects.local_hash('negative-readiness-denial.json'), 'clientJournal': effects.client_name, 'clientJournalSha256': effects.local_hash(effects.client_name), 'first': first, 'second': second}
        effects.write_once('held-proof.json', proof)
        return 0
    if mode == 'collect-public':
        effects.collect_public()
        return 0
    if mode == 'gate':
        need(type(argument) is int and argument in (0, 1), 'EXPLICIT_GATE_ZERO_OR_ONE')
        effects.explicit_exit = argument
        return controller.gate(argument)
    need(argument is None, 'NO_EXTRA_ARGUMENT')
    method = getattr(controller, mode.replace('-', '_'))
    result = method()
    return result.get('phaseExit', 0) if type(result) is dict else 0


def main(argv=None, system=None):
    args = sys.argv[1:] if argv is None else argv
    need(type(args) is list and len(args) in (2, 3) and args[0] in PHASES and hash_value(args[1]), 'EXACT_CLI')
    need(str(Path(__file__).absolute()) == str(CONTROL / 'public_observation_unit.py'), 'PROSPECTIVE_ADAPTER_NOT_INSTALLED')
    need((len(args) == 3) == (args[0] in ('gate', 'held-proof')), 'EXACT_CLI_ARGUMENT_COUNT')
    if len(args) == 3:
        need(args[2] in ('0', '1'), 'LITERAL_STATUS_ARGUMENT')
    sys.dont_write_bytecode = True
    concrete = System() if system is None else system
    effects = load(concrete, args[1])
    try:
        need(concrete.stdin_devnull() is True and concrete.cwd() == str(ROOT), 'EXACT_STDIN_CWD')
        effects.register(args[0])
        status = operate(effects, args[0], int(args[2]) if len(args) == 3 else None)
        need(type(status) is int, 'ACTUAL_PHASE_STATUS')
        return status
    except BaseException:
        if effects.registration_complete is not True:
            effects.write_once('registration-failure.json', {'releaseSha256': effects.a['releaseSha256'], 'client': effects.client, 'utilities': effects.utilities, 'qualified': False})
        raise
    finally:
        effects.c.close()
        effects.unit.close()


if __name__ == '__main__':
    try:
        code = main()
    except BaseException as error:
        # Closed reason class only: no command output, source/private data or exception messages.
        print(json.dumps({'status': 'HOLD', 'errorType': type(error).__name__, 'C8Credit': False}))
        code = 1
    sys.exit(code)

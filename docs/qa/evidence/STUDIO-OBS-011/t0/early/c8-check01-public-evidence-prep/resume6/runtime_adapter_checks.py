"""Actual adapter functions, synthetic boundary only; all real effects globally blocked.

The only real reads are this prepared packet and the pinned ownership-core SOURCE before
blocking. No live source snapshot, baseline body, OS census, helper main or native execution.
"""
import ast
import base64
import threading
import builtins
import collections
import copy
import ctypes
import datetime
import errno
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import resource
import shlex
import signal
import socket
import stat
import subprocess
import sys
import time
import types
import xml.etree.ElementTree
import xml.parsers.expat
from contextlib import ExitStack
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
PRELOADED = {n: (HERE / n).read_bytes() for n in ('public_observation_unit.py', 'unit_policy.py', 'public_contract.py', 'runtime-root-release.template.json','public_relay.py','test_fixtures.py','launch-control.template.json')}
for name in ('guard-public-observe.bash', 'public-observation.schema.json', 'public-policy.json', 'source-binding.json', 'Replay.preimage.java', 'Replay.postimage.java', 'observer.patch', 'observer.reverse.patch'):
    PRELOADED[name] = (HERE / name).read_bytes()
PLAN_RAW = Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-fullcheck-prep/resume4/execution/successor-plan.json').read_bytes()
assert hashlib.sha256(PLAN_RAW).hexdigest() == '9391e76dd403d45a1c8ab09c428ed6884a762c326959cefa63c781633c687313'
CORE_PATH = Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py')
CORE_RAW = CORE_PATH.read_bytes()
assert hashlib.sha256(CORE_RAW).hexdigest() == 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
A = {'__name__': '_blocked_prepared_adapter', '__file__': str(HERE / 'public_observation_unit.py')}
P = types.ModuleType('_prepared_policy')
C = types.ModuleType('_prepared_collector')
exec(compile(PRELOADED['unit_policy.py'], '<prepared-policy>', 'exec'), P.__dict__)
exec(compile(PRELOADED['public_contract.py'], '<prepared-collector>', 'exec'), C.__dict__)
exec(compile(PRELOADED['public_observation_unit.py'], '<prepared-adapter>', 'exec'), A)
F = {}
exec(compile(PRELOADED['test_fixtures.py'],'<synthetic-v2-fixtures>','exec'),F)
RESULTS, BLOCKED = [], []


def check(name, value):
    assert value is True, name
    RESULTS.append({'name': name, 'pass': True})


def denied(name, action, reason=None):
    try:
        action()
    except (A['Hold'], P.Hold, AssertionError, ValueError, TypeError, KeyError, OSError) as error:
        check(name, reason is None or str(error) == reason)
    else:
        raise AssertionError(name)


def blocked(*unused, **kwargs):
    BLOCKED.append('REAL_BOUNDARY_REACHED')
    raise AssertionError('REAL_BOUNDARY_BLOCKED')


def info(raw=b'', mode=0o600, inode=5, directory=False, uid=501, stamp=1000):
    return types.SimpleNamespace(st_dev=1, st_ino=inode, st_mode=(stat.S_IFDIR if directory else stat.S_IFREG) | mode,
                                 st_uid=uid, st_size=len(raw), st_mtime_ns=int(stamp * 1e9), st_ctime_ns=int(stamp * 1e9), st_nlink=1)


class FakeLock:
    def __enter__(self): return self
    def __exit__(self,*unused): return False

class FakeRelay:
    def __init__(self,*args):
        self.result=F['receipt'](b'',args[5]);self.result.update(qualified=False,dataCount=0,ackCount=0,commitCount=0,callerAckConfirmed=False,projectionSha256=None)
    def start(self): return dict(self.result)
    def stop(self): return dict(self.result)


class MemoryCustody:
    def __init__(self, system, path, mode=None):
        self.s, self.path, self.closed = system, str(path), False
        self.s.events.append(('custody', self.path))
        if self.path not in self.s.dirs:
            raise FileNotFoundError(self.path)
        if mode is not None:
            A['need'](self.s.dirs[self.path].st_mode & 0o777 == mode, 'DIRECTORY_OWNER_MODE')

    def check(self):
        A['need'](not self.closed and self.path not in self.s.swapped, 'DIRECTORY_CUSTODY_CHANGED')

    def members(self):
        self.check()
        prefix = self.path + '/'
        names = {p[len(prefix):].split('/')[0] for p in [*self.s.files, *self.s.dirs] if p.startswith(prefix) and p != self.path}
        return sorted(names)

    def info(self, name):
        self.check()
        key = self.path + '/' + name
        if key in self.s.files:
            return self.s.files[key][1]
        if key in self.s.dirs:
            return self.s.dirs[key]
        raise FileNotFoundError(key)

    def absent(self, name):
        try:
            self.info(name)
        except FileNotFoundError:
            return True
        return False

    def read(self, name, mode=None, cap=16 * 1024 * 1024):
        self.check()
        return self.s.read(Path(self.path) / name, mode, cap)

    def write(self, name, raw, mode=0o600):
        self.check()
        A['need'](A['member'](name), 'OUTPUT_MEMBER')
        if not self.absent(name):
            raise FileExistsError(name)
        self.s.put(Path(self.path) / name, raw, mode)
        self.s.events.append(('write-exclusive', self.path + '/' + name))
        self.check()

    def replace_exact(self, name, before, after, identity, mode=0o644):
        raw, current = self.read(name, mode)
        A['need'](raw == before and A['identity_key'](current) == tuple(identity), 'SOURCE_PREIMAGE_IDENTITY')
        self.s.put(Path(self.path) / name, after, mode, current.st_ino)
        self.s.events.append(('source-transfer', self.path + '/' + name))

    def close(self):
        self.closed = True


class Sink(io.BytesIO):
    def __init__(self, system, path):
        super().__init__()
        self.s, self.path = system, path

    def close(self):
        if not self.closed:
            self.s.put(self.path, self.getvalue())
        super().close()


class Child:
    def __init__(self, system, pid, command, output='', error='', native=False, status=0):
        self.s, self.pid, self.command, self.output, self.error, self.native = system, pid, command, output, error, native
        self.status, self.returncode = status, None

    def communicate(self):
        if self.s.capture_error:
            self.s.capture_error = False
            raise OSError('SYNTHETIC_CAPTURE_FAILURE_CANARY')
        self.returncode = self.status
        return self.output, self.error

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        self.s.events.append(('wait', self.pid, timeout))
        if self.native and getattr(self.s, 'native_wait_interrupt_once', False):
            self.s.native_wait_interrupt_once = False
            raise KeyboardInterrupt()
        self.returncode = self.status
        if self.native:
            self.s.native_live = False
        return self.returncode


class FakeSystem:
    def __init__(self):
        self.files, self.dirs, self.swapped, self.events = {}, {}, set(), []
        self.ownership = A['Ownership']()
        self.next_pid, self.inode = 50000, 100
        self.native_live, self.capture_error, self.utility_stderr = False, False, ''
        self.empty_census, self.extra_child, self.lock_is_free, self.kernel_unknown = False, False, False, False
        self.native_status = 0
        self.rows_extra = {}
        self.env = {'HOME': '/synthetic/home', 'PATH': '/synthetic/bin'}
        for path in (A['ROOT'], A['UNIT'], A['CONTROL'], A['LOCK'].parent, A['LEASE'].parent, (A['ROOT'] / A['REPLAY']).parent):
            self.directory(path)

    def directory(self, path):
        path = Path(path)
        for part in [*reversed(path.parents), path]:
            if str(part) not in self.dirs:
                self.inode += 1
                self.dirs[str(part)] = info(directory=True, mode=0o700, inode=self.inode)

    def put(self, path, raw, mode=0o600, inode=None, stamp=1000):
        self.directory(Path(path).parent)
        self.inode += 1
        self.files[str(path)] = (raw, info(raw, mode, inode or self.inode, stamp=stamp))

    def custody(self, path, mode=None):
        return MemoryCustody(self, path, mode)

    def read(self, path, mode=None, cap=16 * 1024 * 1024):
        self.events.append(('read', str(path)))
        raw, meta = self.files[str(path)]
        A['need'](len(raw) <= cap and (mode is None or stat.S_IMODE(meta.st_mode) == mode) and stat.S_ISREG(meta.st_mode), 'FAKE_READ_MODE_CAP')
        return raw, copy.copy(meta)

    def pid(self): return 100
    def ppid(self): return 101
    def uid(self): return 501
    def now(self): return 1000
    def monotonic(self): return 1000000
    def sleep(self, seconds): self.events.append(('sleep', seconds))
    def python(self): return {'reported': '/synthetic/python-bin', 'observedArgument': '/synthetic/python-app'}
    def environment(self): return dict(self.env)
    def lock_free(self, *unused): return self.lock_is_free

    def relay_boundary(self,module): return None

    def utility_identity(self, pid, expected):
        A['need'](not self.kernel_unknown, 'UTILITY_KERNEL_START_UNAVAILABLE')
        return {'pid': pid, 'ppid': 100, 'kernelStartSeconds': 1, 'kernelStartMicroseconds': pid, 'processImage': expected, 'kernelIdentityComplete': True}

    def sink(self, custody, name):
        custody.check()
        A['need'](custody.absent(name), 'EXCLUSIVE_SINK')
        return Sink(self, Path(custody.path) / name)

    def row(self, pid, ppid=1, argv='java synthetic', comm='/synthetic/java'):
        return {'pid': pid, 'ppid': ppid, 'start': 'Mon Oct 19 09:00:00 2026', 'argv': argv, 'comm': comm}

    def rows(self, utility=None):
        rows = {100: self.row(100, 101, 'python synthetic-client', '/synthetic/python-app'),
                101: self.row(101, 102, '/bin/bash --noprofile --norc -i', '/bin/bash'),
                102: self.row(102, 1, 'python ' + str(A['ROOT'] / A['WRAPPER']) + ' /bin/bash --noprofile --norc -i', '/synthetic/python-bin')}
        for pid in (2366, 5083, 5095, 13577, 13581, 64376):
            rows[pid] = self.row(pid)
        rows.update(copy.deepcopy(self.rows_extra))
        if getattr(self, 'postclose', False):
            for old in (101, 102):
                rows[old]['start'] = 'Mon Oct 19 10:00:00 2026'
                rows[old]['argv'] = 'unrelated-reused-pid'
                rows[old]['ppid'] = 1
        if self.native_live:
            rows[40000] = self.row(40000, 100, 'java GradleWrapperMain synthetic')
        if self.extra_child:
            rows[999] = self.row(999, 100, 'unbound-child')
        if utility:
            rows[utility[0]] = self.row(utility[0], 100, ' '.join(utility[1]), utility[1][0])
        return rows

    def popen(self, command, **kwargs):
        self.events.append(('Popen', list(command), dict(kwargs)))
        self.next_pid += 1
        pid = self.next_pid
        if command[0] == './gradlew':
            self.native_live = True
            output = kwargs['stdout']
            if command[1] == 'test':
                output.write(b'> Task :test\n> Task :retainOriginalGuidedCohort\nBUILD SUCCESSFUL in 1s\n')
                self.install_metadata()
            else:
                output.write(b'> Task :compileTestJava\nBUILD SUCCESSFUL in 1s\n')
            return Child(self, 40000, command, native=True, status=self.native_status)
        out = ''
        if command[:4] == ['/synthetic/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,command=']:
            if not self.empty_census:
                out = '\n'.join(str(r['pid']) + ' ' + str(r['ppid']) + ' ' + r['start'] + ' ' + r['argv'] for r in self.rows((pid, command)).values())
        elif command[0] == '/synthetic/ps':
            row = self.rows().get(int(command[3]))
            column = command[-1][:-1]
            out = (row['start'] if column == 'lstart' else row['argv'] if column == 'command' else row['comm']) if row else ''
        elif command[0] == '/synthetic/git':
            out = '\0'.join(self.source_names) + '\0'
        elif command[0] == '/synthetic/lsof':
            if '-d' in command:
                row = self.rows().get(int(command[command.index('-p') + 1]))
                out = 'n' + row['comm'] + '\n' if row else ''
            elif '--' in command:
                out = 'p102\nf3\nlW\ni2\nn' + str(A['LOCK']) + '\n'
            else:
                out = self.listener_output if hasattr(self, 'listener_output') else ''
        return Child(self, pid, command, out, self.utility_stderr)

    def install_metadata(self):
        run, cohort = '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'
        path = A['COHORTS'] / run / cohort
        value = {'lane': 'test', 'profile': 'original4000', 'runId': run, 'cohortId': cohort, 'retentionFailures': 0,
                 'invocations': [{'method': A['METHOD'], 'displayLabel': A['METHOD'] + '()', 'variant': 'singleton', 'passed': True, 'afterEachComplete': True}],
                 **{key: True for key in P.COHORT_FLAGS}}
        self.put(path / 'cohort.json', A['packed'](value))
        self.put(path / 'guard-tally.json', b'{"scope":"synthetic"}')
        self.put(A['CANONICAL_GUARD'], b'{"scope":"synthetic"}')
        self.put(A['XML'], ('<testsuite><testcase classname="' + A['CLASS'] + '" name="' + A['METHOD'] + '()"/></testsuite>').encode())


def setup(source=False):
    system = FakeSystem()
    e = A['Effects'].__new__(A['Effects'])
    e.sys, e.v, e.policy, e.contract = system, A['Verified'](system), P, C
    e.c, e.unit = system.custody(A['CONTROL'], 0o700), system.custody(A['UNIT'], 0o700)
    e.loaded_local, e.client, e.utilities, e.sequence, e.observation_sequence, e.registration_complete = {}, None, [], 0, 0, False
    e.external_control_pins, e.generated_control_buffers = {}, {}
    e.selected_lifecycle, e.selected_claim_sha, e.selected_authority_sha = None, None, None
    e.custody_retained=False
    e.ownership=system.ownership
    e.relay, e.relay_module, e.selected_worker = None,None,None
    e.peer_lock = FakeLock()
    e.gaps, e.scope, e.receipt = {key: False for key in P.GAPS}, None, None
    e.a = {'releaseSha256': 'a' * 64, 'activeLockSha256': 'b' * 64, 'controlMembers': sorted(A['CONTROL_MEMBERS']),
           'preimageSha256': A['sha'](b'PRE'), 'postimageSha256': A['sha'](b'POST'),
           'pythonRoles': {}, 'observationExecutables': {}, 'collectorProvenance': {key: 'c' * 64 for key in C.PROVENANCE_FIELDS}}
    for role, path in [('launch', '/synthetic/python-bin'), ('reported', '/synthetic/python-bin'), ('process', '/synthetic/python-app'), ('observedArgument', '/synthetic/python-app')]:
        system.put(Path(path), path.encode())
        e.a['pythonRoles'][role] = {'path': path, 'sha256': A['sha'](path.encode())}
    for role, path in [('/bin/ps', '/synthetic/ps'), ('/usr/sbin/lsof', '/synthetic/lsof'), ('git', '/synthetic/git')]:
        system.put(Path(path), path.encode())
        e.a['observationExecutables'][role] = {'path': path, 'sha256': A['sha'](path.encode())}
    system.put(Path('/synthetic/java'), b'java')
    system.put(A['ROOT'] / A['CORE'], CORE_RAW)
    system.put(A['ROOT'] / A['WRAPPER'], b'wrapper')
    rows = system.rows()
    e.pin = {'wrapperPid': 102, 'shellPid': 101, 'lockDevInode': [1, 2], 'wrapperLockFd': 3}
    for role, pid in [('wrapper', 102), ('shell', 101)]:
        e.pin.update({role + 'Start': rows[pid]['start'], role + 'ArgvSha256': A['sha'](rows[pid]['argv'].encode())})
    control=json.loads(PRELOADED['launch-control.template.json']);control['enrollmentNonce']='5'*64
    raw=A['packed'](control)
    e.a.update(launchControlBase64=base64.urlsafe_b64encode(raw).decode(),observerControlSha256=A['sha'](raw),relayCustody={'ownerUid':501,'outputChain':[],'shortParentChain':[],'createShortExactly0700':True},artifactPins={'public_relay.py':A['sha'](PRELOADED['public_relay.py'])})
    system.put(A['CONTROL']/'public_relay.py',PRELOADED['public_relay.py'])
    e.plan = {'javaHome': '/synthetic/jdk', 'nodeBin': '/synthetic/node', 'source': {}, 'immutableHelpers': {}}
    if source:
        add_source(e)
    return e


def add_source(e):
    s, rows = e.sys, []
    paths = ['backend/src/main/f' + str(i) for i in range(506)] + ['backend/src/test/f' + str(i) for i in range(1301)] + [A['REPLAY']]
    for name in sorted(paths):
        raw = b'PRE' if name == A['REPLAY'] else name.encode()
        s.put(A['ROOT'] / name, raw, 0o644)
        rows.append({'path': name, 'sha256': A['sha'](raw)})
    e.plan.update(captureScope=['backend/src'], sourceModes={x: 0o644 for x in paths}, quotedCurrent={}, immutableHelpers={}, helm={})
    e.plan['source']['files'] = rows
    e.plan['source']['dist'] = {'files': []}
    for i in range(238):
        name = 'f' + str(i)
        raw = name.encode()
        s.put(A['ROOT'] / 'studio-runner/dist' / name, raw)
        e.plan['source']['dist']['files'].append({'path': name, 'sha256': A['sha'](raw)})
    e.plan['source']['dist']['files'].sort(key=lambda x: x['path'])
    s.directory(A['ROOT'] / 'helm-chart')
    s.source_names = sorted(paths)
    policy = types.ModuleType('_synthetic_policy_constants')
    policy.__dict__.update(P.__dict__)
    policy.BASE = A['sha'](A['packed'](rows))
    candidate = copy.deepcopy(rows)
    next(x for x in candidate if x['path'] == A['REPLAY'])['sha256'] = A['sha'](b'POST')
    policy.CANDIDATE = A['sha'](A['packed'](candidate))
    e.policy = policy


def adapter_tests():
    e = setup()
    e.register('held-proof')
    check('ACTUAL_REGISTER_FULL_PYTHON_FOUR_ROLES', e.client['identityComplete'] is True and e.registration_complete is True and len(e.utilities) > 4)
    check('ACTUAL_REGISTER_RETAINS_ALL_BOOTSTRAP_UTILITIES', len([x for x in e.c.members() if x.startswith('utility-')]) == len(e.utilities))
    check('ACTUAL_UTILITIES_KERNEL_START_WAITED', all(x['kernelIdentity']['kernelIdentityComplete'] and x['waitedStatus'] == 0 for x in e.utilities))
    denied('ACTUAL_REGISTER_NO_SECOND_CLIENT_FILE', lambda: e.register('held-proof'))
    e = setup()
    e.sys.empty_census = True
    denied('ACTUAL_REGISTER_EMPTY_CENSUS_HOLD', lambda: e.register('held-proof'), 'CENSUS_UNANCHORED')
    e = setup()
    e.sys.utility_stderr = 'SYNTHETIC_STDERR_CANARY'
    denied('ACTUAL_UTILITY_STDERR_HOLD_NO_EXPORT', lambda: e.table(), 'UTILITY_TERMINAL_OUTPUT_UNKNOWN')
    check('ACTUAL_UTILITY_FAILED_CAPTURE_WAITED', e.utilities[0]['waitedStatus'] == 0 and 'SYNTHETIC_STDERR_CANARY' not in json.dumps(e.utilities))
    e = setup()
    e.sys.kernel_unknown = True
    denied('ACTUAL_UTILITY_UNKNOWN_KERNEL_IDENTITY_HOLD', lambda: e.table(), 'UTILITY_KERNEL_START_UNAVAILABLE')
    check('ACTUAL_UTILITY_UNKNOWN_IDENTITY_STILL_DRAINS', any(x[0] == 'wait' for x in e.sys.events))
    e = setup()
    e.sys.capture_error = True
    denied('ACTUAL_UTILITY_CAPTURE_EXCEPTION_HOLD', lambda: e.table())
    check('ACTUAL_UTILITY_CAPTURE_EXCEPTION_DRAIN', e.utilities[0]['waitedStatus'] == 0)
    e = setup()
    e.a['pythonRoles']['process']['sha256'] = '0' * 64
    denied('ACTUAL_CLIENT_WRONG_IMAGE_HASH', lambda: e.register('stage'), 'CLIENT_PROCESS_ROLE')
    e = setup()
    e.a['pythonRoles']['reported']['path'] = '/wrong-reported'
    denied('ACTUAL_CLIENT_WRONG_REPORTED_ROLE', lambda: e.register('stage'), 'CLIENT_REPORT_ARGUMENT_ROLE')
    e = setup()
    e.a['pythonRoles']['observedArgument']['path'] = '/wrong-orig-argv'
    denied('ACTUAL_CLIENT_WRONG_OBSERVED_ARGV_ROLE', lambda: e.register('stage'), 'CLIENT_REPORT_ARGUMENT_ROLE')
    e = setup(source=True)
    facts = e.source()
    check('ACTUAL_SOURCE_1808_506_238_LITERAL_POSITIVE', facts['sourceDisposition'] == 'RESTORED' and facts['allOtherSourceModesEqualF9'] is True)
    raw, meta = e.sys.files[str(A['ROOT'] / 'backend/src/main/f0')]
    e.sys.put(A['ROOT'] / 'backend/src/main/f0', raw + b'changed', 0o644, meta.st_ino)
    denied('ACTUAL_SOURCE_NONLEASE_CHANGED', e.source, 'NONLEASE_SOURCE_CHANGED')
    e = setup(source=True)
    e.sys.source_names.append('backend/src/new-unreviewed')
    denied('ACTUAL_SOURCE_EXTRA_FILE', e.source, 'WHOLE_SOURCE_INVENTORY')
    e = setup(source=True)
    path = A['ROOT'] / A['REPLAY']
    e.sys.files[str(path)][1].st_mode = stat.S_IFREG | 0o600
    denied('ACTUAL_SOURCE_MODE_DRIFT', e.source, 'SOURCE_COUNTS_MODES')
    e = setup(source=True)
    e.sys.put(A['ROOT'] / 'studio-runner/dist/f0', b'changed')
    denied('ACTUAL_SOURCE_DIST_CHANGED', e.source, 'DIST_LITERAL')
    e = setup(source=True)
    e.sys.put(A['CONTROL'] / 'Replay.preimage.java', b'PRE')
    e.sys.put(A['CONTROL'] / 'Replay.postimage.java', b'POST')
    e.install_exact_replay(A['sha'](b'PRE'), A['sha'](b'POST'), 0o644)
    check('ACTUAL_SOURCE_INSTALL_EXACT_BACKUP_AND_CANDIDATE', e.source()['sourceDisposition'] == 'CANDIDATE' and e.c.read('Replay.actual-backup.java')[0] == b'PRE')
    denied('ACTUAL_SOURCE_LEASE_NO_REUSE', lambda: e.install_exact_replay(A['sha'](b'PRE'), A['sha'](b'POST'), 0o644), 'LEASE_ALREADY_EXISTS')
    e.restore_exact_replay(A['sha'](b'POST'), A['sha'](b'PRE'), 0o644)
    check('ACTUAL_SOURCE_RESTORE_EXACT_F9_SHAPE', e.source()['sourceDisposition'] == 'RESTORED')
    e.sys.put(A['ROOT'] / A['REPLAY'], b'THIRD-PARTY', 0o644)
    denied('ACTUAL_SOURCE_RESTORE_REJECTS_UNOWNED_BYTES_INODE', lambda: e.restore_exact_replay(A['sha'](b'POST'), A['sha'](b'PRE'), 0o644), 'RESTORE_ONLY_OWNED_BYTES')
    e = setup()
    e.sys.put(Path('/synthetic/input'), b'{"a":1}')
    value = e.v.document(Path('/synthetic/input'), A['sha'](b'{"a":1}'))
    check('ACTUAL_VERIFIED_JSON_POSITIVE', value == {'a': 1})
    e.sys.put(Path('/synthetic/input'), b'{"a":2}')
    denied('ACTUAL_VERIFIED_JSON_SUBSTITUTION_BLOCKS_BEFORE_PARSE', lambda: e.v.document(Path('/synthetic/input')), 'IMMUTABLE_CONSUMED_BUFFER_CHANGED')
    denied('ACTUAL_JSON_DUPLICATE_MEMBER', lambda: A['decode'](b'{"a":1,"a":2}'), 'DUPLICATE_JSON_MEMBER')
    denied('ACTUAL_JSON_NONFINITE', lambda: A['decode'](b'{"a":NaN}'), 'NONFINITE_JSON')
    valid = ('<testsuite><testcase classname="' + A['CLASS'] + '" name="' + A['METHOD'] + '()"><failure message="PRIVATE_MESSAGE_CANARY">PRIVATE_STACK_CANARY</failure><system-out>PRIVATE_STDOUT_CANARY</system-out></testcase></testsuite>').encode()
    value = A['xml_metadata'](valid)
    check('ACTUAL_XML_METADATA_ONE_SELECTED_FAILED', value['status'] == 'FAIL' and set(value) == {'task', 'class', 'name', 'status'} and 'CANARY' not in json.dumps(value))
    denied('ACTUAL_XML_SKIP_NOT_SELECTED', lambda: A['xml_metadata'](valid.replace(b'failure', b'skipped')), 'ONE_EXACT_CURRENT_SELECTED_ZERO_SKIP')
    denied('ACTUAL_XML_DUPLICATE_CASE', lambda: A['xml_metadata'](valid.replace(b'</testsuite>', valid[len(b'<testsuite>'):])) )
    denied('ACTUAL_XML_NO_ENTITIES', lambda: A['xml_metadata'](b'<!DOCTYPE x []>' + valid), 'XML_BOUNDED_NO_ENTITIES')
    denied('ACTUAL_XML_WRONG_METHOD', lambda: A['xml_metadata'](valid.replace(A['METHOD'].encode(), b'otherMethod')), 'ONE_EXACT_CURRENT_SELECTED_ZERO_SKIP')
    denied('ACTUAL_XML_SKIP_CANNOT_BE_OVERWRITTEN_BY_FAILURE', lambda: A['xml_metadata'](valid.replace(b'<failure ', b'<skipped/><failure ')), 'ONE_EXACT_CURRENT_SELECTED_ZERO_SKIP')
    e = setup()
    e.sys.install_metadata()
    receipt = {'startedAtEpoch': 999, 'endedAtEpoch': 1001, 'cohortRunDirectoriesBefore': []}
    value = e.selected_metadata(receipt, {'retainOriginalGuidedCohort': 'EXECUTED'})
    check('ACTUAL_SELECTED_METADATA_COHORT_FLAGS_GUARD_POSITIVE', value['junitInvocations'] == 1 and value['skips'] == 0 and all(value[x] is True for x in P.COHORT_FLAGS))
    denied('ACTUAL_SELECTED_METADATA_FINALIZER_REQUIRED', lambda: e.selected_metadata(receipt, {'retainOriginalGuidedCohort': 'FAILED'}), 'REAL_COHORT_FINALIZER')
    e.sys.put(A['CANONICAL_GUARD'], b'{"changed":true}')
    denied('ACTUAL_SELECTED_METADATA_GUARD_MUST_BE_REAL_BYTES', lambda: e.selected_metadata(receipt, {'retainOriginalGuidedCohort': 'EXECUTED'}), 'EXACT_GUARD_CONSISTENCY')
    e = setup()
    e.sys.install_metadata()
    denied('ACTUAL_SELECTED_METADATA_STALE_XML', lambda: e.selected_metadata(dict(receipt, startedAtEpoch=1001), {'retainOriginalGuidedCohort': 'EXECUTED'}), 'METADATA_NOT_CURRENT_NONEMPTY')
    check('ACTUAL_SELECTED_METADATA_NEVER_PRIVATE_SIBLING_READ', not any(x[0] == 'read' and ('responses-' in x[1] or 'privacy-' in x[1] or 'audit-final' in x[1]) for x in e.sys.events))
    tree = A['core_scope'](CORE_RAW)
    check('ACTUAL_CORE_ALL_CONSERVATIVE_FUNCTIONS_REACHED', all(callable(tree[x]) for x in ('run_owned', 'update_owned', 'owned_census_keys', 'classify_owned', 'pending_owned', 'ownership_drain_decision')))
    denied('ACTUAL_CORE_UNVERIFIED_BUFFER_BEFORE_AST', lambda: A['core_scope'](CORE_RAW + b'\n'), 'OWNERSHIP_CORE_CONSUMED_BUFFER')
    row = {'pid': 9, 'ppid': 100, 'start': 'old'}
    sticky = tree['classify_owned'](row, {'javaPreviouslyProved': True}, '/bin/echo', 'old')
    check('ACTUAL_CORE_JAVA_STICKY_AFTER_NONJAVA', sticky['executableState'] == 'JAVA')
    unknown = tree['classify_owned'](row, {}, None, None, True)
    check('ACTUAL_CORE_UNKNOWN_REMAINS_WAIT', tree['ownership_drain_decision']({9: row}, {(9, 'old'): unknown}, True) == 'WAIT')
    check('ACTUAL_CORE_DIFFERENT_START_RESOLVES_OLD_ONLY', tree['ownership_drain_decision']({9: dict(row, start='new')}, {(9, 'old'): unknown}, True) == 'RESOLVED')
    e = setup()
    e.mode = 'selected'
    e.client = {'pid': 100, 'start': 'synthetic', 'identityComplete': True}
    e.claim_once('selected')
    denied('ACTUAL_EXCLUSIVE_PHASE_CLAIM_REPLAY', lambda: e.claim_once('selected'))
    check('ACTUAL_PHASE_CLAIM_TYPED_CAP_ONE', e.root_document('selected-consumed.json')['attemptCap'] == 1)
    e = setup()
    denied('ACTUAL_MAIN_PREPARED_PATH_CANNOT_RUN', lambda: A['main'](['stage', 'a' * 64, 'entry-0001-pins.json', 'b'*64], e.sys), 'PROSPECTIVE_ADAPTER_NOT_INSTALLED')
    denied('ACTUAL_MAIN_BAD_MODE_BEFORE_EFFECTS', lambda: A['main'](['unknown', 'a' * 64], e.sys), 'EXACT_CLI')
    denied('ACTUAL_MAIN_BAD_RELEASE_BEFORE_EFFECTS', lambda: A['main'](['stage', 'bad'], e.sys), 'EXACT_CLI')
    check('ACTUAL_PREPARED_MAIN_NO_POPEN', not any(x[0] == 'Popen' for x in e.sys.events))


def low_level_custody_tests():
    """Run real Custody methods over fd-relative FakeOS, not a replacement Custody."""
    class OS:
        def __init__(self):
            self.nodes = {'/': [b'', info(directory=True, mode=0o755, inode=1)], '/safe': [b'', info(directory=True, mode=0o700, inode=2)], '/safe/input': [b'abc', info(b'abc', inode=3)]}
            self.fds, self.positions, self.next, self.saved, self.swap = {}, {}, 10, [], False
        def getuid(self): return 501
        def path(self, name, parent=None):
            return name if parent is None else self.fds[parent].rstrip('/') + '/' + name
        def open(self, name, flags, mode=None, dir_fd=None):
            path = self.path(name, dir_fd)
            if flags & os.O_CREAT:
                if path in self.nodes: raise FileExistsError(path)
                self.nodes[path] = [b'', info(inode=len(self.nodes)+1, mode=mode)]
            if path not in self.nodes: raise FileNotFoundError(path)
            if stat.S_ISLNK(self.nodes[path][1].st_mode): raise OSError('LINK')
            self.next += 1
            self.fds[self.next], self.positions[self.next] = path, 0
            return self.next
        def close(self, fd): self.fds.pop(fd)
        def fstat(self, fd): return copy.copy(self.nodes[self.fds[fd]][1])
        def stat(self, name, dir_fd=None, follow_symlinks=False):
            path = self.path(name, dir_fd)
            if path not in self.nodes: raise FileNotFoundError(path)
            value = copy.copy(self.nodes[path][1])
            if self.swap and path == '/safe': value.st_ino = 900
            return value
        def listdir(self, fd):
            prefix = self.fds[fd].rstrip('/') + '/'
            return [p[len(prefix):] for p in self.nodes if p.startswith(prefix) and '/' not in p[len(prefix):]]
        def read(self, fd, size):
            data = self.nodes[self.fds[fd]][0]
            position = self.positions[fd]
            chunk = data[position:position + size]
            self.positions[fd] += len(chunk)
            return chunk
        def write(self, fd, value):
            path = self.fds[fd]
            self.nodes[path][0] += value
            self.nodes[path][1].st_size = len(self.nodes[path][0])
            return len(value)
        def ftruncate(self, fd, length):
            self.nodes[self.fds[fd]][0] = b''
            self.nodes[self.fds[fd]][1].st_size = 0
        def fsync(self, fd): self.saved.append(fd)
    api = OS()
    c = A['Custody']('/safe', 0o700, api)
    check('ACTUAL_CUSTODY_READ_RETAINED_CHAIN', c.read('input', 0o600)[0] == b'abc' and len(c.chain) == 2)
    c.write('new.json', b'{}')
    check('ACTUAL_CUSTODY_EXCLUSIVE_WRITE_FSYNC', c.read('new.json', 0o600)[0] == b'{}' and len(api.saved) == 2)
    denied('ACTUAL_CUSTODY_NO_OVERWRITE', lambda: c.write('new.json', b'bad'))
    denied('ACTUAL_CUSTODY_PATH_TRAVERSAL', lambda: c.read('../input'), 'MEMBER')
    denied('ACTUAL_CUSTODY_READ_CAP', lambda: c.read('input', cap=2), 'FILE_OWNER_MODE_CAP')
    api.swap = True
    denied('ACTUAL_CUSTODY_ANCESTOR_RENAME', c.members, 'DIRECTORY_CUSTODY_CHANGED')
    api.swap = False
    c.replace_exact('input', b'abc', b'new', A['identity_key'](api.nodes['/safe/input'][1]), 0o600)
    check('ACTUAL_CUSTODY_EXACT_TRANSFER', c.read('input')[0] == b'new')
    denied('ACTUAL_CUSTODY_TRANSFER_WRONG_PREIMAGE', lambda: c.replace_exact('input', b'old', b'bad', A['identity_key'](api.nodes['/safe/input'][1]), 0o600), 'SOURCE_PREIMAGE_IDENTITY')
    c.close()
    check('ACTUAL_CUSTODY_ALL_FDS_CLOSED', api.fds == {})


def current_world():
    e = setup(source=True)
    baseline = []
    for pid, row in e.sys.rows().items():
        if pid in (100, 101, 102):
            continue
        image = row['comm']
        baseline.append({'pid': pid, 'ppid': row['ppid'], 'start': row['start'], 'identityComplete': True,
                         'argvHash': A['sha'](row['argv'].encode()), 'commHash': A['sha'](image.encode()),
                         'executableHash': A['sha'](image.encode()), 'executableFileHash': A['sha'](b'java')})
    raw = A['packed']({'identities': baseline})
    e.plan['baselinePath'] = 'prepared/synthetic-baseline.json'
    e.plan['immutableHelpers'][e.plan['baselinePath']] = A['sha'](raw)
    e.sys.put(A['ROOT'] / e.plan['baselinePath'], raw)
    e.register('held-proof')
    return e


def current_tests():
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        result = e.current()
        check('ACTUAL_CURRENT_COMPLETE_TWO_ANCHORED_CENSUSES', result['completeAnchoredCensuses'] is True and len(result['snapshots']) == 2 and result['inheritedSixExactUnchanged'] is True)
        check('ACTUAL_CURRENT_DURABLE_OBSERVATION_JOURNAL', e.local_hash(result['observationJournal']) == result['observationJournalSha256'])
        e.sys.extra_child = True
        denied('ACTUAL_CURRENT_CLIENT_CHILD_NOT_BLANKET_EXEMPT', e.current, 'UNBOUND_DESCENDANTS')
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.lock_is_free = True
        denied('ACTUAL_CURRENT_CANNOT_CLAIM_HELD_FREE_LOCK', e.current, 'KERNEL_HOLD_OR_FREE')
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.rows_extra[2366] = e.sys.row(2366, argv='changed inherited command')
        denied('ACTUAL_CURRENT_INHERITED_SAME_PID_CHANGED_ARGV', e.current, 'INHERITED_CHANGED')
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.listener_output = 'p100\nn127.0.0.1:9000\n'
        denied('ACTUAL_CURRENT_BOUND_LISTENER_HOLD', e.current, 'OWNED_LISTENER')
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.rows_extra[777] = e.sys.row(777, argv='unrelated new pid reuse')
        e.sys.rows_extra[777]['start'] = 'Mon Oct 19 10:00:00 2026'
        e.write_once('selected-drain.json', {'phase': 'selected', 'releaseSha256': e.a['releaseSha256'], 'ownedIdentities': [{'pid': 777, 'start': 'Mon Oct 19 09:00:00 2026'}], **e.gaps})
        check('ACTUAL_CURRENT_OLD_OWNED_PID_REUSE_QUALIFIED', e.current()['ownedLive'] == [])
        e.sys.rows_extra[777]['start'] = 'Mon Oct 19 09:00:00 2026'
        denied('ACTUAL_CURRENT_SAME_START_OWNED_STILL_LIVE', e.current, 'FINITE_OWNED_LIVE')
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.postclose, e.sys.lock_is_free = True, True
        check('ACTUAL_POSTCLOSE_CONTROLLERS_QUALIFIED_REUSE_AND_KERNEL_FREE', e.current(postclose=True)['controllersAbsentOrQualifiedReuse'] is True)
    e = current_world()
    with patch.dict(A, {'WRAPPER_SHA': A['sha'](b'wrapper')}), patch.object(P, 'BASE', e.policy.BASE), patch.object(P, 'PREIMAGE', e.a['preimageSha256']):
        e.sys.lock_is_free = True
        denied('ACTUAL_POSTCLOSE_ORIGINAL_CONTROLLERS_STILL_LIVE', lambda: e.current(postclose=True), 'CONTROLLER_STILL_LIVE')
    e = current_world()
    e.write_once('unbound-other.json', {})
    denied('ACTUAL_NAMESPACE_UNRECOGNIZED_FILE_HOLD', lambda: e.history(e.table()), 'UNEXPECTED_CONTROL_MEMBER')
    e = current_world()
    key = next(str(A['CONTROL'] / n) for n in e.c.members() if n.startswith('utility-'))
    value = A['decode'](e.sys.files[key][0])
    value['stderrComplete'] = False
    e.sys.put(Path(key), A['packed'](value))
    denied('ACTUAL_HISTORY_INCOMPLETE_UTILITY_NOT_QUIET', lambda: e.history(e.table()), 'LOCAL_IMMUTABLE_CHANGED')


def native_world():
    e = setup()
    e.register('selected')
    e.a['metadataScope'] = {'xml': str(A['XML'].relative_to(A['ROOT'])), 'cohortRoot': str(A['COHORTS'].relative_to(A['ROOT'])), 'cohortMembers': ['cohort.json', 'guard-tally.json'], 'canonicalGuard': str(A['CANONICAL_GUARD'].relative_to(A['ROOT'])), 'newRunOnly': True, 'privateBodies': False}
    env = dict(e.sys.env, JAVA_HOME=e.plan['javaHome'], LC_ALL='C')
    env['PATH'] = e.plan['nodeBin'] + ':' + e.plan['javaHome'] + '/bin:' + env['PATH']
    e.a['nativeEnvironment'] = env
    bindings = [('JAVA_SHA', '/bin/java', b'java21'), ('JAVA_RELEASE_SHA', '/release', b'JAVA_VERSION=21'), ('NODE_SHA', '/node', b'node24')]
    expected, changes = [], {}
    for constant, suffix, raw in bindings:
        path = e.plan['nodeBin'] + suffix if constant == 'NODE_SHA' else e.plan['javaHome'] + suffix
        e.sys.put(Path(path), raw)
        changes[constant] = A['sha'](raw)
        expected.append({'path': path, 'sha256': A['sha'](raw)})
    e.a['nativeExecutablePins'] = expected
    release = b'{"new":"root"}'
    e.sys.put(A['CONTROL'] / 'root-release.json', release)
    e.a['releaseSha256'] = A['sha'](release)
    changes['WRAPPER_SHA'] = A['sha'](b'wrapper')
    actual_module=e.v.module
    def injected_relay_module(path,expected,name):
        module=actual_module(path,expected,name)
        if path.name=='public_relay.py': module.Relay=FakeRelay
        return module
    e.v.module=injected_relay_module
    e.claim_once('selected')
    e.external_control_pins['root-selected-decision.json']='d'*64
    e.selected_authority_sha='d'*64
    e.selected_lifecycle='AUTHORIZED_PENDING_SETUP'
    return e, changes


def native_tests():
    e, constants = native_world()
    with patch.dict(A, constants):
        result = e.run_owned(list(P.SELECTED), 'backend', 'selected')
    check('ACTUAL_NATIVE_PINNED_CORE_SELECTED_ONE_CASE_ZERO_SKIP', result['nativeExit'] == 0 and result['junitInvocations'] == 1 and result['skips'] == 0 and result['collectionComplete'] is True)
    calls = [event for event in e.sys.events if event[0] == 'Popen' and event[1][0] == './gradlew']
    check('ACTUAL_NATIVE_EXACT_ARGV_CWD_ENV_DEVNULL', len(calls) == 1 and calls[0][1] == P.SELECTED and calls[0][2]['cwd'] == A['ROOT'] / 'backend' and calls[0][2]['env'] == dict(e.a['nativeEnvironment'],CHECKS_PUBLIC_OBSERVER_CONTROL=e.a['launchControlBase64'],CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256=e.a['observerControlSha256']) and calls[0][2]['stdin'] == subprocess.DEVNULL)
    drain = e.root_document('selected-drain.json')
    check('ACTUAL_NATIVE_FIRST_CENSUS_OWNED_BEFORE_CLASSIFICATION_AND_DRAIN', len(drain['ownedIdentities']) == 1 and drain['ownedIdentities'][0]['javaPreviouslyProved'] is True and drain['ownedJvmTerminalProof'][0]['proof'] == 'PID_ABSENT')
    e, constants = native_world()
    with patch.dict(A, constants):
        result = e.run_owned(list(P.COMPILE), 'backend', 'compile-restored')
    check('ACTUAL_NATIVE_RESTORED_COMPILE_ONLY_ZERO', result['nativeExit'] == 0 and result['testsInvoked'] is False and result['compileTaskSuccess'] is True and result['buildSuccessful'] is True)
    e, constants = native_world()
    e.sys.native_status = 1
    with patch.dict(A, constants):
        result = e.run_owned(list(P.SELECTED), 'backend', 'selected')
    check('ACTUAL_NATIVE_RAW_FAILED_EXIT_PRESERVED', result['nativeExit'] == 1 and e.root_document('selected-drain.json')['collectorExit'] == 1)
    e, constants = native_world()
    e.sys.native_wait_interrupt_once = True
    with patch.dict(A, constants):
        result = e.run_owned(list(P.SELECTED), 'backend', 'selected')
    check('ACTUAL_NATIVE_BASEEXCEPTION_WAIT_STICKY_AND_DRAINED', result['waitObservationGap'] is True and e.sys.native_live is False and e.root_document('selected-drain.json')['waitObservationGap'] is True)
    check('ACTUAL_NATIVE_NO_SIGNAL_ACTION', not any(event[0] in ('kill', 'terminate', 'signal') for event in e.sys.events))
    e, constants = native_world()
    e.a['nativeEnvironment']['JAVA_HOME'] = '/wrong'
    with patch.dict(A, constants):
        denied('ACTUAL_NATIVE_ENV_MISMATCH_BEFORE_LAUNCH', lambda: e.run_owned(list(P.SELECTED), 'backend', 'selected'), 'EXACT_NATIVE_ENVIRONMENT')
    check('ACTUAL_NATIVE_ENV_MISMATCH_CONSUMES_NO_POPEN', not any(event[0] == 'Popen' and event[1][0] == './gradlew' for event in e.sys.events))
    e, constants = native_world()
    with patch.dict(A, constants):
        denied('ACTUAL_NATIVE_EXTRA_TEST_ARGUMENT_REFUSED', lambda: e.run_owned(P.SELECTED + ['--tests', '*'], 'backend', 'selected'), 'EXACT_NATIVE_PHASE')
    e, constants = native_world()
    e.a['metadataScope']['privateBodies'] = True
    with patch.dict(A, constants):
        denied('ACTUAL_NATIVE_PRIVATE_SCOPE_REFUSED', lambda: e.run_owned(list(P.SELECTED), 'backend', 'selected'), 'EXACT_METADATA_SCOPE')


def decision_tests():
    e = setup()
    e.register('gate')
    e.explicit_exit = 1
    denied('ACTUAL_NEGATIVE_MISSING_READINESS_TYPED_AND_WRITTEN', e.read_readiness_and_separate_root_permit, 'MISSING_READINESS')
    denial = e.validate_negative()
    check('ACTUAL_NEGATIVE_CLIENT_JOURNAL_HASH_CHAIN', denial['clientJournalSha256'] == e.local_hash(e.client_name) and denial['shellPid'] == 101)
    e = setup()
    e.register('gate')
    e.explicit_exit = 0
    denied('ACTUAL_NEGATIVE_ZERO_NOT_ALLOWED', e.read_readiness_and_separate_root_permit, 'NEGATIVE_GATE_EXPLICIT_ONE')
    e = setup()
    e.register('gate')
    e.explicit_exit = 1
    e.write_once('root-close-permit.json', {})
    denied('ACTUAL_NEGATIVE_PERMIT_WITHOUT_READINESS', e.read_readiness_and_separate_root_permit, 'PERMIT_BEFORE_READINESS')
    e = setup()
    for name in ('stage-result.json', 'root-admission.json', 'held-proof.json'):
        e.write_once(name, {'kind': name})
    decision = {'authorizedBy': 'root', 'decision': 'AUTHORIZE_ONE_SELECTED_NATIVE', 'releaseSha256': e.a['releaseSha256'], 'activeLockSha256': e.a['activeLockSha256'], 'maximumInvocations': 1, 'operatorSeparateDecision': True, 'priorActualToolStatusesSeparatelyCaptured': True, 'actualToolEvidence': ['SYNTHETIC_SEPARATE_STATUS_TRACE'],
                'actualPriorEvidence': {n: e.local_hash(n) for n in ('stage-result.json', 'root-admission.json', 'held-proof.json')}}
    e.write_once('root-selected-decision.json', decision)
    check('ACTUAL_ROOT_PHASE_SEPARATE_HASH_BOUND_DECISION', e.require_root_phase_decision('AUTHORIZE_ONE_SELECTED_NATIVE') == decision)
    e = setup()
    e.write_once('stage-result.json', {'kind': 'stage'})
    decision['actualPriorEvidence'] = {'stage-result.json': e.local_hash('stage-result.json')}
    e.write_once('root-selected-decision.json', decision)
    denied('ACTUAL_ROOT_PHASE_CANNOT_OMIT_ADMISSION_HELD_FACTS', lambda: e.require_root_phase_decision('AUTHORIZE_ONE_SELECTED_NATIVE'), 'ROOT_PHASE_REQUIRED_PRIOR_FACTS')
    e = setup()
    e.write_once('preunlock-verification.json', {'releaseSha256': e.a['releaseSha256']})
    e.write_once('root-close-permit.json', {'finalActualStatus': False, 'finalSeparateStatusCaptured': True, 'finalReadinessInspected': True, 'actualToolEvidence': ['SYNTHETIC_TRACE']})
    denied('ACTUAL_FINAL_STATUS_BOOL_NOT_ZERO', e.read_readiness_and_separate_root_permit, 'ACTUAL_FINAL_INSPECTION')


def bootstrap_world(change=None):
    old = setup()
    system = old.sys
    a = json.loads(PRELOADED['runtime-root-release.template.json'])
    for key in ('rootAuthorized', 'actualReleased', 'allLiveNativeSourcePrivateCallsAuthorized', 'metadataOnlyPublicScopeAuthorized', 'exactAriaCodeReviewed', 'exactQaCodePrivacyReviewed', 'limitedSourceWindowQualified', 'literalScopeCertifiedNonIr', 'freshExclusiveSourceLease', 'gatewayProperlyClosed', 'newImmutableWrapperAndGuardBound'):
        a[key] = True
    a.update(installedPlatformQualificationReviewed=True,auxiliaryNamespaceActuallyAuthorized=True,launchControlBase64=old.a['launchControlBase64'],observerControlSha256=old.a['observerControlSha256'],relayCustody=old.a['relayCustody'])
    a['holderIdentity'] = {key: old.pin.get(key) for key in ('wrapperPid', 'shellPid', 'wrapperStart', 'shellStart', 'wrapperArgvSha256', 'shellArgvSha256', 'lockDevInode', 'wrapperLockFd')}
    a['artifactPins'] = {name: A['sha'](PRELOADED[name]) for name in A['ARTIFACTS']}
    for name in A['ARTIFACTS']:
        system.put(A['CONTROL'] / name, PRELOADED[name])
    a['adapterSha256'], a['adapterAbsolutePath'] = a['artifactPins']['public_observation_unit.py'], str(A['CONTROL'] / 'public_observation_unit.py')
    a['guardSha256'] = a['artifactPins']['guard-public-observe.bash']
    a['collectorProvenance'] = {'rootReleaseSha256': None, 'observerPostimageSha256': a['artifactPins']['Replay.postimage.java'], 'schemaSha256': a['artifactPins']['public-observation.schema.json'], 'collectorSha256': a['artifactPins']['public_contract.py']}
    a['pythonRoles'], a['observationExecutables'] = copy.deepcopy(old.a['pythonRoles']), copy.deepcopy(old.a['observationExecutables'])
    review_path = 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/synthetic-code-review.json'
    system.put(A['ROOT'] / review_path, b'{"synthetic":true}')
    a['reviewRecords'] = {role: {'path': review_path, 'sha256': A['sha'](b'{"synthetic":true}')} for role in ('architectureCode', 'qaCodePrivacy', 'sourceWindowRoot', 'gatewayPostcloseRoot', 'nonIrCertification','platformQualification','auxiliaryNamespaceRoot')}
    a['currentInputRecords'] = []
    for kind, directory in [('cachedDependency', A['DEPENDENCY_CACHE']), ('gradleDistribution', A['GRADLE_DISTRIBUTIONS'])]:
        raw, path = kind.encode(), directory / 'synthetic-artifact'
        system.put(path, raw)
        a['currentInputRecords'].append({'kind': kind, 'path': str(path), 'sha256': A['sha'](raw), 'bytes': len(raw), 'mode': 0o600})
    system.put(A['ROOT'] / A['PLAN'], PLAN_RAW)
    if change:
        change(a, system)
    raw = A['packed'](a)
    release_sha = A['sha'](raw)
    system.put(A['CONTROL'] / 'root-release.json', raw)
    system.put(A['CONTROL'] / 'active-lock.json', A['packed'](dict(old.pin, rootUnitAuthorizationSha256=release_sha, kernelExclusiveLockObserved=True)))
    entry_name='entry-0001-pins.json'
    pins={Path(n).name:A['sha'](v[0]) for n,v in system.files.items()
          if Path(n).parent==A['CONTROL'] and n.endswith('.json')
          and Path(n).name not in A['ARTIFACTS'] and Path(n).name!='root-release.json'}
    entry=A['packed'](dict(schemaVersion=1,kind='EXACT_ENTRY_EXISTING_CONTROL_PINS',authorizedBy='root',
        releaseSha256=release_sha,mode='held-proof',controlPins=pins))
    system.put(A['CONTROL']/entry_name,entry)
    system.entry_args=(entry_name,A['sha'](entry),'held-proof')
    return system, release_sha


def bootstrap_tests():
    system, release_sha = bootstrap_world()
    e = A['load'](system, release_sha, *system.entry_args)
    check('ACTUAL_BOOTSTRAP_COMPLETE_EXECUTABLE_ADAPTER_DEPENDENCIES', e.a['releaseSha256'] == release_sha and e.a['activeLockSha256'] == A['sha'](system.files[str(A['CONTROL'] / 'active-lock.json')][0]))
    check('ACTUAL_BOOTSTRAP_RELEASE_ACTIVEPIN_NO_HASH_CYCLE', json.loads(system.files[str(A['CONTROL'] / 'root-release.json')][0])['activeLockSha256'] is None and e.pin['rootUnitAuthorizationSha256'] == release_sha)
    check('ACTUAL_BOOTSTRAP_NO_SOURCE_BASELINE_OR_NATIVE_ACTION', not any(event[0] == 'Popen' or (event[0] == 'read' and ('backend/src/' in event[1] or 'preexisting-baseline.json' in event[1])) for event in system.events))
    system, release_sha = bootstrap_world(lambda a, s: a.update(activeLockSha256='0' * 64))
    denied('ACTUAL_BOOTSTRAP_REJECTS_RELEASE_ACTIVEPIN_HASH_CYCLE', lambda: A['load'](system, release_sha, *system.entry_args), 'NO_RELEASE_ACTIVE_PIN_HASH_CYCLE')
    system, release_sha = bootstrap_world(lambda a, s: a.update(releaseSha256='0' * 64))
    denied('ACTUAL_BOOTSTRAP_REJECTS_RELEASE_SELFHASH_CYCLE', lambda: A['load'](system, release_sha, *system.entry_args), 'NEW_ACTUAL_ROOT_RELEASE')
    system, release_sha = bootstrap_world(lambda a, s: s.put(A['CONTROL'] / 'public_contract.py', b'raise AssertionError("UNVERIFIED_CODE_CANARY")'))
    denied('ACTUAL_BOOTSTRAP_CODE_SUBSTITUTION_BEFORE_EXEC', lambda: A['load'](system, release_sha, *system.entry_args), 'IMMUTABLE_CONSUMED_BUFFER_CHANGED')
    system, release_sha = bootstrap_world(lambda a, s: a['currentInputRecords'][0].update(path=str(A['UNIT'] / 'private-body.json')))
    denied('ACTUAL_BOOTSTRAP_CACHE_RECORD_CANNOT_READ_PRIVATE_BODY', lambda: A['load'](system, release_sha, *system.entry_args), 'CACHE_RECORD_SCOPE')
    check('ACTUAL_BOOTSTRAP_PRIVATE_BODY_NEVER_REACHED', not any(event[0] == 'read' and 'private-body' in event[1] for event in system.events))
    system, release_sha = bootstrap_world(lambda a, s: a['holderIdentity'].update(shellPid=999))
    denied('ACTUAL_BOOTSTRAP_LITERAL_NEW_HOLDER_REQUIRED', lambda: A['load'](system, release_sha, *system.entry_args), 'ROOT_LITERAL_HOLDER_IDENTITY')
    system, release_sha = bootstrap_world(lambda a, s: a.update(metadataOnlyPublicScopeAuthorized=False))
    denied('ACTUAL_BOOTSTRAP_SCOPE_NEEDS_ACTUAL_ROOT_AUTHORITY', lambda: A['load'](system, release_sha, *system.entry_args), 'NEW_ACTUAL_ROOT_RELEASE')
    system, release_sha = bootstrap_world(lambda a, s: s.put(A['CONTROL'] / 'unexpected.log', b'PRIVATE_CANARY'))
    denied('ACTUAL_BOOTSTRAP_NAMESPACE_EXTRA_FILE', lambda: A['load'](system, release_sha, *system.entry_args), 'BOOTSTRAP_NAMESPACE_MEMBERSHIP')


def public_reader_tests():
    def prepared():
        e = current_world()
        # These precondition methods have their own actual-function tests above. The reader
        # test isolates the fixed file syscall surface and collector with injected admissions.
        e.require_phase_terminal = lambda phase: None
        e.require_root_phase_decision = lambda decision: None
        e.require_negative_and_held_admission = lambda a: None
        e.current = lambda: {'sourceDisposition': 'RESTORED'}
        e.verify_relay_closed_namespace=lambda: None
        e.write_once('selected-drain.json', {'phase': 'selected', 'startedAtEpoch': 999, 'endedAtEpoch': 1001,'collectorExit':0,'ownedJvmTerminalProof':[],'remainingOwnedNonJvmFacts':[],**{k:False for k in P.GAPS}})
        provenance=dict(e.a['collectorProvenance'],rootReleaseSha256=e.a['releaseSha256'])
        closed=A['packed'](C.record('FINALIZING','NOT_REPRODUCED'))
        relay=F['receipt'](closed,provenance);relay['controlSha256']=e.a['observerControlSha256']
        e.write_once('relay-drain.json',dict(releaseSha256=e.a['releaseSha256'],receipt=relay))
        return e
    e = prepared()
    raw = A['packed'](C.record('FINALIZING', 'NOT_REPRODUCED'))
    e.sys.put(A['UNIT'] / 'public-observation.json', raw)
    result = e.collect_public()
    check('ACTUAL_FIXED_PUBLIC_READER_VALID_CLOSED_RECORD', result['publicObservation']['captureStatus'] == 'NOT_REPRODUCED' and result['C8Credit'] is False)
    check('ACTUAL_FIXED_PUBLIC_READER_ONLY_ONE_OUTPUT_PATH', [event[1] for event in e.sys.events if event[0] == 'read' and '/public-observation' in event[1]] == [str(A['UNIT'] / 'public-observation.json')])
    check('ACTUAL_FIXED_PUBLIC_STATUS_REVALIDATES_PROVENANCE', e.public_observation_status() == 'NOT_REPRODUCED')
    e = prepared()
    result = e.collect_public()
    check('ACTUAL_FIXED_PUBLIC_MISSING_FILE_IS_UNAVAILABLE', result['publicObservation']['captureStatus'] == 'UNAVAILABLE')
    e = prepared()
    e.sys.put(A['UNIT'] / 'public-observation.json', b'{"schemaVersion":1,"schemaVersion":1,"PRIVATE_CANARY":"secret"}')
    result = e.collect_public()
    check('ACTUAL_FIXED_PUBLIC_DUPLICATE_INVALID_NO_RAW_EXPORT', result['publicObservation']['captureStatus'] == 'INVALID' and 'CANARY' not in json.dumps(result) and 'secret' not in json.dumps(result))
    e = prepared()
    e.sys.put(A['UNIT'] / 'public-observation.json', raw, stamp=1)
    denied('ACTUAL_FIXED_PUBLIC_STALE_FILE_NOT_ACCEPTED', e.collect_public, 'PUBLIC_OUTPUT_CURRENT_NATIVE_INTERVAL')


def concrete_system_tests():
    class LockCustody:
        fd = 7
        def check(self): pass
        def info(self, name): return info(inode=2)
        def open_fd(self,name,flags,**kwargs):
            ownership=A['Ownership']()
            return 8, ownership.acquire(self,8,api.close,'FILE')
        def close_fd(self,token):
            token['state']='UNKNOWN'
            token['closer'](token['fd'])
            token['state']='CLOSED' 
    api = types.SimpleNamespace(open=lambda *args, **kwargs: 8, fstat=lambda fd: info(inode=2), close=lambda fd: None,
                                O_RDONLY=os.O_RDONLY, O_NOFOLLOW=os.O_NOFOLLOW)
    observed = []
    def flock(fd, flags):
        observed.append((fd, flags))
        if flags & fcntl.LOCK_NB:
            raise OSError(errno.EAGAIN, 'SYNTHETIC_LOCK_HELD')
    fake_fcntl = types.SimpleNamespace(flock=flock, LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB, LOCK_UN=fcntl.LOCK_UN)
    with patch.dict(A, {'os': api, 'fcntl': fake_fcntl}):
        check('ACTUAL_SYSTEM_KERNEL_HELD_BRANCH', A['System']().lock_free(LockCustody(), 'gradle.lock', [1, 2]) is False)
    fake_fcntl.flock = lambda fd, flags: observed.append((fd, flags))
    with patch.dict(A, {'os': api, 'fcntl': fake_fcntl}):
        check('ACTUAL_SYSTEM_KERNEL_FREE_BRANCH_AND_UNLOCK', A['System']().lock_free(LockCustody(), 'gradle.lock', [1, 2]) is True and observed[-1][1] == fcntl.LOCK_UN)
        denied('ACTUAL_SYSTEM_KERNEL_WRONG_INODE', lambda: A['System']().lock_free(LockCustody(), 'gradle.lock', [1, 999]), 'LOCK_INODE')
    class Function:
        def __init__(self, callback): self.callback = callback
        def __call__(self, *args): return self.callback(*args)
    class Library:
        def __init__(self):
            self.proc_pidinfo = Function(self.pidinfo)
            self.proc_pidpath = Function(self.pidpath)
        def pidinfo(self, pid, flavor, unused, pointer, length):
            address = ctypes.cast(pointer, ctypes.c_void_p).value
            ctypes.c_uint32.from_address(address + 12).value = pid
            ctypes.c_uint32.from_address(address + 16).value = 100
            ctypes.c_uint64.from_address(address + 120).value = 1000
            ctypes.c_uint64.from_address(address + 128).value = 123
            return length
        def pidpath(self, pid, buffer, cap):
            ctypes.memmove(buffer, b'/synthetic/ps\x00', len(b'/synthetic/ps\x00'))
            return len(b'/synthetic/ps')
    with patch.object(ctypes, 'CDLL', lambda *args, **kwargs: Library()), patch.dict(A, {'os': types.SimpleNamespace(getpid=lambda: 100), 'sys': types.SimpleNamespace(platform='darwin')}):
        value = A['System']().utility_identity(50, '/synthetic/ps')
        check('ACTUAL_SYSTEM_KERNEL_UTILITY_IDENTITY_ABI_AND_IMAGE', value['kernelIdentityComplete'] is True and value['kernelStartSeconds'] == 1000 and value['kernelStartMicroseconds'] == 123)
        denied('ACTUAL_SYSTEM_KERNEL_UTILITY_IMAGE_MISMATCH', lambda: A['System']().utility_identity(50, '/wrong/path'), 'UTILITY_KERNEL_START_IMAGE_CHANGED')


def evidence_disposition_tests():
    names = ('selected-result.json', 'public-collection.json', 'restore-result.json', 'compile-restored-result.json', 'selected-drain.json', 'compile-restored-drain.json', 'selected-native-result.json', 'compile-restored-native-result.json', 'source-backup.json', 'root-admission.json', 'held-proof.json', 'negative-readiness-denial.json','relay-launch.json','relay-ready.json','relay-drain.json')
    def prepared(change=None):
        e = setup()
        for name in names:
            e.write_once(name, {'phase': 'selected', 'phaseExit': 1, 'nativeExit': 1} if name == 'selected-result.json' else {'synthetic': name})
        e.write_once('selected-consumed.json', {'phase': 'selected', 'releaseSha256': e.a['releaseSha256'], 'attemptCap': 1})
        e.sys.put(A['ROOT'] / A['ACTUAL_QA_REVIEW'], b'SYNTHETIC_INDEPENDENT_QA_BYTES')
        disposition = {'authorizedBy': 'root', 'releaseSha256': e.a['releaseSha256'], 'expectedWrapperExit': 1,
                       'C8Credit': False, 'IRCredit': False, 'actualEvidenceQaReviewed': True, 'restorationAccepted': True,
                       'standaloneCompileActualExit': 0, 'selectedActualToolStatus': 1, 'selectedSeparateStatusCaptured': True,
                       'standaloneCompileSeparateStatusCaptured': True, 'selectedActualToolEvidence': ['SYNTHETIC_SELECTED_STATUS'],
                       'standaloneCompileActualToolEvidence': ['SYNTHETIC_COMPILE_STATUS'],
                       'actualEvidencePins': {name: e.local_hash(name) for name in names},
                       'independentQaRecord': {'path': A['ACTUAL_QA_REVIEW'], 'sha256': A['sha'](b'SYNTHETIC_INDEPENDENT_QA_BYTES')}}
        if change:
            change(disposition)
        e.write_once('root-actual-evidence-disposition.json', disposition)
        return e
    e = prepared()
    check('ACTUAL_QUALIFIED_WRAPPER_ONE_TYPED', e.qualified_expected_wrapper_exit() == 1)
    e.require_actual_evidence_review(1)
    check('ACTUAL_EVIDENCE_REVIEW_ALL_TWELVE_RECORDS_AND_OUTER_STATUSES', True)
    e = prepared(lambda d: d.update(standaloneCompileActualExit=False))
    denied('ACTUAL_EVIDENCE_REVIEW_COMPILE_FALSE_NOT_ZERO', lambda: e.require_actual_evidence_review(1), 'ACTUAL_EVIDENCE_DISPOSITION')
    e = prepared(lambda d: d.update(selectedSeparateStatusCaptured=False))
    denied('ACTUAL_EVIDENCE_REVIEW_SEPARATE_SELECTED_STATUS_REQUIRED', lambda: e.require_actual_evidence_review(1), 'SEPARATE_ACTUAL_PHASE_TOOL_RESULTS')
    e = prepared(lambda d: d['actualEvidencePins'].update({'selected-native-result.json': '0' * 64}))
    denied('ACTUAL_EVIDENCE_REVIEW_NATIVE_RESULT_PIN_REQUIRED', lambda: e.require_actual_evidence_review(1), 'ACTUAL_EVIDENCE_PIN')
    e = prepared(lambda d: d['independentQaRecord'].update(path=str(A['UNIT'].relative_to(A['ROOT'])) + '/private-body.json'))
    denied('ACTUAL_EVIDENCE_QA_PATH_CANNOT_FALL_BACK_TO_PRIVATE', lambda: e.require_actual_evidence_review(1), 'ACTUAL_INDEPENDENT_QA_RECORD')
    e = prepared(lambda d: d.update(expectedWrapperExit=True))
    denied('ACTUAL_QUALIFIED_WRAPPER_BOOL_NOT_ONE', e.qualified_expected_wrapper_exit, 'ROOT_QUALIFIED_DISPOSITION')
    e = setup()
    e.write_once('preunlock-verification.json', {'releaseSha256': e.a['releaseSha256']})
    e.write_once('root-close-permit.json', {'finalActualStatus': 0, 'finalSeparateStatusCaptured': True, 'finalReadinessInspected': True, 'actualToolEvidence': ['SYNTHETIC_FINAL_STATUS'], 'issuedAtEpoch': 1000})
    check('ACTUAL_READINESS_SEPARATE_PERMIT_RAW_SHA', e.read_readiness_and_separate_root_permit()['actualReadinessSha256'] == e.local_hash('preunlock-verification.json'))
    e = setup()
    e.write_once('preunlock-verification.json', {'releaseSha256': e.a['releaseSha256']})
    e.write_once('root-close-permit.json', {'finalActualStatus': 0, 'finalSeparateStatusCaptured': True, 'finalReadinessInspected': True, 'actualToolEvidence': ['SYNTHETIC_FINAL_STATUS'], 'issuedAtEpoch': 1001})
    denied('ACTUAL_PERMIT_FUTURE_CLOCK_HOLD', e.read_readiness_and_separate_root_permit, 'PERMIT_FUTURE_OR_STALE')
    e = setup()
    e.write_once('preunlock-verification.json', {'releaseSha256': e.a['releaseSha256']})
    e.write_once('guard-allow.json', {'releaseSha256': e.a['releaseSha256'], 'readinessSha256': e.local_hash('preunlock-verification.json'), 'exit': 0})
    e.write_once('root-wrapper-result.json', {'releaseSha256': e.a['releaseSha256'], 'actualWrapperExit': 1, 'separatelyCaptured': True, 'guardAllowSha256': e.local_hash('guard-allow.json'), 'actualToolResultEvidence': 'SYNTHETIC_ACTUAL_WRAPPER_STATUS'})
    check('ACTUAL_WRAPPER_TOOL_RESULT_EXACT_GUARD_BOUND', e.actual_wrapper_tool_result()['guardAllowExactlyBound'] is True)


def persistent_audit(event,args):
    if event in {'subprocess.Popen','os.system','os.fork','os.kill','socket.__new__','socket.connect','socket.bind','ctypes.dlopen'}:
        raise AssertionError('AUDIT_DENIED_'+event)
    if event=='open':
        if type(args[0]) is str and args[0]==str(HERE/'runtime-adapter-check-results.json') and ('w' in str(args[1]) or args[2]&os.O_WRONLY):return
        raise AssertionError('AUDIT_DENIED_OPEN')

sys.addaudithook(persistent_audit)
with ExitStack() as stack:
    for obj, names in ((builtins, ('open',)), (io, ('open',)),
                       (Path, ('open', 'read_bytes', 'read_text', 'write_bytes', 'write_text', 'stat', 'lstat', 'resolve', 'mkdir', 'iterdir', 'glob', 'rglob', 'exists', 'is_file', 'is_dir', 'unlink', 'rename', 'replace', 'chmod', 'touch')),
                       (os, ('open', 'read', 'write', 'close', 'fstat', 'stat', 'lstat', 'listdir', 'scandir', 'mkdir', 'makedirs', 'unlink', 'remove', 'rename', 'replace', 'chmod', 'ftruncate', 'fsync', 'kill', 'fork', 'execv', 'execve', 'system', 'popen', 'pipe', 'waitpid', 'getpid', 'getppid', 'getuid')),
                       (subprocess, ('Popen', 'run', 'call', 'check_call', 'check_output')),
                       (fcntl, ('flock', 'fcntl', 'ioctl')), (socket, ('socket', 'create_connection')),
                       (threading, ('Thread','Event','Lock')),
                       (ctypes, ('CDLL',)), (time, ('sleep', 'time', 'monotonic_ns'))):
        for name in names:
            if hasattr(obj, name):
                stack.enter_context(patch.object(obj, name, FakeLock if obj is threading and name=='Lock' else blocked))
    adapter_tests()
    low_level_custody_tests()
    current_tests()
    native_tests()
    decision_tests()
    bootstrap_tests()
    public_reader_tests()
    concrete_system_tests()
    evidence_disposition_tests()
    check('ZERO_REAL_BOUNDARY_CALLS', BLOCKED == [])

result = {'kind': 'BLOCKED_ACTUAL_RUNTIME_ADAPTER_FUNCTION_TESTS', 'passed': len(RESULTS), 'failed': 0,
          'checks': RESULTS, 'sourceSha256Pins': {k:hashlib.sha256(v).hexdigest() for k,v in PRELOADED.items()}, 'realBoundaryCalls': BLOCKED, 'nativeSourcePrivateKernelActions': 0,
          'executionReady': False, 'C8SourceIRLifecycleCredit': False}
(HERE / 'runtime-adapter-check-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'checks'}))

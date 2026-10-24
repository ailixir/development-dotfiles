"""Source-only actual-function controls. Inspect this source before executing.

Every imported effect module is a closed in-memory fake in the actual subject's
compiled namespace. Persistent deny audit remains installed for the entire run.
Fixture authority differs from production: 1808/506 source files,238 dist files,
one auxiliary, tools, controller facts and inherited baseline use synthetic bytes
and matching fixture hashes. Literal95/48 case map, native vectors, bank bytes,
report assessor and all subject safety statements remain unchanged. No AST edit.
The pure SHA algorithm is real; no fake digest or acceptance helper is used.
"""
import ast
import builtins
import collections
import copy
import datetime
import errno
import fcntl
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import time
import types

D = pathlib.Path(__file__).parent
runtime_raw = (D / 'runtime.py').read_bytes()
entry_raw = (D / 'entry.py').read_bytes()
if len(sys.argv) != 3 or hashlib.sha256(runtime_raw).hexdigest() != sys.argv[1] or hashlib.sha256(entry_raw).hexdigest() != sys.argv[2]:
    raise ValueError('INDEPENDENT_SUBJECT_SOURCE_PINS_REQUIRED_BEFORE_AST')
external = json.loads((D / 'external-inputs.json').read_bytes())
static_manifest_raw = pathlib.Path(external['staticManifest']['path']).read_bytes()
if hashlib.sha256(static_manifest_raw).hexdigest() != external['staticManifest']['sha256']:
    raise ValueError('STATIC_MANIFEST_CHANGED')
buffers = {'scope.json': (D / 'scope.json').read_bytes()}
for name, row in external['files'].items():
    raw = pathlib.Path(row['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != row['sha256'] or len(raw) != row['bytes']:
        raise ValueError('STATIC_FIXTURE_INPUT_CHANGED')
    buffers[name] = raw
for raw in (runtime_raw, entry_raw):
    if any(isinstance(n, ast.Assert) for n in ast.walk(ast.parse(raw))):
        raise ValueError('RUNTIME_REMOVABLE_ASSERT')
PRELOADED = {n: sys.modules[n] for n in ('ast', 'collections', 'datetime', 'errno', 'fcntl', 'hashlib', 'json',
              'os', 'pathlib', 're', 'stat', 'subprocess', 'sys', 'time', 'types')}
SUBJECT_AST_HASH = hashlib.sha256(ast.dump(ast.parse(runtime_raw), include_attributes=False).encode()).hexdigest()

denied = []


def audit(event, args):
    if event == 'open' or event.startswith(('os.', 'subprocess.', 'socket.', 'ctypes.', 'fcntl.', '_thread.')):
        denied.append(event)
        raise RuntimeError('REAL_BOUNDARY_DENIED')


sys.addaudithook(audit)
RESULTS = []


def check(name, condition):
    if not condition:
        raise ValueError('CHECK_FAILED_' + name)
    RESULTS.append({'id': name, 'passed': True})


def rejects(name, action, reason=None):
    try:
        action()
    except (ValueError, OSError) as exc:
        check(name, reason is None or str(exc) == reason)
    else:
        check(name, False)


class Model:
    def __init__(self, optimize=0):
        self.nodes = {}
        self.fds = {}
        self.next_fd = 20
        self.next_ino = 100
        self.uid, self.pid, self.ppid = 501, 900, 800
        self.mask, self.clock, self.kernel_held = 0o077, 0., True
        self.rows_extra = {}
        self.close_fail = set()
        self.read_growth = None
        self.before_read_growth = None
        self.native_waits = 0
        self.native_calls = 0
        self.next_child = 2000
        self.writes = []
        self.observations = []
        self.utility_timeout = False
        self.utility_constructor_failure = False
        self.directory('/')
        model = self

        class P(pathlib.PurePosixPath):
            def absolute(self): return self
            def resolve(self): return self
            def lstat(self): return model.info(str(self))
            def stat(self): return model.info(str(self))
            def exists(self): return str(self) in model.nodes
            def is_symlink(self): return self.exists() and model.nodes[str(self)]['kind'] == 'symlink'
            def is_file(self): return self.exists() and model.nodes[str(self)]['kind'] == 'file'
            def is_dir(self): return self.exists() and model.nodes[str(self)]['kind'] == 'directory'
            def iterdir(self):
                return iter(P(n) for n in sorted(model.nodes) if pathlib.PurePosixPath(n).parent == self and n != str(self))
            def rglob(self, pattern):
                return iter(P(n) for n in sorted(model.nodes) if self in P(n).parents)
        self.P = P
        constants = {k: getattr(os, k) for k in ('O_RDONLY', 'O_WRONLY', 'O_RDWR', 'O_DIRECTORY', 'O_NOFOLLOW',
            'O_CREAT', 'O_EXCL', 'O_APPEND', 'SEEK_SET')}
        self.os = types.SimpleNamespace(**constants, open=self.open, close=self.close, read=self.read, write=self.write,
            fstat=self.fstat, stat=lambda p, dir_fd=None, follow_symlinks=False: self.info(self.path(p, dir_fd)),
            mkdir=self.mkdir, fchmod=self.fchmod, fsync=lambda fd: self.live(fd), ftruncate=self.truncate,
            lseek=self.seek, readlink=lambda p: self.nodes[str(p)]['target'], symlink=self.symlink,
            walk=self.walk, getuid=lambda: self.uid, getpid=lambda: self.pid, getppid=lambda: self.ppid,
            umask=self.umask, pathsep=':')
        self.time = types.SimpleNamespace(monotonic=lambda: self.clock, time=lambda: 1000000. + self.clock,
                                         sleep=self.sleep)
        self.datetime = types.SimpleNamespace(datetime=types.SimpleNamespace(now=lambda tz: types.SimpleNamespace(isoformat=lambda: 'MODEL_UTC')),
                                             timezone=types.SimpleNamespace(utc=None))
        self.fcntl = types.SimpleNamespace(LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB, LOCK_UN=fcntl.LOCK_UN, flock=self.flock)
        self.subprocess = types.SimpleNamespace(DEVNULL=-100, PIPE=-101, Popen=self.popen)
        self.sys = types.SimpleNamespace(orig_argv=['MODEL_REQUESTED_PYTHON', '-B', '-c', 'MODEL_LITERAL_LOADER'], argv=[], dont_write_bytecode=True)
        modules = {**PRELOADED, 'os': self.os, 'time': self.time, 'datetime': self.datetime,
                   'fcntl': self.fcntl, 'subprocess': self.subprocess, 'sys': self.sys,
                   'pathlib': types.SimpleNamespace(Path=P, PurePosixPath=pathlib.PurePosixPath)}
        def imported(name, globals=None, locals=None, fromlist=(), level=0):
            if level or name not in modules:
                raise ValueError('UNDECLARED_TEST_IMPORT_' + name)
            return modules[name]
        self.builtins = dict(vars(builtins), __import__=imported)
        self.ns = {'__builtins__': self.builtins, '__name__': '_source9_fake', '__file__': str(D / 'runtime.py')}
        exec(compile(runtime_raw, '<verified-runtime-same-namespace-fakes>', 'exec', optimize=optimize), self.ns)
        self.R, self.E, self.W, self.S, self.Package = (self.ns[k] for k in ('R', 'E', 'W', 'STATIC', 'PACKAGE'))
        self.buffers = dict(buffers)
        self.external = copy.deepcopy(external)
        self.setup()

    def directory(self, path, mode=0o700):
        path = str(path)
        if path != '/':
            self.directory(str(pathlib.PurePosixPath(path).parent), mode)
        if path not in self.nodes:
            self.next_ino += 1
            self.nodes[path] = {'kind': 'directory', 'mode': mode, 'ino': self.next_ino, 'data': b'', 'mtime': 1}

    def file(self, path, data, mode=0o644):
        path = str(path)
        self.directory(str(pathlib.PurePosixPath(path).parent))
        self.next_ino += 1
        self.nodes[path] = {'kind': 'file', 'mode': mode, 'ino': self.next_ino, 'data': data, 'mtime': 1}

    def info(self, path):
        if path not in self.nodes:
            raise FileNotFoundError(path)
        n = self.nodes[path]
        kind = {'file': stat.S_IFREG, 'directory': stat.S_IFDIR, 'symlink': stat.S_IFLNK}[n['kind']]
        return types.SimpleNamespace(st_dev=1, st_ino=n['ino'], st_uid=self.uid, st_mode=kind | n['mode'],
            st_size=len(n['data']), st_mtime_ns=n['mtime'], st_nlink=1)

    def path(self, path, parent=None):
        p = self.P(path)
        if not p.is_absolute():
            if parent is None:
                raise ValueError('MODEL_RELATIVE_PATH_WITHOUT_PARENT')
            p = self.P(self.live(parent)['path']) / p
        return str(p)

    def live(self, fd):
        if fd not in self.fds or self.fds[fd]['closed']:
            raise OSError('MODEL_CLOSED_FD')
        return self.fds[fd]

    def open(self, path, flags, mode=0o600, dir_fd=None):
        p = self.path(path, dir_fd)
        if flags & os.O_CREAT:
            if p in self.nodes and flags & os.O_EXCL:
                raise FileExistsError(p)
            if p not in self.nodes:
                self.file(p, b'', mode & ~self.mask)
                self.writes.append(('create', p))
        if p not in self.nodes:
            raise FileNotFoundError(p)
        if self.nodes[p]['kind'] == 'symlink' and flags & os.O_NOFOLLOW:
            raise OSError(errno.ELOOP, 'MODEL_LINK')
        if flags & os.O_DIRECTORY and self.nodes[p]['kind'] != 'directory':
            raise NotADirectoryError(p)
        self.next_fd += 1
        self.fds[self.next_fd] = {'path': p, 'node': self.nodes[p], 'position': 0, 'closed': False, 'flags': flags}
        return self.next_fd

    def fstat(self, fd):
        f = self.live(fd)
        if self.before_read_growth == fd:
            f['node']['data'] += b'growth'
            f['node']['mtime'] += 1
            self.before_read_growth = None
        p = f['path']
        current = self.nodes.get(p)
        self.nodes[p] = f['node']
        info = self.info(p)
        if current is not None:
            self.nodes[p] = current
        return info

    def close(self, fd):
        self.live(fd)
        if fd in self.close_fail:
            raise OSError('MODEL_UNKNOWN_CLOSE')
        self.fds[fd]['closed'] = True

    def read(self, fd, amount):
        f = self.live(fd)
        part = f['node']['data'][f['position']:f['position'] + amount]
        f['position'] += len(part)
        if self.read_growth == f['path']:
            f['node']['data'] += b'GROWTH'
            f['node']['mtime'] += 1
            self.read_growth = None
        return part

    def write(self, fd, raw):
        f = self.live(fd)
        n = f['node']
        if f['flags'] & os.O_APPEND:
            f['position'] = len(n['data'])
        offset = f['position']
        n['data'] = n['data'][:offset] + raw + n['data'][offset + len(raw):]
        n['mtime'] += 1
        f['position'] += len(raw)
        self.writes.append(('write', f['path'], len(raw)))
        return len(raw)

    def fchmod(self, fd, mode): self.live(fd)['node']['mode'] = mode
    def truncate(self, fd, count): self.live(fd)['node']['data'] = self.live(fd)['node']['data'][:count]
    def seek(self, fd, offset, whence): self.live(fd)['position'] = offset
    def umask(self, mode):
        old, self.mask = self.mask, mode
        return old
    def sleep(self, amount): self.clock += amount

    def mkdir(self, path, mode, dir_fd=None):
        p = self.path(path, dir_fd)
        if p in self.nodes:
            raise FileExistsError(p)
        self.directory(p, mode & ~self.mask)
        self.writes.append(('mkdir', p))

    def symlink(self, target, path, dir_fd=None):
        p = self.path(path, dir_fd)
        if p in self.nodes:
            raise FileExistsError(p)
        self.next_ino += 1
        self.nodes[p] = {'kind': 'symlink', 'mode': 0o777 & ~self.mask, 'ino': self.next_ino,
                         'data': b'', 'target': target, 'mtime': 1}
        self.writes.append(('symlink', p))

    def walk(self, root, followlinks=False):
        pending = [str(root)]
        while pending:
            directory = pending.pop(0)
            children = [n for n in self.nodes if str(self.P(n).parent) == directory and n != directory]
            dirs = [self.P(n).name for n in children if self.nodes[n]['kind'] in ('directory', 'symlink')]
            files = [self.P(n).name for n in children if self.nodes[n]['kind'] == 'file']
            yield directory, dirs, files
            pending.extend(str(self.P(directory) / d) for d in dirs if self.nodes[str(self.P(directory) / d)]['kind'] == 'directory')

    def flock(self, fd, flags):
        self.live(fd)
        if flags != fcntl.LOCK_UN and self.kernel_held:
            raise BlockingIOError(errno.EAGAIN, 'MODEL_HELD')

    def rows(self):
        rows = {self.pid: {'pid': self.pid, 'ppid': self.ppid, 'start': 'Mon Oct 19 12:00:00 2026', 'command': 'model-python-source9', 'comm': 'Python'}}
        if self.kernel_held:
            rows.update({700: {'pid': 700, 'ppid': 1, 'start': 'Mon Oct 19 11:00:00 2026', 'command': 'model-wrapper', 'comm': 'Python'},
                         800: {'pid': 800, 'ppid': 700, 'start': 'Mon Oct 19 11:00:01 2026', 'command': 'model-shell', 'comm': 'bash'}})
        else:
            rows[self.ppid] = {'pid': self.ppid, 'ppid': 1, 'start': 'Mon Oct 19 10:00:00 2026', 'command': 'model-outer-parent', 'comm': 'bash'}
        return {**rows, **self.rows_extra}

    def utility_output(self, command):
        self.observations.append(command)
        rows = self.rows()
        if command[0].endswith('/ps'):
            if '-p' in command:
                pid = int(command[command.index('-p') + 1])
                if pid not in rows:
                    return 1, b'', b''
                column = command[-1].rstrip('=')
                value = str(self.uid) if column == 'uid' else str(rows[pid][{'lstart': 'start', 'command': 'command', 'ppid': 'ppid', 'comm': 'comm'}[column]])
                return 0, (value + '\n').encode(), b''
            if command[-1] == 'pid=,comm=':
                return 0, ''.join(str(pid) + ' ' + r['comm'] + '\n' for pid, r in rows.items()).encode(), b''
            return 0, ''.join(str(pid) + ' ' + str(r['ppid']) + ' ' + r['start'] + ' ' + r['command'] + '\n' for pid, r in rows.items()).encode(), b''
        if command[0].endswith('/lsof'):
            if '-F' in command and command[command.index('-F') + 1] == 'pfin':
                return 0, ('p700\nf3\ni' + str(self.nodes[str(self.lock)]['ino']) + '\nn' + str(self.lock) + '\n').encode(), b''
            if '-p' not in command:
                return 1, b'', b''
            pid = int(command[command.index('-p') + 1])
            if '-d' in command and command[command.index('-d') + 1] == 'cwd':
                return 0, b'n/model/unrelated\n', b''
            return 0, ('n' + self.rows_extra[pid]['comm'] + '\n').encode(), b''
        if command[0].endswith('/git'):
            return 0, ('\0'.join(r['path'] for r in self.G['files']) + '\0').encode(), b''
        return 0, b'MODEL_PINNED_VERSION\n', b''

    def popen(self, command, **kwargs):
        if self.utility_constructor_failure:
            raise OSError('MODEL_CONSTRUCTOR_FAILURE')
        self.next_child += 1
        model = self
        native = 'vitest.mjs' in ' '.join(command)
        if native:
            self.native_calls += 1
            phase = 'red' if any('testNamePattern' in x for x in command) else 'green'
            report = self.report(phase)
            self.file(self.W / ('repo/' + phase + '-vitest.json'), json.dumps(report).encode(), 0o644)
            code, out, err = (1 if phase == 'red' else 0), b'MODEL_NATIVE_OUTPUT\n', b''
            self.write(kwargs['stdout'], out)
            self.write(kwargs['stderr'], err)
        else:
            code, out, err = self.utility_output(command)
        class Pipe:
            closed = False
            def close(self): self.closed = True
        class Child:
            pid = model.next_child
            returncode = code
            stdout = None if native else Pipe()
            stderr = None if native else Pipe()
            def poll(self): return self.returncode
            def wait(self, timeout):
                model.native_waits += 1
                return self.returncode
            def communicate(self, timeout):
                if model.utility_timeout:
                    self.returncode = None
                    raise subprocess.TimeoutExpired(command, timeout, output=b'PARTIAL_PRIVATE_BODY', stderr=b'PARTIAL_ERROR_BODY')
                if self.stdout is not None: self.stdout.close()
                if self.stderr is not None: self.stderr.close()
                return out, err
        return Child()

    def report(self, phase):
        cases = json.loads(self.buffers['case-map.json'])
        red = set(cases['red'])
        assertions = []
        for identity in cases['all']:
            parts = identity.split(' > ')
            selected = phase == 'red' and identity in red
            assertions.append({'ancestorTitles': parts[:-1], 'title': parts[-1],
                               'status': 'failed' if selected else 'skipped' if phase == 'red' else 'passed',
                               'failureMessages': ['expected true to be false at integrations.test.ts:310:1'] if selected else []})
        return {'numTotalTests': 95, 'numFailedTests': 48 if phase == 'red' else 0,
                'numPassedTests': 0 if phase == 'red' else 95, 'numPendingTests': 47 if phase == 'red' else 0,
                'numRuntimeErrorTestSuites': 0, 'numTodoTests': 0, 'success': phase == 'green',
                'testResults': [{'name': '/model/test/deployment/integrations.test.ts', 'message': '', 'assertionResults': assertions}]}

    def setup(self):
        h = lambda raw: hashlib.sha256(raw).hexdigest()
        for p in (self.R, self.E.parent, self.W.parent, self.S, self.Package):
            self.directory(p)
        self.scope = json.loads(self.buffers['scope.json'])
        for row in self.external['observationBinaries'].values():
            data = ('MODEL_BINARY_' + row['path']).encode()
            self.file(row['path'], data, 0o755)
            row['sha256'] = h(data)
        for name in ('node', 'helm'):
            self.file(self.scope[name], ('MODEL_TOOL_' + name).encode(), 0o755)
        self.directory(self.scope['dependencies'])
        G = json.loads(self.buffers['source-guards.json'])
        G['files'] = []
        for index in range(1808):
            name = ('backend/src/main/' if index < 506 else 'backend/src/test/') + 'model-' + str(index) + '.java'
            data = ('MODEL_SOURCE_' + str(index)).encode()
            self.file(self.R / name, data)
            G['files'].append({'path': name, 'sha256': h(data), 'mode': 0o644})
        G['dist']['files'] = []
        for index in range(238):
            name = 'model-' + str(index) + '.js'
            data = ('MODEL_DIST_' + str(index)).encode()
            self.file(self.R / 'studio-runner/dist' / name, data)
            G['dist']['files'].append({'path': name, 'sha256': h(data)})
        self.file(self.R / 'frontend/model-aux.json', b'MODEL_AUX')
        G['auxiliaryGroups'] = {'model': {'frontend/model-aux.json': h(b'MODEL_AUX')}}
        self.G = G
        self.buffers['source-guards.json'] = json.dumps(G).encode()
        I = json.loads(self.buffers['input-manifest.json'])
        for row in I['finiteCopies']:
            if row['destination'].startswith('repo/helm-chart/'):
                self.file(self.R / row['destination'].removeprefix('repo/'), self.buffers[row['bank']], row['mode'])
        self.baseline = {'identities': []}
        baseline_raw = json.dumps(self.baseline).encode()
        self.ns['BASELINE_PATH'] = 'model-baseline-only.json'
        self.ns['BASELINE_SHA'] = h(baseline_raw)
        self.file(self.R / self.ns['BASELINE_PATH'], baseline_raw)
        self.closure = self.R / 'model-previous-closure.json'
        closure_raw = json.dumps({'actualWrapperExit': 1, 'actualPostcloseExit': 0, 'actualQaRootAdopted': True}).encode()
        self.file(self.closure, closure_raw, 0o600)
        self.lock = self.R / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock'
        self.file(self.lock, b'MODEL_LOCK', 0o600)
        self.proposal = self.ns['claim'](label=self.ns['LABEL'], authorized=False, maximumCaptures=1,
            packetManifestSha256='a' * 64, nativeOrPhaseAuthorized=False,
            previousFailedUnitProperlyClosedAndAdopted=True,
            previousFailedUnitClosure={'path': str(self.closure), 'sha256': h(closure_raw)},
            wrapper={'pid': 700, 'uid': self.uid, 'start': self.rows()[700]['start'], 'argvHash': h(b'model-wrapper')},
            shell={'pid': 800, 'uid': self.uid, 'start': self.rows()[800]['start'], 'argvHash': h(b'model-shell')},
            lock={'path': str(self.lock), 'dev': 1, 'ino': self.nodes[str(self.lock)]['ino']},
            baselinePath=self.ns['BASELINE_PATH'], baselineSha256=self.ns['BASELINE_SHA'])
        existing = {}
        for p in (self.R, self.S, self.Package, self.E.parent, self.W.parent, self.P(self.scope['node']).parent, self.P(self.scope['helm']).parent, self.P(self.scope['dependencies'])):
            s = self.info(str(p))
            existing[str(p)] = {'dev': 1, 'ino': s.st_ino, 'uid': self.uid, 'mode': stat.S_IMODE(s.st_mode)}
        roots = {name: {'path': name, **row} for name, row in existing.items()}
        self.proposal['existingAncestorBindings'] = existing
        reviews, pending = {}, {}
        for role in ('Aria','Quinn'):
            path = self.R / ('model-code-review-' + role + '.json')
            raw = json.dumps({'reviewer':role,'subjectManifestSha256':'a'*64,'protocol':self.ns['PROTOCOL'],'mandatoryFindings':[]}).encode()
            self.file(path,raw,0o644)
            reviews[role] = {'path':str(path),'sha256':h(raw)}
        for role in ('Aria','Quinn','root'):
            path = self.R / ('model-pending-owner-' + role + '.json')
            raw = self.ns['encoded'](self.ns['claim'](purpose='OWNER_LOCAL_PROFILE_RULING',owner=role,
                profileAuthorized=True,packetManifestSha256='a'*64,independentCodeReviewPins=reviews,
                strongInitialSubjectReplacedOnlyForThisLocalProfile=True))
            self.file(path,raw,0o600)
            pending[role] = {'path':str(path),'sha256':h(raw)}
        self.external['nativeToolPins'] = {'node':h(b'MODEL_TOOL_node'),'helm':h(b'MODEL_TOOL_helm')}
        self.proposal.update(purpose='CAPTURE_ROOT_PROPOSAL',authorizedBy='root')
        self.proposal['proposedAuthorization'] = self.ns['claim'](purpose='CAPTURE_PENDING_AUTHORIZATION',
            authorizedBy='root',authorized=False,label=self.ns['LABEL'],packetManifestSha256='a'*64,
            canonicalPythonRoles=copy.deepcopy(self.external['canonicalPythonRoles']),
            independentCodeReviewPins=reviews,pendingOwnerRulingRefs=pending,ownerRulingPins=None,
            holdFileSha256=None,candidateBaselineSha256=None,dependencyInventory=None,distModes=None,auxModes=None,
            actualFreshToolVersions=None,previousFailedUnitProperlyClosedAndAdopted=True,
            previousFailedUnitClosure=self.proposal['previousFailedUnitClosure'],directoryRoots=roots,
            sourceDigest=G['sourceDigest'], nodeCanonicalPath=self.scope['node'], helmCanonicalPath=self.scope['helm'],
            nodeSha256=h(('MODEL_TOOL_node').encode()), helmSha256=h(('MODEL_TOOL_helm').encode()),
            dependenciesRealpath=self.scope['dependencies'], safeEnvironment={'HOME': '/model/home', 'LANG': 'en_US.UTF-8', 'LC_ALL': 'en_US.UTF-8'},
            boundBasePath='/usr/bin:/bin:/usr/sbin:/sbin')

    def context(self, operation, entry=None):
        self.pid += 1
        entry = entry or {'operation': operation, 'entryName': operation + '.entry.json', 'packetManifestSha256': 'a' * 64}
        if operation not in ('capture', 'author-control'):
            entry['inputPins'] = {self.P(name).name: hashlib.sha256(n['data']).hexdigest() for name, n in self.nodes.items()
                                 if self.P(name).parent == self.E and name.endswith('.json') and self.P(name).name != entry['entryName']}
        entry.setdefault('authorizedBy','root')
        entry.setdefault('purpose',{'capture':'ROOT_CAPTURE_ENTRY','author-control':'ROOT_AUTHOR_REQUEST'}.get(operation,'OPERATION_ENTRY'))
        ctx = self.ns['Context'](self.buffers, self.external, 'a' * 64, entry)
        ctx.client.update(legacyStart=self.rows()[self.pid]['start'],
                          observedArgvSha256=hashlib.sha256(self.rows()[self.pid]['command'].encode()).hexdigest())
        ns = {'__builtins__': self.builtins}
        exec(compile(self.buffers['contracts.py'], '<exact-real-report-assessor>', 'exec'), ns)
        ctx.assess = ns['assess']
        return ctx

    def document(self, name, value):
        value=dict(value)
        purpose=self.ns['purpose_for_name'](name)
        if purpose is not None:
            value.update(purpose=purpose)
            if purpose not in ('OWNER_LOCAL_PROFILE_RULING','ACTUAL_PHASE_ARCHIVE_QA'):
                value.setdefault('authorizedBy','root')
            if purpose in ('ACTUAL_CLIENT_COMPLETION','NEGATIVE_GUARD_STATUS','FINAL_CLOSE_PERMIT','ACTUAL_WRAPPER_RESULT'):
                value.setdefault('actualToolReference','MODEL_SEPARATELY_CAPTURED_TOOL_REFERENCE')
        self.file(self.E / name, self.ns['encoded'](value), 0o600)

    def json(self, name): return json.loads(self.nodes[str(self.E / name)]['data'])

    def completion(self, operation):
        self.document(operation + '.actual-completion.json', self.ns['claim'](authorizedBy='root', separatelyCaptured=True,
            actualToolCompleted=True, actualCollectorExit=0,
            journalSha256=hashlib.sha256(self.nodes[str(self.E / (operation + '.journal.json'))]['data']).hexdigest()))

    def release(self):
        release = self.json('admission-facts.json')['proposedAuthorization']
        release.update(authorized=True, authorizedBy='root', sourceWrites=[], cleanupAuthorized=False,
                       credit=False, C8=False, previousFailedUnitProperlyClosedAndAdopted=True,
                       previousFailedUnitClosure=self.proposal['previousFailedUnitClosure'])
        reviews = {}
        for role in ('Aria', 'Quinn'):
            path = self.R / ('model-code-review-' + role + '.json')
            raw = json.dumps({'reviewer': role, 'subjectManifestSha256': 'a' * 64,
                              'protocol': self.ns['PROTOCOL'], 'mandatoryFindings': []}).encode()
            self.file(path, raw)
            reviews[role] = {'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest()}
        release['independentCodeReviewPins'] = reviews
        pins = {}
        for role in ('Aria', 'Quinn', 'root'):
            name = 'owner-ruling-' + role + '.json'
            value = self.ns['claim'](owner=role, profileAuthorized=True, packetManifestSha256='a' * 64,
                independentCodeReviewPins=reviews,
                strongInitialSubjectReplacedOnlyForThisLocalProfile=True)
            self.document(name, value)
            pins[role] = {'name': name, 'sha256': hashlib.sha256(self.nodes[str(self.E / name)]['data']).hexdigest()}
        release['ownerRulingPins'] = pins
        self.document('root-authorization.json', release)
        return release


def run_whole():
    model = Model()
    ctx = model.context('capture')
    proposal = model.proposal
    raw = model.ns['encoded'](proposal)
    check('PENDING_NO_PHYSICAL_FACTS', model.ns['PendingHolder'](proposal, hashlib.sha256(raw).hexdigest()).physical is False)
    code = model.ns['capture'](ctx, proposal, hashlib.sha256(raw).hexdigest(), '--same-shell-once-consumed')
    ctx.owner.finish()
    check('WHOLE_CAPTURE_AUTHORIZED_FALSE', code == 0 and model.json('admission-facts.json')['authorized'] is False)
    check('WHOLE_REAL_H_AFTER_C4_MODE600', model.info(str(model.E / 'hold.json')).st_mode & 0o777 == 0o600)
    check('WHOLE_NO_NATIVE_DURING_CAPTURE', model.native_calls == 0)
    model.completion('capture')
    release = model.release()
    ctx = model.context('negative')
    check('WHOLE_NEGATIVE_RETURNS1', model.ns['negative_operation'](ctx) == 1)
    ctx.owner.finish()
    model.document('negative-exit.root-status.json', model.ns['claim'](actualNegativeStatus=1,
        separatelyCaptured=True, sameOriginalHeldShell=True, authorizedBy='root',
        denialSha256=hashlib.sha256(model.nodes[str(model.E / 'negative-exit.denial.json')]['data']).hexdigest()))
    ctx = model.context('held-proof')
    check('WHOLE_SEPARATE_HELD_PROOF0', model.ns['held_operation'](ctx) == 0)
    ctx.owner.finish()
    model.completion('held-proof')
    model.document('guard-admission.json', model.ns['claim'](negativeExitActualStatus=1,
        heldProofActualStatus=0, readonlyParentGuardInspected=True, authorizedBy='root',
        heldProofSha256=hashlib.sha256(model.nodes[str(model.E / 'held-proof.json')]['data']).hexdigest(),
        negativeStatusSha256=hashlib.sha256(model.nodes[str(model.E / 'negative-exit.root-status.json')]['data']).hexdigest()))
    previous = {'prepare': [], 'red': ['prepare'], 'install-fixed': ['red'], 'green': ['install-fixed'], 'archive': ['green']}
    for phase in model.ns['PHASES']:
        decision = model.ns['claim'](authorized=True, phase=phase,
            releaseSha256=hashlib.sha256(model.nodes[str(model.E / 'root-authorization.json')]['data']).hexdigest(),
            precedingReceipts={p: hashlib.sha256(model.nodes[str(model.E / (p + '.receipt.json'))]['data']).hexdigest() for p in previous[phase]},
            redNativeStatusSeparatelyInspected=1, redReceiptAndExactAssertionsInspected=True)
        model.document(phase + '.root-decision.json', decision)
        ctx = model.context(phase)
        code = model.ns['phase_operation'](ctx, phase)
        if code != 0:
            raise ValueError('WHOLE_PHASE_' + phase + '_' + model.json(phase + '.receipt.json').get('failureCode', 'UNKNOWN'))
        ctx.owner.finish()
        model.completion(phase)
        receipt = model.json(phase + '.receipt.json')
        check('WHOLE_' + phase.upper().replace('-', '_') + '_LOCAL_STATUS', receipt['status'] == model.ns['STATUS'])
        check('WHOLE_' + phase.upper().replace('-', '_') + '_ALL10_FALSE', all(x is False for x in receipt['guarantees'].values()))
    check('WHOLE_EXACTLY_TWO_NATIVE_CALLS', model.native_calls == 2 and model.native_waits == 2)
    check('WHOLE_RED_RAW1_GREEN_RAW0', model.json('red.receipt.json')['nativeExit'] == 1 and model.json('green.receipt.json')['nativeExit'] == 0)
    check('WHOLE_ARCHIVE_FILE_MODE644_UNDER077', model.info(str(model.E / 'final-fixed-chart-archive/templates/_helpers.tpl')).st_mode & 0o777 == 0o644)
    check('WHOLE_ARCHIVE_LINK_ENTRY_ONLY', model.nodes[str(model.E / 'complete-workspace-archive/repo/studio-runner/node_modules')]['kind'] == 'symlink')
    ctx = model.context('final')
    model.ns['bind_entry'](ctx)
    immutable = model.ns['immutable_tuple'](ctx)
    ctx.owner.finish()
    model.document('actual-qa-review.json', model.ns['claim'](reviewer='Quinn', actualPhaseAndArchiveReviewed=True,
        mandatoryFindings=[], immutableTuple=immutable, ownerRulingPins=release['ownerRulingPins']))
    model.document('actual-review.root-adoption.json', model.ns['claim'](authorizedBy='root', actualPhaseAndArchiveQaAdopted=True,
        ownerRulingPins=release['ownerRulingPins'], actualQaReviewName='actual-qa-review.json',
        actualQaReviewSha256=hashlib.sha256(model.nodes[str(model.E / 'actual-qa-review.json')]['data']).hexdigest()))
    ctx = model.context('final')
    check('WHOLE_STANDALONE_FINAL0', model.ns['final_operation'](ctx) == 0)
    ctx.owner.finish()
    model.completion('final')
    readiness = model.json('final-readiness.json')
    model.document('close.root-permit.json', model.ns['claim'](authorizedBy='root', issuedAtEpoch=model.time.time(),
        actualFinalStatus=0, finalResultAndReadinessSeparatelyInspected=True, expectedWrapperExit=0,
        ownerRulingPins=release['ownerRulingPins'],
        readinessSha256=hashlib.sha256(model.nodes[str(model.E / 'final-readiness.json')]['data']).hexdigest(),
        finalResultSha256=hashlib.sha256(model.nodes[str(model.E / 'final-result.json')]['data']).hexdigest()))
    ctx = model.context('gate')
    model.pre_gate_nodes = copy.deepcopy(model.nodes)
    model.pre_gate_clock = model.clock
    check('WHOLE_EXACT_GATE0', model.ns['gate_operation'](ctx) == 0)
    ctx.owner.finish()
    check('WHOLE_FRESH_GATE_SEGMENT_DIFFERS_FINAL', model.json('allow-close.json')['currentFacts']['frozenLedgerSegments'][0]['path']
          != readiness['currentFacts']['frozenLedgerSegments'][0]['path'])
    model.completion('gate')
    model.document('actual-wrapper.root-result.json', model.ns['claim'](authorizedBy='root', actualWrapperExit=0,
        separatelyCaptured=True, allowCloseSha256=hashlib.sha256(model.nodes[str(model.E / 'allow-close.json')]['data']).hexdigest()))
    model.kernel_held, model.ppid = False, 600
    ctx = model.context('postclose')
    check('WHOLE_OUTER_POSTCLOSE0', model.ns['postclose_operation'](ctx) == 0)
    ctx.owner.finish()
    check('WHOLE_NO_REAL_IDENTITY_OR_CREDIT', model.json('postclose.json')['credit'] is False
          and model.json('postclose.json')['historicalIdentityUncertainty'] is True)
    return model


# The entire source is inspected and supplied exact source hashes before this call.
whole = run_whole()

# Explicit guard predicates, normal and optimized source evaluation.
for optimize in (0, 1):
    model = Model(optimize)
    for name in model.ns['GUARANTEE_NAMES']:
        value = model.ns['claim']()
        value['guarantees'][name] = 0
        rejects('FLAG_LITERAL_' + name + '_O' + str(optimize), lambda v=value: model.ns['validate_claim'](v))
    for name in model.ns['UNSUPPORTED_NAMES']:
        value = model.ns['claim']()
        value['unsupportedEvidence'][name]['value'] = 'INVENTED'
        rejects('UNSUPPORTED_NULL_' + name + '_O' + str(optimize), lambda v=value: model.ns['validate_claim'](v))
    value = model.ns['claim']()
    model.ns['validate_claim'](value)
    check('VALID_CLAIM_O' + str(optimize), True)
    for field in ('credit', 'C8', 'cleanupAuthorized'):
        widened = model.ns['claim'](**{field: True})
        rejects('NO_SCOPE_CREDIT_' + field + '_O' + str(optimize), lambda v=widened: model.ns['validate_claim'](v))
    rejects('OLD_PROTOCOL_O' + str(optimize), lambda: model.ns['validate_claim']({'protocol': 'WAITED_NATIVE_WITH_SAMPLED_CLOSURE_V1'}))

# Every individual existing pre-C4 predicate fails without E writes.
for name in ('mask', 'wrapper-start', 'shell-parent', 'lock-object', 'kernel-free', 'ancestor', 'workspace-exists'):
    model = Model()
    if name == 'mask': model.mask = 0o022
    if name == 'wrapper-start': model.proposal['wrapper']['start'] = 'WRONG'
    if name == 'shell-parent': model.proposal['shell']['pid'] = 801
    if name == 'lock-object': model.proposal['lock']['ino'] += 1
    if name == 'kernel-free': model.kernel_held = False
    if name == 'ancestor': model.proposal['existingAncestorBindings'][str(model.R)]['ino'] += 1
    if name == 'workspace-exists': model.directory(model.W)
    ctx = model.context('capture')
    raw = model.ns['encoded'](model.proposal)
    rejects('PRE_C4_' + name.replace('-', '_'), lambda: model.ns['capture'](ctx, model.proposal, hashlib.sha256(raw).hexdigest(), '--same-shell-once-consumed'))
    check('PRE_C4_ZERO_E_WRITES_' + name.replace('-', '_'), not any(x[1] == str(model.E) or x[1].startswith(str(model.E) + '/') for x in model.writes))

for invalid in (-1, True):
    model = Model();ctx = model.context('capture')
    model.proposal['wrapper']['pid'] = invalid
    raw = model.ns['encoded'](model.proposal)
    rejects('PRE_C4_PID_TYPE_' + str(invalid), lambda: model.ns['capture'](ctx, model.proposal, hashlib.sha256(raw).hexdigest(), '--same-shell-once-consumed'))
    check('INVALID_PID_ZERO_OBSERVATION_' + str(invalid), model.observations == [])

# Actual acquired-FD resource and streaming behavior under the fake OS.
model = Model()
owner = model.ns['Ownership']()
fs = model.ns['Files'](owner)
model.file('/model/source', b'EXACT', 0o644)
model.directory('/model/destination')
copied = fs.copy(model.P('/model/source'), model.P('/model/destination/copy'), 0o644, model.ns['Budget']())
check('FD_COPY_EXACT_REAL_SHA', copied['sha256'] == hashlib.sha256(b'EXACT').hexdigest())
check('FD_COPY_FCHMOD_OVERRIDES077', model.info('/model/destination/copy').st_mode & 0o777 == 0o644)
owner.finish()
check('ALL_ACQUIRED_COPY_FDS_CLOSED', all(t['closed'] for t in owner.tokens))
for cap, budget in [('file', model.ns['Budget'](per_file=4)), ('total', model.ns['Budget'](total=4)), ('entry', model.ns['Budget'](entries=0))]:
    owner = model.ns['Ownership']();fs = model.ns['Files'](owner)
    rejects('COPY_' + cap.upper() + '_CAP', lambda: fs.copy(model.P('/model/source'), model.P('/model/destination/' + cap), 0o644, budget))
    check('COPY_' + cap.upper() + '_NO_TARGET', '/model/destination/' + cap not in model.nodes)
    owner.finish()
owner = model.ns['Ownership']();fs = model.ns['Files'](owner)
model.read_growth = '/model/source'
rejects('ACTUAL_STREAM_GROWTH_BEFORE_COPY_WRITE', lambda: fs.copy(model.P('/model/source'), model.P('/model/destination/growth'), 0o644, model.ns['Budget']()))
check('ACTUAL_STREAM_GROWTH_NO_OVERLIMIT_WRITE', model.nodes['/model/destination/growth']['data'] == b'')
owner.finish()
owner = model.ns['Ownership']();fs = model.ns['Files'](owner)
t = fs.open('/model/source', os.O_RDONLY)
model.close_fail.add(t['handle'])
rejects('UNKNOWN_CLOSE_RETAINED', lambda: owner.close(t))
check('UNKNOWN_CLOSE_CANONICAL_NOT_CLOSED', t['closeState'] == 'UNKNOWN' and t['closed'] is False)
rejects('UNKNOWN_CLOSE_NO_RETRY', lambda: owner.close(t))

# Actual Popen wrapper partial failures; no raw partial body is serialized.
for name in ('timeout', 'constructor'):
    model = Model();ctx = model.context('capture')
    model.utility_timeout = name == 'timeout'
    model.utility_constructor_failure = name == 'constructor'
    rejects('UTILITY_' + name.upper() + '_HOLD', lambda: model.ns['no_signal_process'](ctx, ['/model/tool'], 'b' * 64))
    failure = ctx.failure('MODEL_FAILURE')
    text = json.dumps(failure)
    check('UTILITY_' + name.upper() + '_TYPED_NO_BODY', 'PARTIAL_PRIVATE_BODY' not in text and 'PARTIAL_ERROR_BODY' not in text)
    check('UTILITY_' + name.upper() + '_NO_FALSE_WAIT', ctx.owner.utility[-1]['terminalWaitConfirmed'] is False)

# Bounded append-only ledger before actual detail failure and cap denial.
model = Model();model.directory(model.E);ctx = model.context('capture')
ctx.start_segment('adverse')
C = model.ns['load_core'](ctx, model.proposal)
model.rows_extra[777] = {'pid': 777, 'ppid': 1, 'start': 'Mon Oct 19 12:00:00 2026', 'command': 'model-node', 'comm': 'node'}
C['identity'] = lambda row: (_ for _ in ()).throw(ValueError('MODEL_DETAIL_FAILURE'))
rejects('DETAIL_FAILURE_STILL_LEDGERED', lambda: model.ns['sample'](ctx, C))
check('CANDIDATE_PRECEDES_FALLIBLE_DETAIL', any(e['kind'] == 'CANDIDATE_ENCOUNTER_BEFORE_DETAIL' for e in ctx.events))
small = model.ns['Ledger'](ctx.fs, model.E / 'small.samples.jsonl', records=1, size=1024)
small.append('one', {})
rejects('LEDGER_CAP_NO_HISTORY_RESET', lambda: small.append('two', {}))
check('LEDGER_FIRST_RECORD_RETAINED', small.sequence == 1)
ctx.deadline = model.clock + 300
for _ in range(3): model.ns['episode'](ctx, 'same', lambda: None)
rejects('EPISODE_FOURTH_DENIED', lambda: model.ns['episode'](ctx, 'same', lambda: None))
check('EPISODE_SEPARATION_UNREFRESHED', model.clock >= .5 and ctx.episodes['same']['attempts'] == 3)
ctx.deadline = model.clock - 1
rejects('ORIGINAL_DEADLINE_NOT_REFRESHED', lambda: model.ns['episode'](ctx, 'another', lambda: None))

# Actual local report assessor rejects summary/identity/assertion substitutions.
model = Model();ctx = model.context('capture')
case_map = json.loads(model.buffers['case-map.json'])
for name in ('native', 'identity', 'assertion', 'skip'):
    report = model.report('red' if name != 'skip' else 'green')
    phase = 'red' if name != 'skip' else 'green'
    code = 1 if phase == 'red' else 0
    if name == 'native': code = 0
    if name == 'identity': report['testResults'][0]['assertionResults'][0]['title'] += ' WRONG'
    if name == 'assertion':
        next(r for r in report['testResults'][0]['assertionResults'] if r['status'] == 'failed')['failureMessages'] = ['wrong failure']
    if name == 'skip': report['testResults'][0]['assertionResults'][0]['status'] = 'skipped'
    rejects('REPORT_' + name.upper() + '_DENIED', lambda r=report, p=phase, c=code: ctx.assess(r, p, c, case_map))
for name, now in [('expired', 61), ('clock-reversed', -1)]:
    rejects('FRESHNESS_' + name.upper().replace('-', '_'), lambda n=now: model.ns['freshness'](n, 0))
check('FRESHNESS_BOUNDARY60', model.ns['freshness'](60, 0) is None)

# Remaining specified adversarial integration cases, prepared before second run.
for optimize in (0, 1):
    model = Model(optimize)
    ens = {'__builtins__': dict(model.builtins, print=lambda *args, **kwargs: None), '__name__': '_entry_fake'}
    exec(compile(entry_raw, '<verified-actual-entry-bootstrap>', 'exec', optimize=optimize), ens)
    raw = b'{"bound":true}'
    model.file('/model/control.json', raw, 0o600)
    check('BOOTSTRAP_VALID_SAME_BUFFER_O' + str(optimize), ens['bootstrap_read'](model.P('/model/control.json'), hashlib.sha256(raw).hexdigest()) == raw)
    rejects('BOOTSTRAP_WRONG_HASH_BEFORE_PARSE_O' + str(optimize), lambda: ens['bootstrap_read'](model.P('/model/control.json'), '0' * 64))
    # Complete real loader reaches the dispatcher after exact own/external buffers;
    # the malformed synthetic proposal then deliberately denies before C4.
    model.file(model.Package / 'runtime.py', runtime_raw)
    model.file(model.Package / 'scope.json', buffers['scope.json'])
    ext_raw = json.dumps(external).encode()
    model.file(model.Package / 'external-inputs.json', ext_raw)
    model.file(external['staticManifest']['path'], static_manifest_raw)
    for name, row in external['files'].items():
        model.file(row['path'], buffers[name], row['mode'])
    members = []
    for name in ('runtime.py', 'scope.json', 'external-inputs.json'):
        data = model.nodes[str(model.Package / name)]['data']
        members.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'mode': 0o644})
    manifest_raw = json.dumps({'kind': 'GATEWAY9_INACTIVE_LOCAL_RUNNER_SOURCE_SEAL', 'files': members}).encode()
    manifest_sha = hashlib.sha256(manifest_raw).hexdigest()
    model.file(model.Package / 'manifest.json', manifest_raw)
    model.file('/model/proposal.json', b'{}', 0o600)
    loader_entry = {'operation': 'capture', 'purpose':'ROOT_CAPTURE_ENTRY','authorizedBy':'root', 'packetManifestSha256': manifest_sha,
                    'proposalPath': '/model/proposal.json', 'proposalSha256': hashlib.sha256(b'{}').hexdigest(),
                    'sameShellToken': '--same-shell-once-consumed'}
    entry_data = json.dumps(loader_entry).encode()
    model.file('/model/capture.entry.json', entry_data, 0o600)
    check('FULL_LOADER_VALID_BUFFERS_REACH_CAPTURE_DENIAL_O' + str(optimize), ens['launch']([manifest_sha,
        '/model/capture.entry.json', hashlib.sha256(entry_data).hexdigest(), '--operation', 'capture']) == 1)
    check('FULL_LOADER_DENIAL_ZERO_E_WRITES_O' + str(optimize), str(model.E) not in model.nodes)
    model.nodes[str(model.Package / 'runtime.py')]['data'] += b'\n#SUBSTITUTED'
    rejects('FULL_LOADER_CODE_SUBSTITUTION_O' + str(optimize), lambda: ens['launch']([manifest_sha,
        '/model/capture.entry.json', hashlib.sha256(entry_data).hexdigest(), '--operation', 'capture']))

model = Model();ctx = model.context('capture')
original_write = model.os.write
def fail_h_write(fd, raw):
    if model.live(fd)['path'] == str(model.E / 'hold.json'):
        raise OSError('MODEL_PARTIAL_H_WRITE')
    return original_write(fd, raw)
model.os.write = fail_h_write
proposal_raw = model.ns['encoded'](model.proposal)
rejects('PARTIAL_REAL_H_CREATION_RETAINED', lambda: model.ns['capture'](ctx, model.proposal,
    hashlib.sha256(proposal_raw).hexdigest(), '--same-shell-once-consumed'))
check('PARTIAL_H_NO_BACKFILL_OR_RESET', str(model.E) in model.nodes and model.nodes[str(model.E / 'hold.json')]['data'] == b'')
check('PARTIAL_H_TYPED_WRITE_ATTEMPT_TRUE', ctx.failure('MODEL_H_FAILURE')['outputDirectoryWriteAttempted'] is True)

model = Model();owner = model.ns['Ownership']();fs = model.ns['Files'](owner)
model.directory('/model')
model.os.fstat = lambda fd: (_ for _ in ()).throw(OSError('MODEL_VALIDATION_FAILURE'))
rejects('OPEN_OWNED_BEFORE_VALIDATION_FAILURE', lambda: fs.parent(model.P('/model/source')))
check('PARTIAL_PARENT_FDS_STILL_OWNED', len(owner.tokens) == 2 and all(not t['closed'] for t in owner.tokens))
owner.finish()

for kind in ('unknown', 'attributed-reuse', 'inherited-drift'):
    model = Model();model.directory(model.E);ctx = model.context('capture')
    ctx.release = {'nodeSha256': hashlib.sha256(b'MODEL_CANDIDATE_NODE').hexdigest()}
    ctx.start_segment('boundary-adverse')
    model.file('/model/tool/node', b'MODEL_CANDIDATE_NODE', 0o755)
    model.rows_extra[777] = {'pid': 777, 'ppid': 1, 'start': 'Mon Oct 19 12:00:00 2026',
                              'command': '/model/tool/node', 'comm': '/model/tool/node'}
    C = model.ns['load_core'](ctx, model.proposal)
    old = []
    attributed = []
    if kind == 'unknown':
        C['identity'] = lambda row: None
    elif kind == 'attributed-reuse':
        model.file('/model/tool/worker', b'MODEL_CANDIDATE_NODE', 0o755)
        model.rows_extra[777].update(command='/model/tool/worker', comm='/model/tool/worker')
        attributed = [{'pid': 777, 'launchId': 'OTHER_EVENT_NOT_IDENTITY'}]
    else:
        row = model.rows()[777]
        observed = {k: v for k, v in row.items() if k not in ('command', 'comm')}
        observed['argvHash'] = hashlib.sha256(row['command'].encode()).hexdigest()
        old = [dict(model.ns['legacy_identity'](ctx, observed), executableFileHash='0' * 64)]
    rejects('CURRENT_' + kind.upper().replace('-', '_') + '_HARD_HOLD', lambda: model.ns['boundaries'](ctx, C, attributed, old))
    rejects('FAILED_BOUNDARY_NO_RETRY_' + kind.upper().replace('-', '_'), lambda: model.ns['boundaries'](ctx, C, attributed, old))

model = Model();model.directory(model.E);ctx = model.context('capture');ctx.start_segment('historical-gone')
ctx.encounters.append({'pid': 777, 'legacyStart': None, 'encounterId': 'OLD_UNPAIRED_EVENT'})
C = model.ns['load_core'](ctx, model.proposal)
proofs = model.ns['boundaries'](ctx, C)
check('HISTORICAL_GONE_IS_NOT_EXIT_PROOF', all(p['currentSampleStates'][0]['state'] == 'NO_LONGER_OBSERVED_NOT_EXIT_PROOF'
    and p['historicalIdentityUncertainty'] is True for p in proofs))

ctx = whole.context('final')
changed = str(whole.E / 'candidate-baseline.json')
saved = whole.nodes[changed]['data']
whole.nodes[changed]['data'] += b' '
rejects('ENTRY_CONTROL_SUBSTITUTION_BEFORE_PARSE', lambda: whole.ns['bind_entry'](ctx))
whole.nodes[changed]['data'] = saved
ctx = whole.context('prepare');whole.ns['bind_entry'](ctx)
ctx.control_raw['guard-admission.json'] = json.dumps({'negativeExitActualStatus': 1, 'heldProofActualStatus': 0,
    'readonlyParentGuardInspected': True}).encode()
rejects('OLD_BOOLEAN_ONLY_GUARD_ADMISSION_DENIED', lambda: whole.ns['guard_admission'](ctx))
ctx = whole.context('prepare');whole.ns['bind_entry'](ctx)
admission = ctx.control('guard-admission.json');admission['heldProofSha256'] = '0' * 64
ctx.control_raw['guard-admission.json'] = whole.ns['encoded'](admission)
rejects('GUARD_ADMISSION_EXACT_HELD_PROOF_PIN', lambda: whole.ns['guard_admission'](ctx))

for kind in ('pre-stale', 'post-stale', 'tuple-drift'):
    model = Model();model.nodes = copy.deepcopy(whole.pre_gate_nodes);model.clock = whole.pre_gate_clock
    model.pid = 5000
    model.next_ino = max(n['ino'] for n in model.nodes.values()) + 1
    if kind == 'pre-stale':
        model.clock += 61
    if kind == 'post-stale':
        original_sleep = model.time.sleep
        def expire_after_observation(amount):
            original_sleep(amount)
            model.clock += 61
        model.time.sleep = expire_after_observation
    if kind == 'tuple-drift':
        ready = model.json('final-readiness.json');ready['immutableTuple']['sourceDigest'] = 'WRONG'
        model.document('final-readiness.json', ready)
        final = model.json('final-result.json');final['immutableTuple'] = ready['immutableTuple']
        final['readinessSha256'] = hashlib.sha256(model.nodes[str(model.E / 'final-readiness.json')]['data']).hexdigest()
        model.document('final-result.json', final)
        permit = model.json('close.root-permit.json')
        permit['readinessSha256'] = final['readinessSha256']
        permit['finalResultSha256'] = hashlib.sha256(model.nodes[str(model.E / 'final-result.json')]['data']).hexdigest()
        model.document('close.root-permit.json', permit)
    ctx = model.context('gate')
    rejects('ACTUAL_GATE_' + kind.upper().replace('-', '_') + '_DENIAL', lambda: model.ns['gate_operation'](ctx))
    check('ACTUAL_GATE_' + kind.upper().replace('-', '_') + '_NO_ALLOW', str(model.E / 'allow-close.json') not in model.nodes)

model = whole
entry = {'operation': 'author-control', 'packetManifestSha256': 'a' * 64, 'authorizedBy': 'root',
         'role': 'ROOT_ATTESTATION_AUTHOR_ONLY', 'outputName': 'postclose.entry.json',
         'runtimeIdentity': {'dev': 1, 'ino': model.nodes[str(model.E)]['ino']},
         'document': {'operation': 'postclose'}}
ctx = model.context('author-control', entry)
check('SEALED_ROOT_ENTRY_AUTHOR0', model.ns['author_control'](ctx) == 0)
authored = model.json('postclose.entry.json')
check('ROOT_ENTRY_MAP_COMPLETE_AND_ACYCLIC', 'postclose.entry.json' not in authored['inputPins']
    and set(authored['inputPins']) == {model.P(n).name for n in model.nodes if model.P(n).parent == model.E
                                      and n.endswith('.json') and model.P(n).name != 'postclose.entry.json'})

model = Model();owner = model.ns['Ownership']();fs = model.ns['Files'](owner)
model.file('/model/source-before-growth', b'EXACT', 0o644)
model.directory('/model/dest-before-growth')
info = model.info('/model/source-before-growth')
expected = {'dev': info.st_dev, 'ino': info.st_ino, 'uid': info.st_uid, 'bytes': info.st_size}
model.nodes['/model/source-before-growth']['data'] += b'GROWTH'
rejects('INVENTORY_GROWTH_CAP_BEFORE_STREAM', lambda: fs.copy(model.P('/model/source-before-growth'),
    model.P('/model/dest-before-growth/copy'), 0o644, model.ns['Budget'](total=5, per_file=5), expected=expected))
check('INVENTORY_GROWTH_NO_TARGET_CREATED', '/model/dest-before-growth/copy' not in model.nodes)
owner.finish()

# A launched native remains correlated to the actual handle even if the very
# first durable encounter append fails. Its real direct wait is still attempted.
model = Model();model.nodes = copy.deepcopy(whole.pre_gate_nodes);model.clock = whole.pre_gate_clock
model.pid = 6000;model.next_ino = max(n['ino'] for n in model.nodes.values()) + 1
for name in ('red-vitest.json', 'red.stdout', 'red.stderr', 'red.launch-request.json'):
    path = str(model.W / 'repo/red-vitest.json') if name == 'red-vitest.json' else str(model.E / name)
    model.nodes.pop(path, None)
ctx = model.context('red');model.ns['bind_entry'](ctx)
ctx.start_segment('failed-native-ledger')
ctx.ledger.max_records = 0
C = model.ns['load_core'](ctx, model.proposal)
rejects('NATIVE_LEDGER_FAILURE_STAYS_HOLD', lambda: model.ns['run_native'](ctx, 'red', C, []))
check('NATIVE_LEDGER_FAILURE_ACTUAL_DIRECT_WAIT', model.native_waits == 1
      and any(ctx.owner.waited.values()) and len(ctx.owner.children) >= 1)

model = Model();model.nodes = copy.deepcopy(whole.pre_gate_nodes);model.pid = 7000
model.next_ino = max(n['ino'] for n in model.nodes.values()) + 1
target = model.W / 'repo/helm-chart/put-checks/templates/_helpers.tpl'
model.nodes[str(target)]['data'] = model.buffers['banks/original-helper.tpl']
ctx = model.context('install-fixed');model.ns['bind_entry'](ctx)
original_open = model.os.open
def replace_at_install_open(path, flags, mode=0o600, dir_fd=None):
    if model.path(path, dir_fd) == str(target) and flags & os.O_RDWR:
        model.file(target, model.buffers['banks/original-helper.tpl'], 0o644)
    return original_open(path, flags, mode, dir_fd)
model.os.open = replace_at_install_open
rejects('FIXED_INSTALL_REPLACED_FD_BEFORE_WRITE', lambda: model.ns['install_fixed'](ctx))
check('FIXED_INSTALL_REPLACEMENT_NOT_WRITTEN', model.nodes[str(target)]['data'] == model.buffers['banks/original-helper.tpl'])
check('PERSISTENT_DENY_AUDIT_NO_REAL_BOUNDARY', denied == [])
print(json.dumps({'kind': 'SOURCE9_GUARDED_ACTUAL_FUNCTION_CONTROLS', 'checks': len(RESULTS), 'results': RESULTS,
    'wholeFreshCaptureFivePhasesFinalGatePostclose': True, 'subjectAstInstrumentation': False,
    'subjectAstSha256': SUBJECT_AST_HASH, 'runtimeSourceSha256': hashlib.sha256(runtime_raw).hexdigest(),
    'entrySourceSha256': hashlib.sha256(entry_raw).hexdigest(), 'original333ControlsReplayed': 0,
    'actualNativeOrOsProviderActions': 0, 'boundaryAttempts': denied,
    'fixtureAuthorityAdaptation': '1808/506 source,238 dist,tools,controller and baseline bytes/hash authority synthetic; bank/report/profile literal; no cryptographic algorithm replacement',
    'limitations': ['No actual sourcef9 or OS timing proof', 'No actual readonly shell wrapper execution',
                    'No platform/tool compatibility, actual reports or resource closure', 'All10 unsupported guarantees remain false']}, indent=2))

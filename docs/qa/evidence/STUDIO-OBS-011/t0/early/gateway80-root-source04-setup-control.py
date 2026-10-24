"""Root setup control author; no observer, native launch or binary-map factory."""
import ast
import hashlib
import json
import os
import re
import stat
from pathlib import Path

R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
S = T / 'early/gateway80-failed-red-resource-prep/resume4'
N = T / 'runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition02'
AUTH = 'd81ab9688986609f3d3ab9c323743da11a3f1fb7b248b26cc1750aaf9b1781dd'
SOURCE = 'cac4f5a1d4e770ae9d2ee65354b9ce7d93c48a41d49ccbb7c39ebbaa95d47b2e'
owners = []
chains = []
failure = None
cleanup = []
created = False
result = None

class ControlHold(ValueError):
    def __init__(self, reason):
        super().__init__()
        self.reason = reason

def need(ok, reason):
    if ok is not True:
        raise ControlHold(reason)

def key(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def own(fd):
    owners.append(dict(fd=fd, state='OPEN'))
    return fd

def directory(path):
    need(path.is_absolute() and len(path.parts) <= 40, 'DIRECTORY_PATH')
    fd = own(os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW))
    chains.append((None, '/', fd, key(os.fstat(fd))[:4]))
    for name in path.parts[1:]:
        parent = fd
        fd = own(os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent))
        chains.append((parent, name, fd, key(os.fstat(fd))[:4]))
    return fd

def check():
    for parent, name, fd, expected in chains:
        named = os.stat(name, follow_symlinks=False) if parent is None else os.stat(name, dir_fd=parent, follow_symlinks=False)
        need(key(os.fstat(fd))[:4] == expected == key(named)[:4], 'DIRECTORY_CHANGED')

def read(parent, name, expected, mode, maximum=16777216):
    fd = own(os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent))
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == 501 and stat.S_IMODE(before.st_mode) == mode and before.st_nlink == 1 and 0 <= before.st_size <= maximum, 'INPUT_METADATA')
    raw = bytearray()
    while len(raw) < before.st_size:
        part = os.read(fd, min(65536, before.st_size - len(raw)))
        need(type(part) is bytes and len(part) > 0, 'INPUT_SHORT')
        raw.extend(part)
    need(key(before) == key(os.fstat(fd)) == key(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'INPUT_CHANGED')
    need(hashlib.sha256(raw).hexdigest() == expected, 'INPUT_SHA')
    return bytes(raw)

def packed(v):
    return json.dumps(v, sort_keys=True, separators=(',', ':'), allow_nan=False).encode() + b'\n'

try:
    need(os.getuid() == 501, 'ROOT_UID')
    source_fd = directory(S)
    manifest = json.loads(read(source_fd, 'manifest.json', SOURCE, 0o644, 1048576))
    template_rows = [r for r in manifest['files'] if r['path'] == 'setup-ownership.template.json']
    need(len(template_rows) == 1, 'TEMPLATE_MEMBER')
    doc = json.loads(read(source_fd, 'setup-ownership.template.json', template_rows[0]['sha256'], 0o644))
    nfd = directory(N)
    ns = os.fstat(nfd)
    need((ns.st_dev, ns.st_ino, ns.st_uid, stat.S_IMODE(ns.st_mode)) == (16777229, 219229306, 501, 0o700), 'CURRENT_N02_IDENTITY')
    auth_raw = read(nfd, 'root-authorization.json', AUTH, 0o600)
    auth = json.loads(auth_raw)
    expected = dict(auth['codePins'])
    expected['root-authorization.json'] = AUTH
    need(set(os.listdir(nfd)) == set(expected), 'EXACT_PREEXISTING_SEVEN')
    buffers = {'root-authorization.json': auth_raw}
    for name, sha in auth['codePins'].items():
        buffers[name] = read(nfd, name, sha, 0o600)
    doc.update(authorizedBy='root', releaseSha256=AUTH, actualAuthority=True,
               separatelyCaptured=True, oldBindingsUnchanged=True, newBindingsReadonly=True,
               setupHelperRosterComplete=True, readEofStatus=1,
               actualBufferVerificationExit=0, actualEvalExit=0)
    doc['inputPins'] = {str(N / name): sha for name, sha in expected.items()}
    helper_rows = [
        (83174, 'VERIFIER_BUFFER_BOOTSTRAP', '2bd695', '8d7c56'),
        (87046, 'INSTALL_BUFFER_VERIFICATION', '5a80e1', 'e417e5'),
        (92696, 'REVIEWED_ONCE_INSTALLER', '55c4ed', '0308c8'),
        (98057, 'MAIN_BINDING_BUFFER_VERIFICATION', '2d7a0e', 'd4e5e6'),
    ]
    doc['helpers'] = [dict(pid=pid, ppid=3749, start=None, fullFingerprint=None,
        requestedLaunch=auth['pythonRoles']['launch'], actualForegroundWaitStatus=0,
        separatelyCaptured=True, toolEvidence=[dict(kind=role, commandTool=command,
        separateStatusTool=status, actualExit=0,
        launchBinding='ROOT_PARENT_LITERAL_COMMAND_ATTESTATION_NOT_OS_OBSERVED_ARGV')])
        for pid, role, command, status in helper_rows]
    doc['actualToolEvidence'] = [
        dict(kind='MAIN_BUFFER_READ', tool='e4e346', separateStatusTool='544f97', actualExit=1, expectedEof=True),
        dict(kind='MAIN_BUFFER_READONLY', tool='5791d0', separateStatusTool='285ff8', actualExit=0, namedDeclarationTool='b54d69'),
        dict(kind='MAIN_BUFFER_HASH', tool='2d7a0e', separateStatusTool='d4e5e6', actualExit=0),
        dict(kind='MAIN_SAME_BUFFER_EVAL', tool='f571c3', separateStatusTool='a71652', actualExit=0),
        dict(kind='NAMED_READONLY_BINDINGS', tool='6c4798', functionsTool='71013d', oldNegativeReadonlyOne=True),
        dict(kind='OLD_PARENT_FUNCTION_PRESERVATION', beforeTool='2cf274', afterTool='71013d', terminalCarriageReturnsNormalized=True),
        dict(kind='ROSTER_SCOPE', value='All held-shell verified-buffer/bootstrap/installer Python children in this setup; root metadata/control authors are separate actors, not observation clients or these held-shell children.'),
    ]
    need(set(doc['inputPins']) == {str(N / name) for name in expected} and len(doc['inputPins']) == 7, 'COMPLETE_CURRENT_CONTROL_INPUT_PINS')
    need(len({r['pid'] for r in doc['helpers']}) == 4, 'DISTINCT_ACTUAL_HELPERS')
    # Consume the exact reviewed pure validators before writing this root control.
    protocol = {'__name__': '_root_verified_source04_pure_protocol'}
    exec(compile(buffers['protocol.py'], '<verified-source04-pure-protocol>', 'exec'), protocol)
    tree = ast.parse(buffers['failed_gateway.py'])
    unit = next(x for x in tree.body if isinstance(x, ast.ClassDef) and x.name == 'Unit')
    methods = [x for x in unit.body if isinstance(x, ast.FunctionDef) and x.name in ('validate_root', 'require_setup')]
    need(len(methods) == 2, 'EXACT_PURE_METHOD_SELECTION')
    cls = ast.ClassDef(name='RootSetupShape', bases=[], keywords=[], body=methods, decorator_list=[])
    module = ast.fix_missing_locations(ast.Module(body=[cls], type_ignores=[]))
    from types import SimpleNamespace
    scope = {'P': SimpleNamespace(**protocol), '__name__': '_root_control_shape_only'}
    exec(compile(module, '<verified-source04-root-shape-methods>', 'exec'), scope)
    shape = scope['RootSetupShape']()
    shape.failure_sink = None
    shape.auth_sha = AUTH
    shape.a = auth
    shape.k = json.loads(buffers['contract.json'])
    shape.code_buffers = buffers
    shape.local = lambda name: doc if name == 'root-setup-ownership.json' else None
    shape.require_setup()
    check()
    raw = packed(doc)
    need(len(raw) <= 16777216, 'CONTROL_BOUND')
    fd = own(os.open('root-setup-ownership.json', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=nfd))
    created = True
    os.fchmod(fd, 0o600)
    offset = 0
    while offset < len(raw):
        count = os.write(fd, raw[offset:offset + 65536])
        need(type(count) is int and 0 < count <= min(65536, len(raw) - offset), 'CONTROL_SHORT_WRITE')
        offset += count
    os.fsync(fd)
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == 501 and stat.S_IMODE(before.st_mode) == 0o600 and before.st_nlink == 1 and before.st_size == len(raw), 'CONTROL_OUTPUT_METADATA')
    os.lseek(fd, 0, os.SEEK_SET)
    seen = bytearray()
    while len(seen) < len(raw):
        part = os.read(fd, min(65536, len(raw) - len(seen)))
        need(type(part) is bytes and len(part) > 0, 'CONTROL_SHORT_READBACK')
        seen.extend(part)
    need(bytes(seen) == raw and key(before) == key(os.fstat(fd)) == key(os.stat('root-setup-ownership.json', dir_fd=nfd, follow_symlinks=False)), 'CONTROL_READBACK_CHANGED')
    os.fsync(nfd)
    need(set(os.listdir(nfd)) == set(expected) | {'root-setup-ownership.json'}, 'EXACT_POST_CONTROL_MEMBERSHIP')
    check()
    result = dict(kind='ROOT_SETUP_OWNERSHIP_CONTROL_AUTHOR_ONLY', path=str(N / 'root-setup-ownership.json'),
        sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw), sourceManifestSha256=SOURCE,
        authorizationSha256=AUTH, currentInputPins=doc['inputPins'], helperPids=[r['pid'] for r in doc['helpers']],
        actualObserverQualification=False, reviewedPureShapeValidationBeforeWrite=True,
        currentSourceOrProcessFactsAcquired=False, nativeInvocations=0,
        actor=dict(pid=os.getpid(), ppid=os.getppid(), start=None, fullFingerprint=None), outerCompletionOwed=True)
except BaseException as error:
    failure = dict(type=type(error).__name__, reason=error.reason if type(error) is ControlHold else 'OS_ERROR' if isinstance(error, OSError) else 'UNMAPPED_FAILURE')
finally:
    for row in reversed(owners):
        if row['state'] != 'OPEN':
            continue
        row['state'] = 'CLOSING'
        try:
            os.close(row['fd'])
            row['state'] = 'CLOSED'
        except BaseException as error:
            row['state'] = 'UNKNOWN'
            cleanup.append(type(error).__name__)
    print(json.dumps(dict(kind='ROOT_SETUP_CONTROL_AUTHOR_TERMINAL', result=result,
        primaryFailure=failure, cleanupErrorTypes=cleanup, controlCreated=created,
        descriptorCompletion='UNKNOWN' if cleanup else 'CLOSED',
        actualExit=0 if failure is None and not cleanup else 1, phaseAuthority=False), sort_keys=True), flush=True)
raise SystemExit(0 if failure is None and not cleanup else 1)

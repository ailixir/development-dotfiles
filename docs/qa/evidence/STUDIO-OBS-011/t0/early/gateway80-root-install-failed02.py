"""Root installation caller only; no observer/native/closing entrypoint."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T = R / 'docs/qa/evidence/STUDIO-OBS-011/t0'
S = T / 'early/gateway80-failed-red-resource-prep/resume2'
E = T / 'runtime/obs009-gateway80-offtree03-20261019'
N = E / 'failed-red-resource-disposition01'
SCOPE = T / 'resume2-gateway80-failed-resource-code02-one-unit-root-exception.json'
SCOPE_SHA = '4b3ba06c4092e020cf6335caec38ddd2d38ab225fddaadb8d96796d1c21c319c'
SOURCE_SHA = 'aaeb967ecc7eb279c70fb50e69218898295094b96fea23f7fdf82c99ce224558'
INDEX = T / 'resume2-gateway80-resume6-red01-terminal-index.json'
INDEX_SHA = '67994db98e1cf81d6aabd60899333f3979fd9993eae8b756211c434095288228'
RELEASE_SHA = '43ff6885ad33d1084a6a60ccb94390a099e097fd31b35496442b46ebce24ce71'
REVIEWS = {
    T / 'resume-architecture/resume2/gateway80-failed-red-resource-code02-exact-review/manifest.json': '19948c278df2fdb3fe334ebe328c3b0fe2a1eef0c8d1e51c6c2c4227a5e0a1ed',
    T / 'qa/gateway80-failed-red-resource-code02-exact-review/manifest.json': '894be13e034fcfb1cc137a5b1b76b28a2eaac650a2c6145713251108a2252610',
}
BIN = '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
APP = '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
GIT = '/opt/homebrew/Cellar/git/2.43.2/bin/git'
BINARIES = {
    BIN: '866e723f721119dc74a98c62fca2209db6cc9ef3f6b1ad3e6f751c58af2bb095',
    APP: '2e86b5cd2920c6cea9b318dc904c63291c376f615a3e64e91bafea25e0c442c7',
    '/bin/ps': 'f2211a1d7ff5e5c2e034df4acf450e30ffeec4e5ed632f21948d7181a1c493b6',
    '/usr/sbin/lsof': '8a76f446149b77c31d9b769ef7b0b2d4fa3550805303103b081886c5d8d68de4',
    GIT: '5c9b91ebbfb0e2b6d759a082d3b9d18886d52e2fee333cd245b00561db632d8c',
}
DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FDS = []
CLOSE_UNKNOWN = set()
CHAINS = {}
STAGE = 'READ_ONLY_INPUTS'


def need(value, reason):
    if not value:
        raise RuntimeError(reason)


def owned(fd):
    FDS.append(fd)
    return fd


def close_owned(fd):
    need(fd not in CLOSE_UNKNOWN and fd in FDS, 'CLOSE_OWNERSHIP')
    try:
        os.close(fd)
    except OSError:
        CLOSE_UNKNOWN.add(fd)
        raise
    FDS.remove(fd)


def identity(st):
    return (st.st_dev, st.st_ino, st.st_mode, st.st_uid, st.st_size, st.st_mtime_ns, st.st_ctime_ns)


def directory_fact(path, st):
    return dict(path=str(path), uid=st.st_uid, dev=st.st_dev, ino=st.st_ino, mode=stat.S_IMODE(st.st_mode))


def dir_key(st):
    return (st.st_dev, st.st_ino, st.st_mode, st.st_uid)


def check_chain(fd):
    for parent, name, child, key in CHAINS[fd]:
        need(dir_key(os.fstat(child)) == key, 'DIRECTORY_FD_CHANGED')
        named = os.stat('/', follow_symlinks=False) if parent is None else os.stat(name, dir_fd=parent, follow_symlinks=False)
        need(dir_key(named) == key, 'DIRECTORY_NAME_CHANGED')


def directory(path):
    fd = owned(os.open('/', DIR))
    chain = [(None, '/', fd, dir_key(os.fstat(fd)))]
    for name in path.parts[1:]:
        parent = fd
        fd = owned(os.open(name, DIR, dir_fd=parent))
        need(stat.S_ISDIR(os.fstat(fd).st_mode), 'DIRECTORY')
        chain.append((parent, name, fd, dir_key(os.fstat(fd))))
    CHAINS[fd] = chain
    check_chain(fd)
    return fd


def read_at(parent, name, sha=None, mode=None, cap=16777216, collect=True):
    check_chain(parent)
    fd = owned(os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent))
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid in (0, os.getuid()), 'READ_OWNER_TYPE')
        need(before.st_nlink == 1 and 0 <= before.st_size <= cap, 'READ_LINK_CAP')
        need(mode is None or stat.S_IMODE(before.st_mode) == mode, 'READ_MODE')
        h, chunks, total = hashlib.sha256(), [], 0
        while total < before.st_size:
            need(identity(os.fstat(fd)) == identity(before), 'READ_CHANGED')
            value = os.read(fd, min(1048576, before.st_size - total))
            need(bool(value), 'SHORT_READ')
            total += len(value)
            h.update(value)
            if collect:
                chunks.append(value)
        need(identity(before) == identity(os.fstat(fd)) == identity(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'READ_CHANGED')
        need(sha is None or h.hexdigest() == sha, 'READ_SHA')
        check_chain(parent)
        return b''.join(chunks) if collect else None, before, h.hexdigest()
    finally:
        close_owned(fd)


def read(path, sha=None, mode=None, cap=16777216, collect=True):
    parent = directory(path.parent)
    try:
        return read_at(parent, path.name, sha, mode, cap, collect)
    finally:
        chain = CHAINS.pop(parent)
        for _, _, fd, _ in reversed(chain):
            close_owned(fd)


def packed(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def write_at(parent, name, raw):
    check_chain(parent)
    fd = owned(os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent))
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and stat.S_IMODE(before.st_mode) == 0o600 and before.st_nlink == 1, 'WRITE_CUSTODY')
    offset = 0
    while offset < len(raw):
        count = os.write(fd, memoryview(raw)[offset:])
        need(count > 0, 'SHORT_WRITE')
        offset += count
    os.fsync(fd)
    after = os.fstat(fd)
    named = os.stat(name, dir_fd=parent, follow_symlinks=False)
    need(identity(after) == identity(named) and after.st_ino == before.st_ino and after.st_size == len(raw), 'WRITE_CHANGED')
    read_at(parent, name, hashlib.sha256(raw).hexdigest(), 0o600, len(raw))
    close_owned(fd)
    check_chain(parent)
    return hashlib.sha256(raw).hexdigest()


try:
    need(len(sys.argv) == 1 and os.getuid() == 501, 'ROOT_INSTALL_CALLER')
    scope = json.loads(read(SCOPE, SCOPE_SHA, 0o644)[0])
    need(scope['authorized'] is True and scope['newNativeInvocations'] == 0 and scope['cleanup'] is False, 'ROOT_SCOPE')
    manifest = json.loads(read(S / 'manifest.json', SOURCE_SHA, 0o644)[0])
    rows = {r['path']: r for r in manifest['files']}
    need(len(rows) == 116, 'SOURCE_MEMBERS')
    for path, sha in REVIEWS.items():
        read(path, sha, 0o644)
    install = json.loads(read(S / 'install-map.json', rows['install-map.json']['sha256'], 0o644)[0])
    authority = json.loads(read(S / 'authorization.template.json', rows['authorization.template.json']['sha256'], 0o644)[0])
    need(len(install['files']) == 6 and install['N'] == str(N), 'INSTALL_SCOPE')
    code = {}
    for row in install['files']:
        need(Path(row['destination']).parent == N and row['installedMode'] == 0o600, 'CODE_DESTINATION')
        code[row['source']] = read(S / row['source'], row['sha256'], 0o644)[0]
    modes = {}
    for path, sha in BINARIES.items():
        _, facts, _ = read(Path(path), sha, cap=134217728, collect=False)
        modes[path] = stat.S_IMODE(facts.st_mode)
    release = json.loads(read(E / 'root-authorization.json', RELEASE_SHA, 0o600)[0])
    index = json.loads(read(INDEX, INDEX_SHA, 0o644)[0])
    old_rows = index.get('files', index.get('members'))
    need(type(old_rows) is list and len(old_rows) == 2263, 'OLD_INDEX_ROWS')
    efd = directory(E)
    need(directory_fact(E, os.fstat(efd)) == release['directoryRoots'][str(E)], 'E_DIRECTORY_IDENTITY')
    expected = {row['path'] for row in old_rows}
    need(set(os.listdir(efd)) == expected and N.name not in expected, 'OLD_E_EXACT_AND_N_UNUSED')
    for row in old_rows:
        need(Path(row['path']).name == row['path'], 'OLD_SINGLE_COMPONENT')
        _, facts, _ = read_at(efd, row['path'], row['sha256'], row['mode'], 134217728, False)
        need(facts.st_size == row['bytes'], 'OLD_BYTES')
    tfd = directory(T)
    STAGE = 'EXCLUSIVE_INSTALL_ATTEMPT'
    write_at(tfd, 'resume2-gateway80-failed-resource-code02-install-attempt.json', packed(dict(kind='ROOT_EXCLUSIVE_INSTALL_ATTEMPT', scopeSha256=SCOPE_SHA, sourceManifestSha256=SOURCE_SHA, pid=os.getpid(), ppid=os.getppid(), newNativeInvocations=0, sourceWrites=[])))
    need(set(os.listdir(efd)) == expected and directory_fact(E, os.fstat(efd)) == release['directoryRoots'][str(E)], 'PRE_MUTATION_CUSTODY')
    check_chain(efd)
    STAGE = 'EXCLUSIVE_N_CREATION'
    os.mkdir(N.name, 0o700, dir_fd=efd)
    nfd = owned(os.open(N.name, DIR, dir_fd=efd))
    CHAINS[nfd] = CHAINS[efd] + [(efd, N.name, nfd, dir_key(os.fstat(nfd)))]
    nfact = directory_fact(N, os.fstat(nfd))
    need(nfact['mode'] == 0o700 and nfact['uid'] == 501, 'N_MODE_OWNER')
    STAGE = 'INSTALL_SIX_VERIFIED_BUFFERS'
    for name, raw in code.items():
        need(directory_fact(N, os.stat(N.name, dir_fd=efd, follow_symlinks=False)) == nfact, 'N_CUSTODY')
        write_at(nfd, name, raw)
    authority.update(kind='ROOT_ONE_UNIT_FAILED_RED_RESOURCE_ONLY_AUTHORIZATION', authorizedBy='root', authorized=True, distinctFailedEntrypointAuthorized=True, exactIndependentCodeReviewsQualified=True, actualInstallationAuthorized=True, actualGuardClosingAuthority=True)
    authority['rootInputPins'] = {}
    authority['newDirectoryPins'] = {str(N): nfact}
    authority['pythonRoles'] = {role: dict(path=path, sha256=BINARIES[path]) for role, path in [('launch', BIN), ('reported', BIN), ('process', APP), ('observedArgument', APP)]}
    authority['observationExecutables'] = {key: dict(path=path, sha256=BINARIES[path]) for key, path in [('/bin/ps', '/bin/ps'), ('/usr/sbin/lsof', '/usr/sbin/lsof'), ('git', GIT)]}
    authority['binaryHashes'], authority['binaryModes'] = BINARIES, modes
    authority['newCodeRecordPins'] = {str(S / 'manifest.json'): SOURCE_SHA, **{str(path): sha for path, sha in REVIEWS.items()}}
    authority['rootExceptionSha256'] = SCOPE_SHA
    authority['installationCurrentFactsLimit'] = 'Only named filesystem/binary/old-member facts observed; current process/source/resource qualification still owed to guarded negative/held/archive/final/gate.'
    STAGE = 'WRITE_ACTUAL_AUTHORIZATION'
    auth_sha = write_at(nfd, 'root-authorization.json', packed(authority))
    os.fsync(nfd)
    os.fsync(efd)
    need(set(os.listdir(nfd)) == set(code) | {'root-authorization.json'}, 'N_EXACT_INITIAL_MEMBERS')
    need(set(os.listdir(efd)) == expected | {N.name}, 'OLD_E_PLUS_N')
    trace = dict(kind='ROOT_ACTUAL_CODE02_INSTALLATION_TRACE', scopeSha256=SCOPE_SHA, sourceManifestSha256=SOURCE_SHA, rootAuthorizationSha256=auth_sha, newDirectoryFact=nfact, installedCodePins={name: hashlib.sha256(raw).hexdigest() for name, raw in code.items()}, binaryModes=modes, binaryHashes=BINARIES, pid=os.getpid(), ppid=os.getppid(), oldMembersHashModeBytesVerified=2263, oldEAddedEntryOnly=N.name, freshControllerOrSourceProofClaimed=False, nativeInvocations=0, sourceWrites=[], cleanup=False, atUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    trace_sha = write_at(tfd, 'resume2-gateway80-failed-resource-code02-installation-root-trace.json', packed(trace))
    print(json.dumps(dict(status='INSTALLED_SIX_AND_AUTHORIZATION', rootAuthorizationSha256=auth_sha, traceSha256=trace_sha, newDirectoryFact=nfact, nativeInvocations=0, sourceWrites=[]), sort_keys=True))
except BaseException as error:
    print(json.dumps(dict(status='ROOT_INSTALLATION_HOLD', stage=STAGE, errorType=type(error).__name__, pid=os.getpid(), knownDescriptors=FDS)))
    raise SystemExit(1)
finally:
    errors = []
    for fd in list(reversed(FDS)):
        if fd in CLOSE_UNKNOWN:
            errors.append(fd)
            continue
        try:
            close_owned(fd)
        except OSError:
            errors.append(fd)
    if errors:
        print(json.dumps(dict(status='ROOT_INSTALL_CLOSE_UNKNOWN', pid=os.getpid(), descriptors=errors)))
        raise SystemExit(1)

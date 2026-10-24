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
import types

sys.dont_write_bytecode = True
D = Path(__file__).absolute().parent
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
# Entry bootstrap supplies verified scope/contracts and retained immutable buffers.
# No package JSON/import interpretation happens at module import time.
SCOPE = {}
W = Path('/private/tmp/obs009-gateway80-offtree03-20261019')
E = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def retained_bytes(path, expected=None):
    """A single custody-checked buffer, hashed before interpretation, per immutable input."""
    key = str(path)
    retained = globals().setdefault('IMMUTABLE_BYTES', {})
    if key not in retained:
        guard_leaf(path)
        reader = globals().get('SAFE_READER')
        if reader is not None:
            raw = reader(path)
        else:
            # Fake controls supply an equivalent reader; actual entry bootstrap always sets SAFE_READER.
            raw = path.read_bytes()
        require(isinstance(raw, bytes), 'IMMUTABLE_BUFFER_TYPE')
        retained[key] = raw
    raw = retained[key]
    actual = hashlib.sha256(raw).hexdigest()
    if expected is not None:
        require(actual == expected, 'VERIFIED_IMMUTABLE_BUFFER_CHANGED')
    globals().setdefault('IMMUTABLE_DIGESTS', {})[key] = actual
    return raw


def current_verified_bytes(path,expected):
    guard_leaf(path)
    reader=globals().get('SAFE_READER')
    raw=reader(path) if reader is not None else path.read_bytes()
    require(hashlib.sha256(raw).hexdigest()==expected,'CURRENT_IMMUTABLE_BYTES_CHANGED')
    retained=globals().setdefault('IMMUTABLE_BYTES',{})
    require(str(path) not in retained or retained[str(path)]==raw,'IMMUTABLE_PATH_SUBSTITUTED')
    retained[str(path)]=raw
    return raw


def read_verified(path, expected):
    return json.loads(retained_bytes(path, expected))


def read(path):
    # Package/runtime JSON is immutable within one observer invocation. Every
    # later hash assertion refers to THIS consumed buffer, never a pathname reread.
    expected=globals().setdefault('IMMUTABLE_EXPECTED',{}).get(str(path))
    require(expected is not None,'UNBOUND_IMMUTABLE_JSON_INPUT')
    return read_verified(path,expected)


def immutable_input(path):
    return path == D / 'manifest.json' or D in path.parents or (path.parent == E and str(path).endswith('.json'))


utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()


def directory_fact(path):
    info = path.lstat()
    require(not path.is_symlink() and stat.S_ISDIR(info.st_mode), 'CUSTODY_DIRECTORY_OR_ROOT_LINK')
    return {'path': str(path), 'uid': info.st_uid, 'dev': info.st_dev,
            'ino': info.st_ino, 'mode': stat.S_IMODE(info.st_mode)}


def guard_directory(path):
    """Bounded lexical custody. Approved canonical tool/dependency aliases only."""
    pins = globals().setdefault('CUSTODY_PINS', {})
    choices = [R, D, E, W, W.parent, Path(SCOPE['dependencies']).resolve(),
               Path(SCOPE['node']).resolve().parent, Path(SCOPE['helm']).resolve().parent]
    anchors = [p for p in choices if path == p or p in path.parents]
    require(anchors, 'PATH_OUTSIDE_APPROVED_CUSTODY')
    root = R if R in anchors else W.parent if W.parent in anchors else max(anchors, key=lambda p: len(p.parts))
    chain = [root]
    if path != root:
        relative = Path(str(path.relative_to(root)))
        for part in relative.parts:
            chain.append(chain[-1] / part)
    facts = []
    for current in chain:
        fact = directory_fact(current)
        if str(current) in pins:
            require(fact == pins[str(current)], 'CUSTODY_DIRECTORY_IDENTITY_CHANGED')
        facts.append(fact)
    return facts


def guard_leaf(path, kind='file', fresh=False):
    guard_directory(path.parent)
    if fresh:
        require(not path.is_symlink() and not path.exists(), 'CUSTODY_DESTINATION_EXISTS_OR_LINK')
        return None
    info = path.lstat()
    require(not path.is_symlink(), 'CUSTODY_LEAF_LINK')
    require(stat.S_ISREG(info.st_mode) if kind == 'file' else stat.S_ISDIR(info.st_mode), 'CUSTODY_LEAF_TYPE')
    return info


def custody_facts():
    return dict(globals().setdefault('CUSTODY_PINS', {}))


def setup_custody(A):
    global CUSTODY_PINS
    pins = A['directoryRoots']
    required = [R, D, E, W.parent, R/'helm-chart', R/'helm-chart/put-checks',
                R/'helm-chart/put-checks/templates', Path(SCOPE['dependencies']).resolve(),
                Path(SCOPE['node']).resolve().parent, Path(SCOPE['helm']).resolve().parent]
    expanded = list(required)
    for path in required:
        if R in path.parents:
            current = R
            for part in Path(str(path.relative_to(R))).parts:
                current = current / part
                expanded.append(current)
    required = list(dict.fromkeys(expanded))
    require(all(str(p) in pins for p in required), 'FRESH_ROOT_CUSTODY_BINDINGS_REQUIRED')
    CUSTODY_PINS = dict(pins)
    for p in required:
        guard_directory(p)
    prepare = E / 'prepare.receipt.json'
    if prepare.is_file():
        guard_leaf(prepare)
        prepared = read(prepare)
        CUSTODY_PINS.update(prepared['directoryPins'])
        for name in prepared['directoryPins']:
            guard_directory(Path(name))
    archive_record = E / 'archive.receipt.json'
    if archive_record.is_file():
        guard_leaf(archive_record)
        archived = read(archive_record)
        CUSTODY_PINS.update(archived['archiveDirectoryPins'])
        for name in archived['archiveDirectoryPins']:
            guard_directory(Path(name))


def owned_write_path(path):
    require(path == W or W in path.parents or E in path.parents, 'WRITE_OUTSIDE_OWNED_ROOTS')


def anchored_parent(path):
    facts = guard_directory(path.parent)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(fd)
    expected = facts[-1]
    if (info.st_dev, info.st_ino) != (expected['dev'], expected['ino']):
        os.close(fd)
        raise ValueError('CUSTODY_PARENT_FD_IDENTITY')
    return fd


def safe_new_copy(source, destination, mode=0o644):
    """No-follow source and exclusive anchored destination; no copyfile aliasing."""
    owned_write_path(destination)
    guard_leaf(source)
    guard_leaf(destination, fresh=True)
    source_info = guard_leaf(source)
    source_parent = destination_parent = source_fd = destination_fd = None
    try:
        source_parent = anchored_parent(source)
        destination_parent = anchored_parent(destination)
        source_fd = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_parent)
        bound_info = os.fstat(source_fd)
        require(stat.S_ISREG(bound_info.st_mode) and (bound_info.st_dev, bound_info.st_ino)
                == (source_info.st_dev, source_info.st_ino), 'COPY_SOURCE_IDENTITY_CHANGED')
        destination_fd = os.open(destination.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                 mode, dir_fd=destination_parent)
        with os.fdopen(source_fd, 'rb') as src, os.fdopen(destination_fd, 'wb') as dst:
            source_fd = destination_fd = None
            shutil.copyfileobj(src, dst)
            dst.flush()
            os.fchmod(dst.fileno(), mode)
    finally:
        for fd in (source_fd, destination_fd, source_parent, destination_parent):
            if fd is not None:
                os.close(fd)


def safe_mkdir(path, mode=0o700):
    owned_write_path(path)
    guard_leaf(path, fresh=True)
    parent = anchored_parent(path)
    try:
        os.mkdir(path.name, mode=0o700, dir_fd=parent)
        created = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try: os.fchmod(created, mode)
        finally: os.close(created)
    finally:
        os.close(parent)
    fact = directory_fact(path)
    globals().setdefault('CUSTODY_PINS', {})[str(path)] = fact
    return fact


def ensure_owned_dirs(path):
    require(path == W or W in path.parents, 'COPY_PARENT_OUTSIDE_WORKSPACE')
    chain = [W]
    if path != W:
        for part in Path(str(path.relative_to(W))).parts:
            chain.append(chain[-1] / part)
    for current in chain:
        if current.exists() or current.is_symlink():
            require(str(current) in globals().setdefault('CUSTODY_PINS', {}), 'UNEXPECTED_PREEXISTING_COPY_PARENT')
            guard_directory(current)
        else:
            safe_mkdir(current)


def install_fixed():
    workspace_guard('original')
    target = W / 'repo/helm-chart/put-checks/templates/_helpers.tpl'
    target_info = guard_leaf(target)
    source = D / 'banks/fixed-helper.tpl'
    require(file_hash(source) == read(D/'input-manifest.json')['helperBanks']['fixed']['sha256'], 'FIXED_BANK_CHANGED')
    replacement = retained_bytes(source, read(D/'input-manifest.json')['helperBanks']['fixed']['sha256'])
    require(hashlib.sha256(replacement).hexdigest() == read(D/'input-manifest.json')['helperBanks']['fixed']['sha256'], 'FIXED_BANK_READ_CHANGED')
    parent = anchored_parent(target)
    fd = None
    try:
        fd = os.open(target.name, os.O_RDWR | os.O_NOFOLLOW, dir_fd=parent)
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino)
                == (target_info.st_dev, target_info.st_ino), 'INSTALL_TARGET_IDENTITY_CHANGED')
        with os.fdopen(fd, 'r+b') as out:
            fd = None
            original = out.read()
            require(hashlib.sha256(original).hexdigest() == read(D/'input-manifest.json')['helperBanks']['original']['sha256'],
                    'INSTALL_EXACT_ORIGINAL_PREIMAGE_REQUIRED')
            out.seek(0)
            out.write(replacement)
            out.truncate()
            out.flush()
            os.fchmod(out.fileno(), 0o644)
    finally:
        if fd is not None: os.close(fd)
        os.close(parent)
    workspace_guard('fixed')


def safe_archive_tree(source, destination):
    require(E in destination.parents and source in (W, W/'repo/helm-chart/put-checks'), 'ARCHIVE_ROOT_SCOPE')
    guard_directory(source)
    guard_leaf(destination, fresh=True)
    entries = inventory(source)
    safe_mkdir(destination)
    for row in sorted(entries, key=lambda r: (len(Path(r['path']).parts), r['path'])):
        src, dst = source / row['path'], destination / row['path']
        if row['kind'] == 'directory':
            safe_mkdir(dst, row['mode'])
        elif row['kind'] == 'file':
            safe_new_copy(src, dst, row['mode'])
        else:
            require(row['kind'] == 'symlink' and row['path'] == 'repo/studio-runner/node_modules'
                    and row['target'] == SCOPE['dependencies'], 'UNAPPROVED_ARCHIVE_LINK')
            guard_leaf(dst, fresh=True)
            parent = anchored_parent(dst)
            try: os.symlink(row['target'], dst.name, dir_fd=parent)
            finally: os.close(parent)
    return {str(destination): directory_fact(destination),
            **{str(destination/r['path']): directory_fact(destination/r['path'])
               for r in entries if r['kind'] == 'directory'}}


def exclusive_output(path):
    owned_write_path(path)
    guard_leaf(path, fresh=True)
    parent = anchored_parent(path)
    try:
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    finally:
        os.close(parent)
    return os.fdopen(fd, 'wb')


def write_new(path, data):
    owned_write_path(path)
    guard_leaf(path, fresh=True)
    parent = anchored_parent(path)
    payload = (json.dumps(data, indent=2) + '\n').encode()
    try:
        fd = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    finally:
        os.close(parent)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    globals().setdefault('IMMUTABLE_EXPECTED',{})[str(path)]=hashlib.sha256(payload).hexdigest()


def file_hash(path):
    if immutable_input(path):
        return hashlib.sha256(retained_bytes(path)).hexdigest()
    guard_leaf(path)
    require(not path.is_symlink() and path.is_file(), 'EXPECTED_REGULAR_FILE')
    before = path.stat()
    value = sha(path)
    after = path.stat()
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), 'READ_RACE')
    return value


def inventory(root):
    """Own tree only. Record symlink itself, never traverse its dependency target."""
    root_facts = guard_directory(root)
    result = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        guard_directory(Path(directory))
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
    require(guard_directory(root) == root_facts, 'INVENTORY_ROOT_CHANGED')
    return sorted(result, key=lambda x: x['path'])


def owned_root_identity():
    guard_directory(W)
    st = W.lstat()
    require(not W.is_symlink() and stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid()
            and stat.S_IMODE(st.st_mode) == 0o700, 'UNSAFE_WORKSPACE_ROOT')
    return {'path': str(W), 'uid': st.st_uid, 'dev': st.st_dev, 'ino': st.st_ino, 'mode': 0o700}


def core(postclose=False):
    p = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
    raw = retained_bytes(p, 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae')
    names = {'sha', 'utc', 'regular', 'capture', 'pid_text', 'table', 'identity',
             'project_role', 'boundary_inventory'}
    nodes = [n for n in ast.parse(raw).body if isinstance(n, (ast.Import, ast.ImportFrom))
             or isinstance(n, ast.FunctionDef) and n.name in names]
    ns = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned-readonly-ownership>', 'exec'), ns)
    ns['ROOT'] = R
    ns['capture'] = observe_capture
    ns['bounded_capture'] = observe_capture
    original_regular = ns['regular']
    def bound_regular(path):
        baseline = globals().get('BASELINE_BINDING')
        if baseline is not None and str(path) == baseline['path']:
            return retained_bytes(path, baseline['sha256'])
        return original_regular(path)
    ns['regular'] = bound_regular
    base_table = ns['table']
    H = read(E / 'hold.json')
    ns['table'] = lambda: complete_table(base_table, ns, H, postclose)
    return ns


def held(A, C):
    require(stat.S_IMODE(guard_leaf(E/'hold.json').st_mode)==0o600,'HOLD_MODE')
    H = json.loads(current_verified_bytes(E / 'hold.json', A['holdFileSha256']))
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
    guard_leaf(lock)
    st = lock.stat()
    require((st.st_dev, st.st_ino) == (H['lock']['dev'], H['lock']['ino']), 'LOCK_REPLACED')
    # Prove wrapper still has exactly this inode open, then independently kernel-held.
    raw = C['capture'](['/usr/sbin/lsof', '-nP', '-a', '-p', str(H['wrapper']['pid']),
                        '-F', 'pfin', '--', str(lock)])
    strict_lock_fields(raw, H['wrapper']['pid'], st.st_ino, str(lock))
    parent = anchored_parent(lock)
    fd = None
    try:
        fd = os.open(lock.name, os.O_RDWR | os.O_NOFOLLOW, dir_fd=parent)
        bound = os.fstat(fd)
        require(stat.S_ISREG(bound.st_mode) and (bound.st_dev,bound.st_ino)==(st.st_dev,st.st_ino),'KERNEL_LOCK_FD_IDENTITY')
        guard_directory(lock.parent)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            require(exc.errno in (errno.EAGAIN, errno.EACCES), 'KERNEL_LOCK_UNKNOWN')
        else:
            fcntl.flock(fd, fcntl.LOCK_UN)
            raise ValueError('KERNEL_LOCK_NOT_HELD')
    finally:
        if fd is not None:os.close(fd)
        os.close(parent)
    return H


def chart_guard(root, fixed=False):
    guard_directory(root)
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
    node, helm = Path(SCOPE['node']).resolve(), Path(SCOPE['helm']).resolve()
    require(str(node) == A['nodeCanonicalPath'] and str(helm) == A['helmCanonicalPath'], 'TOOL_ALIAS_TARGET_CHANGED')
    require(file_hash(node) == A['nodeSha256'], 'NODE_CHANGED')
    require(file_hash(helm) == A['helmSha256'], 'HELM_CHANGED')
    dep = Path(SCOPE['dependencies']).resolve()
    require(str(dep) == A['dependenciesRealpath'], 'DEPENDENCY_TARGET_CHANGED')
    # Exact release-bound dependency inventory is read-only, before and after phases.
    require(inventory(dep) == A['dependencyInventory'], 'DEPENDENCY_TREE_CHANGED')
    return {'sourceDigest': G['sourceDigest'], 'source1808': True, 'main506': True,
            'dist238': True, 'modesExact': True, 'auxiliariesExact': True,
            'dependenciesExact': True, 'atUtc': utc()}


def strict_lock_fields(raw, wrapper_pid, inode, lock_path):
    require(type(wrapper_pid) is int and wrapper_pid > 0 and type(inode) is int and inode > 0, 'LOCK_BINDING_TYPE')
    require(isinstance(raw, str) and raw.endswith('\n'), 'LOCK_FIELDS_INCOMPLETE')
    lines = raw.splitlines()
    require(len(lines) == 4 and [line[:1] for line in lines] == ['p', 'f', 'i', 'n'], 'LOCK_FIELD_ORDER_OR_DUPLICATE')
    require(lines[0] == 'p' + str(wrapper_pid), 'LOCK_RETURNED_PID_MISMATCH')
    descriptor = lines[1][1:]
    require(bool(descriptor) and descriptor.isdigit(), 'LOCK_DESCRIPTOR_MALFORMED')
    require(str(int(descriptor)) == descriptor, 'LOCK_DESCRIPTOR_NONCANONICAL')
    require(lines[2] == 'i' + str(inode), 'LOCK_RETURNED_INODE_MISMATCH')
    require(lines[3] == 'n' + lock_path, 'LOCK_RETURNED_NAME_MISMATCH')
    return {'pid': wrapper_pid, 'fd': int(descriptor), 'inode': inode, 'name': lock_path}


def observation_binary(command):
    paths = {'/bin/ps': ('/bin/ps', 'f2211a1d7ff5e5c2e034df4acf450e30ffeec4e5ed632f21948d7181a1c493b6'),
             '/usr/sbin/lsof': ('/usr/sbin/lsof', '8a76f446149b77c31d9b769ef7b0b2d4fa3550805303103b081886c5d8d68de4'),
             'git': ('/opt/homebrew/Cellar/git/2.43.2/bin/git', '5c9b91ebbfb0e2b6d759a082d3b9d18886d52e2fee333cd245b00561db632d8c')}
    require(command and command[0] in paths, 'UNBOUND_OBSERVATION_BINARY')
    path, expected = paths[command[0]]
    # Exact known utility bytes, read with the bootstrap no-follow absolute reader.
    reader = globals().get('TOOL_READER')
    require(reader is not None, 'OBSERVATION_BINARY_READER_REQUIRED')
    raw = reader(Path(path))
    require(hashlib.sha256(raw).hexdigest() == expected, 'OBSERVATION_BINARY_CHANGED')
    return [path, *command[1:]], expected


def no_signal_process(command, executable_sha, timeout=10, kind='UTILITY'):
    require(isinstance(command, list) and command and all(isinstance(x, str) for x in command), 'OBSERVATION_ARGV_TYPE')
    client = {'pid': os.getpid(), 'ppid': os.getppid(),
              'launchArgv': list(sys.orig_argv), 'launchArgvSha256': hashlib.sha256(json.dumps(list(sys.orig_argv)).encode()).hexdigest(),
              'start': None, 'identityComplete': False, 'identityLimitation': 'CURRENT_CLIENT_START_NOT_YET_CENSUS_BOUND'}
    binding=globals().get('OBSERVATION_CLIENT_BINDING')
    if binding is not None:
        require(binding['pid']==client['pid'] and binding['ppid']==client['ppid'],'OBSERVATION_CLIENT_BINDING_CHANGED')
        client.update(start=binding['start'],argvHash=binding['argvHash'],censusParent=binding['ppid'],identityLimitation='PID_START_ARGV_PARENT_CENSUS_BOUND_BINARY_NOT_FULLY_FINGERPRINTED')
    record = {'kind': kind, 'client': client, 'childPid': None, 'command': list(command), 'executableSha256': executable_sha,
              'actualExit': None, 'terminalWaitConfirmed': False, 'stdoutComplete': False, 'stderrComplete': False,
              'stderrEmpty': False, 'stdoutSha256': None, 'stderrSha256': None, 'stdoutBytes': None, 'stderrBytes': None,
              'identityStatus': 'UNKNOWN_BEFORE_LAUNCH', 'timeoutSignalSent': False, 'classification': 'UNKNOWN'}
    records = globals().setdefault('OBSERVATION_RECORDS', [])
    records.append(record)
    try:
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except BaseException as exc:
        record.update(classification='UNKNOWN_LAUNCH_FAILURE_NO_SIGNAL',failureClass=type(exc).__name__)
        publish_observations()
        raise ValueError('OBSERVATION_LAUNCH_UNKNOWN_NO_SIGNAL') from None
    require(type(child.pid) is int and child.pid > 0, 'OBSERVATION_CHILD_PID_UNKNOWN')
    record.update(childPid=child.pid, identityStatus='KNOWN_POPEN_CHILD_PID_ARGV_BINARY_START_UNOBSERVED')
    try:
        stdout, stderr = child.communicate(timeout=timeout)
    except BaseException as exc:
        # communicate never kills; keep exact child object and honest UNKNOWN identity.
        globals().setdefault('UNRESOLVED_OBSERVATION_CHILDREN', []).append(child)
        record['failureClass'] = type(exc).__name__
        record['classification'] = 'UNKNOWN_TIMEOUT_OR_COMMUNICATION_FAILURE_NO_SIGNAL'
        record['actualExit'] = child.returncode if type(child.returncode) is int else None
        record['partialStdoutAvailable'] = isinstance(getattr(exc, 'output', None), (str, bytes))
        record['partialStderrAvailable'] = isinstance(getattr(exc, 'stderr', None), (str, bytes))
        publish_observations()
        raise ValueError('OBSERVATION_UNKNOWN_NO_SIGNAL') from None
    record.update(actualExit=child.returncode if type(child.returncode) is int else None,
                  terminalWaitConfirmed=type(child.returncode) is int,
                  stdoutComplete=isinstance(stdout, str), stderrComplete=isinstance(stderr, str), stderrEmpty=stderr == '')
    if isinstance(stdout, str):record.update(stdoutSha256=hashlib.sha256(stdout.encode()).hexdigest(), stdoutBytes=len(stdout.encode()))
    if isinstance(stderr, str):record.update(stderrSha256=hashlib.sha256(stderr.encode()).hexdigest(), stderrBytes=len(stderr.encode()))
    record['classification'] = 'WAITED_POPEN_CHILD' if record['terminalWaitConfirmed'] else 'UNKNOWN_NOT_WAITED'
    publish_observations()
    require(record['terminalWaitConfirmed'] and record['stdoutComplete'] and record['stderrComplete'], 'OBSERVATION_NOT_COMPLETE_OR_WAITED')
    return types.SimpleNamespace(returncode=child.returncode, stdout=stdout, stderr=stderr, record=record)


def bind_observation_client(rows):
    pid, parent = os.getpid(), os.getppid()
    require(pid in rows and parent in rows and rows[pid]['ppid'] == parent, 'OBSERVATION_CLIENT_CENSUS_ANCHOR')
    row = rows[pid]
    require(type(row['pid']) is int and row['pid'] == pid and isinstance(row['start'], str) and bool(row['start'])
            and isinstance(row['argvHash'], str) and len(row['argvHash']) == 64, 'OBSERVATION_CLIENT_ROW_INCOMPLETE')
    globals()['OBSERVATION_CLIENT_BINDING'] = dict(row)
    for record in globals().get('OBSERVATION_RECORDS', []):
        record['client'].update(start=row['start'], argvHash=row['argvHash'], censusParent=parent,
                                identityLimitation='PID_START_ARGV_PARENT_CENSUS_BOUND_BINARY_NOT_FULLY_FINGERPRINTED')


def publish_observations():
    if not globals().get('OBSERVATION_WRITES_ENABLED', False):return
    records = globals().get('OBSERVATION_RECORDS', [])
    published = globals().get('OBSERVATION_PUBLISHED', 0)
    for index in range(published, len(records)):
        record = records[index]
        # Only completed or explicitly UNKNOWN metadata; stdout/stderr bodies never persist here.
        require(record['classification'] != 'UNKNOWN_BEFORE_LAUNCH', 'OBSERVATION_RECORD_NOT_READY')
        nonce=globals().setdefault('OBSERVATION_NONCE',hashlib.sha256((str(id(records))+json.dumps(record['client'],sort_keys=True)).encode()).hexdigest()[:16])
        write_new(E / ('observation-' + str(record['client']['pid']) + '-' + nonce + '-' + str(index + 1).zfill(6) + '.json'), record)
        globals()['OBSERVATION_PUBLISHED'] = index + 1


def observation_history(C):
    rows=C['table']()
    current=globals().get('OBSERVATION_CLIENT_BINDING')
    require(current is not None and current['pid']==os.getpid() and (rows.get(current['pid']) or {}).get('start')==current['start'] and (rows.get(current['pid']) or {}).get('argvHash')==current['argvHash'],'CURRENT_OBSERVER_IDENTITY_NOT_BOUND')
    names=[p for p in E.iterdir() if p.name.startswith('observation-') and p.name.endswith('.json')]
    require(len(names)<=20000,'OBSERVATION_HISTORY_BOUND')
    for path in names:
        value=read(path);client=value['client'];pid=client['pid'];start=client['start']
        require(type(pid) is int and isinstance(start,str) and bool(start),'PRIOR_OBSERVATION_CLIENT_IDENTITY_UNKNOWN')
        if (pid,start)!=(current['pid'],current['start']):
            require((rows.get(pid) or {}).get('start')!=start,'PRIOR_OBSERVATION_CLIENT_SURVIVES')
        require(type(value['childPid']) is int and value['childPid']>0 and isinstance(value['command'],list) and bool(value['command']) and all(isinstance(arg,str) for arg in value['command'])
                and isinstance(value['executableSha256'],str) and len(value['executableSha256'])==64,'PRIOR_OBSERVATION_CHILD_BINDING_INCOMPLETE')
        require(value['classification']=='WAITED_POPEN_CHILD' and value['terminalWaitConfirmed'] is True
                and type(value['actualExit']) is int and value['stdoutComplete'] is True and value['stderrComplete'] is True
                and value['timeoutSignalSent'] is False,'PRIOR_OBSERVATION_CHILD_UNKNOWN_OR_UNWAITED')
    return True


def enable_observation_writes():
    globals()['OBSERVATION_WRITES_ENABLED'] = True
    publish_observations()


def observe_capture(command, allowed=(0,)):
    """Command-specific bounded adapter for every imported core observation."""
    actual_command, binary_sha = observation_binary(command)
    p = no_signal_process(actual_command, binary_sha)
    if command[0] == '/bin/ps' and '-axo' in command:
        require(p.returncode == 0 and bool(p.stdout.strip()), 'GLOBAL_PS_FAILED_OR_EMPTY')
        if command[-1] == 'pid=,ppid=,lstart=,command=':
            hints, seen = {}, set()
            for line in p.stdout.splitlines():
                words = line.split(None, 7)
                require(len(words) == 8 and words[0].isdigit() and words[1].isdigit(), 'GLOBAL_TABLE_PARSE')
                pid = int(words[0])
                require(pid not in seen, 'GLOBAL_TABLE_DUPLICATE_PID')
                seen.add(pid)
                first = words[7].split(None, 1)[0]
                if Path(first).name.lower() == 'node' or 'tinypool/dist/entry/process.js' in words[7] or 'vitest.mjs' in words[7]:
                    hints[pid] = ' '.join(words[2:7])
            globals()['OBSERVED_NODE_HINTS'] = hints
    elif command[0] == '/bin/ps' and '-p' in command:
        if p.returncode == 1 and p.stdout == '' and p.stderr == '':
            return ''  # Scoped PID lookup absence; callers still qualify races/UNKNOWN.
        require(p.returncode == 0 and bool(p.stdout.strip()), 'SCOPED_PS_OBSERVATION_FAILED')
    elif command[0] == '/usr/sbin/lsof':
        require(p.returncode == 0 and bool(p.stdout.strip()), 'LSOF_OBSERVATION_FAILED_OR_EMPTY')
    else:
        require(p.returncode == 0, 'BOUNDED_OBSERVATION_FAILED')
    require(p.stderr == '', 'OBSERVATION_STDERR_UNQUALIFIED')
    return p.stdout


def complete_table(base_table, C, H, postclose=False):
    rows = base_table()
    require(bool(rows) and len(rows) <= 16384, 'GLOBAL_TABLE_INCOMPLETE')
    self_pid, parent_pid = os.getpid(), os.getppid()
    require(self_pid in rows and parent_pid in rows, 'TABLE_CURRENT_COLLECTOR_OR_PARENT_MISSING')
    require(rows[self_pid]['ppid'] == parent_pid, 'TABLE_COLLECTOR_PARENT_MISMATCH')
    if not postclose:
        require(parent_pid == H['shell']['pid'], 'TABLE_HELD_PARENT_MISMATCH')
    for role in ('wrapper', 'shell'):
        old = H[role]
        if postclose:
            require((rows.get(old['pid']) or {}).get('start') != old['start'], 'POSTCLOSE_OLD_CONTROLLER_SURVIVES')
        else:
            require(old['pid'] in rows and rows[old['pid']]['start'] == old['start']
                    and rows[old['pid']]['argvHash'] == old['argvHash'], 'TABLE_HOLDER_INCONSISTENT')
    for pid, start in globals().get('OBSERVED_NODE_HINTS', {}).items():
        if (rows.get(pid) or {}).get('start') == start:
            rows[pid]['nodeCandidateHint'] = True
    return rows


def worker_candidates(A, C, rows=None, native_ids=()):
    baseline_path = E / 'candidate-baseline.json'
    baseline = read_verified(baseline_path, A['candidateBaselineSha256'])
    require(baseline['capturedBeforeUnit'] is True and baseline['label'] == SCOPE['label'],
            'PREUNIT_CANDIDATE_BASELINE_REQUIRED')
    rows = C['table']() if rows is None else rows
    require(bool(rows) and len(rows) <= 16384, 'CANDIDATE_TABLE_EMPTY_OR_BOUND')
    raw = C['bounded_capture'](['/bin/ps', '-ww', '-axo', 'pid=,comm='])
    require(bool(raw.strip()), 'GLOBAL_COMM_EMPTY')
    comms = {}
    for line in raw.splitlines():
        words = line.strip().split(None, 1)
        require(len(words) == 2 and words[0].isdigit() and words[1].strip(), 'CANDIDATE_COMM_PARSE')
        require(int(words[0]) not in comms, 'DUPLICATE_COMM_PID')
        comms[int(words[0])] = words[1]
    require(os.getpid() in comms and os.getppid() in comms, 'COMM_CURRENT_HOLDER_MISSING')
    nodes = [pid for pid, comm in comms.items() if Path(comm).name.lower() == 'node']
    require(len(nodes) <= 64, 'NODE_CANDIDATE_BOUND')
    old = {(r['pid'], r['start']): r for r in baseline['identities']}
    current, unknown, inherited, unrelated = [], [], [], []
    fields = ('pid', 'start', 'argvHash', 'commHash', 'executableHash', 'executableFileHash')
    native_ids = set(native_ids)
    expected_nodes = {pid for pid, row in rows.items() if row.get('nodeCandidateHint')}
    expected_nodes |= {pid for pid, start in set(old) | native_ids if (rows.get(pid) or {}).get('start') == start}
    for pid in expected_nodes - set(nodes):
        unknown.append({'pid': pid, 'start': rows[pid]['start'], 'classification': 'UNKNOWN_TABLE_NODE_MISSING_FROM_COMM'})
    for pid in nodes:
        row = rows.get(pid)
        if row is None:
            unknown.append({'pid': pid, 'classification': 'UNKNOWN_COMM_NODE_MISSING_FROM_TABLE'})
            continue
        key = (pid, row['start'])
        argv = C['pid_text'](pid, 'command')
        if not argv:
            unknown.append({'pid': pid, 'start': row['start'], 'classification': 'UNKNOWN_ARGV'})
            continue
        try:
            identity = C['identity'](row)
        except BaseException:
            identity = None
        if key in old and identity is not None and identity.get('identityComplete'):
            require(all(identity.get(k) == old[key].get(k) for k in fields), 'INHERITED_NODE_CHANGED')
        if (identity is None or not identity.get('identityComplete')
                or identity.get('argvHash') != row['argvHash']):
            unknown.append({'pid': pid, 'start': row['start'], 'classification': 'UNKNOWN_IDENTITY_OR_SNAPSHOT'})
            continue
        if key in old:
            require(all(identity.get(k) == old[key].get(k) for k in fields), 'INHERITED_NODE_CHANGED')
            inherited.append(identity)
            continue
        role = ('tinypool/dist/entry/process.js' in argv or 'vitest.mjs' in argv
                or '/vitest/' in argv or '/@vitest/' in argv)
        if not role and key not in native_ids:
            try:
                locations = C['bounded_capture'](['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'cwd', '-F', 'n'])
                paths = [line[1:] for line in locations.splitlines() if line.startswith('n')]
                require(len(paths) == 1 and Path(paths[0]).is_absolute() and not paths[0].endswith(' (deleted)'),
                        'CWD_OBSERVATION_MISSING_OR_AMBIGUOUS')
                require(C['pid_text'](pid, 'lstart') == row['start'], 'CWD_IDENTITY_CHANGED')
            except BaseException:
                unknown.append({**identity, 'classification': 'UNKNOWN_CWD_OR_IDENTITY'})
                continue
            role = paths[0] == str(W) or paths[0].startswith(str(W) + '/')
            if not role:
                unrelated.append({**identity, 'cwd': paths[0], 'classification': 'VERIFIED_UNRELATED_NOT_OWNED'})
                continue
        if identity['executableFileHash'] != A['nodeSha256']:
            unknown.append({**identity, 'classification': 'UNKNOWN_NODE_EXECUTABLE'})
        elif key in native_ids:
            current.append({**identity, 'classification': 'RECORDED_NATIVE'})
        else:
            unknown.append({**identity, 'classification': 'UNKNOWN_NEW_RESIDENT_ROLE'})
    return {'currentNative': current, 'unknownCandidates': unknown, 'inheritedMatched': inherited,
            'unrelatedVerified': unrelated, 'baselineSha256': A['candidateBaselineSha256'],
            'sampledObservationOnly': True}




def boundary(H, C, A):
    baseline_path = R / H['baselinePath']
    baseline_raw = current_verified_bytes(baseline_path, H['baselineSha256'])
    globals()['BASELINE_BINDING'] = {'path': str(baseline_path), 'sha256': H['baselineSha256']}
    # Imported boundary_inventory JSON consumes the exact verified buffer via regular.
    # Also supply regular for injected/fake core namespaces without closure rewriting.
    old_regular = C.get('regular')
    def baseline_reader(path):
        require(str(path) == str(baseline_path), 'UNDECLARED_BASELINE_READER_PATH')
        return baseline_raw
    C['regular'] = baseline_reader
    try:
        facts = C['boundary_inventory']({'baselinePath': H['baselinePath']})
    finally:
        if old_regular is not None: C['regular'] = old_regular
        else: C.pop('regular', None)
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
    prepared = read(E / 'prepare.receipt.json')
    require(owned_root_identity() == prepared['workspace'], 'OWNED_ROOT_CHANGED')
    initial_files = {r['path']: r for r in prepared['inventory']}
    for row in [*I['finiteCopies'], I['fixture'], I['config']]:
        p = W / row['destination']
        h = I['helperBanks'][helper]['sha256'] if row['destination'].endswith('/_helpers.tpl') else row['sha256']
        info = guard_leaf(p)
        old = initial_files[row['destination']]
        require((info.st_dev, info.st_ino) == (old['dev'], old['ino']), 'COPIED_FILE_IDENTITY_CHANGED')
        require(file_hash(p) == h and stat.S_IMODE(p.stat().st_mode) == row['mode'], 'COPIED_INPUT_CHANGED')
    entry = W / 'repo/studio-runner/node_modules'
    old_entry = initial_files['repo/studio-runner/node_modules']
    info = entry.lstat()
    require(entry.is_symlink() and os.readlink(entry) == SCOPE['dependencies']
            and (info.st_dev, info.st_ino) == (old_entry['dev'], old_entry['ino']), 'DEPENDENCY_SYMLINK_CHANGED')
    chart_guard(W / 'repo/helm-chart/put-checks', fixed=helper == 'fixed')


def make_copy():
    require(not W.exists() and not W.is_symlink(), 'WORKSPACE_ALREADY_EXISTS')
    safe_mkdir(W)
    for n in ('tmp', 'cache'):
        safe_mkdir(W / n)
    I = read(D / 'input-manifest.json')
    for row in [*I['finiteCopies'], I['fixture'], I['config']]:
        src, dst = D / row['bank'], W / row['destination']
        require(file_hash(src) == row['sha256'], 'BANK_CHANGED')
        ensure_owned_dirs(dst.parent)
        safe_new_copy(src, dst, row['mode'])
    entry = W / 'repo/studio-runner/node_modules'
    guard_leaf(entry, fresh=True)
    parent = anchored_parent(entry)
    try: os.symlink(SCOPE['dependencies'], entry.name, dir_fd=parent)
    finally: os.close(parent)
    return {'workspace': owned_root_identity(), 'inventory': inventory(W),
            'directoryPins': {str(W): directory_fact(W), **{str(W/r['path']): directory_fact(W/r['path']) for r in inventory(W) if r['kind'] == 'directory'}}}


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
    # Vitest writes outputFile itself; deny aliases before ANY output/native callback.
    guard_directory(cwd)
    guard_leaf(W / ('repo/' + phase + '-vitest.json'), fresh=True)
    known, gaps, candidate_history = {}, set(), []
    initial_child = None
    initial_attempted = False
    started = utc()
    # Raw native output is archived unchanged in the new evidence directory.
    guard_directory(E)
    guard_directory(W)
    with exclusive_output(E / (phase + '.stdout')) as out, exclusive_output(E / (phase + '.stderr')) as err:
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
                if not initial_attempted:
                    initial_attempted = True
                    first = rows.get(child.pid)
                    if first is None or first['ppid'] != os.getpid():
                        gaps.add('INITIAL_DIRECT_CHILD_IDENTITY_UNPROVEN')
                    else:
                        bound = C['identity'](first)
                        if (bound is None or not bound.get('identityComplete')
                                or bound.get('start') != first['start']
                                or bound.get('argvHash') != first['argvHash']
                                or bound.get('executableFileHash') != A['nodeSha256']
                                or C['pid_text'](child.pid, 'lstart') != first['start']):
                            gaps.add('INITIAL_DIRECT_CHILD_IDENTITY_UNPROVEN')
                        else:
                            initial_child = bound
                            known[str(bound['pid']) + ':' + bound['start']] = bound
                # Ownership begins only with matching recorded PID/start roots.
                # A reused numeric Popen.pid never seeds another root or descendants.
                owned = {f['pid'] for f in known.values()
                         if (rows.get(f['pid']) or {}).get('start') == f['start']}
                changed = True
                while changed:
                    changed = False
                    for pid, row in rows.items():
                        key = str(pid) + ':' + row['start']
                        if pid in owned or row['ppid'] not in owned:
                            continue
                        parent = next(f for f in known.values() if f['pid'] == row['ppid']
                                      and f['start'] == rows[row['ppid']]['start'])
                        if C['pid_text'](parent['pid'], 'lstart') != parent['start']:
                            gaps.add('OWNED_PARENT_IDENTITY_CHANGED')
                            continue
                        bound = C['identity'](row)
                        if bound is None or not bound.get('identityComplete') or bound.get('argvHash') != row['argvHash']:
                            gaps.add('OWNED_IDENTITY_RACE_OR_INCOMPLETE')
                            continue
                        known[key] = bound
                        owned.add(pid)
                        changed = True
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
              'initialChildIdentity': initial_child, 'initialBindingAttempted': initial_attempted,
              'collectorPid': os.getpid(),
              'ownedIdentities': list(known.values()), 'stickyFlags': sorted(gaps),
              'candidateObservations': candidate_history,
              'status': 'HOLD' if gaps or code is None else 'TERMINAL', 'automaticRetry': False}
    result['stdoutSha256'] = file_hash(E / (phase + '.stdout'))
    result['stderrSha256'] = file_hash(E / (phase + '.stderr'))
    result['launchSha256'] = file_hash(E / (phase + '.launched.json'))
    report = W / ('repo/' + phase + '-vitest.json')
    if report.is_file() and not report.is_symlink():
        safe_new_copy(report, E / (phase + '-vitest.json'), 0o600)
        result['reportSha256'] = file_hash(report)
    return result


def archive():
    guard_directory(E)
    guard_directory(W)
    guard_leaf(E / 'complete-workspace-archive', fresh=True)
    guard_leaf(E / 'final-fixed-chart-archive', fresh=True)
    before = inventory(W)
    destination = E / 'complete-workspace-archive'
    require(not destination.exists(), 'ARCHIVE_ALREADY_EXISTS')
    archive_pins = safe_archive_tree(W, destination)
    after = inventory(W)
    archive_rows = inventory(destination)
    compare = lambda rows: [{k: v for k, v in r.items() if k not in ('dev', 'ino')} for r in rows]
    require(before == after and compare(after) == compare(archive_rows), 'ARCHIVE_EQUALITY_FAILED')
    chart = W / 'repo/helm-chart/put-checks'
    require(sum(r['kind'] == 'file' for r in inventory(chart)) == 22, 'FINAL_CHART_NOT_22')
    archive_pins.update(safe_archive_tree(chart, E / 'final-fixed-chart-archive'))
    require(compare(inventory(chart)) == compare(inventory(E / 'final-fixed-chart-archive')),
            'FINAL_CHART_ARCHIVE_MISMATCH')
    return {'workspace': owned_root_identity(), 'workspaceInventory': after,
            'archiveInventory': archive_rows, 'archiveEqual': True,
            'finalChartInventory': inventory(chart),
            'finalChartArchiveInventory': inventory(E / 'final-fixed-chart-archive'),
            'archiveDirectoryPins': archive_pins, 'finalChart22': True, 'cleanupAuthorized': False, 'credit': False}


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
    A = read_verified(Path(release_path), release_sha)
    require(A['authorized'] is True and A['label'] == SCOPE['label'], 'ACTUAL_ROOT_RELEASE_REQUIRED')
    require(A['independentArchitectureReviewSha256'] and A['independentQaReviewSha256'], 'REVIEWS_REQUIRED')
    require(A['sourceWrites'] is False and A['C8'] is False and A['credit'] is False
            and A['automaticRetry'] is False, 'SCOPE_WIDENING')
    require(file_hash(D / 'manifest.json') == A['packetManifestSha256'], 'PACKET_SEAL')
    for row in read(D / 'manifest.json')['files']:
        require(file_hash(D / row['path']) == row['sha256'], 'PACKET_MEMBER_CHANGED')
    setup_custody(A)
    C = core()
    H = held(A, C)
    bind_observation_client(C['table']())
    enable_observation_writes()
    pre_source = guards(A, C)
    pre_resources = boundary(H, C, A)
    decision_path = E / (phase + '.root-decision.json')
    decision = read_verified(decision_path, decision_sha)
    require(decision['releaseSha256'] == release_sha, 'DECISION_RELEASE')
    receipts = {}
    for previous in SCOPE['phaseIds']:
        p = E / (previous + '.receipt.json')
        if p.exists() and previous in decision.get('precedingReceipts', {}):
            require(previous in decision.get('precedingReceipts', {}), 'UNBOUND_PRECEDING_RECEIPT')
            receipts[previous] = read_verified(p, decision['precedingReceipts'][previous])
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
                install_fixed()
            elif phase in ('red', 'green'):
                require(not list((W / 'tmp').iterdir()), 'TMPDIR_NOT_EMPTY_BEFORE_PHASE')
                result['nativeExecuted'] = True
                result['native'] = run_native(phase, A, C)
                require(result['native']['status'] == 'TERMINAL' and not result['native']['stickyFlags'],
                        'NATIVE_OWNERSHIP_HOLD')
                result['assessment'] = assess(read_verified(E / (phase + '-vitest.json'),result['native']['reportSha256']), phase,
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


def entry_require(ok,reason):
    if not ok:raise ValueError(reason)

def entry_read_bytes(path):
    path=Path(path)
    entry_require(path.is_absolute() and '..' not in path.parts,'ABSOLUTE_READER_PATH')
    descriptors=[];facts=[]
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);descriptors.append(fd);facts.append((Path('/'),os.fstat(fd)))
    key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
    try:
        parent=Path('/')
        for part in path.parts[1:-1]:
            parent=parent/part
            fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            descriptors.append(fd);facts.append((parent,os.fstat(fd)))
        leaf=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd);descriptors.append(leaf)
        before=os.fstat(leaf);entry_require(stat.S_ISREG(before.st_mode),'VERIFIED_READER_REGULAR')
        with os.fdopen(leaf,'rb',closefd=False) as handle:raw=handle.read()
        after=os.fstat(leaf);named=path.lstat()
        filekey=lambda x:(*key(x),x.st_size,x.st_mtime_ns)
        entry_require(filekey(before)==filekey(after)==filekey(named),'VERIFIED_READER_LEAF_CHANGED')
        for name,old in facts:entry_require(key(name.lstat())==key(old) and stat.S_ISDIR(old.st_mode),'VERIFIED_READER_ANCESTOR_CHANGED')
        return raw
    finally:
        for fd in reversed(descriptors):os.close(fd)

def trusted_leaf():
    cached=globals().get('_TRUSTED_LEAF_NS')
    if cached is not None:return cached
    package=Path(__file__).absolute().parent
    expected=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6')
    entry_require(package==expected,'EXACT_GENERATION06_ENTRY_REQUIRED')
    raw=entry_read_bytes(package/'verified-inputs.py')
    entry_require(hashlib.sha256(raw).hexdigest()=='47db173dd0ad632f607a2effeb753754b581db6f601d78bf00e5f619d6e0a45c','LEAF_VERIFIED_BUFFER_CHANGED')
    ns={'__file__':str(package/'verified-inputs.py'),'__name__':'verified_gateway06_leaf'}
    exec(compile(raw,'<same-verified-leaf-buffer>','exec'),ns)
    globals()['_TRUSTED_LEAF_NS']=ns
    return ns


def bootstrap_entry(kind):
    return trusted_leaf()['entry'](Path(__file__).absolute().parent,kind,sys.argv[1:])

if __name__ == '__main__':
    sys.exit(bootstrap_entry('phase'))

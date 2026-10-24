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
    root = max(anchors, key=lambda p: len(p.parts))
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
        require(not path.exists() and not path.is_symlink(), 'CUSTODY_DESTINATION_EXISTS_OR_LINK')
        return None
    info = path.lstat()
    require(not path.is_symlink(), 'CUSTODY_LEAF_LINK')
    require(stat.S_ISREG(info.st_mode) if kind == 'file' else stat.S_ISDIR(info.st_mode), 'CUSTODY_LEAF_TYPE')
    return info


def setup_custody(A):
    global CUSTODY_PINS
    pins = A['directoryRoots']
    required = [R, D, E, W.parent, R/'helm-chart', R/'helm-chart/put-checks',
                R/'helm-chart/put-checks/templates', Path(SCOPE['dependencies']).resolve(),
                Path(SCOPE['node']).resolve().parent, Path(SCOPE['helm']).resolve().parent]
    require(all(str(p) in pins for p in required), 'FRESH_ROOT_CUSTODY_BINDINGS_REQUIRED')
    CUSTODY_PINS = dict(pins)
    for p in required:
        guard_directory(p)
    prepare = E / 'prepare.receipt.json'
    if prepare.is_file():
        guard_leaf(prepare)
        prepared = json.loads(prepare.read_text())
        CUSTODY_PINS.update(prepared['directoryPins'])
        for name in prepared['directoryPins']:
            guard_directory(Path(name))
    archive_record = E / 'archive.receipt.json'
    if archive_record.is_file():
        guard_leaf(archive_record)
        archived = json.loads(archive_record.read_text())
        CUSTODY_PINS.update(archived['archiveDirectoryPins'])
        for name in archived['archiveDirectoryPins']:
            guard_directory(Path(name))


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
    guard_leaf(source)
    guard_leaf(destination, fresh=True)
    source_parent, destination_parent = anchored_parent(source), anchored_parent(destination)
    source_fd = destination_fd = None
    try:
        source_fd = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_parent)
        require(stat.S_ISREG(os.fstat(source_fd).st_mode), 'COPY_SOURCE_NOT_REGULAR')
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


def safe_mkdir(path):
    guard_leaf(path, fresh=True)
    parent = anchored_parent(path)
    try:
        os.mkdir(path.name, mode=0o700, dir_fd=parent)
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
    guard_leaf(target)
    source = D / 'banks/fixed-helper.tpl'
    require(file_hash(source) == read(D/'input-manifest.json')['helperBanks']['fixed']['sha256'], 'FIXED_BANK_CHANGED')
    parent = anchored_parent(target)
    fd = None
    try:
        fd = os.open(target.name, os.O_RDWR | os.O_NOFOLLOW, dir_fd=parent)
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode), 'INSTALL_TARGET_NOT_REGULAR')
        with os.fdopen(fd, 'r+b') as out:
            fd = None
            original = out.read()
            require(hashlib.sha256(original).hexdigest() == read(D/'input-manifest.json')['helperBanks']['original']['sha256'],
                    'INSTALL_EXACT_ORIGINAL_PREIMAGE_REQUIRED')
            out.seek(0)
            out.write(source.read_bytes())
            out.truncate()
            out.flush()
            os.fchmod(out.fileno(), 0o644)
    finally:
        if fd is not None: os.close(fd)
        os.close(parent)
    workspace_guard('fixed')


def safe_archive_tree(source, destination):
    guard_directory(source)
    guard_leaf(destination, fresh=True)
    entries = inventory(source)
    safe_mkdir(destination)
    for row in sorted(entries, key=lambda r: (len(Path(r['path']).parts), r['path'])):
        src, dst = source / row['path'], destination / row['path']
        if row['kind'] == 'directory':
            safe_mkdir(dst)
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

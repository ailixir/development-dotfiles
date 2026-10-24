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
    record = {'kind': kind, 'client': client, 'childPid': None, 'command': list(command), 'executableSha256': executable_sha,
              'actualExit': None, 'terminalWaitConfirmed': False, 'stdoutComplete': False, 'stderrComplete': False,
              'stderrEmpty': False, 'stdoutSha256': None, 'stderrSha256': None, 'stdoutBytes': None, 'stderrBytes': None,
              'identityStatus': 'UNKNOWN_BEFORE_LAUNCH', 'timeoutSignalSent': False, 'classification': 'UNKNOWN'}
    records = globals().setdefault('OBSERVATION_RECORDS', [])
    records.append(record)
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
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
        write_new(E / ('observation-' + str(index + 1).zfill(6) + '.json'), record)
        globals()['OBSERVATION_PUBLISHED'] = index + 1


def enable_observation_writes():
    globals()['OBSERVATION_WRITES_ENABLED'] = True
    publish_observations()

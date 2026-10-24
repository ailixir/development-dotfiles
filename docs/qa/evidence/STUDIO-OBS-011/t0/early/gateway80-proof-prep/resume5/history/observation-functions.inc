def observe_capture(command, allowed=(0,)):
    """Command-specific bounded adapter for every imported core observation."""
    p = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)
    if command[0] == '/bin/ps' and '-axo' in command:
        require(p.returncode == 0 and bool(p.stdout.strip()), 'GLOBAL_PS_FAILED_OR_EMPTY')
    elif command[0] == '/bin/ps' and '-p' in command:
        if p.returncode == 1 and not p.stdout.strip() and not p.stderr.strip():
            return ''  # Scoped PID lookup absence; callers still qualify races/UNKNOWN.
        require(p.returncode == 0 and bool(p.stdout.strip()), 'SCOPED_PS_OBSERVATION_FAILED')
    elif command[0] == '/usr/sbin/lsof':
        require(p.returncode == 0 and bool(p.stdout.strip()), 'LSOF_OBSERVATION_FAILED_OR_EMPTY')
    else:
        require(p.returncode == 0, 'BOUNDED_OBSERVATION_FAILED')
    require(not p.stderr.strip(), 'OBSERVATION_STDERR_UNQUALIFIED')
    return p.stdout


def complete_table(base_table, C, H):
    rows = base_table()
    require(bool(rows) and len(rows) <= 16384, 'GLOBAL_TABLE_INCOMPLETE')
    self_pid, parent_pid = os.getpid(), os.getppid()
    require(self_pid in rows and parent_pid in rows, 'TABLE_CURRENT_COLLECTOR_OR_PARENT_MISSING')
    require(rows[self_pid]['ppid'] == parent_pid == H['shell']['pid'], 'TABLE_COLLECTOR_PARENT_MISMATCH')
    for role in ('wrapper', 'shell'):
        old = H[role]
        require(old['pid'] in rows and rows[old['pid']]['start'] == old['start']
                and rows[old['pid']]['argvHash'] == old['argvHash'], 'TABLE_HOLDER_INCONSISTENT')
    for pid, row in rows.items():
        if row.get('projectMarkerCandidate') or pid in (self_pid, parent_pid):
            continue
        # Read-only hint; never ownership. Full narrow role validation remains below.
        argv = C['pid_text'](pid, 'command')
        if argv:
            first = argv.split(None, 1)[0]
            row['nodeCandidateHint'] = (Path(first).name.lower() == 'node'
                                       or 'tinypool/dist/entry/process.js' in argv
                                       or 'vitest.mjs' in argv)
    return rows


def worker_candidates(A, C, rows=None, native_ids=()):
    baseline_path = E / 'candidate-baseline.json'
    require(file_hash(baseline_path) == A['candidateBaselineSha256'], 'CANDIDATE_BASELINE_CHANGED')
    baseline = read(baseline_path)
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

"""Prospective failed-resource adapter. Preparation imports never observe or close."""
import ast
import errno
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
sys.dont_write_bytecode = True
import time
from predicates import PROTOCOL, SOURCE, GAPS, Hold, need, digest, compact, canonical, authority, preserved, current, admission, readiness, permit, gate

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
UNIT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01'
HERE = Path(__file__).absolute().parent
OLD_RELEASE = '9f347db3774a785a0b732392b2711976476ac4ae8743fcad839026c121fc3511'
PIN = 'a938fadcc56ddb8b8e86b80cb2a50589c558cb8a135e934c7443d2508b827b24'
INDEX = 'f3d5b283f86fe0196d570f0a04002c758a292689203ddb93a6fe1a4c8d62ebcb'
CORE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
CORE_SHA = 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'
OLD_GATE_SHA = '56020d0d3123339587bcf9e0a7f6968efe125a07a4331d9710b2a3be678d021e'


def safe_bytes(path, mode=None):
    path = Path(path)
    need(path.is_absolute() and (path.is_relative_to(ROOT) or path == Path(sys.executable).resolve()) and '..' not in path.parts, 'UNSAFE_PATH')
    for part in [*reversed(path.parents), path]:
        if part == ROOT or part.is_relative_to(ROOT) or path == Path(sys.executable).resolve():
            st = part.lstat()
            need(not stat.S_ISLNK(st.st_mode), 'LINK_BEFORE_BODY')
            if part != path:
                need(stat.S_ISDIR(st.st_mode), 'UNSAFE_ANCESTOR')
    # Resolve every ancestor through nonfollowing directory descriptors. A parent
    # switched after lstat cannot redirect the body read through a symlink.
    directory_fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in path.parts[1:-1]:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
            os.close(directory_fd); directory_fd = next_fd
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    finally:
        os.close(directory_fd)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and (mode is None or stat.S_IMODE(before.st_mode) == mode), 'REGULAR_MODE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read()
        after = os.fstat(fd); outside = path.lstat()
        fields = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_mode)
        need(fields(before) == fields(after) == fields(outside), 'FILE_CHANGED')
        return data
    finally:
        os.close(fd)


def read(path, mode=None):
    return json.loads(safe_bytes(path, mode))


def write_new(name, value):
    need(canonical(name) and '/' not in name, 'OUTPUT_NAME')
    need(HERE == UNIT / 'failed-resource-disposition01' and HERE.lstat().st_mode & 0o777 == 0o700 and not HERE.is_symlink(), 'INSTALLATION')
    path = HERE / name
    need(not path.exists() and not path.is_symlink(), 'OUTPUT_EXISTS')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as out:
        out.write(json.dumps(value, indent=2).encode() + b'\n'); out.flush(); os.fsync(out.fileno())


def load_fixed_module(path, expected, name):
    source = safe_bytes(path)
    need(digest(source) == expected, 'REUSE_CODE_HASH')
    module = type(sys)(name); module.__file__ = str(path)
    exec(compile(source, str(path), 'exec'), module.__dict__)
    return module


def load_authority(release_sha):
    need(HERE == UNIT / 'failed-resource-disposition01' and stat.S_IMODE(HERE.lstat().st_mode) == 0o700 and not HERE.is_symlink(), 'INSTALLATION')
    allowed = {'predicates.py','failed_resource.py','guard-failed-resource.bash','retained-contract.json','input-pins.json','root-disposition-authorization.json','root-admission.json','negative-readiness-denial.json','readiness.json','permit.json','gate-allow.json','root-wrapper-result.json','postclose.json'}
    for member in HERE.iterdir():
        need(member.name in allowed or member.name.startswith('client-') and member.name.endswith('.json'), 'UNEXPECTED_NAMESPACE_MEMBER')
        safe_bytes(member,0o600)
    raw = safe_bytes(HERE / 'root-disposition-authorization.json', 0o600)
    need(digest(raw) == release_sha, 'ROOT_RELEASE_HASH')
    a = json.loads(raw); authority(a)
    need(a['originalReleaseSha256'] == OLD_RELEASE and a['activeLockSha256'] == PIN and a['terminalIndexSha256'] == INDEX, 'EXACT_ORIGINAL_AUTHORITY')
    loaded = {str(HERE / 'root-disposition-authorization.json'): release_sha}
    def pin(path, want, mode=None):
        need(digest(safe_bytes(path, mode)) == want, 'IMMUTABLE_PIN_CHANGED'); loaded[str(path)] = want
    need(set(a['codePins']) == {'predicates.py', 'failed_resource.py', 'guard-failed-resource.bash'}, 'CODE_SET')
    for name, want in a['codePins'].items(): pin(HERE / name, want, 0o600)
    need(set(a['pins']) == {'retained-contract.json', 'input-pins.json'}, 'LOCAL_PIN_SET')
    for name, want in a['pins'].items(): pin(HERE / name, want, 0o600)
    inputs = read(HERE / 'input-pins.json')
    for item in inputs['records']:
        need(canonical(item['path']), 'INPUT_PATH'); pin(ROOT / item['path'], item['sha256'])
    index = read(UNIT / 'root-terminal-evidence-index-01.json')
    need(len(index['facts']) == 27, 'TERMINAL_INDEX_SET')
    for item in index['facts']:
        need(canonical(item['path']), 'TERMINAL_PATH'); pin(ROOT / item['path'], item['sha256'])
    need(digest(safe_bytes(UNIT / 'root-actual-unit-release.json')) == OLD_RELEASE and digest(safe_bytes(UNIT / 'active-lock.json')) == PIN, 'ANCESTRY')
    old = read(UNIT / 'root-actual-unit-release.json')
    for group in ('executionPackagePins', 'controlPackagePins'):
        for rel, want in old[group].items(): pin(UNIT / rel, want, 0o600)
        directory = 'execution' if group == 'executionPackagePins' else 'control'
        actual = {directory+'/'+p.name for p in (UNIT/directory).iterdir() if p.suffix in ('.py','.json') and p.name != 'manifest.json'}
        need(actual == set(old[group]), 'ORIGINAL_PACKAGE_SET_CHANGED')
    # Old immutable code may check ancestry; its old closing predicates are never called.
    expected = read(HERE / 'retained-contract.json')
    preserved(a, expected, inputs['retainedContract'])
    for role, want in a['reviewPins'].items():
        item = a['reviewRecords'][role]; need(item['sha256'] == want and canonical(item['path']), 'REVIEW_BINDING'); pin(ROOT / item['path'], want)
    need(Path(a['pythonExecutable']) == Path(sys.executable).resolve() and digest(safe_bytes(Path(a['pythonExecutable']))) == a['pythonExecutableSha256'], 'PYTHON_BINARY')
    return {'a': a, 'sha': release_sha, 'loaded': loaded, 'retained': expected,
            'pin': read(UNIT / 'active-lock.json'), 'plan': read(UNIT / 'execution/successor-plan.json')}


def helpers(b):
    need(digest(safe_bytes(CORE)) == CORE_SHA, 'CORE_HASH')
    nodes = ast.parse(safe_bytes(CORE)).body
    names = {'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
    scope = {'ROOT': ROOT}
    exec(compile(ast.Module(body=[n for n in nodes if isinstance(n, (ast.Import, ast.ImportFrom)) or isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[]), '<pinned-readonly-core>', 'exec'), scope)
    old = load_fixed_module(UNIT / 'control/unlock_gate.py', OLD_GATE_SHA, '_old_source_only')
    old.safe_bytes = safe_bytes
    return scope, old


def register_client(b, mode):
    scope, _ = helpers(b); rows = scope['table'](); row = rows.get(os.getpid())
    need(row is not None, 'CLIENT_CENSUS')
    who = scope['identity'](row)
    need(who and who.get('identityComplete') is True, 'CLIENT_FINGERPRINT_UNKNOWN')
    name = 'client-' + str(who['pid']) + '-' + digest(who['start'].encode())[:16] + '.json'
    write_new(name, {'kind': 'NEW_VERIFICATION_CLIENT', 'mode': mode, 'releaseSha256': b['sha'], 'identity': who})
    b['client'] = who


def inventory_clients(b, rows):
    clients = []
    for p in sorted(HERE.iterdir()):
        if p.name.startswith('client-'):
            item = read(p, 0o600)
            need(item['kind'] == 'NEW_VERIFICATION_CLIENT' and item['releaseSha256'] == b['sha'] and item['identity']['identityComplete'] is True, 'CLIENT_HISTORY')
            who = item['identity']
            need(p.name == 'client-'+str(who['pid'])+'-'+digest(who['start'].encode())[:16]+'.json', 'CLIENT_FILENAME')
            b['loaded'][str(p)] = digest(safe_bytes(p,0o600))
            clients.append(who)
    need(any(x == b['client'] for x in clients), 'CLIENT_NOT_RECORDED')
    return clients, [x for x in clients if x != b['client'] and rows.get(x['pid'], {}).get('start') == x['start']]


def observe(b, postclose=False):
    scope, old = helpers(b); rows = scope['table'](); pin = b['pin']
    for name in ('compile-reconcile','owned-compile-reconcile','compile-reconcile-authorization.json'):
        path = UNIT/name
        need(not path.exists() and not path.is_symlink(), 'UNAUTHORIZED_COMPILE_PATH_PRESENT')
    controllers = {(pin['wrapperPid'], pin['wrapperStart']), (pin['shellPid'], pin['shellStart'])}
    if not postclose:
        need(os.getppid() == pin['shellPid'] and rows[pin['shellPid']]['ppid'] == pin['wrapperPid'], 'SAME_ORIGINAL_PARENT')
        for role in ('wrapper', 'shell'):
            row = rows[pin[role+'Pid']]
            need(row['start'] == pin[role+'Start'] and row['argvHash'] == pin[role+'ArgvSha256'], 'HOLDER_IDENTITY')
    plan = b['plan']; source = old.observe_source({'expectedFiles': plan['source']['files'], 'modes': plan['sourceModes']}, scope)
    receipt = read(UNIT / 'owned-full-check/receipt.json'); roots = read(UNIT / 'root-live-phase-lineage-01-limited.json')
    recorded = {(x['pid'], x['start']) for x in receipt['ownedIdentities']}
    for role in ('phaseKeeper', 'collector'): recorded.add((roots[role]['pid'], roots[role]['start']))
    need(len(recorded) == 2439, 'FINITE_RECORDED_UNION')
    rows = scope['table']()
    live = [x for x in recorded if rows.get(x[0], {}).get('start') == x[1]]
    clients, prior = inventory_clients(b, rows)
    descendants = {pin['wrapperPid']}; excluded = {os.getpid()}
    while True:
        more = descendants | {p for p, r in rows.items() if r['ppid'] in descendants}
        sub = excluded | {p for p, r in rows.items() if r['ppid'] in excluded}
        if more == descendants and sub == excluded: break
        descendants, excluded = more, sub
    unexpected = descendants - excluded - {pin['wrapperPid'], pin['shellPid']}
    boundary = scope['boundary_inventory'](plan)
    defects = any(boundary[x] for x in ('originalIdentitiesAbsent','inheritedIdentityChanged','incompleteStableIdentities','otherProjectFacts'))
    owned_pids = {p for p, s in recorded if rows.get(p, {}).get('start') == s}
    owned_listeners = [x for x in boundary['listeners'] if x['pid'] in owned_pids]
    lock = old.WRAPPER.with_name('gradle.lock')
    st = lock.lstat(); need(stat.S_ISREG(st.st_mode) and [st.st_dev, st.st_ino] == pin['lockDevInode'], 'LOCK_INODE')
    if not postclose:
        fields = scope['capture'](['/usr/sbin/lsof','-nP','-a','-p',str(pin['wrapperPid']),'-F','pfnil','--',str(lock)]).splitlines()
        need('p'+str(pin['wrapperPid']) in fields and 'i'+str(st.st_ino) in fields, 'WRAPPER_FD')
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        need([os.fstat(fd).st_dev, os.fstat(fd).st_ino] == pin['lockDevInode'], 'LOCK_OPEN_IDENTITY')
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            need(e.errno in (errno.EAGAIN, errno.EACCES) and not postclose, 'KERNEL_UNKNOWN'); kernel_free = False
        else:
            fcntl.flock(fd, fcntl.LOCK_UN); kernel_free = True
    finally: os.close(fd)
    unchanged = all(digest(safe_bytes(Path(p))) == h for p, h in b['loaded'].items())
    for name in ('compile-reconcile','owned-compile-reconcile','compile-reconcile-authorization.json'):
        path = UNIT/name
        need(not path.exists() and not path.is_symlink(), 'COMPILE_PATH_APPEARED')
    result = {'observationOk': True, 'metadataUnchanged': unchanged, 'codeUnchanged': unchanged,
              'sourceDigest': source, 'sourceExact': source == SOURCE, 'recordedCount': len(recorded), 'liveOwned': live,
              'currentUnknown': [], 'unexpectedDescendants': sorted(unexpected), 'ownedListeners': owned_listeners,
              'inheritedMatched': len(boundary['inheritedMatched']), 'boundaryDefects': defects,
              'clientsComplete': True, 'priorClientsLive': prior, 'sameHolder': not postclose,
              'kernelHeld': not kernel_free, 'kernelFree': kernel_free,
              'controllersAbsentOrReused': all(rows.get(p, {}).get('start') != s for p,s in controllers),
              'clientIdentities': clients, 'observedAtEpoch': time.time()}
    # Recheck holder identity AFTER expensive source/boundary observations, never only at entry.
    if not postclose:
        after = scope['table']()
        need(all(after.get(pin[r+'Pid'], {}).get('start') == pin[r+'Start'] and after[pin[r+'Pid']]['argvHash'] == pin[r+'ArgvSha256'] for r in ('wrapper','shell')), 'HOLDER_CHANGED_DURING_OBSERVATION')
    current(result, postclose); return result


def optional(name):
    path = HERE / name
    if not path.exists():
        need(not path.is_symlink(), 'DANGLING_INPUT'); return None
    return read(path, 0o600)


def main():
    need(len(sys.argv) in (3,4), 'ARGUMENTS')
    mode, release_sha = sys.argv[1:3]
    need(mode in ('final','gate','postclose'), 'MODE')
    b = load_authority(release_sha); register_client(b, mode)
    if mode == 'gate':
        requested = int(sys.argv[3]) if len(sys.argv) == 4 else None
        ready = optional('readiness.json')
        if ready is None:
            need(optional('permit.json') is None, 'PERMIT_WITHOUT_READINESS')
            write_new('negative-readiness-denial.json', {'kind':'NEW_READINESS_MISSING_DENIAL','releaseSha256':release_sha,'status':1,'shellPid':os.getppid(),'readinessAbsent':True,'permitAbsent':True,'client':b['client']})
            raise Hold('MISSING_READINESS')
        p = optional('permit.json'); ad = optional('root-admission.json')
        ready_sha = digest(safe_bytes(HERE / 'readiness.json', 0o600)); before = time.time()
        # Validate metadata/freshness BEFORE any expensive observation.
        admission(ad, release_sha, PIN); readiness(ready, release_sha, b['a']['retainedContractSha256'], before); permit(p, ready, ready_sha, release_sha, before, requested)
        need(ready['admissionSha256'] == digest(safe_bytes(HERE/'root-admission.json',0o600)), 'ADMISSION_CHANGED')
        need(ad['negativeDenialSha256'] == digest(safe_bytes(HERE/'negative-readiness-denial.json',0o600)), 'NEGATIVE_CHANGED')
        for name in ('readiness.json','permit.json','root-admission.json','negative-readiness-denial.json'):
            b['loaded'][str(HERE/name)] = digest(safe_bytes(HERE/name,0o600))
        live_before = observe(b); live_after = observe(b); after = time.time()
        decision = gate(b['a'], b['retained'], read(HERE/'input-pins.json')['retainedContract'], ad, ready, p, release_sha, ready_sha, live_before, live_after, before, after, requested)
        write_new('gate-allow.json', {'decision':decision,'releaseSha256':release_sha,'readinessSha256':ready_sha,'permitSha256':digest(safe_bytes(HERE/'permit.json',0o600)),'before':live_before,'after':live_after,'atEpoch':after,'expectedWrapperExit':1,'C8Credit':False})
    elif mode == 'final':
        need(optional('readiness.json') is None and optional('permit.json') is None, 'NO_REUSE')
        ad = optional('root-admission.json'); admission(ad, release_sha, PIN)
        need(ad['negativeDenialSha256'] == digest(safe_bytes(HERE/'negative-readiness-denial.json',0o600)), 'ACTUAL_NEGATIVE_HASH')
        for name in ('root-admission.json','negative-readiness-denial.json'):
            b['loaded'][str(HERE/name)] = digest(safe_bytes(HERE/name,0o600))
        first = observe(b); second = observe(b)
        write_new('readiness.json', {'protocol':PROTOCOL,'kind':'QUALIFIED_FAILED_RESOURCE_READINESS','verificationExit':0,'releaseSha256':release_sha,'retainedContractSha256':b['a']['retainedContractSha256'],'expectedWrapperExit':1,'historicalGapCodes':GAPS,'C8Credit':False,'verifiedAtEpoch':time.time(),'before':first,'after':second,'admissionSha256':digest(safe_bytes(HERE/'root-admission.json',0o600))})
    else:
        result = read(HERE/'root-wrapper-result.json',0o600); allowed = read(HERE/'gate-allow.json',0o600)
        need(result['actualWrapperExit'] == 1 and type(result['actualWrapperExit']) is int and result['separatelyCaptured'] is True and result['releaseSha256'] == release_sha and result['gateAllowSha256'] == digest(safe_bytes(HERE/'gate-allow.json',0o600)), 'ACTUAL_WRAPPER_RESULT')
        need(allowed['decision'] == 'ALLOW_QUALIFIED_FAILED_RESOURCE_EXIT_ONE' and allowed['releaseSha256'] == release_sha and allowed['readinessSha256'] == digest(safe_bytes(HERE/'readiness.json',0o600)) and allowed['permitSha256'] == digest(safe_bytes(HERE/'permit.json',0o600)), 'CLOSE_CHAIN')
        for name in ('root-wrapper-result.json','gate-allow.json','readiness.json','permit.json','root-admission.json','negative-readiness-denial.json'):
            b['loaded'][str(HERE/name)] = digest(safe_bytes(HERE/name,0o600))
        first = observe(b,True); second = observe(b,True)
        write_new('postclose.json', {'status':'QUALIFIED_FAILED_RESOURCE_POSTCLOSE_OBSERVED','releaseSha256':release_sha,'actualWrapperExit':1,'before':first,'after':second,'historicalGapCodes':GAPS,'C8Credit':False})
    print(json.dumps({'status':'FAILED_RESOURCE_'+mode.upper()+'_VERIFIED','C8Credit':False})); return 0

if __name__ == '__main__':
    try: status = main()
    except BaseException as error:
        print(json.dumps({'status':'HOLD','reason': str(error) if isinstance(error,Hold) else type(error).__name__,'C8Credit':False})); status = 1
    sys.exit(status)

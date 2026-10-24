"""Root-only fresh admission capture; no phase, workspace, permit or release."""
import ast
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
import types

sys.dont_write_bytecode = True
R = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
P = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume4'
H = lambda raw: hashlib.sha256(raw).hexdigest()

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def main():
    require(len(sys.argv) == 3, 'EXACT_CLOSURE_ADOPTION_PATH_AND_HASH_REQUIRED')
    closure_path, closure_sha = sys.argv[1:]
    closure = R / closure_path
    require(closure_path.startswith('docs/qa/evidence/STUDIO-OBS-011/t0/')
            and '..' not in Path(closure_path).parts and not closure.is_symlink(), 'CLOSURE_SCOPE')
    closure_raw = closure.read_bytes()
    require(H(closure_raw) == closure_sha, 'CLOSURE_ADOPTION_HASH')
    adopted = json.loads(closure_raw)
    require(adopted['qualifiedResourceClosureAccepted'] is True
            and adopted['actualWrapperExit'] == 1 and adopted['actualPostcloseExit'] == 0
            and adopted['C8Credit'] is False, 'ACTUAL_CLOSURE_REQUIRED')
    manifest_raw = (P / 'manifest.json').read_bytes()
    require(H(manifest_raw) == '43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce', 'PACKET_SEAL')
    buffers = {}
    for row in json.loads(manifest_raw)['files']:
        f = P / row['path']
        require(not f.is_symlink() and stat.S_ISREG(f.lstat().st_mode), 'PACKET_LINK_OR_TYPE')
        raw = f.read_bytes()
        require(H(raw) == row['sha256'] and len(raw) == row['bytes']
                and stat.S_IMODE(f.lstat().st_mode) == row['mode'], 'PACKET_MEMBER_CHANGED')
        buffers[row['path']] = raw
    contract = types.ModuleType('contracts')
    exec(compile(buffers['contracts.py'], str(P / 'contracts.py'), 'exec'), contract.__dict__)
    require('contracts' not in sys.modules, 'CONTRACT_IMPORT_COLLISION')
    sys.modules['contracts'] = contract
    d = types.ModuleType('_root_gateway_admission_driver')
    d.__file__ = str(P / 'run-private.py')
    exec(compile(buffers['run-private.py'], d.__file__, 'exec'), d.__dict__)
    E, W = d.E, d.W
    require(not W.exists() and not W.is_symlink(), 'WORKSPACE_ALREADY_CONSUMED')
    require(E.is_dir() and not E.is_symlink() and stat.S_IMODE(E.stat().st_mode) == 0o700
            and E.stat().st_uid == os.getuid() and not list(E.iterdir()), 'FRESH_RUNTIME_REQUIRED')
    require(os.umask(0o077) == 0o077, 'PARENT_UMASK_077_REQUIRED')
    A = json.loads(buffers['root-authorization.template.json'])
    A.update(packetManifestSha256=H(manifest_raw),
             independentArchitectureReviewSha256='18eb376085a071d2188fa1a0765b1da92f9dd45c873712491cb22fea7ac6b578',
             independentQaReviewSha256='82b8a83fbb2de80553d55f1ca2b3941122c20da29173ab8b5b936a2ac4c8f1f4')
    node = Path(d.SCOPE['node']).resolve()
    helm = Path(d.SCOPE['helm']).resolve()
    deps = Path(d.SCOPE['dependencies']).resolve()
    A.update(nodeCanonicalPath=str(node), helmCanonicalPath=str(helm),
             nodeSha256=H(node.read_bytes()), helmSha256=H(helm.read_bytes()),
             dependenciesRealpath=str(deps), boundBasePath='/usr/bin:/bin:/usr/sbin:/sbin',
             safeEnvironment={'HOME': str(Path.home()), 'LANG': 'en_US.UTF-8', 'LC_ALL': 'en_US.UTF-8'})
    require(A['nodeSha256'] == '9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a', 'NODE24_CHANGED')
    required = [R, P, E, W.parent, R / 'helm-chart', R / 'helm-chart/put-checks',
                R / 'helm-chart/put-checks/templates', deps, node.parent, helm.parent]
    expanded = list(required)
    for path in required:
        if R in path.parents:
            current = R
            for part in path.relative_to(R).parts:
                current /= part
                expanded.append(current)
    A['directoryRoots'] = {str(p): d.directory_fact(p) for p in dict.fromkeys(expanded)}
    d.setup_custody(A)
    A['dependencyInventory'] = d.inventory(deps)
    G = json.loads(buffers['source-guards.json'])
    A['distModes'] = {row['path']: stat.S_IMODE((R / 'studio-runner/dist' / row['path']).lstat().st_mode)
                      for row in G['dist']['files']}
    A['auxModes'] = {name: stat.S_IMODE((R / name).lstat().st_mode)
                     for group in G['auxiliaryGroups'].values() for name in group}
    versions = {}
    for name, command in [('node', [str(node), '--version']), ('helm', [str(helm), 'version', '--short'])]:
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            stdout, stderr = child.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            print(json.dumps({'status': 'HOLD', 'reason': 'TOOL_VERSION_TIMEOUT_NO_SIGNAL',
                              'command': command, 'pid': child.pid}), flush=True)
            raise ValueError('TOOL_VERSION_TIMEOUT_NO_SIGNAL')
        require(child.returncode == 0 and not stderr and bool(stdout.strip()), 'TOOL_VERSION_FAILED')
        versions[name] = {'command': command, 'actualExit': child.returncode, 'stdout': stdout.strip(),
                          'stderrEmpty': True, 'sha256': A[name + 'Sha256']}
    A['actualFreshToolVersions'] = versions
    core_path = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
    core_raw = core_path.read_bytes()
    require(H(core_raw) == 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae', 'CORE_CHANGED')
    names = {'sha', 'utc', 'regular', 'capture', 'pid_text', 'table', 'identity', 'project_role', 'boundary_inventory'}
    nodes = [n for n in ast.parse(core_raw).body if isinstance(n, (ast.Import, ast.ImportFrom))
             or isinstance(n, ast.FunctionDef) and n.name in names]
    C = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned-root-readonly-core>', 'exec'), C)
    C.update(ROOT=R, capture=d.observe_capture, bounded_capture=d.observe_capture)
    shell_pid = os.getppid()
    wrapper_pid = int(C['pid_text'](shell_pid, 'ppid'))
    hold = json.loads(buffers['hold.template.json'])
    for role, pid in [('shell', shell_pid), ('wrapper', wrapper_pid)]:
        hold[role] = {'pid': pid, 'start': C['pid_text'](pid, 'lstart'),
                      'argvHash': H(C['pid_text'](pid, 'command').encode())}
    require(C['pid_text'](shell_pid, 'comm') == '/bin/bash', 'NOT_HELD_BASH')
    lock = Path(hold['lock']['path'])
    st = lock.lstat()
    require(stat.S_ISREG(st.st_mode), 'LOCK_TYPE')
    hold['lock'].update(dev=st.st_dev, ino=st.st_ino)
    baseline_path = R / hold['baselinePath']
    hold['baselineSha256'] = d.file_hash(baseline_path)
    require(hold['baselineSha256'] == 'fd39b45fd27689034742d5a3205461e9aa4a316baa810f8488216f8f49b7101a', 'BASELINE_CHANGED')
    hold.update(capturedAtEpoch=time.time(), rootDecision='FRESH_HELD_ADMISSION_CAPTURE_ONLY_NO_PHASE_RELEASE')
    d.write_new(E / 'hold.json', hold)
    A['holdFileSha256'] = d.file_hash(E / 'hold.json')
    C = d.core()
    d.held(A, C)
    rows = C['table']()
    comms = {}
    for line in C['capture'](['/bin/ps', '-ww', '-axo', 'pid=,comm=']).splitlines():
        fields = line.strip().split(None, 1)
        require(len(fields) == 2 and fields[0].isdigit() and int(fields[0]) not in comms, 'COMM_CENSUS')
        comms[int(fields[0])] = fields[1]
    require(os.getpid() in comms and shell_pid in comms, 'COMM_ANCHOR')
    nodes = [pid for pid, comm in comms.items() if Path(comm).name.lower() == 'node']
    require(len(nodes) <= 64, 'NODE_BOUND')
    identities = []
    for pid in nodes:
        require(pid in rows, 'NODE_TABLE_MISMATCH')
        identity = C['identity'](rows[pid])
        require(identity and identity.get('identityComplete') is True
                and identity['argvHash'] == rows[pid]['argvHash'], 'BASELINE_NODE_INCOMPLETE')
        identities.append(identity)
    candidate = json.loads(buffers['candidate-baseline.template.json'])
    candidate.update(capturedBeforeUnit=True, capturedAtEpoch=time.time(), identities=identities,
                     rootVerifiedConcreteNodeRolesAndInheritedFacts=True)
    d.write_new(E / 'candidate-baseline.json', candidate)
    A['candidateBaselineSha256'] = d.file_hash(E / 'candidate-baseline.json')
    before_source = d.guards(A, C)
    boundary = d.boundary(hold, C, A)
    after_source = d.guards(A, C)
    d.held(A, C)
    require(not W.exists() and not W.is_symlink(), 'WORKSPACE_CREATED_DURING_ADMISSION')
    facts = {'kind': 'ROOT_FRESH_GATEWAY80_HELD_ADMISSION_FACTS', 'proposedAuthorization': A,
             'closureAdoptionPath': closure_path, 'closureAdoptionSha256': closure_sha,
             'beforeSource': before_source, 'boundary': boundary, 'afterSource': after_source,
             'workspaceAbsent': True, 'actualNativeInvocations': 0, 'authorized': False,
             'operatorMustSeparatelyInspectAndAuthorize': True}
    d.write_new(E / 'root-admission-facts.json', facts)
    print(json.dumps({'admissionFactsSha256': d.file_hash(E / 'root-admission-facts.json'),
                      'holdSha256': A['holdFileSha256'], 'baselineNodes': len(identities),
                      'dependencyEntries': len(A['dependencyInventory']), 'versions': versions,
                      'sourceExact': True, 'nativeOrPhaseReleased': False}))

if __name__ == '__main__':
    main()

"""Bounded successor of prepare-sandbox-current.py; execute only after composition.

Capture one current COPY-profile catalog, then seed two regular copies from it.
This changes historical admission only; suites and proof readers are unchanged.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]
catalog_path = Path(sys.argv[3]).resolve()
here = Path(__file__).resolve().parent
require(os.environ.get('OBS011_RT_FINAL_COMPOSITION') == 'ALL_PREDECESSORS_APPLIED_LANE_IDLE',
        'Root must first establish final composition and the idle runtime lane')
profile = root / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-runner-copy-list.txt'
require(sha(profile) == 'ab9105a7e6b0cf27a9d512b0a6fb84efd65f3f28425a56ee5208d0806b97d9b1',
        'Approved COPY/MKDIR profile changed')
binding_path = root / ('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/'
                       'runner-execution/empty-wrapper-correction/copy-back-binding.json')
require(sha(binding_path) == '0ceb51bb6ec7c21947bb61d80fb3e6fc2b25010bd78cc7902d7f554e2638ceb7',
        'Corrected seven-file binding changed')
binding = json.loads(binding_path.read_text())
copy_paths, empty_paths = [], []
for line in profile.read_text().splitlines():
    match = re.match(r'^(COPY|MKDIR)\s+(\S+)', line)
    if match:
        (copy_paths if match[1] == 'COPY' else empty_paths).append(match[2])
copy_paths.append('backend/src/main/resources/application.yml')
omitted = {'coverage', '.claude', 'short.webm'}


def catalog(base):
    rows = []
    for name in copy_paths:
        start = base / name
        require(start.exists(), 'Missing selected input: ' + name)
        if start.is_dir():
            for directory, subdirs, files in os.walk(start, followlinks=True):
                current = Path(directory)
                if name == 'studio-runner' and current == start:
                    subdirs[:] = sorted(set(subdirs) - omitted)
                    files = sorted(set(files) - omitted)
                else:
                    subdirs.sort()
                for filename in sorted(files):
                    path = current / filename
                    rows.append({'path': path.relative_to(base).as_posix(),
                                 'sha256': sha(path), 'bytes': path.stat().st_size})
        else:
            rows.append({'path': name, 'sha256': sha(start), 'bytes': start.stat().st_size})
    return sorted(rows, key=lambda row: row['path'])


def verify_fixed_inputs():
    for row in binding['paths']:
        require(sha(root / row['path']) == row['beforeSha256'], 'RT preimage drift: ' + row['path'])
        require(sha(root / row['candidatePath']) == row['afterSha256'], 'RT candidate drift: ' + row['path'])
    for row in binding['carriedUntouched']:
        require(sha(root / row['path']) == row['sha256'], 'Protected input drift: ' + row['path'])
    accepted = root / ('docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/'
                       'runner-timeout-fix/execution01/validated-four-file-application-binding.json')
    require(sha(accepted) == 'a8ece9d9f506d574ddd9ad1b629bb6541ee7b2d8911b4feb68dc916ec4fd852f',
            'Accepted009 binding drift')
    for row in json.loads(accepted.read_text())['paths']:
        require(sha(root / row['path']) == row['validatedCandidateSha256'],
                'Accepted009 has not landed: ' + row['path'])
    fold_ports = {
        'studio-runner/test/guided/runtime.test.ts':
            '53169404baaf3d8e2e52e87fdabd42f73e07566422a7017e74fb064720ae37ea',
        'studio-runner/test/fixtures-tier/guidedCloseBound.test.ts':
            '940554cdb7499eac57d8eb0dbe36341336e2943e826abb8e2c7fa81eced15aea',
    }
    for name, digest in fold_ports.items():
        require(sha(root / name) == digest, 'Final FOLD runner port has not landed: ' + name)
    return {'copyProfileSha256': sha(profile), 'sevenFileBindingSha256': sha(binding_path),
            'accepted009BindingSha256': sha(accepted), 'finalFoldRunnerPorts': fold_ports}


pins = verify_fixed_inputs()
if mode == 'capture':
    require(not catalog_path.exists(), 'Do not overwrite an earlier catalog')
    rows = catalog(root)
    payload = {'kind': 'FRESH_COMPOSED_COPY_PROFILE_CATALOG', 'root': str(root),
               'pins': pins, 'copyPaths': copy_paths, 'emptyPaths': empty_paths,
               'topLevelRunnerOmissions': sorted(omitted), 'files': rows}
    catalog_path.write_text(json.dumps(payload, indent=2) + '\n')
    print(json.dumps({'catalog': str(catalog_path), 'sha256': sha(catalog_path), 'files': len(rows)}))
elif mode == 'seed':
    expected_sha = sys.argv[4]
    sandbox = Path(sys.argv[5]).resolve()
    require(sha(catalog_path) == expected_sha, 'Fresh catalog binding drift')
    captured = json.loads(catalog_path.read_text())
    require(captured['root'] == str(root) and captured['pins'] == pins,
            'Catalog root or fixed binding drift')
    require(captured['copyPaths'] == copy_paths and captured['emptyPaths'] == empty_paths
            and captured['topLevelRunnerOmissions'] == sorted(omitted), 'COPY profile drift')
    require(not sandbox.exists() and sandbox != root and root not in sandbox.parents,
            'Sandbox must be fresh and outside actual repository')
    require(catalog(root) == captured['files'], 'Actual selected membership/content drift')
    for destination_name in ['before-repo', 'repo']:
        destination = sandbox / destination_name
        destination.mkdir(parents=True)
        for name in copy_paths:
            source, target = root / name, destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                def ignore(directory, names):
                    return sorted(set(names) & omitted) if Path(directory) == root / 'studio-runner' else []
                shutil.copytree(source, target, symlinks=False, ignore=ignore)
            else:
                shutil.copy2(source, target, follow_symlinks=True)
        for name in empty_paths:
            (destination / name).mkdir(parents=True, exist_ok=True)
        require(catalog(destination) == captured['files'], 'Copied catalog mismatch: ' + destination_name)
    require(catalog(root) == captured['files'], 'Actual inputs changed during copies')
    for row in binding['paths']:
        shutil.copy2(root / row['candidatePath'], sandbox / 'repo' / row['path'])
    after = catalog(sandbox / 'repo')
    wanted = {row['path']: row['afterSha256'] for row in binding['paths']}
    expected = []
    for row in captured['files']:
        updated = dict(row)
        if row['path'] in wanted:
            candidate = sandbox / 'repo' / row['path']
            updated.update(sha256=wanted[row['path']], bytes=candidate.stat().st_size)
        expected.append(updated)
    require(after == expected, 'Seven-source overlay changed unexpected inputs')
    receipt = {'kind': 'FRESH_COMPOSED_TWO_COPY_SEED', 'catalogPath': str(catalog_path),
               'catalogSha256': expected_sha, 'pins': pins, 'sandbox': str(sandbox),
               'filesPerInitialCopy': len(captured['files']), 'pathsOverlaid': binding['paths'],
               'actualInputsUnchanged': True, 'dependenciesDereferenced': True,
               'testsOrCompilersExecuted': False, 'privateEvidenceCopied': False}
    (sandbox / 'seed-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'sandbox': str(sandbox), 'receiptSha256': sha(sandbox / 'seed-receipt.json')}))
else:
    raise SystemExit('Expected capture or seed')

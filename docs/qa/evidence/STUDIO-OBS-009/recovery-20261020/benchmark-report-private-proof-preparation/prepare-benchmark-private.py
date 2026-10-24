"""Inactive, bounded reuse of the approved COPY catalog/copy loop for one benchmark proof.
Source only until root separately releases native proof, binds fresh facts and grants execution.
Historical e38 helper/bindings are not edited or weakened; no seven-file overlay is performed.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import stat
import sys

HERE = Path(__file__).resolve().parent
SOURCE = Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01/repo')
DESTINATION = Path('/private/tmp/obs009-benchmark-report-adoption-20261020-proof01')
ACTUAL = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
PROFILE_SHA = 'ab9105a7e6b0cf27a9d512b0a6fb84efd65f3f28425a56ee5208d0806b97d9b1'
E19 = 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'

def require(ok, reason):
    if not ok:
        raise SystemExit(reason)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def digest(rows):
    return hashlib.sha256(json.dumps(rows, separators=(',', ':')).encode()).hexdigest()

def reference(ref):
    require(isinstance(ref, dict) and isinstance(ref.get('path'), str) and isinstance(ref.get('sha256'), str), 'Unbound root reference')
    path = Path(ref['path'])
    require(path.is_file() and sha(path) == ref['sha256'], 'Root reference drift')
    return path

def regular(path):
    require(not path.is_symlink() and stat.S_ISREG(path.stat().st_mode), 'Nonregular private COPY member')

def catalog(base, profile):
    rows = []
    omitted = set(profile['topLevelRunnerOmissions'])
    for name in profile['copyPaths']:
        start = base / name
        require(start.exists() and not start.is_symlink(), 'Missing/nonregular private COPY root: ' + name)
        if start.is_dir():
            for directory, subdirs, files in os.walk(start, followlinks=False):
                current = Path(directory)
                require(not current.is_symlink(), 'Private source directory link')
                if name == 'studio-runner' and current == start:
                    subdirs[:] = sorted(set(subdirs) - omitted)
                    files = sorted(set(files) - omitted)
                else:
                    subdirs.sort()
                for subdir in subdirs:
                    require(not (current / subdir).is_symlink(), 'Private source directory link')
                for filename in sorted(files):
                    path = current / filename
                    regular(path)
                    rows.append({'path': path.relative_to(base).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size})
        else:
            regular(start)
            rows.append({'path': name, 'sha256': sha(start), 'bytes': start.stat().st_size})
    return sorted(rows, key=lambda row: row['path'])

def product(rows):
    return [{'path': row['path'].removeprefix('studio-runner/dist/'), 'sha256': row['sha256']} for row in rows if row['path'].startswith('studio-runner/dist/')]

def main():
    mode, admission_path, admission_sha, output = sys.argv[1:5]
    require(mode in ['capture', 'seed'], 'Expected capture or seed')
    require(os.environ.get('OBS009_BENCHMARK_PRIVATE_PROOF') == 'ROOT_POST_NATIVE_RELEASED_SOURCE_BOUND', 'No post-native root admission')
    admission_file = Path(admission_path)
    require(sha(admission_file) == admission_sha, 'Root admission byte binding changed')
    admission = json.loads(admission_file.read_text())
    require(admission.get('authorized') is True and admission.get('nativeCollectorTerminalAndRootReleased') is True
            and admission.get('sourceWindowAndTenActualPreimagesFreshlyBound') is True, 'Root must establish current release/source facts')
    require(admission.get('sourceRoot') == str(SOURCE) and admission.get('destination') == str(DESTINATION), 'Unbound roots')
    for name in ['nativeTerminalReceipt', 'rootLaneRelease', 'currentResourceAdmission', 'freshProductSourceDependencyReferenceBrowserCarry']:
        reference(admission.get(name))
    actual_capture = json.loads(reference(admission['actualSourceBeforeCapture']).read_text())
    require(actual_capture['digest'] == admission['actualSourceBeforeCapture']['digest']
            and actual_capture['dist']['digest'] == admission['actualDistBeforeDigest'], 'Actual source/dist capture binding drift')
    profile = json.loads((HERE / 'copy-profile.json').read_text())
    require(sha(ACTUAL / profile['originalProfilePath']) == PROFILE_SHA == profile['originalProfileSha256'], 'Original profile drift')
    expected = json.loads(reference(admission['acceptedPostNativeSnapshot']).read_text())[admission['acceptedPostNativeSnapshot']['sourceKey']]['copyProfileFiles']
    rows = catalog(SOURCE, profile)
    require(rows == expected and digest(rows) == admission['postNativeSelectedCatalogDigest']
            and len(rows) == admission['postNativeSelectedCatalogCount'] == 13995, 'Post-native selected catalog not bound')
    built = product(rows)
    require(len(built) == 238 and digest(built) == E19 == admission['acceptedProductDigest'], 'Accepted private E19 product drift')
    by_path = {row['path']: row for row in rows}
    for row in json.loads((HERE / 'phase-pins.json').read_text())['files']:
        require(sha(ACTUAL / row['path']) == row['beforeSha256'] == by_path[row['path']]['sha256'], 'Benchmark ten-preimage drift')
    for row in json.loads((HERE / 'carried-native-layer.json').read_text())['paths']:
        require(by_path[row['path']]['sha256'] == row['sha256'], 'Accepted native RT/test layer drift')
    catalog_path = Path(output)
    if mode == 'capture':
        with catalog_path.open('x') as handle:
            json.dump({'kind': 'POST_NATIVE_BENCHMARK_COPY_PROFILE_CATALOG', 'source': str(SOURCE), 'admissionSha256': admission_sha,
                       'profile': profile, 'files': rows, 'product238Digest': E19}, handle, indent=2)
            handle.write('\n')
    else:
        catalog_sha = sys.argv[5]
        require(sha(catalog_path) == catalog_sha, 'Fresh source catalog drift')
        saved = json.loads(catalog_path.read_text())
        require(saved['files'] == rows and saved['profile'] == profile and saved['admissionSha256'] == admission_sha, 'Capture/seed input drift')
        require(not DESTINATION.exists() and SOURCE != DESTINATION and SOURCE not in DESTINATION.parents and DESTINATION not in SOURCE.parents, 'Fresh independent destination required')
        for name in ['before-repo', 'repo']:
            destination = DESTINATION / name
            destination.mkdir(parents=True)
            for member in profile['copyPaths']:
                source, target = SOURCE / member, destination / member
                target.parent.mkdir(parents=True, exist_ok=True)
                if source.is_dir():
                    def ignore(directory, names):
                        return sorted(set(names) & set(profile['topLevelRunnerOmissions'])) if Path(directory) == SOURCE / 'studio-runner' else []
                    shutil.copytree(source, target, symlinks=False, ignore=ignore)
                else:
                    shutil.copy2(source, target, follow_symlinks=False)
            for member in profile['emptyPaths']:
                directory = destination / member
                directory.mkdir(parents=True, exist_ok=True)
                require(not any(directory.iterdir()), 'MKDIR evidence destination is not empty')
            require(catalog(destination, profile) == rows, 'Regular selected byte/membership mismatch')
        require(catalog(SOURCE, profile) == rows, 'Read-only native base drifted during copy')
        with (DESTINATION / 'seed-receipt.json').open('x') as handle:
            json.dump({'kind': 'BOUNDED_BENCHMARK_PROFILE_TWO_COPY_SEED', 'source': str(SOURCE), 'destination': str(DESTINATION),
                       'catalogSha256': catalog_sha, 'admissionSha256': admission_sha, 'filesPerCopy': len(rows), 'product238Digest': E19,
                       'privateQaPayloadCopied': False, 'actualApplication': False, 'phaseOverlayPerformed': False}, handle, indent=2)
            handle.write('\n')
    print(json.dumps({'mode': mode, 'catalogSha256': sha(catalog_path), 'members': len(rows), 'product238Digest': E19}))

if __name__ == '__main__':
    main()

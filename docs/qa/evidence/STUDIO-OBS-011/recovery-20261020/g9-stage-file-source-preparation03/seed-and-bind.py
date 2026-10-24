import os, sys, stat, json, hashlib, subprocess, datetime
from pathlib import Path

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
OUT = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/g9-stage-file-source-preparation03'
PREP = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/stage-file-race-proof-preparation'
PARENT = Path('/private/tmp/obs009-g9-f2-current-20261020-root01')
BUILD = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-recovery-20261020-rt-bootstrap-actual-build01-results.json'
CAPTURE = BUILD.with_name(BUILD.name.replace('-results.json', '-after.json'))
BIN_BASELINE = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/rt-bootstrap-actual-application02/after-build-21-bin-links.json'
BIN_BASELINE_SHA256 = '284ae82a7b4f2c0b0b002d16fdef8cac63ff83d9c9588432772e975df5544ca1'
SKIP = {'backend/build', 'backend/.gradle', 'backend/buildSrc/build', 'backend/buildSrc/.gradle', 'studio-runner/coverage', 'studio-runner/short.webm'}
ROOTS = ['backend', 'studio-runner', 'docs/specs', 'tools', '.github', 'package.json', 'package-lock.json', 'AGENTS.md']
H = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def write(name, value):
    p = OUT / name
    assert not p.exists()
    p.write_text(json.dumps(value, indent=2) + '\n')

def source_files():
    names = []
    for top in ROOTS:
        p = ROOT / top
        if p.is_file():
            names.append(top)
            continue
        for base, dirs, files in os.walk(p, followlinks=False):
            rel = Path(base).relative_to(ROOT)
            dirs[:] = sorted(n for n in dirs if n not in {'.git', '.claude', 'node_modules'} and str(rel / n) not in SKIP)
            for name in dirs:
                assert not (Path(base) / name).is_symlink()
            for name in sorted(files):
                q = Path(base) / name
                name = str(q.relative_to(ROOT))
                if name in SKIP:
                    continue
                assert not q.is_symlink() and q.is_file(), name
                assert q.suffix.lower() not in {'.webm', '.mp4', '.png', '.jpg', '.jpeg', '.gif', '.har', '.log'}, name
                names.append(name)
    dep = ROOT / 'studio-runner/node_modules'
    links = []
    for base, dirs, files in os.walk(dep, followlinks=False):
        for name in dirs + files:
            q = Path(base) / name
            if q.is_symlink():
                target = q.resolve(strict=True)
                assert target.is_relative_to(dep.resolve()) and target.is_file(), str(q)
                s = q.lstat()
                links.append({'path': str(q.relative_to(ROOT)), 'target': os.readlink(q), 'inode': s.st_ino, 'device': s.st_dev, 'mode': stat.S_IMODE(s.st_mode)})
        assert all(not (Path(base) / n).is_symlink() for n in dirs)
        for name in files:
            q = Path(base) / name
            assert q.is_file()
            names.append(str(q.relative_to(ROOT)))
    # Preserve the complete selected dependency inventory; 21 applies only to SDK .bin.
    assert H(BIN_BASELINE) == BIN_BASELINE_SHA256
    baseline = json.loads(BIN_BASELINE.read_text())
    assert type(baseline) is list and len(baseline) == 21
    expected_bin = []
    for row in baseline:
        assert type(row) is dict and set(row) == {'path', 'target', 'mode', 'device', 'inode'}
        assert type(row['path']) is str and Path(row['path']).parent == Path('studio-runner/node_modules/.bin')
        assert type(row['target']) is str and row['target']
        assert type(row['device']) is int and row['device'] >= 0
        assert type(row['inode']) is int and row['inode'] > 0
        mode = row['mode']
        assert type(mode) is str and mode.startswith('0o') and len(mode) in {5, 6}
        assert all(c in '01234567' for c in mode[2:])
        # Application metadata serializes lstat mode as octal text; our live inventory uses int.
        expected_bin.append({**row, 'mode': int(mode, 8)})
    assert len({row['path'] for row in expected_bin}) == 21
    actual_bin = sorted((row for row in links if Path(row['path']).parent == Path('studio-runner/node_modules/.bin')), key=lambda row: row['path'])
    assert len(actual_bin) == 21
    assert actual_bin == sorted(expected_bin, key=lambda row: row['path'])
    assert len(names) == len(set(names))
    return sorted(names), sorted(links, key=lambda x: x['path'])

def catalog(base, names):
    result = []
    for name in names:
        p = base / name
        s = p.stat()
        assert stat.S_ISREG(s.st_mode), name
        result.append({'path': name, 'sha256': H(p), 'mode': stat.S_IMODE(s.st_mode), 'bytes': s.st_size})
    return result

def original_capture_guard(capture):
    assert len(capture['files']) == 1814
    assert capture['digest'] == 'a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
    assert all(H(ROOT / row['path']) == row['sha256'] for row in capture['files'])
    dist = capture['dist']
    assert len(dist['files']) == 238 and dist['digest'] == 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
    actual = sorted(str(p.relative_to(ROOT / 'studio-runner/dist')) for p in (ROOT / 'studio-runner/dist').rglob('*') if p.is_file())
    assert actual == [row['path'] for row in dist['files']]
    assert all(H(ROOT / 'studio-runner/dist' / row['path']) == row['sha256'] for row in dist['files'])

assert not os.path.lexists(PARENT)
assert H(BUILD) == 'aa55d986311e4c92b09d1ba87ecda5b81fd49390f65312ca45000848ad8385df'
build = json.loads(BUILD.read_text())
assert build['exit'] == 0 and build['sourceStable'] and build['buildInputStable']
capture = json.loads(CAPTURE.read_text())
original_capture_guard(capture)
manifest = json.loads((PREP / 'manifest.json').read_text())
commands = json.loads((PREP / 'future-commands.json').read_text())
for p, expected in manifest['sourceBase'].items():
    assert H(ROOT / p) == expected
for variant, spec in manifest['variants'].items():
    assert H(PREP / spec['patch']) == spec['patchSha256']
    assert H(PREP / spec['restorationPatch']) == spec['restorationPatchSha256']
names, links = source_files()
before = catalog(ROOT, names)
write('copy-selected-actual-before.json', {'files': before, 'symlinks': links, 'buildCapturePath': str(CAPTURE.relative_to(ROOT)), 'buildCaptureSha256': H(CAPTURE), 'actualSourceDigest': capture['digest'], 'distDigest': capture['dist']['digest']})
PARENT.mkdir(mode=0o700)
runs = []
for variant in commands['variants']:
    destination = Path(variant['patchCwd'])
    assert destination.parent == PARENT and not os.path.lexists(destination)
    for argv in variant['seedArgv']:
        result = subprocess.run(argv, cwd=ROOT, capture_output=True)
        runs.append({'variant': variant['variant'], 'argv': argv, 'exit': result.returncode, 'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(), 'stderrSha256': hashlib.sha256(result.stderr).hexdigest()})
        assert result.returncode == 0, runs[-1]
    assert not any(p.is_symlink() for p in destination.rglob('*'))
    copied = catalog(destination, names)
    assert copied == before
    actual_names = sorted(str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file())
    assert actual_names == names
    for name in names:
        a, b = (ROOT / name).stat(), (destination / name).stat()
        assert (a.st_dev, a.st_ino) != (b.st_dev, b.st_ino)
    write(variant['variant'] + '-copied-catalog.json', {'files': copied, 'allRegular': True, 'copiedFiles': len(copied), 'sourceHardlinks': 0, 'buildProductFiles': 238, 'buildProductDigest': capture['dist']['digest']})
    print(json.dumps({'phase': 'COPY_VARIANT_COMPLETE', 'variant': variant['variant'], 'files': len(copied)}), flush=True)
after_names, after_links = source_files()
assert after_names == names and after_links == links
after = catalog(ROOT, names)
assert after == before
original_capture_guard(capture)
write('copy-command-results.json', runs)
write('copy-selected-actual-after.json', {'files': after, 'symlinks': after_links, 'actualSourceDigest': capture['digest'], 'distDigest': capture['dist']['digest']})
release = {'kind': 'G9_COPY_CUSTODY_COMPLETE_ACTUAL_INPUT_READ_WINDOW_RELEASED', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'rawExit': 0, 'sourceDigest': capture['digest'], 'sourceMembers': 1814, 'distDigest': capture['dist']['digest'], 'distMembers': 238, 'selectedCopyMembersEach': len(names), 'actualInputsStableThroughoutCopy': True, 'actualBin21SymlinksMatchAcceptedAfterBuild': True, 'selectedDependencySymlinkInventoryCount': len(links), 'selectedBinSymlinkCount': 21, 'eachCopyRegularNoSourceHardlinks': True, 'copies': [v['patchCwd'] for v in commands['variants']], 'futureActualSourceReads': False, 'futureScope': 'own copies/captured immutable metadata only; private patching and seal may continue while actual unit mutates generated cache', 'noTestsCompilerGradleOrNativeExecuted': True}
write('copy-read-window-release.json', release)
print(json.dumps(release), flush=True)

"""Original private restoration commands only, after both saved native qualifications."""
import hashlib, json, os, re, subprocess, sys, datetime
from pathlib import Path

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
REC = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020'
OUT = REC / 'g9-stage-file-native-execution03'
STAGE = REC / 'g9-stage-file-copy-patches03'
COPY = REC / 'g9-stage-file-source-preparation03'
H = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
LOAD = lambda p: json.loads(Path(p).read_text())
for phase, exit_code in [('old', 1), ('fixed', 0)]:
    qualification = LOAD(OUT / phase / 'qualification.json')
    assert qualification['qualified'] and qualification['nativeCollectorExit'] == exit_code
    reaped = LOAD(OUT / phase / 'inhibitor-reaped.json')
    assert reaped['waitExit'] in [-15, 0]

# Reuse only the saved public guard definitions. The native phase entry point is not loaded.
source = (OUT / 'execute-phase.py').read_text()
prefix = source[:source.index("phase = sys.argv[1]\n")]
ns = {'__name__': 'existing_g9_postguards_only'}
exec(compile(prefix, str(OUT / 'execute-phase.py') + '::guards-only', 'exec'), ns)
save, host, actual_guard, check_rows, private_guard = (ns[k] for k in ['save', 'host', 'actual_guard', 'check_rows', 'private_guard'])
assert not (OUT / 'restoration-start.json').exists()
save(OUT / 'restoration-start.json', {'driverPid': os.getpid(), 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'nativeInvocations': 0, 'bothOriginalNativeQualificationsRequired': True})
inhibitor = subprocess.Popen(['caffeinate', '-dimsu', '-w', str(os.getpid())], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    beforehost = host()
    before = actual_guard()
    plan = LOAD(STAGE / 'future-native-commands.json')
    commands = []
    restored = []
    for variant in plan['variants']:
        private_guard(variant)
        tree = Path(variant['scratch'])
        for phase, key in [('restore-dry-run', 'restorationDryRunArgv'), ('restore-apply', 'restorationArgv')]:
            result = subprocess.run(variant[key], cwd=tree, capture_output=True)
            unsafe = bool(re.search(rb'offset|fuzz|FAILED|reject', result.stdout + result.stderr, re.I))
            row = {'variant': variant['variant'], 'phase': phase, 'argv': variant[key], 'cwd': str(tree), 'rawExit': result.returncode, 'offsetFuzzFailedRejectMention': unsafe, 'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(), 'stderrSha256': hashlib.sha256(result.stderr).hexdigest()}
            commands.append(row)
            assert result.returncode == 0 and not unsafe
        baseline = LOAD(variant['beforeCatalogPath'])['files']
        check_rows(tree, baseline)
        names = set(x['path'] for x in baseline)
        extras = []
        for p in tree.rglob('*'):
            assert not p.is_symlink()
            if p.is_file() and str(p.relative_to(tree)) not in names:
                relative = str(p.relative_to(tree))
                assert relative.startswith(('backend/build/', 'backend/.gradle/', 'backend/buildSrc/build/', 'backend/buildSrc/.gradle/', 'g9-f2-output/'))
                extras.append(relative)
        restored.append({'variant': variant['variant'], 'allOriginalSelectedRowsRestored': len(baseline), 'baselineCatalogSha256': H(variant['beforeCatalogPath']), 'newGeneratedFiles': len(extras), 'newGeneratedScopeOnly': True, 'originalTransportSha256': H(tree / 'backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java'), 'originalHelperSha256': H(tree / 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/ObservedResolverProcessCrashIT.java'), 'full238DistE19Unchanged': True})
    after = actual_guard()
    afterhost = host()
    assert before == after and inhibitor.poll() is None
    save(OUT / 'restoration-and-final-guards.json', {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commands': commands, 'restored': restored, 'actualBeforeAfterExact': after, 'hostBefore': beforehost, 'hostAfter': afterhost, 'restorationInhibitorPid': inhibitor.pid, 'inhibitorHeldThroughRestorationPostguards': True, 'allOriginalNativeCleanupQualificationsRequiredBeforeSourceRestoration': True, 'rawNativeFailuresPreserved': True, 'noActualSourceOrDependencyWrite': True, 'noAdditionalNativeInvocation': True, 'heavyAndCurrentInputReadsReleased': True})
    print(json.dumps({'restoration': 'BOTH_EXACT_ORIGINAL_COPY_CATALOGS_RESTORED', 'actualSourceProductStable': True, 'heavyAndCurrentInputReadsReleased': True}), flush=True)
finally:
    if inhibitor.poll() is None:
        inhibitor.terminate()
    inhibitor.wait()
    save(OUT / 'restoration-inhibitor-reaped.json', {'pid': inhibitor.pid, 'waitExit': inhibitor.returncode, 'ownedOnly': True})

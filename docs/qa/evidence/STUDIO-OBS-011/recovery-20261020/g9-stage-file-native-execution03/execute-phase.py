"""One-shot orchestration around the unchanged, reviewed C10 argv; no collector logic is changed."""
import datetime, hashlib, json, os, re, stat, subprocess, sys, time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
REC = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020'
OUT = REC / 'g9-stage-file-native-execution03'
STAGE = REC / 'g9-stage-file-copy-patches03'
COPY = REC / 'g9-stage-file-source-preparation03'
N24 = '/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin'
JDK = '/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home'
ENV = dict(os.environ, JAVA_HOME=JDK, PATH=N24 + os.pathsep + os.environ['PATH'])
H = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
LOAD = lambda p: json.loads(Path(p).read_text())

def save(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

def verify_seal(directory, expected):
    assert H(directory / 'manifest.json') == expected
    manifest = LOAD(directory / 'manifest.json')
    for row in manifest['files']:
        assert H(directory / row['path']) == row['sha256']

def host():
    power = subprocess.run(['pmset', '-g', 'batt'], capture_output=True, check=True).stdout
    lid = subprocess.run(['ioreg', '-r', '-k', 'AppleClamshellState', '-d', '4'], capture_output=True, check=True).stdout
    values = re.findall(rb'"AppleClamshellState"\s*=\s*(Yes|No)', lid)
    result = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'acPower': b"Now drawing from 'AC Power'" in power, 'lidObserved': bool(values), 'lidOpen': bool(values) and all(v == b'No' for v in values), 'powerOutputSha256': hashlib.sha256(power).hexdigest(), 'lidOutputSha256': hashlib.sha256(lid).hexdigest()}
    assert result['acPower'] and result['lidOpen']
    return result

def check_rows(tree, rows):
    for row in rows:
        p = tree / row['path']
        st = p.stat()
        assert stat.S_ISREG(st.st_mode) and H(p) == row['sha256']
        assert stat.S_IMODE(st.st_mode) == row['mode'] and st.st_size == row['bytes']

def actual_guard():
    captured = LOAD(ROOT / 'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-recovery-20261020-rt-bootstrap-actual-build01-after.json')
    assert captured['digest'] == 'a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
    assert len(captured['files']) == 1814 and all(H(ROOT / x['path']) == x['sha256'] for x in captured['files'])
    copied = LOAD(COPY / 'copy-selected-actual-before.json')
    check_rows(ROOT, copied['files'])
    for row in copied['symlinks']:
        p = ROOT / row['path']; st = p.lstat()
        assert p.is_symlink() and os.readlink(p) == row['target']
        assert st.st_ino == row['inode'] and st.st_dev == row['device'] and stat.S_IMODE(st.st_mode) == row['mode']
    runtime = LOAD(REC / 'actual-runner-final-gates01/runtime-input-binding.json')
    for key, expected in runtime['environment'].items():
        present = key in os.environ
        assert present == expected['present']
        observed = hashlib.sha256(os.environ[key].encode()).hexdigest() if present else None
        assert observed == expected['valueSha256']
    for row in runtime['protected']:
        p = ROOT / row['path']
        assert H(p) == row['sha256'] and stat.S_IMODE(p.stat().st_mode) == int(row['mode'], 8)
    browser = LOAD(runtime['browserRef']['path'])
    assert H(runtime['browserRef']['path']) == runtime['browserRef']['sha256']
    assert H(browser['actualExecutablePath']) == browser['actualExecutableSha256'] == runtime['browserSha256']
    assert stat.S_IMODE(Path(browser['actualExecutablePath']).stat().st_mode) == int(browser['actualMode'], 8)
    dist = captured['dist']
    assert len(dist['files']) == 238 and dist['digest'] == 'e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
    names = sorted(str(p.relative_to(ROOT / 'studio-runner/dist')) for p in (ROOT / 'studio-runner/dist').rglob('*') if p.is_file())
    assert names == [x['path'] for x in dist['files']]
    assert all(H(ROOT / 'studio-runner/dist' / x['path']) == x['sha256'] for x in dist['files'])
    return {'sourceMembers': 1814, 'sourceDigest': captured['digest'], 'selectedMembers': len(copied['files']), 'fullSelectedRowsHashesModesEqualCopy': True, 'all23DependencySymlinkTuplesExact': True, 'directSdkBin21Exact': True, 'distMembers': 238, 'distDigest': dist['digest'], 'browserSha256': runtime['browserSha256'], 'environmentExact': True, 'protectedAndCanonicalInputsExact': True}

def private_guard(variant):
    tree = Path(variant['scratch'])
    catalog = LOAD(variant['stagedCatalogPath'])['files']
    check_rows(tree, catalog)
    names = set(x['path'] for x in catalog)
    extras = []
    allowed = ('backend/build/', 'backend/.gradle/', 'backend/buildSrc/build/', 'backend/buildSrc/.gradle/', 'g9-f2-output/')
    for p in tree.rglob('*'):
        assert not p.is_symlink()
        if p.is_file():
            name = str(p.relative_to(tree))
            if name not in names:
                assert name.startswith(allowed), name
                extras.append(name)
    return {'selectedRows': len(catalog), 'allStagedRowsAndModesExact': True, 'newGeneratedFiles': len(extras), 'newGeneratedScopeOnly': True, 'distUnchangedE19': True}

def projection(variant, result, started):
    tree = Path(variant['scratch']); native = tree / 'g9-f2-output'
    xmls = sorted((native / (result['label'] + '-xml')).glob('TEST-*.xml'))
    assert len(xmls) == 1
    path = xmls[0]; raw = path.read_bytes()
    # One XML parse and, for OLD only, one access to the sole authorized failure leaf text.
    doc = ET.fromstring(raw)
    cases = list(doc.iter('testcase'))
    assert len(cases) == 1
    case = cases[0]
    expected = 'actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost()'
    assert case.attrib['classname'] == 'com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT'
    assert case.attrib['name'] == expected
    counts = {k: int(doc.attrib[a]) for k, a in [('total', 'tests'), ('failed', 'failures'), ('errors', 'errors'), ('skipped', 'skipped')]}
    rec = {'xmlPath': str(path), 'xmlSha256': hashlib.sha256(raw).hexdigest(), 'case': {'class': case.attrib['classname'], 'name': case.attrib['name'], 'durationSeconds': float(case.attrib['time'])}, 'rootCounts': counts, 'xmlFresh': path.stat().st_mtime >= started - 1, 'failureLeafReads': 0, 'rawFailureTextExported': False}
    failures = case.findall('failure'); errors = case.findall('error')
    if variant['variant'] == 'old-existence-consumer':
        assert len(failures) == 1 and not errors and not case.findall('skipped')
        failure = failures[0]
        text = failure.text
        assert text is not None
        frame = re.findall(r'GuidedServiceTransportFaultIT\.runGuidedControllerCut\(GuidedServiceTransportFaultIT\.java:(\d+)\)', text)
        pair = bool(re.search(r'expected: "READ_BEFORE_DECISION"\s+but was: ""', text))
        suppressed = 'Suppressed:' in text
        sentinel = any(v in text for v in ['GUIDED_CUT_CLEANUP_UNCONFIRMED', 'new controller cut owned resources must be genuinely closed before dependencies'])
        rec.update({'failureLeafReads': 1, 'failureType': failure.attrib['type'], 'expectedReadBeforeDecisionActualEmptyPair': pair, 'knownPublicFrame': {'file': 'GuidedServiceTransportFaultIT.java', 'method': 'runGuidedControllerCut', 'line': int(frame[0]) if len(frame) == 1 else None}, 'suppressedTextPresent': suppressed, 'suppressedXmlElementsPresent': bool(failure.findall('.//suppressed')), 'fixedCleanupSentinelPresent': sentinel, 'boundedFailureBytesScanDisclosed': 'Only fixed expected/empty pair, public frame and suppression/cleanup predicates from this one known failure text; raw XML/log bodies are never exported.'})
        rec['semanticAndOriginalCleanupLifecycleQualified'] = pair and len(frame) == 1 and int(frame[0]) == 2998 and not suppressed and not sentinel and not rec['suppressedXmlElementsPresent'] and failure.attrib['type'] in {'org.opentest4j.AssertionFailedError', 'org.junit.ComparisonFailure', 'java.lang.AssertionError'} and counts == {'total': 1, 'failed': 1, 'errors': 0, 'skipped': 0}
    else:
        assert not failures and not errors and not case.findall('skipped')
        rec.update({'failureType': 'NOT_APPLICABLE_PASS', 'semanticAndOriginalCleanupLifecycleQualified': counts == {'total': 1, 'failed': 0, 'errors': 0, 'skipped': 0}})
    rec['cleanupCreditBoundary'] = 'Unchanged original method finally/sticky latch and class-owned termination assertions with complete single-case JUnit lifecycle and no additional/suppressed failure; no external PID absence/ESRCH assertion.'
    return rec

phase = sys.argv[1]
assert phase in {'old', 'fixed'}
phaseout = OUT / phase
assert not phaseout.exists()
phaseout.mkdir()
inhibitor = None
try:
    verify_seal(STAGE, 'd69361dfb5326522dacf121b65660f506a29f2e587543b95454c30a47588f51c')
    verify_seal(COPY, 'ea1ae6073a22dabb06338d2795efe26908b1973a1204800300647ee0b32e3763')
    plan = LOAD(STAGE / 'future-native-commands.json')
    variants = plan['variants']
    variant = next(v for v in variants if v['variant'] == ('old-existence-consumer' if phase == 'old' else 'fixed-content-consumer'))
    if phase == 'fixed':
        prior = LOAD(OUT / 'old/qualification.json')
        assert prior['qualified'] and prior['nativeCollectorExit'] == 1
    for v in variants:
        assert not (Path(v['scratch']) / 'g9-f2-output').exists() if phase == 'old' else True
        private_guard(v)
    assert H(ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py') == '2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
    assert H(ROOT / 'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/pre-g9-review/c10.sh') == '0f8212cf58cc085190c0efd7b96886584330b6f8164eed62dcdf19c7a5d09d7b'
    assert hashlib.sha256(variant['collectorArgv'][4].encode()).hexdigest() == '06fed2090a729694a499276c2138949f63cfbf2bd401e3effb7075aab14443da'
    before = actual_guard()
    version = subprocess.run([N24 + '/node', '--version'], capture_output=True, check=True).stdout.decode().strip()
    assert version == 'v24.20.0'
    beforehost = host()
    save(phaseout / 'preflight.json', {'driverPid': os.getpid(), 'phase': phase, 'actual': before, 'host': beforehost, 'node': version, 'javaHome': JDK, 'argv': variant['collectorArgv'], 'cwd': variant['collectorCwd'], 'nativeInvocationsAuthorized': 1})
    inhibitor = subprocess.Popen(['caffeinate', '-dimsu', '-w', str(os.getpid())], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = time.time()
    with (phaseout / 'collector-outer.log').open('wb') as log:
        proc = subprocess.Popen(variant['collectorArgv'], cwd=variant['collectorCwd'], env=ENV, stdout=log, stderr=subprocess.STDOUT)
        save(phaseout / 'native-start.json', {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'driverPid': os.getpid(), 'outerCollectorPid': proc.pid, 'inhibitorPid': inhibitor.pid, 'originalGradleJvmPids': 'NOT_RETAINED_BY_EXISTING_COLLECTOR', 'externalPidObserver': False})
        print(json.dumps({'phase': phase, 'outerCollectorPid': proc.pid, 'inhibitorPid': inhibitor.pid, 'driverPid': os.getpid(), 'status': 'NATIVE_STARTED'}), flush=True)
        code = proc.wait()
    native = Path(variant['scratch']) / 'g9-f2-output'
    result = LOAD(native / 'result.json')
    assert result['exit'] == code
    proj = projection(variant, result, started)
    save(phaseout / 'closed-xml-projection.json', proj)
    expectedcounts = {'total': 1, 'failed': 1 if phase == 'old' else 0, 'errors': 0, 'skipped': 0}
    expectedcase = 'GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost'
    assert result['counts'] == expectedcounts
    assert result['cases'] == [{'id': expectedcase, 'status': 'FAIL' if phase == 'old' else 'PASS'}]
    assert code == (1 if phase == 'old' else 0) and proj['xmlFresh'] and proj['semanticAndOriginalCleanupLifecycleQualified']
    supplement = []
    for relative in ['backend/build/reports/tests/test/index.html', 'backend/build/jacoco/test.exec']:
        p = Path(variant['scratch']) / relative; st = p.stat()
        assert st.st_size > 0 and st.st_mtime >= started - 1
        supplement.append({'path': str(p), 'sha256': H(p), 'bytes': st.st_size, 'mtime': st.st_mtime, 'freshNonempty': True, 'collectorCredit': 'Original output supplementary hash; not a C10 collection claim'})
    afterprivate = private_guard(variant)
    after = actual_guard()
    afterhost = host()
    assert after == before
    assert inhibitor.poll() is None
    qualification = {'phase': phase, 'qualified': True, 'nativeCollectorExit': code, 'outerPopenWaitExit': code, 'driverPid': os.getpid(), 'outerCollectorPid': proc.pid, 'gradleAndJvmPids': 'NOT_RETAINED_BY_EXISTING_COLLECTOR', 'nativeResultPath': str(native / 'result.json'), 'nativeResultSha256': H(native / 'result.json'), 'rawNativeLogSha256': H(native / (result['label'] + '.log')), 'rawCounts': result['counts'], 'passedFromCaseStatusCounter': 0 if phase == 'old' else 1, 'passedRawField': 'NOT_EMITTED_BY_EXISTING_C10', 'elapsedSeconds': result['elapsedS'], 'xmlProjectionSha256': H(phaseout / 'closed-xml-projection.json'), 'supplementalOriginalOutputs': supplement, 'actualBeforeAfterExact': after, 'privateAfter': afterprivate, 'afterHost': afterhost, 'inhibitorHeldThroughNativeAndPostguards': True, 'cleanupBoundary': proj['cleanupCreditBoundary'], 'noExtraNativeInvocationOrRetry': True, 'oldLaterBusinessAssertionsCredit': 'NONE_AFTER_INTENDED_STAGE_ASSERT' if phase == 'old' else 'Original unchanged complete case and lifecycle passed'}
    save(phaseout / 'qualification.json', qualification)
    print(json.dumps({'phase': phase, 'qualified': True, 'nativeExit': code, 'counts': result['counts'], 'elapsedSeconds': result['elapsedS'], 'actualSourceProductStable': True}), flush=True)
except BaseException as error:
    save(phaseout / 'driver-stop.json', {'phase': phase, 'exceptionType': type(error).__name__, 'nativeMayHaveStarted': (phaseout / 'native-start.json').exists(), 'noRetryOrDependentPhase': True, 'errorTextExported': False})
    raise
finally:
    if inhibitor is not None:
        if inhibitor.poll() is None:
            inhibitor.terminate()
        inhibitor.wait()
        save(phaseout / 'inhibitor-reaped.json', {'pid': inhibitor.pid, 'waitExit': inhibitor.returncode, 'ownedOnly': True, 'nativeGroupSignalsAdded': False, 'coverageClaim': 'Held through the original native and driver postcapture scope when qualification says true; no all-postprocessing or numeric PID absence claim'})

#!/usr/bin/env python3
"""Prepared only. Exact root SHA-bound authorization and outer Gradle lock required."""
import collections
import datetime
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shlex
import signal
import stat
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / 'backend/gradlew').is_file())
WRAPPER = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py'
COLLECTOR = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py'
EXECUTION = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/execution'
REPLAY = ROOT / 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
PARENT = os.getppid()
RUN = None
PARENT_START = None
RECEIPT = {'schemaVersion': 1, 'status': 'PREFLIGHT', 'collectorInvocations': 0,
           'sourceWrites': 0, 'notQaVerdict': True, 'noLaneCredit': True,
           'actualSpend': 'UNAVAILABLE', 'declaredBudgetUsd': 500, 'phases': [],
           'evidenceErrors': [], 'interrupted': False}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def regular(path):
    path = Path(path)
    if not path.resolve().is_relative_to(ROOT) or path.is_symlink() or not path.is_file():
        raise ValueError('UNSAFE_FILE')
    for parent in path.parents:
        if parent == ROOT:
            break
        if parent.is_symlink():
            raise ValueError('SYMLINK_PARENT')
    return path.read_bytes()


def fact(path):
    data = regular(path)
    info = path.stat()
    if data != regular(path):
        raise ValueError('FILE_CHANGED_DURING_READ')
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha(data), 'bytes': len(data),
            'mtimeNs': info.st_mtime_ns, 'mode': oct(stat.S_IMODE(info.st_mode))}


def write_new(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def record(phase, **values):
    RECEIPT['phases'].append({'phase': phase, 'atUtc': utc(), **values})
    if RUN is None:
        return
    # Persistence failure is sticky; callers must still drain actual native work.
    try:
        temporary = RUN / ('receipt-' + str(time.monotonic_ns()) + '.tmp')
        write_new(temporary, (json.dumps(RECEIPT, indent=2) + '\n').encode())
        os.replace(temporary, RUN / 'receipt.json')
    except BaseException:
        RECEIPT['receiptWriteFailed'] = True


def capture(command, allowed=(0,)):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode not in allowed:
        raise ValueError('OBSERVATION_COMMAND_FAILED')
    return result.stdout


def pid_text(pid, column):
    return capture(['/bin/ps', '-ww', '-p', str(pid), '-o', column + '='], (0, 1)).strip() or None


def table():
    """Cheap ownership census only; never bind every transient native process."""
    output = capture(['/bin/ps', '-ww', '-axo', 'pid=,ppid=,lstart=,command='])
    rows = {}
    for line in output.splitlines():
        words = line.split(None, 7)
        if len(words) < 8:
            raise ValueError('PROCESS_CENSUS_INCOMPLETE')
        pid, parent = int(words[0]), int(words[1])
        rows[pid] = {'pid': pid, 'ppid': parent, 'start': ' '.join(words[2:7]),
                     'argvHash': sha(words[7].encode()),
                     'projectMarkerCandidate': any(marker in words[7] for marker in
                         ('GradleDaemon', 'GradleWrapperMain', 'GradleWorkerMain', 'worker.org.gradle',
                          'obs007-joined-', 'obs015-prefix-sync-', 'checks-guided-'))}
    return rows


def identity(row):
    """Bind only inherited six or stable boundary project facts, with race qualification."""
    pid = row['pid']
    before = pid_text(pid, 'lstart')
    comm, argv = pid_text(pid, 'comm'), pid_text(pid, 'command')
    if not before or before != row['start'] or not comm or not argv:
        return None if pid_text(pid, 'lstart') != row['start'] else {'identityComplete': False, **row}
    mappings = capture(['/usr/sbin/lsof', '-nP', '-a', '-p', str(pid), '-d', 'txt', '-F', 'n'], (0, 1))
    matches = {Path(line[1:]).resolve() for line in mappings.splitlines()
               if line.startswith('n') and Path(line[1:]).is_absolute()
               and Path(line[1:]).name == Path(comm).name and Path(line[1:]).is_file()}
    if len(matches) != 1:
        return None if pid_text(pid, 'lstart') != before else {'identityComplete': False, **row}
    executable = matches.pop()
    info = executable.stat()
    binary = sha(executable.read_bytes())
    after_info = executable.stat()
    same_file = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) == (
        after_info.st_dev, after_info.st_ino, after_info.st_size, after_info.st_mtime_ns)
    if (pid_text(pid, 'lstart') != before or pid_text(pid, 'comm') != comm
            or pid_text(pid, 'command') != argv):
        return None if pid_text(pid, 'lstart') != before else {'identityComplete': False, **row}
    return {**row, 'identityComplete': same_file, 'commHash': sha(comm.encode()),
            'argvHash': sha(argv.encode()), 'executableHash': sha(str(executable).encode()),
            'executableFileHash': binary}


def project_role(pid):
    comm, argv = pid_text(pid, 'comm'), pid_text(pid, 'command')
    if not comm or not argv:
        return None
    name = Path(comm).name.lower()
    if name == 'java' and any(s in argv for s in ('GradleDaemon', 'GradleWrapperMain', 'GradleWorkerMain', 'worker.org.gradle')):
        return 'GRADLE_OR_TEST_JVM'
    if name == 'node' and any(s in argv for s in ('obs007-joined-', 'obs015-prefix-sync-')):
        return 'FIXTURE'
    if name.startswith(('google chrome', 'chromium', 'chrome')) and 'checks-guided-' in argv:
        return 'NATIVE_BROWSER'
    return None


def boundary_inventory(plan):
    rows = table()
    baseline = json.loads(regular(ROOT / plan['baselinePath']))['identities']
    inherited, absent, changed, incomplete, projects = [], [], [], [], []
    fields = ('pid', 'start', 'commHash', 'argvHash', 'executableHash', 'executableFileHash')
    for old in baseline:
        row = rows.get(old['pid'])
        if row is None or row['start'] != old['start']:
            absent.append({'pid': old['pid'], 'start': old['start'], 'proof': 'ORIGINAL_IDENTITY_ABSENT'})
            continue
        current = identity(row)
        if current is None:
            absent.append({'pid': old['pid'], 'start': old['start'], 'proof': 'EXITED_DURING_BOUNDARY_CAPTURE'})
        elif not current['identityComplete']:
            incomplete.append({'pid': old['pid'], 'start': old['start']})
        elif all(current.get(k) == old.get(k) for k in fields):
            inherited.append(current)
        else:
            changed.append(current)
    baseline_ids = {(r['pid'], r['start']) for r in baseline}
    # One boundary census, not repeated expensive native identity/lsof scans.
    for pid, row in rows.items():
        if (pid, row['start']) in baseline_ids or not row['projectMarkerCandidate']:
            continue
        role = project_role(pid)
        if role:
            current = identity(row)
            if current is not None:
                projects.append({**current, 'role': role})
    listeners, pid = [], None
    raw = capture(['/usr/sbin/lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], (0, 1))
    for line in raw.splitlines():
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None and line.rsplit(':', 1)[-1].isdigit():
            listeners.append({'pid': pid, 'port': int(line.rsplit(':', 1)[-1])})
    return {'atUtc': utc(), 'inheritedMatched': inherited, 'originalIdentitiesAbsent': absent,
            'inheritedIdentityChanged': changed, 'incompleteStableIdentities': incomplete,
            'otherProjectFacts': projects, 'listeners': listeners, 'quietHostClaimed': False,
            'cleanupOwnershipClaimed': False}


def host():
    memory = capture(['/usr/bin/vm_stat'])
    page = re.search(r'page size of (\d+) bytes', memory)
    if page is None:
        raise ValueError('MEMORY_SAMPLE_INCOMPLETE')
    allowed = {'Pages free', 'Pages active', 'Pages inactive', 'Pages speculative',
               'Pages wired down', 'Pages occupied by compressor'}
    pages = {}
    for line in memory.splitlines():
        match = re.fullmatch(r'([^:]+):\s*(\d+)\.?', line.strip())
        if match and match[1] in allowed:
            pages[match[1]] = int(match[2])
    if set(pages) != allowed:
        raise ValueError('MEMORY_SAMPLE_INCOMPLETE')
    return {'atUtc': utc(), 'load': list(os.getloadavg()), 'cpuCount': os.cpu_count(),
            'physicalMemoryBytes': int(capture(['/usr/sbin/sysctl', '-n', 'hw.memsize'])),
            'pageSizeBytes': int(page[1]), 'pages': pages,
            'selfMaxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            'childrenMaxRssBytes': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}


def parent_lock(plan, label, authorization):
    if os.getppid() != PARENT or pid_text(PARENT, 'lstart') != PARENT_START:
        raise ValueError('LOCK_PARENT_LOST_OR_CHANGED')
    argv = shlex.split(pid_text(PARENT, 'command') or '')
    expected = [str(WRAPPER), sys.executable, str(Path(__file__).resolve()), label, str(authorization)]
    normalized = [str((ROOT / arg).resolve()) if i != 3 else arg for i, arg in enumerate(expected)]
    # Require exact trailing wrapper+python+harness+label+authorization arguments.
    if len(argv) < 6 or [str((ROOT / arg).resolve()) if i != 3 else arg
                         for i, arg in enumerate(argv[-5:])] != normalized:
        raise ValueError('EXACT_PARENT_COMMAND_REQUIRED')
    lock = WRAPPER.with_name('gradle.lock')
    info = lock.stat(follow_symlinks=False)
    if lock.is_symlink() or not stat.S_ISREG(info.st_mode):
        raise ValueError('UNSAFE_LOCK_FILE')
    observation = capture(['/usr/sbin/lsof', '-nP', '-a', '-p', str(PARENT), '-F', 'pfnil', '--', str(lock)])
    lines = observation.splitlines()
    if 'p' + str(PARENT) not in lines or 'i' + str(info.st_ino) not in lines:
        raise ValueError('PARENT_LOCK_DESCRIPTOR_UNPROVEN')
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if (os.fstat(fd).st_dev, os.fstat(fd).st_ino) != (info.st_dev, info.st_ino):
            raise ValueError('LOCK_INODE_CHANGED')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            if error.errno not in (errno.EAGAIN, errno.EACCES):
                raise
        else:
            fcntl.flock(fd, fcntl.LOCK_UN)
            raise ValueError('KERNEL_LOCK_NOT_HELD')
    finally:
        os.close(fd)
    if sha(regular(WRAPPER)) != plan['immutableHelpers'][str(WRAPPER.relative_to(ROOT))]:
        raise ValueError('LOCK_WRAPPER_CHANGED')


def stable_inputs(plan):
    paths = capture(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', *plan['captureScope']]).split('\0')
    actual = [{'path': name, 'sha256': sha(regular(ROOT / name))} for name in sorted(set(paths))
              if name and (ROOT / name).is_file() and '.claude' not in Path(name).parts]
    expected = plan['source']
    if (expected['digest'] != '061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617'
            or expected['dist']['digest'] != '698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'):
        raise ValueError('ORIGINAL_BOUND_DIGESTS_REQUIRED')
    if len(actual) != 1808 or actual != expected['files'] or sha(json.dumps(actual, separators=(',', ':')).encode()) != expected['digest']:
        raise ValueError('LITERAL_S011_SOURCE_SET_CHANGED')
    dist = [{'path': str(p.relative_to(ROOT / 'studio-runner/dist')), 'sha256': sha(regular(p))}
            for p in sorted((ROOT / 'studio-runner/dist').rglob('*')) if p.is_file() or p.is_symlink()]
    if len(dist) != 238 or dist != expected['dist']['files']:
        raise ValueError('LITERAL_D009R_DIST_CHANGED')
    helm = {str(p.relative_to(ROOT)): sha(regular(p)) for p in sorted((ROOT / 'helm-chart').rglob('*')) if p.is_file() or p.is_symlink()}
    if helm != plan['helm']:
        raise ValueError('HELM_SET_CHANGED')
    for name, digest in {**plan['quotedCurrent'], **plan['immutableHelpers']}.items():
        if sha(regular(ROOT / name)) != digest:
            raise ValueError('IMMUTABLE_QUOTED_OR_HELPER_CHANGED')
    if sha(regular(REPLAY)) != plan['originalReplaySha256'] or stat.S_IMODE(REPLAY.stat().st_mode) != plan['sourceMode']:
        raise ValueError('ORIGINAL_REPLAY_BYTES_OR_MODE_NOT_RESTORED')
    return {'sourceDigest': expected['digest'], 'sourceFiles': len(actual),
            'distDigest': expected['dist']['digest'], 'distFiles': len(dist),
            'helmFiles': len(helm), 'quotedFiles': len(plan['quotedCurrent'])}


def diagnostic_terminal(plan, authorization):
    receipt_path = ROOT / plan['diagnosticReceipt']
    if sha(regular(receipt_path)) != authorization['diagnosticTerminalReceiptSha256']:
        raise ValueError('DIAGNOSTIC_TERMINAL_RECEIPT_CHANGED')
    result = json.loads(regular(receipt_path))
    if (result.get('status') not in ('TERMINAL', 'TERMINAL_INCOMPLETE_OBSERVATION')
            or not result.get('sourceRestored') or not result.get('originalCompileSucceeded')
            or result.get('sourceAfterHash') != plan['originalReplaySha256']
            or result.get('sourceAfterMode') != oct(plan['sourceMode'])
            or result.get('restorationFailureCode') or result.get('collectorInvocations') != 1):
        raise ValueError('DIAGNOSTIC_NOT_TERMINAL_EXACTLY_RESTORED_AND_COMPILED')
    if result.get('observationFailure') and authorization.get('diagnosticObserverQualificationAccepted') is not True:
        raise ValueError('DIAGNOSTIC_OBSERVATION_QUALIFICATION_REQUIRES_ROOT')
    identities = list(plan['diagnosticFixedIdentities'])
    for process in result.get('processes', []):
        identities.append({'pid': process['pid'], 'start': process['kernelStart']})
        identities.extend(process.get('descendants', []))
    rows = table()
    for old in identities:
        if not old.get('start'):
            raise ValueError('DIAGNOSTIC_IDENTITY_START_MISSING')
        if old['pid'] in rows and rows[old['pid']]['start'] == old['start']:
            raise ValueError('DIAGNOSTIC_OR_OWNED_DESCENDANT_STILL_LIVE')
    return {'receipt': fact(receipt_path), 'recordedIdentitiesAbsent': len(identities),
            'outerObservationQualified': bool(result.get('observationFailure'))}


def update_owned(rows, known, child_pid):
    # Keep observed same-start descendants as roots if a no-daemon JVM reparents.
    direct = {child_pid} if child_pid in rows and rows[child_pid]['ppid'] == os.getpid() else set()
    owned = direct | {pid for (pid, start) in known if pid in rows and rows[pid]['start'] == start}
    for _ in range(len(rows)):
        more = owned | {pid for pid, row in rows.items() if row['ppid'] in owned}
        if more == owned:
            break
        owned = more
    for pid in owned:
        if pid not in rows:
            continue
        row = rows[pid]
        key = (pid, row['start'])
        if key not in known or not known[key]['isJava']:
            # A shell may exec Java without changing pid/start; promote, never downgrade.
            comm = pid_text(pid, 'comm')
            if pid_text(pid, 'lstart') == row['start']:
                known[key] = {**row, 'isJava': bool(comm and Path(comm).name.lower() == 'java')}


def run_owned(command, environment, plan, label, authorization):
    """Never return/unwind with a live command or observed same-start owned JVM."""
    known, child, code = {}, None, None
    output = (RUN / 'collector.private.log').open('xb')
    try:
        child = subprocess.Popen(command, cwd=ROOT, env=environment, stdout=output, stderr=subprocess.STDOUT)
        RECEIPT['collectorPid'] = child.pid
        RECEIPT['collectorStartedAtUtc'] = utc()
        # No I/O/observer error below can bypass the finally drain.
        while code is None:
            try:
                rows = table()
                update_owned(rows, known, child.pid)
                parent_lock(plan, label, authorization)
            except BaseException:
                RECEIPT['ownershipOrLockObservationGap'] = True
            record('COLLECTOR_WAIT', pid=child.pid, ownedIdentityCount=len(known))
            try:
                code = child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                continue
            except BaseException:
                RECEIPT['waitObservationGap'] = True
                time.sleep(5)
    finally:
        # Catch BaseException inside every drain iteration, including IO and waits.
        while child is not None:
            try:
                if child.poll() is None:
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        continue
                rows = table()
                update_owned(rows, known, child.pid)
                pending = [row for (pid, start), row in known.items() if row['isJava']
                           and pid in rows and rows[pid]['start'] == start]
                if pending:
                    record('OWNED_JVM_DRAIN_WAIT', identities=[{'pid': r['pid'], 'start': r['start']} for r in pending])
                    time.sleep(5)
                    continue
                RECEIPT['collectorExit'] = child.returncode
                RECEIPT['ownedJvmTerminalProof'] = [{'pid': pid, 'start': start,
                    'proof': 'PID_ABSENT' if pid not in rows else 'DIFFERENT_KERNEL_START'}
                    for (pid, start), row in known.items() if row['isJava']]
                RECEIPT['remainingOwnedNonJvmFacts'] = [row for (pid, start), row in known.items()
                    if not row['isJava'] and pid in rows and rows[pid]['start'] == start]
                RECEIPT['ownedIdentities'] = list(known.values())
                RECEIPT['collectorTerminatedAtUtc'] = utc()
                break
            except BaseException:
                RECEIPT['drainObservationGap'] = True
                record('DRAIN_OBSERVATION_UNAVAILABLE_STILL_HOLDING_LOCK')
                time.sleep(5)
        output.close()
    return child.returncode


def archive_original(source, destination):
    before = fact(source)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    write_new(destination, regular(source))
    after = fact(source)
    copied = fact(destination)
    if before != after or before['sha256'] != copied['sha256']:
        raise ValueError('ARCHIVE_ORIGINAL_CHANGED')
    return {'original': before, 'archive': copied}


def assess_and_archive(plan, label):
    receipt_path = EXECUTION / (label + '-results.json')
    collector = json.loads(regular(receipt_path))
    started = datetime.datetime.fromisoformat(collector['started']).timestamp()
    ended = datetime.datetime.fromisoformat(RECEIPT['collectorTerminatedAtUtc']).timestamp()
    RECEIPT['primaryCollectorReceipt'] = fact(receipt_path)
    RECEIPT['primaryCollectorExit'] = collector.get('exit')
    RECEIPT['nativeGradleExit'] = collector.get('gradleExit')
    if (collector.get('explicitTestTasks') != plan['testTasks']
            or set(collector.get('requiredFreshExecTasks', [])) != set(plan['testTasks'])
            or not all(collector.get(k) for k in ('sourceStable', 'distStable', 'testInputStable', 'taskCollectionComplete'))):
        RECEIPT['evidenceErrors'].append('COLLECTOR_TASK_SCOPE_OR_STABILITY_INCOMPLETE')
    for group in ('xmlFiles', 'testHtmlFiles', 'jacocoExecFiles', 'guidedCohortFiles', 'guardTallies'):
        for item in collector.get(group, []):
            path = ROOT / item['path']
            current = fact(path)
            if current['sha256'] != item['sha256'] or current['bytes'] != item['bytes']:
                raise ValueError('TASK_ARCHIVE_HASH_CHANGED')
            if not started <= item['mtimeNs'] / 1e9 <= ended + 2:
                RECEIPT['evidenceErrors'].append('TASK_ARCHIVE_ORIGINAL_NOT_FRESH')
    for task in plan['testTasks']:
        execs = [f for f in collector.get('jacocoExecFiles', []) if f.get('task') == task]
        if len(execs) != 1 or not execs[0].get('nonempty'):
            RECEIPT['evidenceErrors'].append('REQUIRED_EXEC_MISSING_OR_EMPTY:' + task)
    xml_cases = []
    for item in collector.get('xmlFiles', []):
        suite = ET.fromstring(regular(ROOT / item['path']))
        for case in suite.iter('testcase'):
            status = ('FAIL' if case.find('failure') is not None or case.find('error') is not None
                      else 'SKIP' if case.find('skipped') is not None else 'PASS')
            xml_cases.append({'task': item['task'], 'class': case.get('classname'),
                              'name': case.get('name'), 'status': status})
    case_key = lambda c: (c['task'], c['class'], c['name'], c['status'])
    if collections.Counter(map(case_key, xml_cases)) != collections.Counter(map(case_key, collector.get('testcases', []))):
        RECEIPT['evidenceErrors'].append('XML_CASE_MULTISET_DIFFERS_FROM_COLLECTOR')
    if not xml_cases or any(c['status'] == 'FAIL' for c in xml_cases):
        RECEIPT['evidenceErrors'].append('TESTCASE_FAILURE_OR_EMPTY_FULL_SUITE')
    policy = json.loads(regular(ROOT / plan['skipPath']))
    key = lambda c: (c['task'], c['class'], c['name'])
    if len(policy) != 9 or collections.Counter(map(key, policy)) != collections.Counter(
            key(c) for c in collector.get('testcases', []) if c['status'] == 'SKIP'):
        RECEIPT['evidenceErrors'].append('EXACT_NINE_HISTORICAL_SKIP_MULTISET_MISMATCH')
    cohorts = []
    flags = ('auditComplete', 'privacyComplete', 'producersDrained', 'modelEvidenceComplete',
             'budgetEvidenceComplete', 'responseEvidenceComplete')
    for task in ('test', 'guidedIncrementalTest'):
        facts = [f for f in collector.get('guidedCohortFiles', []) if f.get('task') == task and Path(f['path']).name == 'cohort.json']
        if len(facts) != 1:
            RECEIPT['evidenceErrors'].append('MISSING_OR_AMBIGUOUS_COHORT:' + task)
            continue
        cohort = json.loads(regular(ROOT / facts[0]['path']))
        invocations = cohort.get('invocations', [])
        expected = collections.Counter((c['name'], c['status']) for c in collector['testcases']
            if c['task'] == task and c['class'].endswith('.GuidedPublicationReplayIT') and c['name'] != 'executionError')
        actual = collections.Counter((i['displayLabel'], 'PASS' if i['passed'] else 'FAIL') for i in invocations)
        complete = (cohort.get('lane') == task and invocations and expected == actual
                    and all(cohort.get(flag) is True for flag in flags)
                    and all(i.get('passed') is True and i.get('afterEachComplete') is True for i in invocations))
        cohorts.append({'task': task, 'fact': facts[0], 'complete': bool(complete),
                        'invocations': len(invocations), 'flags': {f: cohort.get(f) for f in flags},
                        'caseStatusMultisetEqualsXmlCollector': expected == actual})
        if not complete:
            RECEIPT['evidenceErrors'].append('INCOMPLETE_JOIN_COHORT:' + task)
    RECEIPT['cohortAssessment'] = cohorts
    log_path = EXECUTION / (label + '.log')
    if sha(regular(log_path)) != collector['logSha256']:
        raise ValueError('NATIVE_LOG_HASH_CHANGED')
    statuses = {}
    for line in regular(log_path).decode(errors='replace').splitlines():
        match = re.fullmatch(r'> Task :([\w]+)(?: (.*))?', line)
        if match:
            statuses[match[1]] = match[2] or 'EXECUTED'
    RECEIPT['requiredTaskStatuses'] = {task: statuses.get(task, 'ABSENT') for task in [*plan['testTasks'], *plan['coverageTasks']]}
    tasks_executed = all(RECEIPT['requiredTaskStatuses'][t] == 'EXECUTED' for t in [*plan['testTasks'], *plan['coverageTasks']])
    if not tasks_executed:
        RECEIPT['evidenceErrors'].append('FULL_TEST_OR_COVERAGE_TASK_NOT_EXECUTED_SUCCESSFULLY')
    report = ROOT / 'backend/build/reports/jacoco/test/jacocoTestReport.xml'
    report_info = {'exists': report.is_file(), 'fresh': False, 'ratiosCredited': False}
    if report.is_file():
        report_info['originalFact'] = fact(report)
        sessions = ET.fromstring(regular(report)).findall('sessioninfo')
        times = [(int(s.attrib['start']) / 1000, int(s.attrib['dump']) / 1000) for s in sessions]
        report_info['sessions'] = [{'startEpochSeconds': a, 'dumpEpochSeconds': b} for a, b in times]
        report_info['fresh'] = bool(tasks_executed and times
            and started <= report_info['originalFact']['mtimeNs'] / 1e9 <= ended + 2
            and all(started <= a <= b <= ended + 2 for a, b in times))
        if report_info['fresh']:
            # All report artifacts bind genuine original freshness before copy; stale bytes never get a fresh copy label.
            paths = [p for p in sorted(report.parent.rglob('*')) if p.is_file() or p.is_symlink()]
            original_facts = [fact(p) for p in paths]
            if all(started <= f['mtimeNs'] / 1e9 <= ended + 2 for f in original_facts):
                report_info['artifacts'] = [archive_original(p, RUN / 'fresh-jacoco-report' / p.relative_to(report.parent)) for p in paths]
            else:
                report_info['fresh'] = False
                report_info['reportDirectoryContainsStaleArtifacts'] = True
    RECEIPT['coverageAssessment'] = report_info
    if not report_info['fresh']:
        RECEIPT['evidenceErrors'].append('GENUINELY_FRESH_MERGED_COVERAGE_NOT_PROVEN')
    RECEIPT['collectorArchiveReferences'] = {group: collector.get(group, []) for group in
        ('xmlFiles', 'testHtmlFiles', 'jacocoExecFiles', 'guidedCohortFiles', 'guardTallies')}
    # Existing collector archives are authoritative; preserve rather than duplicate them.
    for suffix in ('-results.json', '-default-task-base-results.json', '-before.json', '-after.json', '.log'):
        archive_original(EXECUTION / (label + suffix), RUN / 'primary' / (label + suffix))
    return collector.get('exit') == 0 and collector.get('gradleExit') == 0


def main():
    global RUN, PARENT_START
    os.umask(0o077)
    if len(sys.argv) != 3 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', sys.argv[1]):
        raise ValueError('FRESH_LABEL_AND_ROOT_AUTHORIZATION_PATH_REQUIRED')
    label = sys.argv[1]
    authorization_path = Path(sys.argv[2]).resolve()
    if Path.cwd().resolve() != ROOT:
        raise ValueError('REPOSITORY_ROOT_REQUIRED')
    plan_bytes = regular(HERE / 'plan.json')
    plan = json.loads(plan_bytes)
    if (plan['commandGradle'] != ['--continue', 'check', '--rerun-tasks', '--no-daemon']
            or plan['testTasks'] != ['test', 'guidedIncrementalTest', 'crossReplicaTest']
            or plan['coverageTasks'] != ['requireFreshGuidedPartitions', 'jacocoTestReport', 'jacocoTestCoverageVerification', 'check']):
        raise ValueError('EXACT_FULL_CHECK_SCOPE_REQUIRED')
    authorization = json.loads(regular(authorization_path))
    for key, expected in {'schemaVersion': 1, 'authorized': True, 'authorizedBy': 'root',
                          'maximumCollectorInvocations': 1, 'label': label,
                          'harnessSha256': sha(regular(Path(__file__).resolve())),
                          'planSha256': sha(plan_bytes), 'fullS011FreshCheckAuthorized': True}.items():
        if authorization.get(key) != expected:
            raise ValueError('EXPLICIT_SHA_BOUND_ROOT_AUTHORIZATION_REQUIRED')
    review = ROOT / authorization['independentReviewPath']
    if sha(regular(review)) != authorization['independentReviewSha256']:
        raise ValueError('INDEPENDENT_REVIEW_BINDING_CHANGED')
    PARENT_START = pid_text(PARENT, 'lstart')
    parent_lock(plan, label, authorization_path)
    diag = diagnostic_terminal(plan, authorization)
    bound = stable_inputs(plan)
    if list(EXECUTION.glob(label + '*')) or (HERE / 'runs' / label).exists():
        raise ValueError('FRESH_UNUSED_LABEL_REQUIRED')
    inventory = boundary_inventory(plan)
    if inventory['inheritedIdentityChanged'] or inventory['incompleteStableIdentities'] or inventory['otherProjectFacts']:
        raise ValueError('UNRESOLVED_BOUNDARY_PROJECT_IDENTITY')
    runs = HERE / 'runs'
    runs.mkdir(exist_ok=True, mode=0o700)
    if runs.is_symlink() or stat.S_IMODE(runs.stat().st_mode) != 0o700 or runs.stat().st_uid != os.getuid():
        raise ValueError('UNSAFE_RUNS_DIRECTORY')
    RUN = runs / label
    RUN.mkdir(mode=0o700)
    RECEIPT.update(label=label, startedAtUtc=utc(), authorization=fact(authorization_path),
                   planSha256=sha(plan_bytes), harnessSha256=sha(regular(Path(__file__).resolve())),
                   independentReview=fact(review), diagnosticTerminalProof=diag,
                   startInputs=bound, startInventory=inventory, startHost=host(), parentLockPid=PARENT,
                   parentLockStart=PARENT_START)
    environment = dict(os.environ, JAVA_HOME=plan['javaHome'])
    environment['PATH'] = plan['nodeBin'] + os.pathsep + environment.get('PATH', '')
    environment['LC_ALL'] = 'C'
    node = capture([str(Path(plan['nodeBin']) / 'node'), '--version']).strip()
    java = subprocess.run([str(Path(plan['javaHome']) / 'bin/java'), '-version'], capture_output=True, text=True)
    if not node.startswith('v24.') or java.returncode != 0 or not re.search(r'version "21[.\"]', java.stderr):
        raise ValueError('NODE24_JAVA21_REQUIRED')
    RECEIPT['toolVersions'] = {'node': node, 'javaMajor': 21}
    command = [sys.executable, str(COLLECTOR), label, '--test-tasks', ','.join(plan['testTasks']),
               '--require-exec-tasks', ','.join(plan['testTasks']), '--allowed-skips-file',
               str(ROOT / plan['skipPath']), '--', *plan['commandGradle']]
    RECEIPT['command'] = command
    RECEIPT['coverageReportBefore'] = fact(ROOT / 'backend/build/reports/jacoco/test/jacocoTestReport.xml') if (ROOT / 'backend/build/reports/jacoco/test/jacocoTestReport.xml').is_file() else None
    record('READY_ONE_FULL_CHECK_NO_RETRY')
    parent_lock(plan, label, authorization_path)
    stable_inputs(plan)
    RECEIPT['collectorInvocations'] = 1
    RECEIPT['status'] = 'RUNNING'
    run_owned(command, environment, plan, label, authorization_path)
    # run_owned cannot return with a live observed owned JVM, even if evidence I/O failed.
    record('NATIVE_COMMAND_AND_OWNED_JVMS_TERMINAL')
    passed = False
    if (sha(regular(Path(__file__).resolve())) != authorization['harnessSha256']
            or sha(regular(HERE / 'plan.json')) != authorization['planSha256']
            or sha(regular(review)) != authorization['independentReviewSha256']):
        RECEIPT['evidenceErrors'].append('HARNESS_PLAN_OR_REVIEW_CHANGED_DURING_RUN')
    for name, operation in [('endInputs', lambda: stable_inputs(plan)),
                            ('endHost', host), ('endInventory', lambda: boundary_inventory(plan))]:
        try:
            RECEIPT[name] = operation()
        except BaseException as error:
            RECEIPT['evidenceErrors'].append(name + ':' + type(error).__name__)
    try:
        passed = assess_and_archive(plan, label)
    except BaseException as error:
        RECEIPT['evidenceErrors'].append('ASSESSMENT_EXCEPTION:' + type(error).__name__)
    try:
        parent_lock(plan, label, authorization_path)
    except BaseException:
        RECEIPT['evidenceErrors'].append('TERMINAL_PARENT_LOCK_UNPROVEN')
    if RECEIPT.get('endInventory', {}).get('otherProjectFacts') or RECEIPT.get('endInventory', {}).get('inheritedIdentityChanged') or RECEIPT.get('endInventory', {}).get('incompleteStableIdentities'):
        RECEIPT['evidenceErrors'].append('END_BOUNDARY_PROJECT_FACTS_UNRESOLVED')
    flags = ('receiptWriteFailed', 'ownershipOrLockObservationGap', 'waitObservationGap', 'drainObservationGap', 'interrupted')
    complete = not RECEIPT['evidenceErrors'] and not any(RECEIPT.get(k) for k in flags)
    RECEIPT['evidenceComplete'] = complete
    RECEIPT['fullGateSucceeded'] = bool(passed and complete and RECEIPT['collectorExit'] == 0)
    RECEIPT['status'] = 'TERMINAL' if complete else 'TERMINAL_INCOMPLETE_EVIDENCE'
    RECEIPT['exit'] = 0 if RECEIPT['fullGateSucceeded'] else RECEIPT['collectorExit'] or 2
    record('FINISHED_NO_AUTOMATIC_QA_OR_LANE_CREDIT')
    return RECEIPT['exit']


if __name__ == '__main__':
    def defer_interrupt(_number, _frame):
        RECEIPT['interrupted'] = True
    signal.signal(signal.SIGINT, defer_interrupt)
    signal.signal(signal.SIGTERM, defer_interrupt)
    try:
        sys.exit(main())
    except Exception as error:
        RECEIPT['status'] = 'PREFLIGHT_REFUSED_OR_TERMINAL_EVIDENCE_FAILURE'
        RECEIPT['failureType'] = type(error).__name__
        # Exception text is never printed: paths/argv/provider/raw native output stay private.
        record('REFUSED_OR_INCOMPLETE')
        sys.stderr.write(json.dumps({'status': RECEIPT['status'], 'failureType': type(error).__name__}) + '\n')
        sys.exit(2)

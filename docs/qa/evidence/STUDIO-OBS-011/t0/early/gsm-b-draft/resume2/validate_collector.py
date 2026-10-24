"""GSMb fresh collector assessment only; imported without IO."""
from collections import Counter
import datetime
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from driver_support import file_state, safe_path


def validate(root, execution, label, classes, tasks, expected_cases, child_exit, ended_epoch):
    path = safe_path(root, execution / (label + '-results.json'))
    snapshot = file_state(path)
    if snapshot is None:
        raise ValueError('COLLECTOR_RECEIPT_MISSING')
    result = json.loads(snapshot['bytes'])
    started = datetime.datetime.fromisoformat(result['started']).timestamp()
    failures = []
    if child_exit != 0 or result.get('exit') != 0 or result.get('gradleExit') != 0:
        failures.append('NONZERO_COLLECTOR_OR_NATIVE')
    if result.get('explicitTestTasks') != tasks or set(result.get('requiredFreshExecTasks', [])) != set(tasks):
        failures.append('TASK_SCOPE_NOT_COMPLETE')
    for key in ['sourceStable', 'distStable', 'testInputStable', 'taskCollectionComplete']:
        if result.get(key) is not True:
            failures.append('INCOMPLETE_' + key)
    wanted = Counter((c['task'], c['class'], c['name']) for c in expected_cases
                     if c['class'] in classes and c['task'] in tasks)
    cases = result.get('testcases', [])
    found = Counter((c['task'], c['class'], c['name']) for c in cases)
    if not wanted or wanted != found or any(c.get('status') != 'PASS' for c in cases):
        failures.append('DISCOVERY_OR_TEST_STATUS_MISMATCH')
    counts = result.get('counts', {})
    if (counts.get('total') != len(cases) or counts.get('passed') != len(cases)
            or any(counts.get(k) != 0 for k in ['failed', 'errors', 'skipped'])):
        failures.append('COLLECTOR_CASE_COUNTS_NOT_COMPLETE_PASS')
    xml_cases = []
    for group in ['xmlFiles', 'testHtmlFiles', 'jacocoExecFiles', 'guidedCohortFiles', 'guardTallies']:
        for entry in result.get(group, []):
            current = file_state(safe_path(root, entry['path']))
            if (current is None or current['sha256'] != entry['sha256']
                    or len(current['bytes']) != entry['bytes']
                    or current['mtimeNs'] != entry['mtimeNs']
                    or entry.get('mode') is not None and oct(current['mode']) != entry['mode']
                    or not started <= entry['mtimeNs'] / 1e9 <= ended_epoch + 2):
                raise ValueError('ARCHIVE_HASH_SIZE_OR_ORIGINAL_FRESHNESS_INVALID')
            if group == 'xmlFiles':
                suite = ET.fromstring(current['bytes'])
                for case in suite.iter('testcase'):
                    status = ('FAIL' if case.find('failure') is not None or case.find('error') is not None
                              else 'SKIP' if case.find('skipped') is not None else 'PASS')
                    xml_cases.append((entry['task'], case.get('classname'), case.get('name'), status))
    actual = Counter((c['task'], c['class'], c['name'], c['status']) for c in cases)
    if Counter(xml_cases) != actual:
        failures.append('FRESH_XML_MULTISET_MISMATCH')
    for task in tasks:
        fresh_exec = [e for e in result.get('jacocoExecFiles', []) if e.get('task') == task]
        if len(fresh_exec) != 1 or not fresh_exec[0].get('nonempty'):
            failures.append('REQUIRED_FRESH_EXEC_INCOMPLETE:' + task)
    log = file_state(safe_path(root, execution / (label + '.log')))
    if log is None or log['sha256'] != result.get('logSha256'):
        raise ValueError('NATIVE_LOG_HASH_NOT_MATCHED')
    statuses = {}
    for line in log['bytes'].decode(errors='replace').splitlines():
        match = re.fullmatch(r'> Task :([\w]+)(?: (.*))?', line)
        if match:
            statuses[match[1]] = match[2] or 'EXECUTED'
    if any(statuses.get(task) != 'EXECUTED' for task in tasks):
        failures.append('SELECTED_TEST_TASK_NOT_EXECUTED_SUCCESSFULLY')
    if 'guidedIncrementalTest' in tasks:
        flags = ['auditComplete', 'privacyComplete', 'producersDrained', 'modelEvidenceComplete',
                 'budgetEvidenceComplete', 'responseEvidenceComplete']
        for task in tasks:
            cohorts = [e for e in result.get('guidedCohortFiles', [])
                       if e.get('task') == task and Path(e['path']).name == 'cohort.json']
            if len(cohorts) != 1:
                failures.append('COHORT_MISSING_OR_AMBIGUOUS:' + task)
                continue
            cohort = json.loads(file_state(safe_path(root, cohorts[0]['path']))['bytes'])
            invocations = cohort.get('invocations', [])
            expected = Counter((c['name'], c['status']) for c in cases if c['task'] == task)
            actual = Counter((i['displayLabel'], 'PASS' if i['passed'] else 'FAIL') for i in invocations)
            if (not invocations or cohort.get('lane') != task or expected != actual
                    or any(cohort.get(flag) is not True for flag in flags)
                    or any(i.get('passed') is not True or i.get('afterEachComplete') is not True for i in invocations)):
                failures.append('COHORT_NOT_COMPLETE:' + task)
    return {'validatedComplete': not failures, 'failures': failures,
            'collectorReceiptSha256': snapshot['sha256'], 'expectedCases': sum(wanted.values()),
            'actualCases': len(cases), 'nativeTasks': {task: statuses.get(task) for task in tasks},
            'redVerdict': 'UNASSESSED_REQUIRES_EXACT_NEW_ASSERTION_LINES',
            'notQaOrLaneVerdict': True}

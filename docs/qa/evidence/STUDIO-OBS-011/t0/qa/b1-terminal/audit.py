from pathlib import Path
import collections
import datetime
import hashlib
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path.cwd()
OUT = Path(__file__).parent
BASE = Path('docs/qa/evidence/STUDIO-OBS-011')
RESULT = BASE / 'execution/obs011-t0-baseline-check01-results.json'
r = json.loads(RESULT.read_text())
started = datetime.datetime.fromisoformat(r['started']).timestamp()
ended = started + r['elapsedSeconds']
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
audit = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'isQaVerdict': False, 'collectorSha256': digest(RESULT),
         'exit': r['exit'], 'gradleExit': r['gradleExit'],
         'taskCollectionComplete': r['taskCollectionComplete'],
         'taskCollectionErrors': r['taskCollectionErrors'], 'tasks': {},
         'manifestVerification': {}, 'cohorts': [], 'classTimings': []}
for group in ['xmlFiles', 'testHtmlFiles', 'jacocoExecFiles', 'guidedCohortFiles', 'guardTallies']:
    errors = []
    for f in r[group]:
        p = Path(f['path'])
        if not p.exists() or p.stat().st_size != f['bytes'] or digest(p) != f['sha256']:
            errors.append(f['path'])
    audit['manifestVerification'][group] = {'files': len(r[group]), 'errors': errors}
cases = []
suite_rows = []
for f in r['xmlFiles']:
    root = ET.parse(f['path']).getroot()
    suite_rows.append({'task': f['task'], 'class': root.get('name'),
                       'suiteTimeSeconds': float(root.get('time', 0)),
                       'xml': f['path'], 'sha256': f['sha256'],
                       'tests': int(root.get('tests', 0)),
                       'failures': int(root.get('failures', 0)),
                       'errors': int(root.get('errors', 0)),
                       'skipped': int(root.get('skipped', 0))})
    for c in root.findall('.//testcase'):
        state = ('SKIP' if c.find('skipped') is not None else
                 'FAIL' if c.find('failure') is not None else
                 'ERROR' if c.find('error') is not None else 'PASS')
        cases.append({'task': f['task'], 'class': c.get('classname'),
                      'name': c.get('name'), 'status': state})
case_key = lambda c: (c['task'], c['class'], c['name'], c['status'])
audit['caseMultisetEqualsCollector'] = collections.Counter(map(case_key, cases)) == collections.Counter(map(case_key, r['testcases']))
policy = json.loads((BASE / 't0/qa/approved-skips.json').read_text())
skip_key = lambda c: (c['task'], c['class'], c['name'])
audit['exactApprovedSkipMultiset'] = collections.Counter(map(skip_key, (c for c in cases if c['status'] == 'SKIP'))) == collections.Counter(map(skip_key, policy))
audit['failures'] = [c for c in cases if c['status'] in ['FAIL', 'ERROR']]
for task in r['explicitTestTasks']:
    group = [c for c in cases if c['task'] == task]
    counts = collections.Counter(c['status'] for c in group)
    facts = [f for f in r['xmlFiles'] if f['task'] == task]
    execs = [f for f in r['jacocoExecFiles'] if f['task'] == task]
    audit['tasks'][task] = {'total': len(group), 'passed': counts['PASS'],
                           'failed': counts['FAIL'], 'errors': counts['ERROR'],
                           'skipped': counts['SKIP'], 'xmlFiles': len(facts),
                           'allXmlMtimesWithinRun': all(started <= f['mtimeNs']/1e9 <= ended+2 for f in facts),
                           'execs': [{'bytes': f['bytes'], 'sha256': f['sha256'],
                                      'mtimeWithinRun': started <= f['mtimeNs']/1e9 <= ended+2} for f in execs]}
for f in r['guidedCohortFiles']:
    if Path(f['path']).name != 'cohort.json':
        continue
    c = json.loads(Path(f['path']).read_text())
    inv = c['invocations']
    replay = [x for x in cases if x['task'] == f['task'] and x['class'].endswith('.GuidedPublicationReplayIT') and x['name'] != 'executionError']
    cohort_cases = collections.Counter((i['displayLabel'], 'PASS' if i['passed'] else 'FAIL') for i in inv)
    xml_cases = collections.Counter((i['name'], i['status']) for i in replay)
    keys = ['auditComplete', 'budgetEvidenceComplete', 'declaredOutputCeiling',
            'finalScansAttempted', 'lane', 'modelEvidenceComplete', 'privacyComplete',
            'producersDrained', 'profile', 'responseEvidenceComplete', 'retentionFailures']
    audit['cohorts'].append({'task': f['task'], 'sha256': f['sha256'],
                              'mtimeWithinRun': started <= f['mtimeNs']/1e9 <= ended+2,
                              'facts': {k:c.get(k) for k in keys},
                              'invocations': len(inv), 'passed': sum(i['passed'] for i in inv),
                              'afterEachComplete': sum(i['afterEachComplete'] for i in inv),
                              'invocationCaseAndStatusMultisetEqualsXml': cohort_cases == xml_cases,
                              'fullJOIN80OrPerInvocationProofCredited': False})
names = ['GuidedPublicationReplayIT', 'GuidedServiceTransportFaultIT',
         'GuidedBridgePlannedIT', 'GuidedPublicationRaceTest',
         'GuidedFocusMutationJoinedIT', 'GuidedEvidencePendingAppendJoinedIT',
         'GuidedBridgeIntegrationTest', 'GuidedPlanningIntegrationTest', 'SecretUseAuditIT']
audit['classTimings'] = [s for s in suite_rows if s['class'].rsplit('.', 1)[-1] in names]
audit['nineNamedDefaultClassesPresentExactlyOnce'] = all(sum(x['task'] == 'test' and x['class'].endswith('.'+n) for x in audit['classTimings']) == 1 for n in names)
audit['defaultNineClassSuiteTimeSumSeconds'] = sum(x['suiteTimeSeconds'] for x in audit['classTimings'] if x['task'] == 'test')
audit['timingLimitation'] = 'Sum of XML suite times is not elapsed process wall time. Default ReplayIT is failed/fail-stop-truncated; attempted before sample is not a green equal-work baseline.'
log = BASE / 'execution/obs011-t0-baseline-check01.log'
tasks = {}
for line in log.read_text(errors='replace').splitlines():
    m = re.match(r'^> Task :([\w]+)(?: (.*))?$', line)
    if m:
        tasks[m[1]] = m[2] or 'EXECUTED'
required = ['requireFreshGuidedPartitions', 'jacocoTestReport', 'jacocoTestCoverageVerification', 'check']
audit['coverageTasks'] = {k:tasks.get(k, 'ABSENT') for k in required}
audit['logShaEqualsCollector'] = digest(log) == r['logSha256']
report = BASE / 't0/b1-jacoco/test/jacocoTestReport.xml'
original = Path('backend/build/reports/jacoco/test/jacocoTestReport.xml')
root = ET.parse(report).getroot()
session_times = [(int(s.get('start'))/1000, int(s.get('dump'))/1000) for s in root.findall('sessioninfo')]
audit['coverageReport'] = {'copiedSha256': digest(report), 'originalSha256': digest(original),
                          'sameBytes': digest(report) == digest(original),
                          'originalMtimeUtc': datetime.datetime.fromtimestamp(original.stat().st_mtime, datetime.timezone.utc).isoformat(),
                          'sessionInfoCount': len(session_times),
                          'latestDumpUtc': datetime.datetime.fromtimestamp(max(t[1] for t in session_times), datetime.timezone.utc).isoformat(),
                          'allSessionsPredateB1': all(t[1] < started for t in session_times),
                          'fresh': False, 'mergedCoverageCredited': False,
                          'bundleOrPackageRatiosCredited': False, 'RC10HeadroomCredited': False}
start = json.loads((BASE / 't0/start-capture.json').read_text())
end = json.loads((BASE / 't0/end-capture.json').read_text())
audit['stability'] = {'sourceStableReported':r['sourceStable'], 'distStableReported':r['distStable'],
                      'testInputStableReported':r['testInputStable'],
                      'sourceDigestEqual':start['digest'] == end['digest'],
                      'sourceFileManifestEqual':start['files'] == end['files'],
                      'distEqual':start['dist'] == end['dist']}
audit['outcome'] = 'B1_TERMINAL_RED_COLLECTION_VALID_CAUSE_UNRESOLVED_COVERAGE_NOT_EXECUTED'
audit['W1Authorized'] = False
(OUT / 'audit.json').write_text(json.dumps(audit, indent=2)+'\n')
print(json.dumps({k:audit[k] for k in ['outcome', 'caseMultisetEqualsCollector', 'exactApprovedSkipMultiset', 'manifestVerification', 'tasks', 'cohorts', 'coverageTasks', 'coverageReport', 'stability']}, indent=2))

"""Pure gateway phase adjudication. Native status remains an independent field."""
from collections import Counter
import re


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def assess(report, phase, native_exit, cases):
    require(phase in ('red', 'green'), 'UNKNOWN_PHASE')
    require(type(native_exit) is int, 'MISSING_NATIVE_STATUS')
    require(isinstance(report, dict), 'REPORT_NOT_OBJECT')
    suites = report.get('testResults')
    require(isinstance(suites, list) and len(suites) == 1, 'ONE_COMPLETE_FILE_REQUIRED')
    suite = suites[0]
    require(suite.get('name', '').endswith('/test/deployment/integrations.test.ts'), 'WRONG_FILE')
    require(not suite.get('message'), 'FILE_COLLECTION_OR_HOOK_ERROR')
    rows = suite.get('assertionResults')
    require(isinstance(rows, list), 'MISSING_ASSERTIONS')
    # Vitest fullName uses spaces. Compare structured ancestorTitles/title instead.
    identities = [' > '.join([*r.get('ancestorTitles', []), r.get('title', '')]) for r in rows]
    require(Counter(identities) == Counter(cases['all']), 'CASE_IDENTITY_MULTISET_MISMATCH')
    require(report.get('numTotalTests') == 95, 'TOTAL_TEST_COUNT')
    require(report.get('numRuntimeErrorTestSuites', 0) == 0, 'RUNTIME_SUITE_ERROR')
    require(report.get('numTodoTests', 0) == 0, 'TODO_TEST')
    selected = set(cases['red'])
    status_counts = Counter(r.get('status') for r in rows)
    if phase == 'red':
        require(native_exit == 1 and report.get('success') is False, 'RED_NATIVE_EXIT_OR_SUCCESS')
        require(status_counts == {'failed': 48, 'skipped': 47}, 'RED_STATUS_COUNTS')
        require(report.get('numFailedTests') == 48 and report.get('numPassedTests') == 0
                and report.get('numPendingTests') == 47, 'RED_SUMMARY_COUNTS')
        for identity, row in zip(identities, rows):
            if identity not in selected:
                require(row.get('status') == 'skipped' and not row.get('failureMessages'), 'FILTERED_CASE_RAN')
                continue
            require(row.get('status') == 'failed', 'SELECTED_RED_DID_NOT_FAIL')
            messages = row.get('failureMessages')
            require(isinstance(messages, list) and len(messages) == 1, 'RED_FAILURE_ARITY')
            text = re.sub(r'\x1b\[[0-9;]*m', '', messages[0])
            require('expected true to be false' in text, 'WRONG_RED_EXPECTATION')
            # Installed JSON reporter retains error.stack, not the pretty code frame.
            # Exact accepted fixture line310 is expect(outcome.ok).toBe(false).
            require(re.search(r'integrations\.test\.ts:310:\d+', text) is not None,
                    'WRONG_RED_ASSERTION_SOURCE_FRAME')
        qualified = 'EXPECTED_RED_48_INTENDED_ASSERTIONS'
    else:
        require(native_exit == 0 and report.get('success') is True, 'GREEN_NATIVE_EXIT_OR_SUCCESS')
        require(status_counts == {'passed': 95}, 'GREEN_STATUS_COUNTS')
        require(report.get('numPassedTests') == 95 and report.get('numFailedTests') == 0
                and report.get('numPendingTests') == 0, 'GREEN_SUMMARY_COUNTS')
        require(all(not r.get('failureMessages') for r in rows), 'GREEN_FAILURE_MESSAGES')
        qualified = 'GREEN_95_IDENTITIES_PASS'
    return {'qualification': qualified, 'nativeExit': native_exit,
            'nativeSuccess': native_exit == 0, 'counts': dict(status_counts),
            'all95IdentitiesReconciled': True, 'actualRenderFrameCount': None,
            'actualRenderFrameCountClaimed': False, 'credit': False}


def transition_allowed(phase, decisions, receipts):
    """Separate root decisions must bind exact preceding immutable receipts."""
    required = {'prepare': [], 'red': ['prepare'], 'install-fixed': ['red'],
                'green': ['install-fixed'], 'archive': ['green']}
    require(phase in required, 'UNKNOWN_PHASE')
    require(phase not in receipts, 'ONE_SHOT_PHASE_ALREADY_CONSUMED')
    require(decisions.get('phase') == phase and decisions.get('authorized') is True,
            'ROOT_PHASE_DECISION_REQUIRED')
    for previous in required[phase]:
        require(previous in receipts and receipts[previous].get('accepted') is True,
                'PRECEDING_RECEIPT_NOT_ACCEPTED')
    return True

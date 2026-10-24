"""No native process/Node/Helm/lock/scratch/source census. Injected JSON only."""
from pathlib import Path
import ast
import copy
import json

D = Path(__file__).resolve().parent
ns = {}
exec(compile((D / 'contracts.py').read_text(), '<pure-contracts>', 'exec'), ns)
cases = json.loads((D / 'case-map.json').read_text())
assess, transition = ns['assess'], ns['transition_allowed']
checks = []


def report(phase):
    rows = []
    for identity in cases['all']:
        parent, title = identity.split(' > ')
        selected = identity in cases['red']
        status = 'passed' if phase == 'green' else 'failed' if selected else 'skipped'
        rows.append({'ancestorTitles': [parent], 'title': title, 'status': status,
                     'failureMessages': ['AssertionError: expected true to be false\n'
                                         'expect(outcome.ok).toBe(false)\n'
                                         'integrations.test.ts:310:28']
                     if status == 'failed' else []})
    return {'testResults': [{'name': '/OWNED/repo/studio-runner/test/deployment/integrations.test.ts',
                            'assertionResults': rows}], 'numTotalTests': 95,
            'numRuntimeErrorTestSuites': 0, 'numTodoTests': 0,
            'numFailedTests': 48 if phase == 'red' else 0,
            'numPassedTests': 0 if phase == 'red' else 95,
            'numPendingTests': 47 if phase == 'red' else 0, 'success': phase == 'green'}


def positive(name, action):
    action()
    checks.append({'name': name, 'expected': 'ACCEPT', 'actual': 'ACCEPT'})


def negative(name, action):
    try:
        action()
    except ValueError as exc:
        checks.append({'name': name, 'expected': 'HOLD', 'actual': 'HOLD', 'reason': str(exc)})
    else:
        raise AssertionError('Negative control incorrectly accepted: ' + name)


positive('red native1 remains failed-native but intended-red qualifies',
         lambda: assess(report('red'), 'red', 1, cases))
positive('green exactly95', lambda: assess(report('green'), 'green', 0, cases))
for phase, code in [('red', 1), ('green', 0)]:
    for name, mutation in [
        ('missing-case', lambda r: r['testResults'][0]['assertionResults'].pop()),
        ('duplicate-case', lambda r: r['testResults'][0]['assertionResults'].append(
            copy.deepcopy(r['testResults'][0]['assertionResults'][0]))),
        ('wrong-case', lambda r: r['testResults'][0]['assertionResults'][0].update(title='invented')),
        ('runtime-error', lambda r: r.update(numRuntimeErrorTestSuites=1)),
        ('todo', lambda r: r.update(numTodoTests=1)),
        ('summary-only-lie', lambda r: r.update(numTotalTests=94)),
        ('wrong-file', lambda r: r['testResults'][0].update(name='/wrong.ts')),
        ('extra-file', lambda r: r['testResults'].append(copy.deepcopy(r['testResults'][0]))),
    ]:
        r = report(phase)
        mutation(r)
        negative(phase + ':' + name, lambda r=r, phase=phase, code=code: assess(r, phase, code, cases))
    negative(phase + ':missing-native-status', lambda phase=phase: assess(report(phase), phase, None, cases))
    negative(phase + ':wrong-native-status', lambda phase=phase, code=code: assess(report(phase), phase, 1-code, cases))
for message in ['helm not found', 'expected false to be true',
                'expected true to be false integrations.test.ts:317:28',
                'expected true to be false expect(outcome.ok).toBe(false)']:
    r = report('red')
    selected = next(row for row in r['testResults'][0]['assertionResults'] if row['status'] == 'failed')
    selected['failureMessages'] = [message]
    negative('red:wrong-provenance:' + message[:20], lambda r=r: assess(r, 'red', 1, cases))
r = report('green'); r['testResults'][0]['assertionResults'][0]['status'] = 'pending'
negative('green:skip-not-success', lambda: assess(r, 'green', 0, cases))
for phase, previous in [('prepare', []), ('red', ['prepare']), ('install-fixed', ['red']),
                        ('green', ['install-fixed']), ('archive', ['green'])]:
    receipts = {p: {'accepted': True} for p in previous}
    decision = {'phase': phase, 'authorized': True}
    positive('transition:' + phase, lambda p=phase, d=decision, r=receipts: transition(p, d, r))
    negative('transition:no-root:' + phase,
             lambda p=phase, r=receipts: transition(p, {'phase': p, 'authorized': False}, r))
    negative('transition:replay:' + phase,
             lambda p=phase, d=decision, r=receipts: transition(p, d, {**r, p: {'accepted': True}}))
    if previous:
        negative('transition:missing-predecessor:' + phase,
                 lambda p=phase, d=decision: transition(p, d, {}))

for name in ['contracts.py', 'run-private.py', 'exit-gate.py', 'pure-controls.py']:
    ast.parse((D / name).read_text())
    checks.append({'name': 'parse:' + name, 'actual': 'PARSED_SOURCE_ONLY'})

output = {'status': 'PURE_STATIC_INJECTED_CONTROLS_ONLY', 'checks': checks,
          'allExpected': True, 'runtimeCasesObserved': 0, 'nativeExecutions': 0,
          'actualResourceObservation': False, 'readiness': False, 'release': False}
(D / 'pure-control-results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'checks': len(checks), 'allExpected': True, 'nativeExecutions': 0}))

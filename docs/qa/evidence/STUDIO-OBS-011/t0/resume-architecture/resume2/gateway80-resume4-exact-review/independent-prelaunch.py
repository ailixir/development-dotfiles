"""Focused actual-function regression with fake boundaries; no native/main/OS IO."""
from pathlib import Path
from types import SimpleNamespace
import ast
import json

O = Path(__file__).absolute().parent
D = O.parents[2] / 'early/gateway80-proof-prep/resume4'
tree = ast.parse((D / 'boundary-controls.py').read_text())
prefix = []
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'w' for t in node.targets):
        break
    prefix.append(node)
ns = {'__file__': str(D / 'boundary-controls.py')}
exec(compile(ast.Module(body=prefix, type_ignores=[]), '<inspected-fake-world-definitions-only>', 'exec'), ns)
# Focused model only; the full unmodified source/guard replay runs separately.
ns['G']['files'] = []
ns['G']['dist']['files'] = []
World, FP = ns['World'], ns['FP']
results = []

class FakeLaunchReached(Exception):
    pass

for phase in ('red', 'green'):
    for case in ('fresh', 'regular', 'existing-link', 'dangling-link', 'cwd-link', 'report-parent-link', 'report-parent-wrongtype'):
        w = World()
        w.d.setup_custody(w.A)
        report = '/W/repo/' + phase + '-vitest.json'
        for name in (phase + '-vitest.json', phase + '.stdout', phase + '.stderr', phase + '.launched.json'):
            w.fs.nodes.pop('/E/' + name, None)
        w.fs.nodes.pop(report, None)
        if case == 'regular':
            w.fs.put(report, 'OLD')
        if case == 'existing-link':
            w.fs.put(report, '/R/helm-chart/put-checks/templates/_helpers.tpl', kind='symlink', mode=0o777)
        if case == 'dangling-link':
            w.fs.put(report, '/R/UNCREATED_TARGET', kind='symlink', mode=0o777)
            assert not w.fs.path(report).exists() and w.fs.path(report).is_symlink()
        if case == 'cwd-link':
            w.fs.put('/W/repo/studio-runner', '/R/studio-runner', kind='symlink', mode=0o777)
        if case == 'report-parent-link':
            w.fs.put('/W/repo', '/R', kind='symlink', mode=0o777)
        if case == 'report-parent-wrongtype':
            w.fs.put('/W/repo', 'NOT_DIRECTORY')
        launches, output_callbacks, target_exists_queries = [], [], []
        def fake_popen(argv, **kwargs):
            launches.append({'argv': argv, 'cwd': str(kwargs['cwd']), 'umask': kwargs['umask']})
            raise FakeLaunchReached()
        w.ns['subprocess'] = SimpleNamespace(DEVNULL=-3, Popen=fake_popen)
        original_exists = FP.exists
        def exists(self):
            if str(self) == report and case in ('existing-link', 'dangling-link'):
                target_exists_queries.append(str(self))
                raise AssertionError('Report link target queried before link-entry denial')
            return original_exists(self)
        FP.exists = exists
        original_exclusive = w.ns['exclusive_output']
        def output(path):
            output_callbacks.append(str(path))
            return original_exclusive(path)
        w.ns['exclusive_output'] = output
        w.fakeOS.events.clear()
        try:
            try:
                w.ns['run_native'](phase, w.A, w.C)
            except FakeLaunchReached:
                outcome = 'FRESH_LAUNCH_ADMITTED'
            except ValueError as exc:
                outcome = 'HOLD_' + str(exc)
        finally:
            FP.exists = original_exists
        assert len(launches) == (1 if case == 'fresh' else 0)
        assert len(output_callbacks) == (2 if case == 'fresh' else 0)
        assert not target_exists_queries
        if case != 'fresh':
            assert not w.fakeOS.events
        results.append({'phase': phase, 'case': case, 'outcome': outcome, 'PopenCalls': len(launches),
                        'outputCallbacks': len(output_callbacks), 'linkTargetExistenceQueries': target_exists_queries,
                        'actualActions': False})
(O / 'independent-prelaunch-results.json').write_text(json.dumps({'checks': results, 'count': len(results),
    'allExpected': True, 'focusedFakeSourceBulkOmitted': True, 'actualNativeOSLockSourcePrivateActions': False}, indent=2) + '\n')
print(json.dumps({'independentPrelaunchChecks': len(results), 'allExpected': True}))

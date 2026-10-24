"""Reviewer source/hash/AST and inspected fake-only replay; no helper main runs."""
from pathlib import Path
import ast
import hashlib
import json
import re
import stat

O = Path(__file__).absolute().parent
T = O.parents[2]
D = T / 'early/gateway80-proof-prep/resume4'
P = D.parent / 'resume3'
pins = []

def pin(path, wanted=None):
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert wanted is None or wanted == digest, (str(path), wanted, digest)
    pins.append({'path': str(path), 'sha256': digest, 'bytes': len(data),
                 'mode': stat.S_IMODE(path.stat().st_mode)})
    return data

expected = {'resume4': '43220c811bc60d2f7dbf8397d2f5c57ceca4e1f8c6b0454e60fb69a545dae5ce',
            'resume3': '6b308963dc623749151daad14d363f2a58899d6687bb3da6a8986e439a6375d9',
            'resume2': 'ed5057fa38bbeeda3982503382f65fe8fbb2b637167094846fdf8e6969f3f4e3',
            'resume1': 'd8021489e0938166fc4779105964a971e7c015ffaaaf7bab7c149541b4432c0e'}
for name, digest in expected.items():
    base = D.parent / name
    manifest = json.loads(pin(base / 'manifest.json', digest))
    for row in manifest['files']:
        data = pin(base / row['path'], row['sha256'])
        assert len(data) == row['bytes'] and pins[-1]['mode'] == row['mode']
    for line in pin(base / 'SHA256SUMS').decode().splitlines():
        wanted, leaf = line.split(None, 1)
        assert hashlib.sha256((base / leaf.strip()).read_bytes()).hexdigest() == wanted
pin(D / 'SHA256SUMS', '50ef9b1761d0a5a642e22b1d7b2bbd15ac87627f4838f1903cffaa6feeca9152')
for name, digest in {
    'resume2-gateway80-resume3-findings-root-adoption.json': 'a4d1437fbd8f868b276f01ea1d85f4767022fcdf3323b002cd656a8c4c072097',
    'resume-architecture/resume2/gateway80-resume3-exact-review/manifest.json': '24efb296f51f0f485a186d5913078a40df7cd86734e389953c52b2097a2dd0e1',
    'resume-architecture/resume2/gateway80-resume3-exact-review/review.md': '1805b363dfbc37e3df13d2ea71fb706a2527feb6f11227478cb0d1ced944bea5',
    'qa/gateway80-resume3-exact-review/seal.json': '26012b7eccc5f4fe8b379d5188fe3c1791e442d031c3c77b46c306d9fb823234',
    'qa/gateway80-resume3-exact-review/review.md': 'f3571ed98e5c5423cfcd83181d849c9847b5bbd750ec0475680f27010a548976',
    'early/fullcheck-harness/resume3/harness.py': 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae',
}.items():
    pin(T / name, digest)
for generation in ('resume3', 'resume4'):
    for role in ('architecture', 'qa') if generation == 'resume3' else ('architecture',):
        for suffix in ('task.txt', 'context.json', 'preflight.json'):
            path = Path('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009') / ('gateway80-' + generation + '-' + role + '-review-' + suffix)
            pin(path)
(O / 'input-pins.json').write_text(json.dumps({'pins': pins, 'count': len(pins), 'allMatched': True}, indent=2) + '\n')

def patch_replay(text, source, target):
    lines = text.splitlines(keepends=True)
    index = 0
    names = []
    while index < len(lines):
        assert lines[index].startswith('--- ')
        name = lines[index][4:].strip().split('/', 1)[1]
        index += 1
        assert lines[index].startswith('+++ ') and lines[index][4:].strip().split('/', 1)[1] == name
        index += 1
        before = (source / name).read_text().splitlines(keepends=True)
        after, cursor = [], 0
        while index < len(lines) and not lines[index].startswith('--- '):
            header = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', lines[index])
            assert header
            index += 1
            old_count = int(header[2] or 1)
            start = int(header[1]) - 1 if old_count else int(header[1])
            assert start >= cursor
            after += before[cursor:start]
            cursor = start
            removed = added = 0
            while index < len(lines) and not lines[index].startswith(('@@ ', '--- ')):
                line = lines[index]
                index += 1
                assert line[0] in ' +-'
                if line[0] in ' -':
                    assert before[cursor] == line[1:]
                    cursor += 1
                    removed += 1
                if line[0] in ' +':
                    after.append(line[1:])
                    added += 1
            assert removed == old_count and added == int(header[4] or 1)
        after += before[cursor:]
        assert ''.join(after) == (target / name).read_text(), name
        names.append(name)
    assert len(names) == len(set(names))
    return sorted(names)

old = {row['path']: row for row in json.loads((P / 'manifest.json').read_text())['files']}
proof = json.loads((D / 'successor-diff.json').read_text())
current = {row['path']: row for row in json.loads((D / 'manifest.json').read_text())['files']}
generated = proof['generatedCommonFiles']
comparisons = proof['nonGeneratedCommonComparisons']
assert {r['path'] for r in comparisons} == set(old) - set(generated)
changed = []
for row in comparisons:
    name = row['path']
    assert row['oldSha256'] == old[name]['sha256']
    assert row['newSha256'] == current[name]['sha256']
    assert row['newMode'] == current[name]['mode']
    assert row['changed'] == (row['oldSha256'] != row['newSha256'])
    if row['changed']:
        changed.append(name)
for name, role in generated.items():
    assert role['oldSha256'] == old[name]['sha256']
    assert 'newSha256' not in role and 'changed' not in role
    assert role['currentHashAuthority'] == 'manifest.json files entry'
forward = patch_replay((D / 'strict-successor.diff.patch').read_text(), P, D)
reverse = patch_replay((D / 'strict-successor.reverse.patch').read_text(), D, P)
assert forward == reverse == sorted(changed) == proof['strictDeltaCoverage']
actual_changed = sorted(name for name, row in old.items() if row['sha256'] != current[name]['sha256'])
validation = json.loads((D / 'diff-validation.json').read_text())
assert validation['actualChangedCommonMembers'] == actual_changed
assert len(forward) == 11 and len(actual_changed) == 17
assert validation['generatedCommonMembersExcludedFromPatchAndDescriptorCurrentHashAssertions'] == sorted(generated)
assert validation['nonGeneratedComparisons'] == len(comparisons) == 76
for name in ('contracts.py', 'input-manifest.json', 'case-map.json', 'source-guards.json', 'helper.patch', 'tests.patch', 'vitest.gateway80.config.mjs', 'final-controls.py', 'pure-controls.py', 'revision-controls.py'):
    assert (D / name).read_bytes() == (P / name).read_bytes(), name
old_scope, new_scope = [json.loads((base / 'scope.json').read_text()) for base in (P, D)]
for key in ('phases', 'phaseIds', 'label', 'workspace', 'runtime', 'repository', 'node', 'helm', 'dependencies'):
    assert old_scope[key] == new_scope[key], key
# Every driver function except the two reviewed fixes is AST-identical.
defs = lambda base: {n.name: ast.dump(n, include_attributes=False) for n in ast.parse((base / 'run-private.py').read_text()).body if isinstance(n, ast.FunctionDef)}
old_defs, new_defs = defs(P), defs(D)
assert old_defs.keys() == new_defs.keys()
assert [n for n in old_defs if old_defs[n] != new_defs[n]] == ['guard_leaf', 'run_native']
(O / 'source-diff-audit.json').write_text(json.dumps({'strictForwardAndReverseFiles': forward, 'actualChangedCommonMembers': actual_changed, 'generatedCommonExclusions': generated, 'all76CurrentHashModeAssertionsVerified': True, 'driverChangedFunctionsOnly': ['guard_leaf', 'run_native'], 'nativeScopeArgvBanksAndFinalControlsExact': True, 'noActualActions': True}, indent=2) + '\n')
print(json.dumps({'pins': len(pins), 'strictFiles': len(forward), 'actualCommonChanges': len(actual_changed)}), flush=True)
replays = []
for name, variable in [('pure-controls.py', 'output'), ('boundary-controls.py', 'result'), ('revision-controls.py', 'output'), ('report-admission-controls.py', 'output')]:
    tree = ast.parse((D / name).read_text())
    assert isinstance(tree.body[-2], ast.Expr) and isinstance(tree.body[-1], ast.Expr)
    assert isinstance(tree.body[-2].value, ast.Call) and isinstance(tree.body[-2].value.func, ast.Attribute) and tree.body[-2].value.func.attr == 'write_text'
    tree.body = tree.body[:-2]
    env = {'__file__': str(D / name)}
    exec(compile(tree, '<reviewer-inspected-fake-replay-no-author-output>', 'exec'), env)
    result = env[variable]
    assert result['allExpected']
    replays.append({'file': name, 'count': len(result['checks']), 'checks': result['checks']})
    (O / ('replay-' + name + '.json')).write_text(json.dumps(replays[-1], indent=2) + '\n')
    print(json.dumps({'file': name, 'count': len(result['checks']), 'allExpected': True}), flush=True)
old_names = {r['name'] for r in json.loads((P / 'boundary-control-results.json').read_text())['checks']}
new_names = {r['name'] for r in replays[1]['checks']}
assert old_names <= new_names and replays[2]['count'] == 70 and replays[3]['count'] == 24
assert sum(r['count'] for r in replays[1:]) == 215
(O / 'pure-replay.json').write_text(json.dumps({'all215Expected': True, 'all191MeaningfulPriorControlsRetained': True, 'removedOnlyAuthorFinalSealedOutputWriteAndPrint': True, 'replays': replays, 'actualActions': False}, indent=2) + '\n')

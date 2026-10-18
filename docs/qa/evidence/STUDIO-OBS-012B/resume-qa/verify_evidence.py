"""Read-only review probes; write only bounded QA evidence beside this script."""
import collections
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path.cwd()
OUT = pathlib.Path(__file__).resolve().parent
SCRATCH = pathlib.Path(sys.argv[1])
EVIDENCE = ROOT / 'docs/qa/evidence/STUDIO-OBS-012B'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def cases(path):
    report = json.loads(path.read_text())
    result = {}
    for suite in report['testResults']:
        name = 'src/' + suite['name'].split('src/', 1)[1]
        for case in suite['assertionResults']:
            key = (name, case['fullName'])
            assert key not in result, key
            result[key] = case['status']
    return result


def named(keys):
    return [{'file': f, 'name': n} for f, n in sorted(keys)]


start_path = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/resume-20261014/start-manifest.json'
start = json.loads(start_path.read_text())
drift = [row['path'] for row in start['files']
         if not (ROOT / row['path']).is_file() or digest(ROOT / row['path']) != row['sha256']]
assert all(p.startswith('docs/stories/') for p in drift), drift
scope = [row for row in start['files'] if row['path'].startswith((
    'frontend/', 'docs/specs/studio/', 'docs/specs/studio-observed-authoring/'))]
assert all(digest(ROOT / row['path']) == row['sha256'] for row in scope)
source_digest = hashlib.sha256(''.join(f"{r['path']}\0{r['sha256']}\n" for r in scope).encode()).hexdigest()
save('source-manifest.json', {
    'schema': 1, 'story': 'STUDIO-OBS-012B',
    'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    's4c_identity': start['s4c_identity'], 's4c_start_manifest_sha256': digest(start_path),
    'checked_start_manifest_entries': len(start['files']),
    'post_s4c_documentation_changes': drift, 'product_source_drift': [],
    'source_digest_algorithm': 'sha256 of ordered path + NUL + sha256 + LF rows',
    'source_digest': source_digest, 'files': scope,
})

baseline = cases(EVIDENCE / 'fe-baseline.json')
c2b = cases(EVIDENCE / 'fe-final-c2b.json')
ux = cases(EVIDENCE / 'fe-final-ux-fixes.json')
target_path = pathlib.Path('/tmp/studio-obs-012b-resume-targeted.json')
target = cases(target_path)
ledger = json.loads((EVIDENCE / 'ledger.json').read_text())
drops, additions = set(baseline) - set(c2b), set(c2b) - set(baseline)
assert drops == {(r['file'], r['name']) for r in ledger['reconciliation']['namedDrops']}
assert additions == {(r['file'], r['name']) for r in ledger['reconciliation']['namedAdditions']}
assert (len(baseline), len(drops), len(additions), len(c2b), len(ux)) == (854, 216, 57, 695, 699)
assert not (set(c2b) - set(ux))
assert all(v == 'passed' for v in c2b.values())
assert all(v == 'passed' for v in ux.values())
assert all(v == 'passed' for v in target.values())
target_files = {f for f, _ in target}
assert not {k for k in ux if k[0] in target_files and k not in target}
new_unrelated = set(target) - set(ux)
assert len(new_unrelated) == 2
assert {f for f, _ in new_unrelated} == {'src/hooks/useUrlListState.test.tsx'}
expected_final = {**ux, **target}
s4log = (SCRATCH / 's4c-fe-vitest.log').read_text()
file_counts = {f: int(n) for f, n in re.findall(r'^\s*✓ (src/\S+)\s+\((\d+) tests?\)', s4log, re.M)}
assert collections.Counter(f for f, _ in expected_final) == file_counts
assert len(file_counts) == 56 and sum(file_counts.values()) == 701
assert re.search(r'Tests\s+701 passed \(701\)', s4log)
save('test-reconciliation.json', {
    'baseline_status_counts': dict(collections.Counter(baseline.values())),
    'formula': '854 - 216 + 57 + 4 = 699 story suite; + 2 preserved unrelated hook tests = 701 S4c suite',
    'named_drops': named(drops), 'named_initial_additions': named(additions),
    'named_ux_additions': named(set(ux) - set(c2b)),
    'named_unrelated_additions': named(new_unrelated),
    'ledger_initial_names_match': True, 'ux_to_review_removed_names': [],
    'targeted': {'files': len(target_files), 'passed': len(target), 'failed': 0, 'skipped': 0},
    's4c_file_counts': file_counts,
    's4c_name_coverage_limit': 'S4c retained console output, not per-name JSON. Its 56 per-file counts match the 699-name UX JSON plus the 2 independently executed hook names. The five post-UX review targets were independently re-executed with JSON.',
    'baseline_limit': ledger['reconciliation']['notCountedInBaselineJson'],
})
report = json.loads(target_path.read_text())
for suite in report['testResults']:
    suite['name'] = 'frontend/src/' + suite['name'].split('src/', 1)[1]
save('targeted-results.json', report)

grep = subprocess.run(['rg', '-ni', 'compil', 'frontend/src'], capture_output=True, text=True)
hits = grep.stdout.splitlines()
assert len(hits) == 15 and all('.test.' in x.split(':', 1)[0] for x in hits)
orphan = subprocess.run(['rg', '-n', r'(^|[^-])artifact\.schema\.json|inference\.openapi\.yaml|inference-proposal\.schema\.json',
                         'frontend/src', 'backend/src', 'studio-runner/src', 'tools', 'backend/build.gradle.kts'], capture_output=True, text=True)
assert orphan.returncode == 1 and not orphan.stdout
deleted = subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=D', 'HEAD', '--', 'frontend/src',
                                   'docs/specs/studio/artifact.schema.json', 'docs/specs/studio/inference.openapi.yaml',
                                   'docs/specs/studio/inference-proposal.schema.json'], text=True).splitlines()
assert len(deleted) == 58
for directory in ['frontend/src/components/studio/review', 'frontend/src/components/studio/inference', 'frontend/src/features/studio/authoring']:
    assert not (ROOT / directory).exists()
save('static-verification.json', {
    'compile_grep_command': 'rg -ni compil frontend/src', 'compile_production_hits': 0,
    'compile_test_exceptions': hits,
    'exception_classes': ['E1: retained WCAG surface keys/names (OBS-008 AC-8)', 'E2: Ajv compile API',
                          'E3: historical escalation comments and absent-operation assertion',
                          'E4: UX-fix regression-test comments and forbidden-copy assertion (three new lines)'],
    'orphan_reference_hits': [], 'deleted_files': deleted,
    'ux_fix_hashes_match_ledger': all(digest(ROOT / p) == h for p, h in ledger['uxGateFixes']['sha256After'].items()),
    'mutation_evidence': {'retired': '1 failed, 1 passed, 17 skipped; restored: 2 passed, 17 skipped',
                          'handler_removed': '1 failed, 68 skipped', 'dummy_class_a': '1 failed, 68 skipped',
                          'dummy_class_c': '1 failed, 68 skipped', 'restored_contract_block': '4 passed, 65 skipped'},
})

xml_counts = collections.Counter()
xml_rows = []
for path in sorted((SCRATCH / 's4c-xml').glob('*.xml')):
    suite = ET.parse(path).getroot()
    counts = {k: int(suite.attrib.get(k, 0)) for k in ['tests', 'failures', 'errors', 'skipped']}
    xml_counts.update(counts)
    xml_rows.append({'name': path.name, 'sha256': digest(path), **counts})
assert dict(xml_counts) == {'tests': 2084, 'failures': 0, 'errors': 0, 'skipped': 25}
window = (SCRATCH / 's4c-window.log').read_text()
assert f"IDENT_START={start['s4c_identity']}" in window and f"IDENT_END={start['s4c_identity']}" in window
assert all(int(code) == 0 for code in re.findall(r'_EXIT=(\d+)', window))
build_path = pathlib.Path('/tmp/studio-obs-012b-resume-build.log')
build = build_path.read_text()
assert 'compiled with 1 warning' in build
axe_path = ROOT / 'docs/qa/accessibility/axe-results.json'
axe = json.loads(axe_path.read_text())
assert digest(axe_path) == next(r['sha256'] for r in start['files'] if r['path'] == str(axe_path.relative_to(ROOT)))
save('execution-verification.json', {
    's4c_window_exit_markers': dict(re.findall(r'(\w+_EXIT)=(\d+)', window)),
    'frontend': {'tsc_exit': 0, 'eslint_exit': 0, 'eslint_errors': 0, 'eslint_warnings': 302,
                 's4c_files': 56, 's4c_passed': 701, 's4c_skipped': 0,
                 'workers': '--minWorkers=1 --maxWorkers=3',
                 'build': {'command': 'npm run build', 'executor': 'independent QA', 'exit': 0,
                           'webpack_ms': 16503, 'warnings': 1, 'warning': 'Existing asset-size advisory; no threshold lowered',
                           'raw_log_basename': build_path.name, 'raw_log_sha256': digest(build_path)}},
    'backend': {**dict(xml_counts), 'passed': 2059, 'classes': len(xml_rows),
                'jacoco': 'jacocoTestReport and jacocoTestCoverageVerification executed in successful clean check'},
    'backend_xml': xml_rows,
    'runner': {'unit': {'passed': 1351, 'skipped': 29}, 'fixtures': {'passed': 225, 'skipped': 9},
               'deployment': {'passed': 313, 'skipped': 0}},
    'a11y': {'sha256_preserved': digest(axe_path), 'surfaces': len(axe['surfaces']),
             'disabled_rules': axe['disabledRules'],
             'critical_or_serious_violations': sum(1 for s in axe['surfaces'] for v in s['violations'] if v['impact'] in ['critical', 'serious']),
             'limitation': 'jsdom/pinned baseline only; surfaces 4/5 duplicate UNLEARNED, not independent guided coverage; no contrast or target-size claim'},
    'raw_evidence_hashes': [{'name': p.name, 'sha256': digest(p)} for p in sorted(SCRATCH.glob('s4c-*.log'))],
})
print(json.dumps({'source_digest': source_digest, 'files_in_scope': len(scope), 's4c_passed': 701,
                  'targeted_passed': len(target), 'named_drops': len(drops), 'named_additions': len(additions),
                  'compile_exceptions': len(hits), 'backend_passed': 2059, 'backend_skipped': 25}))

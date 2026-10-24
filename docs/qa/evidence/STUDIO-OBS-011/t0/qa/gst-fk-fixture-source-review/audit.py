"""Source-only independent custody/carry checks; no Java/SQL/process entrypoint."""
from pathlib import Path
from collections import Counter
import ast
import hashlib
import json
import re

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[6]
TASK = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'
P = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/resume3-fk-fixture-correction'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
context = json.loads((TASK / 'gst-fk-fixture-source-review-context.json').read_text())
for pin in context['pins']:
    assert sha(ROOT / pin['path']) == pin['sha256'], pin['path']
manifest = json.loads((P / 'manifest.json').read_text())
for pin in manifest['files']:
    assert sha(P / pin['path']) == pin['sha256'], pin['path']
inventory_path = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-before.json'
inventory = json.loads(inventory_path.read_text())
main = [r for r in inventory['files'] if r['path'].startswith('backend/src/main/')]
for row in main:
    assert sha(ROOT / row['path']) == row['sha256'], row['path']
migrations = [r for r in main if '/db/migration/' in r['path'] and Path(r['path']).name.startswith('V')]
seed = [r for r in main if r['path'] == 'backend/src/main/resources/db/seed/R__sample_data.sql']
assert len(main) == 506 and len(migrations) == 22 and len(seed) == 1
assert not any(re.search(r'INSERT\s+INTO\s+(?:public\.)?(?:users|csi_systems)\b', (ROOT/r['path']).read_text(), re.I) for r in migrations)
tree = ast.parse((P / 'verify_source.py').read_text())
selected = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef)) and not (isinstance(n, ast.FunctionDef) and n.name == 'main')]
scope = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), '<reviewed-pure-source-functions>', 'exec'), scope)
methods, assertions, masked = scope['methods'], scope['assertions'], scope['masked']
bindings = json.loads((P / 'candidate-bindings.json').read_text())
prior = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/resume2-native-fixture-correction'
runtime = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-provisional-02'
counts = []
for row in bindings:
    rel = row['file']
    original = (runtime / 'source-original-backups' / rel).read_text()
    before = (prior / 'repo' / rel).read_text()
    after = (P / 'repo' / rel).read_text()
    assert sha(P / 'repo' / rel) == row['successorSha256']
    assert [(m['name'], m['annotation']) for m in methods(original)] == [(m['name'], m['annotation']) for m in methods(after)]
    assert [m['body'] for m in methods(before)] == [m['body'] for m in methods(after)]
    assert not Counter(assertions(original)) - Counter(assertions(after))
    if 'TransportFault' not in rel:
        a, b = scope['method_span'](before, 'sourceFixture')
        c, d = scope['method_span'](after, 'sourceFixture')
        assert before[:a] == after[:c] and before[b:] == after[d:]
        assert scope['expected_fk_block'](before[a:b]) == after[c:d]
        block = after[c:d]
        assert block.index('INSERT INTO users') < block.index('INSERT INTO csi_systems') < block.index('INSERT INTO ui_tests')
        assert 'ON CONFLICT' not in block and 'DISABLE' not in block
        assert block.count('principal.email()') == 3 and 'principal.userId()' in block
    else:
        assert before == after
        formatted = (runtime / 'formatted-candidate-archive' / rel).read_text()
        a, b = scope['method_span'](formatted, 'translationTeardownService')
        c, d = scope['method_span'](after, 'translationTeardownService')
        removed = '''    sessions.installTranslation(
        new GuidedTranslationStore(actualJdbc, C),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            actualJdbc, C));
'''
        assert formatted[a:b].count(removed) == 1
        assert formatted[:a] == after[:c] and formatted[b:] == after[d:]
        assert formatted[a:b].replace(removed, '') == after[c:d]
        for classname in ['SourceStopOwner', 'TrackingTransactionTemplate']:
            def classbody(source):
                flat = masked(source)
                m = re.search(r'\bclass\s+' + classname + r'\b', flat)
                start = flat.index('{', m.start()); depth = 1; end = start + 1
                while depth:
                    depth += (flat[end] == '{') - (flat[end] == '}'); end += 1
                return source[start:end]
            assert classbody(original) == classbody(after), classname
    counts.append({'file': rel, 'methods': len(methods(original)), 'originalAssertions': len(assertions(original)), 'sha256': row['successorSha256']})
assert sum(r['methods'] for r in counts) == 80
assert sum(r['originalAssertions'] for r in counts) == 751
carry = json.loads((P / 'preservation-map.json').read_text())
proposal = json.loads((ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json').read_text())
assert carry['fullExpectedCases'] == proposal['expectedCases'] and len(carry['fullExpectedCases']) == 99
assert len(carry['modeVariants']) == 9
sentinels = [r for r in carry['fullExpectedCases'] if 'EvidencePendingAppendIT' in r['class'] or 'CommittedRefreshStateTest' in r['class']]
assert len(sentinels) == 11
frozen = {r['path']: r['sha256'] for r in inventory['files']}
for classname in sorted({r['class'] for r in sentinels}):
    rel = 'backend/src/test/java/' + classname.replace('.', '/') + '.java'
    assert sha(ROOT / rel) == frozen[rel]
projection = json.loads((runtime / 'closed-tool-case-line-projection.json').read_text())
records = projection['records']
assert len(records) == 46 and Counter(r['status'] for r in records) == {'PASSED': 20, 'FAILED': 26}
life = [r for r in records if r['class'] == 'GuidedLifecycleReasonIT']
assert len(life) == 5 and all(r['sourceLine'] == 538 and r['exceptionClass'] == 'org.springframework.dao.DataIntegrityViolationException' for r in life)
assert not any(r['class'] == 'GuidedSessionIT' for r in records)
report = {'scope': 'SOURCE_ONLY_NO_APPLICATION_EXECUTION_OR_CREDIT', 'assignedPins': len(context['pins']),
          'packageManifestFiles': len(manifest['files']), 'mainFilesAgainstFrozenS011': len(main),
          'versionedMigrationsUnchanged': len(migrations), 'seedUnchanged': len(seed),
          'candidateCounts': counts, 'orderedMethods': 80, 'originalAssertionsCarried': 751,
          'modeVariants': 9, 'expectedCases': 99, 'sentinelInvocations': 11,
          'sentinelFilesFrozenExact': 2, 'ownershipClassesOriginalExact': 2,
          'sourceVerifierInspectedAndRunReadOnlyExit': 0, 'fourDeltasReconstructedByVerifier': True,
          'observedToolRecords': 46, 'observedLifecycleInsertFailures': 5, 'sessionCasesUnexecuted': 44,
          'exactRuntimeConstraint': 'UNPROVEN', 'assignmentAndOwnershipStallCauses': 'OPEN',
          'runtimeCompileSqlVerified': False, 'retryOrWriterReleased': False,
          'pins': context['pins'], 'reviewedManifestSha256': sha(P/'manifest.json')}
(OUT / 'audit-result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['pins','candidateCounts']}))

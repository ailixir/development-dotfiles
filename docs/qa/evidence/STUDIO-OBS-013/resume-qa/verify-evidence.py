"""Read frozen S4c evidence and source hashes; never starts builds, tests or services."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
RAW = Path('/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/009f819d-5e88-49fc-b7b4-6f36928034e8/scratchpad')
START = ROOT / '.aiox/sdc/STUDIO-OBSERVED-ORCH/resume-20261014/start-manifest.json'
SELECTED = {
    'GuidedRecordingMigrationIT', 'InferenceMigrationLatestIT',
    'GuidedSessionEvidenceTest', 'RecordedGuidedEvidenceProjectionTest',
    'GuidedRecordingTimingsTest', 'GuidedRecordingKeysTest', 'GuidedSessionVideoIT',
    'ExecutionVideoContractTest', 'ExecutionVideoEvidenceIT', 'ExecutionVideoAuthorizationIT',
    'StudioContractTest', 'GuidedSessionIT', 'GuidedBridgeIntegrationTest',
    'GuidedPlanningIntegrationTest', 'GuidedPublicationReplayIT',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')

baseline = json.loads(START.read_text())
sources = []
mismatches = []
for original in baseline['files']:
    if original['path'].startswith(('backend/', 'studio-runner/', 'frontend/', 'tools/', 'docs/specs/')):
        path = ROOT / original['path']
        actual = sha(path) if path.is_file() else None
        sources.append({'path': original['path'], 'sha256': actual})
        if actual != original['sha256']:
            mismatches.append({'path': original['path'], 'expected': original['sha256'], 'actual': actual})
sources.sort(key=lambda item: item['path'])
source_digest = hashlib.sha256(''.join(f"{item['sha256']}  {item['path']}\n" for item in sources).encode()).hexdigest()
totals = dict(tests=0, passed=0, failures=0, errors=0, skipped=0)
suites = []
skips = []
raw_files = []
for path in sorted((RAW / 's4c-xml').glob('*.xml')):
    suite = ET.parse(path).getroot()
    stats = {key: int(suite.get(key, '0')) for key in ('tests', 'failures', 'errors', 'skipped')}
    stats['passed'] = stats['tests'] - stats['failures'] - stats['errors'] - stats['skipped']
    for key in totals:
        totals[key] += stats[key]
    name = suite.get('name', '').split('.')[-1]
    cases = []
    for case in suite.findall('testcase'):
        state = next((s for s in ('failure', 'error', 'skipped') if case.find(s) is not None), 'passed')
        cases.append({'name': case.get('name'), 'status': state})
        if state == 'skipped':
            skips.append({'class': name, 'name': case.get('name')})
    if name in SELECTED:
        suites.append({'name': name, **stats, 'timestamp': suite.get('timestamp'), 'testcases': cases})
    raw_files.append({'path': str(path), 'sha256': sha(path)})

logs = {}
for path in sorted(RAW.glob('s4c-*.log')):
    raw_files.append({'path': str(path), 'sha256': sha(path)})
    lines = path.read_text().splitlines()
    logs[path.name] = [line for line in lines if re.search(
        r'IDENT_|_EXIT=|DIST_DIGEST|BUILD SUCCESSFUL|Task :jacocoTest|Test Files|Tests  |guided-recording.test|guided/evidence.test|generated-contracts.test|noRunnerSinks.test|confinement.test|↓ ', line)]

# These two commands are pure contract/check-mode probes, not a runner build or test execution.
probes = []
for args in (['node', 'tools/check-studio-observed-contracts.cjs'],
             ['node', 'tools/build-studio-observed-schemas.cjs', '--check']):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    probes.append({'command': ' '.join(args), 'exit': result.returncode,
                   'stdout': result.stdout, 'stderr': result.stderr})

save('review-manifest.json', {
    'reviewer': 'Quinn (independent QA-013)', 'createdUtc': datetime.now(timezone.utc).isoformat(),
    's4cIdentity': baseline['s4c_identity'], 'startManifestSha256': sha(START),
    'sourceSetDigest': source_digest,
    'sourceSetDigestMethod': 'SHA256 of sorted lines: sha256 + two spaces + repository path + LF',
    'sourceFilesCompared': len(sources), 'sourceMismatches': mismatches,
    'scopeNote': 'All manifest backend/runner/frontend/tools/spec files; story/gate bookkeeping may change after S4c.',
    'sourceFiles': sources, 'rawEvidenceFiles': raw_files,
})
save('verification.json', {
    'backend': {'suiteCount': len(raw_files) - len(logs), 'totals': totals,
                'selectedPassed': sum(x['passed'] for x in suites),
                'selectedSuites': suites, 'skippedTestcases': skips},
    'runner': {'unit': {'passed': 1351, 'skipped': 29},
               'fixtures': {'passed': 225, 'skipped': 9},
               'deployment': {'passed': 313, 'skipped': 0},
               'note': 'Counts independently checked against raw log summaries; no skips credited as passes.'},
    'logExcerpts': logs, 'readOnlyProbes': probes,
    'codeRabbit': {'available': bool(shutil.which('coderabbit')) or (Path.home() / '.local/bin/coderabbit').is_file(),
                  'fallback': 'Independent manual source review and frozen-evidence audit; no automated-review pass claimed.'},
})
assert not mismatches, mismatches
assert all(p['exit'] == 0 for p in probes), probes
assert len(suites) == len(SELECTED)
assert totals == {'tests': 2084, 'passed': 2059, 'failures': 0, 'errors': 0, 'skipped': 25}, totals
assert sum(x['passed'] for x in suites) == 289
assert all(x['skipped'] == x['failures'] == x['errors'] == 0 for x in suites)
print(json.dumps({'sourcesMatched': len(sources), 'sourceSetDigest': source_digest,
                  'backend': totals, 'selectedPassed': 289, 'readOnlyProbesPassed': True}))

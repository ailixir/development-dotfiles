#!/usr/bin/env python3
"""Read-only exact patch, scope, reference and preservation checks; no runtime tools."""
from pathlib import Path
import collections
import hashlib
import json
import re
import sys

BASE = Path(__file__).resolve().parent
ROOT = next(p for p in BASE.parents if (p / '.aiox-core/constitution.md').is_file())
manifest = json.loads((BASE / 'manifest.json').read_text())
applied = '--applied' in sys.argv
authored_applied = '--authored-applied' in sys.argv
assert not (applied and authored_applied)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def section(text, number):
    match = re.search(r'^## ' + str(number) + r'\. [^\n]+\n', text, re.M)
    assert match, number
    next_section = re.search(r'^## \d+\. ', text[match.end():], re.M)
    end = match.end() + next_section.start() if next_section else len(text)
    return text[match.start():end]


def apply_exact(original, patch, target):
    """Require every unified hunk context/removal byte to match; apply only in memory."""
    lines = patch.splitlines(keepends=True)
    assert lines[:2] == ['--- a/' + target + '\n', '+++ b/' + target + '\n'], target
    source = original.splitlines(keepends=True)
    cursor = 0
    out = []
    index = 2
    while index < len(lines):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', lines[index])
        assert match, lines[index]
        old_start, old_count, new_start, new_count = [int(x) if x is not None else 1 for x in match.groups()]
        old_index = old_start - 1 if old_count else old_start
        assert old_index >= cursor
        out.extend(source[cursor:old_index])
        cursor = old_index
        assert len(out) == (new_start - 1 if new_count else new_start)
        consumed = produced = 0
        index += 1
        while index < len(lines) and not lines[index].startswith('@@ '):
            line = lines[index]
            assert line[0] in ' +-'
            if line[0] in ' -':
                assert cursor < len(source) and source[cursor] == line[1:], (target, cursor + 1)
                cursor += 1
                consumed += 1
            if line[0] in ' +':
                out.append(line[1:])
                produced += 1
            index += 1
        assert (consumed, produced) == (old_count, new_count), target
    out.extend(source[cursor:])
    return ''.join(out)


checked = []
texts = {}
patch_groups = {'authored-docs': [], 'root-merge-only': [], 'all-documentation': []}
for item in manifest['targets']:
    before = (BASE / item['original']).read_bytes()
    after = (BASE / item['preview']).read_bytes()
    live = (ROOT / item['target']).read_bytes()
    assert sha(before) == item['originalSha256']
    assert sha(after) == item['outputSha256']
    expect_output = applied or (authored_applied and not item['rootMergeOnly'])
    expected_live = item['outputSha256'] if expect_output else item['originalSha256']
    assert sha(live) == expected_live, 'Target drift: ' + item['target']
    patch = (BASE / item['patch']).read_text()
    assert apply_exact(before.decode(), patch, item['target']).encode() == after
    patch_groups['all-documentation'].append(patch)
    patch_groups['root-merge-only' if item['rootMergeOnly'] else 'authored-docs'].append(patch)
    texts[item['target']] = (before.decode(), after.decode())
    old_dates = collections.Counter(re.findall(r'\b20\d{2}-\d{2}-\d{2}\b', before.decode()))
    new_dates = collections.Counter(re.findall(r'\b20\d{2}-\d{2}-\d{2}\b', after.decode()))
    assert all(new_dates[d] >= count for d, count in old_dates.items()), item['target']
    checked.append({'target': item['target'], 'strictPatchReconstruction': True,
                    'originalAndPreviewHashesMatch': True,
                    'liveBytesMatch': 'output' if expect_output else 'original',
                    'allOriginalDateOccurrencesPreserved': True})
for group, patches in patch_groups.items():
    assert (BASE / ('patches/' + group + '.patch')).read_text() == ''.join(patches)
assert len(patch_groups['authored-docs']) == 5
assert len(patch_groups['root-merge-only']) == 2
assert (BASE / 'AGENTS.md.patched').read_text() == texts['AGENTS.md'][1]
assert (BASE / 'README.md.patched').read_text() == texts['studio-runner/README.md'][1]
review_path = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/engineering-doc/review.md'
assert sha(review_path.read_bytes()) == manifest['independentReviewSha256']

runbook = 'docs/runbooks/studio-runner.md'
before, after = texts[runbook]
section_proof = []
for number in [4, 14]:
    old = section(before, number).encode()
    new = section(after, number).encode()
    assert old == new
    section_proof.append({'section': number, 'originalSha256': sha(old), 'outputSha256': sha(new),
                          'bytes': len(old), 'byteIdentical': True})
# Every changed runbook line must be in the header or a permitted numbered section.
changed_sections = []
for number in range(1, 15):
    if section(before, number) != section(after, number):
        assert number in [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]
        changed_sections.append(number)
assert 'UAT breaks on upgrade unless the first two exist first' in section(after, 14)

inventory = 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md'
assert texts[inventory][1].startswith(texts[inventory][0])
old_arch_plan = texts['ARCH.md'][0].split('- **Implementation:** We will use **Mock Service Worker', 1)[1].split('\n---', 1)[0]
assert old_arch_plan in texts['ARCH.md'][1]
flags = ['studioAuthoringV2', 'STUDIO_AUTHORING_V2_ENABLED', 'STUDIO_INCREMENTAL_ENABLED']
rollout = texts['docs/runbooks/studio-inference-rollout.md'][1]
assert 'Dated correction — 2026-10-18' in rollout
assert all(flag in rollout for flag in flags)
assert 'complete API lifecycle' not in rollout
assert 'independent fixture oracles' in rollout

def mock_range(text):
    return text.split('### Mock-First Development\n', 1)[1].split('### Module Federation Integration', 1)[0]


def env_line(text):
    return next(line for line in text.splitlines() if line.startswith('- Environment variables in'))


assert mock_range(texts['CLAUDE.md'][1]) == mock_range(texts['AGENTS.md'][1])
assert env_line(texts['CLAUDE.md'][1]) == env_line(texts['AGENTS.md'][1])
for target in ['CLAUDE.md', 'AGENTS.md']:
    old, new = texts[target]
    if '### Accessibility Scope\n' in old:
        old_scope = old.split('### Accessibility Scope\n', 1)[1].split('\n### ', 1)[0]
        new_scope = new.split('### Accessibility Scope\n', 1)[1].split('\n### ', 1)[0]
        assert old_scope == new_scope
readme = texts['studio-runner/README.md'][1]
assert '## Security model\n' in readme
assert 'Generated source is **never evaluated**.' in readme
assert 'There is no `eval`' in readme
for needle in ['validateArtifact', '## Bounds', '## Accepted language', '## Fixture corpora',
               '### Text-entry role equivalence', '### Visible-only resolution', '### Adding a reference example']:
    assert needle not in readme, needle
old_readme = texts['studio-runner/README.md'][0]
# Every additional delta is an exact root-approved replacement on the prior reviewed preview.
replacements = json.loads((BASE / 'exact-approved-replacements.json').read_text())
for target, (_, output) in texts.items():
    prior = (BASE.parent / 'preview' / target).read_text()
    for change in replacements:
        if change['target'] == target:
            assert prior.count(change['old']) == 1
            prior = prior.replace(change['old'], change['new'], 1)
    assert prior == output, ('Unapproved additional delta', target)
# The only changes from Versions through EOF are the two upgrade paragraphs and exact
# active Node sentence / separate-artifact sentence. All other history and current policy is exact.
prior_readme = (BASE.parent / 'preview/studio-runner/README.md').read_text()
prior_tail = prior_readme[prior_readme.index('## Versions\n'):]
for change in replacements:
    if change['target'] == 'studio-runner/README.md' and change['old'] in prior_tail:
        assert change['ruling'] in ['EDOC-R2 upgrade corpus', 'EDOC-R2 upgrade replacement',
                                    'EDOC-R2 active Node sentence only', 'EDOC-R2 retired separate claim']
        prior_tail = prior_tail.replace(change['old'], change['new'], 1)
assert prior_tail == readme[readme.index('## Versions\n'):]
assert 'pins used to say 22' in readme
assert 'the Node22/internal-image' not in readme
assert 'the Node24/internal-image' in readme
assert 'All four require' not in readme
assert 'Legacy artifact 1 validation, AST semantics and protocol 1 remain separate.' not in readme
assert 'default-deny AST validation' not in readme
assert '| `src/validator/` | Browser-free observed' in readme
assert '| `src/executor/` | Observed operation' in readme
assert '`src/evidence/` directory.' in readme
assert 'These five ordinary routes' in readme
route_table = readme.split('### Routes\n', 1)[1].split('These five ordinary routes', 1)[0]
assert route_table.count('| `POST /v2/validate-observed` |') == 1
assert route_table.count('| `POST /v2/runs` |') == 1
assert route_table.count('| `DELETE /v2/runs/{id}` |') == 1
assert route_table.count('| `GET /health` |') == 1
assert route_table.count('| `GET /ready` |') == 1
for target in ['CLAUDE.md','AGENTS.md','ARCH.md']:
    assert "literal `.replace('/api', '')` transform" in texts[target][1]
    assert 'suffix removed' not in texts[target][1]
for item in json.loads((BASE/'current-input-hashes.json').read_text()):
    assert sha((ROOT/item['path']).read_bytes()) == item['sha256'], item['path']
prior_manifest = json.loads((BASE/'prior-package-manifest.json').read_text())
assert all(sha((BASE.parent/p).read_bytes()) == digest for p,digest in prior_manifest['files'].items())


# Source references substantiate the scoped prose. Each marker is matched against a hash-bound file.
references = {
    'frontend/src/services/mocks/studio/server.ts': ['msw/node', 'setupServer'],
    'frontend/e2e/mswProxy.ts': ['msw'],
    'frontend/vite.config.ts': ["'/api/v1'", "env.VITE_API_URL || 'http://localhost:8080'"],
    'frontend/webpack.config.js': ["context: ['/api/v1']", "process.env.REACT_APP_API_BASE_URL?.replace('/api', '')"],
    'frontend/src/components/providers/realStudioStartup.test.ts': ['mockServiceWorker.js', 'browser.ts', 'not.toContain'],
    'helm-chart/put-checks/templates/studio-runner-deployment.yaml': ['guided-journal', 'mountPath: /tmp', 'emptyDir:'],
    'helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml': ['worker.selectorLabels', 'api.selectorLabels', 'tlsConnector.port'],
    'helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml': ['guided-tls-ingress', 'worker.selectorLabels'],
    'helm-chart/put-checks/templates/_helpers.tpl': ['acceptedEnvKeys', 'studiocompilegatewayprovider', 'studio.guided-authoring.connector.port'],
    'helm-chart/put-checks/templates/deployment.yaml': ['STUDIO_GATEWAY_MODEL', 'STUDIO_GATEWAY_PROVIDER'],
    'studio-runner/src/server/config.ts': ['KEY_SPECS', 'ACCEPTED_KEYS'],
    'studio-runner/src/server/routes.ts': ['/v2/validate-observed', '/v2/runs', 'controller-or-self', 'The five internal routes', "options.peer.check", 'identity.check', 'options.guided.handle'],
    'studio-runner/package.json': ['>=24.11.0 <25.0.0'],
    'studio-runner/.nvmrc': ['24'],
    'studio-runner/src/run/evidenceUpload.ts': ['STORED', 'partial', 'store'],
    'studio-runner/src/run/manifest.ts': ['serializeResultManifest', 'buildResultManifest'],
    'studio-runner/src/executor/observedReplay.ts': ['secretRef', 'sourceInputId', 'secretOrigins'],
    'studio-runner/src/validator/observedReplay.ts': ['version: 3', "intendedSlot === 'fill.value'"],
    'studio-runner/scripts/write-runtime-versions.mjs': ['observed-reference', 'accepted-observed-choice.json'],
    'studio-runner/src/server/server.ts': ['requestCert: true', 'rejectUnauthorized: true'],
    'studio-runner/evaluation/cli.mjs': ["from './oracle.mjs'", "from './report.mjs'"],
    'studio-runner/evaluation/README.md': ['independent', 'lifecycle.mjs'],
    'backend/src/main/java/com/citi/put/checks/studio/dispatch/DispatchState.java': ['DISPATCHING', 'ADMITTED', 'FINALIZING', 'DONE'],
    'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatchLedgerStatements.java': ['TRANSITION_MATRIX'],
    'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java': ['properties.enabledOrDefault()'],
    'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatcher.java': ["WHERE state IN ('QUEUED', 'CLAIMED')"],
    'backend/src/main/java/com/citi/put/checks/studio/evidence/ExecutionVideoService.java': ['studioService.findExecutionById', 'ManifestKeys.videoKey', 'objects.serve'],
    'backend/src/main/java/com/citi/put/checks/studio/evidence/VideoObjectServer.java': ['serve'],
    'backend/src/main/java/com/citi/put/checks/studio/recovery/ManifestKeys.java': ['.result.json', '.webm'],
    'backend/src/main/java/com/citi/put/checks/studio/recovery/PendingReaper.java': ['class PendingReaper'],
    'backend/src/main/java/com/citi/put/checks/studio/recovery/RunningReaper.java': ['class RunningReaper'],
    'backend/src/main/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceService.java': ['class GuidedSessionEvidenceService'],
    'backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java': ['put_session'],
    'backend/src/main/java/com/citi/put/checks/config/SecurityConfig.java': ['setAllowCredentials(true)', 'http.csrf(csrf -> csrf.disable())'],
    'backend/src/main/java/com/citi/put/checks/studio/secrets/ConfiguredSecretUseAuthorization.java': ['entitlements'],
    'backend/src/main/java/com/citi/put/checks/studio/gateway/StudioGatewayProperties.java': ['prefix = "studio.gateway"'],
    'backend/src/main/resources/db/migration/V18__drop_plaintext_secrets.sql': ['DROP TABLE'],
    'backend/src/main/resources/db/migration/V19__guided_governance.sql': ['CREATE TABLE'],
    'docs/runbooks/studio-integrations.md': ['S3'],
    'docs/runbooks/studio-guided-authoring.md': ['session'],
}
source_evidence = []
for path, markers in references.items():
    data = (ROOT / path).read_bytes()
    text = data.decode()
    evidence = []
    for marker in markers:
        assert marker in text, (path, marker)
        evidence.append({'marker': marker, 'firstLine': text[:text.index(marker)].count('\n') + 1})
    source_evidence.append({'path': path, 'sha256': sha(data), 'matches': evidence})
absent = ['frontend/public/mockServiceWorker.js', 'frontend/src/services/mocks/studio/browser.ts',
          'studio-runner/evaluation/lifecycle.mjs']
assert all(not (ROOT / path).exists() for path in absent)
report = {'scope': 'static off-tree package verification only', 'mode': 'applied-output' if applied else ('authored-applied' if authored_applied else 'unapplied-original'),
          'allChecksPassed': True, 'targets': checked, 'preservedSections': section_proof,
          'combinedAndSplitPatchCompositionExact': True, 'rootOnlyFullPreviewAliasesExact': True,
          'runbookChangedSections': changed_sections, 'headerDatedNote': True,
          'inventoryAppendOnly': True, 'archHistoricalPlanPreserved': True,
          'cln51RangesIdentical': True, 'accessibilityScopePreserved': True,
          'readmeVersionsThroughEndChangesExactlyApproved': True, 'priorPackageUnchanged': True,
          'allAdditionalDeltasExactApprovedReplacements': True, 'retiredFlagsDatedHistoricalOnly': True,
          'oracleWordingRetained': True, 'sourceReferences': source_evidence,
          'absenceChecks': absent, 'runtimeBuildTestFormatterDockerProviderCalls': 0,
          'limitations': ['No target application', 'No baseline or lane gate cleared',
                          'No runtime/deployment or external acceptance', 'No lifecycle/QA/release verdict']}
print(json.dumps(report, indent=2))

#!/usr/bin/env python3
"""Static, off-tree 11-DOC preparation. Never writes an actual target."""
from pathlib import Path
import difflib
import hashlib
import json
import re

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[6]
assert (ROOT / 'AGENTS.md').is_file(), ROOT
TARGETS = [
    'CLAUDE.md', 'AGENTS.md', 'ARCH.md',
    'docs/runbooks/studio-inference-rollout.md',
    'docs/runbooks/studio-runner.md', 'studio-runner/README.md',
    'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md',
]
originals = {p: (ROOT / p).read_text() for p in TARGETS}
outputs = dict(originals)


def replace_once(text, old, new):
    assert text.count(old) == 1, old[:120]
    return text.replace(old, new, 1)


mock_prose = '''### Mock-First Development
The MSW handlers in `frontend/src/services/mocks/` run only in Node: the Vitest server
(`src/services/mocks/studio/server.ts`) and the Playwright `msw` project proxy (`e2e/mswProxy.ts`).
There is no browser worker. The standalone Vite dev server proxies `/api/v1` to `VITE_API_URL`
(default `http://localhost:8080`); federated Webpack uses `REACT_APP_API_BASE_URL` with its `/api`
suffix removed (the same default). Development servers use the backend; Node test mocks provide
controlled API responses for independent frontend tests.

'''
environment = '- Environment variables in `.env.development` configure API URLs; there is no browser MSW enablement flag.'
for target in ['CLAUDE.md', 'AGENTS.md']:
    before, rest = outputs[target].split('### Mock-First Development\n', 1)
    _, after = rest.split('### Module Federation Integration', 1)
    outputs[target] = before + mock_prose + '### Module Federation Integration' + after
    outputs[target] = replace_once(outputs[target], '- Environment variables in `.env.development` control MSW enablement and API URLs', environment)

outputs['ARCH.md'] = replace_once(outputs['ARCH.md'], '''2. **Mock Backend (MSW - Mock Service Worker):**
   - Browser-intercepted API layer providing realistic responses during development
   - Comprehensive mock data for all check types, CSI entities, execution results
   - Located in `src/services/mocks/` with handlers organized by domain
   - Enables full application functionality without backend dependency''', '''2. **Node test mocks (MSW - Mock Service Worker):**
   - Handlers in `frontend/src/services/mocks/` run only in Node: the Vitest server (`src/services/mocks/studio/server.ts`) and the Playwright `msw` project proxy (`e2e/mswProxy.ts`)
   - There is no browser worker; development servers use the backend
   - Vite proxies `/api/v1` to `VITE_API_URL` (default `http://localhost:8080`); federated Webpack uses `REACT_APP_API_BASE_URL` with its `/api` suffix removed (the same default)
   - Controlled test responses support frontend tests without a backend dependency''')
outputs['ARCH.md'] = replace_once(outputs['ARCH.md'], '   - Mock-first development using MSW for all API interactions', '   - Backend-connected development servers with Node-only MSW API mocks for Vitest and the Playwright `msw` project')
outputs['ARCH.md'] = replace_once(outputs['ARCH.md'], '### **3.2. Mock Service Strategy**\n', '''### **3.2. Mock Service Strategy**

> **Dated correction — 2026-10-18, STUDIO-OBS-011 CLN-51 (G11).** The plan below is retained as
> history. Today MSW runs only in the Node Vitest server and Playwright `msw` project proxy named
> in §2.1. Development servers proxy API traffic to the backend; no browser worker is installed.
''')

rollout = 'docs/runbooks/studio-inference-rollout.md'
outputs[rollout] = replace_once(outputs[rollout], '## Configuration and local verification\n', '''## Configuration and local verification

> **Dated correction — 2026-10-18, STUDIO-OBS-011 CLN-49 (G11).** The following flag paragraph
> records the retired v1/v2 rollout; it is not an enablement procedure for the single observed
> path. Its UI selector and authoring/incremental feature flags no longer exist. Current local
> wiring is documented in [Studio integrations](studio-integrations.md), and guided/replay
> deployment inputs in [the runner runbook §14](studio-runner.md#14-one-entrypoint-tls-everywhere-the-one-pod-guard-and-the-new-secrets-studio-obs-009).
> Gateway configuration remains a separate deployment decision; this note authorizes no provider
> call or shared-environment enablement.
''')
outputs[rollout] = replace_once(outputs[rollout], 'Its CLI executes the complete API lifecycle and independent fixture oracles, but always reports release readiness false.', 'Its CLI provides independent fixture oracles, but always reports release readiness false.')

runner_readme = 'studio-runner/README.md'
text = outputs[runner_readme]
start = text.index('## Bounds (AC-10 defaults)\n')
end = text.index('## Versions\n', start)
text = text[:start] + text[end:]
text = replace_once(text, '| `POST /v1/validate` | Browser-free wrapper over `validateArtifact` with bounded work. Takes **no capacity slot**, so it answers while the pool is saturated. |\n', '')
start = text.index('Generated source is **never evaluated**. `validateArtifact`')
end = text.index('There is no `eval`', start)
text = text[:start] + '''> **Dated cleanup — 2026-10-18, STUDIO-OBS-011 C-OBS009-3.** The artifact-1 parser,
> accepted-language rules, bounds and reference/adversarial corpora sections were retired with
> that engine (STUDIO-OBS-012A). Current observed validation independently derives the frozen
> plan from immutable evidence; see “Observed replay (artifact 2)” below. This cleanup does not
> change the destination, secret-use or transport authorization requirements.

Generated source is **never evaluated**.

''' + text[end:]
outputs[runner_readme] = text

runbook = 'docs/runbooks/studio-runner.md'
text = outputs[runbook]
header_note = '''> **Dated static re-audit — 2026-10-18, STUDIO-OBS-011 C-OBS009-3 (G11).** Sections 1–3
> and 5–13 were compared with the current single-path source and chart templates. The dated
> V1 assembly/audit records below remain historical; current corrections are marked at each
> affected section. This is source review, not a render, image, cluster or production acceptance
> result. Section 4 and all of section 14 remain byte-identical. In particular, §14.4 already
> contains the UAT upgrade note; its real deployment prerequisites remain open. The §2 connector
> row below corrects the historical gap recorded in unchanged §14.6. See the STUDIO-OBS-010
> [guided-authoring runbook](studio-guided-authoring.md) for sessions, drain and abandon.

'''
text = replace_once(text, '| Field | Value |\n', header_note + '| Field | Value |\n')
notes = {
1: '''> **Re-audit — 2026-10-18 (single observed path).** The historical two-writable-mount
> description below covers replay scratch and `/dev/shm`; guided mode additionally mounts `/tmp`
> and a separate bounded journal `emptyDir` (`studio-runner-deployment.yaml`). The journal is
> disjoint from scratch and trust/credential mounts. A local object-store volume is another
> provider-dependent writable mount. The image's current `CMD` and PID/drain requirements are
> in unchanged §§4/14.5, rather than the old bare-exec wording below. Non-root, sandbox,
> read-only root and the unresolved in-cluster sandbox proof remain unchanged.
''',
2: '''> **Re-audit — 2026-10-18 (single observed path).** The current network-policy template
> permits API and worker ingress to the runner TLS listener. `callback-api` includes the ordinary
> API callback port and, only with guided mode on, the TLS connector port (default 8443). The
> table reflects those two source corrections. The replay callback's ordinary API port has not
> been made TLS by this note. The separate API guided-ingress policy, narrow backend trust store
> and certificate pin requirements remain §14.2; no extra destination class is added. The broad
> object-store IP rule and CNI/approved-target proof still need Platform/SRE and Security evidence.
> Observed grants bind approved destinations and secret-origin policy; the old job-envelope
> statement below is historical, not a claim that observed policy is absent.
''',
3: '''> **Re-audit — 2026-10-18 (single observed path).** Replay evidence remains under the
> execution/attempt key (`ManifestKeys`); the API applies the snapshot's video status and serves
> through `ExecutionVideoService`/`VideoObjectServer`. Guided learn-run recordings use the separate
> `GuidedSessionEvidenceService` path described in the guided-authoring runbook. This review does
> not certify any cloud principal, endpoint, real lifecycle deletion or credential denial. The
> current local/AWS S3 integration guide at the top of this document supersedes older Sonic setup
> wording, while logical expiry and separate writer/reader responsibilities remain.
''',
5: '''> **Re-audit — 2026-10-18 (single observed path).** The authoritative dispatch vocabulary
> is `QUEUED → CLAIMED → DISPATCHING → ADMITTED → RUNNING → FINALIZING → DONE`
> (`DispatchState`, enforced by `StudioDispatchLedgerStatements`). The shorter table below is a
> historical explanation, not today's exact stored-state vocabulary: there is no `DISPATCHED`
> state. Existing reaper/kill-switch transitions, idempotency and the prohibition on manual ledger
> edits still apply. Guided session lease/teardown state is a different state machine; use the
> guided-authoring runbook and never redispatch an ambiguous browser action. The explicit
> dispatcher setting and its packaged-default/Java-default distinction remain as stated.
''',
6: '''> **Re-audit — 2026-10-18 (single observed path).** `StudioAcceptanceService` still checks
> `studio.execution.enabled` before test lookup; `StudioDispatcher` closes queued/claimed work
> separately from dispatcher enablement. The switch is a replay-admission control, not a claim
> that a guided learning session has been cancelled or its browser teardown confirmed. Guided
> stop/drain/abandon follows the separate guided-authoring procedure; do not infer that disabling
> replay stops an admitted native action. Reads and recovery remain available.
''',
7: '''> **Re-audit — 2026-10-18 (single observed path).** Existing execution SSE/GET/video
> authorization and the distinct stream Ingress remain the replay observation path. Guided
> sessions have their own session/evidence routes; an SSE disconnect never grants authority to
> cancel or replay an action. `ExecutionVideoService` authorizes via the execution snapshot before
> reading any object. Real proxy/cookie/idle-timeout/cross-replica observations remain unproven;
> nothing in this text correction closes SPK-02 or introduces sticky sessions.
''',
8: '''> **Re-audit — 2026-10-18 (single observed path).** `ManifestKeys` derives
> `studio/{csiId}/{testId}/{executionId}/{attemptId}.result.json` and the matching `.webm` from
> immutable identity. `PendingReaper`/`RunningReaper` reconcile durable execution state; recovery
> reads evidence and does not replay an uncertain browser action. Guided journal/receipt ownership
> is separate and must not be reconstructed by deleting a journal or choosing a stray recording.
> Real-store consistency and physical deletion timing remain external measurements.
''',
9: '''> **Re-audit — 2026-10-18 (single observed path).** The three configured bypasses and
> local-only developer filter remain distinct; no Core identity, Vault policy or credentialed-pilot
> acceptance is inferred from chart defaults or tests. Current secret access still uses the
> development entitlement policy and `allowedOrigins`, and the runner has no Vault credentials.
> The dated compile-path descriptions below are historical. The rebased schema drops plaintext
> secrets in `V18__drop_plaintext_secrets.sql`, so the older `V25` citation records the former
> migration numbering. This is a citation correction, not a migration edit or a change to ED-02.
''',
10: '''> **Re-audit — 2026-10-18 (single observed path).** Source still reads `put_session`,
> enables credentialed CORS and disables Spring CSRF. No platform cookie/SameSite evidence or
> written accepting control was supplied by this re-audit. The open prerequisite, owner and
> public-contract change constraint below remain; guided/secret routes do not waive them.
''',
11: '''> **Re-audit — 2026-10-18 (single observed path).** Mounted Spring properties, reserved
> profile selectors and managed TLS/guided properties remain chart-owned. Current gateway beans
> bind `studio.gateway.*`; the `studio.compile.gateway.*` wording below is historical and is not
> a current bean prefix. The chart helper still enumerates legacy compile-gateway override guard
> spellings; this source review does not assert that those guards protect every new gateway alias.
> Use dedicated chart gateway values and §14 TLS/token inputs, and retain this guard discrepancy
> for architecture/DevOps disposition. Secret files and profile/source restrictions are unchanged.
''',
12: '''> **Re-audit — 2026-10-18 (single observed path).** The old artifact-1 release order in
> (e) is already marked superseded. The historical V19 hand-cutover and V20–V25 migration citations
> in (c)/§9 do not describe the rebased classpath: current `V19__guided_governance.sql` is an
> ordinary Flyway migration, and the Studio lineage is V12–V22. Do not run the old V19 cutover
> against this schema or assume an artifact-1 application supports the rebased database. Database
> changes remain forward-only; chart rollback cannot restore a removed schema or evidence.
> Current upgrade inputs and quiet-window requirements are §14.4 and the guided-authoring runbook.
> No rollback rehearsal, certificate issuance or deployment is claimed by this note.
''',
13: '''> **Re-audit — 2026-10-18 (single observed path).** The model transport now serves
> observed guided authoring (`studio.gateway.*`); saved observed replay makes no model call.
> The shipped UAT/production gateway literals and dedicated ConfigMap references below remain
> configuration, not proof of a live provider request, schema/quota acceptance or user pilot.
> Guided session/publication and the exact build/catalog/policy inputs additionally follow §14
> and the guided-authoring runbook. This does not authorize enabling a provider, replacing an
> approved model or weakening any identity, TLS or authorization gate.
''',
}
for section, note in notes.items():
    pattern = re.compile(r'(^## ' + str(section) + r'\. [^\n]+\n)', re.M)
    assert len(pattern.findall(text)) == 1, section
    text = pattern.sub(lambda match: match[0] + '\n' + note, text, count=1)
text = replace_once(text, '| Ingress | the **worker** pods only, on the runner\'s Service port | §8.4: the internal routes are not public and the MFE never talks to the runner. Dispatch runs on the worker profile, not the API\'s |', '| Ingress | the **API and worker** pods, on the runner\'s TLS Service port | Internal observed validation/dispatch and guided control; the MFE never talks to the runner |')
text = replace_once(text, '| Egress | the **API** pods, on the API Service port | `callback-api`: admission and progress. Without this the terminal report never arrives |', '| Egress | the **API** pods, on the ordinary API Service port and, with guided mode on, `studioRunner.guided.tlsConnector.port` (default 8443) | `callback-api`: replay admission/progress on the ordinary port; guided callbacks/claim on the TLS connector port |')
outputs[runbook] = text

helper = (ROOT / 'helm-chart/put-checks/templates/_helpers.tpl').read_text()
closed_block = helper.split('{{- define "put-checks.studioRunner.acceptedEnvKeys" -}}\n', 1)[1].split('{{- end }}', 1)[0]
closed = sorted(set(re.findall(r'STUDIO_RUNNER_[A-Z][A-Z0-9_]*', closed_block)))
raw_chart = sorted({key for p in (ROOT / 'helm-chart').rglob('*') if p.is_file()
                    for key in re.findall(r'STUDIO_RUNNER_[A-Z][A-Z0-9_]*', p.read_text(errors='replace'))})
config = (ROOT / 'studio-runner/src/server/config.ts').read_text()
specs = config.split('const KEY_SPECS: Readonly<Record<string, KeySpec>> = {', 1)[1].split('\n};', 1)[0]
accepted = sorted('STUDIO_RUNNER_' + key for key in re.findall(r'^  ([A-Z][A-Z0-9_]*):', specs, re.M))
assert (len(raw_chart), len(closed), len(accepted)) == (61, 53, 57)
assert set(closed) <= set(accepted)
inventory = 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md'
outputs[inventory] += '''

## 7. Dated static re-verification addendum — 2026-10-18 (STUDIO-OBS-011 11-DOC)

This append-only note preserves §1–§6, all historical row text and totals. It records static
re-verification and the corresponding 11-DOC correction proposal; application and lifecycle/QA
acceptance belong to the root's gated merge. Exact source/output hashes and patch applicability
are in `docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/manifest.json`.

| Item | Current static evidence | Disposition and remaining owner |
|---|---|---|
| CLN-44 / Gage X-9 | Post-residue chart scan: **61 distinct `STUDIO_RUNNER_*` tokens** across `helm-chart/` (including comment/prefix tokens and backend aliases); the exact `acceptedEnvKeys` block has **53 complete keys**, all in the loader's **57-key** `KEY_SPECS` set. The remaining four loader keys are INSTANCE_ID, SERVICE_IDENTITY, CALLBACK_IDENTITY and CALLBACK_BASE_URL. | **K remains.** These are three different counts, not 61 rendered runner variables. Static subset proof is not a fresh rendered/deployment test; the final gate remains @devops/@qa's. |
| CLN-49 / RC-8 | Retired UI selector/authoring/incremental flags survive only in the rollout runbook's historical paragraph; `evaluation/lifecycle.mjs` is absent. The CLI still imports `oracle.mjs`/`report.mjs`, and R-EP v2 carries that layer. | Dated historical flag note and removal of only the live complete-lifecycle claim proposed. **Independent fixture-oracle wording stays.** Actual benchmark/release evidence remains with 009/010. |
| CLN-51 | No browser worker or studio browser mock module; `server.ts` imports `msw/node`; Playwright uses `e2e/mswProxy.ts`. Vite reads `VITE_API_URL`, whereas active Webpack reads `REACT_APP_API_BASE_URL` with `/api` removed; both default to localhost:8080. | Matching CLAUDE/AGENTS wording proposed, ARCH live mechanism corrected and its recorded plan retained with a dated note. Root must confirm the accurate variable distinction; accessibility scope is byte-preserved. |
| C-OBS009-3 | Artifact-1 Bounds/Accepted language/role-equivalence/visible-only/Fixture corpora/reference-example sections and parser text remain in the current README. Runbook §§1–3/5–13 were source-audited; §2 lacks the guided connector port. | Scoped README removal and dated runbook corrections proposed; §4/§14 byte-identical. §14.4 already contains the UAT upgrade note. Actual TLS/Secret/issuer/cluster prerequisites remain external, not new 11-DOC preconditions. |
| R-AI | The plan requires archive-first reconciliation of `.ai/` by root/DevOps; this off-tree documentation preparation has no ownership of `.ai/` or git staging. | **Pending root/DevOps archive receipt.** No archive, ignore decision execution or historical closure is claimed here. |

Commands and positive controls, exact key sets, unchanged dated-text checks and named residual
documentation findings are retained with the patch package. No source, contracts, migrations,
story lifecycle, historic gate verdict or actual deployment was changed by this addendum.
'''

manifest = {'story': 'STUDIO-OBS-011', 'lane': '11-DOC', 'mode': 'off-tree-only',
            'declaredBudgetUsd': 500, 'actualSpend': 'unavailable',
            'applicationGates': ['original B1 terminal reconciliation', 'fresh B7/root tree-open',
                                 'quoted-writer and file ownership handover',
                                 'root confirms CLN51 wording', 'root11MERGE for AGENTS/runner README'],
            'targets': []}
for target in TARGETS:
    before = originals[target].encode()
    after = outputs[target].encode()
    source_snapshot = BASE / 'originals' / target
    preview = BASE / 'preview' / target
    source_snapshot.parent.mkdir(parents=True, exist_ok=True)
    preview.parent.mkdir(parents=True, exist_ok=True)
    source_snapshot.write_bytes(before)
    preview.write_bytes(after)
    name = target.replace('/', '__') + '.patch'
    patch = ''.join(difflib.unified_diff(originals[target].splitlines(keepends=True),
                                       outputs[target].splitlines(keepends=True),
                                       fromfile='a/' + target, tofile='b/' + target))
    (BASE / 'patches').mkdir(exist_ok=True)
    (BASE / 'patches' / name).write_text(patch)
    manifest['targets'].append({'target': target, 'originalSha256': hashlib.sha256(before).hexdigest(),
                                'outputSha256': hashlib.sha256(after).hexdigest(),
                                'originalBytes': len(before), 'outputBytes': len(after),
                                'patch': 'patches/' + name, 'preview': 'preview/' + target,
                                'original': 'originals/' + target,
                                'rootMergeOnly': target in ['AGENTS.md', 'studio-runner/README.md'],
                                'change': 'append-only dated addendum' if target == inventory else 'scoped documentation correction'})
(BASE / 'patches' / 'all-documentation.patch').write_text(''.join((BASE / item['patch']).read_text() for item in manifest['targets']))
for name, root_only in [('authored-docs.patch', False), ('root-merge-only.patch', True)]:
    (BASE / 'patches' / name).write_text(''.join((BASE / item['patch']).read_text() for item in manifest['targets'] if item['rootMergeOnly'] == root_only))
manifest['patchSets'] = {
    'authoredDocsAfterRootTreeOpen': 'patches/authored-docs.patch',
    'root11MERGEOnly': 'patches/root-merge-only.patch',
    'allSevenForStaticApplicability': 'patches/all-documentation.patch',
}
(BASE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(BASE / 'cln44-key-census.json').write_text(json.dumps({'rawChartTokens': raw_chart, 'rawChartCount': len(raw_chart),
    'closedChartKeys': closed, 'closedChartCount': len(closed), 'loaderKeys': accepted,
    'loaderCount': len(accepted), 'unknownClosedKeys': sorted(set(closed) - set(accepted)),
    'loaderOnlyKeys': sorted(set(accepted) - set(closed)), 'kind': 'static source extraction; no Helm render'}, indent=2) + '\n')
print(json.dumps({'targets': len(manifest['targets']), 'actualTargetsWritten': False, 'package': str(BASE.relative_to(ROOT))}))

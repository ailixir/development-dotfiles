#!/usr/bin/env python3
"""Rebuild the complete approved text-only package, never apply an actual target."""
from pathlib import Path
import collections
import difflib
import hashlib
import json
import re

BASE = Path(__file__).resolve().parent
OLD = BASE.parent
ROOT = next(p for p in BASE.parents if (p / '.aiox-core/constitution.md').is_file())
sha = lambda b: hashlib.sha256(b).hexdigest()
dump = lambda p, v: (BASE / p).write_text(json.dumps(v, indent=2) + '\n')
old_manifest = json.loads((OLD / 'manifest.json').read_text())
old_package = {str(p.relative_to(OLD)): sha(p.read_bytes()) for p in OLD.rglob('*')
               if p.is_file() and BASE not in p.parents}
targets = [x['target'] for x in old_manifest['targets']]
originals = {p: (OLD / 'originals' / p).read_text() for p in targets}
outputs = {p: (OLD / 'preview' / p).read_text() for p in targets}
assert all((ROOT / p).read_bytes() == originals[p].encode() for p in targets)
changes = []

def replace(target, old, new, ruling):
    assert outputs[target].count(old) == 1, (target, old[:100])
    changes.append({'target': target, 'ruling': ruling, 'old': old, 'new': new})
    outputs[target] = outputs[target].replace(old, new, 1)

for target in ['CLAUDE.md', 'AGENTS.md']:
    replace(target,
        "(default `http://localhost:8080`); federated Webpack uses `REACT_APP_API_BASE_URL` with its `/api`\nsuffix removed (the same default). Development servers use the backend; Node test mocks provide",
        "(default `http://localhost:8080`); federated Webpack derives its target from\n`REACT_APP_API_BASE_URL` using the literal `.replace('/api', '')` transform in\n`frontend/webpack.config.js`, with `http://localhost:8080` as the unset/empty fallback.\nDevelopment servers use the backend; Node test mocks provide", 'EDOC-R1')
replace('ARCH.md',
    "federated Webpack uses `REACT_APP_API_BASE_URL` with its `/api` suffix removed (the same default)",
    "federated Webpack derives its target from `REACT_APP_API_BASE_URL` using the literal `.replace('/api', '')` transform in `frontend/webpack.config.js`, with `http://localhost:8080` as the unset/empty fallback", 'EDOC-R1')
inventory = 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md'
replace(inventory,
    'Vite reads `VITE_API_URL`, whereas active Webpack reads `REACT_APP_API_BASE_URL` with `/api` removed; both default to localhost:8080.',
    "Vite reads `VITE_API_URL`; active Webpack derives its proxy target from `REACT_APP_API_BASE_URL` with the literal `.replace('/api', '')` transform in `frontend/webpack.config.js`. Each uses localhost:8080 as its unset/empty fallback; this is not a suffix-normalization claim.", 'EDOC-R1 addendum only')
r = 'studio-runner/README.md'
replace(r, 'component that ever launches Chromium, and the only one that reads an LLM-proposed artifact.',
    'component that launches Chromium. It validates the data-only observed artifact against immutable\nevidence and executes the approved observed operations; it does not evaluate model-proposed source.', 'EDOC-R2 opening')
replace(r, '| `src/validator/` | Artifact envelope checks, default-deny AST validation, argument/reference schemas, bounds. Pure and browser-free. |',
    '| `src/validator/` | Browser-free observed schema, immutable-history/reference-policy and replay validation, with closed bounds. |', 'EDOC-R2 modules')
replace(r, '| `src/executor/` | Trusted executor over a `BrowserAdapter`, `StepReporter` and `ValueResolver`, with outbound redaction. |',
    '| `src/executor/` | Observed operation and replay execution, step reporting and outbound redaction. |', 'EDOC-R2 modules')
replace(r, '| `src/server/` | The four internal HTTP routes, the capacity pool, the service-identity check, bounded bodies and structured redacted logging. |',
    '| `src/server/` | Five ordinary internal HTTP routes, capacity and admission coordination, peer-pin/bearer checks, bounded bodies and structured redacted logging; optional guided transport has its own authorization. |', 'EDOC-R2 modules')
replace(r, "Not yet present: `src/evidence/` (10.14). Uploading a recording, the durable result manifest and\nthe `STORED` evidence state are 10.14's; a recording still lives and dies in scratch.",
    "Evidence upload, object-store adapters and durable result manifests are implemented under\n`src/run/` (`evidenceUpload.ts`, `objectStore.ts`, `s3ObjectStore.ts`, `manifest.ts`); there is no\n`src/evidence/` directory. `STORED` is earned only after the store acknowledges the upload.\nScratch cleanup remains separate from durable evidence retention.", 'EDOC-R2 evidence')
replace(r, "success, step failure, launch failure, error. The parent's `/v1/validate`, `/health`, `/ready` and\n`/v1/runs` stay responsive throughout, on separate bounded resources.",
    "success, step failure, launch failure, error. The parent's `/v2/validate-observed`, `/health`,\n`/ready` and `/v2/runs` routes stay responsive throughout, on separate bounded resources.", 'EDOC-R2 responsiveness')
replace(r, '| `POST /v1/runs` | Envelope → artifact → capacity slot → admission CAS → `202`. Nothing starts before the CAS succeeds. |',
    '| `POST /v2/validate-observed` | Browser-free observed validation with bounded work; takes no capacity slot. |\n| `POST /v2/runs` | Closed observed job → capacity slot → observed admission → `202`. Nothing starts before admission succeeds. |\n| `DELETE /v2/runs/{id}` | Cancel one admitted run: ordered stop, bounded grace and process-tree teardown. |', 'EDOC-R2 routes')
replace(r, 'All four require a restricted service identity in an `Authorization: Bearer` header, checked on the\nrequest head before the body is read, compared in constant time over SHA-256 digests. There is no\ncredential in any URL or query string, inbound or outbound.',
    'These five ordinary routes require a restricted service identity in an `Authorization: Bearer`\nheader, checked on the request head before the body is read, compared in constant time over\nSHA-256 digests. The CA-verified peer is pinned before the bearer: `/health` and `/ready` allow\nthe controller or runner self-probe; the other ordinary routes require the controller pin.\nOptional `/internal/v2/studio/guided-sessions/...` transport has its own pin and JWT; it does not\nuse ordinary replay authorization. There is no credential in any URL or query string, inbound\nor outbound.', 'EDOC-R2 route authorization')
replace(r, '| Condition | `/v1/runs` | `/ready` | Why |', '| Condition | `POST /v2/runs` | `/ready` | Why |', 'EDOC-R2 capacity')
replace(r, '`SIGTERM` runs, in this order: readiness goes false → new `/v1/runs` is refused `503` → the',
    '`SIGTERM` runs, in this order: readiness goes false → new `POST /v2/runs` is refused `503` → the', 'EDOC-R2 drain')
replace(r, "A secret appears in an artifact only as `vars.secret('ID')` and only as the value argument of\n`fill()` — the single approved position in V1. It is rejected in URLs, selectors, key arguments,\nassertion arguments and option values. Resolved values are produced by `ValueResolver.secret` at the\nmoment of the action call, are never placed in operation objects, and every outbound failure message\npasses through a redactor that scrubs known values in plain, URL-encoded, double-URL-encoded and\nbase64 (standard and URL-safe, padded and unpadded) forms.\n\nThe redactor scrubs *known* values. It cannot prove an arbitrary string is free of secrets, and\ninline credentials that never go through `vars.secret` are invisible here — the backend rejects\nknown credential patterns before gateway submission (story 10.8).",
    "Current artifact generation is data-only; there is no `vars.secret`, `ValueResolver` or AST\nargument execution path. A secret fill carries a value-less `secretRef`/`sourceInputId` tied to\nits declared `fill.value` input recipe, step and configuration provenance. Replay receives the\nresolved values in its private run metadata, and guided delivery uses its admitted frame. The\nobserved/guided sections below define the current approved-origin, secret-origin, retained\npassword-control and names-only authorization boundaries; none permits secret values in URLs,\nselectors, assertions or other argument slots. Outbound diagnostics and failure messages redact\nknown values, including their supported encoded variants, before bounds or writes.\n\nThe redactor scrubs *known* values. It cannot prove an arbitrary string is free of secrets or\nmake inline credentials safe. The backend's pre-gateway credential checks and current\nobserved/guided secret-use policy remain required.", 'EDOC-R2 secrets')
replace(r, '4. **Run both corpora** — `npm test` (unit tier: the adversarial corpus and every reference example\n   against the current validator) and `npm run test:fixtures` inside the pinned image. A reference\n   example that no longer validates, or an adversarial fixture that is no longer rejected, blocks\n   the upgrade. This is the fixture-corpus run §4.6 requires before release.',
    '4. **Run the current fixture gates** — `npm test` (the packaged independent observed-choice\n   reference and existing current negative/unit cases) and `npm run test:fixtures` inside the\n   pinned image. A required reference that no longer validates or a negative case that is no\n   longer rejected blocks the upgrade. This is the current fixture-corpus run §4.6 requires\n   before release; the retired artifact-1 corpora are not an upgrade dependency.', 'EDOC-R2 upgrade corpus')
replace(r, '7. **Never rewrite approved source.** A revision is recompiled only by an explicit, reconfirmed\n   authoring action. An upgrade does not silently reinterpret an artifact under the new runtime,\n   and a vulnerable runtime is not kept alive to preserve replay.',
    '7. **Never rewrite an approved revision.** An incompatible revision requires explicit,\n   reconfirmed learning and revision replacement. An upgrade does not silently reinterpret an\n   artifact under the new runtime, and a vulnerable runtime is not kept alive to preserve replay.', 'EDOC-R2 upgrade replacement')
replace(r, 'the Node22/internal-image ED-05 gate even when a public Playwright image supplies a working browser.',
    'the Node24/internal-image ED-05 gate even when a public Playwright image supplies a working browser.', 'EDOC-R2 active Node sentence only')
replace(r, 'Legacy artifact 1 validation, AST semantics and protocol 1 remain separate.',
    'Artifact-1 validation, AST semantics and protocol 1 are retired; there is no compatibility fallback. The current produced artifact has version 3 and replay profile `{contract: 3}`.', 'EDOC-R2 retired separate claim')

manifest = dict(old_manifest)
manifest.update({'revision': 'resume2', 'adoptedFindings': ['EDOC-R1', 'EDOC-R2 bounded same-README regions'],
                 'independentReviewSha256': '524f32ad2aaa9c4d45bdcd689ae68337eeea12d57b8f5437d657b4754ee81063',
                 'applicationGates': ['root W1/tree-open remains withheld; diagnostic restoration and actual remaining gates',
                                      'quoted-input writer and file ownership handover',
                                      'exact corrected package independent review',
                                      're-audit gateway note against eventual accepted009 helper',
                                      'root11MERGE for AGENTS/runner README']})
manifest['targets'] = []
combined = []
ordinary = []
root_only = []
delta = []
for item in old_manifest['targets']:
    target = item['target']
    before, after = originals[target], outputs[target]
    for folder, data in [('originals', before), ('preview', after)]:
        path = BASE / folder / target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)
    patch = ''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                       fromfile='a/' + target, tofile='b/' + target))
    patch_path = 'patches/' + target.replace('/', '__') + '.patch'
    (BASE / 'patches').mkdir(exist_ok=True)
    (BASE / patch_path).write_text(patch)
    combined.append(patch)
    (root_only if item['rootMergeOnly'] else ordinary).append(patch)
    updated = dict(item)
    updated.update({'originalSha256': sha(before.encode()), 'outputSha256': sha(after.encode()),
                    'originalBytes': len(before.encode()), 'outputBytes': len(after.encode()),
                    'priorOutputSha256': item['outputSha256'], 'currentActualSha256': sha((ROOT / target).read_bytes())})
    manifest['targets'].append(updated)
    old_preview = (OLD / 'preview' / target).read_text()
    ops = difflib.SequenceMatcher(None, old_preview.splitlines(), after.splitlines()).get_opcodes()
    delta.append({'target': target, 'priorPreviewSha256': sha(old_preview.encode()),
                  'newPreviewSha256': sha(after.encode()), 'intervals': [
                      {'kind': tag, 'oldLines': [a+1, b], 'newLines': [c+1, d]}
                      for tag,a,b,c,d in ops if tag != 'equal']})
for name, parts in [('all-documentation', combined), ('authored-docs', ordinary), ('root-merge-only', root_only)]:
    (BASE / ('patches/' + name + '.patch')).write_text(''.join(parts))
for alias, target in [('AGENTS.md.patched','AGENTS.md'), ('README.md.patched',r)]:
    (BASE / alias).write_text(outputs[target])
dump('manifest.json', manifest)
dump('exact-approved-replacements.json', changes)
dump('delta-from-reviewed-package.json', delta)
dump('prior-package-manifest.json', {'files': old_package, 'allBytesUnchangedAtRebuild':
    all(sha((OLD/p).read_bytes()) == h for p,h in old_package.items())})

facts = json.loads((OLD / 'unresolved-facts.json').read_text())
updates = {
'EDOC-01': ('Root explicitly adopts EDOC-R1. Matching CLAUDE/AGENTS and ARCH now name the literal Webpack transform and unset/empty fallback; inventory addendum agrees. No suffix-normalization claim or source correction.', 'corrected off-tree; exact independent re-review pending'),
'EDOC-03': ('Root explicitly adopts bounded EDOC-R2 in this same README. src/validator and src/executor remain and their observed responsibilities are documented; evidence upload under src/run already exists. Current route table/count, secrets, upgrade procedure and retired artifact-1 claim are corrected. The prior claim that these directories were removed was false.', 'corrected off-tree within root-approved same-file regions'),
'EDOC-04': ('Only the active guided Node22/internal-image sentence changes to Node24, matching package.json >=24.11.0 <25.0.0 and .nvmrc24. The dated pins-used-to-say22 history and image/check:pins proof gate remain.', 'corrected text only; actual internal-image proof still required'),
'EDOC-08': ('B1 and B7 are terminal historical baselines; root W1/tree-open remains withheld. Application still requires diagnostic source restoration, root source/coverage disposition and remaining actual gates, current preimages, quoted-input ownership, exact package re-review and root11MERGE for AGENTS/runnerREADME.', 'existing application gates; no baseline restarted'),
}
for item in facts:
    if item['id'] in updates:
        item['finding'], item['kind'] = updates[item['id']]
    if item['id'] == 'EDOC-02':
        item['rootRouting'] += ' Re-audit this note against the eventual accepted009 helper before final copyback; environment/mounted-property precedence and broader alias limits are not a completed protection proof.'
dump('unresolved-facts.json', facts)

source_paths = [
    'frontend/webpack.config.js','frontend/vite.config.ts',
    'studio-runner/src/server/routes.ts','studio-runner/src/server/server.ts',
    'studio-runner/src/server/runCoordinator.ts','studio-runner/src/server/capacity.ts',
    'studio-runner/src/executor/observedReplay.ts','studio-runner/src/executor/observedOperations.ts',
    'studio-runner/src/validator/observedReferencePolicy.ts','studio-runner/src/validator/observedHistory.ts',
    'studio-runner/src/run/evidenceUpload.ts','studio-runner/src/run/manifest.ts',
    'studio-runner/src/run/objectStore.ts','studio-runner/src/run/s3ObjectStore.ts',
    'studio-runner/src/run/passwordControl.ts','studio-runner/src/run/secretUse.ts',
    'studio-runner/src/guided/transport.ts','studio-runner/package.json','studio-runner/.nvmrc',
    'studio-runner/scripts/write-runtime-versions.mjs','studio-runner/scripts/check-pins.mjs',
    'helm-chart/put-checks/templates/_helpers.tpl',
    'helm-chart/put-checks/templates/deployment.yaml',
    'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json',
    'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/engineering-doc/review.md',
]
dump('current-input-hashes.json', [{'path':p, 'sha256':sha((ROOT/p).read_bytes()),
                                   'bytes':len((ROOT/p).read_bytes())} for p in source_paths])
print(json.dumps({'targets':len(targets),'approvedReplacements':len(changes),
                  'combinedPatchSha256':sha((''.join(combined)).encode()),
                  'priorPackageUnchanged':True}, indent=2))

---
name: tooling-mutation-rig-and-runner-unit-tier
description: ADR-SC-007 WI-3 closure recipes - scratch-copy mutation controls (3-4 s each), runner unit tier run (Node 24, JSON, what the reds mean), spotless on a 43k-line IT
metadata:
  type: project
---

From the WI-3 closure (2026-10-27):

- **Mutation controls in a scratch copy**: `rsync -a --exclude build --exclude .gradle backend/ $S/mut/backend/`, symlink `docs` and `studio-runner` beside it (tests read `../studio-runner/test/fixtures/...` and `../docs/...`), a second init script with its own `layout.buildDirectory`, its own `--project-cache-dir`. A Python script applies one anchored edit (assert the anchor occurs exactly once), runs `./gradlew -q ... test --tests <FQCN>`, reads `TEST-<fqcn>.xml` (failures, errors, first failure message), restores from `.orig` and compares the restored bytes with the live file. First (cold) pass took 18 s; each mutation 3-4 s with a warm daemon. Record the first failure message, not only the test name: it shows the red is behavioural (for gate vectors: "expected X but the Java gate said Y"), not a compile error.
- **Runner unit tier** (`pnpm --config.package-manager-strict=false exec vitest run --coverage.enabled=false --reporter=json --outputFile=<f> --testTimeout=30000`, default config excludes the fixtures tier): about 12 min, 150 files, 3,893 tests. Run it with the Node 24 PATH like the binding checks; the result was identical under Node 23 here (so Node version did not explain any red), but run it under 24 anyway. It rewrites `studio-runner/evaluation/grounding/generated/observationCollector.instrumented.meta.json` (deterministic content). Classify reds by the first `src/` frame of the failure stack (`observedReferencePolicy.ts:11 demand` via `canonicalObserved` = old-shape validator vs new fixtures). `test/pins.test.ts` is red when `dist/` holds stale packaged bundles; `test/run/confinement.test.ts` AC-25 is red because WI-2's `test/evaluation/*` files `require('playwright')`.
- **spotlessCheck covers the 43k-line GuidedPublicationReplayIT**. After scripted edits, copy the file, run gjf on the COPY, `diff` original vs copy; if the hunks are only the ones you edited (8 hunks here), copy it back. Never run gjf in place on it without that diff.

**Why:** these were each a surprise that cost a detour.
**How to apply:** closure of any Lean work item that needs mutation evidence, a runner red inventory, or a format fix on a huge IT. Related: [[tooling-scratch-copy-mutations-and-fixtures]], [[tooling-fe-vitest-node22-vs-24]], [[tooling-runner-node24-and-fixtures-baseline]].

---
name: tooling-post-g9-batch-gotchas
description: Traps from the 009 post-G9 patch batch - test package vs directory, schema edit stales dist (pins.test.ts reds), repo-wide spotlessCheck as the format gate, new-file lint
metadata:
  type: reference
---

From the 2026-10-18 post-G9 batch (receipt `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/post-g9/receipt.md`).

- **`--tests` needs the `package` line, not the directory.** `GuidedDefaultModelReservationIT` sits in `.../guided/translation/` but declares `package ...guided.session`. A filter with `guided.translation.` matched nothing and the collector still reported green (140, not 145). Always grep `^package` before writing an FQCN, and check the per-class counts in `<label>-results.json` `testcases`.
- **Any `contracts/v3` schema edit stales dist at once.** `check-pins.mjs` says "Observed packaged schema bundle is stale", and 3 `test/pins.test.ts` cases go red (`passes`, `exits zero`, `--json`). `verifyRunnerDist` also fails (src json newer than `dist/main.js`). `GuidedPlanningIntegrationTest` is in `runnerSpawningTestClasses`, so it cannot run before the rebuild. Report it, do not rebuild.
- **Format gate without the IDE hook:** `./gradlew --no-daemon spotlessCheck checkstyleMain checkstyleTest --continue` finished in 26 s and passed repo-wide; gjf 1.22 CLI with `--skip-reflowing-long-strings` showed 0 diff on all edited files, ReplayIT included (it was gjf-clean on 2026-10-18).
- **New patch-supplied runner test files were never linted.** `eslint .` found 4 `no-confusing-void-expression` errors in `test/print-observed-catalog.test.ts`; `eslint --fix <that file>` is enough.
- **Deployment tier counts:** G9 581 -> 642 after chart.patch + tests.patch + 2 falsification cases. Runs against `put-checks-studio-runner:obs009-g9-local`; needs no dist.

Related: [[tooling-verify-runner-dist-wildcard]], [[tooling-gradle-focused-runs]].

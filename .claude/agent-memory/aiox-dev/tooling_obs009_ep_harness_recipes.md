---
name: tooling-obs009-ep-harness-recipes
description: OBS-009 lane EP (benchmark prep) - Node 24 imports repo TS fixtures, real-Chromium page probe caught 3 page bugs, lint traps when deleting compile-era files, B7 evidence sources
metadata:
  type: project
---

STUDIO-OBS-009 W3 lane EP (2026-10-18) built `studio-runner/evaluation/observed-authoring/{evaluate.mjs,manifest.json,pages/**}` and `test/evaluation/*.test.ts`. Things that were not obvious:

- **Node 24.20 imports the repo's TypeScript fixtures directly** (`await import(pathToFileURL('test/fixtures/guided-dataflow/server.ts'))`; built-in type stripping, no flag). So an `.mjs` harness can host the existing `secret-login` and `guided-dataflow` fixtures in-process instead of forking them. The dynamic `import()` needs `// eslint-disable-next-line no-restricted-syntax -- <reason>` (runner rule "Dynamic import() is forbidden").
- **Page + oracle design must be proven in a real browser, not by data-only mutants.** A scratch Chromium probe (drive each page like a correct system, then the four defects, feed the host's receipts to the oracle) found three bugs that all unit tests missed: a search page that navigated to `/results` while the step text asserts "address contains /wiki"; a `<label>` wrapping a `<select>` (accessible name becomes "Currency EUR GBP USD", so `getByLabel` fails; use `label for=`); `role=listitem` on a button (no name from content). Also check the *end-state step-text assertion* on every P page. Probe lives in `execution-20261018/ep/provenance/page-probe.mjs`.
- **An oracle on receipts only is blind to a wrong click that has no handler.** Fix: the page host logs a view for any GET under a known case key (known:false for missing pages), and the oracle rejects unlisted views.
- **Deleting the last importer of a `.d.mts` makes eslint fail** with "was not found by the project service" (fixture-server.d.mts after fixture-run.test.ts went). Keep a test that imports it, or lint breaks outside your files.
- `eslint --fix` rewrites `x as T` into `x!`, then `no-non-null-assertion` fails. Use a `must<T>(v: T | undefined): T` helper in the test helper file. `readJson<T>` trips `no-unnecessary-type-parameters`; return `unknown` and cast at the call site. Use `Reflect.deleteProperty` instead of `delete obj[key]`.
- `evaluation/browser-oracle.test.mjs` is red at baseline (imports removed `dist/validator`); `cli oracle-self-test` no longer runs it. Not mine to delete.
- Public API limits for the incremental case: only `result.explanation.steps[].learnedFromThisRun/reusedFrom` and session counters are visible. Backend reservations per prefix step and merged-replay model calls are NOT public; they stay with `GuidedPublicationReplayIT`.
- Budget-admission ledger is hash-chained and bound to the manifest digest. Re-freezing the manifest (any page or expected-outcome edit) changes `manifestSha256`, so earlier entries become history and a new dated entry is appended. Do all manifest edits before recording ledger entries.
- B7 evidence source: `backend/build/guided-cohorts/guidedIncrementalTest/<run>/<id>/model-budget-evidence-*-final.json` (declaredFixtureCeiling, per-session actualCounters). The incremental lane runs at a 2048 per-call fixture ceiling on purpose; the production default is 4096 with a 32000 session output total (7 proposals).

- **B7 result (2026-10-18, dist D_F):** the 10-step base learn needs **13 proposals** (edit-4 case) and the insert case's base also 13; the incremental sessions need 9 and 10; peak 14 over 70 sessions, 54 of 70 need more than 7. At 4096 per call that is 53,248 reserved against a 32,000 output total. Local fixture runs can refute but never confirm. The 4000-token profile cannot be forced onto the incremental methods (`the closed profile owns exactly its declared methods`), so the 4096 column is arithmetic. MODEL-SIZING is owed.
- **`guidedIncrementalTest --tests X` widens, it does not narrow:** the task's own include list stays, so one named method still ran all 36 joined methods (about 22 min of lock time). To run one method, use the `test` task path or an init-script filter; check the plan before holding the shared lock. `elapsedSeconds` and the XML count tell you.
- Gradle `TestReporter.publishEntry` output is not in the JUnit XML. Write needed census data to `backend/build/<name>/*.json` from an `@AfterAll` and copy it inside the lock hold.
- In-place mutation of your own new IT under the lock: script with `trap restore EXIT`, `cp` the final file back, `cmp` it afterwards. The guarded `mutate` helper asserts the pattern exists.

**How to apply:** reuse these when extending the benchmark harness (T4) or the corpus pages; re-run the page probe after any page edit.

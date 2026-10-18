---
name: gate-evidence-preservation
description: Before any targeted backend Gradle re-run during a QA gate, check whether backend/build/test-results XML is itself the gate evidence; also how to re-derive Studio gate counts from preserved baseline XML
metadata:
  type: feedback
---

During the STUDIO-OBS-012A gate (2026-10-13), the only per-test proof of the final 49-minute `./gradlew check` (run5b) was the live `backend/build/test-results/test/*.xml`; the evidence ledger held only totals. A targeted `gradle-locked.sh test --tests X` would have replaced that directory and destroyed the evidence that the architect gate and the QA reconciliation both relied on. So the QA backend re-run was skipped as an [AUTO-DECISION], and freshness was proven with `find <src dirs> -newer <run start>` returning 0 files.

**Why:** the user's rule is "never mark a skipped check as passed", and also prefer narrow verification. Destroying the one green full-check record would force another ~50-minute full run.

**How to apply:**
- If a re-run is really needed, first copy `backend/build/test-results/` into the scratchpad (not into the repo). Otherwise prefer runner vitest subsets (`--coverage.enabled=false`), `tools/check-studio-observed-contracts.cjs` and `build-studio-observed-schemas.cjs --check`. None of these touch backend XML or `studio-runner/dist`.
- Name-level reconciliation works well:
  - Parse `docs/qa/evidence/<story>/baseline-backend/*.xml` and the final XML.
  - Diff the `(classname, name)` multisets, then grep every removed or added name across the non-XML evidence text.
  - `SseCrossReplicaIT` runs in the `crossReplicaTest` task. Exclude it when comparing against a `test --tests studio.*` baseline.
- `@Disabled` annotations in this repo span several lines. Count them by parsing, not with `grep | grep reason`.
- The local `studio-runner/dist` is never cleaned, so stale modules persist there. The Docker image builds clean.

Related: [[verification-run-budgets]]

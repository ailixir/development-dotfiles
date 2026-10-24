# Earlier-attempt hard-gate retention — candidate for source review

**OFF-TREE, UNAPPLIED, UNEXECUTED.** Dex / STUDIO-OBS-009 / 2026-10-20. This directory is the complete owned write surface. No actual evaluator, test, manifest, story, register, report or readiness file was edited. No evaluator, test, compiler, native/browser/Docker, network, model/provider, Git or contact operation ran; no delegation occurred. Python performed local byte copying, text replacement, SHA256 and unified-diff generation only.

Read and verified the exact PO proposal `85506e3d68cccc2da280b9da694889721b8cfcc9f9740e1ef75cc89a00990615` and architect review `b602698e59bce4242fc691377cd6ef83991639c403ff8d5da4274604a4159a2e`, particularly Correction2. Used `.codex/skills/aiox-dev/SKILL.md` and its referenced `.aiox-core/development/agents/dev.md`. The explicit source-only assignment overrides skill runtime activation, story modification and execution steps. Configured `docs/framework/{coding-standards,tech-stack,source-tree}.md` and listed language fallbacks are absent from the repository file listing; no new standards were invented.

## Exact review material

- `before/studio-runner/...`: byte-for-byte snapshots of both actual input files.
- `candidate/studio-runner/...`: complete candidate versions, kept outside actual source/test paths.
- `candidate.patch`: forward unified diff with repository-relative `a/` and `b/` names; exactly two target files.
- `inverse.patch`: exact reverse unified diff for these same targets.
- `source-pins.json`: full source, candidate and patch SHA256 bindings; untouched manifest file hash and existing canonical digest are distinct entries.

Actual evaluator input: `2eb26bc99542c2e46ae6791b9e0269de93fe42dcd24a4b1cda4712421b0aa6a8`; candidate: `c12fad22b810b92b0ce8dbc9f8f54da4540d6ad1de56d027b226acb3d047be56`. Actual scoring-test input: `fb26b89354d30274361a45996dccf74df3353cfd8d99f44d8584b92b8479a93b`; candidate: `5769819380217737448766661d62e52445b6f166ef8cf6b8f0c05e9e631ce7be`.

Forward patch: `c96ebd71ea47b6554918c12b062090ad9e1f8d89c8aafa4fb6c325bb4a8200ac`. Inverse: `099afef2fba921904cd9848552d2cc5c52f0ee51cd1c67065991158e30981822`.

## Behavior and preserved boundaries

`buildBenchmark` currently filters false-pass and leak observations through `credited`, discarding an earlier supplied infrastructure attempt once its final attempt is credited. The candidate changes only those two filters to the original supplied `runs`, and extends each existing `falsePassRuns`/`leakRuns` item with its existing integer `attempt`. The identity is `(caseId, rep, attempt)` within this report input. Counts remain the number of supplied attempts carrying a positive observation; leak counts are not redefined as the sum of leak findings.

Completion still uses the existing final non-infrastructure attempts, class-P filter and clarification-free independent-oracle predicate. The candidate does not grant earlier attempts completion credit, authorize ordinary model-failure retries, or change verdict precedence: malformed/mismatched D_C inputs remain INVALID and HARNESS_SELF_TEST remains NOT_EVIDENCE while hard-gate fields retain observed facts. It does not transform invalid input's diagnostic completion aggregates into admissible evidence.

All 25 corpus IDs/classes/repetitions, pages, authored steps, outcomes, source pins, original incremental files and manifest bytes remain untouched. Full 57/52 and local PARTIAL 51/46 arithmetic, missing-run behavior, class F/N reporting, exact-mode-P predicate, canary privacy code, exclusion ledger, spend/admission paths and existing report entrypoints remain untouched. The declaration file needs no change: assertions inspect the existing hardGates object with toEqual/toMatchObject; no new typed property access or report entrypoint is introduced.

**Limits/history boundary:** existing validation rejects manifest mismatches at report level. There is no run-level limits identity in the current RunRecord contract. This narrow patch neither adds one nor asserts that mixed-limits provenance can be established from absent fields. Incompatible manifest/limits histories must remain separate records/report inputs for completion admission; their retained hard-gate dispositions still belong in cumulative T4 analysis. No history is merged, admitted, removed or written by this preparation. Reviewed run-cause evidence, verified-zero provenance, P versus all-class RS-1 accounting, known-local versus unknown-staging scope, limits-history partitioning and report/adoption wording remain explicitly owed in the separate design. This fix alone does not adopt all T4 accounting and does not pass D-C or complete 009/010/011.

## Smallest meaningful regression controls

All prior test identities and assertion statements remain present unchanged. The candidate adds one two-row `it.each` in existing `benchmarkScoring.test.ts` and strengthens the existing infrastructure recovery test with four assertions. No benchmark workflow, harness, provider API or observer is added.

| Existing-suite control | Input and required expectation | Old evaluator + candidate tests (expected, NOT RUN) | Candidate evaluator + same tests (expected, NOT RUN) |
| --- | --- | --- | --- |
| Earlier false pass | C08 rep1 attempt1 has falseSuccess and recorded infrastructure failure; clean final attempt2 is credited. Problems empty, credited total69, P51/51, infrastructure row retained, GATE_FAIL, falsePassRuns exactly C08/1/1, no leak rows. | Genuine assertion RED: actual verdict PARTIAL, earlier observation absent. | GREEN: GATE_FAIL with earlier attempt identity. |
| Earlier secret/PII leak | D1 rep1 attempt1 has leak1 and recorded infrastructure failure; clean final attempt2 is credited. Same denominator/ledger conditions, GATE_FAIL, leakRuns exactly D1/1/1, no false-pass rows. | Genuine assertion RED: actual verdict PARTIAL, earlier observation absent. | GREEN: GATE_FAIL with earlier attempt identity. |
| Ordinary infrastructure recovery | Existing C01 infrastructure attempt1 plus clean final attempt2. Added assertions require P completions51/failed0, total credited69, PARTIAL, all hard-gate arrays/counts empty. Existing silent-retry INVALID assertions remain unchanged. | GREEN: existing completion semantics preserved. | GREEN: existing completion semantics preserved. |
| All existing controls | Original arithmetic, clarification, direct hard gates, labels/mode/manifest validation, explicit zeros/RS-1, accounting/price, F/N and replay assertions retained. | Expected unchanged. | Expected unchanged. |

## Future unit proof — after independent source review only

No command below has been run. Root owns independent review, a quiet window, source rehash/rebinding, private composition/application and runtime authorization. Any source-pin mismatch invalidates blind application; root must rebase and obtain review of the actual composition. The two phases use the **same existing unit command**, from `studio-runner/`, under the owner's existing bounded command runner with a 60-second wall-clock ceiling (terminate/report timeout; do not claim pass). Per-test/hook limits are also explicit:

```sh
npm test -- test/evaluation/benchmarkScoring.test.ts --coverage.enabled=false --maxWorkers=1 --no-file-parallelism --testTimeout=5000 --hookTimeout=5000
```

1. RED: in the owner-approved private composition, use the pinned **before evaluator** and **candidate test file**, leaving all imports/fixtures/configuration otherwise pinned and identical. Require both new rows to fail on the actual `PARTIAL` versus `GATE_FAIL` assertion. A load/compile/import/infrastructure error is not RED proof. Save exact command, source pins, exit code and failures.
2. GREEN: replace only that evaluator with the pinned **candidate evaluator**, keep the identical candidate test bytes and rerun the identical command once. Require exit0 and the entire selected existing scoring-test file passing. Save exact command/source pins/result; no D-C inference follows.

This is a scoped unit diagnostic; disabling coverage avoids applying global whole-repository coverage thresholds to a single selected file. It does not lower repository gates or replace any later required gate. No broader run is proposed here. Stop now for independent source review; actual application awaits root's quiet window and fresh source binding.

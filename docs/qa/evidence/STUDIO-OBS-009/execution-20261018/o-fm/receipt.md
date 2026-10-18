# Receipt: lane O-FM (AC-7 FM-01 b-d, rule FM, ruling A9)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO. **Result: GREEN locally** (unit 68/68, real Chromium 31/31). The joined IT is written, compiles and is formatted; it is **not run** (it runs after the F-merge; baton B-OFM-1). Marks [V]/[I] as before.

## Files
| file | sha256 before | sha256 after |
|---|---|---|
| `studio-runner/src/run/observationCollector.ts` | 5af51bbf179b7ce77cb873767a90a3288dd495c0837dc4ad053387330c16db99 | 78470dc28cc3eb8b894de1ebe44d0e8a8eb6bfb9e09cee3ffa7530167ec20ca0 |
| `studio-runner/test/run/observationCollectorInvoke.test.ts` | 5cfaf908afc8a7f40dc4c5167ee6371e78362fbf13f87ea913ef036b02da5cee | 546fbaecad20dfa35de015459ba80c4d61ebd58087ae733aee25fd5e5dd2693f |
| `studio-runner/test/fixtures-tier/focusMutation.test.ts` | new | e2922593a02faadda8a452c093714de397e7228d1335cdea39577ede24985560 |
| `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedFocusMutationJoinedIT.java` | new | 6462a8b9aa7f2ded2c82315fdc9efe09d90437d243b6c555b4f46cc6e94346bc |

sha256 "before" values were taken at lane start from the live working tree (which already carried other lanes' uncommitted work), so they are the lane baseline, not a git blob.

## What changed
- `observationCollector.ts`: only the judgement of the MutationObserver records taken in the focus window. FM-2: the ancestor chain (field to root, through shadow hosts) is captured before `focus()`. FM-3: a target change is (a) an attribute of the field that is not allowlisted, (b) a `childList` record adding or removing a chain node, or a recomputed chain that differs (also with NO record: an unobserved subtree), (c) `hidden` / `inert` / `disabled` on a chain ancestor, (d) `characterData` inside the field. FM-4 allowlist: `class`, `style`, `aria-expanded`, `aria-activedescendant`, `aria-describedby`, `aria-controls`, `data-focus*`. FM-5: more than `workLimits.elements` records still refuses (fail closed), and so does a chain too deep to capture. FM-1/FM-6: every other condition on the `fill` line is byte-identical; the password path's own `confirm(true)` is untouched; `matches` without a focus window still treats any record as a change. The helpers live inside `installObservationCollector` (it is installed by source text).
- Unit stub extension: `MutationObserver.takeRecords()` delivers scripted records (`scripted`), with its own control (a scripted `type` record on an untouched fixture still refuses).

## Commands and results [V]
| command | exit | counts |
|---|---|---|
| red unit before the code (`red-unit.log`) | 1 | 14 failed / 68 |
| green unit (`verify-unit-green.log`) | 0 | 68 / 68 |
| fixtures (no-globalSetup config, `fixtures-green-2.log`): `focusMutation.test.ts` | 0 | 31 / 31 |
| red fixtures on the old judgement (`red-fixtures.log`, scratch copy) | 1 | 11 failed, 20 passed (every positive red; every negative control green both ways) |
| `gradlew compileTestJava` through the lock (`gradle-compile-4.log`) | 0 | BUILD SUCCESSFUL |
| google-java-format 1.22.0 `--skip-reflowing-long-strings --dry-run` on the IT | 0 | 0 files to change |
| `tsc`, `eslint` on the lane's TS files | 0 | clean |

Real-Chromium cases: the D5 probe matrix (no trigger, `focus`, `input`, `change` rewriting an unrelated `<output>`), helper text elsewhere and next to the field, a portal listbox, each allowlisted attribute on the target, inert attributes and a class on an ancestor (all write and return `{}`). Non-allowlisted attributes (`readonly`, `name`, `autocomplete`, `aria-hidden`, `contenteditable`, `aria-disabled`, `disabled`), target replaced, target detached, ancestor removed, replaced and moved, `hidden` / `inert` on an ancestor, and a tolerated change plus a real one (all still refuse `POST_FOCUS_CHANGED` and write nothing). Retype-to-password, focus stolen and read-only stay by name in the unit tier.

## Mutations (unit, scratch copy; `mutations/`)
OLD judgement: 14 red. FM1 (drop the ancestor `hidden/inert/disabled` rule): 3 red. FM2 (drop the field allowlist): 9 red. FM3 (drop the record-count cap): 1 red. FM4 (drop the recomputed-chain check): 2 red. FM5 (ignore added/removed chain nodes): 3 red.

## ACs covered (local half)
AC-7 FM-01 b (1)-(4) with the negative controls; d (at-most-once and the `UNKNOWN_OUTCOME` mapping are untouched: no change to `browser.ts` or `runtime.ts`; the runner `dist` is NOT rebuilt here, the F-merge rebuild and its digest per AC-12 i are root's); c (joined regression) is written and not run.

## Joined IT: `GuidedFocusMutationJoinedIT` (package `...guided.translation`)
A trimmed copy of `GuidedBridgePlannedIT`'s scaffolding (real PostgreSQL, mutual TLS both ways, controlled provider, actual Chromium), keeping its rules, with two cases. (1) A page whose `Destination` field has an `onfocus` that inserts helper text into `<main>`: the fill writes `fixture-input`, the action ends `SUCCEEDED`, the session is not `UNKNOWN_OUTCOME` / `FAILED`, and the worker log has no `POST_FOCUS_CHANGED`. (2) Control: the focus handler changes the target's `name`: the session ends `UNKNOWN_OUTCOME` and nothing is written. `GuidedInternalSecurity.Identity` is package-private to the session package, so the controller identity is built by reflection.

## Batons and findings
- **B-OFM-1 (lane I / F-merge):** the IT's `startWorker` still spawns the retired `run/guidedMain.js` exactly like `GuidedBridgePlannedIT` does today (D1 deleted it). Apply the same spawn hunk lane I applies to that class, then run `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-ofm-joined01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.translation.GuidedFocusMutationJoinedIT' --no-daemon`. Credit it only on the F-merge `dist` digest. Until then its result is unknown [not run].
- **B-OFM-2 (F-merge):** rebuild `dist` once, record the digest (AC-12 i) and name it in the benchmark's pinned runtime versions (story FM-01 d). AUTHORED-ECHO-01 may share that rebuild.
- **Owed externally:** FM-01 e (T4 `focusMutationRefusedFills` accounting) and f (010 pilot probe on the landed digest). The checkstyle gate on the new test class was not run (only compile and format) [not verified].
- Not claimed: nothing about a Citi application; the unit stub is structural, and the Chromium file is the proof.

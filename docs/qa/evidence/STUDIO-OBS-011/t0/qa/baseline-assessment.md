# STUDIO-OBS-011 T0 independent baseline assessment

Quinn (@qa), 2026-10-18. **Preparation assessment only, `isVerdict:false`; no lifecycle change and no W1 authorization.** Machine snapshot: `baseline-assessment.json`. Inputs are the current B1 log/process, `t0-record.md`, `lanes.v3.json`, `w-brief.v3.md`, story 0.2.16, the late handoff, source and earlier archived XML.

## Current B1 evidence

[V] Independently observed live wrapper PID **88167**, parent **88145**, and its Gradle daemon child **88182**, started 19:53:58/59 EDT. Wrapper command is `GradleWrapperMain --continue check --rerun-tasks --no-daemon`. The snapshot records the actual `ps` output. No process was signalled or restarted.

[V] At **2026-10-19T00:46:43Z**, the B1 progress log held **1852 PASSED, 2 SKIPPED, 15 FAILED** lines. These are provisional progress-line counts, not final task-qualified testcase totals. The process and current log are authoritative for liveness; a status marker alone is not.

[V] `B1-DONE` and `obs011-t0-baseline-check01-results.json` were absent at the snapshot. No final coverage, source stability, exact per-task counts or full skip reconciliation is claimed. `backend/build/test-results/test/...GuidedPlanningIntegrationTest.xml` was last written at 23:25:49Z and the incremental ReplayIT XML at 23:15:12Z, both **before** the B1 capture at 23:53:58Z; their results must not be attributed to B1. Fresh `crossReplicaTest` XML is from 23:54:47Z (2 cases). Final acceptance uses the collector's archived task XML, never a later mutable build directory.

## Failure ownership and next evidence

The progress log names 15 ReplayIT failures. The full list is retained in `baseline-assessment.json`.

| Group | Evidence | Assessment / owner |
|---|---|---|
| First body failure | `actualGuidedReleasedValueInjectedFailureRedactsProducedSinks()` at `GuidedPublicationReplayIT.java:19249` | `@Order(32)` calls `p8C6Case(4)`, whose guided branch waits for `UNKNOWN_OUTCOME`. `awaitState` throws at an unexpected terminal state. The safe cleanup receipt reports `beforeState: FAILED`. This is not the TEST-001 cross-order fixture or D5 canary-vacuity assertion. 11-IT-R owns investigation; whether its cause is test-only or main/runner is not yet proved |
| 13 later cases | All fail at `:3767` before their bodies | Existing deliberate `cleanupUnconfirmed` fail-stop. Preserve it. They are recorded failed tests, not 13 independently established product failures; do not remove the guard to improve counts |
| `executionError` | Final sink collection reaches `capture.collect(sinks)` at `:31923` | Class teardown/capture failure. Inspect fresh XML and suppressed exceptions to classify; not evidence that D5 caused the first failure |

[V] Only safe numeric/cleanup facts were inspected under the current `obs007-joined-12026084583951601838` temporary directory. The Order-32 cleanup record shows one `FAILED` session with `teardownStatus: CONFIRMED` but `allActualTeardownsConfirmed:false`; this does **not** prove every capture/native producer closed. C5 numeric evidence reports `encodedPatternHits:0`, `encodedInvalidWrites:0`, `encodedObserverFailed:false`, `streamedLogsFinalChecked:true`, `captureTargetClosed:true`. These fields are limited observations; they do not prove the entire redaction criterion passed. No private canary values or logs were copied into this assessment.

T0 §3.1 allows W1 with a lane-owned **test-cause** red recorded by name. That prerequisite is not yet established for the first failure. A main-code cause, uncovered owner or coverage failure requires root/QA ruling before W1. Preserve the frozen tree through B1 and B7. Do not re-run or change source while the original run is still live.

## Baseline and coverage prerequisites still owed

- Obtain B1's terminal collector result, Gradle exit, task collection errors, task-qualified testcase multisets and fresh exec facts for `test`, `guidedIncrementalTest`, `crossReplicaTest`.
- Prove `sourceStable`, `distStable`, `testInputStable`; before/after source digest `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`. Root's final capture must match the start; include helm/quoted-doc identity.
- Require `jacocoTestReport`, `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` **EXECUTED**; UP-TO-DATE/SKIPPED/NO-SOURCE/absent cannot settle the 009-owed gate. Archive the merged B1 JaCoCo report and derive ratios from it, never an old build report.
- Distinguish configured coverage floors from headroom triggers. Current Gradle bundle LINE floor is **0.70**; dispatch/internal/recovery/sse floors are **0.75**; the two retired compile rules are **0.80**. T0-JC's additional fold headroom trigger is **dispatch <0.80 or bundle <0.75**. If triggered, `obs011-foldf-cov01` is owed. Do not call a 0.75 dispatch ratio 0.80 headroom.
- Extract AC-5 before elapsed times and exact case lists for all nine named sleep-polled classes from B1's final archived XML. A red/fail-stop-truncated ReplayIT is an honest attempted before sample, not a proven green timing baseline; root/QA must state its limitation before comparing it to an after run.
- Compare the full B1 skip multiset with the new policy (`skip-policy.md`); current policy approves exactly nine named backend skips, no new reds/skips. Reconcile runner R-40's four pointer skips separately.
- B2–B6 are carried from G9b by root's explicit option-B decision in the latest handoff; retain the exception and the verified file-identity proof. B7 must be fresh and contain the per-name Vitest JSON because the earlier C6 plain log cannot support AC-7 reconciliation.
- Root fills the B1 outcome table and coverage headroom, records @dev's revalidation and signatures, then explicitly announces “tree open”. No baseline or planning record alone opens the tree.

## C1–C8 fold

**Confirmed as a documentary fold, with execution still owed.** T0 record §6 and v3 lane commands carry C1 reuse inputs and disclosures; C2 final digest chain, archived XML, coverage-task execution, image and load records; C3 assertion-red/mutation forms and positive controls; C4 F-1 freeze; C5 repointed execute-011 collectors; C6 kill-switch arity test; C7 matching baseline suite list; C8 95/123 sleep census, P7 names, R-11 reason and post-MERGE smoke. This confirmation does not assert those dynamic gates passed. The actual C5 frontend collector is new and must produce valid results before any credit.

D5's conditional design assessment and lane-exit evidence requirements are recorded separately in `d5-design-review.md`.

## B7 wrapper prerequisite review (read-only)

Read `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-t0-frontend-baseline.py` and its frontend collector. The wrapper refuses until `B1-DONE`, a terminal B1 result file and equal saved B1 start/end source+dist captures exist. It uses five distinct labels and refuses their reuse. It backs up the generated audit JSON and restores only if the observed post-run hash still matches the collector's hash. This is a sound preservation approach; a B1 red does not authorize W1.

[V, re-review] Root updated the wrapper after the initial read. It now performs a fresh initial S_011 capture; requires source/dist/test-input stability and S_011 source+dist before/after equality for all five runs; and requires nonempty Vitest per-name `testResults` whose assertion count equals `numTotalTests`. These additions close the two initial evidence concerns. **Host Node is intentional for frontend**, as the latest handoff and v3 brief specify, and the collector records the actual Node/pnpm versions. My initial message to root mistakenly suggested Node 24 for frontend; that does not apply. An interruption may leave the axe backup and generated output pending restoration; preserve the hash guard and document any manual recovery. No B7 run was started by this review.

## Scope of actions

Read-only `ps`, log/source/JSON/XML reads, targeted `rg`, Python standard-library parsing and writes only under `t0/qa`. No tests, builds, Gradle, Node, Docker, real model/provider calls, git writes, process signals or delegation. The B1 placeholder policy and all product/test source, specs, helm, dist, stories, plan and dispatch governance remain untouched by QA.

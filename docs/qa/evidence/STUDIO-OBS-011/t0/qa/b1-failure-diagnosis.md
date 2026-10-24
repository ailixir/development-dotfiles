# B1 first-failure diagnosis — independent QA

Quinn (@qa), 2026-10-19T00:52:13.171535+00:00. **`isVerdict:false`; cause remains unproven.** This supplements the existing baseline assessment without changing it, any source or any lifecycle field. Machine evidence is `b1-failure-diagnosis.json`.

## Current process and evidence

[V] Revalidated `obs011-t0-baseline-check01` through the actual wrapper **88167** and child daemon **88182**, with the same start identities/ancestry and `--continue check --rerun-tasks --no-daemon` command. Both remain live. Progress log at this snapshot: **1932 PASSED / 2 SKIPPED / 15 FAILED**. These are progress-line counts only. The final collector receipt and fresh ReplayIT XML are absent. An observation interval ending is not process termination.

## Actual first failure and cascade

[V] Task `test`, `com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.actualGuidedReleasedValueInjectedFailureRedactsProducedSinks()` (`@Order(32)`) is the first current-run failed case in the B1 log. Its stack location is `java.lang.AssertionError` at **`:19249`**, the `awaitState` branch that rejects an unexpected terminal session state. The method calls `p8C6Case(4)`, then `p8C6Run`, whose guided branch waits for **`UNKNOWN_OUTCOME`**. The same case's safe cleanup receipt records **`beforeState: FAILED`**. Thus this is an actual state mismatch, not a wait timeout or a canary-vacuity assertion.

[V] The next **13** cases fail before their bodies at **`:3767`**, the assertion that `cleanupUnconfirmed` is false. It is a deliberate fail-stop after unconfirmed native cleanup. Preserve the guard; these are named failed cases but do not independently establish 13 distinct product causes. Final `executionError` reaches **`:31923`**, `capture.collect(sinks)`, during final sink collection. The full failed-name list is preserved in the JSON.

The first failure does **not** point at D5's `AUDIT_CANARIES`/event controls (`:34431–34435`), the P7 tests, or Orders 2/3's cross-test publication memo. D1–D5 cannot be claimed to fix this primary failure. D6 is message-only and deliberately retains this cleanup guard.

## Safe supporting facts and limits

[V] The current B1 fixture is `obs007-joined-12026084583951601838`. Only selected closed/numeric fields and file existence were exported:

- The first cleanup receipt contains one session, `beforeState: FAILED`, `teardownStatus: CONFIRMED`, but **`allActualTeardownsConfirmed:false`**. Confirming a session teardown does not establish every encoded stream/native producer closed.
- Numeric C5 evidence reports zero encoded pattern hits, invalid writes and observer-failed flag; `streamedLogsCollected`, `streamedLogsFinalChecked`, `captureTargetClosed`, `traceArmed` are true. Those limited counters do not prove the whole redaction/native-closure criterion passed.
- The retained revocation-state numeric fields are `active:true`, `case:6`, `epoch:6`, `path:1`, `c6:4`. The `p4-revocation-observer-failed` marker exists. This is a clue to inspect after the run; its time/cause and causal relationship to `FAILED` are **unproven**. Neither marker nor “active” is authority to retry a native action.
- ReplayIT source remains at SHA-256 `b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475`. No source was edited. No private-values file or raw secret-bearing output was exported.

**Classification: UNPROVEN test versus main/runner.** We have the observed bad state and subsequent fail-stop, but not the fresh first exception's complete/suppressed stack, the closed failure code that produced `FAILED`, or proof that the intended injected native-failure path was reached before it. Neither test-only stabilization nor a product defect can be asserted from these facts alone.

## Ownership and safe next actions

**11-IT-R** owns ReplayIT test-cause investigation/stabilization and the named failures under T0 §3.1. Its write authority does not include backend main or runner source. If fresh evidence identifies either as the cause, root routes it to the appropriate owning lane/architect before W1. A coverage failure, unowned red or unresolved main/runner cause likewise needs root/QA ruling; do not treat the existing “lane-owned test red may start” rule as a blanket approval.

1. Let the original B1 finish; keep source/dist frozen and do not restart, signal, retry native actions or modify guard/canary logic.
2. At terminal collection inspect **collector-archived fresh** task XML, starting with Order 32's first exception and suppressed cleanup errors. Export only safe codes, exception classes, source lines and numeric closure facts. Do not mistake earlier `backend/build/test-results` XML for this run.
3. Reconcile all three task-qualified testcase multisets, the complete failure list and exact skipped identities. The policy remains nine exact `test` identities, SHA `6bd2a808a40a707397757b3ff4f1a78e5eff8ee37666c7b26271582b14457cac`; final B1 equality is **owed**, because its result file is absent. B1's original placeholder remains byte-identical.
4. Require actual `jacocoTestReport`, `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` execution plus fresh merged coverage. No terminal coverage-task fact is currently proved; dependency-skipped tasks cannot settle the 009-owed gate.
5. Root applies the B1 outcome table before W1 and separately completes B7. D5 lane-exit proof remains independent and cannot justify weakening this native-cleanup/redaction boundary.

No tests, builds, Docker, process signals, retries, source/plan/story edits, delegation or final story verdict were performed. Root's live watcher owns ongoing waiting; this diagnosis returns with the current evidence rather than occupying a slot until XML appears.

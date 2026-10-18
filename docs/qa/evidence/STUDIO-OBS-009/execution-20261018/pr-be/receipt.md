# STUDIO-OBS-009 W1 lane PR-BE: the two backend probes (receipt)

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No dist rebuild. No production code, deadline, reaper, vocabulary or migration change.
- **What this is:** step a of AC-11 R1 and of AC-11 ADJ-1: probe before any ruling or fix. Both probes are batons to lane B and to @architect at W1.5.
- **Legend:** [V] verified by running or reading; [I] inference, not run.

## Outcomes (the short version)

| Probe | Outcome | Reading |
|---|---|---|
| **R1** `GuidedEvidencePendingAppendIT` | **REPRODUCED.** `recording-evidence` at v(n-1) while a v(n) append delivery is `PENDING` is refused `409 STALE_FENCE`. | R1 does not close as "not reproduced". The binding (steps b to d) is needed, after @architect's written non-consuming confirmation. |
| **ADJ-1** `PreReadyRevocationProbeIT` | **REPRODUCED, as the architect predicted from reading.** The runner's recorded-revocation `FINAL` gets `409 TRANSITION_REJECTED`; the row stays `ADMITTED`; only `RunningReaper` settles it, as `ERROR / START_TIMEOUT`. Never `AUTHORIZATION_REVOKED`. | Red by design until the C1-ruled implementation. |

## Files (sha256 of the final bytes)

| File | sha256 | Lines |
|---|---|---|
| `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedEvidencePendingAppendIT.java` (new) | `9f2d3deb0741838593aebc33ff063e09631341950607dcf853171f53130a5487` | 523 |
| `backend/src/test/java/com/citi/put/checks/studio/dispatch/PreReadyRevocationProbeIT.java` (new) | `6adce6065b88ef12ab84d9a983fa978cac4f34d7a255876aea81fade68536851` | 344 |

Preflight for every run (AC-12 g): `lsof -nP -iTCP -sTCP:LISTEN` saved as `lsof-before-<label>.txt` beside this file; Gradle process listing in `gradle-procs-before-r1.txt` and `../d3/gradle-procs-before.txt` (a `gradlew test --tests StudioContractTest` from another lane appears in the first listing; every Gradle run of mine went through the shared lock, acquired in 0.0 to 1.4 s, so I did not wait on it separately). No run failed on a connect error, `role does not exist` or a Testcontainers hang, so no run is attributed to a host collision (AC-12 f).

## Runs

Command shape: `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <label> --test-tasks test -- test --tests '<FQCN>' --no-daemon` with `N24` on `PATH`. Result files are in `../execution/`.

| Label | Class | Total / passed / failed | sourceStable | Credit | results sha256 |
|---|---|---|---|---|---|
| `obs009-prbe-r1-01` | `GuidedEvidencePendingAppendIT` | 2 / 0 / 2 | true | **Not credited.** Fixture error: both cases died in `GuidedDispatchService.assign` (`RUNTIME_INCOMPATIBLE` thrown by my placeholder runner client). `assign` calls the runner; the fault IT answers it through an HTTPS relay. This run says nothing about R1. | `139d038c412f51cfe2db5973b82d6edaa1717a7045ffd4f8fc022d15bb75d212` |
| `obs009-prbe-r1-02` | same, final bytes | 2 / 1 / 1 | true | **Credited.** The probe case fails with `STALE_FENCE`; the control passes. | `66955e17946a00526c14ef50238c327aa5277b9e78f9f328dc21b84520004a7c` |
| `obs009-prbe-adj1-01` | `PreReadyRevocationProbeIT` | 2 / 1 / 1 | **false** (other lanes edited source during the run; root R3, non-evidentiary) | Not credited as evidence; same result as the next run. | `fc73b6ccb2070cf9e06c3e0c0d62995e31993ff8706222ec28618f4e927f3b58` |
| `obs009-prbe-adj1-02` | same, final bytes | 2 / 1 / 1 | true | **Credited.** | `29dad2ccfbaa76b7f51e073b40f77b13531a30280642b49d74a4ecf326d3f367` |

`dist` digest before and after, every run: `897182d5…` (unchanged). Collector exit is 1 on the two credited runs because the probe case is red; that is the expected outcome, not a harness fault.

## R1: what was set up and seen [V]

Set-up (adapted, not copied by reference, from `GuidedServiceTransportFaultIT.materializedStopScenario` and `appendPendingDelivery`, which are private to a 5.7k-line Spring class): fresh PostgreSQL 15 container migrated to head (V22); a real `GuidedSessionService` start; assignment through `prepareAssignment` + `claim` + `acknowledgeAssignment` (the runner's answer supplied in-process, exactly the two calls the fault IT's relay makes); `materialize` at v1, fence 1; `continuation(MATERIALIZE)` + the same SQL append; v2 issued with `runnerContext`. State asserted before the post: one delivery `PENDING|true|true` (v2, issued, not acknowledged) and the head row at `context_revision = 2`.

- **Probe** `recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending`: posts `recording-evidence` as the owning worker at the v1 identity (the issued identity with `contextRevision - 1`). Result: `REFUSED STALE_FENCE status=409`, printed by the test as `R1-PROBE v(n-1)=1 while v(n)=2 PENDING -> REFUSED STALE_FENCE status=409`. The refusing line is `GuidedSessionEvidenceService.java:116`, the identity `require(...)` whose `context.contextRevision() == request.path("contextRevision").asInt()` term compares against the head row (v2) only. [V, stack trace in the XML]
- **Control** `recordingAtTheHeadRevisionIsAcceptedWhileAnAppendIsPending`: same session shape, body at v2: accepted, one recording row, delivery still `PENDING`. This proves the red probe is the identity binding and not the fixture (window, owner, fence, scope, versions, schema, idempotency all pass).

Read-out: red = R1 reproduced. A green probe would have meant "not reproduced, close R1"; that did not happen.

Not in this lane, left to lane B on this same class (step b/c cases): v(n) accepted, n-2 / n+1 / foreign contextId / foreign fence refused with nothing written, the no-pending control (v(n-1) refused), stored evidence is the report's own, and the mutation check. Joined proof d (owner loss at v(n-1) with a recording that plays and seeks) is also B's.

## ADJ-1: what was set up and seen [V]

Spring context as `DispatcherIT` / `AdmissionCasIT` build it (`@SpringBootTest`, `test` profile, the shared Testcontainers PostgreSQL), reusing `DispatcherIT.FakeRunner` (recording runner client, fake vault, mutable entitlements) and `ObservedPublicationFixture.FreshAuthority`. Steps: a revision declaring secret `LOGIN_PW`; entitlement granted; vault value rotated; `executeTest`; `StudioDispatcher.dispatch` (one send, ledger `DISPATCHING`, secret released and audited under the issued attempt); `AdmissionCasService.claimObserved` (ledger `ADMITTED`); entitlement revoked; the **real** `SecretRevocationSweep.executionRevoked` writes `revoked_at`; the runner's FINAL (outer `ERROR / CANCELLED / CANCELLED`, every step `SKIPPED`, `secretUse LOGIN_PW=NOT_USED`) goes through the real `ProgressReportService.apply`; `start_deadline_at` is moved into the past and the real `RunningReaper.reapOnce()` runs.

Observed, step by step (case `todayAPreReadyRevocationFinalIsRefusedAndTheReaperSettlesWithoutANamedCause`, green, the characterization):

| Step | Observed |
|---|---|
| after revoke | ledger `ADMITTED`, `revoked_at` set, `cancel_requested_at` null, execution `PENDING`, `browser_started_at` null |
| FINAL delivered | `409 TRANSITION_REJECTED`; ledger still `ADMITTED`; execution still `PENDING`, `error_code` null |
| reaper pass | `reapOnce()` changed 1 row; ledger `DONE`, execution `ERROR`, `error_code START_TIMEOUT` |

Target case `aPreReadyRevocationIsSettledAsAuthorizationRevoked` (red by design) prints `ADJ1-PROBE pre-Ready revoked run -> FINAL=REFUSED 409 TRANSITION_REJECTED ledger(after FINAL)=ADMITTED reaper changed=1 settled=DONE/ERROR/START_TIMEOUT error_code=START_TIMEOUT` and fails two soft assertions: "FINAL is accepted" (was `409 TRANSITION_REJECTED`) and "ends AUTHORIZATION_REVOKED" (was `START_TIMEOUT`).

The two cases do different jobs. The characterization is green today and is the fixture's proof; it changes by design if C1 picks (a) and stays as the regression pin if C1 picks (b). The target asserts option (a)'s outcome and is red until the C1-ruled implementation; if C1 picks (b), lane B deletes it and records why. I decided nothing between (a) and (b).

### Facts for the C1 ruling (read from source while building the probe; labelled)

- [V] `StudioDispatchLedgerStatements.applyFinal` owns `state = 'RUNNING' OR (state = 'ADMITTED' AND cancel_requested_at IS NOT NULL)`. A revoked, un-cancelled `ADMITTED` row is neither, hence the 0-row result and `ProgressReportService.refusal` -> `TRANSITION_REJECTED`.
- [V] `ProgressReportService.apply` sets `observedPreReady = false` when `revoked`, so the dedicated pre-Ready path (`applyObservedPreReadyFailure`, which requires `cancel_requested_at IS NULL`, `ADMITTED`, `PENDING`, and the reviewed reason set that does not contain outer `CANCELLED`) is **not** taken for a revoked row.
- [V] `RunnerOutcomeCodes.errorCodeFor(ERROR, CANCELLED, cancelRequested=false, revoked=true)` already returns `AUTHORIZATION_REVOKED`, and the `history` CTE of `applyFinal` already accepts `execution.status = 'PENDING'` with ledger `ADMITTED`. So under (a) the naming comes from existing mapping; the question is only the ledger predicate.
- [I] An (a) built as one more disjunct on that ledger predicate (`ADMITTED AND revoked_at IS NOT NULL`) matches C1's "one added predicate on the existing ledger CAS". Whether it widens the OBS-006 reviewed edge, and the security review, are @architect's.
- [I, not tested] `ProgressReportService.apply` calls `secretRevocation.executionRevoked(...)` inside the report's own transaction. If a revocation were first discovered there and the report is then refused with 409, the transaction rolls back `revoked_at`. In the probe the sweep ran first, in its own transaction, as the scheduled sweep does on the worker profile.

### What this probe does not include

The runner is simulated at the report boundary (`ProgressReportService.apply` is what the internal progress route calls). The story's "initial-context pause seam" of the real runner is not used; the lane that implements the ruling joins the real runner in the co-run evidence window. No PID signalled, no browser started.

## Batons

1. **Lane B** extends `GuidedEvidencePendingAppendIT` (R1 b to d) after @architect's written confirmation that recording evidence is non-consuming (ruling A11), and decides the ADJ-1 target case after C1.
2. **@architect at W1.5:** C1 choice between (a) and (b) using the facts above; the R1 confirmation. R1 stays a disclosed known limit (KL-015-R1) until landed, per AC-11 R1 e.
3. The ADJ-1 probe imports `DispatcherIT.FakeRunner` (package-private nested config). If that class moves, the compile error is loud and local.

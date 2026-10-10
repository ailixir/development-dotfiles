# OBS-006 observed pre-Ready terminal failure

Status: narrow implementation design for independent security review, not a verdict. OBS-006 stays InProgress. Preserve `joined-attempts/pre-ready-final-rejection` and all earlier results. This completes the existing observed account/launch failure and evidence requirements; it grants no new execution authority.

## 1. Reproduced boundary and unchanged contracts

The real three-case joined run against runner pre-Ready fix `3b08c0b371086ed2d43fea4a5df73caa1a4f9f66b4d3380924e93e04712a4cd9` has two passing cases and one unresolved terminal report. The runner now correctly accumulates unexecuted SKIPPED steps silently and sends FINAL sequence1, with no STARTED/PROGRESS, after genuine account apply failure. Backend `StudioDispatchLedgerStatements.applyFinal` admits RUNNING, or ADMITTED **only** with cancel_requested_at. It rejects this noncancelled ADMITTED account failure; reporting ends with ownership_lost and public streamComplete remains false.

Keep the existing ordinary/cancellation predicates and STARTED requirements. No synthetic browser origin, RUNNING transition, authored invocation, new admission, learned-plan success, or PASSED result. No DTO/model/IPC/schema/migration change. The existing ADMITTED→FINALIZING matrix edge can be used by a narrowly checked new observed failure path; its prior source-backed use is cancellation, not general launch failure. Existing ordinary error-code mapping remains unchanged.

## 2. Exact raw service predicate

Add an observed-only branch in actual `ProgressReportService.apply`, after path/identity/bounds and immutable execution lookup, **before** `RunnerReportProjection.project`. Do not derive admissibility from projected steps: projection currently collapses duplicate indices with Map.put and fills omissions with PENDING; its null-origin check omits durationMs. A projection cannot prove the raw report was complete or unexecuted.

The new branch uses server-held `UITestExecution.observedRevisionBinding` and `observedAdmissionReceipt`, never a report-supplied family bit, model provenance or claimed runtime version as authority. Parse/validate the stored ExecutionBinding and AdmissionReceipt through existing strict v2 contracts. Check their mutual execution/acceptedAt/attempt/revision/digest/CSI/scope/configuration/artifact/plan/reference/publication/profile/build/grant/account-grant identities exactly, including receipt.request.admissionId and receipt.admissionId equality. Join their executionId/attemptId/admissionId/runnerInstanceId to the raw report. The SQL transaction rechecks the same immutable documents and actual admitted owner, so a stale JPA read cannot grant the branch. Missing/malformed/cross-execution or contradictory documents refuse; legacy rows with no observed binding remain on the old path.

Raw candidate requirements, all mandatory:

- kind exactly FINAL; outcome present; outcome.result exactly ERROR. No PASSED, FAILED, STARTED or PROGRESS is admitted by this exception.
- browserStartedAt null. RunnerReport has **no overall duration field**; unknown fields remain rejected by StrictInternalBodyReader. Every raw step startedAtMs, finishedAtMs and durationMs must be null; every log atMs must be null. Projection must subsequently produce durationMs=null. reportedAt remains a real required terminal-report timestamp, not a browser origin.
- raw steps array present with exactly the immutable original revision's source-step count (1..100). Exactly one index each0..count−1, no duplicate/missing/extra/null indices. Each status exactly SKIPPED and failure null. No projected PENDING fill or index deduplication can satisfy this check; payloadReduced=true cannot excuse missing coordinates. No assertion/action has run.
- First transition from ADMITTED requires runnerSequence1 and ledger last_runner_sequence0. The ordinary positive/monotone sequence checks remain on all other branches. Subsequent evidence-only FINAL reports use the existing FINALIZING settlement path, rather than replaying this transition.
- No active current test/source/head/model/Core grant is re-created to accept a failure. Authority is the immutable accepted execution/admission and still-owned ledger state, not current learning consent or a new callback entitlement. Current deployment model defaults and claimed runtime/model labels cannot authorize this path.

### Source-derived failure pair

Current `ObservedPreReadyFailure` handling in `runCoordinator.ts` maps the child reason to outer `outcome.errorCode="RUN_ERROR"` when there is no recorded parent cancel. `ObservedAccountLifecycle` converts provider consume/prepare/apply failure to ACCOUNT_UNKNOWN; missing compiled provider yields ACCOUNT_UNAVAILABLE. The observed child checks profile/launch identity/policy/account receipt/initial context and its pre-Ready timers before it can issue Ready2. Their fixed reasons are:

```text
outcome.errorCode = RUN_ERROR
outcome.errorMessage in {
 INVALID_CONTRACT, PROFILE_MISMATCH, POLICY_REFUSED, AUTHORIZATION_EXPIRED,
 ACCOUNT_UNAVAILABLE, ACCOUNT_UNKNOWN, TARGET_DRIFT, TIMEOUT, CANCELLED, INTERNAL_ERROR
}
```

Require exact case/whole-string membership. Never allow blanket RUN_ERROR or arbitrary browser/provider exception prose. INTERNAL_ERROR is the child's existing `replayError` fallback for a failure inside its validated launch path, not a new alias. RUN_ERROR/CANCELLED can describe child shutdown/drain without asserting the API-owned CANCELLED code; the existing mapping leaves API error_code null. The old outer CANCELLED path still requires its recorded ledger cancel; this exception does not replace/broaden that path. No new API-assigned code is copied from the runner. READ_REFUSED, ASSERTION_FAILED, REFERENCE_REFUSED and OUTCOME_UNKNOWN are not added to this pre-Ready set because the authored executor has not started. Generic BROWSER_LAUNCH_FAILED/START_DEADLINE_EXCEEDED residual parent reports are not silently admitted: they do not currently carry this validated complete pre-Ready child snapshot. Their existing behavior is unchanged.

## 3. Atomic SQL and interfaces

Keep existing public `StudioDispatchLedgerStatements.applyFinal(...)` signature and semantics for all current callers. Add `applyObservedPreReadyFailure(...)` with the same projected data plus expected immutable binding/receipt JSON. Share SQL construction/private implementation if useful, with a server-derived optional branch; no public boolean field or unchecked generic ADMITTED permission.

The observed branch must join the partitioned execution using **both** execution_id and execution_accepted_at. Recheck under the ledger row lock, in the same statement/transaction as outcome/evidence/snapshot/ledger updates:

```text
ledger.execution_id = report.executionId
ledger.attempt_id = report.attemptId
ledger.admission_id = report.admissionId
ledger.runner_instance_id = report.runnerInstanceId
ledger.state = ADMITTED
ledger.last_runner_sequence = 0 AND report.runnerSequence = 1
ledger.cancel_requested_at IS NULL                     -- cancellation keeps its old path
execution.id = ledger.execution_id
execution.started_at = ledger.execution_accepted_at
execution.status = PENDING AND execution.browser_started_at IS NULL
execution.observed_revision_binding = expectedBinding::jsonb
execution.observed_admission_receipt = expectedReceipt::jsonb
expectedBinding IS NOT NULL AND expectedReceipt IS NOT NULL
execution.revision_id = expectedBinding.revisionId
execution.ui_test_id/csi_id/principal/environment = expectedBinding's exact tuple
expectedBinding.executionId/startedAt/attemptId = execution/ledger tuple
expectedReceipt.admissionId = expectedReceipt.request.admissionId = ledger.admission_id
expectedReceipt.request.runnerInstanceId = ledger.runner_instance_id
expectedReceipt.startDeadlineAt/runDeadlineAt match the stored admitted ledger deadlines
revision.id/test_id/csi_id = execution's immutable revision tuple
revision.publication_kind = GUIDED_RUN AND revision.artifact_schema_version = 2
projected.status = ERROR AND projected.durationMs IS NULL
```

Compare the two complete immutable JSON documents as well as their tuple fields; do not merely check nonnull. Stored binding/receipt schema/immutability constraints from V33 remain intact. The service establishes raw no-readings/complete coordinates/fixed reasons; SQL is the final current-state/ownership/immutable-binding CAS. Do not join current ui_tests source or confirmed head as a substitute for immutable accepted revision identity. Late reports after another owner/cancel/reaper/terminal transition cannot take this new edge.

On success reuse the existing atomic FINAL machinery: update ERROR/end timestamp/null duration, exact projected SKIPPED rows and bounded diagnostics/runtime/evidence metadata; move ledger to FINALIZING with sequence/manifest key; register the existing afterFinal evidence/history/recovery behavior. No execution/admission creation, no browser_started_at assignment, no schedule/model action. Commit failure rolls everything back and yields non200; a sender retries the same report without another browser.

Keep existing source-truth idempotence: `isAlreadyApplied` recognizes the **same owner and sequence**, not a payload hash. A duplicate can be acknowledged as applied=false without writing; never claim byte-equal retry detection. New raw validation remains before that acknowledgement. A different owner/attempt is refused. Later FINAL evidence settlement on FINALIZING retains the original outcome and only advances evidence disposition under its existing invariants; it does not reenter ADMITTED or create readiness.

Malformed shape/fixed-reason/coordinate errors use existing data-free INVALID_REPORT400. Immutable scope/owner/state/sequence CAS refusals use existing409 callback codes. Do not expose original parser/provider exception text. Original common reports are still processed through their existing branch; the observed exception cannot make an ordinary unstarted report valid.

## 4. Recording truth

Real recording is independent of Ready2/browserStartedAt and assertion outcome. Keep a finalized playable object and its actual key/bytes/inspection/upload result even when browser origin and step times are null. An orderly account failure recording has partial=false; `partialFor` derives it only from orderlyClose. A salvaged prefix retains partial=true when existing inspection establishes it. Do not force UNAVAILABLE, invent origin/timings, infer bytes from success, or reinterpret failed assertions as partial recording.

The strict genuine account-apply case must finish with streamComplete=true, ERROR, no browser start, all three SKIPPED/null-timed coordinates, an actual WebM of at least512 bytes with its header, correct inspection-derived partial flag and no private account canary in snapshots/logs/manifests. App navigation/submission and both provider counters remain unchanged.

## 5. Required independent tests and ownership

Use the current owned `GuidedPublicationReplayIT` real production application/PostgreSQL/guided learning/pure validation/ordinary admission/recorded child. Its published revision/admission remains genuine. Controlled account SPI may pause/fail setup to expose a real ADMITTED/no-Ready window. Synthetic malicious callback requests are **negative probes only**, never substitutes for a driver, a positive browser result or publication evidence. The eventual positive FINAL is sent by the owning real worker.

Required probes before the positive owning-worker final:

1. Ordinary legacy ADMITTED/no cancel remains refused; missing observed binding/receipt cannot enter the new branch. Existing cancellation regression suite remains unchanged.
2. Wrong execution/attempt/admission/runner, revision/scope/binding/receipt association and first sequence0/2 cannot write. Wrong immutable associations are refused by SQL/schema guards; no fixture may disable those guards to fabricate a positive result.
3. Raw PASSED/FAILED, STARTED/PROGRESS, nonnull origin, any zero-or-nonzero timing including duration, non-SKIPPED status/failure, duplicate/missing/extra/out-of-range coordinate, payload-reduced incomplete snapshot and unsupported outer/inner reason refuse. Include duplicates that projection would otherwise erase.
4. Real account prepare/apply/initial-state failure records terminal ERROR with no authored effects; current actual apply failure is the primary joined regression. Complete truthful null-origin coordinates and retained playable recording must reach the public snapshot.
5. Inject commit failure using the existing ReportCommitHook seam: no partial terminal mutation; actual reporter retry commits once. Same-owner/sequence duplicate returns applied=false with no rewrite. Different-owner retry refuses. Evidence-only follow-up preserves the failure and does not create STARTED or PASS.
6. Preserve normal started observed replay, existing ordinary runs, cancellation, reporting size/redaction/sequence checks, and all actual source/worker manifests. No relaxed assertion or source-free IPC expansion.

Existing owned files: `StudioDispatchLedgerStatements.java`, `RunnerReportProjection.java`, `AdmissionCasIT.java`, `GuidedPublicationReplayIT.java` (full repository-relative paths already in story). Add only:

- backend/src/main/java/com/citi/put/checks/studio/internal/ProgressReportService.java
- docs/specs/studio-observed-authoring/pre-ready-terminal-design.md
- .ai/STUDIO-OBS-006-pre-ready-terminal-design.json

No new runtime edit is requested by this amendment: the runner ordering fix is already separately verified and frozen; delayed acquisition has its own reviewed implementation lane. The broad mock-only `ObservedAdmissionSecurityIT` injects ProgressReportService, so it cannot prove this new service predicate; reuse actual joined/AdmissionCas tests rather than claiming that mocked boundary as coverage. No earlier design, gate, report or closed-story evidence is changed.

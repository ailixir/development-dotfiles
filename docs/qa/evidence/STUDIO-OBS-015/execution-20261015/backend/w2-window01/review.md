# STUDIO-OBS-015 w2-window01: Zonky test dependency removed, TransportFaultIT and bridge fixture drift

Dex-W2 (@dev). 2026-10-16. Nothing was committed, and no production source changed. This window grants no QA
credit. Hashes are in `manifest.json`; the full diff is in `w2.diff`.
[V] = I ran it or read it. [I] = inferred.

## 1. Zonky test dependency (coordinator ruling)
- **Removed** `testImplementation("io.zonky.test:embedded-database-spring-test:2.5.1")` from `backend/build.gradle.kts`.
- **Kept** the runtime Zonky deps for the local profile: `embedded-postgres-binaries-bom:15.6.0` and
  `embedded-postgres:2.0.7`.
- **Comment** line 81 now says that tests use Testcontainers.
- **Usage check.** Nothing under `backend/src` imports `io.zonky.test.db` [V]. The only Zonky user is
  `LocalEmbeddedPostgresConfig` (main) [V].
- **`compileTestJava`** passed in all 4 runs [V].
- **ReplayIT probe (`w2-w01-tfit-zonky01`).** One ordered case ran,
  `editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness`.
  - The XML has 0 "Mapped port can only be obtained" and 0 `EmbeddedDatabaseTestExecutionListener` frames. The
    h8h6 full01 `test` XML had 3 and 5 [V].
  - The class still records an `executionError`, but with a different cause: "the OBS-007 case registered its
    canaries", from `scanCompleteAuditStream` in `@AfterAll`. The case itself fails at `:14917` (an `@Order(3)`
    precondition).
  - Both failures come from the class design: any partial ReplayIT selection hits them. They are not a removal
    regression [V, source read].
  - I did **not** run a full ReplayIT lane: it takes about 18 min per lane, and Dex-D3's B2 patch is pending.
    A full run is still needed to show the lane `executionError` is gone.

## 2. TransportFaultIT: pre-existing fixture drift, fixed
- **Refusal path** [V]: `materialize` → `GuidedMaterializationService.freeze:70` →
  `GuidedSourceReferenceValidator.resolve:75`, which requires `stepExists`.
  - The candidate is the shared `contracts/v3/fixtures.json` `documents.secretReference`. Its `stepId` is
    `00000000-0000-4000-8000-000000000001`.
  - The IT's session steps, source map, manifest and `ui_tests` row all used `"step-1"`. So `stepExists` was
    false and the call threw `INVALID_CONTRACT` 422.
- **Origin of the drift: the 015 contracts lane, not H8** [V].
  - `contracts/touched-files.json` records fixtures.json going from `bdbd5956…` to `b5942f63…`.
  - The archived `contracts/baseline` copy has `stepId` `step-1`.
  - Every later `before/` copy, and the current file (`b5942f63…`, mtime 2026-10-15 00:14), has the UUID.
  - H8 touches neither the validator nor fixtures.json.
- **Fix (test only).** I added `STEP_ID = DOCUMENTS.secretReference.stepId`, derived from the shared fixture, and
  replaced all 16 `"step-1"` literals with it. No assertion was removed or relaxed. There is no compat shim, and
  the old value is not accepted.
- **`w2-w01-tfit-class01`** (whole TransportFaultIT plus StopKeyTest): **28/28 PASS, 0 skip**,
  `validationSucceeded true`, 42 s.
  - This includes the H8 cases: 3-send `actualStopOwnershipRecordsRealSenderRefusalWithoutConfirmation`,
    `expiredTeardownConfirmsOn{ImmediateResend,Sweep}…`, `teardownWithoutAck…`, `concurrentAfterCompletion…` and
    `legacyPending…`.
  - Both `actualConsumedGuidedControllerJvmCrash…` cases pass. That is the h8tests hang site, now 0 hangs.
  - The class `executionError` from h8tests02 is gone. [I] It was a consequence of the 11 setup failures.

## 3. GuidedBridgeIntegrationTest: pre-existing drift; partly fixed, the rest is BLOCKED
- **Refusal path** [V]: `dispatch.pushContext` → `GuidedSessionService.contextDeliveryId` → `translationTransaction:174`
  requires `translation != null && translation.exists(id)`, otherwise `RUNTIME_INCOMPATIBLE`.
  - The bridge Spring config never called `installTranslation`, and no session had translation state.
  - All 31 failures are exactly the 31 `pushContext` call sites.
- **Origin: 015 delivery/ACK work, before H8** [V].
  - The H8 pre-image `GuidedSessionService` (`055081ff…`, = h8h6 `sha256Before`) already routes `contextDeliveryId`
    through `translationTransaction`. Its `GuidedDispatchService` pre-image (`174d99ac…`) already calls it at `:97`.
  - OBS-007 source zips up to 2026-10-12 have no `contextDeliveryId`. HEAD `pushContext` only sent the context.
  - `h8.patch` does not touch either path.
- **Production check.** Production always has translation. `GuidedSessionConfiguration` calls `installTranslation`
  unconditionally, and `start` initializes translation state through `GuidedProductionSessionAccess` (the only
  access bean, `@ConditionalOnMissingBean`). The only production `pushContext` callers are in
  `GuidedTranslationService`. So this is not a production defect, and I left production untouched.
- **Fixture fix (test only), so the fixture matches the production single-path setup:**
  - The service bean now calls `installTranslation(GuidedTranslationStore, GuidedClarificationContextStore)`.
  - `createSession` initializes translation state in a `repository.transaction`. The manifest uses the session's
    testId and revisions, policy `INPUT-POLICY-01-A` (required by the V14 check), and the session's `sourceSteps`.
  - The first attempt (`exp01`) omitted `policy` and failed 38/38 on the V14 check. That was my own error,
    corrected in exp02.
- **`w2-w01-bridge-exp02`: 38 total, 9 PASS, 29 FAIL** [V].
  - The 7 earlier passes still pass.
  - Newly passing: the **new H8 `stopRetryAfterCloseCompletesConfirmsWithSameKey`** and
    `callbackAcceptsValidUnicodeSessionLargerThan64KiB`.
  - All 31 earlier `pushContext` refusals now get past `pushContext`.
  - All 29 failures are `MISSING_SOURCE` at the next single-path gate (28 via HTTP `admit` at `:2874`, 1 via
    `race`). `GuidedSessionService.admit:1375` calls `translation.attachAdmission`, which requires a
    `studio_guided_obligation_admissions` row from a planner-issued plan.
  - These 29 tests hand-craft proposals that bypass the planner. That admission mode no longer exists in
    production.
- **BLOCKED, needs a ruling from @architect / coordinator.** There is no narrow lawful fix:
  - Seeding obligation-admission or plan rows would manufacture planner authority.
  - Removing the translation gate is a production change without a production defect.
  - Options: (a) move these 29 cases onto planner-issued obligations, the same way `GuidedPlanningIntegrationTest`
    and ReplayIT drive them; or (b) re-home or retire the bridge-only admission cases.
  - I kept the wiring change because it is faithful to production and needed under either option. The pre-W2
    bytes are `68b65fad…`; revert with `w2.diff` if you rule otherwise.

## 4. Not done / not run
- No full ReplayIT lane (B2 methods untouched; ReplayIT bytes still `03ec45ef…`).
- No spotless, checkstyle or spotbugs.
- No CodeRabbit (WSL-only).
- No changes to the frontend or runner.
- PID 22246 was not signalled; no process was signalled at all.

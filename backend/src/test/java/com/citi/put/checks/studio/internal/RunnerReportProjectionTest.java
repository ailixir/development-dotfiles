package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ReplayFailure;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Story 10.7 AC-24, AC-25 — the {@code RunnerReport → ExecutionSnapshot} projection, one case per
 * row of the mapping table on {@code RunnerReport} in the frozen contract.
 *
 * <p>Every assertion about the projection's output is made on the <b>serialized bytes</b> rather
 * than on the mapper's return value, because the mapper's return value is not what anybody reads.
 */
class RunnerReportProjectionTest {

  private static final UUID EXECUTION = UUID.randomUUID();
  private static final Instant ORIGIN = Instant.parse("2026-09-10T10:00:02Z");
  private static final Duration RETENTION = Duration.ofDays(30);
  private static final Instant NOW = Instant.parse("2026-09-10T10:00:39Z");

  private final ObjectMapper objectMapper =
      JsonMapper.builder()
          .addModule(new JavaTimeModule())
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
          .build();

  private final List<StepResult> original =
      List.of(
          StepResult.pending(0, "Go to the home page"),
          StepResult.pending(1, "Check that the URL contains dashboard"),
          StepResult.pending(2, "Click the profile menu"));

  // ── steps[] → stepResults[] ──────────────────────────────────────────────

  @Test
  void
      revocationUsesIndependentFactWithUserCancelPriorityAndNeverRewritesPassingOrFailingReports() {
    var cancellation = terminal(RunOutcome.ERROR, "CANCELLED", "cancelled");
    assertThat(
            RunnerReportProjection.project(cancellation, original, RETENTION, NOW, false, false)
                .errorCode())
        .isNull();
    assertThat(
            RunnerReportProjection.project(cancellation, original, RETENTION, NOW, false, true)
                .errorCode())
        .isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    assertThat(
            RunnerReportProjection.project(cancellation, original, RETENTION, NOW, true, true)
                .errorCode())
        .isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(
            RunnerReportProjection.project(
                    terminal(RunOutcome.ERROR, "AUTHORIZATION_REVOKED", "spoof"),
                    original,
                    RETENTION,
                    NOW,
                    false,
                    true)
                .errorCode())
        .isNull();
    for (String result : List.of(RunOutcome.PASSED, RunOutcome.FAILED)) {
      var originalResult =
          terminal(result, result.equals(RunOutcome.FAILED) ? "ASSERTION_FAILED" : null, null);
      assertThat(
              RunnerReportProjection.project(originalResult, original, RETENTION, NOW, true, true)
                  .status())
          .isEqualTo(result);
      assertThat(
              RunnerReportProjection.project(originalResult, original, RETENTION, NOW, true, true)
                  .errorCode())
          .isNull();
    }
  }

  @Test
  void untouchedStepsAreFilledPendingFromTheRevisionSoEveryOriginalStepHasAnEntry() {
    RunnerReport report =
        progress(
            List.of(new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null)),
            List.of());

    String json = serialize(project(report).stepResults());

    assertThat(json)
        .as("one entry per original step, even for the two the runner never touched")
        .contains("\"stepIndex\":0")
        .contains("\"stepIndex\":1")
        .contains("\"stepIndex\":2");
    assertThat(project(report).stepResults()).hasSize(3);
    assertThat(project(report).stepResults().get(1).status()).isEqualTo(StepResult.PENDING);
    assertThat(project(report).stepResults().get(1).offsetMs()).isNull();
  }

  @Test
  void originalTextComesFromTheRevisionAndIsNeverEchoedByTheRunner() {
    RunnerReport report =
        progress(
            List.of(new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null)),
            List.of());

    assertThat(serialize(project(report).stepResults()))
        .contains("\"originalText\":\"Go to the home page\"");
  }

  @Test
  void aStepStatusFromTheRunOutcomeVocabularyIsA400AndNeverASilentCoercion() {
    RunnerReport passed =
        progress(List.of(new RunnerStepState(0, "PASSED", 1.0, 2.0, 1.0, null)), List.of());
    RunnerReport failed =
        progress(List.of(new RunnerStepState(0, "FAILED", 1.0, 2.0, 1.0, null)), List.of());

    assertThatThrownBy(() -> project(passed))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("PENDING|RUNNING|PASS|FAIL|SKIPPED");
    assertThatThrownBy(() -> project(failed)).isInstanceOf(StudioValidationException.class);
  }

  // ── the three binding rules (ADR-002 §11.7) ──────────────────────────────

  @Test
  void theApiAppliesNoCalibrationAndNeverRebasesAgainstTheFirstReadingItHasSeen() {
    // A first reading of an hour, which is exactly what a process-origin runner clock produces
    // today (ADR-002 §11.1). The persisted offset must be that value, not zero.
    RunnerReport report =
        progress(
            List.of(
                new RunnerStepState(0, StepResult.PASS, 3_600_000.0, 3_604_000.0, 4_000.0, null),
                new RunnerStepState(1, StepResult.PASS, 3_604_000.0, 3_605_000.0, 1_000.0, null)),
            List.of());

    String json = serialize(project(report).stepResults());

    assertThat(json)
        .as("re-basing against the lowest reading would have concealed the §11.1 defect")
        .contains("\"offsetMs\":3600000")
        .contains("\"offsetMs\":3604000")
        .doesNotContain("\"offsetMs\":0,");
  }

  @Test
  void zeroIsAPositionAndSurvivesTheProjectionDistinctlyFromNull() {
    RunnerReport report =
        progress(
            List.of(new RunnerStepState(0, StepResult.PASS, 0.0, 10.0, 10.0, null)),
            List.of(
                new RunnerLogEntry(0.0, "info", "browser started"),
                new RunnerLogEntry(null, "info", "run finished")));

    String steps = serialize(project(report).stepResults());
    String logs = serialize(project(report).logs());

    assertThat(steps).contains("\"offsetMs\":0");
    // atMs = 0 is the browser start: the derived instant is browserStartedAt exactly.
    assertThat(logs).contains("\"at\":\"2026-09-10T10:00:02Z\"");
    // atMs = null is the absence of a reading: never the epoch, never the browser start.
    assertThat(logs).contains("\"at\":null");
    assertThat(logs).doesNotContain("1970");
  }

  @Test
  void theApiRoundsOnceAtPersistence() {
    RunnerReport report =
        progress(
            List.of(new RunnerStepState(0, StepResult.PASS, 120.4, 4300.6, 4180.5, null)),
            List.of(new RunnerLogEntry(36_900.6, "info", "step 1 PASS")));

    assertThat(serialize(project(report).stepResults()))
        .contains("\"offsetMs\":120")
        .contains("\"durationMs\":4181");
    assertThat(serialize(project(report).logs()))
        .as("browserStartedAt + round(atMs) — one rounding, at persistence")
        .contains("\"at\":\"2026-09-10T10:00:38.901Z\"");
  }

  // ── logs[].atMs → logs[].at, and the §11.2 invariant ─────────────────────

  @Test
  void theInstantIsBrowserStartedAtPlusAtMsAndNothingElse() {
    RunnerReport report =
        progress(List.of(), List.of(new RunnerLogEntry(36_900.0, "info", "step 1 PASS")));

    assertThat(serialize(project(report).logs())).contains("\"at\":\"2026-09-10T10:00:38.900Z\"");
  }

  @Test
  void aReportWithNoOriginCarriesNoReadingAndOneThatBreaksThatIsA400() {
    RunnerReport withOriginlessReading =
        new RunnerReport(
            EXECUTION,
            UUID.randomUUID(),
            UUID.randomUUID(),
            "studio-runner-0",
            RunnerReport.PROGRESS,
            2L,
            NOW,
            null,
            List.of(),
            List.of(new RunnerLogEntry(10.0, "info", "something")),
            false,
            Map.of(),
            null,
            null,
            null,
            Map.of());

    assertThatThrownBy(() -> project(withOriginlessReading))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("browserStartedAt: null carries no reading");
  }

  @Test
  void withNoOriginAndNoReadingsTheProjectionYieldsNullInstantsRatherThanAPartialDerivation() {
    RunnerReport report =
        new RunnerReport(
            EXECUTION,
            UUID.randomUUID(),
            UUID.randomUUID(),
            "studio-runner-0",
            RunnerReport.PROGRESS,
            2L,
            NOW,
            null,
            List.of(),
            List.of(new RunnerLogEntry(null, "info", "queued")),
            false,
            Map.of(),
            null,
            null,
            null,
            Map.of());

    assertThat(serialize(project(report).logs())).contains("\"at\":null").doesNotContain("1970");
  }

  @Test
  void levelIsLowerCaseOnTheWireAndUpperCaseOnTheSnapshot() {
    RunnerReport report =
        progress(
            List.of(),
            List.of(
                new RunnerLogEntry(0.0, "info", "a"),
                new RunnerLogEntry(1.0, "warn", "b"),
                new RunnerLogEntry(2.0, "error", "c")));

    assertThat(serialize(project(report).logs()))
        .contains("\"level\":\"INFO\"")
        .contains("\"level\":\"WARN\"")
        .contains("\"level\":\"ERROR\"");
  }

  @Test
  void anUnknownRunnerLevelIsA400() {
    RunnerReport report =
        progress(List.of(), List.of(new RunnerLogEntry(0.0, "DEBUG", "no runner produces this")));

    assertThatThrownBy(() -> project(report)).isInstanceOf(StudioValidationException.class);
  }

  // ── outcome, errorCode, evidence, runtime ────────────────────────────────

  @Test
  void outcomeResultBecomesStatusAndPendingAndRunningStayApiOwned() {
    assertThat(project(terminal(RunOutcome.PASSED, null, null)).status()).isEqualTo("PASSED");
    assertThat(project(terminal(RunOutcome.FAILED, null, null)).status()).isEqualTo("FAILED");
    assertThat(project(terminal(RunOutcome.ERROR, null, null)).status()).isEqualTo("ERROR");
  }

  @Test
  void aReaperOwnedCodeIsNeverObtainableByARunnerThatNamesIt() {
    RunnerReportProjection.Projected projected =
        project(terminal(RunOutcome.ERROR, ExecutionErrorCode.START_TIMEOUT, "browser never came"));

    assertThat(projected.errorCode())
        .as("a verdict only the reaper can observe must not be publishable by the runner")
        .isNotEqualTo(ExecutionErrorCode.START_TIMEOUT)
        .isNull();
    assertThat(projected.diagnostic()).contains("START_TIMEOUT");
  }

  @Test
  void theOneMappingASourceFixesIsTheParentEnforcedTotalTimeout() {
    assertThat(project(terminal(RunOutcome.ERROR, "TIMEOUT", "total runtime")).errorCode())
        .isEqualTo(ExecutionErrorCode.TIMEOUT);
  }

  @Test
  void evidenceStateProjectsOntoVideoStatusAndExpiredIsNeverReported() {
    assertThat(project(withEvidence(RunnerEvidence.PENDING)).videoStatus()).isEqualTo("PROCESSING");
    assertThat(project(withEvidence(RunnerEvidence.STORED)).videoStatus()).isEqualTo("AVAILABLE");
    assertThat(project(withEvidence(RunnerEvidence.FAILED)).videoStatus()).isEqualTo("FAILED");
    assertThat(project(withEvidence(RunnerEvidence.UNAVAILABLE)).videoStatus())
        .isEqualTo("UNAVAILABLE");
    // AVAILABLE is the API's judgment against retention, which the runner cannot observe.
    assertThat(project(withEvidence(RunnerEvidence.STORED)).videoExpiresAt())
        .isEqualTo(NOW.plus(RETENTION));
  }

  @Test
  void theManifestKeyIsRecordedAndNotPublishedOnTheSnapshot() {
    RunnerReportProjection.Projected projected = project(withEvidence(RunnerEvidence.STORED));

    assertThat(projected.manifestKey()).isEqualTo("studio/manifest.result.json");
    assertThat(serialize(projected.stepResults())).doesNotContain("manifest");
    assertThat(serialize(projected.logs())).doesNotContain("manifest");
  }

  @Test
  void runtimeVersionsIsNarrowedToTheSection46Subset() {
    RunnerReport report =
        new RunnerReport(
            EXECUTION,
            UUID.randomUUID(),
            UUID.randomUUID(),
            "studio-runner-0",
            RunnerReport.PROGRESS,
            2L,
            NOW,
            ORIGIN,
            List.of(),
            List.of(),
            false,
            Map.of(
                "playwright", "1.63.0",
                "node", "v22.11.0",
                "observedSchemaBundleHash", SCHEMA_BUNDLE_HASH,
                "observedBrowserLauncherSha256", LAUNCHER_SHA256,
                "syntaxReference", "1.0.0"),
            null,
            null,
            null,
            Map.of());

    String json = serialize(project(report).runtime());

    assertThat(json)
        .contains("\"playwright\":\"1.63.0\"")
        .contains("\"validator\":\"3:" + SCHEMA_BUNDLE_HASH + "\"");
    assertThat(json)
        .as("the open runner set is not copied wholesale")
        .doesNotContain("syntaxReference")
        .doesNotContain("node");
  }

  // ── STUDIO-OBS-009 AC-1 P2 b: the public RuntimeVersions after the artifact-1 stamps go ───────
  //
  // T0 ruling A7: the five public names stay; their meanings re-point in projectRuntime only.
  // chromium <- observedChromiumBuild; validator <- "3:" + observedSchemaBundleHash; executor <-
  // observedBrowserLauncherSha256; playwright and image are unchanged. No fallback read of the
  // removed artifact-1 keys.

  private static final String SCHEMA_BUNDLE_HASH = "a".repeat(64);
  private static final String LAUNCHER_SHA256 = "b".repeat(64);

  @Test
  void runtimeVersionsProjectOntoTheObservedIdentitiesAndKeepPlaywrightAndImage() {
    RunnerReport report =
        progressWithRuntime(
            Map.of(
                "playwright", "1.63.0",
                "image", "registry.example/checks-runner:2026.10",
                "observedChromiumBuild", "141.0.7390.37",
                "observedSchemaBundleHash", SCHEMA_BUNDLE_HASH,
                "observedBrowserLauncherSha256", LAUNCHER_SHA256,
                "observedReferenceBundleHash", "c".repeat(64),
                "observedBrowserProvenance", "pinned-image"));

    var runtime = project(report).runtime();

    assertThat(runtime.playwright()).isEqualTo("1.63.0");
    assertThat(runtime.image()).isEqualTo("registry.example/checks-runner:2026.10");
    assertThat(runtime.chromium()).isEqualTo("141.0.7390.37");
    assertThat(runtime.validator()).isEqualTo("3:" + SCHEMA_BUNDLE_HASH);
    assertThat(runtime.executor()).isEqualTo(LAUNCHER_SHA256);
    assertThat(serialize(runtime))
        .as("only the five public names, none of the observed key names")
        .doesNotContain("observed")
        .doesNotContain("ReferenceBundle");
  }

  @Test
  void theRemovedArtifactOneKeysAreNeverReadAsAFallback() {
    // VAL-018 read `chromiumBuild`; the pre-P2 mapping also read `validator|validatorSchema` and
    // `executor`. With the observed keys absent, none of them may fill the public fields.
    RunnerReport report =
        progressWithRuntime(
            Map.of(
                "playwright", "1.63.0",
                "chromiumBuild", "141.0.7390.37",
                "validator", "1.0.0",
                "validatorSchema", "1.0.0",
                "executor", "1.0.0"));

    var runtime = project(report).runtime();

    assertThat(runtime.playwright()).isEqualTo("1.63.0");
    assertThat(runtime.chromium()).isNull();
    assertThat(runtime.validator()).isNull();
    assertThat(runtime.executor()).isNull();
  }

  @Test
  void anAbsentObservedKeyLeavesItsFieldNullAndNeverBuildsAHalfString() {
    var onlyChromium =
        project(progressWithRuntime(Map.of("observedChromiumBuild", "141.0.7390.37")));
    assertThat(onlyChromium.runtime().chromium()).isEqualTo("141.0.7390.37");
    assertThat(onlyChromium.runtime().validator())
        .as("no schema bundle hash: not the string \"3:null\"")
        .isNull();
    assertThat(onlyChromium.runtime().executor()).isNull();

    var onlyHash =
        project(progressWithRuntime(Map.of("observedSchemaBundleHash", SCHEMA_BUNDLE_HASH)));
    assertThat(onlyHash.runtime().validator()).isEqualTo("3:" + SCHEMA_BUNDLE_HASH);
    assertThat(onlyHash.runtime().chromium()).isNull();
  }

  // ── logs[].stepIndex (ADR-002 §33, VAL-012) ──────────────────────────────

  @Test
  void stepLinesProjectTheirStepIndexAndRunLevelLinesStayNull() {
    RunnerReport report =
        progress(
            List.of(),
            List.of(
                new RunnerLogEntry(0.0, "info", "browser started", null),
                new RunnerLogEntry(10.0, "info", "step 1 started", 1),
                new RunnerLogEntry(20.0, "info", "step 1 PASS", 1),
                new RunnerLogEntry(30.0, "info", "run PASSED")));

    List<Integer> indexes =
        project(report).logs().stream()
            .map(com.citi.put.checks.studio.dto.ExecutionLogEntry::stepIndex)
            .toList();

    assertThat(indexes).containsExactly(null, 1, 1, null);
  }

  @Test
  void aBodyWithoutStepIndexIsAnOlderRunnerAndDeserializesToNull() throws Exception {
    RunnerLogEntry entry =
        objectMapper.readValue(
            "{\"atMs\":1.0,\"level\":\"info\",\"message\":\"step 0 started\"}",
            RunnerLogEntry.class);

    assertThat(entry.stepIndex()).isNull();
    assertThat(project(progress(List.of(), List.of(entry))).logs().get(0).stepIndex()).isNull();
  }

  @Test
  void aLogStepIndexTheRevisionDoesNotHaveIsA400() {
    RunnerReport pastTheEnd =
        progress(
            List.of(), List.of(new RunnerLogEntry(1.0, "info", "step 3 started", original.size())));
    RunnerReport negative =
        progress(List.of(), List.of(new RunnerLogEntry(1.0, "info", "step -1 started", -1)));

    assertThatThrownBy(() -> project(pastTheEnd))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("Log stepIndex 3");
    assertThatThrownBy(() -> project(negative))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("Log stepIndex -1");
  }

  @Test
  void runnerSequenceIsNeverTheRevision() {
    RunnerReportProjection.Projected projected = project(terminal(RunOutcome.PASSED, null, null));

    assertThat(serialize(projected.stepResults())).doesNotContain("runnerSequence");
    assertThat(serialize(projected.logs())).doesNotContain("revision");
  }

  // ── 012A ruling R8: the pre-Ready self-stop and its refusals ──────────────

  @Test
  void observedPreReadySelfStopRunErrorCancelledIsAcceptedAndProjectsUnmappedError() {
    RunnerReport selfStop = preReady("ERROR", "RUN_ERROR", "CANCELLED");

    RunnerReportProjection.requireObservedPreReadyFailure(selfStop, original.size());
    assertThat(RunnerReportProjection.observedPreReadyRefusal(selfStop, original.size())).isNull();

    RunnerReportProjection.Projected projected =
        RunnerReportProjection.project(selfStop, original, RETENTION, NOW, false, false);
    assertThat(projected.status()).isEqualTo("ERROR");
    assertThat(projected.errorCode())
        .as("a control-window self-stop is an unmapped cancellation, never the API CANCELLED")
        .isNull();
    assertThat(projected.diagnostic()).isEqualTo("runnerErrorCode=RUN_ERROR CANCELLED");
    assertThat(projected.stepResults())
        .extracting(StepResult::status)
        .containsOnly(StepResult.SKIPPED);
  }

  @Test
  void observedPreReadyOuterCancelledWithoutRecordedCancelIsRefused() {
    // Unit-tier copy of the AdmissionCasIT pin (rawObservedFailureDoesNotTreatGenericErrors...).
    RunnerReport outerCancelled = preReady("ERROR", "CANCELLED", "CANCELLED");

    assertThatThrownBy(
            () ->
                RunnerReportProjection.requireObservedPreReadyFailure(
                    outerCancelled, original.size()))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", org.springframework.http.HttpStatus.BAD_REQUEST)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.INVALID_REPORT)
        .hasMessage("Invalid observed pre-Ready terminal report");
    assertThat(RunnerReportProjection.observedPreReadyRefusal(outerCancelled, original.size()))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.OUTER_CODE);
  }

  @Test
  void observedPreReadyLaunchUnknownIsRefusedSoTheReasonSetDoesNotGrow() {
    // 012A R8-ADJ-2: the runner no longer emits LAUNCH_UNKNOWN; the reviewed set must not admit it.
    RunnerReport launchUnknown = preReady("ERROR", "RUN_ERROR", "LAUNCH_UNKNOWN");

    assertThatThrownBy(
            () ->
                RunnerReportProjection.requireObservedPreReadyFailure(
                    launchUnknown, original.size()))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.INVALID_REPORT);
    assertThat(RunnerReportProjection.observedPreReadyRefusal(launchUnknown, original.size()))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.REASON);
    for (String reason : List.of("TIMEOUT", "INTERNAL_ERROR")) {
      RunnerReportProjection.requireObservedPreReadyFailure(
          preReady("ERROR", "RUN_ERROR", reason), original.size());
    }
  }

  @Test
  void runErrorIsNeverMappedToTheApiCancelledEvenWhenACancelWasRecorded() {
    // Pins R8's accepted race edge: a cancel recorded after the self-stop shows error_code NULL.
    assertThat(RunnerOutcomeCodes.errorCodeFor(RunOutcome.ERROR, "RUN_ERROR", true, false))
        .isNull();
  }

  @Test
  void observedPreReadyRefusalNamesTheFirstFailedClauseOnly() {
    int sources = original.size();
    RunnerReport valid = preReady("ERROR", "RUN_ERROR", "CANCELLED");
    assertThat(RunnerReportProjection.observedPreReadyRefusal(valid, sources)).isNull();
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                withKind(valid, RunnerReport.PROGRESS), sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.KIND);
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                preReadyWith(ORIGIN, skippedSteps(sources), List.of(), "RUN_ERROR", "CANCELLED"),
                sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.ORIGIN);
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                preReady(RunOutcome.FAILED, "RUN_ERROR", "CANCELLED"), sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.RESULT);
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                preReady("ERROR", "RUN_ERROR", "CANCELLED r8-canary"), sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.REASON);
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                preReadyWith(null, skippedSteps(sources - 1), List.of(), "RUN_ERROR", "CANCELLED"),
                sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.COORDINATES);
    assertThat(
            RunnerReportProjection.observedPreReadyRefusal(
                preReadyWith(
                    null,
                    skippedSteps(sources),
                    List.of(new RunnerLogEntry(0.0, "info", "a reading")),
                    "RUN_ERROR",
                    "CANCELLED"),
                sources))
        .isEqualTo(RunnerReportProjection.ObservedPreReadyClause.LOG_READING);
  }

  // ── STUDIO-OBS-008 T0 ruling A1: the replay failure cause ────────────────
  //
  // Case map (A1.5): 1 -> loginRequiredFinal*, 2 -> loginNamingAStepTheRevisionDoesNotHave*,
  // 3 -> loginWhoseNamedStepIsNotFail*, 4 -> targetDriftFinal*, 5 -> targetDriftWithA*/
  // targetDriftWhose*/targetDriftWithTwo*, 6 -> otherFailuresName*, 7 -> cancelRevocation*,
  // 8 -> nonFinal*/preReady*/noRevision*, 9 -> replayFailureCarriesNoReportedValue*.

  private static final List<String> REVISION_STEP_IDS = List.of("step-a", "step-b", "step-c");

  private static final String CANARY = "canary-s3cr3t-9f2a";

  /** Case 1: a login FINAL names the failed step, and the earlier-login flag is carried. */
  @Test
  void loginRequiredFinalNamesTheFailedStepWithLoginStepsFalse() {
    RunnerReport report =
        loginFinal("step-b", false, List.of(passed(0), failed(1, "LOGIN_REQUIRED")));

    RunnerReportProjection.Projected projected = projectWithRevision(report);

    assertThat(projected.replayFailure())
        .isEqualTo(ReplayFailure.loginRequired("step-b", 1, false));
    assertThat(projected.status()).isEqualTo("FAILED");
    assertThat(projected.errorCode()).isNull();
    assertThat(projected.stepResults().get(1).status()).isEqualTo(StepResult.FAIL);
  }

  @Test
  void loginRequiredFinalCarriesLoginStepsPresentTrueWhenAnEarlierStepFilledASecret() {
    RunnerReport report = loginFinal("step-a", true, List.of(failed(0, "LOGIN_REQUIRED")));

    ReplayFailure failure = projectWithRevision(report).replayFailure();

    assertThat(failure).isEqualTo(ReplayFailure.loginRequired("step-a", 0, true));
    assertThat(failure.loginStepsPresent()).isTrue();
  }

  /** Case 2: a runner coordinate the revision does not have is a divergence, not a cause. */
  @Test
  void loginNamingAStepTheRevisionDoesNotHaveIsA400InvalidReport() {
    RunnerReport report = loginFinal("step-zzz", false, List.of(passed(0), failed(1, null)));

    assertThatThrownBy(() -> projectWithRevision(report))
        .isInstanceOf(StudioValidationException.class)
        .hasFieldOrPropertyWithValue("code", "INVALID_REPORT")
        .satisfies(thrown -> assertThat(thrown.getMessage()).doesNotContain("step-zzz"));
  }

  /** Case 3: the named step must be one the runner reported {@code FAIL}. */
  @Test
  void loginWhoseNamedStepIsNotFailIsA400InvalidReport() {
    for (List<RunnerStepState> steps :
        List.of(
            List.of(passed(0), passed(1)),
            List.of(passed(0), skipped(1)),
            List.of(failed(0, null)),
            List.<RunnerStepState>of())) {
      RunnerReport report = loginFinal("step-b", false, steps);

      assertThatThrownBy(() -> projectWithRevision(report))
          .isInstanceOf(StudioValidationException.class)
          .hasFieldOrPropertyWithValue("code", "INVALID_REPORT");
    }
  }

  /** Case 4: drift is {@code ERROR / RUN_ERROR / TARGET_DRIFT} with exactly one failed step. */
  @Test
  void targetDriftFinalNamesTheFailedStepAndCarriesNoLoginFlag() {
    RunnerReport report = driftFinal(List.of(passed(0), failed(1, "TARGET_DRIFT"), skipped(2)));

    RunnerReportProjection.Projected projected = projectWithRevision(report);

    assertThat(projected.replayFailure()).isEqualTo(ReplayFailure.targetDrift("step-b", 1));
    assertThat(projected.replayFailure().loginStepsPresent()).isNull();
    assertThat(projected.status()).isEqualTo("ERROR");
    assertThat(projected.errorCode()).as("drift stays an unmapped runner fault").isNull();
    assertThat(serialize(projected.replayFailure())).doesNotContain("loginStepsPresent");
  }

  /** Case 5: any other drift shape is null, never a refusal. */
  @Test
  void targetDriftWithADifferentReasonNamesNothing() {
    for (String reason : List.of("TARGET_MISMATCH", "target_drift", "TARGET_DRIFT ", "", "x")) {
      RunnerReport report =
          finalReport(
              new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", reason, null),
              List.of(passed(0), failed(1, "TARGET_DRIFT")));

      assertThat(projectWithRevision(report).replayFailure()).as(reason).isNull();
    }
    RunnerReport noReason =
        finalReport(
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", null, null),
            List.of(passed(0), failed(1, "TARGET_DRIFT")));
    assertThat(projectWithRevision(noReason).replayFailure()).isNull();
  }

  @Test
  void targetDriftWithTwoFailedStepsNamesNothing() {
    RunnerReport report = driftFinal(List.of(failed(0, "TARGET_DRIFT"), failed(1, "TARGET_DRIFT")));

    assertThat(projectWithRevision(report).replayFailure()).isNull();
  }

  @Test
  void targetDriftWhoseFailedStepCarriesAnotherFailureNamesNothing() {
    for (String failure :
        new String[] {"ASSERTION_FAILED", "TARGET_DRIFT: x", "target_drift", null}) {
      RunnerReport report = driftFinal(List.of(passed(0), failed(1, failure), skipped(2)));

      assertThat(projectWithRevision(report).replayFailure()).as(String.valueOf(failure)).isNull();
    }
    assertThat(
            projectWithRevision(driftFinal(List.of(passed(0), passed(1), skipped(2))))
                .replayFailure())
        .as("no failed step at all")
        .isNull();
  }

  /** Case 6: the other failure families are not replay causes. */
  @Test
  void otherFailuresNameNothing() {
    RunnerReport assertion =
        finalReport(
            new RunOutcome(RunOutcome.FAILED, "ASSERTION_FAILED", null, null),
            List.of(passed(0), failed(1, "ASSERTION_FAILED")));
    assertThat(projectWithRevision(assertion).replayFailure()).isNull();
    assertThat(projectWithRevision(assertion).status()).isEqualTo("FAILED");

    for (String reason :
        List.of(
            "PASSWORD_CONTROL_READ_REFUSED",
            "NAVIGATION_HTTP_ERROR",
            "REFERENCE_MISMATCH",
            "INTERNAL_ERROR",
            "PROFILE_MISMATCH",
            "POLICY_REFUSED")) {
      RunnerReport report =
          finalReport(
              new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", reason, null),
              List.of(passed(0), failed(1, reason)));

      assertThat(projectWithRevision(report).replayFailure()).as(reason).isNull();
    }

    RunnerReport passedRun =
        finalReport(
            new RunOutcome(RunOutcome.PASSED, null, null, null),
            List.of(passed(0), passed(1), passed(2)));
    assertThat(projectWithRevision(passedRun).replayFailure()).isNull();
  }

  /** Case 7: an API-assigned cause wins, so nothing replay-shaped is named alongside it. */
  @Test
  void cancelRevocationAndParentTimeoutNameNothing() {
    List<RunnerStepState> steps = List.of(passed(0), failed(1, "TARGET_DRIFT"));

    RunnerReport cancelled =
        finalReport(new RunOutcome(RunOutcome.ERROR, "CANCELLED", "TARGET_DRIFT", null), steps);
    var cancelProjection =
        RunnerReportProjection.project(
            cancelled, original, REVISION_STEP_IDS, RETENTION, NOW, true, false);
    assertThat(cancelProjection.errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(cancelProjection.replayFailure()).isNull();

    var revokedProjection =
        RunnerReportProjection.project(
            cancelled, original, REVISION_STEP_IDS, RETENTION, NOW, false, true);
    assertThat(revokedProjection.errorCode()).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    assertThat(revokedProjection.replayFailure()).isNull();

    RunnerReport timeout =
        finalReport(new RunOutcome(RunOutcome.ERROR, "TIMEOUT", "TARGET_DRIFT", null), steps);
    var timeoutProjection = projectWithRevision(timeout);
    assertThat(timeoutProjection.errorCode()).isEqualTo(ExecutionErrorCode.TIMEOUT);
    assertThat(timeoutProjection.replayFailure()).isNull();
  }

  /** Case 8: only a FINAL, post-Ready, observed report can name a cause. */
  @Test
  void nonFinalReportsNameNothing() {
    RunnerReport drift = driftFinal(List.of(passed(0), failed(1, "TARGET_DRIFT")));
    RunnerReport login = loginFinal("step-b", false, List.of(passed(0), failed(1, null)));

    for (String kind : List.of(RunnerReport.STARTED, RunnerReport.PROGRESS)) {
      assertThat(projectWithRevision(withKind(drift, kind)).replayFailure()).as(kind).isNull();
      assertThat(projectWithRevision(withKind(login, kind)).replayFailure()).as(kind).isNull();
    }
    assertThat(projectWithRevision(drift).replayFailure()).isNotNull();
  }

  @Test
  void aPreReadyTargetDriftNamesNothingBecauseNoStepOwnsIt() {
    RunnerReport preReadyDrift = preReady("ERROR", "RUN_ERROR", "TARGET_DRIFT");

    RunnerReportProjection.Projected projected =
        RunnerReportProjection.project(
            preReadyDrift, original, REVISION_STEP_IDS, RETENTION, NOW, false, false);

    assertThat(projected.status()).isEqualTo("ERROR");
    assertThat(projected.stepResults())
        .extracting(StepResult::status)
        .containsOnly(StepResult.SKIPPED);
    assertThat(projected.replayFailure()).isNull();
  }

  @Test
  void noRevisionStepIdsMeansNoCauseAndNeverARefusal() {
    RunnerReport drift = driftFinal(List.of(passed(0), failed(1, "TARGET_DRIFT")));
    RunnerReport login = loginFinal("step-b", false, List.of(passed(0), failed(1, null)));

    // The pre-A1 overloads (EvidenceRetentionTest still calls the four-argument one).
    assertThat(RunnerReportProjection.project(drift, original, RETENTION, NOW).replayFailure())
        .isNull();
    assertThat(
            RunnerReportProjection.project(login, original, RETENTION, NOW, false, false)
                .replayFailure())
        .isNull();
    assertThat(
            RunnerReportProjection.project(drift, original, List.of(), RETENTION, NOW, false, false)
                .replayFailure())
        .isNull();
    assertThat(
            RunnerReportProjection.project(login, original, List.of(), RETENTION, NOW, false, false)
                .replayFailure())
        .isNull();
    assertThat(
            RunnerReportProjection.project(
                    drift, original, List.of("step-a", "step-b"), RETENTION, NOW, false, false)
                .replayFailure())
        .as("a list that does not line up with the revision's steps names nothing")
        .isNull();
  }

  /**
   * Case 9, the value canary: the cause carries the step coordinates and one boolean, nothing else.
   */
  @Test
  void replayFailureCarriesNoReportedValueAndExactlyTheDeclaredKeys() throws Exception {
    RunnerReport drift =
        withCanary(
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "TARGET_DRIFT", null),
            List.of(
                passed(0),
                failed(1, "TARGET_DRIFT"),
                new RunnerStepState(2, StepResult.SKIPPED, null, null, null, "skipped " + CANARY)));
    RunnerReport login =
        withCanary(
            new RunOutcome(
                RunOutcome.FAILED,
                "LOGIN_REQUIRED",
                CANARY,
                new RunOutcome.LoginRequiredDetail("step-b", true)),
            List.of(passed(0), failed(1, "failure " + CANARY), skipped(2)));

    var driftProjection = projectWithRevision(drift);
    var loginProjection = projectWithRevision(login);

    assertThat(driftProjection.replayFailure()).isNotNull();
    assertThat(loginProjection.replayFailure()).isNotNull();
    String driftJson = serialize(driftProjection.replayFailure());
    String loginJson = serialize(loginProjection.replayFailure());
    assertThat(driftJson).doesNotContain(CANARY);
    assertThat(loginJson).doesNotContain(CANARY);
    assertThat(fieldNames(driftJson)).containsExactlyInAnyOrder("code", "stepId", "stepIndex");
    assertThat(fieldNames(loginJson))
        .containsExactlyInAnyOrder("code", "stepId", "stepIndex", "loginStepsPresent");
    assertThat(loginProjection.replayFailure().stepId()).isEqualTo("step-b");
  }

  /** The record refuses every shape the schema's if/then/else and the table CHECK refuse. */
  @Test
  void replayFailureRefusesTheShapesTheContractRefuses() {
    assertThatThrownBy(() -> new ReplayFailure("LOGIN_REQUIRED", "step-a", 0, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ReplayFailure("TARGET_DRIFT", "step-a", 0, false))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ReplayFailure("PASSWORD_CONTROL_READ_REFUSED", "step-a", 0, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ReplayFailure("TARGET_DRIFT", "", 0, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ReplayFailure("TARGET_DRIFT", "x".repeat(257), 0, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ReplayFailure("TARGET_DRIFT", "step-a", -1, null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(ReplayFailure.values()).containsExactlyInAnyOrder("LOGIN_REQUIRED", "TARGET_DRIFT");
  }

  // ── STUDIO-OBS-009 AC-11 f-h (R10c, T0 ruling A12): the post-Ready self-stop ─────────────────
  //
  // An unrecorded post-Ready self-stop (a missed secret control window, source `control-window`)
  // reports outer RUN_ERROR with errorMessage CANCELLED, and the interrupted step's failure is the
  // runner's STOPPED_STEP_MESSAGE. The backend admits that shape unchanged: status ERROR,
  // error_code
  // null, and replayFailure null by construction (D-11). The 008 A1 TARGET_DRIFT derivation is not
  // touched, and the A1 `400 INVALID_REPORT` refusal path does not move.

  /**
   * {@code STOPPED_STEP_MESSAGE} in studio-runner/src/server/runCoordinator.ts (copied, not read).
   */
  private static final String STOPPED_STEP_MESSAGE =
      "The run was stopped before this step finished.";

  @Test
  void anUnrecordedPostReadySelfStopProjectsErrorWithNoCodeAndNoReplayFailure() {
    for (String interrupted : List.of(STOPPED_STEP_MESSAGE, "CANCELLED")) {
      RunnerReport selfStop =
          finalReport(
              new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "CANCELLED", null),
              List.of(passed(0), failed(1, interrupted), skipped(2)));

      assertThat(RunnerReportProjection.mayNameReplayFailure(selfStop))
          .as("not one of the two shapes that can name a replay cause: " + interrupted)
          .isFalse();
      RunnerReportProjection.Projected projected = projectWithRevision(selfStop);

      assertThat(projected.status()).isEqualTo("ERROR");
      assertThat(projected.errorCode())
          .as("an unrecorded self-stop is an unmapped runner fault, never the API CANCELLED")
          .isNull();
      assertThat(projected.replayFailure())
          .as("D-11: a post-Ready self-stop is never projected as a replay cause")
          .isNull();
      assertThat(projected.diagnostic()).isEqualTo("runnerErrorCode=RUN_ERROR CANCELLED");
      assertThat(projected.stepResults())
          .extracting(StepResult::status)
          .containsExactly(StepResult.PASS, StepResult.FAIL, StepResult.SKIPPED);
      assertThat(projected.stepResults().get(1).message()).isEqualTo(interrupted);
    }
  }

  @Test
  void aSelfStopCannotBeMistakenForDriftEvenWhenTheInterruptedStepSaysTargetDrift() {
    // The TARGET_DRIFT branch needs the outer errorMessage TARGET_DRIFT as well as the step's
    // failure. A self-stop carries errorMessage CANCELLED, so the step text alone names nothing.
    RunnerReport selfStop =
        finalReport(
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "CANCELLED", null),
            List.of(passed(0), failed(1, "TARGET_DRIFT"), skipped(2)));

    assertThat(projectWithRevision(selfStop).replayFailure()).isNull();
    assertThat(projectWithRevision(selfStop).errorCode()).isNull();
  }

  @Test
  void aRecordedRevocationWhoseControlReadIsLostStillProjectsAuthorizationRevoked() {
    // Mandatory regression (A12): the runner reports outer CANCELLED for a stop the API recorded,
    // revocation facts included (the R8 `recorded` upgrade), and the API maps it from its own
    // record. The unrecorded variant stays null.
    RunnerReport recorded =
        finalReport(
            new RunOutcome(RunOutcome.ERROR, "CANCELLED", "CANCELLED", null),
            List.of(passed(0), failed(1, STOPPED_STEP_MESSAGE), skipped(2)));

    var revoked =
        RunnerReportProjection.project(
            recorded, original, REVISION_STEP_IDS, RETENTION, NOW, false, true);
    assertThat(revoked.status()).isEqualTo("ERROR");
    assertThat(revoked.errorCode()).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    assertThat(revoked.replayFailure()).isNull();

    var unrecorded =
        RunnerReportProjection.project(
            recorded, original, REVISION_STEP_IDS, RETENTION, NOW, false, false);
    assertThat(unrecorded.errorCode()).isNull();

    var userCancel =
        RunnerReportProjection.project(
            recorded, original, REVISION_STEP_IDS, RETENTION, NOW, true, true);
    assertThat(userCancel.errorCode())
        .as("a recorded user cancel keeps precedence over a recorded revocation")
        .isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  @Test
  void theRevocationMappingIsKeyedOnTheRunnersOuterCancelledNotOnTheSelfStopShape() {
    // Pins which side owns the upgrade: a runner that reported RUN_ERROR for a stop the API did
    // record gets no AUTHORIZATION_REVOKED from the backend. Only outer CANCELLED is mapped.
    RunnerReport selfStop =
        finalReport(
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "CANCELLED", null),
            List.of(passed(0), failed(1, STOPPED_STEP_MESSAGE), skipped(2)));

    assertThat(
            RunnerReportProjection.project(
                    selfStop, original, REVISION_STEP_IDS, RETENTION, NOW, false, true)
                .errorCode())
        .isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private RunnerReportProjection.Projected projectWithRevision(RunnerReport report) {
    return RunnerReportProjection.project(
        report, original, REVISION_STEP_IDS, RETENTION, NOW, false, false);
  }

  private static RunnerStepState passed(int index) {
    return new RunnerStepState(index, StepResult.PASS, 100.0, 200.0, 100.0, null);
  }

  private static RunnerStepState failed(int index, String failure) {
    return new RunnerStepState(index, StepResult.FAIL, 300.0, 400.0, 100.0, failure);
  }

  private static RunnerStepState skipped(int index) {
    return new RunnerStepState(index, StepResult.SKIPPED, null, null, null, null);
  }

  private RunnerReport loginFinal(
      String stepId, boolean loginStepsPresent, List<RunnerStepState> steps) {
    return finalReport(
        new RunOutcome(
            RunOutcome.FAILED,
            "LOGIN_REQUIRED",
            null,
            new RunOutcome.LoginRequiredDetail(stepId, loginStepsPresent)),
        steps);
  }

  private RunnerReport driftFinal(List<RunnerStepState> steps) {
    return finalReport(new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "TARGET_DRIFT", null), steps);
  }

  private RunnerReport finalReport(RunOutcome outcome, List<RunnerStepState> steps) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.FINAL,
        9L,
        NOW,
        ORIGIN,
        steps,
        List.of(),
        false,
        Map.of(),
        outcome,
        null,
        null,
        Map.of());
  }

  private RunnerReport withCanary(RunOutcome outcome, List<RunnerStepState> steps) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.FINAL,
        9L,
        NOW,
        ORIGIN,
        steps,
        List.of(new RunnerLogEntry(10.0, "error", "log " + CANARY)),
        false,
        Map.of("playwright", CANARY),
        outcome,
        null,
        null,
        Map.of());
  }

  private java.util.Set<String> fieldNames(String json) throws Exception {
    java.util.Set<String> names = new java.util.TreeSet<>();
    objectMapper.readTree(json).fieldNames().forEachRemaining(names::add);
    return names;
  }

  private RunnerReportProjection.Projected project(RunnerReport report) {
    return RunnerReportProjection.project(report, original, RETENTION, NOW);
  }

  private RunnerReport progress(List<RunnerStepState> steps, List<RunnerLogEntry> logs) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.PROGRESS,
        2L,
        NOW,
        ORIGIN,
        steps,
        logs,
        false,
        Map.of(),
        null,
        null,
        null,
        Map.of());
  }

  private RunnerReport progressWithRuntime(Map<String, Object> runtimeVersions) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.PROGRESS,
        2L,
        NOW,
        ORIGIN,
        List.of(),
        List.of(),
        false,
        runtimeVersions,
        null,
        null,
        null,
        Map.of());
  }

  private RunnerReport terminal(String result, String errorCode, String errorMessage) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.FINAL,
        9L,
        NOW,
        ORIGIN,
        List.of(),
        List.of(),
        false,
        Map.of(),
        new RunOutcome(result, errorCode, errorMessage, null),
        null,
        null,
        Map.of());
  }

  private RunnerReport preReady(String result, String errorCode, String errorMessage) {
    return preReadyWith(
        null, skippedSteps(original.size()), List.of(), errorCode, errorMessage, result);
  }

  private RunnerReport preReadyWith(
      Instant browserStartedAt,
      List<RunnerStepState> steps,
      List<RunnerLogEntry> logs,
      String errorCode,
      String errorMessage) {
    return preReadyWith(browserStartedAt, steps, logs, errorCode, errorMessage, RunOutcome.ERROR);
  }

  private RunnerReport preReadyWith(
      Instant browserStartedAt,
      List<RunnerStepState> steps,
      List<RunnerLogEntry> logs,
      String errorCode,
      String errorMessage,
      String result) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.FINAL,
        1L,
        NOW,
        browserStartedAt,
        steps,
        logs,
        false,
        Map.of(),
        new RunOutcome(result, errorCode, errorMessage, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", RunnerEvidence.UNAVAILABLE, false),
        null,
        Map.of());
  }

  private static List<RunnerStepState> skippedSteps(int count) {
    return java.util.stream.IntStream.range(0, count)
        .mapToObj(index -> new RunnerStepState(index, StepResult.SKIPPED, null, null, null, null))
        .toList();
  }

  private static RunnerReport withKind(RunnerReport report, String kind) {
    return new RunnerReport(
        report.executionId(),
        report.attemptId(),
        report.admissionId(),
        report.runnerInstanceId(),
        kind,
        report.runnerSequence(),
        report.reportedAt(),
        report.browserStartedAt(),
        report.steps(),
        report.logs(),
        report.logsTruncated(),
        report.runtimeVersions(),
        report.outcome(),
        report.evidence(),
        report.payloadReduced(),
        report.secretUse());
  }

  private RunnerReport withEvidence(String state) {
    return new RunnerReport(
        EXECUTION,
        UUID.randomUUID(),
        UUID.randomUUID(),
        "studio-runner-0",
        RunnerReport.FINAL,
        9L,
        NOW,
        ORIGIN,
        List.of(),
        List.of(),
        false,
        Map.of(),
        new RunOutcome(RunOutcome.PASSED, null, null, null),
        new RunnerEvidence("studio/video.webm", "studio/manifest.result.json", state, false),
        null,
        Map.of());
  }

  private String serialize(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new AssertionError("the projection output does not serialize", e);
    }
  }
}

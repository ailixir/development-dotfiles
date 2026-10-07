package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
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
            null);

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
            null);

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
                "validatorSchema", "1.0.0",
                "executor", "1.0.0",
                "syntaxReference", "1.0.0"),
            null,
            null,
            null);

    String json = serialize(project(report).runtime());

    assertThat(json).contains("\"playwright\":\"1.63.0\"").contains("\"validator\":\"1.0.0\"");
    assertThat(json)
        .as("the open runner set is not copied wholesale")
        .doesNotContain("syntaxReference");
  }

  @Test
  void theRunnersChromiumBuildKeyProjectsOntoRuntimeChromium() {
    // VAL-018: the runner reports ADR-001's `chromiumBuild`; reading `chromium` left the public
    // `runtime.chromium` null even in the pinned image.
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
            Map.of("playwright", "1.63.0", "chromiumBuild", "141.0.7390.37"),
            null,
            null,
            null);

    assertThat(project(report).runtime().chromium()).isEqualTo("141.0.7390.37");
    assertThat(serialize(project(report).runtime()))
        .contains("\"chromium\":\"141.0.7390.37\"")
        .doesNotContain("chromiumBuild");
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

  // ── helpers ──────────────────────────────────────────────────────────────

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
        null);
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
        new RunOutcome(result, errorCode, errorMessage),
        null,
        null);
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
        new RunOutcome(RunOutcome.PASSED, null, null),
        new RunnerEvidence("studio/video.webm", "studio/manifest.result.json", state, false),
        null);
  }

  private String serialize(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new AssertionError("the projection output does not serialize", e);
    }
  }
}

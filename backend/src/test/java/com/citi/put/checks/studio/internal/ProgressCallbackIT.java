package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-20 – AC-23, AC-25 – AC-27 — progress and terminal persistence.
 *
 * <p>Every property here is decided through {@code GET /executions/{id}}, which carries the
 * identical DTO the SSE stream will and which §5.5 already designates as SSE's recovery and
 * fallback path. Verifying through it is the architecture, not a workaround for the missing stream.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class ProgressCallbackIT {

  private static final String CSI_ID = "60456";
  private static final String OWNER = "progress-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;
  private UUID executionId;
  private UUID attemptId;
  private UUID admissionId;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest(
                "Progress draft", CSI_ID, OWNER, List.of("Go to the home page", "Check the URL"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
    attemptId = dispatch(executionId);
    admissionId = UUID.randomUUID();
    admissionService.claim(
        executionId, new AdmissionRequest(executionId, attemptId, RUNNER, admissionId, Map.of()));
  }

  // ── AC-22: STARTED is the only writer of RUNNING ─────────────────────────

  @Test
  void runningAndBrowserStartedAtAreWrittenOnlyByACommittedStartedReport() {
    assertThat(snapshot().status())
        .as("a 202 and an admission do not write RUNNING")
        .isEqualTo("PENDING");
    assertThat(snapshot().startedAt()).isNull();

    Instant browserStartedAt = Instant.parse("2026-09-10T10:00:02Z");
    progressService.apply(executionId, started(1, browserStartedAt));

    assertThat(snapshot().status()).isEqualTo("RUNNING");
    assertThat(snapshot().startedAt()).isEqualTo(browserStartedAt);
  }

  @Test
  void acceptedAtIsThePartitionKeyAndIsNeverChangedWhenTheBrowserBegins() {
    Instant before = snapshot().acceptedAt();

    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));

    assertThat(snapshot().acceptedAt())
        .as("changing started_at would move the row between partitions")
        .isEqualTo(before);
  }

  @Test
  void aStartedReportWithoutABrowserStartIsRefused() {
    assertThatThrownBy(() -> progressService.apply(executionId, started(1, null)))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", HttpStatus.BAD_REQUEST);
    assertThat(snapshot().status()).isEqualTo("PENDING");
  }

  // ── AC-21: one conditional statement, and the duplicate rule ─────────────

  @Test
  void threeIdenticalFinalDeliveriesGiveOneStateThreeAcknowledgementsAndOneRevision() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    long revisionAfterStart = snapshot().revision();
    RunnerReport terminal = finalReport(9, RunOutcome.PASSED, RunnerEvidence.STORED);

    ProgressAck first = progressService.apply(executionId, terminal);
    ProgressAck second = progressService.apply(executionId, terminal);
    ProgressAck third = progressService.apply(executionId, terminal);

    assertThat(first.applied()).isTrue();
    assertThat(second.applied()).as("a re-delivery applies nothing and is still a 200").isFalse();
    assertThat(third.applied()).isFalse();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).isEqualTo("PASSED");
    assertThat(after.revision())
        .as("exactly one increment across three deliveries")
        .isEqualTo(revisionAfterStart + 1);
    assertThat(after.logs())
        .as("duplicate deliveries must not duplicate logs")
        .hasSize(terminal.logs().size());
  }

  @Test
  void aLowerSequenceThanTheAppliedOneIsRefusedAndAppliesNothing() {
    progressService.apply(executionId, started(5, Instant.parse("2026-09-10T10:00:02Z")));
    long revision = snapshot().revision();

    assertThatThrownBy(() -> progressService.apply(executionId, progress(3)))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.SEQUENCE_REGRESSED);
    assertThat(snapshot().revision()).isEqualTo(revision);
  }

  @Test
  void aReportFromASupersededAttemptIsRefused() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    RunnerReport foreign =
        new RunnerReport(
            executionId,
            UUID.randomUUID(),
            admissionId,
            RUNNER,
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(),
            List.of(),
            false,
            Map.of(),
            null,
            null,
            null);

    assertThatThrownBy(() -> progressService.apply(executionId, foreign))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ATTEMPT_SUPERSEDED);
  }

  @Test
  void aReportFromADifferentAdmissionIdentityIsRefused() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    RunnerReport foreign =
        new RunnerReport(
            executionId,
            attemptId,
            UUID.randomUUID(),
            "studio-runner-9",
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(),
            List.of(),
            false,
            Map.of(),
            null,
            null,
            null);

    assertThatThrownBy(() -> progressService.apply(executionId, foreign))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_OWNED);
  }

  @Test
  void aStaleCallbackCannotRegressAFinalStateAndLeavesTheHistoryRowUnchanged() {
    // In 10.7a the terminal state is reached by a committed FINAL. The reaper-first ordering of
    // this same property is asserted at 10.7b, where a reaper exists to drive it.
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    progressService.apply(executionId, finalReport(9, RunOutcome.FAILED, RunnerEvidence.STORED));
    Map<String, Object> historyBefore = historyRow();

    assertThatThrownBy(() -> progressService.apply(executionId, progress(10)))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.EXECUTION_SETTLED);
    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId, finalReport(11, RunOutcome.PASSED, RunnerEvidence.STORED)))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.EXECUTION_SETTLED);

    assertThat(historyRow())
        .as("recorded for investigation; it cannot silently change history")
        .isEqualTo(historyBefore);
    assertThat(snapshot().status()).isEqualTo("FAILED");
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .as("and no new run was dispatched")
        .isEqualTo(1);
  }

  // ── AC-23: a revision per visible change, in the same statement ──────────

  @Test
  void everyVisibleChangeIncrementsTheRevisionAndTheRunnerSequenceIsNeverTheRevision() {
    long accepted = snapshot().revision();

    progressService.apply(executionId, started(4, Instant.parse("2026-09-10T10:00:02Z")));
    long afterStart = snapshot().revision();
    progressService.apply(executionId, progress(7));
    long afterProgress = snapshot().revision();

    assertThat(afterStart).isEqualTo(accepted + 1);
    assertThat(afterProgress).isEqualTo(afterStart + 1);
    assertThat(afterProgress)
        .as("the API assigns its own revision; runnerSequence is never used as one")
        .isNotEqualTo(7L);
  }

  // ── AC-16: the API never publishes a reaper's verdict for the runner ─────

  @Test
  void aRunnerReportCarryingAReaperOwnedCodeDoesNotPersistThatCode() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));

    progressService.apply(
        executionId,
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.FINAL,
            9L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(),
            List.of(),
            false,
            Map.of(),
            new RunOutcome(RunOutcome.ERROR, ExecutionErrorCode.START_TIMEOUT, "never started"),
            new RunnerEvidence(null, null, RunnerEvidence.UNAVAILABLE, false),
            null));

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).isEqualTo("ERROR");
    assertThat(after.errorCode())
        .as("a verdict only the reaper can observe must not be obtainable by naming it")
        .isNotEqualTo(ExecutionErrorCode.START_TIMEOUT)
        .isNull();
    assertThat(after.logs().stream().map(entry -> entry.message()).toList())
        .anySatisfy(message -> assertThat(message).contains("START_TIMEOUT"));
  }

  // ── AC-25: evidence never overwrites a known outcome ─────────────────────

  @Test
  void evidenceSettlesSeparatelyAndStreamCompleteFlipsWithANewRevision() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    progressService.apply(executionId, finalReport(9, RunOutcome.FAILED, RunnerEvidence.PENDING));

    ExecutionSnapshotDto outcomeKnown = snapshot();
    assertThat(outcomeKnown.status()).isEqualTo("FAILED");
    assertThat(outcomeKnown.video().status()).isEqualTo("PROCESSING");
    assertThat(outcomeKnown.streamComplete())
        .as("a terminal status while video availability may still change is not complete")
        .isFalse();

    progressService.apply(executionId, finalReport(10, RunOutcome.FAILED, RunnerEvidence.FAILED));

    ExecutionSnapshotDto settled = snapshot();
    assertThat(settled.status())
        .as("an upload failure never overwrites the outcome")
        .isEqualTo("FAILED");
    assertThat(settled.video().status()).isEqualTo("FAILED");
    assertThat(settled.streamComplete()).isTrue();
    assertThat(settled.revision()).isGreaterThan(outcomeKnown.revision());
  }

  // ── AC-26: bounds ────────────────────────────────────────────────────────

  @Test
  void aReportOverTheStepOrLogBoundIsRefusedAndChangesNothing() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));
    long revision = snapshot().revision();

    List<RunnerLogEntry> tooManyLogs = new ArrayList<>();
    for (int index = 0; index < 501; index++) {
      tooManyLogs.add(new RunnerLogEntry((double) index, "info", "line " + index));
    }
    RunnerReport oversized =
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(),
            tooManyLogs,
            false,
            Map.of(),
            null,
            null,
            null);

    assertThatThrownBy(() -> progressService.apply(executionId, oversized))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", HttpStatus.PAYLOAD_TOO_LARGE)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.REPORT_TOO_LARGE);
    assertThat(snapshot().revision()).isEqualTo(revision);
  }

  @Test
  void logsTruncatedAndPayloadReducedArePersistedRatherThanDropped() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));

    RunnerReport reduced =
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(),
            List.of(new RunnerLogEntry(0.0, "info", "browser started")),
            true,
            Map.of(),
            null,
            null,
            true);
    progressService.apply(executionId, reduced);

    assertThat(snapshot().logsTruncated())
        .as("the API's only record that the runner shed diagnostics to deliver a result")
        .isTrue();
  }

  // ── AC-27: the last-run projection moves forward only ────────────────────

  @Test
  void anOlderLateCompletionDoesNotOverwriteANewerRun() {
    // The newer run finishes first.
    UUID newer = studioService.executeTest(testId, owner, null).executionId();
    finish(newer, RunOutcome.PASSED);
    assertThat(lastRunStatus()).isEqualTo("PASSED");

    // The older run, accepted before it, finishes afterwards.
    finish(executionId, RunOutcome.FAILED);

    assertThat(lastRunStatus())
        .as("an older late completion leaves the projection alone")
        .isEqualTo("PASSED");
  }

  // ── AC-24: one entry per original step survives a partial report ─────────

  @Test
  void aPartialStepReportStillPersistsOneEntryPerOriginalStep() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));

    progressService.apply(
        executionId,
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null)),
            List.of(),
            false,
            Map.of(),
            null,
            null,
            null));

    List<StepResult> steps = snapshot().stepResults();
    assertThat(steps).hasSize(2);
    assertThat(steps.get(0).status()).isEqualTo(StepResult.PASS);
    assertThat(steps.get(0).offsetMs()).isEqualTo(120L);
    assertThat(steps.get(1).status()).isEqualTo(StepResult.PENDING);
    assertThat(steps.get(1).originalText()).isEqualTo("Check the URL");
  }

  // ── ADR-002 §33: logs[].stepIndex reaches the public snapshot ────────────

  @Test
  void aLogLinesStepIndexReachesThePublicSnapshot() {
    progressService.apply(executionId, started(1, Instant.parse("2026-09-10T10:00:02Z")));

    progressService.apply(
        executionId,
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.PROGRESS,
            2L,
            Instant.now(),
            Instant.parse("2026-09-10T10:00:02Z"),
            List.of(new RunnerStepState(1, StepResult.RUNNING, 4300.0, null, null, null)),
            List.of(
                new RunnerLogEntry(0.0, "info", "browser started", null),
                new RunnerLogEntry(4300.0, "info", "step 1 started", 1)),
            false,
            Map.of(),
            null,
            null,
            null));

    assertThat(snapshot().logs())
        .extracting(com.citi.put.checks.studio.dto.ExecutionLogEntry::stepIndex)
        .containsExactly(null, 1);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void finish(UUID execution, String result) {
    UUID attempt = dispatchIfQueued(execution);
    UUID admission = admissionOf(execution, attempt);
    progressService.apply(
        execution,
        startedFor(execution, attempt, admission, 1, Instant.parse("2026-09-10T10:00:02Z")));
    progressService.apply(
        execution, finalFor(execution, attempt, admission, 9, result, RunnerEvidence.STORED));
  }

  private UUID dispatchIfQueued(UUID execution) {
    Map<String, Object> row = statements.find(execution).orElseThrow();
    if (row.get("attempt_id") != null) {
      return UUID.fromString(row.get("attempt_id").toString());
    }
    return dispatch(execution);
  }

  private UUID admissionOf(UUID execution, UUID attempt) {
    Map<String, Object> row = statements.find(execution).orElseThrow();
    if (row.get("admission_id") != null) {
      return UUID.fromString(row.get("admission_id").toString());
    }
    UUID admission = UUID.randomUUID();
    admissionService.claim(
        execution, new AdmissionRequest(execution, attempt, RUNNER, admission, Map.of()));
    return admission;
  }

  private UUID dispatch(UUID execution) {
    UUID attempt = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              execution, "test-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(execution, "test-dispatcher", attempt);
        });
    return attempt;
  }

  private RunnerReport started(long sequence, Instant browserStartedAt) {
    return startedFor(executionId, attemptId, admissionId, sequence, browserStartedAt);
  }

  private RunnerReport startedFor(
      UUID execution, UUID attempt, UUID admission, long sequence, Instant browserStartedAt) {
    return new RunnerReport(
        execution,
        attempt,
        admission,
        RUNNER,
        RunnerReport.STARTED,
        sequence,
        Instant.now(),
        browserStartedAt,
        List.of(),
        browserStartedAt == null
            ? List.of()
            : List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of("playwright", "1.63.0"),
        null,
        null,
        null);
  }

  private RunnerReport progress(long sequence) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.PROGRESS,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(new RunnerStepState(0, StepResult.RUNNING, 120.0, null, null, null)),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        null,
        null,
        null);
  }

  private RunnerReport finalReport(long sequence, String result, String evidenceState) {
    return finalFor(executionId, attemptId, admissionId, sequence, result, evidenceState);
  }

  private RunnerReport finalFor(
      UUID execution,
      UUID attempt,
      UUID admission,
      long sequence,
      String result,
      String evidenceState) {
    return new RunnerReport(
        execution,
        attempt,
        admission,
        RUNNER,
        RunnerReport.FINAL,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null)),
        List.of(
            new RunnerLogEntry(0.0, "info", "browser started"),
            new RunnerLogEntry(null, "info", "run " + result)),
        false,
        Map.of("playwright", "1.63.0"),
        new RunOutcome(result, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", evidenceState, false),
        null);
  }

  private ExecutionSnapshotDto snapshot() {
    return studioService.findExecutionById(executionId, owner);
  }

  private Map<String, Object> historyRow() {
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT status, error_code, step_results::text, logs::text, snapshot_revision,"
                + " video_status, ended_at, duration_ms FROM ui_test_executions WHERE id = ?",
            executionId);
    return row;
  }

  private String lastRunStatus() {
    return jdbc.queryForObject(
        "SELECT last_run_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  @SuppressWarnings("unused")
  private static Instant instant(Timestamp value) {
    return value == null ? null : value.toInstant();
  }
}

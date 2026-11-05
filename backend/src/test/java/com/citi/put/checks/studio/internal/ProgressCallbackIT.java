package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioListQuery;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ReplayFailure;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
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
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.7 AC-20 – AC-23, AC-25 – AC-27 — progress and terminal persistence.
 *
 * <p>Every property here is decided through {@code GET /executions/{id}}, which carries the
 * identical DTO the SSE stream will and which §5.5 already designates as SSE's recovery and
 * fallback path. Verifying through it is the architecture, not a workaround for the missing stream.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
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
  @Autowired private com.fasterxml.jackson.databind.ObjectMapper objectMapper;
  @Autowired private UITestExecutionRepository executionRepository;
  @Autowired private ExecutionSnapshotMapper snapshotMapper;

  @Autowired
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization
      observedAuthorization;

  @org.springframework.boot.test.mock.mockito.MockBean
  private ProgressReportService.ReportCommitHook reportCommitHook;

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
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest(
                "Progress draft", CSI_ID, OWNER, List.of("Go to the home page", "Check the URL"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    attemptId = dispatch(executionId);
    admissionId = UUID.randomUUID();
    // An observed run is admitted through its observed admission, as the runner does.
    ObservedPublicationFixture.admitObserved(
        observedAuthorization, admissionService, executionId, RUNNER, admissionId);
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
            null,
            Map.of());

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
            null,
            Map.of());

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
            new RunOutcome(
                RunOutcome.ERROR, ExecutionErrorCode.START_TIMEOUT, "never started", null),
            new RunnerEvidence(null, null, RunnerEvidence.UNAVAILABLE, false),
            null,
            java.util.Map.of()));

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
            null,
            Map.of());

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
            true,
            Map.of());
    progressService.apply(executionId, reduced);

    assertThat(snapshot().logsTruncated())
        .as("the API's only record that the runner shed diagnostics to deliver a result")
        .isTrue();
  }

  // ── AC-27: the last-run projection moves forward only ────────────────────

  @Test
  void anOlderLateCompletionDoesNotOverwriteANewerRun() {
    // The newer run finishes first.
    UUID newer =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
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
            null,
            java.util.Map.of()));

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
            null,
            java.util.Map.of()));

    assertThat(snapshot().logs())
        .extracting(com.citi.put.checks.studio.dto.ExecutionLogEntry::stepIndex)
        .containsExactly(null, 1);
  }

  // ── STUDIO-OBS-008 T0 ruling A1.5 cases 10-12: the replay cause end to end ──

  private static final Instant REPLAY_ORIGIN = Instant.parse("2026-09-10T10:00:02Z");

  /**
   * Case 10 (login): the cause is persisted by the FINAL statement, and the single-execution read,
   * the list item and the SSE frame source all carry the identical {@code replayFailure} payload.
   */
  @Test
  void aReplayLoginFinalPersistsTheNamedCauseAndGetListAndFrameCarryTheSamePayload()
      throws Exception {
    progressService.apply(executionId, started(1, REPLAY_ORIGIN));
    List<String> stepIds = revisionStepIds();
    RunOutcome outcome =
        new RunOutcome(
            RunOutcome.FAILED,
            "LOGIN_REQUIRED",
            null,
            new RunOutcome.LoginRequiredDetail(stepIds.get(1), true));

    progressService.apply(
        executionId,
        replayFinal(
            9,
            outcome,
            List.of(
                new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null),
                new RunnerStepState(1, StepResult.FAIL, 4400.0, 4900.0, 500.0, "LOGIN_REQUIRED"))));

    assertThat(replayColumns())
        .containsEntry("replay_failure_code", "LOGIN_REQUIRED")
        .containsEntry("replay_failure_step_id", stepIds.get(1))
        .containsEntry("replay_failure_step_index", 1)
        .containsEntry("replay_failure_login_steps_present", true);
    ExecutionSnapshotDto get = studioService.readExecution(executionId, owner);
    assertThat(get.status()).isEqualTo("FAILED");
    assertThat(get.errorCode()).as("the cause is not an ExecutionErrorCode").isNull();
    assertThat(get.replayFailure()).isEqualTo(ReplayFailure.loginRequired(stepIds.get(1), 1, true));
    assertThat(get.stepResults().get(1).status()).isEqualTo(StepResult.FAIL);

    com.fasterxml.jackson.databind.JsonNode getJson = objectMapper.valueToTree(get);
    assertThat(getJson.path("replayFailure").path("stepIndex").asInt()).isEqualTo(1);
    com.fasterxml.jackson.databind.JsonNode listJson = objectMapper.valueToTree(listItem());
    com.fasterxml.jackson.databind.JsonNode frameJson = objectMapper.valueToTree(frameSource());
    assertThat(listJson).isEqualTo(getJson);
    assertThat(frameJson).isEqualTo(getJson);
  }

  /** Case 10 (drift): {@code ERROR} with no {@code errorCode}, and no login flag on the wire. */
  @Test
  void aReplayTargetDriftFinalPersistsTheCauseWithNoLoginFlag() throws Exception {
    progressService.apply(executionId, started(1, REPLAY_ORIGIN));
    List<String> stepIds = revisionStepIds();

    progressService.apply(
        executionId,
        replayFinal(
            9,
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "TARGET_DRIFT", null),
            List.of(
                new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null),
                new RunnerStepState(1, StepResult.FAIL, 4400.0, 4900.0, 500.0, "TARGET_DRIFT"))));

    assertThat(replayColumns())
        .containsEntry("replay_failure_code", "TARGET_DRIFT")
        .containsEntry("replay_failure_step_id", stepIds.get(1))
        .containsEntry("replay_failure_step_index", 1)
        .containsEntry("replay_failure_login_steps_present", null);
    ExecutionSnapshotDto get = studioService.readExecution(executionId, owner);
    assertThat(get.status()).isEqualTo("ERROR");
    assertThat(get.errorCode()).isNull();
    assertThat(get.replayFailure()).isEqualTo(ReplayFailure.targetDrift(stepIds.get(1), 1));
    com.fasterxml.jackson.databind.JsonNode getJson = objectMapper.valueToTree(get);
    assertThat(getJson.path("replayFailure").has("loginStepsPresent")).isFalse();
    com.fasterxml.jackson.databind.JsonNode listJson = objectMapper.valueToTree(listItem());
    com.fasterxml.jackson.databind.JsonNode frameJson = objectMapper.valueToTree(frameSource());
    assertThat(listJson).isEqualTo(getJson);
    assertThat(frameJson).isEqualTo(getJson);
  }

  /** Case 11: a duplicate FINAL changes nothing, and a reaped row never carries a cause. */
  @Test
  void aDuplicateReplayFinalDoesNotChangeThePersistedCause() {
    progressService.apply(executionId, started(1, REPLAY_ORIGIN));
    String stepId = revisionStepIds().get(1);
    RunnerReport terminal =
        replayFinal(
            9,
            new RunOutcome(
                RunOutcome.FAILED,
                "LOGIN_REQUIRED",
                null,
                new RunOutcome.LoginRequiredDetail(stepId, false)),
            List.of(
                new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null),
                new RunnerStepState(1, StepResult.FAIL, 4400.0, 4900.0, 500.0, null)));

    assertThat(progressService.apply(executionId, terminal).applied()).isTrue();
    Map<String, Object> columns = replayColumns();
    long revision = studioService.readExecution(executionId, owner).revision();

    assertThat(progressService.apply(executionId, terminal).applied()).isFalse();
    assertThat(progressService.apply(executionId, terminal).applied()).isFalse();

    assertThat(replayColumns()).isEqualTo(columns);
    assertThat(studioService.readExecution(executionId, owner).revision()).isEqualTo(revision);
    assertThat(studioService.readExecution(executionId, owner).replayFailure())
        .isEqualTo(ReplayFailure.loginRequired(stepId, 1, false));
  }

  @Test
  void aReapedRowReadsNoReplayCause() {
    progressService.apply(executionId, started(1, REPLAY_ORIGIN));

    assertThat(statements.closeByReaper(executionId, ExecutionErrorCode.STALE, Instant.now()))
        .isEqualTo(1);

    ExecutionSnapshotDto reaped = studioService.readExecution(executionId, owner);
    assertThat(reaped.errorCode()).isEqualTo(ExecutionErrorCode.STALE);
    assertThat(reaped.replayFailure()).isNull();
    assertThat(replayColumns().values()).containsOnlyNulls();
  }

  /** The refusal leaves the row exactly as it was: nothing is written for a divergent report. */
  @Test
  void aReplayLoginNamingAStepOutsideTheRevisionIsRefusedAndWritesNothing() {
    progressService.apply(executionId, started(1, REPLAY_ORIGIN));
    Map<String, Object> before = historyRow();

    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId,
                    replayFinal(
                        9,
                        new RunOutcome(
                            RunOutcome.FAILED,
                            "LOGIN_REQUIRED",
                            null,
                            new RunOutcome.LoginRequiredDetail(
                                "not-a-step-of-this-revision", false)),
                        List.of(
                            new RunnerStepState(
                                1, StepResult.FAIL, 4400.0, 4900.0, 500.0, "LOGIN_REQUIRED")))))
        .isInstanceOf(StudioValidationException.class)
        .hasFieldOrPropertyWithValue("code", "INVALID_REPORT");

    assertThat(historyRow()).isEqualTo(before);
    assertThat(replayColumns().values()).containsOnlyNulls();
    assertThat(snapshot().status()).isEqualTo("RUNNING");
  }

  /**
   * Case 12, the I4 identity check: the replay artifact's step IDs are the draft's authoring step
   * IDs, so {@code replayFailure.stepId} is the authoring ID at {@code stepIndex}. The ruling
   * inferred this from the guided prefix selection; this turns it into a verified fact.
   */
  @Test
  void theReplayCauseStepIdIsTheConfirmedRevisionsAuthoringStepIdAtThatIndex() throws Exception {
    List<String> authoringIds = new ArrayList<>();
    objectMapper
        .readTree(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_tests WHERE id = ?", String.class, testId))
        .path("steps")
        .forEach(step -> authoringIds.add(step.path("id").asText()));
    assertThat(authoringIds).hasSize(2).doesNotContain("");
    assertThat(revisionStepIds()).isEqualTo(authoringIds);

    progressService.apply(executionId, started(1, REPLAY_ORIGIN));
    progressService.apply(
        executionId,
        replayFinal(
            9,
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "TARGET_DRIFT", null),
            List.of(
                new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null),
                new RunnerStepState(1, StepResult.FAIL, 4400.0, 4900.0, 500.0, "TARGET_DRIFT"))));

    ReplayFailure cause = studioService.readExecution(executionId, owner).replayFailure();
    assertThat(cause).isNotNull();
    assertThat(cause.stepId()).isEqualTo(authoringIds.get(cause.stepIndex()));
  }

  private List<String> revisionStepIds() {
    try {
      UUID revisionId =
          jdbc.queryForObject(
              "SELECT revision_id FROM ui_test_executions WHERE id = ?", UUID.class, executionId);
      List<String> ids = new ArrayList<>();
      objectMapper
          .readTree(
              jdbc.queryForObject(
                  "SELECT artifact::text FROM ui_test_revisions WHERE id = ?",
                  String.class,
                  revisionId))
          .path("steps")
          .forEach(step -> ids.add(step.path("stepId").asText()));
      return ids;
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  private Map<String, Object> replayColumns() {
    return jdbc.queryForMap(
        "SELECT replay_failure_code, replay_failure_step_id, replay_failure_step_index,"
            + " replay_failure_login_steps_present FROM ui_test_executions WHERE id = ?",
        executionId);
  }

  /** The execution's item on {@code GET /executions}. */
  private ExecutionSnapshotDto listItem() {
    return studioService
        .listExecutions(
            StudioListQuery.Executions.parse(testId, null, null, null, null), 0, 20, owner)
        .getContent()
        .stream()
        .filter(item -> executionId.equals(item.executionId()))
        .findFirst()
        .orElseThrow();
  }

  /** What the SSE broadcaster sends: the same mapper over the same row, labelled the same way. */
  private ExecutionSnapshotDto frameSource() {
    return snapshotMapper
        .toSnapshot(executionRepository.findByExecutionId(executionId).orElseThrow())
        .withTestName("Progress draft");
  }

  private RunnerReport replayFinal(long sequence, RunOutcome outcome, List<RunnerStepState> steps) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.FINAL,
        sequence,
        Instant.now(),
        REPLAY_ORIGIN,
        steps,
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of("playwright", "1.63.0"),
        outcome,
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", RunnerEvidence.STORED, false),
        null,
        Map.of());
  }

  /**
   * Trusted test catalog only; old ordinary fixtures and their security/deadlines are unchanged.
   */
  @org.springframework.test.context.DynamicPropertySource
  static void observedReportCatalog(
      org.springframework.test.context.DynamicPropertyRegistry properties) {
    // STUDIO-OBS-012A: the execution fixtures publish under ObservedPublicationFixture's trusted
    // catalog entry and policies; the canonical contract fixture's entry and policy follow them.
    properties.add("studio.observed-replay.enabled", () -> "true");
    properties.add(
        "studio.observed-replay.catalog-json",
        () -> {
          var fixture = observedFixtureDocument();
          var entry = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
          entry.set("profile", fixture.path("artifact").path("profile"));
          entry.set("build", fixture.path("build"));
          return ObservedPublicationFixture.catalogJsonWith(entry);
        });
  }

  private static com.fasterxml.jackson.databind.node.ObjectNode observedFixtureDocument() {
    try {
      return (com.fasterxml.jackson.databind.node.ObjectNode)
          new com.fasterxml.jackson.databind.ObjectMapper()
              .readTree(
                  java.nio.file.Files.readString(
                      java.nio.file.Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException("Observed report fixture unavailable", failure);
    }
  }

  /**
   * Controlled protocol evidence derived before immutable publication; never a native typing claim.
   */
  private static com.fasterxml.jackson.databind.node.ObjectNode secretReportBasis() {
    var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
    var basis =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            observedFixtureDocument().path("basis").deepCopy();
    String inputId = "input-label";
    var selected =
        com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
            basis.path("inputs"), "inputId", inputId);
    String stepId = selected.path("stepId").asText();
    var reference =
        contracts
            .object()
            .put("referenceKind", "configuration")
            .put("configurationRevision", basis.path("configurationRevision").asText())
            .put("stepId", stepId)
            .put("referenceId", "report-password")
            .put("kind", "secretRef")
            .put("referenceName", "PASS");
    ((com.fasterxml.jackson.databind.node.ObjectNode) selected)
        .put("kind", "secretRef")
        .set("provenance", reference);
    var mapping = reference.deepCopy();
    mapping.remove(java.util.List.of("referenceKind", "configurationRevision"));
    mapping.put("inputId", inputId);
    ((com.fasterxml.jackson.databind.node.ArrayNode) basis.path("configurationReferences"))
        .add(mapping);
    var plan = (com.fasterxml.jackson.databind.node.ObjectNode) basis.path("translationPlan");
    ((com.fasterxml.jackson.databind.node.ArrayNode) plan.path("sourceReferences"))
        .set(1, reference.deepCopy());
    basis.put(
        "translationHash", com.citi.put.checks.studio.guided.session.GuidedContracts.hash(plan));
    for (var source : basis.path("sourceSteps")) {
      if (source.path("stepId").asText().equals(stepId)) {
        ((com.fasterxml.jackson.databind.node.ObjectNode) source)
            .put("source", source.path("source").asText() + " Enter <secret PASS> as password.");
      }
    }
    var identity =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            basis.path("snapshotEvidence").path("current");
    for (var step : identity.path("authoring").path("steps")) {
      if (step.path("id").asText().equals(stepId)) {
        ((com.fasterxml.jackson.databind.node.ObjectNode) step)
            .put(
                "text",
                com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
                        basis.path("sourceSteps"), "stepId", stepId)
                    .path("source")
                    .asText());
      }
    }
    var declarations =
        (com.fasterxml.jackson.databind.node.ArrayNode) identity.path("authoredDeclarations");
    var prior = declarations.deepCopy();
    declarations
        .removeAll()
        .addObject()
        .put("referenceId", "PASS")
        .put("kind", "secretRef")
        .put("secretId", "PASS");
    prior.forEach(declarations::add);
    var material =
        (com.fasterxml.jackson.databind.node.ObjectNode) basis.path("materializationEvidence");
    var full =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", basis.path("sessionId").asText())
            .put(
                "scopeHash",
                com.citi.put.checks.studio.guided.session.GuidedContracts.hash(basis.path("scope")))
            .put("sourceRevision", basis.path("sourceRevision").asText())
            .put("configurationRevision", basis.path("configurationRevision").asText());
    var fullInputs = full.putArray("inputs");
    for (var entry : material.path("entries")) {
      var metadata = (com.fasterxml.jackson.databind.node.ObjectNode) entry.path("metadata");
      if (entry.path("inputId").asText().equals(inputId)) {
        metadata
            .put("kind", "secretRef")
            .put("secretId", "PASS")
            .set("provenance", reference.deepCopy());
      }
      var input = metadata.deepCopy();
      if (!input.path("kind").asText().equals("secretRef")) {
        var provenance = input.path("provenance");
        String value =
            ""; // The frozen ordinary fixture's saved-label private value is exactly empty.
        if (provenance.path("referenceKind").asText().equals("sourceSpan")) {
          String source =
              com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
                      basis.path("sourceSteps"), "stepId", input.path("sourceStepId").asText())
                  .path("source")
                  .asText();
          value =
              source.substring(
                  provenance.path("startUtf16").asInt(), provenance.path("endUtf16").asInt());
        }
        input.put("value", value);
      }
      ((com.fasterxml.jackson.databind.node.ObjectNode) entry)
          .put("inputHash", com.citi.put.checks.studio.guided.session.GuidedContracts.hash(input));
      fullInputs.add(input);
    }
    String inputsHash = com.citi.put.checks.studio.guided.session.GuidedContracts.hash(full);
    basis.put("authoredInputsHash", inputsHash);
    ((com.fasterxml.jackson.databind.node.ObjectNode) material.path("versions").get(0))
        .put("authoredInputsHash", inputsHash);
    ((com.fasterxml.jackson.databind.node.ObjectNode) basis.path("bootstrap"))
        .put("inputsHash", inputsHash);
    var observationHashes = new java.util.HashMap<String, String>();
    for (var row : basis.path("observations")) {
      var observed = (com.fasterxml.jackson.databind.node.ObjectNode) row;
      String old = observed.path("observationHash").asText();
      ((com.fasterxml.jackson.databind.node.ObjectNode)
              observed.path("observation").path("coverage"))
          .put("passwordControls", 1);
      String hash =
          com.citi.put.checks.studio.guided.session.GuidedContracts.hash(
              observed.path("observation"));
      observed.put("observationHash", hash);
      observationHashes.put(old, hash);
    }
    int changed = 0;
    for (var row : basis.path("preparations")) {
      var preparation = (com.fasterxml.jackson.databind.node.ObjectNode) row;
      var proposal = (com.fasterxml.jackson.databind.node.ObjectNode) preparation.path("proposal");
      proposal.put("authoredInputsHash", inputsHash);
      boolean usesInput = false;
      for (var use : proposal.path("operation").path("uses")) {
        usesInput |=
            use.path("kind").asText().equals("input") && use.path("id").asText().equals(inputId);
      }
      if (usesInput) {
        changed++;
        var operation = (com.fasterxml.jackson.databind.node.ObjectNode) proposal.path("operation");
        String code = "await page.getByRole('textbox').fill(secrets['PASS']);";
        operation.put("code", code);
        operation.put(
            "sourceHash",
            com.citi.put.checks.studio.guided.session.GuidedContracts.hash(operation.path("code")));
        operation.putArray("uses").addObject().put("kind", "secret").put("id", "PASS");
      }
      var proof = (com.fasterxml.jackson.databind.node.ObjectNode) preparation.path("proof");
      if (observationHashes.containsKey(preparation.path("observationHash").asText())) {
        String hash = observationHashes.get(preparation.path("observationHash").asText());
        preparation.put("observationHash", hash);
        ((com.fasterxml.jackson.databind.node.ObjectNode) preparation.path("executionEvidence"))
            .put("observationHash", hash);
        proposal.set("executionEvidence", preparation.path("executionEvidence").deepCopy());
        proposal.put(
            "evidenceHash",
            com.citi.put.checks.studio.guided.session.GuidedContracts.hash(
                preparation.path("executionEvidence")));
        proof.set("evidenceHash", proposal.path("evidenceHash"));
      }
      String digest = com.citi.put.checks.studio.guided.session.GuidedContracts.hash(proposal);
      proof.put("authoredInputsHash", inputsHash).put("requestDigest", digest);
      for (var action : basis.path("actions")) {
        if (!action.path("preparationId").equals(preparation.path("preparationId"))) {
          continue;
        }
        var ledger = (com.fasterxml.jackson.databind.node.ObjectNode) action.path("ledger");
        ledger.put("authoredInputsHash", inputsHash).put("requestDigest", digest);
        ledger.set("executionEvidence", proposal.path("executionEvidence").deepCopy());
        ledger.set("evidenceHash", proposal.path("evidenceHash"));
        var op = contracts.object();
        op.set("coordinate", proposal.path("coordinate"));
        op.set("origin", proposal.path("executionEvidence").path("origin"));
        op.set(
            "target", proof.has("target") ? proof.path("target") : contracts.object().nullNode());
        op.set("operation", proposal.path("operation"));
        ledger.put(
            "operationHash", com.citi.put.checks.studio.guided.session.GuidedContracts.hash(op));
        var policy =
            contracts
                .object()
                .put("scopeHash", full.path("scopeHash").asText())
                .put("requestDigest", digest);
        policy.set("preparation", proof);
        ((com.fasterxml.jackson.databind.node.ObjectNode) ledger.path("admission"))
            .put(
                "policyDecisionHash",
                com.citi.put.checks.studio.guided.session.GuidedContracts.hash(policy));
        for (var association : basis.path("obligationAssociations")) {
          if (association.path("obligationId").equals(action.path("obligationId"))) {
            ((com.fasterxml.jackson.databind.node.ObjectNode) association)
                .put("proposalHash", digest);
          }
        }
      }
    }
    assertThat(changed)
        .as("one executed step using the secret becomes a declared secret input")
        .isEqualTo(1);
    return basis;
  }

  private com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.RetryFixture
      observedReportOwner(boolean actualResolution) throws Exception {
    var document = observedFixtureDocument();
    var fixture =
        com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.publishedRetry(
            jdbc,
            transactions,
            "report-" + UUID.randomUUID(),
            secretReportBasis(),
            (com.fasterxml.jackson.databind.node.ObjectNode)
                document.path("artifact").path("profile"),
            (com.fasterxml.jackson.databind.node.ObjectNode) document.path("build"));
    UUID attempt = UUID.fromString(fixture.original().path("attemptId").asText());
    var lifecycle =
        new com.citi.put.checks.studio.secrets.SecretAuditLifecycle(
            jdbc, new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder(jdbc));
    assertThat(
            statements.claim(
                fixture.id(), "report-dispatcher", Instant.now().plusSeconds(60), Instant.now()))
        .isEqualTo(1);
    if (actualResolution) {
      var vault =
          new com.citi.put.checks.studio.secrets.FakeStudioVaultProvider(java.util.Map.of());
      var scope =
          com.citi.put.checks.studio.secrets.VaultScope.of(
              fixture.original().path("csiId").asText(),
              fixture.original().path("environment").asText(),
              fixture.testId());
      vault.rotate(
          com.citi.put.checks.studio.secrets.StudioVaultProvider.ReferenceKind.SECRET,
          scope,
          "PASS",
          "report-boundary-control");
      vault.bindOrigins(
          com.citi.put.checks.studio.secrets.StudioVaultProvider.ReferenceKind.SECRET,
          scope,
          "PASS",
          "https://orders.example.test");
      var resolver = new com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver(vault);
      try (var resolved =
          resolver.resolve(
              scope.csiId(),
              scope.environment(),
              fixture.testId(),
              "owner@example.test",
              new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
                  List.of(), List.of("PASS")),
              secret ->
                  transactions.executeWithoutResult(
                      t ->
                          lifecycle.replayReadEntry(
                              fixture.original(), "report-dispatcher", secret)))) {
        assertThat(vault.readCount())
            .isEqualTo(1); // Real controlled provider method, not a live Vault claim.
        transactions.executeWithoutResult(
            t -> {
              assertThat(
                      statements.beginObservedDispatch(fixture.id(), "report-dispatcher", attempt))
                  .isEqualTo(1);
              lifecycle.replayRelease(
                  fixture.original(),
                  List.of("PASS"),
                  resolved.secretVersions(),
                  com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                      .RESOLVED);
            });
      }
    } else {
      transactions.executeWithoutResult(
          t ->
              assertThat(
                      statements.beginObservedDispatch(fixture.id(), "report-dispatcher", attempt))
                  .isEqualTo(1));
    }
    var request = document.path("admissionRequest").deepCopy();
    var ownedRequest = (com.fasterxml.jackson.databind.node.ObjectNode) request;
    for (String field :
        List.of(
            "executionId",
            "startedAt",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash",
            "scopeHash")) {
      ownedRequest.set(field, fixture.original().path(field));
    }
    ownedRequest.put("runnerInstanceId", RUNNER).put("admissionId", UUID.randomUUID().toString());
    ownedRequest.set("profile", fixture.original().path("requiredProfile"));
    ownedRequest.set("build", fixture.original().path("requiredBuild"));
    ownedRequest.set("grantId", fixture.original().path("replayGrant").path("grantId"));
    var permit = observedAuthorization.prepareAdmission(fixture.id(), ownedRequest);
    admissionService.claimObserved(fixture.id(), permit);
    progressService.apply(fixture.id(), observedReport(fixture, RunnerReport.STARTED, 1, Map.of()));
    return fixture;
  }

  private RunnerReport observedReport(
      com.citi.put.checks.studio.guided.publication.GuidedSecretLoginMigrationTest.RetryFixture
          fixture,
      String kind,
      long sequence,
      Map<String, String> usage) {
    var binding = fixture.original();
    UUID admission =
        jdbc.queryForObject(
            "SELECT admission_id FROM studio_dispatch_ledger WHERE execution_id=?",
            UUID.class,
            fixture.id());
    var versions =
        Map.<String, Object>of(
            "observedProfile",
            binding.path("requiredProfile").toString(),
            "observedBuild",
            binding.path("requiredBuild").toString());
    return new RunnerReport(
        fixture.id(),
        UUID.fromString(binding.path("attemptId").asText()),
        admission,
        RUNNER,
        kind,
        sequence,
        Instant.now(),
        Instant.parse(binding.path("startedAt").asText()),
        RunnerReport.STARTED.equals(kind)
            ? List.of()
            : List.of(new RunnerStepState(2, "PASS", 0.25, 10.75, 10.5, null)),
        List.of(),
        false,
        versions,
        null,
        null,
        false,
        usage);
  }

  private Map<String, Object> observedHistory(UUID id) {
    return jdbc.queryForMap(
        "SELECT e.status,e.snapshot_revision,e.step_results::text,e.logs::text,"
            + ("l.state,l.last_runner_sequence AS runner_sequence FROM "
                + "ui_test_executions e JOIN studio_dispatch_ledger l ON "
                + "l.execution_id=e.id ")
            + "AND l.execution_accepted_at=e.started_at WHERE e.id=?",
        id);
  }

  private List<Map<String, Object>> observedUsage(UUID id) {
    return jdbc.queryForList(
        "SELECT * FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'", id);
  }

  @Test
  void observedWinningProgressAndDuplicateCommitOneUsedSummaryWithTheSnapshotCas()
      throws Exception {
    try (var fixture = observedReportOwner(true)) {
      var before = observedHistory(fixture.id());
      var report = observedReport(fixture, RunnerReport.PROGRESS, 2, Map.of("PASS", "USED"));
      assertThat(progressService.apply(fixture.id(), report).applied()).isTrue();
      var after = observedHistory(fixture.id());
      assertThat(((Number) after.get("snapshot_revision")).longValue())
          .isEqualTo(((Number) before.get("snapshot_revision")).longValue() + 1);
      assertThat(after).containsEntry("runner_sequence", 2L);
      var usage = observedUsage(fixture.id());
      assertThat(usage).hasSize(1);
      assertThat(usage.getFirst())
          .containsEntry("usage_outcome", "USED")
          .containsEntry("outcome", "RESOLVED");
      assertThat(progressService.apply(fixture.id(), report).applied()).isFalse();
      assertThat(observedHistory(fixture.id())).isEqualTo(after);
      assertThat(observedUsage(fixture.id())).isEqualTo(usage);
    }
  }

  @Test
  void observedProgressCommitHookFailureRollsBackSnapshotSequenceAndActualUsageTogether()
      throws Exception {
    try (var fixture = observedReportOwner(true)) {
      var before = observedHistory(fixture.id());
      org.mockito.Mockito.doAnswer(
              invocation -> {
                if (fixture.id().equals(invocation.getArgument(0))) {
                  assertThat(observedUsage(fixture.id()))
                      .hasSize(1); // Inside the real precommit transaction.
                  throw new IllegalStateException("Controlled report commit fault");
                }
                return null;
              })
          .when(reportCommitHook)
          .beforeCommit(org.mockito.ArgumentMatchers.any(UUID.class));
      var report = observedReport(fixture, RunnerReport.PROGRESS, 2, Map.of("PASS", "USED"));
      assertThatThrownBy(() -> progressService.apply(fixture.id(), report))
          .hasMessage("Controlled report commit fault");
      assertThat(observedHistory(fixture.id())).isEqualTo(before);
      assertThat(observedUsage(fixture.id())).isEmpty();
      org.mockito.Mockito.reset(reportCommitHook);
      assertThat(progressService.apply(fixture.id(), report).applied()).isTrue();
      assertThat(observedUsage(fixture.id())).hasSize(1);
    }
  }

  @Test
  void observedProgressMissingScopedResolutionRefusesAndRollsBackItsWinningSnapshotCas()
      throws Exception {
    try (var fixture = observedReportOwner(false)) {
      var before = observedHistory(fixture.id());
      assertThatThrownBy(
              () ->
                  progressService.apply(
                      fixture.id(),
                      observedReport(fixture, RunnerReport.PROGRESS, 2, Map.of("PASS", "USED"))))
          .hasMessage("Missing scoped resolved secret release");
      assertThat(observedHistory(fixture.id())).isEqualTo(before);
      assertThat(observedUsage(fixture.id())).isEmpty();
    }
  }

  @Test
  void observedLosingProgressAndRealTerminalOwnerKeepTheEarlierUsedRowImmutable() throws Exception {
    try (var fixture = observedReportOwner(true)) {
      progressService.apply(
          fixture.id(), observedReport(fixture, RunnerReport.PROGRESS, 2, Map.of("PASS", "USED")));
      var usage = observedUsage(fixture.id());
      progressService.apply(
          fixture.id(), observedReport(fixture, RunnerReport.PROGRESS, 3, Map.of()));
      var before = observedHistory(fixture.id());
      assertThatThrownBy(
              () ->
                  progressService.apply(
                      fixture.id(),
                      observedReport(fixture, RunnerReport.PROGRESS, 2, Map.of("PASS", "USED"))))
          .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.SEQUENCE_REGRESSED);
      assertThat(observedHistory(fixture.id())).isEqualTo(before);
      assertThat(observedUsage(fixture.id())).isEqualTo(usage);
      transactions.executeWithoutResult(
          t ->
              assertThat(
                      statements.closeByReaper(
                          fixture.id(), ExecutionErrorCode.DISPATCH_UNKNOWN, Instant.now()))
                  .isEqualTo(1));
      var terminal = observedHistory(fixture.id());
      assertThatThrownBy(
              () ->
                  progressService.apply(
                      fixture.id(),
                      observedReport(fixture, RunnerReport.PROGRESS, 4, Map.of("PASS", "USED"))))
          .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.EXECUTION_SETTLED);
      assertThat(observedHistory(fixture.id())).isEqualTo(terminal);
      assertThat(observedUsage(fixture.id())).isEqualTo(usage);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  // ── 012A ruling R8.2: a refused observed pre-Ready terminal is logged by category only ──

  @Test
  void aRefusedObservedPreReadyTerminalLogsItsCategoryAndNeverTheReportContent() {
    String canary = "r8-canary-" + UUID.randomUUID();
    var before =
        jdbc.queryForMap(
            "SELECT status, error_code, snapshot_revision, step_results::text"
                + " FROM ui_test_executions WHERE id = ?",
            executionId);
    // One SKIPPED coordinate per original step; REASON is checked before COORDINATES regardless.
    int sources = stepCount();
    RunnerReport refused =
        new RunnerReport(
            executionId,
            attemptId,
            admissionId,
            RUNNER,
            RunnerReport.FINAL,
            1L,
            Instant.now(),
            null,
            java.util.stream.IntStream.range(0, sources)
                .mapToObj(
                    index -> new RunnerStepState(index, StepResult.SKIPPED, null, null, null, null))
                .toList(),
            List.of(),
            false,
            Map.of(),
            new RunOutcome(RunOutcome.ERROR, "RUN_ERROR", "CANCELLED " + canary, null),
            new RunnerEvidence(
                "studio/video.webm",
                "studio/manifest.result.json",
                RunnerEvidence.UNAVAILABLE,
                false),
            null,
            Map.of());

    var root =
        (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    var appender =
        new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
    appender.start();
    root.addAppender(appender);
    InternalCallbackException refusal;
    org.springframework.http.ResponseEntity<Map<String, String>> answer;
    try {
      refusal =
          org.assertj.core.api.Assertions.catchThrowableOfType(
              () -> progressService.apply(executionId, refused), InternalCallbackException.class);
      assertThat(refusal).isNotNull();
      answer =
          new com.citi.put.checks.config.ChecksExceptionHandler().handleInternalCallback(refusal);
    } finally {
      root.detachAppender(appender);
      appender.stop();
    }

    // The HTTP answer is exactly today's data-free refusal.
    assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(answer.getBody())
        .isEqualTo(
            Map.of(
                "error",
                InternalCallbackCodes.INVALID_REPORT,
                "message",
                "Invalid observed pre-Ready terminal report"));
    List<String> lines =
        appender.list.stream()
            .map(
                event ->
                    event.getLevel()
                        + " "
                        + event.getLoggerName()
                        + " "
                        + event.getFormattedMessage()
                        + (event.getThrowableProxy() == null
                            ? ""
                            : " " + event.getThrowableProxy().getMessage()))
            .toList();
    assertThat(lines)
        .contains(
            "WARN "
                + ProgressReportService.class.getName()
                + " Studio observed pre-Ready terminal refused: executionId="
                + executionId
                + " clause=REASON",
            "WARN "
                + com.citi.put.checks.config.ChecksExceptionHandler.class.getName()
                + " Studio internal callback refused: status=400 code="
                + InternalCallbackCodes.INVALID_REPORT);
    assertThat(lines)
        .as("the report's own text never reaches the log")
        .noneMatch(line -> line.contains(canary));
    // A refusal applies nothing.
    assertThat(
            jdbc.queryForMap(
                "SELECT status, error_code, snapshot_revision, step_results::text"
                    + " FROM ui_test_executions WHERE id = ?",
                executionId))
        .isEqualTo(before);
    assertThat(statements.find(executionId).orElseThrow().get("state")).isEqualTo("ADMITTED");
  }

  private int stepCount() {
    return jdbc.queryForObject(
        "SELECT COALESCE(json_array_length(step_results::json), 0) FROM ui_test_executions"
            + " WHERE id = ?",
        Integer.class,
        executionId);
  }

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
    ObservedPublicationFixture.admitObserved(
        observedAuthorization, admissionService, execution, RUNNER, admission);
    return admission;
  }

  /** Claims and begins the dispatch under the attempt the observed Run authority issued. */
  private UUID dispatch(UUID execution) {
    UUID attempt =
        UUID.fromString(
            observedAuthorization.binding(execution).orElseThrow().path("attemptId").asText());
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
        null,
        Map.of());
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
        null,
        Map.of());
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
        new RunOutcome(result, null, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", evidenceState, false),
        null,
        Map.of());
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

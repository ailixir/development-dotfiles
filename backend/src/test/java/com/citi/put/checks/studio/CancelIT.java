package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.RunnerDispatchClient.CancelOutcome;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.evidence.VideoEvidenceFixtures;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.InternalCallbackCodes;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Studio v1 WP4 — a real cancel, end to end through the API, the dispatcher, the admission CAS, the
 * report path and the running reaper.
 *
 * <p>The runner is the counting fake, so "the runner is never called" and "the relay is called
 * once" are counts of what left the process, filtered to the execution under test — never a
 * deployment-global total, which other classes' leftover rows would make meaningless.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "studio.execution.callback.service-token=" + CancelIT.SERVICE_TOKEN)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class CancelIT {

  private static final String CSI_ID = "60481";
  private static final String OWNER = "cancel-owner@citi.com";
  private static final String VIEWER = "cancel-viewer@citi.com";
  private static final String RUNNER = "studio-runner-0";
  static final String SERVICE_TOKEN = "cancel-it-service-identity";

  @TestConfiguration
  static class FakeRunner {

    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private RunningReaper runningReaper;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private StudioExecutionProperties properties;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;

  private Authentication owner;
  private UUID executionId;

  @BeforeEach
  void setUp() {
    runner.reset();
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(VIEWER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    UUID testId =
        fixtures
            .seedRunnableTest("Cancel draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
  }

  // ── queued: closed at once, the runner never called ─────────────────────

  @Test
  void aQueuedCancelEndsCancelledAndNoRunnerIsEverCalled() {
    ExecutionSnapshotDto answered = studioService.cancelExecution(executionId, owner);

    assertThat(answered.status()).isEqualTo("ERROR");
    assertThat(answered.errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);

    // Two whole passes and a direct attempt: nothing may pick the row back up.
    dispatcher.dispatchOnce();
    dispatcher.dispatchOnce();
    dispatcher.dispatch(executionId);

    assertThat(runner.sent().stream().filter(job -> executionId.equals(job.executionId())))
        .as("no POST /v1/runs, so no browser was ever launched for it")
        .isEmpty();
    assertThat(runner.cancelsFor(executionId)).as("and no DELETE either").isZero();
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  @Test
  void aCancelLandingWhileTheDispatcherHoldsTheClaimStopsTheSend() {
    statements.claim(
        executionId, "dispatcher-racing", Instant.now().plusSeconds(60), Instant.now());

    studioService.cancelExecution(executionId, owner);
    int began = statements.beginDispatch(executionId, "dispatcher-racing", UUID.randomUUID());

    assertThat(began).as("the claimed row was closed under the dispatcher").isZero();
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  // ── running: marked, relayed once, finished by the runner's FINAL ────────

  @Test
  void aRunningCancelIsRelayedExactlyOnceAndTheRunnersFinalEndsItCancelled() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, report(RunnerReport.STARTED, attemptId, admissionId, 1));

    ExecutionSnapshotDto answered = studioService.cancelExecution(executionId, owner);
    assertThat(answered.status()).as("202 carries the run as it is now").isEqualTo("RUNNING");

    dispatcher.dispatchOnce();
    dispatcher.dispatchOnce();
    assertThat(runner.cancelsFor(executionId)).isEqualTo(1);
    assertThat(ledger().get("cancel_relayed_at")).isNotNull();

    progressService.apply(
        executionId,
        finalReport(attemptId, admissionId, 2, RunOutcome.ERROR, ExecutionErrorCode.CANCELLED));

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).isEqualTo("ERROR");
    assertThat(after.errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(runner.sendCount()).as("never a second dispatch").isEqualTo(1);
  }

  @Test
  void anUnacknowledgedRelayIsRetriedByTheNextPass() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    studioService.cancelExecution(executionId, owner);

    runner.willAnswerCancel(CancelOutcome.NOT_FOUND);
    dispatcher.dispatchOnce();
    assertThat(ledger().get("cancel_relayed_at")).isNull();

    runner.willAnswerCancel(CancelOutcome.ACKNOWLEDGED);
    dispatcher.dispatchOnce();
    dispatcher.dispatchOnce();

    assertThat(runner.cancelsFor(executionId)).isEqualTo(2);
    assertThat(ledger().get("cancel_relayed_at")).isNotNull();
  }

  @Test
  void theReaperClosesACancelTheRunnerNeverFinished() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, report(RunnerReport.STARTED, attemptId, admissionId, 1));
    studioService.cancelExecution(executionId, owner);
    runner.willAnswerCancel(CancelOutcome.NOT_FOUND);
    dispatcher.dispatchOnce();

    runningReaper.reapOnce();
    assertThat(snapshot().status()).as("still inside the margin").isEqualTo("RUNNING");

    // Studio v1 WP16: the pre-WP16 margin (the start deadline) is well inside a live runner's
    // cancel path, so a cancel that old must still be the runner's to finish.
    backdateCancel(properties.startDeadlineOrDefault().plusSeconds(1).toSeconds());
    runningReaper.reapOnce();
    assertThat(snapshot().status())
        .as("a cancel older than the start deadline but inside the cancel margin is not reaped")
        .isEqualTo("RUNNING");

    backdateCancel(runningReaper.cancelMargin().plusSeconds(1).toSeconds());
    runningReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(ledger().get("state")).isEqualTo("DONE");

    // The runner's late FINAL is refused, and the reaper's verdict stands.
    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId, finalReport(attemptId, admissionId, 2, RunOutcome.PASSED, null)))
        .isInstanceOf(InternalCallbackException.class)
        .extracting(e -> ((InternalCallbackException) e).getCode())
        .isEqualTo(InternalCallbackCodes.EXECUTION_SETTLED);
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  // ── the race: cancel between dispatch and admission ─────────────────────

  @Test
  void aCancelBetweenTheSendAndTheAdmissionIsRefusedAdmissionAndEndsCancelled() {
    UUID attemptId = dispatchOnce();
    assertThat(ledger().get("state")).isEqualTo("DISPATCHING");

    studioService.cancelExecution(executionId, owner);

    assertThatThrownBy(() -> admit(attemptId, UUID.randomUUID()))
        .isInstanceOf(InternalCallbackException.class)
        .extracting(e -> ((InternalCallbackException) e).getCode())
        .isEqualTo(InternalCallbackCodes.EXECUTION_SETTLED);

    assertThat(ledger().get("admission_id")).as("no admission, so no browser").isNull();
    assertThat(ledger().get("state")).isEqualTo("DONE");
    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    // The dispatcher's own refusal handling, which closes DISPATCH_FAILED, finds the row settled.
    dispatcher.dispatchOnce();
    assertThat(runner.cancelsFor(executionId)).as("nothing held it, nothing to relay").isZero();
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  // ── the runner cannot obtain CANCELLED by naming it ─────────────────────

  @Test
  void aRunnerCancelledOutcomeWithoutARecordedRequestIsNotCancelled() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, report(RunnerReport.STARTED, attemptId, admissionId, 1));

    progressService.apply(
        executionId,
        finalReport(attemptId, admissionId, 2, RunOutcome.ERROR, ExecutionErrorCode.CANCELLED));

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode())
        .as("nobody asked for a cancel, so the API cannot name one")
        .isNull();
  }

  // ── 409s and authorization ──────────────────────────────────────────────

  @Test
  void aSecondCancelIsAConflict() {
    dispatchOnce();
    studioService.cancelExecution(executionId, owner);

    assertThatThrownBy(() -> studioService.cancelExecution(executionId, owner))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(StudioService.CANCEL_ALREADY_REQUESTED);
  }

  @Test
  void cancellingATerminalExecutionIsAConflict() {
    studioService.cancelExecution(executionId, owner);

    assertThatThrownBy(() -> studioService.cancelExecution(executionId, owner))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(StudioService.EXECUTION_TERMINAL);
  }

  @Test
  void aReaderMayNotCancelAndAnUnknownIdAnswersTheSame() {
    Authentication viewer = StudioExecutionFixtures.identity(VIEWER, CSI_ID, "viewer");

    assertThatThrownBy(() -> studioService.cancelExecution(executionId, viewer))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> studioService.cancelExecution(UUID.randomUUID(), owner))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(ledger().get("cancel_requested_at")).as("the refusal wrote nothing").isNull();
  }

  @Test
  void theRouteAnswers202WithTheSnapshotThen409AndRefuses403() throws Exception {
    HttpHeaders ownerHeaders = VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner");
    HttpHeaders viewerHeaders = VideoEvidenceFixtures.identity(VIEWER, "", CSI_ID + ":viewer");

    ResponseEntity<String> forbidden = post(executionId, viewerHeaders);
    assertThat(forbidden.getStatusCode().value()).isEqualTo(403);

    ResponseEntity<String> accepted = post(executionId, ownerHeaders);
    assertThat(accepted.getStatusCode().value()).isEqualTo(202);
    JsonNode body = objectMapper.readTree(accepted.getBody());
    assertThat(body.path("executionId").asText()).isEqualTo(executionId.toString());
    assertThat(body.path("status").asText()).isEqualTo("ERROR");
    assertThat(body.path("errorCode").asText()).isEqualTo(ExecutionErrorCode.CANCELLED);

    ResponseEntity<String> conflict = post(executionId, ownerHeaders);
    assertThat(conflict.getStatusCode().value()).isEqualTo(409);
    assertThat(objectMapper.readTree(conflict.getBody()).path("error").asText())
        .isEqualTo(StudioService.EXECUTION_TERMINAL);
  }

  // ── the pull half (ADR-002 §29): the owning runner reads the cancel ──────

  @Test
  void theControlReadNeedsTheServiceIdentityReportsTheFlagAndIs404ForAnUnknownId()
      throws Exception {
    String path = "/internal/studio/executions/" + executionId + "/control";

    assertThat(getInternal(path, null).getStatusCode().value()).isEqualTo(401);
    assertThat(getInternal(path, "wrong-token").getStatusCode().value()).isEqualTo(403);

    ResponseEntity<String> before = getInternal(path, SERVICE_TOKEN);
    assertThat(before.getStatusCode().value()).isEqualTo(200);
    JsonNode unset = objectMapper.readTree(before.getBody());
    assertThat(unset.path("executionId").asText()).isEqualTo(executionId.toString());
    assertThat(unset.path("cancelRequested").isBoolean()).isTrue();
    assertThat(unset.path("cancelRequested").asBoolean()).isFalse();

    dispatchOnce();
    studioService.cancelExecution(executionId, owner);
    JsonNode set = objectMapper.readTree(getInternal(path, SERVICE_TOKEN).getBody());
    assertThat(set.path("cancelRequested").asBoolean()).isTrue();

    ResponseEntity<String> unknown =
        getInternal("/internal/studio/executions/" + UUID.randomUUID() + "/control", SERVICE_TOKEN);
    assertThat(unknown.getStatusCode().value()).isEqualTo(404);
    assertThat(objectMapper.readTree(unknown.getBody()).path("error").asText())
        .isEqualTo(InternalCallbackCodes.EXECUTION_UNKNOWN);
  }

  @Test
  void theProgressAcknowledgementCarriesTheFlagOnceACancelIsRecorded() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);

    assertThat(
            progressService
                .apply(executionId, report(RunnerReport.STARTED, attemptId, admissionId, 1))
                .cancelRequested())
        .isFalse();
    studioService.cancelExecution(executionId, owner);
    assertThat(
            progressService
                .apply(executionId, report(RunnerReport.PROGRESS, attemptId, admissionId, 2))
                .cancelRequested())
        .isTrue();
  }

  /**
   * Two runner pods behind one Service: the relayed DELETE reaches the pod that does not hold the
   * run and answers 404. That is not an acknowledgement — the relay stays open — and the owning pod
   * completes the cancel through the pull path: it reads the flag and delivers its FINAL.
   */
  @Test
  void aDeleteThatReachesTheWrongPodIsNotAnAcknowledgementAndThePullCompletesTheCancel() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, report(RunnerReport.STARTED, attemptId, admissionId, 1));
    studioService.cancelExecution(executionId, owner);

    runner.willAnswerCancel(CancelOutcome.NOT_FOUND);
    dispatcher.dispatchOnce();
    assertThat(runner.cancelsFor(executionId)).isEqualTo(1);
    assertThat(ledger().get("cancel_relayed_at")).as("a 404 acknowledges nothing").isNull();
    assertThat(snapshot().status()).isEqualTo("RUNNING");

    // The owning pod's poll.
    assertThat(
            objectMapper
                .convertValue(
                    getInternalJson("/internal/studio/executions/" + executionId + "/control"),
                    JsonNode.class)
                .path("cancelRequested")
                .asBoolean())
        .isTrue();
    progressService.apply(
        executionId,
        finalReport(attemptId, admissionId, 2, RunOutcome.ERROR, ExecutionErrorCode.CANCELLED));

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(ledger().get("cancel_relayed_at"))
        .as("the relay was never acknowledged, and it did not need to be")
        .isNull();
  }

  // ── cancelled before the browser reported a start ───────────────────────

  @Test
  void aFinalWithoutAStartIsAcceptedForARunCancelledBeforeItStarted() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    studioService.cancelExecution(executionId, owner);

    progressService.apply(
        executionId,
        finalReport(attemptId, admissionId, 1, RunOutcome.ERROR, ExecutionErrorCode.CANCELLED));

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(ledger().get("state")).isIn("FINALIZING", "DONE");
  }

  @Test
  void aFinalWithoutAStartIsStillRefusedWhenNobodyCancelled() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);

    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId,
                    finalReport(
                        attemptId, admissionId, 1, RunOutcome.ERROR, ExecutionErrorCode.CANCELLED)))
        .isInstanceOf(InternalCallbackException.class)
        .extracting(e -> ((InternalCallbackException) e).getCode())
        .isEqualTo(InternalCallbackCodes.TRANSITION_REJECTED);
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
    assertThat(snapshot().status()).isEqualTo("PENDING");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private ResponseEntity<String> getInternal(String path, String token) {
    HttpHeaders headers = new HttpHeaders();
    if (token != null) {
      headers.setBearerAuth(token);
    }
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }

  private JsonNode getInternalJson(String path) {
    try {
      return objectMapper.readTree(getInternal(path, SERVICE_TOKEN).getBody());
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  private ResponseEntity<String> post(UUID execution, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/executions/" + execution + "/cancel",
        HttpMethod.POST,
        new HttpEntity<>(headers),
        String.class);
  }

  private UUID dispatchOnce() {
    runner.willAnswer(DispatchOutcome.accepted());
    dispatcher.dispatch(executionId);
    return UUID.fromString(ledger().get("attempt_id").toString());
  }

  private void admit(UUID attemptId, UUID admissionId) {
    admissionService.claim(
        executionId, new AdmissionRequest(executionId, attemptId, RUNNER, admissionId, Map.of()));
  }

  private void backdateCancel(long seconds) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET cancel_requested_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(seconds)),
        executionId);
  }

  private RunnerReport report(String kind, UUID attemptId, UUID admissionId, long sequence) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        kind,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        null,
        null,
        null);
  }

  private RunnerReport finalReport(
      UUID attemptId, UUID admissionId, long sequence, String result, String errorCode) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.FINAL,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        new RunOutcome(result, errorCode, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", RunnerEvidence.FAILED, false),
        null);
  }

  private Map<String, Object> ledger() {
    return statements.find(executionId).orElseThrow();
  }

  private ExecutionSnapshotDto snapshot() {
    return studioService.findExecutionById(executionId, owner);
  }
}

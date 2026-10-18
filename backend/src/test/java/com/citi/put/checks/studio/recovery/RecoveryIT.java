package com.citi.put.checks.studio.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.evidence.TestEvidenceStores;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-28 – AC-31 — restart recovery, both reapers and finalization reconciliation.
 *
 * <p>A "restart" here is a fresh {@link StudioDispatcher} with a new lease owner and no
 * carried-over state, driven against the same ledger. That is exactly what a restart is for a
 * component whose only durable state is the ledger — and if any of these guarantees depended on
 * something held in memory, this is where it would show.
 *
 * <p>Every case asserts the fake runner client's {@code POST /v1/runs} count, because "a truthful
 * result without repeating effects" is a claim about how many browsers were started, and nothing
 * else can observe that.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import({
  RecoveryIT.FakeRunner.class,
  TestEvidenceStores.class,
  ObservedPublicationFixture.FreshAuthority.class
})
@Testcontainers(disabledWithoutDocker = true)
class RecoveryIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60461";
  private static final String OWNER = "recovery-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";

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
  @Autowired private PendingReaper pendingReaper;
  @Autowired private RunningReaper runningReaper;
  @Autowired private FinalizationReconciler reconciler;
  @Autowired private FakeResultManifestStore manifests;
  @Autowired private AdmissionCasService admissionService;

  @Autowired
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observedReplay;

  @Autowired private ProgressReportService progressService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private UUID testId;
  private UUID executionId;

  @BeforeEach
  void setUp() {
    runner.reset();
    manifests.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("Recovery draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
  }

  // ── AC-28a: the four restart points, and the fifth ambiguous case ────────

  @Test
  void restartBeforeSendReclaimsAndDispatchesExactlyOnce() {
    // QUEUED/CLAIMED, lease expired, no attempt issued.
    statements.claim(
        executionId, "dispatcher-that-died", Instant.now().minusSeconds(1), Instant.now());
    assertThat(ledger().get("state")).isEqualTo("CLAIMED");

    pendingReaper.reapOnce();
    assertThat(ledger().get("state"))
        .as("reclaimed, because no attempt was ever issued")
        .isEqualTo("QUEUED");

    dispatcher.dispatch(executionId);

    assertThat(runner.sendCount()).isEqualTo(1);
    assertThat(ledger().get("state")).isEqualTo("DISPATCHING");
  }

  @Test
  void restartAfterAdmissionWithNoStartedIsStartTimeoutAndNeverASecondDispatch() {
    UUID attemptId = dispatchOnce();
    admit(attemptId, UUID.randomUUID());
    expire("start_deadline_at");

    runningReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.START_TIMEOUT);
    assertThat(runner.sendCount()).as("never a second dispatch").isEqualTo(1);
  }

  // ── Studio v1 WP16: a recorded cancel decides the outcome, on the cancel budget ──

  /**
   * A cancel on a row still waiting for its browser: the start deadline passes long before a
   * healthy runner's cancel path is over, and must neither close the row early nor name it
   * START_TIMEOUT. The cancel margin, and only the cancel margin, closes it — as CANCELLED.
   */
  @Test
  void aCancelledAdmittedRowPastItsStartDeadlineWaitsForTheCancelMarginAndEndsCancelled() {
    UUID attemptId = dispatchOnce();
    admit(attemptId, UUID.randomUUID());
    studioService.cancelExecution(executionId, owner);
    expire("start_deadline_at");

    runningReaper.reapOnce();
    assertThat(ledger().get("state"))
        .as("the start deadline must not pre-empt the cancel budget")
        .isEqualTo("ADMITTED");
    assertThat(snapshot().status()).isEqualTo("PENDING");

    backdateCancel(runningReaper.cancelMargin().minusSeconds(5));
    runningReaper.reapOnce();
    assertThat(ledger().get("state")).as("still inside the margin").isEqualTo("ADMITTED");

    backdateCancel(runningReaper.cancelMargin().plusSeconds(1));
    runningReaper.reapOnce();
    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
    assertThat(ledger().get("state")).isEqualTo("DONE");
    assertThat(runner.sendCount()).as("never a second dispatch").isEqualTo(1);
  }

  /** The same for a running row past its run deadline: never STALE once a cancel was recorded. */
  @Test
  void aCancelledRunningRowPastItsRunDeadlineWaitsForTheCancelMarginAndEndsCancelled() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    studioService.cancelExecution(executionId, owner);
    expire("run_deadline_at");

    runningReaper.reapOnce();
    assertThat(ledger().get("state")).isEqualTo("RUNNING");

    backdateCancel(runningReaper.cancelMargin().plusSeconds(1));
    runningReaper.reapOnce();
    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  /**
   * Whichever reaper path closes a cancelled row, the outcome is CANCELLED: the pending reaper's
   * DISPATCH_UNKNOWN, and a reaper close that selected the row before the cancel was recorded.
   */
  @Test
  void everyReaperCloseOfACancelledRowIsCancelledWhateverCodeThePathWouldName() {
    dispatchOnce();
    studioService.cancelExecution(executionId, owner);
    expire("pending_deadline_at");

    pendingReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode())
        .as("not DISPATCH_UNKNOWN: the user cancelled it")
        .isEqualTo(ExecutionErrorCode.CANCELLED);

    // The statement decides against the row it locks, so a START_TIMEOUT close that raced the
    // cancel still records CANCELLED; the kill switch's and the dispatcher's close keep their code.
    UUID other =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID otherAttempt = dispatchOnce(other);
    admit(other, otherAttempt, UUID.randomUUID());
    studioService.cancelExecution(other, owner);
    assertThat(statements.closeByReaper(other, ExecutionErrorCode.START_TIMEOUT, Instant.now()))
        .isEqualTo(1);
    assertThat(studioService.findExecutionById(other, owner).errorCode())
        .isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  @Test
  void restartDuringExecutionPastTheRunDeadlineIsStaleAndNeverASecondDispatchOrAReplay() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    expire("run_deadline_at");

    runningReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.STALE);
    assertThat(runner.sendCount()).isEqualTo(1);
  }

  @Test
  void restartAfterTheManifestWriteYieldsTheRealResultRatherThanStale() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    // The runner wrote the terminal manifest at the key the API derives, and then the delivery
    // was lost. The API reads that key — not a listing, not a runner-supplied key, not a URL.
    manifests.put(
        derivedManifestKey(attemptId), manifest(executionId, attemptId, "PASSED", "STORED"));
    expire("run_deadline_at");

    runningReaper.reapOnce();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).as("the real result, not STALE").isEqualTo("PASSED");
    assertThat(after.errorCode()).isNull();
    assertThat(after.video().status()).isEqualTo("AVAILABLE");
    assertThat(runner.sendCount()).as("no second run").isEqualTo(1);
  }

  // ── Story 10.14 AC-20, AC-21, AC-7a ──────────────────────────────────────

  /**
   * AC-20 — recovery from the bytes the runner <b>actually writes</b>.
   *
   * <p>The reconciliation logic is story 10.7's and is not re-implemented. What story 10.14 adds is
   * that the bytes on both sides of this seam are now produced and consumed by real code: the
   * manifest here is the committed fixture generated by the runner's own {@code
   * serializeResultManifest}, deserialized through {@link ResultManifest}, rather than an object
   * this test built by hand.
   */
  @Test
  void recoveryAppliesTheRealOutcomeFromTheBytesTheRunnersSerializerProduced() throws Exception {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    manifests.put(derivedManifestKey(attemptId), runnerProducedManifest(executionId, attemptId));
    expire("run_deadline_at");

    runningReaper.reapOnce();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status())
        .as("the runner's own ERROR, not the reaper's STALE")
        .isEqualTo("ERROR");
    assertThat(after.errorCode())
        .as("a manifest-supplied runner code is recorded, never copied into error_code")
        .isNull();
    assertThat(after.video().status()).isEqualTo("AVAILABLE");
    assertThat(runner.sendCount()).as("no browser runs twice").isEqualTo(1);
  }

  /**
   * AC-20's amendment — the dispatch counter is shown <b>capable of reaching two</b>.
   *
   * <p>"Count exactly one" is this epic's canonical vacuous shape: a counter that reads one is
   * satisfied by a test in which nothing ever tried twice, and such a test proves nothing about the
   * guard. So the term under test is named and then neutralised. The term is the ledger state the
   * reconciler writes — {@code applyReconciledOutcome}'s {@code state = 'DONE'}, which the
   * dispatcher's claim refuses to pick up. Put the row back to {@code QUEUED} and the same
   * `dispatcher.dispatch` that was a no-op sends a second {@code POST /v1/runs}.
   */
  @Test
  void theDispatchCounterCanReachTwoAndTheReconciledLedgerStateIsWhatStopsIt() throws Exception {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    // STUDIO-OBS-014 P1: admitted at the statement level, exactly what the deleted legacy claim()
    // did (the AR-3 b precedent for AdmissionCasIT.observedSqlCannotBorrow...). The observed
    // admission would also write the immutable observed_admission_receipt, a second guard that
    // the "neutralise one term" control below cannot clear (V15 receipt trigger), so the control
    // would no longer isolate the reconciled ledger state this test is about.
    Instant now = Instant.now();
    Integer admitted =
        transactions.execute(
            status ->
                statements.admit(
                    executionId,
                    attemptId,
                    admissionId,
                    RUNNER,
                    now.plusSeconds(60),
                    now.plusSeconds(600),
                    now));
    assertThat(admitted).isEqualTo(1);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    manifests.put(derivedManifestKey(attemptId), runnerProducedManifest(executionId, attemptId));
    expire("run_deadline_at");

    runningReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(ledger().get("state")).isEqualTo("DONE");
    assertThat(runner.sendCount()).isEqualTo(1);

    // Dispatching again changes nothing while the reconciled state stands.
    runner.willAnswer(DispatchOutcome.accepted());
    dispatcher.dispatch(executionId);
    assertThat(runner.sendCount()).as("the guard holds").isEqualTo(1);

    // Neutralise that one term, and the counter moves. This is the half that makes the assertion
    // above mean something: the mechanism is live and the number is not a constant.
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = 'QUEUED', attempt_id = NULL,"
            + " admission_id = NULL, runner_instance_id = NULL, lease_owner = NULL,"
            + " lease_expires_at = NULL WHERE execution_id = ?",
        executionId);
    jdbc.update(
        "UPDATE ui_test_executions SET status = 'PENDING', ended_at = NULL WHERE id = ?",
        executionId);
    runner.willAnswer(DispatchOutcome.accepted());
    dispatcher.dispatch(executionId);

    assertThat(runner.sendCount())
        .as("the counter is capable of two; the reconciled ledger state is what stopped it")
        .isEqualTo(2);
  }

  /**
   * AC-7a — the embedded identity is defence in depth over the derived key, never a substitute.
   *
   * <p>A manifest found at the right key but carrying a different execution or attempt can only
   * mean a misdirected write or a store that served the wrong object. It is recorded for
   * investigation and nothing is applied — the same disposition §5.3 gives a manifest arriving
   * after finalization.
   */
  @Test
  void aManifestWhoseEmbeddedIdentityDisagreesWithItsKeyIsRefusedAndAppliesNothing()
      throws Exception {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    // Right key, wrong body.
    manifests.put(
        derivedManifestKey(attemptId),
        runnerProducedManifest(UUID.randomUUID(), UUID.randomUUID()));
    expire("run_deadline_at");

    assertThat(reconciler.reconcile(executionId)).isFalse();

    runningReaper.reapOnce();
    assertThat(snapshot().errorCode())
        .as("the reaper's honest verdict, not a result read out of somebody else's manifest")
        .isEqualTo(ExecutionErrorCode.STALE);
    assertThat(runner.sendCount()).isEqualTo(1);

    // And the matching body at the same key is applied, so the refusal above is the identity check
    // and not a store that never answered.
    UUID other =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID otherAttempt = dispatchOnce(other);
    UUID otherAdmission = UUID.randomUUID();
    admit(other, otherAttempt, otherAdmission);
    progressService.apply(other, started(other, otherAttempt, otherAdmission, 1));
    manifests.put(
        derivedManifestKey(other, otherAttempt), runnerProducedManifest(other, otherAttempt));
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        other);
    runningReaper.reapOnce();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, other))
        .isEqualTo("ERROR");
  }

  /**
   * AC-21 — API delivery down, storage down, then the runner is lost.
   *
   * <p>No complete result can be guaranteed, so none is invented: the running reaper records an
   * infrastructure verdict and no recovered result appears. The store being <b>unreachable</b> must
   * not be mistaken for the key being <b>absent</b> — {@code ResultManifestStore.isAvailable}
   * exists for that distinction, and the reconciler refuses to conclude anything rather than
   * converting an outage into a verdict of its own.
   */
  @Test
  void bothChannelsDownThenRunnerLostResolvesThroughTheReaperWithNothingInvented() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    // Both channels down: no terminal report was ever delivered, and the store cannot be read.
    manifests.makeUnavailable();
    expire("run_deadline_at");

    // The reconciler declines rather than concluding "no manifest".
    assertThat(reconciler.reconcile(executionId)).isFalse();

    runningReaper.reapOnce();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).isEqualTo("ERROR");
    assertThat(after.errorCode())
        .as("an infrastructure verdict, not a guessed outcome")
        .isEqualTo(ExecutionErrorCode.STALE);
    assertThat(after.stepResults())
        .as("no partial manifest is treated as whole and no step result is invented")
        .allSatisfy(step -> assertThat(step.status()).isNotEqualTo("PASS"));
    assertThat(runner.sendCount()).isEqualTo(1);
  }

  @Test
  void anUnreachableStoreIsNotMistakenForAnAbsentKey() throws Exception {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    manifests.put(derivedManifestKey(attemptId), runnerProducedManifest(executionId, attemptId));
    expire("run_deadline_at");

    // The object is there; the store is not reachable. Concluding "absent" here would convert an
    // outage into a STALE verdict over a run whose real result exists.
    manifests.makeUnavailable();
    assertThat(reconciler.reconcile(executionId)).isFalse();
    assertThat(snapshot().status()).isEqualTo("RUNNING");

    // Reachable again, same object, and the real outcome is applied.
    manifests.clear();
    manifests.put(derivedManifestKey(attemptId), runnerProducedManifest(executionId, attemptId));
    assertThat(reconciler.reconcile(executionId)).isTrue();
    assertThat(snapshot().status()).isEqualTo("ERROR");
  }

  @Test
  void aCrashBetweenCommittingTheAttemptAndSendingItEndsAsUnknownRatherThanBeingReplayed() {
    // §5.1 explicitly permits this outcome. A test that "fixes" it into a replay is the failure.
    UUID attemptId = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              executionId, "dispatcher-that-died", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(executionId, "dispatcher-that-died", attemptId);
        });
    assertThat(runner.sendCount()).as("the send never happened").isZero();
    expire("pending_deadline_at");

    pendingReaper.reapOnce();

    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode())
        .as("unknown, because an attempt was committed and its outcome cannot be known")
        .isEqualTo(ExecutionErrorCode.DISPATCH_UNKNOWN);
    assertThat(runner.sendCount()).as("and it is not replayed").isZero();
  }

  // ── AC-29: the pending reaper's one hard rule ────────────────────────────

  @Test
  void aDispatchingRowIsNeverReclaimedWhateverItsLeaseSays() {
    UUID attemptId = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              executionId, "dispatcher-a", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(executionId, "dispatcher-a", attemptId);
        });
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET lease_expires_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(86_400)),
        executionId);

    pendingReaper.reapOnce();
    int dispatched = dispatcher.dispatchOnce();

    assertThat(ledger().get("state"))
        .as("a long-expired lease on a DISPATCHING row is still not permission to re-dispatch")
        .isEqualTo("DISPATCHING");
    // A global send count would be coupled to whatever other test classes left queued, so the
    // assertion is about *this* execution: nothing was ever sent for it.
    assertThat(runner.sent())
        .as("no job for this execution left the process")
        .noneSatisfy(job -> assertThat(job.executionId()).isEqualTo(executionId));
    assertThat(dispatched).isGreaterThanOrEqualTo(0);
  }

  @Test
  void theTwoPendingClosuresAreDistinguishableFromThePersistedStateNotFromALogLine() {
    // No attempt issued -> DISPATCH_FAILED.
    expire("pending_deadline_at");
    pendingReaper.reapOnce();
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.DISPATCH_FAILED);

    // An attempt issued, outcome ambiguous -> DISPATCH_UNKNOWN.
    UUID second =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID attemptId = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(second, "dispatcher-a", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(second, "dispatcher-a", attemptId);
        });
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET pending_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        second);
    pendingReaper.reapOnce();

    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, second))
        .isEqualTo(ExecutionErrorCode.DISPATCH_UNKNOWN);
  }

  // ── AC-30: idempotency, heartbeats, and the evidence condition ───────────

  @Test
  void bothReapersAreIdempotentAndASecondPassBumpsNoRevision() {
    UUID attemptId = dispatchOnce();
    admit(attemptId, UUID.randomUUID());
    expire("start_deadline_at");

    runningReaper.reapOnce();
    long revisionAfterFirstPass = snapshot().revision();

    runningReaper.reapOnce();
    pendingReaper.reapOnce();

    assertThat(snapshot().revision())
        .as("a second pass changes nothing and bumps no revision")
        .isEqualTo(revisionAfterFirstPass);
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.START_TIMEOUT);
  }

  @Test
  void heartbeatsNeverExtendTheRunDeadlineSoTheRunningReaperStillFires() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    Instant runDeadlineBefore = instant(ledger().get("run_deadline_at"));

    // Repeated progress past the deadline. Nothing on this path writes run_deadline_at.
    expire("run_deadline_at");
    for (long sequence = 2; sequence <= 6; sequence++) {
      progressService.apply(executionId, progress(attemptId, admissionId, sequence));
    }

    assertThat(instant(ledger().get("run_deadline_at")))
        .as("a heartbeat is not an extension")
        .isBefore(Instant.now());
    assertThat(runDeadlineBefore).isNotNull();

    runningReaper.reapOnce();

    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.STALE);
  }

  @Test
  void anOutcomeKnownWithEvidenceUnsettledIsSettledWithTheCheckOutcomePreserved() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    progressService.apply(
        executionId,
        terminal(attemptId, admissionId, 9, RunOutcome.FAILED, RunnerEvidence.PENDING));

    assertThat(snapshot().streamComplete()).isFalse();
    long revisionBefore = snapshot().revision();
    expire("run_deadline_at");

    runningReaper.reapOnce();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).as("the check outcome is preserved").isEqualTo("FAILED");
    assertThat(after.video().status()).isEqualTo("UNAVAILABLE");
    assertThat(after.streamComplete()).isTrue();
    assertThat(after.revision()).isGreaterThan(revisionBefore);
  }

  // ── AC-30: both directions, both orders ──────────────────────────────────

  @Test
  void aLateReportCannotRegressTheReapersTerminalStateAndViceVersa() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    // Order one: the reaper finalizes first, then a report arrives.
    expire("run_deadline_at");
    runningReaper.reapOnce();
    Map<String, Object> historyAfterReaper = historyRow(executionId);

    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId,
                    terminal(attemptId, admissionId, 9, RunOutcome.PASSED, RunnerEvidence.STORED)))
        .isInstanceOf(InternalCallbackException.class);
    assertThat(historyRow(executionId))
        .as("a late report cannot regress the reaper's terminal state")
        .isEqualTo(historyAfterReaper);

    // Order two: a report finalizes first, then the reaper runs.
    UUID second =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID secondAttempt = dispatchOnce(second);
    UUID secondAdmission = UUID.randomUUID();
    admit(second, secondAttempt, secondAdmission);
    progressService.apply(second, started(second, secondAttempt, secondAdmission, 1));
    progressService.apply(
        second,
        terminal(
            second, secondAttempt, secondAdmission, 9, RunOutcome.PASSED, RunnerEvidence.STORED));
    Map<String, Object> historyAfterReport = historyRow(second);

    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ?, start_deadline_at = ?"
            + " WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        Timestamp.from(Instant.now().minusSeconds(1)),
        second);
    runningReaper.reapOnce();
    pendingReaper.reapOnce();

    assertThat(historyRow(second))
        .as("and the reaper cannot regress a state a report already settled")
        .isEqualTo(historyAfterReport);
  }

  @Test
  void aProgressReportRacingAReaperFinalizationIsInterleavedInBothOrders() throws Exception {
    // Order one: the reaper holds its finalization transaction open across the report's attempt.
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    java.util.concurrent.CountDownLatch reaperInside = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.CountDownLatch reportDone = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicReference<Throwable> reportOutcome =
        new java.util.concurrent.atomic.AtomicReference<>();

    java.util.concurrent.CompletableFuture<Void> report =
        java.util.concurrent.CompletableFuture.runAsync(
            () -> {
              try {
                if (!reaperInside.await(30, java.util.concurrent.TimeUnit.SECONDS)) {
                  throw new IllegalStateException("the reaper never started");
                }
                progressService.apply(
                    executionId,
                    terminal(attemptId, admissionId, 9, RunOutcome.PASSED, RunnerEvidence.STORED));
              } catch (Throwable t) {
                reportOutcome.set(t);
              } finally {
                reportDone.countDown();
              }
            });

    transactions.executeWithoutResult(
        status -> {
          statements.closeWithError(executionId, ExecutionErrorCode.STALE, Instant.now());
          reaperInside.countDown();
          sleep(1500);
        });

    assertThat(reportDone.await(60, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
    report.join();

    assertThat(reportOutcome.get())
        .as("the report blocked on the ledger row, re-read the committed state and was refused")
        .isInstanceOf(InternalCallbackException.class);
    assertThat(snapshot().status()).isEqualTo("ERROR");
    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.STALE);

    // Order two: the report holds its transaction open across the reaper's attempt.
    UUID second =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID secondAttempt = dispatchOnce(second);
    UUID secondAdmission = UUID.randomUUID();
    admit(second, secondAttempt, secondAdmission);
    progressService.apply(second, started(second, secondAttempt, secondAdmission, 1));

    java.util.concurrent.CountDownLatch reportInside = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.CountDownLatch reaperDone = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicInteger reaperClosed =
        new java.util.concurrent.atomic.AtomicInteger();

    java.util.concurrent.CompletableFuture<Void> reaper =
        java.util.concurrent.CompletableFuture.runAsync(
            () -> {
              try {
                if (!reportInside.await(30, java.util.concurrent.TimeUnit.SECONDS)) {
                  throw new IllegalStateException("the report never started");
                }
                reaperClosed.set(
                    transactions.execute(
                        status ->
                            statements.closeWithError(
                                second, ExecutionErrorCode.STALE, Instant.now())));
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              } finally {
                reaperDone.countDown();
              }
            });

    transactions.executeWithoutResult(
        status -> {
          progressService.apply(
              second,
              terminal(
                  second,
                  secondAttempt,
                  secondAdmission,
                  9,
                  RunOutcome.PASSED,
                  RunnerEvidence.STORED));
          reportInside.countDown();
          sleep(1500);
        });

    assertThat(reaperDone.await(60, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
    reaper.join();

    assertThat(reaperClosed.get())
        .as("the reaper blocked, re-read the settled row and wrote nothing")
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, second))
        .as("and the report's outcome stands")
        .isEqualTo("PASSED");
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while holding a transaction open", e);
    }
  }

  // ── AC-21 (reassigned): the reaper-first stale-callback case ─────────────

  @Test
  void aStaleCallbackAfterAReaperFinalizationChangesNothingAndDispatchesNoRun() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));

    expire("run_deadline_at");
    runningReaper.reapOnce();
    Map<String, Object> before = historyRow(executionId);
    int sendsBefore = runner.sendCount();

    assertThatThrownBy(
            () -> progressService.apply(executionId, progress(attemptId, admissionId, 7)))
        .isInstanceOf(InternalCallbackException.class);
    assertThatThrownBy(
            () ->
                progressService.apply(
                    executionId,
                    terminal(attemptId, admissionId, 9, RunOutcome.PASSED, RunnerEvidence.STORED)))
        .isInstanceOf(InternalCallbackException.class);

    assertThat(historyRow(executionId))
        .as("recorded for investigation; it cannot silently change history")
        .isEqualTo(before);
    assertThat(runner.sendCount()).as("and it cannot trigger a new run").isEqualTo(sendsBefore);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(1);
  }

  // ── AC-23 (reassigned): the reaper's own revision increment ──────────────

  @Test
  void aReaperWriteIncrementsTheRevisionAndSoDoesAnEvidenceUpdate() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    long beforeReaper = snapshot().revision();

    expire("start_deadline_at");
    runningReaper.reapOnce();

    assertThat(snapshot().revision())
        .as("§5.3 says *every* visible change, including reaper updates")
        .isEqualTo(beforeReaper + 1);

    // And the evidence path, which a progress-shaped implementation would miss.
    UUID second =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID secondAttempt = dispatchOnce(second);
    UUID secondAdmission = UUID.randomUUID();
    admit(second, secondAttempt, secondAdmission);
    progressService.apply(second, started(second, secondAttempt, secondAdmission, 1));
    progressService.apply(
        second,
        terminal(
            second, secondAttempt, secondAdmission, 9, RunOutcome.PASSED, RunnerEvidence.PENDING));
    long beforeEvidence = revisionOf(second);

    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        second);
    runningReaper.reapOnce();

    assertThat(revisionOf(second)).isEqualTo(beforeEvidence + 1);
  }

  // ── AC-31: the manifest before and after finalization ────────────────────

  @Test
  void aManifestContradictingTheReaperWinsBeforeFinalizationAndLosesAfterIt() {
    UUID attemptId = dispatchOnce();
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);
    progressService.apply(executionId, started(attemptId, admissionId, 1));
    expire("run_deadline_at");

    // Before finalization: the manifest says PASSED and the reaper would have said STALE.
    manifests.put(
        derivedManifestKey(attemptId), manifest(executionId, attemptId, "PASSED", "STORED"));
    runningReaper.reapOnce();
    assertThat(snapshot().status()).isEqualTo("PASSED");

    // After finalization: a manifest arriving now changes nothing.
    UUID second =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    UUID secondAttempt = dispatchOnce(second);
    UUID secondAdmission = UUID.randomUUID();
    admit(second, secondAttempt, secondAdmission);
    progressService.apply(second, started(second, secondAttempt, secondAdmission, 1));
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        second);
    runningReaper.reapOnce();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, second))
        .isEqualTo(ExecutionErrorCode.STALE);
    Map<String, Object> finalized = historyRow(second);

    manifests.put(
        derivedManifestKey(second, secondAttempt),
        manifest(second, secondAttempt, "PASSED", "STORED"));
    assertThat(reconciler.reconcile(second)).isFalse();

    assertThat(historyRow(second))
        .as("a post-finalization manifest is recorded for investigation and nothing more")
        .isEqualTo(finalized);
  }

  @Test
  void theManifestKeyIsDerivedFromImmutableIdentityAndIsNeverListedForOrSupplied() {
    UUID attemptId = dispatchOnce();
    admit(attemptId, UUID.randomUUID());

    String expected =
        "studio/" + CSI_ID + "/" + testId + "/" + executionId + "/" + attemptId + ".result.json";
    assertThat(derivedManifestKey(attemptId)).isEqualTo(expected);

    // Put the manifest under a key the runner might have *chosen*. Recovery must not find it.
    manifests.put(
        "studio/somewhere-the-runner-picked.result.json",
        manifest(executionId, attemptId, "PASSED", "STORED"));
    expire("start_deadline_at");
    runningReaper.reapOnce();

    assertThat(snapshot().errorCode())
        .as("a runner-chosen key is not read, and no listing looks for one")
        .isEqualTo(ExecutionErrorCode.START_TIMEOUT);
  }

  @Test
  void anUnreachableStoreIsNotMistakenForAnAbsentManifest() {
    UUID attemptId = dispatchOnce();
    admit(attemptId, UUID.randomUUID());
    manifests.makeUnavailable();

    assertThat(reconciler.reconcile(executionId))
        .as("refusing to conclude is the honest answer; an outage must not become a verdict")
        .isFalse();
    assertThat(snapshot().status()).isEqualTo("PENDING");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private UUID dispatchOnce() {
    return dispatchOnce(executionId);
  }

  private UUID dispatchOnce(UUID execution) {
    runner.willAnswer(DispatchOutcome.accepted());
    dispatcher.dispatch(execution);
    return UUID.fromString(statements.find(execution).orElseThrow().get("attempt_id").toString());
  }

  private void admit(UUID attemptId, UUID admissionId) {
    admit(executionId, attemptId, admissionId);
  }

  /**
   * Admits the way the runner does for an observed run (STUDIO-OBS-014 P1: re-pointed from the
   * deleted legacy {@code AdmissionCasService.claim}). The attempt is the one the observed Run
   * authority issued and the dispatcher began.
   */
  private void admit(UUID execution, UUID attemptId, UUID admissionId) {
    assertThat(ObservedPublicationFixture.bindingAttempt(observedReplay, execution))
        .isEqualTo(attemptId);
    ObservedPublicationFixture.admitObserved(
        observedReplay, admissionService, execution, RUNNER, admissionId);
  }

  private void expire(String column) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET " + column + " = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        executionId);
  }

  private void backdateCancel(java.time.Duration age) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET cancel_requested_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minus(age)),
        executionId);
  }

  private String derivedManifestKey(UUID attemptId) {
    return derivedManifestKey(executionId, attemptId);
  }

  private String derivedManifestKey(UUID execution, UUID attemptId) {
    return ManifestKeys.manifestKey(
        new ResultManifestStore.ExecutionIdentity(CSI_ID, testId, execution, attemptId));
  }

  /**
   * A manifest for a named execution and attempt.
   *
   * <p>Story 10.14 widened {@code ResultManifest} to §5.3's five contents and made {@link
   * com.citi.put.checks.studio.recovery.FinalizationReconciler} refuse a body whose embedded
   * identity disagrees with the key it was read from, so the identity is no longer optional here.
   */
  /**
   * The committed fixture the <b>runner's own serializer</b> produced, re-identified.
   *
   * <p>AC-7a's single shared artefact: {@code studio-runner/test/fixtures/result-manifest.json} is
   * generated by {@code serializeResultManifest} and asserted byte for byte by the runner suite.
   * Reading it here rather than building an object means this test's input is bytes a runner really
   * writes, which is the half AC-21 says is "only worth its line if it is driven through the real
   * write path".
   */
  private ResultManifest runnerProducedManifest(UUID execution, UUID attempt) throws IOException {
    String json =
        Files.readString(
            Path.of("..", "studio-runner", "test", "fixtures", "result-manifest.json"),
            StandardCharsets.UTF_8);
    ResultManifest fixture = FIXTURE_MAPPER.readValue(json, ResultManifest.class);
    return new ResultManifest(
        fixture.schemaVersion(),
        execution.toString(),
        attempt.toString(),
        fixture.revisionId(),
        fixture.artifactHash(),
        fixture.runnerInstanceId(),
        fixture.outcome(),
        fixture.errorCode(),
        fixture.errorMessage(),
        fixture.browserStartedAt(),
        fixture.endedAt(),
        fixture.durationMs(),
        fixture.runtimeVersions(),
        fixture.videoKey(),
        fixture.manifestKey(),
        fixture.evidenceState(),
        fixture.evidencePartial());
  }

  private static final com.fasterxml.jackson.databind.ObjectMapper FIXTURE_MAPPER =
      com.fasterxml.jackson.databind.json.JsonMapper.builder()
          .addModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
          .build();

  private static ResultManifest manifest(
      UUID execution, UUID attempt, String outcome, String evidenceState) {
    return new ResultManifest(
        1,
        execution.toString(),
        attempt.toString(),
        UUID.nameUUIDFromBytes("revision".getBytes(java.nio.charset.StandardCharsets.UTF_8))
            .toString(),
        "sha256:abc",
        RUNNER,
        outcome,
        null,
        null,
        Instant.parse("2026-09-10T10:00:02Z"),
        Instant.parse("2026-09-10T10:00:39Z"),
        37_000,
        Map.of("playwright", "1.63.0"),
        null,
        null,
        evidenceState,
        false);
  }

  private RunnerReport started(UUID attemptId, UUID admissionId, long sequence) {
    return started(executionId, attemptId, admissionId, sequence);
  }

  private RunnerReport started(UUID execution, UUID attemptId, UUID admissionId, long sequence) {
    return new RunnerReport(
        execution,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.STARTED,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        null,
        null,
        null,
        Map.of());
  }

  private RunnerReport progress(UUID attemptId, UUID admissionId, long sequence) {
    return new RunnerReport(
        executionId,
        attemptId,
        admissionId,
        RUNNER,
        RunnerReport.PROGRESS,
        sequence,
        Instant.now(),
        Instant.parse("2026-09-10T10:00:02Z"),
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of(),
        null,
        null,
        null,
        Map.of());
  }

  private RunnerReport terminal(
      UUID attemptId, UUID admissionId, long sequence, String result, String evidenceState) {
    return terminal(executionId, attemptId, admissionId, sequence, result, evidenceState);
  }

  private RunnerReport terminal(
      UUID execution,
      UUID attemptId,
      UUID admissionId,
      long sequence,
      String result,
      String evidenceState) {
    return new RunnerReport(
        execution,
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
        new RunOutcome(result, null, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", evidenceState, false),
        null,
        Map.of());
  }

  private Map<String, Object> ledger() {
    return statements.find(executionId).orElseThrow();
  }

  private ExecutionSnapshotDto snapshot() {
    return studioService.findExecutionById(executionId, owner);
  }

  private long revisionOf(UUID execution) {
    Long value =
        jdbc.queryForObject(
            "SELECT snapshot_revision FROM ui_test_executions WHERE id = ?", Long.class, execution);
    return value == null ? 0L : value;
  }

  private Map<String, Object> historyRow(UUID execution) {
    return jdbc.queryForMap(
        "SELECT status, error_code, step_results::text, logs::text, snapshot_revision,"
            + " video_status, ended_at FROM ui_test_executions WHERE id = ?",
        execution);
  }

  private static Instant instant(Object value) {
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant();
    }
    if (value instanceof java.time.OffsetDateTime offset) {
      return offset.toInstant();
    }
    return null;
  }
}

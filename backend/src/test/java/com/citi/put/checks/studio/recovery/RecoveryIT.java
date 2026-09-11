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
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
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
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
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
@Testcontainers(disabledWithoutDocker = true)
class RecoveryIT {

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
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("Recovery draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
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
    manifests.put(derivedManifestKey(attemptId), manifest("PASSED", "STORED"));
    expire("run_deadline_at");

    runningReaper.reapOnce();

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status()).as("the real result, not STALE").isEqualTo("PASSED");
    assertThat(after.errorCode()).isNull();
    assertThat(after.video().status()).isEqualTo("AVAILABLE");
    assertThat(runner.sendCount()).as("no second run").isEqualTo(1);
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
    UUID second = studioService.executeTest(testId, owner, null).executionId();
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
    UUID second = studioService.executeTest(testId, owner, null).executionId();
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
    UUID second = studioService.executeTest(testId, owner, null).executionId();
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
    UUID second = studioService.executeTest(testId, owner, null).executionId();
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
    manifests.put(derivedManifestKey(attemptId), manifest("PASSED", "STORED"));
    runningReaper.reapOnce();
    assertThat(snapshot().status()).isEqualTo("PASSED");

    // After finalization: a manifest arriving now changes nothing.
    UUID second = studioService.executeTest(testId, owner, null).executionId();
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

    manifests.put(derivedManifestKey(second, secondAttempt), manifest("PASSED", "STORED"));
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
    manifests.put("studio/somewhere-the-runner-picked.result.json", manifest("PASSED", "STORED"));
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

  private void admit(UUID execution, UUID attemptId, UUID admissionId) {
    admissionService.claim(
        execution, new AdmissionRequest(execution, attemptId, RUNNER, admissionId, Map.of()));
  }

  private void expire(String column) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET " + column + " = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(1)),
        executionId);
  }

  private String derivedManifestKey(UUID attemptId) {
    return derivedManifestKey(executionId, attemptId);
  }

  private String derivedManifestKey(UUID execution, UUID attemptId) {
    return ManifestKeys.manifestKey(
        new ResultManifestStore.ExecutionIdentity(CSI_ID, testId, execution, attemptId));
  }

  private static ResultManifest manifest(String outcome, String evidenceState) {
    return new ResultManifest(
        outcome,
        null,
        null,
        Instant.parse("2026-09-10T10:00:02Z"),
        Instant.parse("2026-09-10T10:00:39Z"),
        null,
        evidenceState);
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
        null);
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
        null);
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
        new RunOutcome(result, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", evidenceState, false),
        null);
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

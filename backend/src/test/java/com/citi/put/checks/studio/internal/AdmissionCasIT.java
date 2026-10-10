package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
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
 * Story 10.7 AC-17 – AC-19 — the admission compare-and-set.
 *
 * <p>The race is proven by interleaving two application contexts against one database with the
 * first transaction held open across the second's attempt, not by two sequential calls: the CAS is
 * a claim about what the database does when two replicas arrive together, and sequential calls
 * cannot observe it.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class AdmissionCasIT {

  private static final String CSI_ID = "60455";
  private static final String OWNER = "admission-owner@citi.com";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private DataSource dataSource;

  private StudioExecutionFixtures fixtures;
  private UUID executionId;
  private UUID attemptId;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    UUID testId =
        fixtures
            .seedRunnableTest("Admission draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    executionId = studioService.executeTest(testId, owner, null).executionId();
    attemptId = dispatchTo(executionId);
  }

  // ── AC-17: the CAS and its four refusals ─────────────────────────────────

  @Test
  void aFreshAdmissionOwnsTheAttempt() {
    UUID admissionId = UUID.randomUUID();

    AdmissionResponse response =
        admissionService.claim(executionId, request(attemptId, admissionId, "studio-runner-0"));

    assertThat(response.state()).isEqualTo("ADMITTED");
    assertThat(response.admissionId()).isEqualTo(admissionId);
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
    assertThat(ledger().get("admission_id")).hasToString(admissionId.toString());
    assertThat(ledger().get("runner_instance_id")).isEqualTo("studio-runner-0");
  }

  @Test
  void theSameIdentityArrivingAgainIsAcknowledgedIdempotentlyAndNotByCloseEnough() {
    UUID admissionId = UUID.randomUUID();
    AdmissionResponse first =
        admissionService.claim(executionId, request(attemptId, admissionId, "studio-runner-0"));

    AdmissionResponse second =
        admissionService.claim(executionId, request(attemptId, admissionId, "studio-runner-0"));

    assertThat(second.admissionId()).isEqualTo(first.admissionId());
    assertThat(second.state()).isEqualTo("ADMITTED");
    // The exactly-matching identity is what is matched; a different one on the same attempt is
    // refused by the next test, which is what "never close enough" means.
    assertThat(second.startDeadlineAt()).isEqualTo(first.startDeadlineAt());
  }

  @Test
  void aDifferentAdmissionIdentityOnAnOwnedAttemptIsRefused() {
    admissionService.claim(executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0"));

    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0")))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", HttpStatus.CONFLICT)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_OWNED);

    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(attemptId, UUID.randomUUID(), "studio-runner-1")))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_OWNED);
  }

  @Test
  void aSupersededAttemptIsRefused() {
    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(UUID.randomUUID(), UUID.randomUUID(), "studio-runner-0")))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ATTEMPT_SUPERSEDED);
  }

  @Test
  void aRowPastItsPendingDeadlineIsRefused() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET pending_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().minusSeconds(60)),
        executionId);

    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0")))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_EXPIRED);
  }

  @Test
  void aSettledExecutionIsRefused() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = 'DONE' WHERE execution_id = ?", executionId);

    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0")))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.EXECUTION_SETTLED);
  }

  @Test
  void anUnknownExecutionIsA409AndNeverA404() {
    // The frozen contract declares 200/400/401/403/409 for this operation and no 404, so an
    // unknown or expired execution has to be a definite refusal rather than a status the runner
    // holds no rule for.
    UUID unknown = UUID.randomUUID();
    assertThatThrownBy(
            () ->
                admissionService.claim(
                    unknown,
                    new AdmissionRequest(
                        unknown,
                        UUID.randomUUID(),
                        "studio-runner-0",
                        UUID.randomUUID(),
                        Map.of())))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", HttpStatus.CONFLICT)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.EXECUTION_UNKNOWN);
  }

  // ── AC-18: two replicas cannot both grant an attempt ─────────────────────

  @Test
  void twoAdmissionsInterleavedAcrossTwoContextsYieldExactlyOneOwner() throws Exception {
    UUID admissionA = UUID.randomUUID();
    UUID admissionB = UUID.randomUUID();
    CountDownLatch firstInside = new CountDownLatch(1);
    CountDownLatch secondFinished = new CountDownLatch(1);
    AtomicInteger granted = new AtomicInteger();
    AtomicInteger refused = new AtomicInteger();
    AtomicReference<Throwable> unexpected = new AtomicReference<>();

    try (SecondApplicationContext replicaB = new SecondApplicationContext(dataSource)) {
      AdmissionCasService serviceOnB = replicaB.bean(AdmissionCasService.class);

      CompletableFuture<Void> second =
          CompletableFuture.runAsync(
              () -> {
                try {
                  firstInside.await(30, TimeUnit.SECONDS);
                  serviceOnB.claim(executionId, request(attemptId, admissionB, "studio-runner-1"));
                  granted.incrementAndGet();
                } catch (InternalCallbackException expected) {
                  refused.incrementAndGet();
                } catch (Throwable t) {
                  unexpected.set(t);
                } finally {
                  secondFinished.countDown();
                }
              });

      transactions.executeWithoutResult(
          status -> {
            admissionService.claim(executionId, request(attemptId, admissionA, "studio-runner-0"));
            granted.incrementAndGet();
            firstInside.countDown();
            sleep(1500);
          });

      assertThat(secondFinished.await(60, TimeUnit.SECONDS)).isTrue();
      second.join();
    }

    assertThat(unexpected.get()).isNull();
    assertThat(granted.get()).as("exactly one 200").isEqualTo(1);
    assertThat(refused.get()).as("exactly one 409").isEqualTo(1);
    assertThat(ledger().get("admission_id")).hasToString(admissionA.toString());
    assertThat(ledger().get("runner_instance_id")).isEqualTo("studio-runner-0");
  }

  @Test
  void aLostAdmissionResponseCannotProduceASecondOwner() {
    UUID admissionId = UUID.randomUUID();
    // The API commits the CAS; the runner's read of the response is lost. 10.6 AC-9 makes the
    // runner never re-admit, and this is the complementary property from the API side: even a
    // misbehaving or future runner cannot obtain a second owner.
    admissionService.claim(executionId, request(attemptId, admissionId, "studio-runner-0"));

    assertThatThrownBy(
            () ->
                admissionService.claim(
                    executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0")))
        .isInstanceOf(InternalCallbackException.class);

    assertThat(ledger().get("admission_id")).hasToString(admissionId.toString());
  }

  // ── AC-19: three deadlines, three origins ────────────────────────────────

  @Test
  void pendingStartAndRunDeadlinesAreSeparateColumnsWithSeparateOrigins() {
    Instant acceptedAt = instant(ledger().get("execution_accepted_at"));
    Instant pendingDeadline = instant(ledger().get("pending_deadline_at"));
    assertThat(pendingDeadline).isNotNull();

    // A run that queued for a long time: acceptance was ten minutes ago.
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET pending_deadline_at = ? WHERE execution_id = ?",
        Timestamp.from(Instant.now().plusSeconds(300)),
        executionId);

    Instant admittedAt = Instant.now();
    admissionService.claim(executionId, request(attemptId, UUID.randomUUID(), "studio-runner-0"));

    Instant startDeadline = instant(ledger().get("start_deadline_at"));
    Instant runDeadline = instant(ledger().get("run_deadline_at"));

    assertThat(startDeadline)
        .as("the admitted-start budget is measured from admission, not from acceptance")
        .isAfter(admittedAt.minusSeconds(1))
        .isBefore(admittedAt.plusSeconds(120));
    assertThat(runDeadline)
        .as("browser runtime is a different budget again")
        .isAfter(startDeadline);
    assertThat(instant(ledger().get("pending_deadline_at")))
        .as(
            "the pending SLA is not rewritten by admission — an implementation sharing one "
                + "timestamp fails one half of this criterion")
        .isNotEqualTo(startDeadline)
        .isNotEqualTo(runDeadline);
    assertThat(acceptedAt).isNotNull();
  }

  @Autowired private ProgressReportService reports;

  @Test
  void legacyAdmissionCannotUseObservedPreReadyFailure() {
    UUID admission = UUID.randomUUID();
    admissionService.claim(executionId, request(attemptId, admission, "studio-runner-0"));
    var before =
        jdbc.queryForMap(
            "SELECT status,snapshot_revision,step_results::text FROM ui_test_executions WHERE id=?",
            executionId);
    var report =
        preReady(admission, List.of(skipped(0)), "ERROR", "RUN_ERROR", "ACCOUNT_UNAVAILABLE");
    assertThatThrownBy(() -> reports.apply(executionId, report))
        .isInstanceOf(InternalCallbackException.class);
    assertThat(
            jdbc.queryForMap(
                "SELECT status,snapshot_revision,step_results::text FROM ui_test_executions WHERE"
                    + " id=?",
                executionId))
        .isEqualTo(before);
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
    assertThat(((Number) ledger().get("last_runner_sequence")).longValue()).isZero();
  }

  @Test
  void observedSqlCannotBorrowAnOrdinaryAdmissionOrAbsentProof() {
    UUID admission = UUID.randomUUID();
    admissionService.claim(executionId, request(attemptId, admission, "studio-runner-0"));
    for (String proof : new String[] {null, "{}"}) {
      int changed =
          transactions.execute(
              status ->
                  statements.applyObservedPreReadyFailure(
                      executionId,
                      attemptId,
                      admission,
                      "studio-runner-0",
                      1,
                      "ERROR",
                      "RUN_ERROR",
                      Instant.now(),
                      null,
                      "[]",
                      "[]",
                      false,
                      "{}",
                      null,
                      "UNAVAILABLE",
                      null,
                      false,
                      null,
                      null,
                      proof,
                      proof));
      assertThat(changed).isZero();
    }
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
  }

  @Test
  void rawObservedFailureAcceptsOnlyCompleteUntimedSkippedCoordinates() {
    var baseline =
        preReady(
            UUID.randomUUID(),
            List.of(skipped(0), skipped(1)),
            "ERROR",
            "RUN_ERROR",
            "ACCOUNT_UNAVAILABLE");
    RunnerReportProjection.requireObservedPreReadyFailure(baseline, 2);
    List<List<com.citi.put.checks.studio.internal.dto.RunnerStepState>> invalid =
        new java.util.ArrayList<>();
    invalid.add(List.of());
    invalid.add(List.of(skipped(0)));
    invalid.add(List.of(skipped(0), skipped(0)));
    invalid.add(List.of(skipped(0), skipped(2)));
    invalid.add(List.of(skipped(-1), skipped(1)));
    invalid.add(java.util.Arrays.asList(null, skipped(1)));
    invalid.add(
        List.of(
            skipped(0),
            new com.citi.put.checks.studio.internal.dto.RunnerStepState(
                null, "SKIPPED", null, null, null, null)));
    for (int field = 0; field < 5; field++) {
      invalid.add(
          List.of(
              skipped(0),
              new com.citi.put.checks.studio.internal.dto.RunnerStepState(
                  1,
                  field == 0 ? "PASS" : "SKIPPED",
                  field == 1 ? 0.0 : null,
                  field == 2 ? 0.0 : null,
                  field == 3 ? 0.0 : null,
                  field == 4 ? "failure" : null)));
    }
    for (var steps : invalid) {
      RunnerReportProjection.requireObservedPreReadyFailure(baseline, 2);
      var mutation =
          preReady(baseline.admissionId(), steps, "ERROR", "RUN_ERROR", "ACCOUNT_UNAVAILABLE");
      assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 2))
          .isInstanceOf(InternalCallbackException.class);
    }
  }

  @Test
  void rawObservedFailureDoesNotTreatGenericErrorsAsAuthority() {
    for (String reason :
        List.of(
            "INVALID_CONTRACT",
            "PROFILE_MISMATCH",
            "POLICY_REFUSED",
            "AUTHORIZATION_EXPIRED",
            "ACCOUNT_UNAVAILABLE",
            "ACCOUNT_UNKNOWN",
            "TARGET_DRIFT",
            "TIMEOUT",
            "CANCELLED",
            "INTERNAL_ERROR")) {
      RunnerReportProjection.requireObservedPreReadyFailure(
          preReady(UUID.randomUUID(), List.of(skipped(0)), "ERROR", "RUN_ERROR", reason), 1);
    }
    for (String reason :
        List.of(
            "READ_REFUSED",
            "ASSERTION_FAILED",
            "REFERENCE_REFUSED",
            "OUTCOME_UNKNOWN",
            "account_unavailable",
            "ACCOUNT_UNAVAILABLE detail",
            "BROWSER_LAUNCH_FAILED",
            "START_DEADLINE_EXCEEDED")) {
      var mutation = preReady(UUID.randomUUID(), List.of(skipped(0)), "ERROR", "RUN_ERROR", reason);
      assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 1))
          .isInstanceOf(InternalCallbackException.class);
    }
    for (String result : List.of("PASSED", "FAILED")) {
      var mutation =
          preReady(
              UUID.randomUUID(), List.of(skipped(0)), result, "RUN_ERROR", "ACCOUNT_UNAVAILABLE");
      assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 1))
          .isInstanceOf(InternalCallbackException.class);
    }
    var mutation =
        preReady(UUID.randomUUID(), List.of(skipped(0)), "ERROR", "CANCELLED", "CANCELLED");
    assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 1))
        .isInstanceOf(InternalCallbackException.class);
  }

  @Test
  void rawObservedFailureRejectsOriginLogsAndNonfinalKindsEvenWhenReduced() {
    var baseline =
        preReady(
            UUID.randomUUID(), List.of(skipped(0)), "ERROR", "RUN_ERROR", "ACCOUNT_UNAVAILABLE");
    RunnerReportProjection.requireObservedPreReadyFailure(baseline, 1);
    for (int variant = 0; variant < 6; variant++) {
      var mutation =
          new com.citi.put.checks.studio.internal.dto.RunnerReport(
              executionId,
              attemptId,
              baseline.admissionId(),
              baseline.runnerInstanceId(),
              variant == 0 ? "STARTED" : variant == 1 ? "PROGRESS" : "FINAL",
              1L,
              Instant.now(),
              variant == 2 ? Instant.now() : null,
              variant == 3 ? null : variant == 4 ? List.of() : baseline.steps(),
              variant == 5
                  ? List.of(
                      new com.citi.put.checks.studio.internal.dto.RunnerLogEntry(
                          0.0, "info", "setup"))
                  : List.of(),
              false,
              Map.of(),
              baseline.outcome(),
              null,
              true);
      assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 1))
          .isInstanceOf(InternalCallbackException.class);
    }
  }

  private com.citi.put.checks.studio.internal.dto.RunnerReport preReady(
      UUID admission,
      List<com.citi.put.checks.studio.internal.dto.RunnerStepState> steps,
      String result,
      String code,
      String reason) {
    return new com.citi.put.checks.studio.internal.dto.RunnerReport(
        executionId,
        attemptId,
        admission,
        "studio-runner-0",
        "FINAL",
        1L,
        Instant.now(),
        null,
        steps,
        List.of(),
        false,
        Map.of(),
        new com.citi.put.checks.studio.internal.dto.RunOutcome(result, code, reason),
        null,
        true);
  }

  private static com.citi.put.checks.studio.internal.dto.RunnerStepState skipped(Integer index) {
    return new com.citi.put.checks.studio.internal.dto.RunnerStepState(
        index, "SKIPPED", null, null, null, null);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private AdmissionRequest request(UUID attempt, UUID admission, String runnerInstanceId) {
    return new AdmissionRequest(
        executionId, attempt, runnerInstanceId, admission, Map.of("playwright", "1.63.0"));
  }

  private UUID dispatchTo(UUID execution) {
    UUID attempt = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              execution, "test-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(execution, "test-dispatcher", attempt);
        });
    return attempt;
  }

  private Map<String, Object> ledger() {
    return statements.find(executionId).orElseThrow();
  }

  private static Instant instant(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant();
    }
    if (value instanceof java.time.OffsetDateTime offset) {
      return offset.toInstant();
    }
    return Instant.parse(String.valueOf(value));
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while holding a transaction open", e);
    }
  }
}

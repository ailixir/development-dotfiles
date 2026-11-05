package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.7 AC-17 – AC-19 — the admission compare-and-set.
 *
 * <p>STUDIO-OBS-014 inherited obligation P1 (AR-3 b): the CAS is reached only through the observed
 * admission now. Old→new: 16 → 15 tests. {@code legacyAdmissionCannotUseObservedPreReadyFailure} is
 * dropped by name (its subject, the legacy admission, is deleted; covering case: {@code
 * StudioAuthorizationIT.theLegacyAdmissionRouteIsGoneAndWritesNothing}); {@code
 * anUnknownExecutionIsA409AndNeverA404} is renamed {@code anUnknownExecutionIsRefusedAndNeverA404};
 * the others keep their names.
 *
 * <p>The race is proven by interleaving two application contexts against one database with the
 * first transaction held open across the second's attempt, not by two sequential calls: the CAS is
 * a claim about what the database does when two replicas arrive together, and sequential calls
 * cannot observe it.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class AdmissionCasIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60455";
  private static final String OWNER = "admission-owner@citi.com";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private DataSource dataSource;
  @Autowired private ObservedReplayAuthorization observed;

  private StudioExecutionFixtures fixtures;
  private UUID executionId;
  private UUID attemptId;

  @BeforeEach
  void setUp() {
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    UUID testId =
        fixtures
            .seedRunnableTest("Admission draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    executionId =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    attemptId = dispatchTo(executionId);
  }

  // ── AC-17: the CAS and its four refusals ─────────────────────────────────
  //
  // STUDIO-OBS-014 inherited obligation P1 (AR-3 b): every case below was re-pointed from the
  // deleted legacy AdmissionCasService.claim() to the observed admission (prepareAdmission +
  // claimObserved), which is the only entry into the CAS. Where the observed path refuses before
  // the CAS, the recorded oracle is the observed refusal (S-7), and the ledger is unchanged.

  @Test
  void aFreshAdmissionOwnsTheAttempt() {
    UUID admissionId = UUID.randomUUID();

    JsonNode receipt = admit(admissionId, "studio-runner-0");

    assertThat(receipt.path("admissionId").asText()).isEqualTo(admissionId.toString());
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
    assertThat(ledger().get("admission_id")).hasToString(admissionId.toString());
    assertThat(ledger().get("runner_instance_id")).isEqualTo("studio-runner-0");
  }

  @Test
  void theSameIdentityArrivingAgainIsAcknowledgedIdempotentlyAndNotByCloseEnough() {
    UUID admissionId = UUID.randomUUID();
    JsonNode first = admit(admissionId, "studio-runner-0");

    JsonNode second = admit(admissionId, "studio-runner-0");

    assertThat(second).as("the identical receipt").isEqualTo(first);
    assertThat(second.path("admissionId").asText()).isEqualTo(admissionId.toString());
    assertThat(ledger().get("state")).isEqualTo("ADMITTED");
    // The exactly-matching identity is what is matched; a different one on the same attempt is
    // refused by the next test, which is what "never close enough" means.
    assertThat(second.path("startDeadlineAt")).isEqualTo(first.path("startDeadlineAt"));
  }

  @Test
  void aDifferentAdmissionIdentityOnAnOwnedAttemptIsRefused() {
    admit(UUID.randomUUID(), "studio-runner-0");

    assertThatThrownBy(() -> admit(UUID.randomUUID(), "studio-runner-0"))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("status", HttpStatus.CONFLICT)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_OWNED);

    assertThatThrownBy(() -> admit(UUID.randomUUID(), "studio-runner-1"))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_OWNED);
  }

  /**
   * A request carrying a stale attempt id. The observed path binds the attempt in {@code
   * prepareAdmission}, so it is refused there with {@code 403 FORBIDDEN_SCOPE}, before the CAS
   * (legacy oracle: {@code 409 ATTEMPT_SUPERSEDED} from the CAS).
   */
  @Test
  void aSupersededAttemptIsRefused() {
    Map<String, Object> before = ledger();
    ObjectNode request = request(UUID.randomUUID(), "studio-runner-0");
    request.put("attemptId", UUID.randomUUID().toString());

    assertThatThrownBy(() -> claim(executionId, request))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE")
        .satisfies(
            refusal -> assertThat(((GuidedSessionException) refusal).status()).isEqualTo(403));
    assertThat(ledger()).isEqualTo(before);
  }

  @Test
  void aRowPastItsPendingDeadlineIsRefused() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET pending_deadline_at = clock_timestamp() - interval"
            + " '60 seconds' WHERE execution_id = ?",
        executionId);

    assertThatThrownBy(() -> admit(UUID.randomUUID(), "studio-runner-0"))
        .isInstanceOf(InternalCallbackException.class)
        .hasFieldOrPropertyWithValue("code", InternalCallbackCodes.ADMISSION_EXPIRED);
    assertThat(ledger().get("admission_id")).isNull();
  }

  /**
   * A settled ledger row. The observed path refuses it before the CAS: {@code
   * ObservedReplayAuthorization.check} treats {@code state = 'DONE'} as cancelled, {@code 409
   * CANCELLED} (legacy oracle: {@code 409 EXECUTION_SETTLED} from the CAS). Recorded per AR-3 S-7.
   */
  @Test
  void aSettledExecutionIsRefused() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = 'DONE' WHERE execution_id = ?", executionId);

    assertThatThrownBy(() -> admit(UUID.randomUUID(), "studio-runner-0"))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("CANCELLED")
        .satisfies(
            refusal -> assertThat(((GuidedSessionException) refusal).status()).isEqualTo(409));
    assertThat(ledger().get("admission_id")).isNull();
  }

  /**
   * Renamed from {@code anUnknownExecutionIsA409AndNeverA404} (STUDIO-OBS-014 P1). An execution
   * with no observed binding is a definite refusal, {@code 403 FORBIDDEN_SCOPE}, and never a {@code
   * 404}, which the observed-admission contract does not declare.
   */
  @Test
  void anUnknownExecutionIsRefusedAndNeverA404() {
    UUID unknown = UUID.randomUUID();
    ObjectNode request = request(UUID.randomUUID(), "studio-runner-0");
    request.put("executionId", unknown.toString());

    assertThatThrownBy(() -> claim(unknown, request))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE")
        .satisfies(
            refusal -> assertThat(((GuidedSessionException) refusal).status()).isEqualTo(403));
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

    try (SecondApplicationContext replicaB = SecondApplicationContext.observed(dataSource)) {
      AdmissionCasService serviceOnB = replicaB.bean(AdmissionCasService.class);
      ObservedReplayAuthorization observedOnB = replicaB.bean(ObservedReplayAuthorization.class);
      // Both permits are prepared outside any transaction, as the controller does; the CAS under
      // claimObserved is what the two replicas race on.
      var permitA = observed.prepareAdmission(executionId, request(admissionA, "studio-runner-0"));
      var permitB =
          observedOnB.prepareAdmission(executionId, request(admissionB, "studio-runner-1"));

      CompletableFuture<Void> second =
          CompletableFuture.runAsync(
              () -> {
                try {
                  firstInside.await(30, TimeUnit.SECONDS);
                  serviceOnB.claimObserved(executionId, permitB);
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
            admissionService.claimObserved(executionId, permitA);
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
    admit(admissionId, "studio-runner-0");

    assertThatThrownBy(() -> admit(UUID.randomUUID(), "studio-runner-0"))
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
    admit(UUID.randomUUID(), "studio-runner-0");

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

  /**
   * Defence in depth on the SQL guard: an admission with no observed receipt cannot borrow the
   * observed pre-Ready failure statement. No route can produce that state since STUDIO-OBS-014 P1
   * deleted the legacy admission, so the setup builds it at the statement level (AR-3 b).
   */
  @Test
  void observedSqlCannotBorrowAnOrdinaryAdmissionOrAbsentProof() {
    UUID admission = UUID.randomUUID();
    Instant now = Instant.now();
    Integer admitted =
        transactions.execute(
            status ->
                statements.admit(
                    executionId,
                    attemptId,
                    admission,
                    "studio-runner-0",
                    now.plusSeconds(60),
                    now.plusSeconds(600),
                    now));
    assertThat(admitted).isEqualTo(1);
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

  /**
   * The three {@code rawObservedFailure*} cases were ported by name on 2026-10-13 (STUDIO-OBS-012A
   * AC-7): their valid baseline reason was {@code ACCOUNT_UNAVAILABLE}, which STUDIO-OBS-007
   * removed with the account machinery (story "Codes" table: {@code ACCOUNT_UNAVAILABLE}, {@code
   * ACCOUNT_UNKNOWN} removed from v3 and emitters; EXT-001 dropped). The baseline now uses {@code
   * REFERENCE_MISMATCH}, and the two removed codes are asserted refused.
   */
  @Test
  void rawObservedFailureAcceptsOnlyCompleteUntimedSkippedCoordinates() {
    var baseline =
        preReady(
            UUID.randomUUID(),
            List.of(skipped(0), skipped(1)),
            "ERROR",
            "RUN_ERROR",
            "REFERENCE_MISMATCH");
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
          preReady(baseline.admissionId(), steps, "ERROR", "RUN_ERROR", "REFERENCE_MISMATCH");
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
            "REFERENCE_MISMATCH",
            "PASSWORD_CONTROL_READ_REFUSED",
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
            "ACCOUNT_UNAVAILABLE",
            "ACCOUNT_UNKNOWN",
            "reference_mismatch",
            "REFERENCE_MISMATCH detail",
            "BROWSER_LAUNCH_FAILED",
            "START_DEADLINE_EXCEEDED")) {
      var mutation = preReady(UUID.randomUUID(), List.of(skipped(0)), "ERROR", "RUN_ERROR", reason);
      assertThatThrownBy(() -> RunnerReportProjection.requireObservedPreReadyFailure(mutation, 1))
          .isInstanceOf(InternalCallbackException.class);
    }
    for (String result : List.of("PASSED", "FAILED")) {
      var mutation =
          preReady(
              UUID.randomUUID(), List.of(skipped(0)), result, "RUN_ERROR", "REFERENCE_MISMATCH");
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
            UUID.randomUUID(), List.of(skipped(0)), "ERROR", "RUN_ERROR", "REFERENCE_MISMATCH");
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
              true,
              Map.of());
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
        new com.citi.put.checks.studio.internal.dto.RunOutcome(result, code, reason, null),
        null,
        true,
        Map.of());
  }

  private static com.citi.put.checks.studio.internal.dto.RunnerStepState skipped(Integer index) {
    return new com.citi.put.checks.studio.internal.dto.RunnerStepState(
        index, "SKIPPED", null, null, null, null);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** The v3 observed admission request the runner sends for this execution. */
  private ObjectNode request(UUID admission, String runnerInstanceId) {
    return ObservedPublicationFixture.observedAdmissionRequest(
        observed.binding(executionId).orElseThrow(), runnerInstanceId, admission);
  }

  /** Admits the way the runner does; returns the observed admission receipt. */
  private JsonNode admit(UUID admission, String runnerInstanceId) {
    return claim(executionId, request(admission, runnerInstanceId));
  }

  private JsonNode claim(UUID execution, JsonNode request) {
    return admissionService.claimObserved(execution, observed.prepareAdmission(execution, request));
  }

  /** Claims and begins the dispatch under the attempt the observed Run authority issued. */
  private UUID dispatchTo(UUID execution) {
    UUID attempt = ObservedPublicationFixture.bindingAttempt(observed, execution);
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

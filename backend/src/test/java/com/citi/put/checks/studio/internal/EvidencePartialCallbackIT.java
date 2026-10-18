package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.evidence.TestEvidenceStores;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.14 AC-10 (`DEF-02`) — the API accepts the {@code FINAL} the merged runner actually
 * sends.
 *
 * <p>Story 10.13 made {@code evidence.partial} non-optional inside the runner: {@code
 * runCoordinator.ts} declares {@code evidence} with {@code partial: false} before the {@code try}
 * and {@code sendFinal} takes it non-optionally, so <b>every</b> {@code FINAL} the merged runner
 * posts carries the property. The API's {@link
 * com.citi.put.checks.studio.internal.dto.RunnerEvidence} was a three-component record annotated
 * {@code @JsonIgnoreProperties(ignoreUnknown = false)}, read through {@link
 * StrictInternalBodyReader}'s mapper with {@code FAIL_ON_UNKNOWN_PROPERTIES} enabled — so the whole
 * report was refused {@code 400 INVALID_REPORT}, the terminal delivery retried until abandoned, and
 * the run was reconciled by a reaper instead of by its own result.
 *
 * <p>The assertion is deliberately made <b>on the route, over real HTTP, from bytes</b> rather than
 * on a hand-built {@code RunnerReport}: a typed record cannot reproduce the defect, because the
 * defect is in what the parser does with a property the record does not declare. Constructing the
 * body as a string is the only shape that can go red here (AC-23).
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "studio.execution.callback.service-token=partial-callback-token")
@ActiveProfiles("test")
@Import({TestEvidenceStores.class, ObservedPublicationFixture.FreshAuthority.class})
@Testcontainers(disabledWithoutDocker = true)
class EvidencePartialCallbackIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60461";
  private static final String OWNER = "partial-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";
  private static final String TOKEN = "partial-callback-token";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;

  @Autowired
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observedReplay;

  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;

  @LocalServerPort private int port;

  private final HttpClient http = HttpClient.newHttpClient();

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
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
    provision();
  }

  /**
   * A fresh accepted, dispatched and admitted execution.
   *
   * <p>Called again by any test that needs a second {@code FINAL}: a terminal report is write-once
   * and a second one on the same attempt is a {@code 409} by design (story 10.7 AC-21), so
   * "accepted" has to be decided on a run that has not already finalized or the assertion is about
   * the conflict rule instead.
   */
  private void provision() {
    UUID testId =
        fixtures
            .seedRunnableTest(
                "Partial evidence draft",
                CSI_ID,
                OWNER,
                List.of("Go to the home page", "Check the URL"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();
    // STUDIO-OBS-014 P1: dispatched under the attempt the observed Run authority issued and
    // admitted through the observed admission, as the runner does (legacy claim() deleted).
    UUID attempt = ObservedPublicationFixture.bindingAttempt(observedReplay, executionId);
    UUID execution = executionId;
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              execution, "test-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(execution, "test-dispatcher", attempt);
        });
    attemptId = attempt;
    admissionId = UUID.randomUUID();
    ObservedPublicationFixture.admitObserved(
        observedReplay, admissionService, executionId, RUNNER, admissionId);
  }

  /**
   * AC-10 — the body the merged runner emits is accepted.
   *
   * <p>Shown <b>red before the record was widened</b>: {@code 400} with {@code INVALID_REPORT} and
   * the parser's own message naming {@code partial} as an unrecognized field.
   */
  @Test
  void aFinalCarryingEvidencePartialIsAcceptedRatherThanRefused() {
    post(startedBody(1));

    HttpResponse<String> accepted =
        post(finalBody(2, "PASSED", null, "PENDING", true, StepResult.PASS));

    assertThat(accepted.statusCode())
        .as(
            "the merged runner emits evidence.partial on every FINAL; refusing it costs the whole"
                + " report, not just the field")
        .isEqualTo(200);
    assertThat(accepted.body()).doesNotContain("INVALID_REPORT");
  }

  /** The property is not merely tolerated — the report behind it is applied. */
  @Test
  void theAcceptedReportIsTheOneThatFinalizesTheExecution() {
    post(startedBody(1));

    assertThat(snapshot().status()).isEqualTo("RUNNING");

    assertThat(post(finalBody(2, "PASSED", null, "PENDING", false, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto after = snapshot();
    assertThat(after.status())
        .as("a refused FINAL leaves the row RUNNING and hands the execution to a reaper")
        .isEqualTo("PASSED");
  }

  /** A property the contract does not declare is still a {@code 400}: this widens one field. */
  @Test
  void anUndeclaredEvidencePropertyIsStillRefused() {
    post(startedBody(1));

    HttpResponse<String> refused =
        post(
            finalBody(2, "PASSED", null, "PENDING", true, StepResult.PASS)
                .replace("\"partial\":true", "\"partial\":true,\"salvaged\":true"));

    assertThat(refused.statusCode()).isEqualTo(400);
    assertThat(refused.body()).contains("INVALID_REPORT");
  }

  // ── AC-11: the reported value is projected, persisted and published ───────

  @Test
  void theReportedPartialIsPublishedAndPersistedRatherThanAConstant() {
    post(startedBody(1));
    assertThat(post(finalBody(2, "PASSED", null, "PENDING", true, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    assertThat(snapshot().video().partial())
        .as(
            "RunnerReportProjection wrote Boolean.FALSE unconditionally until O-13 landed, so every"
                + " execution the API had ever published said the recording was complete")
        .isTrue();
    assertThat(persistedVideoPartial()).isTrue();
  }

  @Test
  void aReportedFalseIsPublishedAsFalse() {
    post(startedBody(1));
    assertThat(post(finalBody(2, "PASSED", null, "PENDING", false, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    assertThat(snapshot().video().partial()).isFalse();
    assertThat(persistedVideoPartial()).isFalse();
  }

  @Test
  void anAbsentPartialIsPublishedAsFalse() {
    post(startedBody(1));
    // "Absent" is unreachable from the merged runner — it declares `partial` non-optionally — so
    // this is defence in depth against a future producer, and §17.5's stated default.
    String withoutPartial =
        finalBody(2, "PASSED", null, "PENDING", false, StepResult.PASS)
            .replace(",\"partial\":false", "");
    assertThat(withoutPartial).doesNotContain("partial");

    assertThat(post(withoutPartial).statusCode()).isEqualTo(200);
    assertThat(snapshot().video().partial()).isFalse();
    assertThat(persistedVideoPartial()).isFalse();
  }

  // ── AC-12: partial is never derived from the outcome, in either direction ─

  @Test
  void aDeadlineKillWhoseOrderedStopFlushedCleanlyPublishesTimeoutWithPartialFalse() {
    post(startedBody(1));
    // ADR-002 §17.3's first counter-example: the run ended badly, the recording did not.
    assertThat(
            post(finalBody(2, "ERROR", "TIMEOUT", "PENDING", false, StepResult.RUNNING))
                .statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto published = snapshot();
    assertThat(published.status()).isEqualTo("ERROR");
    assertThat(published.errorCode()).isEqualTo(ExecutionErrorCode.TIMEOUT);
    assertThat(published.video().partial())
        .as("videoPartial = \"TIMEOUT\".equals(errorCode) would make this true")
        .isFalse();
  }

  @Test
  void aPassedRunWhoseRecorderDiedPublishesPartialTrue() {
    post(startedBody(1));
    // The second counter-example: the run ended well, the recording did not.
    assertThat(post(finalBody(2, "PASSED", null, "PENDING", true, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto published = snapshot();
    assertThat(published.status()).isEqualTo("PASSED");
    assertThat(published.errorCode()).isNull();
    assertThat(published.video().partial())
        .as("an implementation deriving partial from errorCode would make this false")
        .isTrue();
  }

  @Test
  void noEvidenceFieldInfluencesTheStatusTheErrorCodeOrAnyStepStatus() {
    post(startedBody(1));
    assertThat(post(finalBody(2, "PASSED", null, "FAILED", false, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto published = snapshot();
    assertThat(published.status())
        .as("an upload failure never overwrites a known assertion outcome (§6.1)")
        .isEqualTo("PASSED");
    assertThat(published.errorCode()).isNull();
    assertThat(published.stepResults())
        .allSatisfy(step -> assertThat(step.status()).isEqualTo(StepResult.PASS));
    assertThat(published.video().status()).isEqualTo("FAILED");
  }

  // ── AC-13: partial: true with no object is refused, never coerced ─────────

  @Test
  void partialTrueAlongsideEvidenceThatDoesNotExistIsRefused() {
    post(startedBody(1));

    for (String state : List.of("FAILED", "UNAVAILABLE")) {
      HttpResponse<String> refused =
          post(finalBody(2, "PASSED", null, state, true, StepResult.PASS));

      assertThat(refused.statusCode())
          .as("a recording that does not exist is not a partial one (§17.3), state %s", state)
          .isEqualTo(400);
      assertThat(refused.body()).contains("INVALID_REPORT");
      assertThat(snapshot().status())
          .as("a silent coercion would have finalized the row instead")
          .isEqualTo("RUNNING");
    }
  }

  @Test
  void theThreeValidCombinationsAreAccepted() {
    for (String state : List.of("FAILED", "UNAVAILABLE")) {
      provision();
      post(startedBody(1));
      assertThat(post(finalBody(2, "PASSED", null, state, false, StepResult.PASS)).statusCode())
          .as("state %s with partial false is the valid pairing", state)
          .isEqualTo(200);
    }
    provision();
    post(startedBody(1));
    assertThat(post(finalBody(2, "PASSED", null, "STORED", true, StepResult.PASS)).statusCode())
        .as("a stored object may legitimately be a partial recording")
        .isEqualTo(200);
  }

  // ── AC-8 (API half): STORED → AVAILABLE, and only AVAILABLE gets an expiry ─

  @Test
  void anEndToEndStoredReportPublishesAvailableWithANonNullExpiryAndTheOthersGetNone() {
    post(startedBody(1));
    assertThat(post(finalBody(2, "PASSED", null, "STORED", false, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto stored = snapshot();
    assertThat(stored.video().status()).isEqualTo("AVAILABLE");
    assertThat(stored.video().expiresAt())
        .as("AVAILABLE is the API's judgment against retention, and the only state it stamps")
        .isNotNull();

    for (String state : List.of("FAILED", "UNAVAILABLE")) {
      provision();
      post(startedBody(1));
      assertThat(post(finalBody(2, "PASSED", null, state, false, StepResult.PASS)).statusCode())
          .isEqualTo(200);
      assertThat(snapshot().video().expiresAt()).as("no expiry for %s", state).isNull();
    }
  }

  // ── AC-14: the timed-out step's message, and the three negatives ──────────

  @Test
  void aTerminalTimeoutMeetingARunningStepReproducesTheContractsOwnExample() {
    post(startedBody(1));
    assertThat(
            post(finalBody(2, "ERROR", "TIMEOUT", "PENDING", true, StepResult.RUNNING))
                .statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto published = snapshot();
    assertThat(published.errorCode()).isEqualTo(ExecutionErrorCode.TIMEOUT);
    assertThat(published.video().partial()).isTrue();
    assertThat(published.stepResults().get(1).status()).isEqualTo(StepResult.RUNNING);
    assertThat(published.stepResults().get(1).message())
        .as("contract example SnapshotErrorTimeout, stepResults[1].message")
        .isEqualTo("Total browser runtime deadline reached");
    assertThat(published.stepResults().get(0).message())
        .as("the finished step is not given a cause it did not have")
        .isNull();
  }

  @Test
  void aTerminalErrorWithAnyOtherCodeInventsNoMessageForARunningStep() {
    post(startedBody(1));
    assertThat(
            post(finalBody(2, "ERROR", "RUN_ERROR", "PENDING", false, StepResult.RUNNING))
                .statusCode())
        .isEqualTo(200);

    ExecutionSnapshotDto published = snapshot();
    assertThat(published.errorCode())
        .as("an unmapped runner code is recorded in the diagnostic and never in error_code")
        .isNull();
    assertThat(published.stepResults()).allSatisfy(step -> assertThat(step.message()).isNull());
  }

  @Test
  void aTimeoutWithNoRunningStepProducesNoMessageAnywhere() {
    post(startedBody(1));
    assertThat(
            post(finalBody(2, "ERROR", "TIMEOUT", "PENDING", false, StepResult.PASS)).statusCode())
        .isEqualTo(200);

    assertThat(snapshot().errorCode()).isEqualTo(ExecutionErrorCode.TIMEOUT);
    assertThat(snapshot().stepResults()).allSatisfy(step -> assertThat(step.message()).isNull());
  }

  @Test
  void aRunnerSuppliedFailureOnARunningStepIsNeverOverwritten() {
    post(startedBody(1));
    String body =
        finalBody(2, "ERROR", "TIMEOUT", "PENDING", true, StepResult.RUNNING)
            .replace(
                "\"status\":\"RUNNING\",\"startedAtMs\":4400,\"finishedAtMs\":null,"
                    + "\"durationMs\":null,\"failure\":null",
                "\"status\":\"RUNNING\",\"startedAtMs\":4400,\"finishedAtMs\":null,"
                    + "\"durationMs\":null,\"failure\":\"the runner saw this itself\"");
    assertThat(body).contains("the runner saw this itself");

    assertThat(post(body).statusCode()).isEqualTo(200);

    assertThat(snapshot().stepResults().get(1).message())
        .as("the runner observed something and the API did not; the API does not overwrite it")
        .isEqualTo("the runner saw this itself");
  }

  private ExecutionSnapshotDto snapshot() {
    return studioService.findExecutionById(executionId, owner);
  }

  private String startedBody(long sequence) {
    return "{\"executionId\":\""
        + executionId
        + "\",\"attemptId\":\""
        + attemptId
        + "\",\"admissionId\":\""
        + admissionId
        + "\",\"runnerInstanceId\":\""
        + RUNNER
        + "\",\"kind\":\"STARTED\",\"runnerSequence\":"
        + sequence
        + ",\"reportedAt\":\"2026-09-10T10:00:03Z\","
        + "\"browserStartedAt\":\"2026-09-10T10:00:02Z\",\"steps\":[],"
        + "\"logs\":[{\"atMs\":0,\"level\":\"info\",\"message\":\"browser started\"}],"
        + "\"logsTruncated\":false,\"runtimeVersions\":{\"playwright\":\"1.63.0\"},"
        + "\"outcome\":null,\"evidence\":null}";
  }

  /**
   * The shape {@code snapshot.build} serializes, field for field and in its order.
   *
   * <p>Built as <b>text</b> rather than as a {@code RunnerReport} record on purpose. AC-12 and
   * AC-14 are about what the API does with a report, and the vacuity in that kind of test is never
   * in the assertion — it is in the input: a projection record constructed by hand can be made to
   * demonstrate anything. This is a body the runner's own serializer could produce, parsed by the
   * same {@link StrictInternalBodyReader} a real callback goes through.
   */
  private String finalBody(
      long sequence,
      String result,
      String errorCode,
      String evidenceState,
      boolean partial,
      String secondStepStatus) {
    boolean running = StepResult.RUNNING.equals(secondStepStatus);
    return "{\"executionId\":\""
        + executionId
        + "\",\"attemptId\":\""
        + attemptId
        + "\",\"admissionId\":\""
        + admissionId
        + "\",\"runnerInstanceId\":\""
        + RUNNER
        + "\",\"kind\":\"FINAL\",\"runnerSequence\":"
        + sequence
        + ",\"reportedAt\":\"2026-09-10T10:00:09Z\","
        + "\"browserStartedAt\":\"2026-09-10T10:00:02Z\","
        + "\"steps\":[{\"stepIndex\":0,\"status\":\"PASS\",\"startedAtMs\":120,"
        + "\"finishedAtMs\":4300,\"durationMs\":4180,\"failure\":null},"
        + "{\"stepIndex\":1,\"status\":\""
        + secondStepStatus
        + "\",\"startedAtMs\":4400,"
        + (running
            ? "\"finishedAtMs\":null,\"durationMs\":null,\"failure\":null}],"
            : "\"finishedAtMs\":5000,\"durationMs\":600,\"failure\":null}],")
        + "\"logs\":[{\"atMs\":0,\"level\":\"info\",\"message\":\"browser started\"}],"
        + "\"logsTruncated\":false,\"runtimeVersions\":{\"playwright\":\"1.63.0\"},"
        + "\"outcome\":{\"result\":\""
        + result
        + "\",\"errorCode\":"
        + (errorCode == null ? "null" : "\"" + errorCode + "\"")
        + ",\"errorMessage\":null},"
        + "\"evidence\":{\"videoKey\":\"studio/video.webm\","
        + "\"manifestKey\":\"studio/manifest.result.json\",\"state\":\""
        + evidenceState
        + "\",\"partial\":"
        + partial
        + "}}";
  }

  private Boolean persistedVideoPartial() {
    return jdbc.queryForObject(
        "SELECT video_partial FROM ui_test_executions WHERE id = ?", Boolean.class, executionId);
  }

  private HttpResponse<String> post(String body) {
    HttpRequest request =
        HttpRequest.newBuilder(
                URI.create(
                    "http://localhost:"
                        + port
                        + "/internal/studio/executions/"
                        + executionId
                        + "/progress"))
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + TOKEN)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
    try {
      return http.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (Exception e) {
      throw new AssertionError("the internal progress route could not be called", e);
    }
  }
}

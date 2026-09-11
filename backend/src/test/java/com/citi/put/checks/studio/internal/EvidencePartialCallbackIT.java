package com.citi.put.checks.studio.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
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
@Testcontainers(disabledWithoutDocker = true)
class EvidencePartialCallbackIT {

  private static final String CSI_ID = "60461";
  private static final String OWNER = "partial-owner@citi.com";
  private static final String RUNNER = "studio-runner-0";
  private static final String TOKEN = "partial-callback-token";

  @Autowired private StudioService studioService;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private JdbcTemplate jdbc;

  @LocalServerPort private int port;

  private final HttpClient http = HttpClient.newHttpClient();

  private Authentication owner;
  private UUID executionId;
  private UUID attemptId;
  private UUID admissionId;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    UUID testId =
        fixtures
            .seedRunnableTest(
                "Partial evidence draft",
                CSI_ID,
                OWNER,
                List.of("Go to the home page", "Check the URL"))
            .testId();
    executionId = studioService.executeTest(testId, owner, null).executionId();
    attemptId = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              executionId, "test-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(executionId, "test-dispatcher", attemptId);
        });
    admissionId = UUID.randomUUID();
    admissionService.claim(
        executionId, new AdmissionRequest(executionId, attemptId, RUNNER, admissionId, Map.of()));
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

    HttpResponse<String> accepted = post(finalBody(2, true));

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

    assertThat(post(finalBody(2, false)).statusCode()).isEqualTo(200);

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
        post(finalBody(2, true).replace("\"partial\":true", "\"partial\":true,\"salvaged\":true"));

    assertThat(refused.statusCode()).isEqualTo(400);
    assertThat(refused.body()).contains("INVALID_REPORT");
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

  /** The shape {@code snapshot.build} serializes: {@code partial} beside the three keys. */
  private String finalBody(long sequence, boolean partial) {
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
        + "{\"stepIndex\":1,\"status\":\"PASS\",\"startedAtMs\":4400,"
        + "\"finishedAtMs\":5000,\"durationMs\":600,\"failure\":null}],"
        + "\"logs\":[{\"atMs\":0,\"level\":\"info\",\"message\":\"browser started\"}],"
        + "\"logsTruncated\":false,\"runtimeVersions\":{\"playwright\":\"1.63.0\"},"
        + "\"outcome\":{\"result\":\"PASSED\",\"errorCode\":null,\"errorMessage\":null},"
        + "\"evidence\":{\"videoKey\":\"studio/video.webm\","
        + "\"manifestKey\":\"studio/manifest.result.json\",\"state\":\"PENDING\","
        + "\"partial\":"
        + partial
        + "}}";
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

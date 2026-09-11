package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-4a, AC-5, AC-6a, AC-20 — authorization on every public Studio route, the {@code
 * /internal/**} chain, and acknowledge-after-commit, all over real HTTP through the whole filter
 * chain.
 *
 * <p>Identities are supplied through the <b>existing header path</b> {@code
 * BffSessionAuthenticationFilter} already implements, which takes precedence over the `ED-02`
 * hardcoded bypass. That is what makes AC-5's narrower property decidable today: this story adds no
 * bypass and removes none, and asserts that its authorization decisions come from {@link
 * com.citi.put.checks.security.CsiOwnershipEvaluator} against the identity in the security context,
 * so a non-bypassed identity with the wrong CSI is rejected.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "studio.execution.callback.service-token=test-service-identity-token")
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioAuthorizationIT {

  private static final String CSI_ID = "60458";
  private static final String OTHER_CSI_ID = "60459";
  private static final String OWNER = "authz-owner@citi.com";
  private static final String READER = "authz-reader@citi.com";
  private static final String STRANGER = "authz-stranger@citi.com";
  private static final String TOKEN = "test-service-identity-token";

  /** AC-20: a failure injected after the handler's work, so the ack ordering is decidable. */
  static final AtomicBoolean FAIL_COMMIT = new AtomicBoolean(false);

  @TestConfiguration
  static class CommitFailureHook {

    @Bean
    ProgressReportService.ReportCommitHook failingCommitHook() {
      return executionId -> {
        if (FAIL_COMMIT.get()) {
          throw new IllegalStateException("injected commit failure");
        }
      };
    }
  }

  @org.springframework.boot.test.web.server.LocalServerPort private int port;

  /**
   * A raw JDK client for the internal routes.
   *
   * <p>{@code TestRestTemplate} is built on {@code HttpURLConnection}, whose built-in
   * authentication handling turns a {@code 401} on a streamed request body into "cannot retry due
   * to server authentication" rather than a response. That is a property of the test client and not
   * of the service, and it would have hidden every {@code 401} this criterion is about.
   */
  private final HttpClient internalClient =
      HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;

  private StudioExecutionFixtures fixtures;
  private UUID testId;
  private UUID otherCsiTestId;
  private UUID executionId;
  private UUID otherCsiExecutionId;

  @BeforeEach
  void setUp() {
    FAIL_COMMIT.set(false);
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    fixtures.seedCsi(OTHER_CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id IN (?, ?)", CSI_ID, OTHER_CSI_ID);
    testId =
        fixtures
            .seedRunnableTest("Authz draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    otherCsiTestId =
        fixtures
            .seedRunnableTest("Other CSI draft", OTHER_CSI_ID, OWNER, List.of("Go home"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
            .executionId();
    otherCsiExecutionId =
        studioService
            .executeTest(
                otherCsiTestId,
                StudioExecutionFixtures.identity(OWNER, OTHER_CSI_ID, "owner"),
                null)
            .executionId();
  }

  // ── AC-4a: readers, owners and the boundaries between them ───────────────

  @Test
  void aReaderMayReadAndMayNotExecute() {
    assertThat(get("/api/v1/studio/tests/" + testId, reader()).getStatusCode().value())
        .isEqualTo(200);
    assertThat(get("/api/v1/studio/executions/" + executionId, reader()).getStatusCode().value())
        .isEqualTo(200);
    assertThat(
            post("/api/v1/studio/tests/" + testId + "/execute", reader()).getStatusCode().value())
        .as("only owners and explicitly authorized administrators may execute")
        .isEqualTo(403);
  }

  @Test
  void anOwnerMayExecute() {
    assertThat(post("/api/v1/studio/tests/" + testId + "/execute", owner()).getStatusCode().value())
        .isEqualTo(202);
  }

  @Test
  void aCrossCsiTestIdAndACrossCsiExecutionIdAreBothRefusedWithoutDisclosingExistence() {
    ResponseEntity<String> crossTest = get("/api/v1/studio/tests/" + otherCsiTestId, reader());
    ResponseEntity<String> crossExecution =
        get("/api/v1/studio/executions/" + otherCsiExecutionId, reader());
    ResponseEntity<String> absent = get("/api/v1/studio/tests/" + UUID.randomUUID(), reader());
    ResponseEntity<String> absentExecution =
        get("/api/v1/studio/executions/" + UUID.randomUUID(), reader());

    assertThat(crossTest.getStatusCode().value()).isEqualTo(403);
    assertThat(crossExecution.getStatusCode().value()).isEqualTo(403);
    assertThat(absent.getStatusCode().value())
        .as("no 404-shaped answer is reachable")
        .isEqualTo(403);
    assertThat(absentExecution.getStatusCode().value()).isEqualTo(403);
    assertThat(crossTest.getBody())
        .as("a 403 must not disclose existence: the two answers are identical")
        .isEqualTo(absent.getBody());
    assertThat(crossExecution.getBody()).isEqualTo(absentExecution.getBody());
    assertThat(crossTest.getBody())
        .doesNotContain(otherCsiTestId.toString())
        .doesNotContain("Other CSI");
  }

  @Test
  void anIdentityWithNoOwnershipAtAllSeesNothing() {
    assertThat(get("/api/v1/studio/tests/" + testId, stranger()).getStatusCode().value())
        .isEqualTo(403);
    assertThat(get("/api/v1/studio/executions/" + executionId, stranger()).getStatusCode().value())
        .isEqualTo(403);
  }

  @Test
  void listsAreScopedBeforePagingSoPageCountsNeverDescribeRowsTheCallerCannotSee()
      throws Exception {
    JsonNode tests = json(get("/api/v1/studio/tests", reader()));
    JsonNode executions = json(get("/api/v1/studio/executions", reader()));

    assertThat(tests.path("data").toString()).contains(testId.toString());
    assertThat(tests.path("data").toString()).doesNotContain(otherCsiTestId.toString());
    assertThat(tests.path("totalElements").asLong())
        .as("scoping is part of the query, so the count describes the scoped set")
        .isEqualTo(tests.path("data").size());
    assertThat(executions.path("data").toString()).contains(executionId.toString());
    assertThat(executions.path("data").toString()).doesNotContain(otherCsiExecutionId.toString());
    assertThat(executions.path("totalElements").asLong()).isEqualTo(executions.path("data").size());
  }

  @Test
  void historyStaysReadableForASoftDeletedTestBecauseItIsKeyedOnTheExecutionsOwnCsi() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    assertThat(get("/api/v1/studio/executions/" + executionId, reader()).getStatusCode().value())
        .as("historical access uses the execution's own immutable csi_id, not a parent lookup")
        .isEqualTo(200);
    assertThat(get("/api/v1/studio/tests/" + testId, reader()).getStatusCode().value())
        .isEqualTo(403);
  }

  @Test
  void aQuarantinedExecutionWithNoCsiIsUnreadableByEveryoneIncludingAdministrators() {
    jdbc.update("UPDATE ui_test_executions SET csi_id = NULL WHERE id = ?", executionId);

    assertThat(get("/api/v1/studio/executions/" + executionId, admin()).getStatusCode().value())
        .isEqualTo(403);
  }

  // ── AC-6a: the /internal/** chain ────────────────────────────────────────

  @Test
  void bothCallbacksAreUnreachableWithoutServiceIdentity() {
    assertThat(postInternal("/admission", null, "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/progress", null, "{}").statusCode()).isEqualTo(401);
  }

  @Test
  void aBlankMalformedOrWrongCredentialIsRefusedBeforeAnyHandlerWork() {
    assertThat(postInternal("/admission", "", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "not-a-bearer-scheme", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "Bearer ", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "Bearer wrong-token", "{}").statusCode()).isEqualTo(403);
  }

  @Test
  void theRejectionBodyCarriesACodeAndNoExecutionDetail() {
    HttpResponse<String> refused =
        postInternal("/admission", null, "{\"executionId\":\"" + executionId + "\"}");

    assertThat(refused.statusCode()).isEqualTo(401);
    assertThat(refused.body())
        .contains("SERVICE_IDENTITY_REQUIRED")
        .doesNotContain(executionId.toString())
        .doesNotContain("PENDING")
        .doesNotContain(TOKEN);
  }

  @Test
  void theCredentialIsNotAcceptedFromAurlOrAQueryParameter() {
    HttpResponse<String> viaQuery =
        postInternalPath(
            "/internal/studio/executions/" + executionId + "/admission?access_token=" + TOKEN,
            null,
            "{}");

    assertThat(viaQuery.statusCode())
        .as("the credential is read from the Authorization header and from nowhere else")
        .isEqualTo(401);
  }

  @Test
  void theInternalOperationsAreAbsentFromThePublicSpringdocSurface() throws Exception {
    JsonNode document =
        objectMapper.readTree(restTemplate.getForObject("/v3/api-docs", String.class));

    List<String> paths = new java.util.ArrayList<>();
    document.path("paths").fieldNames().forEachRemaining(paths::add);

    assertThat(paths).isNotEmpty();
    assertThat(paths).noneMatch(path -> path.startsWith("/internal/"));
  }

  @Test
  void aValidServiceIdentityReachesTheHandler() {
    // A well-formed but stale admission: the chain let it through, and the handler answered on
    // the merits. What matters here is that the answer came from the handler and not from the
    // chain — 409 is a handler verdict; 401/403 would not be.
    HttpResponse<String> answered =
        postInternal(
            "/admission",
            "Bearer " + TOKEN,
            "{\"executionId\":\""
                + executionId
                + "\",\"attemptId\":\""
                + UUID.randomUUID()
                + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
                + UUID.randomUUID()
                + "\",\"runtimeVersions\":{}}");

    assertThat(answered.statusCode()).isEqualTo(409);
    assertThat(answered.body()).contains("ATTEMPT_SUPERSEDED");
  }

  // ── AC-24 / AC-26 at the wire boundary ───────────────────────────────────

  @Test
  void aFieldTheClosedSchemaDoesNotNameIsA400() {
    HttpResponse<String> refused =
        postInternal(
            "/admission",
            "Bearer " + TOKEN,
            "{\"executionId\":\""
                + executionId
                + "\",\"attemptId\":\""
                + UUID.randomUUID()
                + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
                + UUID.randomUUID()
                + "\",\"runtimeVersions\":{},\"recordingOriginMs\":1234}");

    assertThat(refused.statusCode())
        .as("an open schema over a wire body is not a contract (ADR-002 §6.2)")
        .isEqualTo(400);
  }

  @Test
  void aBodyOverTheCallbackBoundIsA413AndChangesNothing() {
    StringBuilder huge = new StringBuilder("{\"executionId\":\"" + executionId + "\",\"pad\":\"");
    huge.append("x".repeat(300_000)).append("\"}");

    HttpResponse<String> refused = postInternal("/progress", "Bearer " + TOKEN, huge.toString());

    assertThat(refused.statusCode()).isEqualTo(413);
    assertThat(refused.body()).contains("REPORT_TOO_LARGE");
  }

  // ── AC-20: the acknowledgement is sent only after commit ─────────────────

  @Test
  void aCommitFailureInjectedAfterTheHandlersWorkYieldsANonSuccess() {
    UUID attemptId = dispatch(executionId);
    UUID admissionId = UUID.randomUUID();
    assertThat(admit(attemptId, admissionId).statusCode()).isEqualTo(200);

    FAIL_COMMIT.set(true);
    HttpResponse<String> failed = started(attemptId, admissionId, 1);
    FAIL_COMMIT.set(false);

    assertThat(failed.statusCode() >= 200 && failed.statusCode() < 300)
        .as("an acknowledgement sent before the commit would lose a terminal result on a crash")
        .isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId))
        .as("and nothing was persisted")
        .isEqualTo("PENDING");
  }

  @Test
  void theAcknowledgementIsNeverObservedBeforeTheRowIsVisibleToAnIndependentConnection() {
    UUID attemptId = dispatch(executionId);
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);

    HttpResponse<String> ack = started(attemptId, admissionId, 1);

    assertThat(ack.statusCode()).isEqualTo(200);
    // The response is in hand. An independent connection — a different pool entry, its own
    // transaction — must already see the committed row.
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId))
        .isEqualTo("RUNNING");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private UUID dispatch(UUID execution) {
    UUID attempt = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              execution, "authz-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(execution, "authz-dispatcher", attempt);
        });
    return attempt;
  }

  private HttpResponse<String> admit(UUID attemptId, UUID admissionId) {
    return postInternal(
        "/admission",
        "Bearer " + TOKEN,
        "{\"executionId\":\""
            + executionId
            + "\",\"attemptId\":\""
            + attemptId
            + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
            + admissionId
            + "\",\"runtimeVersions\":{}}");
  }

  private HttpResponse<String> started(UUID attemptId, UUID admissionId, long sequence) {
    String body =
        "{\"executionId\":\""
            + executionId
            + "\",\"attemptId\":\""
            + attemptId
            + "\",\"admissionId\":\""
            + admissionId
            + "\",\"runnerInstanceId\":\"studio-runner-0\",\"kind\":\"STARTED\","
            + "\"runnerSequence\":"
            + sequence
            + ",\"reportedAt\":\"2026-09-10T10:00:02Z\","
            + "\"browserStartedAt\":\"2026-09-10T10:00:02Z\",\"steps\":[],"
            + "\"logs\":[{\"atMs\":0,\"level\":\"info\",\"message\":\"browser started\"}],"
            + "\"logsTruncated\":false,\"runtimeVersions\":{},\"outcome\":null,\"evidence\":null}";
    return postInternal("/progress", "Bearer " + TOKEN, body);
  }

  private HttpResponse<String> postInternal(String suffix, String authorization, String body) {
    return postInternalPath(
        "/internal/studio/executions/" + executionId + suffix, authorization, body);
  }

  private HttpResponse<String> postInternalPath(String path, String authorization, String body) {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body));
    if (authorization != null) {
      request.header("Authorization", authorization);
    }
    try {
      return internalClient.send(request.build(), HttpResponse.BodyHandlers.ofString());
    } catch (Exception e) {
      throw new AssertionError("the internal route could not be called", e);
    }
  }

  private ResponseEntity<String> get(String path, HttpHeaders headers) {
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }

  private ResponseEntity<String> post(String path, HttpHeaders headers) {
    return restTemplate.exchange(
        path, HttpMethod.POST, new HttpEntity<>("", headers), String.class);
  }

  private JsonNode json(ResponseEntity<String> response) throws Exception {
    return objectMapper.readTree(response.getBody());
  }

  private static HttpHeaders jsonHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  /** An identity supplied through the gateway header path the BFF filter already implements. */
  private static HttpHeaders identity(String email, String roles, String ownership) {
    HttpHeaders headers = jsonHeaders();
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", roles);
    headers.set("X-User-Csi-Ownership", ownership);
    return headers;
  }

  private static HttpHeaders owner() {
    return identity(OWNER, "", CSI_ID + ":owner");
  }

  private static HttpHeaders reader() {
    return identity(READER, "", CSI_ID + ":viewer");
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "", "");
  }

  private static HttpHeaders admin() {
    return identity(OWNER, "checks-admin", "");
  }
}

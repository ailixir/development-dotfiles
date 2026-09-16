package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.1 — the public surface over real HTTP: legacy bodies in, the frozen contract out.
 *
 * <p>Everything here goes through the whole filter, adapter and serialization chain, because that
 * is where the legacy shapes actually arrive and where the only rejection of an unsupported engine
 * happens.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioApiIT {

  private static final String OWNER = "api-owner@citi.com";
  private static final String CSI_ID = "60441";

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void aLegacyFlattenedCreateBodyIsAnsweredWithTheTypedContract() throws Exception {
    String legacy =
        """
        {"name":"Legacy created draft","description":"flattened body","csiId":"%s",
         "steps":"[\\"Go to the home page\\"]","variables":"[]","browser":"chrome",
         "viewportWidth":1280,"viewportHeight":720,"timeoutSeconds":45,
         "waitStrategy":"load","environment":"Production"}
        """
            .formatted(CSI_ID);

    ResponseEntity<String> response = post("/api/v1/studio/tests", legacy);

    assertThat(response.getStatusCode().value()).isEqualTo(201);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("steps").isArray()).isTrue();
    assertThat(body.path("steps").get(0).asText()).isEqualTo("Go to the home page");
    assertThat(body.path("configuration").path("browser").asText()).isEqualTo("chromium");
    assertThat(body.path("configuration").path("viewport").path("width").asInt()).isEqualTo(1280);
    assertThat(body.path("configuration").path("timeoutSeconds").asInt()).isEqualTo(45);
    assertThat(body.path("compileStatus").asText()).isEqualTo("STALE");
  }

  @Test
  void anUnsupportedEngineIsRejectedWithAMachineReadableCode() throws Exception {
    String firefox =
        """
        {"name":"Firefox draft","csiId":"%s","environment":"Production","steps":["Go home"],
         "variables":[],
         "configuration":{"browser":"firefox","viewport":{"width":1920,"height":1080},
                          "timeoutSeconds":30,"waitStrategy":"networkidle"}}
        """
            .formatted(CSI_ID);

    ResponseEntity<String> response = post("/api/v1/studio/tests", firefox);

    assertThat(response.getStatusCode().value()).isEqualTo(400);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("error").asText()).isEqualTo("INVALID_CONFIGURATION");
    assertThat(body.path("message").asText()).contains("chromium");
  }

  @Test
  void executeAcceptsTheRunAndTheSnapshotIsImmediatelyReadable() throws Exception {
    ResponseEntity<String> accepted = post("/api/v1/studio/tests/" + testId + "/execute", null);

    assertThat(accepted.getStatusCode().value()).isEqualTo(202);
    JsonNode acceptedBody = objectMapper.readTree(accepted.getBody());
    assertThat(acceptedBody.path("status").asText()).isEqualTo("PENDING");
    String executionId = acceptedBody.path("executionId").asText();

    ResponseEntity<String> snapshot = get("/api/v1/studio/executions/" + executionId);

    assertThat(snapshot.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(snapshot.getBody());
    assertThat(body.path("status").asText()).isEqualTo("PENDING");
    assertThat(body.path("csiId").asText()).isEqualTo(CSI_ID);
    assertThat(body.path("acceptedAt").isNull()).isFalse();
    assertThat(body.path("startedAt").isNull()).isTrue();
    assertThat(body.path("endedAt").isNull()).isTrue();
    assertThat(body.path("durationMs").isNull()).isTrue();
    assertThat(body.path("videoPath").isNull()).isTrue();
    assertThat(body.path("video").path("status").asText()).isEqualTo("PROCESSING");
    assertThat(body.path("streamComplete").asBoolean()).isFalse();
  }

  @Test
  void aRetriedExecuteWithTheSameKeyReturnsTheSameExecution() throws Exception {
    // The platform idempotency filter requires the header to be a UUID; see the contract.
    String key = UUID.randomUUID().toString();

    String first = executionIdOf(postWithIdempotencyKey(key));
    String retry = executionIdOf(postWithIdempotencyKey(key));

    assertThat(retry).isEqualTo(first);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(1);
  }

  @Test
  void aSoftDeletedDraftIsGoneFromReads() {
    ResponseEntity<String> deleted =
        restTemplate.exchange(
            "/api/v1/studio/tests/" + testId,
            HttpMethod.DELETE,
            new HttpEntity<>(headers()),
            String.class);

    assertThat(deleted.getStatusCode().value()).isEqualTo(204);
    // 403, not 400: story 10.7 AC-4a makes "you may not read this" and "it is not there"
    // indistinguishable on every per-id Studio read, because the pair of them is an existence
    // oracle. The frozen contract declares 400/401/403 on this route and no 404.
    assertThat(get("/api/v1/studio/tests/" + testId).getStatusCode().value()).isEqualTo(403);
  }

  @Test
  void variableValidationReadsTheTypedVariables() throws Exception {
    ResponseEntity<String> response =
        post("/api/v1/studio/tests/" + testId + "/validate-variables", "{}");

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("valid").asBoolean()).isTrue();
    assertThat(body.path("hasVariables").asBoolean()).isFalse();
  }

  @Test
  void stepValidationStillAnswersForTheEditor() throws Exception {
    ResponseEntity<String> response =
        post("/api/v1/studio/validate-steps", "{\"steps\":[\"Go to the home page\"]}");

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(objectMapper.readTree(response.getBody()).path("results").isArray()).isTrue();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private String executionIdOf(ResponseEntity<String> response) throws Exception {
    assertThat(response.getStatusCode().value()).isEqualTo(202);
    return objectMapper.readTree(response.getBody()).path("executionId").asText();
  }

  private ResponseEntity<String> postWithIdempotencyKey(String key) {
    HttpHeaders headers = headers();
    headers.set("Idempotency-Key", key);
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + testId + "/execute",
        HttpMethod.POST,
        new HttpEntity<>("", headers),
        String.class);
  }

  private ResponseEntity<String> post(String path, String body) {
    return restTemplate.exchange(
        path, HttpMethod.POST, new HttpEntity<>(body == null ? "" : body, headers()), String.class);
  }

  private ResponseEntity<String> get(String path) {
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers()), String.class);
  }

  /**
   * The caller these tests run as.
   *
   * <p><strong>This used to send no identity at all</strong>, and worked because {@code
   * BffSessionAuthenticationFilter.isCoreServiceBypassed()} returned a hardcoded {@code true} and
   * admitted every identity-less request as {@code platform-bypass} with {@code checks-admin} and
   * {@code platform-admin}. Story 10.18b closed that bypass by configuration (ED-02, AC-19a), so an
   * identity-less caller is now answered {@code 401} — which is what architecture §9.1 requires and
   * what seven of this class's assertions were quietly relying on not happening.
   *
   * <p>The identity is supplied by header, which the {@code test} profile permits and no deployed
   * profile does. The owner and CSI match the fixture below, so authorization resolves the same way
   * the bypass identity did — these tests are about the Studio API, not about who is calling it.
   */
  private static HttpHeaders headers() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "checks-admin");
    headers.set("X-User-Csi-Ownership", CSI_ID + ":owner");
    return headers;
  }

  /**
   * A compiled and confirmed draft. From story 10.7 onwards acceptance runs the readiness gate, so
   * an unconfirmed draft is {@code 409 COMPILE_REQUIRED} rather than an accepted run.
   */
  private UUID seedTest() {
    return new StudioExecutionFixtures(jdbc)
        .seedRunnableTest("Api draft", CSI_ID, OWNER, List.of("Go to the home page"))
        .testId();
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Api Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Api CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

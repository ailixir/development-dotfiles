package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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

/**
 * Story 10.4 AC-16 — optimistic concurrency on {@code PUT /tests/{id}}.
 *
 * <p>Two tabs that loaded the same draft and save at the same time must not silently merge: exactly
 * one save lands, the other is rejected with {@code 409 STALE_REVISION} and changes nothing.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class OptimisticSaveIT {

  private static final String OWNER = "bruno.buger@citi.com";
  private static final String CSI_ID = "60402";

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() throws Exception {
    seedUser();
    seedCsi();
    testId = createTest();
  }

  @Test
  void twoConcurrentSavesWithTheSameRevisionsLeaveExactlyOneWinner() throws Exception {
    CyclicBarrier barrier = new CyclicBarrier(2);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<ResponseEntity<String>>> results =
          pool.invokeAll(
              List.of(
                  save(barrier, "Click the login button"), save(barrier, "Open the dashboard")));

      List<Integer> statuses =
          List.of(
              results.get(0).get(30, TimeUnit.SECONDS).getStatusCode().value(),
              results.get(1).get(30, TimeUnit.SECONDS).getStatusCode().value());
      assertThat(statuses).containsExactlyInAnyOrder(200, 409);

      ResponseEntity<String> loser =
          statuses.get(0) == 409 ? results.get(0).get() : results.get(1).get();
      assertThat(objectMapper.readTree(loser.getBody()).path("error").asText())
          .isEqualTo("STALE_REVISION");

      // Exactly one increment landed; the losing body never reached the row.
      assertThat(sourceRevision()).isEqualTo(2L);
      ResponseEntity<String> winner =
          statuses.get(0) == 200 ? results.get(0).get() : results.get(1).get();
      // Steps are a typed array on the contract since 10.1, so the comparison is structural.
      JsonNode winningSteps = objectMapper.readTree(winner.getBody()).path("steps");
      assertThat(objectMapper.readTree(storedSteps()).get(0).asText())
          .isEqualTo(winningSteps.get(0).path("text").asText());
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void aSaveCarryingAnOlderRevisionIsRejectedWithoutChangingAnyField() throws Exception {
    put(body("Click the login button", 1L, 1L));
    String afterFirstSave = storedSteps();

    ResponseEntity<String> stale = put(body("A stale tab overwrite", 1L, 1L));

    assertThat(stale.getStatusCode().value()).isEqualTo(409);
    assertThat(objectMapper.readTree(stale.getBody()).path("error").asText())
        .isEqualTo("STALE_REVISION");
    assertThat(storedSteps()).isEqualTo(afterFirstSave);
    assertThat(sourceRevision()).isEqualTo(2L);
  }

  @Test
  void aSaveWithoutRevisionsIsRejected() throws Exception {
    String noRevisions =
        """
        {"authoringSchemaVersion":2,"name":"Draft","description":"d",
         "steps":[{"id":"00000000-0000-4000-8000-000000000001","text":"Only step"}],"variables":[],
         "configuration":{"browser":"chromium","viewport":{"width":1920,"height":1080},
         "timeoutSeconds":30,"waitStrategy":"networkidle"},"environment":"Production"}
        """;
    ResponseEntity<String> response = put(noRevisions);

    assertThat(response.getStatusCode().value()).isEqualTo(400);
    assertThat(objectMapper.readTree(response.getBody()).path("message").asText())
        .contains("sourceRevision");
  }

  private Callable<ResponseEntity<String>> save(CyclicBarrier barrier, String step) {
    return () -> {
      barrier.await(30, TimeUnit.SECONDS);
      return put(body(step, 1L, 1L));
    };
  }

  private ResponseEntity<String> put(String requestBody) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + testId,
        HttpMethod.PUT,
        new HttpEntity<>(requestBody, jsonHeaders()),
        String.class);
  }

  private String body(String step, long sourceRevision, long configurationRevision) {
    var body =
        objectMapper
            .createObjectNode()
            .put("authoringSchemaVersion", 2)
            .put("name", "Optimistic draft")
            .put("description", "concurrency")
            .put("csiId", CSI_ID)
            .put("environment", "Production")
            .put("sourceRevision", sourceRevision)
            .put("configurationRevision", configurationRevision);
    body.putArray("steps")
        .addObject()
        .put("id", "00000000-0000-4000-8000-000000000001")
        .put("text", step);
    body.putArray("variables");
    body.set(
        "configuration",
        objectMapper.valueToTree(com.citi.put.checks.studio.dto.TestConfiguration.defaults()));
    return body.toString();
  }

  private UUID createTest() throws Exception {
    String createBody = body("Go to the home page", 1, 1);
    ResponseEntity<String> created =
        restTemplate.exchange(
            "/api/v1/studio/tests",
            HttpMethod.POST,
            new HttpEntity<>(createBody, jsonHeaders()),
            String.class);
    assertThat(created.getStatusCode().value()).isEqualTo(201);
    JsonNode node = objectMapper.readTree(created.getBody());
    assertThat(node.path("sourceRevision").asLong()).isEqualTo(1L);
    assertThat(node.path("configurationRevision").asLong()).isEqualTo(1L);
    assertThat(node.path("readiness").asText()).isEqualTo("UNLEARNED");
    return UUID.fromString(node.path("id").asText());
  }

  private long sourceRevision() {
    return jdbc.queryForObject(
        "SELECT source_revision FROM ui_tests WHERE id = ?", Long.class, testId);
  }

  private String storedSteps() {
    return jdbc.queryForObject(
        "SELECT steps::text FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private static HttpHeaders jsonHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Bruno Buger', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Optimistic CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

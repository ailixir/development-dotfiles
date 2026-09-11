package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
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
 * Story 10.1 AC-14 — lists are scoped by CSI before they are paged.
 *
 * <p>Two properties are checked, and they are different properties. The first is that another CSI's
 * rows never appear. The second is that the scope is applied in the query rather than after paging:
 * {@code totalElements} must describe only what the caller may see, otherwise the page metadata
 * itself discloses that other CSIs have data.
 *
 * <p>History is scoped by the execution's own {@code csi_id}, never by the parent test's current
 * value: that is what keeps historical evidence attached to the CSI that produced it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioCsiScopingIT {

  private static final String OWNER = "scoping-owner@citi.com";
  private static final String MINE = "60431";
  private static final String THEIRS = "60432";

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;

  private UUID myTestId;
  private UUID theirTestId;
  private UUID myExecutionId;
  private UUID theirExecutionId;
  private UUID quarantinedExecutionId;

  @BeforeEach
  void setUp() {
    jdbc.update("DELETE FROM studio_dispatch_ledger");
    jdbc.update("DELETE FROM ui_test_executions");
    jdbc.update("DELETE FROM ui_tests WHERE csi_id IN (?, ?)", MINE, THEIRS);
    seedUser();
    seedCsi(MINE, "Mine");
    seedCsi(THEIRS, "Theirs");
    myTestId = seedTest("My draft", MINE);
    theirTestId = seedTest("Their draft", THEIRS);
    myExecutionId = seedExecution(myTestId, MINE, Instant.parse("2026-06-10T10:00:00Z"));
    theirExecutionId = seedExecution(theirTestId, THEIRS, Instant.parse("2026-06-10T11:00:00Z"));
    quarantinedExecutionId = seedExecution(myTestId, null, Instant.parse("2026-06-10T12:00:00Z"));
  }

  @Test
  void anUnfilteredTestListOnlyContainsTheCallersCsis() throws Exception {
    JsonNode page = get("/api/v1/studio/tests", MINE + ":viewer");

    assertThat(page.path("data").toString()).contains(myTestId.toString());
    assertThat(page.path("data").toString()).doesNotContain(theirTestId.toString());
    // Scoped before paging: the count describes the caller's world, not the database's.
    assertThat(page.path("totalElements").asLong()).isEqualTo(1L);
  }

  @Test
  void anUnfilteredHistoryListOnlyContainsTheCallersCsis() throws Exception {
    JsonNode page = get("/api/v1/studio/executions", MINE + ":viewer");

    assertThat(page.path("data").toString()).contains(myExecutionId.toString());
    assertThat(page.path("data").toString()).doesNotContain(theirExecutionId.toString());
    assertThat(page.path("totalElements").asLong()).isEqualTo(1L);
  }

  @Test
  void historyIsScopedByTheExecutionsOwnCsiNotTheParentTests() throws Exception {
    // The quarantined row belongs to a test in MINE but carries no CSI of its own.
    JsonNode page = get("/api/v1/studio/executions?testId=" + myTestId, MINE + ":viewer");

    assertThat(page.path("data").toString()).contains(myExecutionId.toString());
    assertThat(page.path("data").toString()).doesNotContain(quarantinedExecutionId.toString());
  }

  @Test
  void quarantinedHistoryIsInvisibleEvenToAnAdministrator() throws Exception {
    JsonNode page = getAsAdmin("/api/v1/studio/executions");

    assertThat(page.path("data").toString()).contains(myExecutionId.toString());
    assertThat(page.path("data").toString()).contains(theirExecutionId.toString());
    assertThat(page.path("data").toString()).doesNotContain(quarantinedExecutionId.toString());
  }

  @Test
  void aCallerWithNoReadableCsiSeesAnEmptyPageRatherThanEverything() throws Exception {
    JsonNode tests = get("/api/v1/studio/tests", "");
    JsonNode executions = get("/api/v1/studio/executions", "");

    assertThat(tests.path("totalElements").asLong()).isZero();
    assertThat(executions.path("totalElements").asLong()).isZero();
  }

  @Test
  void anExplicitCsiFilterCannotWidenTheScope() throws Exception {
    JsonNode page = get("/api/v1/studio/tests?csiId=" + THEIRS, MINE + ":viewer");

    assertThat(page.path("data").isArray()).isTrue();
    assertThat(page.path("totalElements").asLong()).isZero();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private JsonNode get(String path, String csiOwnership) throws Exception {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "viewer");
    headers.set("X-User-Csi-Ownership", csiOwnership);
    ResponseEntity<String> response =
        restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }

  private JsonNode getAsAdmin(String path) throws Exception {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "checks-admin");
    ResponseEntity<String> response =
        restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }

  private UUID seedExecution(UUID testId, String csiId, Instant acceptedAt) {
    UUID executionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, csi_id)"
            + " VALUES (?, ?, 'PASSED', ?, ?)",
        executionId,
        testId,
        Timestamp.from(acceptedAt),
        csiId);
    if (csiId != null) {
      jdbc.update(
          "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id,"
              + " csi_id, state) VALUES (?, ?, ?, ?, 'DONE')",
          executionId,
          Timestamp.from(acceptedAt),
          testId,
          csiId);
    }
    return executionId;
  }

  private UUID seedTest(String name, String csiId) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, ?, ?, 'Production', 'chromium',"
            + " CAST('[\"Go to the home page\"]' AS jsonb), CAST('[]' AS jsonb), 30,"
            + " 'networkidle', ?, ?, ?)",
        id,
        name,
        csiId,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Scoping Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String csiId, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        name,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

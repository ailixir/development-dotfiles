package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.support.ObservedPublicationFixture;
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

/**
 * Story 10.4 AC-3 and AC-14 — what a user can and cannot see.
 *
 * <p>Quarantined drafts (missing or unregistered CSI) and soft-deleted drafts are invisible on
 * every read path, but neither is removed: the rows and their revisions stay in the database, which
 * is the whole point of quarantining instead of deleting (BRD §9).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class StudioVisibilityIT {

  private static final String OWNER = "bruno.buger@citi.com";
  private static final String CSI_ID = "60407";

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired UITestRevisionRepository revisionRepository;

  private UUID visibleTestId;
  private UUID quarantinedTestId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    visibleTestId = seedTest("Visible draft");
    quarantinedTestId = seedTest("Quarantined draft");
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", quarantinedTestId);
  }

  @Test
  void quarantinedDraftsAreHiddenFromListAndGetButStayInTheDatabase() throws Exception {
    JsonNode list = objectMapper.readTree(get("/api/v1/studio/tests?csiId=" + CSI_ID).getBody());
    assertThat(list.path("data").toString()).contains(visibleTestId.toString());
    assertThat(list.path("data").toString()).doesNotContain(quarantinedTestId.toString());

    // 403, not 400: AC-4a makes a hidden draft indistinguishable from an unreadable one, so
    // neither status can be used to discover that a draft exists.
    assertThat(get("/api/v1/studio/tests/" + quarantinedTestId).getStatusCode().value())
        .isEqualTo(403);
    assertThat(get("/api/v1/studio/tests/" + visibleTestId).getStatusCode().value()).isEqualTo(200);

    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_tests WHERE id = ?", Integer.class, quarantinedTestId))
        .isEqualTo(1);
  }

  @Test
  void aSoftDeletedDraftDisappearsFromReadsWhileItsRevisionsRemainReadable() {
    UUID revisionId = publishCandidate();

    assertThat(delete("/api/v1/studio/tests/" + visibleTestId).getStatusCode().value())
        .isEqualTo(204);

    assertThat(get("/api/v1/studio/tests/" + visibleTestId).getStatusCode().value()).isEqualTo(403);
    assertThat(revisionRepository.findByIdAndTestId(revisionId, visibleTestId)).isPresent();
    assertThat(revisionRepository.findByTestIdOrderByCreatedAtDesc(visibleTestId)).hasSize(1);
  }

  @Test
  void executionHistoryStaysQueryableForAVisibleDraft() throws Exception {
    ResponseEntity<String> executions = get("/api/v1/studio/executions?testId=" + visibleTestId);

    assertThat(executions.getStatusCode().value()).isEqualTo(200);
    assertThat(objectMapper.readTree(executions.getBody()).path("data").isArray()).isTrue();
    // Story 10.1 AC-14 made testId optional: an unfiltered history request is now a scoped page,
    // not a 400. Scoping is by the execution's own CSI, so nothing widens here.
    ResponseEntity<String> unfiltered = get("/api/v1/studio/executions");
    assertThat(unfiltered.getStatusCode().value()).isEqualTo(200);
    assertThat(objectMapper.readTree(unfiltered.getBody()).path("data").isArray()).isTrue();
  }

  /** Publishes the visible draft as an observed revision (ADR-SC-005: the only family). */
  private UUID publishCandidate() {
    return new ObservedPublicationFixture(jdbc).publish(visibleTestId, List.of(), List.of());
  }

  private ResponseEntity<String> get(String path) {
    return restTemplate.exchange(
        path, HttpMethod.GET, new HttpEntity<>(jsonHeaders()), String.class);
  }

  private ResponseEntity<String> delete(String path) {
    return restTemplate.exchange(
        path, HttpMethod.DELETE, new HttpEntity<>(jsonHeaders()), String.class);
  }

  private static HttpHeaders jsonHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private UUID seedTest(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, ?, ?, 'Production', 'chromium',"
            + " CAST('[\"Go to the home page\"]' AS jsonb), CAST('[]' AS jsonb), 30,"
            + " 'networkidle', ?, ?, ?)",
        id,
        name,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    // Production has no implicit identity creation: a row without authoring is not a readable
    // draft.
    com.citi.put.checks.studio.support.CanonicalAuthoringFixture.seed(jdbc, id);
    return id;
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
            + " VALUES (?, 'Visibility CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

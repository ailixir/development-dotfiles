package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.support.ObservedPublicationFixture;
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
 * Story 10.4 AC-19 — a test cannot be moved between CSIs (Architecture §9.1, review P1-5).
 *
 * <p>Moving a test would move historical evidence with it: the revisions already recorded against
 * the original CSI must keep that CSI whatever the update body claims.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class CsiImmutabilityIT {

  private static final String OWNER = "bruno.buger@citi.com";
  private static final String CSI_ID = "60403";
  private static final String OTHER_CSI_ID = "60404";

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() throws Exception {
    seedUser();
    seedCsi(CSI_ID, "Owning CSI");
    seedCsi(OTHER_CSI_ID, "Other CSI");
    testId = createTest(CSI_ID);
  }

  @Test
  void rejectsAnUpdateThatPointsTheTestAtAnotherCsi() throws Exception {
    UUID revisionId = publishCandidate();

    ResponseEntity<String> response = put(body(OTHER_CSI_ID, 1L, 1L));

    assertThat(response.getStatusCode().value()).isEqualTo(409);
    assertThat(objectMapper.readTree(response.getBody()).path("error").asText())
        .isEqualTo("CSI_IMMUTABLE");
    assertThat(storedCsi()).isEqualTo(CSI_ID);
    assertThat(revisionCsi(revisionId)).isEqualTo(CSI_ID);
  }

  @Test
  void acceptsAnUpdateThatRepeatsOrOmitsTheOwningCsi() throws Exception {
    assertThat(put(body(CSI_ID, 1L, 1L)).getStatusCode().value()).isEqualTo(200);
    assertThat(put(body(null, 2L, 1L)).getStatusCode().value()).isEqualTo(200);
    assertThat(storedCsi()).isEqualTo(CSI_ID);
  }

  @Test
  void rejectsCreationWithoutARegisteredCsi() {
    assertThat(createResponse("99999").getStatusCode().value()).isEqualTo(400);
    assertThat(createResponse(null).getStatusCode().value()).isEqualTo(400);
  }

  /** Publishes the draft as an observed revision (ADR-SC-005: the only family). */
  private UUID publishCandidate() {
    return new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
  }

  private ResponseEntity<String> put(String requestBody) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + testId,
        HttpMethod.PUT,
        new HttpEntity<>(requestBody, jsonHeaders()),
        String.class);
  }

  private String body(String csiId, long sourceRevision, long configurationRevision) {
    var body =
        objectMapper
            .createObjectNode()
            .put("authoringSchemaVersion", 2)
            .put("name", "CSI bound draft")
            .put("description", "immutable csi")
            .put("environment", "Production")
            .put("sourceRevision", sourceRevision)
            .put("configurationRevision", configurationRevision);
    if (csiId != null) {
      body.put("csiId", csiId);
    }
    body.putArray("steps")
        .addObject()
        .put("id", "00000000-0000-4000-8000-000000000001")
        .put("text", "Go to the home page " + sourceRevision);
    body.putArray("variables");
    body.set(
        "configuration",
        objectMapper.valueToTree(com.citi.put.checks.studio.dto.TestConfiguration.defaults()));
    return body.toString();
  }

  private UUID createTest(String csiId) throws Exception {
    ResponseEntity<String> created = createResponse(csiId);
    assertThat(created.getStatusCode().value()).isEqualTo(201);
    return UUID.fromString(objectMapper.readTree(created.getBody()).path("id").asText());
  }

  private ResponseEntity<String> createResponse(String csiId) {
    String createBody = body(csiId, 1, 1).replace("home page 1", "home page");
    return restTemplate.exchange(
        "/api/v1/studio/tests",
        HttpMethod.POST,
        new HttpEntity<>(createBody, jsonHeaders()),
        String.class);
  }

  private String storedCsi() {
    return jdbc.queryForObject("SELECT csi_id FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private String revisionCsi(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT csi_id FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
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

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

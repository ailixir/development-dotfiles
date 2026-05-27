package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ScheduleCrudIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UUID checkId;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    seedUser("sched-owner@citi.com");
    seedCsi("50001", "Schedule CSI");
    checkId = seedCheck("50001", "sched-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "sched-user",
          "email": "sched-owner@citi.com",
          "name": "Schedule Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "50001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void createReadUpdateDelete() throws Exception {
    String createBody =
        """
        {
          "checkId": "%s",
          "frequency": "every_5_min",
          "cronExpression": "0 */5 * * * *",
          "timezone": "UTC",
          "enabled": true
        }
        """
            .formatted(checkId);

    // CREATE
    ResponseEntity<String> createResp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(createBody, authHeaders("sched-create")),
            String.class);
    assertThat(createResp.getStatusCode().value()).isEqualTo(201);
    assertThat(createResp.getHeaders().getLocation()).isNotNull();
    JsonNode created = objectMapper.readTree(createResp.getBody());
    String scheduleId = created.path("id").asText();
    assertThat(created.path("cronExpression").asText()).isEqualTo("0 */5 * * * *");
    assertThat(created.path("timezone").asText()).isEqualTo("UTC");
    assertThat(created.path("enabled").asBoolean()).isTrue();
    assertThat(created.path("nextExecutionAt").asText()).isNotEmpty();

    // READ
    ResponseEntity<String> readResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("sched-read")),
            String.class);
    assertThat(readResp.getStatusCode().value()).isEqualTo(200);
    JsonNode read = objectMapper.readTree(readResp.getBody());
    assertThat(read.path("cronExpression").asText()).isEqualTo("0 */5 * * * *");

    // UPDATE
    String updateBody =
        """
        {
          "checkId": "%s",
          "frequency": "every_10_min",
          "cronExpression": "0 */10 * * * *",
          "timezone": "America/New_York",
          "enabled": true
        }
        """
            .formatted(checkId);
    ResponseEntity<String> updateResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.PUT,
            new HttpEntity<>(updateBody, authHeaders("sched-update")),
            String.class);
    assertThat(updateResp.getStatusCode().value()).isEqualTo(200);
    JsonNode updated = objectMapper.readTree(updateResp.getBody());
    assertThat(updated.path("cronExpression").asText()).isEqualTo("0 */10 * * * *");
    assertThat(updated.path("timezone").asText()).isEqualTo("America/New_York");

    // DELETE
    ResponseEntity<String> deleteResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.DELETE,
            new HttpEntity<>(authHeaders("sched-delete")),
            String.class);
    assertThat(deleteResp.getStatusCode().value()).isEqualTo(204);

    // Verify deleted: GET returns 404
    ResponseEntity<String> afterDelete =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("sched-after-del")),
            String.class);
    assertThat(afterDelete.getStatusCode().value()).isEqualTo(404);
  }

  @Test
  void listWithFilters() throws Exception {
    UUID check2 = seedCheck("50001", "sched-owner@citi.com");
    createSchedule(checkId, "0 */5 * * * *", "UTC");
    createSchedule(check2, "0 0 0 * * *", "Europe/London");

    ResponseEntity<String> listResp =
        restTemplate.exchange(
            "/api/v1/schedules?timezone=UTC",
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("sched-list")),
            String.class);
    assertThat(listResp.getStatusCode().value()).isEqualTo(200);
    JsonNode list = objectMapper.readTree(listResp.getBody());
    assertThat(list.path("data").isArray()).isTrue();
    assertThat(list.path("totalElements").asInt()).isGreaterThanOrEqualTo(1);
  }

  private void createSchedule(UUID forCheckId, String cron, String tz) {
    String body =
        """
        {
          "checkId": "%s",
          "frequency": "custom",
          "cronExpression": "%s",
          "timezone": "%s",
          "enabled": true
        }
        """
            .formatted(forCheckId, cron, tz);
    restTemplate.exchange(
        "/api/v1/schedules",
        HttpMethod.POST,
        new HttpEntity<>(body, authHeaders("sched-seed")),
        String.class);
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'sched-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedCheck(String csiId, String createdBy) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'Test Check', 'HTTP', ?, 'Test CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com\"}'::jsonb,"
            + " ?, ?, ?)",
        id,
        csiId,
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private HttpHeaders authHeaders(String cookie) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }
}

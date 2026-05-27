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
class ScheduleEmbedIT {

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
    seedUser("embed-owner@citi.com");
    seedCsi("54001", "Embed CSI");
    checkId = seedCheck("54001", "embed-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "embed-user",
          "email": "embed-owner@citi.com",
          "name": "Embed Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "54001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void getCheckIncludesScheduleWhenPresent() throws Exception {
    // Create a schedule for the check
    String scheduleBody =
        """
        {
          "checkId": "%s",
          "frequency": "daily",
          "cronExpression": "0 0 9 * * *",
          "timezone": "America/Sao_Paulo",
          "enabled": true
        }
        """
            .formatted(checkId);

    ResponseEntity<String> createResp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(scheduleBody, authHeaders("embed-create")),
            String.class);
    assertThat(createResp.getStatusCode().value()).isEqualTo(201);

    // Now GET /checks/{id} should embed the schedule
    ResponseEntity<String> checkResp =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("embed-read")),
            String.class);
    assertThat(checkResp.getStatusCode().value()).isEqualTo(200);

    JsonNode checkJson = objectMapper.readTree(checkResp.getBody());
    assertThat(checkJson.has("schedule")).isTrue();
    JsonNode schedule = checkJson.path("schedule");
    assertThat(schedule.path("cronExpression").asText()).isEqualTo("0 0 9 * * *");
    assertThat(schedule.path("timezone").asText()).isEqualTo("America/Sao_Paulo");
    assertThat(schedule.path("enabled").asBoolean()).isTrue();
  }

  @Test
  void getCheckReturnsNullScheduleWhenAbsent() throws Exception {
    UUID checkWithoutSchedule = seedCheck("54001", "embed-owner@citi.com");

    ResponseEntity<String> checkResp =
        restTemplate.exchange(
            "/api/v1/checks/" + checkWithoutSchedule,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("embed-no-sched")),
            String.class);
    assertThat(checkResp.getStatusCode().value()).isEqualTo(200);

    JsonNode checkJson = objectMapper.readTree(checkResp.getBody());
    assertThat(checkJson.has("schedule")).isFalse();
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'embed-owner@citi.com', 'Production',"
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
            + " VALUES (?, 'Embed Check', 'HTTP', ?, 'Embed CSI', 'PENDING',"
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

package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

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
class ScheduleValidationIT {

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
    seedUser("val-owner@citi.com");
    seedCsi("52001", "Validation CSI");
    checkId = seedCheck("52001", "val-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "val-user",
          "email": "val-owner@citi.com",
          "name": "Validation Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "52001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void badCronReturns400() {
    String body =
        """
        {
          "checkId": "%s",
          "frequency": "custom",
          "cronExpression": "not-a-cron",
          "timezone": "UTC",
          "enabled": true
        }
        """
            .formatted(checkId);

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(body, authHeaders("val-bad-cron")),
            String.class);
    assertThat(resp.getStatusCode().value()).isEqualTo(400);
  }

  @Test
  void badTimezoneReturns400() {
    String body =
        """
        {
          "checkId": "%s",
          "frequency": "hourly",
          "cronExpression": "0 0 * * * *",
          "timezone": "Mars/Olympus",
          "enabled": true
        }
        """
            .formatted(checkId);

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(body, authHeaders("val-bad-tz")),
            String.class);
    assertThat(resp.getStatusCode().value()).isEqualTo(400);
  }

  @Test
  void duplicateCheckIdReturns409() throws Exception {
    String body =
        """
        {
          "checkId": "%s",
          "frequency": "hourly",
          "cronExpression": "0 0 * * * *",
          "timezone": "UTC",
          "enabled": true
        }
        """
            .formatted(checkId);

    // First create succeeds
    ResponseEntity<String> first =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(body, authHeaders("val-dup-1")),
            String.class);
    assertThat(first.getStatusCode().value()).isEqualTo(201);

    // Second create with same check_id → 409
    ResponseEntity<String> second =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(body, authHeaders("val-dup-2")),
            String.class);
    assertThat(second.getStatusCode().value()).isEqualTo(409);
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'val-owner@citi.com', 'Production',"
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
            + " VALUES (?, 'Val Check', 'HTTP', ?, 'Val CSI', 'PENDING',"
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

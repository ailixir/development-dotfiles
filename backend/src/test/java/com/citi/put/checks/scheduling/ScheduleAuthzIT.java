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
class ScheduleAuthzIT {

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
    seedUser("authz-owner@citi.com");
    seedUser("authz-other@citi.com");
    seedCsi("53001", "Authz CSI");
    checkId = seedCheck("53001", "authz-owner@citi.com");
  }

  @Test
  void nonOwnerCannotCreateSchedule() {
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "other-user",
          "email": "authz-other@citi.com",
          "name": "Other User",
          "roles": [],
          "csi_ownership": [{"csi_id": "99999", "role": "viewer"}]
        }
        """)));

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

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(body, authHeaders("authz-denied")),
            String.class);
    assertThat(resp.getStatusCode().value()).isEqualTo(403);
  }

  @Test
  void viewerCannotModifySchedule() throws Exception {
    // First, create as admin
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "authz-owner",
          "email": "authz-owner@citi.com",
          "name": "Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "53001", "role": "owner"}]
        }
        """)));

    String createBody =
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
    ResponseEntity<String> createResp =
        restTemplate.exchange(
            "/api/v1/schedules",
            HttpMethod.POST,
            new HttpEntity<>(createBody, authHeaders("authz-create")),
            String.class);
    assertThat(createResp.getStatusCode().value()).isEqualTo(201);
    String scheduleId = objectMapper.readTree(createResp.getBody()).path("id").asText();

    // Now switch to viewer
    wireMock.resetAll();
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "viewer-user",
          "email": "authz-other@citi.com",
          "name": "Viewer",
          "roles": [],
          "csi_ownership": [{"csi_id": "53001", "role": "viewer"}]
        }
        """)));

    // Viewer can read
    ResponseEntity<String> readResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("authz-viewer-read")),
            String.class);
    assertThat(readResp.getStatusCode().value()).isEqualTo(200);

    // Viewer cannot delete
    ResponseEntity<String> deleteResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId,
            HttpMethod.DELETE,
            new HttpEntity<>(authHeaders("authz-viewer-delete")),
            String.class);
    assertThat(deleteResp.getStatusCode().value()).isEqualTo(403);
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'authz-owner@citi.com', 'Production',"
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
            + " VALUES (?, 'Authz Check', 'HTTP', ?, 'Authz CSI', 'PENDING',"
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

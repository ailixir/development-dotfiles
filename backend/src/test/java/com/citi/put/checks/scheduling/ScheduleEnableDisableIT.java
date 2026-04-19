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
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ScheduleEnableDisableIT {

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
    restTemplate.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
    wireMock.resetAll();
    seedUser("enable-owner@citi.com");
    seedCsi("51001", "Enable CSI");
    checkId = seedCheck("51001", "enable-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "enable-user",
          "email": "enable-owner@citi.com",
          "name": "Enable Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "51001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void toggleEnabled() throws Exception {
    // Create enabled schedule
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
            new HttpEntity<>(createBody, authHeaders("enable-create")),
            String.class);
    assertThat(createResp.getStatusCode().value()).isEqualTo(201);
    JsonNode created = objectMapper.readTree(createResp.getBody());
    String scheduleId = created.path("id").asText();
    assertThat(created.path("enabled").asBoolean()).isTrue();

    // Disable
    ResponseEntity<String> disableResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId + "/enabled",
            HttpMethod.PATCH,
            new HttpEntity<>("{\"enabled\": false}", authHeaders("enable-disable")),
            String.class);
    assertThat(disableResp.getStatusCode().value()).isEqualTo(200);
    JsonNode disabled = objectMapper.readTree(disableResp.getBody());
    assertThat(disabled.path("enabled").asBoolean()).isFalse();

    // Re-enable
    ResponseEntity<String> enableResp =
        restTemplate.exchange(
            "/api/v1/schedules/" + scheduleId + "/enabled",
            HttpMethod.PATCH,
            new HttpEntity<>("{\"enabled\": true}", authHeaders("enable-reenable")),
            String.class);
    assertThat(enableResp.getStatusCode().value()).isEqualTo(200);
    JsonNode reenabled = objectMapper.readTree(enableResp.getBody());
    assertThat(reenabled.path("enabled").asBoolean()).isTrue();
    assertThat(reenabled.path("nextExecutionAt").asText()).isNotEmpty();
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'enable-owner@citi.com', 'Production',"
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
            + " VALUES (?, 'Enable Check', 'HTTP', ?, 'Enable CSI', 'PENDING',"
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

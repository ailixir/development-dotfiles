package com.citi.put.checks.csi;

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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class CsiListIT {

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

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    seedUser("owner@citi.com");
    stubIdentity("[\"checks-admin\"]", "[{\"csi_id\": \"10001\", \"role\": \"owner\"}]");
  }

  private void stubIdentity(String rolesJson, String csiOwnershipJson) {
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "csi-list-user",
          "email": "csilist@citi.com",
          "name": "CSI Lister",
          "roles": %s,
          "csi_ownership": %s
        }
        """
                        .formatted(rolesJson, csiOwnershipJson))));
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        "Test User",
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name, String bu, String env, String status) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, ?, 'HIGH', 'owner@citi.com', ?, ?, ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        bu,
        env,
        status,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void listReturnsPagedResults() throws Exception {
    seedCsi("10001", "System A", "Ops", "Production", "OPERATIONAL");
    seedCsi("10002", "System B", "Ops", "Staging", "OPERATIONAL");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=csi-list-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi?size=10", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("data").isArray()).isTrue();
    assertThat(body.path("totalElements").asInt()).isGreaterThanOrEqualTo(2);
  }

  @Test
  void temporaryCsiReadBypassListsCsiWithoutOwnership() throws Exception {
    wireMock.resetAll();
    stubIdentity("[\"checks-operator\"]", "[]");
    seedCsi("10007", "Bypass Visible CSI", "Ops", "Production", "OPERATIONAL");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=csi-read-bypass-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi?search=Bypass", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("totalElements").asInt()).isGreaterThanOrEqualTo(1);

    ResponseEntity<String> directResponse =
        restTemplate.exchange(
            "/api/v1/csi/10007", HttpMethod.GET, new HttpEntity<>(headers), String.class);
    assertThat(directResponse.getStatusCode().value()).isEqualTo(200);
    JsonNode directBody = objectMapper.readTree(directResponse.getBody());
    assertThat(directBody.path("id").asText()).isEqualTo("10007");
  }

  @Test
  void filterByEnvironment() throws Exception {
    seedCsi("10003", "Prod System", "Eng", "Production", "OPERATIONAL");
    seedCsi("10004", "Dev System", "Eng", "Development", "OPERATIONAL");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=csi-list-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi?environment=Production",
            HttpMethod.GET,
            new HttpEntity<>(headers),
            String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    for (JsonNode item : body.path("data")) {
      assertThat(item.path("environment").asText()).isEqualTo("Production");
    }
  }

  @Test
  void softDeletedCsiExcludedFromList() throws Exception {
    seedCsi("10005", "Active CSI", "Ops", "Production", "OPERATIONAL");
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at, deleted_at)"
            + " VALUES ('10006', 'Deleted CSI', 'Ops', 'HIGH', 'owner@citi.com',"
            + " 'Production', 'DOWN', ?, ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=csi-list-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi?search=Deleted", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("totalElements").asInt()).isEqualTo(0);
  }
}

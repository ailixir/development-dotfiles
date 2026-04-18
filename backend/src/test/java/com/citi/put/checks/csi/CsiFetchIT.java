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
class CsiFetchIT {

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
  }

  private void stubIdentity(String csiId, String role) {
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    String.format(
                        """
        {
          "user_id": "fetch-user",
          "email": "fetch@citi.com",
          "name": "Fetcher",
          "roles": ["checks-operator"],
          "csi_ownership": [{"csi_id": "%s", "role": "%s"}]
        }
        """,
                        csiId, role))));
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

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'owner@citi.com', 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void fetchExistingCsiReturns200() throws Exception {
    seedCsi("20001", "Fetch Target");
    stubIdentity("20001", "owner");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=fetch-200-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi/20001", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("id").asText()).isEqualTo("20001");
    assertThat(body.path("name").asText()).isEqualTo("Fetch Target");
  }

  @Test
  void fetchNonExistentCsiReturns404() {
    stubIdentity("99999", "owner");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=fetch-404-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi/99999", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(404);
  }

  @Test
  void fetchWithoutOwnershipReturns403() {
    seedCsi("20002", "Forbidden CSI");
    stubIdentity("00000", "owner");

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=fetch-403-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/csi/20002", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(403);
  }
}

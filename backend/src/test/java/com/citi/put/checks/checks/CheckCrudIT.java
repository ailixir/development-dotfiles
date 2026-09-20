package com.citi.put.checks.checks;

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

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "checks.local-dev-auth.enabled=false",
      "checks.security.bypass.identity-headers=false"
    })
@ActiveProfiles("local")
class CheckCrudIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired CheckService checkService;

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
    seedUser("crud-owner@citi.com");
    seedCsi("40001", "CRUD CSI");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
                    {
                      "user_id": "crud-user",
                      "email": "crud-owner@citi.com",
                      "name": "CRUD User",
                      "roles": ["checks-admin"],
                      "csi_ownership": [{"csi_id": "40001", "role": "owner"}]
                    }
                    """)));
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'crud-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private HttpHeaders authHeaders(String cookie) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  @Test
  void createReadUpdateDelete() throws Exception {
    String createBody =
        """
        {
          "name": "Health Check",
          "description": "HTTP health endpoint",
          "csiId": "40001",
          "environment": "Production",
          "configuration": {
            "type": "HTTP",
            "method": "GET",
            "url": "https://example.com/health",
            "headers": {"Accept": "application/json"},
            "expectedStatusCode": 200,
            "followRedirects": true,
            "timeoutMs": 5000,
            "verifyTls": true
          }
        }
        """;

    // CREATE
    ResponseEntity<String> createResp =
        restTemplate.exchange(
            "/api/v1/checks",
            HttpMethod.POST,
            new HttpEntity<>(createBody, authHeaders("crud-create")),
            String.class);
    assertThat(createResp.getStatusCode().value())
        .as("Create response: %s", createResp.getBody())
        .isEqualTo(201);
    assertThat(createResp.getHeaders().getLocation()).isNotNull();
    JsonNode created = objectMapper.readTree(createResp.getBody());
    String checkId = created.path("id").asText();
    assertThat(created.path("createdBy").asText()).isEqualTo("crud-owner@citi.com");
    wireMock.verify(
        com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor(
            urlEqualTo("/api/v1/users/me")));

    // READ
    ResponseEntity<String> readResp =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("crud-read")),
            String.class);
    assertThat(readResp.getStatusCode().value()).isEqualTo(200);
    JsonNode read = objectMapper.readTree(readResp.getBody());
    assertThat(read.path("name").asText()).isEqualTo("Health Check");
    assertThat(read.path("type").asText()).isEqualTo("HTTP");
    assertThat(read.path("configuration").path("url").asText())
        .isEqualTo("https://example.com/health");

    // UPDATE
    String updateBody =
        """
        {
          "name": "Updated Health Check",
          "description": "Updated",
          "csiId": "40001",
          "environment": "Staging",
          "configuration": {
            "type": "HTTP",
            "method": "GET",
            "url": "https://example.com/healthz",
            "expectedStatusCode": 200,
            "followRedirects": false,
            "timeoutMs": 3000,
            "verifyTls": true
          }
        }
        """;
    ResponseEntity<String> updateResp =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId,
            HttpMethod.PUT,
            new HttpEntity<>(updateBody, authHeaders("crud-update")),
            String.class);
    assertThat(updateResp.getStatusCode().value()).isEqualTo(200);
    JsonNode updated = objectMapper.readTree(updateResp.getBody());
    assertThat(updated.path("name").asText()).isEqualTo("Updated Health Check");
    assertThat(updated.path("configuration").path("url").asText())
        .isEqualTo("https://example.com/healthz");

    // DELETE (soft)
    ResponseEntity<String> deleteResp =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId,
            HttpMethod.DELETE,
            new HttpEntity<>(authHeaders("crud-delete")),
            String.class);
    assertThat(deleteResp.getStatusCode().value()).isEqualTo(204);

    // Verify soft-deleted: GET returns 404
    ResponseEntity<String> afterDelete =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId,
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("crud-after-del")),
            String.class);
    assertThat(afterDelete.getStatusCode().value()).isEqualTo(404);
  }

  @Test
  void firstCheckWriteEstablishesItsAuthenticatedAuthorBeforeTheAsyncMirror() throws Exception {
    String email = "first-check-" + UUID.randomUUID() + "@citi.com";
    var identity =
        new com.citi.put.checks.security.UserIdentity(
            UUID.randomUUID().toString(),
            email,
            "First Author",
            "Ops",
            java.util.List.of("checks-admin"),
            java.util.List.of());
    var request =
        objectMapper.readValue(
            """
            {"name":"First check","csiId":"40001","environment":"Production",
             "configuration":{"type":"HTTP","url":"https://example.com/health"}}
            """,
            com.citi.put.checks.checks.dto.CheckRequest.class);
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM users WHERE email=?", Integer.class, email))
        .isZero();
    var created =
        checkService.create(
            request, new com.citi.put.checks.security.BffAuthenticationToken(identity));
    assertThat(created.createdBy()).isEqualTo(email);
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM users WHERE email=?", Integer.class, email))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT created_by FROM checks WHERE id=?", String.class, created.id()))
        .isEqualTo(email);
  }

  @Test
  void listChecksWithFilters() throws Exception {
    String body1 =
        """
        {"name":"Filter A","csiId":"40001",
         "configuration":{"type":"HTTP","method":"GET","url":"https://a.com"}}
        """;
    ResponseEntity<String> created =
        restTemplate.exchange(
            "/api/v1/checks",
            HttpMethod.POST,
            new HttpEntity<>(body1, authHeaders("crud-filter1")),
            String.class);
    assertThat(created.getStatusCode().value())
        .as("Create response: %s", created.getBody())
        .isEqualTo(201);

    ResponseEntity<String> listResp =
        restTemplate.exchange(
            "/api/v1/checks?type=HTTP",
            HttpMethod.GET,
            new HttpEntity<>(authHeaders("crud-list")),
            String.class);
    assertThat(listResp.getStatusCode().value()).isEqualTo(200);
    JsonNode list = objectMapper.readTree(listResp.getBody());
    assertThat(list.path("data").isArray()).isTrue();
    assertThat(list.path("totalElements").asInt()).isGreaterThanOrEqualTo(1);
  }
}

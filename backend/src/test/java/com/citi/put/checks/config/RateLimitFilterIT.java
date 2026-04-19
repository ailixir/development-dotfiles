package com.citi.put.checks.config;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestPropertySource(
    properties = {
      "checks.rate-limit.read-per-min=5",
      "checks.rate-limit.write-per-min=3",
      "checks.rate-limit.execute-per-min=2",
      "checks.rate-limit.send-per-min=1",
      "checks.rate-limit.bulk-per-min=1",
      "checks.rate-limit.admin-multiplier=3",
    })
class RateLimitFilterIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
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
    seedUser("rl@citi.com");
    seedCsi("60001", "RL CSI");
  }

  @Test
  void readRateLimitExhaustsAfterCapacity() {
    stubIdentity("rl-read-user", "rl@citi.com", "[]");
    String cookie = "rl-read-" + System.nanoTime();

    for (int i = 0; i < 5; i++) {
      ResponseEntity<String> resp =
          restTemplate.exchange(
              "/api/v1/checks",
              HttpMethod.GET,
              new HttpEntity<>(authHeaders(cookie)),
              String.class);
      assertThat(resp.getStatusCode().value()).isEqualTo(200);
    }

    ResponseEntity<String> blocked =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.GET, new HttpEntity<>(authHeaders(cookie)), String.class);
    assertThat(blocked.getStatusCode().value()).isEqualTo(429);
    assertThat(blocked.getHeaders().getFirst("Retry-After")).isNotNull();
    assertThat(blocked.getHeaders().getFirst("X-RateLimit-Limit")).isEqualTo("5");
    assertThat(blocked.getHeaders().getFirst("X-RateLimit-Remaining")).isEqualTo("0");
    assertThat(blocked.getHeaders().getFirst("X-RateLimit-Reset")).isNotNull();
    assertThat(blocked.getBody()).contains("RATE_LIMITED");
  }

  @Test
  void executeRateLimitExhaustsAfterCapacity() {
    stubIdentity("rl-exec-user", "rl@citi.com", "[{\"csi_id\": \"60001\", \"role\": \"owner\"}]");
    String cookie = "rl-exec-" + System.nanoTime();
    UUID checkId = seedCheck("60001");

    for (int i = 0; i < 2; i++) {
      ResponseEntity<String> resp =
          restTemplate.exchange(
              "/api/v1/checks/" + checkId + "/execute",
              HttpMethod.POST,
              new HttpEntity<>(authHeaders(cookie)),
              String.class);
      assertThat(resp.getStatusCode().value()).isIn(202, 200);
    }

    ResponseEntity<String> blocked =
        restTemplate.exchange(
            "/api/v1/checks/" + checkId + "/execute",
            HttpMethod.POST,
            new HttpEntity<>(authHeaders(cookie)),
            String.class);
    assertThat(blocked.getStatusCode().value()).isEqualTo(429);
  }

  @Test
  void adminMultiplierIncreasesCapacity() {
    stubIdentity(
        "rl-admin-user",
        "rl@citi.com",
        "[{\"csi_id\": \"60001\", \"role\": \"owner\"}]",
        "checks-admin");
    String cookie = "rl-admin-" + System.nanoTime();

    for (int i = 0; i < 15; i++) {
      ResponseEntity<String> resp =
          restTemplate.exchange(
              "/api/v1/checks",
              HttpMethod.GET,
              new HttpEntity<>(authHeaders(cookie)),
              String.class);
      assertThat(resp.getStatusCode().value()).isEqualTo(200);
    }

    ResponseEntity<String> blocked =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.GET, new HttpEntity<>(authHeaders(cookie)), String.class);
    assertThat(blocked.getStatusCode().value()).isEqualTo(429);
    assertThat(blocked.getHeaders().getFirst("X-RateLimit-Limit")).isEqualTo("15");
  }

  @Test
  void optionsPreflightBypassesRateLimit() {
    for (int i = 0; i < 100; i++) {
      ResponseEntity<String> resp =
          restTemplate.exchange(
              "/api/v1/checks",
              HttpMethod.OPTIONS,
              new HttpEntity<>(new HttpHeaders()),
              String.class);
      assertThat(resp.getStatusCode().value()).isNotEqualTo(429);
    }
  }

  @Test
  void bulkDoubleChargesWriteBucket() {
    stubIdentity("rl-bulk-user", "rl@citi.com", "[{\"csi_id\": \"60001\", \"role\": \"owner\"}]");
    String cookie = "rl-bulk-" + System.nanoTime();

    String bulkBody =
        """
        {"operations": [
          {"op": "delete", "id": "00000000-0000-0000-0000-000000000001"},
          {"op": "delete", "id": "00000000-0000-0000-0000-000000000002"},
          {"op": "delete", "id": "00000000-0000-0000-0000-000000000003"}
        ]}
        """;

    HttpHeaders headers = authHeaders(cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
    restTemplate.exchange(
        "/api/v1/checks/_bulk", HttpMethod.POST, new HttpEntity<>(bulkBody, headers), String.class);

    headers = authHeaders(cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
    ResponseEntity<String> writeBlocked =
        restTemplate.exchange(
            "/api/v1/checks",
            HttpMethod.POST,
            new HttpEntity<>(
                """
                {"name":"Test","csiId":"60001","configuration":{"type":"HTTP","method":"GET","url":"http://test"}}
                """,
                headers),
            String.class);

    assertThat(writeBlocked.getStatusCode().value()).isEqualTo(429);
  }

  private void stubIdentity(String userId, String email, String csiOwnership) {
    stubIdentity(userId, email, csiOwnership, null);
  }

  private void stubIdentity(String userId, String email, String csiOwnership, String adminRole) {
    String roles = adminRole != null ? "[\"" + adminRole + "\"]" : "[]";
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "%s",
          "email": "%s",
          "name": "Test User",
          "roles": %s,
          "csi_ownership": %s
        }
        """
                        .formatted(userId, email, roles, csiOwnership))));
  }

  private HttpHeaders authHeaders(String cookie) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + cookie);
    return headers;
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'rl@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedCheck(String csiId) {
    UUID checkId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'RL Check', 'HTTP', ?, 'RL CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"http://test\"}', 'rl@citi.com',"
            + " ?, ?)",
        checkId,
        csiId,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return checkId;
  }
}

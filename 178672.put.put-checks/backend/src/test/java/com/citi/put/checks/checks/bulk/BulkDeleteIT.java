package com.citi.put.checks.checks.bulk;

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
import java.util.stream.Collectors;
import java.util.stream.IntStream;
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
      "checks.local-dev-auth.enabled=false",
      "checks.rate-limit.read-per-min=10000",
      "checks.rate-limit.write-per-min=10000",
      "checks.rate-limit.bulk-per-min=10000",
    })
class BulkDeleteIT {

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
    seedUser("bulk@citi.com");
    seedCsi("70001", "Bulk CSI");
    seedCsi("70002", "Other CSI");
  }

  @Test
  void allOwnedReturns200WithAllSuccess() throws Exception {
    stubIdentity("bulk-user", "[{\"csi_id\": \"70001\", \"role\": \"owner\"}]", "checks-admin");
    UUID c1 = seedCheck("70001");
    UUID c2 = seedCheck("70001");
    UUID c3 = seedCheck("70001");

    String body =
        """
        {"operations":[
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"}
        ]}
        """
            .formatted(c1, c2, c3);

    ResponseEntity<String> resp = post(body, "bulk-all-" + System.nanoTime());
    assertThat(resp.getStatusCode().value()).isEqualTo(200);

    JsonNode json = objectMapper.readTree(resp.getBody());
    assertThat(json.get("results").size()).isEqualTo(3);
    for (JsonNode r : json.get("results")) {
      assertThat(r.get("status").asText()).isEqualTo("SUCCESS");
    }
  }

  @Test
  void mixedOwnershipReturns207() throws Exception {
    stubIdentity("bulk-mixed", "[{\"csi_id\": \"70001\", \"role\": \"owner\"}]", null);
    UUID owned1 = seedCheck("70001");
    UUID owned2 = seedCheck("70001");
    UUID unowned = seedCheck("70002");

    String body =
        """
        {"operations":[
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"}
        ]}
        """
            .formatted(owned1, unowned, owned2);

    ResponseEntity<String> resp = post(body, "bulk-mixed-" + System.nanoTime());
    assertThat(resp.getStatusCode().value()).isEqualTo(207);

    JsonNode results = objectMapper.readTree(resp.getBody()).get("results");
    assertThat(results.get(0).get("status").asText()).isEqualTo("SUCCESS");
    assertThat(results.get(1).get("status").asText()).isEqualTo("FAILED");
    assertThat(results.get(1).get("error").get("code").asText()).isEqualTo("FORBIDDEN");
    assertThat(results.get(2).get("status").asText()).isEqualTo("SUCCESS");
  }

  @Test
  void allUnownedReturns400() throws Exception {
    stubIdentity("bulk-none", "[]", null);
    UUID c1 = seedCheck("70001");
    UUID c2 = seedCheck("70001");

    String body =
        """
        {"operations":[
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"}
        ]}
        """
            .formatted(c1, c2);

    ResponseEntity<String> resp = post(body, "bulk-none-" + System.nanoTime());
    assertThat(resp.getStatusCode().value()).isEqualTo(400);

    JsonNode results = objectMapper.readTree(resp.getBody()).get("results");
    for (JsonNode r : results) {
      assertThat(r.get("status").asText()).isEqualTo("FAILED");
    }
  }

  @Test
  void overSizeReturns400() throws Exception {
    stubIdentity("bulk-over", "[]", "checks-admin");
    String ops =
        IntStream.range(0, 101)
            .mapToObj(i -> "{\"op\":\"delete\",\"id\":\"" + UUID.randomUUID() + "\"}")
            .collect(Collectors.joining(","));
    String body = "{\"operations\":[" + ops + "]}";

    ResponseEntity<String> resp = post(body, "bulk-over-" + System.nanoTime());
    assertThat(resp.getStatusCode().value()).isEqualTo(400);
    assertThat(resp.getBody()).contains("BATCH_TOO_LARGE");
  }

  @Test
  void unknownOpReturns400() throws Exception {
    stubIdentity("bulk-op", "[]", "checks-admin");

    String body =
        """
        {"operations":[{"op":"tag","id":"%s"}]}
        """
            .formatted(UUID.randomUUID());

    ResponseEntity<String> resp = post(body, "bulk-op-" + System.nanoTime());
    assertThat(resp.getStatusCode().value()).isEqualTo(400);
    assertThat(resp.getBody()).contains("UNSUPPORTED_OP");
  }

  @Test
  void singleCsiBatchIsAtomic() throws Exception {
    stubIdentity("bulk-tx", "[{\"csi_id\": \"70001\", \"role\": \"owner\"}]", "checks-admin");
    UUID c1 = seedCheck("70001");
    UUID c2 = seedCheck("70001");
    UUID c3 = seedCheck("70001");

    String body =
        """
        {"operations":[
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"},
          {"op":"delete","id":"%s"}
        ]}
        """
            .formatted(c1, c2, c3);

    post(body, "bulk-tx-" + System.nanoTime());

    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM checks WHERE id IN (?, ?, ?) AND deleted_at IS NOT NULL",
            Integer.class,
            c1,
            c2,
            c3);
    assertThat(count).isEqualTo(3);
  }

  @Test
  void idempotencyKeyReplaysBulkResponse() throws Exception {
    stubIdentity("bulk-idem", "[{\"csi_id\": \"70001\", \"role\": \"owner\"}]", "checks-admin");
    UUID c1 = seedCheck("70001");

    String body =
        """
        {"operations":[{"op":"delete","id":"%s"}]}
        """
            .formatted(c1);
    String key = UUID.randomUUID().toString();

    HttpHeaders h1 = authHeaders("bulk-idem-" + System.nanoTime());
    h1.set("Idempotency-Key", key);
    ResponseEntity<String> first =
        restTemplate.exchange(
            "/api/v1/checks/_bulk", HttpMethod.POST, new HttpEntity<>(body, h1), String.class);
    assertThat(first.getStatusCode().value()).isEqualTo(200);

    HttpHeaders h2 = authHeaders("bulk-idem2-" + System.nanoTime());
    h2.set("Idempotency-Key", key);
    ResponseEntity<String> second =
        restTemplate.exchange(
            "/api/v1/checks/_bulk", HttpMethod.POST, new HttpEntity<>(body, h2), String.class);
    assertThat(second.getStatusCode().value()).isEqualTo(200);
    assertThat(second.getHeaders().getFirst("Idempotent-Replayed")).isEqualTo("true");
    assertThat(second.getBody()).isEqualTo(first.getBody());
  }

  private ResponseEntity<String> post(String body, String cookie) {
    return restTemplate.exchange(
        "/api/v1/checks/_bulk",
        HttpMethod.POST,
        new HttpEntity<>(body, authHeaders(cookie)),
        String.class);
  }

  private HttpHeaders authHeaders(String cookie) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private void stubIdentity(String userId, String csiOwnership, String adminRole) {
    String roles = adminRole != null ? "[\"" + adminRole + "\"]" : "[]";
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "%s",
          "email": "bulk@citi.com",
          "name": "Bulk User",
          "roles": %s,
          "csi_ownership": %s
        }
        """
                        .formatted(userId, roles, csiOwnership))));
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'bulk@citi.com', 'Production',"
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
            + " VALUES (?, 'Bulk Check', 'HTTP', ?, 'Bulk CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"http://test\"}',"
            + " 'bulk@citi.com', ?, ?)",
        checkId,
        csiId,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return checkId;
  }
}

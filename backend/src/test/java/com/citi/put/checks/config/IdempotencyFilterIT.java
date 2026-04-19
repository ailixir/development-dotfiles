package com.citi.put.checks.config;

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
class IdempotencyFilterIT {

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
    seedUser("idem@citi.com");
    seedCsi("50001", "Idem CSI");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "idem-user",
          "email": "idem@citi.com",
          "name": "Idem User",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "50001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void firstCallReturns201AndIsNotReplayed() {
    String key = UUID.randomUUID().toString();
    HttpHeaders headers = authHeaders("idem-first-" + System.nanoTime());
    headers.set("Idempotency-Key", key);

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/checks",
            HttpMethod.POST,
            new HttpEntity<>(checkBody(), headers),
            String.class);

    assertThat(resp.getStatusCode().value()).isEqualTo(201);
    assertThat(resp.getHeaders().getFirst("Idempotent-Replayed")).isNull();
  }

  @Test
  void replayReturnsCachedResponseWithReplayHeader() {
    String key = UUID.randomUUID().toString();

    HttpHeaders h1 = authHeaders("idem-replay-" + System.nanoTime());
    h1.set("Idempotency-Key", key);
    ResponseEntity<String> first =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.POST, new HttpEntity<>(checkBody(), h1), String.class);
    assertThat(first.getStatusCode().value()).isEqualTo(201);

    HttpHeaders h2 = authHeaders("idem-replay2-" + System.nanoTime());
    h2.set("Idempotency-Key", key);
    ResponseEntity<String> second =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.POST, new HttpEntity<>(checkBody(), h2), String.class);

    assertThat(second.getStatusCode().value()).isEqualTo(201);
    assertThat(second.getHeaders().getFirst("Idempotent-Replayed")).isEqualTo("true");
    assertThat(second.getBody()).isEqualTo(first.getBody());
  }

  @Test
  void malformedKeyReturns400() {
    HttpHeaders headers = authHeaders("idem-malformed-" + System.nanoTime());
    headers.set("Idempotency-Key", "not-a-uuid");

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.POST, new HttpEntity<>("{}", headers), String.class);

    assertThat(resp.getStatusCode().value()).isEqualTo(400);
    assertThat(resp.getBody()).contains("INVALID_IDEMPOTENCY_KEY");
  }

  @Test
  void fourxxResponseNotCached() {
    String key = UUID.randomUUID().toString();

    HttpHeaders h1 = new HttpHeaders();
    h1.add("X-User-Id", "no-access-user");
    h1.add("X-User-Email", "no-access@citi.com");
    h1.setContentType(MediaType.APPLICATION_JSON);
    h1.set("Idempotency-Key", key);

    ResponseEntity<String> first =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.POST, new HttpEntity<>(checkBody(), h1), String.class);
    assertThat(first.getStatusCode().value()).isEqualTo(403);

    HttpHeaders h2 = new HttpHeaders();
    h2.add("X-User-Id", "no-access-user");
    h2.add("X-User-Email", "no-access@citi.com");
    h2.setContentType(MediaType.APPLICATION_JSON);
    h2.set("Idempotency-Key", key);

    ResponseEntity<String> second =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.POST, new HttpEntity<>(checkBody(), h2), String.class);
    assertThat(second.getStatusCode().value()).isEqualTo(403);
    assertThat(second.getHeaders().getFirst("Idempotent-Replayed")).isNull();
  }

  @Test
  void getRequestPassesThroughWithIdempotencyHeader() {
    HttpHeaders headers = authHeaders("idem-get-" + System.nanoTime());
    headers.set("Idempotency-Key", UUID.randomUUID().toString());

    ResponseEntity<String> resp =
        restTemplate.exchange(
            "/api/v1/checks", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(resp.getStatusCode().value()).isEqualTo(200);
    assertThat(resp.getHeaders().getFirst("Idempotent-Replayed")).isNull();
  }

  private String checkBody() {
    return """
        {
          "name": "Idem Check",
          "csiId": "50001",
          "configuration": {"type": "HTTP", "method": "GET", "url": "https://test.com/health"}
        }
        """;
  }

  private HttpHeaders authHeaders(String cookie) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + cookie);
    headers.setContentType(MediaType.APPLICATION_JSON);
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'idem@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

package com.citi.put.checks.reports;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.net.http.HttpClient;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
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
class ReportsPreviewIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;

  private HttpClient testHttpClient;
  private ClientHttpRequestFactory originalRequestFactory;

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
    // This test owns its connection pool and uses the HTTP/1.1 protocol exposed by embedded
    // Tomcat. Do not let optional SDK dependencies select it through classpath detection.
    testHttpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(testHttpClient);
    requests.setReadTimeout(Duration.ofSeconds(10));
    originalRequestFactory = restTemplate.getRestTemplate().getRequestFactory();
    restTemplate.getRestTemplate().setRequestFactory(requests);
    wireMock.resetAll();
    seedUser("preview-test@citi.com");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
                    {
                      "user_id": "preview-user",
                      "email": "preview-test@citi.com",
                      "name": "Preview Tester",
                      "roles": ["checks-operator"],
                      "csi_ownership": [{"csi_id": "30001", "role": "owner"}]
                    }
                    """)));
  }

  @AfterEach
  void closeTestTransport() {
    restTemplate.getRestTemplate().setRequestFactory(originalRequestFactory);
    testHttpClient.close();
  }

  @Test
  void previewReturnsValidHtml() throws Exception {
    seedCsiAndCheck();

    UUID checkId =
        jdbc.queryForObject(
            "SELECT id FROM checks WHERE name = 'Health Endpoint' AND deleted_at IS NULL",
            UUID.class);

    String body =
        """
        {
          "name": "Preview Report",
          "description": "Testing preview",
          "template": "standard",
          "sections": [{"id":"s1","title":"Critical Checks","kind":"manual","checkIds":["%s"]}],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"]
        }
        """
            .formatted(checkId);

    ResponseEntity<String> created = postJson("/api/v1/reports", body);
    assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> previewResp = postJson("/api/v1/reports/" + id + "/preview", "");
    assertThat(previewResp.getStatusCode()).isEqualTo(HttpStatus.OK);

    JsonNode preview = objectMapper.readTree(previewResp.getBody());
    String html = preview.path("html").asText();
    assertThat(html).contains("<!DOCTYPE html>");
    assertThat(html).contains("Preview Report");
    assertThat(html).contains("Critical Checks");
    assertThat(html).contains("Health Endpoint");
    assertThat(preview.path("generatedAt").asText()).isNotEmpty();
  }

  @Test
  void previewWithEmptySections() throws Exception {
    String body =
        """
        {
          "name": "Empty Sections",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"]
        }
        """;

    ResponseEntity<String> created = postJson("/api/v1/reports", body);
    assertThat(created.getStatusCode())
        .as("Create response: %s", created.getBody())
        .isEqualTo(HttpStatus.CREATED);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> previewResp = postJson("/api/v1/reports/" + id + "/preview", "");
    assertThat(previewResp.getStatusCode()).isEqualTo(HttpStatus.OK);

    JsonNode preview = objectMapper.readTree(previewResp.getBody());
    assertThat(preview.path("html").asText()).contains("Empty Sections");
  }

  private void seedCsiAndCheck() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES ('30001', 'Test CSI', 'Ops', 'HIGH', 'preview-test@citi.com',"
            + " 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration, environment,"
            + " created_by, created_at, updated_at) VALUES (?, 'Health Endpoint', 'HTTP', '30001',"
            + " 'Test CSI', 'PASSING',"
            + " '{\"type\":\"HTTP\",\"url\":\"https://example.com/health\",\"method\":\"GET\"}'::jsonb,"
            + " 'Production', 'preview-test@citi.com', ?, ?) ON CONFLICT DO NOTHING",
        UUID.randomUUID(),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        "Preview Tester",
        email,
        Timestamp.from(Instant.now()));
  }

  private HttpHeaders authHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=preview-test-token");
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private ResponseEntity<String> postJson(String url, String body) {
    try {
      return restTemplate.exchange(
          url, HttpMethod.POST, new HttpEntity<>(body, authHeaders()), String.class);
    } catch (org.springframework.web.client.ResourceAccessException transportFailure) {
      // Report the failing endpoint and selected protocol without retrying an ambiguous POST.
      throw new AssertionError(
          "POST " + restTemplate.getRootUri() + url + " failed using " + testHttpClient.version(),
          transportFailure);
    }
  }
}

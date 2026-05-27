package com.citi.put.checks.reports;

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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ReportsCrudIT {

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
    seedUser("reports-test@citi.com");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "reports-user",
          "email": "reports-test@citi.com",
          "name": "Reports Tester",
          "roles": ["checks-operator"],
          "csi_ownership": [{"csi_id": "30001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void fullCrudLifecycle() throws Exception {
    String createBody =
        """
        {
          "name": "Daily Status Report",
          "description": "Critical checks overview",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily","time":"09:00","timezone":"EST"},
          "recipients": ["ops@citi.com"],
          "selectedChecks": null
        }
        """;

    ResponseEntity<String> createResp = postJson("/api/v1/reports", createBody);
    assertThat(createResp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    JsonNode created = objectMapper.readTree(createResp.getBody());
    String id = created.path("id").asText();
    assertThat(created.path("name").asText()).isEqualTo("Daily Status Report");
    assertThat(created.path("template").asText()).isEqualTo("standard");
    assertThat(created.path("status").asText()).isEqualTo("DRAFT");

    ResponseEntity<String> getResp = getJson("/api/v1/reports/" + id);
    assertThat(getResp.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode fetched = objectMapper.readTree(getResp.getBody());
    assertThat(fetched.path("name").asText()).isEqualTo("Daily Status Report");

    String updateBody =
        """
        {
          "name": "Weekly Status Report",
          "description": "Updated description",
          "template": "executive",
          "sections": [],
          "schedule": {"frequency":"weekly","time":"10:00","timezone":"UTC"},
          "recipients": ["ops@citi.com", "mgmt@citi.com"],
          "selectedChecks": null
        }
        """;

    ResponseEntity<String> updateResp = putJson("/api/v1/reports/" + id, updateBody);
    assertThat(updateResp.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode updated = objectMapper.readTree(updateResp.getBody());
    assertThat(updated.path("name").asText()).isEqualTo("Weekly Status Report");
    assertThat(updated.path("template").asText()).isEqualTo("executive");

    ResponseEntity<String> listResp = getJson("/api/v1/reports");
    assertThat(listResp.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode list = objectMapper.readTree(listResp.getBody());
    assertThat(list.path("data").isArray()).isTrue();
    assertThat(list.path("totalElements").asInt()).isGreaterThanOrEqualTo(1);

    ResponseEntity<String> deleteResp = deleteJson("/api/v1/reports/" + id);
    assertThat(deleteResp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

    ResponseEntity<String> afterDelete = getJson("/api/v1/reports/" + id);
    assertThat(afterDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
  }

  @Test
  void listFiltersByStatus() throws Exception {
    String body =
        """
        {
          "name": "Filter Test Report",
          "description": null,
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"],
          "selectedChecks": null
        }
        """;

    postJson("/api/v1/reports", body);

    ResponseEntity<String> filtered = getJson("/api/v1/reports?status=DRAFT");
    assertThat(filtered.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode data = objectMapper.readTree(filtered.getBody());
    assertThat(data.path("data").isArray()).isTrue();
    for (JsonNode item : data.path("data")) {
      assertThat(item.path("status").asText()).isEqualTo("DRAFT");
    }
  }

  @Test
  void createReturns400WhenNameBlank() throws Exception {
    String body =
        """
        {
          "name": "",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"]
        }
        """;

    ResponseEntity<String> resp = postJson("/api/v1/reports", body);
    assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
  }

  @Test
  void getReturns404ForMissingReport() {
    UUID missing = UUID.randomUUID();
    ResponseEntity<String> resp = getJson("/api/v1/reports/" + missing);
    assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(resp.getBody()).contains("REPORT_NOT_FOUND");
  }

  @Test
  void pauseAndResume() throws Exception {
    String body =
        """
        {
          "name": "Pause Test",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"]
        }
        """;

    ResponseEntity<String> created = postJson("/api/v1/reports", body);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> paused = postJson("/api/v1/reports/" + id + "/pause", "");
    assertThat(paused.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(objectMapper.readTree(paused.getBody()).path("status").asText()).isEqualTo("PAUSED");

    ResponseEntity<String> resumed = postJson("/api/v1/reports/" + id + "/resume", "");
    assertThat(resumed.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(objectMapper.readTree(resumed.getBody()).path("status").asText())
        .isEqualTo("ACTIVE");
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        "Reports Tester",
        email,
        Timestamp.from(Instant.now()));
  }

  private HttpHeaders authHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=reports-test-token");
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private ResponseEntity<String> postJson(String url, String body) {
    return restTemplate.exchange(
        url, HttpMethod.POST, new HttpEntity<>(body, authHeaders()), String.class);
  }

  private ResponseEntity<String> putJson(String url, String body) {
    return restTemplate.exchange(
        url, HttpMethod.PUT, new HttpEntity<>(body, authHeaders()), String.class);
  }

  private ResponseEntity<String> getJson(String url) {
    return restTemplate.exchange(
        url, HttpMethod.GET, new HttpEntity<>(authHeaders()), String.class);
  }

  private ResponseEntity<String> deleteJson(String url) {
    return restTemplate.exchange(
        url, HttpMethod.DELETE, new HttpEntity<>(authHeaders()), String.class);
  }
}

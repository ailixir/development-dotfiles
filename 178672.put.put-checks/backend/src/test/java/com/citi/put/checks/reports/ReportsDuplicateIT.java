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
class ReportsDuplicateIT {

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
    seedUser("dup-test@citi.com");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "dup-user",
          "email": "dup-test@citi.com",
          "name": "Dup Tester",
          "roles": ["checks-operator"],
          "csi_ownership": [{"csi_id": "30001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void duplicateCreatesNewReportWithCopySuffix() throws Exception {
    String original =
        """
        {
          "name": "Original Report",
          "description": "desc",
          "template": "detailed",
          "sections": [],
          "schedule": {"frequency":"weekly"},
          "recipients": ["team@citi.com", "mgmt@citi.com"]
        }
        """;

    ResponseEntity<String> created = postJson("/api/v1/reports", original);
    assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> dupResp = postJson("/api/v1/reports/" + id + "/duplicate", "");
    assertThat(dupResp.getStatusCode()).isEqualTo(HttpStatus.CREATED);

    JsonNode dup = objectMapper.readTree(dupResp.getBody());
    assertThat(dup.path("name").asText()).isEqualTo("Original Report (Copy)");
    assertThat(dup.path("status").asText()).isEqualTo("DRAFT");
    assertThat(dup.path("id").asText()).isNotEqualTo(id);
    assertThat(dup.path("template").asText()).isEqualTo("detailed");
    assertThat(dup.path("recipients").size()).isEqualTo(2);
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        "Dup Tester",
        email,
        Timestamp.from(Instant.now()));
  }

  private HttpHeaders authHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=dup-test-token");
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private ResponseEntity<String> postJson(String url, String body) {
    return restTemplate.exchange(
        url, HttpMethod.POST, new HttpEntity<>(body, authHeaders()), String.class);
  }
}

package com.citi.put.checks.reports;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
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
class ReportsExecutionIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());
  static GreenMail greenMail;

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    greenMail = new GreenMail(new ServerSetup(3026, "localhost", ServerSetup.PROTOCOL_SMTP));
    greenMail.start();
    greenMail.getManagers().getUserManager().setAuthRequired(false);

    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("spring.mail.host", () -> "localhost");
    registry.add("spring.mail.port", () -> "3026");
    registry.add("spring.mail.username", () -> "");
    registry.add("spring.mail.password", () -> "");
  }

  @AfterAll
  static void cleanup() {
    wireMock.stop();
    if (greenMail != null) {
      greenMail.stop();
    }
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    seedUser("exec-test@citi.com");
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "exec-user",
          "email": "exec-test@citi.com",
          "name": "Exec Tester",
          "roles": ["checks-operator"],
          "csi_ownership": [{"csi_id": "30001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void runNowPersistsExecution() throws Exception {
    String body =
        """
        {
          "name": "Execution Test Report",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["ops@citi.com", "mgmt@citi.com"]
        }
        """;

    ResponseEntity<String> created = postJson("/api/v1/reports", body);
    assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> runResp = postJson("/api/v1/reports/" + id + "/run-now", "");
    assertThat(runResp.getStatusCode()).isEqualTo(HttpStatus.OK);

    JsonNode runBody = objectMapper.readTree(runResp.getBody());
    assertThat(runBody.path("ok").asBoolean()).isTrue();
    assertThat(runBody.path("execution").path("status").asText()).isEqualTo("SUCCESS");
    assertThat(runBody.path("execution").path("recipientCount").asInt()).isEqualTo(2);
    assertThat(runBody.path("execution").path("generationDurationMs").asInt())
        .isGreaterThanOrEqualTo(0);
    assertThat(runBody.path("report").path("name").asText()).isEqualTo("Execution Test Report");
    assertThat(runBody.path("report").path("lastSentAt").asText()).isNotEmpty();

    ResponseEntity<String> execResp = getJson("/api/v1/reports/" + id + "/executions");
    assertThat(execResp.getStatusCode()).isEqualTo(HttpStatus.OK);

    JsonNode execBody = objectMapper.readTree(execResp.getBody());
    assertThat(execBody.path("data").size()).isGreaterThanOrEqualTo(1);
    assertThat(execBody.path("data").get(0).path("status").asText()).isEqualTo("SUCCESS");
  }

  @Test
  void sendTestReturnsOk() throws Exception {
    String body =
        """
        {
          "name": "Send Test Report",
          "template": "standard",
          "sections": [],
          "schedule": {"frequency":"daily"},
          "recipients": ["test@citi.com"]
        }
        """;

    ResponseEntity<String> created = postJson("/api/v1/reports", body);
    String id = objectMapper.readTree(created.getBody()).path("id").asText();

    ResponseEntity<String> sendResp = postJson("/api/v1/reports/" + id + "/send-test", "");
    assertThat(sendResp.getStatusCode()).isEqualTo(HttpStatus.OK);

    JsonNode sendBody = objectMapper.readTree(sendResp.getBody());
    assertThat(sendBody.path("ok").asBoolean()).isTrue();
    assertThat(sendBody.path("sentAt").asText()).isNotEmpty();
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, ?, ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        "Exec Tester",
        email,
        Timestamp.from(Instant.now()));
  }

  private HttpHeaders authHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=exec-test-token");
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  private ResponseEntity<String> postJson(String url, String body) {
    return restTemplate.exchange(
        url, HttpMethod.POST, new HttpEntity<>(body, authHeaders()), String.class);
  }

  private ResponseEntity<String> getJson(String url) {
    return restTemplate.exchange(
        url, HttpMethod.GET, new HttpEntity<>(authHeaders()), String.class);
  }
}

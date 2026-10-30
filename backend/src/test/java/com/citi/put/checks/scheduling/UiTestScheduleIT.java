package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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

/**
 * A UI test is scheduled through the ordinary {@code /api/v1/schedules} flow: the same endpoints,
 * the same CSI-write rule and the same cron validation as a check. Boots the real context, so it
 * also proves that Flyway applies V24 and the entity mapping validates against it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestPropertySource(properties = "checks.local-dev-auth.enabled=false")
class UiTestScheduleIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired JdbcTemplate jdbc;
  @Autowired StudioService studio;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private static final String OWNER = "ui-sched-owner@citi.com";
  private String csi;
  private UUID uiTest;
  private String session;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    csi = Integer.toString(54000 + (int) (Math.random() * 900));
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(csi, OWNER);
    uiTest = fixtures.seedTest("Scheduled UI test", csi, OWNER, List.of("Go to the page"));
    asCaller("owner", csi, "owner");
  }

  /**
   * The Core identity the following requests resolve to: a role on one CSI, no administrator
   * rights. A fresh session cookie each time, because the API caches an identity per cookie.
   */
  private void asCaller(String name, String csiId, String role) {
    session = "ui-sched-" + UUID.randomUUID();
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
                    {
                      "user_id": "%s",
                      "email": "%s@citi.com",
                      "name": "%s",
                      "roles": [],
                      "csi_ownership": [{"csi_id": "%s", "role": "%s"}]
                    }
                    """
                        .formatted(name, name, name, csiId, role))));
  }

  private String body(Object checkId, Object uiTestId, String cron, String timezone) {
    return """
        {
          "checkId": %s,
          "uiTestId": %s,
          "frequency": "custom",
          "cronExpression": "%s",
          "timezone": "%s"
        }
        """
        .formatted(
            checkId == null ? "null" : "\"" + checkId + "\"",
            uiTestId == null ? "null" : "\"" + uiTestId + "\"",
            cron,
            timezone);
  }

  private ResponseEntity<String> post(String json) {
    return restTemplate.exchange(
        "/api/v1/schedules", HttpMethod.POST, new HttpEntity<>(json, headers()), String.class);
  }

  private ResponseEntity<String> exchange(String path, HttpMethod method, String json) {
    return restTemplate.exchange(path, method, new HttpEntity<>(json, headers()), String.class);
  }

  @Test
  void aCsiWriterCreatesReadsUpdatesTogglesListsAndDeletesTheSchedule() throws Exception {
    ResponseEntity<String> created = post(body(null, uiTest, "0 */5 * * * *", "UTC"));
    assertThat(created.getStatusCode().value()).isEqualTo(201);
    JsonNode schedule = objectMapper.readTree(created.getBody());
    String id = schedule.path("id").asText();
    assertThat(schedule.path("uiTestId").asText()).isEqualTo(uiTest.toString());
    assertThat(schedule.path("checkId").isNull()).isTrue();
    assertThat(schedule.path("enabled").asBoolean()).isTrue();
    assertThat(schedule.path("nextExecutionAt").asText()).isNotEmpty();
    assertThat(
            jdbc.queryForObject(
                "SELECT check_type FROM schedules WHERE id=?::uuid", String.class, id))
        .isEqualTo("UI_TEST");

    assertThat(exchange("/api/v1/schedules/" + id, HttpMethod.GET, null).getStatusCode().value())
        .isEqualTo(200);
    JsonNode list =
        objectMapper.readTree(
            exchange("/api/v1/schedules?uiTestId=" + uiTest, HttpMethod.GET, null).getBody());
    assertThat(list.path("totalElements").asInt()).isEqualTo(1);
    assertThat(list.path("data").get(0).path("id").asText()).isEqualTo(id);

    ResponseEntity<String> updated =
        exchange(
            "/api/v1/schedules/" + id,
            HttpMethod.PUT,
            body(null, uiTest, "0 */10 * * * *", "America/New_York"));
    assertThat(updated.getStatusCode().value()).isEqualTo(200);
    assertThat(objectMapper.readTree(updated.getBody()).path("timezone").asText())
        .isEqualTo("America/New_York");

    JsonNode disabled =
        objectMapper.readTree(
            exchange(
                    "/api/v1/schedules/" + id + "/enabled", HttpMethod.PATCH, "{\"enabled\":false}")
                .getBody());
    assertThat(disabled.path("enabled").asBoolean()).isFalse();
    JsonNode enabled =
        objectMapper.readTree(
            exchange("/api/v1/schedules/" + id + "/enabled", HttpMethod.PATCH, "{\"enabled\":true}")
                .getBody());
    assertThat(enabled.path("enabled").asBoolean()).isTrue();
    assertThat(enabled.path("nextExecutionAt").asText()).isNotEmpty();

    assertThat(exchange("/api/v1/schedules/" + id, HttpMethod.DELETE, null).getStatusCode().value())
        .isEqualTo(204);
    assertThat(exchange("/api/v1/schedules/" + id, HttpMethod.GET, null).getStatusCode().value())
        .isEqualTo(404);
  }

  @Test
  void aCallerWhoCannotWriteTheTestsCsiGets403AndNothingIsCreated() {
    asCaller("viewer", csi, "viewer");
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(403);
    asCaller("stranger", "99999", "owner");
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(403);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM schedules WHERE ui_test_id=?", Integer.class, uiTest))
        .isZero();
  }

  @Test
  void aSecondScheduleForTheSameTestIs409() {
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(201);
    assertThat(post(body(null, uiTest, "0 */15 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(409);
  }

  @Test
  void intervalUnderAMinuteBadTimezoneUnknownTestAndAmbiguousTargetAreAll400() {
    assertThat(post(body(null, uiTest, "*/10 * * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(400);
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "Mars/Olympus")).getStatusCode().value())
        .isEqualTo(400);
    assertThat(post(body(null, UUID.randomUUID(), "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(400);
    assertThat(post(body(null, null, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(400);
    assertThat(
            post(body(UUID.randomUUID(), uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(400);
  }

  @Test
  void aNonAdminListSeesOnlyTheSchedulesOfTheUiTestsOnCsisItOwns() throws Exception {
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(201);
    asCaller("elsewhere", "99999", "owner");
    JsonNode other =
        objectMapper.readTree(
            exchange("/api/v1/schedules?uiTestId=" + uiTest, HttpMethod.GET, null).getBody());
    assertThat(other.path("totalElements").asInt()).isZero();
  }

  @Test
  void aCallerOutsideTheTestsCsiCannotReadChangeToggleOrDeleteItsSchedule() throws Exception {
    JsonNode schedule =
        objectMapper.readTree(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getBody());
    String id = schedule.path("id").asText();
    String path = "/api/v1/schedules/" + id;

    asCaller("stranger", "99999", "owner");
    assertThat(exchange(path, HttpMethod.GET, null).getStatusCode().value()).isEqualTo(403);
    assertThat(
            exchange(path, HttpMethod.PUT, body(null, uiTest, "0 */10 * * * *", "UTC"))
                .getStatusCode()
                .value())
        .isEqualTo(403);
    assertThat(
            exchange(path + "/enabled", HttpMethod.PATCH, "{\"enabled\":false}")
                .getStatusCode()
                .value())
        .isEqualTo(403);
    assertThat(exchange(path, HttpMethod.DELETE, null).getStatusCode().value()).isEqualTo(403);

    // A reader of the CSI may read it but not change it, as for a check.
    asCaller("viewer", csi, "viewer");
    assertThat(exchange(path, HttpMethod.GET, null).getStatusCode().value()).isEqualTo(200);
    assertThat(exchange(path, HttpMethod.DELETE, null).getStatusCode().value()).isEqualTo(403);
    assertThat(
            jdbc.queryForObject(
                "SELECT cron_expression FROM schedules WHERE id=?::uuid", String.class, id))
        .isEqualTo("0 */5 * * * *");
  }

  @Test
  void homeUpcomingListsTheUiTestScheduleForItsCsiOwnerAndNobodyElse() throws Exception {
    assertThat(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getStatusCode().value())
        .isEqualTo(201);

    JsonNode own =
        objectMapper.readTree(
            exchange("/api/v1/dashboard/upcoming?limit=100&csiId=" + csi, HttpMethod.GET, null)
                .getBody());
    JsonNode item = null;
    for (JsonNode candidate : own.path("data")) {
      if (candidate.path("checkId").asText().equals(uiTest.toString())) {
        item = candidate;
      }
    }
    assertThat(item).as("the UI test's schedule is upcoming work, like a check's").isNotNull();
    assertThat(item.path("checkName").asText()).isEqualTo("Scheduled UI test");
    assertThat(item.path("csiName").asText()).isNotEmpty();
    assertThat(item.path("nextExecution").asText()).isNotEmpty();

    asCaller("elsewhere", "99999", "owner");
    JsonNode other =
        objectMapper.readTree(
            exchange("/api/v1/dashboard/upcoming?limit=100&csiId=" + csi, HttpMethod.GET, null)
                .getBody());
    for (JsonNode candidate : other.path("data")) {
      assertThat(candidate.path("checkId").asText()).isNotEqualTo(uiTest.toString());
    }
  }

  @Test
  void deletingTheTestRemovesItsScheduleAndKeepsItsScheduledRunHistory() throws Exception {
    JsonNode schedule =
        objectMapper.readTree(post(body(null, uiTest, "0 */5 * * * *", "UTC")).getBody());
    UUID scheduleId = UUID.fromString(schedule.path("id").asText());
    UUID run = UUID.randomUUID();
    Timestamp acceptedAt = Timestamp.from(Instant.now());
    jdbc.update(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id, csi_id,"
            + " principal, state) VALUES (?, ?, ?, ?, 'system:checks-scheduler', 'DONE')",
        run,
        acceptedAt,
        uiTest,
        csi);
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at, duration_ms,"
            + " csi_id, principal, environment, trigger_source, schedule_id, scheduled_at)"
            + " VALUES (?, ?, 'PASSED', ?, ?, 0, ?, 'system:checks-scheduler', 'Production',"
            + " 'SCHEDULED', ?, ?)",
        run,
        uiTest,
        acceptedAt,
        acceptedAt,
        csi,
        scheduleId,
        acceptedAt);

    studio.softDeleteTest(uiTest);

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM schedules WHERE id=?", Integer.class, scheduleId))
        .isZero();
    var kept =
        jdbc.queryForMap(
            "SELECT trigger_source, schedule_id FROM ui_test_executions WHERE id=?", run);
    assertThat(kept).containsEntry("trigger_source", "SCHEDULED");
    assertThat(kept.get("schedule_id")).isNull();
  }

  private HttpHeaders headers() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=" + session);
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }
}

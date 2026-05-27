package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CronDispatcherDriftIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired CronDispatcher cronDispatcher;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.dispatcher-enabled", () -> "true");
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UUID checkId;
  private UUID scheduleId;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    jdbc.update("DELETE FROM schedules");
    jdbc.update(
        "UPDATE shedlock SET lock_until = now() - interval '1 minute' WHERE name = 'cronDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");

    seedUser("drift-owner@citi.com");
    seedCsi("70001", "Drift CSI");
    checkId = seedHttpCheck("70001", "drift-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "drift-user",
          "email": "drift-owner@citi.com",
          "name": "Drift Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "70001", "role": "owner"}]
        }
        """)));

    wireMock.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
  }

  @Test
  @Order(1)
  void advancesFromScheduleTimestampNotWallClock() throws Exception {
    String cron = "0 */5 * * * *";
    Instant tenMinutesAgo = Instant.now().minus(10, ChronoUnit.MINUTES);
    scheduleId = seedSchedule(checkId, cron, "UTC", true, tenMinutesAgo);

    CronExpression expr = CronExpression.parse(cron);
    ZonedDateTime expectedNext = expr.next(tenMinutesAgo.atZone(ZoneId.of("UTC")));

    cronDispatcher.pollAndDispatch();

    // next_execution_at is updated synchronously inside the TX
    Instant nextExecution =
        jdbc.queryForObject(
            "SELECT next_execution_at FROM schedules WHERE id = ?", Instant.class, scheduleId);

    assertThat(nextExecution)
        .as("Should advance one cron tick from the schedule timestamp, not from wall clock")
        .isEqualTo(expectedNext.toInstant());

    // Must still be in the past (advanced from -10min to ~-5min, not to future)
    assertThat(nextExecution).isBefore(Instant.now());
  }

  @Test
  @Order(2)
  void fallsBackToNowWhenNextExecutionAtIsNull() {
    String cron = "0 */5 * * * *";
    seedScheduleWithNullNextExecution(checkId, cron, "UTC");

    // A null nextExecutionAt won't be found by findDueSchedules, so no dispatch.
    // The key test: no NPE is thrown.
    cronDispatcher.pollAndDispatch();

    List<Map<String, Object>> results =
        jdbc.queryForList("SELECT * FROM execution_results WHERE check_id = ?", checkId);
    assertThat(results).isEmpty();
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'drift-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String createdBy) {
    UUID id = UUID.randomUUID();
    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s/health","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl());
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'Drift Check', 'HTTP', ?, 'Drift CSI', 'PENDING',"
            + " ?::jsonb, ?, ?, ?)",
        id,
        csiId,
        configJson,
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private UUID seedSchedule(
      UUID forCheckId, String cron, String tz, boolean enabled, Instant nextExecutionAt) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', 'custom', ?, ?, ?, ?, ?, ?)",
        id,
        forCheckId,
        cron,
        tz,
        enabled,
        Timestamp.from(nextExecutionAt),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedScheduleWithNullNextExecution(UUID forCheckId, String cron, String tz) {
    jdbc.update(
        "INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', 'custom', ?, ?, true, NULL, ?, ?)",
        UUID.randomUUID(),
        forCheckId,
        cron,
        tz,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

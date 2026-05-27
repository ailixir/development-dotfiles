package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class CronDispatcherBatchIT {

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
    registry.add("checks.scheduling.batch-size", () -> "2");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private final List<UUID> scheduleIds = new ArrayList<>();
  private Instant originalNextExecution;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    scheduleIds.clear();

    jdbc.update("DELETE FROM schedules");
    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");

    seedUser("batch-owner@citi.com");
    seedCsi("72001", "Batch CSI");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "batch-user",
          "email": "batch-owner@citi.com",
          "name": "Batch Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "72001", "role": "owner"}]
        }
        """)));

    wireMock.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
  }

  @Test
  void batchSizeLimitsDispatchesPerPoll() {
    originalNextExecution = Instant.now().minus(1, ChronoUnit.MINUTES);
    for (int i = 0; i < 5; i++) {
      UUID checkId = seedHttpCheck("72001", "batch-owner@citi.com", "Batch Check " + i);
      UUID scheduleId = seedSchedule(checkId, "0 */5 * * * *", "UTC", true, originalNextExecution);
      scheduleIds.add(scheduleId);
    }

    // Verify all 5 are initially due
    Integer dueBeforePoll =
        jdbc.queryForObject(
            "SELECT count(*) FROM schedules WHERE enabled = true AND next_execution_at <= now()"
                + " AND id IN (?, ?, ?, ?, ?)",
            Integer.class,
            scheduleIds.get(0),
            scheduleIds.get(1),
            scheduleIds.get(2),
            scheduleIds.get(3),
            scheduleIds.get(4));
    assertThat(dueBeforePoll).as("All 5 schedules should be due before polling").isEqualTo(5);

    // Single poll: batch-size=2, so only 2 of 5 due schedules should be dispatched
    cronDispatcher.pollAndDispatch();

    int advancedCount = countChangedSchedules();
    assertThat(advancedCount)
        .as("Poll with batch-size=2 should advance exactly 2 of 5 due schedules")
        .isEqualTo(2);

    // Verify the remaining 3 are still at their original nextExecutionAt
    int unchangedCount = 5 - advancedCount;
    assertThat(unchangedCount)
        .as("3 schedules should remain un-dispatched due to batch limit")
        .isEqualTo(3);
  }

  private int countChangedSchedules() {
    int changed = 0;
    for (UUID scheduleId : scheduleIds) {
      Instant nextExecution =
          jdbc.queryForObject(
              "SELECT next_execution_at FROM schedules WHERE id = ?", Instant.class, scheduleId);
      if (nextExecution != null && !nextExecution.equals(originalNextExecution)) {
        changed++;
      }
    }
    return changed;
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'batch-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String createdBy, String name) {
    UUID id = UUID.randomUUID();
    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s/health","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl());
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', ?, 'Batch CSI', 'PENDING',"
            + " ?::jsonb, ?, ?, ?)",
        id,
        name,
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
}

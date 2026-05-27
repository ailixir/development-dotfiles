package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
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
class ParallelDispatchIT {

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
    registry.add("checks.scheduling.batch-size", () -> "20");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    jdbc.update("DELETE FROM schedules");
    jdbc.update(
        "UPDATE shedlock SET lock_until = NOW() - INTERVAL '1 second'"
            + " WHERE name = 'cronDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");

    seedUser("parallel-owner@citi.com");
    seedCsi("73001", "Parallel CSI");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {"user_id":"par-user","email":"parallel-owner@citi.com","name":"Parallel Owner",
         "roles":["checks-admin"],"csi_ownership":[{"csi_id":"73001","role":"owner"}]}
        """)));
  }

  @Test
  void parallelDispatchWithMixedOutcomes() {
    wireMock.stubFor(
        get(urlPathMatching("/health-ok"))
            .willReturn(
                aResponse().withStatus(200).withBody("{\"status\":\"UP\"}").withFixedDelay(100)));
    wireMock.stubFor(
        get(urlPathMatching("/health-fail"))
            .willReturn(aResponse().withStatus(500).withBody("Internal Server Error")));

    Instant past = Instant.now().minus(1, ChronoUnit.MINUTES);
    List<UUID> scheduleIds = new ArrayList<>();
    for (int i = 0; i < 8; i++) {
      UUID checkId =
          seedHttpCheckWithPath("73001", "parallel-owner@citi.com", "Good " + i, "/health-ok");
      scheduleIds.add(seedSchedule(checkId, "0 */5 * * * *", "UTC", true, past));
    }
    for (int i = 0; i < 2; i++) {
      UUID checkId =
          seedHttpCheckWithPath("73001", "parallel-owner@citi.com", "Fail " + i, "/health-fail");
      scheduleIds.add(seedSchedule(checkId, "0 */5 * * * *", "UTC", true, past));
    }

    long start = System.nanoTime();
    cronDispatcher.pollAndDispatch();
    long elapsed = System.nanoTime() - start;

    int advancedCount = 0;
    for (UUID id : scheduleIds) {
      Instant next =
          jdbc.queryForObject(
              "SELECT next_execution_at FROM schedules WHERE id = ?", Instant.class, id);
      if (next != null && next.isAfter(past)) {
        advancedCount++;
      }
    }

    assertThat(advancedCount)
        .as("All 10 schedules should dispatch and advance (even failing ones)")
        .isEqualTo(10);

    long elapsedMs = elapsed / 1_000_000;
    assertThat(elapsedMs)
        .as("Parallel dispatch of 10 items (100ms delay each) should be < 3s, got %dms", elapsedMs)
        .isLessThan(3000);
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'parallel-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?) ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String createdBy, String name) {
    return seedHttpCheckWithPath(csiId, createdBy, name, "/health");
  }

  private UUID seedHttpCheckWithPath(String csiId, String createdBy, String name, String path) {
    UUID id = UUID.randomUUID();
    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s%s","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl(), path);
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', ?, 'Parallel CSI', 'PENDING',"
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

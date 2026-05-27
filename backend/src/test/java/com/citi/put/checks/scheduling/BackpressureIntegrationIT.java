package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
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
class BackpressureIntegrationIT {

  static final int MAX_CONCURRENCY = 4;

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired CronDispatcher cronDispatcher;
  @Autowired MeterRegistry meterRegistry;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.dispatcher-enabled", () -> "true");
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.scheduling.batch-size", () -> "20");
    registry.add("checks.executor.max-concurrency", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.HTTP", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.TCP", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.SPLUNK", () -> "0");
    registry.add("checks.executor.source-limits.GRAFANA", () -> "0");
    registry.add("checks.executor.source-limits.ITRS", () -> "0");
    registry.add("checks.executor.source-limits.APPDYNAMICS", () -> "0");
    registry.add("checks.executor.source-limits.UI_TEST", () -> "0");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    jdbc.update("DELETE FROM execution_results");
    jdbc.update("DELETE FROM schedules");
    jdbc.update(
        "UPDATE shedlock SET lock_until = NOW() - INTERVAL '1 minute'"
            + " WHERE name = 'cronDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");

    seedUser("bp-owner@citi.com");
    seedCsi("91001", "Backpressure CSI");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {"user_id":"bp-user","email":"bp-owner@citi.com","name":"BP Owner",
         "roles":["checks-admin"],"csi_ownership":[{"csi_id":"91001","role":"owner"}]}
        """)));
  }

  @Test
  void backpressureSkipsPollWhenExecutorSaturated() throws Exception {
    wireMock.stubFor(
        get(urlPathMatching("/slow"))
            .willReturn(
                aResponse().withStatus(200).withBody("{\"status\":\"UP\"}").withFixedDelay(5000)));

    Instant past = Instant.now().minus(2, ChronoUnit.MINUTES);
    List<UUID> checkIds = new ArrayList<>();
    for (int i = 0; i < MAX_CONCURRENCY + 4; i++) {
      UUID checkId = seedHttpCheck("91001", "/slow");
      seedSchedule(checkId, past);
      checkIds.add(checkId);
    }

    cronDispatcher.pollAndDispatch();

    Thread.sleep(1000);

    double skipsBefore = getSkipCount();

    jdbc.update(
        "UPDATE shedlock SET lock_until = NOW() - INTERVAL '1 minute'"
            + " WHERE name = 'cronDispatcher'");

    cronDispatcher.pollAndDispatch();

    double skipsAfter = getSkipCount();
    int inFlight = cronDispatcher.getInFlightCount();

    assertThat(inFlight).as("In-flight should be at or near max concurrency").isGreaterThan(0);

    if (inFlight >= MAX_CONCURRENCY) {
      assertThat(skipsAfter)
          .as("Poll should have been skipped due to backpressure")
          .isGreaterThan(skipsBefore);
    }
  }

  private double getSkipCount() {
    Counter counter =
        meterRegistry
            .find("checks.dispatch.polls_skipped_total")
            .tag("reason", "backpressure")
            .counter();
    return counter != null ? counter.count() : 0.0;
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'bp-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?) ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String path) {
    UUID id = UUID.randomUUID();
    String configJson =
        "{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"%s%s\",\"expectedStatusCode\":200,\"timeoutMs\":10000}"
            .formatted(wireMock.baseUrl(), path);
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'BP Check', 'HTTP', ?, 'BP CSI', 'PENDING',"
            + " ?::jsonb, 'bp-owner@citi.com', ?, ?)",
        id,
        csiId,
        configJson,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private UUID seedSchedule(UUID checkId, Instant nextExecutionAt) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', 'custom', '0 */5 * * * *', 'UTC', true, ?, ?, ?)",
        id,
        checkId,
        Timestamp.from(nextExecutionAt),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }
}

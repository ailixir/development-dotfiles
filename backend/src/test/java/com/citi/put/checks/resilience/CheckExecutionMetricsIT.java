package com.citi.put.checks.resilience;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.scheduling.CronDispatcher;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import java.sql.Timestamp;
import java.time.Instant;
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
class CheckExecutionMetricsIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired MeterRegistry meterRegistry;
  @Autowired CronDispatcher cronDispatcher;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.dispatcher-enabled", () -> "true");
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
    registry.add("checks.scheduling.retry-initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UUID checkId;
  private String email;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    email = "metrics-" + UUID.randomUUID() + "@citi.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    checkId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Metrics User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Metrics CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s/health","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl());
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at) VALUES (?, 'Metrics Check', 'HTTP', ?,"
            + " 'Metrics CSI', 'PENDING', ?::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        configJson,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    wireMock.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    "{\"user_id\":\"u\",\"email\":\""
                        + email
                        + "\",\"name\":\"M\",\"roles\":[\"checks-admin\"],"
                        + "\"csi_ownership\":[{\"csi_id\":\""
                        + csiId
                        + "\",\"role\":\"owner\"}]}")));
  }

  @Test
  void scheduledDispatchRegistersMetrics() {
    Instant past = Instant.now().minusSeconds(120);
    UUID scheduleId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', 'custom', '0 */5 * * * *', 'UTC', true, ?, ?, ?)",
        scheduleId,
        checkId,
        Timestamp.from(past),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");
    cronDispatcher.pollAndDispatch();

    double dispatchCount =
        meterRegistry.find("checks.scheduled.dispatches_total").counters().stream()
            .mapToDouble(c -> c.count())
            .sum();
    assertThat(dispatchCount)
        .as("Dispatch counter should be incremented after scheduled execution")
        .isGreaterThan(0);

    jdbc.update("DELETE FROM schedules WHERE id = ?", scheduleId);
  }
}

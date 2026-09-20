package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@Transactional
class DefaultPartitionIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;

  private UUID checkId;
  private UUID uiTestId;
  private UUID reportId;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void seed() {
    String email = "defpart-" + UUID.randomUUID() + "@citigroup.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    checkId = UUID.randomUUID();
    uiTestId = UUID.randomUUID();
    reportId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'Default Partition User', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'DP CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'DP Check', 'HTTP', ?, 'DP CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com/health\"}'::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, created_by,"
            + " created_at, updated_at) "
            + "VALUES (?, 'DP UITest', ?, 'Production', 'chromium', '[]'::jsonb, ?, ?, ?)",
        uiTestId,
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO reports (id, name, template, status, schedule, recipients,"
            + " created_by, created_at, updated_at) "
            + "VALUES (?, 'DP Report', 'standard', 'ACTIVE',"
            + " '{\"cron\":\"0 8 * * 1-5\"}'::jsonb, ?,"
            + " ?, ?, ?)",
        reportId,
        new String[] {email},
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void executionResultsLandsInDefaultForFarFutureTimestamp() {
    OffsetDateTime farFuture = OffsetDateTime.of(2028, 6, 15, 12, 0, 0, 0, ZoneOffset.UTC);
    UUID rowId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO execution_results (id, check_id, status, started_at, ended_at,"
            + " duration_ms, created_at) VALUES (?, ?, 'SUCCESS', ?, ?, 100, ?)",
        rowId,
        checkId,
        Timestamp.from(farFuture.toInstant()),
        Timestamp.from(farFuture.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));

    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM execution_results_default WHERE id = ?", Integer.class, rowId);
    assertThat(count).isEqualTo(1);
  }

  @Test
  void uiTestExecutionsLandsInDefaultForFarFutureTimestamp() {
    OffsetDateTime farFuture = OffsetDateTime.of(2028, 6, 15, 12, 0, 0, 0, ZoneOffset.UTC);
    UUID rowId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, check_id, status, started_at,"
            + " ended_at, duration_ms, created_at) VALUES (?, ?, ?, 'PASSED', ?, ?, 200, ?)",
        rowId,
        uiTestId,
        checkId,
        Timestamp.from(farFuture.toInstant()),
        Timestamp.from(farFuture.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));

    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM ui_test_executions_default WHERE id = ?", Integer.class, rowId);
    assertThat(count).isEqualTo(1);
  }

  @Test
  void reportExecutionsLandsInDefaultForFarFutureTimestamp() {
    OffsetDateTime farFuture = OffsetDateTime.of(2028, 6, 15, 12, 0, 0, 0, ZoneOffset.UTC);
    UUID rowId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO report_executions (id, report_id, status, executed_at, recipient_count,"
            + " checks_included, created_at) VALUES (?, ?, 'SUCCESS', ?, 1, 5, ?)",
        rowId,
        reportId,
        Timestamp.from(farFuture.toInstant()),
        Timestamp.from(Instant.now()));

    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM report_executions_default WHERE id = ?", Integer.class, rowId);
    assertThat(count).isEqualTo(1);
  }
}

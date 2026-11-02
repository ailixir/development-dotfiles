package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Studio v1 gaps: a month whose rows reached the DEFAULT partition first must still get its
 * partition.
 *
 * <p>That is the {@code backend/dev.sh --seed} failure (the seed runs inside Flyway, before any
 * bootstrap, and writes current-month {@code ui_test_executions} into DEFAULT), and the production
 * one: an API pod accepting a run before a worker bootstrapped, or a missed monthly run. A bare
 * {@code CREATE TABLE … PARTITION OF} then fails on every attempt and the {@code partitions} health
 * indicator is DOWN for good. The month used here is far in the future so the test owns it
 * outright.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class PartitionDefaultRowsIT {

  private static final YearMonth MONTH = YearMonth.of(2031, 3);
  private static final String PARTITION = "ui_test_executions_2031_03";
  private static final String CSI_ID = "PDR-31";

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;

  private UUID testId;

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
    String email = "pdr-" + UUID.randomUUID() + "@citi.com";
    testId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (gen_random_uuid(), ?, 'PDR Author', ?, NOW(), true)",
        "sso-" + UUID.randomUUID(),
        email);
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at) VALUES (?, 'PDR CSI', 'Ops', 'HIGH', ?,"
            + " 'Production', 'OPERATIONAL', NOW(), NOW()) ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        email);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'PDR draft', ?, 'Production',"
            + " 'chromium', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb, ?, NOW(), NOW())",
        testId,
        CSI_ID,
        email);
  }

  @AfterEach
  void cleanUp() {
    jdbc.update("DELETE FROM ui_test_executions WHERE ui_test_id = ?", testId);
    if (partitionExists()) {
      jdbc.execute("ALTER TABLE ui_test_executions DETACH PARTITION " + PARTITION);
      jdbc.execute("DROP TABLE " + PARTITION);
    }
    jdbc.update("DELETE FROM ui_tests WHERE id = ?", testId);
  }

  @Test
  void createsTheMonthAndMovesItsDefaultRowsIntoIt() {
    UUID march1 = insertExecution("2031-03-10 12:00:00+00", 1111);
    UUID march2 = insertExecution("2031-03-20 12:00:00+00", 2222);
    UUID april = insertExecution("2031-04-15 12:00:00+00", 3333);
    assertThat(partitionExists()).isFalse();
    assertThat(defaultIds()).contains(march1, march2, april);

    boolean created = new PartitionManager(jdbc, "ui_test_executions").ensurePartition(MONTH);

    assertThat(created).isTrue();
    assertThat(partitionExists()).isTrue();
    assertThat(
            jdbc.queryForList(
                "SELECT id FROM " + PARTITION + " WHERE ui_test_id = ? ORDER BY duration_ms",
                UUID.class,
                testId))
        .containsExactly(march1, march2);
    // Only the month's rows moved; the other month stays where it was, and nothing was lost.
    assertThat(defaultIds()).doesNotContain(march1, march2).contains(april);
    assertThat(
            jdbc.queryForObject(
                "SELECT duration_ms FROM ui_test_executions WHERE id = ?", Integer.class, march2))
        .isEqualTo(2222);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(3);
  }

  @Test
  void isANoOpWhenThePartitionAlreadyExists() {
    PartitionManager manager = new PartitionManager(jdbc, "ui_test_executions");
    assertThat(manager.ensurePartition(MONTH)).isTrue();
    UUID row = insertExecution("2031-03-10 12:00:00+00", 1111);

    assertThat(manager.ensurePartition(MONTH)).isFalse();
    assertThat(jdbc.queryForList("SELECT id FROM " + PARTITION, UUID.class)).containsExactly(row);
  }

  private boolean partitionExists() {
    return Boolean.TRUE.equals(
        jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, PARTITION));
  }

  private List<UUID> defaultIds() {
    return jdbc.queryForList(
        "SELECT id FROM ui_test_executions_default WHERE ui_test_id = ?", UUID.class, testId);
  }

  private UUID insertExecution(String startedAt, int durationMs) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
            + " duration_ms, created_at) VALUES (?, ?, 'ERROR', ?::timestamptz,"
            + " ?::timestamptz + INTERVAL '4 seconds', ?, NOW())",
        id,
        testId,
        startedAt,
        startedAt,
        durationMs);
    return id;
  }
}

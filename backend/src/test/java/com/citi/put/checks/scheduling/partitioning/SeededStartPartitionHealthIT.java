package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Studio v1 gaps: {@code backend/scripts/dev.mjs --seed} starts {@code local,dev}, whose Flyway
 * locations include the seed. An earlier seed wrote current-month {@code ui_test_executions} during
 * migration, before any partition bootstrap, so they landed in DEFAULT and the current month's
 * partition could never be created, leaving {@code partitions} DOWN. The seed no longer writes
 * Studio history (results must come from real runs); {@link PartitionDefaultRowsIT} covers rows
 * already in DEFAULT directly. This keeps the seeded start itself honest, on an embedded database.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "dev"})
class SeededStartPartitionHealthIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired PartitionHealthIndicator partitionHealth;

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

  @Test
  void theSeededStartHasTheCurrentMonthAndHealthIsNotDown() {
    String current =
        "ui_test_executions_"
            + YearMonth.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy_MM"));

    assertThat(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, current))
        .as("%s exists after a seeded start", current)
        .isTrue();
    assertThat(partitionHealth.health().getStatus()).isNotEqualTo(Status.DOWN);
  }
}

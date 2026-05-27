package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class PartitionLifecycleIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;

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
  void ensurePartitionsCreatesMonthlyPartitionsForAllTables() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      PartitionManager pm = new PartitionManager(jdbc, table);
      List<String> created = pm.ensurePartitions(2);
      assertThat(created)
          .as("ensurePartitions should return partition names for %s", table)
          .isNotEmpty();
      assertThat(pm.countFuturePartitions())
          .as("Future partitions should exist for %s", table)
          .isGreaterThanOrEqualTo(1);
    }
  }

  @Test
  void pruneExpiredDoesNotRemoveRecentPartitions() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      PartitionManager pm = new PartitionManager(jdbc, table);
      int pruned = pm.pruneExpired(12);
      assertThat(pruned)
          .as("Nothing should be pruned for %s (all partitions are recent)", table)
          .isZero();
    }
  }

  @Test
  void healthCheckReportsUpForAllTables() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      PartitionManager pm = new PartitionManager(jdbc, table);
      PartitionManager.PartitionHealthStatus status = pm.checkHealth(3);
      assertThat(status.up()).as("Health should be up for %s", table).isTrue();
    }
  }

  @Test
  void listPartitionsIncludesDefaultPartition() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      Set<String> partitions = getPartitionNames(table);
      assertThat(partitions)
          .as("Partitions for %s should include default", table)
          .contains(table + "_default");
    }
  }

  private Set<String> getPartitionNames(String parentTable) {
    return new java.util.HashSet<>(
        jdbc
            .queryForList(
                """
                SELECT c.relname FROM pg_class c
                JOIN pg_inherits i ON c.oid = i.inhrelid
                WHERE i.inhparent = ?::regclass
                """,
                parentTable)
            .stream()
            .map(row -> (String) row.get("relname"))
            .toList());
  }
}

package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.List;
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
class PartitionConversionIT {

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
  void allThreeTablesArePartitioned() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      PartitionManager pm = new PartitionManager(jdbc, table);
      assertThat(pm.isPartitionedTable()).as("Table %s should be partitioned", table).isTrue();
    }
  }

  @Test
  void allThreeTablesHaveDefaultPartitions() {
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      Integer count =
          jdbc.queryForObject(
              """
              SELECT COUNT(*) FROM pg_class c
              JOIN pg_inherits i ON c.oid = i.inhrelid
              WHERE i.inhparent = ?::regclass AND c.relname = ?
              """,
              Integer.class,
              table,
              table + "_default");
      assertThat(count).as("Table %s should have a DEFAULT partition", table).isEqualTo(1);
    }
  }
}

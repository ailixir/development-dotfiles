package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
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
class RetentionPrunerConfigIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired RetentionPruner retentionPruner;

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
  void retentionZeroPrunesAllPastPartitions() {
    // Create an old partition
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS execution_results_2025_01"
            + " PARTITION OF execution_results"
            + " FOR VALUES FROM ('2025-01-01') TO ('2025-02-01')");

    // Prune with retention=0 — only current month and future survive
    retentionPruner.pruneWithRetention(0);

    YearMonth now = YearMonth.now(ZoneOffset.UTC);
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy_MM");
    String currentPartition = "execution_results_" + now.format(fmt);

    List<String> remaining = listPartitions().stream().map(r -> (String) r.get("relname")).toList();

    // Current month should still exist
    assertThat(remaining).contains(currentPartition);

    // Old partition should be gone
    assertThat(remaining).doesNotContain("execution_results_2025_01");
  }

  private List<Map<String, Object>> listPartitions() {
    return jdbc.queryForList(
        """
        SELECT c.relname FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        WHERE i.inhparent = 'execution_results'::regclass
        ORDER BY c.relname
        """);
  }
}

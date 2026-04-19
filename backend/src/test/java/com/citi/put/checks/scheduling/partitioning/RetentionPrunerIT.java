package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
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
class RetentionPrunerIT {

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
  void prunesOldPartition() {
    // Create an old partition (2 years ago)
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS execution_results_2024_01"
            + " PARTITION OF execution_results"
            + " FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')");

    // Verify it exists
    List<Map<String, Object>> before = listPartitions();
    assertThat(before.stream().map(r -> r.get("relname")).toList())
        .contains("execution_results_2024_01");

    // Prune with default retention (12 months) — 2024_01 is more than 12 months ago
    retentionPruner.pruneExpiredPartitions();

    // Verify it's gone
    List<Map<String, Object>> after = listPartitions();
    assertThat(after.stream().map(r -> r.get("relname")).toList())
        .doesNotContain("execution_results_2024_01");
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

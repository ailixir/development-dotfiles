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
class RetentionPrunerSkipCurrentIT {

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
  void doesNotPruneCurrentOrFuturePartitions() {
    YearMonth now = YearMonth.now(ZoneOffset.UTC);
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy_MM");

    String currentPartition = "execution_results_" + now.format(fmt);
    String futurePartition = "execution_results_" + now.plusMonths(1).format(fmt);

    retentionPruner.pruneExpiredPartitions();

    List<String> remaining = listPartitions().stream().map(r -> (String) r.get("relname")).toList();

    assertThat(remaining).contains(currentPartition);
    assertThat(remaining).contains(futurePartition);
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

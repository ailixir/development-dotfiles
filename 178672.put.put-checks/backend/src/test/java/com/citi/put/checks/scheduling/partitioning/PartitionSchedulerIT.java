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
class PartitionSchedulerIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired PartitionScheduler partitionScheduler;

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
  void schedulerCreatesPartitionsForNextTwoMonths() {
    partitionScheduler.createFuturePartitions();

    YearMonth now = YearMonth.now(ZoneOffset.UTC);
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy_MM");

    List<Map<String, Object>> partitions =
        jdbc.queryForList(
            """
            SELECT c.relname FROM pg_class c
            JOIN pg_inherits i ON c.oid = i.inhrelid
            WHERE i.inhparent = 'execution_results'::regclass
            ORDER BY c.relname
            """);

    List<String> names = partitions.stream().map(r -> (String) r.get("relname")).toList();

    for (int i = 0; i <= 2; i++) {
      String expected = "execution_results_" + now.plusMonths(i).format(fmt);
      assertThat(names).as("Partition for %s should exist", expected).contains(expected);
    }
  }
}

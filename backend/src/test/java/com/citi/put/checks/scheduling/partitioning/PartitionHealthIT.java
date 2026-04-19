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
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class PartitionHealthIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired PartitionHealthIndicator healthIndicator;

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
  void healthUpWhenPartitionsExist() {
    // Bootstrap already created current + next 2 months
    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(Status.UP);
  }

  @Test
  void healthDownWhenPartitionMissing() {
    // Drop the partition that covers NOW() + 3 days
    YearMonth targetMonth = YearMonth.from(java.time.LocalDate.now(ZoneOffset.UTC).plusDays(3));
    String partitionName =
        "execution_results_" + targetMonth.format(DateTimeFormatter.ofPattern("yyyy_MM"));

    // Detach the partition so it no longer serves as a partition
    try {
      jdbc.execute(
          "ALTER TABLE execution_results DETACH PARTITION " + partitionName + " CONCURRENTLY");
      jdbc.execute("DROP TABLE IF EXISTS " + partitionName);
    } catch (Exception e) {
      // Partition might not exist if +3 days is same month as current
      // and the current month partition was created by V1 migration
      jdbc.execute("DROP TABLE IF EXISTS " + partitionName);
    }

    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(Status.DOWN);
    assertThat(health.getDetails()).containsKey("missing_partition");
    assertThat(health.getDetails().get("missing_partition").toString()).contains(partitionName);

    // Recreate the partition for test cleanup
    String rangeStart = targetMonth.atDay(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
    String rangeEnd =
        targetMonth.plusMonths(1).atDay(1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS "
            + partitionName
            + " PARTITION OF execution_results FOR VALUES FROM ('"
            + rangeStart
            + "') TO ('"
            + rangeEnd
            + "')");
  }
}

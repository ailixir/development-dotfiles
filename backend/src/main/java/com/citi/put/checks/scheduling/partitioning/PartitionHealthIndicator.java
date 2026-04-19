package com.citi.put.checks.scheduling.partitioning;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component("partitions")
public class PartitionHealthIndicator implements HealthIndicator {

  private static final int LOOKAHEAD_DAYS = 3;

  private final JdbcTemplate jdbc;

  public PartitionHealthIndicator(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Health health() {
    PartitionManager manager = new PartitionManager(jdbc, "execution_results");
    PartitionManager.PartitionHealthStatus status = manager.checkHealth(LOOKAHEAD_DAYS);

    if (status.up()) {
      return Health.up().build();
    }

    return Health.down().withDetail("missing_partition", status.missingPartition()).build();
  }
}

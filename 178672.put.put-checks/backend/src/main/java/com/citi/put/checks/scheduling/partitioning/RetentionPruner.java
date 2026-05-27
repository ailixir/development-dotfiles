package com.citi.put.checks.scheduling.partitioning;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "checks.scheduling.retention-pruner-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class RetentionPruner {

  private static final Logger LOG = LoggerFactory.getLogger(RetentionPruner.class);

  private static final List<String> MANAGED_TABLES =
      List.of("execution_results", "ui_test_executions", "report_executions");

  private final JdbcTemplate jdbc;
  private final MeterRegistry meterRegistry;
  private final int retentionMonths;

  public RetentionPruner(
      JdbcTemplate jdbc,
      MeterRegistry meterRegistry,
      @Value("${checks.partitioning.retention-months:12}") int retentionMonths) {
    this.jdbc = jdbc;
    this.meterRegistry = meterRegistry;
    this.retentionMonths = retentionMonths;
  }

  @Scheduled(cron = "0 15 3 1 * ?")
  @SchedulerLock(name = "retentionPruner", lockAtMostFor = "30m", lockAtLeastFor = "1m")
  public void pruneExpiredPartitions() {
    LOG.info(
        "Retention pruner triggered — pruning partitions older than {} months", retentionMonths);

    for (String table : MANAGED_TABLES) {
      pruneTable(table);
    }
  }

  public void pruneWithRetention(int customRetentionMonths) {
    for (String table : MANAGED_TABLES) {
      PartitionManager manager = new PartitionManager(jdbc, table);
      int pruned = manager.pruneExpired(customRetentionMonths);
      recordMetrics(table, pruned);
    }
  }

  private void pruneTable(String table) {
    PartitionManager manager = new PartitionManager(jdbc, table);
    int pruned = manager.pruneExpired(retentionMonths);
    recordMetrics(table, pruned);
  }

  private void recordMetrics(String table, int pruned) {
    if (pruned > 0) {
      Counter.builder("checks.partitions.pruned_total")
          .tag("table", table)
          .register(meterRegistry)
          .increment(pruned);
    }
  }
}

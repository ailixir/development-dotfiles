package com.citi.put.checks.scheduling.partitioning;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
    name = "checks.scheduling.partition-scheduler-enabled",
    havingValue = "true",
    matchIfMissing = true)
public class PartitionScheduler {

  private static final Logger LOG = LoggerFactory.getLogger(PartitionScheduler.class);
  private static final int LOOKAHEAD_MONTHS = 2;

  private static final List<String> MANAGED_TABLES =
      List.of("execution_results", "ui_test_executions", "report_executions");

  private final JdbcTemplate jdbc;
  private final MeterRegistry meterRegistry;

  public PartitionScheduler(JdbcTemplate jdbc, MeterRegistry meterRegistry) {
    this.jdbc = jdbc;
    this.meterRegistry = meterRegistry;
  }

  @Scheduled(cron = "0 0 3 25 * ?")
  @SchedulerLock(name = "partitionCreator", lockAtMostFor = "10m", lockAtLeastFor = "30s")
  public void createFuturePartitions() {
    LOG.info(
        "Partition scheduler triggered — creating partitions for next {} months", LOOKAHEAD_MONTHS);

    for (String table : MANAGED_TABLES) {
      PartitionManager manager = new PartitionManager(jdbc, table);
      manager.ensurePartitions(LOOKAHEAD_MONTHS);
    }

    updateMetrics();
  }

  @EventListener(ApplicationReadyEvent.class)
  public void bootstrap() {
    LOG.info(
        "Partition bootstrap — ensuring current + {} future months of partitions",
        LOOKAHEAD_MONTHS);

    for (String table : MANAGED_TABLES) {
      PartitionManager manager = new PartitionManager(jdbc, table);
      manager.ensurePartitions(LOOKAHEAD_MONTHS);
    }

    updateMetrics();
  }

  private void updateMetrics() {
    PartitionManager executionResults = new PartitionManager(jdbc, "execution_results");
    meterRegistry.gauge(
        "partition.future_months_available", executionResults.countFuturePartitions());
  }
}

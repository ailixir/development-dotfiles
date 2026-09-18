package com.citi.put.checks.scheduling.partitioning;

import io.micrometer.core.instrument.MeterRegistry;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
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

  private final JdbcTemplate jdbc;
  private final MeterRegistry meterRegistry;
  private final PartitionBootstrap bootstrap;

  public PartitionScheduler(
      JdbcTemplate jdbc, MeterRegistry meterRegistry, PartitionBootstrap bootstrap) {
    this.jdbc = jdbc;
    this.meterRegistry = meterRegistry;
    this.bootstrap = bootstrap;
  }

  /**
   * Daily rather than once a month (it was {@code 0 0 3 25 * ?}): creation is idempotent and cheap,
   * and a single monthly attempt meant one missed run — a worker down at 03:00 on the 25th — left
   * the next month uncreated until someone restarted a pod.
   */
  @Scheduled(cron = "0 0 3 * * ?")
  @SchedulerLock(name = "partitionCreator", lockAtMostFor = "10m", lockAtLeastFor = "30s")
  public void createFuturePartitions() {
    LOG.info(
        "Partition scheduler triggered — creating partitions for next {} months",
        PartitionBootstrap.LOOKAHEAD_MONTHS);
    bootstrap.ensureAll();
    updateMetrics();
  }

  /** Publishes the gauge at startup, after {@link PartitionBootstrap} has run. */
  @EventListener(ApplicationReadyEvent.class)
  @Order(Ordered.LOWEST_PRECEDENCE)
  public void publishMetricsAtStartup() {
    updateMetrics();
  }

  private void updateMetrics() {
    PartitionManager executionResults = new PartitionManager(jdbc, "execution_results");
    meterRegistry.gauge(
        "partition.future_months_available", executionResults.countFuturePartitions());
  }
}

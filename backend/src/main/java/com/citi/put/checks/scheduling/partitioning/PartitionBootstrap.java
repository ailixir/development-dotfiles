package com.citi.put.checks.scheduling.partitioning;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ensures the current month's partitions (and the lookahead) exist on <b>every</b> pod at startup.
 *
 * <p>This used to live on {@link PartitionScheduler}, which only exists where {@code
 * checks.scheduling.partition-scheduler-enabled} is true — the worker, never the API. An API pod
 * therefore started with whatever partitions a worker had last created: on a fresh database it
 * reported {@code partitions} DOWN until a worker came up, and a Studio execute it accepted in that
 * window landed in the DEFAULT partition, which then blocked the month's partition from ever being
 * created. Creation is idempotent and serialised per table ({@link
 * PartitionManager#ensurePartition}), so every pod doing it is safe.
 *
 * <p>{@link ApplicationReadyEvent} listeners run before the readiness state flips to accepting
 * traffic, so a pod is not routed requests before this has run.
 */
@Component
public class PartitionBootstrap {

  private static final Logger LOG = LoggerFactory.getLogger(PartitionBootstrap.class);

  static final int LOOKAHEAD_MONTHS = 2;
  static final List<String> MANAGED_TABLES =
      List.of(
          "execution_results",
          "ui_test_executions",
          "report_executions",
          "studio_secret_use_audit",
          "studio_observed_secret_read_entries",
          "studio_observed_no_send_decisions",
          "studio_observed_terminal_secret_settlements");

  private final JdbcTemplate jdbc;

  public PartitionBootstrap(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @EventListener(ApplicationReadyEvent.class)
  @Order(Ordered.HIGHEST_PRECEDENCE)
  public void bootstrap() {
    LOG.info(
        "Partition bootstrap — ensuring current + {} future months of partitions",
        LOOKAHEAD_MONTHS);
    ensureAll();
  }

  /** Ensures current + {@link #LOOKAHEAD_MONTHS} for every managed table. */
  public void ensureAll() {
    for (String table : MANAGED_TABLES) {
      new PartitionManager(jdbc, table).ensurePartitions(LOOKAHEAD_MONTHS);
    }
  }
}

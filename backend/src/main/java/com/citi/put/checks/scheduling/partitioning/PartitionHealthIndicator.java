package com.citi.put.checks.scheduling.partitioning;

import java.util.List;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component("partitions")
public class PartitionHealthIndicator implements HealthIndicator {

  private static final int LOOKAHEAD_DAYS = 3;
  private static final List<String> MANAGED_TABLES =
      List.of(
          "execution_results",
          "ui_test_executions",
          "report_executions",
          "studio_secret_use_audit",
          "studio_observed_secret_read_entries",
          "studio_observed_no_send_decisions",
          "studio_observed_terminal_secret_settlements");

  private final JdbcTemplate jdbc;

  public PartitionHealthIndicator(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Health health() {
    Health.Builder builder = Health.up();
    boolean hasWarning = false;

    for (String table : MANAGED_TABLES) {
      PartitionManager manager = new PartitionManager(jdbc, table);
      PartitionManager.PartitionHealthStatus status = manager.checkHealth(LOOKAHEAD_DAYS);

      if (!status.up()) {
        return Health.down().withDetail("missing_partition", status.missingPartition()).build();
      }

      long defaultCount = countDefaultPartitionRows(table);
      if (defaultCount > 0) {
        hasWarning = true;
        builder.withDetail(
            table + "_default_rows",
            "data landed in default partition — missing monthly partition ("
                + defaultCount
                + " rows)");
      }
    }

    if (hasWarning) {
      return builder.status("WARNING").build();
    }
    return builder.build();
  }

  long countDefaultPartitionRows(String table) {
    String defaultPartition = table + "_default";
    try {
      Integer exists =
          jdbc.queryForObject(
              """
              SELECT COUNT(*) FROM pg_class c
              JOIN pg_inherits i ON c.oid = i.inhrelid
              WHERE i.inhparent = ?::regclass AND c.relname = ?
              """,
              Integer.class,
              table,
              defaultPartition);
      if (exists == null || exists == 0) {
        return 0;
      }
      Long count = jdbc.queryForObject("SELECT COUNT(*) FROM " + defaultPartition, Long.class);
      return count != null ? count : 0;
    } catch (Exception e) {
      return 0;
    }
  }
}

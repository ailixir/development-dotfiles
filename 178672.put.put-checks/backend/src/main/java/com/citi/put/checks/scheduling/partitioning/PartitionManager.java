package com.citi.put.checks.scheduling.partitioning;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

public class PartitionManager {

  private static final Logger LOG = LoggerFactory.getLogger(PartitionManager.class);
  private static final DateTimeFormatter PARTITION_FMT = DateTimeFormatter.ofPattern("yyyy_MM");
  private static final DateTimeFormatter SQL_DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

  private static final Set<String> ALLOWED_TABLES =
      Set.of("execution_results", "ui_test_executions", "report_executions");

  private final JdbcTemplate jdbc;
  private final String parentTable;

  public PartitionManager(JdbcTemplate jdbc, String parentTable) {
    if (!ALLOWED_TABLES.contains(parentTable)) {
      throw new IllegalArgumentException("Unknown partitioned table: " + parentTable);
    }
    this.jdbc = jdbc;
    this.parentTable = parentTable;
  }

  public boolean isPartitionedTable() {
    try {
      Integer count =
          jdbc.queryForObject(
              """
              SELECT COUNT(*) FROM pg_partitioned_table pt
              JOIN pg_class c ON c.oid = pt.partrelid
              WHERE c.relname = ?
              """,
              Integer.class,
              parentTable);
      return count != null && count > 0;
    } catch (Exception e) {
      LOG.debug("Table {} does not exist or is not partitioned: {}", parentTable, e.getMessage());
      return false;
    }
  }

  public List<String> ensurePartitions(int lookaheadMonths) {
    if (!isPartitionedTable()) {
      LOG.debug(
          "Skipping partition creation for {} — table not partitioned or missing", parentTable);
      return List.of();
    }

    YearMonth current = YearMonth.now(ZoneOffset.UTC);
    List<String> created = new ArrayList<>();

    for (int i = 0; i <= lookaheadMonths; i++) {
      YearMonth month = current.plusMonths(i);
      String partitionName = parentTable + "_" + month.format(PARTITION_FMT);
      String rangeStart = month.atDay(1).format(SQL_DATE_FMT);
      String rangeEnd = month.plusMonths(1).atDay(1).format(SQL_DATE_FMT);

      String ddl =
          "CREATE TABLE IF NOT EXISTS "
              + partitionName
              + " PARTITION OF "
              + parentTable
              + " FOR VALUES FROM ('"
              + rangeStart
              + "') TO ('"
              + rangeEnd
              + "')";

      try {
        jdbc.execute(ddl);
        created.add(partitionName);
        LOG.info("partition_created table={} range=[{}, {})", partitionName, rangeStart, rangeEnd);
      } catch (Exception e) {
        LOG.error("Failed to create partition {}: {}", partitionName, e.getMessage());
      }
    }

    return created;
  }

  public PartitionHealthStatus checkHealth(int lookaheadDays) {
    if (!isPartitionedTable()) {
      return new PartitionHealthStatus(true, null);
    }

    YearMonth targetMonth =
        YearMonth.from(java.time.LocalDate.now(ZoneOffset.UTC).plusDays(lookaheadDays));
    String expectedPartition = parentTable + "_" + targetMonth.format(PARTITION_FMT);

    Set<String> existingPartitions = listPartitions();

    if (existingPartitions.contains(expectedPartition)) {
      return new PartitionHealthStatus(true, null);
    }
    return new PartitionHealthStatus(false, expectedPartition);
  }

  public int countFuturePartitions() {
    if (!isPartitionedTable()) {
      return 0;
    }

    YearMonth current = YearMonth.now(ZoneOffset.UTC);
    String currentPartition = parentTable + "_" + current.format(PARTITION_FMT);

    Set<String> partitions = listPartitions();
    return (int) partitions.stream().filter(p -> p.compareTo(currentPartition) > 0).count();
  }

  public int pruneExpired(int retentionMonths) {
    if (!isPartitionedTable()) {
      LOG.debug(
          "Skipping partition pruning for {} — table not partitioned or missing", parentTable);
      return 0;
    }

    YearMonth cutoff = YearMonth.now(ZoneOffset.UTC).minusMonths(retentionMonths);
    String cutoffPartition = parentTable + "_" + cutoff.format(PARTITION_FMT);
    Set<String> partitions = listPartitions();
    int pruned = 0;

    for (String partition : partitions) {
      if (partition.compareTo(cutoffPartition) >= 0) {
        continue;
      }

      try {
        try {
          jdbc.execute(
              "ALTER TABLE " + parentTable + " DETACH PARTITION " + partition + " CONCURRENTLY");
        } catch (Exception concurrentEx) {
          LOG.debug(
              "DETACH CONCURRENTLY failed for {}, falling back to blocking DETACH", partition);
          jdbc.execute("ALTER TABLE " + parentTable + " DETACH PARTITION " + partition);
        }
        jdbc.execute("DROP TABLE " + partition);
        LOG.info("partition_pruned table={} action=detach_drop", partition);
        pruned++;
      } catch (Exception e) {
        LOG.warn("partition_prune_skipped table={} reason={}", partition, e.getMessage());
      }
    }

    return pruned;
  }

  private Set<String> listPartitions() {
    return jdbc
        .queryForList(
            """
            SELECT c.relname FROM pg_class c
            JOIN pg_inherits i ON c.oid = i.inhrelid
            WHERE i.inhparent = ?::regclass
            """,
            parentTable)
        .stream()
        .map(row -> (String) row.get("relname"))
        .collect(Collectors.toSet());
  }

  public record PartitionHealthStatus(boolean up, String missingPartition) {}
}

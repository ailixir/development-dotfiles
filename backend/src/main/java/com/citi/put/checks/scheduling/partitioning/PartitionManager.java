package com.citi.put.checks.scheduling.partitioning;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

  /** The range-partition key of each managed table (V1, V7). */
  private static final Map<String, String> PARTITION_KEYS =
      Map.of(
          "execution_results", "started_at",
          "ui_test_executions", "started_at",
          "report_executions", "executed_at");

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

  /**
   * Ensures the monthly partitions for the current UTC month and the next {@code lookaheadMonths}.
   *
   * <p>Returns the names of every partition that exists for that window once the call is done,
   * whether it created them or found them.
   */
  public List<String> ensurePartitions(int lookaheadMonths) {
    if (!isPartitionedTable()) {
      LOG.debug(
          "Skipping partition creation for {} — table not partitioned or missing", parentTable);
      return List.of();
    }

    YearMonth current = YearMonth.now(ZoneOffset.UTC);
    List<String> ensured = new ArrayList<>();

    for (int i = 0; i <= lookaheadMonths; i++) {
      YearMonth month = current.plusMonths(i);
      String partitionName = partitionName(month);
      try {
        ensurePartition(month);
        ensured.add(partitionName);
      } catch (Exception e) {
        LOG.error("Failed to create partition {}: {}", partitionName, e.getMessage());
      }
    }

    return ensured;
  }

  /**
   * Creates the partition for {@code month} unless it already exists, moving any rows for that
   * month out of the DEFAULT partition into it.
   *
   * <p><b>Why the move.</b> A bare {@code CREATE TABLE … PARTITION OF … FOR VALUES …} fails while
   * the DEFAULT partition holds a row inside the new range ("updated partition constraint for
   * default partition would be violated"). Any insert that lands before the month's partition
   * exists — the dev seed (Flyway runs before any bootstrap), an API pod accepting a run before a
   * worker has bootstrapped, a missed monthly run — therefore used to make the month permanently
   * uncreatable, and the partition health indicator DOWN for good.
   *
   * <p>One {@code DO} block is one statement and so one transaction: the rows are copied aside,
   * deleted from DEFAULT, the partition is created and the rows are re-inserted through the parent,
   * or none of it happens. A transaction-scoped advisory lock per parent table serialises
   * concurrent callers (every pod bootstraps), and the existence check is repeated under it.
   *
   * @return {@code true} when the partition was absent before the call and exists after it
   */
  boolean ensurePartition(YearMonth month) {
    String partitionName = partitionName(month);
    if (listPartitions().contains(partitionName)) {
      return false;
    }
    String rangeStart = month.atDay(1).format(SQL_DATE_FMT);
    String rangeEnd = month.plusMonths(1).atDay(1).format(SQL_DATE_FMT);
    String defaultPartition = parentTable + "_default";
    String partitionKey = PARTITION_KEYS.get(parentTable);
    String staging = "partition_move_" + partitionName;

    // Every interpolated value is a whitelisted table name, a name derived from it, or a date this
    // class formatted; inside the block they are quoted again with %I / %L.
    String block =
        """
        DO $partition$
        DECLARE
          cols  text;
          moved bigint := 0;
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtext('checks-partition:' || '%1$s'));
          IF to_regclass('%2$s') IS NOT NULL THEN
            RETURN;
          END IF;
          IF to_regclass('%3$s') IS NOT NULL THEN
            SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
              FROM pg_attribute
             WHERE attrelid = '%1$s'::regclass AND attnum > 0 AND NOT attisdropped;
            EXECUTE format('CREATE TEMP TABLE %%I ON COMMIT DROP AS SELECT %%s FROM %%I'
                           || ' WHERE %%I >= %%L AND %%I < %%L',
                           '%6$s', cols, '%3$s', '%7$s', '%4$s', '%7$s', '%5$s');
            EXECUTE format('DELETE FROM %%I WHERE %%I >= %%L AND %%I < %%L',
                           '%3$s', '%7$s', '%4$s', '%7$s', '%5$s');
            GET DIAGNOSTICS moved = ROW_COUNT;
          END IF;
          EXECUTE format('CREATE TABLE %%I PARTITION OF %%I FOR VALUES FROM (%%L) TO (%%L)',
                         '%2$s', '%1$s', '%4$s', '%5$s');
          IF moved > 0 THEN
            EXECUTE format('INSERT INTO %%I (%%s) SELECT %%s FROM %%I', '%1$s', cols, cols, '%6$s');
            RAISE NOTICE 'partition %% created with %% row(s) moved from %%', '%2$s', moved, '%3$s';
          END IF;
        END
        $partition$
        """
            .formatted(
                parentTable,
                partitionName,
                defaultPartition,
                rangeStart,
                rangeEnd,
                staging,
                partitionKey);

    jdbc.execute(block);
    boolean created = listPartitions().contains(partitionName);
    LOG.info(
        "partition_created table={} range=[{}, {}) present={}",
        partitionName,
        rangeStart,
        rangeEnd,
        created);
    return created;
  }

  private String partitionName(YearMonth month) {
    return parentTable + "_" + month.format(PARTITION_FMT);
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

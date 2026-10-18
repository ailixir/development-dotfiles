package com.citi.put.checks.studio.guided.retention;

import java.sql.SQLException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Prunes the sanitized observations and model output of terminal guided sessions after the
 * retention window (STUDIO-OBS-014 AC-3, ruling AR-2 b, PO X6).
 *
 * <p>Thin on purpose, beside {@code GuidedSessionReaper}: every rule lives in the V19 SQL function
 * {@code studio_guided_prune_session}, which re-judges the predicate (terminal state, not yet
 * pruned, {@code expires_at + window} passed on the database clock) under the session row lock,
 * keeps only the retained progress keys, nulls terminal attempts' {@code safe_result} and deletes
 * the publication copies of a session that never published. This class only selects candidates in
 * one short transaction and calls the function once per session, each in its own transaction. The
 * core partition {@code RetentionPruner} is not used: these tables are not partitioned.
 *
 * <p>A failure on one session is logged with its id and SQLState only, never a message or a row
 * value, and does not stop the batch.
 */
public class GuidedObservationPruner {

  private static final Logger LOG = LoggerFactory.getLogger(GuidedObservationPruner.class);

  private static final String CANDIDATES =
      "SELECT session_id FROM studio_guided_sessions WHERE pruned_at IS NULL AND state IN"
          + " ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')"
          + " AND expires_at + ?::interval <= clock_timestamp() ORDER BY expires_at LIMIT ?"
          + " FOR UPDATE SKIP LOCKED";

  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;
  private final GuidedRetentionProperties properties;

  public GuidedObservationPruner(
      JdbcTemplate jdbc, TransactionTemplate transactions, GuidedRetentionProperties properties) {
    this.jdbc = jdbc;
    this.transactions = transactions;
    this.properties = properties;
  }

  @Scheduled(
      fixedDelayString = "${studio.guided-authoring.retention.pruner-delay-ms:3600000}",
      initialDelayString = "${studio.guided-authoring.retention.pruner-delay-ms:3600000}")
  public void scheduledPass() {
    pruneOnce();
  }

  /**
   * One pass.
   *
   * @return the number of sessions pruned in this pass
   */
  public int pruneOnce() {
    String window = properties.intervalLiteral();
    List<String> candidates =
        transactions.execute(
            status -> jdbc.queryForList(CANDIDATES, String.class, window, properties.batchSize()));
    int pruned = 0;
    for (String sessionId : candidates == null ? List.<String>of() : candidates) {
      try {
        Boolean done =
            transactions.execute(
                status ->
                    jdbc.queryForObject(
                        "SELECT studio_guided_prune_session(?, ?::interval)",
                        Boolean.class,
                        sessionId,
                        window));
        if (Boolean.TRUE.equals(done)) {
          pruned++;
        }
      } catch (DataAccessException failure) {
        LOG.warn(
            "Guided observation prune failed for session {} with SQLState {}",
            sessionId,
            sqlState(failure));
      }
    }
    return pruned;
  }

  private static String sqlState(DataAccessException failure) {
    Throwable cause = failure;
    while (cause != null) {
      if (cause instanceof SQLException sql && sql.getSQLState() != null) {
        return sql.getSQLState();
      }
      cause = cause.getCause();
    }
    return "unknown";
  }
}

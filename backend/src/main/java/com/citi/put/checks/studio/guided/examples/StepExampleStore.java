package com.citi.put.checks.studio.guided.examples;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * SQL for the example store. The insert guard is the V35 trigger; whether a stored example may
 * still be used is derived here from the live receipts and the test's head revision (V34).
 */
@Repository
public class StepExampleStore {
  private static final String SELECT =
      "SELECT e.id, e.csi_id, e.step_text, e.origin_host, e.code, e.created_at";
  private static final String ELIGIBLE =
      """
       FROM studio_step_examples e
       JOIN studio_step_receipts r
         ON r.revision_id = e.revision_id AND r.step_ordinal = e.step_ordinal
        AND r.status = 'PASSED' AND r.step_hash = e.step_hash
       JOIN ui_test_revisions v ON v.id = e.revision_id
       JOIN ui_tests t ON t.id = v.test_id AND t.deleted_at IS NULL
        AND (e.revision_id = t.confirmed_revision_id OR e.revision_id = t.candidate_revision_id)
      """;

  private final JdbcTemplate jdbc;

  public StepExampleStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** A stored example with its ranking inputs. */
  public record Candidate(
      UUID id, String csiId, String stepText, String originHost, String code, Instant createdAt) {}

  /** An example to store. The V35 trigger refuses it without a matching PASSED receipt. */
  public record NewExample(
      String csiId,
      UUID revisionId,
      int stepOrdinal,
      UUID proofExecutionId,
      String stepHash,
      String sourceHash,
      String stepText,
      String originHost,
      String code) {}

  /**
   * @return false when the revision step already has an example
   */
  public boolean insert(NewExample e) {
    return jdbc.update(
            "INSERT INTO studio_step_examples (csi_id, revision_id, step_ordinal,"
                + " proof_execution_id, step_hash, source_hash, step_text, origin_host, code)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (revision_id, step_ordinal)"
                + " DO NOTHING",
            e.csiId(),
            e.revisionId(),
            e.stepOrdinal(),
            e.proofExecutionId(),
            e.stepHash(),
            e.sourceHash(),
            e.stepText(),
            e.originHost(),
            e.code())
        > 0;
  }

  /** Eligible examples of every CSI, for a snapshot freeze. */
  public List<Candidate> eligibleAll() {
    return jdbc.query(
        SELECT + ELIGIBLE + " ORDER BY e.created_at, e.id", StepExampleStore::candidate);
  }

  /** All members of a snapshot, in id order; empty when the snapshot does not exist. */
  public Optional<List<Candidate>> allSnapshotMembers(UUID snapshotId) {
    if (!snapshotExists(snapshotId)) {
      return Optional.empty();
    }
    return Optional.of(
        jdbc.query(
            SELECT
                + " FROM studio_step_example_snapshots s JOIN studio_step_examples e"
                + " ON e.id = ANY(s.example_ids) WHERE s.id = ? ORDER BY e.id",
            StepExampleStore::candidate,
            snapshotId));
  }

  public boolean snapshotExists(UUID snapshotId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM studio_step_example_snapshots WHERE id = ?)",
            Boolean.class,
            snapshotId));
  }

  /** Stores one frozen snapshot row. */
  public UUID insertSnapshot(String hash, List<UUID> sortedIds) {
    return jdbc.execute(
        (java.sql.Connection connection) -> {
          Array ids = connection.createArrayOf("uuid", sortedIds.toArray());
          try (var statement =
              connection.prepareStatement(
                  "INSERT INTO studio_step_example_snapshots (snapshot_hash, example_ids)"
                      + " VALUES (?, ?) RETURNING id")) {
            statement.setString(1, hash);
            statement.setArray(2, ids);
            try (ResultSet result = statement.executeQuery()) {
              result.next();
              return result.getObject(1, UUID.class);
            }
          } finally {
            ids.free();
          }
        });
  }

  private static Candidate candidate(ResultSet rs, int row) throws SQLException {
    return new Candidate(
        rs.getObject("id", UUID.class),
        rs.getString("csi_id"),
        rs.getString("step_text"),
        rs.getString("origin_host"),
        rs.getString("code"),
        rs.getTimestamp("created_at").toInstant());
  }
}

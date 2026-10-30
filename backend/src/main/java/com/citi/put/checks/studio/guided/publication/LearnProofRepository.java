package com.citi.put.checks.studio.guided.publication;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * SQL for {@code studio_learn_proofs} (V27): one immutable row per published session, naming either
 * its proof execution or the closed code that refused it. The row is written inside the publication
 * transaction and only ever read afterwards.
 */
public final class LearnProofRepository {
  private final JdbcTemplate jdbc;

  public LearnProofRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** The stored link: exactly one of {@code executionId} and {@code refusalCode} is set. */
  public record Link(UUID revisionId, UUID executionId, String refusalCode) {}

  public Optional<Link> find(String sessionId) {
    return jdbc
        .query(
            "SELECT revision_id,execution_id,refusal_code FROM studio_learn_proofs"
                + " WHERE session_id=?",
            (rs, n) ->
                new Link(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3)),
            sessionId)
        .stream()
        .findFirst();
  }

  public void insert(String sessionId, UUID revisionId, UUID executionId, String refusalCode) {
    jdbc.update(
        "INSERT INTO studio_learn_proofs (session_id,revision_id,execution_id,refusal_code)"
            + " VALUES (?,?,?,?)",
        sessionId,
        revisionId,
        executionId,
        refusalCode);
  }
}

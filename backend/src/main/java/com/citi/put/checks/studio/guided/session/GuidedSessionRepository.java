package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** All session mutations serialize on one PostgreSQL row; idempotency is in the same commit. */
public final class GuidedSessionRepository {
  private static final String TERMINAL_STATES =
      "('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')";
  private static final String PENDING_TEARDOWN =
      " AND progress->>'teardownStatus'='PENDING' AND progress->'teardownRequest' IS NOT NULL";
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;
  private final GuidedContracts contracts;

  public GuidedSessionRepository(
      JdbcTemplate jdbc, TransactionTemplate transactions, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.transactions = transactions;
    this.contracts = contracts;
  }

  public GuidedIncrementalStore incremental() {
    return new GuidedIncrementalStore(jdbc, contracts);
  }

  public <T> T transaction(Supplier<T> operation) {
    return transactions.execute(s -> operation.get());
  }

  public record Session(ObjectNode document, ObjectNode progress) {}

  public Session lock(String id) {
    var rows =
        jdbc.query(
            "SELECT document::text,progress::text FROM studio_guided_sessions WHERE "
                + "session_id=? FOR UPDATE",
            (rs, n) ->
                new Session(
                    (ObjectNode) contracts.parse(rs.getString(1)),
                    (ObjectNode) contracts.parse(rs.getString(2))),
            id);
    if (rows.isEmpty()) {
      throw new GuidedSessionException("FORBIDDEN_SCOPE", 403);
    }
    return rows.getFirst();
  }

  public void insert(ObjectNode doc) {
    jdbc.update(
        "INSERT INTO studio_guided_sessions"
            + "(session_id,test_id,principal_id,scope_hash,state,expires_at,document)"
            + " VALUES (?,?,?,?,?,?,?::jsonb)",
        doc.path("sessionId").asText(),
        doc.path("testId").asText(),
        doc.path("scope").path("principalId").asText(),
        doc.path("scopeHash").asText(),
        doc.path("state").asText(),
        Timestamp.from(Instant.parse(doc.path("expiresAt").asText())),
        doc.toString());
  }

  public void save(Session session) {
    contracts.validate("session", session.document());
    jdbc.update(
        "UPDATE studio_guided_sessions SET state=?,document=?::jsonb,progress=?::jsonb "
            + "WHERE session_id=?",
        session.document().path("state").asText(),
        session.document().toString(),
        session.progress().toString(),
        session.document().path("sessionId").asText());
  }

  /** Caller holds the same-owner live session lock; renewal leaves progress unchanged. */
  public void saveRenewalAndCommand(Session session, String key, String digest) {
    GuidedSessionException.require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    contracts.validate("session", session.document());
    writeRenewalAndCommand(session, key, digest);
  }

  private void writeRenewalAndCommand(Session session, String key, String digest) {
    String document = session.document().toString();
    int inserted =
        jdbc.update(
            "WITH updated AS (UPDATE studio_guided_sessions SET state=?,document=?::jsonb"
                + " WHERE session_id=? RETURNING session_id,document)"
                + " INSERT INTO studio_guided_commands(namespace,route,idempotency_key,request_digest,response)"
                + " SELECT session_id,'claim',?,?,document FROM updated",
            session.document().path("state").asText(),
            document,
            session.document().path("sessionId").asText(),
            key,
            digest);
    GuidedSessionException.require(inserted == 1, "FORBIDDEN_SCOPE", 403);
  }

  public void namespaceLock(String namespace) {
    jdbc.queryForObject(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))", Object.class, namespace);
  }

  public JsonNode duplicate(String namespace, String route, String key, String digest) {
    var found =
        jdbc.query(
            "SELECT request_digest,response::text FROM studio_guided_commands"
                + " WHERE namespace=? AND route=? AND idempotency_key=?",
            (rs, n) -> {
              GuidedSessionException.require(
                  rs.getString(1).equals(digest), "IDEMPOTENCY_CONFLICT", 409);
              return contracts.parse(rs.getString(2));
            },
            namespace,
            route,
            key);
    return found.isEmpty() ? null : found.getFirst();
  }

  public void command(
      String namespace, String route, String key, String digest, JsonNode response) {
    jdbc.update(
        "INSERT INTO studio_guided_commands VALUES (?,?,?,?,?::jsonb)",
        namespace,
        route,
        key,
        digest,
        response.toString());
  }

  public void insertAction(ObjectNode action, JsonNode proposal) {
    contracts.validate("action", proposal);
    GuidedSessionException.require(
        GuidedContracts.hash(proposal).equals(action.path("requestDigest").asText()),
        "INVALID_CONTRACT",
        422);
    contracts.validate("ledger", action);
    jdbc.update(
        "INSERT INTO studio_guided_actions "
            + "(admission_id,session_id,step_id,ordinal,attempt_ordinal,document,proposal) VALUES "
            + "(?,?,?,?,?,?::jsonb,?::jsonb)",
        action.path("admission").path("admissionId").asText(),
        action.path("sessionId").asText(),
        action.path("coordinate").path("stepId").asText(),
        action.path("coordinate").path("ordinal").asInt(),
        action.path("attemptOrdinal").asInt(),
        action.toString(),
        proposal.toString());
  }

  public List<ObjectNode> actions(String sessionId) {
    return jdbc.query(
        "SELECT document::text FROM studio_guided_actions WHERE session_id=? ORDER BY "
            + "step_id,ordinal,attempt_ordinal",
        (rs, n) -> (ObjectNode) contracts.parse(rs.getString(1)),
        sessionId);
  }

  public List<ObjectNode> effectiveActions(String id) {
    var facts = incremental();
    return actions(id).stream().filter(action -> !facts.excluded(id, action)).toList();
  }

  public JsonNode proposal(String admission) {
    return contracts.parse(
        jdbc.queryForObject(
            "SELECT proposal::text FROM studio_guided_actions WHERE admission_id=?",
            String.class,
            admission));
  }

  public void saveAction(ObjectNode action) {
    contracts.validate("ledger", action);
    saveActionBody(action);
  }

  void saveAction(ObjectNode action, GuidedActionLedger.PreparedReport prepared) {
    if (!GuidedActionLedger.successfulSchemaMatches(prepared, action, contracts)) {
      saveAction(action);
      return;
    }
    GuidedContracts.canonical(action);
    saveActionBody(action);
  }

  private void saveActionBody(ObjectNode action) {
    jdbc.update(
        "UPDATE studio_guided_actions SET document=?::jsonb WHERE admission_id=?",
        action.toString(),
        action.path("admission").path("admissionId").asText());
  }

  public List<String> expired(Instant now) {
    return jdbc.queryForList(
        "SELECT session_id FROM studio_guided_sessions WHERE expires_at<=? AND state NOT IN"
            + " ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')",
        String.class,
        Timestamp.from(now));
  }

  /**
   * STUDIO-OBS-015 H8: terminal sessions whose durable stop request is still unacknowledged and
   * whose hard expiry is inside the re-drive window. No jsonb {@code ?} operator: pgjdbc would read
   * it as a placeholder.
   */
  public List<String> pendingTeardowns(Instant now, Duration window, int limit) {
    return jdbc.queryForList(
        "SELECT session_id FROM studio_guided_sessions WHERE state IN "
            + TERMINAL_STATES
            + PENDING_TEARDOWN
            + " AND expires_at>? ORDER BY expires_at LIMIT ?",
        String.class,
        Timestamp.from(now.minus(window)),
        limit);
  }

  /**
   * STUDIO-OBS-015 aria-warn-ruling01: the number of unacknowledged teardowns whose re-drive window
   * has passed; no identifiers. A pruned row cannot hold a teardownRequest (prune guard), so {@code
   * pruned_at IS NULL} only narrows the scan to ix_guided_session_prune.
   */
  public int abandonedTeardowns(Instant now, Duration window) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_sessions WHERE pruned_at IS NULL AND state IN "
                + TERMINAL_STATES
                + PENDING_TEARDOWN
                + " AND expires_at<=?",
            Integer.class,
            Timestamp.from(now.minus(window)));
    return count == null ? 0 : count;
  }

  /** The durable value-free stop request while teardown is still unacknowledged, else null. */
  public JsonNode teardownRequest(String id) {
    var rows =
        jdbc.query(
            "SELECT progress->'teardownRequest' FROM studio_guided_sessions WHERE session_id=?"
                + " AND state IN "
                + TERMINAL_STATES
                + PENDING_TEARDOWN,
            (rs, n) -> rs.getString(1),
            id);
    return rows.isEmpty() || rows.getFirst() == null ? null : contracts.parse(rows.getFirst());
  }

  public void finalizationIdentity(String id, String hash) {
    jdbc.update(
        "UPDATE studio_guided_sessions SET finalization_identity=? WHERE session_id=?", hash, id);
  }

  public void evidence(String id, String scope, String evidenceId, String ref) {
    jdbc.update(
        "INSERT INTO studio_guided_evidence VALUES (?,?,?,'guided',?)", id, evidenceId, scope, ref);
  }
}

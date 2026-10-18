package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Immutable assignment intent precedes any transport or worker claim. Session lock is held. */
public final class GuidedAssignmentStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedAssignmentStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public ObjectNode prepare(JsonNode session, String workerId) {
    require(
        workerId != null
            && !workerId.isBlank()
            && workerId.length() <= 256
            && !workerId.equals("unclaimed"),
        "INVALID_CONTRACT",
        422);
    String id = session.path("sessionId").asText();
    ObjectNode existing = find(id);
    if (existing != null) {
      require(existing.path("workerId").asText().equals(workerId), "IDEMPOTENCY_CONFLICT", 409);
      return existing;
    }
    require(
        session.path("state").asText().equals("PREPARING")
            && session.path("owner").path("workerId").asText().equals("unclaimed")
            && session.path("owner").path("fence").asInt() < Integer.MAX_VALUE,
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id)
            == 0,
        "RUNTIME_INCOMPATIBLE",
        409);
    ObjectNode intent =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("assignmentId", UUID.randomUUID().toString())
            .put("sessionId", id)
            .put("workerId", workerId)
            .put("scopeHash", session.path("scopeHash").asText())
            .put("sourceRevision", session.path("scope").path("sourceRevision").asText())
            .put(
                "configurationRevision",
                session.path("scope").path("configurationRevision").asText())
            .put("expectedFence", session.path("owner").path("fence").asInt())
            .put("expiresAt", session.path("expiresAt").asText());
    intent.set("versions", session.path("versions"));
    contracts.validate("v3/assignment", intent);
    jdbc.update(
        "INSERT INTO studio_guided_assignments"
            + "(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent)"
            + " VALUES (?,?,?,?,?,?::jsonb)",
        id,
        intent.path("assignmentId").asText(),
        intent.path("scopeHash").asText(),
        workerId,
        intent.path("expectedFence").asInt(),
        intent.toString());
    return intent;
  }

  public ObjectNode find(String id) {
    var rows =
        jdbc.queryForList(
            "SELECT intent::text FROM studio_guided_assignments WHERE session_id=?",
            String.class,
            id);
    return rows.isEmpty() ? null : (ObjectNode) contracts.parse(rows.getFirst());
  }

  public void authorizeClaim(JsonNode session, String worker, Instant now) {
    String id = session.path("sessionId").asText();
    JsonNode intent = find(id);
    require(
        intent != null && intent.path("workerId").asText().equals(worker) && live(id),
        "FORBIDDEN_SCOPE",
        403);
    JsonNode owner = session.path("owner");
    long base = intent.path("expectedFence").asLong();
    require(
        owner.path("fence").asLong() == base && owner.path("workerId").asText().equals("unclaimed")
            || owner.path("fence").asLong() == base + 1
                && owner.path("workerId").asText().equals(worker)
                && Instant.parse(owner.path("leaseExpiresAt").asText()).isAfter(now),
        "STALE_FENCE",
        409);
    require(
        intent.path("scopeHash").equals(session.path("scopeHash"))
            && intent.path("sourceRevision").equals(session.path("scope").path("sourceRevision"))
            && intent
                .path("configurationRevision")
                .equals(session.path("scope").path("configurationRevision"))
            && intent.path("versions").equals(session.path("versions"))
            && intent.path("expiresAt").equals(session.path("expiresAt")),
        "REVISION_CONFLICT",
        409);
  }

  public void acknowledge(JsonNode session, JsonNode receipt, Instant now) {
    contracts.validate("v3/assignment-receipt", receipt);
    String id = session.path("sessionId").asText();
    JsonNode intent = find(id);
    require(
        intent != null && intent.equals(receipt.path("assignment")) && live(id),
        "STALE_FENCE",
        409);
    require(
        receipt.path("status").asText().equals("OWNED")
            && receipt.path("ownerFence").asLong() == intent.path("expectedFence").asLong() + 1
            && receipt.path("ownerFence").equals(session.path("owner").path("fence"))
            && intent.path("workerId").equals(session.path("owner").path("workerId")),
        "STALE_FENCE",
        409);
    Instant lease = Instant.parse(receipt.path("leaseExpiresAt").asText());
    require(
        lease.isAfter(now)
            && !lease.isAfter(Instant.parse(session.path("owner").path("leaseExpiresAt").asText()))
            && !lease.isAfter(Instant.parse(session.path("expiresAt").asText())),
        "EXPIRED",
        409);
    // The first receipt proves the actor join, never future lease authority. Renewal stays in
    // owner.
    jdbc.update(
        "UPDATE studio_guided_assignments SET receipt=?::jsonb WHERE session_id=? AND receipt IS NULL",
        receipt.toString(),
        id);
  }

  public void requireOwned(JsonNode session) {
    String id = session.path("sessionId").asText();
    var receipts =
        jdbc.queryForList(
            "SELECT receipt::text FROM studio_guided_assignments WHERE session_id=? AND live AND receipt IS NOT NULL",
            String.class,
            id);
    require(receipts.size() == 1, "RUNTIME_INCOMPATIBLE", 409);
    JsonNode receipt = contracts.parse(receipts.getFirst());
    require(
        receipt.path("status").asText().equals("OWNED")
            && receipt.path("ownerFence").equals(session.path("owner").path("fence"))
            && receipt
                .path("assignment")
                .path("workerId")
                .equals(session.path("owner").path("workerId")),
        "STALE_FENCE",
        409);
  }

  public void verifyLifecycle(JsonNode session, String worker, JsonNode intent) {
    JsonNode stored = find(session.path("sessionId").asText());
    require(
        stored != null && stored.equals(intent) && stored.path("workerId").asText().equals(worker),
        "FORBIDDEN_SCOPE",
        403);
    long base = stored.path("expectedFence").asLong();
    JsonNode owner = session.path("owner");
    require(
        owner.path("fence").asLong() == base && owner.path("workerId").asText().equals("unclaimed")
            || owner.path("fence").asLong() == base + 1
                && owner.path("workerId").asText().equals(worker),
        "STALE_FENCE",
        409);
  }

  private boolean live(String id) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT live FROM studio_guided_assignments WHERE session_id=?", Boolean.class, id));
  }

  public void stop(String id) {
    jdbc.update("UPDATE studio_guided_assignments SET live=false WHERE session_id=?", id);
  }
}

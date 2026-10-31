package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Network proof is authenticated by the runner transport before this short persistence transaction.
 */
public final class GuidedPreparationStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedPreparationStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public boolean store(JsonNode proof, JsonNode proposal, Instant now) {
    contracts.validate("v3/bridge#/definitions/preparation", proof);
    require(
        proof.path("requestDigest").asText().equals(GuidedContracts.hash(proposal))
            && proof.path("evidenceHash").equals(proposal.path("evidenceHash"))
            && proof.path("authoredInputsHash").equals(proposal.path("authoredInputsHash"))
            && Instant.parse(proof.path("expiresAt").asText()).isAfter(now),
        "STALE_GENERATION",
        409);
    var old =
        jdbc.queryForList(
            "SELECT proof::text,request_digest FROM studio_guided_preparations"
                + " WHERE session_id=? AND preparation_id=?",
            proof.path("sessionId").asText(),
            proof.path("preparationId").asText());
    if (!old.isEmpty()) {
      require(
          contracts.parse((String) old.getFirst().get("proof")).equals(proof)
              && old.getFirst().get("request_digest").equals(GuidedContracts.hash(proposal)),
          "IDEMPOTENCY_CONFLICT",
          409);
      return false;
    }
    jdbc.update(
        "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id"
            + ",owner_fence,request_digest,proof,expires_at) VALUES (?,?,?,?,?,?::jsonb,?)",
        proof.path("sessionId").asText(),
        proof.path("preparationId").asText(),
        proof.path("contextId").asText(),
        proof.path("ownerFence").asInt(),
        proof.path("requestDigest").asText(),
        proof.toString(),
        Timestamp.from(Instant.parse(proof.path("expiresAt").asText())));
    return true;
  }

  public JsonNode authorize(
      JsonNode session, JsonNode proposal, JsonNode context, String preparationId, Instant now) {
    var found =
        jdbc.queryForList(
            "SELECT proof::text FROM studio_guided_preparations WHERE session_id=? AND "
                + "preparation_id=? AND request_digest=? AND admission_id IS NULL AND expires_at>?",
            String.class,
            session.path("sessionId").asText(),
            preparationId,
            GuidedContracts.hash(proposal),
            Timestamp.from(now));
    require(found.size() == 1, "STALE_GENERATION", 409);
    JsonNode proof = contracts.parse(found.getFirst());
    for (String field :
        java.util.List.of(
            "contextId",
            "contextRevision",
            "workerId",
            "ownerFence",
            "scopeHash",
            "sourceRevision",
            "configurationRevision",
            "versions",
            "authoredInputsHash")) {
      require(GuidedContracts.same(proof.path(field), context.path(field)), "STALE_FENCE", 409);
    }
    require(
        proof.path("evidenceHash").equals(proposal.path("evidenceHash")), "STALE_GENERATION", 409);
    return proof;
  }

  public void attach(JsonNode ledger) {
    require(
        jdbc.update(
                "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id=? AND "
                    + "preparation_id=? AND admission_id IS NULL",
                ledger.path("admission").path("admissionId").asText(),
                ledger.path("sessionId").asText(),
                ledger.path("preparationId").asText())
            == 1,
        "IDEMPOTENCY_CONFLICT",
        409);
  }

  public void checkUnexpired(JsonNode ledger, Instant now) {
    require(
        jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_preparations WHERE session_id=? AND "
                    + "preparation_id=? AND admission_id=? AND expires_at>?",
                Integer.class,
                ledger.path("sessionId").asText(),
                ledger.path("preparationId").asText(),
                ledger.path("admission").path("admissionId").asText(),
                Timestamp.from(now))
            == 1,
        "STALE_GENERATION",
        409);
  }
}

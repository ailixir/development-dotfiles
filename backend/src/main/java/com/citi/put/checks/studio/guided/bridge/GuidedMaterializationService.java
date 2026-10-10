package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Called inside the serialized session transaction after current source/account checks. */
public final class GuidedMaterializationService {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedSourceReferenceValidator validator;

  public GuidedMaterializationService(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.validator = new GuidedSourceReferenceValidator(contracts);
  }

  public ObjectNode freeze(
      JsonNode session, GuidedSourceReferenceValidator.Sources sources, JsonNode references) {
    require(references.isArray() && references.size() <= 200, "INVALID_CONTRACT", 422);
    String id = session.path("sessionId").asText();
    require(
        jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id)
            == 0,
        "INVALID_CONTRACT",
        422);
    require(
        jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id)
            == 0,
        "IDEMPOTENCY_CONFLICT",
        409);
    ObjectNode inputs =
        contracts
            .object()
            .put("schemaVersion", 2)
            .put("sessionId", id)
            .put("scopeHash", session.path("scopeHash").asText())
            .put("sourceRevision", sources.sourceRevision())
            .put("configurationRevision", sources.configurationRevision());
    var array = inputs.putArray("inputs");
    var seen = new java.util.HashSet<String>();
    for (JsonNode reference : references) {
      require(seen.add(GuidedContracts.hash(reference)), "INVALID_CONTRACT", 422);
      array.add(validator.resolve(session, sources, reference));
    }
    contracts.validate("v2/authored-inputs", inputs);
    jdbc.update(
        "INSERT INTO studio_guided_materializations "
            + "(session_id,scope_hash,context_id,context_revision,materialization_revision"
            + ",worker_id,owner_fence,source_revision,configuration_revision,authored_inpu"
            + "ts_hash,authored_inputs) VALUES (?,?,?,1,1,?,?,?,?,?,?::jsonb)",
        id,
        session.path("scopeHash").asText(),
        UUID.randomUUID().toString(),
        session.path("owner").path("workerId").asText(),
        session.path("owner").path("fence").asInt(),
        sources.sourceRevision(),
        sources.configurationRevision(),
        GuidedContracts.hash(inputs),
        inputs.toString());
    return context(session);
  }

  public ObjectNode context(JsonNode session) {
    String id = session.path("sessionId").asText();
    List<ObjectNode> rows =
        jdbc.query(
            "SELECT * FROM studio_guided_materializations WHERE session_id=?",
            (rs, n) -> {
              require(
                  rs.getBoolean("live")
                      && rs.getString("worker_id")
                          .equals(session.path("owner").path("workerId").asText())
                      && rs.getInt("owner_fence") == session.path("owner").path("fence").asInt(),
                  "STALE_FENCE",
                  409);
              ObjectNode result =
                  contracts
                      .object()
                      .put("schemaVersion", 2)
                      .put("sessionId", id)
                      .put("workerId", rs.getString("worker_id"))
                      .put("ownerFence", rs.getInt("owner_fence"))
                      .put("scopeHash", rs.getString("scope_hash"))
                      .put("contextId", rs.getString("context_id"))
                      .put("contextRevision", rs.getInt("context_revision"))
                      .put("materializationRevision", rs.getInt("materialization_revision"))
                      .put("sourceRevision", rs.getString("source_revision"))
                      .put("configurationRevision", rs.getString("configuration_revision"))
                      .put("authoredInputsHash", rs.getString("authored_inputs_hash"));
              result.set("authoredInputs", contracts.parse(rs.getString("authored_inputs")));
              return result;
            },
            id);
    require(rows.size() == 1, "RUNTIME_INCOMPATIBLE", 409);
    ObjectNode result = rows.getFirst();
    result.set("versions", session.path("versions"));
    result.set("limits", session.path("limits"));
    result.set("expiresAt", session.path("expiresAt"));
    result.set("leaseExpiresAt", session.path("owner").path("leaseExpiresAt"));
    result.set("approvedOrigins", session.path("scope").path("approvedOrigins"));
    var steps = result.putArray("sourceStepIds");
    session.path("sourceSteps").forEach(step -> steps.add(step.path("stepId").asText()));
    for (var entry :
        java.util.Map.of(
                "allocations",
                "studio_guided_allocations",
                "producers",
                "studio_guided_producers",
                "consumerEdges",
                "studio_guided_consumer_edges")
            .entrySet()) {
      var values = result.putArray(entry.getKey());
      jdbc.queryForList(
              "SELECT document::text FROM "
                  + entry.getValue()
                  + " WHERE session_id=? ORDER BY document::text",
              String.class,
              id)
          .forEach(value -> values.add(contracts.parse(value)));
    }
    contracts.validate("v2/runner-context", result);
    return result;
  }

  public ObjectNode identity(JsonNode context) {
    ObjectNode result = contracts.object();
    for (String field :
        List.of(
            "schemaVersion",
            "sessionId",
            "workerId",
            "ownerFence",
            "scopeHash",
            "contextId",
            "contextRevision",
            "sourceRevision",
            "configurationRevision",
            "versions")) {
      result.set(field, context.path(field));
    }
    contracts.validate("v2/bridge#/definitions/identity", result);
    return result;
  }

  public void verify(JsonNode session, JsonNode envelope) {
    ObjectNode expected = identity(context(session));
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      require(field.getValue().equals(envelope.path(field.getKey())), "STALE_FENCE", 409);
    }
  }

  public void bump(String id) {
    jdbc.update(
        "UPDATE studio_guided_materializations SET "
            + "materialization_revision=materialization_revision+1 WHERE session_id=? AND live",
        id);
  }

  public void stop(String id) {
    jdbc.update("UPDATE studio_guided_materializations SET live=false WHERE session_id=?", id);
  }
}

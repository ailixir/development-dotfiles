package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/** Recomputes private immutable input hashes before producing value-free publication evidence. */
public final class GuidedMaterializationEvidence {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedMaterializationEvidence(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public ObjectNode read(String id) {
    ObjectNode evidence = contracts.object();
    ArrayNode versions = evidence.putArray("versions"), entries = evidence.putArray("entries");
    ArrayNode privateInputs = contracts.object().putArray("items");
    var inputRows =
        jdbc.queryForList(
            "SELECT input_ordinal,input_id,introduced_revision,document::text FROM"
                + " studio_guided_materialization_inputs WHERE session_id=? ORDER BY input_ordinal",
            id);
    require(inputRows.size() <= 200, "BUDGET_EXCEEDED", 413);
    var ids = new java.util.HashSet<String>();
    int bytes = 0;
    for (var row : inputRows) {
      int ordinal = ((Number) row.get("input_ordinal")).intValue();
      require(
          ordinal == privateInputs.size() && ids.add((String) row.get("input_id")),
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode input = (ObjectNode) contracts.parse((String) row.get("document"));
      require(input.path("inputId").asText().equals(row.get("input_id")), "EVIDENCE_MISMATCH", 422);
      int size = GuidedContracts.canonical(input).getBytes(StandardCharsets.UTF_8).length;
      bytes = Math.addExact(bytes, size);
      require(size <= 32768 && bytes <= 1048576, "BUDGET_EXCEEDED", 413);
      privateInputs.add(input);
      ObjectNode safe = input.deepCopy();
      safe.remove("value");
      entries
          .addObject()
          .put("inputOrdinal", ordinal)
          .put("inputId", (String) row.get("input_id"))
          .put("introducedContextRevision", ((Number) row.get("introduced_revision")).intValue())
          .put("inputHash", GuidedContracts.hash(input))
          .set("metadata", safe);
    }
    var rows =
        jdbc.queryForList(
            "SELECT * FROM studio_guided_materialization_versions WHERE session_id=? ORDER BY context_revision",
            id);
    require(!rows.isEmpty() && rows.size() <= 201, "EVIDENCE_MISMATCH", 422);
    String previousHash = null;
    int previousCount = -1;
    for (var row : rows) {
      int revision = ((Number) row.get("context_revision")).intValue();
      int count = ((Number) row.get("input_count")).intValue();
      require(
          revision == versions.size() + 1
              && count <= privateInputs.size()
              && count > previousCount
              && java.util.Objects.equals(previousHash, row.get("previous_inputs_hash")),
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode identity =
          (ObjectNode) contracts.parse(String.valueOf(row.get("authored_inputs_identity")));
      ObjectNode full = identity.deepCopy();
      ArrayNode inputs = full.putArray("inputs");
      for (int ordinal = 0; ordinal < count; ordinal++) {
        JsonNode entry = entries.get(ordinal);
        require(
            entry.path("introducedContextRevision").asInt() <= revision, "EVIDENCE_MISMATCH", 422);
        inputs.add(privateInputs.get(ordinal));
      }
      contracts.validate("v3/authored-inputs", full);
      require(
          GuidedContracts.hash(full).equals(row.get("authored_inputs_hash"))
              && GuidedContracts.canonical(full).getBytes(StandardCharsets.UTF_8).length <= 1048576,
          "EVIDENCE_MISMATCH",
          422);
      ObjectNode version =
          versions
              .addObject()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("workerId", (String) row.get("worker_id"))
              .put("ownerFence", ((Number) row.get("owner_fence")).intValue())
              .put("scopeHash", (String) row.get("scope_hash"))
              .put("contextId", (String) row.get("context_id"))
              .put("contextRevision", revision)
              .put("authoredInputsHash", (String) row.get("authored_inputs_hash"))
              .put("sourceRevision", (String) row.get("source_revision"))
              .put("configurationRevision", (String) row.get("configuration_revision"))
              .put("inputCount", count)
              .put(
                  "birthMaterializationRevision",
                  ((Number) row.get("materialization_revision")).intValue());
      version.put("previousInputsHash", previousHash);
      if (versions.size() > 1) {
        JsonNode first = versions.get(0);
        for (String field :
            List.of(
                "workerId",
                "ownerFence",
                "scopeHash",
                "contextId",
                "sourceRevision",
                "configurationRevision")) {
          require(version.path(field).equals(first.path(field)), "EVIDENCE_MISMATCH", 422);
        }
      }
      previousHash = (String) row.get("authored_inputs_hash");
      previousCount = count;
    }
    require(previousCount == entries.size(), "EVIDENCE_MISMATCH", 422);
    var current =
        jdbc.queryForMap(
            "SELECT context_revision,authored_inputs_hash,authored_inputs::text FROM"
                + " studio_guided_materializations WHERE session_id=?",
            id);
    require(
        ((Number) current.get("context_revision")).intValue() == versions.size()
            && previousHash.equals(current.get("authored_inputs_hash"))
            && previousHash.equals(
                GuidedContracts.hash(contracts.parse((String) current.get("authored_inputs")))),
        "EVIDENCE_MISMATCH",
        422);
    contracts.validate("v3/replay-validation#/definitions/MaterializationEvidence", evidence);
    return evidence;
  }

  public static ObjectNode versionContext(
      GuidedContracts contracts, JsonNode evidence, int revision) {
    require(
        revision >= 1 && revision <= evidence.path("versions").size(), "EVIDENCE_MISMATCH", 422);
    JsonNode header = evidence.path("versions").get(revision - 1);
    require(header.path("contextRevision").asInt() == revision, "EVIDENCE_MISMATCH", 422);
    ObjectNode result = contracts.object();
    for (String field :
        List.of("contextId", "contextRevision", "workerId", "ownerFence", "authoredInputsHash")) {
      result.set(field, header.path(field));
    }
    ArrayNode inputs = result.putArray("inputs");
    int count = header.path("inputCount").asInt();
    require(count >= 0 && count <= evidence.path("entries").size(), "EVIDENCE_MISMATCH", 422);
    for (int at = 0; at < count; at++) {
      JsonNode entry = evidence.path("entries").get(at);
      require(
          entry.path("inputOrdinal").asInt(-1) == at
              && entry.path("introducedContextRevision").asInt() <= revision,
          "EVIDENCE_MISMATCH",
          422);
      inputs.add(entry.path("metadata"));
    }
    return result;
  }
}

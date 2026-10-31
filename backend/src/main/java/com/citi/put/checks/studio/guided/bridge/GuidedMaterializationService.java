package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.StreamSupport;
import org.springframework.jdbc.core.JdbcTemplate;

/** Called inside the serialized session transaction after current source/account checks. */
public final class GuidedMaterializationService {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedSourceReferenceValidator validator;

  public GuidedMaterializationService(
      JdbcTemplate jdbc, GuidedContracts contracts, AllowedDomains domains) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.validator = new GuidedSourceReferenceValidator(contracts, domains);
  }

  /**
   * A template span mixes authored text with variable values. The runner withholds the value of
   * every configuration input from the page the model reads; the span is a source span, so each
   * variable it names is frozen as well, unused by any operation, to keep that protection: the
   * value stays out of the model's observations as it would for a whole-variable input.
   */
  private void withholdTemplateVariables(
      JsonNode session,
      GuidedSourceReferenceValidator.Sources sources,
      JsonNode references,
      com.fasterxml.jackson.databind.node.ArrayNode array,
      java.util.Set<String> ids) {
    for (ObjectNode companion : templateVariableReferences(contracts, sources, references)) {
      if (StreamSupport.stream(array.spliterator(), false)
          .anyMatch(item -> item.path("provenance").equals(companion))) {
        continue;
      }
      ObjectNode item = validator.resolve(session, sources, companion);
      require(ids.add(item.path("inputId").asText()), "IDEMPOTENCY_CONFLICT", 409);
      array.add(item);
    }
  }

  /** The whole-variable configuration references of every variable a template span names. */
  static List<ObjectNode> templateVariableReferences(
      GuidedContracts contracts,
      GuidedSourceReferenceValidator.Sources sources,
      JsonNode references) {
    List<ObjectNode> found = new java.util.ArrayList<>();
    for (JsonNode reference : references) {
      String stepId = reference.path("stepId").asText();
      var step = sources.steps().get(stepId);
      if (step == null || !reference.path("referenceKind").asText().equals("sourceSpan")) {
        continue;
      }
      for (String name :
          SourceTemplate.variableNames(
              step.text(),
              reference.path("startUtf16").asInt(),
              reference.path("endUtf16").asInt())) {
        sources.configuration().entrySet().stream()
            .filter(
                entry ->
                    entry.getValue().stepId().equals(stepId)
                        && name.equals(entry.getValue().referenceName())
                        && entry.getValue().kind().equals("nonsecretText"))
            .map(java.util.Map.Entry::getKey)
            .sorted()
            .findFirst()
            .ifPresent(
                referenceId ->
                    found.add(
                        contracts
                            .object()
                            .put("referenceKind", "configuration")
                            .put("configurationRevision", sources.configurationRevision())
                            .put("stepId", stepId)
                            .put("referenceId", referenceId)
                            .put("kind", "nonsecretText")));
      }
    }
    return found;
  }

  public ObjectNode freeze(
      JsonNode session, GuidedSourceReferenceValidator.Sources sources, JsonNode references) {
    return freeze(session, sources, references, java.util.Map.of());
  }

  /** Trusted prefix imports supply verified base IDs, never values or old execution authority. */
  public ObjectNode freeze(
      JsonNode session,
      GuidedSourceReferenceValidator.Sources sources,
      JsonNode references,
      java.util.Map<String, String> stableIds) {
    require(references.isArray() && references.size() <= 200, "INVALID_CONTRACT", 422);
    String id = session.path("sessionId").asText();
    var oldRows =
        jdbc.queryForList(
            "SELECT authored_inputs::text,context_revision,"
                + "materialization_revision,authored_inputs_hash FROM studio_guided_materializations WHERE "
                + "session_id=?",
            id);
    boolean initial = oldRows.isEmpty();
    ObjectNode inputs;
    if (initial) {
      require(
          jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
                  Integer.class,
                  id)
              == 0,
          "INVALID_CONTRACT",
          422);
      inputs =
          contracts
              .object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("scopeHash", session.path("scopeHash").asText())
              .put("sourceRevision", sources.sourceRevision())
              .put("configurationRevision", sources.configurationRevision());
      inputs.putArray("inputs");
    } else {
      inputs = (ObjectNode) contracts.parse((String) oldRows.getFirst().get("authored_inputs"));
    }
    var array = (com.fasterxml.jackson.databind.node.ArrayNode) inputs.path("inputs");
    int originalCount = array.size();
    var seen = new java.util.HashSet<String>();
    var ids = new java.util.HashSet<String>();
    array.forEach(item -> ids.add(item.path("inputId").asText()));
    for (JsonNode reference : references) {
      String digest = GuidedContracts.hash(reference);
      require(seen.add(digest), "INVALID_CONTRACT", 422);
      JsonNode existing = null;
      for (JsonNode item : array) {
        if (item.path("provenance").equals(reference)) {
          existing = item;
          break;
        }
      }
      if (existing != null) {
        require(
            !stableIds.containsKey(digest)
                || existing.path("inputId").asText().equals(stableIds.get(digest)),
            "IDEMPOTENCY_CONFLICT",
            409);
        continue;
      }
      ObjectNode item = validator.resolve(session, sources, reference);
      if (stableIds.containsKey(digest)) {
        item.put("inputId", stableIds.get(digest));
      }
      require(ids.add(item.path("inputId").asText()), "IDEMPOTENCY_CONFLICT", 409);
      require(
          GuidedContracts.canonical(item).getBytes(java.nio.charset.StandardCharsets.UTF_8).length
              <= 32768,
          "BUDGET_EXCEEDED",
          413);
      array.add(item);
    }
    withholdTemplateVariables(session, sources, references, array, ids);
    contracts.validate("v3/authored-inputs", inputs);
    require(
        array.size() <= 200
            && GuidedContracts.canonical(inputs)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)
                    .length
                <= 1048576,
        "BUDGET_EXCEEDED",
        413);
    if (!initial && originalCount == array.size()) {
      return context(session);
    }
    if (initial) {
      jdbc.update(
          "INSERT INTO studio_guided_materializations "
              + "(session_id,scope_hash,context_id,context_revision,materialization_revision,worker_id,"
              + "owner_fence,source_revision,configuration_revision,authored_inputs_hash,authored_inputs)"
              + " VALUES (?,?,?,1,1,?,?,?,?,?,?::jsonb)",
          id,
          session.path("scopeHash").asText(),
          UUID.randomUUID().toString(),
          session.path("owner").path("workerId").asText(),
          session.path("owner").path("fence").asInt(),
          sources.sourceRevision(),
          sources.configurationRevision(),
          GuidedContracts.hash(inputs),
          inputs.toString());
    } else {
      var previous = oldRows.getFirst();
      int version = Math.addExact(((Number) previous.get("context_revision")).intValue(), 1);
      int metadata =
          Math.addExact(((Number) previous.get("materialization_revision")).intValue(), 1);
      require(version <= 201, "BUDGET_EXCEEDED", 429);
      require(
          jdbc.update(
                  "UPDATE studio_guided_materializations SET context_revision=?,"
                      + "materialization_revision=?,authored_inputs_hash=?,authored_inputs=?::jsonb"
                      + " WHERE session_id=? AND context_revision=? AND authored_inputs_hash=? AND live",
                  version,
                  metadata,
                  GuidedContracts.hash(inputs),
                  inputs.toString(),
                  id,
                  version - 1,
                  previous.get("authored_inputs_hash"))
              == 1,
          "REVISION_CONFLICT",
          409);
    }
    // V21 atomically captures normalized headers/entries and the pending delivery.
    return context(session);
  }

  public String pendingDeliveryId(String id) {
    var rows =
        jdbc.queryForList(
            "SELECT delivery_id::text FROM studio_guided_materialization_deliveries"
                + " WHERE session_id=? AND status='PENDING'",
            String.class,
            id);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  public void requireAcknowledged(String id) {
    require(pendingDeliveryId(id) == null, "REVISION_CONFLICT", 409);
  }

  public void acknowledge(JsonNode session, JsonNode acknowledgement) {
    contracts.validate("v3/bridge#/definitions/ContextAcknowledgement", acknowledgement);
    String id = session.path("sessionId").asText();
    var rows =
        jdbc.queryForList(
            "SELECT ack::text FROM studio_guided_materialization_deliveries"
                + " WHERE session_id=? AND delivery_id=?::uuid",
            id,
            acknowledgement.path("deliveryId").asText());
    require(rows.size() == 1, "STALE_FENCE", 409);
    Object old = rows.getFirst().get("ack");
    if (old != null) {
      require(contracts.parse((String) old).equals(acknowledgement), "IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    require(
        jdbc.update(
                "UPDATE studio_guided_materialization_deliveries SET status='ACKNOWLEDGED',"
                    + "ack=?::jsonb WHERE session_id=? AND delivery_id=?::uuid AND status='PENDING'",
                acknowledgement.toString(),
                id,
                acknowledgement.path("deliveryId").asText())
            == 1,
        "STALE_FENCE",
        409);
  }

  public ObjectNode context(JsonNode session) {
    return context(session, null);
  }

  public ObjectNode context(JsonNode session, VerifiedContext verified) {
    ObjectNode result = assembleContext(session);
    String id = session.path("sessionId").asText();
    var delivery =
        jdbc.queryForList(
            "SELECT context_metadata::text,context_hash,context_revision"
                + " FROM studio_guided_materialization_deliveries WHERE session_id=? AND status='PENDING'",
            id);
    if (!delivery.isEmpty()) {
      Object value = delivery.getFirst().get("context_metadata");
      if (value == null) {
        ObjectNode metadata = result.deepCopy();
        metadata.remove("authoredInputs");
        jdbc.update(
            "UPDATE studio_guided_materialization_deliveries SET context_metadata=?::jsonb,"
                + "context_hash=? WHERE session_id=? AND status='PENDING' AND context_metadata IS NULL",
            metadata.toString(),
            GuidedContracts.hash(result),
            id);
      } else {
        result = (ObjectNode) contracts.parse((String) value);
        String versionInputs =
            jdbc.queryForObject(
                "SELECT authored_inputs::text FROM"
                    + " studio_guided_materialization_snapshots WHERE session_id=? AND context_revision=?",
                String.class,
                id,
                delivery.getFirst().get("context_revision"));
        result.set("authoredInputs", contracts.parse(versionInputs));
        require(
            GuidedContracts.hash(result).equals(delivery.getFirst().get("context_hash")),
            "EVIDENCE_MISMATCH",
            409);
      }
    }
    if (verified != null && verified.owner == this && verified.contracts == contracts) {
      GuidedContracts.canonical(result);
      boolean matching = false;
      try {
        matching =
            sameSnapshotNodeKinds(result, verified.snapshot)
                && result.equals(verified.snapshot)
                && result.toString().equals(verified.representation);
      } catch (RuntimeException unavailable) {
        // Unknown comparison cannot replace original full-context validation.
      }
      if (matching) {
        return result;
      }
    }
    contracts.validate("v3/runner-context", result);
    return result;
  }

  private ObjectNode assembleContext(JsonNode session) {
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
                      .put("schemaVersion", 3)
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
    var programs =
        jdbc.queryForList(
            "SELECT prefix_program::text,prefix_program_hash FROM"
                + " studio_guided_relearn_plans WHERE session_id=?",
            id);
    if (!programs.isEmpty()) {
      result.set(
          "prefixProgram", contracts.parse((String) programs.getFirst().get("prefix_program")));
      result.put("prefixProgramHash", (String) programs.getFirst().get("prefix_program_hash"));
    }
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
    contracts.validate("v3/bridge#/definitions/identity", result);
    return result;
  }

  public void verify(JsonNode session, JsonNode envelope) {
    requireAcknowledged(session.path("sessionId").asText());
    ObjectNode expected = identity(context(session));
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      require(field.getValue().equals(envelope.path(field.getKey())), "STALE_FENCE", 409);
    }
  }

  /**
   * STUDIO-OBS-015 B2B-01 L1: identity binding for the owning worker's terminal lifecycle report.
   * Without a PENDING append delivery this is exactly {@link #verify}. With one, the runner holds
   * v(n-1) (delivery never applied) or v(n) (applied, ACK in flight or lost); exactly those two
   * backend-derived identities are accepted. Lifecycle consumes no context and only ends the
   * session, so it is the one callback exempt from {@link #requireAcknowledged}.
   *
   * <p>The accepted revisions come from {@link #acceptedContextRevisions(int, boolean)}, the one
   * derivation the recording-evidence route shares (STUDIO-OBS-009 AC-11 R1).
   */
  public void verifyLifecycle(JsonNode session, JsonNode envelope) {
    if (pendingDeliveryId(session.path("sessionId").asText()) == null) {
      verify(session, envelope);
      return;
    }
    ObjectNode issued = identity(context(session));
    Set<Integer> accepted = acceptedContextRevisions(issued.path("contextRevision").asInt(), true);
    require(
        accepted.stream()
            .anyMatch(
                revision ->
                    sameIdentity(issued.deepCopy().put("contextRevision", revision), envelope)),
        "STALE_FENCE",
        409);
  }

  /**
   * The context revisions a callback that consumes nothing may name (STUDIO-OBS-015 L1;
   * STUDIO-OBS-009 AC-11 R1). With no append delivery pending only the head, v(n), is accepted.
   * With one pending the runner may still hold the previous revision (the delivery was never
   * applied) or the head (applied, ACK in flight or lost), so exactly {v(n), v(n-1)} are.
   *
   * <p>This is the single derivation: {@link #verifyLifecycle} and the recording-evidence route
   * both use it, so the two cannot drift. A pending append delivery implies a head of at least 2; a
   * pending delivery at head 1 is refused rather than guessed at (inferred unreachable).
   *
   * @param head the materialization head's {@code contextRevision}
   * @param appendPending whether an append delivery is {@code PENDING}
   */
  public static Set<Integer> acceptedContextRevisions(int head, boolean appendPending) {
    if (!appendPending) {
      return Set.of(head);
    }
    require(head >= 2, "RUNTIME_INCOMPATIBLE", 409);
    return Set.of(head, head - 1);
  }

  /** As {@link #acceptedContextRevisions(int, boolean)}, reading the pending delivery. */
  public Set<Integer> acceptedContextRevisions(String sessionId, int head) {
    return acceptedContextRevisions(head, pendingDeliveryId(sessionId) != null);
  }

  private static boolean sameIdentity(ObjectNode expected, JsonNode envelope) {
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      if (!field.getValue().equals(envelope.path(field.getKey()))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Prefix drift receipts carry the issued {@code PrefixRequestIdentity}, which has no {@code
   * versions} field ({@code versions} is the constant {@code {"contract":3}}; {@code
   * schemaVersion=3} is enforced by the schema and the controller). Binds exactly 11 fields: the
   * identity without {@code versions}, plus {@code authoredInputsHash} and {@code
   * prefixProgramHash}. An absent expected value is never a match (STUDIO-OBS-015 D1).
   */
  public void verifyPrefixReceipt(JsonNode session, JsonNode receipt) {
    requireAcknowledged(session.path("sessionId").asText());
    ObjectNode context = context(session);
    ObjectNode expected = identity(context);
    expected.remove("versions");
    expected.set("authoredInputsHash", context.path("authoredInputsHash"));
    expected.set("prefixProgramHash", context.path("prefixProgramHash"));
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      require(
          !field.getValue().isMissingNode()
              && field.getValue().equals(receipt.path(field.getKey())),
          "STALE_FENCE",
          409);
    }
  }

  public static final class VerifiedContext {
    private final GuidedMaterializationService owner;
    private final GuidedContracts contracts;
    private final ObjectNode snapshot;
    private final String representation;

    private VerifiedContext(
        GuidedMaterializationService owner,
        GuidedContracts contracts,
        ObjectNode snapshot,
        String representation) {
      this.owner = owner;
      this.contracts = contracts;
      this.snapshot = snapshot;
      this.representation = representation;
    }
  }

  private static boolean sameSnapshotNodeKinds(JsonNode original, JsonNode owned) {
    if (original == null || owned == null || original.getClass() != owned.getClass()) {
      return false;
    }
    if (original.isObject()) {
      if (original.size() != owned.size()) {
        return false;
      }
      for (var fields = original.fields(); fields.hasNext(); ) {
        var field = fields.next();
        if (!sameSnapshotNodeKinds(field.getValue(), owned.get(field.getKey()))) {
          return false;
        }
      }
    } else if (original.isArray()) {
      if (original.size() != owned.size()) {
        return false;
      }
      for (int index = 0; index < original.size(); index++) {
        if (!sameSnapshotNodeKinds(original.get(index), owned.get(index))) {
          return false;
        }
      }
    }
    return true;
  }

  private VerifiedContext captureVerifiedContext(ObjectNode validated) {
    try {
      String representation = validated.toString();
      // The private fixed JSON parser owns all containers; exact node kinds reject opaque input.
      JsonNode parsed = contracts.parse(representation);
      if (!(parsed instanceof ObjectNode snapshot)
          || !sameSnapshotNodeKinds(validated, snapshot)
          || !validated.equals(snapshot)
          || !snapshot.toString().equals(representation)) {
        return null;
      }
      return new VerifiedContext(this, contracts, snapshot, representation);
    } catch (RuntimeException unavailable) {
      return null;
    }
  }

  public VerifiedContext verifyAndCapture(JsonNode session, JsonNode envelope) {
    requireAcknowledged(session.path("sessionId").asText());
    ObjectNode validated = context(session);
    ObjectNode expected = identity(validated);
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      require(field.getValue().equals(envelope.path(field.getKey())), "STALE_FENCE", 409);
    }
    return captureVerifiedContext(validated);
  }

  public void bump(String id) {
    requireAcknowledged(id);
    Integer current =
        jdbc.queryForObject(
            "SELECT materialization_revision FROM"
                + " studio_guided_materializations WHERE session_id=? AND live",
            Integer.class,
            id);
    require(current != null, "STALE_FENCE", 409);
    int next = Math.addExact(current, 1);
    require(
        jdbc.update(
                "UPDATE studio_guided_materializations SET materialization_revision=?"
                    + " WHERE session_id=? AND materialization_revision=? AND live",
                next,
                id,
                current)
            == 1,
        "REVISION_CONFLICT",
        409);
  }

  public void stop(String id) {
    jdbc.update("UPDATE studio_guided_materializations SET live=false WHERE session_id=?", id);
  }
}

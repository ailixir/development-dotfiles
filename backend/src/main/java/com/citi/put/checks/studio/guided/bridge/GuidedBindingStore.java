package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Cumulative intent, immutable producer evidence and actual consumer edges are separate records.
 */
public final class GuidedBindingStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedMaterializationService materialization;

  public GuidedBindingStore(
      JdbcTemplate jdbc, GuidedContracts contracts, GuidedMaterializationService materialization) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.materialization = materialization;
  }

  public JsonNode allocate(
      JsonNode session, String needId, String producerStep, JsonNode consumers) {
    String id = session.path("sessionId").asText();
    var found =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_allocations WHERE session_id=? AND need_id=?",
            String.class,
            id,
            needId);
    ObjectNode allocation =
        contracts
            .object()
            .put(
                "bindingId",
                found.isEmpty()
                    ? UUID.randomUUID().toString()
                    : contracts.parse(found.getFirst()).path("bindingId").asText())
            .put("needId", needId)
            .put("producerStepId", producerStep);
    allocation.set("consumers", consumers);
    contracts.validate("v3/allocation", allocation);
    require(stepIndex(session, producerStep) >= 0, "BINDING_ORDER", 422);
    for (JsonNode consumer : consumers) {
      require(
          stepIndex(session, consumer.path("stepId").asText()) > stepIndex(session, producerStep),
          "BINDING_ORDER",
          422);
    }
    if (!found.isEmpty()) {
      JsonNode prior = contracts.parse(found.getFirst());
      require(
          prior.path("producerStepId").equals(allocation.path("producerStepId")),
          "IDEMPOTENCY_CONFLICT",
          409);
      for (JsonNode consumer : prior.path("consumers")) {
        require(contains(consumers, consumer), "IDEMPOTENCY_CONFLICT", 409);
      }
      if (prior.equals(allocation)) {
        return prior;
      }
      jdbc.update(
          "UPDATE studio_guided_allocations SET document=?::jsonb WHERE session_id=? AND need_id=?",
          allocation.toString(),
          id,
          needId);
    } else {
      require(
          jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_allocations WHERE session_id=?",
                  Integer.class,
                  id)
              < session.path("limits").path("maxRuntimeValues").asInt(),
          "BUDGET_EXCEEDED",
          429);
      jdbc.update(
          "INSERT INTO studio_guided_allocations(session_id,binding_id,need_id,document) "
              + "VALUES (?,?,?,?::jsonb)",
          id,
          allocation.path("bindingId").asText(),
          needId,
          allocation.toString());
    }
    materialization.bump(id);
    return allocation;
  }

  /**
   * Trusted base import is separate from the model allocator and preserves a verified binding ID.
   */
  public JsonNode importPrefix(JsonNode session, JsonNode need) {
    String id = session.path("sessionId").asText();
    var incremental =
        new com.citi.put.checks.studio.guided.session.GuidedIncrementalStore(jdbc, contracts);
    require(incremental.pending(id), "REVISION_CONFLICT", 409);
    JsonNode verified =
        com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
            incremental.baseArtifact(id).path("learnedPlan").path("bindings"),
            "bindingId",
            need.path("bindingId").asText());
    require(
        verified.path("producer").path("stepId").equals(need.path("producerStepId")),
        "REFERENCE_MISMATCH",
        422);
    ObjectNode allocation = contracts.object();
    for (String field : java.util.List.of("bindingId", "needId", "producerStepId", "consumers")) {
      allocation.set(field, need.path(field));
    }
    contracts.validate("v3/allocation", allocation);
    var existing =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_allocations WHERE session_id=? AND binding_id=?",
            String.class,
            id,
            need.path("bindingId").asText());
    if (existing.isEmpty()) {
      jdbc.update(
          "INSERT INTO studio_guided_allocations(session_id,binding_id,need_id,document) VALUES (?,?,?,?::jsonb)",
          id,
          need.path("bindingId").asText(),
          need.path("needId").asText(),
          allocation.toString());
      materialization.bump(id);
    } else {
      require(contracts.parse(existing.getFirst()).equals(allocation), "IDEMPOTENCY_CONFLICT", 409);
    }
    return allocation;
  }

  /** Actual logical allocator request: cumulative private intent, accepted plan left unchanged. */
  public ObjectNode cumulativeRequest(JsonNode session, JsonNode need) {
    ObjectNode request = need.deepCopy();
    request.remove("bindingId");
    var existing =
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_allocations WHERE session_id=? AND need_id=?",
            String.class,
            session.path("sessionId").asText(),
            need.path("needId").asText());
    if (existing.isEmpty()) {
      return request;
    }
    JsonNode previous = contracts.parse(existing.getFirst());
    require(
        previous.path("producerStepId").equals(need.path("producerStepId")), "BINDING_ORDER", 422);
    var consumers = request.putArray("consumers");
    previous.path("consumers").forEach(value -> consumers.add(value.deepCopy()));
    for (JsonNode accepted : need.path("consumers")) {
      if (!contains(consumers, accepted)) {
        consumers.add(accepted.deepCopy());
      }
    }
    return request;
  }

  /**
   * A step's captures must be bindings allocated to its step with no producer yet; every entry it
   * uses must exist: a binding produced earlier on the same origin by this runtime, an authored
   * input bound to this step, or a secret input bound to this step.
   */
  public void validateAction(JsonNode session, JsonNode proposal, JsonNode context) {
    JsonNode operation = proposal.path("operation");
    String id = session.path("sessionId").asText();
    String step = proposal.path("coordinate").path("stepId").asText();
    for (JsonNode capture : operation.path("captures")) {
      JsonNode allocation = allocation(id, capture.asText());
      require(
          allocation.path("producerStepId").asText().equals(step)
              && jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_producers WHERE session_id=? AND binding_id=?",
                      Integer.class,
                      id,
                      capture.asText())
                  == 0,
          "BINDING_ORDER",
          422);
    }
    for (JsonNode use : operation.path("uses")) {
      String kind = use.path("kind").asText(), key = use.path("id").asText();
      if (kind.equals("binding")) {
        JsonNode allocated = allocation(id, key);
        ObjectNode expected = contracts.object().put("stepId", step);
        require(contains(allocated.path("consumers"), expected), "BINDING_ORDER", 422);
        JsonNode producer = producer(id, key);
        require(
            before(session, producer.path("coordinate"), proposal.path("coordinate"))
                && producer
                    .path("origin")
                    .equals(proposal.path("executionEvidence").path("origin")),
            "BINDING_ORDER",
            422);
        for (String field : java.util.List.of("contextId", "workerId", "ownerFence")) {
          require(
              producer.path("availability").path(field).equals(context.path(field)),
              "STALE_FENCE",
              409);
        }
        continue;
      }
      boolean secret = kind.equals("secret");
      JsonNode input = null;
      for (JsonNode item : context.path("authoredInputs").path("inputs")) {
        if (secret
            ? item.path("secretId").asText().equals(key)
            : item.path("inputId").asText().equals(key)) {
          input = item;
        }
      }
      require(
          input != null
              && input.path("sourceStepId").asText().equals(step)
              && input.path("kind").asText().equals("secretRef") == secret,
          "FORBIDDEN_SCOPE",
          403);
    }
  }

  /** One consumer edge per binding the step reads. */
  public void attachConsumer(JsonNode session, JsonNode proposal, JsonNode ledger) {
    String id = session.path("sessionId").asText();
    String admission = ledger.path("admission").path("admissionId").asText();
    for (JsonNode use : proposal.path("operation").path("uses")) {
      if (!use.path("kind").asText().equals("binding")) {
        continue;
      }
      String binding = use.path("id").asText();
      JsonNode producer = producer(id, binding);
      ObjectNode edge =
          contracts
              .object()
              .put("bindingId", binding)
              .put("producerAdmissionId", producer.path("producerAdmissionId").asText())
              .put("consumerAdmissionId", admission)
              .put("destinationOrigin", proposal.path("executionEvidence").path("origin").asText())
              .put("transferPolicy", "sameOrigin");
      edge.set("coordinate", proposal.path("coordinate"));
      contracts.validate("v3/consumer-edge", edge);
      jdbc.update(
          "INSERT INTO studio_guided_consumer_edges(session_id,consumer_admission_id,binding_id,"
              + "producer_admission_id,document) VALUES (?,?,?,?,?::jsonb)",
          id,
          admission,
          binding,
          producer.path("producerAdmissionId").asText(),
          edge.toString());
      materialization.bump(id);
    }
  }

  /**
   * A step that succeeded commits one producer row per declared capture, each backed by the
   * runner's availability receipt for that binding.
   */
  public void successfulRead(
      JsonNode session,
      JsonNode proposal,
      JsonNode ledger,
      JsonNode availability,
      JsonNode context) {
    String id = session.path("sessionId").asText(),
        admission = ledger.path("admission").path("admissionId").asText();
    JsonNode captures = proposal.path("operation").path("captures");
    require(
        availability.isArray() && availability.size() == captures.size(),
        "IDEMPOTENCY_CONFLICT",
        409);
    for (JsonNode binding : captures) {
      JsonNode receipt = null;
      for (JsonNode candidate : availability) {
        if (candidate.path("bindingId").equals(binding)) {
          require(receipt == null, "IDEMPOTENCY_CONFLICT", 409);
          receipt = candidate;
        }
      }
      require(receipt != null, "IDEMPOTENCY_CONFLICT", 409);
      contracts.validate("v3/availability", receipt);
      require(
          receipt.path("producerAdmissionId").asText().equals(admission),
          "IDEMPOTENCY_CONFLICT",
          409);
      for (String field : java.util.List.of("contextId", "workerId", "ownerFence")) {
        require(receipt.path(field).equals(context.path(field)), "STALE_FENCE", 409);
      }
      ObjectNode producer =
          contracts
              .object()
              .put("bindingId", binding.asText())
              .put("producerAdmissionId", admission);
      producer.set("coordinate", proposal.path("coordinate"));
      producer.set("origin", proposal.path("executionEvidence").path("origin"));
      producer.set("availability", receipt);
      contracts.validate("v3/producer", producer);
      var found =
          jdbc.queryForList(
              "SELECT document::text FROM studio_guided_producers WHERE session_id=? AND binding_id=?",
              String.class,
              id,
              binding.asText());
      if (!found.isEmpty()) {
        require(contracts.parse(found.getFirst()).equals(producer), "IDEMPOTENCY_CONFLICT", 409);
        continue;
      }
      jdbc.update(
          "INSERT INTO studio_guided_producers(session_id,binding_id,admission_id,document) VALUES (?,?,?,?::jsonb)",
          id,
          binding.asText(),
          admission,
          producer.toString());
      materialization.bump(id);
    }
  }

  private JsonNode allocation(String id, String binding) {
    return one("studio_guided_allocations", id, binding);
  }

  private JsonNode producer(String id, String binding) {
    return one("studio_guided_producers", id, binding);
  }

  private JsonNode one(String table, String id, String binding) {
    var found =
        jdbc.queryForList(
            "SELECT document::text FROM " + table + " WHERE session_id=? AND binding_id=?",
            String.class,
            id,
            binding);
    require(found.size() == 1, "MISSING_SOURCE", 422);
    return contracts.parse(found.getFirst());
  }

  private static boolean contains(JsonNode array, JsonNode item) {
    for (JsonNode value : array) {
      if (value.equals(item)) {
        return true;
      }
    }
    return false;
  }

  private static int stepIndex(JsonNode session, String step) {
    int i = 0;
    for (JsonNode source : session.path("sourceSteps")) {
      if (source.path("stepId").asText().equals(step)) {
        return i;
      }
      i++;
    }
    return -1;
  }

  private static boolean before(JsonNode session, JsonNode producer, JsonNode consumer) {
    int p = stepIndex(session, producer.path("stepId").asText()),
        c = stepIndex(session, consumer.path("stepId").asText());
    return p >= 0
        && (p < c || p == c && producer.path("ordinal").asInt() < consumer.path("ordinal").asInt());
  }
}

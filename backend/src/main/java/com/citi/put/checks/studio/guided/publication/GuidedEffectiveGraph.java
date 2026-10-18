package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** ARCH015-02 local graph projection. Raw basis/history and their hash preimages stay exact. */
public final class GuidedEffectiveGraph {
  private final GuidedContracts contracts;

  public GuidedEffectiveGraph(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public record Projection(ArrayNode allocations, ArrayNode consumerEdges) {}

  public Projection project(JsonNode basis) {
    var actions = new HashMap<String, JsonNode>();
    var coordinates = new HashSet<String>();
    for (JsonNode fact : basis.path("actions")) {
      JsonNode ledger = fact.path("ledger");
      String admission = ledger.path("admission").path("admissionId").asText();
      require(
          ledger.path("state").asText().equals("SUCCEEDED")
              && ledger.path("dispatchCount").asInt() == 1
              && !admission.isEmpty()
              && actions.putIfAbsent(admission, fact) == null
              && coordinates.add(GuidedContracts.canonical(ledger.path("coordinate"))),
          "EVIDENCE_MISMATCH",
          422);
    }
    Map<String, JsonNode> allocations =
        GuidedPlanBuilder.index(basis.path("allocations"), "bindingId");
    Map<String, JsonNode> producers = GuidedPlanBuilder.index(basis.path("producers"), "bindingId");
    Map<String, JsonNode> needs = new HashMap<>();
    for (JsonNode need : basis.path("translationPlan").path("needs")) {
      require(
          needs.putIfAbsent(need.path("bindingId").asText(), need) == null,
          "REFERENCE_MISMATCH",
          422);
    }
    JsonNode incremental = basis.path("incrementalEvidence");
    boolean drift =
        incremental.isObject()
            && incremental.path("switch").path("reason").asText().equals("DRIFT");
    for (JsonNode producer : producers.values()) {
      contracts.validate("v3/producer", producer);
      JsonNode fact = actions.get(producer.path("producerAdmissionId").asText());
      require(fact != null, "REFERENCE_MISMATCH", 422);
      JsonNode operation = GuidedPlanBuilder.proposal(basis, fact).path("operation");
      require(
          operation.path("kind").asText().equals("read")
              && operation.path("bindingId").equals(producer.path("bindingId"))
              && operation.path("recipe").equals(producer.path("recipe"))
              && producer.path("coordinate").equals(fact.path("ledger").path("coordinate"))
              && producer
                  .path("origin")
                  .equals(fact.path("ledger").path("executionEvidence").path("origin")),
          "REFERENCE_MISMATCH",
          422);
    }
    for (JsonNode fact : actions.values()) {
      JsonNode operation = GuidedPlanBuilder.proposal(basis, fact).path("operation");
      if (operation.path("kind").asText().equals("read")) {
        JsonNode producer = producers.get(operation.path("bindingId").asText());
        require(
            producer != null
                && producer
                    .path("producerAdmissionId")
                    .equals(fact.path("ledger").path("admission").path("admissionId")),
            "REFERENCE_MISMATCH",
            422);
      }
    }
    ArrayNode effectiveEdges = contracts.object().putArray("items");
    Set<String> uses = new HashSet<>();
    Map<String, Set<String>> pairs = new HashMap<>();
    for (JsonNode edge : basis.path("consumerEdges")) {
      contracts.validate("v3/consumer-edge", edge);
      String consumer = edge.path("consumerAdmissionId").asText();
      JsonNode fact = actions.get(consumer);
      if (fact == null) {
        require(drift && excludedEdge(basis, edge, producers), "EVIDENCE_MISMATCH", 422);
        continue;
      }
      validateEdge(basis, edge, fact, GuidedPlanBuilder.proposal(basis, fact), producers);
      require(
          uses.add(consumer + "\u0000" + edge.path("argumentSlot").asText()),
          "REFERENCE_MISMATCH",
          422);
      effectiveEdges.add(edge.deepCopy());
      pairs
          .computeIfAbsent(edge.path("bindingId").asText(), key -> new HashSet<>())
          .add(pair(edge));
    }
    for (var entry : actions.entrySet()) {
      JsonNode operation = GuidedPlanBuilder.proposal(basis, entry.getValue()).path("operation");
      String field = operation.path("kind").asText().equals("assert") ? "expected" : "value";
      if (operation.path(field).path("kind").asText().equals("binding")) {
        require(
            uses.contains(
                entry.getKey() + "\u0000" + operation.path("kind").asText() + "." + field),
            "REFERENCE_MISMATCH",
            422);
      }
    }
    // Admission atomically records binding intent and its consumer edge, even when a positively
    // proven no-native attempt is later excluded from replay. Projection cannot erase that fact.
    for (JsonNode excluded : incremental.path("excludedAttempts")) {
      JsonNode fact = excluded.path("action"),
          proposal = excluded.path("preparation").path("proposal"),
          operation = proposal.path("operation");
      String kind = operation.path("kind").asText(),
          field = kind.equals("assert") ? "expected" : "value";
      if (!operation.path(field).path("kind").asText().equals("binding")) {
        continue;
      }
      String binding = operation.path(field).path("bindingId").asText(),
          slot = kind + "." + field,
          admission = fact.path("ledger").path("admission").path("admissionId").asText();
      JsonNode allocation = allocations.get(binding), producer = producers.get(binding);
      require(
          allocation != null
              && producer != null
              && allocation
                  .path("producerStepId")
                  .equals(producer.path("coordinate").path("stepId")),
          "REFERENCE_MISMATCH",
          422);
      int intentCount = 0;
      for (JsonNode intent : allocation.path("consumers")) {
        if (intent.path("stepId").equals(proposal.path("coordinate").path("stepId"))
            && intent.path("argumentSlot").asText().equals(slot)) {
          intentCount++;
        }
      }
      require(intentCount == 1, "REFERENCE_MISMATCH", 422);
      int edgeCount = 0;
      for (JsonNode edge : basis.path("consumerEdges")) {
        if (!edge.path("consumerAdmissionId").asText().equals(admission)
            || !edge.path("argumentSlot").asText().equals(slot)) {
          continue;
        }
        require(drift && excludedEdge(basis, edge, producers), "EVIDENCE_MISMATCH", 422);
        edgeCount++;
      }
      require(edgeCount == 1, "REFERENCE_MISMATCH", 422);
    }
    ArrayNode effectiveAllocations = contracts.object().putArray("items");
    for (JsonNode raw : basis.path("allocations")) {
      contracts.validate("v3/allocation", raw);
      String binding = raw.path("bindingId").asText();
      JsonNode producer = producers.get(binding), need = needs.get(binding);
      if (producer == null) {
        require(
            need == null
                && drift
                && validDriftAuthority(basis, incremental)
                && importedRead(basis, binding, raw.path("producerStepId").asText(), true)
                && !pairs.containsKey(binding),
            "REFERENCE_MISMATCH",
            422);
        for (JsonNode intent : raw.path("consumers")) {
          require(importedConsumer(basis, binding, intent), "REFERENCE_MISMATCH", 422);
        }
        continue;
      }
      require(
          need != null
              && need.path("needId").equals(raw.path("needId"))
              && need.path("producerStepId").equals(raw.path("producerStepId"))
              && producer.path("coordinate").path("stepId").equals(raw.path("producerStepId")),
          "REFERENCE_MISMATCH",
          422);
      Set<String> actual = pairs.getOrDefault(binding, Set.of());
      Set<String> declared = intentPairs(need.path("consumers"));
      Set<String> history = intentPairs(raw.path("consumers"));
      require(actual.equals(declared) && history.containsAll(declared), "REFERENCE_MISMATCH", 422);
      if (!raw.path("consumers").equals(need.path("consumers"))) {
        require(drift && validDriftAuthority(basis, incremental), "REFERENCE_MISMATCH", 422);
        for (JsonNode intent : raw.path("consumers")) {
          if (!declared.contains(pair(intent))) {
            require(importedConsumer(basis, binding, intent), "REFERENCE_MISMATCH", 422);
          }
        }
      }
      if (actual.isEmpty()) {
        require(
            retainedProducer(basis, producer)
                && (!drift || validDriftAuthority(basis, incremental)),
            "REFERENCE_MISMATCH",
            422);
      }
      ObjectNode projected = raw.deepCopy();
      projected.set("consumers", need.path("consumers").deepCopy());
      effectiveAllocations.add(projected);
    }
    require(
        effectiveAllocations.size() == producers.size() && needs.size() == producers.size(),
        "REFERENCE_MISMATCH",
        422);
    return new Projection(effectiveAllocations, effectiveEdges);
  }

  private boolean validDriftAuthority(JsonNode basis, JsonNode incremental) {
    if (!incremental.isObject()
        || !incremental.path("switch").path("reason").asText().equals("DRIFT")) {
      return false;
    }
    JsonNode receipt = incremental.path("driftReceipt"),
        transition = incremental.path("switch"),
        first = incremental.path("firstSuffixAcceptance");
    contracts.validate("v3/bridge#/definitions/DriftReceipt", receipt);
    ObjectNode preimage = receipt.deepCopy();
    preimage.remove("receiptHash");
    require(
        !receipt.path("nativeInvocationStarted").asBoolean(true)
            && GuidedContracts.hash(preimage).equals(receipt.path("receiptHash").asText())
            && receipt.path("receiptHash").equals(transition.path("driftReceiptHash"))
            && receipt.path("sessionId").equals(basis.path("sessionId"))
            && first.path("sessionId").equals(basis.path("sessionId"))
            && first
                .path("retainedPrefixAdmissionIds")
                .equals(transition.path("retainedPrefixAdmissionIds"))
            && first.path("planRevision").asLong()
                == first.path("previousPlanRevision").asLong() + 1
            && first.path("planRevision").asLong() <= basis.path("translationRevision").asLong(),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode proof = basis.path("snapshotEvidence").path("baseProof");
    require(proof.isObject(), "EVIDENCE_MISMATCH", 422);
    new GuidedSnapshotDeriver(contracts)
        .verifyBase(proof, basis.path("snapshotEvidence").path("pinnedBase"), basis);
    require(
        incremental.path("plan").path("initialFirstLearnIndex").asInt() > 0
            && GuidedContracts.hash(incremental.path("program"))
                .equals(incremental.path("plan").path("prefixProgramHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    return true;
  }

  private void validateEdge(
      JsonNode basis,
      JsonNode edge,
      JsonNode fact,
      JsonNode proposal,
      Map<String, JsonNode> producers) {
    JsonNode producer = producers.get(edge.path("bindingId").asText());
    require(
        producer != null
            && producer.path("producerAdmissionId").equals(edge.path("producerAdmissionId"))
            && edge.path("coordinate").equals(fact.path("ledger").path("coordinate"))
            && edge.path("destinationOrigin")
                .equals(proposal.path("executionEvidence").path("origin"))
            && edge.path("destinationOrigin").equals(producer.path("origin")),
        "REFERENCE_MISMATCH",
        422);
    JsonNode operation = proposal.path("operation");
    String kind = operation.path("kind").asText(),
        field = kind.equals("assert") ? "expected" : "value";
    require(
        edge.path("argumentSlot").asText().equals(kind + "." + field)
            && operation.path(field).path("kind").asText().equals("binding")
            && operation.path(field).path("bindingId").equals(edge.path("bindingId")),
        "REFERENCE_MISMATCH",
        422);
    require(
        before(basis, producer.path("coordinate"), edge.path("coordinate")), "BINDING_ORDER", 422);
  }

  private boolean excludedEdge(JsonNode basis, JsonNode edge, Map<String, JsonNode> producers) {
    JsonNode incremental = basis.path("incrementalEvidence");
    if (incremental.path("excludedAttempts").size() != 1) {
      return false;
    }
    JsonNode excluded = incremental.path("excludedAttempts").get(0),
        fact = excluded.path("action"),
        ledger = fact.path("ledger");
    JsonNode receipt = incremental.path("driftReceipt");
    if (!receipt.path("phase").asText().equals("ADMITTED_PRE_INVOCATION")
        || !ledger.path("admission").path("admissionId").equals(edge.path("consumerAdmissionId"))) {
      return false;
    }
    require(
        ledger.path("state").asText().equals("FAILED")
            && ledger.path("outcomeCode").asText().equals("TARGET_CHANGED")
            && ledger.path("dispatchCount").asInt() == 1
            && ledger.path("attemptOrdinal").asInt(-1) == 0
            && receipt.path("admissionId").equals(edge.path("consumerAdmissionId"))
            && receipt
                .path("preparationId")
                .equals(excluded.path("preparation").path("preparationId"))
            && receipt.path("coordinate").equals(ledger.path("coordinate"))
            && receipt.path("operationHash").equals(ledger.path("operationHash"))
            && GuidedContracts.hash(excluded.path("preparation").path("proposal"))
                .equals(ledger.path("requestDigest").asText())
            && ledger
                .path("requestDigest")
                .equals(excluded.path("obligationAssociation").path("proposalHash")),
        "EVIDENCE_MISMATCH",
        422);
    validateEdge(basis, edge, fact, excluded.path("preparation").path("proposal"), producers);
    return true;
  }

  private boolean importedRead(JsonNode basis, String binding, String stepId, boolean afterDrift) {
    JsonNode original = originalBinding(basis, binding);
    if (original == null || !original.path("producer").path("stepId").asText().equals(stepId)) {
      return false;
    }
    for (JsonNode action : basis.path("incrementalEvidence").path("program").path("actions")) {
      if (action.path("coordinate").equals(original.path("producer"))
          && action.path("operation").path("kind").asText().equals("read")
          && action.path("operation").path("bindingId").asText().equals(binding)
          && action.path("operation").path("recipe").equals(original.path("recipe"))) {
        return !afterDrift || atOrAfterDrift(basis, action.path("coordinate"));
      }
    }
    return false;
  }

  private boolean importedConsumer(JsonNode basis, String binding, JsonNode intent) {
    JsonNode original = originalBinding(basis, binding);
    if (original == null) {
      return false;
    }
    boolean wasUsed = false;
    for (JsonNode edge : original.path("consumers")) {
      wasUsed |= pair(edge).equals(pair(intent));
    }
    if (!wasUsed) {
      return false;
    }
    for (JsonNode action : basis.path("incrementalEvidence").path("program").path("actions")) {
      JsonNode operation = action.path("operation");
      String kind = operation.path("kind").asText(),
          field = kind.equals("assert") ? "expected" : "value";
      if (action.path("coordinate").path("stepId").equals(intent.path("stepId"))
          && (kind + "." + field).equals(intent.path("argumentSlot").asText())
          && operation.path(field).path("kind").asText().equals("binding")
          && operation.path(field).path("bindingId").asText().equals(binding)
          && atOrAfterDrift(basis, action.path("coordinate"))) {
        return true;
      }
    }
    return false;
  }

  private boolean retainedProducer(JsonNode basis, JsonNode producer) {
    JsonNode incremental = basis.path("incrementalEvidence");
    if (!incremental.isObject()
        || !importedRead(
            basis,
            producer.path("bindingId").asText(),
            producer.path("coordinate").path("stepId").asText(),
            false)) {
      return false;
    }
    JsonNode original = originalBinding(basis, producer.path("bindingId").asText());
    if (original == null
        || !original.path("producer").equals(producer.path("coordinate"))
        || !original.path("recipe").equals(producer.path("recipe"))
        || !original.path("sourceOrigin").equals(producer.path("origin"))) {
      return false;
    }
    for (JsonNode admission : incremental.path("switch").path("retainedPrefixAdmissionIds")) {
      if (admission.equals(producer.path("producerAdmissionId"))) {
        return true;
      }
    }
    return false;
  }

  private JsonNode originalBinding(JsonNode basis, String id) {
    JsonNode found = null;
    for (JsonNode binding :
        basis
            .path("snapshotEvidence")
            .path("baseProof")
            .path("artifact")
            .path("learnedPlan")
            .path("bindings")) {
      if (binding.path("bindingId").asText().equals(id)) {
        require(found == null, "REFERENCE_MISMATCH", 422);
        found = binding;
      }
    }
    return found;
  }

  private boolean atOrAfterDrift(JsonNode basis, JsonNode coordinate) {
    JsonNode transition = basis.path("incrementalEvidence").path("switch");
    int step = position(basis, coordinate.path("stepId").asText());
    int boundary = transition.path("effectiveFirstLearnIndex").asInt(-1);
    return step > boundary
        || step == boundary
            && coordinate.path("ordinal").asInt() >= transition.path("nextSemanticOrdinal").asInt();
  }

  private boolean before(JsonNode basis, JsonNode left, JsonNode right) {
    int first = position(basis, left.path("stepId").asText()),
        second = position(basis, right.path("stepId").asText());
    return first < second
        || first == second && left.path("ordinal").asInt() < right.path("ordinal").asInt();
  }

  private static int position(JsonNode basis, String id) {
    int at = 0;
    for (JsonNode step : basis.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(id)) {
        return at;
      }
      at++;
    }
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
        "REFERENCE_MISMATCH", 422);
  }

  private static Set<String> intentPairs(JsonNode intents) {
    require(intents.isArray(), "REFERENCE_MISMATCH", 422);
    Set<String> result = new HashSet<>();
    for (JsonNode intent : intents) {
      require(result.add(pair(intent)), "REFERENCE_MISMATCH", 422);
    }
    return result;
  }

  private static String pair(JsonNode item) {
    JsonNode coordinate = item.has("coordinate") ? item.path("coordinate") : item;
    return coordinate.path("stepId").asText() + "\u0000" + item.path("argumentSlot").asText();
  }
}

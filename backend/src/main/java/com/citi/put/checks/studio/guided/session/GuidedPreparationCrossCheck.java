package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * ADR-SC-007 D2: the gates admit {@code facts[ref]}; the runner then reports the locator, tier and
 * identity it synthesized for that ref on the preparation proof, and the ledger hash and the
 * learned plan are built from that report. This check runs before a preparation is stored and
 * before anything is admitted: the reported target must agree with the fact the gates judged.
 *
 * <ul>
 *   <li>a node target needs a non-null target, a page or password-control target needs none;
 *   <li>the observation held for the proposal's document and generation must contain the ref;
 *   <li>the reported identity role equals the fact's role, and the reported identity name is null
 *       or equals the fact's name.
 * </ul>
 *
 * <p>The runner builds the identity from the same node its facts come from, so equality holds by
 * construction; a refusal means a mapping bug and is caught before it is frozen into a hash.
 */
public final class GuidedPreparationCrossCheck {
  private GuidedPreparationCrossCheck() {}

  /** EVIDENCE_MISMATCH 422 on any disagreement; nothing is stored or admitted. */
  public static void verify(JsonNode proposal, JsonNode proof, JsonNode observation) {
    JsonNode target = proposal.path("target");
    JsonNode reported = proof.path("target");
    boolean node = target.path("kind").asText().equals("node");
    require(node == reported.isObject(), "EVIDENCE_MISMATCH", 422);
    require(
        !hasChild(reported.path("locator"))
            || java.util.Set.of("read", "assert")
                .contains(proposal.path("operation").path("kind").asText()),
        "EVIDENCE_MISMATCH",
        422);
    if (!node) {
      require(
          !reported.has("assertTextMode") && !proof.has("assertSourceBinding"),
          "EVIDENCE_MISMATCH",
          422);
      return;
    }
    require(
        observation != null
            && observation.path("documentId").equals(target.path("documentId"))
            && GuidedContracts.same(observation.path("generation"), target.path("generation")),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode fact = observation.path("facts").path(target.path("ref").asText());
    JsonNode identity = reported.path("identity");
    JsonNode operation = proposal.path("operation");
    boolean direct = fact.path("directTextAssertion").asBoolean(false);
    boolean source = proof.has("assertSourceBinding");
    String mode = reported.path("assertTextMode").asText();
    require(
        !reported.has("assertTextMode") || reported.path("assertTextMode").isTextual(),
        "EVIDENCE_MISMATCH",
        422);
    require(!direct || mode.equals("DIRECT_PUBLIC"), "EVIDENCE_MISMATCH", 422);
    require(!source || mode.equals("READ_BINDING_SOURCE"), "EVIDENCE_MISMATCH", 422);
    if (reported.has("assertTextMode")) {
      require(
          operation.path("kind").asText().equals("assert")
              && operation.path("predicate").asText().equals("containsText")
              && (mode.equals("DIRECT_PUBLIC")
                  ? direct
                      && !source
                      && operation.path("expected").path("kind").asText().equals("authoredLiteral")
                  : mode.equals("READ_BINDING_SOURCE")
                      && source
                      && !direct
                      && operation.path("expected").path("kind").asText().equals("binding")
                      && operation
                          .path("expected")
                          .path("bindingId")
                          .equals(proof.path("assertSourceBinding").path("bindingId"))),
          "EVIDENCE_MISMATCH",
          422);
    }
    require(
        fact.isObject()
            && identity.path("role").isTextual()
            && identity.path("role").asText().equals(fact.path("role").asText())
            && (identity.path("name").isNull()
                || identity.path("name").isTextual()
                    && identity.path("name").asText().equals(fact.path("name").asText())),
        "EVIDENCE_MISMATCH",
        422);
  }

  /** Successful producer authority comes from authenticated persisted history, never from a ref. */
  public static JsonNode sourceBinding(
      GuidedContracts contracts,
      JsonNode plan,
      JsonNode proposal,
      JsonNode context,
      JsonNode history) {
    JsonNode operation = proposal.path("operation");
    if (!operation.path("kind").asText().equals("assert")
        || !operation.path("predicate").asText().equals("containsText")
        || !operation.path("expected").path("kind").asText().equals("binding")) {
      return com.fasterxml.jackson.databind.node.NullNode.instance;
    }
    require(proposal.path("target").path("kind").asText().equals("node"), "EVIDENCE_MISMATCH", 422);
    String binding = operation.path("expected").path("bindingId").asText();
    JsonNode producer = null;
    for (JsonNode item : context.path("producers")) {
      if (item.path("bindingId").asText().equals(binding)) {
        require(producer == null, "EVIDENCE_MISMATCH", 422);
        producer = item;
      }
    }
    require(producer != null, "BINDING_ORDER", 422);
    JsonNode prior = null;
    for (JsonNode row : history) {
      if (row.path("ledger")
          .path("admission")
          .path("admissionId")
          .equals(producer.path("producerAdmissionId"))) {
        require(prior == null, "EVIDENCE_MISMATCH", 422);
        prior = row;
      }
    }
    require(prior != null, "EVIDENCE_MISMATCH", 422);
    JsonNode ledger = prior.path("ledger"),
        old = prior.path("proposal"),
        proof = prior.path("proof");
    // Serialized ref agreement selects only a candidate. The runner must independently hold the
    // exact physical successful-read capability; this metadata cannot manufacture it.
    if (!old.path("target").path("ref").equals(proposal.path("target").path("ref"))
        || !old.path("target")
            .path("documentId")
            .equals(proposal.path("target").path("documentId"))) {
      return com.fasterxml.jackson.databind.node.NullNode.instance;
    }
    require(
        ledger.path("state").asText().equals("SUCCEEDED")
            && ledger.path("outcomeCode").asText().equals("OK")
            && ledger.path("dispatchCount").asInt(-1) == 1
            && old.path("operation").path("kind").asText().equals("read")
            && old.path("operation").path("bindingId").asText().equals(binding)
            && old.path("coordinate").equals(producer.path("coordinate"))
            && producer.path("origin").equals(old.path("executionEvidence").path("origin"))
            && old.path("operation").path("recipe").isObject()
            && producer.path("recipe").equals(old.path("operation").path("recipe"))
            && old.path("target").path("kind").asText().equals("node")
            && old.path("target")
                .path("documentId")
                .equals(proposal.path("target").path("documentId"))
            && old.path("executionEvidence")
                .path("origin")
                .equals(proposal.path("executionEvidence").path("origin"))
            && ledger.path("preparationId").equals(proof.path("preparationId"))
            && ledger.path("requestDigest").asText().equals(GuidedContracts.hash(old)),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode availability = producer.path("availability");
    require(
        availability.path("bindingId").asText().equals(binding)
            && availability
                .path("producerAdmissionId")
                .equals(producer.path("producerAdmissionId")),
        "EVIDENCE_MISMATCH",
        422);
    for (String field : java.util.List.of("contextId", "workerId", "ownerFence")) {
      require(
          GuidedContracts.same(availability.path(field), proof.path(field)),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (String field :
        java.util.List.of(
            "sessionId",
            "contextId",
            "contextRevision",
            "authoredInputsHash",
            "workerId",
            "ownerFence",
            "scopeHash",
            "sourceRevision",
            "configurationRevision")) {
      require(
          GuidedContracts.same(proof.path(field), context.path(field)), "EVIDENCE_MISMATCH", 422);
    }
    JsonNode need = null;
    for (JsonNode item : plan.path("needs")) {
      if (item.path("bindingId").asText().equals(binding)) {
        require(need == null, "EVIDENCE_MISMATCH", 422);
        need = item;
      }
    }
    require(
        need != null && need.path("producerStepId").equals(old.path("coordinate").path("stepId")),
        "BINDING_ORDER",
        422);
    boolean consumer = false;
    for (JsonNode item : need.path("consumers")) {
      consumer |=
          item.path("stepId").equals(proposal.path("coordinate").path("stepId"))
              && item.path("argumentSlot").asText().equals("assert.expected");
    }
    require(consumer, "BINDING_ORDER", 422);
    return contracts
        .object()
        .put("bindingId", binding)
        .put("producerAdmissionId", producer.path("producerAdmissionId").asText())
        .put("producerPreparationId", proof.path("preparationId").asText());
  }

  /** Reconstruct the join independently when validating a frozen immutable basis. */
  public static void verifySourceHistory(
      GuidedContracts contracts,
      JsonNode plan,
      JsonNode proposal,
      JsonNode proof,
      JsonNode history,
      JsonNode producers) {
    JsonNode operation = proposal.path("operation");
    boolean bindingAssertion =
        proposal.path("target").path("kind").asText().equals("node")
            && operation.path("kind").asText().equals("assert")
            && operation.path("predicate").asText().equals("containsText")
            && operation.path("expected").path("kind").asText().equals("binding");
    if (!bindingAssertion) {
      require(
          !proof.has("assertSourceBinding")
              && !proof
                  .path("target")
                  .path("assertTextMode")
                  .asText()
                  .equals("READ_BINDING_SOURCE"),
          "EVIDENCE_MISMATCH",
          422);
      return;
    }
    var context = proof.deepCopy();
    require(context.isObject(), "EVIDENCE_MISMATCH", 422);
    ((com.fasterxml.jackson.databind.node.ObjectNode) context).set("producers", producers);
    JsonNode expected = sourceBinding(contracts, plan, proposal, context, history);
    if (expected.isNull()) {
      require(
          !proof.has("assertSourceBinding")
              && !proof
                  .path("target")
                  .path("assertTextMode")
                  .asText()
                  .equals("READ_BINDING_SOURCE"),
          "EVIDENCE_MISMATCH",
          422);
      return;
    }
    require(
        expected.isObject()
            && GuidedContracts.same(expected, proof.path("assertSourceBinding"))
            && proof.path("target").path("assertTextMode").asText().equals("READ_BINDING_SOURCE"),
        "EVIDENCE_MISMATCH",
        422);
  }

  public static boolean hasChild(JsonNode locator) {
    for (JsonNode step : locator) {
      if (step.path("relation").asText().equals("child")) {
        return true;
      }
    }
    return false;
  }
}

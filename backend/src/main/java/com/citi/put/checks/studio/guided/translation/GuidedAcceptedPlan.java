package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;

/** Validates server-owned plan facts without projecting away immutable server identities. */
public final class GuidedAcceptedPlan {
  private static final String ACCEPTED =
      "v3/replay-validation#/definitions/AcceptedTranslationPlan";

  private GuidedAcceptedPlan() {}

  /** Fully allocated current plans carried by publication evidence, after bootstrap allocation. */
  public static void validate(GuidedContracts contracts, JsonNode plan) {
    contracts.validate(ACCEPTED, plan);
    identities(plan);
  }

  /**
   * A merge contains allocated retained needs and newly validated model needs awaiting allocation.
   * Validate each against its existing authoritative definition. No placeholder identity is minted,
   * no raw model orphan is accepted, and the original plan is never changed by validation.
   */
  public static void validateBeforeAllocation(GuidedContracts contracts, JsonNode plan) {
    require(
        plan.isObject()
            && plan.size() == 3
            && plan.has("sourceReferences")
            && plan.has("obligations")
            && plan.has("needs"),
        "INVALID_CONTRACT",
        422);
    contracts.validate(ACCEPTED + "/properties/sourceReferences", plan.path("sourceReferences"));
    contracts.validate(ACCEPTED + "/properties/obligations", plan.path("obligations"));
    require(
        plan.path("needs").isArray() && plan.path("needs").size() <= 32, "INVALID_CONTRACT", 422);
    for (JsonNode need : plan.path("needs")) {
      contracts.validate(
          need.has("bindingId")
              ? ACCEPTED + "/properties/needs/items"
              : "v3/source-selection#/properties/needs/items",
          need);
      // The shared need leaf also represents trusted retained imports. A fresh model need has
      // no allocated identity yet and must still name an actual intended consumer.
      require(
          need.has("bindingId") || !need.path("consumers").isEmpty(), "REFERENCE_MISMATCH", 422);
    }
    identities(plan);
  }

  private static void identities(JsonNode plan) {
    Set<String> obligations = new HashSet<>(),
        coordinates = new HashSet<>(),
        needs = new HashSet<>(),
        bindings = new HashSet<>();
    for (JsonNode obligation : plan.path("obligations")) {
      require(
          obligations.add(obligation.path("obligationId").asText())
              && coordinates.add(
                  obligation.path("stepId").asText()
                      + "\u0000"
                      + obligation.path("occurrence").asInt()),
          "INVALID_CONTRACT",
          422);
      if (!obligation.path("referenceIndex").isNull()) {
        require(
            obligation.path("referenceIndex").asInt() < plan.path("sourceReferences").size(),
            "REFERENCE_MISMATCH",
            422);
      }
    }
    for (JsonNode need : plan.path("needs")) {
      require(
          needs.add(need.path("needId").asText())
              && (!need.has("bindingId") || bindings.add(need.path("bindingId").asText())),
          "REFERENCE_MISMATCH",
          422);
      Set<String> consumers = new HashSet<>();
      for (JsonNode consumer : need.path("consumers")) {
        require(
            consumers.add(
                consumer.path("stepId").asText()
                    + "\u0000"
                    + consumer.path("argumentSlot").asText()),
            "REFERENCE_MISMATCH",
            422);
      }
    }
  }
}

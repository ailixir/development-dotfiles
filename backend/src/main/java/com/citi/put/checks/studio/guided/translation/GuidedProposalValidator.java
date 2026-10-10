package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Independent scope/slot/remaining-obligation constraints; no confidence-based admission. */
public final class GuidedProposalValidator {
  private final GuidedContracts contracts;

  public GuidedProposalValidator(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode admitPlan(JsonNode session, JsonNode response) {
    ObjectNode plan = contracts.object();
    for (String field : java.util.List.of("sourceReferences", "obligations", "needs")) {
      plan.set(field, response.path(field).deepCopy());
    }
    contracts.validate("v2/source-selection", plan);
    Set<String> steps = new HashSet<>();
    session.path("sourceSteps").forEach(step -> steps.add(step.path("stepId").asText()));
    Set<String> occurrences = new HashSet<>();
    Map<String, Integer> counts = new HashMap<>();
    for (JsonNode item : plan.path("obligations")) {
      ObjectNode obligation = (ObjectNode) item;
      String step = item.path("stepId").asText(), kind = item.path("operationKind").asText();
      int occurrence = item.path("occurrence").asInt();
      require(
          steps.contains(step)
              && occurrences.add(step + ":" + occurrence)
              && occurrence == counts.getOrDefault(step, 0),
          "BINDING_ORDER",
          422);
      counts.put(step, occurrence + 1);
      require(
          occurrence < session.path("limits").path("maxStatementsPerStep").asInt(),
          "BUDGET_EXCEEDED",
          429);
      if (!item.path("referenceIndex").isNull()) {
        int ref = item.path("referenceIndex").asInt();
        require(ref >= 0 && ref < plan.path("sourceReferences").size(), "INVALID_CONTRACT", 422);
        JsonNode reference = plan.path("sourceReferences").get(ref);
        require(
            reference.path("stepId").asText().equals(step)
                && reference.path("intendedSlot").asText().equals(slot(kind)),
            "INVALID_CONTRACT",
            422);
      }
      boolean hasReference = !item.path("referenceIndex").isNull();
      boolean hasNeed = !item.path("needId").isNull();
      boolean permitted = false;
      for (JsonNode capability : session.path("scope").path("capabilities")) {
        permitted |= capability.asText().equals(kind);
      }
      require(permitted, "FORBIDDEN_SCOPE", 403);
      require(kind.equals("assert") == !item.path("predicate").isNull(), "INVALID_CONTRACT", 422);
      if (kind.equals("read")) {
        require(hasNeed && !hasReference, "MISSING_SOURCE", 409);
      }
      if (kind.equals("assert")) {
        require(
            item.path("predicate").asText().equals("visible")
                ? !hasReference && !hasNeed
                : hasReference != hasNeed,
            "INVALID_CONTRACT",
            422);
      }
      if (Set.of("click", "press", "hover", "check", "uncheck").contains(kind)) {
        require(!hasReference && !hasNeed, "INVALID_CONTRACT", 422);
      }
      require(!kind.equals("navigate") || hasReference && !hasNeed, "MISSING_SOURCE", 409);
      require(
          !Set.of("fill", "selectOption").contains(kind)
              || !item.path("referenceIndex").isNull() != !item.path("needId").isNull(),
          "MISSING_SOURCE",
          409);
      obligation.put("obligationId", UUID.randomUUID().toString());
    }
    require(counts.keySet().equals(steps), "INVALID_CONTRACT", 422);
    return plan;
  }

  public void sourceMeaning(JsonNode session, JsonNode meaning) {
    contracts.validate("v2/source-selection#/definitions/sourceQuestionMeaning", meaning);
    JsonNode need = meaning.path("need"), reference = meaning.path("reference");
    boolean step = false, capability = false;
    for (JsonNode item : session.path("sourceSteps")) {
      step |= item.path("stepId").equals(need.path("stepId"));
    }
    for (JsonNode item : session.path("scope").path("capabilities")) {
      capability |= item.equals(need.path("operationKind"));
    }
    require(
        step
            && capability
            && need.path("occurrence").asInt()
                < session.path("limits").path("maxStatementsPerStep").asInt()
            && slot(need.path("operationKind").asText()).equals(need.path("argumentSlot").asText())
            && reference.path("stepId").equals(need.path("stepId"))
            && reference.path("intendedSlot").equals(need.path("argumentSlot")),
        "INVALID_CONTRACT",
        422);
  }

  /** An answered reference must occupy its exact disputed use, never merely appear in the list. */
  public void sourceSelections(JsonNode session, JsonNode plan, JsonNode selections) {
    for (JsonNode selected : selections) {
      sourceMeaning(session, selected);
      JsonNode need = selected.path("need");
      JsonNode found = null;
      for (JsonNode obligation : plan.path("obligations")) {
        if (sameOccurrence(need, obligation)) {
          require(found == null, "INVALID_CONTRACT", 422);
          found = obligation;
        }
      }
      require(
          found != null
              && found.path("operationKind").equals(need.path("operationKind"))
              && slot(found.path("operationKind").asText())
                  .equals(need.path("argumentSlot").asText())
              && found.path("referenceIndex").isIntegralNumber()
              && found.path("needId").isNull(),
          "INVALID_CONTRACT",
          422);
      int index = found.path("referenceIndex").asInt();
      require(
          index >= 0
              && index < plan.path("sourceReferences").size()
              && plan.path("sourceReferences").get(index).equals(selected.path("reference")),
          "INVALID_CONTRACT",
          422);
    }
  }

  public static boolean sameOccurrence(JsonNode left, JsonNode right) {
    return left.path("stepId").equals(right.path("stepId"))
        && left.path("occurrence").equals(right.path("occurrence"));
  }

  /** Refinement preserves every admitted occurrence; new work is a required private read only. */
  public ObjectNode refinePlan(
      JsonNode session, JsonNode progress, JsonNode old, JsonNode response) {
    ObjectNode next = admitPlan(session, response);
    require(
        next.path("sourceReferences").equals(old.path("sourceReferences")),
        "REVISION_CONFLICT",
        409);
    for (JsonNode prior : old.path("obligations")) {
      ObjectNode matching = null;
      for (JsonNode item : next.path("obligations")) {
        if (item.path("stepId").equals(prior.path("stepId"))
            && item.path("occurrence").equals(prior.path("occurrence"))) {
          matching = (ObjectNode) item;
        }
      }
      require(matching != null, "IDEMPOTENCY_CONFLICT", 409);
      ObjectNode before = ((ObjectNode) prior).deepCopy();
      before.remove("obligationId");
      ObjectNode after = matching.deepCopy();
      after.remove("obligationId");
      require(before.equals(after), "IDEMPOTENCY_CONFLICT", 409);
      matching.set("obligationId", prior.path("obligationId"));
    }
    String currentStep =
        session.path("sourceSteps").get(progress.path("stepIndex").asInt()).path("stepId").asText();
    for (JsonNode item : next.path("obligations")) {
      boolean existed = false;
      for (JsonNode prior : old.path("obligations")) {
        existed |= item.path("obligationId").equals(prior.path("obligationId"));
      }
      if (!existed) {
        require(
            item.path("operationKind").asText().equals("read")
                && item.path("stepId").asText().equals(currentStep),
            "BINDING_ORDER",
            422);
        for (JsonNode prior : old.path("obligations")) {
          require(
              !prior.path("stepId").equals(item.path("stepId"))
                  || !prior.path("operationKind").equals(item.path("operationKind"))
                  || !prior.path("targetIntent").equals(item.path("targetIntent")),
              "IDEMPOTENCY_CONFLICT",
              409);
        }
      }
    }
    return next;
  }

  public JsonNode remaining(JsonNode plan, String id) {
    for (JsonNode obligation : plan.path("obligations")) {
      if (obligation.path("obligationId").asText().equals(id)) {
        return obligation;
      }
    }
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
        "INVALID_CONTRACT", 422);
  }

  /** Original committed attempt authority is checked before adding any current bridge fields. */
  public ObjectNode materializeAction(
      JsonNode session,
      JsonNode progress,
      JsonNode obligation,
      JsonNode selection,
      JsonNode context,
      JsonNode originalAttempt,
      long currentPlanRevision) {
    require(
        originalAttempt.path("planRevision").asLong(-1) == currentPlanRevision,
        "REVISION_CONFLICT",
        409);
    require(
        originalAttempt.path("scope").equals(session.path("scope"))
            && originalAttempt.path("scopeHash").equals(session.path("scopeHash"))
            && originalAttempt
                .path("owner")
                .path("workerId")
                .equals(session.path("owner").path("workerId"))
            && originalAttempt
                .path("owner")
                .path("fence")
                .equals(session.path("owner").path("fence")),
        "STALE_FENCE",
        409);
    for (String field :
        java.util.List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
      JsonNode value =
          progress.has(field)
              ? progress.path(field)
              : com.fasterxml.jackson.databind.node.NullNode.instance;
      require(originalAttempt.path(field).equals(value), "STALE_GENERATION", 409);
    }
    require(
        originalAttempt.path("expectedContextRevision").equals(context.path("contextRevision"))
            && originalAttempt
                .path("expectedAuthoredInputsHash")
                .equals(context.path("authoredInputsHash")),
        "REVISION_CONFLICT",
        409);
    JsonNode step = session.path("sourceSteps").get(progress.path("stepIndex").asInt());
    require(
        step != null && step.path("stepId").equals(obligation.path("stepId")),
        "BINDING_ORDER",
        422);
    require(
        selection.isObject()
            && selection.size() == 2
            && selection.has("target")
            && selection.has("operation"),
        "INVALID_CONTRACT",
        422);
    JsonNode selectedTarget = selection.path("target");
    require(
        !selectedTarget.has("documentId") && !selectedTarget.has("generation"),
        "INVALID_CONTRACT",
        422);
    ObjectNode proposal = contracts.object().put("schemaVersion", 2);
    proposal.set("sessionId", session.path("sessionId"));
    proposal.set("scopeHash", session.path("scopeHash"));
    proposal
        .putObject("coordinate")
        .setAll(
            java.util.Map.of(
                "stepId", obligation.path("stepId"), "ordinal", obligation.path("occurrence")));
    for (String field : java.util.List.of("generation", "executionEvidence", "evidenceHash")) {
      proposal.set(field, progress.path(field));
    }
    for (String field : java.util.List.of("authoredInputsHash", "contextRevision")) {
      proposal.set(field, context.path(field));
    }
    ObjectNode target = ((ObjectNode) selectedTarget).deepCopy();
    target.set("documentId", progress.path("documentId"));
    target.set("generation", progress.path("generation"));
    proposal.set("target", target);
    proposal.set("operation", selection.path("operation"));
    contracts.validate("v2/action", proposal);
    return proposal;
  }

  public void action(
      JsonNode session,
      JsonNode progress,
      JsonNode plan,
      JsonNode obligation,
      JsonNode proposal,
      JsonNode context) {
    contracts.validate("v2/action", proposal);
    require(
        proposal.path("sessionId").equals(session.path("sessionId"))
            && proposal.path("scopeHash").equals(session.path("scopeHash"))
            && proposal.path("coordinate").path("stepId").equals(obligation.path("stepId"))
            && proposal.path("coordinate").path("ordinal").equals(obligation.path("occurrence"))
            && proposal.path("operation").path("kind").equals(obligation.path("operationKind")),
        "INVALID_CONTRACT",
        422);
    require(
        proposal.path("generation").equals(progress.path("generation"))
            && proposal.path("evidenceHash").equals(progress.path("evidenceHash"))
            && proposal.path("executionEvidence").equals(progress.path("executionEvidence")),
        "STALE_GENERATION",
        409);
    JsonNode target = proposal.path("target");
    if (!target.path("kind").asText().equals("page")) {
      JsonNode locator = target.path("locator");
      String name =
          locator.path(locator.path("kind").asText().equals("role") ? "name" : "value").asText();
      require(
          name.equalsIgnoreCase(obligation.path("targetIntent").asText()), "INVALID_CONTRACT", 422);
    }
    JsonNode operation = proposal.path("operation");
    String kind = operation.path("kind").asText();
    JsonNode value = kind.equals("assert") ? operation.path("expected") : operation.path("value");
    if (!obligation.path("referenceIndex").isNull()) {
      JsonNode reference =
          plan.path("sourceReferences").get(obligation.path("referenceIndex").asInt());
      String inputId = "";
      for (JsonNode input : context.path("authoredInputs").path("inputs")) {
        if (input.path("provenance").equals(reference)) {
          inputId = input.path("inputId").asText();
        }
      }
      require(
          !inputId.isBlank()
              && (kind.equals("navigate")
                  ? operation.path("destinationInputId").asText().equals(inputId)
                  : value.path("kind").asText().equals("authoredLiteral")
                      && value.path("sourceInputId").asText().equals(inputId)),
          "INVALID_CONTRACT",
          422);
    }
    if (!obligation.path("needId").isNull()) {
      String binding = "";
      for (JsonNode need : plan.path("needs")) {
        if (need.path("needId").equals(obligation.path("needId"))) {
          binding = need.path("bindingId").asText();
        }
      }
      require(
          !binding.isBlank()
              && (kind.equals("read")
                  ? operation.path("bindingId").asText().equals(binding)
                  : value.path("kind").asText().equals("binding")
                      && value.path("bindingId").asText().equals(binding)),
          "BINDING_ORDER",
          422);
    }
    if (kind.equals("assert")) {
      require(
          operation.path("predicate").equals(obligation.path("predicate")),
          "INVALID_CONTRACT",
          422);
    }
  }

  private static String slot(String kind) {
    return switch (kind) {
      case "navigate" -> "navigate.destination";
      case "fill" -> "fill.value";
      case "selectOption" -> "selectOption.value";
      case "assert" -> "assert.expected";
      default -> "";
    };
  }
}

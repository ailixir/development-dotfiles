package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

/** Independent scope/slot/remaining-obligation constraints; no confidence-based admission. */
public final class GuidedProposalValidator {
  private final GuidedContracts contracts;

  public GuidedProposalValidator(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode admitPlan(JsonNode session, JsonNode response) {
    return admitPlan(session, response, null);
  }

  public ObjectNode admitPlan(JsonNode session, JsonNode response, JsonNode learningWindow) {
    return admitPlan(session, response, learningWindow, null);
  }

  /**
   * @param manifestSteps the source manifest's {@code sourceSteps} ({@code stepId} and authored
   *     {@code text}); the only place a {@code scopeIntent} phrase may come from. Null admits no
   *     qualified obligation.
   */
  public ObjectNode admitPlan(
      JsonNode session, JsonNode response, JsonNode learningWindow, JsonNode manifestSteps) {
    return admitPlan(session, response, learningWindow, manifestSteps, null, null);
  }

  /**
   * ADR-SC-007 D6: the model labels a read and each obligation that uses its value with one shared
   * {@code needId}; the server derives {@code needs} (producer, consumers, consumer slots). A reply
   * carries no {@code needs}.
   *
   * @param retainedPlan the plan whose steps are retained outside the learning window: a consumer
   *     inside the window may name one of its needs. Read only with a learning window; null, absent
   *     or not an object retains nothing.
   * @param sink receives the closed subcase of a refusal (tests); production passes none and sees
   *     the subcase in the refusal WARN line.
   */
  public ObjectNode admitPlan(
      JsonNode session,
      JsonNode response,
      JsonNode learningWindow,
      JsonNode manifestSteps,
      JsonNode retainedPlan,
      Consumer<GuidedRefusalDiagnostics.PlanSubcase> sink) {
    ObjectNode plan = contracts.object();
    for (String field : java.util.List.of("sourceReferences", "obligations")) {
      plan.set(field, response.path(field).deepCopy());
    }
    JsonNode retainedNeeds =
        learningWindow != null && retainedPlan != null && retainedPlan.path("needs").isArray()
            ? retainedPlan.path("needs")
            : null;
    ArrayNode derived = deriveNeeds(plan.path("obligations"), retainedNeeds);
    plan.set("needs", derived);
    contracts.validate("v3/source-selection", plan);
    Map<String, Integer> stepOrder = new HashMap<>();
    session
        .path("sourceSteps")
        .forEach(step -> stepOrder.putIfAbsent(step.path("stepId").asText(), stepOrder.size()));
    Set<String> steps = new HashSet<>();
    if (learningWindow == null) {
      session.path("sourceSteps").forEach(step -> steps.add(step.path("stepId").asText()));
    } else {
      learningWindow.path("learnableStepIds").forEach(step -> steps.add(step.asText()));
    }
    Set<String> occurrences = new HashSet<>();
    Map<String, Integer> counts = new HashMap<>();
    if (learningWindow != null) {
      for (JsonNode coordinate : learningWindow.path("completedCoordinates")) {
        if (steps.contains(coordinate.path("stepId").asText())) {
          counts.merge(coordinate.path("stepId").asText(), 1, Math::addExact);
        }
      }
    }
    Set<String> reads = new HashSet<>();
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
        requireReadIsUsed(item, derived, reads, stepOrder, hasReference, sink);
      }
      if (kind.equals("assert")) {
        boolean sourced =
            item.path("predicate").asText().equals("visible")
                ? !hasReference && !hasNeed
                : hasReference != hasNeed;
        if (!sourced) {
          GuidedRejectionDiagnostics.assertShape(item);
        }
        require(sourced, "INVALID_CONTRACT", 422);
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
      requireScopeIntent(plan, item, kind, hasReference, manifestSteps);
      obligation.put("obligationId", UUID.randomUUID().toString());
    }
    require(counts.keySet().equals(steps), "INVALID_CONTRACT", 422);
    if (manifestSteps != null) {
      JsonNode preceding = null;
      for (JsonNode step : manifestSteps) {
        JsonNode currentObligation =
            GuidedPressInheritance.onlyObligation(plan, step.path("stepId").asText());
        if (currentObligation != null
            && currentObligation.path("operationKind").asText().equals("press")
            && step.path("text")
                .asText()
                .strip()
                .matches(
                    "(?i)press\\s+(?:the\\s+)?(?:Enter|Tab|Escape|ArrowDown|ArrowUp)(?:\\s+key)?[.!]?")) {
          JsonNode prior =
              preceding == null
                  ? null
                  : GuidedPressInheritance.onlyObligation(plan, preceding.path("stepId").asText());
          if (prior == null && preceding != null && retainedPlan != null) {
            prior =
                GuidedPressInheritance.onlyObligation(
                    retainedPlan, preceding.path("stepId").asText());
          }
          require(
              prior != null
                  && Set.of("fill", "click", "check").contains(prior.path("operationKind").asText())
                  && currentObligation.path("targetIntent").equals(prior.path("targetIntent")),
              "INVALID_CONTRACT",
              422);
        }
        preceding = step;
      }
    }
    // A value-consuming obligation names a need that something produces: a read in this reply or,
    // inside a learning window, a need of the retained plan.
    Set<String> known = new HashSet<>();
    derived.forEach(need -> known.add(need.path("needId").asText()));
    for (JsonNode item : plan.path("obligations")) {
      require(
          consumerSlot(item) == null
              || !item.path("needId").isTextual()
              || known.contains(item.path("needId").asText()),
          "MISSING_SOURCE",
          409);
    }
    return plan;
  }

  /**
   * ADR-SC-007 D6, part 1: a {@code read} is admitted iff it has no source reference and its needId
   * names a need produced at its own step that at least one obligation uses, all of them at the
   * same or a later step. A read nobody uses is MISSING_SOURCE with the closed subcase
   * READ_WITHOUT_CONSUMER (terminal, as before); a consumer before its read, or a second read on
   * the same needId, is the repairable BINDING_ORDER.
   */
  private static void requireReadIsUsed(
      JsonNode read,
      ArrayNode derived,
      Set<String> reads,
      Map<String, Integer> stepOrder,
      boolean hasReference,
      Consumer<GuidedRefusalDiagnostics.PlanSubcase> sink) {
    require(!hasReference, "MISSING_SOURCE", 409);
    JsonNode need = null;
    if (read.path("needId").isTextual()) {
      for (JsonNode candidate : derived) {
        if (candidate.path("needId").equals(read.path("needId"))) {
          need = candidate;
        }
      }
    }
    if (need == null || need.path("consumers").isEmpty()) {
      GuidedRejectionDiagnostics.readShape(read, 0);
      GuidedRefusalDiagnostics.recordPlan(
          sink, GuidedRefusalDiagnostics.PlanSubcase.READ_WITHOUT_CONSUMER);
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "MISSING_SOURCE", 409);
    }
    require(reads.add(read.path("needId").asText()), "BINDING_ORDER", 422);
    int producer = stepOrder.getOrDefault(read.path("stepId").asText(), -1);
    for (JsonNode consumer : need.path("consumers")) {
      require(
          stepOrder.getOrDefault(consumer.path("stepId").asText(), -1) >= producer,
          "BINDING_ORDER",
          422);
    }
  }

  /**
   * The needs the obligations imply, in order of their reads: {@code {needId, producerStepId,
   * consumers:[{stepId, argumentSlot}]}} with a consumer per distinct (step, slot). A consumer is a
   * fill, a selectOption, or an assert whose predicate takes an expected value, that carries the
   * needId. A consumer whose needId has no read here is attached to the retained need of that id
   * when {@code retainedNeeds} has one. Pure: it never refuses, so every refusal keeps the code and
   * position it had.
   */
  static ArrayNode deriveNeeds(JsonNode obligations, JsonNode retainedNeeds) {
    Map<String, ObjectNode> needs = new LinkedHashMap<>();
    Map<String, ObjectNode> continued = new LinkedHashMap<>();
    ArrayNode result = JsonNodeFactory.instance.arrayNode();
    if (!obligations.isArray()) {
      return result;
    }
    for (JsonNode item : obligations) {
      if (item.path("operationKind").asText().equals("read") && item.path("needId").isTextual()) {
        needs.computeIfAbsent(
            item.path("needId").asText(), id -> need(id, item.path("stepId").asText()));
      }
    }
    for (JsonNode item : obligations) {
      String slot = consumerSlot(item);
      if (slot == null || !item.path("needId").isTextual()) {
        continue;
      }
      String id = item.path("needId").asText();
      ObjectNode need = needs.get(id);
      if (need == null) {
        need = continued.get(id);
      }
      if (need == null && retainedNeeds != null) {
        for (JsonNode retained : retainedNeeds) {
          if (retained.path("needId").asText().equals(id)) {
            need = need(id, retained.path("producerStepId").asText());
            continued.put(id, need);
          }
        }
      }
      if (need == null) {
        continue;
      }
      boolean present = false;
      for (JsonNode consumer : need.path("consumers")) {
        present |=
            consumer.path("stepId").equals(item.path("stepId"))
                && consumer.path("argumentSlot").asText().equals(slot);
      }
      if (!present) {
        ((ArrayNode) need.path("consumers"))
            .addObject()
            .put("stepId", item.path("stepId").asText())
            .put("argumentSlot", slot);
      }
    }
    needs.values().forEach(result::add);
    continued.values().forEach(result::add);
    return result;
  }

  private static ObjectNode need(String needId, String producerStepId) {
    ObjectNode need = JsonNodeFactory.instance.objectNode();
    need.put("needId", needId).put("producerStepId", producerStepId);
    need.putArray("consumers");
    return need;
  }

  /** The slot an obligation consumes a need through, or null when it consumes none. */
  private static String consumerSlot(JsonNode item) {
    return switch (item.path("operationKind").asText()) {
      case "fill" -> "fill.value";
      case "selectOption" -> "selectOption.value";
      case "assert" ->
          Set.of("containsText", "hasValue", "url", "title")
                  .contains(item.path("predicate").asText())
              ? "assert.expected"
              : null;
      default -> null;
    };
  }

  /**
   * Round 057: {@code scopeIntent} names a containing region and is the model's reading of the
   * author's own words, so the server only accepts it where the step text says it. Every refusal is
   * repairable ({@code INVALID_CONTRACT}).
   */
  private static void requireScopeIntent(
      JsonNode plan, JsonNode item, String kind, boolean hasReference, JsonNode manifestSteps) {
    JsonNode scope = item.path("scopeIntent");
    if (scope.isNull() || scope.isMissingNode()) {
      return;
    }
    require(scope.isTextual(), "INVALID_CONTRACT", 422);
    String phrase = scope.asText(), target = item.path("targetIntent").asText();
    boolean nodeTarget =
        Set.of("click", "press", "hover", "check", "uncheck", "fill", "selectOption", "read")
                .contains(kind)
            || kind.equals("assert")
                && Set.of("visible", "containsText", "hasValue")
                    .contains(item.path("predicate").asText());
    boolean secretFill =
        kind.equals("fill")
            && hasReference
            && plan.path("sourceReferences")
                .get(item.path("referenceIndex").asInt())
                .path("kind")
                .asText()
                .equals("secretRef");
    String text = null;
    if (manifestSteps != null) {
      for (JsonNode step : manifestSteps) {
        if (step.path("stepId").equals(item.path("stepId")) && step.path("text").isTextual()) {
          text = step.path("text").asText();
        }
      }
    }
    require(
        nodeTarget
            && !secretFill
            && text != null
            && GuidedActionGuard.containsPhrase(text, phrase)
            && !GuidedActionGuard.containsPhrase(target, phrase)
            && !target.equalsIgnoreCase(phrase),
        "INVALID_CONTRACT",
        422);
  }

  public void sourceMeaning(JsonNode session, JsonNode meaning) {
    contracts.validate("v3/source-selection#/definitions/sourceQuestionMeaning", meaning);
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
    return refinePlan(session, progress, old, response, null);
  }

  public ObjectNode refinePlan(
      JsonNode session,
      JsonNode progress,
      JsonNode old,
      JsonNode response,
      JsonNode manifestSteps) {
    ObjectNode next = admitPlan(session, response, null, manifestSteps);
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
    return materializeAction(
        session,
        progress,
        obligation,
        selection,
        context,
        originalAttempt,
        currentPlanRevision,
        GuidedRefusalDiagnostics.Capture.NONE);
  }

  public ObjectNode materializeAction(
      JsonNode session,
      JsonNode progress,
      JsonNode obligation,
      JsonNode selection,
      JsonNode context,
      JsonNode originalAttempt,
      long currentPlanRevision,
      GuidedRefusalDiagnostics.Capture capture) {
    GuidedRefusalDiagnostics.requireCaptured(
        originalAttempt.path("planRevision").asLong(-1) == currentPlanRevision,
        "REVISION_CONFLICT",
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ORIGINAL_AUTHORITY);
    GuidedRefusalDiagnostics.requireCaptured(
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
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ORIGINAL_AUTHORITY);
    for (String field :
        java.util.List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
      JsonNode value =
          progress.has(field)
              ? progress.path(field)
              : com.fasterxml.jackson.databind.node.NullNode.instance;
      GuidedRefusalDiagnostics.requireCaptured(
          originalAttempt.path(field).equals(value),
          "STALE_GENERATION",
          409,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_ORIGINAL_AUTHORITY);
    }
    GuidedRefusalDiagnostics.requireCaptured(
        originalAttempt.path("expectedContextRevision").equals(context.path("contextRevision"))
            && originalAttempt
                .path("expectedAuthoredInputsHash")
                .equals(context.path("authoredInputsHash")),
        "REVISION_CONFLICT",
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ORIGINAL_AUTHORITY);
    JsonNode step = session.path("sourceSteps").get(progress.path("stepIndex").asInt());
    GuidedRefusalDiagnostics.requireCaptured(
        step != null && step.path("stepId").equals(obligation.path("stepId")),
        "BINDING_ORDER",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_CURRENT_AUTHORED_STEP);
    GuidedRefusalDiagnostics.requireCaptured(
        selection.isObject()
            && selection.size() == 2
            && selection.has("target")
            && selection.has("operation"),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_SELECTION_SHAPE);
    JsonNode selectedTarget = selection.path("target");
    GuidedRefusalDiagnostics.requireCaptured(
        !selectedTarget.has("documentId") && !selectedTarget.has("generation"),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_SELECTION_SHAPE);
    ObjectNode proposal = contracts.object().put("schemaVersion", 3);
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
    proposal.set("operation", completeRead(progress, selection.path("operation"), capture));
    GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_MATERIALIZE_CONTRACT_CALL,
        () -> {
          contracts.validate("v3/action", proposal);
          return null;
        });
    return proposal;
  }

  /**
   * ADR-SC-007: a read names no recipe; the backend completes it from the read grant of the page
   * the runner reported ({@code observation.readRuleId}). A page without a grant admits no read.
   */
  private static JsonNode completeRead(
      JsonNode progress, JsonNode operation, GuidedRefusalDiagnostics.Capture capture) {
    if (!operation.path("kind").asText().equals("read") || !operation.isObject()) {
      return operation;
    }
    JsonNode rule = progress.path("observation").path("readRuleId");
    GuidedRefusalDiagnostics.requireCaptured(
        rule.isTextual() && !rule.asText().isBlank(),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_READ_RULE);
    ObjectNode completed = ((ObjectNode) operation).deepCopy();
    completed
        .putObject("recipe")
        .put("kind", "visibleText")
        .put("classification", "permittedBusinessData")
        .put("policyRuleId", rule.asText());
    return completed;
  }

  /**
   * The single owner of the grounding gates (ADR-SC-007 D3/D4), run at admission and again when a
   * plan is published. Order: contract, meaning, evidence; the ref must be a fact of the
   * observation the model saw; the stored selection or the intent gate; operation versus role; the
   * read eligibility; then the authored-source, secret, binding and predicate checks; and last G2.
   *
   * @param authoredLiteral the authored literal an assert containsText expects, or null when the
   *     expected value is not an authored literal (a binding, a secret, another predicate)
   */
  public void action(
      JsonNode session,
      JsonNode progress,
      JsonNode plan,
      JsonNode obligation,
      JsonNode proposal,
      JsonNode context,
      String authoredLiteral,
      GuidedRefusalDiagnostics.Capture capture) {
    GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ACTION_CONTRACT_CALL,
        () -> {
          contracts.validate("v3/action", proposal);
          return null;
        });
    GuidedRefusalDiagnostics.requireCaptured(
        proposal.path("sessionId").equals(session.path("sessionId"))
            && proposal.path("scopeHash").equals(session.path("scopeHash"))
            && proposal.path("coordinate").path("stepId").equals(obligation.path("stepId"))
            && proposal.path("coordinate").path("ordinal").equals(obligation.path("occurrence"))
            && proposal.path("operation").path("kind").equals(obligation.path("operationKind")),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ACTION_MEANING);
    GuidedRefusalDiagnostics.requireCaptured(
        proposal.path("generation").equals(progress.path("generation"))
            && proposal.path("evidenceHash").equals(progress.path("evidenceHash"))
            && proposal.path("executionEvidence").equals(progress.path("executionEvidence")),
        "STALE_GENERATION",
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_ACTION_EVIDENCE);
    JsonNode target = proposal.path("target");
    GuidedGates.Fact fact = null;
    if (target.path("kind").asText().equals("node")) {
      fact = nodeGates(progress, plan, obligation, proposal, capture);
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
      GuidedRefusalDiagnostics.requireCaptured(
          !inputId.isBlank()
              && (kind.equals("navigate")
                  ? operation.path("destinationInputId").asText().equals(inputId)
                  : value
                          .path("kind")
                          .asText()
                          .equals(
                              reference.path("kind").asText().equals("secretRef")
                                  ? "secretRef"
                                  : "authoredLiteral")
                      && value.path("sourceInputId").asText().equals(inputId)),
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_AUTHORED_SOURCE);
    }
    if (value.path("kind").asText().equals("secretRef")) {
      GuidedRefusalDiagnostics.requireCaptured(
          kind.equals("fill") && target.path("kind").asText().equals("passwordControl"),
          "POLICY_DENIED",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY);
      JsonNode input =
          GuidedRefusalDiagnostics.call(
              capture,
              GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY,
              () ->
                  com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.unique(
                      context.path("authoredInputs").path("inputs"),
                      "inputId",
                      value.path("sourceInputId").asText()));
      GuidedRefusalDiagnostics.requireCaptured(
          input.path("kind").asText().equals("secretRef")
              && input.path("sourceStepId").equals(proposal.path("coordinate").path("stepId"))
              && input.path("intendedSlot").asText().equals("fill.value"),
          "REFERENCE_MISMATCH",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY);
      GuidedRefusalDiagnostics.call(
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY,
          () -> {
            refusePasswordFieldCount(progress);
            return null;
          });
    } else {
      GuidedRefusalDiagnostics.requireCaptured(
          !target.path("kind").asText().equals("passwordControl"),
          "POLICY_DENIED",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_SECRET_POLICY);
    }
    if (!obligation.path("needId").isNull()) {
      String binding = "";
      for (JsonNode need : plan.path("needs")) {
        if (need.path("needId").equals(obligation.path("needId"))) {
          binding = need.path("bindingId").asText();
        }
      }
      GuidedRefusalDiagnostics.requireCaptured(
          !binding.isBlank()
              && (kind.equals("read")
                  ? operation.path("bindingId").asText().equals(binding)
                  : value.path("kind").asText().equals("binding")
                      && value.path("bindingId").asText().equals(binding)),
          "BINDING_ORDER",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_BINDING_MEANING);
    }
    if (kind.equals("assert")) {
      GuidedRefusalDiagnostics.requireCaptured(
          operation.path("predicate").equals(obligation.path("predicate")),
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_ASSERTION_PREDICATE);
      if (fact != null && value.path("kind").asText().equals("authoredLiteral")) {
        GuidedRefusalDiagnostics.requireCaptured(
            GuidedGates.assertText(operation.path("predicate").asText(), fact, authoredLiteral)
                != GuidedGates.TextCheck.REFUSE,
            "INVALID_CONTRACT",
            422,
            capture,
            GuidedRefusalDiagnostics.Gate.NEXT_ASSERT_TEXT_ABSENT);
      }
    }
  }

  /**
   * The gates that need the facts of the picked ref: the ref exists; the stored selection or the
   * intent gate admits it; the operation fits the role; a read has text to read. Returns the facts
   * of the ref for the G2 check that follows the source checks.
   */
  private static GuidedGates.Fact nodeGates(
      JsonNode progress,
      JsonNode plan,
      JsonNode obligation,
      JsonNode proposal,
      GuidedRefusalDiagnostics.Capture capture) {
    JsonNode facts = progress.path("observation").path("facts");
    String ref = proposal.path("target").path("ref").asText();
    GuidedRefusalDiagnostics.requireCaptured(
        facts.path(ref).isObject(),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_TARGET_REF);
    GuidedGates.Fact fact = GuidedGates.of(facts.path(ref));
    GuidedGates.requireCoherentOrdinals(facts);
    if (fact.directTextAssertion()) {
      JsonNode operation = proposal.path("operation");
      GuidedRefusalDiagnostics.requireCaptured(
          operation.path("kind").asText().equals("assert")
              && operation.path("predicate").asText().equals("containsText")
              && operation.path("expected").path("kind").asText().equals("authoredLiteral")
              && obligation.path("referenceIndex").isIntegralNumber()
              && plan.path("sourceReferences")
                  .path(obligation.path("referenceIndex").asInt())
                  .path("referenceKind")
                  .asText()
                  .equals("sourceSpan")
              && fact.role().equals("paragraph")
              && !fact.editable()
              && fact.name().isEmpty()
              && fact.text() != null,
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_ASSERT_TEXT_ABSENT);
    }
    GuidedRefusalDiagnostics.requireCaptured(
        GuidedGates.scopeSatisfied(obligation, facts, facts.path(ref)),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_TARGET_INTENT);
    // An earlier choice that no longer identifies exactly one element admits no ACTION at all: the
    // only admissible reply is a new question (ADR-SC-007 D6).
    GuidedRefusalDiagnostics.requireCaptured(
        !obligation.path("reconfirm").asBoolean(false),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_SELECTED_CHOICE);
    if (obligation.path("selection").isObject()) {
      // The stored selection is re-established by a count over the fresh facts, never trusted from
      // the context: exactly one equal fact, and it must be the one picked.
      List<String> matches =
          GuidedGates.matchingRefs(facts, GuidedGates.selectionOf(obligation.path("selection")));
      GuidedRefusalDiagnostics.requireCaptured(
          matches.size() == 1 && matches.get(0).equals(ref),
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_SELECTED_CHOICE);
      capture.intent(GuidedGates.IntentPath.SELECTED_CHOICE, List.of());
    } else {
      GuidedGates.IntentVerdict verdict =
          GuidedGates.intent(
              proposal.path("operation").path("kind").asText(),
              obligation.path("targetIntent").isTextual()
                  ? obligation.path("targetIntent").asText()
                  : null,
              fact);
      if (!verdict.passed() && sourceIntentSatisfied(progress, plan, obligation, proposal)) {
        verdict =
            new GuidedGates.IntentVerdict(null, GuidedGates.IntentPath.SCOPE_EVIDENCE, List.of());
      }
      if (!verdict.passed()
          && obligation.path("operationKind").asText().equals("read")
          && obligation.path("scopeIntent").isTextual()
          && GuidedGates.readFallbackEligible(facts.path(ref))
          && GuidedGates.scopeSatisfied(obligation, facts, facts.path(ref))) {
        verdict =
            new GuidedGates.IntentVerdict(null, GuidedGates.IntentPath.SCOPE_EVIDENCE, List.of());
      }
      GuidedRefusalDiagnostics.requireCaptured(
          verdict.passed(),
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_TARGET_INTENT);
      capture.intent(verdict.path(), verdict.fields());
    }
    String kind = proposal.path("operation").path("kind").asText();
    GuidedRefusalDiagnostics.requireCaptured(
        GuidedGates.operationTarget(kind, fact) == null,
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.NEXT_OPERATION_TARGET);
    if (kind.equals("read")) {
      GuidedRefusalDiagnostics.requireCaptured(
          GuidedGates.readEligible(fact),
          "INVALID_CONTRACT",
          422,
          capture,
          GuidedRefusalDiagnostics.Gate.NEXT_READ_RULE);
    }
    return fact;
  }

  /**
   * The generic words a planner may use as the target intent of an assert that consumes a captured value: the value itself or the
   * page it is on ("Check that the page contains the copied version number"). The assert is bound to the exact read source, so the
   * intent carries no further meaning.
   */
  private static final java.util.regex.Pattern GENERIC_SOURCE_INTENT =
      java.util.regex.Pattern.compile(
          "(?:copied |captured )?(?:value|text|version|version number|title)"
              + "|(?:the )?page(?: text| content)?");

  static boolean sourceIntentSatisfied(
      JsonNode progress, JsonNode plan, JsonNode obligation, JsonNode proposal) {
    JsonNode source = progress.path("assertSourceBinding");
    if (!source.isObject()
        || !proposal.path("operation").path("kind").asText().equals("assert")
        || !proposal.path("operation").path("predicate").asText().equals("containsText")
        || !proposal
            .path("operation")
            .path("expected")
            .path("bindingId")
            .equals(source.path("bindingId"))) {
      return false;
    }
    String intent = GuidedGates.norm(obligation.path("targetIntent").asText());
    for (JsonNode read : plan.path("obligations")) {
      if (read.path("operationKind").asText().equals("read")
          && read.path("needId").equals(obligation.path("needId"))) {
        return intent.equals(GuidedGates.norm(read.path("targetIntent").asText()))
            || GENERIC_SOURCE_INTENT.matcher(intent).matches();
      }
    }
    return false;
  }

  /** A scoped secret fill is allowed only when the observation saw exactly one password control. */
  private static void refusePasswordFieldCount(JsonNode progress) {
    require(
        progress.path("observation").path("coverage").path("passwordControls").asInt(-1) == 1,
        "POLICY_DENIED",
        422);
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

package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Plan and step-code admission (ADR-SC-008 D4, D5). The planner states what each step does and
 * which values pass between steps; the model then writes the code of one step. Admission checks
 * shape, size, hash and the server-owned identities. It holds no list of operations or Playwright
 * APIs: whether the code works is decided by running it.
 */
public final class GuidedProposalValidator {
  /** ADR-SC-008 D2: the most UTF-8 bytes of code one step may carry. */
  public static final int CODE_MAX_BYTES = 16384;

  /** The action schema bounds the entries a step may read. */
  static final int USES_MAX = 16;

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
   * @param manifestSteps the source manifest's {@code sourceSteps}; accepted for callers that hold
   *     it, not read.
   */
  public ObjectNode admitPlan(
      JsonNode session, JsonNode response, JsonNode learningWindow, JsonNode manifestSteps) {
    return admitPlan(session, response, learningWindow, manifestSteps, null);
  }

  /**
   * The model labels the obligation that produces a value with a {@code needId} and each obligation
   * that reads it with that id in {@code uses}; the server derives {@code needs} (producer and
   * consumer steps). A reply carries no {@code needs}.
   *
   * <p>A value the model labels with a {@code needId} that no obligation uses is not kept: a copy
   * or remember step nothing reads later is an ordinary step (its code just reads the value), so
   * its {@code needId} is set to null and no need or binding exists for it.
   *
   * @param retainedPlan the plan whose steps are retained outside the learning window: a consumer
   *     inside the window may name one of its needs. Read only with a learning window.
   */
  public ObjectNode admitPlan(
      JsonNode session,
      JsonNode response,
      JsonNode learningWindow,
      JsonNode manifestSteps,
      JsonNode retainedPlan) {
    ObjectNode plan = contracts.object();
    for (String field : List.of("sourceReferences", "obligations")) {
      plan.set(field, response.path(field).deepCopy());
    }
    JsonNode retainedNeeds =
        learningWindow != null && retainedPlan != null && retainedPlan.path("needs").isArray()
            ? retainedPlan.path("needs")
            : null;
    ArrayNode derived = deriveNeeds(plan.path("obligations"), retainedNeeds);
    if (dropUnusedNeeds(plan.path("obligations"), derived, retainedNeeds)) {
      derived = deriveNeeds(plan.path("obligations"), retainedNeeds);
    }
    plan.set("needs", derived);
    contracts.validate("v3/source-selection", plan);
    plan.set("stepSections", stepSections(session, response.path("stepSections")));
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
    boolean permitted = false;
    for (JsonNode capability : session.path("scope").path("capabilities")) {
      permitted |= capability.asText().equals("step");
    }
    Set<String> produced = new HashSet<>();
    for (JsonNode item : plan.path("obligations")) {
      ObjectNode obligation = (ObjectNode) item;
      String step = item.path("stepId").asText();
      int occurrence = item.path("occurrence").asInt();
      require(
          steps.contains(step)
              && occurrences.add(step + ":" + occurrence)
              && occurrence == counts.getOrDefault(step, 0),
          "BINDING_ORDER",
          422);
      counts.put(step, occurrence + 1);
      require(permitted, "FORBIDDEN_SCOPE", 403);
      if (!item.path("referenceIndex").isNull()) {
        int ref = item.path("referenceIndex").asInt();
        require(ref >= 0 && ref < plan.path("sourceReferences").size(), "INVALID_CONTRACT", 422);
        require(
            plan.path("sourceReferences").get(ref).path("stepId").asText().equals(step),
            "INVALID_CONTRACT",
            422);
      }
      if (item.path("needId").isTextual()) {
        require(produced.add(item.path("needId").asText()), "BINDING_ORDER", 422);
      }
      obligation.put("obligationId", UUID.randomUUID().toString());
    }
    require(counts.keySet().equals(steps), "INVALID_CONTRACT", 422);
    requireNeedsUsed(plan.path("obligations"), derived, stepOrder);
    return plan;
  }

  /**
   * The reference sections the planner picked for each step: a hint, so an id is never refused for
   * being unknown; an entry for a step the session does not have is dropped, a step is listed once.
   */
  private static ArrayNode stepSections(JsonNode session, JsonNode picked) {
    Set<String> steps = new HashSet<>();
    session.path("sourceSteps").forEach(step -> steps.add(step.path("stepId").asText()));
    Set<String> seen = new HashSet<>();
    ArrayNode result = JsonNodeFactory.instance.arrayNode();
    for (JsonNode entry : picked) {
      String step = entry.path("stepId").asText();
      if (steps.contains(step) && seen.add(step)) {
        result.add(entry.deepCopy());
      }
    }
    return result;
  }

  /**
   * Sets to null the needId of every obligation whose need no obligation reads (a retained need is
   * left alone). Returns whether anything changed.
   */
  private static boolean dropUnusedNeeds(
      JsonNode obligations, ArrayNode derived, JsonNode retainedNeeds) {
    Set<String> unused = new HashSet<>();
    for (JsonNode need : derived) {
      if (need.path("consumers").isEmpty()) {
        unused.add(need.path("needId").asText());
      }
    }
    if (retainedNeeds != null) {
      retainedNeeds.forEach(need -> unused.remove(need.path("needId").asText()));
    }
    boolean changed = false;
    for (JsonNode item : obligations) {
      if (item.path("needId").isTextual() && unused.contains(item.path("needId").asText())) {
        ((ObjectNode) item).putNull("needId");
        changed = true;
      }
    }
    return changed;
  }

  /**
   * A need is produced by one obligation and read by obligations of strictly later steps (one step
   * is one action, so a producer and a consumer cannot share it). A read of an unknown need is
   * MISSING_SOURCE; a reader at or before the producer step is the repairable BINDING_ORDER.
   */
  private static void requireNeedsUsed(
      JsonNode obligations, ArrayNode derived, Map<String, Integer> stepOrder) {
    Map<String, JsonNode> byId = new HashMap<>();
    derived.forEach(need -> byId.put(need.path("needId").asText(), need));
    for (JsonNode item : obligations) {
      for (JsonNode use : item.path("uses")) {
        JsonNode need = byId.get(use.asText());
        require(need != null, "MISSING_SOURCE", 409);
        int producer = stepOrder.getOrDefault(need.path("producerStepId").asText(), -1);
        require(
            producer >= 0 && stepOrder.getOrDefault(item.path("stepId").asText(), -1) > producer,
            "BINDING_ORDER",
            422);
      }
    }
  }

  /**
   * The needs the obligations imply, in order of their producers: {@code {needId, producerStepId,
   * consumers:[{stepId}]}} with a consumer per distinct step that lists the need in {@code uses}. A
   * consumer whose need has no producer here is attached to the retained need of that id when
   * {@code retainedNeeds} has one. Pure: it never refuses, so every refusal keeps the code and
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
      if (item.path("needId").isTextual()) {
        needs.computeIfAbsent(
            item.path("needId").asText(), id -> need(id, item.path("stepId").asText()));
      }
    }
    for (JsonNode item : obligations) {
      for (JsonNode use : item.path("uses")) {
        String id = use.asText();
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
          present |= consumer.path("stepId").equals(item.path("stepId"));
        }
        if (!present) {
          ((ArrayNode) need.path("consumers"))
              .addObject()
              .put("stepId", item.path("stepId").asText());
        }
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

  public void sourceMeaning(JsonNode session, JsonNode meaning) {
    contracts.validate("v3/source-selection#/definitions/sourceQuestionMeaning", meaning);
    JsonNode need = meaning.path("need"), reference = meaning.path("reference");
    boolean step = false;
    for (JsonNode item : session.path("sourceSteps")) {
      step |= item.path("stepId").equals(need.path("stepId"));
    }
    require(step && reference.path("stepId").equals(need.path("stepId")), "INVALID_CONTRACT", 422);
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
          found != null && found.path("referenceIndex").isIntegralNumber(),
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

  /** Refinement preserves every admitted occurrence; new work is a required private value only. */
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
            item.path("needId").isTextual() && item.path("stepId").asText().equals(currentStep),
            "BINDING_ORDER",
            422);
        for (JsonNode prior : old.path("obligations")) {
          require(
              !prior.path("stepId").equals(item.path("stepId"))
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

  /** The obligation of {@code stepId} at occurrence 0: the anchor the step's action is keyed on. */
  public static JsonNode anchor(JsonNode plan, String stepId) {
    for (JsonNode obligation : plan.path("obligations")) {
      if (obligation.path("stepId").asText().equals(stepId)
          && obligation.path("occurrence").asInt() == 0) {
        return obligation;
      }
    }
    return null;
  }

  /**
   * Builds the action proposal of one step from a STEP_CODE CODE reply. The original committed
   * attempt authority is checked before the bridge fields are added. The refusals are the
   * repairable INVALID_CONTRACT (shape, size, captures) and the staleness codes.
   *
   * @param stepObligations every obligation of the step, in occurrence order
   * @param inputs the authored inputs of the runner context ({@code authoredInputs.inputs})
   */
  public ObjectNode stepProposal(
      JsonNode session,
      JsonNode progress,
      JsonNode plan,
      List<JsonNode> stepObligations,
      JsonNode response,
      JsonNode context,
      JsonNode originalAttempt,
      long currentPlanRevision,
      GuidedRefusalDiagnostics.Capture capture) {
    GuidedRefusalDiagnostics.requireCaptured(
        originalAttempt.path("planRevision").asLong(-1) == currentPlanRevision,
        "REVISION_CONFLICT",
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_ORIGINAL_AUTHORITY);
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
        GuidedRefusalDiagnostics.Gate.STEP_ORIGINAL_AUTHORITY);
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
          GuidedRefusalDiagnostics.Gate.STEP_ORIGINAL_AUTHORITY);
    }
    GuidedRefusalDiagnostics.requireCaptured(
        originalAttempt.path("expectedContextRevision").equals(context.path("contextRevision"))
            && originalAttempt
                .path("expectedAuthoredInputsHash")
                .equals(context.path("authoredInputsHash")),
        "REVISION_CONFLICT",
        409,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_ORIGINAL_AUTHORITY);
    JsonNode current = session.path("sourceSteps").get(progress.path("stepIndex").asInt());
    GuidedRefusalDiagnostics.requireCaptured(
        current != null
            && !stepObligations.isEmpty()
            && current.path("stepId").equals(stepObligations.getFirst().path("stepId")),
        "BINDING_ORDER",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_CURRENT_AUTHORED_STEP);
    JsonNode code = response.path("code");
    GuidedRefusalDiagnostics.requireCaptured(
        code.isTextual()
            && !code.asText().isBlank()
            && code.asText().getBytes(StandardCharsets.UTF_8).length <= CODE_MAX_BYTES,
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_CODE_SHAPE);
    List<String> produced = producedBindings(plan, stepObligations);
    Set<String> declared = new LinkedHashSet<>();
    response.path("captures").forEach(value -> declared.add(value.asText()));
    GuidedRefusalDiagnostics.requireCaptured(
        response.path("captures").size() == declared.size()
            && declared.equals(new LinkedHashSet<>(produced)),
        "INVALID_CONTRACT",
        422,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_CAPTURES);
    ArrayNode uses = uses(plan, stepObligations, context);
    GuidedRefusalDiagnostics.requireCaptured(
        uses.size() <= USES_MAX,
        "BUDGET_EXCEEDED",
        429,
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_USES);
    JsonNode anchor = stepObligations.getFirst();
    ObjectNode proposal = contracts.object().put("schemaVersion", 3);
    proposal.set("sessionId", session.path("sessionId"));
    proposal.set("scopeHash", session.path("scopeHash"));
    proposal
        .putObject("coordinate")
        .put("stepId", anchor.path("stepId").asText())
        .put("ordinal", 0);
    for (String field : java.util.List.of("generation", "executionEvidence", "evidenceHash")) {
      proposal.set(field, progress.path(field));
    }
    for (String field : java.util.List.of("authoredInputsHash", "contextRevision")) {
      proposal.set(field, context.path(field));
    }
    ObjectNode operation = proposal.putObject("operation").put("kind", "step");
    operation.put("code", code.asText());
    ArrayNode captures = operation.putArray("captures");
    produced.forEach(captures::add);
    operation.set("uses", uses);
    operation.put("sourceHash", sourceHash(code.asText()));
    GuidedRefusalDiagnostics.call(
        capture,
        GuidedRefusalDiagnostics.Gate.STEP_CONTRACT,
        () -> {
          contracts.validate("v3/action", proposal);
          return null;
        });
    return proposal;
  }

  /**
   * The hash of a step's code: the canonical-JSON SHA-256 of the string (the runner's
   * hashObserved).
   */
  public static String sourceHash(String code) {
    return GuidedContracts.hash(TextNode.valueOf(code));
  }

  /** The allocated bindingIds of the needs the step's obligations produce, in plan order. */
  static List<String> producedBindings(JsonNode plan, List<JsonNode> stepObligations) {
    List<String> out = new ArrayList<>();
    for (JsonNode obligation : stepObligations) {
      if (!obligation.path("needId").isTextual()) {
        continue;
      }
      for (JsonNode need : plan.path("needs")) {
        if (need.path("needId").equals(obligation.path("needId"))
            && need.path("bindingId").isTextual()
            && !out.contains(need.path("bindingId").asText())) {
          out.add(need.path("bindingId").asText());
        }
      }
    }
    return out;
  }

  /**
   * The entries a step may read, server-set and never from the model: binding entries for the needs
   * its obligations consume, input entries (key inputId) for the nonsecret authored inputs bound to
   * the step and secret entries (key secretId) for its secretRef inputs.
   */
  static ArrayNode uses(JsonNode plan, List<JsonNode> stepObligations, JsonNode context) {
    ArrayNode uses = JsonNodeFactory.instance.arrayNode();
    Set<String> seen = new HashSet<>();
    String step = stepObligations.getFirst().path("stepId").asText();
    for (JsonNode obligation : stepObligations) {
      for (JsonNode use : obligation.path("uses")) {
        for (JsonNode need : plan.path("needs")) {
          if (need.path("needId").equals(use) && need.path("bindingId").isTextual()) {
            add(uses, seen, "binding", need.path("bindingId").asText());
          }
        }
      }
    }
    for (JsonNode input : context.path("authoredInputs").path("inputs")) {
      if (!input.path("sourceStepId").asText().equals(step)) {
        continue;
      }
      if (input.path("kind").asText().equals("secretRef")) {
        add(uses, seen, "secret", input.path("secretId").asText());
      } else {
        add(uses, seen, "input", input.path("inputId").asText());
      }
    }
    return uses;
  }

  private static void add(ArrayNode uses, Set<String> seen, String kind, String id) {
    if (seen.add(kind + "\u0000" + id)) {
      uses.addObject().put("kind", kind).put("id", id);
    }
  }
}

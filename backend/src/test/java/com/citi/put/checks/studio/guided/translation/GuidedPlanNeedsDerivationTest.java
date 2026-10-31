package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 D6 (S-min): the plan states one open {@code step} kind per obligation; {@code needs}
 * is derived on the server from the {@code needId} an obligation produces and the {@code uses} of
 * the obligations that read it. A reply carries no {@code needs}.
 */
class GuidedPlanNeedsDerivationTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final List<String> STEPS = List.of("s1", "s2", "s3", "s4");

  private final GuidedProposalValidator validator = new GuidedProposalValidator(C);

  private static ObjectNode session(List<String> steps, String... capabilities) {
    ObjectNode session = C.object().put("sessionId", "s");
    ArrayNode sourceSteps = session.putArray("sourceSteps");
    steps.forEach(step -> sourceSteps.addObject().put("stepId", step));
    ObjectNode scope = session.putObject("scope");
    scope.put("sourceRevision", "1").put("configurationRevision", "1");
    ArrayNode caps = scope.putArray("capabilities");
    for (String capability :
        capabilities.length == 0 ? new String[] {"observe", "step"} : capabilities) {
      caps.add(capability);
    }
    return session;
  }

  private static ObjectNode obligation(String step, int occurrence, String needId, String... uses) {
    ObjectNode item =
        C.object()
            .put("stepId", step)
            .put("occurrence", occurrence)
            .put("targetIntent", "Field")
            .putNull("scopeIntent")
            .putNull("referenceIndex");
    if (needId == null) {
      item.putNull("needId");
    } else {
      item.put("needId", needId);
    }
    ArrayNode used = item.putArray("uses");
    for (String use : uses) {
      used.add(use);
    }
    return item;
  }

  /** A reply covering every step of {@code STEPS}: the given obligations, a bare one elsewhere. */
  private static ObjectNode reply(ObjectNode... obligations) {
    ObjectNode reply = C.object();
    reply.putArray("sourceReferences");
    ArrayNode items = reply.putArray("obligations");
    Set<String> covered = new HashSet<>();
    for (ObjectNode obligation : obligations) {
      items.add(obligation);
      covered.add(obligation.path("stepId").asText());
    }
    for (String step : STEPS) {
      if (!covered.contains(step)) {
        items.add(obligation(step, 0, null));
      }
    }
    // Obligations are listed in step order, as the planner returns them.
    List<JsonNode> sorted = new ArrayList<>();
    items.forEach(sorted::add);
    sorted.sort(
        java.util.Comparator.comparingInt((JsonNode n) -> STEPS.indexOf(n.path("stepId").asText()))
            .thenComparingInt(n -> n.path("occurrence").asInt()));
    items.removeAll();
    sorted.forEach(items::add);
    reply.putArray("stepSections");
    return reply;
  }

  private ObjectNode admit(ObjectNode reply) {
    return validator.admitPlan(session(STEPS), reply);
  }

  private static JsonNode need(String needId, String producer, String... consumers) {
    ObjectNode need = C.object().put("needId", needId).put("producerStepId", producer);
    ArrayNode list = need.putArray("consumers");
    for (String consumer : consumers) {
      list.addObject().put("stepId", consumer);
    }
    return need;
  }

  private static JsonNode array(JsonNode... values) {
    ArrayNode array = JsonNodeFactory.instance.arrayNode();
    for (JsonNode value : values) {
      array.add(value);
    }
    return array;
  }

  private static void refused(Runnable action, String code) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo(code));
  }

  @Test
  void aProducerAndAConsumerThatShareANeedIdDeriveTheNeedTheModelNoLongerWrites() {
    ObjectNode plan =
        admit(reply(obligation("s1", 0, "need-a"), obligation("s2", 0, null, "need-a")));
    assertThat(plan.fieldNames())
        .toIterable()
        .containsExactly("sourceReferences", "obligations", "needs", "stepSections");
    assertThat(plan.path("needs")).isEqualTo(array(need("need-a", "s1", "s2")));
    assertThat(plan.path("obligations").get(0).path("obligationId").asText()).isNotBlank();
  }

  @Test
  void aStepReadByTwoLaterStepsListsEachConsumerOnce() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "need-a"),
                obligation("s3", 0, null, "need-a"),
                obligation("s3", 1, null, "need-a"),
                obligation("s4", 0, null, "need-a")));
    assertThat(plan.path("needs")).isEqualTo(array(need("need-a", "s1", "s3", "s4")));
  }

  @Test
  void aConsumerAtOrBeforeItsProducerStepIsBindingOrder() {
    refused(() -> admit(reply(obligation("s2", 0, "need-a", "need-a"))), "BINDING_ORDER");
    refused(
        () -> admit(reply(obligation("s1", 0, null, "need-a"), obligation("s2", 0, "need-a"))),
        "BINDING_ORDER");
    refused(
        () -> admit(reply(obligation("s2", 0, "need-a"), obligation("s2", 1, null, "need-a"))),
        "BINDING_ORDER");
  }

  @Test
  void aSecondProducerOfTheSameNeedIsBindingOrder() {
    refused(
        () ->
            admit(
                reply(
                    obligation("s1", 0, "need-a"),
                    obligation("s2", 0, "need-a"),
                    obligation("s3", 0, null, "need-a"))),
        "BINDING_ORDER");
  }

  @Test
  void aUseOfAnUnknownNeedIsMissingSource() {
    refused(() -> admit(reply(obligation("s2", 0, null, "nobody-makes-this"))), "MISSING_SOURCE");
  }

  @Test
  void aStandAloneCopyStepKeepsItsStepAndLosesTheNeedNobodyUses() {
    ObjectNode plan = admit(reply(obligation("s1", 0, "need-a")));
    assertThat(plan.path("needs")).isEmpty();
    assertThat(plan.path("obligations")).hasSize(4);
    assertThat(plan.path("obligations").get(0).path("stepId").asText()).isEqualTo("s1");
    assertThat(plan.path("obligations").get(0).path("needId").isNull()).isTrue();
  }

  @Test
  void aCopyStepFollowedByStepsThatDoNotUseItIsAnOrdinaryStep() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "need-a"),
                obligation("s2", 0, null),
                obligation("s3", 0, null)));
    assertThat(plan.path("needs")).isEmpty();
    for (JsonNode item : plan.path("obligations")) {
      assertThat(item.path("needId").isNull()).isTrue();
    }
  }

  @Test
  void aUsedNeedIsKeptWhileAnUnusedOneInTheSamePlanIsDropped() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "need-used"),
                obligation("s2", 0, "need-unused"),
                obligation("s3", 0, null, "need-used")));
    assertThat(plan.path("needs")).isEqualTo(array(need("need-used", "s1", "s3")));
    assertThat(plan.path("obligations").get(0).path("needId").asText()).isEqualTo("need-used");
    assertThat(plan.path("obligations").get(1).path("needId").isNull()).isTrue();
  }

  @Test
  void aSessionWithoutTheStepCapabilityIsForbidden() {
    refused(() -> validator.admitPlan(session(STEPS, "observe"), reply()), "FORBIDDEN_SCOPE");
  }

  @Test
  void aReferenceOutOfRangeOrBoundToAnotherStepIsInvalid() {
    ObjectNode outOfRange = reply();
    ((ObjectNode) outOfRange.path("obligations").get(0)).put("referenceIndex", 0);
    refused(() -> admit(outOfRange), "INVALID_CONTRACT");
    ObjectNode otherStep = reply();
    otherStep
        .withArray("sourceReferences")
        .addObject()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", "s2")
        .put("startUtf16", 0)
        .put("endUtf16", 1)
        .put("kind", "nonsecretText");
    ((ObjectNode) otherStep.path("obligations").get(0)).put("referenceIndex", 0);
    refused(() -> admit(otherStep), "INVALID_CONTRACT");
  }

  @Test
  void anOccurrenceThatSkipsOrRepeatsIsBindingOrder() {
    refused(() -> admit(reply(obligation("s1", 1, null))), "BINDING_ORDER");
    refused(
        () -> admit(reply(obligation("s1", 0, null), obligation("s1", 0, null))), "BINDING_ORDER");
  }

  @Test
  void anOperationKindFieldIsNoLongerPartOfAnObligation() {
    ObjectNode legacy = reply();
    ((ObjectNode) legacy.path("obligations").get(0)).put("operationKind", "click");
    refused(() -> admit(legacy), "INVALID_CONTRACT");
  }

  @Test
  void aConsumerInsideTheLearningWindowMayReadANeedOfTheRetainedPlan() {
    ObjectNode window = C.object();
    window.putArray("learnableStepIds").add("s3").add("s4");
    window.putArray("completedCoordinates");
    ObjectNode retained = C.object();
    retained.putArray("needs").add(need("need-r", "s1", "s2"));
    ObjectNode reply = C.object();
    reply.putArray("sourceReferences");
    reply
        .putArray("obligations")
        .add(obligation("s3", 0, null, "need-r"))
        .add(obligation("s4", 0, null));
    reply.putArray("stepSections");
    ObjectNode plan = validator.admitPlan(session(STEPS), reply, window, null, retained);
    assertThat(plan.path("needs")).isEqualTo(array(need("need-r", "s1", "s3")));
  }

  @Test
  void stepSectionsAreAHintSoAnUnknownSectionIsKeptAndAnUnknownStepIsDropped() {
    ObjectNode reply = reply();
    ArrayNode sections = reply.withArray("stepSections");
    sections.addObject().put("stepId", "s1").putArray("sections").add("core.locators").add("nope");
    sections.addObject().put("stepId", "elsewhere").putArray("sections").add("waits");
    ObjectNode plan = admit(reply);
    assertThat(plan.path("stepSections")).hasSize(1);
    assertThat(plan.path("stepSections").get(0).path("sections")).hasSize(2);
  }
}

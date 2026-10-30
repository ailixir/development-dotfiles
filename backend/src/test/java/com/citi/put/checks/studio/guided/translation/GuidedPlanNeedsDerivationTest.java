package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * ADR-SC-007 D6: {@code needs} is derived on the server from the needIds the model puts on a read
 * and on the obligations that use its value. A reply carries no {@code needs}.
 */
class GuidedPlanNeedsDerivationTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Path CONTRACTS =
      Path.of("../docs/specs/studio-observed-authoring/contracts/v3");
  private static final List<String> STEPS = List.of("s1", "s2", "s3", "s4");

  private final GuidedProposalValidator validator = new GuidedProposalValidator(C);

  private static ObjectNode session(List<String> steps) {
    ObjectNode session = C.object().put("sessionId", "s");
    ArrayNode sourceSteps = session.putArray("sourceSteps");
    steps.forEach(step -> sourceSteps.addObject().put("stepId", step));
    session.putObject("limits").put("maxStatementsPerStep", 8);
    ObjectNode scope = session.putObject("scope");
    scope.put("sourceRevision", "1").put("configurationRevision", "1");
    ArrayNode capabilities = scope.putArray("capabilities");
    GroundingBenchScorer.CAPABILITIES.forEach(capabilities::add);
    return session;
  }

  /** A reply: references first, then obligations built with {@link #obligation}. */
  private static ObjectNode reply(ObjectNode... obligations) {
    ObjectNode reply = C.object();
    reply.putArray("sourceReferences");
    ArrayNode items = reply.putArray("obligations");
    for (ObjectNode obligation : obligations) {
      items.add(obligation);
    }
    return reply;
  }

  private static ObjectNode obligation(String step, int occurrence, String kind, String needId) {
    ObjectNode item =
        C.object()
            .put("stepId", step)
            .put("occurrence", occurrence)
            .put("operationKind", kind)
            .put("targetIntent", "Field")
            .putNull("scopeIntent")
            .putNull("referenceIndex");
    if (needId == null) {
      item.putNull("needId");
    } else {
      item.put("needId", needId);
    }
    if (kind.equals("assert")) {
      item.put("predicate", "containsText");
    } else {
      item.putNull("predicate");
    }
    return item;
  }

  private static ObjectNode withPredicate(ObjectNode item, String predicate) {
    item.put("predicate", predicate);
    return item;
  }

  /** A reply that covers every step of {@code STEPS} with a click where nothing else is given. */
  private static ObjectNode fill(ObjectNode reply, String... coveredSteps) {
    Set<String> covered = new java.util.HashSet<>(List.of(coveredSteps));
    ArrayNode items = (ArrayNode) reply.path("obligations");
    for (String step : STEPS) {
      boolean present = false;
      for (JsonNode item : items) {
        present |= item.path("stepId").asText().equals(step);
      }
      if (!present && !covered.contains(step)) {
        items.add(obligation(step, 0, "click", null));
      }
    }
    return reply;
  }

  private ObjectNode admit(ObjectNode reply) {
    return validator.admitPlan(session(STEPS), fill(reply));
  }

  private static ObjectNode need(String needId, String producer, String... consumerSlots) {
    ObjectNode need = C.object().put("needId", needId).put("producerStepId", producer);
    ArrayNode consumers = need.putArray("consumers");
    for (String entry : consumerSlots) {
      String[] parts = entry.split("=");
      consumers.addObject().put("stepId", parts[0]).put("argumentSlot", parts[1]);
    }
    return need;
  }

  private static JsonNode needsOf(ObjectNode plan) {
    return plan.path("needs");
  }

  private static JsonNode array(ObjectNode... values) {
    ArrayNode array = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    for (ObjectNode value : values) {
      array.add(value);
    }
    return array;
  }

  @Test
  void aReadAndAFillThatShareANeedIdDeriveTheNeedTheModelNoLongerWrites() {
    ObjectNode plan =
        admit(reply(obligation("s1", 0, "read", "need-a"), obligation("s2", 0, "fill", "need-a")));
    assertThat(plan.fieldNames())
        .toIterable()
        .containsExactly("sourceReferences", "obligations", "needs");
    assertThat(needsOf(plan)).isEqualTo(array(need("need-a", "s1", "s2=fill.value")));
    assertThat(plan.path("obligations").get(0).path("obligationId").asText()).isNotBlank();
  }

  @ParameterizedTest
  @ValueSource(strings = {"containsText", "hasValue", "url", "title"})
  void anAssertThatTakesAnExpectedValueConsumesTheNeedThroughAssertExpected(String predicate) {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "read", "need-a"),
                withPredicate(obligation("s2", 0, "assert", "need-a"), predicate)));
    assertThat(needsOf(plan)).isEqualTo(array(need("need-a", "s1", "s2=assert.expected")));
  }

  @Test
  void aSelectOptionConsumesTheNeedThroughSelectOptionValue() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "read", "need-a"),
                obligation("s2", 0, "selectOption", "need-a")));
    assertThat(needsOf(plan)).isEqualTo(array(need("need-a", "s1", "s2=selectOption.value")));
  }

  @Test
  void consumersInSeveralStepsAndInTheReadsOwnStepAreKeptOncePerStepAndSlot() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "read", "need-a"),
                obligation("s1", 1, "fill", "need-a"),
                obligation("s2", 0, "fill", "need-a"),
                obligation("s2", 1, "fill", "need-a"),
                withPredicate(obligation("s3", 0, "assert", "need-a"), "containsText")));
    assertThat(needsOf(plan))
        .isEqualTo(
            array(need("need-a", "s1", "s1=fill.value", "s2=fill.value", "s3=assert.expected")));
  }

  @Test
  void needsComeInTheOrderOfTheirReads() {
    ObjectNode plan =
        admit(
            reply(
                obligation("s1", 0, "read", "need-b"),
                obligation("s2", 0, "read", "need-a"),
                obligation("s3", 0, "fill", "need-a"),
                obligation("s4", 0, "fill", "need-b")));
    assertThat(needsOf(plan))
        .isEqualTo(
            array(need("need-b", "s1", "s4=fill.value"), need("need-a", "s2", "s3=fill.value")));
  }

  @Test
  void aVisibleAssertOrAClickNeverBecomesAConsumer() {
    ArrayNode derived =
        GuidedProposalValidator.deriveNeeds(
            reply(
                    obligation("s1", 0, "read", "need-a"),
                    withPredicate(obligation("s2", 0, "assert", null), "visible"),
                    obligation("s2", 1, "click", null))
                .path("obligations"),
            null);
    assertThat(derived).isEqualTo(array(need("need-a", "s1")));
  }

  @Test
  void insideALearningWindowAConsumerMayUseARetainedNeed() {
    ObjectNode window = C.object();
    window.putArray("learnableStepIds").add("s3");
    window.putArray("completedCoordinates");
    ObjectNode retained = C.object();
    retained.putArray("needs").add(need("need-a", "s1"));
    ObjectNode response = reply(obligation("s3", 0, "fill", "need-a"));
    ObjectNode plan = validator.admitPlan(session(STEPS), response, window, null, retained, null);
    assertThat(needsOf(plan)).isEqualTo(array(need("need-a", "s1", "s3=fill.value")));
    for (JsonNode noRetained : new JsonNode[] {null, C.object(), C.object().put("needs", "x")}) {
      assertThatThrownBy(
              () -> validator.admitPlan(session(STEPS), response, window, null, noRetained, null))
          .as("%s", noRetained)
          .hasMessage("MISSING_SOURCE");
    }
    assertThatThrownBy(
            () ->
                validator.admitPlan(
                    session(STEPS),
                    fill(reply(obligation("s3", 0, "fill", "need-a"))),
                    null,
                    null,
                    retained,
                    null))
        .as("a retained plan is read only with a learning window")
        .hasMessage("MISSING_SOURCE");
  }

  @Test
  void aReadNothingUsesIsMissingSourceWithTheClosedSubcase() {
    for (String needId : new String[] {null, "need-a"}) {
      List<GuidedRefusalDiagnostics.PlanSubcase> seen = new ArrayList<>();
      assertThatThrownBy(
              () ->
                  validator.admitPlan(
                      session(STEPS),
                      fill(reply(obligation("s1", 0, "read", needId))),
                      null,
                      null,
                      null,
                      seen::add))
          .as("needId %s", needId)
          .hasMessage("MISSING_SOURCE");
      assertThat(seen).containsExactly(GuidedRefusalDiagnostics.PlanSubcase.READ_WITHOUT_CONSUMER);
    }
    assertThat(EnumSet.allOf(GuidedRefusalDiagnostics.PlanSubcase.class))
        .containsExactly(GuidedRefusalDiagnostics.PlanSubcase.READ_WITHOUT_CONSUMER);
  }

  @Test
  void theOtherMissingSourceRefusalsCarryNoSubcase() {
    List<GuidedRefusalDiagnostics.PlanSubcase> seen = new ArrayList<>();
    // A consumer whose need nothing produces.
    assertThatThrownBy(
            () ->
                validator.admitPlan(
                    session(STEPS),
                    fill(reply(obligation("s2", 0, "fill", "need-a"))),
                    null,
                    null,
                    null,
                    seen::add))
        .hasMessage("MISSING_SOURCE");
    // navigate without a reference, and navigate with a needId.
    for (String needId : new String[] {null, "need-a"}) {
      assertThatThrownBy(
              () ->
                  validator.admitPlan(
                      session(STEPS),
                      fill(reply(obligation("s1", 0, "navigate", needId))),
                      null,
                      null,
                      null,
                      seen::add))
          .hasMessage("MISSING_SOURCE");
    }
    assertThat(seen).isEmpty();
  }

  @Test
  void aConsumerBeforeItsReadAndTwoReadsOnOneNeedIdAreBindingOrder() {
    assertThatThrownBy(
            () ->
                admit(
                    reply(
                        obligation("s1", 0, "fill", "need-a"),
                        obligation("s2", 0, "read", "need-a"))))
        .hasMessage("BINDING_ORDER");
    assertThatThrownBy(
            () ->
                admit(
                    reply(
                        obligation("s1", 0, "read", "need-a"),
                        obligation("s2", 0, "read", "need-a"),
                        obligation("s3", 0, "fill", "need-a"))))
        .hasMessage("BINDING_ORDER");
  }

  @Test
  void obligationsThatCannotConsumeANeedKeepTheirRefusals() {
    for (String kind : List.of("click", "press", "hover", "check", "uncheck")) {
      assertThatThrownBy(
              () ->
                  admit(
                      reply(
                          obligation("s1", 0, "read", "need-a"),
                          obligation("s2", 0, "fill", "need-a"),
                          obligation("s3", 0, kind, "need-a"))))
          .as(kind)
          .hasMessage("INVALID_CONTRACT");
    }
    assertThatThrownBy(
            () ->
                admit(
                    reply(
                        obligation("s1", 0, "read", "need-a"),
                        obligation("s2", 0, "fill", "need-a"),
                        withPredicate(obligation("s3", 0, "assert", "need-a"), "visible"))))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void aReadWithAReferenceIsStillRefused() {
    ObjectNode read = obligation("s1", 0, "read", "need-a").put("referenceIndex", 0);
    ObjectNode reply = reply(read, obligation("s2", 0, "fill", "need-a"));
    reply
        .withArray("sourceReferences")
        .addObject()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", "s1")
        .put("startUtf16", 0)
        .put("endUtf16", 1)
        .put("kind", "nonsecretText")
        .put("intendedSlot", "fill.value");
    assertThatThrownBy(() -> admit(reply)).hasMessage("INVALID_CONTRACT");
  }

  @Test
  void moreThanThirtyTwoNeedsAreRefusedBySourceSelection() {
    List<String> steps = new ArrayList<>();
    for (int i = 0; i < 66; i++) {
      steps.add("t" + i);
    }
    ObjectNode reply = C.object();
    reply.putArray("sourceReferences");
    ArrayNode items = reply.putArray("obligations");
    for (int i = 0; i < 33; i++) {
      items.add(obligation("t" + (2 * i), 0, "read", "need-" + i));
      items.add(obligation("t" + (2 * i + 1), 0, "fill", "need-" + i));
    }
    assertThatThrownBy(() -> validator.admitPlan(session(steps), reply))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void aReplyThatCarriesNeedsIsRefusedByTheStrictResponseSchema() {
    ObjectNode response = reply(obligation("s1", 0, "click", null));
    response.put("schemaVersion", 3).put("kind", "SOURCE_PLAN").put("requestId", "r");
    C.validate("v3/guided-model-response", response);
    response.putArray("needs");
    assertThatThrownBy(() -> C.validate("v3/guided-model-response", response))
        .hasMessage("INVALID_CONTRACT");
    JsonNode provider =
        new GuidedPromptAssembler(C, new AllowedDomains(List.of(), true))
            .providerSchema(GuidedModelRequest.Kind.SOURCE_PLAN);
    assertThat(provider.toString()).doesNotContain("\"needs\"");
  }

  @Test
  void derivationEqualsTheHandWrittenNeedsOfEveryPlanShapedFixture() throws IOException {
    List<String> checked = new ArrayList<>();
    List<String> different = new ArrayList<>();
    for (String file :
        List.of("fixtures.json", "planning-fixtures.json", "publication-fixtures.json")) {
      walk(C.parse(Files.readString(CONTRACTS.resolve(file))), file, checked, different);
    }
    assertThat(checked).hasSizeGreaterThan(150);
    // Two deliberate negatives in the graph/timing conformance cases: a need with no read, and a
    // read whose need was renamed.
    assertThat(different)
        .containsExactly(
            "publication-fixtures.json/graphTimingConformance/graphCases/29/basis/translationPlan",
            "publication-fixtures.json/graphTimingConformance/graphCases/33/basis/translationPlan");
  }

  private static void walk(
      JsonNode node, String path, List<String> checked, List<String> different) {
    if (node.isObject()) {
      if (node.path("obligations").isArray() && node.path("needs").isArray()) {
        checked.add(path);
        ArrayNode hand = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        for (JsonNode need : node.path("needs")) {
          ObjectNode copy = ((ObjectNode) need).deepCopy();
          copy.remove("bindingId");
          hand.add(copy);
        }
        if (!hand.equals(GuidedProposalValidator.deriveNeeds(node.path("obligations"), null))) {
          different.add(path);
        }
      }
      node.fields()
          .forEachRemaining(e -> walk(e.getValue(), path + "/" + e.getKey(), checked, different));
    } else if (node.isArray()) {
      for (int i = 0; i < node.size(); i++) {
        walk(node.get(i), path + "/" + i, checked, different);
      }
    }
  }

  @Test
  void theRefusalShapeCarriesOnlyTheClosedSubcaseAFlagAndACount() {
    assertThat(
            GuidedRejectionDiagnostics.readShape(obligation("s1", 0, "read", "secret-looking"), 0))
        .isEqualTo("subcase=READ_WITHOUT_CONSUMER needId=set consumers=0");
    assertThat(GuidedRejectionDiagnostics.readShape(obligation("s1", 0, "read", null), 0))
        .isEqualTo("subcase=READ_WITHOUT_CONSUMER needId=null consumers=0");
  }
}

package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D-7 / D-16: the model never writes a read recipe. The strict reply schema has none,
 * the backend completes it from the read grant of the observed page, and a read is admitted only
 * for a ref whose facts carry text. Pure: the real validator and the real schemas, no database.
 */
class GuidedReadRecipeTest {
  private static final String RULE = "observed-read-v1-" + "a".repeat(64);

  private static ObjectNode read() {
    return ActionHarness.C.object().put("kind", "read").put("bindingId", "binding-1");
  }

  private static ObjectNode reply(ObjectNode operation) {
    ObjectNode reply = ActionHarness.C.object();
    reply.put("schemaVersion", 3).put("kind", "NEXT_ACTION").put("requestId", "request-1");
    reply.put("status", "ACTION").put("obligationId", "obligation-1");
    ObjectNode action = reply.putObject("action");
    action.set("target", ObservationFixtures.nodeRef("e1"));
    action.set("operation", operation);
    reply.putNull("question");
    return reply;
  }

  private static ActionHarness readable(String readRuleId, String text) {
    var builder = ObservationFixtures.observation().readRuleId(readRuleId);
    if (text == null) {
      builder.element("e1", "text", "Reference");
    } else {
      builder.readable("e1", "text", "Reference", text);
    }
    return new ActionHarness(builder.build(), "read", "Reference");
  }

  @Test
  void modelWrittenRecipeIsRefusedByTheStrictSchema() {
    ActionHarness.C.validate("v3/guided-model-response", reply(read()));
    ObjectNode withRecipe = read();
    withRecipe
        .putObject("recipe")
        .put("kind", "visibleText")
        .put("classification", "permittedBusinessData")
        .put("policyRuleId", "default");
    assertThatThrownBy(
            () -> ActionHarness.C.validate("v3/guided-model-response", reply(withRecipe)))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal.status()).isEqualTo(422);
            });
  }

  @Test
  void readWithFactsTextIsAdmittedWithTheCompletedRecipe() {
    ActionHarness harness = readable(RULE, "R-1234");
    ObjectNode proposal = harness.materialize(ActionHarness.selection("e1", read()));
    JsonNode recipe = proposal.path("operation").path("recipe");
    assertThat(recipe.path("kind").asText()).isEqualTo("visibleText");
    assertThat(recipe.path("classification").asText()).isEqualTo("permittedBusinessData");
    assertThat(recipe.path("policyRuleId").asText()).isEqualTo(RULE);
    assertThatCode(() -> harness.action(proposal)).doesNotThrowAnyException();
    assertThat(harness.gates).isEmpty();
  }

  @Test
  void aRecipeInTheSelectionIsOverwrittenByTheRuleOfTheObservation() {
    ActionHarness harness = readable(RULE, "R-1234");
    ObjectNode invented = read();
    invented
        .putObject("recipe")
        .put("kind", "visibleText")
        .put("classification", "permittedBusinessData")
        .put("policyRuleId", "rule-default");
    ObjectNode proposal = harness.materialize(ActionHarness.selection("e1", invented));
    assertThat(proposal.path("operation").path("recipe").path("policyRuleId").asText())
        .isEqualTo(RULE);
  }

  @Test
  void aPageWithoutAReadGrantAdmitsNoReadAndNamesTheReadRuleGate() {
    ActionHarness harness = readable(null, "R-1234");
    assertThatThrownBy(() -> harness.materialize(ActionHarness.selection("e1", read())))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal.status()).isEqualTo(422);
            });
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_READ_RULE);
  }

  @Test
  void readWithoutFactsTextIsRefusedWithNextReadRule() {
    ActionHarness harness = readable(RULE, null);
    GuidedSessionException refusal = harness.refusal(ActionHarness.selection("e1", read()));
    assertThat(refusal).isNotNull();
    assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(refusal.status()).isEqualTo(422);
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_READ_RULE);
    // The same ref with the same intent passes once the facts carry text.
    assertThat(readable(RULE, "R-1234").refusal(ActionHarness.selection("e1", read()))).isNull();
  }

  @Test
  void withheldRefIsRefusedByTheIntentGate() {
    // A withheld node has an empty name and evidence: nothing for the intent to match.
    ActionHarness harness =
        new ActionHarness(
            ObservationFixtures.observation()
                .readRuleId(RULE)
                .withFact("e1", ObservationFixtures.fact("text", "", false, null))
                .build(),
            "read",
            "Reference");
    GuidedSessionException refusal = harness.refusal(ActionHarness.selection("e1", read()));
    assertThat(refusal).isNotNull();
    assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_TARGET_INTENT);
  }

  @Test
  void aRefThatIsNotAFactOfTheObservationIsRefusedBeforeAnyReadCheck() {
    ActionHarness harness = readable(RULE, "R-1234");
    GuidedSessionException refusal = harness.refusal(ActionHarness.selection("e99", read()));
    assertThat(refusal).isNotNull();
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_TARGET_REF);
  }

  @Test
  void readEligibilityIsExactlyTheExistenceOfFactsText() {
    assertThat(GuidedGates.readEligible(null)).isFalse();
    assertThat(
            GuidedGates.readEligible(
                GuidedGates.of(ObservationFixtures.fact("text", "A", false, null))))
        .isFalse();
    assertThat(
            GuidedGates.readEligible(
                GuidedGates.of(ObservationFixtures.fact("text", "A", false, ""))))
        .isTrue();
    assertThat(
            GuidedGates.readEligible(
                GuidedGates.of(ObservationFixtures.fact("text", "A", false, "x"))))
        .isTrue();
  }
}

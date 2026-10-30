package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GuidedProviderSchemaCompatibilityTest {
  private final GuidedContracts contracts = new GuidedContracts();

  @Test
  void providerGrammarOmitsArrayCapsWhileRetainingRequiredShapeAndMinimumCardinality() {
    var assembler =
        new GuidedPromptAssembler(
            contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      JsonNode schema = assembler.providerSchema(kind);
      assertThat(schema.toString()).doesNotContain("\"maxItems\"");
      assertThat(schema.toString()).contains("\"required\"", "\"additionalProperties\":false");
    }
    JsonNode plan = assembler.providerSchema(GuidedModelRequest.Kind.SOURCE_PLAN);
    assertThat(plan.at("/anyOf/0/properties/obligations/minItems").asInt()).isEqualTo(1);
    assertThat(plan.at("/anyOf/0/properties").has("needs")).isFalse();
    assertThat(plan.at("/anyOf/0/required").toString()).doesNotContain("needs");
  }

  @Test
  void authoritativeSourcePlanContractStillRejectsEveryArrayBeyondItsExactCap() {
    for (var limit : Map.of("sourceReferences", 200, "obligations", 800, "needs", 32).entrySet()) {
      ObjectNode plan = plan();
      var values = plan.withArray(limit.getKey());
      JsonNode item = values.get(0).deepCopy();
      while (values.size() < limit.getValue()) {
        values.add(item.deepCopy());
      }
      contracts.validate("v3/source-selection", plan);
      // ADR-SC-007: needs belong to the server's plan shape only; a reply has none.
      boolean modelWritten = !limit.getKey().equals("needs");
      if (modelWritten) {
        contracts.validate("v3/guided-model-response", response(plan));
      }
      values.add(item.deepCopy());
      assertThatThrownBy(() -> contracts.validate("v3/source-selection", plan))
          .as("Authoritative cardinality for %s", limit.getKey())
          .hasMessage("INVALID_CONTRACT");
      if (modelWritten) {
        assertThatThrownBy(() -> contracts.validate("v3/guided-model-response", response(plan)))
            .as("Response parser schema cardinality for %s", limit.getKey())
            .hasMessage("INVALID_CONTRACT");
      }
    }
  }

  @Test
  void nextActionContractNamesTheOutlineRefAsTheOnlyNodeTargetAndNoLocator() {
    // ADR-SC-007: the model copies a ref from the outline; the runner derives the locator.
    var request =
        GuidedGatewayPrivacyTest.classifiedRequest(GuidedModelRequest.Kind.NEXT_ACTION, 1);
    assertThat(request.outputContract())
        .contains(
            "{kind:\"node\",ref}",
            "copy ref exactly from a line of the current outline",
            "You never write a selector, locator, role expression or code",
            "A ref that is not shown in the outline is refused")
        .doesNotContain("locatorHints", "nodeId from the current observation");
  }

  private ObjectNode response(ObjectNode plan) {
    ObjectNode response = plan.deepCopy();
    response.remove("needs");
    return response.put("schemaVersion", 3).put("kind", "SOURCE_PLAN").put("requestId", "bounded");
  }

  private ObjectNode plan() {
    return (ObjectNode)
        contracts.parse(
            """
            {
              "sourceReferences":[{
                "referenceKind":"sourceSpan","sourceRevision":"1","stepId":"s",
                "startUtf16":0,"endUtf16":1,"kind":"nonsecretText","intendedSlot":"fill.value"
              }],
              "obligations":[{
                "stepId":"s","occurrence":0,"operationKind":"fill","targetIntent":"Search","scopeIntent":null,
                "referenceIndex":0,"needId":null,"predicate":null
              }],
              "needs":[{
                "needId":"n","producerStepId":"s",
                "consumers":[{"stepId":"s","argumentSlot":"fill.value"}]
              }]
            }
            """);
  }
}

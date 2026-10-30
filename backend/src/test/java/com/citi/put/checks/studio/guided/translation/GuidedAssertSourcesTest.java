package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

/** E2E-018: the predicate of an assert obligation fixes whether it carries a source. */
class GuidedAssertSourcesTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String STEP = "00000000-0000-4000-8000-000000000001";

  private static ObjectNode session() {
    ObjectNode session = C.object().put("sessionId", "s");
    session.putArray("sourceSteps").addObject().put("stepId", STEP).put("requiresAssertion", false);
    session.putObject("limits").put("maxStatementsPerStep", 8);
    session.putObject("scope").put("sourceRevision", "1").put("configurationRevision", "1");
    ArrayNode capabilities = session.withObject("/scope").putArray("capabilities");
    List.of("navigate", "click", "fill", "read", "assert").forEach(capabilities::add);
    return session;
  }

  private static ObjectNode response(String predicate, Integer reference) {
    ObjectNode response = C.object();
    ArrayNode references = response.putArray("sourceReferences");
    references
        .addObject()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", STEP)
        .put("startUtf16", 36)
        .put("endUtf16", 46)
        .put("kind", "nonsecretText")
        .put("intendedSlot", "assert.expected");
    ObjectNode item =
        response
            .putArray("obligations")
            .addObject()
            .put("stepId", STEP)
            .put("occurrence", 0)
            .put("operationKind", "assert")
            .put("targetIntent", "Test login")
            .putNull("scopeIntent");
    if (reference == null) {
      item.putNull("referenceIndex");
    } else {
      item.put("referenceIndex", reference);
    }
    item.putNull("needId").put("predicate", predicate);
    return response;
  }

  private static ObjectNode admit(String predicate, Integer reference) {
    return new GuidedProposalValidator(C).admitPlan(session(), response(predicate, reference));
  }

  @Test
  void visibleTakesNoReferenceAndTheOtherValuePredicatesTakeExactlyOne() {
    assertThat(admit("visible", null).path("obligations")).hasSize(1);
    assertThat(admit("containsText", 0).path("obligations")).hasSize(1);
    for (var refused :
        List.of(
            new Object[] {"visible", 0}, // the E2E-018 shape: visible plus a suggested reference
            new Object[] {"containsText", null})) {
      assertThatThrownBy(() -> admit((String) refused[0], (Integer) refused[1]))
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void theRefusalDiagnosticReportsOnlyPresenceFlagsAndThePredicateEnum() {
    assertThat(
            GuidedRejectionDiagnostics.assertShape(
                response("visible", 0).path("obligations").get(0)))
        .isEqualTo("predicate=visible referenceIndex=set needId=null");
    ObjectNode partial = C.object().put("predicate", "containsText");
    assertThat(GuidedRejectionDiagnostics.assertShape(partial))
        .isEqualTo("predicate=containsText referenceIndex=missing needId=missing");
  }

  @Test
  void theContractStatesTheVisibleAndExpectedValueRulesForTextSteps() throws Exception {
    String contract;
    try (var in = getClass().getResourceAsStream("/studio/guided-output-contract.md")) {
      contract = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
    assertThat(contract)
        .contains("Predicate \"visible\" asserts that the node named by targetIntent is shown")
        .contains("never a reference")
        .contains("Check that the page shows the text")
        .contains("Do not attach a reference to a \"visible\" assert");
  }

  @Test
  void theContractNamesTheControlNotTheKeyAsAPressTarget() throws Exception {
    String contract;
    try (var in = getClass().getResourceAsStream("/studio/guided-output-contract.md")) {
      contract = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
    assertThat(contract)
        .contains("targetIntent is the control that receives the key, never the key itself")
        .contains("press with the same targetIntent \"Search\", never \"Enter\"");
  }
}

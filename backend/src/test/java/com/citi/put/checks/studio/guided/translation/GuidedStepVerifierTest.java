package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuidedStepVerifierTest {
  private final GuidedContracts c = new GuidedContracts();

  @Test
  void missingSubmitUnknownOutcomeWrongDigestAndFalseAssertionCannotComplete() {
    var store = mock(GuidedTranslationStore.class);
    var verifier = new GuidedStepVerifier(store);
    ObjectNode plan = c.object();
    plan.putArray("obligations")
        .addObject()
        .put("obligationId", "submit")
        .put("stepId", "step-1")
        .put("operationKind", "click");
    when(store.state("s")).thenReturn(c.object().set("plan", plan));
    ObjectNode proposal = c.object().put("meaning", "submit");
    ObjectNode association = c.object().put("admissionId", "a");
    association.set("proposal", proposal);
    when(store.obligation("s", "submit")).thenReturn(association);
    ObjectNode action =
        c.object()
            .put("state", "SUCCEEDED")
            .put("dispatchCount", 1)
            .put("requestDigest", GuidedContracts.hash(proposal));
    action.putObject("admission").put("admissionId", "a");
    ObjectNode session = c.object().put("sessionId", "s"),
        completion = c.object().put("stepId", "step-1");
    assertThat(verifier.complete(session, completion, List.of(action))).isTrue();
    assertThat(verifier.complete(session, completion, List.of())).isFalse();
    assertThat(
            verifier.complete(
                session, completion, List.of(action.deepCopy().put("state", "UNKNOWN_OUTCOME"))))
        .isFalse();
    assertThat(
            verifier.complete(
                session,
                completion,
                List.of(action.deepCopy().put("requestDigest", "b".repeat(64)))))
        .isFalse();
    ((ObjectNode) plan.path("obligations").get(0)).put("operationKind", "assert");
    assertThat(verifier.complete(session, completion, List.of(action))).isFalse();
    assertThat(
            verifier.complete(
                session, completion, List.of(action.deepCopy().put("assertionPassed", true))))
        .isTrue();
  }
}

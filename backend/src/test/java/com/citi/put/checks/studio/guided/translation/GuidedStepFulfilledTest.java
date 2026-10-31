package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * ADR-SC-008 D2: a step is fulfilled when the one action of its anchor obligation SUCCEEDED, was
 * dispatched once and carries the digest of the reserved proposal. There is no verifier call and no
 * model request behind it.
 */
class GuidedStepFulfilledTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String STEP = "step-1";
  private static final String ADMISSION = "adm-1";

  private final ObjectNode proposal =
      C.object().put("kind", "step").put("code", "await page.getByRole('button').click();");

  private GuidedTranslationStore store() {
    var store = spy(new GuidedTranslationStore(mock(JdbcTemplate.class), C));
    ObjectNode plan = C.object();
    plan.putArray("obligations")
        .addObject()
        .put("obligationId", "o-0")
        .put("stepId", STEP)
        .put("occurrence", 0);
    doReturn(C.object().<ObjectNode>set("plan", plan)).when(store).state(anyString());
    return store;
  }

  private ObjectNode association(Object admission) {
    ObjectNode row = C.object();
    if (admission == null) {
      row.putNull("admissionId");
    } else {
      row.put("admissionId", admission.toString());
    }
    row.set("proposal", proposal);
    return row;
  }

  private ObjectNode action(String state, int dispatches, String digest) {
    ObjectNode action = C.object().put("state", state).put("dispatchCount", dispatches);
    action.put("requestDigest", digest);
    action.putObject("admission").put("admissionId", ADMISSION);
    return action;
  }

  @Test
  void succeededOnceDispatchedWithTheReservedDigestFulfilsTheStep() {
    var store = store();
    doReturn(association(ADMISSION)).when(store).obligation("s", "o-0");
    assertThat(
            store.stepFulfilled(
                "s", STEP, List.of(action("SUCCEEDED", 1, GuidedContracts.hash(proposal)))))
        .isTrue();
  }

  @Test
  void anyOtherOutcomeDoesNot() {
    var store = store();
    doReturn(association(ADMISSION)).when(store).obligation("s", "o-0");
    String digest = GuidedContracts.hash(proposal);
    assertThat(store.stepFulfilled("s", STEP, List.of(action("FAILED", 1, digest)))).isFalse();
    assertThat(store.stepFulfilled("s", STEP, List.of(action("SUCCEEDED", 2, digest)))).isFalse();
    assertThat(store.stepFulfilled("s", STEP, List.of(action("SUCCEEDED", 0, digest)))).isFalse();
    assertThat(store.stepFulfilled("s", STEP, List.of(action("SUCCEEDED", 1, "b".repeat(64)))))
        .isFalse();
    assertThat(store.stepFulfilled("s", STEP, List.of())).isFalse();
    assertThat(
            store.stepFulfilled(
                "s", STEP, List.of(action("SUCCEEDED", 1, digest), action("SUCCEEDED", 1, digest))))
        .isFalse();
  }

  @Test
  void anActionOfAnotherAdmissionOrAnUnreservedObligationDoesNot() {
    var store = store();
    doReturn(association("other")).when(store).obligation("s", "o-0");
    String digest = GuidedContracts.hash(proposal);
    assertThat(store.stepFulfilled("s", STEP, List.of(action("SUCCEEDED", 1, digest)))).isFalse();
    doReturn(association(null)).when(store).obligation("s", "o-0");
    assertThat(store.stepFulfilled("s", STEP, List.of(action("SUCCEEDED", 1, digest)))).isFalse();
    assertThat(store.stepFulfilled("s", "unplanned", List.of(action("SUCCEEDED", 1, digest))))
        .isFalse();
  }
}

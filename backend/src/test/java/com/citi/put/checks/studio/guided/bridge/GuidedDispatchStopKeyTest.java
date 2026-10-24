package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * STUDIO-OBS-015 H8 (aria-h8-h6-ruling01 H8.4 item 1): a stop's idempotency key is {@code
 * teardown-} plus the hash of the unchanged stop body, identical on every re-send, so the runner
 * joins its original stop instead of adding one replay entry per attempt.
 */
class GuidedDispatchStopKeyTest {
  private final GuidedContracts contracts = new GuidedContracts();
  private final HttpRunnerDispatchClient runner = mock(HttpRunnerDispatchClient.class);
  private final GuidedMaterializationService materialization =
      mock(GuidedMaterializationService.class);
  private final GuidedDispatchService dispatch =
      new GuidedDispatchService(mock(GuidedSessionService.class), materialization, runner);

  @Test
  void assignmentStopKeyIsTheTeardownHashOfTheUnchangedBodyOnEveryCall() {
    ObjectNode intent =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("assignmentId", "assignment-1")
            .put("sessionId", "session-1")
            .put("workerId", "worker-1");

    dispatch.stop(intent, "EXPIRED");
    dispatch.stop(intent.deepCopy(), "EXPIRED");

    ObjectNode expected = contracts.object().put("schemaVersion", 3).put("kind", "assignment");
    expected.set("assignment", intent);
    expected.put("reason", "EXPIRED");
    String key = "teardown-" + GuidedContracts.hash(expected);
    var bodies = ArgumentCaptor.forClass(JsonNode.class);
    var keys = ArgumentCaptor.forClass(String.class);
    verify(runner, times(2)).send(eq("stop"), bodies.capture(), keys.capture());
    assertThat(bodies.getAllValues()).containsExactly(expected, expected);
    assertThat(keys.getAllValues()).containsExactly(key, key);
    assertThat(key).hasSize(73).matches("teardown-[0-9a-f]{64}");
  }

  @Test
  void contextStopKeyFollowsTheIdentityBodyAndItsReason() {
    ObjectNode identity =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", "session-1")
            .put("workerId", "worker-1")
            .put("ownerFence", 1)
            .put("contextId", "context-1");
    when(materialization.identity(any())).thenAnswer(call -> identity.deepCopy());

    dispatch.stop(identity, "CANCELLED");
    dispatch.stop(identity, "CANCELLED");
    dispatch.stop(identity, "REVOKED");

    var keys = ArgumentCaptor.forClass(String.class);
    verify(runner, times(3)).send(eq("stop"), any(JsonNode.class), keys.capture());
    String cancelled =
        "teardown-" + GuidedContracts.hash(identity.deepCopy().put("reason", "CANCELLED"));
    String revoked =
        "teardown-" + GuidedContracts.hash(identity.deepCopy().put("reason", "REVOKED"));
    assertThat(keys.getAllValues()).containsExactly(cancelled, cancelled, revoked);
    assertThat(cancelled).isNotEqualTo(revoked);
  }
}

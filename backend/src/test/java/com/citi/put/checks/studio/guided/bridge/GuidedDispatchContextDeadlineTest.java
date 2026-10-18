package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

/**
 * STUDIO-OBS-015 B2B-01 P2 (aria-append-ruling01): a keyed append delivery is sent with its frozen
 * {@code leaseExpiresAt} (the V21 ACK deadline) as the caller deadline; an unkeyed context push
 * keeps the plain send with no caller deadline.
 */
class GuidedDispatchContextDeadlineTest {
  private static final String LEASE = "2026-10-16T12:00:30Z";

  private final GuidedContracts contracts = new GuidedContracts();
  private final Authentication controller = mock(Authentication.class);
  private final GuidedSessionService sessions = mock(GuidedSessionService.class);
  private final GuidedRunnerClient runner = mock(GuidedRunnerClient.class);
  private final GuidedDispatchService dispatch =
      new GuidedDispatchService(sessions, mock(GuidedMaterializationService.class), runner);
  private final ObjectNode context =
      contracts
          .object()
          .put("sessionId", "session-1")
          .put("ownerFence", 1)
          .put("leaseExpiresAt", LEASE);

  @Test
  void keyedAppendIsSentWithTheFrozenLeaseAsCallerDeadline() {
    when(sessions.runnerContext(controller, "session-1", 1L)).thenReturn(context);
    when(sessions.contextDeliveryId(controller, "session-1", 1L)).thenReturn("delivery-1");
    ObjectNode ack = contracts.object().put("deliveryId", "delivery-1");
    when(runner.send("context", context, "delivery-1", Instant.parse(LEASE))).thenReturn(ack);

    assertThat(dispatch.pushContext(controller, "session-1", 1L)).isSameAs(ack);

    verify(runner).send("context", context, "delivery-1", Instant.parse(LEASE));
    verify(runner, never()).send(eq("context"), any(JsonNode.class), anyString());
    verify(sessions).acknowledgeContext(controller, "session-1", 1L, ack);
  }

  @Test
  void unkeyedContextPushPassesNoCallerDeadline() {
    when(sessions.runnerContext(controller, "session-1", 1L)).thenReturn(context);
    when(sessions.contextDeliveryId(controller, "session-1", 1L)).thenReturn(null);

    dispatch.pushContext(controller, "session-1", 1L);

    verify(runner).send("context", context);
    verify(runner, never())
        .send(eq("context"), any(JsonNode.class), anyString(), any(Instant.class));
    verify(sessions, never()).acknowledgeContext(any(), anyString(), anyLong(), any());
  }
}

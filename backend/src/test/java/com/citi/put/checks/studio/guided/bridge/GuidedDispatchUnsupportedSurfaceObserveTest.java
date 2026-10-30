package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

/**
 * ADR-SC-007 WI-3.1 (D8): the runner gave up collecting a page at its deadline, and the backend
 * classified the refusal UNSUPPORTED_SURFACE. The session then ends FAILED with that code; an
 * expired or replaced fence never revives it.
 */
class GuidedDispatchUnsupportedSurfaceObserveTest {
  private final GuidedContracts contracts = new GuidedContracts();
  private final Authentication controller = mock(Authentication.class);
  private final GuidedSessionService sessions = mock(GuidedSessionService.class);
  private final HttpRunnerDispatchClient runner = mock(HttpRunnerDispatchClient.class);
  private final GuidedDispatchService dispatch =
      new GuidedDispatchService(sessions, mock(GuidedMaterializationService.class), runner);
  private final ObjectNode request = contracts.object().put("sessionId", "session-1");

  @Test
  void anUnsupportedSurfaceObserveRefusalEndsTheSessionFailedWithThatCode() {
    when(runner.send(anyString(), any(), anyString()))
        .thenThrow(
            new GuidedSessionException(
                "UNSUPPORTED_SURFACE", 422, "OBSERVATION_DEADLINE", false, null));

    assertThatThrownBy(() -> dispatch.observe(controller, "session-1", 1L, "key", request))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("UNSUPPORTED_SURFACE");
              assertThat(e.status()).isEqualTo(422);
            });

    verify(sessions).failTranslation(controller, "session-1", 1L, "UNSUPPORTED_SURFACE");
  }

  @Test
  void anExpiredOrReplacedFenceNeverRevivesTheSessionAndTheRefusalStillReachesTheCaller() {
    when(runner.send(anyString(), any(), anyString()))
        .thenThrow(
            new GuidedSessionException(
                "UNSUPPORTED_SURFACE", 422, "OBSERVATION_DEADLINE", false, null));
    doThrow(new GuidedSessionException("STALE_GENERATION", 409))
        .when(sessions)
        .failTranslation(controller, "session-1", 1L, "UNSUPPORTED_SURFACE");

    assertThatThrownBy(() -> dispatch.observe(controller, "session-1", 1L, "key", request))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> assertThat(e.getMessage()).isEqualTo("UNSUPPORTED_SURFACE"));
  }

  @Test
  void anUnknownOutcomeRefusalStillLeavesTheSessionAlone() {
    when(runner.send(anyString(), any(), anyString()))
        .thenThrow(new GuidedSessionException("UNKNOWN_OUTCOME", 409));

    assertThatThrownBy(() -> dispatch.observe(controller, "session-1", 1L, "key", request))
        .isInstanceOf(GuidedSessionException.class);

    verify(sessions, never()).failTranslation(any(), anyString(), anyLong(), anyString());
  }
}

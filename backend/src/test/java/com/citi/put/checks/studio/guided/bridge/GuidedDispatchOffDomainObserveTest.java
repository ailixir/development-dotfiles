package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
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
 * STUDIO-FLEX-001: a learning page that stayed off the allowed domains past the runner's return
 * window makes the runner refuse the observe; the session then ends FAILED ORIGIN_NOT_ALLOWED. Any
 * other observe failure leaves the session alone.
 */
class GuidedDispatchOffDomainObserveTest {
  private final GuidedContracts contracts = new GuidedContracts();
  private final Authentication controller = mock(Authentication.class);
  private final GuidedSessionService sessions = mock(GuidedSessionService.class);
  private final HttpRunnerDispatchClient runner = mock(HttpRunnerDispatchClient.class);
  private final GuidedDispatchService dispatch =
      new GuidedDispatchService(sessions, mock(GuidedMaterializationService.class), runner);
  private final ObjectNode request = contracts.object().put("sessionId", "session-1");

  @Test
  void anOffDomainObserveRefusalEndsTheSessionFailedOriginNotAllowed() {
    when(runner.send(anyString(), any(), anyString()))
        .thenThrow(new GuidedSessionException("ORIGIN_NOT_ALLOWED", 403));

    assertThatThrownBy(() -> dispatch.observe(controller, "session-1", 1L, "key", request))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e ->
                org.assertj.core.api.Assertions.assertThat(e.getMessage())
                    .isEqualTo("ORIGIN_NOT_ALLOWED"));

    verify(sessions).failTranslation(controller, "session-1", 1L, "ORIGIN_NOT_ALLOWED");
  }

  @Test
  void anotherObserveFailureDoesNotEndTheSession() {
    when(runner.send(anyString(), any(), anyString()))
        .thenThrow(new GuidedSessionException("UNKNOWN_OUTCOME", 409));

    assertThatThrownBy(() -> dispatch.observe(controller, "session-1", 1L, "key", request))
        .isInstanceOf(GuidedSessionException.class);

    verify(sessions, never())
        .failTranslation(any(), anyString(), org.mockito.ArgumentMatchers.anyLong(), anyString());
  }
}

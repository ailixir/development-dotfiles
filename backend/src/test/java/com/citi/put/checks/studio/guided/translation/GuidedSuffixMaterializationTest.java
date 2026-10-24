package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.function.Function;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.core.Authentication;

/**
 * STUDIO-OBS-015 B2B-01 (aria-append-ruling01 P1, P2/A18-4): the suffix append is preceded by a
 * same-version sync when no delivery is pending; a keyed append delivery is resent with the same id
 * only after transport uncertainty, at most three sends and never at or after its frozen lease; any
 * closed runner refusal is terminal on first receipt. No Spring: every collaborator is a test
 * double and {@code translationTransaction} applies its lambda to one in-memory session.
 */
class GuidedSuffixMaterializationTest {
  private static final String ID = "session-1";
  private static final long FENCE = 4L;
  private static final String DELIVERY = "6f0c1a52-8d3e-4b1a-9f00-3c2b1d0e9a11";
  private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");

  private final GuidedContracts contracts = new GuidedContracts();
  private final Authentication controller = mock(Authentication.class);
  private final GuidedSessionService sessions = mock(GuidedSessionService.class);
  private final GuidedSessionRepository repository = mock(GuidedSessionRepository.class);
  private final GuidedTranslationStore store = mock(GuidedTranslationStore.class);
  private final GuidedDispatchService dispatch = mock(GuidedDispatchService.class);
  private final ObjectNode progress = contracts.object();
  private final ObjectNode context = contracts.object();
  private GuidedTranslationService translation;

  @BeforeEach
  void setUp() {
    ObjectNode document = contracts.object().put("sessionId", ID).put("state", "OBSERVING");
    document.set("progress", progress);
    var session = new GuidedSessionRepository.Session(document, progress);
    doAnswer(
            call ->
                call.<Function<GuidedSessionRepository.Session, ?>>getArgument(3).apply(session))
        .when(sessions)
        .translationTransaction(any(), anyString(), anyLong(), any());
    ObjectNode state = contracts.object().put("planRevision", 7);
    state.putObject("plan").putArray("sourceReferences");
    when(store.state(ID)).thenReturn(state);
    context.put("leaseExpiresAt", NOW.plusSeconds(30).toString());
    when(sessions.runnerContext(controller, ID, FENCE)).thenReturn(context);
    translation =
        new GuidedTranslationService(
            sessions,
            repository,
            store,
            mock(GuidedClarificationContextStore.class),
            dispatch,
            mock(GuidedLlmGatewayClient.class),
            contracts,
            mock(GuidedPromptAssembler.class),
            mock(GuidedSourceInputResolver.class),
            mock(GuidedProposalValidator.class),
            mock(GuidedDependencyPlanner.class),
            mock(GuidedTranslationProperties.class),
            Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  void appendIsPrecededBySameVersionSync() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(null, DELIVERY);
    when(dispatch.pushContext(controller, ID, FENCE)).thenReturn(contracts.object());

    finish();

    InOrder order = inOrder(dispatch, sessions);
    order.verify(dispatch).pushContext(controller, ID, FENCE);
    order
        .verify(sessions)
        .materialize(eq(controller), eq(ID), eq(FENCE), eq("suffix-materialize-7"), any());
    order.verify(dispatch).pushContext(controller, ID, FENCE);
    verify(dispatch, times(2)).pushContext(controller, ID, FENCE);
    verify(store).continuation(ID, "REFRESH");
  }

  @Test
  void retriedContinuationWithPendingDeliverySkipsSync() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(DELIVERY);
    when(dispatch.pushContext(controller, ID, FENCE)).thenReturn(contracts.object());

    finish();

    InOrder order = inOrder(dispatch, sessions);
    order.verify(sessions).materialize(eq(controller), eq(ID), eq(FENCE), anyString(), any());
    order.verify(dispatch).pushContext(controller, ID, FENCE);
    verify(dispatch, times(1)).pushContext(controller, ID, FENCE);
    assertThat(progress.path("suffixDelivery").path("deliveryId").asText()).isEqualTo(DELIVERY);
    assertThat(progress.path("suffixDelivery").path("sends").asInt()).isEqualTo(1);
  }

  @Test
  void closedNonDefiniteAppendRefusalIsTerminalOnFirstReceipt() {
    assertAppendRefusalIsTerminal(
        new GuidedSessionException(
            "UNKNOWN_OUTCOME", 409, HttpRunnerDispatchClient.CONTEXT_CLOSED_REFUSAL, false, null));
  }

  @Test
  void definiteAppendRefusalIsTerminal() {
    assertAppendRefusalIsTerminal(
        new GuidedSessionException(
            "RUNTIME_INCOMPATIBLE", 409, HttpRunnerDispatchClient.CONTEXT_REFUSED, false, null));
  }

  @Test
  void uncertainAppendResendsSameDeliveryAtMostThreeTimes() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(null, DELIVERY);
    when(dispatch.pushContext(controller, ID, FENCE))
        .thenReturn(contracts.object())
        .thenThrow(new GuidedSessionException("UNKNOWN_OUTCOME", 409));

    for (int send = 1; send <= 3; send++) {
      var failure = failure();
      assertThat(failure.getMessage()).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(failure.messageCode()).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(progress.path("suffixDelivery").path("deliveryId").asText()).isEqualTo(DELIVERY);
      assertThat(progress.path("suffixDelivery").path("sends").asInt()).isEqualTo(send);
      verify(sessions, never()).failTranslation(any(), anyString(), anyLong(), anyString());
    }

    var exhausted = failure();

    assertTerminal(exhausted);
    // One same-version sync plus three keyed sends; the fourth continuation sends nothing.
    verify(dispatch, times(4)).pushContext(controller, ID, FENCE);
    assertThat(progress.path("suffixDelivery").path("sends").asInt()).isEqualTo(3);
    verify(sessions, times(1)).failTranslation(controller, ID, FENCE, "RUNTIME_INCOMPATIBLE");
    verify(store, never()).continuation(ID, "REFRESH");
  }

  @Test
  void appendAtOrAfterFrozenLeaseFailsWithoutSending() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(DELIVERY);
    context.put("leaseExpiresAt", NOW.toString());

    assertTerminal(failure());

    verify(dispatch, never()).pushContext(any(), anyString(), anyLong());
    verify(sessions, times(1)).failTranslation(controller, ID, FENCE, "RUNTIME_INCOMPATIBLE");
    verify(store, never()).continuation(ID, "REFRESH");
  }

  @Test
  void acknowledgedAppendMovesToRefresh() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(null, DELIVERY);
    when(dispatch.pushContext(controller, ID, FENCE)).thenReturn(contracts.object());

    JsonNode result = finish();

    assertThat(result.path("sessionId").asText()).isEqualTo(ID);
    assertThat(progress.path("suffixDelivery").path("sends").asInt()).isEqualTo(1);
    assertThat(progress.path("suffixDelivery").has("outcome")).isFalse();
    verify(sessions, never()).failTranslation(any(), anyString(), anyLong(), anyString());
    verify(store).continuation(ID, "REFRESH");
  }

  @Test
  void presyncDefiniteRefusalIsTerminal() {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(null);
    var refusal =
        new GuidedSessionException(
            "RUNTIME_INCOMPATIBLE", 409, HttpRunnerDispatchClient.CONTEXT_REFUSED, false, null);
    when(dispatch.pushContext(controller, ID, FENCE)).thenThrow(refusal);

    assertThat(failure()).isSameAs(refusal);

    verify(sessions, times(1)).failTranslation(controller, ID, FENCE, "RUNTIME_INCOMPATIBLE");
    verify(sessions, never()).materialize(any(), anyString(), anyLong(), anyString(), any());
    verify(dispatch, times(1)).pushContext(controller, ID, FENCE);
  }

  private void assertAppendRefusalIsTerminal(GuidedSessionException refusal) {
    when(sessions.contextDeliveryId(controller, ID, FENCE)).thenReturn(null, DELIVERY);
    when(dispatch.pushContext(controller, ID, FENCE))
        .thenReturn(contracts.object())
        .thenThrow(refusal);

    assertTerminal(failure());

    // One same-version sync and exactly one append send; no resend after a closed refusal.
    verify(dispatch, times(2)).pushContext(controller, ID, FENCE);
    verify(sessions, times(1)).failTranslation(controller, ID, FENCE, "RUNTIME_INCOMPATIBLE");
    assertThat(progress.path("suffixDelivery").path("sends").asInt()).isEqualTo(1);
    assertThat(progress.path("suffixDelivery").path("outcome").asText()).isEqualTo("REFUSED");
    verify(store, never()).continuation(ID, "REFRESH");
  }

  private static void assertTerminal(GuidedSessionException failure) {
    assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
    assertThat(failure.status()).isEqualTo(409);
    assertThat(failure.retryable()).isFalse();
    assertThat(failure.messageCode()).isEqualTo(HttpRunnerDispatchClient.CONTEXT_REFUSED);
  }

  private GuidedSessionException failure() {
    var failure = catchThrowableOfType(this::finish, GuidedSessionException.class);
    assertThat(failure).isNotNull();
    return failure;
  }

  private JsonNode finish() {
    try {
      Method method =
          GuidedTranslationService.class.getDeclaredMethod(
              "finishSuffixMaterialization", Authentication.class, String.class, long.class);
      method.setAccessible(true);
      return (JsonNode) method.invoke(translation, controller, ID, FENCE);
    } catch (InvocationTargetException failure) {
      if (failure.getCause() instanceof RuntimeException runtime) {
        throw runtime;
      }
      throw new IllegalStateException(failure.getCause());
    } catch (ReflectiveOperationException failure) {
      throw new IllegalStateException(failure);
    }
  }
}

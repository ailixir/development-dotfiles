package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance.Guard;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Actual passive-wait and unchanged legacy protocol controls. */
public class GuidedGuardSiteParityTest {
  static final ObjectMapper JSON = new ObjectMapper();
  static final String ID = "00000000-0000-0000-0000-000000000001";

  @Test
  void unchangedLegacyGate34FiveKeyProtocolAndCommitSelectionRemainSeparate() throws Exception {
    assertEquals(34, GuidedRefusalDiagnostics.Gate.values().length);
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    var attempt =
        new GuidedRefusalDiagnostics(events::add)
            .attempt(ID, "00000000-0000-0000-0000-000000000002");
    var manager = org.springframework.transaction.support.TransactionSynchronizationManager.class;
    org.springframework.transaction.support.TransactionSynchronizationManager
        .setActualTransactionActive(true);
    org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
    try {
      attempt.record(GuidedRefusalDiagnostics.Gate.STRICT_SCHEMA);
      attempt.rejectedAfterCommit(false);
      attempt.rejectedAfterCommit(false);
      var pending =
          org.springframework.transaction.support.TransactionSynchronizationManager
              .getSynchronizations();
      assertEquals(1, pending.size());
      assertTrue(events.isEmpty());
      pending.getFirst().afterCommit();
      assertEquals(1, events.size());
      var receipt = events.getFirst();
      assertEquals(GuidedRefusalDiagnostics.Gate.STRICT_SCHEMA, receipt.gate());
      var value = JSON.readTree(receipt.bytes());
      var keys = new java.util.HashSet<String>();
      value.fieldNames().forEachRemaining(keys::add);
      assertEquals(java.util.Set.of("event", "version", "sessionId", "attemptId", "gate"), keys);
      assertEquals("GUIDED_REFUSAL_GATE", value.path("event").asText());
      assertFalse(value.has("guard"));
      assertFalse(value.has("transaction"));
    } finally {
      org.springframework.transaction.support.TransactionSynchronizationManager.clear();
    }
  }

  @Test
  void actualPassiveWaitPreservesSuccessTimeoutInterruptCancellationAndExceptionBytes()
      throws Exception {
    var events = new ArrayList<Object>();
    var constructor =
        GuidedGuardProvenance.class.getDeclaredConstructor(java.util.function.Consumer.class);
    constructor.setAccessible(true);
    var configured = GuidedGuardProvenance.class.getDeclaredField("configured");
    configured.setAccessible(true);
    Object previous = configured.get(null);
    configured.set(
        null, constructor.newInstance((java.util.function.Consumer<Object>) events::add));
    try {
      var service = mock(GuidedTranslationService.class, CALLS_REAL_METHODS);
      var dispatch = mock(GuidedDispatchService.class);
      var field = GuidedTranslationService.class.getDeclaredField("dispatch");
      field.setAccessible(true);
      field.set(service, dispatch);
      var method =
          GuidedTranslationService.class.getDeclaredMethod(
              "observeAcquisition",
              org.springframework.security.core.Authentication.class,
              String.class,
              long.class,
              GuidedTranslationStore.AcquisitionClaim.class,
              long.class);
      method.setAccessible(true);
      var claim =
          new GuidedTranslationStore.AcquisitionClaim(
              GuidedTranslationStore.AcquisitionDisposition.POLL,
              JSON.createObjectNode(),
              "synthetic",
              "synthetic",
              1,
              Instant.now().plusSeconds(5),
              100,
              null);
      ObjectNode result = JSON.createObjectNode().put("synthetic", true);
      when(dispatch.observe(isNull(), eq(ID), eq(1L), eq("synthetic"), any())).thenReturn(result);
      assertEquals(result, method.invoke(service, null, ID, 1L, claim, System.nanoTime()));
      var expired =
          new GuidedTranslationStore.AcquisitionClaim(
              GuidedTranslationStore.AcquisitionDisposition.WAIT,
              JSON.createObjectNode(),
              "synthetic",
              "synthetic",
              1,
              Instant.now(),
              0,
              null);
      assertBudget(() -> method.invoke(service, null, ID, 1L, expired, System.nanoTime()));
      var cancelled = new java.util.concurrent.CountDownLatch(1);
      when(dispatch.observe(isNull(), eq(ID), eq(1L), eq("synthetic"), any()))
          .thenAnswer(
              invocation -> {
                try {
                  new java.util.concurrent.CountDownLatch(1).await();
                } catch (InterruptedException interrupted) {
                  cancelled.countDown();
                }
                return null;
              });
      assertBudget(() -> method.invoke(service, null, ID, 1L, claim, System.nanoTime()));
      assertTrue(cancelled.await(2, java.util.concurrent.TimeUnit.SECONDS));
      Thread.currentThread().interrupt();
      try {
        assertBudget(() -> method.invoke(service, null, ID, 1L, claim, System.nanoTime()));
        assertTrue(Thread.currentThread().isInterrupted());
      } finally {
        Thread.interrupted();
      }
      assertEquals(3, events.size());
      List<Guard> actual = new ArrayList<>();
      for (Object event : events) {
        var guard = event.getClass().getDeclaredMethod("guard");
        guard.setAccessible(true);
        actual.add((Guard) guard.invoke(event));
      }
      assertEquals(
          List.of(
              Guard.PASSIVE_REMAINING, Guard.PASSIVE_WAIT_TIMEOUT, Guard.PASSIVE_WAIT_INTERRUPTED),
          actual);
    } finally {
      configured.set(null, previous);
    }
  }

  private static void assertBudget(Throwing call) {
    var wrapper = assertThrows(java.lang.reflect.InvocationTargetException.class, call::run);
    var failure = assertInstanceOf(GuidedSessionException.class, wrapper.getCause());
    assertEquals("BUDGET_EXCEEDED", failure.getMessage());
    assertEquals(429, failure.status());
    assertEquals("BUDGET_EXCEEDED", failure.messageCode());
    assertFalse(failure.retryable());
    assertNull(failure.retryAfterSeconds());
  }

  private interface Throwing {
    void run() throws Exception;
  }
}

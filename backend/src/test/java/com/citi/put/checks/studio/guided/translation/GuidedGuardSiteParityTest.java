package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;

/** The five-key refusal-gate protocol and its commit selection stay separate. */
public class GuidedGuardSiteParityTest {
  static final ObjectMapper JSON = new ObjectMapper();
  static final String ID = "00000000-0000-0000-0000-000000000001";

  @Test
  void unchangedLegacyGate34FiveKeyProtocolAndCommitSelectionRemainSeparate() throws Exception {
    assertEquals(23, GuidedRefusalDiagnostics.Gate.values().length);
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
}

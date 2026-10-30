package com.citi.put.checks.studio.guided.audit;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.logstash.logback.marker.SingleFieldAppendingMarker;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** STUDIO-OBS-014 AC-10 (ruling AR-2 e): the closed audit event shape, unit level. */
class StudioActionAuditTest {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String SCOPE_HASH = "a".repeat(64);
  private static final String LABEL_CANARY = "Delete account canary-label-7731";
  private static final String ORIGIN = "https://app.example.test";

  private final ListAppender<ILoggingEvent> captured = new ListAppender<>();
  private Logger logger;

  @BeforeEach
  void capture() {
    logger = (Logger) LoggerFactory.getLogger(StudioActionAudit.CATEGORY);
    captured.start();
    logger.addAppender(captured);
  }

  @AfterEach
  void release() {
    logger.detachAppender(captured);
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  @Test
  void anAdmittedActionCarriesTheClosedKeySetAndNoLabelText() {
    StudioActionAudit.guidedActionAdmitted(
        session(), "admission-1", proposal(ORIGIN), identity("button"));

    Map<String, Object> event = only();
    assertThat(event.keySet()).containsExactlyElementsOf(StudioActionAudit.KEYS);
    assertThat(event)
        .containsEntry("schemaVersion", "1")
        .containsEntry("eventType", "GUIDED_ACTION_ADMITTED")
        .containsEntry("principalId", "principal-1")
        .containsEntry("csiId", "60400")
        .containsEntry("testId", "test-1")
        .containsEntry("sessionId", "session-1")
        .containsEntry("executionId", null)
        .containsEntry("admissionId", "admission-1")
        .containsEntry("attemptId", null)
        .containsEntry("origin", ORIGIN)
        .containsEntry("obligationKind", "click")
        .containsEntry("targetRole", "button")
        .containsEntry("targetLabelHash", StudioActionAudit.labelHash(SCOPE_HASH, LABEL_CANARY))
        .containsEntry("outcome", "ADMITTED")
        .containsEntry("reasonCode", null);
    assertThat(String.valueOf(event.get("targetLabelHash"))).matches("[a-f0-9]{32}");
    assertThat(rendered()).doesNotContain("canary-label-7731").doesNotContain("Delete account");
    assertThat(captured.list.getFirst().getFormattedMessage()).isEqualTo("GUIDED_ACTION_ADMITTED");
  }

  @Test
  void aNonOriginValueAndAnUnknownRoleAreNeverEchoed() {
    StudioActionAudit.guidedActionRefused(
        session(),
        "attempt-1",
        proposal("https://evil.example.test/path?q=secret"),
        identity("x-custom-role"),
        "DESTRUCTIVE_VERB");

    Map<String, Object> event = only();
    assertThat(event)
        .containsEntry("eventType", "GUIDED_ACTION_REFUSED")
        .containsEntry("origin", "UNAPPROVED")
        .containsEntry("targetRole", "none")
        .containsEntry("attemptId", "attempt-1")
        .containsEntry("admissionId", null)
        .containsEntry("outcome", "REFUSED")
        .containsEntry("reasonCode", "DESTRUCTIVE_VERB");
    assertThat(rendered()).doesNotContain("evil.example").doesNotContain("x-custom-role");
  }

  @Test
  void aReplayDispatchIsOneEventWithTheExecutionIdOnly() {
    ObjectNode binding =
        JSON.createObjectNode()
            .put("principalId", "principal-1")
            .put("csiId", "60400")
            .put("testId", "test-1")
            .put("executionId", "execution-1")
            .put("attemptId", "attempt-9");

    StudioActionAudit.replayDispatched(binding, StudioActionAudit.Outcome.DISPATCH_UNKNOWN);

    Map<String, Object> event = only();
    assertThat(event.keySet()).containsExactlyElementsOf(StudioActionAudit.KEYS);
    assertThat(event)
        .containsEntry("eventType", "REPLAY_DISPATCHED")
        .containsEntry("sessionId", null)
        .containsEntry("executionId", "execution-1")
        .containsEntry("attemptId", "attempt-9")
        .containsEntry("obligationKind", "replayRun")
        .containsEntry("outcome", "DISPATCH_UNKNOWN");
  }

  @Test
  void insideATransactionTheEventWaitsForTheCommitAndARollbackEmitsNothing() {
    TransactionSynchronizationManager.initSynchronization();
    StudioActionAudit.guidedActionAdmitted(
        session(), "admission-1", proposal(ORIGIN), identity("button"));
    assertThat(captured.list).as("nothing before commit").isEmpty();
    List<TransactionSynchronization> pending =
        TransactionSynchronizationManager.getSynchronizations();
    TransactionSynchronizationManager.clearSynchronization();

    pending.forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
    assertThat(captured.list).as("a rollback is never audited").isEmpty();

    pending.forEach(TransactionSynchronization::afterCommit);
    assertThat(captured.list).hasSize(1);
  }

  @Test
  void aRefusalIsAuditedAtTheDecisionEvenInsideATransactionThatWillRollBack() {
    TransactionSynchronizationManager.initSynchronization();
    StudioActionAudit.guidedActionRefused(
        session(), "attempt-1", proposal(ORIGIN), identity("button"), "UNGROUNDED_TARGET");
    assertThat(captured.list).hasSize(1);
    assertThat(TransactionSynchronizationManager.getSynchronizations()).isEmpty();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private Map<String, Object> only() {
    assertThat(captured.list).hasSize(1);
    Map<String, Object> fields = new LinkedHashMap<>();
    for (Object argument : captured.list.getFirst().getArgumentArray()) {
      SingleFieldAppendingMarker field = (SingleFieldAppendingMarker) argument;
      fields.put(field.getFieldName(), value(field));
    }
    return fields;
  }

  private static Object value(SingleFieldAppendingMarker field) {
    String text = field.toString();
    // kv renders as "name=value"; null renders as "name=null".
    String value = text.substring(field.getFieldName().length() + 1);
    return value.equals("null") ? null : value;
  }

  private String rendered() {
    StringBuilder out = new StringBuilder();
    for (ILoggingEvent event : captured.list) {
      out.append(event.getFormattedMessage());
      for (Object argument : event.getArgumentArray()) {
        out.append(' ').append(argument);
      }
    }
    return out.toString();
  }

  private static JsonNode session() {
    ObjectNode session =
        JSON.createObjectNode()
            .put("sessionId", "session-1")
            .put("testId", "test-1")
            .put("scopeHash", SCOPE_HASH);
    ObjectNode scope =
        session.putObject("scope").put("principalId", "principal-1").put("csiId", "60400");
    return session;
  }

  private static JsonNode proposal(String origin) {
    ObjectNode proposal = JSON.createObjectNode();
    proposal.putObject("operation").put("kind", "click");
    proposal
        .putObject("target")
        .put("kind", "node")
        .put("ref", "e1")
        .put("documentId", "document-1")
        .put("generation", 1);
    proposal.putObject("executionEvidence").put("origin", origin);
    return proposal;
  }

  /** ADR-SC-007: the audit takes role and label from the identity of the element, not a locator. */
  private static JsonNode identity(String role) {
    return JSON.createObjectNode().put("role", role).put("name", LABEL_CANARY);
  }
}

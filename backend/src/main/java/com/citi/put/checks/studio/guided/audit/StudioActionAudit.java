package com.citi.put.checks.studio.guided.audit;

import static net.logstash.logback.argument.StructuredArguments.kv;

import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Per-action Studio audit events for SIEM (STUDIO-OBS-014 AC-10, ruling AR-2 e).
 *
 * <p>One closed event shape, written to the dedicated {@value #CATEGORY} logger (its own JSON
 * appender, {@code stream=studio-audit}, no MDC). The log message is the constant event type and
 * every field is a structured argument, so no field is ever interpolated into text.
 *
 * <p>Events carry IDs and closed codes only. Never a value, an authored or page text, a label,
 * code, a URL path or query, a secret id or value, or an exception message. A step is generated
 * code, so an event names no target: {@code obligationKind} is the constant {@code step}, {@code
 * targetRole} is {@code none} and {@code targetLabelHash} is null (the fields keep their names and
 * positions so the SIEM schema is stable). The origin is emitted only when it is a bare http(s)
 * origin (an action ran on it only after the allowed-domains check); otherwise {@code UNAPPROVED}.
 *
 * <p>An admission is emitted after the surrounding transaction commits, so a rolled-back admission
 * is never audited as admitted. A refusal is emitted at the decision: the rejected proposal's
 * transaction always rolls back, and the refusal happened regardless. Without an active transaction
 * every event is emitted at once.
 *
 * <p>Volume bound: at most {@code maxActions} (200) admitted plus {@code maxModelProposals} (100)
 * refused events per guided session, and one event per replay dispatch attempt.
 */
public final class StudioActionAudit {

  /** The audit logger category, pinned at INFO with additivity off in logback-spring.xml. */
  public static final String CATEGORY = "com.citi.put.checks.audit.studio";

  public static final String SCHEMA_VERSION = "1";

  /** The closed event key set, in emission order. */
  public static final List<String> KEYS =
      List.of(
          "schemaVersion",
          "eventType",
          "eventId",
          "principalId",
          "csiId",
          "testId",
          "sessionId",
          "executionId",
          "admissionId",
          "attemptId",
          "origin",
          "obligationKind",
          "targetRole",
          "targetLabelHash",
          "outcome",
          "reasonCode");

  /** Event types. */
  public enum EventType {
    GUIDED_ACTION_ADMITTED,
    GUIDED_ACTION_REFUSED,
    REPLAY_DISPATCHED
  }

  /** Outcomes. */
  public enum Outcome {
    ADMITTED,
    REFUSED,
    DISPATCHED,
    DISPATCH_REFUSED,
    DISPATCH_UNKNOWN
  }

  /** The obligation kind of a replay dispatch, which is a whole run, not one action. */
  public static final String REPLAY_RUN = "replayRun";

  /** Every guided action is a step; the audit names no operation kind of its own. */
  private static final String STEP = "step";

  private static final Logger AUDIT = LoggerFactory.getLogger(CATEGORY);

  private StudioActionAudit() {}

  /**
   * A guided action the backend admitted.
   *
   * @param session the session document (scope, scopeHash, testId)
   * @param admissionId the committed admission id
   * @param proposal the admitted proposal
   */
  public static void guidedActionAdmitted(JsonNode session, String admissionId, JsonNode proposal) {
    guided(
        EventType.GUIDED_ACTION_ADMITTED,
        Outcome.ADMITTED,
        session,
        admissionId,
        null,
        proposal,
        null,
        true);
  }

  /**
   * A guided proposal the validator refused.
   *
   * @param attemptId the model attempt that proposed it
   * @param reasonCode a closed reason or an existing closed code
   */
  public static void guidedActionRefused(
      JsonNode session, String attemptId, JsonNode proposal, String reasonCode) {
    guided(
        EventType.GUIDED_ACTION_REFUSED,
        Outcome.REFUSED,
        session,
        null,
        attemptId,
        proposal,
        reasonCode,
        false);
  }

  /**
   * One replay dispatch attempt and how the runner answered it.
   *
   * @param binding the execution's observed revision binding
   */
  public static void replayDispatched(JsonNode binding, Outcome outcome) {
    List<Object> fields = new ArrayList<>();
    fields.add(SCHEMA_VERSION);
    fields.add(EventType.REPLAY_DISPATCHED.name());
    fields.add(UUID.randomUUID().toString());
    fields.add(id(binding.path("principalId")));
    fields.add(id(binding.path("csiId")));
    fields.add(id(binding.path("testId")));
    fields.add(null);
    fields.add(id(binding.path("executionId")));
    fields.add(null);
    fields.add(id(binding.path("attemptId")));
    fields.add(null);
    fields.add(REPLAY_RUN);
    fields.add("none");
    fields.add(null);
    fields.add(outcome.name());
    fields.add(null);
    emit(EventType.REPLAY_DISPATCHED, fields, true);
  }

  private static void guided(
      EventType type,
      Outcome outcome,
      JsonNode session,
      String admissionId,
      String attemptId,
      JsonNode proposal,
      String reasonCode,
      boolean afterCommit) {
    JsonNode scope = session.path("scope");
    List<Object> fields = new ArrayList<>();
    fields.add(SCHEMA_VERSION);
    fields.add(type.name());
    fields.add(UUID.randomUUID().toString());
    fields.add(id(scope.path("principalId")));
    fields.add(id(scope.path("csiId")));
    fields.add(id(session.path("testId")));
    fields.add(id(session.path("sessionId")));
    fields.add(null);
    fields.add(admissionId);
    fields.add(attemptId);
    fields.add(approvedOrigin(proposal.path("executionEvidence").path("origin").asText()));
    fields.add(STEP);
    fields.add("none");
    fields.add(null);
    fields.add(outcome.name());
    fields.add(reasonCode);
    emit(type, fields, afterCommit);
  }

  /**
   * The origin an action ran on. It was admitted against the deployment's allowed domains when the
   * observation arrived, so the audit only keeps a bare http(s) origin (no path, query or user
   * info), never a free string.
   */
  static String approvedOrigin(String origin) {
    return AllowedDomains.hostOf(origin) != null
            && origin.indexOf('/', origin.indexOf("//") + 2) < 0
            && origin.indexOf('?') < 0
            && origin.indexOf('#') < 0
        ? origin
        : "UNAPPROVED";
  }

  private static String id(JsonNode value) {
    return value.isTextual() ? value.asText() : null;
  }

  private static void emit(EventType type, List<Object> values, boolean afterCommit) {
    Object[] arguments = new Object[KEYS.size()];
    for (int i = 0; i < KEYS.size(); i++) {
      arguments[i] = kv(KEYS.get(i), values.get(i));
    }
    Runnable write = () -> AUDIT.info(type.name(), arguments);
    if (afterCommit && TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            @Override
            public void afterCommit() {
              write.run();
            }
          });
    } else {
      write.run();
    }
  }
}

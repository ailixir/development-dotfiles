package com.citi.put.checks.studio.guided.audit;

import static net.logstash.logback.argument.StructuredArguments.kv;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
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
 * <p>Events carry IDs and closed codes only. Never a value, an authored or page text, a label, a
 * URL path or query, a secret id or value, or an exception message. The one page-derived input, the
 * target's safe label, leaves only as {@code targetLabelHash} (first 32 hex of {@code
 * sha256(scopeHash + ':' + label)}); low-entropy labels are dictionary-reversible within one scope,
 * which the AC-2 document discloses (no keyed HMAC this wave). The origin is emitted only after it
 * is verified to be one of the session's approved origins; otherwise {@code UNAPPROVED}.
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

  private static final Set<String> OPERATION_KINDS =
      Set.of(
          "observe",
          "navigate",
          "click",
          "fill",
          "press",
          "check",
          "uncheck",
          "hover",
          "selectOption",
          "read",
          "assert");

  /** WAI-ARIA 1.2 roles; anything else is reported as {@code none}. */
  private static final Set<String> ARIA_ROLES =
      Set.of(
          "alert",
          "alertdialog",
          "application",
          "article",
          "banner",
          "blockquote",
          "button",
          "caption",
          "cell",
          "checkbox",
          "code",
          "columnheader",
          "combobox",
          "complementary",
          "contentinfo",
          "definition",
          "deletion",
          "dialog",
          "directory",
          "document",
          "emphasis",
          "feed",
          "figure",
          "form",
          "generic",
          "grid",
          "gridcell",
          "group",
          "heading",
          "img",
          "insertion",
          "link",
          "list",
          "listbox",
          "listitem",
          "log",
          "main",
          "marquee",
          "math",
          "menu",
          "menubar",
          "menuitem",
          "menuitemcheckbox",
          "menuitemradio",
          "meter",
          "navigation",
          "none",
          "note",
          "option",
          "paragraph",
          "presentation",
          "progressbar",
          "radio",
          "radiogroup",
          "region",
          "row",
          "rowgroup",
          "rowheader",
          "scrollbar",
          "search",
          "searchbox",
          "separator",
          "slider",
          "spinbutton",
          "status",
          "strong",
          "subscript",
          "superscript",
          "switch",
          "tab",
          "table",
          "tablist",
          "tabpanel",
          "term",
          "textbox",
          "time",
          "timer",
          "toolbar",
          "tooltip",
          "tree",
          "treegrid",
          "treeitem");

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
   * @param reasonCode a closed reason ({@code GuidedPolicyReason}) or an existing closed code
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
    JsonNode target = proposal.path("target");
    JsonNode locator = target.path("locator");
    String label =
        locator.path("kind").asText().equals("role")
            ? locator.path("name").asText(null)
            : locator.path("value").asText(null);
    String kind = proposal.path("operation").path("kind").asText();
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
    fields.add(approvedOrigin(scope, proposal.path("executionEvidence").path("origin").asText()));
    fields.add(OPERATION_KINDS.contains(kind) ? kind : "unknown");
    fields.add(targetRole(target));
    fields.add(label == null ? null : labelHash(session.path("scopeHash").asText(), label));
    fields.add(outcome.name());
    fields.add(reasonCode);
    emit(type, fields, afterCommit);
  }

  static String approvedOrigin(JsonNode scope, String origin) {
    for (JsonNode approved : scope.path("approvedOrigins")) {
      if (approved.asText().equals(origin)) {
        return approved.asText();
      }
    }
    return "UNAPPROVED";
  }

  static String targetRole(JsonNode target) {
    if (target.path("kind").asText().equals("page")) {
      return "page";
    }
    String role = target.path("locator").path("role").asText();
    return ARIA_ROLES.contains(role) ? role : "none";
  }

  static String labelHash(String scopeHash, String label) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256")
              .digest((scopeHash + ":" + label).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest).substring(0, 32);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
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

package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/** Constructs admissions from server-owned metadata and validates immutable outcome reports. */
public final class GuidedActionLedger {
  private final GuidedContracts contracts;

  public GuidedActionLedger(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode admit(
      JsonNode session, JsonNode proposal, String key, String policyDecisionHash, Instant now) {
    ObjectNode ledger = contracts.object();
    ledger.put("schemaVersion", 3);
    ledger.put("attemptOrdinal", 0);
    ledger.put("sessionId", session.path("sessionId").asText());
    ledger.set("coordinate", proposal.path("coordinate").deepCopy());
    ledger.put("idempotencyKey", key);
    ledger.put("requestDigest", GuidedContracts.hash(proposal));
    ledger.set("scopeHash", session.path("scopeHash"));
    ledger.put("operationHash", GuidedOperationIdentity.of(proposal));
    ledger.set("generation", proposal.path("generation"));
    ledger.set("documentId", proposal.path("executionEvidence").path("documentId"));
    ledger.set("ownerFence", session.path("owner").path("fence"));
    ObjectNode admission = ledger.putObject("admission");
    admission.put("admissionId", UUID.randomUUID().toString());
    admission.set("authorizationId", session.path("runAuthorization").path("authorizationId"));
    admission.put("admittedAt", now.toString());
    admission.put("policyDecisionHash", policyDecisionHash);
    ledger.put("state", "ADMITTED");
    ledger.put("dispatchCount", 0);
    ledger.put("outcomeCode", "PENDING");
    return ledger;
  }

  /** A ledger state and its coarse outcome code. */
  public record Outcome(String state, String outcomeCode) {}

  /**
   * The ledger outcome a step receipt implies (E5 field-needs row 36). The closed code of the
   * receipt is the truth; the coarse ledger enum is derived from it by this one table.
   *
   * @param closedCode the receipt's closedCode, or null for a step that ran without error
   */
  public static Outcome derive(JsonNode closedCode) {
    if (closedCode == null || closedCode.isNull() || closedCode.isMissingNode()) {
      return new Outcome("SUCCEEDED", "OK");
    }
    return switch (closedCode.asText()) {
      case "ASSERTION_FAILED" -> new Outcome("FAILED", "ASSERTION_FAILED");
      case "TARGET_DRIFT" -> new Outcome("FAILED", "TARGET_CHANGED");
      case "TIMEOUT" -> new Outcome("FAILED", "TIMEOUT");
      case "CANCELLED" -> new Outcome("FAILED", "CANCELLED");
      case "OUTCOME_UNKNOWN" -> new Outcome("UNKNOWN_OUTCOME", "ACK_LOST");
      case "POLICY_REFUSED",
              "READ_REFUSED",
              "PASSWORD_CONTROL_READ_REFUSED",
              "NAVIGATION_HTTP_ERROR",
              "REFERENCE_REFUSED",
              "REFERENCE_MISMATCH",
              "LOGIN_REQUIRED",
              "INVALID_CONTRACT",
              "INTERNAL_ERROR",
              "PROFILE_MISMATCH",
              "AUTHORIZATION_EXPIRED" ->
          new Outcome("FAILED", "POLICY_DENIED");
      default -> throw new GuidedSessionException("INVALID_CONTRACT", 422);
    };
  }

  private static final Set<Class<?>> STANDARD_OUTCOME_SCALARS =
      Set.of(
          com.fasterxml.jackson.databind.node.TextNode.class,
          com.fasterxml.jackson.databind.node.NullNode.class,
          com.fasterxml.jackson.databind.node.BooleanNode.class,
          com.fasterxml.jackson.databind.node.IntNode.class,
          com.fasterxml.jackson.databind.node.LongNode.class,
          com.fasterxml.jackson.databind.node.BigIntegerNode.class,
          com.fasterxml.jackson.databind.node.FloatNode.class,
          com.fasterxml.jackson.databind.node.DoubleNode.class,
          com.fasterxml.jackson.databind.node.DecimalNode.class);

  private static boolean standardOutcomeTree(JsonNode node) {
    if (node == null) {
      return false;
    }
    if (node.getClass() == ObjectNode.class
        || node.getClass() == com.fasterxml.jackson.databind.node.ArrayNode.class) {
      for (JsonNode child : node) {
        if (!standardOutcomeTree(child)) {
          return false;
        }
      }
      return true;
    }
    return STANDARD_OUTCOME_SCALARS.contains(node.getClass());
  }

  ObjectNode copyOutcomeRequest(JsonNode request) {
    try {
      if (request == null
          || request.getClass() != ObjectNode.class
          || !standardOutcomeTree(request)) {
        return null;
      }
      ObjectNode owned = request.deepCopy();
      return standardOutcomeTree(owned) ? owned : null;
    } catch (RuntimeException unavailable) {
      return null;
    }
  }

  private enum PreparedFailure {
    INVALID_CONTRACT("INVALID_CONTRACT", 422),
    RUNTIME_INCOMPATIBLE("RUNTIME_INCOMPATIBLE", 409);

    private final String code;
    private final int status;

    PreparedFailure(String code, int status) {
      this.code = code;
      this.status = status;
    }

    private static PreparedFailure known(GuidedSessionException failure) {
      for (PreparedFailure candidate : values()) {
        if (candidate.code.equals(failure.getMessage()) && candidate.status == failure.status()) {
          return candidate;
        }
      }
      return null;
    }
  }

  static final class PreparedReport {
    private final GuidedActionLedger owner;
    private final ObjectNode originalReport;
    private final ObjectNode snapshot;
    private final String representation;
    private final PreparedFailure failure;

    private PreparedReport(
        GuidedActionLedger owner,
        ObjectNode originalReport,
        ObjectNode snapshot,
        String representation,
        PreparedFailure failure) {
      this.owner = owner;
      this.originalReport = originalReport;
      this.snapshot = snapshot;
      this.representation = representation;
      this.failure = failure;
    }
  }

  PreparedReport prepareReport(ObjectNode report) {
    ObjectNode snapshot = copyOutcomeRequest(report);
    if (snapshot == null) {
      return null;
    }
    try {
      String representation = snapshot.toString();
      PreparedFailure preparedFailure = null;
      try {
        contracts.validate("ledger", snapshot);
      } catch (GuidedSessionException failure) {
        preparedFailure = PreparedFailure.known(failure);
        if (preparedFailure == null) {
          return null;
        }
      }
      return new PreparedReport(this, report, snapshot, representation, preparedFailure);
    } catch (RuntimeException unavailable) {
      return null;
    }
  }

  static boolean successfulSchemaMatches(
      PreparedReport prepared, ObjectNode report, GuidedContracts expectedContracts) {
    try {
      return prepared != null
          && prepared.owner != null
          && prepared.owner.contracts == expectedContracts
          && prepared.failure == null
          && prepared.originalReport == report
          && report.getClass() == ObjectNode.class
          && standardOutcomeTree(report)
          && report.equals(prepared.snapshot)
          && report.toString().equals(prepared.representation);
    } catch (RuntimeException unavailable) {
      return false;
    }
  }

  public void verifyReport(ObjectNode stored, ObjectNode report) {
    contracts.validate("ledger", report);
    verifyReportBody(stored, report, null);
  }

  /** As {@link #verifyReport(ObjectNode, ObjectNode)}, and the outcome must be the receipt's. */
  public void verifyReport(ObjectNode stored, ObjectNode report, Outcome expected) {
    contracts.validate("ledger", report);
    verifyReportBody(stored, report, expected);
  }

  void verifyReport(ObjectNode stored, ObjectNode report, PreparedReport prepared) {
    verifyReport(stored, report, prepared, null);
  }

  void verifyReport(
      ObjectNode stored, ObjectNode report, PreparedReport prepared, Outcome expected) {
    boolean matching = false;
    try {
      matching =
          prepared != null
              && prepared.owner == this
              && prepared.originalReport == report
              && report.getClass() == ObjectNode.class
              && standardOutcomeTree(report)
              && report.equals(prepared.snapshot)
              && report.toString().equals(prepared.representation);
    } catch (RuntimeException unavailable) {
      // An unavailable input comparison cannot establish schema validity.
    }
    if (!matching) {
      verifyReport(stored, report, expected);
      return;
    }
    if (prepared.failure != null) {
      throw new GuidedSessionException(prepared.failure.code, prepared.failure.status);
    }
    verifyReportBody(stored, report, expected);
  }

  private void verifyReportBody(ObjectNode stored, ObjectNode report, Outcome expected) {
    ObjectNode immutable = report.deepCopy(), original = stored.deepCopy();
    for (String field : new String[] {"state", "dispatchCount", "outcomeCode"}) {
      immutable.remove(field);
      original.remove(field);
    }
    require(original.equals(immutable), "IDEMPOTENCY_CONFLICT", 409);
    require(report.path("dispatchCount").asInt() == 1, "INVALID_CONTRACT", 422);
    String state = report.path("state").asText(), code = report.path("outcomeCode").asText();
    boolean legal;
    if (expected != null) {
      legal = expected.state().equals(state) && expected.outcomeCode().equals(code);
    } else {
      legal =
          state.equals("SUCCEEDED") && code.equals("OK")
              || state.equals("FAILED")
                  && Set.of("ASSERTION_FAILED", "TARGET_CHANGED", "POLICY_DENIED", "TIMEOUT")
                      .contains(code)
              || state.equals("UNKNOWN_OUTCOME")
                  && Set.of("TARGET_CHANGED", "POLICY_DENIED", "TIMEOUT", "CANCELLED", "ACK_LOST")
                      .contains(code);
    }
    require(legal, "INVALID_CONTRACT", 422);
  }
}

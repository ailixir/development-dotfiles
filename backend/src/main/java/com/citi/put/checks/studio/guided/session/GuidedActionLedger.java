package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.UUID;

/** Constructs admissions from server-owned metadata and validates immutable outcome reports. */
public final class GuidedActionLedger {
  private final GuidedContracts contracts;

  public GuidedActionLedger(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode admit(
      JsonNode session,
      JsonNode proposal,
      String key,
      String policyHash,
      String origin,
      Instant now) {
    ObjectNode operation = contracts.object();
    operation.set("coordinate", proposal.path("coordinate"));
    operation.put("origin", origin);
    operation.set(
        "locator",
        proposal.path("target").has("locator")
            ? proposal.path("target").path("locator")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    operation.set("operation", proposal.path("operation"));
    ObjectNode ledger = contracts.object();
    ledger.put("schemaVersion", 1);
    ledger.put("sessionId", session.path("sessionId").asText());
    ledger.set("coordinate", proposal.path("coordinate").deepCopy());
    ledger.put("idempotencyKey", key);
    ledger.put("requestDigest", GuidedContracts.hash(proposal));
    ledger.set("scopeHash", session.path("scopeHash"));
    ledger.set("observationHash", proposal.path("observationHash"));
    ledger.put("operationHash", GuidedContracts.hash(operation));
    ledger.set("generation", proposal.path("generation"));
    ledger.set("documentId", proposal.path("target").path("documentId"));
    ledger.set("ownerFence", session.path("owner").path("fence"));
    ObjectNode admission = ledger.putObject("admission");
    admission.put("admissionId", UUID.randomUUID().toString());
    admission.set("authorizationId", session.path("runAuthorization").path("authorizationId"));
    admission.put("admittedAt", now.toString());
    admission.put("policyDecisionHash", policyHash);
    ledger.put("state", "ADMITTED");
    ledger.put("dispatchCount", 0);
    ledger.put("outcomeCode", "PENDING");
    ledger.putNull("assertionPassed");
    if (proposal.path("schemaVersion").asInt() == 1) {
      contracts.validate("ledger", ledger);
    }
    return ledger;
  }

  public void verifyReport(ObjectNode stored, ObjectNode report) {
    contracts.validate("ledger", report);
    ObjectNode immutable = report.deepCopy(), original = stored.deepCopy();
    for (String field : new String[] {"state", "dispatchCount", "outcomeCode", "assertionPassed"}) {
      immutable.remove(field);
      original.remove(field);
    }
    require(original.equals(immutable), "IDEMPOTENCY_CONFLICT", 409);
    require(report.path("dispatchCount").asInt() == 1, "INVALID_CONTRACT", 422);
    String state = report.path("state").asText(), code = report.path("outcomeCode").asText();
    require(
        (state.equals("SUCCEEDED")
                    && code.equals("OK")
                    && !report.path("assertionPassed").isBoolean()
                || state.equals("SUCCEEDED")
                    && code.equals("OK")
                    && report.path("assertionPassed").asBoolean())
            || state.equals("FAILED")
                && java.util.Set.of(
                        "ASSERTION_FAILED", "TARGET_CHANGED", "POLICY_DENIED", "TIMEOUT")
                    .contains(code)
            || state.equals("UNKNOWN_OUTCOME") && code.equals("ACK_LOST"),
        "INVALID_CONTRACT",
        422);
  }
}

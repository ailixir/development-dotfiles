package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Prerequisites that V21 (STUDIO-OBS-015) requires of a hand-written guided ledger row, for tests
 * whose subject is a reader of the ledger (audit, recording, acquisition), not the planner.
 *
 * <p>A ledger action is only insertable against the session's live, versioned materialization and a
 * preparation issued for exactly that action's request. This helper writes those two rows in the
 * order production does (preparation, then action, then the preparation's admission link) and
 * stamps the version identity into the documents. It creates no plan, obligation, allocation,
 * manifest or translation-state row, and it disables no trigger: every V21 guard still runs.
 */
public final class GuidedLedgerSeed {
  private static final GuidedContracts C = new GuidedContracts();

  private final JdbcTemplate jdbc;
  private final String sessionId;
  private final String contextId;
  private final int ownerFence;
  private final String inputsHash;

  /**
   * Binds the seed to one session's current (revision 1) materialization.
   *
   * @param inputsHash the {@code authored_inputs_hash} the materialization row was inserted with
   */
  public GuidedLedgerSeed(
      JdbcTemplate jdbc, String sessionId, String contextId, int ownerFence, String inputsHash) {
    this.jdbc = jdbc;
    this.sessionId = sessionId;
    this.contextId = contextId;
    this.ownerFence = ownerFence;
    this.inputsHash = inputsHash;
  }

  /**
   * The closed identity V21 demands of {@code authored_inputs}: exactly {@code schemaVersion},
   * {@code sessionId}, {@code scopeHash}, {@code sourceRevision}, {@code configurationRevision}
   * plus the {@code inputs} array. The caller supplies {@code sessionId}, {@code scopeHash} and any
   * inputs; the hash stored with the row must be {@code GuidedContracts.hash(result)}.
   */
  public static ObjectNode closedInputs(
      ObjectNode inputs, String sourceRevision, String configurationRevision) {
    ObjectNode closed = inputs.deepCopy();
    closed
        .put("schemaVersion", 3)
        .put("sourceRevision", sourceRevision)
        .put("configurationRevision", configurationRevision);
    if (!closed.has("inputs")) {
      closed.putArray("inputs");
    }
    return closed;
  }

  /**
   * Inserts one preparation and its action. {@code document} and {@code proposal} are copied, then
   * stamped with the current context revision and inputs hash (and, on the document, the attempt
   * ordinal, preparation id and request digest); the caller's nodes are not modified.
   */
  public void action(
      String admissionId, String stepId, int ordinal, ObjectNode document, ObjectNode proposal) {
    ObjectNode request =
        proposal.deepCopy().put("contextRevision", 1).put("authoredInputsHash", inputsHash);
    String digest = GuidedContracts.hash(request);
    String preparationId = "prep-" + admissionId;
    ObjectNode proof =
        C.object()
            .put("sessionId", sessionId)
            .put("preparationId", preparationId)
            .put("contextId", contextId)
            .put("ownerFence", ownerFence)
            .put("requestDigest", digest)
            .put("contextRevision", 1)
            .put("authoredInputsHash", inputsHash);
    ObjectNode ledger =
        document
            .deepCopy()
            .put("attemptOrdinal", 0)
            .put("contextRevision", 1)
            .put("preparationId", preparationId)
            .put("authoredInputsHash", inputsHash)
            .put("requestDigest", digest);
    jdbc.update(
        "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,"
            + "request_digest,proof,expires_at) VALUES (?,?,?,?,?,?::jsonb,"
            + "clock_timestamp()+interval '1 hour')",
        sessionId,
        preparationId,
        contextId,
        ownerFence,
        digest,
        proof.toString());
    jdbc.update(
        "INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,document,"
            + "proposal) VALUES (?,?,?,?,?::jsonb,?::jsonb)",
        admissionId,
        sessionId,
        stepId,
        ordinal,
        ledger.toString(),
        request.toString());
    jdbc.update(
        "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id=? AND"
            + " preparation_id=?",
        admissionId,
        sessionId,
        preparationId);
  }

  /** Removes a fixture admission this seed wrote: its preparation link first, then the action. */
  public void retire(String admissionId) {
    jdbc.update(
        "DELETE FROM studio_guided_preparations WHERE session_id=? AND admission_id=?",
        sessionId,
        admissionId);
    jdbc.update(
        "DELETE FROM studio_guided_actions WHERE session_id=? AND admission_id=?",
        sessionId,
        admissionId);
  }
}

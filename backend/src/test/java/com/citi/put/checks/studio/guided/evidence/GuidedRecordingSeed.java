package com.citi.put.checks.studio.guided.evidence;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.GuidedLedgerSeed;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Seeds the guided rows the recording callback reads, straight into PostgreSQL (STUDIO-OBS-013).
 *
 * <p>A session row (the IT session document with a fresh id, state, owner and DB-side {@code
 * expires_at}), its assignment and its V21 versioned materialization (revision 1, closed identity,
 * canonical inputs hash; written {@code live=true} because the V21 action guard admits a ledger row
 * only against the live head, and the recording callback never reads {@code live}), and
 * dispatched/undispatched ledger actions, each with the preparation V21 requires. Time is moved
 * only by choosing the DB-side {@code expires_at} at insert ({@code clock_timestamp() + offset}):
 * the session identity trigger forbids changing it later, and the window under test is judged on
 * the database clock. No trigger is disabled.
 */
final class GuidedRecordingSeed {

  static final ObjectMapper JSON = new ObjectMapper();
  static final String CSI_ID = "CSI-123";
  static final String WORKER = "worker-1";
  static final String SOURCE_REVISION = "1";
  static final String CONFIGURATION_REVISION = "1";
  static final int CONTEXT_REVISION = 1;

  /** The seeded session's first source step (a UUID, as a real start freezes). */
  static final String STEP_ONE = "00000000-0000-4000-8000-0000000000a1";

  private final JdbcTemplate jdbc;

  GuidedRecordingSeed(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** One seeded session. */
  record Seeded(String sessionId, String scopeHash, int fence, String contextId) {}

  static ObjectNode sessionDocument() {
    try (InputStream in =
        GuidedRecordingSeed.class.getResourceAsStream("/studio/guided/session-it-documents.json")) {
      return (ObjectNode) JSON.readTree(in).path("documents").path("session").deepCopy();
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  /**
   * Seeds a session in {@code state} whose DB {@code expires_at} is {@code clock_timestamp() +
   * expiresInSeconds}, owned by {@code worker-1} at {@code fence}.
   */
  Seeded session(String state, long expiresInSeconds, int fence) {
    return session(state, expiresInSeconds, fence, "user-1", CSI_ID);
  }

  Seeded session(String state, long expiresInSeconds, int fence, String principal, String csiId) {
    String id = "rec-" + UUID.randomUUID();
    String scopeHash = sha(id);
    String contextId = "ctx-" + UUID.randomUUID();
    ObjectNode document = sessionDocument();
    document.put("sessionId", id).put("state", state).put("scopeHash", scopeHash);
    ((ObjectNode) document.path("scope")).put("principalId", principal).put("csiId", csiId);
    ((ObjectNode) document.path("runAuthorization"))
        .put("principalId", principal)
        .put("scopeHash", scopeHash);
    ((ObjectNode) document.path("owner"))
        .put("workerId", WORKER)
        .put("fence", fence)
        .put("leaseExpiresAt", "2026-10-08T03:10:00Z");
    // The deadline is a DB-clock instant: read once, then written to the column and the document
    // alike (start() keeps them equal, and the identity trigger forbids changing either later).
    String expiresAt =
        jdbc.queryForObject(
            "SELECT to_char((clock_timestamp() + make_interval(secs => ?)) AT TIME ZONE 'UTC',"
                + "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')",
            String.class,
            (double) expiresInSeconds);
    document.put("expiresAt", expiresAt);
    jdbc.update(
        "INSERT INTO studio_guided_sessions"
            + "(session_id,test_id,principal_id,scope_hash,state,expires_at,document)"
            + " VALUES (?,?,?,?,?,?::timestamptz,?::jsonb)",
        id,
        document.path("testId").asText(),
        principal,
        scopeHash,
        state,
        expiresAt,
        document.toString());
    ObjectNode intent =
        JSON.createObjectNode()
            .put("sessionId", id)
            .put("assignmentId", "asg-" + id)
            .put("workerId", WORKER)
            .put("scopeHash", scopeHash)
            .put("expectedFence", Math.max(0, fence - 1));
    jdbc.update(
        "INSERT INTO studio_guided_assignments"
            + "(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent,live)"
            + " VALUES (?,?,?,?,?,?::jsonb,false)",
        id,
        "asg-" + id,
        scopeHash,
        WORKER,
        Math.max(0, fence - 1),
        intent.toString());
    ObjectNode authored =
        GuidedLedgerSeed.closedInputs(
            JSON.createObjectNode().put("sessionId", id).put("scopeHash", scopeHash),
            SOURCE_REVISION,
            CONFIGURATION_REVISION);
    jdbc.update(
        "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,"
            + "context_revision,materialization_revision,worker_id,owner_fence,source_revision,"
            + "configuration_revision,authored_inputs_hash,authored_inputs,live)"
            + " VALUES (?,?,?,?,1,?,?,?,?,?,?::jsonb,true)",
        id,
        scopeHash,
        contextId,
        CONTEXT_REVISION,
        WORKER,
        fence,
        SOURCE_REVISION,
        CONFIGURATION_REVISION,
        GuidedContracts.hash(authored),
        authored.toString());
    return new Seeded(id, scopeHash, fence, contextId);
  }

  /** One ledger action; {@code dispatched} decides SUCCEEDED/1 versus ADMITTED/0. */
  void action(
      String sessionId, String admissionId, String stepId, int ordinal, boolean dispatched) {
    ObjectNode document =
        JSON.createObjectNode()
            .put("sessionId", sessionId)
            .put("state", dispatched ? "SUCCEEDED" : "ADMITTED")
            .put("dispatchCount", dispatched ? 1 : 0);
    document.putObject("admission").put("admissionId", admissionId);
    document.putObject("coordinate").put("stepId", stepId).put("ordinal", ordinal);
    var head =
        jdbc.queryForMap(
            "SELECT context_id,owner_fence,authored_inputs_hash FROM studio_guided_materializations"
                + " WHERE session_id=?",
            sessionId);
    new GuidedLedgerSeed(
            jdbc,
            sessionId,
            (String) head.get("context_id"),
            ((Number) head.get("owner_fence")).intValue(),
            (String) head.get("authored_inputs_hash"))
        .action(admissionId, stepId, ordinal, document, recordedProposal());
  }

  /** The recorded proposal of a seeded action: a real ledger action always has an operation. */
  private static ObjectNode recordedProposal() {
    ObjectNode proposal = JSON.createObjectNode();
    proposal.putObject("operation").put("kind", "press").put("key", "Enter");
    return proposal;
  }

  /** The 10 bridge identity fields for a seeded session, plus the recording fields. */
  static ObjectNode body(Seeded s, String recordingId, String state, boolean partial) {
    ObjectNode body =
        JSON.createObjectNode()
            .put("schemaVersion", 3)
            .put("sessionId", s.sessionId())
            .put("workerId", WORKER)
            .put("ownerFence", s.fence())
            .put("scopeHash", s.scopeHash())
            .put("contextId", s.contextId())
            .put("contextRevision", CONTEXT_REVISION)
            .put("sourceRevision", SOURCE_REVISION)
            .put("configurationRevision", CONFIGURATION_REVISION);
    body.putObject("versions").put("contract", 3);
    body.put("recordingId", recordingId).put("state", state).put("partial", partial);
    body.putArray("timings");
    return body;
  }

  static ObjectNode action(String admissionId, String stepId, int ordinal, int start, Integer end) {
    ObjectNode item =
        JSON.createObjectNode()
            .put("kind", "action")
            .put("stepId", stepId)
            .put("admissionId", admissionId)
            .put("ordinal", ordinal)
            .put("startMs", start);
    if (end == null) {
      item.putNull("endMs");
    } else {
      item.put("endMs", end);
    }
    return item;
  }

  static ArrayNode timings(JsonNode body) {
    return (ArrayNode) body.path("timings");
  }

  /** Session document and progress as stored, for byte-unchanged assertions. */
  String sessionRow(String sessionId) {
    return jdbc.queryForObject(
        "SELECT state || '|' || document::text || '|' || progress::text"
            + " FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        sessionId);
  }

  static String sha(String value) {
    try {
      return java.util.HexFormat.of()
          .formatHex(
              java.security.MessageDigest.getInstance("SHA-256")
                  .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}

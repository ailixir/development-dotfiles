package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Statement;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * OBS-015's 48 frozen migration cases, on PostgreSQL 15 and actual Flyway/table triggers.
 * Historical confirmed-base fixtures are seeded with replication_role=replica, modeling rows
 * published before V21; every subject operation runs with origin and every deferred constraint is
 * forced before an assertion passes. This never substitutes SQL hashes for worker authentication or
 * storage tests for the separate joined browser/model acceptance matrix.
 */
class GuidedReplayingPrefixMigrationIT {
  private static final PostgreSQLContainer<?> PG =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("obs015_migrations");
  private static final GuidedContracts C = new GuidedContracts();
  private static final String H = "a".repeat(64);
  private static final String STEP1 = "11111111-1111-4111-8111-111111111111";
  private static final String STEP2 = "22222222-2222-4222-8222-222222222222";
  private static final String PRINCIPAL = "data015@example.test";

  @BeforeAll
  static void migrate() {
    PG.start();
    flyway(PG.getJdbcUrl(), null).migrate();
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  private static Flyway flyway(String url, String target) {
    var f = Flyway.configure().dataSource(url, PG.getUsername(), PG.getPassword());
    if (target != null) {
      f.target(target);
    }
    return f.load();
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
  }

  private static String q(String v) {
    return "'" + v.replace("'", "''") + "'";
  }

  private static String j(JsonNode v) {
    return q(v.toString()) + "::jsonb";
  }

  private static void exec(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement()) {
      s.execute(sql);
    }
  }

  private static String scalar(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      assertThat(r.next()).as(sql).isTrue();
      return r.getString(1);
    }
  }

  private static void reject(Connection c, String sql, String reason) throws SQLException {
    Savepoint save = c.setSavepoint();
    try {
      assertThatThrownBy(
              () -> {
                exec(c, sql);
                exec(c, "SET CONSTRAINTS ALL IMMEDIATE");
              })
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(reason);
    } finally {
      c.rollback(save);
      c.releaseSavepoint(save);
    }
  }

  private static String hash(JsonNode v) {
    return GuidedContracts.hash(v);
  }

  private static ObjectNode obj(String json) {
    return (ObjectNode) C.parse(json);
  }

  private static final class Fixture implements AutoCloseable {
    final Connection c;
    final String id;
    final UUID test, base;
    final String oldId;
    final String expiry;
    final ObjectNode doc = C.object();
    final ObjectNode input = C.object();
    final ObjectNode material = C.object();
    ObjectNode authoredSnapshot;
    JsonNode authoredInputs;
    final boolean incremental;
    ObjectNode program;
    ObjectNode request;

    Fixture(boolean prefix) throws Exception {
      this(connect(), prefix, 1);
    }

    Fixture(boolean prefix, int boundary) throws Exception {
      this(connect(), prefix, boundary);
    }

    Fixture(Connection connection, boolean prefix, int boundary) throws Exception {
      this(connection, prefix, boundary, true);
    }

    Fixture(Connection connection, boolean prefix, int boundary, boolean historicalBase)
        throws Exception {
      c = connection;
      c.setAutoCommit(false);
      incremental = prefix;
      id = "d015-" + UUID.randomUUID();
      test = UUID.randomUUID();
      base = UUID.randomUUID();
      oldId = id + "-old";
      expiry = Instant.now().plusSeconds(1800).toString();
      doc.put("sessionId", id)
          .put("testId", test.toString())
          .put("scopeHash", H)
          .put("state", "PREPARING")
          .put("expiresAt", expiry);
      doc.putObject("scope")
          .put("principalId", PRINCIPAL)
          .put("csiId", "D015")
          .put("environmentId", "Development")
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      doc.putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", expiry);
      doc.putObject("limits")
          .put("maxActions", 200)
          .put("maxStatementsPerStep", 8)
          .put("maxObservations", 400);
      doc.putObject("counters")
          .put("modelProposals", 0)
          .put("modelInputTokens", 0)
          .put("modelOutputTokens", 0);
      doc.putObject("runAuthorization");
      doc.putArray("sourceSteps").addObject().put("stepId", STEP1);
      ((ArrayNode) doc.path("sourceSteps")).addObject().put("stepId", STEP2);
      if (prefix) {
        doc.put("baseRevisionId", base.toString())
            .put("firstLearnStepId", boundary == 0 ? STEP1 : STEP2);
      }
      // Historical prerequisite only. Never disable triggers around a subject mutation.
      if (historicalBase) {
        exec(c, "SET LOCAL session_replication_role='replica'");
      }
      exec(
          c,
          "INSERT INTO users(sso_id,name,email) VALUES ('d015','Dara',"
              + q(PRINCIPAL)
              + ") ON CONFLICT(email) DO NOTHING");
      exec(
          c,
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('D015','Data015','test','LOW',"
              + q(PRINCIPAL)
              + ",'Development') ON CONFLICT(id) DO NOTHING");
      var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
      var authored =
          new com.citi.put.checks.studio.dto.AuthoringV2Request(
              2,
              null,
              List.of(
                  new com.citi.put.checks.studio.dto.AuthoringStep(
                      UUID.fromString(STEP1), "First", null),
                  new com.citi.put.checks.studio.dto.AuthoringStep(
                      UUID.fromString(STEP2), "Second", null)));
      authoredSnapshot = mapper.valueToTree(authored);
      authoredInputs =
          mapper.valueToTree(
              com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(
                  authored, java.util.Map.of()));
      exec(
          c,
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by,authoring,"
              + "authoring_revision_inputs)"
              + " VALUES ("
              + q(test.toString())
              + ",'Data015','D015','Development','chromium',"
              + "'[\"First\",\"Second\"]',"
              + q(PRINCIPAL)
              + ","
              + j(authoredSnapshot)
              + ","
              + j(authoredInputs)
              + ")");
      ObjectNode old = doc.deepCopy();
      old.put("sessionId", oldId).put("state", "SUCCEEDED");
      old.remove(List.of("baseRevisionId", "firstLearnStepId"));
      if (historicalBase) {
        insertSession(c, old);
      }
      insertSession(c, doc);
      if (historicalBase) {
        insertSource(oldId);
      }
      insertSource(id);
      exec(
          c,
          "INSERT INTO studio_guided_translation_state(session_id,continuation) VALUES ("
              + q(id)
              + ",'SOURCE_PLAN')");
      if (historicalBase) {
        insertBase(oldId, null);
      }
      insertBase(id, historicalBase ? base.toString() : null);
      ObjectNode artifact = C.object();
      artifact.putObject("profile").put("contract", 3);
      ObjectNode learned = artifact.putObject("learnedPlan");
      ObjectNode a =
          learned
              .putArray("actions")
              .addObject()
              .put("admissionId", "old-admission")
              .put("operationHash", H);
      a.putObject("coordinate").put("stepId", STEP1).put("ordinal", 0);
      a.putObject("operation").put("kind", "click");
      ObjectNode operation =
          artifact
              .putArray("steps")
              .addObject()
              .putArray("operations")
              .addObject()
              .put("guardId", "g");
      operation.set("coordinate", a.path("coordinate"));
      artifact.putArray("guards").addObject().put("guardId", "g");
      if (historicalBase) {
        exec(c, revisionInsert(base, oldId, artifact, declarations(), snapshots(), C.object()));
        exec(
            c,
            "UPDATE ui_tests SET confirmed_revision_id="
                + q(base.toString())
                + " WHERE id="
                + q(test.toString()));
      }
      exec(c, "SET LOCAL session_replication_role='origin'");
      if (prefix) {
        program =
            obj(
                scalar(
                    c,
                    "SELECT studio_015_prefix_program("
                        + q(base.toString())
                        + ", "
                        + (boundary == 0 ? "'[]'" : "'[\"" + STEP1 + "\"]'")
                        + ")::text"));
        exec(
            c,
            "INSERT INTO studio_guided_relearn_plans(session_id,base_revision_id,initial_step_id,"
                + "initial_step_index,prefix_program,prefix_program_hash) VALUES ("
                + q(id)
                + ","
                + q(base.toString())
                + ","
                + q(boundary == 0 ? STEP1 : STEP2)
                + ","
                + boundary
                + ","
                + j(program)
                + ","
                + q(hash(program))
                + ")");
        if (boundary > 0) {
          exec(
              c,
              "UPDATE studio_guided_translation_state SET continuation='REPLAYING_PREFIX' WHERE session_id="
                  + q(id));
        } else {
          exec(
              c,
              "INSERT INTO studio_guided_relearn_switches(session_id,reason,effective_step_id,effective_step_index,"
                  + "next_ordinal,completed_prefix_count,completed_admissions) VALUES ("
                  + q(id)
                  + ",'EMPTY_PREFIX',"
                  + q(STEP1)
                  + ",0,0,0,'[]')");
        }
      }
      state(prefix && boundary > 0 ? "REPLAYING_PREFIX" : "OBSERVING");
      exec(
          c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner}',"
              + "'{\"workerId\":\"worker\",\"fence\":1,\"leaseExpiresAt\":\""
              + expiry
              + "\"}') WHERE session_id="
              + q(id));
      ObjectNode intent =
          C.object()
              .put("sessionId", id)
              .put("assignmentId", id)
              .put("scopeHash", H)
              .put("workerId", "worker")
              .put("expectedFence", 0);
      exec(
          c,
          "INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,"
              + "expected_fence,intent) VALUES ("
              + q(id)
              + ","
              + q(id)
              + ","
              + q(H)
              + ",'worker',0,"
              + j(intent)
              + ")");
      input
          .put("inputId", "input0")
          .put("sourceStepId", STEP1)
          .put("kind", "nonsecretText")
          .put("value", "private-015")
          .put("intendedSlot", "fill.value");
      input
          .putObject("provenance")
          .put("referenceKind", "sourceSpan")
          .put("stepId", STEP1)
          .put("start", 0)
          .put("end", 5)
          .put("sourceRevision", "1");
      material
          .put("schemaVersion", 3)
          .put("sessionId", id)
          .put("scopeHash", H)
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      material.putArray("inputs").add(input.deepCopy());
      exec(
          c,
          "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,"
              + "context_revision,materialization_revision,worker_id,owner_fence,source_revision,"
              + "configuration_revision,authored_inputs_hash,authored_inputs) VALUES ("
              + q(id)
              + ","
              + q(H)
              + ","
              + q(id + "-context")
              + ",1,1,'worker',1,'1','1',"
              + q(hash(material))
              + ","
              + j(material)
              + ")");
      if (!prefix) {
        exec(
            c,
            "UPDATE studio_guided_translation_state SET continuation='MATERIALIZE' WHERE session_id="
                + q(id));
      }
      immediate();
      if (prefix && boundary == 0) {
        exec(
            c,
            "UPDATE studio_guided_translation_state SET continuation='MATERIALIZE' WHERE session_id="
                + q(id));
      }
    }

    /** A scoped same-test view: no writes or ownership of the original connection. */
    Fixture(Fixture original, String sessionId) {
      c = original.c;
      id = sessionId;
      test = original.test;
      base = original.base;
      oldId = original.oldId;
      expiry = original.expiry;
      incremental = false;
      doc.setAll(original.doc.deepCopy());
      doc.put("sessionId", id).put("state", "PREPARING");
      doc.remove(List.of("baseRevisionId", "firstLearnStepId"));
      doc.putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", expiry);
      input.setAll(original.input.deepCopy());
      material.setAll(original.material.deepCopy());
      material.put("sessionId", id);
      authoredSnapshot = original.authoredSnapshot.deepCopy();
      authoredInputs = original.authoredInputs.deepCopy();
    }

    void insertSource(String sid) throws SQLException {
      ObjectNode m =
          C.object()
              .put("testId", test.toString())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("policy", "INPUT-POLICY-01-A");
      m.set("sourceSteps", doc.path("sourceSteps"));
      exec(
          c,
          "INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
              + " VALUES ("
              + q(sid)
              + ","
              + q(H)
              + ","
              + j(m)
              + ","
              + q(hash(m))
              + ")");
    }

    void insertBase(String sid, String confirmed) throws SQLException {
      ObjectNode b =
          C.object()
              .put("sessionId", sid)
              .put("testId", test.toString())
              .put("csiId", "D015")
              .put("resultContractVersion", 3)
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("publicationEpoch", "0")
              .put("originalPrincipalId", PRINCIPAL)
              .put("createdAt", Instant.now().toString());
      if (confirmed == null) {
        b.putNull("confirmedRevisionId");
      } else {
        b.put("confirmedRevisionId", confirmed);
      }
      for (String key :
          List.of(
              "sourceHash",
              "configurationHash",
              "authoringHash",
              "scopeHash",
              "runAuthorizationHash",
              "sourceManifestHash")) {
        b.put(key, H);
      }
      b.put(
          "sourceManifestHash",
          scalar(
              c,
              "SELECT studio_publication_hash(manifest-'configurationValues') FROM studio_guided_source_manifests "
                  + "WHERE session_id="
                  + q(sid)));
      for (String key : List.of("runAuthorization", "initialContext", "replayRequirements")) {
        b.putObject(key);
      }
      b.put("runAuthorizationHash", hash(b.path("runAuthorization")));
      b.put(
          "publicationEpoch",
          scalar(c, "SELECT publication_epoch::text FROM ui_tests WHERE id=" + q(test.toString())));
      exec(
          c,
          "INSERT INTO studio_guided_publication_bases(session_id,test_id,csi_id,scope_hash,document,created_at) "
              + "VALUES ("
              + q(sid)
              + ","
              + q(test.toString())
              + ",'D015',"
              + q(H)
              + ","
              + j(b)
              + ",clock_timestamp())");
    }

    ObjectNode declarations() {
      ObjectNode r = C.object().put("authoringIdentityVersion", 1);
      r.putArray("variables");
      r.putArray("secrets");
      r.putArray("authoredDeclarations");
      return r;
    }

    ObjectNode snapshots() {
      return C.object().put(STEP1, H).put(STEP2, H);
    }

    String revisionInsert(
        UUID rev, String sid, JsonNode artifact, JsonNode refs, JsonNode hashes, JsonNode reuse) {
      return "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,source,"
          + "source_hash,artifact,artifact_hash,artifact_schema_version,configuration,\"references\",provenance,"
          + "created_by,confirmed_by,confirmed_at,confirmation_source,reference_policy,publication_kind,"
          + "guided_session_id,learned_plan_hash,revision_digest,step_snapshot_hashes,step_reuse_provenance,authoring,"
          + "authoring_revision_inputs) VALUES ("
          + q(rev.toString())
          + ","
          + q(test.toString())
          + ",'D015',1,1,'[]',"
          + q(H)
          + ","
          + j(artifact)
          + ","
          + q(hash(artifact))
          + ",3,'{}',"
          + j(refs)
          + ",'{}',"
          + q(PRINCIPAL)
          + ","
          + q(PRINCIPAL)
          + ",clock_timestamp(),'GUIDED_RUN','{}','GUIDED_RUN',"
          + q(sid)
          + ","
          + q(hash(artifact.path("learnedPlan")))
          + ","
          + q(hash(C.object().put("revision", rev.toString())))
          + ","
          + (hashes == null ? "NULL" : j(hashes))
          + ","
          + (reuse == null ? "NULL" : j(reuse))
          + ","
          + j(authoredSnapshot)
          + ","
          + j(authoredInputs)
          + ")";
    }

    void state(String state) throws SQLException {
      exec(
          c,
          "UPDATE studio_guided_sessions SET state="
              + q(state)
              + ",document=jsonb_set(document,'{state}',to_jsonb("
              + q(state)
              + "::text)) WHERE session_id="
              + q(id));
    }

    void immediate() throws SQLException {
      exec(c, "SET CONSTRAINTS ALL IMMEDIATE");
      exec(c, "SET CONSTRAINTS ALL DEFERRED");
    }

    String where() {
      return " WHERE session_id=" + q(id);
    }

    String count(String table) throws SQLException {
      return scalar(c, "SELECT count(*) FROM " + table + where());
    }

    ObjectNode nextInputs() {
      ObjectNode n = material.deepCopy();
      ((ArrayNode) n.path("inputs"))
          .add(
              input
                  .deepCopy()
                  .put("inputId", "input1")
                  .put("sourceStepId", STEP2)
                  .put("value", "suffix-015"));
      return n;
    }

    String appendSql(JsonNode inputs) {
      return "UPDATE studio_guided_materializations SET context_revision=context_revision+1,"
          + "materialization_revision=materialization_revision+1,authored_inputs="
          + j(inputs)
          + ",authored_inputs_hash="
          + q(hash(inputs))
          + where();
    }

    void append() throws SQLException {
      exec(c, appendSql(nextInputs()));
      immediate();
    }

    ObjectNode context() throws SQLException {
      ObjectNode m =
          obj(
              scalar(
                  c, "SELECT to_jsonb(m)::text FROM studio_guided_materializations m" + where()));
      ObjectNode r =
          C.object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("workerId", "worker")
              .put("ownerFence", 1)
              .put("scopeHash", H)
              .put("contextId", id + "-context")
              .put("contextRevision", m.path("context_revision").asInt())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("expiresAt", expiry)
              .put("leaseExpiresAt", expiry)
              .put("authoredInputsHash", m.path("authored_inputs_hash").asText())
              .put("materializationRevision", m.path("materialization_revision").asInt())
              .put("policyHash", H);
      r.putObject("versions").put("contract", 3);
      r.putArray("approvedOrigins");
      r.set("sourceStepIds", C.parse("[\"" + STEP1 + "\",\"" + STEP2 + "\"]"));
      r.putArray("allocations");
      r.putArray("producers");
      r.putArray("consumerEdges");
      r.set("limits", doc.path("limits"));
      r.putObject("applicationPolicy");
      if (incremental) {
        r.set("prefixProgram", program);
        r.put("prefixProgramHash", hash(program));
      }
      return r;
    }

    String issueSql(ObjectNode metadata) throws SQLException {
      ObjectNode full = metadata.deepCopy();
      full.set(
          "authoredInputs",
          C.parse(
              scalar(
                  c,
                  "SELECT authored_inputs::text FROM studio_guided_materializations" + where())));
      return "UPDATE studio_guided_materialization_deliveries SET context_metadata="
          + j(metadata)
          + ",context_hash="
          + q(hash(full))
          + where();
    }

    void issue() throws SQLException {
      exec(c, issueSql(context()));
    }

    String ackSql() {
      return "UPDATE studio_guided_materialization_deliveries SET status='ACKNOWLEDGED',ack=jsonb_build_object("
          + "'schemaVersion',3,'sessionId',session_id,'workerId','worker','ownerFence',1,'scopeHash',"
          + q(H)
          + ",'contextId',"
          + q(id + "-context")
          + ",'contextRevision',context_revision,'sourceRevision','1','configurationRevision','1',"
          + "'materializationRevision',materialization_revision,'authoredInputsHash',authored_inputs_hash,"
          + "'contextHash',context_hash,'deliveryId',delivery_id)"
          + where();
    }

    void ack() throws SQLException {
      exec(c, ackSql());
      immediate();
    }

    ObjectNode proposal(String step, int ordinal) throws SQLException {
      ObjectNode p =
          C.object()
              .put(
                  "contextRevision",
                  Integer.parseInt(
                      scalar(
                          c,
                          "SELECT context_revision FROM studio_guided_materializations" + where())))
              .put(
                  "authoredInputsHash",
                  scalar(
                      c,
                      "SELECT authored_inputs_hash FROM studio_guided_materializations" + where()))
              .put("evidenceHash", H);
      p.putObject("coordinate").put("stepId", step).put("ordinal", ordinal);
      p.putObject("operation").put("kind", "click");
      return p;
    }

    String preparation(String preparationId, ObjectNode proposal, boolean expired)
        throws SQLException {
      ObjectNode p =
          C.object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("preparationId", preparationId)
              .put("contextId", id + "-context")
              .put("ownerFence", 1)
              .put("requestDigest", hash(proposal));
      p.set("contextRevision", proposal.path("contextRevision"));
      p.set("authoredInputsHash", proposal.path("authoredInputsHash"));
      return "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,request_digest,"
          + "proof,expires_at) VALUES ("
          + q(id)
          + ","
          + q(preparationId)
          + ","
          + q(id + "-context")
          + ",1,"
          + q(hash(proposal))
          + ","
          + j(p)
          + ",clock_timestamp()"
          + (expired ? "-" : "+")
          + "interval '1 hour')";
    }

    ObjectNode action(
        String admission,
        String step,
        int ordinal,
        int attempt,
        String state,
        ObjectNode proposal) {
      ObjectNode a =
          C.object()
              .put("sessionId", id)
              .put("state", state)
              .put("dispatchCount", state.equals("ADMITTED") ? 0 : 1)
              .put("ownerFence", 1)
              .put("attemptOrdinal", attempt)
              .put("operationHash", H)
              .put("preparationId", admission + "-prep")
              .put("requestDigest", hash(proposal));
      a.putObject("admission").put("admissionId", admission);
      a.putObject("coordinate").put("stepId", step).put("ordinal", ordinal);
      a.set("contextRevision", proposal.path("contextRevision"));
      a.set("authoredInputsHash", proposal.path("authoredInputsHash"));
      return a;
    }

    String actionSql(ObjectNode a, ObjectNode proposal) {
      return "INSERT INTO studio_guided_actions(session_id,admission_id,step_id,ordinal,attempt_ordinal,document,"
          + "proposal) VALUES ("
          + q(id)
          + ","
          + q(a.path("admission").path("admissionId").asText())
          + ","
          + q(a.path("coordinate").path("stepId").asText())
          + ","
          + a.path("coordinate").path("ordinal").asInt()
          + ","
          + a.path("attemptOrdinal").asInt()
          + ","
          + j(a)
          + ","
          + j(proposal)
          + ")";
    }

    String insertAction(String step, int ordinal, int attempt, String state) throws SQLException {
      String admission = id + "-" + step + "-a" + ordinal + "-" + attempt;
      ObjectNode p = proposal(step, ordinal);
      exec(c, preparation(admission + "-prep", p, false));
      exec(c, actionSql(action(admission, step, ordinal, attempt, state, p), p));
      exec(
          c,
          "UPDATE studio_guided_preparations SET admission_id="
              + q(admission)
              + where()
              + " AND preparation_id="
              + q(admission + "-prep"));
      return admission;
    }

    void request() throws SQLException {
      request(H);
    }

    void request(String issuedEvidenceHash) throws SQLException {
      request =
          C.object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("workerId", "worker")
              .put("ownerFence", 1)
              .put("scopeHash", H)
              .put("contextId", id + "-context")
              .put("contextRevision", 1)
              .put("authoredInputsHash", hash(material))
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("prefixProgramHash", hash(program))
              .put("evidenceHash", issuedEvidenceHash);
      request.putObject("coordinate").put("stepId", STEP1).put("ordinal", 0);
      exec(
          c,
          "INSERT INTO studio_guided_prefix_requests(session_id,request_digest,step_id,ordinal,evidence_hash,document) "
              + "VALUES ("
              + q(id)
              + ","
              + q(hash(request))
              + ","
              + q(STEP1)
              + ",0,"
              + q(issuedEvidenceHash)
              + ","
              + j(request)
              + ")");
    }

    ObjectNode receipt(String admission) throws SQLException {
      ObjectNode r =
          request
              .deepCopy()
              .put("requestDigest", hash(request))
              .put("attemptOrdinal", 0)
              .put("operationHash", H)
              .put("phase", admission == null ? "PRE_ADMISSION" : "ADMITTED_PRE_INVOCATION")
              .put("nativeInvocationStarted", false)
              .put("reason", "TARGET_DRIFT");
      if (admission == null) {
        r.putNull("admissionId").putNull("preparationId");
      } else {
        r.put("admissionId", admission).put("preparationId", admission + "-prep");
      }
      r.put("receiptHash", hash(r));
      return r;
    }

    String receiptSql(ObjectNode r) {
      return "INSERT INTO studio_guided_no_invocation_receipts(session_id,request_digest,admission_id,preparation_id,"
          + "receipt_hash,document) VALUES ("
          + q(id)
          + ","
          + q(r.path("requestDigest").asText())
          + ","
          + (r.path("admissionId").isNull() ? "NULL" : q(r.path("admissionId").asText()))
          + ","
          + (r.path("preparationId").isNull() ? "NULL" : q(r.path("preparationId").asText()))
          + ","
          + q(r.path("receiptHash").asText())
          + ","
          + j(r)
          + ")";
    }

    void switchTo(String reason, String receiptHash, ArrayNode retained) throws SQLException {
      boolean drift = reason.equals("DRIFT");
      String step = drift ? STEP1 : STEP2;
      int index = drift ? 0 : 1;
      exec(
          c,
          "INSERT INTO studio_guided_relearn_switches(session_id,reason,effective_step_id,effective_step_index,"
              + "next_ordinal,completed_prefix_count,drift_receipt_hash,completed_admissions) VALUES ("
              + q(id)
              + ","
              + q(reason)
              + ","
              + q(step)
              + ","
              + index
              + ",0,"
              + index
              + ","
              + (receiptHash == null ? "NULL" : q(receiptHash))
              + ","
              + j(retained)
              + ")");
      state("OBSERVING");
      exec(c, "UPDATE studio_guided_translation_state SET continuation='SOURCE_PLAN'" + where());
    }

    void preAdmissionDrift() throws SQLException {
      request();
      ObjectNode r = receipt(null);
      exec(c, receiptSql(r));
      switchTo("DRIFT", r.path("receiptHash").asText(), C.object().putArray("a"));
      immediate();
    }

    String admittedDrift() throws SQLException {
      request();
      exec(c, "UPDATE studio_guided_prefix_requests SET status='PREPARED'" + where());
      String a = insertAction(STEP1, 0, 0, "DISPATCHING");
      ObjectNode r = receipt(a);
      exec(c, receiptSql(r));
      exec(
          c,
          "UPDATE studio_guided_actions SET document=document||'{\"state\":\"FAILED\","
              + "\"outcomeCode\":\"TARGET_CHANGED\"}'"
              + where());
      switchTo("DRIFT", r.path("receiptHash").asText(), C.object().putArray("a"));
      immediate();
      return a;
    }

    @Override
    public void close() throws SQLException {
      c.rollback();
      c.close();
    }
  }

  private static String secretAuditSql(
      Fixture f, UUID id, UUID release, String admission, String releasedAt, boolean decision) {
    return "INSERT INTO studio_secret_use_audit(id,occurred_at,release_occurred_at,path,row_kind,release_id,"
        + "decision_stage,attempt_id,release_seq,session_id,admission_id,principal_id,csi_id,environment,test_id,"
        + "secret_id,vault_version,coordinate_step_id,coordinate_ordinal,source_reference_id,outcome,usage_outcome) "
        + "VALUES ("
        + q(id.toString())
        + ","
        + (decision ? q(releasedAt) : "clock_timestamp()")
        + ","
        + q(releasedAt)
        + ",'GUIDED',"
        + q(decision ? "RELEASE" : "USAGE")
        + ","
        + q(release.toString())
        + ","
        + (decision ? "'DISPATCH'" : "NULL")
        + ","
        + q(f.id + ":1")
        + ",1,"
        + q(f.id)
        + ","
        + q(admission)
        + ","
        + q(PRINCIPAL)
        + ",'D015','Development',"
        + q(f.test.toString())
        + ",'LOGIN_PASSWORD','version1',"
        + q(STEP1)
        + ",0,'cfg-secret','RESOLVED',"
        + (decision ? "NULL" : "'OK'")
        + ")";
  }

  private static void insertSession(Connection c, ObjectNode d) throws SQLException {
    exec(
        c,
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,expires_at,document) "
            + "VALUES ("
            + q(d.path("sessionId").asText())
            + ","
            + q(d.path("testId").asText())
            + ","
            + q(PRINCIPAL)
            + ","
            + q(H)
            + ","
            + q(d.path("state").asText())
            + ","
            + q(d.path("expiresAt").asText())
            + ","
            + j(d)
            + ")");
  }

  @Test
  void freshV1ToV21HasExpectedHeadDescriptionAndNoPendingMigrations() throws Exception {
    assertThat(flyway(PG.getJdbcUrl(), null).info().pending()).isEmpty();
    try (Connection c = connect()) {
      assertThat(scalar(c, "SELECT max(version::int) FROM flyway_schema_history")).isEqualTo("22");
      assertThat(scalar(c, "SELECT description FROM flyway_schema_history WHERE version='21'"))
          .isEqualTo("guided session replaying prefix");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL"))
          .isEqualTo("22");
    }
  }

  @Test
  void populatedV20UpgradePreservesExistingDocumentBytesAndAddsExactHistory() throws Exception {
    String database = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
    String url = PG.getJdbcUrl().substring(0, PG.getJdbcUrl().lastIndexOf('/') + 1) + database;
    try (Connection admin = connect()) {
      exec(admin, "CREATE DATABASE " + database);
      try {
        flyway(url, "20").migrate();
        try (Connection c = DriverManager.getConnection(url, PG.getUsername(), PG.getPassword());
            Fixture f = new Fixture(c, false, 1, false)) {
          // A genuine V20 publication transaction: no historical seeding bypass in this fixture.
          exec(
              c,
              "UPDATE studio_guided_materializations SET materialization_revision=7" + f.where());
          legacyV20Action(f, STEP1, "legacy-first");
          legacyV20Action(f, STEP2, "legacy-second");
          ObjectNode artifact = effectiveArtifact(f);
          UUID revision = UUID.randomUUID();
          ObjectNode legacyReferences = C.object();
          legacyReferences.putArray("variables");
          legacyReferences.putArray("secrets");
          exec(c, f.revisionInsert(revision, f.id, artifact, legacyReferences, null, null));
          ObjectNode publication = publication(f, revision, artifact, false);
          exec(c, publicationSql(f, publication, artifact));
          f.immediate();
          exec(
              c,
              "UPDATE ui_tests SET confirmed_revision_id="
                  + q(revision.toString())
                  + " WHERE id="
                  + q(f.test.toString()));
          UUID policy = installPolicyAndRecording(f);
          java.util.Map<String, String> predicates = new java.util.LinkedHashMap<>();
          predicates.put("studio_guided_sessions", "session_id=" + q(f.id));
          predicates.put("studio_guided_materializations", "session_id=" + q(f.id));
          predicates.put("ui_test_revisions", "id=" + q(revision.toString()));
          predicates.put("ui_tests", "id=" + q(f.test.toString()));
          predicates.put("studio_guided_publications", "session_id=" + q(f.id));
          predicates.put("studio_guided_publication_attempts", "session_id=" + q(f.id));
          predicates.put("studio_guided_policies", "policy_id=" + q(policy.toString()));
          predicates.put("studio_guided_policy_versions", "policy_id=" + q(policy.toString()));
          predicates.put("studio_guided_policy_approvals", "policy_id=" + q(policy.toString()));
          predicates.put("studio_guided_session_policies", "session_id=" + q(f.id));
          predicates.put("studio_guided_session_recordings", "session_id=" + q(f.id));
          java.util.Map<String, String> before = new java.util.LinkedHashMap<>();
          for (var entry : predicates.entrySet()) {
            before.put(
                entry.getKey(),
                scalar(
                    c,
                    "SELECT to_jsonb(existing_row)::text FROM "
                        + entry.getKey()
                        + " existing_row WHERE "
                        + entry.getValue()));
          }
          String oldActions =
              scalar(
                  c,
                  "SELECT jsonb_agg(to_jsonb(a) ORDER BY admission_id)::text FROM studio_guided_actions a"
                      + f.where());
          assertThat(before).hasSize(11);
          c.commit();
          flyway(url, null).migrate();
          flyway(url, null).validate();
          for (var entry : predicates.entrySet()) {
            assertThat(
                    scalar(
                        c,
                        "SELECT to_jsonb(existing_row)::text FROM "
                            + entry.getKey()
                            + " existing_row WHERE "
                            + entry.getValue()))
                .as("V20->V21 preserves all existing columns in %s", entry.getKey())
                .isEqualTo(before.get(entry.getKey()));
          }
          assertThat(
                  scalar(
                      c,
                      "SELECT input_count||':'||materialization_revision FROM studio_guided_materialization_versions"
                          + f.where()))
              .isEqualTo("1:7");
          assertThat(
                  scalar(
                      c,
                      "SELECT authored_inputs_hash=studio_publication_hash(authored_inputs) FROM "
                          + "studio_guided_materialization_snapshots"
                          + f.where()))
              .isEqualTo("t");
          assertThat(
                  scalar(
                      c,
                      "SELECT jsonb_agg(to_jsonb(a)-'attempt_ordinal' ORDER BY admission_id)::text FROM "
                          + "studio_guided_actions a"
                          + f.where()))
              .isEqualTo(oldActions);
          assertThat(
                  scalar(
                      c,
                      "SELECT count(*) FROM studio_guided_actions"
                          + f.where()
                          + " AND attempt_ordinal=0"))
              .isEqualTo("2");
          assertThat(f.count("studio_guided_materialization_inputs")).isEqualTo("1");
          assertThat(f.count("studio_guided_materialization_deliveries")).isEqualTo("0");
          assertThat(
                  scalar(
                      c,
                      "SELECT r.id=p.revision_id FROM ui_test_revisions r JOIN studio_guided_publications p ON "
                          + "p.session_id=r.guided_session_id WHERE r.id="
                          + q(revision.toString())))
              .isEqualTo("t");
          assertThat(
                  scalar(
                      c,
                      "SELECT NOT(\"references\" ? 'authoringIdentityVersion') AND step_snapshot_hashes IS NULL AND "
                          + "step_reuse_provenance IS NULL FROM ui_test_revisions WHERE id="
                          + q(revision.toString())))
              .isEqualTo("t");
          String candidate = startCandidate(f, revision);
          ObjectNode unavailable =
              C.object()
                  .put("schemaVersion", 3)
                  .put("baseRevisionId", revision.toString())
                  .put(
                      "baseRevisionDigest",
                      scalar(
                          c,
                          "SELECT revision_digest FROM ui_test_revisions WHERE id="
                              + q(revision.toString())));
          unavailable.putArray("sourceStepIds").add(STEP1);
          unavailable.putArray("actions");
          reject(
              c,
              "INSERT INTO studio_guided_relearn_plans(session_id,base_revision_id,initial_step_id,initial_step_index,"
                  + "prefix_program,prefix_program_hash) VALUES ("
                  + q(candidate)
                  + ","
                  + q(revision.toString())
                  + ","
                  + q(STEP2)
                  + ",1,"
                  + j(unavailable)
                  + ","
                  + q(hash(unavailable))
                  + ")",
              "incremental base or start boundary invalid");
          assertThat(
                  scalar(
                      c,
                      "SELECT NOT(\"references\" ? 'authoringIdentityVersion') AND step_snapshot_hashes IS NULL FROM "
                          + "ui_test_revisions WHERE id="
                          + q(revision.toString())))
              .isEqualTo("t");
        }
      } finally {
        exec(admin, "DROP DATABASE " + database + " WITH (FORCE)");
      }
    }
  }

  private static void legacyV20Action(Fixture f, String step, String suffix) throws SQLException {
    String admission = f.id + "-" + suffix;
    ObjectNode proposal = f.proposal(step, 0);
    exec(f.c, f.preparation(admission + "-prep", proposal, false));
    ObjectNode action = f.action(admission, step, 0, 0, "SUCCEEDED", proposal);
    // V20 has semantic coordinate uniqueness but no attempt_ordinal column yet.
    exec(
        f.c,
        "INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,document,proposal) VALUES ("
            + q(admission)
            + ","
            + q(f.id)
            + ","
            + q(step)
            + ",0,"
            + j(action)
            + ","
            + j(proposal)
            + ")");
    exec(
        f.c,
        "UPDATE studio_guided_preparations SET admission_id="
            + q(admission)
            + f.where()
            + " AND preparation_id="
            + q(admission + "-prep"));
  }

  @Test
  void frozenV1ToV20ResourceChecksumsRemainUnchanged() throws Exception {
    JsonNode manifest =
        C.parse(
            Files.readString(
                Path.of("../docs/qa/evidence/STUDIO-OBS-015/final-design/data/manifest.json")));
    var fields = manifest.path("frozenProductionMigrationHashes").fields();
    int checked = 0;
    while (fields.hasNext()) {
      var e = fields.next();
      assertThat(
              HexFormat.of()
                  .formatHex(
                      MessageDigest.getInstance("SHA-256")
                          .digest(Files.readAllBytes(Path.of("..").resolve(e.getKey())))))
          .as(e.getKey())
          .isEqualTo(e.getValue().asText());
      checked++;
    }
    assertThat(checked).isEqualTo(20);
    flyway(PG.getJdbcUrl(), null).validate();
  }

  @Test
  void replayingPrefixInsertRequiresRealProgramAndContinuation() throws Exception {
    try (Fixture f = new Fixture(true)) {
      assertThat(scalar(f.c, "SELECT studio_015_prefix_pending(" + q(f.id) + ")")).isEqualTo("t");
      assertThat(scalar(f.c, "SELECT state FROM studio_guided_sessions" + f.where()))
          .isEqualTo("REPLAYING_PREFIX");
      assertThat(
              scalar(f.c, "SELECT continuation FROM studio_guided_translation_state" + f.where()))
          .isEqualTo("REPLAYING_PREFIX");
      assertThat(
              scalar(
                  f.c,
                  "SELECT prefix_program=studio_015_prefix_program(base_revision_id,prefix_program->'sourceStepIds') "
                      + "FROM studio_guided_relearn_plans"
                      + f.where()))
          .isEqualTo("t");
      ObjectNode bad =
          f.doc.deepCopy().put("sessionId", f.id + "-bad").put("state", "REPLAYING_PREFIX");
      reject(
          f.c,
          "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,expires_at,document) "
              + "VALUES ("
              + q(f.id + "-bad")
              + ","
              + q(f.test.toString())
              + ","
              + q(PRINCIPAL)
              + ","
              + q(H)
              + ",'REPLAYING_PREFIX',"
              + q(f.expiry)
              + ","
              + j(bad)
              + ")",
          "prefix mode missing durable program");
    }
  }

  @Test
  void unknownStateAndUnknownContinuationAreRefused() throws Exception {
    try (Fixture f = new Fixture(false)) {
      reject(
          f.c,
          "UPDATE studio_guided_sessions SET state='MAGIC',document=jsonb_set(document,'{state}','\"MAGIC\"')"
              + f.where(),
          "ck_guided_session_state_v3");
      reject(
          f.c,
          "UPDATE studio_guided_translation_state SET continuation='MAGIC'" + f.where(),
          "continuation_check");
    }
  }

  @Test
  void oldTerminalCannotReopenPrefix() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.state("FAILED");
      reject(
          f.c,
          "UPDATE studio_guided_sessions SET state='REPLAYING_PREFIX',document=jsonb_set(document,'{state}',"
              + "'\"REPLAYING_PREFIX\"')"
              + f.where(),
          "terminal state is immutable");
    }
  }

  @Test
  void prefixCallbacksCannotChangeToGenericActingObservingOrProposing() throws Exception {
    try (Fixture f = new Fixture(true)) {
      for (String state : List.of("ACTING", "OBSERVING", "PROPOSING", "FINALIZING")) {
        reject(
            f.c,
            "UPDATE studio_guided_sessions SET state="
                + q(state)
                + ",document=jsonb_set(document,'{state}',to_jsonb("
                + q(state)
                + "::text))"
                + f.where(),
            "prefix callback cannot escape mode");
      }
    }
  }

  @Test
  void preparingWithPendingPrefixCannotReserveModelOrIncrementCounters() throws Exception {
    try (Fixture f = new Fixture(true)) {
      // A pending replay program, rather than public state alone, fences PREPARING.
      exec(f.c, "SET LOCAL session_replication_role='replica'");
      f.state("PREPARING");
      exec(f.c, "SET LOCAL session_replication_role='origin'");
      reject(
          f.c,
          "INSERT INTO studio_guided_model_attempts(session_id) VALUES (" + q(f.id) + ")",
          "model reservation refused");
      for (String counter : List.of("modelProposals", "modelInputTokens", "modelOutputTokens")) {
        reject(
            f.c,
            "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{counters,"
                + counter
                + "}','1')"
                + f.where(),
            "model counters frozen during prefix");
      }
    }
  }

  @Test
  void explicitPrefixStateWithoutProgramCannotInsertModelAttempt() throws Exception {
    try (Fixture f = new Fixture(false)) {
      exec(f.c, "SET LOCAL session_replication_role='replica'");
      f.state("REPLAYING_PREFIX");
      exec(f.c, "SET LOCAL session_replication_role='origin'");
      reject(
          f.c,
          "INSERT INTO studio_guided_model_attempts(session_id) VALUES (" + q(f.id) + ")",
          "model reservation refused");
    }
  }

  @Test
  void concurrentPrefixEntryAndModelReservationSerializeBothOrders() throws Exception {
    for (boolean prefixFirst : List.of(true, false)) {
      try (Fixture f = new Fixture(false)) {
        String candidate = startCandidate(f);
        ObjectNode program =
            obj(
                scalar(
                    f.c,
                    "SELECT studio_015_prefix_program("
                        + q(f.base.toString())
                        + ", '[\""
                        + STEP1
                        + "\"]')::text"));
        String enter =
            "INSERT INTO studio_guided_relearn_plans(session_id,base_revision_id,initial_step_id,"
                + "initial_step_index,prefix_program,prefix_program_hash) VALUES ("
                + q(candidate)
                + ","
                + q(f.base.toString())
                + ","
                + q(STEP2)
                + ",1,"
                + j(program)
                + ","
                + q(hash(program))
                + ")";
        f.c.commit();
        try (Connection other = connect()) {
          other.setAutoCommit(false);
          exec(other, "SET LOCAL lock_timeout='200ms'");
          exec(f.c, "SET LOCAL lock_timeout='200ms'");
          if (prefixFirst) {
            exec(f.c, enter);
            exec(
                f.c,
                "UPDATE studio_guided_translation_state SET continuation='REPLAYING_PREFIX' WHERE session_id="
                    + q(candidate));
            assertThatThrownBy(() -> exec(other, modelReservation(candidate)))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("lock timeout");
            other.rollback();
            // Rolling back the prefix start releases its real session lock and durable predicate.
            f.c.rollback();
            exec(other, modelReservation(candidate));
            other.commit();
          } else {
            // A genuine complete reservation, not an artificial SELECT FOR UPDATE, wins first.
            exec(other, modelReservation(candidate));
            assertThatThrownBy(() -> exec(f.c, enter))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("lock timeout");
            f.c.rollback();
            other.commit();
            reject(f.c, enter, "incremental base or start boundary invalid");
          }
          assertThat(
                  scalar(
                      f.c,
                      "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id="
                          + q(candidate)))
              .isEqualTo("1");
          assertThat(
                  scalar(
                      f.c,
                      "SELECT count(*) FROM studio_guided_relearn_plans WHERE session_id="
                          + q(candidate)))
              .isEqualTo("0");
          assertThat(
                  scalar(
                      f.c,
                      "SELECT state FROM studio_guided_sessions WHERE session_id=" + q(candidate)))
              .isEqualTo("PREPARING");
        }
      }
    }
  }

  /** Sets up a fresh pre-assignment session with a captured/pinned immutable base prerequisite. */
  private static String startCandidate(Fixture f) throws SQLException {
    return startCandidate(f, f.base);
  }

  private static String startCandidate(Fixture f, UUID pinnedBase) throws SQLException {
    String candidate = f.id + "-candidate";
    ObjectNode d =
        f.doc
            .deepCopy()
            .put("sessionId", candidate)
            .put("state", "PREPARING")
            .put("baseRevisionId", pinnedBase.toString())
            .put("firstLearnStepId", STEP2);
    insertSession(f.c, d);
    f.insertSource(candidate);
    // This pre-effect capture uses the actual V15 owner/source/pin guard under origin.
    f.insertBase(candidate, pinnedBase.toString());
    exec(
        f.c,
        "INSERT INTO studio_guided_translation_state(session_id) VALUES (" + q(candidate) + ")");
    return candidate;
  }

  private static String modelReservation(String session) {
    ObjectNode identity =
        C.object()
            .put("sessionId", session)
            .put("attemptId", "model-attempt")
            .put("requestId", "model-request")
            .put("kind", "SOURCE_PLAN")
            .put("planRevision", 0)
            .put("inputCeiling", 10)
            .put("outputCeiling", 10)
            .put("scopeHash", H);
    identity.putObject("owner").put("workerId", "unclaimed").put("fence", 0);
    return "INSERT INTO studio_guided_model_attempts(session_id,attempt_id,request_id,attempt_number,kind,identity,"
        + "request_digest,translator_id,lease_until,reservation_key,settlement_key,status) VALUES ("
        + q(session)
        + ",'model-attempt','model-request',1,'SOURCE_PLAN',"
        + j(identity)
        + ","
        + q(hash(identity))
        + ",'test-translator',clock_timestamp()+interval '1 minute','reservation','settlement','RESERVED')";
  }

  @Test
  void initialMaterializationCreatesOneHeaderAndNormalizedInputEntries() throws Exception {
    try (Fixture f = new Fixture(false)) {
      assertThat(f.count("studio_guided_materialization_versions")).isEqualTo("1");
      assertThat(f.count("studio_guided_materialization_inputs")).isEqualTo("1");
      assertThat(
              scalar(
                  f.c,
                  "SELECT input_count||':'||context_revision||':'||materialization_revision FROM "
                      + "studio_guided_materialization_versions"
                      + f.where()))
          .isEqualTo("1:1:1");
      assertThat(f.count("studio_guided_materialization_deliveries")).isEqualTo("0");
    }
  }

  @Test
  void appendPreservesEveryPriorEntryAndBindsPreviousHash() throws Exception {
    try (Fixture f = new Fixture(false)) {
      String old =
          scalar(
              f.c, "SELECT document::text FROM studio_guided_materialization_inputs" + f.where());
      f.append();
      assertThat(
              scalar(
                  f.c,
                  "SELECT document::text FROM studio_guided_materialization_inputs"
                      + f.where()
                      + " AND input_ordinal=0"))
          .isEqualTo(old);
      assertThat(
              scalar(
                  f.c,
                  "SELECT previous_inputs_hash FROM studio_guided_materialization_versions"
                      + f.where()
                      + " AND context_revision=2"))
          .isEqualTo(hash(f.material));
      assertThat(
              scalar(
                  f.c,
                  "SELECT authored_inputs::text FROM studio_guided_materialization_snapshots"
                      + f.where()
                      + " AND context_revision=1"))
          .isEqualTo(scalar(f.c, "SELECT " + j(f.material) + "::text"));
    }
  }

  @Test
  void appendNoopReturnsExistingVersionWithoutWrite() throws Exception {
    try (Fixture f = new Fixture(false)) {
      String before =
          scalar(
              f.c,
              "SELECT jsonb_agg(to_jsonb(v))::text FROM studio_guided_materialization_versions v"
                  + f.where());
      exec(
          f.c,
          "UPDATE studio_guided_materializations SET authored_inputs=authored_inputs,"
              + "authored_inputs_hash=authored_inputs_hash"
              + f.where());
      f.immediate();
      assertThat(
              scalar(
                  f.c,
                  "SELECT jsonb_agg(to_jsonb(v))::text FROM studio_guided_materialization_versions v"
                      + f.where()))
          .isEqualTo(before);
      assertThat(f.count("studio_guided_materialization_deliveries")).isEqualTo("0");
    }
  }

  @Test
  void appendRefusesMutationDeletionCollisionGapOrOverflow() throws Exception {
    try (Fixture f = new Fixture(false)) {
      ObjectNode mutate = f.nextInputs();
      ((ObjectNode) mutate.path("inputs").get(0)).put("value", "rewritten");
      reject(f.c, f.appendSql(mutate), "materialization append refused");
      ObjectNode deleted = f.material.deepCopy();
      deleted.putArray("inputs");
      reject(f.c, f.appendSql(deleted), "materialization append refused");
      ObjectNode collision = f.nextInputs();
      ((ObjectNode) collision.path("inputs").get(1)).put("inputId", "input0");
      reject(f.c, f.appendSql(collision), "duplicate key");
      reject(
          f.c,
          f.appendSql(f.nextInputs()).replace("context_revision+1", "context_revision+2"),
          "materialization append refused");
      reject(
          f.c,
          "UPDATE studio_guided_materializations SET materialization_revision=2147483647+1"
              + f.where(),
          "integer out of range");
      assertThat(f.count("studio_guided_materialization_versions")).isEqualTo("1");
      ObjectNode maximum = f.material.deepCopy();
      ArrayNode inputs = (ArrayNode) maximum.path("inputs");
      for (int i = 1; i < 200; i++) {
        inputs.add(f.input.deepCopy().put("inputId", "count-" + i));
      }
      ObjectNode excessive = maximum.deepCopy();
      ((ArrayNode) excessive.path("inputs")).add(f.input.deepCopy().put("inputId", "count-200"));
      reject(f.c, f.appendSql(excessive), "materialization append refused");
      exec(f.c, f.appendSql(maximum));
      f.immediate();
      assertThat(f.count("studio_guided_materialization_inputs")).isEqualTo("200");
    }
  }

  @Test
  void canonicalByteBoundsAcceptSupportedUnicodeAndControlEscapes() throws Exception {
    for (int bytes : List.of(32768, 32769)) {
      try (Fixture f = new Fixture(false)) {
        ObjectNode next = f.nextInputs();
        ObjectNode entry = (ObjectNode) next.path("inputs").get(1);
        fitCanonicalInput(entry, bytes);
        if (bytes == 32768) {
          exec(f.c, f.appendSql(next));
          f.immediate();
          assertThat(
                  scalar(
                      f.c,
                      "SELECT octet_length(convert_to(studio_publication_canonical(document),'UTF8')) FROM "
                          + "studio_guided_materialization_inputs"
                          + f.where()
                          + " AND input_ordinal=1"))
              .isEqualTo("32768");
          assertThat(
                  scalar(
                      f.c,
                      "SELECT document->>'value' FROM studio_guided_materialization_inputs"
                          + f.where()
                          + " AND input_ordinal=1"))
              .isEqualTo(entry.path("value").asText());
        } else {
          reject(f.c, f.appendSql(next), "check constraint");
          assertThat(f.count("studio_guided_materialization_inputs")).isEqualTo("1");
        }
      }
    }
    for (int bytes : List.of(1048576, 1048577)) {
      try (Fixture f = new Fixture(false)) {
        ObjectNode next = f.material.deepCopy();
        ArrayNode inputs = (ArrayNode) next.path("inputs");
        for (int i = 1; i <= 32; i++) {
          ObjectNode entry =
              f.input.deepCopy().put("inputId", "bounded-" + i).put("sourceStepId", STEP2);
          fitCanonicalInput(entry, 32768);
          inputs.add(entry);
        }
        ObjectNode last = (ObjectNode) inputs.get(inputs.size() - 1);
        int remove = canonicalBytes(next) - bytes;
        String value = last.path("value").asText();
        assertThat(remove).isBetween(0, value.length() - 16);
        last.put("value", value.substring(0, value.length() - remove));
        assertThat(canonicalBytes(next)).isEqualTo(bytes);
        if (bytes == 1048576) {
          exec(f.c, f.appendSql(next));
          f.immediate();
          assertThat(
                  scalar(
                      f.c,
                      "SELECT octet_length(convert_to(studio_publication_canonical(authored_inputs),'UTF8')) FROM "
                          + "studio_guided_materializations"
                          + f.where()))
              .isEqualTo("1048576");
          assertThat(f.count("studio_guided_materialization_inputs")).isEqualTo("33");
        } else {
          reject(f.c, f.appendSql(next), "materialization append refused");
          assertThat(f.count("studio_guided_materialization_versions")).isEqualTo("1");
        }
      }
    }
  }

  private static int canonicalBytes(JsonNode node) {
    return GuidedContracts.canonical(node).getBytes(StandardCharsets.UTF_8).length;
  }

  private static void fitCanonicalInput(ObjectNode input, int bytes) {
    String prefix = "界é\n\t\\\"\u0001";
    input.put("value", prefix);
    int padding = bytes - canonicalBytes(input);
    assertThat(padding).isPositive();
    input.put("value", prefix + "x".repeat(padding));
    assertThat(canonicalBytes(input)).isEqualTo(bytes);
  }

  @Test
  void appendRefusesAdmittedDispatchingUnknownAndUnexpiredUnconsumedPreparation() throws Exception {
    for (String state : List.of("ADMITTED", "DISPATCHING", "UNKNOWN_OUTCOME")) {
      try (Fixture f = new Fixture(false)) {
        f.insertAction(STEP1, 0, 0, state);
        reject(f.c, f.appendSql(f.nextInputs()), "materialization append refused");
      }
    }
    try (Fixture f = new Fixture(false)) {
      exec(f.c, f.preparation("live-prep", f.proposal(STEP1, 0), false));
      reject(f.c, f.appendSql(f.nextInputs()), "materialization append refused");
    }
  }

  @Test
  void appendVersusPrepareAdmitConsumeSerializesWithoutStaleExecution() throws Exception {
    try (Fixture f = new Fixture(false)) {
      ObjectNode old = f.proposal(STEP1, 0);
      exec(f.c, f.preparation("expired", old, true));
      f.c.commit();
      try (Connection other = connect()) {
        other.setAutoCommit(false);
        exec(other, "SET LOCAL lock_timeout='200ms'");
        f.append();
        assertThatThrownBy(() -> exec(other, f.preparation("racing", old, false)))
            .isInstanceOf(SQLException.class)
            .hasMessageContaining("lock timeout");
        other.rollback();
        f.c.commit();
        reject(
            other, f.preparation("stale", old, false), "preparation version or delivery is stale");
      }
    }
  }

  @Test
  void appendCommitCreatesPendingDeliveryAtomically() throws Exception {
    try (Fixture f = new Fixture(false)) {
      Savepoint before = f.c.setSavepoint();
      f.append();
      assertThat(f.count("studio_guided_materialization_deliveries")).isEqualTo("1");
      assertThat(
              scalar(
                  f.c,
                  "SELECT status||':'||context_revision FROM studio_guided_materialization_deliveries"
                      + f.where()))
          .isEqualTo("PENDING:2");
      f.c.rollback(before);
      assertThat(f.count("studio_guided_materialization_versions")).isEqualTo("1");
      assertThat(f.count("studio_guided_materialization_deliveries")).isEqualTo("0");
    }
  }

  @Test
  void pendingDeliveryFencesActionsModelReservationsAndMetadataBumps() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.append();
      reject(
          f.c,
          f.preparation("pending", f.proposal(STEP1, 0), false),
          "preparation version or delivery is stale");
      reject(
          f.c,
          "INSERT INTO studio_guided_model_attempts(session_id) VALUES (" + q(f.id) + ")",
          "model reservation refused");
      reject(
          f.c,
          "UPDATE studio_guided_materializations SET materialization_revision=materialization_revision+1"
              + f.where(),
          "context delivery pending");
      reject(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{counters,modelProposals}','1')"
              + f.where(),
          "model counters frozen until context ACK");
    }
  }

  @Test
  void issuedContextMetadataAndHashAreWriteOnceAcrossRetryAndLeaseRenewal() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.append();
      f.issue();
      String issued =
          scalar(
              f.c,
              "SELECT context_metadata::text||context_hash FROM studio_guided_materialization_deliveries"
                  + f.where());
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(("
              + "clock_timestamp()+interval '2 hours')::text))"
              + f.where());
      ObjectNode changed =
          f.context().put("leaseExpiresAt", Instant.now().plusSeconds(7200).toString());
      reject(f.c, f.issueSql(changed), "delivery ACK identity invalid");
      f.ack();
      assertThat(
              scalar(
                  f.c,
                  "SELECT context_metadata::text||context_hash FROM studio_guided_materialization_deliveries"
                      + f.where()))
          .isEqualTo(issued);
    }
  }

  @Test
  void issuedContextRequiresExactImmutableProgramPairForEveryPinnedBaseSession() throws Exception {
    try (Fixture f = new Fixture(true, 0)) {
      f.append();
      ObjectNode missing = f.context();
      missing.remove("prefixProgram");
      reject(f.c, f.issueSql(missing), "prefix program identity invalid");
      ObjectNode changed = f.context();
      changed.set("prefixProgram", C.object());
      changed.put("prefixProgramHash", hash(C.object()));
      reject(f.c, f.issueSql(changed), "prefix program identity invalid");
      f.issue();
      f.ack();
      assertThat(
              scalar(
                  f.c,
                  "SELECT context_metadata->'prefixProgram'=p.prefix_program AND "
                      + "context_metadata->>'prefixProgramHash'=p.prefix_program_hash FROM "
                      + "studio_guided_materialization_deliveries d JOIN studio_guided_relearn_plans p "
                      + "USING(session_id) WHERE d.session_id="
                      + q(f.id)))
          .isEqualTo("t");
      assertThat(f.program.path("actions")).isEmpty();
      assertThat(f.program.path("sourceStepIds")).isEmpty();
    }
  }

  @Test
  void ordinaryContextRejectsHalfOrForgedProgramPair() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.append();
      for (boolean half : List.of(true, false)) {
        ObjectNode m = f.context();
        m.put("prefixProgramHash", H);
        if (!half) {
          m.putObject("prefixProgram");
        }
        reject(f.c, f.issueSql(m), "prefix program identity invalid");
      }
      f.issue();
      f.ack();
      assertThat(
              scalar(
                  f.c,
                  "SELECT NOT(context_metadata ? 'prefixProgram') AND NOT(context_metadata ? 'prefixProgramHash') FROM "
                      + "studio_guided_materialization_deliveries"
                      + f.where()))
          .isEqualTo("t");
    }
  }

  @Test
  void ackRequiresExactVersionHashContextHashBirthMetadataOwnerAndLiveOriginalLease()
      throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.append();
      f.issue();
      String ack = f.ackSql();
      for (String field :
          List.of(
              "contextHash",
              "authoredInputsHash",
              "workerId",
              "contextId",
              "scopeHash",
              "sourceRevision",
              "configurationRevision")) {
        String forged = ack.replace("ack=jsonb_build_object(", "ack=jsonb_build_object(");
        int where = forged.indexOf(" WHERE session_id");
        forged =
            forged.substring(0, where)
                + "||jsonb_build_object("
                + q(field)
                + ",'forged')"
                + forged.substring(where);
        reject(f.c, forged, "delivery ACK identity invalid");
      }
      for (String field : List.of("contextRevision", "materializationRevision", "ownerFence")) {
        int where = ack.indexOf(" WHERE session_id");
        reject(
            f.c,
            ack.substring(0, where)
                + "||jsonb_build_object("
                + q(field)
                + ",999)"
                + ack.substring(where),
            "delivery ACK identity invalid");
      }
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(("
              + "clock_timestamp()-interval '1 second')::text))"
              + f.where());
      reject(f.c, ack, "delivery ACK identity invalid");
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb("
              + q(f.expiry)
              + "::text))"
              + f.where());
      f.ack();
      assertThat(
              scalar(
                  f.c, "SELECT status FROM studio_guided_materialization_deliveries" + f.where()))
          .isEqualTo("ACKNOWLEDGED");
    }
    try (Fixture f = new Fixture(false)) {
      f.append();
      String expired = Instant.now().minusSeconds(1).toString();
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb("
              + q(expired)
              + "::text))"
              + f.where());
      ObjectNode issued = f.context().put("leaseExpiresAt", expired);
      exec(f.c, f.issueSql(issued));
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb("
              + q(f.expiry)
              + "::text))"
              + f.where());
      reject(f.c, f.ackSql(), "delivery ACK identity invalid");
      assertThat(
              scalar(
                  f.c,
                  "SELECT context_metadata->>'leaseExpiresAt' FROM studio_guided_materialization_deliveries"
                      + f.where()))
          .isEqualTo(expired);
      assertThat(
              scalar(
                  f.c, "SELECT status FROM studio_guided_materialization_deliveries" + f.where()))
          .isEqualTo("PENDING");
    }
  }

  @Test
  void concurrentAppendRetriesProduceOneVersionAndOneDeliveryIdentity() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.c.commit();
      try (Connection other = connect()) {
        other.setAutoCommit(false);
        exec(other, "SET LOCAL lock_timeout='200ms'");
        f.append();
        assertThatThrownBy(() -> exec(other, f.appendSql(f.nextInputs())))
            .isInstanceOf(SQLException.class)
            .hasMessageContaining("lock timeout");
        other.rollback();
        f.c.commit();
        reject(other, f.appendSql(f.nextInputs()), "materialization append refused");
        assertThat(
                scalar(
                    other,
                    "SELECT count(*) FROM studio_guided_materialization_versions" + f.where()))
            .isEqualTo("2");
        assertThat(
                scalar(
                    other,
                    "SELECT count(DISTINCT delivery_id) FROM studio_guided_materialization_deliveries"
                        + f.where()))
            .isEqualTo("1");
        other.rollback();
      }
    }
  }

  @Test
  void oldCompletedPreparationJoinsItsVersionAfterHeadAdvances() throws Exception {
    try (Fixture f = new Fixture(false)) {
      String admission = f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      String proof = scalar(f.c, "SELECT proof::text FROM studio_guided_preparations" + f.where());
      f.append();
      f.issue();
      f.ack();
      assertThat(scalar(f.c, "SELECT proof::text FROM studio_guided_preparations" + f.where()))
          .isEqualTo(proof);
      assertThat(
              scalar(
                  f.c,
                  "SELECT v.context_revision FROM studio_guided_actions a JOIN studio_guided_materialization_versions "
                      + "v ON v.session_id=a.session_id AND v.context_revision=("
                      + "a.proposal->>'contextRevision')::integer AND "
                      + "v.authored_inputs_hash=a.proposal->>'authoredInputsHash' WHERE a.admission_id="
                      + q(admission)))
          .isEqualTo("1");
    }
  }

  @Test
  void oldSecretReleaseAndUseJoinTheirHistoricalVersion() throws Exception {
    try (Fixture f = new Fixture(false)) {
      // The fixed V17 helpers read the actual old action version after the current pointer
      // advances.
      // Convert only a fresh fixture before any action to a complete configuration secret input.
      ObjectNode secret =
          f.input.deepCopy().put("kind", "secretRef").put("secretId", "LOGIN_PASSWORD");
      secret.remove("value");
      secret.set(
          "provenance",
          obj(
              "{\"referenceKind\":\"configuration\",\"referenceId\":\"cfg-secret\","
                  + "\"referenceName\":\"LOGIN_PASSWORD\",\"stepId\":\""
                  + STEP1
                  + "\",\"kind\":\"secretRef\",\"intendedSlot\":\"fill.value\",\"configurationRevision\":\"1\"}"));
      // Seed historical pre-action prerequisites; current installed functions are asserted
      // against complete joined facts under origin, never a current-head version alias.
      exec(f.c, "SET LOCAL session_replication_role='replica'");
      ObjectNode values = f.material.deepCopy();
      values.putArray("inputs").add(secret);
      exec(
          f.c,
          "UPDATE studio_guided_materializations SET authored_inputs="
              + j(values)
              + ",authored_inputs_hash="
              + q(hash(values))
              + f.where());
      exec(
          f.c, "UPDATE studio_guided_materialization_inputs SET document=" + j(secret) + f.where());
      exec(
          f.c,
          "UPDATE studio_guided_materialization_versions SET authored_inputs_hash="
              + q(hash(values))
              + f.where());
      ObjectNode manifest =
          obj(scalar(f.c, "SELECT manifest::text FROM studio_guided_source_manifests" + f.where()));
      manifest
          .putArray("configurationReferences")
          .addObject()
          .put("referenceId", "cfg-secret")
          .put("referenceName", "LOGIN_PASSWORD")
          .put("kind", "secretRef")
          .put("stepId", STEP1)
          .put("intendedSlot", "fill.value");
      exec(
          f.c,
          "UPDATE studio_guided_source_manifests SET manifest="
              + j(manifest)
              + ",manifest_hash="
              + q(hash(manifest))
              + f.where());
      exec(f.c, "SET LOCAL session_replication_role='origin'");
      ObjectNode p = f.proposal(STEP1, 0);
      p.set(
          "operation",
          obj(
              "{\"kind\":\"fill\",\"value\":{\"kind\":\"secretRef\",\"sourceInputId\":\"input0\"}}"));
      String admission = f.id + "-secret";
      exec(f.c, f.preparation(admission + "-prep", p, false));
      exec(f.c, f.actionSql(f.action(admission, STEP1, 0, 0, "SUCCEEDED", p), p));
      exec(f.c, "UPDATE studio_guided_preparations SET admission_id=" + q(admission) + f.where());
      UUID release = UUID.randomUUID();
      String releasedAt = Instant.now().toString();
      exec(f.c, secretAuditSql(f, release, release, admission, releasedAt, true));
      String releaseBefore =
          scalar(
              f.c,
              "SELECT to_jsonb(a)::text FROM studio_secret_use_audit a WHERE id="
                  + q(release.toString()));
      ObjectNode next = values.deepCopy();
      ((ArrayNode) next.path("inputs")).add(f.input.deepCopy().put("inputId", "suffix"));
      exec(f.c, f.appendSql(next));
      f.immediate();
      f.issue();
      f.ack();
      exec(f.c, secretAuditSql(f, UUID.randomUUID(), release, admission, releasedAt, false));
      assertThat(
              scalar(
                  f.c,
                  "SELECT to_jsonb(a)::text FROM studio_secret_use_audit a WHERE id="
                      + q(release.toString())))
          .isEqualTo(releaseBefore);
      assertThat(
              scalar(
                  f.c,
                  "SELECT string_agg(row_kind||':'||coalesce(usage_outcome,outcome),',' ORDER BY row_kind) FROM "
                      + "studio_secret_use_audit"
                      + f.where()))
          .isEqualTo("RELEASE:RESOLVED,USAGE:OK");
      assertThat(
              scalar(
                  f.c,
                  "SELECT studio_secret_guided_input_reference("
                      + q(f.id)
                      + ","
                      + q(H)
                      + ","
                      + q(admission)
                      + ")"))
          .isEqualTo("cfg-secret");
      assertThat(
              scalar(
                  f.c,
                  "SELECT studio_secret_guided_consumed("
                      + q(f.id)
                      + ","
                      + q(H)
                      + ","
                      + q(admission)
                      + ","
                      + q(STEP1)
                      + ",0,'LOGIN_PASSWORD',"
                      + q(f.id + ":1")
                      + ")"))
          .isEqualTo("t");
      assertThat(
              scalar(
                  f.c,
                  "SELECT (a.proposal->>'contextRevision')||':'||m.context_revision FROM studio_guided_actions a JOIN "
                      + "studio_guided_materializations m USING(session_id) WHERE a.admission_id="
                      + q(admission)))
          .isEqualTo("1:2");
    }
  }

  @Test
  void contextHeaderBirthMetadataDoesNotRejectLaterGraphMetadataRevision() throws Exception {
    try (Fixture f = new Fixture(false)) {
      exec(f.c, "UPDATE studio_guided_materializations SET materialization_revision=7" + f.where());
      ObjectNode evidence =
          C.object()
              .put("kind", "initialBlank")
              .put("documentId", "initial-document")
              .put("generation", 0);
      ObjectNode proposal =
          f.proposal(STEP1, 0)
              .put("schemaVersion", 3)
              .put("sessionId", f.id)
              .put("scopeHash", H)
              .put("generation", 0)
              .put("evidenceHash", hash(evidence));
      proposal.set("executionEvidence", evidence);
      proposal.set(
          "target",
          C.object()
              .put("kind", "page")
              .put("documentId", "initial-document")
              .put("generation", 0));
      proposal.set("operation", C.object().put("kind", "navigate").put("url", "https://a.test"));
      ObjectNode proof =
          C.object()
              .put("schemaVersion", 3)
              .put("sessionId", f.id)
              .put("workerId", "worker")
              .put("ownerFence", 1)
              .put("scopeHash", H)
              .put("contextId", f.id + "-context")
              .put("contextRevision", 1)
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("preparationId", "metadata-prep")
              .put("requestDigest", hash(proposal))
              .put("evidenceHash", hash(evidence))
              .put("authoredInputsHash", hash(f.material))
              .put("expiresAt", f.expiry);
      proof.putObject("versions").put("contract", 3);
      exec(
          f.c,
          "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,request_digest,"
              + "proof,expires_at) VALUES ("
              + q(f.id)
              + ",'metadata-prep',"
              + q(f.id + "-context")
              + ",1,"
              + q(hash(proposal))
              + ","
              + j(proof)
              + ","
              + q(f.expiry)
              + ")");
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET progress=jsonb_build_object('executionEvidence',"
              + j(evidence)
              + ")"
              + f.where());
      String manifestHash =
          scalar(
              f.c,
              "SELECT studio_publication_hash(manifest-'configurationValues') FROM studio_guided_source_manifests"
                  + f.where());
      exec(
          f.c,
          "INSERT INTO studio_guided_publication_preparations(session_id,preparation_id,context_id,owner_fence,"
              + "request_digest,evidence_hash,inputs_hash,materialization_revision,source_manifest_hash,"
              + "observation_hash,execution_evidence,proposal,proof,captured_at) VALUES ("
              + q(f.id)
              + ",'metadata-prep',"
              + q(f.id + "-context")
              + ",1,"
              + q(hash(proposal))
              + ","
              + q(hash(evidence))
              + ","
              + q(hash(f.material))
              + ",7,"
              + q(manifestHash)
              + ",NULL,"
              + j(evidence)
              + ","
              + j(proposal)
              + ","
              + j(proof)
              + ",clock_timestamp())");
      // Complete the real preparation so it is historical evidence rather than an append blocker.
      ObjectNode action = f.action("metadata", STEP1, 0, 0, "SUCCEEDED", proposal);
      exec(f.c, f.actionSql(action, proposal));
      exec(
          f.c,
          "UPDATE studio_guided_preparations SET admission_id='metadata'"
              + f.where()
              + " AND preparation_id='metadata-prep'");
      exec(f.c, "UPDATE studio_guided_materializations SET materialization_revision=9" + f.where());
      f.append();
      f.issue();
      f.ack();
      assertThat(
              scalar(
                  f.c,
                  "SELECT v.materialization_revision||':'||p.materialization_revision||':'||m.materialization_revision "
                      + "FROM studio_guided_publication_preparations p JOIN studio_guided_materialization_versions v "
                      + "ON v.session_id=p.session_id AND v.context_revision=(p.proof->>'contextRevision')::integer "
                      + "JOIN studio_guided_materializations m ON m.session_id=p.session_id WHERE p.session_id="
                      + q(f.id)))
          .isEqualTo("1:7:10");
      assertThat(
              scalar(
                  f.c,
                  "SELECT p.proof->>'contextRevision' FROM studio_guided_publication_preparations p"
                      + f.where()))
          .isEqualTo("1");
      assertThat(
              scalar(
                  f.c, "SELECT context_revision FROM studio_guided_materializations" + f.where()))
          .isEqualTo("2");
      assertThat(
              scalar(
                  f.c,
                  "SELECT proof::text FROM studio_guided_publication_preparations" + f.where()))
          .isEqualTo(scalar(f.c, "SELECT " + j(proof) + "::text"));
    }
  }

  @Test
  void preAdmissionReceiptRequiresIssuedExactRequestAndNoActionAtCoordinate() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.request();
      ObjectNode forged = f.receipt(null);
      forged.put("requestDigest", "b".repeat(64));
      forged.remove("receiptHash");
      forged.put("receiptHash", hash(forged));
      reject(f.c, f.receiptSql(forged), "query returned no rows");
      String admission = f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      assertThat(admission).isNotBlank();
      reject(f.c, f.receiptSql(f.receipt(null)), "pre-admission receipt has an action");
    }
    try (Fixture f = new Fixture(true)) {
      f.preAdmissionDrift();
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
      assertThat(f.count("studio_guided_no_invocation_receipts")).isEqualTo("1");
    }
  }

  @Test
  void admittedReceiptRequiresExactConsumedAttemptZeroAndPreparation() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.request();
      String admission = f.insertAction(STEP1, 0, 0, "ADMITTED");
      exec(f.c, "UPDATE studio_guided_prefix_requests SET status='PREPARED'" + f.where());
      reject(f.c, f.receiptSql(f.receipt(admission)), "admitted no-invocation proof mismatch");
    }
    try (Fixture f = new Fixture(true)) {
      String a = f.admittedDrift();
      assertThat(
              scalar(
                  f.c,
                  "SELECT (document->>'state')||':'||(document->>'dispatchCount') FROM studio_guided_actions WHERE "
                      + "admission_id="
                      + q(a)))
          .isEqualTo("FAILED:1");
    }
  }

  @Test
  void driftReceiptAndSwitchCommitAtomicallyOrNotAtAll() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.request();
      reject(f.c, f.receiptSql(f.receipt(null)), "drift receipt requires atomic switch");
      assertThat(f.count("studio_guided_no_invocation_receipts")).isEqualTo("0");
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("0");
      ObjectNode r = f.receipt(null);
      exec(f.c, f.receiptSql(r));
      f.switchTo("DRIFT", r.path("receiptHash").asText(), C.object().putArray("a"));
      f.immediate();
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("1");
    }
  }

  @Test
  void wrongOwnerScopeSourceVersionHashProgramOperationOrEvidenceReceiptIsRefused()
      throws Exception {
    for (String field :
        List.of(
            "workerId",
            "scopeHash",
            "sourceRevision",
            "configurationRevision",
            "prefixProgramHash",
            "operationHash",
            "evidenceHash",
            "authoredInputsHash",
            "contextId")) {
      try (Fixture f = new Fixture(true)) {
        f.request();
        ObjectNode r = f.receipt(null).put(field, "b".repeat(64));
        r.remove("receiptHash");
        r.put("receiptHash", hash(r));
        reject(f.c, f.receiptSql(r), "no-invocation receipt identity invalid");
      }
    }
    for (String field : List.of("ownerFence", "contextRevision")) {
      try (Fixture f = new Fixture(true)) {
        f.request();
        ObjectNode r = f.receipt(null).put(field, 99);
        r.remove("receiptHash");
        r.put("receiptHash", hash(r));
        reject(f.c, f.receiptSql(r), "no-invocation receipt identity invalid");
      }
    }
  }

  @Test
  void oneDriftReceiptAndOneSwitchPerSessionCannotBeRewritten() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.preAdmissionDrift();
      reject(
          f.c,
          "UPDATE studio_guided_relearn_switches SET effective_step_index=0" + f.where(),
          "incremental history is immutable");
      reject(
          f.c,
          "DELETE FROM studio_guided_no_invocation_receipts" + f.where(),
          "incremental history is immutable");
      reject(f.c, f.receiptSql(f.receipt(null)), "no-invocation receipt identity invalid");
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("1");
      assertThat(f.count("studio_guided_no_invocation_receipts")).isEqualTo("1");
    }
  }

  @Test
  void onlyProvenNoInvocationAllowsAttemptOneAtSameSemanticCoordinate() throws Exception {
    try (Fixture f = new Fixture(false)) {
      ObjectNode p = f.proposal(STEP1, 0);
      exec(f.c, f.preparation("replacement-prep", p, false));
      ObjectNode a = f.action("replacement", STEP1, 0, 1, "ADMITTED", p);
      reject(f.c, f.actionSql(a, p), "query returned no rows");
    }
    try (Fixture f = new Fixture(true)) {
      String old = f.admittedDrift();
      String replacement = f.insertAction(STEP1, 0, 1, "SUCCEEDED");
      assertThat(old).isNotEqualTo(replacement);
      assertThat(f.count("studio_guided_actions")).isEqualTo("2");
      assertThat(
              scalar(
                  f.c,
                  "SELECT count(*) FROM studio_guided_actions"
                      + f.where()
                      + " AND document->>'state'='SUCCEEDED'"))
          .isEqualTo("1");
      reject(
          f.c,
          "UPDATE studio_guided_actions SET document=document||'{\"state\":\"SUCCEEDED\"}' WHERE admission_id="
              + q(old),
          "guided outcome is immutable");
    }
  }

  @Test
  void spentAndReplacementAttemptsBothConsumeActionBudget() throws Exception {
    try (Fixture f = new Fixture(true)) {
      // Capture the maxActions=2 limit in the fixture before any action; no subject identity edit.
      exec(f.c, "SET LOCAL session_replication_role='replica'");
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{limits,maxActions}','2')"
              + f.where());
      exec(f.c, "SET LOCAL session_replication_role='origin'");
      f.admittedDrift();
      f.insertAction(STEP1, 0, 1, "SUCCEEDED");
      ObjectNode p = f.proposal(STEP2, 0);
      exec(f.c, f.preparation("over-budget-prep", p, false));
      reject(
          f.c,
          f.actionSql(f.action("over-budget", STEP2, 0, 0, "ADMITTED", p), p),
          "action attempt bounds or version");
      assertThat(f.count("studio_guided_actions")).isEqualTo("2");
    }
  }

  private static ObjectNode effectiveArtifact(Fixture f) throws SQLException {
    ObjectNode artifact = C.object();
    artifact.putObject("profile").put("contract", 3);
    ObjectNode learned = artifact.putObject("learnedPlan").put("schemaVersion", 3);
    ArrayNode actions = learned.putArray("actions");
    try (Statement s = f.c.createStatement();
        ResultSet r =
            s.executeQuery(
                "SELECT document::text FROM studio_guided_actions"
                    + f.where()
                    + " AND document->>'state'='SUCCEEDED' ORDER BY CASE step_id WHEN "
                    + q(STEP1)
                    + " THEN 0 ELSE 1 END,ordinal")) {
      while (r.next()) {
        JsonNode d = C.parse(r.getString(1));
        ObjectNode a =
            C.object()
                .put("admissionId", d.path("admission").path("admissionId").asText())
                .put("operationHash", d.path("operationHash").asText());
        a.set("coordinate", d.path("coordinate"));
        actions.add(a);
      }
    }
    if (f.incremental) {
      ObjectNode p =
          obj(
              scalar(
                  f.c, "SELECT to_jsonb(p)::text FROM studio_guided_relearn_plans p" + f.where()));
      ObjectNode x =
          obj(
              scalar(
                  f.c,
                  "SELECT to_jsonb(x)::text FROM studio_guided_relearn_switches x" + f.where()));
      ObjectNode inc =
          learned
              .putObject("incremental")
              .put("baseRevisionId", p.path("base_revision_id").asText())
              .put("initialFirstLearnStepId", p.path("initial_step_id").asText())
              .put("effectiveFirstLearnStepId", x.path("effective_step_id").asText());
      inc.set("retainedPrefixAdmissionIds", x.path("completed_admissions"));
      inc.set("driftReceiptHash", x.path("drift_receipt_hash"));
    } else {
      learned.putNull("incremental");
    }
    return artifact;
  }

  private static String revision(
      Fixture f, UUID id, ObjectNode artifact, JsonNode refs, JsonNode reuse) {
    return f.revisionInsert(id, f.id, artifact, refs, f.snapshots(), reuse);
  }

  private static ObjectNode reuse(Fixture f) {
    ObjectNode p = C.object();
    if (f.incremental) {
      p.putObject(STEP1).put("revisionId", f.base.toString()).put("stepId", STEP1);
    }
    return p;
  }

  private static void boundary(Fixture f) throws SQLException {
    String admission = f.insertAction(STEP1, 0, 0, "SUCCEEDED");
    ArrayNode retained = C.object().putArray("a").add(admission);
    f.switchTo("BOUNDARY", null, retained);
    f.immediate();
  }

  private static ObjectNode publication(Fixture f, UUID revision, ObjectNode artifact)
      throws SQLException {
    return publication(f, revision, artifact, true);
  }

  private static ObjectNode publication(
      Fixture f, UUID revision, ObjectNode artifact, boolean v21Result) throws SQLException {
    f.state("FINALIZING");
    String now = Instant.now().toString(), deadline = Instant.now().plusSeconds(60).toString();
    UUID attempt = UUID.randomUUID(), claim = UUID.randomUUID();
    JsonNode base =
        C.parse(
            scalar(f.c, "SELECT document::text FROM studio_guided_publication_bases" + f.where()));
    ObjectNode build =
        C.object()
            .put("profileHash", hash(artifact.path("profile")))
            .put("schemaBundleHash", H)
            .put("referenceBundleHash", H)
            .put("executableImageDigest", H)
            .put("chromiumBuild", "test");
    ObjectNode identity =
        C.object()
            .put("ownerWorkerId", "worker")
            .put("ownerFence", 1)
            .put("validationDeadline", deadline)
            .put("translationHash", H)
            .put("basisHash", H)
            .put("learnedPlanHash", hash(artifact.path("learnedPlan")))
            .put("artifactHash", hash(artifact))
            .put("referencePolicyHash", hash(C.object()))
            .put("operationEquivalenceHash", H)
            .put("publicationEvidenceHash", H)
            .put("profileHash", hash(artifact.path("profile")))
            .put("validationBuildHash", hash(build));
    identity.set("base", base);
    String snapshot = hash(identity);
    identity.put("snapshotHash", snapshot).put("finalizeKey", "final").put("finalizeDigest", H);
    exec(
        f.c,
        "INSERT INTO studio_guided_publication_attempts(session_id,attempt_id,attempt_number,claim_id,finalize_key,"
            + "finalize_digest,snapshot_hash,basis_hash,identity,validation_deadline,status,created_at) VALUES ("
            + q(f.id)
            + ","
            + q(attempt.toString())
            + ",1,"
            + q(claim.toString())
            + ",'final',"
            + q(H)
            + ","
            + q(snapshot)
            + ","
            + q(H)
            + ","
            + j(identity)
            + ","
            + q(deadline)
            + ",'RESERVED',clock_timestamp())");
    exec(
        f.c,
        "UPDATE studio_guided_publication_attempts SET status='VALIDATING',claimed_at=clock_timestamp()"
            + f.where());
    ObjectNode verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.toString())
            .put("claimId", claim.toString())
            .put("snapshotHash", snapshot)
            .put("basisHash", H)
            .put("admissionProvenanceHash", H);
    for (String k :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      verdict.set(k, identity.path(k));
    }
    verdict.set("profile", artifact.path("profile"));
    verdict.set("build", build);
    ObjectNode result =
        C.object()
            .put("sessionId", f.id)
            .put("revisionId", revision.toString())
            .put("testId", f.test.toString())
            .put("csiId", "D015")
            .put("originalPrincipalId", PRINCIPAL)
            .put("finalizeKey", "final")
            .put("finalizeDigest", H)
            .put("attemptId", attempt.toString())
            .put("claimId", claim.toString())
            .put("snapshotHash", snapshot)
            .put("basisHash", H)
            .put("admissionProvenanceHash", H)
            .put("publishedAt", now);
    for (String k :
        List.of(
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      result.set(k, identity.path(k));
    }
    result.put(
        "revisionDigest",
        scalar(
            f.c,
            "SELECT revision_digest FROM ui_test_revisions WHERE id=" + q(revision.toString())));
    ObjectNode receipt =
        result
            .putObject("publicReceipt")
            .put("schemaVersion", 3)
            .put("sessionId", f.id)
            .put("revisionId", revision.toString())
            .put("publishedAt", now)
            .put("learnedFromThisRun", true)
            .put("replayVerified", false);
    for (String k :
        List.of("revisionDigest", "learnedPlanHash", "artifactHash", "publicationEvidenceHash")) {
      receipt.set(k, result.path(k));
    }
    if (v21Result) {
      String entered = scalar(f.c, "SELECT studio_015_relearned_from(" + q(f.id) + ")::text");
      if (entered == null) {
        receipt.putNull("relearnedFrom");
      } else {
        receipt.set("relearnedFrom", C.parse(entered));
      }
    }
    exec(
        f.c,
        "UPDATE studio_guided_publication_attempts SET status='VALIDATED',completed_at=clock_timestamp(),"
            + "validator_receipt="
            + j(verdict)
            + f.where());
    return result;
  }

  private static String publicationSql(Fixture f, ObjectNode d, ObjectNode artifact) {
    return "INSERT INTO studio_guided_publications(session_id,revision_id,test_id,csi_id,attempt_id,claim_id,"
        + "snapshot_hash,basis_hash,document,learned_plan,published_at) VALUES ("
        + q(f.id)
        + ","
        + q(d.path("revisionId").asText())
        + ","
        + q(f.test.toString())
        + ",'D015',"
        + q(d.path("attemptId").asText())
        + ","
        + q(d.path("claimId").asText())
        + ","
        + q(d.path("snapshotHash").asText())
        + ","
        + q(d.path("basisHash").asText())
        + ","
        + j(d)
        + ","
        + j(artifact.path("learnedPlan"))
        + ","
        + q(d.path("publishedAt").asText())
        + ")";
  }

  /** Finish the actual deferred V15 revision/publication cycle before forcing any constraint. */
  private static ObjectNode pairedRevision(
      Fixture f, UUID revision, ObjectNode artifact, JsonNode refs, JsonNode reuse)
      throws SQLException {
    exec(f.c, "SET CONSTRAINTS ALL DEFERRED");
    exec(f.c, revision(f, revision, artifact, refs, reuse));
    ObjectNode publication = publication(f, revision, artifact);
    exec(f.c, publicationSql(f, publication, artifact));
    f.immediate();
    return publication;
  }

  private static void rejectRevision(
      Fixture f, ObjectNode artifact, JsonNode refs, JsonNode reuse, String diagnostic)
      throws SQLException {
    rejectRevision(f, artifact, refs, f.snapshots(), reuse, diagnostic);
  }

  private static void rejectRevision(
      Fixture f,
      ObjectNode artifact,
      JsonNode refs,
      JsonNode hashes,
      JsonNode reuse,
      String diagnostic)
      throws SQLException {
    Savepoint save = f.c.setSavepoint();
    UUID revision = UUID.randomUUID();
    try {
      assertThatThrownBy(
              () -> {
                exec(f.c, "SET CONSTRAINTS ALL DEFERRED");
                exec(f.c, f.revisionInsert(revision, f.id, artifact, refs, hashes, reuse));
                ObjectNode publication = publication(f, revision, artifact);
                exec(f.c, publicationSql(f, publication, artifact));
                f.immediate();
              })
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(diagnostic);
    } finally {
      f.c.rollback(save);
      f.c.releaseSavepoint(save);
    }
  }

  @Test
  void suffixAcceptancePreservesEverySuccessfulPriorMeaning() throws Exception {
    try (Fixture f = new Fixture(true)) {
      String admission = f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      ObjectNode meaning =
          C.object()
              .put("obligationId", UUID.randomUUID().toString())
              .put("stepId", STEP1)
              .put("occurrence", 0)
              .put("kind", "click");
      ObjectNode oldPlan = C.object();
      oldPlan.putArray("obligations").add(meaning);
      insertPlan(f, 1, oldPlan);
      ObjectNode proposal =
          obj(
              scalar(
                  f.c,
                  "SELECT proposal::text FROM studio_guided_actions WHERE admission_id="
                      + q(admission)));
      exec(
          f.c,
          "INSERT INTO studio_guided_obligation_admissions(session_id,obligation_id,plan_revision,meaning,proposal,"
              + "proposal_digest,admission_key,admission_id,attempt_ordinal) VALUES ("
              + q(f.id)
              + ","
              + q(meaning.path("obligationId").asText())
              + ",1,"
              + j(meaning)
              + ","
              + j(proposal)
              + ","
              + q(hash(proposal))
              + ",'admit',"
              + q(admission)
              + ",0)");
      ArrayNode retained = C.object().putArray("a").add(admission);
      f.switchTo("BOUNDARY", null, retained);
      f.immediate();
      Savepoint before = f.c.setSavepoint();
      ObjectNode changed = C.object();
      changed.putArray("obligations");
      insertPlan(f, 2, changed);
      String acceptance =
          "INSERT INTO studio_guided_suffix_acceptances(session_id,plan_revision,previous_plan_revision,"
              + "retained_admissions) VALUES ("
              + q(f.id)
              + ",2,1,"
              + j(retained)
              + ")";
      reject(f.c, acceptance, "suffix plan changed executed meaning");
      f.c.rollback(before);
      insertPlan(f, 2, oldPlan);
      exec(f.c, acceptance);
      f.immediate();
      assertThat(f.count("studio_guided_suffix_acceptances")).isEqualTo("1");
      reject(
          f.c,
          "UPDATE studio_guided_suffix_acceptances SET retained_admissions='[]'" + f.where(),
          "incremental history is immutable");
    }
  }

  private static void insertPlan(Fixture f, int revision, ObjectNode plan) throws SQLException {
    exec(
        f.c,
        "INSERT INTO studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,plan_hash) VALUES ("
            + q(f.id)
            + ","
            + revision
            + ","
            + (revision - 1)
            + ","
            + j(plan)
            + ","
            + q(hash(plan))
            + ")");
  }

  @Test
  void boundariesIncludeEmptyPrefixAtK1ButNeverEmptySuffix() throws Exception {
    try (Fixture f = new Fixture(true, 0)) {
      assertThat(
              scalar(
                  f.c,
                  "SELECT reason||':'||effective_step_index FROM studio_guided_relearn_switches"
                      + f.where()))
          .isEqualTo("EMPTY_PREFIX:0");
      assertThat(scalar(f.c, "SELECT studio_015_relearned_from(" + q(f.id) + ")->>'stepId'"))
          .isEqualTo(STEP1);
      assertThat(f.program.path("actions")).isEmpty();
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
    }
    try (Connection c = connect()) {
      assertThatThrownBy(() -> new Fixture(c, true, 2))
          .isInstanceOf(SQLException.class)
          .hasMessageContaining("incremental base or start boundary invalid");
      c.rollback();
    }
  }

  @Test
  void completeMetadataRequiredForNewRevisionWithoutHistoricalBackfill() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      String historical =
          scalar(
              f.c,
              "SELECT to_jsonb(r)::text FROM ui_test_revisions r WHERE id=" + q(f.base.toString()));
      rejectRevision(
          f,
          artifact,
          f.declarations(),
          null,
          null,
          "requires complete immutable input and snapshot metadata");
      ObjectNode missing = f.declarations();
      missing.remove("authoringIdentityVersion");
      rejectRevision(
          f,
          artifact,
          missing,
          C.object(),
          "requires complete immutable input and snapshot metadata");
      UUID id = UUID.randomUUID();
      pairedRevision(f, id, artifact, f.declarations(), C.object());
      assertThat(
              scalar(
                  f.c,
                  "SELECT to_jsonb(r)::text FROM ui_test_revisions r WHERE id="
                      + q(f.base.toString())))
          .isEqualTo(historical);
      assertThat(
              scalar(
                  f.c,
                  "SELECT \"references\"->>'authoringIdentityVersion' FROM ui_test_revisions WHERE id="
                      + q(id.toString())))
          .isEqualTo("1");
    }
  }

  @Test
  void reuseMustNameImmediatePinnedBaseAndExactContiguousPrefix() throws Exception {
    try (Fixture f = new Fixture(true)) {
      boundary(f);
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      rejectRevision(
          f,
          artifact,
          f.declarations(),
          C.object(),
          "reuse must equal actual immediate-base prefix");
      ObjectNode suffix = reuse(f);
      suffix.putObject(STEP2).put("revisionId", f.base.toString()).put("stepId", STEP2);
      rejectRevision(
          f, artifact, f.declarations(), suffix, "reuse must equal actual immediate-base prefix");
      UUID id = UUID.randomUUID();
      pairedRevision(f, id, artifact, f.declarations(), reuse(f));
      assertThat(
              scalar(
                  f.c,
                  "SELECT step_reuse_provenance::text FROM ui_test_revisions WHERE id="
                      + q(id.toString())))
          .isEqualTo(scalar(f.c, "SELECT " + j(reuse(f)) + "::text"));
    }
  }

  @Test
  void postDriftSuffixAndWrongSameTestBaseCannotBeMarkedReused() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.preAdmissionDrift();
      f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      rejectRevision(
          f, artifact, f.declarations(), reuse(f), "reuse must equal actual immediate-base prefix");
      pairedRevision(f, UUID.randomUUID(), artifact, f.declarations(), C.object());
    }
    try (Fixture f = new Fixture(true)) {
      boundary(f);
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      UUID older = alternatePublishedSameTestBase(f, artifact);
      ObjectNode wrong = reuse(f);
      ((ObjectNode) wrong.path(STEP1)).put("revisionId", older.toString());
      rejectRevision(
          f, artifact, f.declarations(), wrong, "reuse must equal actual immediate-base prefix");
      assertThat(
              scalar(
                  f.c,
                  "SELECT step_snapshot_hashes->"
                      + q(STEP1)
                      + "=(SELECT step_snapshot_hashes->"
                      + q(STEP1)
                      + " FROM ui_test_revisions WHERE id="
                      + q(f.base.toString())
                      + ") FROM ui_test_revisions WHERE id="
                      + q(older.toString())))
          .isEqualTo("t");
    }
  }

  private static UUID alternatePublishedSameTestBase(Fixture current, ObjectNode currentArtifact)
      throws SQLException {
    Fixture alternate = new Fixture(current, current.oldId + "-alternate");
    // Every operation below uses origin triggers. This is its own immutable source, not a copy
    // relabeled from another session, and the receipt FK cycle is completed before constraints.
    insertSession(alternate.c, alternate.doc);
    ObjectNode manifest =
        C.object()
            .put("testId", alternate.test.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("policy", "INPUT-POLICY-01-A")
            .put("authoringIdentityVersion", 1);
    manifest.set("authoringSnapshot", alternate.authoredSnapshot);
    manifest.set("authoringRevisionInputs", alternate.authoredInputs);
    manifest.set("authoredDeclarations", alternate.declarations().path("authoredDeclarations"));
    manifest.set(
        "schemaPins",
        new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(C)
            .schemaProvenance());
    ArrayNode steps = manifest.putArray("sourceSteps");
    for (JsonNode step : alternate.authoredSnapshot.path("steps")) {
      steps
          .addObject()
          .put("stepId", step.path("id").asText())
          .put("text", step.path("text").asText());
    }
    manifest.putArray("configurationReferences");
    manifest.putObject("configurationValues");
    exec(
        alternate.c,
        "INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash) VALUES ("
            + q(alternate.id)
            + ","
            + q(H)
            + ","
            + j(manifest)
            + ","
            + q(hash(manifest))
            + ")");
    exec(
        alternate.c,
        "INSERT INTO studio_guided_translation_state(session_id,continuation) VALUES ("
            + q(alternate.id)
            + ",'MATERIALIZE')");
    alternate.insertBase(alternate.id, current.base.toString());
    alternate.state("OBSERVING");
    exec(
        alternate.c,
        "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner}',"
            + "'{\"workerId\":\"worker\",\"fence\":1,\"leaseExpiresAt\":\""
            + alternate.expiry
            + "\"}')"
            + alternate.where());
    ObjectNode intent =
        C.object()
            .put("sessionId", alternate.id)
            .put("assignmentId", alternate.id)
            .put("scopeHash", H)
            .put("workerId", "worker")
            .put("expectedFence", 0);
    exec(
        alternate.c,
        "INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent) "
            + "VALUES ("
            + q(alternate.id)
            + ","
            + q(alternate.id)
            + ","
            + q(H)
            + ",'worker',0,"
            + j(intent)
            + ")");
    exec(
        alternate.c,
        "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,context_revision,"
            + "materialization_revision,worker_id,owner_fence,source_revision,configuration_revision,"
            + "authored_inputs_hash,authored_inputs) VALUES ("
            + q(alternate.id)
            + ","
            + q(H)
            + ","
            + q(alternate.id + "-context")
            + ",1,1,'worker',1,'1','1',"
            + q(hash(alternate.material))
            + ","
            + j(alternate.material)
            + ")");
    alternate.insertAction(STEP1, 0, 0, "SUCCEEDED");
    alternate.insertAction(STEP2, 0, 0, "SUCCEEDED");
    ObjectNode artifact = effectiveArtifact(alternate);
    ArrayNode expected = C.object().putArray("actions"), actual = C.object().putArray("actions");
    for (JsonNode action : currentArtifact.path("learnedPlan").path("actions")) {
      ObjectNode value = action.deepCopy();
      value.remove("admissionId");
      expected.add(value);
    }
    for (JsonNode action : artifact.path("learnedPlan").path("actions")) {
      ObjectNode value = action.deepCopy();
      value.remove("admissionId");
      actual.add(value);
    }
    assertThat(actual).isEqualTo(expected);
    UUID revision = UUID.randomUUID();
    String insertion =
        alternate.revisionInsert(
            revision,
            alternate.id,
            artifact,
            alternate.declarations(),
            alternate.snapshots(),
            C.object());
    insertion = insertion.replace(") VALUES (", ",created_at) VALUES (");
    insertion =
        insertion.substring(0, insertion.length() - 1)
            + ",(SELECT created_at-interval '1 hour' FROM ui_test_revisions WHERE id="
            + q(current.base.toString())
            + "))";
    exec(alternate.c, insertion);
    ObjectNode receipt = publication(alternate, revision, artifact);
    exec(alternate.c, publicationSql(alternate, receipt, artifact));
    alternate.immediate();
    assertThat(
            scalar(
                alternate.c,
                "SELECT r.authoring="
                    + j(alternate.authoredSnapshot)
                    + " AND r.authoring_revision_inputs="
                    + j(alternate.authoredInputs)
                    + " AND r.created_at<(SELECT created_at FROM ui_test_revisions WHERE id="
                    + q(current.base.toString())
                    + ") FROM ui_test_revisions r WHERE r.id="
                    + q(revision.toString())))
        .isEqualTo("t");
    assertThat(
            scalar(
                alternate.c,
                "SELECT r.id=p.revision_id AND b.document->>'sourceManifestHash'=studio_publication_hash("
                    + "m.manifest-'configurationValues') FROM ui_test_revisions r JOIN studio_guided_publications p ON "
                    + "p.session_id=r.guided_session_id AND p.revision_id=r.id JOIN studio_guided_publication_bases b "
                    + "ON b.session_id=r.guided_session_id JOIN studio_guided_source_manifests m ON "
                    + "m.session_id=r.guided_session_id WHERE r.id="
                    + q(revision.toString())))
        .isEqualTo("t");
    return revision;
  }

  @Test
  void effectiveActionsAreUniqueCompleteSuccessfulAndMatchLedger() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode valid = effectiveArtifact(f);
      ObjectNode duplicate = valid.deepCopy();
      ((ArrayNode) duplicate.path("learnedPlan").path("actions"))
          .add(duplicate.path("learnedPlan").path("actions").get(0).deepCopy());
      rejectRevision(f, duplicate, f.declarations(), C.object(), "duplicate effective action");
      ObjectNode omitted = valid.deepCopy();
      ((ArrayNode) omitted.path("learnedPlan").path("actions")).remove(1);
      rejectRevision(f, omitted, f.declarations(), C.object(), "effective action set incomplete");
      ObjectNode foreign = valid.deepCopy();
      ((ObjectNode) foreign.path("learnedPlan").path("actions").get(0))
          .put("admissionId", "foreign");
      rejectRevision(
          f, foreign, f.declarations(), C.object(), "effective action does not match ledger");
      ObjectNode changed = valid.deepCopy();
      ((ObjectNode) changed.path("learnedPlan").path("actions").get(0))
          .put("operationHash", "b".repeat(64));
      rejectRevision(
          f, changed, f.declarations(), C.object(), "effective action does not match ledger");
      pairedRevision(f, UUID.randomUUID(), valid, f.declarations(), C.object());
    }
  }

  @Test
  void excludedFailureRequiresExactImmutableNoInvocationReceipt() throws Exception {
    for (String failed : List.of("FAILED", "UNKNOWN_OUTCOME", "DISPATCHING")) {
      try (Fixture f = new Fixture(false)) {
        f.insertAction(STEP1, 0, 0, failed);
        ObjectNode artifact = effectiveArtifact(f);
        rejectRevision(
            f,
            artifact,
            f.declarations(),
            C.object(),
            "publication omitted unproven failed attempt");
      }
    }
    try (Fixture f = new Fixture(true)) {
      String spent = f.admittedDrift();
      String old =
          scalar(
              f.c,
              "SELECT document::text FROM studio_guided_actions WHERE admission_id=" + q(spent));
      f.insertAction(STEP1, 0, 1, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      pairedRevision(f, UUID.randomUUID(), artifact, f.declarations(), C.object());
      assertThat(
              scalar(
                  f.c,
                  "SELECT document::text FROM studio_guided_actions WHERE admission_id="
                      + q(spent)))
          .isEqualTo(old);
      assertThat(artifact.path("learnedPlan").path("actions")).hasSize(2);
      assertThat(f.count("studio_guided_actions")).isEqualTo("3");
    }
  }

  @Test
  void publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys() throws Exception {
    try (Fixture f = new Fixture(true)) {
      boundary(f);
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      UUID id = UUID.randomUUID();
      exec(f.c, revision(f, id, artifact, f.declarations(), reuse(f)));
      ObjectNode good = publication(f, id, artifact);
      ObjectNode wrong = good.deepCopy();
      ((ObjectNode) wrong.path("publicReceipt"))
          .set("relearnedFrom", C.object().put("stepId", STEP1));
      reject(f.c, publicationSql(f, wrong, artifact), "publication relearned boundary differs");
      ObjectNode driftOnBoundary = good.deepCopy();
      ((ObjectNode) driftOnBoundary.path("publicReceipt").path("relearnedFrom"))
          .put(
              "driftSwitchStepId",
              good.path("publicReceipt").path("relearnedFrom").path("stepId").asText());
      reject(
          f.c,
          publicationSql(f, driftOnBoundary, artifact),
          "publication relearned boundary differs");
      ObjectNode extra = good.deepCopy();
      ((ObjectNode) extra.path("publicReceipt")).put("unexpected", true);
      reject(f.c, publicationSql(f, extra, artifact), "publication receipt shape invalid");
      exec(f.c, publicationSql(f, good, artifact));
      f.immediate();
      assertThat(f.count("studio_guided_publications")).isEqualTo("1");
    }
  }

  @Test
  void publicationReceiptRequiresExplicitNullBeforeAnyCommittedSwitch() throws Exception {
    try (Fixture f = new Fixture(false)) {
      f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      UUID id = UUID.randomUUID();
      exec(f.c, revision(f, id, artifact, f.declarations(), C.object()));
      ObjectNode good = publication(f, id, artifact);
      assertThat(good.path("publicReceipt").path("relearnedFrom").isNull()).isTrue();
      ObjectNode omitted = good.deepCopy();
      ((ObjectNode) omitted.path("publicReceipt")).remove("relearnedFrom");
      reject(f.c, publicationSql(f, omitted, artifact), "publication relearned boundary differs");
      exec(f.c, publicationSql(f, good, artifact));
      f.immediate();
      assertThat(f.count("studio_guided_publications")).isEqualTo("1");
    }
  }

  @Test
  void prefixFailureBeforeSwitchReportsNoRelearnedFrom() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.state("FAILED");
      exec(f.c, "UPDATE studio_guided_translation_state SET continuation='STOPPED'" + f.where());
      f.immediate();
      assertThat(scalar(f.c, "SELECT studio_015_relearned_from(" + q(f.id) + ")")).isNull();
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("0");
      assertThat(f.count("studio_guided_publications")).isEqualTo("0");
    }
  }

  @Test
  void failedPlanningAfterCommittedSwitchRetainsEnteredBoundaryWithoutSuccessClaim()
      throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.preAdmissionDrift();
      f.state("FAILED");
      ObjectNode entered =
          obj(scalar(f.c, "SELECT studio_015_relearned_from(" + q(f.id) + ")::text"));
      assertThat(entered.path("stepId").asText()).isEqualTo(STEP1);
      assertThat(entered.path("driftSwitchStepId").asText()).isEqualTo(STEP1);
      assertThat(scalar(f.c, "SELECT state FROM studio_guided_sessions" + f.where()))
          .isEqualTo("FAILED");
      assertThat(f.count("studio_guided_publications")).isEqualTo("0");
    }
  }

  private static void makeExpired(Fixture f) throws SQLException {
    exec(f.c, "SET LOCAL session_replication_role='replica'");
    exec(
        f.c,
        "UPDATE studio_guided_sessions SET expires_at=clock_timestamp()-interval '2 "
            + "hours',document=jsonb_set(document,'{expiresAt}',to_jsonb((clock_timestamp()-interval '2 hours')::text))"
            + f.where());
    exec(f.c, "SET LOCAL session_replication_role='origin'");
  }

  @Test
  void prunePreservesSafeSwitchReceiptHistoryAndExistingF01Residual() throws Exception {
    try (Fixture f = new Fixture(true)) {
      f.preAdmissionDrift();
      f.state("FAILED");
      makeExpired(f);
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET progress='{\"stepIndex\":0,\"errorCode\":\"TARGET_CHANGED\","
              + "\"observation\":{\"private\":\"customer\"}}'"
              + f.where());
      String history =
          scalar(
              f.c,
              "SELECT jsonb_build_array((SELECT to_jsonb(x) FROM studio_guided_relearn_switches x"
                  + f.where()
                  + "),(SELECT document FROM studio_guided_no_invocation_receipts"
                  + f.where()
                  + "),(SELECT authored_inputs FROM studio_guided_materialization_snapshots"
                  + f.where()
                  + "))::text");
      assertThat(
              scalar(f.c, "SELECT studio_guided_prune_session(" + q(f.id) + ",interval '1 hour')"))
          .isEqualTo("t");
      assertThat(
              scalar(
                  f.c,
                  "SELECT jsonb_build_array((SELECT to_jsonb(x) FROM studio_guided_relearn_switches x"
                      + f.where()
                      + "),(SELECT document FROM studio_guided_no_invocation_receipts"
                      + f.where()
                      + "),(SELECT authored_inputs FROM studio_guided_materialization_snapshots"
                      + f.where()
                      + "))::text"))
          .isEqualTo(history);
      assertThat(
              scalar(
                  f.c, "SELECT progress ? 'observation' FROM studio_guided_sessions" + f.where()))
          .isEqualTo("f");
      assertThat(
              scalar(
                  f.c,
                  "SELECT document->>'value' FROM studio_guided_materialization_inputs"
                      + f.where()))
          .isEqualTo("private-015");
      assertThat(scalar(f.c, "SELECT studio_015_relearned_from(" + q(f.id) + ")->>'stepId'"))
          .isEqualTo(STEP1);
    }
  }

  @Test
  void livePrefixCannotPruneAndExpiredPrefixFirstBecomesTerminal() throws Exception {
    try (Fixture f = new Fixture(true)) {
      makeExpired(f);
      assertThat(
              scalar(f.c, "SELECT studio_guided_prune_session(" + q(f.id) + ",interval '1 hour')"))
          .isEqualTo("f");
      assertThat(
              scalar(
                  f.c,
                  "SELECT count(*) FROM studio_guided_sessions"
                      + f.where()
                      + " AND state NOT IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED',"
                      + "'EXPIRED')"))
          .isEqualTo("1");
      f.state("EXPIRED");
      exec(f.c, "UPDATE studio_guided_translation_state SET continuation='STOPPED'" + f.where());
      assertThat(
              scalar(f.c, "SELECT studio_guided_prune_session(" + q(f.id) + ",interval '1 hour')"))
          .isEqualTo("t");
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("0");
    }
  }

  private static UUID installPolicyAndRecording(Fixture f) throws SQLException {
    return installPolicyAndRecording(f, "ALLOW");
  }

  private static UUID installPolicyAndRecording(Fixture f, String stance) throws SQLException {
    UUID policy = UUID.randomUUID();
    ObjectNode document =
        obj(
            "{\"schemaVersion\":3,\"allowedOrigins\":[\"https://a.test\"],\"applicationPolicy\":{\"policyRuleId\":\"app\",\"allowStructuralDiscovery\":true,\"readGrants\":[]},\"sideEffectStance\":\"ALLOW\",\"destructiveVocabulary\":[\"delete\"]}");
    document.put("sideEffectStance", stance);
    exec(
        f.c,
        "INSERT INTO studio_guided_policies(policy_id,csi_id,application_id,environment_id,created_by) VALUES ("
            + q(policy.toString())
            + ",'D015',"
            + q(f.id)
            + ",'Development','author')");
    exec(
        f.c,
        "INSERT INTO studio_guided_policy_versions(policy_id,version,document,document_hash,observation_policy_hash,"
            + "created_by) VALUES ("
            + q(policy.toString())
            + ",1,"
            + j(document)
            + ","
            + q(hash(document))
            + ","
            + q(hash(document.path("applicationPolicy")))
            + ",'author')");
    exec(
        f.c,
        "INSERT INTO studio_guided_policy_approvals(policy_id,version,approved_by,approval_ref) VALUES ("
            + q(policy.toString())
            + ",1,'approver','review')");
    exec(
        f.c,
        "INSERT INTO studio_guided_session_policies(session_id,policy_id,policy_version,observation_policy_hash) "
            + "VALUES ("
            + q(f.id)
            + ","
            + q(policy.toString())
            + ",1,"
            + q(hash(document.path("applicationPolicy")))
            + ")");
    exec(
        f.c,
        "INSERT INTO studio_guided_session_recordings(session_id,scope_hash,recording_id,worker_id,owner_fence,state,"
            + "partial,video_key,manifest_key,timings) VALUES ("
            + q(f.id)
            + ","
            + q(H)
            + ","
            + q(f.id)
            + ",'worker',1,'UNAVAILABLE',false,'video','manifest','[]')");
    return policy;
  }

  @Test
  void recordingFactAndGovernedPolicyRemainUnchangedAcrossPrefixSuffix() throws Exception {
    try (Fixture f = new Fixture(true)) {
      installPolicyAndRecording(f);
      String before =
          scalar(
              f.c,
              "SELECT jsonb_build_array((SELECT to_jsonb(r) FROM studio_guided_session_recordings r"
                  + f.where()
                  + "),(SELECT to_jsonb(p) FROM studio_guided_session_policies p"
                  + f.where()
                  + "))::text");
      boundary(f);
      assertThat(
              scalar(
                  f.c,
                  "SELECT jsonb_build_array((SELECT to_jsonb(r) FROM studio_guided_session_recordings r"
                      + f.where()
                      + "),(SELECT to_jsonb(p) FROM studio_guided_session_policies p"
                      + f.where()
                      + "))::text"))
          .isEqualTo(before);
      reject(
          f.c,
          "UPDATE studio_guided_session_recordings SET worker_id='other'" + f.where(),
          "guided session recording is immutable");
      reject(
          f.c,
          "UPDATE studio_guided_session_policies SET policy_version=2" + f.where(),
          "guided session policy is immutable");
    }
  }

  private static ObjectNode confirmationProof(Fixture f, String stance) throws SQLException {
    return confirmationProof(f, stance, true);
  }

  private static ObjectNode confirmationProof(Fixture f, String stance, boolean prepared)
      throws SQLException {
    installPolicyAndRecording(f, stance);
    ObjectNode observation =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", f.id)
            .put("documentId", f.id + "-document")
            .put("generation", 1)
            .put("origin", "https://a.test")
            .put("scopeHash", H)
            .put("observedAt", Instant.now().toString());
    observation
        .putObject("coverage")
        .put("mode", "semantic")
        .put("complete", true)
        .put("truncated", false)
        .put("withheldRegions", 0)
        .put("reason", "complete")
        .put("passwordControls", 0);
    observation.putArray("nodes");
    ObjectNode evidence =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", f.id)
            .put("contextId", f.id + "-context")
            .put("documentId", f.id + "-document")
            .put("generation", 1)
            .put("origin", "https://a.test")
            .put("observationHash", hash(observation));
    ObjectNode progress =
        C.object()
            .put("documentId", f.id + "-document")
            .put("generation", 1)
            .put("stepIndex", 0)
            .put("evidenceHash", hash(evidence));
    progress.set("executionEvidence", evidence);
    progress.set("observation", observation);
    exec(f.c, "UPDATE studio_guided_sessions SET progress=" + j(progress) + f.where());
    exec(
        f.c,
        "INSERT INTO studio_guided_publication_observations(session_id,observation_hash,context_id,owner_fence,"
            + "document_id,generation,observation,captured_at) VALUES ("
            + q(f.id)
            + ","
            + q(hash(observation))
            + ","
            + q(f.id + "-context")
            + ",1,"
            + q(f.id + "-document")
            + ",1,"
            + j(observation)
            + ",clock_timestamp())");
    f.request(hash(evidence));
    if (prepared) {
      exec(f.c, "UPDATE studio_guided_prefix_requests SET status='PREPARED'" + f.where());
    }
    ObjectNode question =
        progress
            .putObject("clarification")
            .put("schemaVersion", 3)
            .put("clarificationId", f.id + "-question")
            .put("sessionId", f.id)
            .put("scopeHash", H)
            .put("documentId", f.id + "-document")
            .put("generation", 1)
            .put("reason", "SIDE_EFFECT_CONFIRMATION")
            .put("promptCode", "CONFIRM_ACTION")
            .put("expiresAt", f.expiry)
            .put("phase", "observed");
    question.putObject("coordinate").put("stepId", STEP1).put("ordinal", 0);
    question
        .putArray("choices")
        .addObject()
        .put("choiceId", f.id + "-choice")
        .put("safeLabel", "Confirm the authored action")
        .put("labelSource", "AUTHORED")
        .putNull("nodeId")
        .putNull("bindingId");
    progress
        .putObject("sideEffectConfirmation")
        .put("clarificationId", f.id + "-question")
        .put("status", "PENDING")
        .put("prefixRequestDigest", hash(f.request));
    return progress;
  }

  private static String confirmationStateSql(Fixture f, ObjectNode progress, String state) {
    return "UPDATE studio_guided_sessions SET state="
        + q(state)
        + ",document=jsonb_set(document,'{state}',to_jsonb("
        + q(state)
        + "::text)),progress="
        + j(progress)
        + f.where();
  }

  private static String confirmationStateSql(Fixture f, ObjectNode progress, ObjectNode document) {
    return "UPDATE studio_guided_sessions SET state="
        + q(document.path("state").asText())
        + ",document="
        + j(document)
        + ",progress="
        + j(progress)
        + f.where();
  }

  private static void enterConfirmation(Fixture f, ObjectNode progress) throws SQLException {
    exec(f.c, confirmationStateSql(f, progress, "AWAITING_CLARIFICATION"));
    f.immediate();
  }

  private static ObjectNode confirmed(ObjectNode progress) {
    ObjectNode result = progress.deepCopy();
    result.remove("clarification");
    ((ObjectNode) result.path("sideEffectConfirmation")).put("status", "CONFIRMED");
    return result;
  }

  @Test
  void pendingPrefixAllowsOnlyExactServerSideEffectQuestion() throws Exception {
    try (Fixture f = new Fixture(true)) {
      ObjectNode proof = confirmationProof(f, "CLARIFY_FIRST");
      // Expired, unconsumed historical preparation is not an actionable admission or wait clock.
      exec(f.c, f.preparation("old-expired-preparation", f.proposal(STEP1, 0), true));
      enterConfirmation(f, proof);
      assertThat(scalar(f.c, "SELECT state FROM studio_guided_sessions" + f.where()))
          .isEqualTo("AWAITING_CLARIFICATION");
      assertThat(
              scalar(f.c, "SELECT continuation FROM studio_guided_translation_state" + f.where()))
          .isEqualTo("REPLAYING_PREFIX");
      String before = scalar(f.c, "SELECT progress::text FROM studio_guided_sessions" + f.where());
      exec(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(("
              + "clock_timestamp()+interval '1 hour')::text))"
              + f.where());
      f.immediate();
      assertThat(scalar(f.c, "SELECT progress::text FROM studio_guided_sessions" + f.where()))
          .isEqualTo(before);
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
      assertThat(f.count("studio_guided_model_attempts")).isEqualTo("0");
    }
  }

  @Test
  void pendingPrefixRejectsGenericStaleOrForgedWaitProof() throws Exception {
    try (Fixture f = new Fixture(true)) {
      ObjectNode valid = confirmationProof(f, "CLARIFY_FIRST");
      List<ObjectNode> invalid = new java.util.ArrayList<>();
      ObjectNode bad = valid.deepCopy();
      ((ObjectNode) bad.path("sideEffectConfirmation")).put("extra", true);
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("sideEffectConfirmation")).put("status", "CONFIRMED");
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("sideEffectConfirmation")).put("prefixRequestDigest", "b".repeat(64));
      invalid.add(bad);
      for (String field : List.of("reason", "promptCode", "scopeHash", "documentId", "phase")) {
        bad = valid.deepCopy();
        ((ObjectNode) bad.path("clarification")).put(field, "forged");
        invalid.add(bad);
      }
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification").path("coordinate")).put("stepId", STEP2);
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification")).put("generation", 99);
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification"))
          .put("expiresAt", Instant.now().minusSeconds(1).toString());
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification"))
          .put("expiresAt", Instant.now().plusSeconds(86400).toString());
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification").path("choices").get(0))
          .put("labelSource", "PAGE")
          .put("role", "button")
          .putNull("region");
      invalid.add(bad);
      bad = valid.deepCopy();
      ((ObjectNode) bad.path("clarification").path("choices").get(0))
          .put("bindingId", "foreign-binding");
      invalid.add(bad);
      bad = valid.deepCopy();
      bad.putObject("observationRefresh").put("callbackKey", "pending");
      invalid.add(bad);
      bad = valid.deepCopy();
      bad.put("evidenceHash", "b".repeat(64));
      invalid.add(bad);
      for (ObjectNode forged : invalid) {
        reject(
            f.c, confirmationStateSql(f, forged, "AWAITING_CLARIFICATION"), "prefix confirmation");
      }
      ObjectNode original =
          obj(scalar(f.c, "SELECT document::text FROM studio_guided_sessions" + f.where()));
      for (String field : List.of("workerId", "fence")) {
        ObjectNode document = original.deepCopy().put("state", "AWAITING_CLARIFICATION");
        if (field.equals("fence")) {
          ((ObjectNode) document.path("owner")).put(field, 2);
        } else {
          ((ObjectNode) document.path("owner")).put(field, "foreign-worker");
        }
        reject(f.c, confirmationStateSql(f, valid, document), "prefix confirmation wait invalid");
      }
      for (String field : List.of("sourceRevision", "configurationRevision")) {
        ObjectNode document = original.deepCopy().put("state", "AWAITING_CLARIFICATION");
        ((ObjectNode) document.path("scope")).put(field, "2");
        reject(f.c, confirmationStateSql(f, valid, document), "prefix confirmation wait invalid");
      }
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
    }
    for (String stance : List.of("ALLOW", "DENY")) {
      try (Fixture f = new Fixture(true)) {
        ObjectNode proof = confirmationProof(f, stance);
        reject(
            f.c,
            confirmationStateSql(f, proof, "AWAITING_CLARIFICATION"),
            "prefix confirmation wait invalid");
      }
    }
    try (Fixture f = new Fixture(true)) {
      ObjectNode proof = confirmationProof(f, "CLARIFY_FIRST", false);
      reject(
          f.c,
          confirmationStateSql(f, proof, "AWAITING_CLARIFICATION"),
          "prefix confirmation wait invalid");
    }
  }

  @Test
  void pendingPrefixWaitFencesBothGatewaysAttemptInsertAndModelCounters() throws Exception {
    try (Fixture f = new Fixture(true)) {
      enterConfirmation(f, confirmationProof(f, "CLARIFY_FIRST"));
      reject(f.c, modelReservation(f.id), "model reservation refused");
      for (String counter : List.of("modelProposals", "modelInputTokens", "modelOutputTokens")) {
        reject(
            f.c,
            "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{counters,"
                + counter
                + "}','1')"
                + f.where(),
            "model counters frozen during prefix");
      }
      assertThat(f.count("studio_guided_model_attempts")).isEqualTo("0");
      assertThat(scalar(f.c, "SELECT document->'counters' FROM studio_guided_sessions" + f.where()))
          .isEqualTo(scalar(f.c, "SELECT " + j(f.doc.path("counters"))));
      // Both Java gateways and browser effects are proved by linked IncrementalPolicyIT cases,
      // never inferred from these direct SQL fences.
    }
  }

  @Test
  void pendingPrefixWaitCannotAdmitConsumeOrSwitch() throws Exception {
    try (Fixture f = new Fixture(true)) {
      enterConfirmation(f, confirmationProof(f, "CLARIFY_FIRST"));
      ObjectNode proposal = f.proposal(STEP1, 0);
      for (String state : List.of("ADMITTED", "DISPATCHING")) {
        reject(
            f.c,
            f.actionSql(f.action("blocked", STEP1, 0, 0, state, proposal), proposal),
            "prefix action requires replay state");
      }
      for (String state : List.of("PROPOSING", "OBSERVING", "ACTING", "FINALIZING")) {
        reject(
            f.c,
            "UPDATE studio_guided_sessions SET state="
                + q(state)
                + ",document=jsonb_set(document,'{state}',to_jsonb("
                + q(state)
                + "::text))"
                + f.where(),
            "prefix callback cannot escape mode");
      }
      for (String continuation : List.of("AWAITING_CLARIFICATION", "REFRESH", "SOURCE_PLAN")) {
        reject(
            f.c,
            "UPDATE studio_guided_translation_state SET continuation="
                + q(continuation)
                + f.where(),
            "prefix continuation requires atomic switch");
      }
      reject(
          f.c,
          "INSERT INTO studio_guided_relearn_switches(session_id,reason,effective_step_id,effective_step_index,"
              + "next_ordinal,completed_prefix_count,completed_admissions) VALUES ("
              + q(f.id)
              + ",'BOUNDARY',"
              + q(STEP2)
              + ",1,0,1,'[]')",
          "learning switch identity invalid");
      reject(f.c, f.receiptSql(f.receipt(null)), "no-invocation receipt identity invalid");
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
      assertThat(f.count("studio_guided_relearn_switches")).isEqualTo("0");
    }
  }

  @Test
  void currentAnswerResumesOnlySamePrefixIdentity() throws Exception {
    try (Fixture f = new Fixture(true)) {
      ObjectNode pending = confirmationProof(f, "CLARIFY_FIRST");
      enterConfirmation(f, pending);
      ObjectNode answer = confirmed(pending);
      for (String field : List.of("clarificationId", "prefixRequestDigest")) {
        ObjectNode forged = answer.deepCopy();
        ((ObjectNode) forged.path("sideEffectConfirmation")).put(field, "forged");
        reject(
            f.c,
            confirmationStateSql(f, forged, "REPLAYING_PREFIX"),
            "prefix confirmation answer invalid");
      }
      ObjectNode document =
          obj(scalar(f.c, "SELECT document::text FROM studio_guided_sessions" + f.where()))
              .put("state", "REPLAYING_PREFIX");
      ((ObjectNode) document.path("owner")).put("fence", 2);
      reject(f.c, confirmationStateSql(f, answer, document), "prefix confirmation answer invalid");
      ObjectNode stale = answer.deepCopy().put("generation", 2);
      reject(
          f.c,
          confirmationStateSql(f, stale, "REPLAYING_PREFIX"),
          "prefix confirmation answer invalid");
      exec(f.c, confirmationStateSql(f, answer, "REPLAYING_PREFIX"));
      f.immediate();
      assertThat(
              scalar(
                  f.c,
                  "SELECT state||':'||(progress->'sideEffectConfirmation'->>'status') FROM studio_guided_sessions"
                      + f.where()))
          .isEqualTo("REPLAYING_PREFIX:CONFIRMED");
      assertThat(
              scalar(f.c, "SELECT continuation FROM studio_guided_translation_state" + f.where()))
          .isEqualTo("REPLAYING_PREFIX");
      assertThat(f.count("studio_guided_actions")).isEqualTo("0");
    }
    try (Fixture f = new Fixture(true)) {
      ObjectNode pending = confirmationProof(f, "CLARIFY_FIRST");
      reject(
          f.c,
          confirmationStateSql(f, confirmed(pending), "REPLAYING_PREFIX"),
          "prefix confirmation answer invalid");
    }
  }

  @Test
  void prefixWaitCancellationExpiryAndOwnerLossNeverResurrect() throws Exception {
    for (String terminal : List.of("CANCELLED", "EXPIRED", "UNKNOWN_OUTCOME")) {
      try (Fixture f = new Fixture(true)) {
        ObjectNode pending = confirmationProof(f, "CLARIFY_FIRST");
        enterConfirmation(f, pending);
        f.state(terminal);
        exec(f.c, "UPDATE studio_guided_translation_state SET continuation='STOPPED'" + f.where());
        f.immediate();
        reject(
            f.c,
            confirmationStateSql(f, confirmed(pending), "REPLAYING_PREFIX"),
            "guided terminal state is immutable");
        assertThat(f.count("studio_guided_actions")).isEqualTo("0");
      }
    }
    try (Fixture f = new Fixture(true)) {
      ObjectNode pending = confirmationProof(f, "CLARIFY_FIRST");
      enterConfirmation(f, pending);
      reject(
          f.c,
          "UPDATE studio_guided_sessions SET document=jsonb_set(document,'{owner,workerId}','\"other-worker\"')"
              + f.where(),
          "prefix confirmation renewal invalid");
      reject(
          f.c,
          "UPDATE studio_guided_materializations SET context_id='other-context'" + f.where(),
          "guided materialization identity is immutable");
    }
    try (Fixture f = new Fixture(true)) {
      ObjectNode pending = confirmationProof(f, "CLARIFY_FIRST");
      ((ObjectNode) pending.path("clarification"))
          .put("expiresAt", Instant.now().plusSeconds(2).toString());
      enterConfirmation(f, pending);
      Thread.sleep(2100);
      reject(
          f.c,
          confirmationStateSql(f, confirmed(pending), "REPLAYING_PREFIX"),
          "prefix confirmation answer invalid");
      f.state("EXPIRED");
      exec(f.c, "UPDATE studio_guided_translation_state SET continuation='STOPPED'" + f.where());
      f.immediate();
    }
  }

  @Test
  void prefixConfirmationAmendmentPreservesPopulatedV20AndAllExistingGuards() throws Exception {
    // Actual populated upgrade and20frozen-resource assertions remain separately executed original
    // methods in this same55-case suite; this delta additionally proves the original receipt FK.
    try (Fixture f = new Fixture(false)) {
      f.insertAction(STEP1, 0, 0, "SUCCEEDED");
      f.insertAction(STEP2, 0, 0, "SUCCEEDED");
      ObjectNode artifact = effectiveArtifact(f);
      reject(
          f.c,
          revision(f, UUID.randomUUID(), artifact, f.declarations(), C.object()),
          "fk_observed_revision_receipt");
      pairedRevision(f, UUID.randomUUID(), artifact, f.declarations(), C.object());
      assertThat(
              scalar(
                  f.c,
                  "SELECT count(*) FROM ui_test_revisions r JOIN studio_guided_publications p ON "
                      + "p.session_id=r.guided_session_id AND p.revision_id=r.id WHERE r.guided_session_id="
                      + q(f.id)))
          .isEqualTo("1");
    }
    try (Fixture f = new Fixture(true)) {
      enterConfirmation(f, confirmationProof(f, "CLARIFY_FIRST"));
      reject(
          f.c,
          "UPDATE studio_guided_relearn_plans SET initial_step_index=0" + f.where(),
          "incremental history is immutable");
      reject(
          f.c,
          "UPDATE studio_guided_session_policies SET policy_version=2" + f.where(),
          "guided session policy is immutable");
      assertThat(
              scalar(f.c, "SELECT continuation FROM studio_guided_translation_state" + f.where()))
          .isEqualTo("REPLAYING_PREFIX");
    }
  }
}

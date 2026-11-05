package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Database-only proof for the secret-login DDL (OBS-007's former V34, re-authored into V13–V17 by
 * the STUDIO-OBS-012A / ADR-SC-005 D-B re-baseline); application/runner secret-release oracles
 * belong to their lanes.
 */
public class GuidedSecretLoginMigrationTest {
  private static final TestPostgresDatabase PG = new TestPostgresDatabase();
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final GuidedContracts C = new GuidedContracts();
  private static final String OWNER = "owner@example.test";
  private static final String HASH = "a".repeat(64);

  @BeforeAll
  static void start() {
    PG.start();
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  private static final class Database implements AutoCloseable {
    final String name = "secret_login_" + UUID.randomUUID().toString().replace("-", "");
    final UUID testId = UUID.randomUUID();
    final DriverManagerDataSource ds;
    final JdbcTemplate jdbc;

    Database(String target) {
      new JdbcTemplate(admin()).execute("CREATE DATABASE " + name);
      ds =
          new DriverManagerDataSource(
              PG.getJdbcUrl().replace(PG.getDatabaseName(), name),
              PG.getUsername(),
              PG.getPassword());
      jdbc = new JdbcTemplate(ds);
      migrate(target);
      jdbc.update("INSERT INTO users(sso_id,name,email) VALUES ('owner','owner',?)", OWNER);
      jdbc.update(
          ("INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,en"
              + "vironment) VALUES ('CSI','test','unit','LOW',?,'Development')"),
          OWNER);
      jdbc.update(
          ("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by"
              + ") VALUES (?,'test','CSI','Development','chromium','[]',?)"),
          testId,
          OWNER);
    }

    void migrate(String target) {
      var config = Flyway.configure().dataSource(ds);
      if (target != null) {
        config.target(target);
      }
      config.load().migrate();
      // Hand-written preparation proofs below are minimal; the closed-key shape of a proof is
      // covered by GuidedStepKindMigrationIT, so only that one check is dropped here.
      jdbc.execute(
          "DO $$ BEGIN IF to_regclass('studio_guided_preparations') IS NOT NULL THEN ALTER TABLE"
              + " studio_guided_preparations DROP CONSTRAINT IF EXISTS ck_wi6_preparation_metadata;"
              + " END IF; END $$");
    }

    void session(String state) {
      ObjectNode document =
          JSON.createObjectNode()
              .put("sessionId", "session")
              .put("testId", testId.toString())
              .put("scopeHash", HASH)
              .put("state", state);
      document
          .putObject("scope")
          .put("principalId", OWNER)
          .put("csiId", "CSI")
          .put("environmentId", "Development");
      document.putObject("owner").put("fence", 1);
      document.putArray("sourceSteps").addObject().put("stepId", "password-step");
      document.withArray("sourceSteps").addObject().put("stepId", "unused-step");
      jdbc.update(
          ("INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope"
              + "_hash,state,expires_at,document) VALUES ('session',?,?,?, "
              + "?,now()+interval '10 minutes',?::jsonb)"),
          testId.toString(),
          OWNER,
          HASH,
          state,
          document.toString());
      ObjectNode manifest =
          JSON.createObjectNode()
              .put("testId", testId.toString())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("policy", "INPUT-POLICY-01-A");
      manifest
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", "password-step")
          .put("text", "Enter <secret PASS> as password");
      manifest
          .withArray("sourceSteps")
          .addObject()
          .put("stepId", "unused-step")
          .put("text", "Enter <secret UNREACHED> as password");
      var refs = manifest.putArray("configurationReferences");
      refs.addObject()
          .put("referenceId", "ref-PASS")
          .put("referenceName", "PASS")
          .put("kind", "secretRef")
          .put("stepId", "password-step");
      refs.addObject()
          .put("referenceId", "ref-UNREACHED")
          .put("referenceName", "UNREACHED")
          .put("kind", "secretRef")
          .put("stepId", "unused-step");
      jdbc.update(
          ("INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifes"
              + "t,manifest_hash) VALUES ('session',?,?::jsonb,studio_publication_hash(?:"
              + ":jsonb))"),
          HASH,
          manifest.toString(),
          manifest.toString());
    }

    void action() {
      action("input-PASS");
    }

    void action(String sourceInputId) {
      materialization();
      action("admission", "password-step", "migration-preparation", sourceInputId);
    }

    void action(String admissionId, String stepId, String preparationId, String sourceInputId) {
      ObjectNode document =
          JSON.createObjectNode()
              .put("sessionId", "session")
              .put("state", "DISPATCHING")
              .put("dispatchCount", 1)
              .put("ownerFence", 1)
              .put("attemptOrdinal", 0)
              .put("contextRevision", 1)
              .put("preparationId", preparationId)
              .put("outcomeCode", "PENDING");
      document.putObject("admission").put("admissionId", admissionId);
      document.putObject("coordinate").put("stepId", stepId).put("ordinal", 0);
      String inputsHash =
          jdbc.queryForObject(
              "SELECT authored_inputs_hash FROM studio_guided_materializations WHERE session_id='session'",
              String.class);
      var proposal = C.object().put("contextRevision", 1).put("authoredInputsHash", inputsHash);
      proposal.putObject("coordinate").put("stepId", stepId).put("ordinal", 0);
      var operation =
          proposal
              .putObject("operation")
              .put("kind", "step")
              .put("code", "await page.getByLabel('Password').fill(secrets['PASS']);");
      operation.putArray("captures");
      operation
          .putArray("uses")
          .addObject()
          .put("kind", "secret")
          .put("id", sourceInputId.replaceFirst("^input-", ""));
      operation.put("sourceHash", GuidedContracts.hash(operation.path("code")));
      String digest = GuidedContracts.hash(proposal);
      var proof =
          C.object()
              .put("sessionId", "session")
              .put("preparationId", preparationId)
              .put("contextId", "context")
              .put("ownerFence", 1)
              .put("contextRevision", 1)
              .put("authoredInputsHash", inputsHash)
              .put("requestDigest", digest);
      jdbc.update(
          "INSERT INTO studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,request_digest,"
              + "proof,expires_at)"
              + " VALUES ('session',?,'context',1,?,?::jsonb,clock_timestamp()+interval '1 hour')",
          preparationId,
          digest,
          proof.toString());
      document.put("authoredInputsHash", inputsHash).put("requestDigest", digest);
      jdbc.update(
          "INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,document,proposal)"
              + " VALUES (?,'session',?,0,?::jsonb,?::jsonb)",
          admissionId,
          stepId,
          document.toString(),
          proposal.toString());
      jdbc.update(
          "UPDATE studio_guided_preparations SET admission_id=? WHERE session_id='session' AND preparation_id=?",
          admissionId,
          preparationId);
    }

    void materialization() {
      String intent =
          ("{\"sessionId\":\"session\",\"assignmentId\":\"assignment\",\"workerId\":\"worker\",\""
                  + "scopeHash\":\"")
              + HASH
              + "\",\"expectedFence\":0}";
      jdbc.update(
          ("INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_has"
              + "h,worker_id,expected_fence,intent) VALUES "
              + "('session','assignment',?,'worker',0,?::jsonb)"),
          HASH,
          intent);
      String inputs =
          "{\"sessionId\":\"session\",\"scopeHash\":\""
              + HASH
              + ("\",\"inputs\":[{\"inputId\":\"input-PASS\",\"sourceStepId\":\"password-step\",\"kind"
                  + "\":\"secretRef\",\"secretId\":\"PASS\"},{\"inputId\":"
                  + "\"input-UNREACHED\",\"sourceStepId\":\"unused-step\",\"kind\":\"secretRef\",\"secre"
                  + "tId\":\"UNREACHED\"}]}");
      var safeInputs =
          (com.fasterxml.jackson.databind.node.ObjectNode)
              new com.citi.put.checks.studio.guided.session.GuidedContracts().parse(inputs);
      for (var rawInput : safeInputs.path("inputs")) {
        var input = (com.fasterxml.jackson.databind.node.ObjectNode) rawInput;
        input
            .putObject("provenance")
            .put("referenceKind", "configuration")
            .put("configurationRevision", "1")
            .put("referenceId", "ref-" + input.path("secretId").asText())
            .put("referenceName", input.path("secretId").asText())
            .put("kind", "secretRef")
            .put("stepId", input.path("sourceStepId").asText());
      }
      safeInputs
          .put("schemaVersion", 3)
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      inputs = safeInputs.toString();
      jdbc.update(
          ("INSERT INTO studio_guided_materializations(session_id,scope_hash,context"
              + "_id,context_revision,materialization_revision,worker_id,owner_fence,sour"
              + "ce_revision,configuration_revision,authored_inputs_hash,authored_inputs,"
              + "live) VALUES ('session',?,'context',1,1,'worker',1,'1','1',?,?::jsonb,true)"),
          HASH,
          GuidedContracts.hash(safeInputs),
          inputs);
    }

    UUID execution() {
      UUID id = UUID.randomUUID();
      Instant accepted = Instant.now();
      jdbc.update(
          ("INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,csi_id,pr"
              + "incipal,environment) VALUES (?,?,'PENDING',?,'CSI',?,'Development')"),
          id,
          testId,
          Timestamp.from(accepted),
          OWNER);
      jdbc.update(
          ("INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,te"
              + "st_id,csi_id,principal) VALUES (?,?,?,'CSI',?)"),
          id,
          Timestamp.from(accepted),
          testId,
          OWNER);
      return id;
    }

    @Override
    public void close() {
      new JdbcTemplate(admin()).execute("DROP DATABASE " + name + " WITH (FORCE)");
    }
  }

  @Test
  void freshInstallReachesHeadWithoutCutoverAndKeepsOrdinaryCapability() throws Exception {
    try (var db = new Database(null)) {
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM flyway_schema_history WHERE version='33' AND success",
                  Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM flyway_schema_history WHERE NOT success", Integer.class))
          .isZero();
      assertThat(Files.exists(Path.of("db/cutover"))).isFalse();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT to_regprocedure('studio_inference_require_request()') IS NULL",
                  Boolean.class))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT to_regclass('studio_schedule_occurrences') IS NULL", Boolean.class))
          .isTrue();
      // Ordinary capability: a plain draft and an unbound execution row are still writable.
      db.execution();
    }
  }

  @Test
  void awaitingAuthAndForgedObservedBindingRowsAreRefusedAtHead() throws Exception {
    // There is no earlier generation to upgrade (D-B), so the former V34 preflight refusals are
    // now direct refusals by the installed constraint and guard; no trigger is ever disabled.
    try (var db = new Database(null)) {
      assertThatThrownBy(() -> db.session("AWAITING_AUTH"))
          .hasMessageContaining("ck_guided_session_state_v3");
    }
    try (var db = new Database(null)) {
      UUID execution = db.execution();
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET observed_revision_binding='{}' WHERE id=?",
                      execution))
          .hasMessageContaining("observed execution identity immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,csi_id,"
                          + "principal,environment,observed_revision_binding) VALUES"
                          + " (?,?,'PENDING',now(),'CSI',?,'Development','{}'::jsonb)",
                      UUID.randomUUID(),
                      db.testId,
                      OWNER))
          .hasMessageContaining("observed execution binding invalid");
    }
  }

  @Test
  void exactV3ProfileAccountFreeScopeAndObservationCountsAreClosed() throws Exception {
    try (var db = new Database(null)) {
      ObjectNode profile =
          (ObjectNode)
              JSON.readTree(
                      Files.readString(
                          Path.of(
                              "../docs/specs/studio-observed-authoring/contracts/v3/replay-profile.schema.json")))
                  .path("properties");
      ObjectNode expected = JSON.createObjectNode();
      profile
          .fields()
          .forEachRemaining(entry -> expected.set(entry.getKey(), entry.getValue().path("const")));
      assertThat(predicate(db, "studio_publication_profile", expected)).isTrue();
      var keys = new ArrayList<String>();
      expected.fieldNames().forEachRemaining(keys::add);
      for (String key : keys) {
        ObjectNode missing = expected.deepCopy();
        missing.remove(key);
        assertThat(predicate(db, "studio_publication_profile", missing))
            .as("missing %s", key)
            .isFalse();
        assertThat(
                predicate(db, "studio_publication_profile", expected.deepCopy().put(key, "wrong")))
            .as("wrong %s", key)
            .isFalse();
      }
      assertThat(
              predicate(db, "studio_publication_profile", expected.deepCopy().put("accountAbi", 1)))
          .isFalse();
      ObjectNode scope =
          JSON.createObjectNode()
              .put("principalId", OWNER)
              .put("csiId", "CSI")
              .put("environment", "Development");
      scope.putArray("capabilities").add("step");
      scope.putObject("initialContext").put("kind", "initialBlank");
      assertThat(predicate(db, "studio_publication_scope", scope)).isTrue();
      assertThat(
              predicate(db, "studio_publication_scope", scope.deepCopy().put("accountRef", "old")))
          .isFalse();
      // ADR-SC-007 (V29): the new shape is an outline plus a facts table keyed by ref.
      ObjectNode observation =
          com.citi.put.checks.studio.support.ObservationFixtures.observation()
              .element("e1", "button", "Continue")
              .line("  - passwordControl")
              .coverage(1, 0, 1)
              .build();
      observation
          .put("sessionId", "session")
          .put("documentId", "doc")
          .put("origin", "https://orders.example.test")
          .put("scopeHash", HASH)
          .put("observedAt", Instant.now().toString());
      assertThat(predicate(db, "studio_publication_observation_shape", observation)).isTrue();
      for (int count : List.of(-1, 501)) {
        ObjectNode invalid = observation.deepCopy();
        ((ObjectNode) invalid.path("coverage")).put("passwordControls", count);
        assertThat(predicate(db, "studio_publication_observation_shape", invalid)).isFalse();
      }
      ObjectNode fractional = observation.deepCopy();
      ((ObjectNode) fractional.path("coverage")).put("passwordControls", 1.5);
      assertThat(predicate(db, "studio_publication_observation_shape", fractional)).isFalse();
      assertThat(
              predicate(
                  db,
                  "studio_publication_observation_shape",
                  observation.deepCopy().put("schemaVersion", 2)))
          .isFalse();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT pg_get_functiondef('studio_publication_attempt_guard()'::regprocedure)",
                  String.class))
          .contains("'schemaVersion'='3'::jsonb");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT pg_get_functiondef('studio_observed_execution_guard()'::regprocedure)",
                  String.class))
          .doesNotContain("accountAuthorization", "accountGrantId")
          .contains("'schemaVersion'='3'::jsonb", "ledger.attempt_id", "ledger.admission_id");
    }
  }

  @Test
  void scopedReleaseUsageRetryAndAppendOnlyRowsNeverContainTheCanary() throws Exception {
    try (var f = publishedRetry()) {
      claim(f);
      var statements = ledger(f);
      UUID firstAttempt = UUID.fromString(f.original.path("attemptId").asText());
      f.db.tx.executeWithoutResult(
          t ->
              assertThat(statements.beginObservedDispatch(f.id, "worker", firstAttempt))
                  .isEqualTo(1));
      var release = replayRelease(f, Instant.now(), 1);
      insert(f.db.jdbc, release);
      var usage = usage(release, "USED");
      insert(f.db.jdbc, usage);
      assertThat(statements.returnAfterDefiniteRefusal(f.id, firstAttempt)).isEqualTo(1);
      claim(f);
      var changed = freshRetry(f, f.original);
      refresh(f, changed, "worker");
      f.db.tx.executeWithoutResult(
          t ->
              assertThat(
                      statements.beginObservedDispatch(
                          f.id, "worker", UUID.fromString(changed.path("attemptId").asText())))
                  .isEqualTo(1));
      var retry = replayRelease(f, Instant.now(), 2);
      retry.put("attempt_id", changed.path("attemptId").asText());
      insert(f.db.jdbc, retry);
      assertThat(
              f.db.jdbc.queryForObject(
                  "SELECT count(DISTINCT attempt_id) FROM studio_secret_use_audit WHERE"
                      + " row_kind='RELEASE'",
                  Integer.class))
          .isEqualTo(2);
      for (String column :
          List.of(
              "principal_id",
              "environment",
              "secret_id",
              "attempt_id",
              "vault_version",
              "coordinate_step_id")) {
        var wrong = usage(retry, "NOT_USED");
        wrong.put(column, "wrong");
        assertThatThrownBy(() -> insert(f.db.jdbc, wrong))
            .as("wrong %s", column)
            .hasMessageContaining("mismatch");
      }
      var missing = usage(retry, "NOT_USED");
      missing.put("release_id", UUID.randomUUID());
      assertThatThrownBy(() -> insert(f.db.jdbc, missing))
          .hasMessageContaining("release locator missing");
      insert(f.db.jdbc, usage(retry, "NOT_USED"));
      assertThatThrownBy(() -> insert(f.db.jdbc, usage(release, "USED")))
          .isInstanceOf(RuntimeException.class);
      for (String statement :
          List.of(
              "UPDATE studio_secret_use_audit SET secret_id='CHANGED'",
              "DELETE FROM studio_secret_use_audit",
              "TRUNCATE studio_secret_use_audit")) {
        assertThatThrownBy(() -> f.db.jdbc.execute(statement)).hasMessageContaining("append-only");
      }
      assertThat(
              f.db.jdbc.queryForObject(
                  "SELECT string_agg(to_jsonb(a)::text,'') FROM studio_secret_use_audit a",
                  String.class))
          .doesNotContain("planted-secret-value-canary");
      assertThat(
              f.db.jdbc.queryForList(
                  "SELECT column_name FROM information_schema.columns WHERE"
                      + " table_name='studio_secret_use_audit'",
                  String.class))
          .doesNotContain("value", "payload", "document", "diagnostic");
    }
  }

  @Test
  void unreachedNotUsedHasNoFabricatedResolutionAndRejectsOtherNullableVariants() {
    try (var db = new Database(null)) {
      db.session("FAILED");
      var absent = release(db, Instant.now(), "session:1", 1);
      absent.put("row_kind", "USAGE");
      for (String key :
          List.of("outcome", "release_id", "admission_id", "vault_version", "decision_stage")) {
        absent.put(key, null);
      }
      absent.put("usage_outcome", "NOT_USED");
      absent.put("release_seq", null);
      absent.put("coordinate_ordinal", null);
      absent.put("source_reference_id", "ref-PASS");
      insert(db, absent);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='RELEASE'",
                  Integer.class))
          .isZero();
      assertThatThrownBy(() -> insert(db, absent)).isInstanceOf(RuntimeException.class);
      for (String mutation : List.of("USED", "REFUSED")) {
        var wrong = new LinkedHashMap<>(absent);
        wrong.put("id", UUID.randomUUID());
        wrong.put("attempt_id", mutation);
        wrong.put("usage_outcome", mutation);
        assertThatThrownBy(() -> insert(db, wrong))
            .hasMessageContaining("consumed no-decision evidence invalid");
      }
      db.action();
      db.action("unused-admission", "unused-step", "unused-preparation", "input-UNREACHED");
      var nullRelease = release(db, Instant.now(), "session:1", 2);
      nullRelease.put("secret_id", "UNREACHED");
      nullRelease.put("coordinate_step_id", "unused-step");
      nullRelease.put("admission_id", "unused-admission");
      nullRelease.put("outcome", null);
      assertThatThrownBy(() -> insert(db, nullRelease))
          .hasMessageContaining("ck_secret_audit_row_shape");
      var real = new LinkedHashMap<>(nullRelease);
      real.put("id", UUID.randomUUID());
      real.put("release_id", real.get("id"));
      real.put("outcome", "RESOLVED");
      insert(db, real);
      var nullUsage = usage(real, "NOT_USED");
      nullUsage.put("outcome", null);
      assertThatThrownBy(() -> insert(db, nullUsage)).hasMessageContaining("outcome");
    }
  }

  @Test
  void liveRecheckIsUniqueAndPreservesOneTerminalUsageAndWriteOnceRevocation() {
    try (var db = new Database(null)) {
      db.session("ACTING");
      db.action();
      var original = release(db, Instant.now(), "session:1", 1);
      insert(db, original);
      insert(db, usage(original, "USED"));
      var recheck = recheck(original);
      insert(db, recheck);
      assertThatThrownBy(() -> insert(db, recheck(original))).isInstanceOf(RuntimeException.class);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                  Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                  String.class))
          .isEqualTo("USED");
      UUID execution = db.execution();
      for (String table : List.of("studio_guided_sessions", "studio_dispatch_ledger")) {
        String condition =
            table.endsWith("sessions")
                ? "session_id='session'"
                : "execution_id='" + execution + "'";
        db.jdbc.execute("UPDATE " + table + " SET revoked_at=now() WHERE " + condition);
        assertThatThrownBy(
                () ->
                    db.jdbc.execute("UPDATE " + table + " SET revoked_at=NULL WHERE " + condition))
            .hasMessageContaining("write-once");
        assertThatThrownBy(
                () ->
                    db.jdbc.execute(
                        "UPDATE "
                            + table
                            + " SET revoked_at=now()+interval '1 second' WHERE "
                            + condition))
            .hasMessageContaining("write-once");
      }
    }
  }

  @Test
  void concurrentUsageSummariesHaveExactlyOneWinner() throws Exception {
    for (String kind : List.of("linked", "unreached", "live-recheck")) {
      try (var db = new Database(null);
          var executor = Executors.newFixedThreadPool(2)) {
        db.session("unreached".equals(kind) ? "FAILED" : "ACTING");
        if (!"unreached".equals(kind)) {
          db.action();
        }
        var original = release(db, Instant.now(), "session:1", 1);
        if (!"unreached".equals(kind)) {
          insert(db, original);
        }
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<java.util.concurrent.Future<Boolean>>();
        for (int i = 0; i < 2; i++) {
          results.add(
              executor.submit(
                  () -> {
                    ready.countDown();
                    if (!start.await(5, TimeUnit.SECONDS)) {
                      throw new IllegalStateException("concurrency barrier timed out");
                    }
                    try {
                      Map<String, Object> candidate;
                      if ("live-recheck".equals(kind)) {
                        candidate = recheck(original);
                      } else if ("unreached".equals(kind)) {
                        candidate = usage(original, "NOT_USED");
                        candidate.put("release_occurred_at", candidate.get("occurred_at"));
                        candidate.put("release_seq", null);
                        candidate.put("coordinate_ordinal", null);
                        candidate.put("source_reference_id", "ref-PASS");
                        for (String key :
                            List.of("release_id", "outcome", "admission_id", "vault_version")) {
                          candidate.put(key, null);
                        }
                      } else {
                        candidate = usage(original, "USED");
                      }
                      insert(db, candidate);
                      return true;
                    } catch (RuntimeException expected) {
                      assertThat(expected.getMessage()).containsAnyOf("duplicate", "unique");
                      return false;
                    }
                  }));
        }
        assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
        start.countDown();
        int winners = 0;
        for (var result : results) {
          if (result.get(10, TimeUnit.SECONDS)) {
            winners++;
          }
        }
        assertThat(winners).isEqualTo(1);
      }
    }
  }

  @Test
  void replayUsageUsesClosedCodesAndTheActualExecutionScope() throws Exception {
    try (var f = publishedRetry()) {
      claim(f);
      var release = replayRelease(f, Instant.now(), 1);
      insert(f.db.jdbc, release);
      var wrongScope = usage(release, "USED");
      wrongScope.put("environment", "Production");
      assertThatThrownBy(() -> insert(f.db.jdbc, wrongScope))
          .hasMessageContaining("execution scope mismatch");
      var ledgerCode = usage(release, "OK");
      assertThatThrownBy(() -> insert(f.db.jdbc, ledgerCode))
          .hasMessageContaining("check constraint");
      insert(f.db.jdbc, usage(release, "REFUSED"));
      assertThat(
              f.db.jdbc.queryForObject(
                  "SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                  String.class))
          .isEqualTo("REFUSED");
    }
  }

  @Test
  void ordinaryWriterCannotAlterOrDropRetentionPartitions() throws Exception {
    try (var db = new Database(null)) {
      db.session("ACTING");
      db.action();
      var release = release(db, Instant.now(), "session:1", 1);
      insert(db, release);
      String role = "audit_writer_" + UUID.randomUUID().toString().replace("-", "");
      db.jdbc.execute("CREATE ROLE " + role + " NOLOGIN");
      try {
        db.jdbc.execute("GRANT USAGE ON SCHEMA public TO " + role);
        // Even accidental UPDATE/DELETE grants cannot bypass the append-only trigger.
        db.jdbc.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON studio_secret_use_audit TO " + role);
        db.jdbc.execute(
            ("GRANT SELECT ON studio_guided_sessions,studio_guided_actions,studio_guid"
                    + "ed_materializations,studio_guided_materialization_snapshots,studio_guided_source_manifests,"
                    + "studio_dispatch_ledge"
                    + "r,ui_test_executions TO ")
                + role);
        db.jdbc.execute("GRANT UPDATE ON studio_guided_sessions,studio_dispatch_ledger TO " + role);
        String partition =
            db.jdbc.queryForObject(
                "SELECT tableoid::regclass::text FROM studio_secret_use_audit LIMIT 1",
                String.class);
        try (Connection connection = db.ds.getConnection();
            var statement = connection.createStatement()) {
          statement.execute("SET ROLE " + role);
          insert(connection, usage(release, "USED"));
          assertThatThrownBy(
                  () -> statement.execute("UPDATE studio_secret_use_audit SET secret_id='CHANGED'"))
              .hasMessageContaining("append-only");
          assertThatThrownBy(() -> statement.execute("DELETE FROM studio_secret_use_audit"))
              .hasMessageContaining("append-only");
          assertThatThrownBy(
                  () ->
                      statement.execute(
                          "ALTER TABLE studio_secret_use_audit DETACH PARTITION " + partition))
              .hasMessageContaining("must be owner");
          assertThatThrownBy(() -> statement.execute("DROP TABLE " + partition))
              .hasMessageContaining("must be owner");
          statement.execute("RESET ROLE");
        }
      } finally {
        db.jdbc.execute("DROP OWNED BY " + role);
        db.jdbc.execute("DROP ROLE " + role);
      }
    }
  }

  @Test
  void crossMonthUsageAndLiveRecheckExpireWithReleaseWhileUnlinkedUsageKeepsOwnMonth() {
    try (var db = new Database(null)) {
      db.session("ACTING");
      db.action();
      LocalDate month = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
      String oldPartition =
          "studio_secret_use_audit_"
              + month.minusMonths(13).toString().substring(0, 7).replace('-', '_');
      db.jdbc.execute(
          "CREATE TABLE "
              + oldPartition
              + " PARTITION OF studio_secret_use_audit FOR VALUES FROM ('"
              + month.minusMonths(13)
              + "') TO ('"
              + month.minusMonths(12)
              + "')");
      Instant releaseTime =
          month.minusMonths(12).atStartOfDay().toInstant(ZoneOffset.UTC).minusSeconds(1);
      var original = release(db, releaseTime, "session:1", 1);
      insert(db, original);
      var usage = usage(original, "USED");
      usage.put("occurred_at", releaseTime.plusSeconds(2));
      insert(db, usage);
      var recheck = recheck(original);
      recheck.put("occurred_at", releaseTime.plusSeconds(3));
      insert(db, recheck);
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM " + oldPartition, Integer.class))
          .isEqualTo(3);
      db.jdbc.update(
          ("UPDATE studio_guided_sessions SET "
              + "state='FAILED',document=jsonb_set(document,'{state}','\"FAILED\"') WHERE "
              + "session_id='session'"));
      var absent = release(db, Instant.now(), "session:1", 2);
      absent.put("secret_id", "UNREACHED");
      absent.put("release_seq", null);
      absent.put("coordinate_ordinal", null);
      absent.put("source_reference_id", "ref-UNREACHED");
      absent.put("coordinate_step_id", "unused-step");
      absent.put("row_kind", "USAGE");
      for (String key :
          List.of("outcome", "release_id", "admission_id", "vault_version", "decision_stage")) {
        absent.put(key, null);
      }
      absent.put("usage_outcome", "NOT_USED");
      insert(db, absent);
      db.jdbc.execute("ALTER TABLE studio_secret_use_audit DETACH PARTITION " + oldPartition);
      db.jdbc.execute("DROP TABLE " + oldPartition);
      assertThat(
              db.jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT usage_outcome FROM studio_secret_use_audit", String.class))
          .isEqualTo("NOT_USED");
      // A freshly-created old partition cannot make a pruned RELEASE locator real again.
      db.jdbc.execute(
          "CREATE TABLE "
              + oldPartition
              + " PARTITION OF studio_secret_use_audit FOR VALUES FROM ('"
              + month.minusMonths(13)
              + "') TO ('"
              + month.minusMonths(12)
              + "')");
      assertThatThrownBy(() -> insert(db, usage(original, "NOT_USED")))
          .hasMessageContaining("release locator missing");
    }
  }

  private static DriverManagerDataSource admin() {
    return new DriverManagerDataSource(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
  }

  private static boolean predicate(Database db, String function, ObjectNode document) {
    return Boolean.TRUE.equals(
        db.jdbc.queryForObject(
            "SELECT " + function + "(?::jsonb)", Boolean.class, document.toString()));
  }

  private static Map<String, Object> release(
      Database db, Instant time, String attempt, long sequence) {
    var row = new LinkedHashMap<String, Object>();
    UUID id = UUID.randomUUID();
    row.put("id", id);
    row.put("release_id", id);
    row.put("occurred_at", time);
    row.put("release_occurred_at", time);
    row.put("path", "GUIDED");
    row.put("row_kind", "RELEASE");
    row.put("decision_stage", "DISPATCH");
    row.put("attempt_id", attempt);
    row.put("release_seq", sequence);
    row.put("session_id", "session");
    row.put("admission_id", "admission");
    row.put("principal_id", OWNER);
    row.put("csi_id", "CSI");
    row.put("environment", "Development");
    row.put("test_id", db.testId);
    row.put("secret_id", "PASS");
    row.put("vault_version", "version-one");
    row.put("coordinate_step_id", "password-step");
    row.put("coordinate_ordinal", 0);
    row.put("outcome", "RESOLVED");
    return row;
  }

  private static Map<String, Object> replayRelease(RetryFixture f, Instant time, long sequence) {
    var row = new LinkedHashMap<String, Object>();
    UUID id = UUID.randomUUID();
    row.put("id", id);
    row.put("release_id", id);
    row.put("occurred_at", time);
    row.put("release_occurred_at", time);
    row.put("path", "OBSERVED_REPLAY");
    row.put("row_kind", "RELEASE");
    row.put("decision_stage", "DISPATCH");
    row.put("attempt_id", f.original.path("attemptId").asText());
    row.put("release_seq", sequence);
    row.put("execution_id", f.id);
    row.put("principal_id", OWNER);
    row.put("csi_id", "CSI");
    row.put("environment", "Development");
    row.put("test_id", f.db.testId);
    row.put("secret_id", "PASS");
    row.put("vault_version", "version-one");
    row.put("outcome", "RESOLVED");
    return row;
  }

  private static Map<String, Object> usage(Map<String, Object> release, String outcome) {
    var row = new LinkedHashMap<>(release);
    row.put("id", UUID.randomUUID());
    row.put("row_kind", "USAGE");
    row.put("decision_stage", null);
    row.put("occurred_at", ((Instant) release.get("occurred_at")).plusMillis(1));
    row.put("usage_outcome", outcome);
    return row;
  }

  private static Map<String, Object> recheck(Map<String, Object> release) {
    var row = new LinkedHashMap<>(release);
    UUID id = UUID.randomUUID();
    row.put("id", id);
    row.put("release_id", id);
    row.put("affected_release_id", release.get("id"));
    row.put("decision_stage", "LIVE_RECHECK");
    row.put("outcome", "REVOKED_MID_RUN");
    row.put("occurred_at", ((Instant) release.get("occurred_at")).plusMillis(1));
    return row;
  }

  private static void insert(Database db, Map<String, Object> row) {
    insert(db.jdbc, row);
  }

  private static void insert(JdbcTemplate jdbc, Map<String, Object> row) {
    String sql =
        "INSERT INTO studio_secret_use_audit("
            + String.join(",", row.keySet())
            + ") VALUES ("
            + String.join(",", java.util.Collections.nCopies(row.size(), "?"))
            + ")";
    jdbc.update(
        connection -> {
          PreparedStatement statement = connection.prepareStatement(sql);
          int index = 1;
          for (Object value : row.values()) {
            statement.setObject(
                index++, value instanceof Instant instant ? Timestamp.from(instant) : value);
          }
          return statement;
        });
  }

  private static void insert(Connection connection, Map<String, Object> row)
      throws java.sql.SQLException {
    String sql =
        "INSERT INTO studio_secret_use_audit("
            + String.join(",", row.keySet())
            + ") VALUES ("
            + String.join(",", java.util.Collections.nCopies(row.size(), "?"))
            + ")";
    try (PreparedStatement statement = connection.prepareStatement(sql)) {
      int index = 1;
      for (Object value : row.values()) {
        statement.setObject(
            index++, value instanceof Instant instant ? Timestamp.from(instant) : value);
      }
      statement.executeUpdate();
    }
  }

  public record RetryFixture(
      GuidedPublicationMigrationTest.Database db, UUID id, ObjectNode original)
      implements AutoCloseable {
    public JdbcTemplate jdbc() {
      return db.jdbc;
    }

    public org.springframework.transaction.support.TransactionTemplate transaction() {
      return db.tx;
    }

    public UUID testId() {
      return db.testId;
    }

    @Override
    public void close() {
      db.close();
    }
  }

  /**
   * Controlled relational publication lineage with every SQL guard active; not a
   * live-validator/browser claim.
   */
  public static RetryFixture publishedRetry() throws Exception {
    return publishedRetry(List.of("PASS"));
  }

  public static RetryFixture publishedRetry(List<String> secretIds) throws Exception {
    var db = new GuidedPublicationMigrationTest.Database(secretIds);
    var base = db.capture();
    db.finalizing();
    var raw = db.snapshot(base);
    var basis = (ObjectNode) raw.basis();
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    var lowered = new ObservedArtifactLowerer(C).lower(basis, profile);
    var learned = (ObjectNode) lowered.learnedPlan();
    var policy = (ObjectNode) lowered.policy();
    var artifact = (ObjectNode) lowered.artifact();
    var hashes = (ObjectNode) lowered.hashes();
    var identity =
        PublicationContracts.copy(raw.identity()).put("basisHash", GuidedContracts.hash(basis));
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "profileHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(key, hashes.path(key));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(build));
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    var attempt =
        db.tx.execute(
            t -> {
              db.sessions.lock("session");
              return db.publications.reserve(
                  new PublicationContracts.Claim("session", "final", "d".repeat(64), snapshot),
                  Instant.now());
            });
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock("session");
          db.publications.claim(
              "session", attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });
    var verdict =
        C.object()
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, hashes.path(key));
    }
    verdict.put("schemaVersion", 3);
    verdict.set("admissionProvenanceHash", hashes.path("admissionProvenanceHash"));
    verdict.set("profile", profile);
    verdict.set("build", build);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock("session");
          db.publications.finish(
              "session",
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              Instant.now());
        });
    var candidate = new PublicationContracts.Candidate(learned, artifact, policy, hashes);
    var grant =
        new PublicationContracts.Grant(
            "session", "owner@example.test", "CSI", snapshot.hash(), attempt.validationDeadline());
    var command =
        new PublicationContracts.Commit(
            "session",
            UUID.randomUUID(),
            attempt.attemptId(),
            attempt.claimId(),
            "final",
            "d".repeat(64),
            snapshot,
            candidate,
            grant);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock("session");
          db.publications.commit(command, Instant.now());
          db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
        });
    Instant started = GuidedPublicationMigrationTest.databaseNow(db.jdbc);
    UUID execution = UUID.randomUUID(), attemptId = UUID.randomUUID();
    var scope =
        PublicationContracts.copy(base.document().path("replayRequirements"))
            .put("principalId", OWNER);
    var replayGrant =
        C.object()
            .put("version", 1)
            .put("grantId", UUID.randomUUID().toString())
            .put("executionId", execution.toString())
            .put("attemptId", attemptId.toString())
            .put("revisionId", command.revisionId().toString())
            .put("revisionDigest", hashes.path("revisionDigest").asText())
            .put("principalId", OWNER)
            .put("csiId", "CSI")
            .put("scopeHash", GuidedContracts.hash(scope))
            .put("profileHash", GuidedContracts.hash(profile))
            .put("buildHash", GuidedContracts.hash(build))
            .put("issuedAt", PublicationContracts.time(started))
            .put("expiresAt", PublicationContracts.time(started.plusSeconds(25)));
    var binding =
        C.object()
            .put("version", 1)
            .put("executionId", execution.toString())
            .put("startedAt", PublicationContracts.time(started))
            .put("attemptId", attemptId.toString())
            .put("revisionId", command.revisionId().toString())
            .put("testId", db.testId.toString())
            .put("csiId", "CSI")
            .put("principalId", OWNER)
            .put("environment", "Development")
            .put("scopeHash", GuidedContracts.hash(scope));
    for (String key :
        List.of(
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash")) {
      binding.set(key, hashes.path(key));
    }
    binding.set("requiredProfile", profile);
    binding.set("requiredBuild", build);
    binding.set("scope", scope);
    binding.set("replayGrant", replayGrant);
    db.jdbc.update(
        ("INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,revision_"
            + "id,csi_id,principal,environment,observed_revision_binding) VALUES "
            + "(?,?,'PENDING',?,?,'CSI',?,'Development',?::jsonb)"),
        execution,
        db.testId,
        Timestamp.from(started),
        command.revisionId(),
        OWNER,
        binding.toString());
    db.jdbc.update(
        ("INSERT INTO studio_dispatch_ledger(execution_id,execution_accepted_at,te"
            + "st_id,csi_id,principal,pending_deadline_at) VALUES "
            + "(?,?,?,'CSI',?,now()+interval '5 minutes')"),
        execution,
        Timestamp.from(started),
        db.testId,
        OWNER);
    return new RetryFixture(db, execution, binding);
  }

  /** Report-boundary fixture using the caller's actual Spring datasource/transaction manager. */
  public static RetryFixture publishedRetry(
      JdbcTemplate sharedJdbc,
      org.springframework.transaction.support.TransactionTemplate sharedTransactions,
      String fixtureNamespace,
      ObjectNode canonicalObservedBasis,
      ObjectNode requiredProfile,
      ObjectNode requiredBuild)
      throws Exception {
    var db =
        new GuidedPublicationMigrationTest.Database(
            sharedJdbc, sharedTransactions, fixtureNamespace, canonicalObservedBasis);
    String sessionId = db.fixtureSession();
    var base = db.capture();
    db.finalizing();
    var raw = db.snapshot(base);
    var basis = (ObjectNode) raw.basis();
    var profile = requiredProfile.deepCopy();
    var build = requiredBuild.deepCopy();
    C.validate("v3/replay-profile", profile);
    C.validate("v3/replay-profile#/definitions/BuildIdentity", build);
    assertThat(build.path("profileHash").asText()).isEqualTo(GuidedContracts.hash(profile));
    var candidate = new ObservedArtifactLowerer(C).lower(basis, profile);
    var artifact = (ObjectNode) candidate.artifact();
    C.validate("v3/replay-artifact", artifact);
    var hashes = (ObjectNode) candidate.hashes();
    var catalog = C.object().putArray("catalog");
    catalog.addObject().set("profile", profile);
    ((ObjectNode) catalog.get(0)).set("build", build);
    var identity =
        PublicationContracts.copy(raw.identity()).put("basisHash", GuidedContracts.hash(basis));
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "profileHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      identity.set(key, hashes.path(key));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(build));
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    var attempt =
        db.tx.execute(
            t -> {
              db.sessions.lock(sessionId);
              return db.publications.reserve(
                  new PublicationContracts.Claim(sessionId, "final", "d".repeat(64), snapshot),
                  Instant.now());
            });
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(sessionId);
          db.publications.claim(
              sessionId, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });
    var verdict =
        C.object()
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, hashes.path(key));
    }
    verdict.put("schemaVersion", 3);
    verdict.set("admissionProvenanceHash", hashes.path("admissionProvenanceHash"));
    verdict.set("profile", profile);
    verdict.set("build", build);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(sessionId);
          db.publications.finish(
              sessionId,
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              Instant.now());
        });
    // Candidate remains the complete, unmodified result of the original production lowerer.
    var grant =
        new PublicationContracts.Grant(
            sessionId,
            "owner@example.test",
            base.document().path("csiId").asText(),
            snapshot.hash(),
            attempt.validationDeadline());
    var command =
        new PublicationContracts.Commit(
            sessionId,
            UUID.randomUUID(),
            attempt.attemptId(),
            attempt.claimId(),
            "final",
            "d".repeat(64),
            snapshot,
            candidate,
            grant);
    db.tx.executeWithoutResult(
        t -> {
          db.sessions.lock(sessionId);
          db.publications.commit(command, Instant.now());
          db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
        });
    Instant started = GuidedPublicationMigrationTest.databaseNow(db.jdbc);
    UUID execution = UUID.randomUUID(), attemptId = UUID.randomUUID();
    var scope =
        PublicationContracts.copy(base.document().path("replayRequirements"))
            .put("principalId", OWNER);
    var replayGrant =
        C.object()
            .put("version", 1)
            .put("grantId", UUID.randomUUID().toString())
            .put("executionId", execution.toString())
            .put("attemptId", attemptId.toString())
            .put("revisionId", command.revisionId().toString())
            .put("revisionDigest", hashes.path("revisionDigest").asText())
            .put("principalId", OWNER)
            .put("csiId", base.document().path("csiId").asText())
            .put("scopeHash", GuidedContracts.hash(scope))
            .put("profileHash", GuidedContracts.hash(profile))
            .put("buildHash", GuidedContracts.hash(build))
            .put("issuedAt", PublicationContracts.time(started))
            .put("expiresAt", PublicationContracts.time(started.plusSeconds(25)));
    var binding =
        C.object()
            .put("version", 1)
            .put("executionId", execution.toString())
            .put("startedAt", PublicationContracts.time(started))
            .put("attemptId", attemptId.toString())
            .put("revisionId", command.revisionId().toString())
            .put("testId", db.testId.toString())
            .put("csiId", base.document().path("csiId").asText())
            .put("principalId", OWNER)
            .put("environment", scope.path("environment").asText())
            .put("scopeHash", GuidedContracts.hash(scope));
    for (String key :
        List.of(
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash")) {
      binding.set(key, hashes.path(key));
    }
    binding.set("requiredProfile", profile);
    binding.set("requiredBuild", build);
    binding.set("scope", scope);
    binding.set("replayGrant", replayGrant);
    String committedSource =
        db.jdbc.queryForObject(
            "SELECT source::text FROM ui_test_revisions WHERE id=?",
            String.class,
            command.revisionId());
    List<String> sourceSteps =
        com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseSteps(committedSource);
    var pendingSteps = new ArrayList<com.citi.put.checks.studio.dto.StepResult>();
    for (int index = 0; index < sourceSteps.size(); index++) {
      pendingSteps.add(
          com.citi.put.checks.studio.dto.StepResult.pending(index, sourceSteps.get(index)));
    }
    db.jdbc.update(
        ("INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,"
                + "revision_id,csi_id,principal,environment,"
                + "observed_revision_binding,step_results) ")
            + "VALUES (?,?,'PENDING',?,?,?,?,?,?::jsonb,?::jsonb)",
        execution,
        db.testId,
        Timestamp.from(started),
        command.revisionId(),
        scope.path("csiId").asText(),
        OWNER,
        scope.path("environment").asText(),
        binding.toString(),
        JSON.writeValueAsString(pendingSteps));
    db.jdbc.update(
        ("INSERT INTO studio_dispatch_ledger(execution_id,"
                + "execution_accepted_at,test_id,csi_id,principal,"
                + "pending_deadline_at) ")
            + "VALUES (?,?,?,?,?,now()+interval '5 minutes')",
        execution,
        Timestamp.from(started),
        db.testId,
        scope.path("csiId").asText(),
        OWNER);
    return new RetryFixture(db, execution, binding);
  }

  private static ObjectNode freshRetry(RetryFixture f, ObjectNode original) {
    var changed = original.deepCopy();
    String attempt = UUID.randomUUID().toString();
    changed.put("attemptId", attempt);
    var grant = (ObjectNode) changed.path("replayGrant");
    Instant now = GuidedPublicationMigrationTest.databaseNow(f.jdbc());
    grant
        .put("attemptId", attempt)
        .put("grantId", UUID.randomUUID().toString())
        .put("issuedAt", PublicationContracts.time(now))
        .put("expiresAt", PublicationContracts.time(now.plusSeconds(25)));
    return changed;
  }

  private static void refresh(RetryFixture f, ObjectNode binding, String owner) {
    f.db.tx.executeWithoutResult(
        status -> {
          f.db.jdbc.queryForList(
              "SELECT execution_id FROM studio_dispatch_ledger WHERE execution_id=? FOR UPDATE",
              f.id);
          f.db.jdbc.queryForObject(
              "SELECT set_config('studio.observed_retry_owner',?,true)", String.class, owner);
          f.db.jdbc.update(
              "UPDATE ui_test_executions SET observed_revision_binding=?::jsonb WHERE id=?",
              binding.toString(),
              f.id);
        });
  }

  private static com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements ledger(
      RetryFixture f) {
    var statements =
        new com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements(f.db.jdbc);
    statements.installSecretAudit(
        new com.citi.put.checks.studio.secrets.SecretAuditLifecycle(
            f.db.jdbc, new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder(f.db.jdbc)));
    return statements;
  }

  private static void claim(RetryFixture f) {
    assertThat(ledger(f).claim(f.id, "worker", Instant.now().plusSeconds(60), Instant.now()))
        .isEqualTo(1);
  }

  private static void refuse(RetryFixture f) {
    claim(f);
    UUID attempt = UUID.fromString(f.original.path("attemptId").asText());
    assertThat(ledger(f).beginObservedDispatch(f.id, "worker", attempt)).isEqualTo(1);
    assertThat(ledger(f).returnAfterDefiniteRefusal(f.id, attempt)).isEqualTo(1);
    claim(f);
  }

  @Test
  void definiteRefusalAllowsOnlyOneOwnedFreshAttemptAndKeepsAcceptedIdentities() throws Exception {
    try (var f = publishedRetry()) {
      claim(f);
      assertThatThrownBy(() -> refresh(f, freshRetry(f, f.original), "worker"))
          .hasMessageContaining("immutable");
      UUID prior = UUID.fromString(f.original.path("attemptId").asText());
      assertThat(ledger(f).beginObservedDispatch(f.id, "worker", prior)).isEqualTo(1);
      assertThatThrownBy(() -> refresh(f, freshRetry(f, f.original), "worker"))
          .hasMessageContaining("immutable");
      assertThat(ledger(f).returnAfterDefiniteRefusal(f.id, prior)).isEqualTo(1);
      claim(f);
      var valid = freshRetry(f, f.original);
      assertThatThrownBy(() -> refresh(f, valid, "other-worker")).hasMessageContaining("immutable");
      for (String field :
          List.of("scopeHash", "artifactHash", "learnedPlanHash", "publicationEvidenceHash")) {
        var wrong = valid.deepCopy().put(field, "0".repeat(64));
        assertThatThrownBy(() -> refresh(f, wrong, "worker")).hasMessageContaining("immutable");
      }
      var oldAttempt = valid.deepCopy().put("attemptId", prior.toString());
      ((ObjectNode) oldAttempt.path("replayGrant")).put("attemptId", prior.toString());
      assertThatThrownBy(() -> refresh(f, oldAttempt, "worker")).hasMessageContaining("immutable");
      var oldNonce = valid.deepCopy();
      ((ObjectNode) oldNonce.path("replayGrant"))
          .set("grantId", f.original.path("replayGrant").path("grantId"));
      assertThatThrownBy(() -> refresh(f, oldNonce, "worker")).hasMessageContaining("immutable");
      var longGrant = valid.deepCopy();
      ((ObjectNode) longGrant.path("replayGrant"))
          .put(
              "expiresAt",
              PublicationContracts.time(
                  Instant.parse(longGrant.path("replayGrant").path("issuedAt").asText())
                      .plusSeconds(31)));
      assertThatThrownBy(() -> refresh(f, longGrant, "worker"))
          .hasMessageContaining("grant invalid");
      f.db.jdbc.update(
          ("UPDATE studio_dispatch_ledger SET lease_expires_at=now()-interval '1 "
              + "second' WHERE execution_id=?"),
          f.id);
      assertThatThrownBy(() -> refresh(f, valid, "worker")).hasMessageContaining("immutable");
      f.db.jdbc.update(
          ("UPDATE studio_dispatch_ledger SET lease_expires_at=now()+interval '1 "
              + "minute' WHERE execution_id=?"),
          f.id);
      refresh(f, valid, "worker");
      var stored =
          JSON.readTree(
              f.db.jdbc.queryForObject(
                  "SELECT observed_revision_binding::text FROM ui_test_executions WHERE id=?",
                  String.class,
                  f.id));
      assertThat(stored).isEqualTo(valid);
      assertThatThrownBy(() -> refresh(f, freshRetry(f, valid), "worker"))
          .hasMessageContaining("immutable");
      assertThat(
              ledger(f)
                  .beginObservedDispatch(
                      f.id, "worker", UUID.fromString(valid.path("attemptId").asText())))
          .isEqualTo(1);
      assertThat(
              f.db.jdbc.queryForObject(
                  ("SELECT definite_refusal_attempt_id IS NULL AND "
                      + "zero_send_decision_attempt_id IS NULL FROM studio_dispatch_ledger WHERE "
                      + "execution_id=?"),
                  Boolean.class,
                  f.id))
          .isTrue();
      assertThatThrownBy(() -> refresh(f, freshRetry(f, valid), "worker"))
          .hasMessageContaining("immutable");
    }
  }

  @Test
  void realNoSendOutageDecisionGrantsDifferentAuthorityAndCannotBeFabricated() throws Exception {
    try (var f = publishedRetry()) {
      claim(f);
      UUID attempt = UUID.fromString(f.original.path("attemptId").asText());
      assertThat(ledger(f).releaseObservedOutageClaim(f.id, "worker", attempt)).isZero();
      var recorder = new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder(f.db.jdbc);
      var scope =
          new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Scope(
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Path.OBSERVED_REPLAY,
              f.id,
              null,
              null,
              OWNER,
              "CSI",
              "Development",
              f.db.testId,
              "PASS",
              attempt.toString(),
              1,
              null,
              null);
      f.db.tx.executeWithoutResult(
          status -> {
            recorder.recordRelease(
                scope,
                null,
                com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                    .VAULT_UNAVAILABLE);
            assertThat(ledger(f).releaseObservedOutageClaim(f.id, "worker", attempt)).isEqualTo(1);
          });
      assertThat(
              f.db.jdbc.queryForObject(
                  ("SELECT definite_refusal_attempt_id IS NULL AND "
                      + "zero_send_decision_attempt_id=? FROM studio_dispatch_ledger WHERE "
                      + "execution_id=?"),
                  Boolean.class,
                  attempt,
                  f.id))
          .isTrue();
      claim(f);
      var fresh = freshRetry(f, f.original);
      refresh(f, fresh, "worker");
      UUID second = UUID.fromString(fresh.path("attemptId").asText());
      var nextScope =
          new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Scope(
              com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Path.OBSERVED_REPLAY,
              f.id,
              null,
              null,
              OWNER,
              "CSI",
              "Development",
              f.db.testId,
              "PASS",
              second.toString(),
              2,
              null,
              null);
      f.db.tx.executeWithoutResult(
          status -> {
            recorder.recordRelease(
                nextScope,
                null,
                com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                    .VAULT_UNAVAILABLE);
            assertThat(ledger(f).releaseObservedOutageClaim(f.id, "worker", second)).isEqualTo(1);
          });
      claim(f);
      var third = freshRetry(f, fresh);
      refresh(f, third, "worker");
      assertThat(
              ledger(f)
                  .beginObservedDispatch(
                      f.id, "worker", UUID.fromString(third.path("attemptId").asText())))
          .isEqualTo(1);
      assertThat(
              f.db.jdbc.queryForObject(
                  ("SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND "
                      + "outcome='VAULT_UNAVAILABLE'"),
                  Integer.class,
                  f.id))
          .isEqualTo(2);
      assertThat(
              ledger(f)
                  .releaseObservedOutageClaim(
                      f.id, "worker", UUID.fromString(third.path("attemptId").asText())))
          .isZero();
    }
  }

  @Test
  void concurrentRetryRefreshersHaveExactlyOneWinner() throws Exception {
    try (var f = publishedRetry();
        var pool = Executors.newFixedThreadPool(2)) {
      refuse(f);
      var ready = new CountDownLatch(2);
      var go = new CountDownLatch(1);
      var futures =
          List.of(0, 1).stream()
              .map(
                  n ->
                      pool.submit(
                          () -> {
                            var candidate = freshRetry(f, f.original);
                            ready.countDown();
                            if (!go.await(5, TimeUnit.SECONDS)) {
                              throw new IllegalStateException("race timeout");
                            }
                            try {
                              refresh(f, candidate, "worker");
                              return true;
                            } catch (org.springframework.dao.DataAccessException denied) {
                              return false;
                            }
                          }))
              .toList();
      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      go.countDown();
      int winners = 0;
      for (var future : futures) {
        if (future.get(10, TimeUnit.SECONDS)) {
          winners++;
        }
      }
      assertThat(winners).isEqualTo(1);
    }
  }

  @Test
  void additiveStoredSecretLengthCodeKeepsEveryPriorTerminalValueAndRefusesUnknown() {
    try (var db = new Database(null)) {
      for (String code :
          List.of(
              "TIMEOUT",
              "DISPATCH_FAILED",
              "DISPATCH_UNKNOWN",
              "START_TIMEOUT",
              "STALE",
              "DISPATCH_DISABLED",
              "AUTHORIZATION_REVOKED",
              "REFERENCE_UNAVAILABLE",
              "CANCELLED",
              "SECRET_TOO_LONG")) {
        UUID id = db.execution();
        db.jdbc.update("UPDATE ui_test_executions SET error_code=? WHERE id=?", code, id);
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT error_code FROM ui_test_executions WHERE id=?", String.class, id))
            .isEqualTo(code);
      }
      UUID id = db.execution();
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET error_code='UNDECLARED_VALUE' WHERE id=?", id))
          .hasMessageContaining("ck_ui_test_executions_error_code");
    }
  }

  private static Map<String, Object> noDecision(Database db, String status, String admission) {
    var row = release(db, Instant.now(), "session:1", 1);
    row.put("row_kind", "USAGE");
    row.put("decision_stage", null);
    row.put("release_id", null);
    row.put("outcome", null);
    row.put("vault_version", null);
    row.put("admission_id", admission);
    row.put("usage_outcome", status);
    row.put("release_seq", null);
    row.put("source_reference_id", "ref-PASS");
    if (admission == null) {
      row.put("coordinate_ordinal", null);
    }
    return row;
  }

  private static void consumed(Database db, String code) {
    consumed(db, code, "input-PASS");
  }

  private static void consumed(Database db, String code, String sourceInputId) {
    db.action(sourceInputId);
    db.jdbc.update(
        ("UPDATE studio_guided_actions SET "
            + "document=jsonb_set(document,'{outcomeCode}',to_jsonb(?::text)) WHERE "
            + "admission_id='admission'"),
        code);
  }

  @Test
  void consumedNoDecisionRequiresAuthenticAdmissionAndKeepsNullResolutionHonest() {
    try (var db = new Database(null)) {
      db.session("FAILED");
      consumed(db, "PENDING");
      var base = noDecision(db, "UNKNOWN_OUTCOME", "admission");
      for (String mutation :
          List.of(
              "wrong-principal",
              "wrong-attempt",
              "wrong-step",
              "wrong-ordinal",
              "wrong-secret",
              "missing-admission",
              "fake-version",
              "fake-outcome",
              "fake-release")) {
        var wrong = new LinkedHashMap<>(base);
        wrong.put("id", UUID.randomUUID());
        switch (mutation) {
          case "wrong-principal" -> wrong.put("principal_id", "someone@example.test");
          case "wrong-attempt" -> wrong.put("attempt_id", "session:2");
          case "wrong-step" -> wrong.put("coordinate_step_id", "unused-step");
          case "wrong-ordinal" -> wrong.put("coordinate_ordinal", 1);
          case "wrong-secret" -> wrong.put("secret_id", "UNDECLARED");
          case "missing-admission" -> wrong.put("admission_id", null);
          case "fake-version" -> wrong.put("vault_version", "fabricated");
          case "fake-outcome" -> wrong.put("outcome", "RESOLVED");
          case "fake-release" -> wrong.put("release_id", UUID.randomUUID());
          default -> throw new IllegalStateException();
        }
        assertThatThrownBy(() -> insert(db, wrong)).isInstanceOf(RuntimeException.class);
      }
      var ack = new LinkedHashMap<>(base);
      ack.put("usage_outcome", "ACK_LOST");
      assertThatThrownBy(() -> insert(db, ack)).hasMessageContaining("evidence");
      assertThatThrownBy(() -> insert(db, noDecision(db, "NOT_USED", null)))
          .hasMessageContaining("unreached");
      insert(db, base);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='RELEASE'",
                  Integer.class))
          .isZero();
      var evade = new LinkedHashMap<>(base);
      evade.put("id", UUID.randomUUID());
      Instant future = Instant.now().plusSeconds(40 * 86400L);
      evade.put("occurred_at", future);
      evade.put("release_occurred_at", future);
      evade.put("release_seq", 2L);
      assertThatThrownBy(() -> insert(db, evade))
          .hasMessageContaining("consumed no-decision evidence invalid");
      var onlyClock = new LinkedHashMap<>(evade);
      onlyClock.put("id", UUID.randomUUID());
      onlyClock.put("release_seq", null);
      assertThatThrownBy(() -> insert(db, onlyClock))
          .hasMessageContaining("duplicate usage summary");
      assertThatThrownBy(() -> db.jdbc.execute("TRUNCATE studio_secret_use_audit"))
          .hasMessageContaining("append-only");
    }
  }

  private static String lineage(Database db) {
    return db.jdbc.queryForObject(
        "SELECT jsonb_build_object('materialization',(SELECT jsonb_agg(to_jsonb(m) ORDER BY session_id) FROM "
            + "studio_guided_materializations m),"
            + "'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY context_revision) FROM "
            + "studio_guided_materialization_versions v),"
            + "'inputs',(SELECT jsonb_agg(to_jsonb(i) ORDER BY input_ordinal) FROM "
            + "studio_guided_materialization_inputs i),"
            + "'manifest',(SELECT jsonb_agg(to_jsonb(s) ORDER BY session_id) FROM studio_guided_source_manifests s),"
            + "'preparation',(SELECT jsonb_agg(to_jsonb(p) ORDER BY preparation_id) FROM studio_guided_preparations p),"
            + "'actions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY admission_id) FROM studio_guided_actions a))::text",
        String.class);
  }

  @Test
  void consumedAckLossIsEvidenceBoundAndMissingMaterializationCannotBecomeUnused() {
    try (var db = new Database(null)) {
      db.session("FAILED");
      consumed(db, "ACK_LOST");
      db.jdbc.update(
          ("UPDATE studio_guided_actions SET "
              + "document=jsonb_set(document,'{state}','\"UNKNOWN_OUTCOME\"') WHERE "
              + "admission_id='admission'"));
      insert(db, noDecision(db, "ACK_LOST", "admission"));
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT usage_outcome FROM studio_secret_use_audit", String.class))
          .isEqualTo("ACK_LOST");
    }
    try (var db = new Database(null)) {
      db.session("FAILED");
      // Adversarial SQL audit fixture only: Java prepare/admit rejects this missing input.
      // Keep the actual V21 version, preparation and all immutable lineage rows intact.
      consumed(db, "PENDING", "input-NOT-MATERIALIZED");
      String before = lineage(db);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_materialization_snapshots WHERE session_id='session'"
                      + " AND context_revision=1 AND authored_inputs_hash=studio_publication_hash(authored_inputs)",
                  Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_materialization_inputs WHERE session_id='session' AND "
                      + "input_id='input-NOT-MATERIALIZED'",
                  Integer.class))
          .isZero();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_secret_guided_exact_reference('session',?,'password-step','PASS','ref-PASS')",
                  Boolean.class,
                  HASH))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_secret_guided_input_reference('session',?,'admission','PASS')",
                  String.class,
                  HASH))
          .isNull();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions a JOIN studio_guided_preparations p ON "
                      + "p.session_id=a.session_id AND p.preparation_id=a.document->>'preparationId'"
                      + " JOIN studio_guided_materialization_snapshots m ON m.session_id=a.session_id AND "
                      + "m.context_revision=(a.proposal->>'contextRevision')::integer"
                      + " AND m.authored_inputs_hash=a.proposal->>'authoredInputsHash' WHERE a.session_id='session'"
                      + " AND a.document->>'requestDigest'=studio_publication_hash(a.proposal) AND "
                      + "p.request_digest=studio_publication_hash(a.proposal)"
                      + " AND p.proof->>'authoredInputsHash'=m.authored_inputs_hash AND "
                      + "(a.document->>'attemptOrdinal')::integer=0",
                  Integer.class))
          .isEqualTo(1);
      // ADR-SC-008: the step names the secrets it uses, so a step that does not use PASS (its uses
      // name a secret nothing materialized) neither conceals nor consumes the PASS declaration.
      assertThatThrownBy(() -> insert(db, noDecision(db, "UNKNOWN_OUTCOME", "admission")))
          .hasMessageContaining("admission source reference declaration lineage invalid");
      assertThat(lineage(db)).isEqualTo(before);
      assertThat(
              db.jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isZero();
    }
    try (var db = new Database(null)) {
      db.session("FAILED");
      consumed(db, "PENDING");
      String before = lineage(db);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "DELETE FROM studio_guided_materializations WHERE session_id='session'"))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
          .satisfies(
              failure -> {
                var sql =
                    (java.sql.SQLException)
                        ((org.springframework.dao.DataIntegrityViolationException) failure)
                            .getMostSpecificCause();
                assertThat(sql.getSQLState()).isEqualTo("23503");
                assertThat(sql.getMessage()).contains("studio_guided_preparations_session_id_fkey");
              });
      assertThat(lineage(db)).isEqualTo(before);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_secret_guided_input_reference('session',?,'admission','PASS')",
                  String.class,
                  HASH))
          .isEqualTo("ref-PASS");
      assertThatThrownBy(() -> insert(db, noDecision(db, "NOT_USED", null)))
          .hasMessageContaining("unreached");
      insert(db, noDecision(db, "UNKNOWN_OUTCOME", "admission"));
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='USAGE' AND "
                      + "usage_outcome='UNKNOWN_OUTCOME'"
                      + " AND release_id IS NULL AND vault_version IS NULL AND outcome IS NULL",
                  Integer.class))
          .isEqualTo(1);
      assertThat(lineage(db)).isEqualTo(before);
    }
  }

  @Test
  void releasedReplayUncertaintyRequiresRealScopedReleaseAndNeverFakeAckStatus() throws Exception {
    try (var f = publishedRetry()) {
      claim(f);
      var release = replayRelease(f, Instant.now(), 1);
      insert(f.db.jdbc, release);
      var ack = usage(release, "ACK_LOST");
      assertThatThrownBy(() -> insert(f.db.jdbc, ack)).hasMessageContaining("check constraint");
      var missing = usage(release, "UNKNOWN_OUTCOME");
      missing.put("release_id", UUID.randomUUID());
      assertThatThrownBy(() -> insert(f.db.jdbc, missing)).hasMessageContaining("locator missing");
      var nullOutcome = usage(release, "UNKNOWN_OUTCOME");
      nullOutcome.put("outcome", null);
      assertThatThrownBy(() -> insert(f.db.jdbc, nullOutcome)).hasMessageContaining("outcome");
      insert(f.db.jdbc, usage(release, "UNKNOWN_OUTCOME"));
      assertThat(
              f.db.jdbc.queryForObject(
                  "SELECT usage_outcome FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                  String.class))
          .isEqualTo("UNKNOWN_OUTCOME");
    }
  }

  @Test
  void rawConcurrentConsumedUncertaintyHasOneWinnerAcrossRetentionClock() throws Exception {
    try (var db = new Database(null);
        var pool = Executors.newFixedThreadPool(2)) {
      db.session("FAILED");
      consumed(db, "PENDING");
      var ready = new CountDownLatch(2);
      var go = new CountDownLatch(1);
      var tasks =
          List.of(0, 1).stream()
              .map(
                  n ->
                      pool.submit(
                          () -> {
                            var row = noDecision(db, "UNKNOWN_OUTCOME", "admission");
                            if (n == 1) {
                              Instant future = Instant.now().plusSeconds(40 * 86400L);
                              row.put("occurred_at", future);
                              row.put("release_occurred_at", future);
                            }
                            ready.countDown();
                            if (!go.await(5, TimeUnit.SECONDS)) {
                              throw new IllegalStateException("race timeout");
                            }
                            try {
                              insert(db, row);
                              return true;
                            } catch (RuntimeException denied) {
                              assertThat(denied.getMessage()).containsAnyOf("duplicate", "unique");
                              return false;
                            }
                          }))
              .toList();
      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      go.countDown();
      int winners = 0;
      for (var task : tasks) {
        if (task.get(10, TimeUnit.SECONDS)) {
          winners++;
        }
      }
      assertThat(winners).isEqualTo(1);
    }
  }

  @Test
  void ordinaryReplayReleaseRequiresAcceptedDeclarationAndAuthenticAttempt() throws Exception {
    try (var db = new Database(null)) {
      var row = release(db, Instant.now(), UUID.randomUUID().toString(), 1);
      row.put("path", "OBSERVED_REPLAY");
      row.put("session_id", null);
      row.put("admission_id", null);
      row.put("coordinate_step_id", null);
      row.put("coordinate_ordinal", null);
      row.put("execution_id", db.execution());
      assertThatThrownBy(() -> insert(db, row)).hasMessageContaining("lineage");
    }
    try (var f = publishedRetry()) {
      var row = replayRelease(f, Instant.now(), 1);
      assertThatThrownBy(() -> insert(f.jdbc(), row)).hasMessageContaining("lineage");
      claim(f);
      for (String field : List.of("secret_id", "attempt_id")) {
        var invalid = new LinkedHashMap<>(row);
        invalid.put("id", UUID.randomUUID());
        invalid.put("release_id", invalid.get("id"));
        invalid.put(field, field.equals("secret_id") ? "UNDECLARED" : UUID.randomUUID().toString());
        assertThatThrownBy(() -> insert(f.jdbc(), invalid)).hasMessageContaining("lineage");
      }
      insert(f.jdbc(), row);
      assertThat(
              f.jdbc()
                  .queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void unreachedDeclaringSummaryCannotRepeatWithCallerOrdinalSequenceOrClock() {
    try (var db = new Database(null)) {
      db.session("FAILED");
      var row = noDecision(db, "NOT_USED", null);
      insert(db, row);
      for (String field : List.of("coordinate_ordinal", "release_seq", "occurred_at")) {
        var invalid = new LinkedHashMap<>(row);
        invalid.put("id", UUID.randomUUID());
        if (field.equals("occurred_at")) {
          Instant next = Instant.now().plusSeconds(40 * 86400L);
          invalid.put(field, next);
          invalid.put("release_occurred_at", next);
        } else {
          invalid.put(field, 2);
        }
        assertThatThrownBy(() -> insert(db, invalid))
            .hasMessageContaining(
                field.equals("occurred_at")
                    ? "duplicate declaring summary"
                    : "unreached declaration identity invalid");
      }
      assertThat(
              db.jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class))
          .isEqualTo(1);
    }
  }

  public static Map<String, Object> terminalRow(RetryFixture f, Instant at) {
    var row =
        new LinkedHashMap<>(
            f.jdbc()
                .queryForMap(
                    ("SELECT l.execution_id,l.execution_accepted_at,CAST(e.observed_revision_b"
                        + "inding->>'attemptId' AS uuid) AS "
                        + "attempt_id,e.revision_id,e.observed_revision_binding->>'revisionDigest' "
                        + "AS revision_digest,studio_publication_hash(e.observed_revision_binding) "
                        + "AS binding_digest,e.observed_revision_binding->>'scopeHash' AS "
                        + "scope_hash,l.principal AS principal_id,l.csi_id,e.environment,l.test_id,"
                        + "l.state AS before_state,l.updated_at AS "
                        + "before_updated_at,e.snapshot_revision AS "
                        + "before_snapshot_revision,e.ended_at AS before_ended_at FROM "
                        + "studio_dispatch_ledger l JOIN ui_test_executions e ON "
                        + "e.id=l.execution_id AND e.started_at=l.execution_accepted_at WHERE "
                        + "l.execution_id=?"),
                    f.id()));
    var ids =
        C.parse(
            f.jdbc()
                .queryForObject(
                    "SELECT studio_observed_terminal_classification(?,?)::text",
                    String.class,
                    f.id(),
                    row.get("attempt_id")));
    row.put("id", UUID.randomUUID());
    row.put("occurred_at", Timestamp.from(at));
    row.put("terminal_error_code", "DISPATCH_FAILED");
    row.put("terminal_ended_at", Timestamp.from(at));
    row.put("no_read_ids", ids.path("noReadIds").toString());
    row.put("possible_read_ids", ids.path("possibleReadIds").toString());
    return row;
  }

  public static void insertTerminal(RetryFixture f, Map<String, Object> row) {
    var sql =
        "INSERT INTO studio_observed_terminal_secret_settlements("
            + String.join(",", row.keySet())
            + ") VALUES ("
            + String.join(
                ",",
                row.keySet().stream()
                    .map(k -> k.endsWith("_ids") ? "CAST(:" + k + " AS jsonb)" : ":" + k)
                    .toList())
            + ")";
    new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(f.jdbc())
        .update(sql, row);
  }

  // Deliberately omit summaries for the deferred DB negative; actual caller integration is covered
  // separately.
  private static int rawTerminalWinner(RetryFixture f, Instant at) {
    return f.jdbc()
        .queryForObject(
            ("WITH h AS (UPDATE ui_test_executions SET "
                + "status='ERROR',error_code='DISPATCH_FAILED',ended_at=COALESCE(ended_at,?"
                + "::timestamptz),snapshot_revision=snapshot_revision+1 WHERE id=? AND "
                + "status='PENDING' RETURNING id,error_code,ended_at),d AS (UPDATE "
                + "studio_dispatch_ledger l SET state='DONE',terminal_error_code=h.error_co"
                + "de,terminal_error_at=h.ended_at,updated_at=now() FROM h WHERE "
                + "l.execution_id=h.id AND l.state IN ('QUEUED','CLAIMED') RETURNING "
                + "l.execution_id) SELECT count(*) FROM d"),
            Integer.class,
            Timestamp.from(at),
            f.id());
  }

  @Test
  void terminalRawBeforeImageScopeAndCompleteClassificationCannotBeForged() throws Exception {
    try (var f = publishedRetry()) {
      var original = terminalRow(f, Instant.now());
      for (String field :
          List.of(
              "before_state",
              "before_snapshot_revision",
              "before_updated_at",
              "attempt_id",
              "revision_digest",
              "binding_digest",
              "principal_id",
              "no_read_ids",
              "possible_read_ids")) {
        var wrong = new LinkedHashMap<>(original);
        wrong.put("id", UUID.randomUUID());
        switch (field) {
          case "before_state" -> wrong.put(field, "CLAIMED");
          case "before_snapshot_revision" ->
              wrong.put(field, ((Number) original.get(field)).longValue() + 1);
          case "before_updated_at" ->
              wrong.put(field, Timestamp.from(Instant.now().plusSeconds(10)));
          case "attempt_id" -> wrong.put(field, UUID.randomUUID());
          case "principal_id" -> wrong.put(field, "wrong-principal");
          case "no_read_ids" -> wrong.put(field, "[]");
          case "possible_read_ids" -> wrong.put(field, "[\"PASS\"]");
          default -> wrong.put(field, "0".repeat(64));
        }
        assertThatThrownBy(() -> insertTerminal(f, wrong))
            .hasMessageContaining("terminal secret settlement");
      }
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(ledger(f).closeWithError(f.id(), "DISPATCH_FAILED", Instant.now())).isEqualTo(1);
      assertThatThrownBy(() -> insertTerminal(f, original))
          .hasMessageContaining("authentic pre-transition owner");
    }
  }

  @Test
  void rawTerminalReceiptCannotCommitWithoutCompleteExactSummaries() throws Exception {
    try (var f = publishedRetry()) {
      Instant at = Instant.now();
      var row = terminalRow(f, at);
      assertThatThrownBy(
              () ->
                  f.transaction()
                      .executeWithoutResult(
                          t -> {
                            insertTerminal(f, row);
                            assertThat(rawTerminalWinner(f, at)).isEqualTo(1);
                          }))
          .satisfies(
              error -> {
                Throwable rootCause = error;
                while (rootCause.getCause() != null) {
                  rootCause = rootCause.getCause();
                }
                assertThat(rootCause.getMessage()).contains("complete top-transaction summaries");
              });
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isZero();
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT status FROM ui_test_executions WHERE id=?", String.class, f.id()))
          .isEqualTo("PENDING");
    }
  }

  @Test
  void terminalCrossMonthClockCannotEvadeActualAttemptReceiptIdentity() throws Exception {
    try (var f = publishedRetry()) {
      Instant at = Instant.now();
      var duplicate = terminalRow(f, at);
      duplicate.put("id", UUID.randomUUID());
      duplicate.put("occurred_at", Timestamp.from(at.plusSeconds(40 * 86400L)));
      var recorder = new com.citi.put.checks.studio.secrets.SecretUseAuditRecorder(f.jdbc());
      f.transaction()
          .executeWithoutResult(
              t -> {
                assertThat(recorder.recordObservedTerminalSettlement(f.id(), "DISPATCH_FAILED", at))
                    .isTrue();
                f.jdbc().execute("SAVEPOINT rejected_duplicate_only");
                assertThatThrownBy(() -> insertTerminal(f, duplicate))
                    .hasMessageContaining("terminal secret settlement duplicate");
                f.jdbc().execute("ROLLBACK TO SAVEPOINT rejected_duplicate_only");
                f.jdbc().execute("RELEASE SAVEPOINT rejected_duplicate_only");
                assertThat(ledger(f).closeWithError(f.id(), "DISPATCH_FAILED", at)).isEqualTo(1);
              });
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements",
                      Integer.class))
          .isEqualTo(1);
      assertThat(
              f.jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE row_kind='USAGE'",
                      Integer.class))
          .isEqualTo(1);
    }
  }
}

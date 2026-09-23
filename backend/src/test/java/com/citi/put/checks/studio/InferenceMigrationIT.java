package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * V18 additive compatibility and the separately staged V19 identity cutover, on real PostgreSQL.
 */
@Testcontainers(disabledWithoutDocker = true)
class InferenceMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("inference_migration");
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final UUID LEGACY_REVISION = UUID.randomUUID();
  private static final UUID LEGACY_EXECUTION = UUID.randomUUID();
  private static final String HASH = "a".repeat(64);
  private static final String SOURCE = "[\"Click save\"]";

  @BeforeAll
  static void upgrade() throws SQLException {
    POSTGRES.start();
    migrate(POSTGRES.getJdbcUrl(), "17");
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      s.executeUpdate(
          "INSERT INTO users(id,sso_id,name,email,is_active) VALUES"
              + "(gen_random_uuid(),'inference-author','Inference','inference@citi.com',true)");
      s.executeUpdate(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)"
              + " VALUES('71023','Inference','Ops','HIGH','inference@citi.com','Production',"
              + "'OPERATIONAL')");
      s.executeUpdate(draft(TEST_ID));
      s.executeUpdate(legacyRevision(LEGACY_REVISION, HASH, 1));
      s.executeUpdate(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,revision_id,csi_id)"
              + " VALUES('"
              + LEGACY_EXECUTION
              + "','"
              + TEST_ID
              + "','PASSED',NOW(),NOW(),'"
              + LEGACY_REVISION
              + "','71023')");
    }
    migrate(POSTGRES.getJdbcUrl(), "18");
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void freshInstallStopsAtAdditiveVersionAndUpgradeInventsNoHistory() throws SQLException {
    String freshUrl = POSTGRES.getJdbcUrl().replace("inference_migration", "inference_fresh");
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      s.execute("CREATE DATABASE inference_fresh");
    }
    // Historical migrations assume one application schema per database.
    migrate(freshUrl, "18");
    try (Connection c =
        DriverManager.getConnection(freshUrl, POSTGRES.getUsername(), POSTGRES.getPassword())) {
      assertThat(scalar(c, "SELECT max(version::int) FROM flyway_schema_history")).isEqualTo("18");
      assertThat(scalar(c, "SELECT count(*) FROM ui_test_compile_requests")).isEqualTo("0");
    }
    try (Connection c = connect()) {
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_tests WHERE authoring_snapshot IS NULL"
                      + " AND authoring_hash IS NULL"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_revisions WHERE compile_request_id IS NULL"
                      + " AND authoring_snapshot IS NULL"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT execution_scope FROM ui_test_executions WHERE id='"
                      + LEGACY_EXECUTION
                      + "'"))
          .isNull();
    }
  }

  @Test
  void oldPublisherConflictTargetStillWorksAfterExpansion() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      assertThat(
              s.executeUpdate(
                  legacyRevision(UUID.randomUUID(), HASH, 1)
                      + " ON CONFLICT(test_id,source_revision,configuration_revision,artifact_hash)"
                      + " DO NOTHING"))
          .isZero();
      c.rollback();
    }
  }

  @Test
  void stepRegistryAndRequestAndOutcomeAreAppendOnly() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID step = UUID.randomUUID();
      s.executeUpdate(
          "INSERT INTO ui_test_step_identities(step_id,test_id,created_by) VALUES('"
              + step
              + "','"
              + TEST_ID
              + "','inference@citi.com')");
      UUID request = insertRequest(c, 2, null);
      s.executeUpdate(
          "INSERT INTO ui_test_compile_outcomes(request_id,outcome) VALUES('"
              + request
              + "','{\"status\":\"DISCARDED\"}')");
      reject(
          c,
          "UPDATE ui_test_step_identities SET created_by='other' WHERE step_id='" + step + "'",
          "immutable");
      reject(
          c,
          "DELETE FROM ui_test_compile_requests WHERE request_id='" + request + "'",
          "immutable");
      reject(
          c,
          "UPDATE ui_test_compile_requests SET source_revision=9 WHERE request_id='"
              + request
              + "'",
          "immutable");
      reject(
          c,
          "UPDATE ui_test_compile_outcomes SET outcome='{}' WHERE request_id='" + request + "'",
          "immutable");
      reject(
          c,
          "INSERT INTO ui_test_compile_outcomes(request_id,outcome) VALUES('" + request + "','{}')",
          "duplicate key");
      c.rollback();
    }
  }

  @Test
  void revisionMustMatchCaptureAndProtectsEveryNewColumn() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID request = insertRequest(c, 2, LEGACY_REVISION);
      UUID revision = UUID.randomUUID();
      s.executeUpdate(candidate(revision, request, "b".repeat(64)));
      reject(
          c,
          "UPDATE ui_test_revisions SET authoring_hash='" + HASH + "' WHERE id='" + revision + "'",
          "immutable");
      reject(
          c,
          "UPDATE ui_test_revisions SET compilation_fingerprint='"
              + "b".repeat(64)
              + "' WHERE id='"
              + revision
              + "'",
          "immutable");
      reject(
          c,
          "UPDATE ui_test_revisions SET baseline_revision_id=NULL WHERE id='" + revision + "'",
          "immutable");
      s.executeUpdate(
          "UPDATE ui_test_revisions SET confirmed_by='inference@citi.com',confirmed_at=NOW()"
              + " WHERE id='"
              + revision
              + "'");
      reject(
          c,
          "UPDATE ui_test_revisions SET confirmed_by='other' WHERE id='" + revision + "'",
          "write-once");
      reject(
          c,
          candidate(UUID.randomUUID(), request, HASH)
              .replace("r.source,r.source_hash", "'[]'::jsonb,r.source_hash"),
          "does not match immutable");
      c.rollback();
    }
  }

  @Test
  void baselineCannotBelongToAnotherTestAndScopeEditsNeedRevisionAdvance() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID other = UUID.randomUUID();
      s.executeUpdate(draft(other));
      reject(
          c,
          requestSql(UUID.randomUUID(), 2, LEGACY_REVISION)
              .replace(TEST_ID.toString(), other.toString()),
          "fk_ui_test_compile_request_baseline");
      reject(
          c,
          "UPDATE ui_tests SET authoring_snapshot='{}',authoring_hash='"
              + HASH
              + "' WHERE id='"
              + TEST_ID
              + "'",
          "requires a new source_revision");
      s.executeUpdate(
          "UPDATE ui_tests SET authoring_snapshot='{}',authoring_hash='"
              + HASH
              + "',source_revision=source_revision+1 WHERE id='"
              + TEST_ID
              + "'");
      c.rollback();
    }
  }

  @Test
  void cutoverRequiresAttestationAndSeparatesContentFromRequestIdentity() throws Exception {
    String cutover =
        Files.readString(Path.of("db/cutover/V19__studio_inference_candidate_identity.sql"));
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      reject(c, cutover, "compatible-writer drain barrier");
      s.execute("SET LOCAL checks.inference_publishers_drained='true'");
      s.execute(cutover);
      UUID first = insertRequest(c, 2, null);
      UUID second = insertRequest(c, 2, null);
      UUID firstRevision = UUID.randomUUID();
      s.executeUpdate(candidate(firstRevision, first, HASH));
      s.executeUpdate(candidate(UUID.randomUUID(), second, HASH));
      assertThat(
              s.executeUpdate(
                  candidate(UUID.randomUUID(), first, HASH)
                      + " ON CONFLICT(compile_request_id) DO NOTHING"))
          .isZero();
      assertThat(scalar(c, "SELECT count(*) FROM ui_test_revisions WHERE source_revision=2"))
          .isEqualTo("2");
      s.executeUpdate(
          "UPDATE ui_test_revisions SET confirmed_by='first',confirmed_at=NOW() WHERE id='"
              + firstRevision
              + "'");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_revisions WHERE source_revision=2 AND confirmed_at IS NULL"))
          .isEqualTo("1");
      reject(
          c,
          legacyRevision(UUID.randomUUID(), "c".repeat(64), 3),
          "requires immutable compile request");
      c.rollback();
    }
  }

  @Test
  void baselineIndexRequiresTruthfulFullMarkerAndSurvivesExecutionRetention() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_executions WHERE status='PASSED' AND execution_scope='FULL'"))
          .isEqualTo("0");
      UUID request = insertRequest(c, 2, LEGACY_REVISION);
      UUID revision = UUID.randomUUID();
      s.executeUpdate(candidate(revision, request, "b".repeat(64)));
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"
                      + " AND indexname IN ('idx_ui_test_revisions_eligible','idx_ui_test_exec_full_baseline')"))
          .isEqualTo("2");
      s.executeUpdate("DELETE FROM ui_test_executions WHERE id='" + LEGACY_EXECUTION + "'");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_compile_requests WHERE request_id='"
                      + request
                      + "'"))
          .isEqualTo("1");
      c.rollback();
    }
  }

  private static void migrate(String jdbcUrl, String target) {
    Flyway.configure()
        .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .target(target)
        .load()
        .migrate();
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static Connection transaction() throws SQLException {
    Connection c = connect();
    c.setAutoCommit(false);
    return c;
  }

  private static void reject(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql))
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(message);
    } finally {
      c.rollback(savepoint);
    }
  }

  private static String scalar(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      r.next();
      return r.getString(1);
    }
  }

  private static String draft(UUID id) {
    return "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES('"
        + id
        + "','Inference','71023','Production','chromium','"
        + SOURCE
        + "','inference@citi.com')";
  }

  private static String legacyRevision(UUID id, String hash, int sourceRevision) {
    return "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,"
        + "source,source_hash,artifact,artifact_hash,artifact_schema_version,"
        + "configuration,\"references\",provenance,created_by)"
        + " VALUES('"
        + id
        + "','"
        + TEST_ID
        + "','71023',"
        + sourceRevision
        + ",1,'"
        + SOURCE
        + "','"
        + HASH
        + "','{\"version\":1,\"steps\":[]}','"
        + hash
        + "',1,'{}','{}','{}','inference@citi.com')";
  }

  private static UUID insertRequest(Connection c, int sourceRevision, UUID baseline)
      throws SQLException {
    UUID id = UUID.randomUUID();
    try (Statement s = c.createStatement()) {
      s.executeUpdate(requestSql(id, sourceRevision, baseline));
    }
    return id;
  }

  private static String requestSql(UUID id, int sourceRevision, UUID baseline) {
    return "INSERT INTO ui_test_compile_requests(request_id,test_id,csi_id,"
        + "source_revision,configuration_revision,"
        + "source,source_hash,configuration,\"references\",compilation_fingerprint,"
        + "compilation_plan,baseline_revision_id,"
        + "created_by,deadline_at) VALUES('"
        + id
        + "','"
        + TEST_ID
        + "','71023',"
        + sourceRevision
        + ",1,'"
        + SOURCE
        + "','"
        + HASH
        + "','{}','{}','"
        + HASH
        + "','{\"selectedMode\":\"FULL\"}',"
        + (baseline == null ? "NULL" : "'" + baseline + "'")
        + ",'inference@citi.com',NOW()+INTERVAL '4 minutes')";
  }

  private static String candidate(UUID id, UUID request, String artifactHash) {
    return "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,source,source_hash,"
        + "artifact,artifact_hash,artifact_schema_version,configuration,\"references\",provenance,created_by,"
        + "compile_request_id,authoring_snapshot,authoring_hash,scope_reviewed_by,scope_reviewed_at,"
        + "compilation_fingerprint,baseline_revision_id) SELECT '"
        + id
        + "',r.test_id,r.csi_id,r.source_revision,r.configuration_revision,r.source,r.source_hash,"
        + "'{\"version\":1,\"steps\":[]}','"
        + artifactHash
        + "',1,r.configuration,r.\"references\",'{}',r.created_by,"
        + "r.request_id,r.authoring_snapshot,r.authoring_hash,r.scope_reviewed_by,r.scope_reviewed_at,"
        + "r.compilation_fingerprint,r.baseline_revision_id FROM ui_test_compile_requests r WHERE r.request_id='"
        + request
        + "'";
  }
}

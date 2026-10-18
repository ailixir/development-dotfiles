package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest;
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
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The revision and execution-evidence half of the former inference migrations (V18/V19), on the
 * STUDIO-OBS-012A / ADR-SC-005 D-B re-baseline: fresh install and a populated core V11 upgrade
 * reach V18 without compile state or invented history; observed revisions capture their authoring
 * and are wholly immutable; per-step reuse stays inside its own test; the truthful FULL index
 * survives execution retention. The compile request/outcome/step registries and the staged V19
 * cutover are retired with the compile path (their tests are deleted by name in the Lane M ledger).
 */
@Testcontainers(disabledWithoutDocker = true)
class InferenceMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("inference_migration");
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final UUID LEGACY_EXECUTION = UUID.randomUUID();
  private static final String HASH = "a".repeat(64);
  private static final String SOURCE = "[\"Click save\"]";
  private static final String CSI = "71023";
  private static final String OWNER = "inference@citi.com";

  @BeforeAll
  static void upgrade() throws SQLException {
    POSTGRES.start();
    // A populated, untouched core database is the supported starting point (D-B).
    migrate(POSTGRES.getJdbcUrl(), "11");
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      s.executeUpdate(
          "INSERT INTO users(id,sso_id,name,email,is_active) VALUES"
              + "(gen_random_uuid(),'inference-author','Inference','"
              + OWNER
              + "',true)");
      s.executeUpdate(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)"
              + " VALUES('"
              + CSI
              + "','Inference','Ops','HIGH','"
              + OWNER
              + "','Production','OPERATIONAL')");
      s.executeUpdate(draft(TEST_ID));
      s.executeUpdate(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,duration_ms)"
              + " VALUES('"
              + LEGACY_EXECUTION
              + "','"
              + TEST_ID
              + "','PASSED',NOW(),NOW(),0)");
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
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM pg_class WHERE relname IN ('ui_test_compile_requests',"
                      + "'ui_test_compile_outcomes','ui_test_step_identities')"))
          .isEqualTo("0");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM information_schema.columns WHERE table_name IN"
                      + " ('ui_tests','ui_test_revisions') AND column_name IN ('compile_status',"
                      + "'compile_request_id','compile_error','compile_diagnostics',"
                      + "'compile_started_at','current_candidate_revision_id','authoring_snapshot',"
                      + "'authoring_hash','scope_reviewed_by','scope_reviewed_at',"
                      + "'compilation_fingerprint','baseline_revision_id','expected_intent',"
                      + "'intent_derivation_version')"))
          .isEqualTo("0");
    }
    try (Connection c = connect()) {
      // Other cases publish their own drafts; the upgraded draft gains nothing.
      assertThat(
              scalar(c, "SELECT count(*) FROM ui_test_revisions WHERE test_id='" + TEST_ID + "'"))
          .isEqualTo("0");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_tests WHERE id='"
                      + TEST_ID
                      + "' AND confirmed_revision_id IS NULL"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT execution_scope FROM ui_test_executions WHERE id='"
                      + LEGACY_EXECUTION
                      + "'"))
          .isNull();
      assertThat(
              scalar(
                  c,
                  "SELECT revision_id::text FROM ui_test_executions WHERE id='"
                      + LEGACY_EXECUTION
                      + "'"))
          .isNull();
    }
  }

  @Test
  void revisionMustMatchCaptureAndProtectsEveryNewColumn() throws SQLException {
    var published = publish("inference-capture");
    UUID revision = published.revisionId();
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      String captured =
          scalar(c, "SELECT authoring::text FROM ui_test_revisions WHERE id='" + revision + "'");
      assertThat(captured)
          .isNotNull()
          .isEqualTo(
              scalar(
                  c, "SELECT authoring::text FROM ui_tests WHERE id='" + published.testId() + "'"));
      // The capture is the publication's own: a later draft edit cannot reach the revision.
      s.executeUpdate(
          "UPDATE ui_tests SET authoring=jsonb_set(authoring,'{steps,0,text}','\"edited\"')"
              + " WHERE id='"
              + published.testId()
              + "'");
      assertThat(
              scalar(
                  c, "SELECT authoring::text FROM ui_test_revisions WHERE id='" + revision + "'"))
          .isEqualTo(captured);
      for (String assignment :
          new String[] {
            "authoring=NULL",
            "authoring_revision_inputs='{}'::jsonb",
            "reference_policy='{}'::jsonb",
            "confirmed_by='other@citi.com'",
            "confirmed_at=confirmed_at+INTERVAL '1 second'",
            "learned_plan_hash='" + "b".repeat(64) + "'",
            "revision_digest='" + "c".repeat(64) + "'",
            "step_snapshot_hashes='{}'::jsonb,step_reuse_provenance='{}'::jsonb",
            "artifact_hash='" + HASH + "'",
            "source_revision=source_revision+1"
          }) {
        reject(
            c,
            "UPDATE ui_test_revisions SET " + assignment + " WHERE id='" + revision + "'",
            "ui_test_revisions is immutable");
      }
      c.rollback();
    }
  }

  @Test
  void reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot() throws SQLException {
    var other = publish("inference-other-test");
    var owner = publish("inference-reuse-owner");
    var ds = dataSource();
    var first =
        GuidedPublicationMigrationTest.prepareHistoricalV18Observed(
            ds, "inference-reuse-1", owner.testId(), CSI, "Production", OWNER);
    var second =
        GuidedPublicationMigrationTest.prepareHistoricalV18Observed(
            ds, "inference-reuse-2", owner.testId(), CSI, "Production", OWNER);
    String step = first.stepId().toString();
    String snapshot = "{\"" + step + "\":\"" + "d".repeat(64) + "\"}";
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID prior = UUID.randomUUID();
      s.executeUpdate(revisionWithStepMetadata(prior, owner.testId(), first, snapshot, "{}", "1"));
      s.execute("SET CONSTRAINTS tr_publication_step_metadata_guard IMMEDIATE");
      // Same test and CSI, identical snapshot: the reuse is accepted by the guard.
      var beforeReuse = c.setSavepoint();
      UUID reused = UUID.randomUUID();
      s.executeUpdate(
          revisionWithStepMetadata(
              reused,
              owner.testId(),
              second,
              snapshot,
              "{\"" + step + "\":{\"revisionId\":\"" + prior + "\",\"stepId\":\"" + step + "\"}}",
              "2"));
      assertThat(
              scalar(
                  c,
                  "SELECT step_reuse_provenance->'"
                      + step
                      + "'->>'revisionId' FROM ui_test_revisions WHERE id='"
                      + reused
                      + "'"))
          .isEqualTo(prior.toString());
      c.rollback(beforeReuse);
      c.releaseSavepoint(beforeReuse);
      // Same test, same authored coordinate and same prior revision; only the hash differs.
      // These are rollback-only deferred metadata probes, not committed publications.
      reject(
          c,
          revisionWithStepMetadata(
              UUID.randomUUID(),
              owner.testId(),
              second,
              "{\"" + step + "\":\"" + "e".repeat(64) + "\"}",
              "{\"" + step + "\":{\"revisionId\":\"" + prior + "\",\"stepId\":\"" + step + "\"}}",
              "3"),
          "step reuse must preserve same-scope published snapshot hash");
      c.rollback();
    }
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      s.execute("SET CONSTRAINTS tr_publication_step_metadata_guard IMMEDIATE");
      // The same reuse pointed at another test's published revision is refused.
      reject(
          c,
          revisionWithStepMetadata(
              UUID.randomUUID(),
              owner.testId(),
              first,
              snapshot,
              "{\""
                  + step
                  + "\":{\"revisionId\":\""
                  + other.revisionId()
                  + "\",\"stepId\":\""
                  + step
                  + "\"}}",
              "4"),
          "step reuse must preserve same-scope published snapshot hash");
      reject(
          c,
          revisionWithStepMetadata(
              UUID.randomUUID(),
              owner.testId(),
              first,
              "{\"" + UUID.randomUUID() + "\":\"" + "d".repeat(64) + "\"}",
              "{}",
              "5"),
          "step snapshot authored coordinate mismatch");
      c.rollback();
    }
  }

  @Test
  void baselineIndexRequiresTruthfulFullMarkerAndSurvivesExecutionRetention() throws SQLException {
    var published = publish("inference-retention");
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_executions WHERE status='PASSED' AND execution_scope='FULL'"))
          .isEqualTo("0");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"
                      + " AND indexname='idx_ui_test_exec_full_baseline'"
                      + " AND indexdef LIKE '%execution_scope)::text = ''FULL''%'"))
          .isEqualTo("1");
      reject(
          c,
          "UPDATE ui_test_executions SET execution_scope='FULL' WHERE id='"
              + LEGACY_EXECUTION
              + "'",
          "execution_scope is immutable");
      s.executeUpdate("DELETE FROM ui_test_executions WHERE id='" + LEGACY_EXECUTION + "'");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_revisions WHERE id='"
                      + published.revisionId()
                      + "'"))
          .isEqualTo("1");
      c.rollback();
    }
  }

  private static GuidedPublicationMigrationTest.Published publish(String session) {
    return GuidedPublicationMigrationTest.publishHistoricalV18Observed(
        dataSource(), session, CSI, "Production", OWNER);
  }

  /**
   * A raw revision row for a prepared (uncommitted) session that passes every row check, so that
   * only the deferred per-step metadata guard (or the publication receipt at commit) decides it.
   */
  private static String revisionWithStepMetadata(
      UUID id,
      UUID testId,
      GuidedPublicationMigrationTest.Prepared session,
      String snapshot,
      String reuse,
      String digestSeed) {
    return "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,"
        + "source,source_hash,artifact,artifact_hash,artifact_schema_version,configuration,"
        + "\"references\",provenance,created_by,confirmed_by,confirmed_at,confirmation_source,"
        + "reference_policy,publication_kind,guided_session_id,learned_plan_hash,revision_digest,"
        + "step_snapshot_hashes,step_reuse_provenance) VALUES('"
        + id
        + "','"
        + testId
        + "','"
        + CSI
        + "',1,1,'[]','"
        + HASH
        + "','{\"profile\":{\"contract\":3}}','"
        + HASH
        + "',3,'{}','{}','{}','"
        + OWNER
        + "','"
        + OWNER
        + "',NOW(),'GUIDED_RUN','{}','GUIDED_RUN','"
        + session.sessionId()
        + "','"
        + HASH
        + "','"
        + digestSeed.repeat(64)
        + "','"
        + snapshot
        + "'::jsonb,'"
        + reuse
        + "'::jsonb)";
  }

  private static DriverManagerDataSource dataSource() {
    return new DriverManagerDataSource(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
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
        + "','Inference','"
        + CSI
        + "','Production','chrome','"
        + SOURCE
        + "','"
        + OWNER
        + "')";
  }
}

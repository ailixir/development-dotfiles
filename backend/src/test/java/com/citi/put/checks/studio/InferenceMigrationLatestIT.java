package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfoService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.23 AC-5 on the <em>current</em> Flyway head. Since the STUDIO-OBS-012A re-baseline
 * (ADR-SC-005 D-B) the head is core V1–V11, the seven Studio area migrations V12–V18, and the
 * forward-only V19 (guided governance, STUDIO-OBS-014) and V20 (guided session recording,
 * STUDIO-OBS-013). The only supported upgrade starts from a populated, untouched core V11 database;
 * the staged V19 cutover (studio inference candidate identity), the compile request/outcome/step
 * registries and the compile baseline selector are retired with the compile path (their cases are
 * deleted by name in the Lane M ledger), and the version number 19 now belongs to guided
 * governance. The revision-immutability, truthful-FULL and execution-scope guarantees are re-proven
 * against the schema a real deployment actually reaches. Every case runs in a transaction that is
 * rolled back.
 */
@Testcontainers(disabledWithoutDocker = true)
class InferenceMigrationLatestIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("inference_latest");
  private static final String FRESH_DB = "inference_latest_fresh";
  private static final String CSI = "71023";
  private static final String OTHER_CSI = "71024";
  private static final String OWNER = "inference@citi.com";
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final UUID LEGACY_EXECUTION = UUID.randomUUID();
  private static final String HASH = "a".repeat(64);
  private static final String SOURCE = "[\"Click save\"]";
  private static final String RUNTIME =
      "{\"validator\":\"2.0.0\",\"executor\":\"2.0.0\",\"playwright\":\"1.63.0\"}";

  /** The core execution columns no Studio migration may rewrite on an upgraded database. */
  private static final String CORE_EXECUTIONS_DIGEST =
      "SELECT md5(string_agg(row(id,ui_test_id,status,started_at,ended_at,duration_ms)::text,"
          + " ',' ORDER BY id)) FROM ui_test_executions";

  private static String coreExecutionFingerprint;

  @BeforeAll
  static void upgrade() throws SQLException {
    POSTGRES.start();
    migrate(POSTGRES.getJdbcUrl(), "11");
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      seedOwners(s);
      s.executeUpdate(draft(TEST_ID, CSI, "chrome"));
      // A realistic core pass: no Studio provenance exists to carry forward.
      s.executeUpdate(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,duration_ms)"
              + " VALUES('"
              + LEGACY_EXECUTION
              + "','"
              + TEST_ID
              + "','PASSED',NOW(),NOW(),0)");
      coreExecutionFingerprint = scalar(c, CORE_EXECUTIONS_DIGEST);
    }
    migrate(POSTGRES.getJdbcUrl(), null);
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      s.execute("CREATE DATABASE " + FRESH_DB);
    }
    migrate(freshUrl(), null);
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void freshAndUpgradedDatabasesReachTheSameHeadWithoutStagedV19() throws SQLException {
    for (String url : List.of(POSTGRES.getJdbcUrl(), freshUrl())) {
      MigrationInfoService info = flyway(url, null).info();
      assertThat(info.pending()).isEmpty();
      try (Connection c = connect(url)) {
        assertThat(scalar(c, "SELECT max(version::int) FROM flyway_schema_history"))
            .isEqualTo(info.current().getVersion().getVersion())
            .isEqualTo("35");
        // V19 and V20 are the forward-only guided migrations, by name; the deleted staged cutover
        // V19 (studio inference candidate identity) never reaches a supported database.
        assertThat(
                rows(
                    c,
                    "SELECT version||':'||description FROM flyway_schema_history"
                        + " WHERE version::int>18 ORDER BY installed_rank"))
            .containsExactly(
                "19:guided governance",
                "20:guided session recording",
                "21:guided session replaying prefix",
                "22:execution replay failure",
                "23:guided attempt rejection reason",
                "24:ui test schedules shared",
                "25:remove guided policy",
                "26:origins from test",
                "27:learn proof",
                "28:allowed domains",
                "29:observation outline and gate audit",
                "30:guided child locator scope",
                "31:guided scope labels and press continuity",
                "32:guided real source assertions",
                "33:step kind",
                "34:recorded revisions",
                "35:step examples");
        assertThat(
                scalar(
                    c,
                    "SELECT count(*) FROM flyway_schema_history"
                        + " WHERE description ILIKE '%inference candidate identity%'"))
            .isEqualTo("0");
        assertThat(scalar(c, "SELECT count(*) FROM flyway_schema_history WHERE NOT success"))
            .isEqualTo("0");
        assertThat(scalar(c, "SELECT to_regclass('uq_ui_test_revisions_identity') IS NULL"))
            .isEqualTo("t");
        assertThat(scalar(c, "SELECT to_regclass('uq_observed_revision_session') IS NOT NULL"))
            .isEqualTo("t");
        assertThat(
                scalar(
                    c,
                    "SELECT to_regprocedure('studio_inference_require_request()') IS NULL"
                        + " AND to_regclass('ui_test_compile_requests') IS NULL"))
            .isEqualTo("t");
      }
    }
    assertThat(Files.exists(Path.of("db/cutover"))).as("no staged cutover remains").isFalse();
    try (Connection upgraded = connect();
        Connection fresh = connect(freshUrl())) {
      for (String catalog : SCHEMA_CATALOG) {
        assertThat(rows(upgraded, catalog)).as(catalog).isEqualTo(rows(fresh, catalog));
      }
    }
  }

  private static final List<String> SCHEMA_CATALOG =
      List.of(
          "SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable"
              + " FROM information_schema.columns WHERE table_schema='public'"
              + " AND table_name IN ('ui_tests','ui_test_revisions','ui_test_executions')"
              + " ORDER BY 1",
          "SELECT indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public'"
              + " AND tablename IN ('ui_tests','ui_test_revisions','ui_test_executions')"
              + " ORDER BY 1",
          "SELECT tgrelid::regclass::text||':'||tgname||':'||tgenabled::text FROM pg_trigger"
              + " WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('ui_tests',"
              + "'ui_test_revisions','ui_test_executions') ORDER BY 1",
          "SELECT conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid)"
              + " FROM pg_constraint WHERE conrelid::regclass::text IN ('ui_tests',"
              + "'ui_test_revisions') ORDER BY 1",
          "SELECT p.proname||':'||md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n"
              + " ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'studio_%'"
              + " OR p.proname LIKE 'ui_test_%' OR p.proname LIKE 'capture_%') ORDER BY 1");

  @Test
  void upgradeToHeadRewritesNoHistoryAndInventsNoEligibility() throws SQLException {
    try (Connection c = connect()) {
      assertThat(scalar(c, CORE_EXECUTIONS_DIGEST)).isEqualTo(coreExecutionFingerprint);
      // Other cases publish their own drafts; the upgraded draft gains nothing.
      assertThat(
              scalar(c, "SELECT count(*) FROM ui_test_revisions WHERE test_id='" + TEST_ID + "'"))
          .isEqualTo("0");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_executions WHERE execution_scope IS NULL"
                      + " AND revision_id IS NULL AND observed_revision_binding IS NULL"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_tests WHERE id='"
                      + TEST_ID
                      + "' AND browser='chromium' AND confirmed_revision_id IS NULL"
                      + " AND publication_epoch=0 AND authoring IS NULL"))
          .isEqualTo("1");
    }
  }

  @Test
  void everyObservedRevisionColumnRemainsImmutableOnTheHeadSchema() throws SQLException {
    var published = publish("latest-observed-columns");
    UUID revision = published.revisionId();
    try (Connection c = transaction()) {
      String captured =
          scalar(c, "SELECT authoring::text FROM ui_test_revisions WHERE id='" + revision + "'");
      assertThat(captured)
          .isEqualTo(
              scalar(
                  c, "SELECT authoring::text FROM ui_tests WHERE id='" + published.testId() + "'"));
      try (Statement statement = c.createStatement()) {
        statement.executeUpdate(
            "UPDATE ui_tests SET authoring=jsonb_set(authoring,'{steps,0,text}','\"Later draft edit\"') WHERE id='"
                + published.testId()
                + "'");
      }
      assertThat(
              scalar(
                  c, "SELECT authoring::text FROM ui_test_revisions WHERE id='" + revision + "'"))
          .isEqualTo(captured);
      String where = " WHERE id='" + revision + "'";
      List<String> tampering =
          List.of(
              "UPDATE ui_test_revisions SET step_snapshot_hashes='{}',step_reuse_provenance='{}'"
                  + where,
              "UPDATE ui_test_revisions SET publication_kind='GUIDED_RUN',guided_session_id='other'"
                  + where,
              "UPDATE ui_test_revisions SET learned_plan_hash='" + "c".repeat(64) + "'" + where,
              "UPDATE ui_test_revisions SET revision_digest='" + "c".repeat(64) + "'" + where,
              "UPDATE ui_test_revisions SET reference_policy='{}'" + where,
              "UPDATE ui_test_revisions SET authoring=NULL" + where,
              "UPDATE ui_test_revisions SET authoring_revision_inputs='{}'" + where,
              "UPDATE ui_test_revisions SET confirmed_by='other'" + where);
      List<String> accepted = new ArrayList<>();
      for (String sql : tampering) {
        if (!rejected(c, sql, "immutable")) {
          accepted.add(sql);
        }
      }
      accepted.forEach(sql -> System.out.println("[AC-5 accepted tampering] " + sql));
      assertThat(accepted).as("observed revision columns writable on the head schema").isEmpty();
      c.rollback();
    }
  }

  /**
   * D1 regression guard (V27, now V12): enumerates the head schema's columns rather than a
   * hand-kept list, so a later migration that adds a column or redefines {@code
   * ui_test_revisions_write_once()} with an enumerated list fails here instead of silently
   * re-opening history to plain UPDATE. Every observed revision arrives confirmed, so no column —
   * the confirmation included — is mutable by design any more.
   */
  @Test
  void everyRevisionColumnIsImmutableOnTheHeadSchema() throws SQLException {
    UUID revision = publish("latest-every-column").revisionId();
    try (Connection c = transaction()) {
      List<String> columns =
          rows(
              c,
              "SELECT column_name||':'||data_type FROM information_schema.columns"
                  + " WHERE table_schema=current_schema() AND table_name='ui_test_revisions'"
                  + " ORDER BY ordinal_position");
      assertThat(columns)
          .isNotEmpty()
          .anyMatch(column -> column.startsWith("step_reuse_provenance:"));
      List<String> accepted = new ArrayList<>();
      for (String column : columns) {
        String name = column.substring(0, column.indexOf(':'));
        String quoted = "\"" + name + "\"";
        String sql =
            "UPDATE ui_test_revisions SET "
                + quoted
                + "=CASE WHEN "
                + quoted
                + " IS NULL THEN "
                + tamperValue(column.substring(column.indexOf(':') + 1))
                + " ELSE NULL END WHERE id='"
                + revision
                + "'";
        if (!rejected(c, sql, "immutable")) {
          accepted.add(sql);
        }
      }
      assertThat(accepted).as("ui_test_revisions columns writable on the head schema").isEmpty();
      c.rollback();
    }
  }

  private static String tamperValue(String dataType) {
    return switch (dataType) {
      case "uuid" -> "gen_random_uuid()";
      case "character", "character varying", "text" -> "'tampered'";
      case "bigint", "integer" -> "999";
      case "jsonb" -> "'{\"tampered\":true}'::jsonb";
      case "timestamp with time zone" -> "NOW()-INTERVAL '1 day'";
      default ->
          throw new IllegalStateException(
              "Add a tamper value for ui_test_revisions column type " + dataType);
    };
  }

  @Test
  void historicalExecutionCannotBeRelabelledAsFullEvidence() throws SQLException {
    UUID revision = publish("latest-retained-publication").revisionId();
    try (Connection c = transaction()) {
      boolean guarded =
          rejected(
              c,
              "UPDATE ui_test_executions SET execution_scope='FULL' WHERE id='"
                  + LEGACY_EXECUTION
                  + "'",
              "immutable");
      assertThat(guarded).as("NULL execution_scope relabelled FULL by plain DML").isTrue();
      try (Statement statement = c.createStatement()) {
        statement.executeUpdate(
            "DELETE FROM ui_test_executions WHERE id='" + LEGACY_EXECUTION + "'");
      }
      assertThat(scalar(c, "SELECT count(*) FROM ui_test_revisions WHERE id='" + revision + "'"))
          .isEqualTo("1");
      c.rollback();
    }
  }

  // The execution-scope guard is independent of revision binding; these rows carry no revision
  // (the unbound family V13/V15 still admit), so only the scope trigger decides them.

  @Test
  void fullExecutionCannotBeRelabelledToNull() throws SQLException {
    try (Connection c = transaction()) {
      UUID full = pass(c, TEST_ID, CSI, "0 days", "FULL", "PASSED");
      reject(
          c,
          "UPDATE ui_test_executions SET execution_scope=NULL WHERE id='" + full + "'",
          "execution_scope is immutable");
      assertThat(
              scalar(c, "SELECT execution_scope FROM ui_test_executions WHERE id='" + full + "'"))
          .isEqualTo("FULL");
      c.rollback();
    }
  }

  @Test
  void scopeGuardAllowsNormalLifecycleUpdatesWithUnchangedScope() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID full = pass(c, TEST_ID, CSI, "0 days", "FULL", "PENDING");
      String where = " WHERE id='" + full + "'";
      s.executeUpdate("UPDATE ui_test_executions SET status='RUNNING',ended_at=NULL" + where);
      assertThat(scalar(c, "SELECT status FROM ui_test_executions" + where)).isEqualTo("RUNNING");
      // A full-row update that re-lists the column with the same value (Hibernate style) passes.
      s.executeUpdate(
          "UPDATE ui_test_executions SET status='PASSED',ended_at=NOW(),execution_scope='FULL'"
              + where);
      assertThat(scalar(c, "SELECT status||':'||execution_scope FROM ui_test_executions" + where))
          .isEqualTo("PASSED:FULL");
      c.rollback();
    }
  }

  @Test
  void scopeGuardCoversExistingAndFuturePartitions() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      // Every existing leaf partition (month partitions + DEFAULT) carries the cloned trigger.
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM pg_inherits i WHERE"
                      + " i.inhparent='ui_test_executions'::regclass AND NOT EXISTS (SELECT 1 FROM"
                      + " pg_trigger t WHERE t.tgrelid=i.inhrelid AND"
                      + " t.tgname='trg_studio_execution_scope_immutable')"))
          .isEqualTo("0");
      UUID existing = UUID.randomUUID();
      s.executeUpdate(
          execution(existing, TEST_ID, CSI, null)
              .replace(
                  "NOW(),NOW()",
                  "TIMESTAMPTZ '2026-06-15 12:00Z',TIMESTAMPTZ '2026-06-15 12:00Z'"));
      assertThat(
              scalar(
                  c,
                  "SELECT tableoid::regclass::text FROM ui_test_executions WHERE id='"
                      + existing
                      + "'"))
          .isEqualTo("ui_test_executions_2026_06");
      reject(
          c,
          "UPDATE ui_test_executions_2026_06 SET execution_scope='FULL' WHERE id='"
              + existing
              + "'",
          "execution_scope is immutable");

      s.execute(
          "CREATE TABLE ui_test_executions_2030_01 PARTITION OF ui_test_executions"
              + " FOR VALUES FROM ('2030-01-01') TO ('2030-02-01')");
      UUID future = UUID.randomUUID();
      s.executeUpdate(
          execution(future, TEST_ID, CSI, "FULL")
              .replace(
                  "NOW(),NOW()",
                  "TIMESTAMPTZ '2030-01-15 12:00Z',TIMESTAMPTZ '2030-01-15 12:00Z'"));
      assertThat(
              scalar(
                  c,
                  "SELECT tableoid::regclass::text FROM ui_test_executions WHERE id='"
                      + future
                      + "'"))
          .isEqualTo("ui_test_executions_2030_01");
      reject(
          c,
          "UPDATE ui_test_executions SET execution_scope=NULL WHERE id='" + future + "'",
          "execution_scope is immutable");
      reject(
          c,
          "UPDATE ui_test_executions_2030_01 SET execution_scope=NULL WHERE id='" + future + "'",
          "execution_scope is immutable");
      c.rollback();
    }
  }

  @Test
  void confirmationSourceIsGuidedRunOnlyAndImmutable() throws SQLException {
    UUID revision = publish("latest-confirmation").revisionId();
    try (Connection c = transaction()) {
      assertThat(
              scalar(
                  c,
                  "SELECT confirmation_source||':'||(confirmed_by IS NOT NULL)::text||':'"
                      + "||(confirmed_at IS NOT NULL)::text FROM ui_test_revisions WHERE id='"
                      + revision
                      + "'"))
          .as("an observed revision arrives confirmed by its guided run")
          .isEqualTo("GUIDED_RUN:true:true");
      assertThat(
              scalar(
                  c,
                  "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE"
                      + " conname='ck_ui_test_revisions_confirmation_source'"))
          .isEqualTo("CHECK (((confirmation_source)::text = 'GUIDED_RUN'::text))");
      assertThat(
              scalar(
                  c,
                  "SELECT string_agg(column_name,',' ORDER BY column_name)"
                      + " FROM information_schema.columns WHERE table_name='ui_test_revisions'"
                      + " AND column_name IN ('confirmation_source','confirmed_by','confirmed_at')"
                      + " AND is_nullable='NO'"))
          .isEqualTo("confirmation_source,confirmed_at,confirmed_by");
      String where = " WHERE id='" + revision + "'";
      // No second confirmation, change or clear: all rejected 23514.
      for (String rewrite :
          List.of(
              "confirmation_source='MANUAL'",
              "confirmation_source='RUN'",
              "confirmed_by='second'",
              "confirmed_at=confirmed_at+INTERVAL '1 second'")) {
        reject(c, "UPDATE ui_test_revisions SET " + rewrite + where, "immutable");
        assertThat(sqlState(c, "UPDATE ui_test_revisions SET " + rewrite + where))
            .isEqualTo("23514");
      }
      c.rollback();
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private static GuidedPublicationMigrationTest.Published publish(String session) {
    return GuidedPublicationMigrationTest.publishObserved(
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()),
        session,
        CSI,
        "Production",
        OWNER);
  }

  private static void seedOwners(Statement s) throws SQLException {
    s.executeUpdate(
        "INSERT INTO users(id,sso_id,name,email,is_active) VALUES"
            + "(gen_random_uuid(),'inference-author','Inference','"
            + OWNER
            + "',true)");
    for (String csi : List.of(CSI, OTHER_CSI)) {
      s.executeUpdate(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,"
              + "status) VALUES('"
              + csi
              + "','Inference','Ops','HIGH','"
              + OWNER
              + "','Production','OPERATIONAL')");
    }
  }

  private static UUID pass(
      Connection c, UUID test, String csi, String age, String scope, String status)
      throws SQLException {
    UUID id = UUID.randomUUID();
    try (Statement s = c.createStatement()) {
      s.executeUpdate(
          execution(id, test, csi, scope)
              .replace("'PASSED'", "'" + status + "'")
              .replace("NOW(),NOW()", "NOW()+INTERVAL '" + age + "',NOW()+INTERVAL '" + age + "'"));
    }
    return id;
  }

  private static String execution(UUID id, UUID test, String csi, String scope) {
    return "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,"
        + "csi_id,configuration_snapshot,runtime_versions"
        + (scope == null ? "" : ",execution_scope")
        + ") VALUES('"
        + id
        + "','"
        + test
        + "','PASSED',NOW(),NOW(),'"
        + csi
        + "','{\"sourceRevision\":1,\"configurationRevision\":1,\"artifactHash\":\""
        + HASH
        + "\",\"browser\":\"chromium\",\"viewportWidth\":1280,\"viewportHeight\":720,"
        + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\",\"environment\":\"Production\"}','"
        + RUNTIME
        + "'"
        + (scope == null ? "" : ",'" + scope + "'")
        + ")";
  }

  private static Flyway flyway(String jdbcUrl, String target) {
    var config =
        Flyway.configure()
            .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration");
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  private static void migrate(String jdbcUrl, String target) {
    flyway(jdbcUrl, target).migrate();
  }

  private static String freshUrl() {
    return POSTGRES.getJdbcUrl().replace("inference_latest", FRESH_DB);
  }

  private static Connection connect() throws SQLException {
    return connect(POSTGRES.getJdbcUrl());
  }

  private static Connection connect(String url) throws SQLException {
    return DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
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

  /** True when the statement fails with the message; false when it succeeds (then undone). */
  private static boolean rejected(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return false;
    } catch (SQLException e) {
      System.out.println("[AC-5 rejected] " + e.getMessage().lines().findFirst().orElse(""));
      assertThat(e.getMessage()).contains(message);
      return true;
    } finally {
      c.rollback(savepoint);
    }
  }

  /** The SQLSTATE a statement fails with (then undone), or null when it succeeds. */
  private static String sqlState(Connection c, String sql) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return null;
    } catch (SQLException e) {
      return e.getSQLState();
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

  private static List<String> rows(Connection c, String sql) throws SQLException {
    List<String> out = new ArrayList<>();
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      while (r.next()) {
        out.add(r.getString(1));
      }
    }
    return out;
  }

  private static String draft(UUID id, String csi, String browser) {
    return "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES('"
        + id
        + "','Inference','"
        + csi
        + "','Production','"
        + browser
        + "','"
        + SOURCE
        + "','"
        + OWNER
        + "')";
  }
}

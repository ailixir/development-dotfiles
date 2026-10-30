package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * V27 ({@code V27__learn_proof.sql}) on the Flyway head: the {@code AFTER_LEARN} trigger source and
 * the immutable link between a published session and its proof execution or refusal. Every case
 * runs in a transaction that is rolled back. The link table's foreign keys and its own triggers are
 * switched off per case (the test user is a superuser) so each CHECK and each trigger can be
 * exercised alone; the foreign keys and the publication path are exercised end to end by {@code
 * GuidedPublicationProofIT}.
 */
@Testcontainers(disabledWithoutDocker = true)
class GuidedLearnProofMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("learn_proof");
  private static final List<String> REFUSALS =
      List.of(
          "DISPATCH_DISABLED",
          "PENDING_QUOTA_EXCEEDED",
          "REFERENCE_UNAVAILABLE",
          "VAULT_UNAVAILABLE",
          "STEP_LIMIT_EXCEEDED",
          "NOT_READY",
          "RUNTIME_INCOMPATIBLE");

  @BeforeAll
  static void migrate() {
    POSTGRES.start();
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .load()
        .migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void v27IsForwardOnlyAndTheLinkTableHasExactlyTheRuledShape() throws SQLException {
    try (Connection c = connect()) {
      assertThat(scalar(c, "SELECT description FROM flyway_schema_history WHERE version='27'"))
          .isEqualTo("learn proof");
      assertThat(
              rows(
                  c,
                  "SELECT column_name||':'||data_type||':'||is_nullable FROM"
                      + " information_schema.columns WHERE table_name='studio_learn_proofs'"
                      + " ORDER BY ordinal_position"))
          .containsExactly(
              "session_id:character varying:NO",
              "revision_id:uuid:NO",
              "execution_id:uuid:YES",
              "refusal_code:character varying:YES",
              "created_at:timestamp with time zone:NO");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM information_schema.columns WHERE"
                      + " table_name='ui_test_executions' AND column_name='learn_session_id'"))
          .as("no learn_session_id column on the partitioned executions table")
          .isEqualTo("0");
    }
  }

  @Test
  void theTriggerSourceAdmitsAfterLearnWithoutAScheduleOnly() throws SQLException {
    try (Connection c = transaction()) {
      // Only the CHECK is under test: no foreign key or trigger of the surrounding rows.
      exec(c, "SET LOCAL session_replication_role = replica");
      exec(
          c,
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES"
              + " ('00000000-0000-4000-8000-0000000000a1','t','CORE','Development','chromium','[]','x')");
      exec(c, execution("AFTER_LEARN", "NULL", "NULL"));
      exec(c, execution("MANUAL", "NULL", "NULL"));
      exec(c, execution(null, "NULL", "NULL"));
      exec(c, execution("SCHEDULED", "NULL", "clock_timestamp()"));
      reject(c, execution("AFTER_LEARN", "NULL", "clock_timestamp()"), "trigger_source");
      reject(c, execution("MANUAL", "NULL", "clock_timestamp()"), "trigger_source");
      reject(c, execution("SCHEDULED", "NULL", "NULL"), "trigger_source");
      reject(c, execution("AFTER_LEARNED", "NULL", "NULL"), "trigger_source");
      c.rollback();
    }
  }

  @Test
  void exactlyOneOfAnExecutionAndAClosedRefusalIsStored() throws SQLException {
    try (Connection c = transaction()) {
      isolateLinkTable(c, false);
      for (String code : REFUSALS) {
        exec(c, link(UUID.randomUUID().toString(), "NULL", "'" + code + "'"));
      }
      exec(c, link(UUID.randomUUID().toString(), "'" + UUID.randomUUID() + "'", "NULL"));
      reject(c, link("both-null", "NULL", "NULL"), "ck_studio_learn_proofs_outcome");
      reject(
          c,
          link("both-set", "'" + UUID.randomUUID() + "'", "'NOT_READY'"),
          "ck_studio_learn_proofs_outcome");
      reject(c, link("open-code", "NULL", "'SOMETHING_ELSE'"), "ck_studio_learn_proofs_refusal");
      reject(c, link("lower", "NULL", "'not_ready'"), "ck_studio_learn_proofs_refusal");
      String shared = UUID.randomUUID().toString();
      exec(c, link("one-1", "'" + shared + "'", "NULL"));
      reject(c, link("one-2", "'" + shared + "'", "NULL"), "duplicate key");
      exec(c, link("dup", "NULL", "'NOT_READY'"));
      reject(c, link("dup", "NULL", "'DISPATCH_DISABLED'"), "duplicate key");
      c.rollback();
    }
  }

  @Test
  void aLinkIsImmutable() throws SQLException {
    try (Connection c = transaction()) {
      isolateLinkTable(c, false);
      exec(c, link("kept", "NULL", "'NOT_READY'"));
      List<String> accepted = new ArrayList<>();
      for (String column :
          rows(
              c,
              "SELECT column_name FROM information_schema.columns WHERE"
                  + " table_name='studio_learn_proofs'")) {
        String sql =
            "UPDATE studio_learn_proofs SET \""
                + column
                + "\"=\""
                + column
                + "\" WHERE"
                + " session_id='kept'";
        if (!rejected(c, sql, "learn proof link is immutable")) {
          accepted.add(sql);
        }
      }
      assertThat(accepted).isEmpty();
      reject(c, "DELETE FROM studio_learn_proofs", "learn proof link is immutable");
      c.rollback();
    }
  }

  @Test
  void aLinkedExecutionMustBeTheAfterLearnReplayOfTheSameRevision() throws SQLException {
    try (Connection c = transaction()) {
      isolateLinkTable(c, true);
      reject(
          c,
          link("nothing", "'" + UUID.randomUUID() + "'", "NULL"),
          "AFTER_LEARN execution of the published revision");
      // A refusal links no execution, so the guard has nothing to check.
      exec(c, link("refused", "NULL", "'NOT_READY'"));
      c.rollback();
    }
  }

  // ── fixtures ───────────────────────────────────────────────────────────────────────────────

  /** Foreign keys off; only the immutability trigger (and optionally the guard) stay on. */
  private static void isolateLinkTable(Connection c, boolean guard) throws SQLException {
    exec(c, "ALTER TABLE studio_learn_proofs DISABLE TRIGGER ALL");
    exec(c, "ALTER TABLE studio_learn_proofs ENABLE TRIGGER tr_studio_learn_proof_immutable");
    if (guard) {
      exec(c, "ALTER TABLE studio_learn_proofs ENABLE TRIGGER tr_studio_learn_proof_guard");
    }
  }

  private static String link(String session, String execution, String refusal) {
    return "INSERT INTO studio_learn_proofs(session_id,revision_id,execution_id,refusal_code)"
        + " VALUES ('"
        + session
        + "','"
        + UUID.randomUUID()
        + "',"
        + execution
        + ","
        + refusal
        + ")";
  }

  private static String execution(String source, String schedule, String scheduledAt) {
    return "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,csi_id,environment,"
        + "trigger_source,schedule_id,scheduled_at) VALUES ('"
        + UUID.randomUUID()
        + "','00000000-0000-4000-8000-0000000000a1','PENDING',clock_timestamp(),'CORE',"
        + "'Development',"
        + (source == null ? "NULL" : "'" + source + "'")
        + ","
        + schedule
        + ","
        + scheduledAt
        + ")";
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

  private static void exec(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement()) {
      s.execute(sql);
    }
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

  private static boolean rejected(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return false;
    } catch (SQLException e) {
      assertThat(e.getMessage()).contains(message);
      return true;
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
}

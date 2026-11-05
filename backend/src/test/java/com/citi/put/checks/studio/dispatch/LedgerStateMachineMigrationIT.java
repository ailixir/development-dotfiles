package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.support.TestPostgresDatabase;
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

/**
 * Story 10.7 AC-2 — the ledger state machine, now installed by {@code V13__executions_ledger}
 * (STUDIO-OBS-012A / ADR-SC-005 D-B re-baseline), applied to an untouched core V11 database that
 * <em>already holds</em> execution history rows.
 *
 * <p>Seeding first and migrating second is not decoration. A wave-1 migration passed CI on an empty
 * schema and would have aborted with SQLSTATE 23514 on any real database, because its data rewrite
 * ran while an older CHECK was still in force — the defect {@code LegacyDataMigrationIT} was
 * written for. Adding a CHECK to a merged table has exactly the same blind spot: on an empty table
 * every CHECK passes, so an empty-schema test proves nothing about whether the constraint can be
 * adopted.
 *
 * <p>In the re-baseline the ledger table is created empty by V13, so the only rows that can exist
 * when its state CHECK is added are V13's own partition-locator backfill ({@code DONE}) for the
 * core history seeded below. What the rows establish is the claim the migration's comment makes:
 * the backfill's {@code DONE} and the writers' {@code QUEUED} (the column default and the entity
 * constructor) and admitted identities are all inside the enumerated set, and the backfilled rows
 * are not rewritten by any later migration.
 */
class LedgerStateMachineMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";
  private static final String CSI_ID = "60452";

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("checks_ledger_v15");

  private static UUID queuedExecutionId;
  private static UUID doneExecutionId;
  private static UUID dispatchingExecutionId;
  private static UUID testId;

  @BeforeAll
  static void migrateInTwoStages() throws SQLException {
    POSTGRES.start();
    flywayTo("11");
    seedCoreHistory();
    flywayTo("18");
    seedWriterLedgerRows();
  }

  @AfterAll
  static void stopContainer() {
    POSTGRES.stop();
  }

  private static void flywayTo(String target) {
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target(target)
        .load()
        .migrate();
  }

  /** Core V11 history with a registered CSI: V13 gives it a DONE partition locator. */
  private static void seedCoreHistory() throws SQLException {
    UUID userId = UUID.randomUUID();
    testId = UUID.randomUUID();
    queuedExecutionId = UUID.randomUUID();
    doneExecutionId = UUID.randomUUID();
    dispatchingExecutionId = UUID.randomUUID();

    execute(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES ("
            + "'"
            + userId
            + "', 'sso-v15', 'V15 Owner', 'v15@citi.com', NOW(), true)");
    execute(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at) VALUES ('"
            + CSI_ID
            + "', 'V15 CSI', 'Ops', 'HIGH',"
            + " 'v15@citi.com', 'Production', 'OPERATIONAL', NOW(), NOW())");
    execute(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at) VALUES ("
            + "'"
            + testId
            + "', 'V15 draft', '"
            + CSI_ID
            + "', 'Production', 'chrome',"
            + " '[\"Go to the home page\"]'::jsonb, '[]'::jsonb, 30, 'networkidle',"
            + " 'v15@citi.com', NOW(), NOW())");

    execute(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
            + " duration_ms, created_at) VALUES ('"
            + doneExecutionId
            + "', '"
            + testId
            + "', 'PASSED', NOW(), NOW() + INTERVAL '4 seconds', 4000, NOW())");
  }

  /** Ledger rows in the states the surviving writers produce, written on the migrated head. */
  private static void seedWriterLedgerRows() throws SQLException {
    for (UUID executionId : new UUID[] {queuedExecutionId, dispatchingExecutionId}) {
      execute(
          "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, created_at, csi_id)"
              + " VALUES ('"
              + executionId
              + "', '"
              + testId
              + "', 'PENDING', NOW(), NOW(), '"
              + CSI_ID
              + "')");
    }

    execute(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id, csi_id,"
            + " state) VALUES ('"
            + queuedExecutionId
            + "', NOW(), '"
            + testId
            + "', '"
            + CSI_ID
            + "', 'QUEUED')");
    // A complete admission identity on an in-flight row: the constraint must accept it.
    execute(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id, csi_id,"
            + " state, attempt_id, admission_id, runner_instance_id) VALUES ('"
            + dispatchingExecutionId
            + "', NOW(), '"
            + testId
            + "', '"
            + CSI_ID
            + "', 'ADMITTED', '"
            + UUID.randomUUID()
            + "', '"
            + UUID.randomUUID()
            + "', 'studio-runner-0')");
  }

  @Test
  void v13AppliesToADatabaseHoldingExecutionHistoryRows() throws SQLException {
    assertThat(scalarInt("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '13'"))
        .isEqualTo(1);
    assertThat(scalarBoolean("SELECT success FROM flyway_schema_history WHERE version = '13'"))
        .isTrue();
    assertThat(scalarInt("SELECT COUNT(*) FROM flyway_schema_history WHERE success = false"))
        .isZero();
    assertThat(scalarInt("SELECT COUNT(*) FROM studio_dispatch_ledger")).isEqualTo(3);
  }

  @Test
  void bothConstraintsAreInForceAfterTheMigration() throws SQLException {
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname ="
                    + " 'ck_studio_dispatch_ledger_state'"))
        .isEqualTo(1);
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM pg_constraint WHERE conname ="
                    + " 'ck_studio_dispatch_ledger_admission_identity'"))
        .isEqualTo(1);
  }

  @Test
  void thePreExistingRowsKeptTheirStatesRatherThanBeingRewritten() throws SQLException {
    assertThat(stateOf(queuedExecutionId)).isEqualTo("QUEUED");
    assertThat(stateOf(doneExecutionId)).isEqualTo("DONE");
    assertThat(stateOf(dispatchingExecutionId)).isEqualTo("ADMITTED");
  }

  @Test
  void aValueOutsideTheEnumeratedSetIsRefusedOnTheMigratedDatabase() {
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE studio_dispatch_ledger SET state = 'COMPLETE' WHERE execution_id = '"
                        + queuedExecutionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_studio_dispatch_ledger_state");
  }

  @Test
  void v13PartialIndexesStillMatchTheVocabularyTheyWereWrittenFor() throws SQLException {
    // The vocabulary is inherited rather than designed a second time precisely so these keep
    // working; a widened or renamed set would strand them silently.
    assertThat(indexPredicate("idx_studio_dispatch_ledger_queued"))
        .contains("QUEUED")
        .contains("CLAIMED")
        .contains("DISPATCHING");
    assertThat(indexPredicate("idx_studio_dispatch_ledger_start_deadline")).contains("DONE");
    assertThat(indexPredicate("idx_studio_dispatch_ledger_run_deadline")).contains("DONE");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static void execute(String sql) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement()) {
      statement.execute(sql);
    }
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static int scalarInt(String sql) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getInt(1);
    }
  }

  private static boolean scalarBoolean(String sql) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      rows.next();
      return rows.getBoolean(1);
    }
  }

  private static String stateOf(UUID executionId) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rows =
            statement.executeQuery(
                "SELECT state FROM studio_dispatch_ledger WHERE execution_id = '"
                    + executionId
                    + "'")) {
      rows.next();
      return rows.getString(1);
    }
  }

  private static String indexPredicate(String indexName) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rows =
            statement.executeQuery(
                "SELECT indexdef FROM pg_indexes WHERE indexname = '" + indexName + "'")) {
      rows.next();
      return rows.getString(1);
    }
  }
}

package com.citi.put.checks.studio;

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
 * Story 10.1 AC-9/AC-10/AC-11/AC-17 — the Studio baseline (V12–V18, STUDIO-OBS-012A / ADR-SC-005
 * D-B) applied to an untouched core V11 database that <em>already holds</em> ui_tests and
 * ui_test_executions rows. The transformations once owned by the old V12/V14 now live in the
 * re-baselined V12 (quarantine, canonical browser) and V13 (CSI backfill, logs, locators).
 *
 * <p>Every other migration test in the repository builds the schema from scratch and inserts
 * afterwards, so V14's data-transformation statements always match zero rows. That blind spot hid a
 * real defect: section 6 rewrote `browser` to 'chromium' while V1's inline `ui_tests_browser_check`
 * (chrome|firefox|safari|edge) was still in force, which aborts the whole migration with SQLSTATE
 * 23514 on any non-empty database. This test seeds first and migrates second, so the old constraint
 * is genuinely exercised: it fails if the drop is ever moved back below the backfill.
 *
 * <p>It also covers the other three transformations V14 owns and which are equally invisible on an
 * empty schema: the executions CSI backfill and quarantine, the logs TEXT -&gt; JSONB conversion,
 * and the partition-locator insert into the V13 ledger.
 */
class LegacyDataMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";
  private static final String REGISTERED_CSI = "60001";

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("checks_legacy_v14");

  private static UUID chromeTestId;
  private static UUID firefoxTestId;
  private static UUID noCsiTestId;

  private static UUID chromeExecutionId;
  private static UUID firefoxExecutionId;
  private static UUID orphanExecutionId;

  @BeforeAll
  static void migrateInTwoStages() throws SQLException {
    POSTGRES.start();

    flywayTo("11");
    seedLegacyRows();
    flywayTo("18");
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

  /**
   * One ordinary legacy draft on the old canonical engine, one on another legacy engine, one
   * quarantined draft with no CSI, and three finished executions across two partitions.
   */
  private static void seedLegacyRows() throws SQLException {
    chromeTestId = UUID.randomUUID();
    firefoxTestId = UUID.randomUUID();
    noCsiTestId = UUID.randomUUID();
    chromeExecutionId = UUID.randomUUID();
    firefoxExecutionId = UUID.randomUUID();
    orphanExecutionId = UUID.randomUUID();

    execute(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES "
            + "(gen_random_uuid(), 'sso-legacy-v14', 'Legacy Author', 'legacy-v14@citi.com',"
            + " NOW(), true)");
    execute(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at) VALUES ('"
            + REGISTERED_CSI
            + "', 'Legacy CSI', 'Ops', 'HIGH', 'legacy-v14@citi.com', 'Production',"
            + " 'OPERATIONAL', NOW(), NOW())");

    execute(insertLegacyTest(chromeTestId, "'" + REGISTERED_CSI + "'", "Chrome draft", "chrome"));
    execute(
        insertLegacyTest(firefoxTestId, "'" + REGISTERED_CSI + "'", "Firefox draft", "firefox"));
    // Core V11 has no quarantine column and no CSI CHECK, so a CSI-less draft is ordinary core
    // data here; V12 must quarantine it rather than invent a CSI.
    execute(insertLegacyTest(noCsiTestId, "NULL", "Orphan draft", "edge"));

    // 2026_05 partition, free-text logs.
    execute(
        insertLegacyExecution(
            chromeExecutionId, chromeTestId, "PASSED", "2026-05-15 10:00:00+00", "'step one ok'"));
    // DEFAULT partition, no logs at all.
    execute(
        insertLegacyExecution(
            firefoxExecutionId, firefoxTestId, "FAILED", "2026-09-15 10:00:00+00", "NULL"));
    // Parent has no CSI, so the backfill cannot resolve one and the row must be quarantined.
    execute(
        insertLegacyExecution(
            orphanExecutionId, noCsiTestId, "ERROR", "2026-05-20 10:00:00+00", "'orphan run'"));
  }

  private static String insertLegacyTest(UUID id, String csiLiteral, String name, String browser) {
    return "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
        + " created_by, created_at, updated_at) VALUES ('"
        + id
        + "', '"
        + name
        + "', "
        + csiLiteral
        + ", 'Production', '"
        + browser
        + "', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb, 'legacy-v14@citi.com', NOW(), NOW())";
  }

  private static String insertLegacyExecution(
      UUID id, UUID testId, String status, String startedAt, String logsLiteral) {
    return "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
        + " duration_ms, logs, created_at) VALUES ('"
        + id
        + "', '"
        + testId
        + "', '"
        + status
        + "', '"
        + startedAt
        + "', '"
        + startedAt
        + "'::timestamptz + INTERVAL '4 seconds', 4000, "
        + logsLiteral
        + ", '"
        + startedAt
        + "')";
  }

  // ── The migration reaches the end on a non-empty database ──────────────────

  @Test
  void studioBaselineAppliesSuccessfullyToADatabaseThatAlreadyHoldsRows() throws SQLException {
    assertThat(scalarString("SELECT MAX(version::numeric)::text FROM flyway_schema_history"))
        .isEqualTo("18");
    assertThat(scalarInt("SELECT COUNT(*) FROM flyway_schema_history WHERE success = false"))
        .isZero();
  }

  // ── AC-10: canonical browser, converted before the old CHECK could reject it ─

  @Test
  void rewritesEveryLegacyEngineToChromium() throws SQLException {
    assertThat(browserOf(chromeTestId)).isEqualTo("chromium");
    assertThat(browserOf(firefoxTestId)).isEqualTo("chromium");
    assertThat(browserOf(noCsiTestId)).isEqualTo("chromium");
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests WHERE browser <> 'chromium'")).isZero();
  }

  @Test
  void leavesExactlyTheNewBrowserConstraintBehind() throws SQLException {
    assertThat(
            scalarString(
                "SELECT string_agg(con.conname, ',' ORDER BY con.conname)"
                    + " FROM pg_constraint con JOIN pg_attribute att"
                    + " ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)"
                    + " WHERE con.conrelid = 'ui_tests'::regclass AND con.contype = 'c'"
                    + " AND att.attname = 'browser'"))
        .isEqualTo("ck_ui_tests_browser");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_tests SET browser = 'firefox' WHERE id = '" + chromeTestId + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_tests_browser");
  }

  // ── AC-9: CSI backfill, quarantine and partition locators ──────────────────

  @Test
  void backfillsTheCsiOnlyWhereOwnershipIsKnown() throws SQLException {
    assertThat(csiOf(chromeExecutionId)).isEqualTo(REGISTERED_CSI);
    assertThat(csiOf(firefoxExecutionId)).isEqualTo(REGISTERED_CSI);
    assertThat(csiOf(orphanExecutionId)).isNull();
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_test_executions WHERE csi_id IS NULL"))
        .isEqualTo(1);
    assertThat(
            scalarString(
                "SELECT string_agg(name, ',' ORDER BY name) FROM ui_tests"
                    + " WHERE quarantined_at IS NOT NULL"))
        .as("V12 quarantines exactly the core draft whose CSI is absent, keeping its row")
        .isEqualTo("Orphan draft");
  }

  @Test
  void givesALocatorToEveryCsiBearingExecutionAndNoOther() throws SQLException {
    assertThat(scalarInt("SELECT COUNT(*) FROM studio_dispatch_ledger")).isEqualTo(2);
    assertThat(
            scalarString(
                "SELECT state FROM studio_dispatch_ledger WHERE execution_id = '"
                    + chromeExecutionId
                    + "'"))
        .isEqualTo("DONE");
    assertThat(
            scalarString(
                "SELECT execution_accepted_at::text FROM studio_dispatch_ledger"
                    + " WHERE execution_id = '"
                    + chromeExecutionId
                    + "'"))
        .isNotNull();
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM studio_dispatch_ledger WHERE execution_id = '"
                    + orphanExecutionId
                    + "'"))
        .isZero();
  }

  // ── AC-7: legacy free text survives the JSONB conversion ───────────────────

  @Test
  void preservesLegacyLogTextAsASingleInfoEntry() throws SQLException {
    assertThat(scalarString("SELECT jsonb_typeof(logs) FROM " + row(chromeExecutionId)))
        .isEqualTo("array");
    assertThat(scalarInt("SELECT jsonb_array_length(logs) FROM " + row(chromeExecutionId)))
        .isEqualTo(1);
    assertThat(scalarString("SELECT logs->0->>'message' FROM " + row(chromeExecutionId)))
        .isEqualTo("step one ok");
    assertThat(scalarString("SELECT logs->0->>'level' FROM " + row(chromeExecutionId)))
        .isEqualTo("INFO");
    assertThat(scalarString("SELECT logs::text FROM " + row(firefoxExecutionId))).isNull();
  }

  // ── AC-11: no fabricated provenance on legacy history ──────────────────────

  @Test
  void leavesLegacyProvenanceNull() throws SQLException {
    assertThat(scalarString("SELECT revision_id::text FROM " + row(chromeExecutionId))).isNull();
    assertThat(scalarString("SELECT runtime_versions::text FROM " + row(chromeExecutionId)))
        .isNull();
    assertThat(scalarString("SELECT browser_started_at::text FROM " + row(chromeExecutionId)))
        .isNull();
    assertThat(scalarInt("SELECT snapshot_revision FROM " + row(chromeExecutionId))).isZero();
  }

  private static String row(UUID executionId) {
    return "ui_test_executions WHERE id = '" + executionId + "'";
  }

  private static String browserOf(UUID testId) throws SQLException {
    return scalarString("SELECT browser FROM ui_tests WHERE id = '" + testId + "'");
  }

  private static String csiOf(UUID executionId) throws SQLException {
    return scalarString("SELECT csi_id FROM " + row(executionId));
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static void execute(String sql) throws SQLException {
    try (Connection conn = connect();
        Statement st = conn.createStatement()) {
      st.executeUpdate(sql);
    }
  }

  private static int scalarInt(String sql) throws SQLException {
    try (Connection conn = connect();
        Statement st = conn.createStatement();
        ResultSet rs = st.executeQuery(sql)) {
      rs.next();
      return rs.getInt(1);
    }
  }

  private static String scalarString(String sql) throws SQLException {
    try (Connection conn = connect();
        Statement st = conn.createStatement();
        ResultSet rs = st.executeQuery(sql)) {
      rs.next();
      return rs.getString(1);
    }
  }
}

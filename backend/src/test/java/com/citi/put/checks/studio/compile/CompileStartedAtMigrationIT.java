package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.9 AC-16 and AC-17 — <b>{@code V16} applied to a database that already holds drafts.</b>
 *
 * <p>Seeding first and migrating second is not decoration. A wave-1 migration in this repository
 * passed CI on an empty schema and would have aborted on any real database; a migration that adds a
 * column and backfills part of it has the same blind spot, because on an empty table every backfill
 * is correct. The rows below therefore cover all five compile states, a soft-deleted row, a
 * quarantined row and the case the column exists for: a legacy row stranded in {@code COMPILING}
 * from before there was any way to age it.
 *
 * <p>The stranded row is backfilled to the <b>migration's own clock</b>. That is deliberate rather
 * than convenient: the row was begun at a time nobody recorded, and {@code updated_at} is bumped by
 * any edit and says nothing about when a compile started — which is exactly why this column had to
 * be added at all. Ageing from deployment means the row is swept one threshold after the deployment
 * that gave it a clock, which is the earliest defensible moment.
 */
@Testcontainers(disabledWithoutDocker = true)
class CompileStartedAtMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";
  private static final String CSI_ID = "60414";
  private static final String OWNER = "v16@citi.com";

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_compile_started_v16")
          .withUsername("test")
          .withPassword("test");

  /** One draft per seeded case, keyed by the state it was seeded in. */
  private static final Map<String, UUID> SEEDED = new LinkedHashMap<>();

  private static Instant migrationRanAfter;
  private static Instant migrationRanBefore;
  private static UUID confirmedRevisionId;

  @BeforeAll
  static void migrateInTwoStages() throws SQLException {
    POSTGRES.start();
    flywayTo("15");
    seedDraftsInEveryState();
    migrationRanAfter = Instant.now();
    flywayTo("16");
    migrationRanBefore = Instant.now();
  }

  @AfterAll
  static void stopContainer() {
    POSTGRES.stop();
  }

  // ── AC-17: applied to a database with rows in it ─────────────────────────

  @Test
  void v16AppliesToADatabaseHoldingDraftsInEveryCompileState() throws SQLException {
    assertThat(scalarInt("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '16'"))
        .isEqualTo(1);
    assertThat(scalarBoolean("SELECT success FROM flyway_schema_history WHERE version = '16'"))
        .isTrue();
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests"))
        .as("the seeded rows survived the migration")
        .isEqualTo(SEEDED.size());
  }

  @Test
  void theColumnAndItsPartialIndexExist() throws SQLException {
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ui_tests'"
                    + " AND column_name = 'compile_started_at'"))
        .isEqualTo(1);
    assertThat(
            scalarString(
                "SELECT data_type FROM information_schema.columns WHERE table_name = 'ui_tests'"
                    + " AND column_name = 'compile_started_at'"))
        .isEqualTo("timestamp with time zone");
    assertThat(
            scalarString(
                "SELECT indexdef FROM pg_indexes WHERE indexname ="
                    + " 'idx_ui_tests_compiling_started'"))
        .as("partial, restricted to the one status the sweep can act on, as V12's own indexes are")
        .contains("compile_started_at")
        .contains("WHERE")
        .contains("COMPILING");
  }

  /**
   * The stranded row is backfilled to the migration's own clock, and <b>nothing else is</b>.
   *
   * <p>Both halves are the assertion. A backfill that set every row would make the invariant false
   * the moment it ran, and a backfill that set nothing would leave the row this column exists for
   * exactly as unageable as it was.
   */
  @Test
  void onlyTheStrandedCompilingRowIsBackfilledAndItIsBackfilledToTheMigrationsClock()
      throws SQLException {
    Timestamp stranded = timestampOf(SEEDED.get("COMPILING"));

    assertThat(stranded).as("the stranded row now has a clock").isNotNull();
    assertThat(stranded.toInstant())
        .as("and that clock is the migration's own, not a timestamp nobody recorded")
        .isAfterOrEqualTo(migrationRanAfter.minusSeconds(1))
        .isBeforeOrEqualTo(migrationRanBefore.plusSeconds(1));

    for (Map.Entry<String, UUID> entry : SEEDED.entrySet()) {
      if ("COMPILING".equals(entry.getKey())) {
        continue;
      }
      assertThat(timestampOf(entry.getValue()))
          .as("%s must not have been given a compile clock", entry.getKey())
          .isNull();
    }
  }

  /**
   * AC-16's invariant, as the migration leaves the database: {@code compile_started_at IS NOT NULL}
   * if and only if {@code compile_status = 'COMPILING'}.
   */
  @Test
  void theInvariantHoldsAcrossEveryRowAfterTheMigration() throws SQLException {
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM ui_tests WHERE (compile_started_at IS NOT NULL) <>"
                    + " (compile_status = 'COMPILING')"))
        .as("compile_started_at IS NOT NULL <=> compile_status = 'COMPILING'")
        .isZero();
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests WHERE compile_status = 'COMPILING'"))
        .as("and the invariant is not vacuously true because no row is compiling")
        .isEqualTo(1);
  }

  /** The migration touches no confirmation and no revision row. */
  @Test
  void noConfirmedOrCandidateRevisionMovedAndNoRevisionRowWasTouched() throws SQLException {
    assertThat(uuidOf(SEEDED.get("READY"), "confirmed_revision_id"))
        .as("a READY draft keeps the revision it confirmed")
        .isEqualTo(confirmedRevisionId);
    assertThat(uuidOf(SEEDED.get("AWAITING_CONFIRMATION"), "current_candidate_revision_id"))
        .as("an awaiting draft keeps its candidate")
        .isEqualTo(confirmedRevisionId);
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_test_revisions")).isEqualTo(1);
    assertThat(
            scalarString(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = '"
                    + confirmedRevisionId
                    + "'"))
        .as("the confirmation identity is untouched")
        .isEqualTo(OWNER);
  }

  @Test
  void theSoftDeletedAndQuarantinedRowsSurvivedUnchanged() throws SQLException {
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests WHERE deleted_at IS NOT NULL"))
        .isEqualTo(1);
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests WHERE quarantined_at IS NOT NULL"))
        .isEqualTo(1);
    assertThat(timestampOf(SEEDED.get("deleted"))).isNull();
    assertThat(timestampOf(SEEDED.get("quarantined"))).isNull();
  }

  // ── seeding ──────────────────────────────────────────────────────────────

  private static void seedDraftsInEveryState() throws SQLException {
    execute(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES ('"
            + UUID.randomUUID()
            + "', 'sso-v16', 'V16 Owner', '"
            + OWNER
            + "', NOW(), true)");
    execute(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at) VALUES ('"
            + CSI_ID
            + "', 'V16 CSI', 'Ops', 'HIGH', '"
            + OWNER
            + "', 'Production', 'OPERATIONAL', NOW(), NOW())");

    for (String state :
        new String[] {"STALE", "COMPILING", "AWAITING_CONFIRMATION", "READY", "NEEDS_REVISION"}) {
      SEEDED.put(state, insertDraft(state, null));
    }
    SEEDED.put("deleted", insertDraft("STALE", "deleted_at"));
    SEEDED.put("quarantined", insertDraft("STALE", "quarantined_at"));

    // One revision, confirmed through the columns a pre-V16 writer would have written, so the
    // "nothing was touched" assertions have something real to be about.
    confirmedRevisionId = UUID.randomUUID();
    execute(
        "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
            + " configuration_revision, source, source_hash, artifact, artifact_hash,"
            + " artifact_schema_version, configuration, \"references\", provenance, created_by,"
            + " confirmed_by, confirmed_at) VALUES ('"
            + confirmedRevisionId
            + "', '"
            + SEEDED.get("READY")
            + "', '"
            + CSI_ID
            + "', 1, 1, '[]'::jsonb, '"
            + "a".repeat(64)
            + "', '{}'::jsonb, '"
            + "b".repeat(64)
            + "', 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '"
            + OWNER
            + "', '"
            + OWNER
            + "', NOW())");
    execute(
        "UPDATE ui_tests SET confirmed_revision_id = '"
            + confirmedRevisionId
            + "' WHERE id = '"
            + SEEDED.get("READY")
            + "'");
    // The awaiting row points at the same revision as its candidate; the assertion is that V16
    // moves neither pointer, not that they differ.
    execute(
        "UPDATE ui_tests SET current_candidate_revision_id = '"
            + confirmedRevisionId
            + "' WHERE id = '"
            + SEEDED.get("AWAITING_CONFIRMATION")
            + "'");
  }

  private static UUID insertDraft(String state, String withheldColumn) throws SQLException {
    UUID id = UUID.randomUUID();
    execute(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at,"
            + " compile_status, compile_request_id) VALUES ('"
            + id
            + "', 'V16 draft "
            + state
            + "', '"
            + CSI_ID
            + "', 'Production', 'chromium', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb, 30,"
            + " 'networkidle', '"
            + OWNER
            + "', NOW(), NOW(), '"
            + state
            + "', "
            + ("COMPILING".equals(state) ? "'" + UUID.randomUUID() + "'" : "NULL")
            + ")");
    if (withheldColumn != null) {
      execute("UPDATE ui_tests SET " + withheldColumn + " = NOW() WHERE id = '" + id + "'");
    }
    return id;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static void flywayTo(String target) {
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target(target)
        .load()
        .migrate();
  }

  private static Timestamp timestampOf(UUID id) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rs =
            statement.executeQuery(
                "SELECT compile_started_at FROM ui_tests WHERE id = '" + id + "'")) {
      assertThat(rs.next()).as("row %s exists", id).isTrue();
      return rs.getTimestamp(1);
    }
  }

  private static UUID uuidOf(UUID id, String column) throws SQLException {
    String value = scalarString("SELECT " + column + " FROM ui_tests WHERE id = '" + id + "'");
    return value == null ? null : UUID.fromString(value);
  }

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
        ResultSet rs = statement.executeQuery(sql)) {
      assertThat(rs.next()).isTrue();
      return rs.getInt(1);
    }
  }

  private static boolean scalarBoolean(String sql) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rs = statement.executeQuery(sql)) {
      assertThat(rs.next()).isTrue();
      return rs.getBoolean(1);
    }
  }

  private static String scalarString(String sql) throws SQLException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet rs = statement.executeQuery(sql)) {
      assertThat(rs.next()).isTrue();
      return rs.getString(1);
    }
  }
}

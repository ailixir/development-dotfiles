package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
 * Story 10.4 AC-15 — V12 applied on top of a V1–V11 database that already holds legacy drafts,
 * including a draft with no CSI and a draft whose CSI is not registered.
 *
 * <p>Runs Flyway in two stages against a real PostgreSQL container so the seeded rows exist
 * <em>before</em> V12 executes; a plain application-context test could never observe that ordering.
 */
@Testcontainers(disabledWithoutDocker = true)
class RevisionMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_v12")
          .withUsername("test")
          .withPassword("test");

  private static UUID validTestId;
  private static UUID nullCsiTestId;
  private static UUID unknownCsiTestId;

  /** State captured immediately after V12 ran, before any test inserts revisions. */
  private static int staleDraftsAfterMigration;

  private static int revisionsAfterMigration;

  @BeforeAll
  static void migrateInTwoStages() throws SQLException {
    POSTGRES.start();

    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target("11")
        .load()
        .migrate();

    seedLegacyData();

    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target("12")
        .load()
        .migrate();

    staleDraftsAfterMigration =
        scalarInt(
            "SELECT COUNT(*) FROM ui_tests WHERE compile_status = 'STALE'"
                + " AND current_candidate_revision_id IS NULL"
                + " AND confirmed_revision_id IS NULL"
                + " AND compile_request_id IS NULL"
                + " AND source_revision = 1 AND configuration_revision = 1");
    revisionsAfterMigration = scalarInt("SELECT COUNT(*) FROM ui_test_revisions");
  }

  @AfterAll
  static void stopContainer() {
    POSTGRES.stop();
  }

  private static void seedLegacyData() throws SQLException {
    validTestId = UUID.randomUUID();
    nullCsiTestId = UUID.randomUUID();
    unknownCsiTestId = UUID.randomUUID();

    try (Connection conn = connect();
        Statement st = conn.createStatement()) {
      st.executeUpdate(
          "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES "
              + "(gen_random_uuid(), 'sso-legacy', 'Legacy Author', 'legacy@citi.com', NOW(), true)");
      st.executeUpdate(
          "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
              + " environment, status, created_at, updated_at) VALUES "
              + "('60001', 'Legacy CSI', 'Ops', 'HIGH', 'legacy@citi.com', 'Production',"
              + " 'OPERATIONAL', NOW(), NOW())");

      st.executeUpdate(insertLegacyTest(validTestId, "'60001'", "Registered CSI draft"));
      st.executeUpdate(insertLegacyTest(nullCsiTestId, "NULL", "Null CSI draft"));

      // Legacy drift: rows predating the FK (restored dumps, retired CSIs) can carry a CSI that is
      // no longer registered. Drop the FK to reproduce that state faithfully.
      st.executeUpdate("ALTER TABLE ui_tests DROP CONSTRAINT ui_tests_csi_id_fkey");
      st.executeUpdate(insertLegacyTest(unknownCsiTestId, "'99999'", "Unregistered CSI draft"));
    }
  }

  private static String insertLegacyTest(UUID id, String csiLiteral, String name) {
    return "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
        + " created_by, created_at, updated_at) VALUES ('"
        + id
        + "', '"
        + name
        + "', "
        + csiLiteral
        + ", 'Production', 'chrome', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb,"
        + " 'legacy@citi.com', NOW(), NOW())";
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  // ── AC-3: quarantine, never delete or reassign ─────────────────────────────

  @Test
  void quarantinesExactlyTheDraftsWithoutARegisteredCsi() throws SQLException {
    assertThat(quarantinedAtIsNull(validTestId)).isTrue();
    assertThat(quarantinedAtIsNull(nullCsiTestId)).isFalse();
    assertThat(quarantinedAtIsNull(unknownCsiTestId)).isFalse();
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests WHERE quarantined_at IS NOT NULL"))
        .isEqualTo(2);
  }

  @Test
  void keepsQuarantinedRowsWithTheirOriginalCsiAndSteps() throws SQLException {
    assertThat(scalarString("SELECT csi_id FROM ui_tests WHERE id = '" + unknownCsiTestId + "'"))
        .isEqualTo("99999");
    assertThat(scalarString("SELECT csi_id FROM ui_tests WHERE id = '" + nullCsiTestId + "'"))
        .isNull();
    assertThat(scalarInt("SELECT COUNT(*) FROM ui_tests")).isEqualTo(3);
  }

  @Test
  void rejectsANewDraftWithoutACsiUnlessQuarantined() {
    assertThatThrownBy(() -> execute(insertLegacyTest(UUID.randomUUID(), "NULL", "No CSI")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_tests_csi_registered");
  }

  // ── AC-5: legacy rows end STALE with no revisions ──────────────────────────

  @Test
  void leavesEveryLegacyDraftStaleWithNoRevisions() {
    assertThat(staleDraftsAfterMigration).isEqualTo(3);
    assertThat(revisionsAfterMigration).isZero();
  }

  @Test
  void constrainsCompileStatusToTheFiveStates() {
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_tests SET compile_status = 'DONE' WHERE id = '" + validTestId + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_tests_compile_status");
  }

  // ── AC-4: write-once revisions ─────────────────────────────────────────────

  @Test
  void rejectsAnyMutationOfAStoredArtifact() throws SQLException {
    UUID revisionId = insertRevision("hash-artifact-mutation", 1L);

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET artifact = '{\"version\":2}'::jsonb WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET artifact_hash = 'tampered' WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET csi_id = '60001x' WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");
  }

  @Test
  void acceptsTheFirstConfirmationAndRejectsASecond() throws SQLException {
    UUID revisionId = insertRevision("hash-second-confirmation", 2L);

    execute(
        "UPDATE ui_test_revisions SET confirmed_by = 'first@citi.com', confirmed_at = NOW()"
            + " WHERE id = '"
            + revisionId
            + "'");
    assertThat(
            scalarString(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = '" + revisionId + "'"))
        .isEqualTo("first@citi.com");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET confirmed_by = 'second@citi.com',"
                        + " confirmed_at = NOW() WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("write-once");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET confirmed_by = NULL, confirmed_at = NULL"
                        + " WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("write-once");
  }

  // ── AC-1: artifact identity is unique per test and revision pair ───────────

  @Test
  void rejectsADuplicateArtifactIdentity() throws SQLException {
    insertRevision("hash-duplicate", 3L);
    assertThatThrownBy(() -> insertRevision("hash-duplicate", 3L))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("uq_ui_test_revisions_identity");
  }

  private UUID insertRevision(String artifactHash, long sourceRevision) throws SQLException {
    UUID id = UUID.randomUUID();
    execute(
        "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
            + " configuration_revision, source, source_hash, artifact, artifact_hash,"
            + " artifact_schema_version, configuration, \"references\", provenance, created_by)"
            + " VALUES ('"
            + id
            + "', '"
            + validTestId
            + "', '60001', "
            + sourceRevision
            + ", 1, '{\"steps\":[]}'::jsonb, 'source-hash', '{\"version\":1}'::jsonb, '"
            + artifactHash
            + "', 1, '{}'::jsonb, '[]'::jsonb, '{\"model\":\"stub\"}'::jsonb, 'legacy@citi.com')");
    return id;
  }

  private static void execute(String sql) throws SQLException {
    try (Connection conn = connect();
        Statement st = conn.createStatement()) {
      st.executeUpdate(sql);
    }
  }

  private static boolean quarantinedAtIsNull(UUID testId) throws SQLException {
    return scalarString("SELECT quarantined_at::text FROM ui_tests WHERE id = '" + testId + "'")
        == null;
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

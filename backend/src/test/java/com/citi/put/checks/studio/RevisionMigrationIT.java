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
 * Story 10.4 AC-15 — V12 applied on top of a V1–V11 database that already holds legacy drafts,
 * including a draft with no CSI and a draft whose CSI is not registered.
 *
 * <p>Runs Flyway in stages against a real PostgreSQL container so the seeded rows exist
 * <em>before</em> V12 executes; a plain application-context test could never observe that ordering.
 * Since the STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) V12 carries no compile state, and every
 * revision is an observed publication that arrives confirmed; the revision cases therefore run on
 * the current head against a genuine publication made by the production writers.
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
  private static int unlearnedDraftsAfterMigration;

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

    unlearnedDraftsAfterMigration =
        scalarInt(
            "SELECT COUNT(*) FROM ui_tests WHERE confirmed_revision_id IS NULL"
                + " AND source_revision = 1 AND configuration_revision = 1");
    revisionsAfterMigration = scalarInt("SELECT COUNT(*) FROM ui_test_revisions");

    // The rest of the Studio baseline, so the revision cases run on the deployed head.
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target("latest")
        .load()
        .migrate();
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

      st.executeUpdate(insertLegacyTest(validTestId, "'60001'", "Registered CSI draft", "chrome"));
      st.executeUpdate(insertLegacyTest(nullCsiTestId, "NULL", "Null CSI draft", "chrome"));

      // Legacy drift: rows predating the FK (restored dumps, retired CSIs) can carry a CSI that is
      // no longer registered. Drop the FK to reproduce that state faithfully.
      st.executeUpdate("ALTER TABLE ui_tests DROP CONSTRAINT ui_tests_csi_id_fkey");
      st.executeUpdate(
          insertLegacyTest(unknownCsiTestId, "'99999'", "Unregistered CSI draft", "chrome"));
    }
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
        + "', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb,"
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
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM ui_tests WHERE id IN ('"
                    + validTestId
                    + "', '"
                    + nullCsiTestId
                    + "', '"
                    + unknownCsiTestId
                    + "')"))
        .isEqualTo(3);
  }

  @Test
  void rejectsANewDraftWithoutACsiUnlessQuarantined() {
    assertThatThrownBy(
            () -> execute(insertLegacyTest(UUID.randomUUID(), "NULL", "No CSI", "chromium")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_tests_csi_registered");
  }

  // ── AC-5: legacy rows end unlearned with no revisions ──────────────────────

  @Test
  void leavesEveryLegacyDraftUnlearnedWithNoRevisions() {
    assertThat(unlearnedDraftsAfterMigration).isEqualTo(3);
    assertThat(revisionsAfterMigration).isZero();
  }

  /**
   * STUDIO-OBS-012A AC-2/AC-6: readiness is derived from the confirmed revision pointer and the
   * current source/configuration; no compile state is stored that could disagree with it.
   */
  @Test
  void carriesNoStoredCompileState() throws SQLException {
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ui_tests'"
                    + " AND column_name IN ('compile_status', 'compile_request_id',"
                    + " 'compile_error', 'compile_diagnostics', 'compile_started_at',"
                    + " 'current_candidate_revision_id', 'authoring_snapshot', 'authoring_hash',"
                    + " 'scope_reviewed_by', 'scope_reviewed_at')"))
        .isZero();
    assertThat(
            scalarInt(
                "SELECT COUNT(*) FROM pg_class WHERE relname IN ('ui_test_compile_requests',"
                    + " 'ui_test_compile_outcomes', 'ui_test_step_identities')"))
        .isZero();
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_tests SET compile_status = 'DONE' WHERE id = '" + validTestId + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("compile_status");
  }

  // ── AC-4: write-once revisions ─────────────────────────────────────────────

  @Test
  void rejectsAnyMutationOfAStoredArtifact() throws SQLException {
    UUID revisionId = publish("revision-artifact-mutation").revisionId();

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
  void arrivesConfirmedAndRejectsAnyReconfirmation() throws SQLException {
    UUID revisionId = publish("revision-reconfirmation").revisionId();

    assertThat(
            scalarString(
                "SELECT confirmation_source FROM ui_test_revisions WHERE id = '"
                    + revisionId
                    + "' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL"))
        .isEqualTo("GUIDED_RUN");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET confirmed_by = 'second@citi.com',"
                        + " confirmed_at = NOW() WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");

    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET confirmed_by = NULL, confirmed_at = NULL"
                        + " WHERE id = '"
                        + revisionId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");
  }

  // ── AC-1: revision identity is unique per test and per guided session ──────

  @Test
  void rejectsADuplicateArtifactIdentity() throws SQLException {
    UUID revisionId = publish("revision-duplicate").revisionId();
    // Same test and revision digest under another session: the digest identity refuses it before
    // any foreign key is consulted.
    assertThatThrownBy(() -> execute(copyOf(revisionId, "'other-session'", "revision_digest")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("uq_observed_revision_digest");
    // Same session, new digest: one revision per guided session.
    assertThatThrownBy(
            () -> execute(copyOf(revisionId, "guided_session_id", "'" + "9".repeat(64) + "'")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("uq_observed_revision_session");
  }

  private static GuidedPublicationMigrationTest.Published publish(String session) {
    return GuidedPublicationMigrationTest.publishObserved(
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()),
        session,
        "60001",
        "Production",
        "legacy@citi.com");
  }

  /** A copy of a committed revision under a new id, with two columns substituted. */
  private static String copyOf(UUID revisionId, String sessionExpression, String digestExpression) {
    return "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
        + " configuration_revision, source, source_hash, artifact, artifact_hash,"
        + " artifact_schema_version, configuration, \"references\", provenance, created_by,"
        + " confirmed_by, confirmed_at, confirmation_source, reference_policy, publication_kind,"
        + " guided_session_id, learned_plan_hash, revision_digest)"
        + " SELECT gen_random_uuid(), test_id, csi_id, source_revision, configuration_revision,"
        + " source, source_hash, artifact, artifact_hash, artifact_schema_version, configuration,"
        + " \"references\", provenance, created_by, confirmed_by, confirmed_at,"
        + " confirmation_source, reference_policy, publication_kind, "
        + sessionExpression
        + ", learned_plan_hash, "
        + digestExpression
        + " FROM ui_test_revisions WHERE id = '"
        + revisionId
        + "'";
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

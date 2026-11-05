package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest;
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
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Authoring-capture migration coverage (the former V21, now part of the STUDIO-OBS-012A /
 * ADR-SC-005 D-B {@code V12__tests_revisions}) against a real, populated, untouched core V11
 * database, upgraded to the current head.
 */
class StudioAuthoringMigrationIT {

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("checks_v18");

  private static UUID testId;

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway("11").migrate();
    testId = UUID.randomUUID();
    execute(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (gen_random_uuid(),'legacy-v18','Legacy','legacy-v18@citi.com',NOW(),true)");
    execute(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES ('61818','V18','Ops','HIGH',"
            + "'legacy-v18@citi.com','Production','OPERATIONAL',NOW(),NOW())");
    execute(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at) VALUES ('"
            + testId
            + "','Legacy','61818','Production','chrome',"
            + "'[\"legacy\"]'::jsonb,'[]'::jsonb,"
            + "'legacy-v18@citi.com',NOW(),NOW())");
    flyway("latest").migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void legacyRowsRemainLegacyAndNoHistoryIsFabricated() throws SQLException {
    assertThat(scalar("SELECT authoring::text FROM ui_tests WHERE id='" + testId + "'")).isNull();
    assertThat(scalarInt("SELECT count(*) FROM ui_test_revisions WHERE test_id='" + testId + "'"))
        .isZero();
  }

  @Test
  void publicationCapturesTheExactV2InputsAndTheyAreWriteOnce() throws SQLException {
    String authoring =
        "{\"authoringSchemaVersion\":2,\"globalContext\":{\"entries\":[],"
            + "\"evidenceReferences\":[]},\"steps\":[{\"id\":\""
            + UUID.randomUUID()
            // The observed fixture needs an authored URL in its first step; the exact Unicode,
            // newline and quote bytes under test follow it.
            + "\",\"text\":\"Open https://orders.example.test/start 雪\\n  \\\"q\\\"\","
            + "\"context\":{\"entries\":[],"
            + "\"evidenceReferences\":[]}}]}";
    execute(
        "UPDATE ui_tests SET authoring='"
            + authoring.replace("'", "''")
            + "'::jsonb, authoring_revision_inputs='{}'::jsonb WHERE id='"
            + testId
            + "'");
    // The only revision writer is the observed publication (production writers, every guard).
    var source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    var prepared =
        GuidedPublicationMigrationTest.prepareObserved(
            source, "authoring-capture", testId, "61818", "Production", "legacy-v18@citi.com");
    UUID revisionId = GuidedPublicationMigrationTest.publishObserved(source, prepared).revisionId();

    assertThat(
            scalar("SELECT authoring::text FROM ui_test_revisions WHERE id='" + revisionId + "'"))
        .isEqualTo(scalar("SELECT authoring::text FROM ui_tests WHERE id='" + testId + "'"));
    assertThat(
            scalar(
                "SELECT authoring_revision_inputs::text FROM ui_test_revisions WHERE id='"
                    + revisionId
                    + "'"))
        .isEqualTo(
            scalar(
                "SELECT authoring_revision_inputs::text FROM ui_tests WHERE id='" + testId + "'"));
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET authoring=NULL WHERE id='" + revisionId + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");
  }

  @Test
  void databaseRejectsUserMintedObservedEvidence() {
    String observed =
        "{\"authoringSchemaVersion\":2,\"steps\":[],\"globalContext\":{"
            + "\"evidenceReferences\":[{\"source\":\"observed\"}]}}";
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_tests SET authoring='"
                        + observed
                        + "'::jsonb WHERE id='"
                        + testId
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_tests_authoring_v2");
  }

  private static Flyway flyway(String target) {
    return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .target(target)
        .load();
  }

  private static void execute(String sql) throws SQLException {
    try (Connection connection = connection();
        Statement statement = connection.createStatement()) {
      statement.executeUpdate(sql);
    }
  }

  private static String scalar(String sql) throws SQLException {
    try (Connection connection = connection();
        Statement statement = connection.createStatement();
        ResultSet result = statement.executeQuery(sql)) {
      result.next();
      return result.getString(1);
    }
  }

  private static int scalarInt(String sql) throws SQLException {
    try (Connection connection = connection();
        Statement statement = connection.createStatement();
        ResultSet result = statement.executeQuery(sql)) {
      result.next();
      return result.getInt(1);
    }
  }

  private static Connection connection() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }
}

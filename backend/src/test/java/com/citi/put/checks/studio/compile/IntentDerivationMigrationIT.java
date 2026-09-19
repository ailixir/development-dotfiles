package com.citi.put.checks.studio.compile;

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

/** Forward-only V23 rollout: historical truth, enforcement, immutability and versioned identity. */
@Testcontainers(disabledWithoutDocker = true)
class IntentDerivationMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_v23")
          .withUsername("test")
          .withPassword("test");
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final String STEP_ID = "11111111-1111-4111-8111-111111111111";

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway("22").migrate();
    execute(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (gen_random_uuid(),'v23','V23','v23@citi.com',NOW(),true)");
    execute(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES ('61840','V23','Ops','HIGH','v23@citi.com',"
            + "'Production','OPERATIONAL',NOW(),NOW())");
    execute(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at,authoring,authoring_revision_inputs) VALUES ('"
            + TEST_ID
            + "','V23','61840','Production','chromium','[\"Navigate to \\\"https://example.test/\\\"\"]'::jsonb,"
            + "'[]'::jsonb,'v23@citi.com',NOW(),NOW(),'"
            + authoring()
            + "'::jsonb,'"
            + inputs()
            + "'::jsonb)");
    execute(insertRevision(UUID.randomUUID(), "artifact", null));
    flyway("23").migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void historicalV2RowsRemainUnversionedAndCannotBeRewritten() throws SQLException {
    assertThat(scalar("SELECT intent_derivation_version FROM ui_test_revisions LIMIT 1")).isNull();
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET intent_derivation_version='1.0.0'"
                        + " WHERE test_id='"
                        + TEST_ID
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");
  }

  @Test
  void newV2RowsRequireVersionAndVersionParticipatesInDedupIdentity() throws SQLException {
    assertThatThrownBy(() -> execute(insertRevision(UUID.randomUUID(), "new", null)))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_test_revisions_v2_derivation_version");
    execute(insertRevision(UUID.randomUUID(), "artifact", "1.0.0"));
    execute(insertRevision(UUID.randomUUID(), "artifact", "2.0.0"));
    assertThat(scalarInt("SELECT count(*) FROM ui_test_revisions WHERE artifact_hash='artifact'"))
        .isEqualTo(3);
    assertThatThrownBy(() -> execute(insertRevision(UUID.randomUUID(), "artifact", "2.0.0")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("uq_ui_test_revisions_identity");
  }

  private static String insertRevision(UUID id, String artifactHash, String version) {
    String versionSql = version == null ? "NULL" : "'" + version + "'";
    return "INSERT INTO ui_test_revisions (id,test_id,csi_id,source_revision,"
        + "configuration_revision,source,source_hash,artifact,artifact_hash,"
        + "artifact_schema_version,configuration,\"references\",provenance,created_by,"
        + "expected_intent"
        + (version == null ? "" : ",intent_derivation_version")
        + ") VALUES ('"
        + id
        + "','"
        + TEST_ID
        + "','61840',1,1,'[\"Navigate to \\\"https://example.test/\\\"\"]'::jsonb,'source',"
        + "'{}'::jsonb,'"
        + artifactHash
        + "',1,'{\"environment\":\"Production\"}'::jsonb,'{}'::jsonb,"
        + "'{\"intentDerivationVersion\":\""
        + (version == null ? "1.0.0" : version)
        + "\"}'::jsonb,'v23@citi.com','"
        + expected()
        + "'::jsonb"
        + (version == null ? "" : "," + versionSql)
        + ")";
  }

  private static String authoring() {
    return "{\"authoringSchemaVersion\":2,\"globalContext\":{\"entries\":[],"
        + "\"evidenceReferences\":[]},\"steps\":[{\"id\":\""
        + STEP_ID
        + "\",\"text\":\"Navigate to \\\"https://example.test/\\\"\","
        + "\"context\":{\"entries\":[],\"evidenceReferences\":[]}}]}";
  }

  private static String inputs() {
    return "{\"contextDigest\":\""
        + "a".repeat(64)
        + "\",\"globalContext\":\""
        + "b".repeat(64)
        + "\",\"stepContexts\":[],\"nonsecretReferencedValues\":[],"
        + "\"selectedEvidenceReferences\":[]}";
  }

  private static String expected() {
    return "{\"schemaVersion\":1,\"steps\":[{\"stepIndex\":0,\"stepId\":\""
        + STEP_ID
        + "\",\"operations\":[{\"op\":\"goto\",\"url\":{\"kind\":\"literal\","
        + "\"value\":\"https://example.test/\"}}]}]}";
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

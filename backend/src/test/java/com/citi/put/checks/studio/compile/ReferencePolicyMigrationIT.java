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

/** Forward-only V24 rollout: historical truth, reference-policy enforcement and identity. */
@Testcontainers(disabledWithoutDocker = true)
class ReferencePolicyMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_v24")
          .withUsername("test")
          .withPassword("test");
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final String STEP_ID = "11111111-1111-4111-8111-111111111111";
  private static final String EXPECTED_INTENT =
      "{\"schemaVersion\":1,\"steps\":[{\"stepIndex\":0,\"stepId\":\""
          + STEP_ID
          + "\",\"operations\":[{\"op\":\"goto\",\"url\":{\"kind\":\"literal\","
          + "\"value\":\"https://example.test/\"}}]}]}";

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway("23").migrate();
    execute(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (gen_random_uuid(),'v24','V24','v24@citi.com',NOW(),true)");
    execute(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES ('61840','V24','Ops','HIGH','v24@citi.com',"
            + "'Production','OPERATIONAL',NOW(),NOW())");
    execute(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at,authoring,authoring_revision_inputs) VALUES ('"
            + TEST_ID
            + "','V24','61840','Production','chromium','[\"Navigate to \\\"https://example.test/\\\"\"]'::jsonb,"
            + "'[]'::jsonb,'v24@citi.com',NOW(),NOW(),'"
            + authoring()
            + "'::jsonb,'"
            + inputs()
            + "'::jsonb)");
    // Two V23-era rows that differ only by their expectation must survive the index rebuild.
    execute(insertRevision("artifact", "1.0.0", EXPECTED_INTENT, null));
    execute(insertRevision("artifact", "1.0.0", "{\"schemaVersion\":1,\"steps\":[]}", null));
    flyway("24").migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void historicalV2RowsKeepTheirExpectationAndCannotGainAPolicy() throws SQLException {
    assertThat(scalarInt("SELECT count(*) FROM ui_test_revisions WHERE reference_policy IS NULL"))
        .isEqualTo(2);
    assertThat(
            scalarInt("SELECT count(*) FROM ui_test_revisions WHERE expected_intent IS NOT NULL"))
        .isEqualTo(2);
    assertThatThrownBy(
            () ->
                execute(
                    "UPDATE ui_test_revisions SET reference_policy='{\"version\":2}'::jsonb"
                        + " WHERE test_id='"
                        + TEST_ID
                        + "'"))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("immutable");
  }

  @Test
  void newV2RowsRequireAPolicyButNoExpectationAndThePolicyIsPartOfIdentity() throws SQLException {
    assertThatThrownBy(() -> execute(insertRevision("new", "2", null, null)))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_test_revisions_v2_reference_policy");
    assertThatThrownBy(() -> execute(insertRevision("new", null, null, policy("A"))))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("ck_ui_test_revisions_v2_derivation_version");

    execute(insertRevision("artifact", "2", null, policy("A")));
    execute(insertRevision("artifact", "2", null, policy("B")));
    assertThat(scalarInt("SELECT count(*) FROM ui_test_revisions WHERE artifact_hash='artifact'"))
        .isEqualTo(4);
    assertThatThrownBy(() -> execute(insertRevision("artifact", "2", null, policy("B"))))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining("uq_ui_test_revisions_identity");
  }

  private static String insertRevision(
      String artifactHash, String version, String expectedIntent, String referencePolicy) {
    return "INSERT INTO ui_test_revisions (id,test_id,csi_id,source_revision,"
        + "configuration_revision,source,source_hash,artifact,artifact_hash,"
        + "artifact_schema_version,configuration,\"references\",provenance,created_by,"
        + "intent_derivation_version,expected_intent"
        + (referencePolicy == null ? "" : ",reference_policy")
        + ") VALUES ('"
        + UUID.randomUUID()
        + "','"
        + TEST_ID
        + "','61840',1,1,'[\"Navigate to \\\"https://example.test/\\\"\"]'::jsonb,'source',"
        + "'{}'::jsonb,'"
        + artifactHash
        + "',1,'{\"environment\":\"Production\"}'::jsonb,'{}'::jsonb,"
        + "'{\"intentDerivationVersion\":\""
        + (version == null ? "none" : version)
        + "\"}'::jsonb,'v24@citi.com',"
        + (version == null ? "NULL" : "'" + version + "'")
        + ","
        + (expectedIntent == null ? "NULL" : "'" + expectedIntent + "'::jsonb")
        + (referencePolicy == null ? "" : ",'" + referencePolicy + "'::jsonb")
        + ")";
  }

  private static String policy(String secret) {
    return "{\"version\":2,\"steps\":[{\"stepIndex\":0,"
        + "\"required\":{\"variables\":[],\"secrets\":[\""
        + secret
        + "\"]},\"allowed\":{\"variables\":[],\"secrets\":[\""
        + secret
        + "\"]}}]}";
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

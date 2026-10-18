package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * {@code V18__drop_plaintext_secrets} (studio-vault-secrets, AC-V1-1; the former V25, re-numbered
 * by the STUDIO-OBS-012A / ADR-SC-005 D-B re-baseline): the plaintext {@code secrets} table and its
 * indexes are gone, rows included. Vault is the only secret store.
 */
@Testcontainers(disabledWithoutDocker = true)
class PlaintextSecretsDropMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_v18")
          .withUsername("test")
          .withPassword("test");

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway("17").migrate();
    // A plaintext row written before V18: the drop must not depend on the table being empty.
    execute(
        "INSERT INTO secrets (reference_id,label,scope,owner,last_four,encrypted_value) VALUES"
            + " ('vault/checks/project/v18','V18','project','v18@citi.com','v18x',"
            + "'plaintext-canary'::bytea)");
    assertThat(scalarText("SELECT to_regclass('public.secrets')::text")).isEqualTo("secrets");
    flyway("18").migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void theTableIsGone() throws SQLException {
    assertThat(scalarText("SELECT to_regclass('public.secrets')::text")).isNull();
  }

  @Test
  void itsIndexesAreGone() throws SQLException {
    assertThat(
            scalarInt(
                "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'"
                    + " AND indexname IN ('idx_secrets_owner','idx_secrets_scope')"))
        .isZero();
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

  private static String scalarText(String sql) throws SQLException {
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

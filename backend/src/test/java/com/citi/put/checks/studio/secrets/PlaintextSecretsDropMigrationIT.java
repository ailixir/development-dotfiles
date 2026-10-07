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
 * Forward-only V25 (studio-vault-secrets, AC-V1-1): the plaintext {@code secrets} table and its
 * indexes are gone, rows included. Vault is the only secret store.
 */
@Testcontainers(disabledWithoutDocker = true)
class PlaintextSecretsDropMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_v25")
          .withUsername("test")
          .withPassword("test");

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway("24").migrate();
    // A V24-era plaintext row: the drop must not depend on the table being empty.
    execute(
        "INSERT INTO secrets (reference_id,label,scope,owner,last_four,encrypted_value) VALUES"
            + " ('vault/checks/project/v25','V25','project','v25@citi.com','v25x',"
            + "'plaintext-canary'::bytea)");
    assertThat(scalarText("SELECT to_regclass('public.secrets')::text")).isEqualTo("secrets");
    flyway("25").migrate();
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

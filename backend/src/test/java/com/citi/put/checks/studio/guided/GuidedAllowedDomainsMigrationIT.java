package com.citi.put.checks.studio.guided;

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
 * V28 ({@code V28__allowed_domains.sql}) on top of V1 to V27: the deployment's allowed domains are
 * no longer part of a replay scope or an issued runner context, so the two guards that named the
 * origin lists lose those keys. The remaining origin pattern check on {@code initialContext.origin}
 * stays.
 */
@Testcontainers(disabledWithoutDocker = true)
class GuidedAllowedDomainsMigrationIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("allowed_domains");

  @BeforeAll
  static void migrate() {
    POSTGRES.start();
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .load()
        .migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void v28AppliesAsTheHeadOnTopOfV1ToV27() throws SQLException {
    try (Connection c = connect()) {
      assertThat(
              scalar(
                  c, "SELECT count(*) FROM flyway_schema_history WHERE version='33' AND success"))
          .isEqualTo("1");
      assertThat(scalar(c, "SELECT description FROM flyway_schema_history WHERE version='28'"))
          .isEqualTo("allowed domains");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM flyway_schema_history WHERE success AND version::int <= 29"))
          .isEqualTo("29");
    }
  }

  @Test
  void aReplayScopeIsClosedWithoutAnOriginList() throws SQLException {
    try (Connection c = connect()) {
      String base =
          "'principalId':'u','csiId':'CSI-1','environment':'Production','capabilities':['step']";
      assertThat(scope(c, "{" + base + ",'initialContext':{'kind':'initialBlank'}}")).isTrue();
      assertThat(
              scope(
                  c,
                  "{"
                      + base
                      + ",'initialContext':{'kind':'observedDocument','origin':'https://a.example'}}"))
          .as("an observed initial context still names a well-formed origin")
          .isTrue();
      assertThat(
              scope(
                  c,
                  "{"
                      + base
                      + ",'allowedOrigins':['https://a.example'],'initialContext':{'kind':'initialBlank'}}"))
          .as("allowedOrigins is no longer a scope key")
          .isFalse();
      assertThat(
              scope(
                  c,
                  "{"
                      + base
                      + ",'initialContext':{'kind':'observedDocument','origin':'https://a.example/path'}}"))
          .as("an initial-context origin with a path is refused")
          .isFalse();
      assertThat(scope(c, "{" + base + ",'initialContext':{'kind':'observedDocument'}}"))
          .as("an observed initial context needs its origin")
          .isFalse();
    }
  }

  @Test
  void theDeliveryGuardNoLongerNamesApprovedOrigins() throws SQLException {
    try (Connection c = connect()) {
      assertThat(
              scalar(
                  c,
                  "SELECT prosrc LIKE '%approvedOrigins%' FROM pg_proc WHERE"
                      + " proname='studio_015_delivery_guard'"))
          .isEqualTo("f");
      assertThat(
              scalar(
                  c,
                  "SELECT prosrc LIKE '%allowedOrigins%' FROM pg_proc WHERE"
                      + " proname='studio_publication_scope'"))
          .isEqualTo("f");
    }
  }

  private static boolean scope(Connection c, String json) throws SQLException {
    return scalar(c, "SELECT studio_publication_scope('" + json.replace('\'', '"') + "'::jsonb)")
        .equals("t");
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static String scalar(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      r.next();
      return r.getString(1);
    }
  }
}

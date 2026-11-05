package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.support.TestPostgresDatabase;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** The development seed loads cleanly without inventing Studio tests or run results. */
class StudioSeedIT {

  private static final String SEED_RESOURCE = "/db/seed/R__sample_data.sql";
  private static final String SEED_TEST_PREFIX = "b8c9d0e1-0001-4000-8000-";
  private static final String SEED_EXECUTION_PREFIX = "c9d0e1f2-0001-4000-8000-";

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("checks_seed");

  @BeforeAll
  static void migrateWithSeed() {
    POSTGRES.start();
    flyway().migrate();
  }

  @AfterAll
  static void stopContainer() {
    POSTGRES.stop();
  }

  private static Flyway flyway() {
    return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration", "classpath:db/seed")
        .load();
  }

  @Test
  void theSeedNamesNoObjectStoreThatDoesNotExist() throws IOException {
    assertThat(readSeed()).doesNotContain("storage.internal.citi.com");
  }

  @Test
  void studioStartsWithoutFabricatedTestsOrExecutionHistory() throws SQLException {
    assertNoSeededStudioRows();
  }

  @Test
  void reapplyingTheSeedStillCreatesNoStudioResults() throws SQLException, IOException {
    try (Connection connection = connect();
        Statement statement = connection.createStatement()) {
      statement.execute(readSeed());
    }
    assertNoSeededStudioRows();
  }

  private static void assertNoSeededStudioRows() throws SQLException {
    assertThat(
            strings(
                "SELECT COUNT(*)::text FROM ui_tests WHERE id::text LIKE '"
                    + SEED_TEST_PREFIX
                    + "%'"))
        .containsExactly("0");
    assertThat(
            strings(
                "SELECT COUNT(*)::text FROM ui_test_executions WHERE id::text LIKE '"
                    + SEED_EXECUTION_PREFIX
                    + "%'"))
        .containsExactly("0");
  }

  private static String readSeed() throws IOException {
    try (InputStream in = StudioSeedIT.class.getResourceAsStream(SEED_RESOURCE)) {
      assertThat(in).as(SEED_RESOURCE + " on the classpath").isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private static List<String> strings(String sql) throws SQLException {
    List<String> values = new ArrayList<>();
    try (Connection connection = connect();
        Statement statement = connection.createStatement();
        ResultSet resultSet = statement.executeQuery(sql)) {
      while (resultSet.next()) {
        values.add(resultSet.getString(1));
      }
    }
    return values;
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }
}

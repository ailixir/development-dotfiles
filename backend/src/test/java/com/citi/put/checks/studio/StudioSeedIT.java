package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Studio v1 WP6 — the {@code dev} seed loads on the current schema and claims nothing the product
 * cannot do.
 *
 * <p>The seed is a repeatable migration, so Flyway applies it <em>after</em> every versioned one.
 * Nothing else in the suite runs it, which is how it drifted: V14 made {@code logs} JSONB and
 * restricted {@code browser} to {@code chromium}, and the seed kept inserting free text and {@code
 * firefox}. This test applies exactly what {@code application-dev.yml} applies — {@code
 * db/migration} plus {@code db/seed} — to an empty database, twice, and reads back what it wrote.
 */
@Testcontainers(disabledWithoutDocker = true)
class StudioSeedIT {

  private static final String SEED_RESOURCE = "/db/seed/R__sample_data.sql";
  private static final String SEED_TEST_PREFIX = "b8c9d0e1-0001-4000-8000-";
  private static final String SEED_EXECUTION_PREFIX = "c9d0e1f2-0001-4000-8000-";

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_seed")
          .withUsername("test")
          .withPassword("test");

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
    String seed = readSeed();
    assertThat(seed).doesNotContain("storage.internal.citi.com");
  }

  @Test
  void seededExecutionsCarryAnHonestNoVideoState() throws SQLException {
    List<String> rows =
        strings(
            "SELECT id || '|' || COALESCE(video_status, '<null>') || '|' ||"
                + " COALESCE(video_key, '<null>') || '|' || COALESCE(video_url, '<null>') || '|' ||"
                + " COALESCE(array_length(screenshot_urls, 1)::text, '<null>')"
                + "  FROM ui_test_executions WHERE id::text LIKE '"
                + SEED_EXECUTION_PREFIX
                + "%' ORDER BY id");

    assertThat(rows).hasSize(6);
    assertThat(rows)
        .allSatisfy(row -> assertThat(row).endsWith("|UNAVAILABLE|<null>|<null>|<null>"));
  }

  @Test
  void seededExecutionsAreVisibleNotQuarantined() throws SQLException {
    // A row with no CSI or no ledger locator is excluded from every user-facing query (V14 §4, §7),
    // so "the Runs page shows No video" is only observable if the row reaches the page at all.
    List<String> invisible =
        strings(
            "SELECT e.id::text FROM ui_test_executions e"
                + "  LEFT JOIN studio_dispatch_ledger l ON l.execution_id = e.id"
                + " WHERE e.id::text LIKE '"
                + SEED_EXECUTION_PREFIX
                + "%' AND (e.csi_id IS NULL OR l.execution_id IS NULL"
                + "        OR l.state <> 'DONE' OR l.execution_accepted_at <> e.started_at)");

    assertThat(invisible).isEmpty();
  }

  @Test
  void seededTestsAreChromiumAndCarryNoScheduleNothingExecutes() throws SQLException {
    List<String> rows =
        strings(
            "SELECT browser || '|' || COALESCE(schedule::text, '<null>') FROM ui_tests"
                + " WHERE id::text LIKE '"
                + SEED_TEST_PREFIX
                + "%'");

    assertThat(rows).hasSize(3).containsOnly("chromium|<null>");
  }

  @Test
  void reapplyingTheSeedDuplicatesNothing() throws SQLException, IOException {
    // A repeatable migration re-runs whenever its checksum changes. `ui_test_executions` is keyed
    // by (id, started_at) and the seed's started_at is NOW()-relative, so ON CONFLICT alone would
    // insert a second copy of every run on each re-run.
    try (Connection connection = connect();
        Statement statement = connection.createStatement()) {
      statement.execute(readSeed());
    }

    assertThat(
            strings(
                "SELECT COUNT(*)::text FROM ui_test_executions WHERE id::text LIKE '"
                    + SEED_EXECUTION_PREFIX
                    + "%'"))
        .containsExactly("6");
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

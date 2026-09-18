package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.14 AC-16 — V17's CHECK proven against a database that <em>already holds</em> rows.
 *
 * <p>This epic has paid for this test shape once already. Story 10.1's V14 would have aborted on
 * any non-empty database — section 6 rewrote {@code ui_tests.browser} while V1's inline constraint
 * was still in force — and CI could not have caught it, because, as {@link LegacyDataMigrationIT}'s
 * own javadoc puts it, <i>"every other migration test in the repository builds the schema from
 * scratch and inserts afterwards, so V14's data-transformation statements always match zero
 * rows"</i>. It was found when QA stood up a container holding one pre-existing row.
 *
 * <p>A constraint proven only against a schema built empty is proven against the one condition that
 * cannot fail. So this test migrates to <b>V16</b>, <b>seeds</b>, and only then migrates to V17 —
 * twice, against two databases in one container, because the constraint has two outcomes and both
 * are decided rather than discovered:
 *
 * <ul>
 *   <li><b>clean</b> — rows across {@code ui_test_executions_2026_06} and the <b>DEFAULT</b>
 *       partition, some with {@code error_code IS NULL} and one per declared value: V17 applies,
 *       every partition's constraint ends {@code convalidated}, and a new undeclared write is
 *       refused;
 *   <li><b>dirty</b> — the same seed plus one row holding a value outside the vocabulary, which is
 *       the only way a ninth value can exist (§15.5: a restored dump or a manual repair): V17
 *       <b>fails loudly</b>, the message names the offending relation, the operator query in the
 *       migration's own comment finds the row, and the constraint validates once it is repaired.
 * </ul>
 *
 * <p>The vocabulary is read from {@link ExecutionErrorCode#values()} and never transcribed here; a
 * hardcoded list would be a third copy and is the failure mode O-11 exists because of.
 */
@Testcontainers(disabledWithoutDocker = true)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ErrorCodeConstraintMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";
  private static final String CSI_ID = "60002";
  private static final String CONSTRAINT = "ck_ui_test_executions_error_code";

  /**
   * The vocabulary V17 constrains: the API's, less the codes a later migration added.
   *
   * <p>Read from {@link ExecutionErrorCode#values()} and narrowed, never transcribed. {@code
   * CANCELLED} arrived with V20 (Studio v1 WP4), so no row can hold it before V20 applies; seeding
   * one at V16 would be seeding data V17 rightly refuses. V20's own list is compared with the enum
   * by {@link ErrorCodeVocabularyTest}.
   */
  private static final java.util.Set<String> V17_VOCABULARY =
      ExecutionErrorCode.values().stream()
          .filter(code -> !ExecutionErrorCode.CANCELLED.equals(code))
          .collect(java.util.stream.Collectors.toUnmodifiableSet());

  /** Only a restored dump or a manual repair can produce one (§15.5). */
  private static final String OUT_OF_VOCABULARY = "RESTORED_FROM_DUMP";

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine")
          .withDatabaseName("checks_error_code_clean")
          .withUsername("test")
          .withPassword("test");

  private static String cleanUrl;
  private static String dirtyUrl;
  private static UUID cleanTestId;
  private static UUID dirtyTestId;

  @BeforeAll
  static void migrateBothDatabasesInTwoStages() throws SQLException {
    POSTGRES.start();
    cleanUrl = urlFor("checks_error_code_clean");
    dirtyUrl = urlFor("checks_error_code_dirty");
    try (Connection connection = open(cleanUrl);
        Statement statement = connection.createStatement()) {
      statement.execute("CREATE DATABASE checks_error_code_dirty");
    }

    // Stage one: the schema as it stood before this story, on both databases.
    flywayTo(cleanUrl, "16");
    flywayTo(dirtyUrl, "16");

    // Stage two: rows, before the constraint exists. This is the whole point of the test.
    cleanTestId = seed(cleanUrl, false);
    dirtyTestId = seed(dirtyUrl, true);

    // Stage three: the migration under test, on the clean database only. The dirty one is
    // migrated inside its own test so the failure is the assertion rather than a setup error.
    flywayTo(cleanUrl, "17");
  }

  @AfterAll
  static void stopContainer() {
    POSTGRES.stop();
  }

  // ── Clean data: the migration applies and the constraint is live everywhere ──

  @Test
  @Order(1)
  void appliesToADatabaseThatAlreadyHoldsRowsAcrossTwoPartitionsIncludingDefault()
      throws SQLException {
    assertThat(
            scalarString(cleanUrl, "SELECT MAX(version::numeric)::text FROM flyway_schema_history"))
        .isEqualTo("17");
    assertThat(
            scalarInt(cleanUrl, "SELECT COUNT(*) FROM flyway_schema_history WHERE success = false"))
        .isZero();

    assertThat(partitionsHolding(cleanUrl))
        .as("the seed has to span more than one partition, DEFAULT included, or it proves nothing")
        .contains("ui_test_executions_2026_06", "ui_test_executions_default");
  }

  @Test
  @Order(2)
  void validatesTheConstraintOnTheParentAndOnEveryPartition() throws SQLException {
    List<String> unvalidated =
        strings(
            cleanUrl,
            "SELECT conrelid::regclass::text FROM pg_constraint"
                + " WHERE conname = '"
                + CONSTRAINT
                + "' AND NOT convalidated");

    assertThat(unvalidated)
        .as("VALIDATE CONSTRAINT ran; a constraint left NOT VALID is a half-applied migration")
        .isEmpty();
    assertThat(
            scalarInt(
                cleanUrl,
                "SELECT COUNT(*) FROM pg_constraint WHERE conname = '" + CONSTRAINT + "'"))
        .as("ALTER TABLE on the partitioned parent recurses: parent + 2026_05..07 + DEFAULT")
        .isEqualTo(5);
  }

  @Test
  @Order(3)
  void refusesAnUndeclaredValueOnANewWriteAndAcceptsEveryDeclaredOne() throws SQLException {
    for (String code : new TreeSet<>(V17_VOCABULARY)) {
      execute(
          cleanUrl,
          insertExecution(
              cleanTestId, UUID.randomUUID(), "2026-06-20 11:00:00+00", "'" + code + "'"));
    }

    assertThatThrownBy(
            () ->
                execute(
                    cleanUrl,
                    insertExecution(
                        cleanTestId,
                        UUID.randomUUID(),
                        "2026-06-20 11:00:00+00",
                        "'" + OUT_OF_VOCABULARY + "'")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(CONSTRAINT);

    assertThatThrownBy(
            () ->
                execute(
                    cleanUrl,
                    insertExecution(
                        cleanTestId, UUID.randomUUID(), "2027-01-20 11:00:00+00", "'TIMEOUTX'")))
        .as("the DEFAULT partition is constrained too, not only the named ones")
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(CONSTRAINT);
  }

  // ── Dirty data: the migration refuses, loudly, and the remedy works ──────────

  @Test
  @Order(4)
  void refusesToValidateAgainstARowHoldingAValueOutsideTheVocabulary() throws SQLException {
    assertThatThrownBy(() -> flywayTo(dirtyUrl, "17"))
        .as(
            "a restored dump holding a ninth value must abort the deploy rather than be published"
                + " as though the API had assigned it")
        .hasMessageContaining(CONSTRAINT)
        // PostgreSQL 15 names the *relation*, not the row — which is why the migration's comment
        // carries the query that finds the row.
        .hasMessageContaining("ui_test_executions_default");

    // The operator remedy, exactly as the migration's comment gives it.
    List<String> offending =
        strings(
            dirtyUrl,
            "SELECT error_code FROM ui_test_executions WHERE error_code IS NOT NULL"
                + " AND error_code NOT IN ("
                + quoted(V17_VOCABULARY)
                + ")");
    assertThat(offending).containsExactly(OUT_OF_VOCABULARY);
  }

  @Test
  @Order(5)
  void validatesOnceTheOffendingRowIsRepaired() throws SQLException {
    // Runs after @Order(4)'s failed migration, which left the constraint NOT VALID. The guard is
    // belt and braces: if Flyway ever rolls the failed statement back, the constraint is re-added
    // in the form the migration uses, so this test decides the remedy and not the rollback.
    ensureConstraintPresent(dirtyUrl);

    assertThatThrownBy(
            () ->
                execute(
                    dirtyUrl, "ALTER TABLE ui_test_executions VALIDATE CONSTRAINT " + CONSTRAINT))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(CONSTRAINT);

    // An ERROR whose cause the API could not name is `error_code IS NULL` by contract.
    execute(
        dirtyUrl,
        "UPDATE ui_test_executions SET error_code = NULL WHERE error_code = '"
            + OUT_OF_VOCABULARY
            + "'");
    execute(dirtyUrl, "ALTER TABLE ui_test_executions VALIDATE CONSTRAINT " + CONSTRAINT);

    // And the table is usable afterwards: a declared value writes, an undeclared one does not.
    execute(
        dirtyUrl,
        insertExecution(dirtyTestId, UUID.randomUUID(), "2027-03-16 10:00:00+00", "'STALE'"));
    assertThatThrownBy(
            () ->
                execute(
                    dirtyUrl,
                    insertExecution(
                        dirtyTestId,
                        UUID.randomUUID(),
                        "2027-03-16 10:00:00+00",
                        "'" + OUT_OF_VOCABULARY + "'")))
        .isInstanceOf(SQLException.class)
        .hasMessageContaining(CONSTRAINT);

    assertThat(
            strings(
                dirtyUrl,
                "SELECT conrelid::regclass::text FROM pg_constraint WHERE conname = '"
                    + CONSTRAINT
                    + "' AND NOT convalidated"))
        .isEmpty();
  }

  // ── Seeding, before the constraint exists ───────────────────────────────────

  /**
   * Rows across {@code 2026_06} and the DEFAULT partition: nulls, one per declared value, and —
   * when {@code dirty} — one value outside the vocabulary, landed in DEFAULT.
   */
  private static UUID seed(String url, boolean dirty) throws SQLException {
    UUID testId = UUID.randomUUID();
    execute(
        url,
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES"
            + " (gen_random_uuid(), 'sso-errorcode', 'Vocabulary Author', 'errorcode@citi.com',"
            + " NOW(), true)");
    execute(
        url,
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at) VALUES ('"
            + CSI_ID
            + "', 'Vocabulary CSI', 'Ops', 'HIGH', 'errorcode@citi.com', 'Production',"
            + " 'OPERATIONAL', NOW(), NOW())");
    execute(
        url,
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES ('"
            + testId
            + "', 'Vocabulary draft', '"
            + CSI_ID
            + "', 'Production', 'chromium', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb,"
            + " 'errorcode@citi.com', NOW(), NOW())");

    // A named partition: nulls plus half the vocabulary.
    execute(url, insertExecution(testId, UUID.randomUUID(), "2026-06-15 10:00:00+00", "NULL"));
    List<String> codes = new ArrayList<>(new TreeSet<>(V17_VOCABULARY));
    for (int index = 0; index < codes.size(); index++) {
      String partition = index % 2 == 0 ? "2026-06-15 10:00:00+00" : "2027-03-15 10:00:00+00";
      execute(
          url, insertExecution(testId, UUID.randomUUID(), partition, "'" + codes.get(index) + "'"));
    }
    // The DEFAULT partition: a null and, when dirty, the value that cannot legitimately exist.
    execute(url, insertExecution(testId, UUID.randomUUID(), "2027-03-15 10:00:00+00", "NULL"));
    if (dirty) {
      execute(
          url,
          insertExecution(
              testId, UUID.randomUUID(), "2027-03-15 10:00:00+00", "'" + OUT_OF_VOCABULARY + "'"));
    }
    return testId;
  }

  private static String insertExecution(
      UUID testId, UUID id, String startedAt, String errorCodeLiteral) {
    return "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
        + " duration_ms, error_code, created_at) VALUES ('"
        + id
        + "', '"
        + testId
        + "', 'ERROR', '"
        + startedAt
        + "', '"
        + startedAt
        + "'::timestamptz + INTERVAL '4 seconds', 4000, "
        + errorCodeLiteral
        + ", '"
        + startedAt
        + "')";
  }

  private static void ensureConstraintPresent(String url) throws SQLException {
    int present =
        scalarInt(url, "SELECT COUNT(*) FROM pg_constraint WHERE conname = '" + CONSTRAINT + "'");
    if (present > 0) {
      return;
    }
    execute(
        url,
        "ALTER TABLE ui_test_executions ADD CONSTRAINT "
            + CONSTRAINT
            + " CHECK (error_code IS NULL OR error_code IN ("
            + quoted(V17_VOCABULARY)
            + ")) NOT VALID");
  }

  private static String quoted(java.util.Collection<String> values) {
    return String.join(", ", new TreeSet<>(values).stream().map(v -> "'" + v + "'").toList());
  }

  // ── Plumbing ────────────────────────────────────────────────────────────────

  private static String urlFor(String database) {
    return "jdbc:postgresql://"
        + POSTGRES.getHost()
        + ":"
        + POSTGRES.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)
        + "/"
        + database;
  }

  private static void flywayTo(String url, String target) {
    Flyway.configure()
        .dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations(MIGRATIONS)
        .target(target)
        .load()
        .migrate();
  }

  private static Connection open(String url) throws SQLException {
    return DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static void execute(String url, String sql) throws SQLException {
    try (Connection connection = open(url);
        Statement statement = connection.createStatement()) {
      statement.execute(sql);
    }
  }

  private static List<String> strings(String url, String sql) throws SQLException {
    List<String> values = new ArrayList<>();
    try (Connection connection = open(url);
        Statement statement = connection.createStatement();
        ResultSet rows = statement.executeQuery(sql)) {
      while (rows.next()) {
        values.add(rows.getString(1));
      }
    }
    return values;
  }

  private static List<String> partitionsHolding(String url) throws SQLException {
    return strings(
        url, "SELECT DISTINCT tableoid::regclass::text FROM ui_test_executions ORDER BY 1");
  }

  private static String scalarString(String url, String sql) throws SQLException {
    List<String> values = strings(url, sql);
    return values.isEmpty() ? null : values.get(0);
  }

  private static int scalarInt(String url, String sql) throws SQLException {
    String value = scalarString(url, sql);
    return value == null ? 0 : Integer.parseInt(value);
  }
}

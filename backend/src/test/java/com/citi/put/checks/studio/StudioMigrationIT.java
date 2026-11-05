package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestExecutionId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Story 10.1 AC-17 — V12 → V14 on a real PostgreSQL, and real JPA writes on every partition.
 *
 * <p>{@code ui_test_executions} is range-partitioned by {@code started_at}. A migration that looks
 * correct on the parent can still be wrong on a partition, and the DEFAULT partition is the one
 * that most often diverges, so each partition is exercised explicitly rather than inferred.
 *
 * <p>The month-boundary case is the reason {@code started_at} is never rewritten: a run accepted on
 * the last minute of a month and finished in the next one must update in place, not migrate between
 * partitions.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class StudioMigrationIT {

  private static final String OWNER = "migration-owner@citi.com";
  private static final String CSI_ID = "60421";

  @PersistenceContext private EntityManager em;

  @Autowired private JdbcTemplate jdbc;
  @Autowired private UITestExecutionRepository executionRepository;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  // ── schema shape after V14 ───────────────────────────────────────────────

  @Test
  void theExecutionStatusVocabularyIsWidened() {
    Instant acceptedAt = Instant.parse("2026-06-15T10:00:00Z");
    // PENDING is what POST /tests/{id}/execute has always written; before V14 the CHECK
    // constraint rejected it outright.
    insertExecution(UUID.randomUUID(), acceptedAt, "PENDING", null, null);
    insertExecution(UUID.randomUUID(), acceptedAt, "RUNNING", null, null);
    insertExecution(UUID.randomUUID(), acceptedAt, "PASSED", null, 1000);
    insertExecution(UUID.randomUUID(), acceptedAt, "FAILED", null, 1000);
    // A timeout is ERROR plus a code, never a status of its own.
    insertExecution(UUID.randomUUID(), acceptedAt, "ERROR", "TIMEOUT", null);

    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_executions WHERE ui_test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(5);
  }

  // One violating statement per test: the first constraint violation aborts the transaction, so
  // two rejections in one method would only ever prove the first one.
  @Test
  void theLegacyCompletedStatusIsNoLongerWritable() {
    assertThatThrownBy(
            () ->
                insertExecution(
                    UUID.randomUUID(),
                    Instant.parse("2026-06-15T10:01:00Z"),
                    "COMPLETED",
                    null,
                    null))
        .hasMessageContaining("ck_ui_test_executions_status");
  }

  @Test
  void theLegacyTimeoutStatusIsNoLongerWritable() {
    assertThatThrownBy(
            () ->
                insertExecution(
                    UUID.randomUUID(),
                    Instant.parse("2026-06-15T10:02:00Z"),
                    "TIMEOUT",
                    null,
                    null))
        .hasMessageContaining("ck_ui_test_executions_status");
  }

  @Test
  void endAndDurationAreNullableAndTheEvidenceStatesAreConstrained() {
    UUID executionId = UUID.randomUUID();
    Instant acceptedAt = Instant.parse("2026-06-15T10:05:00Z");
    insertExecution(executionId, acceptedAt, "PENDING", null, null);

    assertThat(scalar("SELECT ended_at FROM ui_test_executions WHERE id = ?", executionId))
        .isNull();
    assertThat(scalar("SELECT duration_ms FROM ui_test_executions WHERE id = ?", executionId))
        .isNull();

    for (String state :
        new String[] {"PROCESSING", "AVAILABLE", "FAILED", "UNAVAILABLE", "EXPIRED"}) {
      jdbc.update(
          "UPDATE ui_test_executions SET video_status = ? WHERE id = ? AND started_at = ?",
          state,
          executionId,
          Timestamp.from(acceptedAt));
    }
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_executions SET video_status = 'ARCHIVED'"
                        + " WHERE id = ? AND started_at = ?",
                    executionId,
                    Timestamp.from(acceptedAt)))
        .hasMessageContaining("ck_ui_test_executions_video_status");
  }

  @Test
  void theLastRunProjectionAcceptsErrorAndTheBrowserConstraintIsCanonical() {
    jdbc.update("UPDATE ui_tests SET last_run_status = 'ERROR' WHERE id = ?", testId);
    assertThat(
            jdbc.queryForObject(
                "SELECT last_run_status FROM ui_tests WHERE id = ?", String.class, testId))
        .isEqualTo("ERROR");

    assertThat(
            jdbc.queryForObject("SELECT browser FROM ui_tests WHERE id = ?", String.class, testId))
        .isEqualTo("chromium");
    assertThatThrownBy(
            () -> jdbc.update("UPDATE ui_tests SET browser = 'firefox' WHERE id = ?", testId))
        .hasMessageContaining("ck_ui_tests_browser");
  }

  @Test
  void theLedgerIsUnpartitionedAndCarriesThePartitionLocator() {
    assertThat(
            jdbc.queryForObject(
                "SELECT relkind::text FROM pg_class WHERE relname = 'studio_dispatch_ledger'",
                String.class))
        .isEqualTo("r");
    // 'p' would mean partitioned; the ledger must stay a plain table so execution_id can be a
    // globally unique single-column primary key.
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns"
                    + " WHERE table_name = 'studio_dispatch_ledger'"
                    + " AND column_name = 'execution_accepted_at'",
                Integer.class))
        .isEqualTo(1);
  }

  // ── real JPA writes on every partition ───────────────────────────────────

  @Test
  void jpaWritesLandOnTheHistoricalCurrentFutureAndDefaultPartitions() {
    assertPartitionRoundTrip(Instant.parse("2026-05-20T08:00:00Z"), "ui_test_executions_2026_05");
    assertPartitionRoundTrip(Instant.parse("2026-06-20T08:00:00Z"), "ui_test_executions_2026_06");
    assertPartitionRoundTrip(Instant.parse("2026-07-20T08:00:00Z"), "ui_test_executions_2026_07");
    assertPartitionRoundTrip(Instant.parse("2027-11-20T08:00:00Z"), "ui_test_executions_default");
  }

  @Test
  void aRunAcceptedInOneMonthAndFinishedInTheNextUpdatesInPlace() {
    Instant acceptedAt = Instant.parse("2026-06-30T23:59:00Z");
    Instant browserStartedAt = Instant.parse("2026-06-30T23:59:30Z");
    Instant endedAt = Instant.parse("2026-07-01T00:05:00Z");

    UITestExecution execution = new UITestExecution(testId, "PENDING", acceptedAt, CSI_ID);
    execution = executionRepository.saveAndFlush(execution);
    UUID executionId = execution.getId();

    execution.setStatus("PASSED");
    execution.setBrowserStartedAt(browserStartedAt);
    execution.setEndedAt(endedAt);
    execution.setDurationMs(330_000);
    executionRepository.saveAndFlush(execution);
    em.clear();

    UITestExecution reloaded =
        executionRepository.findByIdAndStartedAt(executionId, acceptedAt).orElseThrow();
    assertThat(reloaded.getStatus()).isEqualTo("PASSED");
    assertThat(reloaded.getEndedAt()).isEqualTo(endedAt);
    // The acceptance timestamp is the partition key and is never rewritten when the browser runs.
    assertThat(reloaded.getStartedAt()).isEqualTo(acceptedAt);
    assertThat(partitionOf(executionId)).isEqualTo("ui_test_executions_2026_06");
  }

  @Test
  void theCompositeKeyIsWhatAddressesAHistoryRow() {
    Instant acceptedAt = Instant.parse("2026-07-03T09:00:00Z");
    UITestExecution execution =
        executionRepository.saveAndFlush(
            new UITestExecution(testId, "PENDING", acceptedAt, CSI_ID));
    em.clear();

    assertThat(em.find(UITestExecution.class, new UITestExecutionId(execution.getId(), acceptedAt)))
        .isNotNull();
    // A wrong locator finds nothing rather than silently scanning every partition.
    assertThat(
            em.find(
                UITestExecution.class,
                new UITestExecutionId(execution.getId(), acceptedAt.plusSeconds(1))))
        .isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void assertPartitionRoundTrip(Instant acceptedAt, String expectedPartition) {
    UITestExecution execution =
        executionRepository.saveAndFlush(
            new UITestExecution(testId, "PENDING", acceptedAt, CSI_ID));
    UUID executionId = execution.getId();

    execution.setStatus("FAILED");
    execution.setEndedAt(acceptedAt.plusSeconds(12));
    execution.setDurationMs(12_000);
    execution.setStepResults("[]");
    execution.setLogs("[]");
    execution.setRuntimeVersions("{\"playwright\":\"1.47.2\"}");
    executionRepository.saveAndFlush(execution);
    em.clear();

    assertThat(partitionOf(executionId)).isEqualTo(expectedPartition);
    assertThat(
            executionRepository
                .findByIdAndStartedAt(executionId, acceptedAt)
                .orElseThrow()
                .getStatus())
        .isEqualTo("FAILED");
  }

  private String partitionOf(UUID executionId) {
    return jdbc.queryForObject(
        "SELECT tableoid::regclass::text FROM ui_test_executions WHERE id = ?",
        String.class,
        executionId);
  }

  private Object scalar(String sql, Object argument) {
    return jdbc.queryForObject(sql, Object.class, argument);
  }

  private void insertExecution(
      UUID executionId, Instant acceptedAt, String status, String errorCode, Integer durationMs) {
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, error_code,"
            + " duration_ms, csi_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        executionId,
        testId,
        status,
        Timestamp.from(acceptedAt),
        errorCode,
        durationMs,
        CSI_ID);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, 'Migration draft', ?, 'Production', 'chromium',"
            + " CAST('[\"Go to the home page\"]' AS jsonb), CAST('[]' AS jsonb), 30,"
            + " 'networkidle', ?, ?, ?)",
        id,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Migration Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Migration CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

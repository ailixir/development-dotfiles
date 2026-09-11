package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.dto.UITestRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.4 AC-20 — FOC-01 cross-check: history keeps the revision it actually executed.
 *
 * <p>{@code ui_test_executions.revision_id} is added by story 10.1's V14, which merges after this
 * story (FOC-01). Until then every case here is skipped by the assumption below rather than
 * asserted against a column that does not exist yet; once V14 lands the test activates on its own
 * with no edit required.
 *
 * <p>Note the partition key: {@code ui_test_executions} is partitioned by {@code started_at} with
 * primary key {@code (id, started_at)}, so history rows are always addressed by that pair.
 */
@SpringBootTest
@ActiveProfiles("local")
class RevisionRetentionIT {

  private static final String OWNER = "retention-owner@citi.com";
  private static final String CSI_ID = "60406";

  @Autowired StudioService studioService;
  @Autowired CompileStateService compileStateService;
  @Autowired JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    assumeTrue(revisionIdColumnExists(), "ui_test_executions.revision_id arrives with 10.1's V14");
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void anExecutionKeepsItsRevisionAfterTheDraftIsEditedAndRecompiled() {
    UUID executedRevision = compileAndConfirm("artifact-hash-1", 1L, 1L);
    Instant startedAt = Instant.now();
    UUID executionId = seedExecution(executedRevision, startedAt);

    studioService.updateTest(testId, updateRequest("[\"Go to the login page\"]"));
    UUID newRevision = compileAndConfirm("artifact-hash-2", 2L, 1L);

    assertThat(newRevision).isNotEqualTo(executedRevision);
    assertThat(executionRevision(executionId, startedAt)).isEqualTo(executedRevision);
    assertThat(
            jdbc.queryForObject(
                "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?",
                String.class,
                executedRevision))
        .isEqualTo("artifact-hash-1");
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?",
                String.class,
                executedRevision))
        .isEqualTo(OWNER);
  }

  @Test
  void aSoftDeletedTestStillExposesTheRevisionItsHistoryPointsAt() {
    UUID executedRevision = compileAndConfirm("artifact-hash-3", 1L, 1L);
    Instant startedAt = Instant.now();
    UUID executionId = seedExecution(executedRevision, startedAt);

    studioService.softDeleteTest(testId);

    assertThat(executionRevision(executionId, startedAt)).isEqualTo(executedRevision);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId))
        .isEqualTo(1);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private boolean revisionIdColumnExists() {
    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns"
                + " WHERE table_name = 'ui_test_executions' AND column_name = 'revision_id'",
            Integer.class);
    return count != null && count > 0;
  }

  private UUID compileAndConfirm(
      String artifactHash, long sourceRevision, long configurationRevision) {
    CompileRequest request = compileStateService.beginCompile(testId);
    compileStateService.publishCandidate(
        testId,
        request,
        new CandidateRevision(
            request.configurationRevision(),
            "{\"version\":1,\"steps\":[]}",
            "source-hash-" + artifactHash,
            "{\"version\":1,\"steps\":[]}",
            artifactHash,
            1,
            "{\"browser\":\"chromium\"}",
            "[]",
            "{\"model\":\"stub-model@1\"}",
            OWNER));
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    return compileStateService.confirm(
        testId, revisionId, artifactHash, sourceRevision, configurationRevision, OWNER);
  }

  private UUID seedExecution(UUID revisionId, Instant startedAt) {
    UUID executionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
            + " duration_ms, revision_id) VALUES (?, ?, 'PASSED', ?, ?, 1000, ?)",
        executionId,
        testId,
        Timestamp.from(startedAt),
        Timestamp.from(startedAt.plusMillis(1000)),
        revisionId);
    return executionId;
  }

  private UUID executionRevision(UUID executionId, Instant startedAt) {
    return jdbc.queryForObject(
        "SELECT revision_id FROM ui_test_executions WHERE id = ? AND started_at = ?",
        UUID.class,
        executionId,
        Timestamp.from(startedAt));
  }

  private UITestRequest updateRequest(String steps) {
    return new UITestRequest(
        "Retention draft",
        "history",
        CSI_ID,
        steps,
        "[]",
        "chrome",
        1920,
        1080,
        30,
        "networkidle",
        "Production",
        1L,
        1L);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, 'Retention draft', ?, 'Production', 'chromium',"
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
            + " VALUES (?, ?, 'Retention Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Retention CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

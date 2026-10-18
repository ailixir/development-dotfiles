package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.4 AC-20 — FOC-01 cross-check: history keeps the revision it actually executed.
 *
 * <p>STUDIO-OBS-012A (ADR-SC-005 D-A): the only revision family is an observed ({@code GUIDED_RUN})
 * publication, so each case publishes one through the production writers ({@link
 * ObservedPublicationFixture}) and records an execution of it that carries the observed revision
 * binding the V15 execution guard requires.
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
  @Autowired JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void anExecutionKeepsItsRevisionAfterTheDraftIsEditedAndRecompiled() {
    UUID executedRevision = publish();
    String executedArtifactHash = artifactHash(executedRevision);
    Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    UUID executionId = seedExecution(executedRevision, startedAt);

    editFirstStep("Go to the login page");
    UUID newRevision = publish();

    assertThat(newRevision).isNotEqualTo(executedRevision);
    assertThat(executionRevision(executionId, startedAt)).isEqualTo(executedRevision);
    assertThat(
            jdbc.queryForObject(
                "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?",
                String.class,
                executedRevision))
        .isEqualTo(executedArtifactHash);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?",
                String.class,
                executedRevision))
        .isEqualTo(OWNER);
  }

  @Test
  void aSoftDeletedTestStillExposesTheRevisionItsHistoryPointsAt() {
    UUID executedRevision = publish();
    Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    UUID executionId = seedExecution(executedRevision, startedAt);

    studioService.softDeleteTest(testId);

    assertThat(executionRevision(executionId, startedAt)).isEqualTo(executedRevision);
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId))
        .isEqualTo(1);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Publishes the draft's current steps as an observed revision and confirms it. */
  private UUID publish() {
    return new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
  }

  private String artifactHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  /**
   * An executed run of {@code revisionId}: its dispatch-ledger locator, then the history row with
   * the observed revision binding the V15 execution guard requires of a row that names a {@code
   * GUIDED_RUN} revision ({@code StudioSchedulingSchemaIT} history/ledger shape).
   *
   * @param startedAt millisecond precision, the precision the binding records
   */
  private UUID seedExecution(UUID revisionId, Instant startedAt) {
    UUID executionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id, csi_id,"
            + " principal, state) VALUES (?, ?, ?, ?, ?, 'DONE')",
        executionId,
        Timestamp.from(startedAt),
        testId,
        CSI_ID,
        OWNER);
    jdbc.update(
        "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
            + " duration_ms, csi_id, principal, environment, revision_id,"
            + " observed_revision_binding) VALUES (?, ?, 'PASSED', ?, ?, 1000, ?, ?, 'Production',"
            + " ?, CAST(? AS jsonb))",
        executionId,
        testId,
        Timestamp.from(startedAt),
        Timestamp.from(startedAt.plusMillis(1000)),
        CSI_ID,
        OWNER,
        revisionId,
        GuidedPublicationMigrationTest.observedBinding(
                jdbc, revisionId, executionId, startedAt, OWNER)
            .toString());
    return executionId;
  }

  /** Edits the first step through the v2 authoring save a learned draft requires. */
  private void editFirstStep(String text) {
    Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    var draft = studioService.findTestById(testId, owner);
    var authoring = studioService.findAuthoringV2ById(testId, owner);
    var step = authoring.steps().get(0);
    studioService.saveAuthoring(
        testId,
        new AuthoringV2Request(
            2,
            authoring.globalContext(),
            List.of(new AuthoringStep(step.id(), text, step.context()))),
        draft.sourceRevision(),
        draft.configurationRevision(),
        owner);
  }

  private UUID executionRevision(UUID executionId, Instant startedAt) {
    return jdbc.queryForObject(
        "SELECT revision_id FROM ui_test_executions WHERE id = ? AND started_at = ?",
        UUID.class,
        executionId,
        Timestamp.from(startedAt));
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

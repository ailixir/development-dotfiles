package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Story 10.1 AC-19 — a late completion never rewrites a newer run's verdict.
 *
 * <p>Executions finish out of order: a slow run accepted at 10:00 can commit its outcome after a
 * fast run accepted at 10:05. Whoever writes last would otherwise win, and the dashboard would show
 * a stale verdict with a stale timestamp (Architecture §8.2).
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class LastRunProjectionIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String OWNER = "projection-owner@citi.com";
  private static final String CSI_ID = "60423";

  @Autowired private StudioService studioService;
  @Autowired private UITestExecutionRepository executionRepository;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void anOlderExecutionFinishingLateDoesNotOverwriteANewerProjection() {
    UUID older = accept();
    // Acceptance order is what the projection compares on, so the two runs must be distinguishable
    // in the timestamp the database actually stores.
    sleepBriefly();
    UUID newer = accept();

    // The newer run finishes first and wins the projection.
    finish(newer, "PASSED");
    assertThat(studioService.applyLastRunProjection(newer)).isTrue();
    assertThat(lastRunStatus()).isEqualTo("PASSED");
    Instant projectedAt = lastRunAt();

    // The older run finishes afterwards and must be ignored.
    finish(older, "FAILED");
    assertThat(studioService.applyLastRunProjection(older)).isFalse();

    assertThat(lastRunStatus()).isEqualTo("PASSED");
    assertThat(lastRunAt()).isEqualTo(projectedAt);
  }

  @Test
  void errorIsAProjectableOutcome() {
    UUID executionId = accept();
    finish(executionId, "ERROR");

    assertThat(studioService.applyLastRunProjection(executionId)).isTrue();
    assertThat(lastRunStatus()).isEqualTo("ERROR");
  }

  @Test
  void anUnfinishedExecutionProjectsNothing() {
    UUID executionId = accept();

    assertThat(studioService.applyLastRunProjection(executionId)).isFalse();
    assertThat(lastRunStatus()).isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static void sleepBriefly() {
    try {
      Thread.sleep(20);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while spacing two acceptances", e);
    }
  }

  private UUID accept() {
    ExecutionSnapshotDto snapshot =
        studioService.executeTest(
            testId, identity(), null, ObservedPublicationFixture.request(identity()));
    return snapshot.executionId();
  }

  private void finish(UUID executionId, String status) {
    UITestExecution execution = executionRepository.findByExecutionId(executionId).orElseThrow();
    execution.setStatus(status);
    execution.setBrowserStartedAt(execution.getStartedAt().plusSeconds(1));
    execution.setEndedAt(execution.getStartedAt().plusSeconds(11));
    execution.setDurationMs(10_000);
    executionRepository.saveAndFlush(execution);
  }

  private String lastRunStatus() {
    return jdbc.queryForObject(
        "SELECT last_run_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private Instant lastRunAt() {
    Timestamp value =
        jdbc.queryForObject(
            "SELECT last_run_at FROM ui_tests WHERE id = ?", Timestamp.class, testId);
    return value == null ? null : value.toInstant();
  }

  private static Authentication identity() {
    return new BffAuthenticationToken(
        new UserIdentity("uid", OWNER, OWNER, "Ops", List.of("checks-admin"), List.of()));
  }

  /** A compiled and confirmed draft: acceptance runs the readiness gate from story 10.7 onwards. */
  private UUID seedTest() {
    return new StudioExecutionFixtures(jdbc)
        .seedRunnableTest("Projection draft", CSI_ID, OWNER, List.of("Go to the home page"))
        .testId();
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Projection Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Projection CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Studio v1 WP7 — the backlog gauge reads the ledger, against real Postgres.
 *
 * <p>The bean is worker-only, so it is built here over this context's {@link JdbcTemplate}; what is
 * under test is its query against the real {@code studio_dispatch_ledger}, not its wiring. Other
 * test classes share this database and may leave rows behind, so every assertion is a <b>delta</b>
 * from a reading taken after this class's own clean-up.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioDispatchMetricsIT {

  private static final String CSI_ID = "60461";
  private static final String OWNER = "dispatch-metrics-owner@citi.com";

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private JdbcTemplate jdbc;

  private StudioDispatchMetrics metrics;
  private Authentication owner;
  private UUID testId;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id = ?", CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    testId =
        fixtures
            .seedRunnableTest("Metrics draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    metrics = new StudioDispatchMetrics(jdbc, new SimpleMeterRegistry());
  }

  @Test
  void threeQueuedRowsReadAsThreeAndAClaimMovesOneToClaimed() {
    metrics.refresh();
    long queuedBefore = metrics.backlog(DispatchState.QUEUED);
    long claimedBefore = metrics.backlog(DispatchState.CLAIMED);

    List<UUID> executions = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      executions.add(studioService.executeTest(testId, owner, null).executionId());
    }
    metrics.refresh();
    assertThat(metrics.backlog(DispatchState.QUEUED) - queuedBefore).isEqualTo(3);
    assertThat(metrics.backlog(DispatchState.CLAIMED) - claimedBefore).isZero();

    Instant now = Instant.now();
    assertThat(statements.claim(executions.get(0), "metrics-it", now.plusSeconds(60), now))
        .isEqualTo(1);
    metrics.refresh();
    assertThat(metrics.backlog(DispatchState.QUEUED) - queuedBefore).isEqualTo(2);
    assertThat(metrics.backlog(DispatchState.CLAIMED) - claimedBefore).isEqualTo(1);
  }

  @Test
  void rowsPastTheBacklogStatesAreNotCounted() {
    metrics.refresh();
    long queuedBefore = metrics.backlog(DispatchState.QUEUED);
    long claimedBefore = metrics.backlog(DispatchState.CLAIMED);

    UUID executionId = studioService.executeTest(testId, owner, null).executionId();
    Instant now = Instant.now();
    assertThat(statements.claim(executionId, "metrics-it", now.plusSeconds(60), now)).isEqualTo(1);
    assertThat(statements.beginDispatch(executionId, "metrics-it", UUID.randomUUID())).isEqualTo(1);
    metrics.refresh();

    assertThat(metrics.backlog(DispatchState.QUEUED)).isEqualTo(queuedBefore);
    assertThat(metrics.backlog(DispatchState.CLAIMED)).isEqualTo(claimedBefore);
  }
}

package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.scheduling.ScheduledUiTestLauncher;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Turns a due slot of a UI test's shared schedule into the same accepted execution a manual replay
 * produces. {@link StudioAcceptanceService} writes the execution and ledger rows; the existing
 * {@link StudioDispatcher}, runner admission, callbacks and recovery then run it.
 *
 * <p>There is no schedule-specific admission, authorization or state: a slot either starts a run of
 * the test's current confirmed revision or is spent without one.
 */
@Component
public class StudioScheduledUiTestLauncher implements ScheduledUiTestLauncher {

  /**
   * The one identity every scheduled run executes as. A code constant, not configuration: it needs
   * no grant, and it fills the ledger's principal and the audit trail.
   */
  public static final String SCHEDULER_PRINCIPAL = "system:checks-scheduler";

  private final StudioAcceptanceService acceptance;
  private final JdbcTemplate jdbc;

  public StudioScheduledUiTestLauncher(StudioAcceptanceService acceptance, JdbcTemplate jdbc) {
    this.acceptance = acceptance;
    this.jdbc = jdbc;
  }

  @Override
  public Result launch(UUID uiTestId, UUID scheduleId, Instant scheduledAt) {
    if (running(uiTestId)) {
      return new Result(Outcome.SKIPPED, "RUN_IN_PROGRESS");
    }
    StudioAcceptanceService.ScheduledResult accepted;
    try {
      accepted =
          acceptance.acceptScheduled(
              uiTestId,
              SCHEDULER_PRINCIPAL,
              new StudioAcceptanceService.ScheduledIdentity(scheduleId, scheduledAt));
    } catch (IllegalArgumentException ex) {
      // The test is gone or quarantined; the acceptance transaction found no visible row.
      return new Result(Outcome.SKIPPED, "TEST_UNAVAILABLE");
    } catch (GuidedSessionException ex) {
      // The observed binding was refused before any row was written (unsupported pin, scope drift).
      return new Result(Outcome.SKIPPED, "RUNTIME_INCOMPATIBLE");
    }
    if ("ACCEPTED".equals(accepted.decision())) {
      return new Result(Outcome.ACCEPTED, accepted.code());
    }
    if ("DEFERRED".equals(accepted.decision())
        && "PENDING_QUOTA_EXCEEDED".equals(accepted.code())) {
      return new Result(Outcome.THROTTLED, accepted.code());
    }
    return new Result(Outcome.SKIPPED, accepted.code());
  }

  /** Any accepted run of this test that has not reached DONE, manual or scheduled. */
  private boolean running(UUID uiTestId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM studio_dispatch_ledger WHERE test_id = ? AND state <>"
                + " 'DONE')",
            Boolean.class,
            uiTestId));
  }
}

package com.citi.put.checks.scheduling;

import java.time.Instant;
import java.util.UUID;

/**
 * Starts the run of a UI test whose shared schedule slot is due. The Studio code implements it; the
 * cron dispatcher never learns how a UI test is admitted or executed (ADR-004).
 *
 * <p>Called inside the dispatcher's transaction, which also advances the schedule's {@code
 * next_execution_at}, so an accepted run and its slot advance commit or roll back together.
 */
public interface ScheduledUiTestLauncher {

  enum Outcome {
    /** A run was accepted; the existing Studio dispatcher and runner execute it. */
    ACCEPTED,
    /** The Studio quota is full; the slot is put back, as for a throttled ordinary check. */
    THROTTLED,
    /** No run was created and the slot is spent: not ready, run in progress, disabled, refused. */
    SKIPPED
  }

  /** The outcome and a closed, data-free code for logs and metrics. */
  record Result(Outcome outcome, String code) {}

  Result launch(UUID uiTestId, UUID scheduleId, Instant scheduledAt);
}

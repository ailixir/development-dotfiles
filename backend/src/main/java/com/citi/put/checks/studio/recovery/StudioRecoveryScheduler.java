package com.citi.put.checks.studio.recovery;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs both reapers, and on the worker profile or an explicitly enabled local process (§5.4).
 *
 * <p>As with the dispatcher, the reapers themselves are ordinary beans so a test can drive a single
 * bounded pass deterministically; what is worker-only is the schedule. An API pod therefore holds
 * no reaper schedule at all.
 */
@Component
@Profile({"worker", "local"})
@ConditionalOnProperty(
    prefix = "studio.execution.dispatcher",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true)
public class StudioRecoveryScheduler {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioRecoveryScheduler.class);

  private final PendingReaper pendingReaper;
  private final RunningReaper runningReaper;

  public StudioRecoveryScheduler(PendingReaper pendingReaper, RunningReaper runningReaper) {
    this.pendingReaper = pendingReaper;
    this.runningReaper = runningReaper;
  }

  @Scheduled(fixedDelayString = "${studio.execution.recovery.poll-interval-ms:5000}")
  public void reap() {
    try {
      int changed = pendingReaper.reapOnce() + runningReaper.reapOnce();
      if (changed > 0) {
        LOGGER.debug("Studio recovery changed {} row(s)", changed);
      }
    } catch (RuntimeException e) {
      LOGGER.warn("Studio recovery pass failed", e);
    }
  }
}

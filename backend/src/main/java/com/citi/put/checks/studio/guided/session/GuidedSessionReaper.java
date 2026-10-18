package com.citi.put.checks.studio.guided.session;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Trusted expiry transition; deliberately has no HTTP or model-facing counterpart.
 *
 * <p>It runs on the scheduler role only, never on an API replica (STUDIO-OBS-009 AC-5, ruling A5):
 * the same gate as {@code SchedulingCoordinator}, so a pod either serves requests or runs the
 * timers, and the timers do not multiply with the API replica count. {@code local} and {@code test}
 * carry no role profile, so they keep the bean.
 */
@Component
@Profile("!api | worker")
public class GuidedSessionReaper {
  private final GuidedSessionService service;
  private final Duration teardownWindow;
  private final int teardownBatch;
  private final Duration abandonedWarnInterval;

  public GuidedSessionReaper(
      GuidedSessionService service,
      @Value("${studio.guided-authoring.teardown-redrive-window:PT15M}") Duration teardownWindow,
      @Value("${studio.guided-authoring.teardown-redrive-batch:32}") int teardownBatch,
      @Value("${studio.guided-authoring.teardown-abandoned-warn-interval:PT15M}")
          Duration abandonedWarnInterval) {
    if (teardownWindow.isNegative()
        || teardownWindow.isZero()
        || teardownBatch < 1
        || abandonedWarnInterval.isNegative()
        || abandonedWarnInterval.isZero()) {
      throw new IllegalArgumentException("Guided teardown re-drive needs a window and a batch");
    }
    this.service = service;
    this.teardownWindow = teardownWindow;
    this.teardownBatch = teardownBatch;
    this.abandonedWarnInterval = abandonedWarnInterval;
  }

  /** STUDIO-OBS-015 H8: the same tick re-drives unconfirmed teardowns after expiry. */
  @Scheduled(fixedDelayString = "${studio.guided-authoring.reaper-delay-ms:10000}")
  public void expire() {
    service.expire();
    service.redriveTeardowns(teardownWindow, teardownBatch);
    service.reportAbandonedTeardowns(teardownWindow, abandonedWarnInterval);
  }
}

package com.citi.put.checks.studio.guided.session;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Trusted expiry transition; deliberately has no HTTP or model-facing counterpart. */
@Component
public class GuidedSessionReaper {
  private final GuidedSessionService service;

  public GuidedSessionReaper(GuidedSessionService service) {
    this.service = service;
  }

  @Scheduled(fixedDelayString = "${studio.guided-authoring.reaper-delay-ms:10000}")
  public void expire() {
    service.expire();
  }
}

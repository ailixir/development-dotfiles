package com.citi.put.checks.studio.guided.session;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The deployment-wide cap on concurrent learning sessions (STUDIO-FLEX-001), whichever CSI started
 * them. It mirrors the capacity of the one guided runner pod ({@code
 * STUDIO_RUNNER_GUIDED_CAPACITY}); the runner's own {@code CAPACITY} refusal stays as a backstop.
 *
 * @param maxConcurrentSessions live (non-terminal, unexpired) learning sessions in the whole
 *     deployment, at least 1
 */
@ConfigurationProperties("studio.guided-authoring")
public record GuidedCapacityProperties(@DefaultValue("1") int maxConcurrentSessions) {
  public GuidedCapacityProperties {
    if (maxConcurrentSessions < 1) {
      throw new IllegalStateException(
          "studio.guided-authoring.max-concurrent-sessions must allow at least one session");
    }
  }
}

package com.citi.put.checks.studio.guided.retention;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Retention of guided observations and model output (STUDIO-OBS-014 AC-3, ruling AR-2 b).
 *
 * @param observationWindow how long after a terminal session's {@code expires_at} its sanitized
 *     observations, model output and never-published publication copies are kept. Equal to {@code
 *     studio.execution.evidence-retention} by default, so video and observations age out together.
 *     At least 24 hours: a shorter window refuses start-up. The database refuses under one hour as
 *     defence in depth.
 * @param prunerDelayMs delay between two pruner passes
 * @param batchSize the most sessions one pass selects
 */
@ConfigurationProperties("studio.guided-authoring.retention")
public record GuidedRetentionProperties(
    @DefaultValue("30d") Duration observationWindow,
    @DefaultValue("3600000") long prunerDelayMs,
    @DefaultValue("100") int batchSize) {

  /** The smallest window start-up accepts (AR-2 b "Properties validation"). */
  public static final Duration MINIMUM_WINDOW = Duration.ofHours(24);

  public GuidedRetentionProperties {
    if (observationWindow == null || observationWindow.compareTo(MINIMUM_WINDOW) < 0) {
      throw new IllegalArgumentException(
          "studio.guided-authoring.retention.observation-window must be at least PT24H");
    }
    if (prunerDelayMs < 1) {
      throw new IllegalArgumentException(
          "studio.guided-authoring.retention.pruner-delay-ms must be positive");
    }
    if (batchSize < 1 || batchSize > 10_000) {
      throw new IllegalArgumentException(
          "studio.guided-authoring.retention.batch-size must be between 1 and 10000");
    }
  }

  /** The window as a PostgreSQL interval literal in whole seconds. */
  String intervalLiteral() {
    return observationWindow.toSeconds() + " seconds";
  }
}

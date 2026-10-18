package com.citi.put.checks.studio.guided.evidence;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Guided recording settings (STUDIO-OBS-013, ruling AR-1 R3 "settleGrace").
 *
 * <p>{@code settle-grace} is how long after a session's own {@code expires_at} the owning worker
 * may still report its recording fact. The video is finalized only when the browser context closes,
 * which happens after the session is terminal, so the window must cover the runner's bounded
 * upload, manifest write and at most three callback attempts. The window is judged in SQL on the
 * database clock, never on this process's clock (R6).
 *
 * <p>Retention is not here: it is {@code studio.execution.evidence-retention}, declared once.
 *
 * @param settleGrace the post-expiry acceptance window; default {@code PT2M}
 */
@ConfigurationProperties(prefix = "studio.guided-authoring.recording")
public record GuidedRecordingProperties(Duration settleGrace) {

  /** The ruled default. */
  public static final Duration DEFAULT_SETTLE_GRACE = Duration.ofMinutes(2);

  public GuidedRecordingProperties {
    if (settleGrace == null) {
      settleGrace = DEFAULT_SETTLE_GRACE;
    }
    if (settleGrace.isNegative() || settleGrace.isZero()) {
      throw new IllegalArgumentException(
          "studio.guided-authoring.recording.settle-grace must be positive");
    }
  }

  /** The grace in seconds, for {@code make_interval(secs => ?)}. */
  public double settleGraceSeconds() {
    return settleGrace.toNanos() / 1_000_000_000d;
  }
}

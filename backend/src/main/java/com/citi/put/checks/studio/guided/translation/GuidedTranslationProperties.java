package com.citi.put.checks.studio.guided.translation;

import jakarta.validation.constraints.AssertTrue;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Guided translation (the model call that turns plain-English steps into proposed actions) and its
 * bounds. Which application a test may open is not configured here: it is the test's own URLs.
 *
 * <p>{@code sendTimeoutSeconds} caps one provider send. It only takes effect while it is shorter
 * than the call budget left after authentication ({@code callSeconds}); a call budget at or below
 * the cap makes every overrun a terminal TIMEOUT rather than a retried stall. Bound configuration
 * must keep {@code callSeconds} at least {@value #SETTLE_SECONDS} s above the cap, so the attempt
 * deadline covers the send plus its settlement; only a call budget clamped by the session's own
 * expiry can still end at or below the cap. Every other timing, including {@link
 * #continuationTimeout()}, follows from these two values and {@code transientBackoffMillis}.
 */
@Validated
@ConfigurationProperties("studio.guided-authoring.translation")
public record GuidedTranslationProperties(
    @DefaultValue("true") boolean enabled,
    @DefaultValue("98304") int maxInputBytes,
    @DefaultValue("4096") int maxOutputTokens,
    @DefaultValue("60") int callSeconds,
    @DefaultValue("worker-1") String workerId,
    @DefaultValue("2000") int transientBackoffMillis,
    @DefaultValue("20") int sendTimeoutSeconds) {
  @org.springframework.boot.context.properties.bind.ConstructorBinding
  public GuidedTranslationProperties {
    if (maxInputBytes < 1
        || maxInputBytes > 131072
        || maxOutputTokens < 1
        || maxOutputTokens > 32000
        || callSeconds < 1
        || callSeconds > 600
        || transientBackoffMillis < 0
        || transientBackoffMillis > 30000
        || sendTimeoutSeconds < 1
        || sendTimeoutSeconds > 600) {
      throw new IllegalArgumentException("Invalid guided translation bounds");
    }
  }

  /** Smallest gap between the call budget and the per-send cap (see the class comment). */
  static final int SETTLE_SECONDS = 10;

  /**
   * Checked when the properties are bound at startup, not in the constructor, so a test can still
   * build the short call budget a session expiry produces.
   */
  @AssertTrue(
      message =
          "studio.guided-authoring.translation.call-seconds must be at least"
              + " send-timeout-seconds + 10 so the attempt deadline covers the send cap and its"
              + " settlement")
  public boolean isCallBudgetCoveringSendCap() {
    return callSeconds >= sendTimeoutSeconds + SETTLE_SECONDS;
  }

  /**
   * The runner prepare (syntax admission) that follows each STEP_CODE reply: one transport window.
   */
  static final Duration PREPARE_WINDOW = Duration.ofSeconds(15);

  /**
   * The longest one continuation POST can run on the server: the step's one pool of three STEP_CODE
   * requests, each bounded by the call budget plus the settlement margin, the runner prepare that
   * follows it, and the transient backoff ({@code base << 0} then {@code base << 1}) between
   * attempts; the rest of it is runner and database work, covered by a fixed margin. The
   * coordinator waits this long, so it never gives up on a request that is still running and
   * re-drives the session over it.
   *
   * @return the coordinator's per-POST timeout
   */
  public Duration continuationTimeout() {
    Duration attempt =
        Duration.ofSeconds(callSeconds)
            .plus(GuidedTranslationService.SETTLE_MARGIN)
            .plus(PREPARE_WINDOW);
    return attempt
        .multipliedBy(3)
        .plusMillis(3L * transientBackoffMillis)
        .plus(Duration.ofSeconds(30));
  }

  public GuidedTranslationProperties(
      boolean enabled,
      int maxInputBytes,
      int maxOutputTokens,
      int callSeconds,
      String workerId,
      int transientBackoffMillis) {
    this(
        enabled, maxInputBytes, maxOutputTokens, callSeconds, workerId, transientBackoffMillis, 20);
  }

  public GuidedTranslationProperties(
      boolean enabled, int maxInputBytes, int maxOutputTokens, int callSeconds, String workerId) {
    this(enabled, maxInputBytes, maxOutputTokens, callSeconds, workerId, 2000);
  }
}

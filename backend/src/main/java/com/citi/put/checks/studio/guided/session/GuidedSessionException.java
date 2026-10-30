package com.citi.put.checks.studio.guided.session;

import java.util.Map;
import java.util.UUID;

/** Data-free failures: never expose page content, credentials or foreign scope. */
public final class GuidedSessionException extends RuntimeException {
  private final int status;
  private final String messageCode;
  private final boolean retryable;
  private final Integer retryAfterSeconds;

  public GuidedSessionException(String code, int status) {
    this(code, status, code, false, null);
  }

  /**
   * A refusal with a closed {@code messageCode} other than the code, and optionally retryable with
   * a {@code Retry-After} in whole seconds (STUDIO-OBS-014: POLICY_DENIED reasons, per-CSI
   * BUDGET_EXCEEDED). Every value is a closed code or an integer; none is caller or page data.
   */
  public GuidedSessionException(
      String code, int status, String messageCode, boolean retryable, Integer retryAfterSeconds) {
    super(code);
    if (retryAfterSeconds != null && (!retryable || retryAfterSeconds < 1)) {
      throw new IllegalArgumentException("Retry-After needs a retryable refusal and >= 1 second");
    }
    this.status = status;
    this.messageCode = messageCode;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  public int status() {
    return status;
  }

  public String messageCode() {
    return messageCode;
  }

  public boolean retryable() {
    return retryable;
  }

  /** Whole seconds for a {@code Retry-After} header, or null when the refusal carries none. */
  public Integer retryAfterSeconds() {
    return retryAfterSeconds;
  }

  public Map<String, Object> response() {
    return Map.of(
        "schemaVersion",
        3,
        "code",
        getMessage(),
        "messageCode",
        messageCode,
        "requestId",
        UUID.randomUUID().toString(),
        "retryable",
        retryable);
  }

  public static void require(boolean condition, String code, int status) {
    if (!condition) {
      throw new GuidedSessionException(code, status);
    }
  }
}

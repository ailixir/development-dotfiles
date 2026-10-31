package com.citi.put.checks.studio.guided.session;

import java.util.Map;
import java.util.UUID;

/** Data-free failures: never expose page content, credentials or foreign scope. */
public final class GuidedSessionException extends RuntimeException {
  private final int status;
  private final String messageCode;
  private final boolean retryable;
  private final Integer retryAfterSeconds;
  private final Integer line;
  private final Integer column;
  private final Integer matchCount;

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
    this(code, status, messageCode, retryable, retryAfterSeconds, null, null, null);
  }

  /**
   * A learning-time step refusal that names the position in the model's own code (STEP_SYNTAX,
   * STEP_PRE_FENCE). Line and column are integers, never page or caller data; either may be null.
   */
  public GuidedSessionException(
      String code, int status, String messageCode, Integer line, Integer column) {
    this(code, status, messageCode, false, null, line, column, null);
  }

  /** As above, plus the number of elements a pre-fence locator matched (STEP_PRE_FENCE). */
  public GuidedSessionException(
      String code,
      int status,
      String messageCode,
      Integer line,
      Integer column,
      Integer matchCount) {
    this(code, status, messageCode, false, null, line, column, matchCount);
  }

  private GuidedSessionException(
      String code,
      int status,
      String messageCode,
      boolean retryable,
      Integer retryAfterSeconds,
      Integer line,
      Integer column,
      Integer matchCount) {
    super(code);
    if (retryAfterSeconds != null && (!retryable || retryAfterSeconds < 1)) {
      throw new IllegalArgumentException("Retry-After needs a retryable refusal and >= 1 second");
    }
    this.status = status;
    this.messageCode = messageCode;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.line = line;
    this.column = column;
    this.matchCount = matchCount;
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

  /** The line in the model's code a step refusal names, or null. */
  public Integer line() {
    return line;
  }

  /** The column in the model's code a step refusal names, or null. */
  public Integer column() {
    return column;
  }

  /** The number of matches a STEP_PRE_FENCE refusal names, or null. */
  public Integer matchCount() {
    return matchCount;
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

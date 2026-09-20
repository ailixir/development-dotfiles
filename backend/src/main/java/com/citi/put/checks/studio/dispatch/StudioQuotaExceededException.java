package com.citi.put.checks.studio.dispatch;

/**
 * A pending quota is full (AC-9, §5.1.1, §5.4). Reported as {@code 429} with a code.
 *
 * <p>The per-CSI and global bounds are separate: a full CSI does not block a different one, and one
 * accepted row consumes one unit of each rather than the same unit twice.
 */
public class StudioQuotaExceededException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String code;

  public StudioQuotaExceededException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String getCode() {
    return code;
  }
}

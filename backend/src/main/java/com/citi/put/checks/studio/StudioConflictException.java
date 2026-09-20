package com.citi.put.checks.studio;

/**
 * Signals a Studio state conflict that must be reported to the client as HTTP 409 with a stable
 * machine-readable code (Architecture §4.2, §4.6, §9.1).
 *
 * <p>Codes used by story 10.4: {@code STALE_REVISION}, {@code CSI_IMMUTABLE}, {@code
 * STALE_CANDIDATE}, {@code TEST_DELETED}, {@code TEST_QUARANTINED}.
 */
public class StudioConflictException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String code;

  public StudioConflictException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String getCode() {
    return code;
  }
}

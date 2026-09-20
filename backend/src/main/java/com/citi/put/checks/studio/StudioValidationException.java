package com.citi.put.checks.studio;

/**
 * Signals a rejected Studio payload that must be reported as HTTP 400 with a stable
 * machine-readable code (Architecture §8.3).
 *
 * <p>Codes used by story 10.1: {@code INVALID_CONFIGURATION} (an engine other than the canonical
 * {@code chromium}), {@code INVALID_STEPS}, {@code INVALID_VARIABLES}.
 */
public class StudioValidationException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String code;

  public StudioValidationException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String getCode() {
    return code;
  }
}

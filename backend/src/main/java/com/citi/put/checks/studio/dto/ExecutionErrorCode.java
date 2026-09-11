package com.citi.put.checks.studio.dto;

/**
 * Terminal error codes carried next to {@code status = ERROR} (Architecture §5.4, §8.2).
 *
 * <p>A parent-enforced total timeout is {@code ERROR / TIMEOUT}. A step locator or assertion
 * timeout is not: that is a step {@code FAIL} and an execution {@code FAILED}.
 */
public final class ExecutionErrorCode {

  public static final String TIMEOUT = "TIMEOUT";
  public static final String DISPATCH_FAILED = "DISPATCH_FAILED";
  public static final String DISPATCH_UNKNOWN = "DISPATCH_UNKNOWN";
  public static final String START_TIMEOUT = "START_TIMEOUT";
  public static final String STALE = "STALE";
  public static final String DISPATCH_DISABLED = "DISPATCH_DISABLED";

  private ExecutionErrorCode() {}
}

package com.citi.put.checks.studio.dto;

import java.util.Set;

/**
 * Canonical execution status vocabulary (Architecture §8.2).
 *
 * <p>{@code PENDING} is accepted but not yet browser-started; {@code RUNNING} means an
 * authenticated runner start report was committed. A timeout is {@code ERROR} with {@code errorCode
 * = TIMEOUT}, never a status of its own.
 */
public final class ExecutionStatus {

  public static final String PENDING = "PENDING";
  public static final String RUNNING = "RUNNING";
  public static final String PASSED = "PASSED";
  public static final String FAILED = "FAILED";
  public static final String ERROR = "ERROR";

  /** Legacy statuses that predate the canonical vocabulary. */
  public static final String LEGACY_COMPLETED = "COMPLETED";

  public static final String LEGACY_TIMEOUT = "TIMEOUT";

  private static final Set<String> CANONICAL = Set.of(PENDING, RUNNING, PASSED, FAILED, ERROR);

  private static final Set<String> TERMINAL = Set.of(PASSED, FAILED, ERROR);

  private ExecutionStatus() {}

  public static boolean isCanonical(String status) {
    return status != null && CANONICAL.contains(status);
  }

  public static boolean isTerminal(String status) {
    return status != null && TERMINAL.contains(status);
  }

  public static Set<String> canonicalValues() {
    return CANONICAL;
  }
}

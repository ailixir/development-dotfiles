package com.citi.put.checks.studio.dispatch;

/**
 * The kill switch refused a new execution (AC-11, §8.5). Reported as {@code 503 DISPATCH_DISABLED}.
 *
 * <p>Reads, callbacks, recovery and already-admitted work are unaffected: this exception is thrown
 * by acceptance and by nothing else.
 */
public class StudioDispatchDisabledException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public StudioDispatchDisabledException(String message) {
    super(message);
  }
}

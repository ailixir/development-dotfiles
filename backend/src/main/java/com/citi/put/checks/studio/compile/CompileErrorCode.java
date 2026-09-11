package com.citi.put.checks.studio.compile;

/**
 * Compile failures the pipeline itself produces, as opposed to the gateway ones 10.5 already names
 * on {@code GatewayErrorCode} (Story 10.8, AC-9, AC-12a, AC-17, AC-18).
 *
 * <p>Every value here is a bound firing, and every one of them is retryable: the draft stays saved
 * and unchanged, the compile state falls back to {@code STALE}, and the author retries. That is
 * what lets the frozen {@code 202} survive a bounded pipeline — acceptance and execution are
 * separate events, so a refusal downstream of acceptance surfaces asynchronously rather than as a
 * response code the contract does not declare.
 */
public enum CompileErrorCode {
  /** The bounded compile pool was saturated; the attempt was refused rather than queued (AC-17). */
  COMPILE_POOL_SATURATED,
  /** The per-attempt wall-clock budget elapsed; the attempt was abandoned (AC-18). */
  COMPILE_BUDGET_EXCEEDED,
  /**
   * {@code POST /v1/validate} timed out, lost transport or answered 5xx; never retried (AC-12a).
   */
  VALIDATOR_UNAVAILABLE,
  /** An unexpected failure inside the pipeline. Recorded rather than swallowed. */
  COMPILE_INTERNAL_ERROR
}

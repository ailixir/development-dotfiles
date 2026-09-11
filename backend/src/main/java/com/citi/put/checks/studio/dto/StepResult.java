package com.citi.put.checks.studio.dto;

/**
 * One result entry per original step (Architecture §8.2).
 *
 * <p>Per-step states are {@code PENDING | RUNNING | PASS | FAIL | SKIPPED}. Skipped and unstarted
 * steps carry {@code null} timings — there is no synthetic index-times-ten mapping (§6.4).
 *
 * @param offsetMs start offset on the recording timeline, or null if the step was never attempted
 */
public record StepResult(
    Integer stepIndex,
    String originalText,
    String status,
    Long offsetMs,
    Long durationMs,
    String message) {

  public static final String PENDING = "PENDING";
  public static final String RUNNING = "RUNNING";
  public static final String PASS = "PASS";
  public static final String FAIL = "FAIL";
  public static final String SKIPPED = "SKIPPED";

  /** A step that has not been attempted: no timings, no message. */
  public static StepResult pending(int stepIndex, String originalText) {
    return new StepResult(stepIndex, originalText, PENDING, null, null, null);
  }
}

package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * One runner log line, positioned on the run timeline rather than on the wall clock.
 *
 * <p>{@code atMs} is a reading of the same run clock as {@code RunnerStepState.startedAtMs}. A
 * consumer wanting an instant computes {@code browserStartedAt + atMs} and nothing else.
 *
 * <p><b>{@code 0} is a position — the browser start — and never a missing value.</b> {@code null}
 * is the absence of a reading. A projection that treats {@code 0} as absent loses the one line that
 * anchors the timeline.
 *
 * @param level the runner's lower-case vocabulary ({@code info|warn|error}); the API upper-cases it
 * @param stepIndex the 0-based position of the step the line is <b>about</b>, in the same index
 *     space as {@code RunnerStepState.stepIndex}; {@code null} on run-level lines and whenever the
 *     runner omits the field (a runner that predates it). Optional, not required (ADR-002 §33,
 *     O-17). A non-null value outside the confirmed revision's steps is {@code INVALID_REPORT}.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunnerLogEntry(Double atMs, String level, String message, Integer stepIndex) {

  /**
   * A run-level line, or a line from a runner that does not send {@code stepIndex}. Keeps the
   * pre-§33 call sites compiling unchanged.
   */
  public RunnerLogEntry(Double atMs, String level, String message) {
    this(atMs, level, message, null);
  }
}

package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * One step the runner has touched, closed to unknown fields.
 *
 * <p>The readings are on the <b>run clock</b>, whose zero is the recording origin (ADR-002 §INT-5).
 * The calibration §6.4 asks for is already applied when the reading is taken, by the only component
 * that observes the recorder. The API therefore adds no origin and applies no calibration; it
 * rounds once, at persistence.
 *
 * <p>They are fractional on the wire on purpose: rounding in both components would compound two
 * errors over one measurement.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunnerStepState(
    Integer stepIndex,
    String status,
    Double startedAtMs,
    Double finishedAtMs,
    Double durationMs,
    String failure,
    com.fasterxml.jackson.databind.JsonNode receipt) {

  /** A step state from a runner that sends no receipt. */
  public RunnerStepState(
      Integer stepIndex,
      String status,
      Double startedAtMs,
      Double finishedAtMs,
      Double durationMs,
      String failure) {
    this(stepIndex, status, startedAtMs, finishedAtMs, durationMs, failure, null);
  }
}

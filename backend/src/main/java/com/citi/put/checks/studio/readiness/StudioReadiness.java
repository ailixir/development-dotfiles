package com.citi.put.checks.studio.readiness;

/**
 * The readiness vocabulary of a Studio test (ADR-SC-005, defaults "Readiness vocabulary").
 *
 * <p>Derived on every read; no column stores it.
 */
public enum StudioReadiness {
  /** No published learned revision matches the current steps and configuration. */
  UNLEARNED,
  /** A guided learning session for this test is in progress. */
  LEARNING,
  /** The confirmed observed revision matches the draft and replays model-free. */
  READY,
  /**
   * A revision was learned and recorded and matches the draft, but its model-free proof has not
   * passed: not confirmed, not scheduled. A manual Run of it is a labelled diagnostic.
   */
  RECORDED,
  /**
   * A published revision exists and a step changed; carries the first changed step. Reserved for
   * STUDIO-OBS-015, which owns the detection: this server never emits it yet.
   */
  NEEDS_RELEARN
}

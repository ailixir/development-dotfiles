/**
 * Per-step progress reporting (AC-14). Story 10.6 supplies the implementation that forwards
 * these events to the API callback; the executor only needs the shape.
 */

/**
 * Architecture §8.2 fixes the per-step vocabulary as `PENDING | RUNNING | PASS | FAIL | SKIPPED`;
 * the executor produces the three terminal values and the snapshot adds `RUNNING`.
 *
 * It is deliberately **not** `PASSED`/`FAILED`: `RunOutcome.result` uses those words for the run
 * as a whole, and a report carrying `FAILED` in two fields meaning two different things is the
 * misread ADR-002 §6.1 closes.
 */
export type StepStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface StepStartedEvent {
  readonly stepIndex: number;
  /** Monotonic milliseconds from the injected clock, never wall-clock time. */
  readonly startedAtMs: number;
}

export interface StepFinishedEvent {
  readonly stepIndex: number;
  readonly status: StepStatus;
  /** `null` for skipped steps, which never started. */
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly durationMs: number | null;
  /** Redacted failure message; `null` unless the status is FAIL. */
  readonly failure: string | null;
}

export interface StepReporter {
  stepStarted(event: StepStartedEvent): void;
  stepFinished(event: StepFinishedEvent): void;
}

/** Monotonic clock seam so tests can assert ordering without sleeping. */
export interface Clock {
  now(): number;
}

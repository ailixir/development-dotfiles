/**
 * Per-step progress reporting (AC-14). Story 10.6 supplies the implementation that forwards
 * these events to the API callback; the executor only needs the shape.
 */

export type StepStatus = 'PASSED' | 'FAILED' | 'SKIPPED';

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
  /** Redacted failure message; `null` unless the status is FAILED. */
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

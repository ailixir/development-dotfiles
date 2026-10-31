/**
 * Per-step progress reporting: the seam the observed replay executor and the parent launcher
 * report through, and that `src/reporting/reportingStepReporter.ts` forwards to the API callback.
 *
 * Ported from `executor/adapters/StepReporter.ts` when the artifact-1 executor and its adapters
 * were deleted (STUDIO-OBS-012A AC-3); the shapes are unchanged.
 */

import type { StepReceipt } from './observedOperations.js';

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
  readonly detail?: {readonly stepId: string; readonly loginStepsPresent: boolean};
  readonly stepIndex: number;
  readonly status: StepStatus;
  /** `null` for skipped steps, which never started. */
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly durationMs: number | null;
  /** Redacted failure message; `null` unless the status is FAIL. */
  readonly failure: string | null;
  /** The step receipt (ADR-SC-008 D5): closed code, stepHash, fence, effects (names only), offscreen. Absent only for steps a pre-ready failure never ran. */
  readonly receipt?: StepReceipt;
}

export interface StepReporter {
  stepStarted(event: StepStartedEvent): void;
  stepFinished(event: StepFinishedEvent): void;
}

/** Monotonic clock seam so tests can assert ordering without sleeping. */
export interface Clock {
  now(): number;
}

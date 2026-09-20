/**
 * One real run, end to end, for the fixtures tier (AC-18a).
 *
 * Real pinned Chromium, in a real child process, driven by the real `BrowserLauncher` through the
 * real `BrowserAdapter`, writing a real webm into a real per-run scratch directory. The only
 * things faked are the API callbacks, which belong to story 10.7.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StepFinishedEvent, StepStartedEvent } from '../../src/executor/adapters/StepReporter.js';
import type { ExecutableStep } from '../../src/executor/executor.js';
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import type { SessionRunResult } from '../../src/server/adapters.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';

export interface RealRunOptions {
  readonly steps: readonly ExecutableStep[];
  readonly variables?: Readonly<Record<string, string>> | undefined;
  readonly secrets?: Readonly<Record<string, string>> | undefined;
  readonly recording?: { readonly width: number; readonly height: number } | undefined;
  readonly stepTimeoutMs?: number | undefined;
  /** Runs while the browser is up, before the steps. Used to make a popup appear (AC-15). */
  readonly beforeExecute?: (() => Promise<void>) | undefined;
}

export interface RealRunOutcome {
  readonly started: readonly StepStartedEvent[];
  readonly finished: readonly StepFinishedEvent[];
  readonly result: SessionRunResult;
  readonly browserStartedAt: Date;
  readonly startedAtMs: number;
  /**
   * The seek-origin calibration the child reported applying (story 10.32 AC-4). `undefined` only
   * if the child did not report one, which the pinned test treats as a failure.
   */
  readonly calibrationOffsetMs: number | undefined;
  /** The instant the launch call was made, for AC-20's measurable-gap assertion. */
  readonly dispatchedAtMs: number;
  /** The instant `launch` resolved, on the same monotonic clock as `dispatchedAtMs`. */
  readonly observedStartMs: number;
  readonly scratchPath: string;
  /** Kept alive so a test can inspect the recording before it is cleared (AC-7, AC-22). */
  clear(): void;
}

/**
 * Waits for a condition, on the **wall clock**.
 *
 * `test/helpers/harness.ts`'s `until` spends a budget of microtask ticks, which is right for the
 * unit tier where nothing sleeps. A real browser takes real time, so this tier needs a real bound.
 */
export async function untilMs(predicate: () => boolean, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${String(timeoutMs)}ms.`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

/** A per-run scratch directory on the real filesystem, cleared by the caller (AC-22). */
export function createScratch(): string {
  return mkdtempSync(join(tmpdir(), 'studio-runner-fixtures-'));
}

export async function runReal(options: RealRunOptions): Promise<RealRunOutcome> {
  const scratchPath = createScratch();
  const launcher = createChildBrowserLauncher({
    recording: options.recording ?? { width: 1280, height: 720 },
    // ADR-002 §26.3 item 5: the fixtures tier always runs with the calibration at 0. Not an option
    // a test can override (story 10.32 Scope). `seek-calibration-pinned.test.ts` asserts the value
    // the child reports applying, so a change here is red on a real run.
    seekOriginCalibrationMs: 0,
    stepTimeoutMs: options.stepTimeoutMs ?? 15_000,
    launchTimeoutMs: 45_000,
    maxFailureMessageLength: 400,
    childModulePath: CHILD_MODULE_PATH,
    stopTimeoutMs: 5_000,
  });

  const started: StepStartedEvent[] = [];
  const finished: StepFinishedEvent[] = [];

  const dispatchedAtMs = performance.now();
  const session = await launcher.launch({
    browser: 'chromium',
    viewport: { width: 1280, height: 720 },
    totalRuntimeMs: 120_000,
    scratchPath,
  });
  const observedStartMs = performance.now();

  const run = session.run;
  if (run === undefined) throw new Error('the real launcher must return a child-owned session');

  await options.beforeExecute?.();

  const result = await run.execute({
    steps: options.steps,
    variables: options.variables ?? {},
    secrets: options.secrets ?? {},
    reporter: {
      stepStarted: (event) => started.push(event),
      stepFinished: (event) => finished.push(event),
    },
  });
  await session.close();

  return {
    started,
    finished,
    result,
    browserStartedAt: run.origin.browserStartedAt,
    startedAtMs: run.origin.startedAtMs,
    calibrationOffsetMs: run.origin.calibrationOffsetMs,
    dispatchedAtMs,
    observedStartMs,
    scratchPath,
    clear(): void {
      rmSync(scratchPath, { recursive: true, force: true });
    },
  };
}

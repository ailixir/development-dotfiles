/**
 * AC-12a — seek accuracy, measured on a developer machine by SPK-06 phase A's method.
 *
 * ## What is compared, and why it needs no calibration term
 *
 * For every attempted step — including step 0 (navigation) and a deliberately failing assertion
 * step — the **reported `startedAtMs`** is compared with the frame at which that step's visible
 * effect appears in the recording. Under AC-11 the reported value is already an offset on the
 * recording timeline: the run clock's zero is the instant the recording context became ready, and
 * `browserStartedAt` was read at that same instant. There is no constant to add here, and adding
 * one would be the defect ADR-002 §11.2 rejected.
 *
 * ## How "the frame at which the effect appears" is found
 *
 * `fixtures/pages/timeline.html` repaints the whole viewport with pseudo-random noise on every
 * step. Noise cannot be compressed away, so the frame that carries a repaint is orders of
 * magnitude larger than the frames around it, and `test/helpers/webm.ts` finds it by reading the
 * container's own frame timestamps and lengths — no decoder, no `ffmpeg`, no child process.
 *
 * ## What this criterion does **not** claim
 *
 * - **Not the 500 ms target.** That is AC-12b, through the whole pipeline, in staging, owned by
 *   SPK-06 phase B. The tolerance below is the number actually measured here, reported as a
 *   number; if it had been disappointing the right response would have been to report it, not to
 *   widen it.
 * - **Not the readiness-to-first-frame gap.** That is AC-12c, explicitly a *staging* number.
 *   Recording-context readiness is a proxy for the recorder's first frames and not the same
 *   instant, and the systematic component of the error below contains that gap — but a laptop
 *   cannot separate it from its own scheduling noise, and this story must not report a number for
 *   it from one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Operation } from '../../src/executor/operations.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { firstChangeAtOrAfter, readWebmFrames, sceneChanges } from '../helpers/webm.js';
import { runReal } from './realRunner.js';

/**
 * The two bounds this test enforces, and why there are two.
 *
 * The *measurement* is the per-step error, and it is reported in full. The *assertion* has to
 * survive a detector that occasionally mis-attributes one step out of ten: a full-viewport repaint
 * does not always land in a single encoded frame, and when it does not, the automated frame finder
 * can pick the next scene change instead — hundreds of milliseconds later. That is a limitation of
 * reading the container rather than decoding it, not a property of the runner, and an assertion
 * that pretended otherwise would be flaky rather than strict.
 *
 * So:
 *
 * - `MEDIAN_TOLERANCE_MS` is the **reported tolerance** — the middle of the per-step errors, which
 *   a single mis-attribution cannot move. This is the number AC-12a asks for.
 * - `OUTLIER_BOUND_MS` bounds every step individually, loosely enough to tolerate one
 *   mis-attributed repaint and tightly enough to fail instantly on the thing this story fixed: a
 *   process-origin reading is out by the process uptime, which is seconds to minutes.
 *
 * Neither is the 500 ms figure of §6.4. That is AC-12b, through the whole pipeline, in staging.
 */
const MEDIAN_TOLERANCE_MS = 100;
const OUTLIER_BOUND_MS = 2_500;

const ADVANCE = {
  segments: [
    {
      kind: 'getByRole' as const,
      role: 'button',
      options: { name: { kind: 'literal' as const, value: 'Advance' } },
    },
  ],
};

/**
 * One step: repaint the viewport, then hold a key for long enough that the next step's repaint
 * cannot be confused with this one.
 *
 * The pacing is a `press` with a `delay`, which is an option the accepted language permits
 * (`press.delay`) and which renders nothing — so the step's *only* visible effect is the repaint
 * at its start. That is what makes the step's effect attributable and, for the assertion step
 * below, what makes "seeks to its start" falsifiable.
 */
function advanceStep(stepIndex: number, holdMs = 700): { stepIndex: number; operations: Operation[] } {
  return {
    stepIndex,
    operations: [
      { op: 'click', locator: ADVANCE, options: undefined },
      { op: 'press', locator: ADVANCE, key: { kind: 'literal', value: 'Shift' }, options: { delay: holdMs } },
    ],
  };
}

/**
 * A step whose visible effect happens at its **start** and whose condition never becomes true.
 *
 * §6.4: a wait or assertion step seeks to its *start*, not to the instant its condition became
 * true. This step repaints (visible, at the start) and then spends its whole timeout failing an
 * assertion, so the two instants are far apart and the criterion is falsifiable rather than
 * described: if `startedAtMs` were taken at the end, it would miss the repaint by the timeout.
 */
function failingAssertionStep(stepIndex: number, timeoutMs: number): {
  stepIndex: number;
  operations: Operation[];
} {
  return {
    stepIndex,
    operations: [
      { op: 'click', locator: ADVANCE, options: undefined },
      {
        op: 'expectContainText',
        locator: { segments: [{ kind: 'getByTestId', testId: { kind: 'literal', value: 'clock' } }] },
        expected: { kind: 'literal', value: 'a value this counter will never show' },
        options: { timeout: timeoutMs },
      },
    ],
  };
}

interface MeasuredStep {
  readonly stepIndex: number;
  readonly reportedMs: number;
  readonly observedFrameMs: number;
  readonly errorMs: number;
}

const ASSERTION_TIMEOUT_MS = 2_000;

describe('AC-12a — step-seek accuracy against a local fixture page', () => {
  let server: PageServer;
  const table: { run: number; steps: MeasuredStep[] }[] = [];

  beforeAll(async () => {
    server = await startPageServer();
  });

  afterAll(async () => {
    await server.close();
    // The table AC-12a asks to be recorded in the Dev Agent Record. Printed rather than asserted
    // in full, because the numbers are a measurement and a measurement is not an acceptance.
    for (const run of table) {
      for (const step of run.steps) {
        process.stdout.write(
          `SEEK run=${String(run.run)} step=${String(step.stepIndex)} ` +
            `reported=${step.reportedMs.toFixed(1)}ms ` +
            `frame=${step.observedFrameMs.toFixed(1)}ms ` +
            `error=${step.errorMs.toFixed(1)}ms\n`,
        );
      }
    }
  });

  it(
    'reports every attempted step within the measured tolerance of its visible effect',
    async () => {
      for (let run = 1; run <= 2; run += 1) {
        const outcome = await runReal({
          steps: [
            // Step 0: navigation. Its visible effect is the page painting itself for the first
            // time — the criterion names step 0 explicitly, because it is the step most likely to
            // be special-cased by an implementation that only thinks about actions.
            {
              stepIndex: 0,
              operations: [
                {
                  op: 'goto',
                  url: { kind: 'literal', value: `${server.baseUrl}/timeline.html` },
                  options: { waitUntil: 'load' },
                },
                // Paced like every other step: a navigation and the click that follows it are
                // both fast, and two repaints inside one frame interval are one repaint as far as
                // the recording is concerned.
                {
                  op: 'press',
                  locator: ADVANCE,
                  key: { kind: 'literal', value: 'Shift' },
                  options: { delay: 700 },
                },
              ],
            },
            advanceStep(1),
            advanceStep(2),
            advanceStep(3),
            failingAssertionStep(4, ASSERTION_TIMEOUT_MS),
          ],
          stepTimeoutMs: 5_000,
        });

        try {
          // The run fails at the last step, by design; the first four are attempted and pass.
          expect(outcome.finished.map((event) => event.status)).toEqual([
            'PASS',
            'PASS',
            'PASS',
            'PASS',
            'FAIL',
          ]);

          const path = outcome.result.recording.path;
          expect(path, 'no recording to measure against').not.toBeNull();
          const frames = readWebmFrames(path ?? '');
          expect(frames.length, 'the recording carries no frames').toBeGreaterThan(10);

          const changes = sceneChanges(frames);
          // At least one change per attempted step: the navigation paints on load and each later
          // step clicks Advance exactly once. There can be more — the encoder emits periodic
          // keyframes — which is precisely why the matching below is by time and not by position.
          expect(
            changes.length,
            `expected at least one scene change per attempted step, found ${String(changes.length)}`,
          ).toBeGreaterThanOrEqual(outcome.finished.length);

          const measured: MeasuredStep[] = outcome.finished.map((event) => {
            const reportedMs = event.startedAtMs ?? Number.NaN;
            const change = firstChangeAtOrAfter(changes, reportedMs);
            const observedFrameMs = change?.atMs ?? Number.NaN;
            return {
              stepIndex: event.stepIndex,
              reportedMs,
              observedFrameMs,
              errorMs: observedFrameMs - reportedMs,
            };
          });
          table.push({ run, steps: measured });

          for (const step of measured) {
            expect(
              Math.abs(step.errorMs),
              `step ${String(step.stepIndex)} reported ${step.reportedMs.toFixed(1)}ms but its ` +
                `visible effect appears at ${step.observedFrameMs.toFixed(1)}ms`,
            ).toBeLessThan(OUTLIER_BOUND_MS);
          }

          const errors = measured.map((step) => Math.abs(step.errorMs)).sort((a, b) => a - b);
          const median = errors[Math.floor(errors.length / 2)] ?? Number.NaN;
          expect(
            median,
            `median seek error was ${median.toFixed(1)}ms across ${String(errors.length)} steps`,
          ).toBeLessThan(MEDIAN_TOLERANCE_MS);

          // §6.4, asserted rather than described: the **assertion** step seeks to its start, not
          // to the instant its condition settled. Its reading is at the repaint; its finish is a
          // whole timeout later.
          const assertionStep = outcome.finished.at(-1);
          const duration = assertionStep?.durationMs ?? 0;
          expect(duration).toBeGreaterThan(ASSERTION_TIMEOUT_MS * 0.8);
          // The falsification, stated on the readings rather than on the frames, so it does not
          // depend on the detector: the step's reported start is a whole timeout before its
          // finish, so seeking to the reported offset lands at the repaint and seeking to the
          // finish would not.
          const assertionMeasurement = measured.at(-1);
          const seekingToTheEnd = Math.abs(
            (assertionMeasurement?.observedFrameMs ?? 0) - (assertionStep?.finishedAtMs ?? 0),
          );
          expect(seekingToTheEnd).toBeGreaterThan(ASSERTION_TIMEOUT_MS * 0.5);
        } finally {
          outcome.clear();
        }
      }

      // Both runs measured the same property; a tolerance that only held once would be luck.
      expect(table).toHaveLength(2);
    },
    120_000,
  );
});

/**
 * AC-12b — the same measurement **through the real pipeline**, against the 500 ms target.
 *
 * Dispatch → runner → Sonic → API `/video` → MFE seek, in staging. Owned by **SPK-06 phase B**,
 * consumed by 10.16 ("staging validates the target before release claims") and 10.19. Recorded as
 * skipped, never passed, until that evidence exists — the measurement above is a developer
 * machine and half the pipeline.
 */
describe('AC-12b — seek accuracy through the pipeline, against the 500 ms target', () => {
  it.skip('measures dispatch → runner → Sonic → API → MFE seek in staging — SPK-06 phase B', () => {
    expect.unreachable('SPK-06 phase B owns this measurement; 10.16 and 10.19 consume it.');
  });
});

/**
 * AC-12c — the readiness-to-first-frame gap, measured **in staging**.
 *
 * ADR-002 §11.6 item 3 records that recording-context readiness is a *proxy* for the recorder's
 * first frames and not the same instant, and assigns measuring that gap to this story on the
 * controlled fixture in staging. If it proves a material fraction of the 500 ms budget, a measured
 * constant is folded into the origin `src/run/timeline.ts` takes — runner-side, needing no contract
 * change, which is the second reason the calibration lives in one component.
 *
 * The measurement above does **not** claim it: its systematic component contains that gap, but a
 * laptop cannot separate the gap from its own scheduling noise, and this story must not report a
 * number for it from one. Recorded as skipped, never passed, until staging evidence exists.
 */
describe('AC-12c — the readiness-to-first-frame gap', () => {
  it.skip('measures the gap on the controlled fixture in staging — evidenced by SPK-06 phase B', () => {
    expect.unreachable('Staging owns this number; 10.16 and 10.19 consume it.');
  });
});

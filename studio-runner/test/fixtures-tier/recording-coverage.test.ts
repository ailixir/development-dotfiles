/**
 * Recording coverage — the video covers the whole run, including the last step's result.
 *
 * Two defects went unnoticed because nothing compared a recording's *span* with the run it
 * recorded: every existing fixture asserted bytes and a webm header, never duration.
 *
 * 1. The dispatcher sent the per-step timeout as the whole-run budget, so every run was killed at
 *    thirty seconds by an orderly stop and the recording was a clean `partial: false` file that
 *    ended mid-test. (Fixed on the API side; `DispatcherIT` pins it. This tier launches with a
 *    real 120 s budget and asserts the recorder is never the thing that stops early.)
 * 2. The child closed the recording context the instant the last operation resolved. A click that
 *    only *committed* a navigation had not painted; the recorder pads the tail with the last frame
 *    it received, so the final action's result was absent. The tail settle in
 *    `src/run/childRuntime.ts` is the fix, and it is what the last two assertions here measure.
 *
 * The measurement reads the container's own frame timestamps (`test/helpers/webm.ts`): no
 * decoder, no `ffmpeg`, no child process.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Operation } from '../../src/executor/operations.js';
import { TAIL_SETTLE_HOLD_MS } from '../../src/run/childRuntime.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { firstChangeAtOrAfter, readWebmFrames, sceneChanges } from '../helpers/webm.js';
import { runReal } from './realRunner.js';

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
 * Slack for comparing a run-clock reading with a recording timestamp.
 *
 * The two clocks share a zero only approximately: the recorder's first frame trails
 * recording-context readiness by the gap AC-12c leaves to staging (measured here at up to ~85 ms,
 * `seek-measurement.test.ts`), and frames are quantised to 40 ms. 150 ms covers both with room;
 * it is far below the 300 ms hold the settle adds, so the tail assertion cannot pass on slack.
 */
const CLOCK_SLACK_MS = 150;

/** The recording must span at least this fraction of the browser session it recorded. */
const MINIMUM_COVERAGE = 0.9;

function press(delayMs: number): Operation {
  return {
    op: 'press',
    locator: ADVANCE,
    key: { kind: 'literal', value: 'Shift' },
    options: { delay: delayMs },
  };
}

describe('recording coverage — the video spans the run and ends after the last step', () => {
  let server: PageServer;

  beforeAll(async () => {
    server = await startPageServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it(
    'ends at or after the last step, holds past it, spans the session, and shows the final repaint',
    async () => {
      const outcome = await runReal({
        steps: [
          {
            stepIndex: 0,
            operations: [
              {
                op: 'goto',
                url: { kind: 'literal', value: `${server.baseUrl}/timeline.html` },
                options: { waitUntil: 'load' },
              },
              press(700),
            ],
          },
          { stepIndex: 1, operations: [{ op: 'click', locator: ADVANCE, options: undefined }, press(700)] },
          // The final step is a bare click: a full-viewport repaint with nothing after it. This is
          // the shape whose result was missing from the recording before the tail settle.
          { stepIndex: 2, operations: [{ op: 'click', locator: ADVANCE, options: undefined }] },
        ],
        stepTimeoutMs: 5_000,
      });

      try {
        expect(outcome.result.ok).toBe(true);
        expect(outcome.finished.map((event) => event.status)).toEqual(['PASS', 'PASS', 'PASS']);
        // An orderly close: the recorder was not the thing that ended this run.
        expect(outcome.result.recording.state).toBe('PENDING');
        expect(outcome.result.recording.partial).toBe(false);

        const path = outcome.result.recording.path;
        expect(path, 'no recording to measure').not.toBeNull();
        const frames = readWebmFrames(path ?? '');
        expect(frames.length, 'the recording carries no frames').toBeGreaterThan(10);
        const lastFrameMs = frames.at(-1)?.atMs ?? Number.NaN;

        const lastStep = outcome.finished.at(-1);
        const lastFinishedMs = lastStep?.finishedAtMs ?? Number.NaN;
        const lastStartedMs = lastStep?.startedAtMs ?? Number.NaN;
        const sessionMs = outcome.executeResolvedMs - outcome.observedStartMs;

        process.stdout.write(
          `COVERAGE lastFrame=${lastFrameMs.toFixed(1)}ms ` +
            `lastStepFinished=${lastFinishedMs.toFixed(1)}ms ` +
            `session=${sessionMs.toFixed(1)}ms ` +
            `coverage=${(lastFrameMs / sessionMs).toFixed(3)}\n`,
        );

        // (1) The recording ends at or after the last step's finish. Before the settle this held
        //     only by the width of a frame quantum, and not always.
        expect(
          lastFrameMs,
          `the recording ends at ${lastFrameMs.toFixed(1)}ms, before the last step finished at ` +
            `${lastFinishedMs.toFixed(1)}ms`,
        ).toBeGreaterThanOrEqual(lastFinishedMs - CLOCK_SLACK_MS);

        // (2) The settle's hold is in the file: the recorder ran on past the last step by at
        //     least the hold, less the clock slack. This is the assertion that was red before the
        //     tail settle existed and is what keeps it from being removed by accident.
        expect(
          lastFrameMs,
          `the recorder stopped ${(lastFrameMs - lastFinishedMs).toFixed(1)}ms after the last ` +
            `step; the tail settle holds for ${String(TAIL_SETTLE_HOLD_MS)}ms`,
        ).toBeGreaterThanOrEqual(lastFinishedMs + TAIL_SETTLE_HOLD_MS - CLOCK_SLACK_MS);

        // (3) The recording spans the browser session. `sessionMs` is measured on the parent's
        //     clock from `launch` resolving to `execute` resolving, which is *after* the child
        //     closed the context and reported, so it over-states the session slightly — the
        //     conservative direction for a lower bound on coverage.
        expect(
          lastFrameMs / sessionMs,
          `the recording covers ${(lastFrameMs / sessionMs).toFixed(3)} of a ` +
            `${sessionMs.toFixed(0)}ms session`,
        ).toBeGreaterThanOrEqual(MINIMUM_COVERAGE);

        // (4) The final action's visible result is in the recording: a scene change at or after
        //     the last step's start. `timeline.html` repaints the whole viewport with noise on
        //     every Advance, so the repaint is a spike in frame size and not a judgement call.
        const changes = sceneChanges(frames);
        const finalRepaint = firstChangeAtOrAfter(changes, lastStartedMs);
        expect(
          finalRepaint,
          `no scene change at or after the last step's start (${lastStartedMs.toFixed(1)}ms); ` +
            `changes at ${changes.map((change) => change.atMs.toFixed(0)).join(', ')}ms`,
        ).not.toBeNull();
      } finally {
        outcome.clear();
      }
    },
    120_000,
  );
});

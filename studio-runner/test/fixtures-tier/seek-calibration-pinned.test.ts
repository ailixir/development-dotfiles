/**
 * Story 10.32 AC-4 — the fixtures tier runs with the seek-origin calibration at exactly `0`.
 *
 * ADR-002 §26.3 item 5: *"the fixtures tier always runs with the constant at `0`"*, so it keeps
 * measuring the raw readiness-to-first-frame gap on whatever host runs it. This file asserts that
 * with a real run instead of inferring it from the harness. The value asserted is the one the
 * child **reports applying** in its `ready` message, not the literal `realRunner.ts` passes.
 * Change that literal and this test goes red on the next real run.
 *
 * **What this does not cover (AC-4's named limit).** `realRunner.ts` is the path
 * `seek-measurement.test.ts` measures through. The six other fixtures-tier launcher constructions
 * (`deadline-cleanup.test.ts` ×4, `real-chromium.test.ts` ×2, `no-browser-on-refusal.test.ts`)
 * each pass a literal `0` that only review protects. The field is required, so deleting one of
 * them is a type error, not a silent default.
 *
 * Deliberately not added to `seek-measurement.test.ts` (10.16b AC-16), and deliberately a single
 * run. Proving that a non-zero value survives the whole pipeline is out of this story's scope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import { runReal } from './realRunner.js';

describe('story 10.32 AC-4 — the fixtures tier is pinned to an uncalibrated origin', () => {
  let server: PageServer;

  beforeAll(async () => {
    server = await startPageServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('runs real Chromium with a seek-origin calibration of exactly 0', async () => {
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
          ],
        },
      ],
    });

    try {
      // The run really happened, so the value below came from a child that took an origin.
      expect(outcome.finished.map((event) => event.status)).toEqual(['PASS']);
      expect(outcome.startedAtMs).toBe(0);
      expect(outcome.calibrationOffsetMs).toBe(0);
    } finally {
      outcome.clear();
    }
  });
});

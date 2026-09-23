/**
 * AC-10, AC-11 — the run timeline, and the defect it closes.
 *
 * ADR-002 §4.1 fixes `atMs` as a fractional offset on the run timeline, sharing the step
 * readings' monotonic clock and origin, `null` where no reading exists, `0` meaning the browser
 * start. **That invariant did not hold in the merged code**: `executeSteps` fell back to
 * `performance.now()`, whose origin is process start, while the browser-start log line carried a
 * literal `0`. Two origins on one timeline, and the 500 ms step-seek target depends on there
 * being one.
 *
 * Every assertion below is about one of the four consequences ADR-002 §11.6 assigns here (O-8):
 * the process-origin default gone from production, the two reads paired, the **scale** asserted
 * rather than the shape, and a report with `browserStartedAt: null` carrying no reading.
 */
import { describe, expect, it } from 'vitest';

import { executeSteps } from '../../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../helpers/fakeAdapters.js';
import { createValueResolver } from '../../src/executor/executor.js';
import {
  systemOriginSource,
  takeProcessOriginForFalsification,
  takeRunOrigin,
} from '../../src/run/timeline.js';
import type { OriginSource } from '../../src/run/timeline.js';

/** A source whose two reads are individually countable, so "adjacent" becomes falsifiable. */
function countingSource(monotonic: number[], wall: number[]): OriginSource & {
  readonly monotonicReads: number[];
  readonly wallReads: number[];
} {
  const monotonicReads: number[] = [];
  const wallReads: number[] = [];
  let monotonicIndex = 0;
  let wallIndex = 0;
  return {
    monotonicReads,
    wallReads,
    monotonicNow(): number {
      const value = monotonic[Math.min(monotonicIndex, monotonic.length - 1)] ?? 0;
      monotonicIndex += 1;
      monotonicReads.push(value);
      return value;
    },
    wallNow(): Date {
      const value = wall[Math.min(wallIndex, wall.length - 1)] ?? 0;
      wallIndex += 1;
      wallReads.push(value);
      return new Date(value);
    },
  };
}

describe('AC-11.2 — the two reads are paired', () => {
  it('samples the monotonic clock exactly once, so the zero and the first reading cannot drift', () => {
    const source = countingSource([5_000, 9_999, 9_999], [1_700_000_000_000]);
    const origin = takeRunOrigin(source);

    // One sample. If the zero and the first reading came from two reads, a clock that moved
    // between them would put the browser-start line somewhere other than the origin.
    expect(source.monotonicReads).toEqual([5_000]);
    expect(source.wallReads).toHaveLength(1);
    expect(origin.monotonicZero).toBe(5_000);
  });

  it('takes the wall-clock instant adjacently to the monotonic one', () => {
    const source = countingSource([42], [1_700_000_000_000]);
    const origin = takeRunOrigin(source);
    expect(origin.browserStartedAt.toISOString()).toBe(new Date(1_700_000_000_000).toISOString());
    expect(origin.monotonicZero).toBe(42);
  });
});

describe('AC-10 — the STARTED reading is a reading that happens to be 0', () => {
  it('computes the first reading from the sample that defined the zero', () => {
    // Not a constant: `startedAtMs` is the difference of the origin sample with itself, which is
    // exactly 0 whatever the underlying clock's own origin happens to be.
    for (const zero of [0, 1_000, 5_000_000, 1e9]) {
      const origin = takeRunOrigin(countingSource([zero], [0]));
      expect(origin.startedAtMs).toBe(0);
    }
  });

  it('produces fractional, non-negative readings on the run clock', () => {
    const source = countingSource([1_000.5, 1_000.5, 1_012.75], [0]);
    const origin = takeRunOrigin(source);
    expect(origin.clock.now()).toBe(0);
    expect(origin.clock.now()).toBeCloseTo(12.25, 6);
  });

  it('is zeroed against the real monotonic source too, not just an injected one', () => {
    const origin = takeRunOrigin(systemOriginSource);
    const first = origin.clock.now();
    expect(origin.startedAtMs).toBe(0);
    expect(first).toBeGreaterThanOrEqual(0);
    // A process-origin clock would read the process uptime here, which after module loading and
    // a full test file is never this small.
    expect(first).toBeLessThan(50);
  });
});

/**
 * Story 10.32 AC-2 — the calibration moves the zero, and only the zero (ADR-002 §26.3 item 2,
 * §26.4(a)).
 *
 * Both properties drive a calibrated and an uncalibrated origin with the **same** monotonic
 * sequence and compare the outputs directly. The expected numbers are the worked example's
 * literals, not values computed by `takeRunOrigin`.
 */
describe('story 10.32 AC-2 — the seek-origin calibration', () => {
  /** A zero read, then a series of readings. Fresh per origin so both see identical samples. */
  const SEQUENCE = [1_000, 1_300, 1_450.5, 2_000, 2_000.25];

  it('(1) produces the same origin with no calibration argument and with 0', () => {
    const wall = [1_700_000_000_000];
    const implicit = takeRunOrigin(countingSource([...SEQUENCE], wall));
    const explicit = takeRunOrigin(countingSource([...SEQUENCE], wall), 0);

    expect(explicit.monotonicZero).toBe(implicit.monotonicZero);
    expect(explicit.startedAtMs).toBe(implicit.startedAtMs);
    expect(explicit.browserStartedAt.toISOString()).toBe(implicit.browserStartedAt.toISOString());
    expect(explicit.calibrationOffsetMs).toBe(0);
    expect(implicit.calibrationOffsetMs).toBe(0);
    const implicitReadings = SEQUENCE.slice(1).map(() => implicit.clock.now());
    const explicitReadings = SEQUENCE.slice(1).map(() => explicit.clock.now());
    expect(implicitReadings).toEqual([300, 450.5, 1_000, 1_000.25]);
    expect(explicitReadings).toEqual(implicitReadings);
  });

  it('(2) makes every later reading exactly N smaller, never larger', () => {
    // The worked example: 1_000 then 1_300 reads 300 uncalibrated, and 250 at N = 50.
    const worked = takeRunOrigin(countingSource([1_000, 1_300], [0]), 50);
    expect(worked.clock.now()).toBe(250);

    const uncalibrated = takeRunOrigin(countingSource([...SEQUENCE], [0]), 0);
    const baseline = SEQUENCE.slice(1).map(() => uncalibrated.clock.now());
    for (const offset of [1, 50, 110, 250]) {
      const calibrated = takeRunOrigin(countingSource([...SEQUENCE], [0]), offset);
      const readings = SEQUENCE.slice(1).map(() => calibrated.clock.now());
      expect(
        readings.map((reading, index) => (baseline[index] ?? Number.NaN) - reading),
        `N = ${String(offset)}`,
      ).toEqual(baseline.map(() => offset));
      expect(calibrated.calibrationOffsetMs).toBe(offset);
    }
  });

  it('keeps startedAtMs at 0 and browserStartedAt unchanged under any N (current behaviour, not an ESC-3 ruling)', () => {
    // ESC-3 is open with @architect: what a non-zero N should mean for these two is not ruled.
    // This asserts today's behaviour so a change to it is a visible decision.
    for (const offset of [0, 50, 250]) {
      const origin = takeRunOrigin(countingSource([...SEQUENCE], [1_700_000_000_000]), offset);
      expect(origin.startedAtMs).toBe(0);
      expect(origin.browserStartedAt.toISOString()).toBe(new Date(1_700_000_000_000).toISOString());
      expect(origin.monotonicZero).toBe(1_000 + offset);
    }
  });

  it('still samples the monotonic clock exactly once when calibrated', () => {
    const source = countingSource([5_000, 9_999], [0]);
    takeRunOrigin(source, 50);
    expect(source.monotonicReads).toEqual([5_000]);
  });
});

describe('AC-11.3 — the scale, falsified', () => {
  /**
   * The runner's contract-test validator implements `$ref`/`type`/`required`/`properties`/
   * `additionalProperties`/`enum`/`allOf`/`anyOf`/`oneOf`/`const` and **ignores `minimum`**
   * (ADR-002 §11.6 item 3). The `minimum: 0` the amendment added is therefore documentary, and no
   * schema can tell a process-origin reading from a legitimate late one. The scale has to be
   * asserted by a test, and the test has to be shown failing under the defect.
   */
  const SMALL_BOUND_MS = 250;

  it('puts the first step reading within a small, named bound of 0', async () => {
    const origin = takeRunOrigin();
    const result = await executeSteps({
      steps: [{ stepIndex: 0, operations: [] }],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: origin.clock,
    });
    const startedAtMs = result.steps[0]?.startedAtMs ?? Number.NaN;
    expect(startedAtMs).toBeGreaterThanOrEqual(0);
    expect(startedAtMs).toBeLessThan(SMALL_BOUND_MS);
  });

  it('FAILS under a process-origin clock — the defect this story closes', async () => {
    // A plausible process uptime at the moment a pod admits its first run: the image started,
    // configuration loaded, the server bound a port, an admission round trip completed. The
    // number is injected rather than read from this test process so the falsification is
    // deterministic — a guard that only fails on a slow machine is not a guard.
    const uptimeMs = 87_432.5;
    const defective = takeProcessOriginForFalsification(countingSource([uptimeMs], [0]));
    const result = await executeSteps({
      steps: [{ stepIndex: 0, operations: [] }],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: defective.clock,
    });
    const startedAtMs = result.steps[0]?.startedAtMs ?? Number.NaN;
    // The same assertion as above, inverted: the reading is the process uptime, not an offset
    // from the browser start. Under the merged code every reading the runner produced looked like
    // this — and `minimum: 0` was satisfied by all of them, which is why the schema could not see
    // it and this test has to (ADR-002 §11.6 item 3).
    expect(startedAtMs).toBeGreaterThan(SMALL_BOUND_MS);
    expect(startedAtMs).toBe(uptimeMs);
    // And the origin it reports is not the browser start at all: `startedAtMs` on the origin is
    // the uptime rather than 0, so the STARTED log line and the step readings disagree.
    expect(defective.startedAtMs).not.toBe(0);
  });

  it('the fake clock’s startMs is not what makes the bound pass', async () => {
    // `createFakeClock`'s default `startMs = 1_000` is a number nobody chose for this property.
    // Running the same case at 0 and at a deliberately large offset shows the executor reports
    // whatever clock it is given: the scale is a property of the *origin*, not of the fake.
    for (const startMs of [0, 1_000, 5_000_000]) {
      const result = await executeSteps({
        steps: [{ stepIndex: 0, operations: [] }],
        adapter: createFakeBrowserAdapter(),
        reporter: createRecordingStepReporter(),
        resolver: createValueResolver({}),
        clock: createFakeClock(startMs),
      });
      expect(result.steps[0]?.startedAtMs).toBe(startMs);
    }
  });
});

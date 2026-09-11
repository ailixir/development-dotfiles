import { describe, expect, it } from 'vitest';

import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../src/executor/adapters/fake.js';
import type { Operation } from '../src/executor/operations.js';

const gotoStep = (stepIndex: number, url: string): { stepIndex: number; operations: Operation[] } => ({
  stepIndex,
  operations: [{ op: 'goto', url: { kind: 'literal', value: url } }],
});

describe('trusted executor', () => {
  it('reports monotonic timings for every executed step (AC-14)', async () => {
    const adapter = createFakeBrowserAdapter();
    const reporter = createRecordingStepReporter();

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/'), gotoStep(1, 'https://b.example/')],
      adapter,
      reporter,
      resolver: createValueResolver({}),
      clock: createFakeClock(1000, 5),
    });

    expect(result.ok).toBe(true);
    expect(reporter.started.map((event) => event.stepIndex)).toEqual([0, 1]);
    const timestamps = reporter.finished.flatMap((event) => [event.startedAtMs, event.finishedAtMs]);
    for (let index = 1; index < timestamps.length; index += 1) {
      const previous = timestamps[index - 1];
      const current = timestamps[index];
      expect(previous).not.toBeNull();
      expect(current).not.toBeNull();
      expect(current ?? 0).toBeGreaterThan(previous ?? 0);
    }
    expect(result.steps.every((step) => step.status === 'PASS')).toBe(true);
  });

  it('stops at the first failing step and skips the rest with null timings (AC-14)', async () => {
    const adapter = createFakeBrowserAdapter();
    const reporter = createRecordingStepReporter();
    adapter.failOn('goto', new Error('navigation refused'));

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/'), gotoStep(1, 'https://b.example/'), gotoStep(2, 'https://c.example/')],
      adapter,
      reporter,
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.status)).toEqual(['FAIL', 'SKIPPED', 'SKIPPED']);
    expect(result.steps[0]?.failure).toContain('navigation refused');
    for (const skipped of result.steps.slice(1)) {
      expect(skipped.startedAtMs).toBeNull();
      expect(skipped.finishedAtMs).toBeNull();
      expect(skipped.durationMs).toBeNull();
      expect(skipped.failure).toBeNull();
    }
    // Only the first step reached the adapter.
    expect(adapter.calls.map((call) => call.method)).toEqual(['goto']);
    expect(reporter.started).toHaveLength(1);
  });

  it('bounds the failure message (AC-15)', async () => {
    const adapter = createFakeBrowserAdapter();
    adapter.failOn('goto', new Error('x'.repeat(5_000)));

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
      maxFailureMessageLength: 64,
    });

    expect(result.steps[0]?.failure?.length).toBeLessThanOrEqual(64);
  });

  it('resolves a variable only through the resolver', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [
        {
          stepIndex: 0,
          operations: [{ op: 'goto', url: { kind: 'variable', name: 'BASE_URL' } }],
        },
      ],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ variables: { BASE_URL: 'https://resolved.example/' } }),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(true);
    expect(adapter.calls[0]?.args[0]).toBe('https://resolved.example/');
  });

  it('fails the step when a reference cannot be resolved', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [
        { stepIndex: 0, operations: [{ op: 'goto', url: { kind: 'variable', name: 'MISSING' } }] },
      ],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0]?.failure).toContain('MISSING');
    expect(adapter.calls).toEqual([]);
  });

  it('survives a non-Error rejection without leaking its content', async () => {
    const adapter = createFakeBrowserAdapter();
    // The adapter contract says Error, but a hostile page can make Playwright reject with anything.
    adapter.failOn('goto', 'plain string failure' as unknown as Error);

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0]?.failure).toBe('Non-error thrown: string');
  });

  it('uses the default clock when none is injected', async () => {
    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
    });
    expect(result.steps[0]?.durationMs).not.toBeNull();
  });

  it('reports the executor version', async () => {
    const result = await executeSteps({
      steps: [],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
    });
    expect(result.executorVersion).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import studioApi from '@/services/api/studioApi';
import { compilingDraft, readyDraft, staleDraft } from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import {
  COMPILE_WATCH_WINDOW_MS,
  RUN_POLL_SHAPE,
} from '../review/compilePollBounds';
import { COMPILE_DURATION_HINT, COMPILE_HINT_AFTER_MS } from '../review/CompileElapsed';
import { formatElapsed } from '../review/formatElapsed';
import { CompileReviewPanel } from '../review/CompileReviewPanel';
import { RunControl, RUN_LABEL } from './RunControl';
import { COMPILE_WAIT_BUDGET_MS, RUN_COMPILE_POLL_DELAYS_MS } from './useRunGate';

/**
 * VAL-007 G1, G3, G4 — the long-compile wait: what the author sees, how often Run asks, and how
 * long it is willing to ask for.
 *
 * The timing assertions use spies on `studioApi` rather than the mock server, deliberately: a
 * spy's promise settles in the same fake-clock instant, so the gap between two reads is the
 * client's delay and nothing else. What is asserted is the client's cadence, not the wire.
 */

const BACKEND_CONFIG = path.resolve(
  __dirname,
  '../../../../../backend/src/main/resources/application.yml',
);

function configMs(pattern: RegExp): number {
  const yml = fs.readFileSync(BACKEND_CONFIG, 'utf8');
  const match = yml.match(pattern);
  expect(match, `${pattern.source} is no longer declared where this test reads it`).not.toBeNull();
  const [, amount, unit = 'ms'] = match!;
  const factor = unit === 'ms' ? 1 : unit === 's' ? 1_000 : 60_000;
  return Number(amount) * factor;
}

/** `getTest` is overloaded; Run and the Code tab both call the plain `TestDto` form. */
function stubGetTest(impl: () => Promise<TestDto>) {
  return vi
    .spyOn(studioApi, 'getTest')
    .mockImplementation(impl as unknown as typeof studioApi.getTest);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const id = staleDraft.id;
const compiling: TestDto = { ...compilingDraft, id };
const ready: TestDto = { ...readyDraft, id };

/**
 * A draft that starts STALE, is COMPILING from the moment Run asks for a compile, and becomes
 * `settleTo` after `compilingReads` reads of the wait. Returns the fake-clock time of every read
 * the wait made.
 */
function serveCompile(compilingReads: number, settleTo: TestDto = ready) {
  let compileAsked = false;
  let waitReads = 0;
  const waitReadTimes: number[] = [];
  stubGetTest(async () => {
    if (!compileAsked) return staleDraft;
    waitReads += 1;
    waitReadTimes.push(Date.now());
    return waitReads > compilingReads ? settleTo : compiling;
  });
  const compileTest = vi.spyOn(studioApi, 'compileTest').mockImplementation(async () => {
    compileAsked = true;
    return { compileRequestId: 'r', compileStatus: 'COMPILING' };
  });
  const executeTest = vi
    .spyOn(studioApi, 'executeTest')
    .mockResolvedValue({ executionId: '88888888-8888-8888-8888-888888888888', status: 'PENDING' });
  return { waitReadTimes, compileTest, executeTest };
}

async function startRun() {
  vi.useFakeTimers();
  render(<RunControl testId={id} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const control = screen.getByRole('button', { name: RUN_LABEL });
  expect(control).not.toBeDisabled();
  fireEvent.click(control);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('G4: the client wait is the server watch window, and the number is pinned', () => {
  it('equals the abandonment threshold plus one sweep interval from the shipped config', () => {
    const threshold = configMs(/STUDIO_COMPILE_ABANDONMENT_THRESHOLD:(\d+)(ms|s|m)\}/);
    const interval = configMs(/STUDIO_COMPILE_ABANDONMENT_INTERVAL_MS:(\d+)\}/);
    expect(COMPILE_WAIT_BUDGET_MS).toBe(COMPILE_WATCH_WINDOW_MS);
    expect(COMPILE_WAIT_BUDGET_MS).toBe(threshold + interval);
    expect(COMPILE_WAIT_BUDGET_MS).toBe(315_000);
  });

  it('outlasts the server attempt budget, so a healthy compile always settles inside it', () => {
    const attemptBudget = configMs(/STUDIO_COMPILE_ATTEMPT_BUDGET:(\d+)(ms|s|m)\}/);
    expect(COMPILE_WAIT_BUDGET_MS).toBeGreaterThan(attemptBudget);
  });
});

describe('G3: Run backs off while a compile settles', () => {
  it('the schedule starts at 600ms, grows to a 5s ceiling, and fits in the wait', () => {
    const delays = RUN_COMPILE_POLL_DELAYS_MS;
    expect(delays[0]).toBe(600);
    expect(delays.slice(0, 5)).toEqual([600, 960, 1536, 2458, 3933]);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
    expect(Math.max(...delays)).toBe(RUN_POLL_SHAPE.maxDelayMs);
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeLessThanOrEqual(
      COMPILE_WAIT_BUDGET_MS,
    );
    // A flat 600ms over the same window would be 525 reads.
    expect(delays.length).toBeLessThan(70);
  });

  it('reads on the backoff schedule and stops reading when the compile settles', async () => {
    const compilingReads = 8;
    const { waitReadTimes, executeTest } = serveCompile(compilingReads);
    await startRun();

    const expected = RUN_COMPILE_POLL_DELAYS_MS.slice(0, compilingReads);
    await advance(expected.reduce((sum, delay) => sum + delay, 0));

    expect(waitReadTimes).toHaveLength(compilingReads + 1);
    const gaps = waitReadTimes.slice(1).map((time, i) => time - waitReadTimes[i]);
    expect(gaps).toEqual(expected);
    expect(executeTest).toHaveBeenCalledTimes(1);

    // Terminal: nothing left running.
    await advance(120_000);
    expect(waitReadTimes).toHaveLength(compilingReads + 1);
  });

  it('a 409 COMPILE_REQUIRED still compiles once more, and that wait restarts at 600ms', async () => {
    let compiles = 0;
    let waitReads = 0;
    const waitReadTimes: number[] = [];
    stubGetTest(async () => {
      if (compiles === 0) return staleDraft;
      waitReads += 1;
      waitReadTimes.push(Date.now());
      // Each compile is COMPILING for three reads, then READY.
      return waitReads % 4 === 0 ? ready : compiling;
    });
    const compileTest = vi.spyOn(studioApi, 'compileTest').mockImplementation(async () => {
      compiles += 1;
      waitReads = 0;
      waitReadTimes.length = 0;
      return { compileRequestId: `r${compiles}`, compileStatus: 'COMPILING' };
    });
    const executeTest = vi
      .spyOn(studioApi, 'executeTest')
      .mockRejectedValueOnce({
        response: { status: 409, data: { error: 'COMPILE_REQUIRED', message: 'stale' } },
      })
      .mockResolvedValueOnce({ executionId: '99999999-9999-9999-9999-999999999999', status: 'PENDING' });

    await startRun();
    await advance(30_000);

    expect(compileTest).toHaveBeenCalledTimes(2);
    expect(executeTest).toHaveBeenCalledTimes(2);
    // The second compile's wait started over at the first delay rather than carrying on.
    const gaps = waitReadTimes.slice(1).map((time, i) => time - waitReadTimes[i]);
    expect(gaps).toEqual(RUN_COMPILE_POLL_DELAYS_MS.slice(0, 3));
  });

  it('gives up at the wait budget — not before — with a bounded number of reads', async () => {
    const { waitReadTimes, executeTest } = serveCompile(Number.POSITIVE_INFINITY);
    await startRun();

    await advance(COMPILE_WAIT_BUDGET_MS - RUN_POLL_SHAPE.maxDelayMs - 1_000);
    expect(screen.queryByTestId('run-compile-outcome')).toBeNull();

    await advance(RUN_POLL_SHAPE.maxDelayMs + 2_000);
    expect(screen.getByTestId('run-compile-outcome-title').textContent).toBe(
      'Preparing took too long',
    );
    expect(waitReadTimes.length).toBe(RUN_COMPILE_POLL_DELAYS_MS.length + 1);
    expect(executeTest).not.toHaveBeenCalled();

    await advance(600_000);
    expect(waitReadTimes.length).toBe(RUN_COMPILE_POLL_DELAYS_MS.length + 1);
  });
});

describe('G1: the wait shows how long it has been, and says a long wait is normal', () => {
  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(42_400)).toBe('0:42');
    expect(formatElapsed(125_000)).toBe('2:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('Run: the elapsed time advances, and the hint appears once past the threshold', async () => {
    serveCompile(Number.POSITIVE_INFINITY);
    await startRun();

    expect(screen.getByRole('status').textContent).toBe('Preparing your test…');
    expect(screen.getByTestId('compile-elapsed').textContent).toBe('0:00');
    expect(screen.getByTestId('run-preparation').textContent).toBe('Preparing your test… 0:00');

    await advance(COMPILE_HINT_AFTER_MS - 1_000);
    expect(screen.getByTestId('compile-elapsed').textContent).toBe('0:14');
    expect(screen.queryByTestId('compile-duration-hint')).toBeNull();

    await advance(28_000);
    expect(screen.getByTestId('compile-elapsed').textContent).toBe('0:42');
    const hint = screen.getByTestId('compile-duration-hint');
    expect(hint.textContent).toBe(COMPILE_DURATION_HINT);
    expect(hint).toHaveAttribute('role', 'status');

    // The ticking time is not announced: it is outside every live region.
    const elapsed = screen.getByTestId('compile-elapsed');
    expect(elapsed).toHaveAttribute('aria-live', 'off');
    expect(elapsed.closest('[role="status"]')).toBeNull();
  });

  it('Run: the elapsed time is gone once the compile settles', async () => {
    serveCompile(2);
    await startRun();
    expect(screen.getByTestId('compile-elapsed')).toBeInTheDocument();
    await advance(10_000);
    expect(screen.queryByTestId('compile-elapsed')).toBeNull();
    expect(screen.queryByTestId('compile-duration-hint')).toBeNull();
  });

  it('Code tab: the Translating card shows the same elapsed time and hint', async () => {
    stubGetTest(async () => compilingDraft);
    vi.useFakeTimers();
    render(<CompileReviewPanel testId={compilingDraft.id} />);
    await advance(0);

    expect(screen.getByTestId('compile-state-region')).toHaveAttribute(
      'aria-label',
      'Translating your steps',
    );
    expect(screen.getByTestId('compile-elapsed').textContent).toBe('Waiting for the result: 0:00');
    expect(screen.queryByTestId('compile-duration-hint')).toBeNull();

    await advance(COMPILE_HINT_AFTER_MS + 1_000);
    expect(screen.getByTestId('compile-elapsed').textContent).toBe('Waiting for the result: 0:16');
    expect(screen.getByTestId('compile-duration-hint').textContent).toBe(COMPILE_DURATION_HINT);
  });
});

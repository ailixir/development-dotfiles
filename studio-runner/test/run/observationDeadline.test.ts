import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ClosedActionError } from '../../src/run/closedError.js';
import { DEADLINE_CEILING_MS, deadlineFromMeasurements, OBSERVATION_DEADLINE_MS, raceDeadline, SPIKE_P95_MS, TRANSPORT_CEILING_MS, unitsFor, UNITS_PER_MS } from '../../src/run/observationDeadline.js';
import { DEFAULT_WORK_BUDGET_UNITS } from '../../src/run/privateInventory.js';

describe('the collection deadline rule', () => {
  it('is min(12,000 ms, ceil_1s(6 x P)) with P at least the S3 spike p95', () => {
    expect(deadlineFromMeasurements([])).toBe(Math.ceil((6 * SPIKE_P95_MS) / 1000) * 1000);
    expect(deadlineFromMeasurements([{ page: 'a', medianMs: 1_300 }])).toBe(8_000);
    expect(deadlineFromMeasurements([{ page: 'a', medianMs: 400 }, { page: 'b', medianMs: 1_301 }])).toBe(8_000);
    expect(deadlineFromMeasurements([{ page: 'a', medianMs: 9_000 }])).toBe(DEADLINE_CEILING_MS);
    expect(DEADLINE_CEILING_MS).toBe(TRANSPORT_CEILING_MS - 3_000);
  });

  it('the constant is inside the transport window with a reserve', () => {
    expect(OBSERVATION_DEADLINE_MS).toBeLessThanOrEqual(DEADLINE_CEILING_MS);
    expect(OBSERVATION_DEADLINE_MS).toBeGreaterThanOrEqual(5 * SPIKE_P95_MS);
  });

  it('work units are derived from the remaining time and never exceed the WI-2 default', () => {
    expect(unitsFor(1_000)).toBe(1_000 * UNITS_PER_MS);
    expect(unitsFor(0)).toBe(1);
    expect(unitsFor(1e12)).toBe(DEFAULT_WORK_BUDGET_UNITS);
    expect(unitsFor(2_000)).toBeGreaterThan(unitsFor(1_000));
  });
});

describe('raceDeadline', () => {
  it('passes a result and an error that arrive in time', async () => {
    await expect(raceDeadline(Promise.resolve(5), Date.now() + 1_000, () => undefined)).resolves.toBe(5);
    await expect(raceDeadline(Promise.reject(new Error('x')), Date.now() + 1_000, () => undefined)).rejects.toThrow('x');
  });

  it('rejects with the closed OBSERVATION_DEADLINE, runs the expiry once, and swallows the abandoned work', async () => {
    vi.useFakeTimers();
    try {
      let expired = 0;
      const never = new Promise<never>(() => undefined);
      const pending = raceDeadline(never, Date.now() + 500, () => { expired++; });
      const settled = pending.then(() => 'resolved', (error: unknown) => error);
      await vi.advanceTimersByTimeAsync(499);
      expect(expired).toBe(0);
      await vi.advanceTimersByTimeAsync(2);
      const error = await settled;
      expect(error).toBeInstanceOf(ClosedActionError);
      expect((error as ClosedActionError).code).toBe('OBSERVATION_DEADLINE');
      expect(expired).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('an expiry callback that throws does not change the verdict, and a late rejection is not unhandled', async () => {
    vi.useFakeTimers();
    try {
      let rejectLate: (e: Error) => void = () => undefined;
      const work = new Promise<never>((_, reject) => { rejectLate = reject; });
      const settled = raceDeadline(work, Date.now() + 10, () => { throw new Error('cleanup failed'); }).then(() => 'resolved', (error: unknown) => error);
      await vi.advanceTimersByTimeAsync(20);
      expect(((await settled) as ClosedActionError).code).toBe('OBSERVATION_DEADLINE');
      rejectLate(new Error('late'));
      await vi.advanceTimersByTimeAsync(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('the deadline boundary', () => {
  it('the first boundary after the deadline throws OBSERVATION_DEADLINE', async () => {
    // A deadline that already passed fires at the first timer tick, whatever the work does.
    const slow = new Promise<number>(resolve => setTimeout(() => { resolve(1); }, 200));
    await expect(raceDeadline(slow, Date.now() - 5_000, () => undefined)).rejects.toMatchObject({ code: 'OBSERVATION_DEADLINE' });
  });
});

describe('the deadline constant and its evidence', () => {
  it('the constant equals the rule applied to the measured evidence', () => {
    const evidence = JSON.parse(readFileSync(new URL('../../../docs/qa/evidence/adr-sc-007/wi-4/collection-deadline.json', import.meta.url), 'utf8')) as { rows: { page: string; medianMs: number }[]; P: number; D: number };
    expect(evidence.rows.length).toBeGreaterThan(100);
    expect(OBSERVATION_DEADLINE_MS).toBe(deadlineFromMeasurements(evidence.rows));
    expect(evidence.D).toBe(OBSERVATION_DEADLINE_MS);
    expect(OBSERVATION_DEADLINE_MS).toBeLessThanOrEqual(DEADLINE_CEILING_MS);
    // 5 x P headroom, except where the 12,000 ms ceiling (15,000 ms transport window minus a 3 s reserve) is lower than that.
    expect(OBSERVATION_DEADLINE_MS).toBeGreaterThanOrEqual(Math.min(DEADLINE_CEILING_MS, 5 * evidence.P));
  });
});

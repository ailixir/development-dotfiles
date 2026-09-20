import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMPILE_SWEEP_INTERVAL_MS,
  COMPILE_SWEEP_THRESHOLD_MS,
  COMPILE_WATCH_WINDOW_MS,
  compilePollSchedule,
  isTerminalCompileStatus,
  TERMINAL_COMPILE_STATUSES,
} from './compilePollBounds';

/**
 * Story 10.10 AC-23 — the watch window is **derived**, and the derivation is pinned.
 *
 * The bound is the server's own abandoned-compile sweep threshold, which is configuration rather
 * than contract, so it cannot be read from `openapi.yaml`. It is read from the deployed default
 * in `backend/src/main/resources/application.yml` instead. If the server's threshold moves and
 * this constant does not, this test fails — which is the difference between a derivation and a
 * number that happened to agree once.
 */

const BACKEND_CONFIG = path.resolve(
  __dirname,
  '../../../../../backend/src/main/resources/application.yml',
);

function sweepThresholdMs(): number {
  const yml = fs.readFileSync(BACKEND_CONFIG, 'utf8');
  const match = yml.match(/STUDIO_COMPILE_ABANDONMENT_THRESHOLD:(\d+)(ms|s|m)\}/);
  expect(match, 'the sweep threshold is no longer declared where this test reads it').not.toBeNull();
  const [, amount, unit] = match!;
  const factor = unit === 'ms' ? 1 : unit === 's' ? 1_000 : 60_000;
  return Number(amount) * factor;
}

function sweepIntervalMs(): number {
  const yml = fs.readFileSync(BACKEND_CONFIG, 'utf8');
  const match = yml.match(/STUDIO_COMPILE_ABANDONMENT_INTERVAL_MS:(\d+)\}/);
  expect(match, 'the sweep interval is no longer declared where this test reads it').not.toBeNull();
  return Number(match![1]);
}

describe('AC-23: the COMPILING watch is bounded by a number the server already publishes', () => {
  it('the watch window is the shipped sweep threshold plus one shipped sweep interval', () => {
    const threshold = sweepThresholdMs();
    const interval = sweepIntervalMs();
    expect(threshold).toBeGreaterThan(0);
    expect(interval).toBeGreaterThan(0);
    expect(COMPILE_SWEEP_THRESHOLD_MS).toBe(threshold);
    expect(COMPILE_SWEEP_INTERVAL_MS).toBe(interval);
    expect(COMPILE_WATCH_WINDOW_MS).toBe(threshold + interval);
  });

  it('the schedule is finite and fits inside the window', () => {
    const delays = compilePollSchedule();
    expect(delays.length).toBeGreaterThan(3);
    expect(delays.length).toBeLessThan(100);
    const total = delays.reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeLessThanOrEqual(COMPILE_WATCH_WINDOW_MS);
    // Backs off rather than hammering: BRD §6 — Studio must not exhaust capacity reserved for
    // ordinary checks. The cadence itself is not asserted to be right.
    expect(delays[delays.length - 1]).toBeGreaterThan(delays[0]);
  });

  it('a shorter window produces a shorter schedule — the count is derived, not typed', () => {
    expect(compilePollSchedule(20_000).length).toBeLessThan(compilePollSchedule(200_000).length);
    expect(compilePollSchedule(0)).toEqual([]);
  });

  it('every compile state except COMPILING ends the watch', () => {
    expect([...TERMINAL_COMPILE_STATUSES].sort()).toEqual(
      ['AWAITING_CONFIRMATION', 'NEEDS_REVISION', 'READY', 'STALE'].sort(),
    );
    expect(isTerminalCompileStatus('COMPILING')).toBe(false);
  });
});

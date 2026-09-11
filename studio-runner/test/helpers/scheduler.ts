/**
 * A monotonic clock and a timer facility a test drives by hand (10.13 AC-1, AC-2, AC-3).
 *
 * The story's deadline assertions are about **when** something was ordered relative to **which**
 * instant, and a suite that slept for them would be asserting on the machine it happened to run
 * on. This is the same posture `test/helpers/harness.ts` already takes for `now` and `sleep`: the
 * schedule is exact, and "the kill was ordered `totalRuntimeMs` after the browser start" is a
 * measurement rather than a race.
 *
 * `advance` runs due timers **in scheduled order**, moving the clock to each one's due instant
 * before it fires, so a callback that reads `now()` sees the instant it was scheduled for rather
 * than the end of the whole advance.
 */
import type { DeadlineTimer, DeadlineTimers } from '../../src/run/deadline.js';

export interface FakeScheduler extends DeadlineTimers {
  /** The monotonic source. Hand this to anything that takes a `now`. */
  readonly now: () => number;
  /** Moves the clock forward, firing whatever comes due on the way. */
  readonly advance: (ms: number) => void;
  /** Moves the clock without firing anything — for "time passed in the queue" setups. */
  readonly skip: (ms: number) => void;
  /** Every timer ever scheduled, with the delay it was asked for. Order of scheduling. */
  readonly scheduled: readonly { readonly atMs: number; readonly delayMs: number }[];
  /** Delays of timers still pending. */
  readonly pending: () => readonly number[];
  readonly cleared: number;
}

interface Entry {
  readonly id: number;
  readonly dueMs: number;
  readonly delayMs: number;
  readonly callback: () => void;
}

export function createFakeScheduler(startMs = 0): FakeScheduler {
  let clock = startMs;
  let nextId = 0;
  let cleared = 0;
  const entries = new Map<number, Entry>();
  const scheduled: { atMs: number; delayMs: number }[] = [];

  return {
    scheduled,
    get cleared(): number {
      return cleared;
    },
    // Arrow properties, not methods: every one of these is handed to production code as a *value*
    // (`now` becomes the coordinator's monotonic source, `set`/`clear` become its timers), and an
    // unbound method separated from its object is a `this` bug waiting to happen.
    now: (): number => clock,
    set: (callback: () => void, ms: number): DeadlineTimer => {
      nextId += 1;
      entries.set(nextId, { id: nextId, dueMs: clock + ms, delayMs: ms, callback });
      scheduled.push({ atMs: clock, delayMs: ms });
      return nextId;
    },
    clear: (timer: DeadlineTimer): void => {
      if (entries.delete(timer as number)) cleared += 1;
    },
    pending: (): readonly number[] => [...entries.values()].map((entry) => entry.delayMs),
    skip: (ms: number): void => {
      clock += ms;
    },
    advance: (ms: number): void => {
      const target = clock + ms;
      for (;;) {
        const due = [...entries.values()]
          .filter((entry) => entry.dueMs <= target)
          .sort((a, b) => a.dueMs - b.dueMs || a.id - b.id)[0];
        if (due === undefined) break;
        entries.delete(due.id);
        clock = due.dueMs;
        due.callback();
      }
      clock = target;
    },
  };
}

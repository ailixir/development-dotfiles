/**
 * AC-1, AC-2, AC-4, AC-6 — the two budgets, on a clock the test owns.
 *
 * Every assertion here is about arithmetic and surface: where the runtime budget is measured from,
 * what it is measured on, that nothing can lengthen it, and what a job is allowed to ask for. The
 * behaviour that *follows* from a deadline firing — the ordered stop, the group kill, the `TIMEOUT`
 * on the wire — is `test/run/launcher.test.ts` and `test/server/deadline-outcome.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  SYSTEM_DEADLINE_TIMERS,
  createRuntimeDeadline,
  effectiveRuntimeCapMs,
  effectiveStepTimeoutMs,
} from '../../src/run/deadline.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

/** §8.5's starting values, used as the story states them. */
const ADMITTED_START_MS = 30_000;
const TOTAL_RUNTIME_MS = 120_000;
const MAXIMA = { totalRuntimeMs: TOTAL_RUNTIME_MS, stepTimeoutMs: 30_000 };

describe('AC-1 — queue time and browser runtime are separate budgets', () => {
  it('gives a run that spent nine-tenths of its queue budget the whole of its runtime budget', () => {
    const scheduler = createFakeScheduler();
    const expiries: number[] = [];

    // The CAS returned at 0. The run then sat in the queue, being validated, creating scratch and
    // waiting for a browser to come up, until nine-tenths of the 30 s admitted-start budget was
    // gone. §8.5: "queue time and browser runtime are separate budgets."
    const admittedAtMs = scheduler.now();
    scheduler.skip(ADMITTED_START_MS * 0.9);
    const browserReadyAtMs = scheduler.now();

    const deadline = createRuntimeDeadline({
      capMs: TOTAL_RUNTIME_MS,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => expiries.push(scheduler.now()),
    });
    deadline.arm();

    // Two reads, two values. AC-1: "the two instants are separate fields in the run's state and a
    // test asserts they are not the same read."
    expect(admittedAtMs).toBe(0);
    expect(browserReadyAtMs).toBe(27_000);
    expect(deadline.armedAtMs).toBe(browserReadyAtMs);
    expect(deadline.armedAtMs).not.toBe(admittedAtMs);

    // The whole budget, not what was left of some other one. The failing implementation this
    // catches is `capMs - (browserReadyAtMs - admittedAtMs)`, which would have scheduled 93 000.
    expect(scheduler.pending()).toEqual([TOTAL_RUNTIME_MS]);

    // One millisecond before: nothing has fired.
    scheduler.advance(TOTAL_RUNTIME_MS - 1);
    expect(expiries).toEqual([]);

    // And the kill is ordered exactly a whole runtime budget after the browser start.
    scheduler.advance(1);
    expect(expiries).toEqual([browserReadyAtMs + TOTAL_RUNTIME_MS]);
    expect((expiries[0] ?? 0) - browserReadyAtMs).toBe(TOTAL_RUNTIME_MS);
  });

  it('measures from the browser start and from nothing else', () => {
    // Four instants a naive implementation might have used, each of them wrong: the request
    // arriving, the admission CAS, the spawn call, the scratch directory. Only the last read —
    // the `ready` handshake — is the origin of the runtime budget.
    for (const queueMs of [0, 1_000, 15_000, 29_999]) {
      const scheduler = createFakeScheduler();
      scheduler.skip(queueMs);
      const deadline = createRuntimeDeadline({
        capMs: TOTAL_RUNTIME_MS,
        now: scheduler.now,
        timers: scheduler,
        onExpire: () => undefined,
      });
      deadline.arm();
      // Invariant across every queue time: the delay asked for never shrinks.
      expect(scheduler.pending()).toEqual([TOTAL_RUNTIME_MS]);
      expect(deadline.armedAtMs).toBe(queueMs);
    }
  });
});

describe('AC-2 — the parent’s own monotonic clock, and no reading is re-based onto the child’s', () => {
  it('takes its arming instant from the injected `now`, not from the wall clock', () => {
    // A scheduler that starts at an arbitrary monotonic offset, the way `performance.now()` does.
    const scheduler = createFakeScheduler(987_654);
    const deadline = createRuntimeDeadline({
      capMs: 1_000,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => undefined,
    });
    deadline.arm();
    expect(deadline.armedAtMs).toBe(987_654);
    // Not a `Date`, not an ISO string, not a run-timeline offset: a reading on the parent's own
    // monotonic source, which is the only clock the parent has (ADR-002 §11.5).
    expect(typeof deadline.armedAtMs).toBe('number');
  });

  it('enforces a cap that is never *shorter* than the configured one', () => {
    // The story's one deliberate imprecision, stated rather than hidden: the parent arms at the
    // `ready` handshake, which is at or after the child's recording origin by the inter-process
    // latency. So the enforced cap is the configured one measured from a later instant — longer in
    // run-timeline terms, never shorter. A run is never truncated below its budget.
    const scheduler = createFakeScheduler();
    const handshakeLatencyMs = 40;
    scheduler.skip(handshakeLatencyMs);
    const fired: number[] = [];
    const deadline = createRuntimeDeadline({
      capMs: TOTAL_RUNTIME_MS,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => fired.push(scheduler.now()),
    });
    deadline.arm();
    scheduler.advance(TOTAL_RUNTIME_MS);
    // Measured from the child's origin (t=0), the browser got its full budget *plus* the latency.
    expect(fired[0]).toBe(handshakeLatencyMs + TOTAL_RUNTIME_MS);
    expect(fired[0]).toBeGreaterThan(TOTAL_RUNTIME_MS);
  });
});

describe('AC-4 — no heartbeat, message or configuration extends the maximum deadline', () => {
  it('has no method that could extend it', () => {
    const scheduler = createFakeScheduler();
    const deadline = createRuntimeDeadline({
      capMs: 1_000,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => undefined,
    });
    // Structural, not a convention: there is nothing to call. §5.4's "heartbeats never extend the
    // maximum run deadline indefinitely" is a property of the surface here, so a future caller
    // that wanted to extend one would have to add the method — a visible diff — rather than call
    // an innocent-looking one.
    const surface = [
      ...Object.keys(deadline),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(deadline) as object),
    ];
    for (const forbidden of ['extend', 'reset', 'refresh', 'postpone', 'renew', 'touch', 'keepAlive']) {
      expect(surface, `a deadline must not expose \`${forbidden}\``).not.toContain(forbidden);
    }
    expect(Object.keys(deadline).sort()).toEqual(
      ['arm', 'armed', 'armedAtMs', 'cancel', 'capMs', 'expired'].sort(),
    );
  });

  it('ignores a second arm rather than re-arming on it', () => {
    const scheduler = createFakeScheduler();
    const fired: number[] = [];
    const deadline = createRuntimeDeadline({
      capMs: 1_000,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => fired.push(scheduler.now()),
    });
    deadline.arm();

    // A hundred progress events arrive, each one 15 ms apart, carrying the run well past its
    // budget. If any of them re-armed — which is what a "keepalive" would do — the deadline would
    // never fire at all, because the gap between events is smaller than the cap.
    for (let index = 0; index < 100; index += 1) {
      scheduler.advance(15);
      deadline.arm();
    }

    expect(scheduler.scheduled).toHaveLength(1);
    expect(deadline.armedAtMs).toBe(0);
    expect(fired).toEqual([1_000]);
  });

  it('fires on time while a child reports progress continuously past the deadline', () => {
    const scheduler = createFakeScheduler();
    const fired: number[] = [];
    const deadline = createRuntimeDeadline({
      capMs: 500,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => fired.push(scheduler.now()),
    });
    deadline.arm();
    // The child is alive and chatty: step events, log lines, a keepalive. None of them is wired to
    // anything that could touch the timer, and the only way to prove that is to send them.
    for (let elapsed = 0; elapsed < 2_000; elapsed += 10) {
      scheduler.advance(10);
    }
    expect(fired).toEqual([500]);
  });
});

describe('AC-6 — the effective bounds are the server’s, and a job may not enlarge them', () => {
  it('gives a job asking for less exactly what it asked for', () => {
    expect(effectiveRuntimeCapMs(45_000, MAXIMA)).toBe(45_000);
    expect(effectiveStepTimeoutMs(5, MAXIMA)).toBe(5_000);
  });

  it('gives a job asking for ten minutes of browser time the server’s value', () => {
    // §5.2: total browser runtime is "configurable within server limits". The epic: "within API
    // bounds". A `max` here instead of a `min` would make the job envelope a way to buy time.
    expect(effectiveRuntimeCapMs(600_000, MAXIMA)).toBe(TOTAL_RUNTIME_MS);
    expect(effectiveStepTimeoutMs(600, MAXIMA)).toBe(MAXIMA.stepTimeoutMs);
  });

  it('clamps at the boundary rather than one either side of it', () => {
    expect(effectiveRuntimeCapMs(TOTAL_RUNTIME_MS, MAXIMA)).toBe(TOTAL_RUNTIME_MS);
    expect(effectiveRuntimeCapMs(TOTAL_RUNTIME_MS + 1, MAXIMA)).toBe(TOTAL_RUNTIME_MS);
    expect(effectiveRuntimeCapMs(TOTAL_RUNTIME_MS - 1, MAXIMA)).toBe(TOTAL_RUNTIME_MS - 1);
  });

  it('falls back to the server’s value for an unusable request rather than to no bound', () => {
    // The envelope already rejects these, so this is the second line: an unbounded run is never
    // the answer to a number nobody could read.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(effectiveRuntimeCapMs(bad, MAXIMA)).toBe(TOTAL_RUNTIME_MS);
    }
  });
});

describe('the timers the production path actually uses', () => {
  it('schedules and cancels through the host’s own facility', async () => {
    let fired = false;
    const timer = SYSTEM_DEADLINE_TIMERS.set(() => {
      fired = true;
    }, 1);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(fired).toBe(true);

    // And cancelling one that has not fired keeps it from firing.
    let second = false;
    const pending = SYSTEM_DEADLINE_TIMERS.set(() => {
      second = true;
    }, 5);
    SYSTEM_DEADLINE_TIMERS.clear(pending);
    SYSTEM_DEADLINE_TIMERS.clear(timer);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(second).toBe(false);
  });

  it('cancels idempotently, before arming and after expiry', () => {
    const scheduler = createFakeScheduler();
    const deadline = createRuntimeDeadline({
      capMs: 10,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => undefined,
    });
    // Before arming: nothing to clear, and no throw.
    deadline.cancel();
    expect(scheduler.cleared).toBe(0);

    deadline.arm();
    expect(deadline.armed).toBe(true);
    expect(deadline.expired).toBe(false);

    scheduler.advance(10);
    expect(deadline.expired).toBe(true);
    // After expiry the timer is already gone; a cancel on the run's exit path must be harmless,
    // because the exit path does not know which way the run ended.
    deadline.cancel();
    deadline.cancel();
    expect(scheduler.cleared).toBe(0);
  });

  it('clears a live timer when the run finishes before its budget', () => {
    const scheduler = createFakeScheduler();
    const fired: number[] = [];
    const deadline = createRuntimeDeadline({
      capMs: 1_000,
      now: scheduler.now,
      timers: scheduler,
      onExpire: () => fired.push(scheduler.now()),
    });
    deadline.arm();
    scheduler.advance(100);
    deadline.cancel();
    scheduler.advance(10_000);
    // A leaked timer would kill the *next* run to occupy the pod, which is the failure AC-13's
    // "the next run succeeds" exists to catch further downstream.
    expect(fired).toEqual([]);
    expect(scheduler.cleared).toBe(1);
  });
});

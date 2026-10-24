/**
 * STUDIO-OBS-009 AC-11 D5 d (KL-015-D5, lane R2): the close of a guided browser is bounded, on real Chromium. This file
 * REPLACES `guidedCloseProbe.test.ts` (the PR-RT probe, about four minutes a run). The probe found that a close of a
 * frozen browser took 30 s (Playwright's own bound) and that the reply to the request being served was lost to the
 * runner's 30 s socket timeout; the W1.5 ruling (`execution-20261018/w1.5/ruling-part1.md` section 2) set the bound.
 *
 * Rule D5-1: a started session closes gracefully for at most `GUIDED_CLOSE_GRACE_MS` (3 s) and then always takes the
 * hard teardown; a start that failed takes the hard teardown alone. Rule D5-2: a reply goes out only after the close has
 * settled. Rule D5-3: the slot is released exactly when the close is confirmed.
 *
 * The real guided HTTPS server over real mutual TLS, the real `launchGuidedBrowser`, a stub controller. Chrome is frozen
 * with SIGSTOP on its process group, so only the runner's own kill can end it. The cases are the ruling's:
 *
 *   F1  (i)   frozen after a completed start, then `stop`
 *   F2  (ii)  frozen entering WITHHOLD: the start hits its deadline
 *   F3  (iii) a non-deadline error inside the launch, Chrome already frozen
 *   F4  (iv)  stop before spawn (`launchPersistentContext` never returns): unchanged, pinned to the D4 backstop
 *   H         a healthy recorded close, 5 times, unfrozen: the grace is far above what a good close needs
 *
 * Unit-tier twins of the clock arithmetic: `test/guided/{browser,runtime,ownership}.test.ts` (U1-U5).
 *
 * Signals: only direct children of this test process whose command line names a `checks-guided-` scratch directory, and
 * their descendants. Read-only `ps` listings before and after are the lane receipt's job (`ps -axo pid,ppid,command`).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Launch-promise fault oracle for path (iv): the launch is held pending so nothing spawns (same oracle as guided-start-deadline.test.ts).
import { chromium } from 'playwright';
import { identity } from '../../src/guided/contracts.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GUIDED_CLOSE_GRACE_MS, GUIDED_START_BUDGET_MS, GUIDED_START_RESERVE_MS } from '../../src/run/guidedBrowser.js';
import { MIN_PLAYABLE_RECORDING_BYTES, WEBM_MAGIC } from '../../src/run/recording.js';
import { startSecretLoginFixture } from '../fixtures/secret-login/server.js';
import {
  answeredWithin, assignAndWait, cleanupAll, closeFacts, describeBrowser, freezeOwnBrowser, launcherFreezing, newControl, onCleanup, outcomeOf,
  rounded, send, sleep, slotProbe, startHarness, survivorsOf, trackScratch,
} from './helpers/guidedLaunch.js';
import type { Exchange } from './helpers/guidedLaunch.js';

/** The backend gives up on a runner call after this long (`HttpRunnerDispatchClient`, `guidedBrowser.ts` doc). */
const BACKEND_CEILING_MS = 15_000;
/** The terminate stage on a readable process table (ruling 2.2): two listings, a survivor poll of at most 500 ms, and `rm`. */
const TERMINATE_BOUND_MS = 1_500;
/** A healthy recorded close must finish far inside the grace. Above this the ruling sends the lane back to @architect. */
const HEALTHY_RETURN_MS = 1_500;

const results = new Map<string, unknown>();

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

afterAll(async () => {
  const text = JSON.stringify({ file: 'guidedCloseBound.test.ts', ruling: 'W1.5 part 1 section 2', takenAt: new Date().toISOString(), platform: process.platform, node: process.version, graceMs: GUIDED_CLOSE_GRACE_MS, startBudgetMs: GUIDED_START_BUDGET_MS, results: Object.fromEntries(results) }, null, 2);
  const out = process.env.GUIDED_CLOSE_BOUND_OUT;
  if (out) await writeFile(out, `${text}\n`);
});

describe('KL-015-D5 the close of a guided browser is bounded (frozen Chromium, real runner)', () => {
  it('F1 (i) frozen after a completed start: the stop replies 200 once the close settled, within the grace plus the teardown', async () => {
    const control = newControl();
    const harness = await startHarness(launcherFreezing('NEVER', control), control);
    const session = harness.session();
    await assignAndWait(harness, session);
    const started = send(harness.port, `${session.path}/context`, session.context, 'context', 1);
    expect(await answeredWithin(started, 30_000)).toBe(true);
    expect(started.status).toBe(200);
    expect(freezeOwnBrowser(control)).toBeGreaterThan(0);
    const stop = send(harness.port, `${session.path}/stop`, { ...identity(session.context), reason: 'CANCELLED' }, 'stop', 1);
    expect(await answeredWithin(stop, 15_000)).toBe(true);
    const slot = await slotProbe(harness);
    const close = closeFacts(control, stop.sentAt);
    const stopOutcome = outcomeOf(stop);
    results.set('F1', { path: 'i: close of a started session, frozen', ...describeBrowser(control), stop: stopOutcome, slotHeldAfterReply: slot, close, survivorsAfterReply: survivorsOf(control).length });
    expect(control.frozen).toBe(true);
    // Bound: stop arrival + grace + terminate. The old close took 30 034 to 30 061 ms here (PR-RT probe).
    expect(control.closeKind).toBe('close');
    expect(control.closeOutcome).toBe('resolved');
    expect((control.closeSettledAt ?? Infinity) - stop.sentAt).toBeLessThanOrEqual(GUIDED_CLOSE_GRACE_MS + TERMINATE_BOUND_MS);
    // The graceful stage really waited for the grace (a frozen browser cannot close by itself): the terminate stage ended it.
    expect((control.closeSettledAt ?? 0) - (control.closeCalledAt ?? Infinity)).toBeGreaterThanOrEqual(GUIDED_CLOSE_GRACE_MS - 50);
    // D5-2: a 200 means confirmed dead, and it comes inside the backend's 15 s (with this stub controller, inside 6 s).
    expect(stop.status).toBe(200);
    expect(stopOutcome.afterSentMs ?? Infinity).toBeLessThan(6_000);
    expect(stopOutcome.afterSentMs ?? Infinity).toBeLessThan(BACKEND_CEILING_MS);
    expect(control.aliveWhenCloseSettled).toBe(0);
    expect(survivorsOf(control)).toEqual([]);
    // D5-3: the slot is free, and the next assign is accepted (the probe took it and gave it back).
    expect(slot.held).toBe(false);
    expect(slot.status).toBe(200);
  }, 120_000);

  it('F2 (ii) frozen entering WITHHOLD: the start is refused CONTEXT_LOST inside the backend window, after the hard teardown alone', async () => {
    const control = newControl();
    const harness = await startHarness(launcherFreezing('AFTER_LAUNCH', control), control);
    const session = harness.session();
    await assignAndWait(harness, session);
    const start = send(harness.port, `${session.path}/context`, session.context, 'context', 1);
    expect(await answeredWithin(start, 25_000)).toBe(true);
    const slot = await slotProbe(harness);
    const close = closeFacts(control, start.sentAt);
    const startOutcome = outcomeOf(start);
    const launchEnteredAt = control.launchEnteredAt ?? 0;
    results.set('F2', { path: 'ii: start deadline in WITHHOLD, frozen', ...describeBrowser(control), start: startOutcome, slotHeldAfterReply: slot, close, closeSettledAfterLaunchEnteredMs: rounded((control.closeSettledAt ?? NaN) - launchEnteredAt), survivorsAfterReply: survivorsOf(control).length });
    expect(control.frozen).toBe(true);
    // No graceful stage for a start that failed: the runtime took the hard teardown, never `close`.
    expect(control.closeKind).toBe('terminate');
    expect(control.closeOutcome).toBe('resolved');
    // The deadline is `began + 12 s` and `began` precedes the launch, so launch-entered + 12 s is a safe upper edge for it.
    expect((control.closeSettledAt ?? Infinity) - launchEnteredAt).toBeLessThanOrEqual(GUIDED_START_BUDGET_MS + TERMINATE_BOUND_MS);
    expect(start.status).toBe(409);
    expect(startOutcome.code).toBe('CONTEXT_LOST');
    expect(startOutcome.afterSentMs ?? Infinity).toBeLessThan(BACKEND_CEILING_MS);
    expect(control.aliveWhenCloseSettled).toBe(0);
    expect(survivorsOf(control)).toEqual([]);
    expect(slot.held).toBe(false);
  }, 120_000);

  it('F3 (iii) a non-deadline error inside the launch with Chrome frozen: the failed launch takes the hard teardown at once', async () => {
    const control = newControl();
    const harness = await startHarness(launcherFreezing('LAUNCH_ERROR_AFTER_FREEZE', control), control);
    const session = harness.session();
    await assignAndWait(harness, session);
    const start = send(harness.port, `${session.path}/context`, session.context, 'context', 1);
    expect(await answeredWithin(start, 25_000)).toBe(true);
    const slot = await slotProbe(harness);
    const close = closeFacts(control, start.sentAt);
    const startOutcome = outcomeOf(start);
    const frozenAt = control.frozenAt ?? NaN;
    results.set('F3', { path: 'iii: non-deadline launch failure, frozen', ...describeBrowser(control), start: startOutcome, slotHeldAfterReply: slot, close, closeSettledAfterFailureMs: rounded((control.closeSettledAt ?? NaN) - frozenAt), survivorsAfterReply: survivorsOf(control).length });
    expect(control.frozen).toBe(true);
    expect(control.closeKind).toBe('failure.close');
    expect(control.closeOutcome).toBe('resolved');
    // The failure instant is the `ready` throw, which froze the browser; the old graceful cleanup() took 30 061 ms from there.
    expect((control.closeSettledAt ?? Infinity) - frozenAt).toBeLessThanOrEqual(TERMINATE_BOUND_MS);
    expect(start.status).toBe(409);
    expect(startOutcome.code).toBe('CONTEXT_LOST');
    expect(startOutcome.afterSentMs ?? Infinity).toBeLessThan(BACKEND_CEILING_MS);
    expect(control.aliveWhenCloseSettled).toBe(0);
    expect(survivorsOf(control)).toEqual([]);
    expect(slot.held).toBe(false);
  }, 120_000);

  it('F4 (iv-a) stop before spawn: unchanged, the reply is pinned to the D4 backstop (start + 15 s) and the slot is free after it', async () => {
    const control = newControl();
    const spawnProbe: { calledAt: number | null } = { calledAt: null };
    let failLaunch: (error: Error) => void = () => undefined;
    const pending = new Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>>((_resolve, reject) => { failLaunch = reject; });
    pending.catch(() => undefined);
    onCleanup(() => { failLaunch(new Error('case over')); });
    vi.spyOn(chromium, 'launchPersistentContext').mockImplementation(() => { spawnProbe.calledAt ??= performance.now(); return pending; });
    const harness = await startHarness(launcherFreezing('NEVER', control), control);
    const session = harness.session();
    await assignAndWait(harness, session);
    const start = send(harness.port, `${session.path}/context`, session.context, 'context', 1);
    for (let waited = 0; spawnProbe.calledAt === null && waited < 10_000; waited += 20) await sleep(20);
    expect(spawnProbe.calledAt).not.toBeNull();
    const launchBeganAt = spawnProbe.calledAt ?? start.sentAt;
    await sleep(Math.max(0, launchBeganAt + 1_000 - performance.now()));
    const stop: Exchange = send(harness.port, `${session.path}/stop`, { ...identity(session.context), reason: 'CANCELLED' }, 'stop', 1);
    expect(await answeredWithin(stop, 30_000)).toBe(true);
    expect(await answeredWithin(start, 30_000)).toBe(true);
    const slot = await slotProbe(harness);
    const stopRepliedAfterLaunchMs = rounded((stop.repliedAt ?? NaN) - launchBeganAt);
    results.set('F4', { path: 'iv-a: stop 1 s into a launch that never spawns', chromeSpawned: control.pids.size > 0, stop: outcomeOf(stop), start: outcomeOf(start), stopRepliedAfterLaunchEnteredMs: stopRepliedAfterLaunchMs, slotHeldAfterReply: slot });
    expect(control.pids.size).toBe(0);
    expect(stop.status).toBe(200);
    // Ruled unchanged: the backstop (deadline + 3 s) plus the teardown, never earlier than the backstop and never as long as 30 s.
    expect(stopRepliedAfterLaunchMs ?? 0).toBeGreaterThanOrEqual(GUIDED_START_BUDGET_MS + GUIDED_START_RESERVE_MS - 500);
    expect(stopRepliedAfterLaunchMs ?? Infinity).toBeLessThanOrEqual(16_500);
    expect(start.status).toBe(409);
    expect(slot.held).toBe(false);
  }, 120_000);
});

describe('KL-015-D5 H: a healthy recorded close finishes far inside the grace', () => {
  let fixture: Awaited<ReturnType<typeof startSecretLoginFixture>>;
  beforeAll(async () => { fixture = await startSecretLoginFixture('d5-bound-healthy-canary'); });
  afterAll(async () => { await fixture.close(); });

  it('H five recorded closes, unfrozen, one navigation each: orderly, a webm header, scratch gone, and the slowest is recorded', async () => {
    const durations: number[] = [];
    const orderly: boolean[] = [];
    for (let iteration = 0; iteration < 5; iteration++) {
      const dir = trackScratch(await mkdtemp(join(tmpdir(), 'guided-d5-healthy-')));
      const guided = await launchGuidedBrowser({ sessionId: `healthy-${String(iteration)}`, scopeHash: 'a'.repeat(64), approvedOrigins: [fixture.origin], rules: [], knownSecrets: [] }, `healthy-context-${String(iteration)}`, () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined });
      await guided.navigateBlank(`${fixture.origin}/login`);
      await sleep(500);
      const began = performance.now();
      await guided.close();
      durations.push(Math.round(performance.now() - began));
      orderly.push(guided.orderlyClosed());
      const video = await guided.recordedVideo?.();
      if (!video) throw new Error('H: no recording');
      const bytes = await readFile(video);
      expect(bytes.length).toBeGreaterThanOrEqual(MIN_PLAYABLE_RECORDING_BYTES);
      expect(WEBM_MAGIC.every((byte, index) => bytes[index] === byte)).toBe(true);
      expect(guided.scratchDirectory !== undefined && existsSync(guided.scratchDirectory)).toBe(false);
      await rm(dir, { recursive: true, force: true });
    }
    const max = Math.max(...durations);
    results.set('H', { iterations: durations.length, closeMs: durations, maxMs: max, orderly, thresholdsMs: { graceMs: GUIDED_CLOSE_GRACE_MS, architectReturnAbove: HEALTHY_RETURN_MS } });
    expect(orderly).toEqual([true, true, true, true, true]);
    // The ruling (2.2 guard): over 1 500 ms on this host sends the lane back to @architect; at 3 000 ms a good recording would be cut.
    expect(max).toBeLessThan(GUIDED_CLOSE_GRACE_MS);
    expect(max).toBeLessThanOrEqual(HEALTHY_RETURN_MS);
  }, 120_000);
});

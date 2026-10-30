import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * STUDIO-OBS-015 REL-001/D4 — a guided start that cannot finish is cut off and leaves nothing behind.
 *
 * Real Chromium, the only tier that can prove the kill. The launch is made to hang deterministically:
 * a watcher polls the process table every 10 ms and sends SIGSTOP to the browser's group the moment
 * the launch's own Chrome appears, so Chrome can neither answer the DevTools pipe nor exit by itself
 * (a browser that tidied itself up would make any kill look correct). The launcher is then driven to
 * its deadline, or aborted, and we assert on pids, not on calls:
 *
 * - it rejects `GuidedLaunchFailure`, cause `TIMEOUT` (`CANCELLED` on an abort), inside deadline + 3 s;
 * - after `close()` every pid snapshotted while the browser was stopped is gone (SIGKILL works on a
 *   stopped process, a graceful close does not);
 * - the per-launch scratch directory is gone; the recording directory is the caller's, so a teardown leaves
 *   its files alone, and kills the encoder that writes into it (a second case freezes Chrome only after the
 *   webm exists, so that claim is about a real file and a real encoder, not about an empty directory);
 * - a Chrome that does not exist yet when the teardown starts, and appears after its first listing, is still
 *   found and killed before the slot is released (a third case, with the launch held pending).
 *
 * The watcher signals only direct children of this test process whose command line names the
 * launcher's own `checks-guided-` scratch directory.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Stand-in "Chrome" for the late-spawn case: a fixed `node -e` helper whose only input is a path this test built.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Launch-promise fault oracle: the launch is held pending while a stand-in Chrome appears late.
import { chromium } from 'playwright';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GuidedLaunchFailure } from '../../src/run/guidedBrowser.js';
import { descendantsOf, isAlive, readProcessTableWithArgs } from '../../src/run/tree.js';
import type { ObservationConfig } from '../../src/run/observationTypes.js';

const config: ObservationConfig = { sessionId: 'd4', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: [] };
const DEADLINE_MS = 3_000;
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const fn of cleanup.splice(0)) await fn().catch(() => undefined); });
const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

interface Watcher { readonly pids: Set<number>; readonly encoders: Set<number>; readonly scratch: Set<string>; readonly atFreeze: readonly string[]; readonly stop: () => void; readonly frozen: () => boolean }

/**
 * Freezes the launch's own Chrome as soon as it exists and remembers every pid and the scratch dir it names.
 * With `afterVideoIn`, the freeze waits until the recording directory holds a webm, so the hang happens with a
 * video file on disk and its encoder running; `encoders` then holds the pids whose command line names that directory.
 */
function freezeOwnBrowser(afterVideoIn?: string): Watcher {
  const pids = new Set<number>(), encoders = new Set<number>(), scratch = new Set<string>();
  let frozen = false, atFreeze: readonly string[] = [];
  const timer = setInterval(() => {
    const table = readProcessTableWithArgs();
    if (afterVideoIn !== undefined) {
      for (const row of table) {
        if (row.ppid !== process.pid || !row.args.includes(afterVideoIn)) continue;
        for (const pid of [row.pid, ...descendantsOf(row.pid, table)]) { encoders.add(pid); pids.add(pid); }
      }
    }
    for (const row of table) {
      if (row.ppid !== process.pid) continue;
      const own = /--user-data-dir=(\S*\/checks-guided-[A-Za-z0-9]+)\//u.exec(row.args);
      if (own?.[1] === undefined) continue;
      scratch.add(own[1]);
      for (const pid of [row.pid, ...descendantsOf(row.pid, table)]) pids.add(pid);
      if (!frozen && afterVideoIn !== undefined) {
        const files = readdirSync(afterVideoIn).filter((name) => name.endsWith('.webm'));
        if (files.length === 0) continue;
        atFreeze = files;
      }
      if (!frozen) {
        frozen = true;
        // The browser leads its own group (Playwright starts it detached); stop the group and the process.
        try { process.kill(-row.pid, 'SIGSTOP'); } catch { /* not a group leader */ }
        try { process.kill(row.pid, 'SIGSTOP'); } catch { /* already gone */ }
      }
    }
  }, 10);
  // Safety net, not part of the assertions: whatever a broken teardown leaves behind is still a frozen browser we created.
  cleanup.push(() => { clearInterval(timer); for (const pid of pids) { try { process.kill(-pid, 'SIGKILL'); } catch { /* not a leader */ } try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } return Promise.resolve(); });
  return { pids, encoders, scratch, get atFreeze() { return atFreeze; }, stop: () => { clearInterval(timer); }, frozen: () => frozen };
}

async function recordingDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'guided-d4-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'recording');
  await mkdir(dir);
  return dir;
}

describe('REL-001/D4 — a launch hung by a frozen browser is cut off and fully torn down', () => {
  it('rejects at the deadline with TIMEOUT, and after close() no process, scratch or recording file remains', async () => {
    const dir = await recordingDirectory();
    const watcher = freezeOwnBrowser();
    const startedAt = Date.now();
    const failure = await launchGuidedBrowser(config, 'd4-context', () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined }, { deadlineEpochMs: startedAt + DEADLINE_MS, signal: new AbortController().signal }).then(() => null, (error: unknown) => error);
    const took = Date.now() - startedAt;
    watcher.stop();
    // The browser must really have been frozen, or this proves nothing.
    expect(watcher.frozen()).toBe(true);
    expect(failure).toBeInstanceOf(GuidedLaunchFailure);
    expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: 'TIMEOUT' } });
    expect((failure as GuidedLaunchFailure).phase).not.toBeNull();
    expect(took).toBeGreaterThanOrEqual(DEADLINE_MS);
    expect(took).toBeLessThan(DEADLINE_MS + 3_000);
    // close() is the verdict on the teardown: it rejects if anything survived, and is idempotent.
    await (failure as GuidedLaunchFailure).close();
    await (failure as GuidedLaunchFailure).close();
    expect(watcher.pids.size).toBeGreaterThan(0);
    expect([...watcher.pids].filter((pid) => isAlive(pid))).toEqual([]);
    expect(watcher.scratch.size).toBe(1);
    for (const directory of watcher.scratch) await expect(lstat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    // Chrome was frozen at spawn, before any recording started: nothing may have been written either. (The next case freezes later.)
    expect(await readdir(dir)).toEqual([]);
  });

  it.each([
    { title: 'a bare abort', reason: undefined, cause: 'CANCELLED' },
    { title: 'a CANCELLED reason (a stop)', reason: new Error('CANCELLED'), cause: 'CANCELLED' },
    { title: 'a TIMEOUT reason (the runtime\'s budget timer won)', reason: new Error('TIMEOUT'), cause: 'TIMEOUT' },
  ])('rejects at once when the signal aborts during the launch ($title), naming $cause, with the same teardown', async ({ reason, cause }) => {
    const dir = await recordingDirectory();
    const abort = new AbortController();
    const watcher = freezeOwnBrowser();
    const startedAt = Date.now();
    const launching = launchGuidedBrowser(config, 'd4-abort', () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined }, { deadlineEpochMs: startedAt + 60_000, signal: abort.signal }).then(() => null, (error: unknown) => error);
    for (let waited = 0; !watcher.frozen() && waited < 10_000; waited += 20) await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(watcher.frozen()).toBe(true);
    if (reason === undefined) abort.abort(); else abort.abort(reason);
    const failure = await launching;
    watcher.stop();
    expect(failure).toBeInstanceOf(GuidedLaunchFailure);
    expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: cause } });
    expect(Date.now() - startedAt).toBeLessThan(10_000 + 3_000);
    await (failure as GuidedLaunchFailure).close();
    expect(watcher.pids.size).toBeGreaterThan(0);
    expect([...watcher.pids].filter((pid) => isAlive(pid))).toEqual([]);
    for (const directory of watcher.scratch) await expect(lstat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(dir)).toEqual([]);
  });

  it('with a recording on disk: kills the encoder as well, and leaves the recorder\'s files exactly as they were', async () => {
    const dir = await recordingDirectory();
    const watcher = freezeOwnBrowser(dir);
    const startedAt = Date.now();
    const failure = await launchGuidedBrowser(config, 'd4-video', () => undefined, { dir, size: { width: 640, height: 360 }, ready: () => undefined }, { deadlineEpochMs: startedAt + DEADLINE_MS, signal: new AbortController().signal }).then(() => null, (error: unknown) => error);
    watcher.stop();
    // The hang is real only if Chrome was frozen after a webm existed; otherwise this proves nothing about a recording.
    expect(watcher.frozen()).toBe(true);
    expect(watcher.atFreeze.length).toBeGreaterThan(0);
    expect(failure).toBeInstanceOf(GuidedLaunchFailure);
    expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: 'TIMEOUT' } });
    await (failure as GuidedLaunchFailure).close();
    expect(watcher.encoders.size).toBeGreaterThan(0);
    expect([...watcher.pids].filter((pid) => isAlive(pid))).toEqual([]);
    for (const directory of watcher.scratch) await expect(lstat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    // The file that existed at the freeze is still there (the recorder owns it and settles it), and with the encoder dead nothing grows or appears.
    const after = await readdir(dir);
    for (const name of watcher.atFreeze) expect(after).toContain(name);
    const sizes = async (): Promise<string> => JSON.stringify(await Promise.all((await readdir(dir)).sort().map(async (name) => [name, (await stat(join(dir, name))).size])));
    const settled = await sizes();
    await sleep(400);
    expect(await sizes()).toBe(settled);
  });

  it('kills a Chrome that spawns after the teardown\'s first listing, and holds the close open until the launch has settled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guided-d4-late-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    vi.stubEnv('TMPDIR', root);
    let failLaunch: (error: Error) => void = () => undefined;
    const pending = new Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>>((_resolve, reject) => { failLaunch = reject; });
    vi.spyOn(chromium, 'launchPersistentContext').mockReturnValue(pending);
    const failure = await launchGuidedBrowser(config, 'd4-late', () => undefined, undefined, { deadlineEpochMs: Date.now() + 1_000, signal: new AbortController().signal }).then(() => null, (error: unknown) => error);
    const teardownStartedAt = Date.now();
    expect(failure).toBeInstanceOf(GuidedLaunchFailure);
    expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: 'TIMEOUT' }, phase: 'PROCESS' });
    // The scratch directory is the launch\'s own; a stand-in "Chrome" will name it exactly as Chrome names its profile.
    const scratch = (await readdir(root)).filter((name) => name.startsWith('checks-guided-')).map((name) => join(root, name));
    expect(scratch).toHaveLength(1);
    let decoyPid: number | undefined, decoyAt = 0;
    // Later than the first listing and later than the one second the teardown waits when it has already killed something.
    setTimeout(() => {
      const decoy = spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 60000)', '--', `--user-data-dir=${scratch[0] ?? ''}/browser-profile`], { stdio: 'ignore' });
      decoyPid = decoy.pid; decoyAt = Date.now();
      cleanup.push(() => { decoy.kill('SIGKILL'); return Promise.resolve(); });
    }, 1_500);
    setTimeout(() => { failLaunch(new Error('Target page, context or browser has been closed')); }, 1_800);
    await (failure as GuidedLaunchFailure).close();
    const closedAt = Date.now();
    // The close waited for the launch (not for a fixed second), saw the late process, and killed it before it released anything.
    expect(decoyPid).toBeDefined();
    expect(decoyAt).toBeGreaterThan(teardownStartedAt + 1_000);
    expect(closedAt).toBeGreaterThanOrEqual(decoyAt);
    expect(decoyPid !== undefined && isAlive(decoyPid)).toBe(false);
    expect(await readdir(root)).toEqual([]);
  });

  it('Quinn F5: refuses to confirm the teardown while a process it enumerated is still alive, and leaves the scratch directory in place', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guided-d4-survivor-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    vi.stubEnv('TMPDIR', root);
    let failLaunch: (error: Error) => void = () => undefined;
    const pending = new Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>>((_resolve, reject) => { failLaunch = reject; });
    cleanup.push(() => { failLaunch(new Error('test over')); return Promise.resolve(); });
    vi.spyOn(chromium, 'launchPersistentContext').mockReturnValue(pending);
    const launching = launchGuidedBrowser(config, 'd4-survivor', () => undefined, undefined, { deadlineEpochMs: Date.now() + 1_000, signal: new AbortController().signal }).then(() => null, (error: unknown) => error);
    // The stand-in Chrome exists before the deadline and names the launch\'s scratch directory.
    let scratch: string | undefined;
    for (let waited = 0; scratch === undefined && waited < 5_000; waited += 20) { scratch = (await readdir(root)).find((name) => name.startsWith('checks-guided-')); await sleep(20); }
    expect(scratch).toBeDefined();
    const decoy = spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 60000)', '--', `--user-data-dir=${join(root, scratch ?? '')}/browser-profile`], { stdio: 'ignore' });
    cleanup.push(() => { decoy.kill('SIGKILL'); return Promise.resolve(); });
    const decoyPid = decoy.pid;
    expect(decoyPid).toBeDefined();
    // A process that will not die: every kill aimed at it is swallowed (signal 0, the liveness probe, still reaches it).
    const realKill = process.kill.bind(process);
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => (Math.abs(pid) === decoyPid && signal !== 0 ? true : realKill(pid, signal)));
    const failure = await launching;
    expect(failure).toBeInstanceOf(GuidedLaunchFailure);
    await expect((failure as GuidedLaunchFailure).close()).rejects.toThrow('CONTEXT_LOST');
    // Fail closed: nothing was removed from under a process that may still be using it.
    expect(decoyPid !== undefined && isAlive(decoyPid)).toBe(true);
    await expect(lstat(join(root, scratch ?? ''))).resolves.toBeDefined();
    // The verdict is final for this failure: asking again does not retry.
    await expect((failure as GuidedLaunchFailure).close()).rejects.toThrow('CONTEXT_LOST');
    vi.restoreAllMocks();
    decoy.kill('SIGKILL');
  });
});

// Controlled timer/wall disagreement for pending009; not a reproduction of a historical native failure.
describe('controlled startup timeout-origin handoff for 009', () => {
  it('hands an absolute startup timeout to the caller before pending teardown when the wall sample is still before its deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guided-d4-timeout-origin-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    let rejectLaunch: (error: Error) => void = () => undefined;
    let launching: Promise<unknown> | undefined;
    let fakeTimersInstalled = false;
    try {
      vi.stubEnv('TMPDIR', root);
      const heldWallNow = Date.now();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fakeTimersInstalled = true;
      vi.spyOn(Date, 'now').mockReturnValue(heldWallNow);
      let entered: () => void = () => undefined;
      const launchEntered = new Promise<void>(resolve => { entered = resolve; });
      const pending = new Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>>(
        (_resolve, reject) => { rejectLaunch = reject; },
      );
      // Consume a setup-path rejection too, while passing the exact pending promise to the original launcher.
      void pending.catch(() => undefined);
      vi.spyOn(chromium, 'launchPersistentContext').mockImplementation(() => { entered(); return pending; });
      let replied = false;
      launching = launchGuidedBrowser(config, 'd4-timeout-origin', () => undefined, undefined, {
        deadlineEpochMs: heldWallNow + 1_000,
        signal: new AbortController().signal,
      }).then(value => { replied = true; return value; }, (error: unknown) => { replied = true; return error; });
      await Promise.race([
        launchEntered,
        launching.then(() => { throw new Error('controlled launch did not enter its mock'); }),
      ]);
      await vi.advanceTimersByTimeAsync(1_000);
      await new Promise<void>(resolve => { setImmediate(resolve); });
      // The required old-product assertion-red is false: old catch awaits the deliberately pending teardown.
      expect(replied).toBe(true);
      const failure = await launching;
      expect(failure).toBeInstanceOf(GuidedLaunchFailure);
      expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: 'TIMEOUT' }, phase: 'PROCESS' });
      expect((await readdir(root)).filter(name => name.startsWith('checks-guided-'))).toHaveLength(1);
      let closed = false;
      const closing = (failure as GuidedLaunchFailure).close().then(() => { closed = true; });
      await new Promise<void>(resolve => { setImmediate(resolve); });
      expect(closed).toBe(false);
      rejectLaunch(new Error('controlled launch settled'));
      await closing;
      await (failure as GuidedLaunchFailure).close();
      expect(await readdir(root)).toEqual([]);
    } finally {
      // Also runs on the intentional red: settle the same launch and memoized close before restoring globals.
      rejectLaunch(new Error('controlled regression cleanup'));
      try {
        if (launching !== undefined) {
          const result = await launching;
          if (result instanceof GuidedLaunchFailure) await result.close();
        }
        expect(await readdir(root)).toEqual([]);
        if (fakeTimersInstalled) expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    }
  });

  it('keeps an earlier operation-cap TIMEOUT on the ordinary cleanup-before-response path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'guided-d4-operation-cap-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    let rejectLaunch: (error: Error) => void = () => undefined;
    let launching: Promise<unknown> | undefined;
    let fakeTimersInstalled = false;
    try {
      vi.stubEnv('TMPDIR', root);
      const heldWallNow = Date.now();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fakeTimersInstalled = true;
      vi.spyOn(Date, 'now').mockReturnValue(heldWallNow);
      let entered: () => void = () => undefined;
      const launchEntered = new Promise<void>(resolve => { entered = resolve; });
      const pending = new Promise<Awaited<ReturnType<typeof chromium.launchPersistentContext>>>(
        (_resolve, reject) => { rejectLaunch = reject; },
      );
      void pending.catch(() => undefined);
      vi.spyOn(chromium, 'launchPersistentContext').mockImplementation(() => { entered(); return pending; });
      let replied = false;
      launching = launchGuidedBrowser(config, 'd4-operation-cap', () => undefined, undefined, {
        deadlineEpochMs: heldWallNow + 60_000,
        signal: new AbortController().signal,
      }).then(value => { replied = true; return value; }, (error: unknown) => { replied = true; return error; });
      await Promise.race([
        launchEntered,
        launching.then(() => { throw new Error('controlled launch did not enter its mock'); }),
      ]);
      await vi.advanceTimersByTimeAsync(30_000);
      await new Promise<void>(resolve => { setImmediate(resolve); });
      // A blanket TIMEOUT exemption, or marking every timer, would incorrectly reply here.
      expect(replied).toBe(false);
      rejectLaunch(new Error('controlled capped launch settled'));
      const failure = await launching;
      expect(failure).toBeInstanceOf(GuidedLaunchFailure);
      expect(failure).toMatchObject({ message: 'CONTEXT_LOST', cause: { message: 'TIMEOUT' }, phase: 'PROCESS' });
      expect(await readdir(root)).toEqual([]);
      await (failure as GuidedLaunchFailure).close();
      await (failure as GuidedLaunchFailure).close();
    } finally {
      rejectLaunch(new Error('controlled cap cleanup'));
      try {
        if (launching !== undefined) {
          const result = await launching;
          if (result instanceof GuidedLaunchFailure) await result.close();
        }
        expect(await readdir(root)).toEqual([]);
        if (fakeTimersInstalled) expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    }
  });
});

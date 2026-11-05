/**
 * STUDIO-OBS-012A — the observed-run tree tracker samples without blocking and without stacking.
 *
 * Root cause of the intermittent `observed-secret-control > lost-control-body` overrun: the
 * tracker ran the **synchronous** `ps` reader every 25 ms, holding the event loop 14–16 ms per
 * call, so the secret-bearing control stop fired up to ~50 ms late against a 2000 ms bound with a
 * 1–18 ms margin. These tests pin the repaired mechanism at the seam:
 *
 * - tracking and quiescence use only the asynchronous reader — the blocking one is never called;
 * - a tick that finds a sample in flight is skipped, so samples never overlap;
 * - quiescence awaits an in-flight sample (it may hold the only reading of a descendant that has
 *   since been orphaned), kills every retained descendant, and stays inside its cleanup window
 *   even when that sample never answers.
 *
 * `node:child_process` (`fork`) and the process-table readers are mocked, so nothing here forks.
 * `observedWriterQuiescence.test.ts` proves the same retention against a real detached writer.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { describePosixOnly } from '../helpers/platform.js';

import { createForkSpawner } from '../../src/run/launcher.js';
import type { ProcessRow } from '../../src/run/tree.js';

const LEADER = 4242;
const mocks = vi.hoisted(() => ({
  readProcessTable: vi.fn(() => {
    throw new Error('the blocking reader must not run on the tracking or quiescence path');
  }),
  readProcessTableAsync: vi.fn<(timeoutMs?: number) => Promise<readonly ProcessRow[]>>(),
  isAlive: vi.fn<(pid: number) => boolean>(),
  signalProcessTree: vi.fn<(pid: number) => { signalled: number[] }>(),
}));
vi.mock('../../src/run/tree.js', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));
// `execFile`: the host module (`src/run/host/win32Files.ts`) binds it at load on every platform; it is never called.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  fork: vi.fn(() => ({ pid: LEADER, connected: false, exitCode: null, signalCode: null, on: vi.fn(), stdout: null, stderr: null })),
}));

function spawnHandle() {
  const handle = createForkSpawner().spawn({ modulePath: '/nowhere/child.js', args: [], env: {} });
  if (!handle.trackTree || !handle.quiesce) throw new Error('TREE_CAPABILITY');
  return handle as typeof handle & { trackTree(): void; quiesce(remainingMs: number): Promise<boolean> };
}

function deferred(): { promise: Promise<readonly ProcessRow[]>; resolve(table: readonly ProcessRow[]): void } {
  let resolve: (table: readonly ProcessRow[]) => void = () => undefined;
  const promise = new Promise<readonly ProcessRow[]>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.readProcessTable.mockImplementation(() => {
    throw new Error('the blocking reader must not run on the tracking or quiescence path');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const POSIX_ONLY = 'drives the posix host interval sampler of the tree; win32 takes one snapshot after ready instead';
describePosixOnly(POSIX_ONLY, 'tracking samples the process table without blocking the event loop', () => {
  it('skips ticks while a sample is in flight, resumes after it lands, and never reads synchronously', async () => {
    vi.useFakeTimers();
    const first = deferred();
    mocks.readProcessTableAsync.mockReturnValueOnce(first.promise).mockResolvedValue([]);
    const handle = spawnHandle();
    handle.trackTree();
    handle.trackTree(); // idempotent: still one tracker
    expect(mocks.readProcessTableAsync).toHaveBeenCalledTimes(1);
    expect(mocks.readProcessTableAsync).toHaveBeenLastCalledWith(100);
    // Four 25 ms ticks while `ps` is still running: none of them starts a second reader.
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.readProcessTableAsync).toHaveBeenCalledTimes(1);
    first.resolve([{ pid: 5000, ppid: LEADER }]);
    await flush();
    await vi.advanceTimersByTimeAsync(25);
    expect(mocks.readProcessTableAsync).toHaveBeenCalledTimes(2);
    expect(mocks.readProcessTable).not.toHaveBeenCalled();
    mocks.isAlive.mockReturnValue(false);
    await handle.quiesce(10);
    // After quiescence the interval is gone: no further samples.
    const calls = mocks.readProcessTableAsync.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.readProcessTableAsync).toHaveBeenCalledTimes(calls);
  });
});

describePosixOnly(POSIX_ONLY, 'quiescence keeps every tree guarantee on the asynchronous reader', () => {
  it('awaits the in-flight sample, then kills every descendant it retained even after re-parenting', async () => {
    const inFlight = deferred();
    // Later readings: the leader is gone and its descendants are re-parented to init, so only the
    // in-flight sample can still connect them to this run.
    const orphaned: readonly ProcessRow[] = [
      { pid: process.pid, ppid: 1 },
      { pid: 5001, ppid: 1 },
      { pid: 5002, ppid: 5001 },
    ];
    mocks.readProcessTableAsync.mockReturnValueOnce(inFlight.promise).mockResolvedValue(orphaned);
    const alive = new Set([5001, 5002]);
    mocks.isAlive.mockImplementation((pid) => alive.has(pid));
    mocks.signalProcessTree.mockImplementation((pid) => {
      alive.delete(pid);
      for (const row of orphaned) if (row.ppid === pid) alive.delete(row.pid);
      return { signalled: [pid] };
    });
    const handle = spawnHandle();
    handle.trackTree();
    const quiesced = handle.quiesce(1000);
    await flush();
    // Still waiting for the in-flight sample; nothing signalled from a partial picture.
    expect(mocks.signalProcessTree).not.toHaveBeenCalled();
    inFlight.resolve([
      { pid: 5001, ppid: LEADER },
      { pid: 5002, ppid: 5001 },
    ]);
    await expect(quiesced).resolves.toBe(true);
    expect(mocks.signalProcessTree.mock.calls.map(([pid]) => pid)).toEqual([5001]);
    expect(mocks.signalProcessTree).toHaveBeenCalledWith(5001, 'SIGKILL', undefined, orphaned);
    expect(alive.size).toBe(0);
    expect(mocks.readProcessTable).not.toHaveBeenCalled();
  });

  it('stays inside its cleanup window when the in-flight sample never answers', async () => {
    mocks.readProcessTableAsync.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValue([]);
    mocks.isAlive.mockReturnValue(false);
    const handle = spawnHandle();
    handle.trackTree();
    const started = Date.now();
    // An empty table cannot contain this process, so enumeration is reported as unproven.
    await expect(handle.quiesce(40)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    // Readings after the window has run out are clamped to the 1 ms floor, never unbounded.
    for (const [timeout] of mocks.readProcessTableAsync.mock.calls.slice(1)) {
      expect(timeout).toBeGreaterThanOrEqual(1);
      expect(timeout).toBeLessThanOrEqual(100);
    }
  });

  it('reports a live descendant that outlasts the window as not quiescent', async () => {
    mocks.readProcessTableAsync.mockResolvedValue([
      { pid: process.pid, ppid: 1 },
      { pid: 5003, ppid: LEADER },
    ]);
    mocks.isAlive.mockImplementation((pid) => pid === 5003);
    mocks.signalProcessTree.mockReturnValue({ signalled: [] });
    const handle = spawnHandle();
    handle.trackTree();
    await flush();
    await expect(handle.quiesce(30)).resolves.toBe(false);
    expect(mocks.signalProcessTree).toHaveBeenCalledWith(5003, 'SIGKILL', undefined, expect.any(Array));
  });
});

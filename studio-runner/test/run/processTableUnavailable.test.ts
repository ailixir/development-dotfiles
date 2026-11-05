/**
 * STUDIO-OBS-012A — the process-table reader when `ps` cannot even be spawned.
 *
 * `tree.ts` promises that a missing or failing `ps` yields an empty table rather than a throw,
 * because it runs on the kill/cleanup path; and `canEnumerateProcessTree` exists precisely so that
 * the resulting silence is loud. `tree.test.ts` covers a `ps` that runs and fails (non-zero exit);
 * this file covers the other half — `spawnSync` itself throwing (EAGAIN / ENOMEM / a sandbox that
 * forbids exec) — and what every caller of the empty table then does.
 *
 * `node:child_process` is mocked for this whole file, so nothing here forks.
 */
import { expect, it, vi } from 'vitest';
import { describePosixOnly } from '../helpers/platform.js';

import { canEnumerateLaunchTree, canEnumerateProcessTree, descendantsOf, killLaunchTree, readProcessTable, readProcessTableWithArgs, signalProcessTree } from '../../src/run/tree.js';

const spawnSync = vi.hoisted(() =>
  vi.fn(() => {
    throw Object.assign(new Error('spawnSync ps EAGAIN'), { code: 'EAGAIN' });
  }),
);
// `tree.ts` reads only `spawnSync` here; the module is replaced, never driven. `execFile` is there because the host
// module (`src/run/host/win32Files.ts`) binds it at load on every platform; it is never called.
vi.mock('node:child_process', () => ({ spawnSync, execFile: vi.fn() }));

const POSIX_ONLY = 'node:child_process is mocked and the assertions are the posix host reading `ps`; the win32 CIM reader has its own host tests';
describePosixOnly(POSIX_ONLY, 'a ps that cannot be spawned', () => {
  it('reads as an empty table, never as a throw, and passes the bounded timeout through', () => {
    expect(readProcessTable(7)).toEqual([]);
    expect(spawnSync).toHaveBeenCalledWith('ps', ['-A', '-o', 'pid=,ppid='], expect.objectContaining({ timeout: 7 }));
  });

  it('clamps a non-positive timeout to one millisecond instead of an unbounded wait', () => {
    spawnSync.mockClear();
    readProcessTable(0);
    expect(spawnSync).toHaveBeenCalledWith('ps', expect.any(Array), expect.objectContaining({ timeout: 1 }));
  });

  it('is reported by the capability check as unable to enumerate', () => {
    // The empty table cannot contain this process, so the deploy-time check fails loudly.
    expect(canEnumerateProcessTree()).toBe(false);
  });

  it('REL-001/D4: keeps the guided worker from starting, and makes its launch kill refuse rather than report a clean teardown', async () => {
    expect(readProcessTableWithArgs()).toEqual([]);
    expect(canEnumerateLaunchTree()).toBe(false);
    // Default readers, as the hard teardown calls it: an unreadable table is an error, not "nothing to kill".
    await expect(killLaunchTree(['/var/folders/zz/T/checks-guided-AbC123'])).rejects.toThrow('PROCESS_TABLE_UNREADABLE');
  });

  it('degrades a tree kill to the root and its group, still without throwing', () => {
    const signals: [number, NodeJS.Signals][] = [];
    const outcome = signalProcessTree(4242, 'SIGKILL', (pid, signal) => {
      signals.push([pid, signal]);
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });
    expect(descendantsOf(4242)).toEqual([]);
    expect(outcome.signalled).toEqual([4242]);
    // Group first, then the pid itself — both attempted even though each one threw.
    expect(signals).toEqual([[-4242, 'SIGKILL'], [4242, 'SIGKILL']]);
  });
});

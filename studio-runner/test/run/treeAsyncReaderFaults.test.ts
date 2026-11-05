/**
 * STUDIO-OBS-012A — the asynchronous process-table reader when `ps` fails, hangs or cannot start.
 *
 * Same contract as the synchronous reader (`processTableUnavailable.test.ts`): never rejects,
 * answers an empty table, and always passes a bounded, positive timeout to `ps`. The tracker and
 * the cleanup path await this, so a rejection would become an unhandled one on the kill path.
 *
 * `node:child_process` is mocked for this whole file, so nothing here forks.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { describePosixOnly } from '../helpers/platform.js';

import { readProcessTableAsync } from '../../src/run/tree.js';

type Callback = (error: Error | null, stdout: string) => void;
const execFile = vi.hoisted(() => vi.fn<(file: string, args: string[], options: { timeout: number }, callback: Callback) => void>());
vi.mock('node:child_process', () => ({ execFile, spawnSync: vi.fn() }));

const POSIX_ONLY = 'node:child_process is mocked and the `ps` argv asserted is the posix host; the win32 CIM reader has its own host tests';
describePosixOnly(POSIX_ONLY, 'the asynchronous process-table reader', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('parses ps output and skips lines that are not two integers', async () => {
    execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '  1     0\n 42     1\ngarbage\n\n');
    });
    await expect(readProcessTableAsync(7)).resolves.toEqual([
      { pid: 1, ppid: 0 },
      { pid: 42, ppid: 1 },
    ]);
    expect(execFile).toHaveBeenCalledWith('ps', ['-A', '-o', 'pid=,ppid='], expect.objectContaining({ timeout: 7 }), expect.any(Function));
  });

  it('answers an empty table when ps exits non-zero or is killed at its timeout', async () => {
    execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('ps timed out'), { killed: true, signal: 'SIGTERM' }), '  1     0\n');
    });
    await expect(readProcessTableAsync(1)).resolves.toEqual([]);
  });

  it('answers an empty table when ps cannot even be spawned', async () => {
    execFile.mockImplementation(() => {
      throw Object.assign(new Error('spawn ps EAGAIN'), { code: 'EAGAIN' });
    });
    await expect(readProcessTableAsync()).resolves.toEqual([]);
  });

  it('clamps a non-positive timeout to one millisecond instead of an unbounded wait', async () => {
    execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '');
    });
    await readProcessTableAsync(0);
    expect(execFile).toHaveBeenCalledWith('ps', expect.any(Array), expect.objectContaining({ timeout: 1 }), expect.any(Function));
  });
});

/**
 * The win32 process host (ADR-SC-009). The constants, the environments, the entry check and the tree kill over an injected sender
 * run on every OS; the real CIM table, `taskkill` and the job-object cascade run on Windows only.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { createForkSpawner, isCodeLoadingEnvKey } from '../../../src/run/launcher.js';
import type { ChildProcessHandle } from '../../../src/run/launcher.js';
import { isAlive } from '../../../src/run/tree.js';
import type { ProcessRow } from '../../../src/run/host/types.js';
import { LAUNCH_TABLE_TIMEOUT_MS, POWERSHELL_ARGUMENTS, POWERSHELL_ARGUMENTS_WITH_ARGS, WIN32_INHERITED_ENV_KEYS, win32Process } from '../../../src/run/host/win32Process.js';
import { TABLE_SCRIPT, TABLE_SCRIPT_WITH_ARGS, descendantsByCreation, filetimeFromEpochMs, selectWindowsLaunchRoots } from '../../../src/run/host/win32ProcessModel.js';
import { describePosixOnly, describeWindowsOnly } from '../../helpers/platform.js';

const root = mkdtempSync(join(tmpdir(), 'host-win32-process-'));
// Windows-only tests fork real children; any still alive at the end is killed (Windows pids are only reused once a process is gone).
const spawned: number[] = [];
afterAll(() => {
  for (const pid of spawned) if (isAlive(pid)) killQuietly(pid);
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('the win32 process host constants', () => {
  it('refuses production, forks undetached without a console, samples nothing, drains on SIGINT/SIGBREAK/SIGHUP', () => {
    expect(win32Process.id).toBe('win32');
    expect(win32Process.productionSupported).toBe(false);
    expect(win32Process.fork).toEqual({ detached: false, windowsHide: true });
    expect(win32Process.samplesTree).toBe(false);
    expect(win32Process.sampleIntervalMs).toBe(0);
    expect([...win32Process.drainSignals]).toEqual(['SIGINT', 'SIGBREAK', 'SIGHUP']);
  });

  it('bounds the reads: the startup table at 10 s, the snapshot at 5 s, the guided teardown read inside the 4.5 s close bound', () => {
    expect(win32Process.tableTimeoutMs).toBe(10_000);
    expect(win32Process.sampleTimeoutMs).toBe(5_000);
    expect(LAUNCH_TABLE_TIMEOUT_MS).toBe(2_500);
  });

  it('runs PowerShell non-interactively without a profile, with only the constant encoded scripts', () => {
    const decode = (args: readonly string[]): string => Buffer.from(args[3] ?? '', 'base64').toString('utf16le');
    expect(POWERSHELL_ARGUMENTS.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(POWERSHELL_ARGUMENTS_WITH_ARGS.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(POWERSHELL_ARGUMENTS).toHaveLength(4);
    expect(decode(POWERSHELL_ARGUMENTS)).toBe(TABLE_SCRIPT);
    expect(decode(POWERSHELL_ARGUMENTS_WITH_ARGS)).toBe(TABLE_SCRIPT_WITH_ARGS);
  });

  it('uses the pure model for the tree and the launch selection (creation-time tree, Windows markers)', () => {
    const table = [
      { pid: 1000, ppid: 8, startedAt: 10n, args: 'node w.js' },
      { pid: 1004, ppid: 1000, startedAt: 20n, args: 'chrome.exe --user-data-dir=c:/t/g-1/profile' },
      { pid: 1008, ppid: 1000, startedAt: 5n, args: 'chrome.exe --user-data-dir=C:\\T\\G-1\\profile' },
    ];
    expect(win32Process.descendants(1000, table)).toEqual(descendantsByCreation(1000, table));
    expect(win32Process.descendants(1000, table)).toEqual([1004]);
    expect(win32Process.launchRoots(table, 1000, ['C:\\T\\G-1'])).toEqual(selectWindowsLaunchRoots(table, 1000, ['C:\\T\\G-1']));
    expect(win32Process.launchRoots(table, 1000, ['C:\\T\\G-1'])).toEqual([1004]);
  });
});

describe('the win32 child environments', () => {
  const parent = { Path: 'C:\\Windows\\System32;C:\\node', SYSTEMROOT: 'C:\\Windows', windir: 'C:\\Windows', LANG: '', PLAYWRIGHT_BROWSERS_PATH: 'C:\\pw', NODE_OPTIONS: '--import x', COR_ENABLE_PROFILING: '1', PSModulePath: 'C:\\m', USERPROFILE: 'C:\\Users\\u', TEMP: 'C:\\elsewhere', SECRET: 's' };

  it('inherits only the five allowlisted keys, none of which loads code', () => {
    expect([...WIN32_INHERITED_ENV_KEYS]).toEqual(['PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'SystemRoot', 'windir']);
    expect(win32Process.inheritedEnvKeys).toBe(WIN32_INHERITED_ENV_KEYS);
    expect(WIN32_INHERITED_ENV_KEYS.filter((key) => isCodeLoadingEnvKey(key))).toEqual([]);
  });

  it('gives the child the allowlist, found case-insensitively, plus TEMP = TMP = TMPDIR at the scratch directory', () => {
    const tmp = 'C:\\scratch\\run-1\\tmp';
    expect(win32Process.childEnv(parent, tmp)).toEqual({ PATH: parent.Path, PLAYWRIGHT_BROWSERS_PATH: 'C:\\pw', SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', TEMP: tmp, TMP: tmp, TMPDIR: tmp });
    expect(win32Process.childEnv({}, tmp)).toEqual({ TEMP: tmp, TMP: tmp, TMPDIR: tmp });
    expect(win32Process.childEnv({ PATH: 'exact', Path: 'other' }, tmp).PATH).toBe('exact');
  });

  it('hands Chromium PATH, SystemRoot and windir (Winsock) and the temp keys, nothing else', () => {
    const tmp = 'C:\\scratch\\g';
    expect(win32Process.browserEnv(parent, tmp)).toEqual({ PATH: parent.Path, SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', TEMP: tmp, TMP: tmp, TMPDIR: tmp });
    expect(win32Process.browserEnv({}, tmp)).toEqual({ PATH: '', TEMP: tmp, TMP: tmp, TMPDIR: tmp });
  });
});

describe('the win32 entry check', () => {
  const file = join(root, 'entry.mjs');
  writeFileSync(file, '');
  const other = join(root, 'other.mjs');
  writeFileSync(other, '');

  it('compares canonical paths: the same file, also through a link, is the entry; another file or no argv[1] is not', () => {
    const url = pathToFileURL(file).href;
    expect(win32Process.isEntryPoint(url, file)).toBe(true);
    expect(win32Process.isEntryPoint(url, other)).toBe(false);
    expect(win32Process.isEntryPoint(url, undefined)).toBe(false);
    const link = join(root, 'link.mjs');
    try { symlinkSync(file, link); } catch { return; /* no symlink privilege (Windows without developer mode) */ }
    expect(win32Process.isEntryPoint(url, link)).toBe(true);
  });
});

describe('the win32 tree kill over an injected sender', () => {
  // Odd pids: Windows pids are multiples of 4, so even a Windows run's taskkill can never reach a real process here.
  const t = (n: number): bigint => 5_000_000n + BigInt(n);
  const table: ProcessRow[] = [
    { pid: 1_000_001, ppid: 9, startedAt: t(1) },
    { pid: 1_000_003, ppid: 1_000_001, startedAt: t(2) },
    { pid: 1_000_005, ppid: 1_000_003, startedAt: t(3) },
    // A reused pid's orphan: created before 1_000_001, so not its child.
    { pid: 1_000_007, ppid: 1_000_001, startedAt: t(0) },
  ];

  it('signals each descendant deepest-first, then the root, one pid at a time (no group form), and never throws', () => {
    const sent: [number, NodeJS.Signals][] = [];
    const outcome = win32Process.signalTree(1_000_001, 'SIGKILL', (target, signal) => { sent.push([target, signal]); if (target === 1_000_003) throw new Error('ESRCH'); }, table);
    expect(outcome.signalled).toEqual([1_000_005, 1_000_003, 1_000_001]);
    expect(sent).toEqual([[1_000_005, 'SIGKILL'], [1_000_003, 'SIGKILL'], [1_000_001, 'SIGKILL']]);
    expect(sent.every(([target]) => target > 0)).toBe(true);
  });

  it('signals the root alone over an empty table', () => {
    const sent: number[] = [];
    expect(win32Process.signalTree(1_000_011, 'SIGKILL', (target) => { sent.push(target); }, []).signalled).toEqual([1_000_011]);
    expect(sent).toEqual([1_000_011]);
  });
});

describePosixOnly('a posix machine has no SystemRoot, so the win32 readers have nothing to run', 'the win32 readers off Windows', () => {
  it('answer [] without throwing, synchronously and asynchronously', async () => {
    if (process.env.SystemRoot !== undefined || process.env.windir !== undefined) return;
    expect(win32Process.readTable(1000)).toEqual([]);
    expect(win32Process.readTableWithArgs(1000)).toEqual([]);
    expect(await win32Process.readTableAsync(1000)).toEqual([]);
    expect(await win32Process.readLaunchTable(1000)).toEqual([]);
  });
});

function waitFor(predicate: () => boolean, maxMs: number): Promise<boolean> {
  const end = Date.now() + maxMs;
  return new Promise((done) => {
    const tick = (): void => { if (predicate()) done(true); else if (Date.now() >= end) done(false); else setTimeout(tick, 25); };
    tick();
  });
}

/**
 * Forks, through the production spawner (so with this host's fork options), a Node child that spawns one undetached grandchild,
 * reports its pid and waits. The child's script sits in `marker`, a directory, so the child's command line names it.
 */
function forkTree(marker: string): Promise<{ child: ChildProcessHandle; grandchild: number }> {
  mkdirSync(marker, { recursive: true });
  const modulePath = join(marker, 'tree.cjs');
  writeFileSync(modulePath, [
    "const { spawn } = require('node:child_process');",
    "const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });",
    'process.send({ grandchild: grandchild.pid });',
    'setInterval(() => {}, 1000);',
  ].join('\n'));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const child = createForkSpawner().spawn({ modulePath, args: [], env });
  const { pid } = child;
  if (pid !== null) spawned.push(pid);
  return new Promise((done) => {
    child.onMessage((message) => { done({ child, grandchild: (message as { grandchild: number }).grandchild }); });
  });
}

const killQuietly = (pid: number | null): void => { try { if (pid !== null) process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } };

describeWindowsOnly('the win32 process host on a real Windows machine', () => {
  it('reads the CIM table, plain and with command lines, and finds this process under its parent', () => {
    const plain = win32Process.readTable(win32Process.tableTimeoutMs);
    const self = plain.find((row) => row.pid === process.pid);
    expect(self?.ppid).toBe(process.ppid);
    expect(self?.startedAt).toBeTypeOf('bigint');
    const withArgs = win32Process.readTableWithArgs(win32Process.tableTimeoutMs);
    expect(withArgs.find((row) => row.pid === process.pid)?.args.length).toBeGreaterThan(0);
  }, 30_000);

  it('reads the table without holding the event loop', async () => {
    const order: string[] = [];
    const pending = win32Process.readTableAsync(win32Process.tableTimeoutMs).then((table) => { order.push('table'); return table; });
    setImmediate(() => order.push('immediate'));
    const table = await pending;
    expect(order).toEqual(['immediate', 'table']);
    expect(table.some((row) => row.pid === process.pid)).toBe(true);
  }, 30_000);

  it('reports creation times on the same clock as Date.now(), so the launch filter holds', async () => {
    const before = Date.now();
    const { child, grandchild } = await forkTree(join(root, 'Clock-Marker'));
    const after = Date.now();
    const table = await win32Process.readTableAsync(win32Process.tableTimeoutMs);
    const row = table.find((entry) => entry.pid === child.pid);
    expect(row?.startedAt).toBeGreaterThanOrEqual(filetimeFromEpochMs(before - 1000));
    expect(row?.startedAt).toBeLessThanOrEqual(filetimeFromEpochMs(after + 1000));
    expect(win32Process.descendants(child.pid ?? 0, table)).toContain(grandchild);
    killQuietly(child.pid);
  }, 30_000);

  it('selects a launch by a marker written in another case and with other separators, after the launch began', async () => {
    const marker = join(root, 'Guided-Launch');
    const since = Date.now();
    const { child } = await forkTree(marker);
    const table = await win32Process.readLaunchTable(win32Process.tableTimeoutMs);
    expect(win32Process.launchRoots(table, process.pid, [marker.toLowerCase().replace(/\\/gu, '/')], since)).toEqual([child.pid]);
    expect(win32Process.launchRoots(table, process.pid, [marker], Date.now() + 60_000)).toEqual([]);
    killQuietly(child.pid);
  }, 30_000);

  it('kills a whole tree with taskkill plus a kill per pid', async () => {
    const { child, grandchild } = await forkTree(join(root, 'Kill-Marker'));
    const pid = child.pid ?? 0;
    const table = win32Process.readTable(win32Process.tableTimeoutMs);
    const outcome = win32Process.signalTree(pid, 'SIGKILL', (target, signal) => { process.kill(target, signal); }, table);
    expect(outcome.signalled).toEqual([grandchild, pid]);
    expect(await waitFor(() => !isAlive(pid) && !isAlive(grandchild), 3000)).toBe(true);
  }, 30_000);

  it('cascades through the job object: killing an undetached child ends the grandchild it spawned', async () => {
    const { child, grandchild } = await forkTree(join(root, 'Job-Marker'));
    expect(isAlive(grandchild)).toBe(true);
    killQuietly(child.pid);
    expect(await waitFor(() => !isAlive(grandchild), 3000)).toBe(true);
  }, 30_000);
});


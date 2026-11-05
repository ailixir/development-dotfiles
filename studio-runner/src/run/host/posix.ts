/**
 * The posix host: Linux in production (the pinned image), and macOS for development. Everything here is the code the
 * runner always ran, moved out of `tree.ts`, `launcher.ts`, `browser.ts`, `scratchLayout.ts`, `recordingScratch.ts`,
 * `appVideoOwnership.ts`, `guided/journal.ts` and the entry points without a change in commands, arguments, flags,
 * environment keys, signals, timeouts or error codes. `test/run/host/posix.test.ts` pins those values.
 *
 * The process table is read through `ps`, which is POSIX and present in the pinned image (procps); see `tree.ts` for why
 * the tree is killed by enumeration and why the reader answers `[]` rather than throwing.
 */
import { execFile, spawnSync } from 'node:child_process';
import { closeSync, constants, fsyncSync, openSync, realpathSync } from 'node:fs';
import { mkdir, open, realpath, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FileHost, Host, ParentEnvironment, ProcessHost, ProcessRow, ProcessRowWithArgs, SignalSender, TreeSignalOutcome } from './types.js';

/** The one `ps` invocation both plain readers use: every process, pid and parent pid, no header. */
export const PS_ARGUMENTS = ['-A', '-o', 'pid=,ppid='] as const;
/** {@link PS_ARGUMENTS} plus the full command line, unwrapped (`-ww`), as the last column. */
export const PS_ARGUMENTS_WITH_ARGS = ['-A', '-ww', '-o', 'pid=,ppid=,args='] as const;

function parseProcessTable(stdout: string): readonly ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/u);
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    if (Number.isInteger(pid) && Number.isInteger(ppid)) rows.push({ pid, ppid });
  }
  return rows;
}

function parseProcessTableWithArgs(stdout: string): readonly ProcessRowWithArgs[] {
  const rows: ProcessRowWithArgs[] = [];
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    if (match === null) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] ?? '' });
  }
  return rows;
}

function readTable(timeoutMs: number): readonly ProcessRow[] {
  try {
    const listing = spawnSync('ps', [...PS_ARGUMENTS], {
      encoding: 'utf8',
      // A process listing is bounded; a hang here would be a new way to stall the very path this
      // story exists to keep responsive.
      timeout: Math.max(1,timeoutMs),
    });
    if (listing.status !== 0 || typeof listing.stdout !== 'string') return [];
    return parseProcessTable(listing.stdout);
  } catch {
    return [];
  }
}

function readTableAsync(timeoutMs: number): Promise<readonly ProcessRow[]> {
  return new Promise((resolve) => {
    try {
      execFile('ps', [...PS_ARGUMENTS], { encoding: 'utf8', timeout: Math.max(1,timeoutMs) }, (error, stdout) => {
        resolve(error === null && typeof stdout === 'string' ? parseProcessTable(stdout) : []);
      });
    } catch {
      resolve([]);
    }
  });
}

function readTableWithArgs(timeoutMs: number): readonly ProcessRowWithArgs[] {
  try {
    const listing = spawnSync('ps', [...PS_ARGUMENTS_WITH_ARGS], { encoding: 'utf8', timeout: Math.max(1, timeoutMs), maxBuffer: 64 * 1024 * 1024 });
    if (listing.status !== 0 || typeof listing.stdout !== 'string') return [];
    return parseProcessTableWithArgs(listing.stdout);
  } catch {
    return [];
  }
}

/**
 * Breadth-first over a snapshot of the table, with a visited set, so a re-parented process that
 * happens to form a cycle in a stale reading cannot loop forever.
 */
function descendants(pid: number, table: readonly ProcessRow[]): readonly number[] {
  const children = new Map<number, number[]>();
  for (const row of table) {
    const list = children.get(row.ppid);
    if (list === undefined) children.set(row.ppid, [row.pid]);
    else list.push(row.pid);
  }
  const found: number[] = [];
  const seen = new Set<number>([pid]);
  const queue = [pid];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    for (const child of children.get(next) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * Signals one process **and the group it leads**, if it leads one. Never throws.
 *
 * Both, not one: `-pid` reaches everything that stayed in that process's group — Chromium's
 * renderers do — and `pid` reaches the process itself whether or not it is a group leader. Doing
 * only the first misses a non-leader; doing only the second misses the renderers.
 */
function signalOne(pid: number, signal: NodeJS.Signals, kill: SignalSender): void {
  try {
    kill(-pid, signal);
  } catch {
    // Not a group leader, or the group is already gone.
  }
  try {
    kill(pid, signal);
  } catch {
    // Already gone, or not ours.
  }
}

function signalTree(pid: number, signal: NodeJS.Signals, kill: SignalSender, table: readonly ProcessRow[]): TreeSignalOutcome {
  const found = descendants(pid, table);
  const signalled: number[] = [];
  // Deepest-first: `descendants` is breadth-first, so reversing it puts the leaves first.
  for (const descendant of [...found].reverse()) {
    signalOne(descendant, signal, kill);
    signalled.push(descendant);
  }
  signalOne(pid, signal, kill);
  signalled.push(pid);
  return { signalled };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Whether a command line names `marker` as a path of its own: preceded by the start, whitespace, `=`
 * or a quote, and followed by the end, whitespace, a quote or `/`. So `/tmp/checks-guided-ab` is not
 * found inside `/tmp/checks-guided-abc/profile`, and a longer sibling directory never matches.
 */
export function commandLineNames(args: string, marker: string): boolean {
  return new RegExp(`(?:^|[\\s='"])${escapeRegExp(marker)}(?:$|[\\s'"/])`, 'u').test(args);
}

/** A marker is a launch's own absolute temp path. Anything shorter than two segments could match too much. */
function usableMarker(marker: string): boolean {
  return marker.startsWith('/') && marker.split('/').filter((segment) => segment.length > 0).length >= 2;
}

/** posix ignores `sinceEpochMs`: the table has no creation time, and a direct child of the worker that names the launch's own path is the launch's. */
function launchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[]): readonly number[] {
  const own = markers.filter(usableMarker);
  // A "worker" that is init (or not a real pid) would make every orphan a candidate.
  if (own.length === 0 || !Number.isInteger(parentPid) || parentPid <= 1) return [];
  return table
    .filter((row) => row.ppid === parentPid && row.pid > 1 && row.pid !== parentPid && own.some((marker) => commandLineNames(row.args, marker)))
    .map((row) => row.pid);
}

/** The browser child's allowlist on posix. `launcher.ts` explains every entry and why nothing on it may load code. */
export const POSIX_INHERITED_ENV_KEYS: readonly string[] = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'PLAYWRIGHT_BROWSERS_PATH',
  'DISPLAY',
  'XDG_RUNTIME_DIR',
];

function childEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of POSIX_INHERITED_ENV_KEYS) {
    const value = parent[key];
    if (value !== undefined && value !== '') env[key] = value;
  }
  // Chromium's temporary output follows `TMPDIR` into the per-run scratch directory (AC-22).
  env.TMPDIR = tmpDir;
  return env;
}

function browserEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string> {
  return { PATH: parent.PATH ?? '', HOME: parent.HOME ?? '', TMPDIR: tmpDir };
}

export const posixProcess: ProcessHost = {
  id: 'posix',
  productionSupported: true,
  // The child leads its **own process group**, so one signal reaches Chromium and every process below it (AC-11a).
  fork: Object.freeze({ detached: true }),
  samplesTree: true,
  sampleIntervalMs: 25,
  sampleTimeoutMs: 100,
  tableTimeoutMs: 5000,
  drainSignals: Object.freeze(['SIGTERM', 'SIGINT'] as const),
  inheritedEnvKeys: POSIX_INHERITED_ENV_KEYS,
  readTable,
  readTableAsync,
  readTableWithArgs,
  readLaunchTable: (timeoutMs) => Promise.resolve(readTableWithArgs(timeoutMs)),
  descendants,
  signalTree,
  launchRoots,
  childEnv,
  browserEnv,
  isEntryPoint: (moduleUrl, argv1 = process.argv[1]) => argv1 !== undefined && argv1 === fileURLToPath(moduleUrl),
};

const modeBits = (mode: number | bigint): number => Number(BigInt(mode) & 0o777n);

export const posixFiles: FileHost = {
  id: 'posix',
  flags: Object.freeze({
    directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    noFollow: constants.O_RDONLY | constants.O_NOFOLLOW,
    noFollowNonBlock: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    createExclusive: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
  }),
  fencesOpens: false,
  // Linux supports descriptor-relative traversal through /proc/self/fd; macOS uses checked paths with inode fences.
  descriptorPaths: process.platform === 'linux',
  defaultRoots: Object.freeze({ scratch: '/tmp/studio-runner', objects: '/tmp/studio-runner-objects' }),
  isOwnNode: (stat) => typeof process.getuid === 'function' && stat.uid === (typeof stat.uid === 'bigint' ? BigInt(process.getuid()) : process.getuid()),
  hasMode: (stat, mode) => modeBits(stat.mode) === mode,
  lacksMode: (stat, bits) => (modeBits(stat.mode) & bits) === 0,
  async makePrivateRoot(path) {
    await mkdir(path, { mode: 0o700 }).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
  },
  async syncDirectory(path) {
    const directory = await open(path, 'r'); try { await directory.sync(); } finally { await directory.close(); }
  },
  syncDirectorySync(path) {
    const directory = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(directory); } finally { closeSync(directory); }
  },
  canonical: (path) => realpathSync(path),
  canonicalAsync: (path) => realpath(path),
  isInside: (parent, child) => child.startsWith(`${parent}${sep}`),
  remove: (path) => rm(path, { recursive: true, force: true }),
  isSharingViolation: () => false,
};

export const posixHost: Host = Object.freeze({ process: posixProcess, files: posixFiles });

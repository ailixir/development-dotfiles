/**
 * Killing the tree, and being able to look at it afterwards (AC-11a, AC-20).
 *
 * ## The fork's pid is not the browser's
 *
 * `child.kill()` sends its signal to the pid `fork` returned, and that pid is **Node**. Chromium
 * is below it: `launchPersistentContext` starts a browser process, which starts a zygote, which
 * starts renderers and GPU processes. Playwright's own cleanup runs inside the Node layer, so
 * `SIGKILL` to the Node layer removes the one process that would have tidied up and leaves the
 * browser orphaned — still holding `/dev/shm`, still holding the per-run scratch directory, still
 * holding an unfinished video file open. A test that asserts `kill` was called passes in exactly
 * that state, which is why AC-11a is phrased as *enumerate the pids* rather than *assert the kill*.
 *
 * The mechanism is therefore a **process group**: the child is spawned `detached`, which makes it
 * a group leader (`setsid`), every descendant it starts inherits the group, and one signal to the
 * negated pid reaches all of them. `src/run/launcher.ts` is the only caller.
 *
 * ## Observation, not inspection
 *
 * {@link descendantsOf} and {@link isAlive} exist so the fixtures tier can answer "is the tree
 * gone" by looking for it. They read the process table through `ps`, which is POSIX and present in
 * the pinned image and on the developer machines `ED-05`'s `gate_note` permits this tier to run
 * on. They are observation helpers; nothing on the production path depends on their output.
 *
 * `node:child_process` and `node:process` are confined to `src/run/**` by ADR-001 §6, and this
 * module is inside it. It adds **no** dependency: the closure stays `playwright`,
 * `playwright-core`, `typescript` (AC-20).
 */

import { execFile, spawnSync } from 'node:child_process';

/** One row of the process table, reduced to the two columns a tree needs. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
}

/** The one `ps` invocation both readers use: every process, pid and parent pid, no header. */
const PS_ARGUMENTS = ['-A', '-o', 'pid=,ppid='] as const;

/**
 * The whole process table, or an empty list when it cannot be read.
 *
 * Empty rather than throwing: this is used by cleanup and by assertions, and a cleanup path that
 * throws because a diagnostic tool is missing has made the situation worse. A caller that needs to
 * distinguish "nothing is running" from "nothing could be read" asks {@link isAlive} about a pid it
 * knows.
 */
export function readProcessTable(timeoutMs=5000): readonly ProcessRow[] {
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

/**
 * {@link readProcessTable} without holding the event loop while `ps` runs (STUDIO-OBS-012A).
 *
 * The synchronous reader blocks the caller for the whole of the `ps` call — 14–16 ms on a
 * developer machine with ~600 processes. That is acceptable once, on a cleanup path; it is not
 * acceptable as a *sampler* that runs every 25 ms for the life of an observed run, because every
 * timer in the runner — the secret-bearing control stop that must land within 2 s of revocation
 * among them — then fires late by up to the length of a `ps` call (measured: p90 26 ms, max 50 ms).
 * This variant hands the wait to libuv, so timers and sockets keep being serviced while `ps` runs.
 *
 * Same contract as the synchronous reader: bounded by `timeoutMs` (clamped to at least 1 ms; on
 * expiry `ps` is killed and the answer is empty), and a missing or failing `ps` resolves to an
 * empty table — it never rejects, because its callers are tracking and cleanup paths.
 */
export function readProcessTableAsync(timeoutMs=5000): Promise<readonly ProcessRow[]> {
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

/**
 * Whether the process table can be read well enough to find this process in it (Studio v1 WP16).
 *
 * {@link signalProcessTree} kills a browser tree **by enumeration**, and {@link readProcessTable}
 * answers `[]` rather than throwing when `ps` is missing or fails. So an image without `procps`
 * would not fail anywhere: every kill would quietly become "signal the fork", which is exactly the
 * orphaned-Chromium failure the enumeration exists to prevent — and it would surface only as
 * leaked browsers in production. `ps` is present in the pinned base image today; an image swap
 * (`ED-05`) that dropped it is what this makes loud. Finding the caller's own pid is the check,
 * because an empty or unparsable listing and a listing of some other namespace both fail it.
 *
 * `withArgs` is for a caller that kills by command line ({@link killLaunchTree}): it must also find the
 * caller's own row, with a command line, in the listing that kill reads (`ps -ww ... args=`). A `ps`
 * that accepts the plain form and rejects that one would otherwise pass here and then find nothing.
 */
export function canEnumerateProcessTree(
  table: readonly ProcessRow[] = readProcessTable(),
  self: number = process.pid,
  withArgs?: readonly ProcessRowWithArgs[],
): boolean {
  if (!table.some((row) => row.pid === self)) return false;
  return withArgs === undefined || withArgs.some((row) => row.pid === self && row.args.length > 0);
}

/**
 * Every pid descended from `pid`, transitively, excluding `pid` itself.
 *
 * Breadth-first over a snapshot of the table, with a visited set, so a re-parented process that
 * happens to form a cycle in a stale reading cannot loop forever.
 */
export function descendantsOf(pid: number, table: readonly ProcessRow[] = readProcessTable()): readonly number[] {
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

/** Whether a pid still exists. Signal `0` checks for the process without disturbing it. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists and belongs to somebody else — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** How a tree signal landed. Returned rather than logged so a caller can assert on it. */
export interface TreeSignalOutcome {
  /** Pids signalled, deepest-first, ending with the root. */
  readonly signalled: readonly number[];
}

/**
 * Signals one process **and the group it leads**, if it leads one. Never throws.
 *
 * Both, not one: `-pid` reaches everything that stayed in that process's group — Chromium's
 * renderers do — and `pid` reaches the process itself whether or not it is a group leader. Doing
 * only the first misses a non-leader; doing only the second misses the renderers.
 */
function signalOne(
  pid: number,
  signal: NodeJS.Signals,
  kill: (target: number, signal: NodeJS.Signals) => void,
): void {
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

/**
 * Ends the whole tree below `pid`, and then `pid` — by **enumeration**, not by one group signal.
 *
 * ## Why enumeration, which is the expensive answer
 *
 * The obvious implementation is one signal to the negated pid: spawn the child `detached`, so it
 * leads a process group, and let `kill(-pid)` reach everything below it. That is what this module
 * did first, and the real-browser tier proved it wrong. Observed on the branch, with Playwright
 * 1.63.0:
 *
 * ```text
 * fork pid 16341  pgid 16341        (node dist/run/child.js)
 *   desc 16343    pgid 16343        chrome-headless-shell      ← its own group
 *   desc 16367    pgid 16367        ffmpeg-mac                 ← its own group
 *   desc 16364/5/6 pgid 16343       chrome-headless-shell      (renderers, in Chromium's group)
 * ```
 *
 * **Playwright starts the browser and the video encoder detached**, each in a process group of its
 * own, precisely so that *it* can group-kill them. So `kill(-forkPid)` reaches the Node layer and
 * nothing else: the browser, the encoder and every renderer are in groups the fork does not lead.
 * A single group signal is therefore exactly the "killed the child, orphaned the browser" failure
 * AC-11a names, wearing the clothes of the fix.
 *
 * The tree is therefore walked, and each member is signalled together with the group it leads —
 * which is what collects Chromium's renderers without enumerating them individually.
 *
 * ## Enumerate before signalling, always
 *
 * The walk happens **first**, into a list. Once the root is dead its descendants are re-parented to
 * init, so a walk that started after the signal would return an empty tree over a browser that is
 * still running — the same reason the fixtures tier snapshots pids rather than re-walking.
 *
 * Deepest-first, so a parent cannot notice a child dying and replace it; the root goes last.
 *
 * Never throws: this is the last thing that happens to a hung run, and it runs on the path that
 * also clears scratch and releases the slot.
 */
export function signalProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGKILL',
  kill: (target: number, signal: NodeJS.Signals) => void = (target, sig) => {
    process.kill(target, sig);
  },
  table: readonly ProcessRow[] = readProcessTable(),
): TreeSignalOutcome {
  const descendants = descendantsOf(pid, table);
  const signalled: number[] = [];
  // Deepest-first: `descendantsOf` is breadth-first, so reversing it puts the leaves first.
  for (const descendant of [...descendants].reverse()) {
    signalOne(descendant, signal, kill);
    signalled.push(descendant);
  }
  signalOne(pid, signal, kill);
  signalled.push(pid);
  return { signalled };
}

/**
 * One row of the process table with its command line (STUDIO-OBS-015 REL-001/D4).
 *
 * The command line is read only to decide, in memory, which children belong to one guided launch. It
 * is never logged, returned to a caller outside this module's pure selection, or written anywhere.
 */
export interface ProcessRowWithArgs extends ProcessRow {
  readonly args: string;
}

/** {@link PS_ARGUMENTS} plus the full command line, unwrapped (`-ww`), as the last column. */
const PS_ARGUMENTS_WITH_ARGS = ['-A', '-ww', '-o', 'pid=,ppid=,args='] as const;

function parseProcessTableWithArgs(stdout: string): readonly ProcessRowWithArgs[] {
  const rows: ProcessRowWithArgs[] = [];
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    if (match === null) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3] ?? '' });
  }
  return rows;
}

/** {@link readProcessTable} with command lines. Same contract: bounded, and `[]` when `ps` cannot be read. */
export function readProcessTableWithArgs(timeoutMs = 5000): readonly ProcessRowWithArgs[] {
  try {
    const listing = spawnSync('ps', [...PS_ARGUMENTS_WITH_ARGS], { encoding: 'utf8', timeout: Math.max(1, timeoutMs), maxBuffer: 64 * 1024 * 1024 });
    if (listing.status !== 0 || typeof listing.stdout !== 'string') return [];
    return parseProcessTableWithArgs(listing.stdout);
  } catch {
    return [];
  }
}

/** Injectable readers of {@link canEnumerateLaunchTree}. */
export interface LaunchTreeReaders {
  readonly readTable?: () => readonly ProcessRow[];
  readonly readTableWithArgs?: () => readonly ProcessRowWithArgs[];
}

/**
 * Whether this process can kill one guided launch by command line, which is what the start deadline's
 * teardown does (REL-001/D4). All three must hold, or the worker must not start:
 *
 * - it is not pid 1: {@link selectLaunchRoots} refuses a parent of 1 (every orphan would be a candidate), so a
 *   worker that is its container's init would find nothing to kill, ever, and report a clean teardown;
 * - the plain listing shows it, and the listing the kill reads (`ps -ww ... args=`) shows it with a command line.
 */
export function canEnumerateLaunchTree(self: number = process.pid, readers: LaunchTreeReaders = {}): boolean {
  if (!Number.isInteger(self) || self <= 1) return false;
  const withArgs = (readers.readTableWithArgs ?? readProcessTableWithArgs)();
  return canEnumerateProcessTree((readers.readTable ?? readProcessTable)(), self, withArgs);
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

/**
 * The processes one guided launch started, and only those (REL-001/D4, ruling section 3).
 *
 * Pure. A row is chosen only if it is a **direct child of `parentPid`** (the worker) **and** its
 * command line names one of this launch's own `markers`: the per-launch scratch directory that holds
 * Chromium's `--user-data-dir`, and the recording directory the video encoder writes into. Another
 * session's browser has other paths; a process that merely appeared since the launch began is not
 * chosen, which would break the moment capacity is above 1. The worker itself, pid 1 and anything
 * below it are never chosen, so no marker, however odd, can reach an unrelated process.
 */
export function selectLaunchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[]): readonly number[] {
  const own = markers.filter(usableMarker);
  // A "worker" that is init (or not a real pid) would make every orphan a candidate.
  if (own.length === 0 || !Number.isInteger(parentPid) || parentPid <= 1) return [];
  return table
    .filter((row) => row.ppid === parentPid && row.pid > 1 && row.pid !== parentPid && own.some((marker) => commandLineNames(row.args, marker)))
    .map((row) => row.pid);
}

/** Injectable edges of {@link killLaunchTree}, so the unit tier can drive it without a process. */
export interface LaunchTreeEdges {
  readonly parentPid?: number;
  readonly readTable?: () => readonly ProcessRowWithArgs[];
  readonly kill?: (target: number, signal: NodeJS.Signals) => void;
}

/**
 * SIGKILLs the tree of every process {@link selectLaunchRoots} finds, deepest-first through
 * {@link signalProcessTree}, and returns every pid it enumerated (roots and descendants) so the
 * caller can verify they are gone. No graceful close: the browser is hung, and a graceful close is
 * what hung. Enumerates before it signals, once; a caller that wants to catch a late spawn calls it
 * again.
 *
 * **Throws `PROCESS_TABLE_UNREADABLE`, and signals nothing, when the listing cannot show the worker
 * itself**: `ps` timed out or failed (it reads as `[]`), or the worker is pid 1, which selection refuses.
 * "Nothing found" over a table that could not be read is not "nothing to kill"; the caller must treat the
 * launch as not confirmed gone and keep its slot held. A readable table with no match returns `[]`.
 */
export function killLaunchTree(markers: readonly string[], edges: LaunchTreeEdges = {}): readonly number[] {
  const parentPid = edges.parentPid ?? process.pid;
  const table = (edges.readTable ?? readProcessTableWithArgs)();
  if (!Number.isInteger(parentPid) || parentPid <= 1 || !canEnumerateProcessTree(table, parentPid)) throw new Error('PROCESS_TABLE_UNREADABLE');
  const pids = new Set<number>();
  for (const root of selectLaunchRoots(table, parentPid, markers)) {
    for (const member of [...descendantsOf(root, table), root]) pids.add(member);
    signalProcessTree(root, 'SIGKILL', edges.kill, table);
  }
  return [...pids];
}

/** Injectable edges of {@link survivorsOf}. */
export interface SurvivorEdges {
  readonly alive?: (pid: number) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** The pids still alive after at most `maxMs` of polling every `stepMs`. Empty means every one is gone. */
export async function survivorsOf(pids: readonly number[], maxMs = 500, edges: SurvivorEdges = {}, stepMs = 25): Promise<readonly number[]> {
  const alive = edges.alive ?? isAlive;
  const sleep = edges.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const now = edges.now ?? Date.now;
  const end = now() + maxMs;
  for (;;) {
    const left = pids.filter((pid) => alive(pid));
    if (left.length === 0 || now() >= end) return left;
    await sleep(stepMs);
  }
}

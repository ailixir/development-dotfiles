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
 * ## The host seam
 *
 * The OS-specific edges — the `ps` readers, the group-plus-pid signal, the marker rules — live in
 * `src/run/host/` (ADR-SC-009). This module is the stable surface over them: posix is the code that
 * was here, moved verbatim; win32 keeps the same contracts with its own table and kill.
 *
 * `node:child_process` and `node:process` are confined to `src/run/**` by ADR-001 §6, and this
 * module is inside it. It adds **no** dependency: the closure stays `playwright`,
 * `playwright-core`, `typescript` (AC-20).
 */

import { host } from './host/index.js';
import type { ProcessRow, ProcessRowWithArgs, TreeSignalOutcome } from './host/index.js';

export type { ProcessRow, ProcessRowWithArgs, TreeSignalOutcome } from './host/index.js';
/** The posix marker matcher (`host/posix.ts`), re-exported where it always was. */
export { commandLineNames } from './host/posix.js';

/**
 * The whole process table, or an empty list when it cannot be read.
 *
 * Empty rather than throwing: this is used by cleanup and by assertions, and a cleanup path that
 * throws because a diagnostic tool is missing has made the situation worse. A caller that needs to
 * distinguish "nothing is running" from "nothing could be read" asks {@link isAlive} about a pid it
 * knows. The reader is the host's (`ps -A -o pid=,ppid=` on posix).
 */
export function readProcessTable(timeoutMs=host.process.tableTimeoutMs): readonly ProcessRow[] {
  return host.process.readTable(timeoutMs);
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
export function readProcessTableAsync(timeoutMs=host.process.tableTimeoutMs): Promise<readonly ProcessRow[]> {
  return host.process.readTableAsync(timeoutMs);
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
  return host.process.descendants(pid, table);
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
  // Group plus pid for every member on posix (`host/posix.ts`); the host owns how one member is signalled.
  return host.process.signalTree(pid, signal, kill, table);
}

/**
 * {@link readProcessTable} with command lines (STUDIO-OBS-015 REL-001/D4). Same contract: bounded, and `[]` when `ps`
 * cannot be read. The command line is read only to decide, in memory, which children belong to one guided launch; it is
 * never logged, returned to a caller outside this module's pure selection, or written anywhere (`ps -ww ... args=` on posix).
 */
export function readProcessTableWithArgs(timeoutMs = host.process.tableTimeoutMs): readonly ProcessRowWithArgs[] {
  return host.process.readTableWithArgs(timeoutMs);
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
export function selectLaunchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[], sinceEpochMs?: number): readonly number[] {
  return host.process.launchRoots(table, parentPid, markers, sinceEpochMs);
}

/** Injectable edges of {@link killLaunchTree}, so the unit tier can drive it without a process. */
export interface LaunchTreeEdges {
  readonly parentPid?: number;
  readonly readTable?: () => readonly ProcessRowWithArgs[] | Promise<readonly ProcessRowWithArgs[]>;
  readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  /** When the launch began (epoch ms). A host with creation times (win32) only selects processes created at or after it. */
  readonly since?: number;
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
 *
 * Asynchronous because a host may only snapshot its table asynchronously (win32). On posix the default reader is still the
 * synchronous `ps -ww` read, taken at the call, before the first await.
 */
export async function killLaunchTree(markers: readonly string[], edges: LaunchTreeEdges = {}): Promise<readonly number[]> {
  const parentPid = edges.parentPid ?? process.pid;
  const table = await (edges.readTable ?? (() => host.process.readLaunchTable(host.process.tableTimeoutMs)))();
  if (!Number.isInteger(parentPid) || parentPid <= 1 || !canEnumerateProcessTree(table, parentPid)) throw new Error('PROCESS_TABLE_UNREADABLE');
  const pids = new Set<number>();
  for (const root of selectLaunchRoots(table, parentPid, markers, edges.since)) {
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

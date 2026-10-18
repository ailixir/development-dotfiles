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

import { spawnSync } from 'node:child_process';

/** One row of the process table, reduced to the two columns a tree needs. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
}

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
    const listing = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], {
      encoding: 'utf8',
      // A process listing is bounded; a hang here would be a new way to stall the very path this
      // story exists to keep responsive.
      timeout: Math.max(1,timeoutMs),
    });
    if (listing.status !== 0 || typeof listing.stdout !== 'string') return [];
    const rows: ProcessRow[] = [];
    for (const line of listing.stdout.split('\n')) {
      const parts = line.trim().split(/\s+/u);
      const pid = Number(parts[0]);
      const ppid = Number(parts[1]);
      if (Number.isInteger(pid) && Number.isInteger(ppid)) rows.push({ pid, ppid });
    }
    return rows;
  } catch {
    return [];
  }
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
 */
export function canEnumerateProcessTree(
  table: readonly ProcessRow[] = readProcessTable(),
  self: number = process.pid,
): boolean {
  return table.some((row) => row.pid === self);
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

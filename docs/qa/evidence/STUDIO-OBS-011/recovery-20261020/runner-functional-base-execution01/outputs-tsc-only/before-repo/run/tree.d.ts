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
export declare function readProcessTable(timeoutMs?: number): readonly ProcessRow[];
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
export declare function readProcessTableAsync(timeoutMs?: number): Promise<readonly ProcessRow[]>;
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
export declare function canEnumerateProcessTree(table?: readonly ProcessRow[], self?: number, withArgs?: readonly ProcessRowWithArgs[]): boolean;
/**
 * Every pid descended from `pid`, transitively, excluding `pid` itself.
 *
 * Breadth-first over a snapshot of the table, with a visited set, so a re-parented process that
 * happens to form a cycle in a stale reading cannot loop forever.
 */
export declare function descendantsOf(pid: number, table?: readonly ProcessRow[]): readonly number[];
/** Whether a pid still exists. Signal `0` checks for the process without disturbing it. */
export declare function isAlive(pid: number): boolean;
/** How a tree signal landed. Returned rather than logged so a caller can assert on it. */
export interface TreeSignalOutcome {
    /** Pids signalled, deepest-first, ending with the root. */
    readonly signalled: readonly number[];
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
export declare function signalProcessTree(pid: number, signal?: NodeJS.Signals, kill?: (target: number, signal: NodeJS.Signals) => void, table?: readonly ProcessRow[]): TreeSignalOutcome;
/**
 * One row of the process table with its command line (STUDIO-OBS-015 REL-001/D4).
 *
 * The command line is read only to decide, in memory, which children belong to one guided launch. It
 * is never logged, returned to a caller outside this module's pure selection, or written anywhere.
 */
export interface ProcessRowWithArgs extends ProcessRow {
    readonly args: string;
}
/** {@link readProcessTable} with command lines. Same contract: bounded, and `[]` when `ps` cannot be read. */
export declare function readProcessTableWithArgs(timeoutMs?: number): readonly ProcessRowWithArgs[];
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
export declare function canEnumerateLaunchTree(self?: number, readers?: LaunchTreeReaders): boolean;
/**
 * Whether a command line names `marker` as a path of its own: preceded by the start, whitespace, `=`
 * or a quote, and followed by the end, whitespace, a quote or `/`. So `/tmp/checks-guided-ab` is not
 * found inside `/tmp/checks-guided-abc/profile`, and a longer sibling directory never matches.
 */
export declare function commandLineNames(args: string, marker: string): boolean;
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
export declare function selectLaunchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[]): readonly number[];
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
export declare function killLaunchTree(markers: readonly string[], edges?: LaunchTreeEdges): readonly number[];
/** Injectable edges of {@link survivorsOf}. */
export interface SurvivorEdges {
    readonly alive?: (pid: number) => boolean;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly now?: () => number;
}
/** The pids still alive after at most `maxMs` of polling every `stepMs`. Empty means every one is gone. */
export declare function survivorsOf(pids: readonly number[], maxMs?: number, edges?: SurvivorEdges, stepMs?: number): Promise<readonly number[]>;

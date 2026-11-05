/**
 * The operating-system seam of the runner (ADR-SC-009: posix is the production host, win32 is local development only).
 *
 * Every OS-specific edge of `src/` goes through one {@link Host}: the process table, the tree kill, the fork options, the
 * child environment, the drain signals, the entry check, and the per-node file checks. `posix.ts` is the code the runner
 * always ran, moved; `win32Process.ts` and `win32Files.ts` implement the same members for a developer machine. The callers
 * hold the shared logic and branch only on the constant members below, never on `process.platform`.
 *
 * Lives under `src/run/**` because `node:child_process` is confined there (ADR-001 §6, `RUN_ONLY_MODULES`).
 */

/** One row of the process table, reduced to what a tree needs. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  /** Creation time, where the host reports one (win32: CIM CreationDate as 100 ns FILETIME ticks). Absent on posix. */
  readonly startedAt?: bigint;
}

/** One row with its full command line. Read only to select a launch's own processes in memory; never logged or returned. */
export interface ProcessRowWithArgs extends ProcessRow {
  readonly args: string;
}

/** How a tree signal landed. Returned rather than logged so a caller can assert on it. */
export interface TreeSignalOutcome {
  /** Pids signalled, deepest-first, ending with the root. */
  readonly signalled: readonly number[];
}

/** Sends one signal to one target (posix: a negative target is a process group). Injected so the unit tier signals nothing. */
export type SignalSender = (target: number, signal: NodeJS.Signals) => void;

/** An environment to inherit values from (`process.env` or a test's record). */
export type ParentEnvironment = Readonly<Record<string, string | undefined>>;

export interface ProcessHost {
  /** Which implementation this is. Diagnostic only: callers branch on the members below, never on this. */
  readonly id: 'posix' | 'win32';
  /** Whether a `NODE_ENV=production` start is allowed. posix true; win32 false (ADR-SC-009). */
  readonly productionSupported: boolean;
  /** Options merged into every browser-child `fork`. posix `{ detached: true }` (own process group); win32 `{ detached: false, windowsHide: true }` (job-object cascade). */
  readonly fork: Readonly<{ detached: boolean; windowsHide?: boolean }>;
  /** Whether the launcher samples a child's descendants on an interval. posix true; win32 false (one snapshot after `ready`). */
  readonly samplesTree: boolean;
  /** Cadence of that sampler in ms. posix 25; win32 0 (unused: no sampler). */
  readonly sampleIntervalMs: number;
  /** Bound in ms of one sample (posix) or of the one snapshot after `ready` (win32). */
  readonly sampleTimeoutMs: number;
  /** Default bound in ms of a whole-table read (startup guard, launch teardown). */
  readonly tableTimeoutMs: number;
  /** Signals that start the one drain. posix SIGTERM, SIGINT; win32 SIGINT, SIGBREAK, SIGHUP. */
  readonly drainSignals: readonly NodeJS.Signals[];
  /** Variables a browser child may inherit, by name. Nothing on it may load code (`launcher.ts` re-checks every launch). */
  readonly inheritedEnvKeys: readonly string[];
  /** The whole table, synchronously; `[]` when it cannot be read. Never throws. Bounded by `timeoutMs` (clamped to ≥ 1). */
  readTable(timeoutMs: number): readonly ProcessRow[];
  /** {@link readTable} without holding the event loop. Never rejects; `[]` when unreadable. */
  readTableAsync(timeoutMs: number): Promise<readonly ProcessRow[]>;
  /** {@link readTable} with command lines, synchronously (startup guard). `[]` when unreadable. */
  readTableWithArgs(timeoutMs: number): readonly ProcessRowWithArgs[];
  /** The table a launch teardown reads. posix: the synchronous `ps -ww` read, already taken when this returns; win32: an async snapshot. Never rejects. */
  readLaunchTable(timeoutMs: number): Promise<readonly ProcessRowWithArgs[]>;
  /** Every pid descended from `pid` in `table`, breadth-first, excluding `pid`. win32 also requires creation ≥ the parent's (pid reuse). */
  descendants(pid: number, table: readonly ProcessRow[]): readonly number[];
  /** Ends the tree below `pid` deepest-first, then `pid`, by enumeration over `table`. Never throws. win32 adds `taskkill /T /F`. */
  signalTree(pid: number, signal: NodeJS.Signals, kill: SignalSender, table: readonly ProcessRow[]): TreeSignalOutcome;
  /** Direct children of `parentPid` whose command line names one of `markers` as a path of its own (win32: path rules, case-insensitive, created ≥ `sinceEpochMs`). Pure. */
  launchRoots(table: readonly ProcessRowWithArgs[], parentPid: number, markers: readonly string[], sinceEpochMs?: number): readonly number[];
  /** A browser child's environment: {@link inheritedEnvKeys} from `parent` plus the temp-directory keys pointed at `tmpDir`. */
  childEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string>;
  /** The environment Playwright hands the Chromium it launches inside a child (posix PATH, HOME, TMPDIR; win32 PATH, SystemRoot, windir, TEMP, TMP, TMPDIR). */
  browserEnv(parent: ParentEnvironment, tmpDir: string): Record<string, string>;
  /** Whether the module at `moduleUrl` (`import.meta.url`) is the process entry point named by `argv1` (default `process.argv[1]`). */
  isEntryPoint(moduleUrl: string, argv1?: string): boolean;
}

/** `open` flag sets the file checks use. Each includes the access mode; win32 has no no-follow, directory or non-blocking bit (fenced instead). */
export interface OpenFlags {
  /** Read a directory without following a link. posix O_RDONLY|O_DIRECTORY|O_NOFOLLOW. */
  readonly directory: number;
  /** Read a file without following a link. posix O_RDONLY|O_NOFOLLOW. */
  readonly noFollow: number;
  /** {@link noFollow}, never blocking on a FIFO. posix O_RDONLY|O_NOFOLLOW|O_NONBLOCK. */
  readonly noFollowNonBlock: number;
  /** Create a new file, failing if anything exists there. posix O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW. */
  readonly createExclusive: number;
}

/** The fields of a `Stats` or `BigIntStats` the ownership and mode checks read. */
export interface NodeOwnership {
  readonly uid: number | bigint;
  readonly mode: number | bigint;
}

export interface FileHost {
  /** Which implementation this is. Diagnostic only. */
  readonly id: 'posix' | 'win32';
  /** See {@link OpenFlags}. */
  readonly flags: OpenFlags;
  /** Whether every checked open must be wrapped in an lstat before and a bigint dev/ino fence after (`fence.ts`). posix false; win32 true. */
  readonly fencesOpens: boolean;
  /** Whether a directory descriptor can be traversed as `/proc/self/fd/N` (Linux only). */
  readonly descriptorPaths: boolean;
  /** Where scratch and the filesystem object store live when not configured. posix `/tmp/studio-runner[-objects]`; win32 under `os.tmpdir()`. */
  readonly defaultRoots: Readonly<{ scratch: string; objects: string }>;
  /** Whether the node belongs to this process's user. posix: uid equality; win32: true (the private root's ACL replaces per-node owners). */
  isOwnNode(stat: Pick<NodeOwnership, 'uid'>): boolean;
  /** Whether the permission bits (0o777) are exactly `mode`. win32: true (libuv reports synthetic modes; the root ACL replaces them). */
  hasMode(stat: Pick<NodeOwnership, 'mode'>, mode: number): boolean;
  /** Whether none of `bits` is set in the permission bits. win32: true, as {@link hasMode}. */
  lacksMode(stat: Pick<NodeOwnership, 'mode'>, bits: number): boolean;
  /** Creates `path` as a private directory (an existing one is kept; the caller checks it). posix mkdir 0o700; win32 adds a protected ACL by SID. */
  makePrivateRoot(path: string): Promise<void>;
  /** Persists `path`'s directory entries. posix: open and fsync the directory; win32: no-op (directory fsync is EPERM there). */
  syncDirectory(path: string): Promise<void>;
  /** {@link syncDirectory}, synchronously. */
  syncDirectorySync(path: string): void;
  /** The canonical path, symlinks resolved. posix `realpathSync`; win32 `realpathSync.native` (8.3 names and drive case normalised). */
  canonical(path: string): string;
  /** {@link canonical}, asynchronously. */
  canonicalAsync(path: string): Promise<string>;
  /** Whether resolved `child` is strictly inside resolved `parent`. win32: `relative()`-based and case-insensitive. */
  isInside(parent: string, child: string): boolean;
  /** Removes a file or tree; a missing one is fine. win32 retries sharing violations. */
  remove(path: string): Promise<void>;
  /** Whether an error is a sharing violation from a handle another process holds (win32 EBUSY/EPERM). posix: always false. */
  isSharingViolation(error: unknown): boolean;
}

/** The one host the runner runs on, chosen once in `index.ts`. */
export interface Host {
  readonly process: ProcessHost;
  readonly files: FileHost;
}

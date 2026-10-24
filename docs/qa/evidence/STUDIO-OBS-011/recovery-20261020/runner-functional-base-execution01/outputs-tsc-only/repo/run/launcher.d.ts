import type { BrowserLauncher } from '../server/adapters.js';
import type { OutputStream } from './outputRelay.js';
import type { ParentMessage } from './protocol.js';
/** A spawned child, reduced to what the launcher needs. Injected so the unit tier spawns none. */
export interface ChildProcessHandle {
    /** Private observed recovery: retain live descendants and prove all writers stopped. */
    trackTree?(): void;
    quiesce?(remainingMs: number): Promise<boolean>;
    send(message: ParentMessage): void;
    onMessage(listener: (value: unknown) => void): void;
    onExit(listener: (code: number | null, signal: string | null) => void): void;
    /**
     * Raw stdout/stderr chunks, as bytes arrive.
     *
     * Raw on purpose: redaction and bounding are the relay's job (`src/run/outputRelay.ts`), and a
     * handle that scrubbed would be a second redaction path to keep in step with the first.
     */
    onOutput(listener: (stream: OutputStream, chunk: string) => void): void;
    /**
     * Signals the child's whole **process group** (AC-11a).
     *
     * Named `kill` because it is the only kill this launcher performs: killing the fork alone is
     * never the right thing to do here, so there is no method that does it. `src/run/tree.ts`
     * explains why the distinction is a browser process rather than a preference.
     */
    kill(): void;
    readonly pid: number | null;
}
/** Exactly what is handed to the operating system. Asserted verbatim by AC-21's spawn test. */
export interface ChildSpawnRequest {
    readonly modulePath: string;
    /** Always empty. A job value on a command line is visible in `ps` to every process on the host. */
    readonly args: readonly string[];
    /** Enumerated, never inherited wholesale. */
    readonly env: Readonly<Record<string, string>>;
}
export interface ChildSpawner {
    spawn(request: ChildSpawnRequest): ChildProcessHandle;
}
export interface ChildLauncherOptions {
    /** Explicit recording geometry (§6.1, AC-7). */
    readonly recording: {
        readonly width: number;
        readonly height: number;
    };
    /** Per-operation wall-clock bound handed to the adapter (§8.5, 30 s). */
    readonly stepTimeoutMs: number;
    /** Bound on the launch handshake. A child that never reports `ready` is a launch failure. */
    readonly launchTimeoutMs: number;
    readonly maxFailureMessageLength: number;
    /**
     * The seek-origin calibration the child adds to the run origin's zero (ADR-002 §26.3, story
     * 10.32). Required, like `recording` and `stepTimeoutMs`: it is a chosen value, and `0` is a
     * choice every caller states, not a default filled in here. It travels in the launch message
     * because the child does not inherit the runner's `STUDIO_RUNNER_*` environment.
     */
    readonly seekOriginCalibrationMs: number;
    readonly spawner?: ChildSpawner | undefined;
    readonly childModulePath?: string | undefined;
    /** Grace given to a child asked to stop before it is killed. */
    readonly stopTimeoutMs?: number | undefined;
    /** Environment the child inherits values from. Defaults to the runner's own process. */
    readonly parentEnv?: Readonly<Record<string, string | undefined>> | undefined;
}
/**
 * Environment variables the child may inherit, by name.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` is how the pinned image tells the library where its browsers live
 * (ADR-001 §4.2); the rest is what a Node process needs to run at all. Nothing in the runner's own
 * `STUDIO_RUNNER_*` namespace is on this list — the browser process holds no runner configuration
 * and no service identity, which is the same posture §9.2 takes toward credentials.
 *
 * **Nothing on this list may load code.** `NODE_OPTIONS` was on it and is not any more: Node reads
 * `--require`, `--import` and `--experimental-loader` out of that variable, so a single Deployment
 * environment entry plus a readable file ran arbitrary code inside the browser child *before*
 * `child.js`, which is enough to rewrite `chromiumSandbox: true` on its way to the library and add
 * a disabling flag — with no diff anywhere in this repository for a lint rule or a scan to catch.
 * §9.3 forbids the sandbox being disabled silently to make something run; that was the pathway.
 *
 * The allowlist is the shape that holds here, so the guard below is stated over the whole class of
 * code-loading variables rather than over the one name that was found. `assertNoCodeLoadingKeys`
 * re-checks the *constructed* environment on every launch, so a future addition to this list fails
 * the launch loudly instead of quietly widening the browser process's trust boundary.
 */
export declare const INHERITED_ENV_KEYS: readonly string[];
/**
 * Namespaces whose variables can make a process load code it was not asked to load.
 *
 * Prefixes, not names. A denylist of the specific variables anyone happened to think of is what
 * failed — `NODE_OPTIONS` was reviewed onto the allowlist by people who knew what it did — so the
 * rule is stated over the families instead, and a variable Node or a loader adds later is covered
 * by the family it is born into rather than by a later amendment here.
 *
 * - `NODE_*` — the interpreter's own namespace: `NODE_OPTIONS` carries `--require` / `--import` /
 *   `--experimental-loader`, `NODE_PATH` redirects module resolution, `NODE_REPL_EXTERNAL_MODULE`
 *   names a module to load.
 * - `LD_*` — the glibc dynamic linker in the image: `LD_PRELOAD`, `LD_AUDIT`, `LD_LIBRARY_PATH`.
 *   This one reaches the *browser* binary, not just Node.
 * - `DYLD_*` — the same thing on macOS, where the fixtures tier runs.
 * - `OPENSSL_*` — `OPENSSL_CONF` loads providers and engines, which are shared objects.
 */
export declare const CODE_LOADING_ENV_PREFIXES: readonly string[];
/** True when a variable name belongs to one of the code-loading families above. */
export declare function isCodeLoadingEnvKey(key: string): boolean;
/**
 * Refuses to hand the operating system an environment that could load code into the child.
 *
 * A launch failure is the right outcome: the alternative is a browser process that starts with
 * something else's code in it, and §9.3's instruction is to report rather than to proceed.
 */
export declare function assertNoCodeLoadingKeys(env: Readonly<Record<string, string>>): void;
/** Where the compiled child entry sits, relative to this module, once built. */
export declare const DEFAULT_CHILD_MODULE_PATH: string;
/** The default spawner: `fork`, no arguments, an enumerated environment, an IPC channel. */
export declare function createForkSpawner(): ChildSpawner;
/**
 * Builds the real launcher.
 *
 * @param options recording geometry, timeouts and the two test seams (spawner, child module).
 */
export declare function createChildBrowserLauncher(options: ChildLauncherOptions): BrowserLauncher;
/** Exported for the tests that assert the exact text on the serialized `FINAL` body. */
export declare const TOTAL_TIMEOUT_MESSAGE: string;
/** Exported for the tests that assert the cancel's text on the serialized `FINAL` body. */
export declare const CANCELLED_MESSAGE: string;
/** A child-supplied path is never an unrestricted file-upload capability. */

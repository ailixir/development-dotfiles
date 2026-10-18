import { provenSecretUseAfterLoss,mergeSecretUseEvidence } from './secretUse.js';
import { ObservedPreReadyFailure } from './errors.js';
/**
 * The real `BrowserLauncher`: the parent half of the killable child (AC-1, AC-4, AC-5, AC-20).
 *
 * Story 10.6 shipped `BrowserLauncher` as a seam with a comment naming this story as its
 * supplier, and `src/main.ts` shipped `UNAVAILABLE_LAUNCHER`, which refused every launch. This is
 * the supplier, wired into the **existing** seam: `LaunchOptions` and `BrowserSession` keep their
 * shapes, and the coordinator's ordering — scratch after admission, `STARTED` after the launch
 * resolves — is untouched.
 *
 * ## `launch` resolving means Chromium started
 *
 * Not "a spawn succeeded" and not "a launch call began". The promise settles when the child has
 * started the browser, created the recording context and page, taken the run origin and sent
 * `ready`. That is what makes `browserStartedAt` an observation, and it is why AC-20's assertion —
 * that the observed start is *measurably distinct* from the dispatch instant — is a real one
 * rather than a tautology.
 *
 * ## Nothing job-shaped reaches the command line
 *
 * The child is forked with **no arguments**, **no interpreter flags** and a **minimal, enumerated
 * environment**. Resolved variables and secrets travel over the IPC channel and only there: never
 * in `argv`, never in the environment, never in a spawn command line (AC-21). The environment is
 * built from an allowlist rather than inherited from `process.env`, so the runner's own
 * configuration — including its outbound service identity — never enters the process that opens
 * untrusted pages.
 *
 * Nothing that reaches the child may **load code**: not a variable (`NODE_OPTIONS` and its family
 * are off the allowlist and a guard re-checks the constructed environment on every launch) and not
 * an interpreter flag (`execArgv` is set empty rather than inherited from the runner). Either one
 * would run before `child.js` and could unset the sandbox on the way to the library without a
 * single line changing in this repository, which is exactly the silent disabling §9.3 forbids.
 *
 * ## The two deadlines, and which one lives here
 *
 * The *start* deadline is a refusal and belongs to the coordinator. The *total runtime* deadline
 * is **enforcement**, and story 10.13 splits it across the two files it belongs in: the
 * coordinator arms it, on its own monotonic clock, at the instant it observes the `ready`
 * handshake (`src/run/deadline.ts`), because that is the parent's clock and the coordinator is
 * where the two budgets are kept apart. What happens *when it fires* is here, because only this
 * module holds the child: the ordered stop, the bounded grace, and then the **process group**
 * signal.
 *
 * Three things about the kill path are ordering, not detail:
 *
 * - **The reason is recorded before the signal.** A deadline kill makes the child exit without a
 *   result, and `createInbox`'s abandoned-result path synthesizes `failureKind: 'run-fault'` →
 *   `RUN_ERROR`, which is the code for "the protocol broke". §8.2 fixes this condition by hand as
 *   `ERROR`/`TIMEOUT`. Classifying after the exit would honestly describe the symptom and lose the
 *   cause, so {@link SessionRun.kill} sets the kind first.
 * - **Whether the ordered stop completed is recorded before the signal too**, for the same reason.
 *   It is the fact ADR-002 §17.7 makes `partial` depend on, and it stops existing the moment the
 *   tree does.
 * - **The signal goes to the group, not the pid.** The fork's pid is Node; Chromium is below it.
 *   See `src/run/tree.ts`.
 */

import type { Execute3, Launch3, Ready3, Result3 } from '../executor/observedOperations.js';
import { demand, equalObserved, hashObserved, isRecord, OBSERVED_LIMITS, validateObserved } from '../validator/observedReferencePolicy.js';
import { validateObservedExecute } from '../executor/observedReplay.js';
import type { ObservedChildMessage, ObservedParentMessage } from './protocol.js';
import type { StepReporter } from '../executor/adapters/StepReporter.js';
import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserAdapter } from '../executor/adapters/BrowserAdapter.js';
import type {
  BrowserLauncher,
  BrowserSession,
  LaunchOptions,
  SessionKillOutcome,
  SessionKillReason,
  SessionRecording,
  SessionRunRequest,
  SessionRunResult,
} from '../server/adapters.js';
import { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';
import { createOutputRelay } from './outputRelay.js';
import type { OutputRelay, OutputStream } from './outputRelay.js';
import type { RecordingObservation } from './recording.js';
import { evidenceFor, hasWebmHeader } from './recording.js';
import { signalProcessTree } from './tree.js';
import {descendantsOf,isAlive,canEnumerateProcessTree,readProcessTable} from './tree.js';
import {createAppVideoRegistry,sealAppVideoOwner,observeOwnedAppRecording} from './appVideoOwnership.js';
import type {AppVideoSnapshot} from './appVideoOwnership.js';
import type { ChildMessage, ParentMessage, ProtocolStep } from './protocol.js';
import { PROTOCOL_VERSION, parseChildMessage } from './protocol.js';

/** A spawned child, reduced to what the launcher needs. Injected so the unit tier spawns none. */
export interface ChildProcessHandle {
  /** Private observed recovery: retain live descendants and prove all writers stopped. */
  trackTree?():void;
  quiesce?(remainingMs:number):Promise<boolean>;
  send(message: ParentMessage | ObservedParentMessage): void;
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
  readonly recording: { readonly width: number; readonly height: number };
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
export const INHERITED_ENV_KEYS: readonly string[] = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'PLAYWRIGHT_BROWSERS_PATH',
  'DISPLAY',
  'XDG_RUNTIME_DIR',
];

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
export const CODE_LOADING_ENV_PREFIXES: readonly string[] = ['NODE_', 'LD_', 'DYLD_', 'OPENSSL_'];

/** True when a variable name belongs to one of the code-loading families above. */
export function isCodeLoadingEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  return CODE_LOADING_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/**
 * Refuses to hand the operating system an environment that could load code into the child.
 *
 * A launch failure is the right outcome: the alternative is a browser process that starts with
 * something else's code in it, and §9.3's instruction is to report rather than to proceed.
 */
export function assertNoCodeLoadingKeys(env: Readonly<Record<string, string>>): void {
  const offenders = Object.keys(env).filter((key) => isCodeLoadingEnvKey(key));
  if (offenders.length > 0) {
    throw new Error(
      `The browser child environment carries code-loading variables (${offenders.sort().join(', ')}). ` +
        'Node and the dynamic linkers execute what these name before the child runs, which is a ' +
        'path to an unsandboxed browser with no source diff (§9.3). Remove them from ' +
        'INHERITED_ENV_KEYS.',
    );
  }
}

/** Where the compiled child entry sits, relative to this module, once built. */
export const DEFAULT_CHILD_MODULE_PATH = fileURLToPath(new URL('./child.js', import.meta.url));

/**
 * The parent-side `BrowserAdapter` of a child-owned session.
 *
 * `BrowserSession` keeps its 10.6 shape, so a session has an `adapter`. A *real* session's
 * operations run in the child, next to the browser and on the child's run clock — driving them
 * from here would put every reading a round trip away from the thing it measures. Rather than
 * exposing a proxy that looks usable and silently spends the seek budget, this refuses and says
 * which path to use, so a future caller finds out at the first call rather than in a timing
 * report.
 */
export function createChildOwnedAdapter(): BrowserAdapter {
  const refuse = (): never => {
    throw new Error(
      'This session executes in its own process: use `session.run.execute(...)`. Driving the ' +
        'adapter from the parent would take every step reading a round trip away from the ' +
        'browser (ADR-002 §11.6).',
    );
  };
  return {
    goto: refuse,
    waitForURL: refuse,
    locate: refuse,
    click: refuse,
    fill: refuse,
    press: refuse,
    check: refuse,
    uncheck: refuse,
    hover: refuse,
    selectOption: refuse,
    expectVisible: refuse,
    expectContainText: refuse,
    expectValue: refuse,
    expectUrl: refuse,
    expectTitle: refuse,
  };
}

/** The default spawner: `fork`, no arguments, an enumerated environment, an IPC channel. */
export function createForkSpawner(): ChildSpawner {
  return {
    spawn(request: ChildSpawnRequest): ChildProcessHandle {
      const child = fork(request.modulePath, [...request.args], {
        env: { ...request.env },
        // The *other* half of the environment allowlist. `fork` defaults `execArgv` to the
        // parent's, so interpreter flags the runner itself was started with — `node --import x
        // dist/main.js` — would be replayed into the browser child even though its environment is
        // fully enumerated. The child is compiled ESM and needs no interpreter flags, so it gets
        // none, and neither channel can carry code into the process that opens untrusted pages.
        execArgv: [],
        // **Piped, not inherited.** 10.12 inherited both so the child's diagnostics reached the
        // pod log; §9.2 requires scrubbing every outbound diagnostic *before persistence*, and a
        // pod log is persistence. Capturing them is what puts the run's redactor and 10.6's
        // length cap in front of output this package did not format — a Playwright exception or a
        // Chromium warning (AC-8).
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        // The child leads its **own process group**, so one signal reaches Chromium and every
        // process below it. Without this, `kill` reaches Node and orphans the browser (AC-11a).
        // Deliberately not `unref`ed: the parent still waits on this child and still reaps it.
        detached: true,
        serialization: 'json',
      });
      const remembered=new Set<number>();let tracking:ReturnType<typeof setInterval>|undefined;
      const remember=(maxMs=25):void=>{if(child.pid)for(const pid of descendantsOf(child.pid,readProcessTable(maxMs)))remembered.add(pid);};
      return {
        trackTree(){if(!tracking){remember();tracking=setInterval(()=>{remember();},25);}},
        async quiesce(remainingMs){
          const end=Date.now()+Math.max(1,remainingMs);remember(Math.max(1,Math.min(25,end-Date.now())));if(tracking){clearInterval(tracking);tracking=undefined;}const pid=child.pid;if(!pid)return false;
          const table=readProcessTable(Math.max(1,Math.min(25,end-Date.now()))),enumerated=canEnumerateProcessTree(table);
          // Known browser/encoder groups survive an exited Node leader. Signal retained trees,
          // then poll the exact observed pids within the existing cleanup window.
          const pids=[...remembered,pid];for(const member of pids)if(isAlive(member))signalProcessTree(member,'SIGKILL',undefined,table);
          while(pids.some(member=>isAlive(member))){if(Date.now()>=end)return false;await new Promise<void>(r=>{setTimeout(r,Math.max(1,Math.min(5,end-Date.now())));});}return enumerated;
        },
        send(message: ParentMessage): void {
          if (child.connected) child.send(message, () => { /* Exit handling owns a closed IPC channel; raw error text is never emitted. */ });
        },
        onMessage(listener: (value: unknown) => void): void {
          child.on('message', listener);
        },
        onExit(listener: (code: number | null, signal: string | null) => void): void {
          child.on('exit', listener);
        },
        onOutput(listener: (stream: OutputStream, chunk: string) => void): void {
          child.stdout?.setEncoding('utf8');
          child.stderr?.setEncoding('utf8');
          child.stdout?.on('data', (chunk: string) => {
            listener('stdout', chunk);
          });
          child.stderr?.on('data', (chunk: string) => {
            listener('stderr', chunk);
          });
          // A pipe nobody reads eventually blocks the writer, and a blocked browser child is a
          // hang this story exists to prevent. An `error` listener keeps a closed pipe from
          // becoming an uncaught exception in the parent.
          child.stdout?.on('error', () => undefined);
          child.stderr?.on('error', () => undefined);
        },
        kill(): void {
          const pid = child.pid;
          if (pid === undefined) return;
          if (child.exitCode !== null || child.signalCode !== null) return;
          // The group, never the pid alone. `src/run/tree.ts` falls back to the single pid only
          // if the group signal is refused, and says which it did.
          signalProcessTree(pid, 'SIGKILL');
        },
        get pid(): number | null {
          return child.pid ?? null;
        },
      };
    },
  };
}

/**
 * What the **parent** can see of the recording once the child is gone (AC-16 case (b)).
 *
 * On a deadline kill the child does not get to report: it was signalled. But a playable file may
 * still be sitting in scratch — Chromium writes the webm incrementally, so a killed recorder often
 * leaves a readable prefix. Reporting that as `UNAVAILABLE` would throw away real evidence;
 * reporting it as complete would be the salvaged prefix presented as a whole video that ADR-002
 * §17.7 item 1 exists to stop. So the parent looks, and reports it as what it is: `PENDING`, and
 * partial because the ordered stop did not complete.
 *
 * `orderlyClose` is passed in rather than inferred from the file, and that is the whole point: the
 * file cannot tell you how the recorder ended, which is why a mutation that reads partiality from
 * playability instead of from the stop observation is wrong.
 *
 * **`attempted` is `false` when the directory holds nothing**, and that is deliberate rather than
 * convenient. The child observes the *recorder*; the parent, on this path, observes only the
 * *directory*, because the process that could have said anything about the recorder is gone. With
 * no file at all the parent has nothing to have failed, so `evidenceFor` answers `UNAVAILABLE`,
 * which is what AC-16 case (c) asks for — and §17.3's "a recording that does not exist is not a
 * partial one" follows from it rather than being a second rule.
 */
async function observeScratchRecording(
  scratchPath: string,
  orderlyClose: boolean,
): Promise<RecordingObservation> {
  const nothing: RecordingObservation = {
    attempted: false,
    path: null,
    bytes: null,
    header: false,
    error: null,
    orderlyClose,
  };
  const videoDir = join(scratchPath, SCRATCH_SUBDIRECTORIES.video);
  try {
    const entries = await readdir(videoDir);
    let best: { path: string; bytes: number } | null = null;
    for (const entry of entries) {
      const path = join(videoDir, entry);
      const stats = await stat(path);
      if (!stats.isFile()) continue;
      if (best === null || stats.size > best.bytes) best = { path, bytes: stats.size };
    }
    if (best === null) return nothing;
    const head = await readFile(best.path);
    return {
      attempted: true,
      path: best.path,
      bytes: best.bytes,
      header: hasWebmHeader(head.subarray(0, 4)),
      error: null,
      orderlyClose,
    };
  } catch {
    return nothing;
  }
}

function childEnvironment(
  parentEnv: Readonly<Record<string, string | undefined>>,
  scratchPath: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = parentEnv[key];
    if (value !== undefined && value !== '') env[key] = value;
  }
  // Chromium's temporary output follows `TMPDIR` into the per-run scratch directory (AC-22).
  env.TMPDIR = join(scratchPath, SCRATCH_SUBDIRECTORIES.temp);
  // The browsers come from the image; a child must never fetch one at run time (ADR-001 §4.2).
  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
  // Stated over what is actually handed to the operating system, so it covers the allowlist and
  // the two literals above alike.
  assertNoCodeLoadingKeys(env);
  return env;
}

class LaunchFailure extends Error {
  readonly failureKind: string;

  constructor(failureKind: string, message: string) {
    super(message);
    this.name = 'LaunchFailure';
    this.failureKind = failureKind;
  }
}

export { LaunchFailure };

/**
 * Builds the real launcher.
 *
 * @param options recording geometry, timeouts and the two test seams (spawner, child module).
 */
export function createChildBrowserLauncher(options: ChildLauncherOptions): BrowserLauncher {
  const spawner = options.spawner ?? createForkSpawner();
  const modulePath = options.childModulePath ?? DEFAULT_CHILD_MODULE_PATH;
  const stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
  const parentEnv = options.parentEnv ?? process.env;

  return {
    async launch(launchOptions: LaunchOptions): Promise<BrowserSession> {
      if(launchOptions.observed) return launchObservedChild(options,launchOptions,spawner,modulePath,parentEnv,stopTimeoutMs);
      // Chromium's temp directory has to exist before it is pointed at (AC-22).
      mkdirSync(join(launchOptions.scratchPath, SCRATCH_SUBDIRECTORIES.temp), { recursive: true });

      const child = spawner.spawn({
        modulePath,
        // Empty, always. Nothing about the job is visible in a process listing (AC-21).
        args: [],
        env: childEnvironment(parentEnv, launchOptions.scratchPath),
      });

      // Wired **before** the launch message, so output produced while the browser is still
      // starting — the failure mode most worth seeing — is captured rather than lost or inherited.
      const relay = attachOutputRelay(child, launchOptions);

      const inbox = createInbox(child);

      child.send({
        kind: 'launch',
        protocolVersion: PROTOCOL_VERSION,
        runId: launchOptions.scratchPath,
        browser: launchOptions.browser,
        viewport: launchOptions.viewport,
        recording: options.recording,
        seekOriginCalibrationMs: options.seekOriginCalibrationMs,
        scratchPath: launchOptions.scratchPath,
        // Passed on. The parent enforces it; the child structures itself so it can be stopped.
        totalRuntimeMs: launchOptions.totalRuntimeMs,
      });

      const ready = await inbox.awaitReady(options.launchTimeoutMs);
      if (ready.kind !== 'ready') {
        // The launch-failure path is one of AC-11a's six: the tree goes, not just the fork.
        child.kill();
        relay.close();
        relay.release();
        throw new LaunchFailure(ready.failureKind, ready.message);
      }

      /**
       * Whether the ordered stop completed within the grace.
       *
       * `null` until a stop is ordered. Written **before** the group signal, which is the whole
       * of ADR-002 §17.7 item 1: after the tree is gone there is nothing left to observe, and the
       * file cannot answer the question because playability and completeness are different facts.
       */
      let orderedStopCompleted: boolean | null = null;
      /** Set before the signal too, so the report names the cause rather than the symptom. */
      let killReason: SessionKillReason | null = null;

      /**
       * The ordered stop, run **once** and awaited by everyone who asks for it.
       *
       * Sharing the promise rather than returning early on a flag is load-bearing, not tidiness.
       * The child sends its `result` *before* it exits, so `execute`'s awaited result resolves
       * while the first caller — the deadline's `kill` — is still inside `awaitExit`. A second
       * caller that returned immediately would read `orderedStopCompleted` before the exit that
       * sets it, conclude the ordered stop had not completed, and report a cleanly flushed
       * recording as `partial: true`. Found by the real-Chromium tier, which is the only place
       * the two callers actually overlap.
       */
      const performStop = async (): Promise<void> => {
        child.send({ kind: 'stop' });
        const exited = await inbox.awaitExit(stopTimeoutMs);
        orderedStopCompleted = exited;
        // Bounded, and then the group. A child that ignores `stop` cannot outlive its run, and
        // signalling the fork alone would leave Chromium holding scratch and the video file.
        if (!exited) child.kill();
      };

      let stopping: Promise<void> | null = null;
      const stop = (): Promise<void> => {
        stopping ??= performStop();
        return stopping;
      };

      const finish = (): void => {
        relay.close();
        relay.release();
      };

      return {
        adapter: createChildOwnedAdapter(),
        async close(): Promise<void> {
          await stop();
          finish();
        },
        run: {
          origin: {
            browserStartedAt: new Date(ready.browserStartedAt),
            startedAtMs: ready.startedAtMs,
            // What the child actually applied, as it reported it. Read by the fixtures tier to
            // assert its pin (story 10.32 AC-4); nothing on the reporting path consumes it.
            calibrationOffsetMs: ready.calibrationOffsetMs,
            // The readings are taken on the child's clock and pass through unchanged; the parent
            // never re-derives an origin (ADR-002 §11.5).
            clock: null,
          },

          async kill(reason: SessionKillReason): Promise<SessionKillOutcome> {
            // Classified first, signalled second (AC-3). The abandoned-result path would
            // otherwise report `run-fault` → `RUN_ERROR` for a condition §8.2 names as `TIMEOUT`,
            // because a killed child exits without a result and the symptom is all that is left.
            killReason ??= reason;
            await stop();
            return { orderedStopCompleted: orderedStopCompleted ?? false };
          },

          async execute(request: SessionRunRequest): Promise<SessionRunResult> {
            const steps: ProtocolStep[] = request.steps.map((step) => ({
              stepIndex: step.stepIndex,
              operations: [...step.operations],
            }));
            inbox.forwardStepsTo(request.reporter);
            child.send({
              kind: 'execute',
              protocolVersion: PROTOCOL_VERSION,
              // Per-run and already clamped to the server maximum by the coordinator; the
              // launcher's own value is the fallback for a caller that supplies none (AC-6).
              stepTimeoutMs: launchOptions.stepTimeoutMs ?? options.stepTimeoutMs,
              steps,
              variables: request.variables,
              secrets: request.secrets,
              // Absent means no secret is bound to any origin, so no secret can be filled.
              secretOrigins: request.secretOrigins ?? {},
              maxFailureMessageLength:
                request.maxFailureMessageLength ?? options.maxFailureMessageLength,
            });
            const result = await inbox.awaitResult();
            await stop();

            const recording = await settleRecording({
              reported: result.recording,
              sawChildResult: inbox.sawChildResult,
              killed: killReason !== null,
              orderedStopCompleted,
              scratchPath: launchOptions.scratchPath,
            });
            finish();

            return {
              ok: killReason === null ? result.ok : false,
              // §8.2 fixes the parent-enforced total timeout as `ERROR`/`TIMEOUT`, and the kind
              // was decided before the signal rather than inferred from how the child exited. A
              // drain kill is a different condition and takes the documented residual instead.
              failureKind: killReason === null ? result.failureKind : KILL_FAILURE_KINDS[killReason],
              failureMessage:
                killReason === null ? result.failureMessage : KILL_MESSAGES[killReason],
              recording,
              observedHosts: result.observedHosts,
            };
          },
        },
      };
    },
  };

  /** Captures the child's two output streams behind the run's redactor and 10.6's caps (AC-8). */
  function attachOutputRelay(child: ChildProcessHandle, launchOptions: LaunchOptions): OutputRelay {
    const diagnostics = launchOptions.diagnostics;
    const relay = createOutputRelay({
      // With no sink configured the redaction is total and the output is discarded — but it is
      // still *drained*, because a pipe nobody reads eventually blocks the writer, and a blocked
      // browser child is the hang this story exists to prevent.
      redactor: { redact: (text) => (diagnostics === undefined ? '' : diagnostics.redact(text)) },
      // The same per-message cap 10.6 already applies to a retained log entry (AC-10).
      maxLineLength: options.maxFailureMessageLength,
      maxLines: MAX_CHILD_OUTPUT_LINES,
      emit: (stream, line) => {
        diagnostics?.write(stream, line);
      },
    });
    // Synchronous, contained, and never awaited: a relay that could delay the run, the kill or the
    // parent's control endpoints would be a new way to hang the process this story protects.
    child.onOutput((stream, chunk) => {
      relay.write(stream, chunk);
    });
    return relay;
  }
}

/**
 * The failure kind each kill reason produces.
 *
 * `total-timeout` is §8.2's by-hand ruling and is the one value the runner's code set shares with
 * the API's `ExecutionErrorCode`. `run-fault` → `RUN_ERROR` is the documented residual, and the
 * right answer for a drain: the run did not exceed its budget, the pod is leaving.
 */
const KILL_FAILURE_KINDS: Readonly<Record<SessionKillReason, string>> = {
  'total-runtime': 'total-timeout',
  drain: 'run-fault',
  cancel: 'cancelled',
};

/** What a killed run says about itself. Bounded and value-free, so it is safe to report. */
const KILL_MESSAGES: Readonly<Record<SessionKillReason, string>> = {
  'total-runtime':
    'The total browser runtime deadline was reached and the browser process tree was stopped.',
  drain:
    'The runner drained while this run was still in flight; the browser process tree was stopped.',
  cancel: 'The run was cancelled and the browser process tree was stopped.',
};

/** Exported for the tests that assert the exact text on the serialized `FINAL` body. */
export const TOTAL_TIMEOUT_MESSAGE = KILL_MESSAGES['total-runtime'];

/** Exported for the tests that assert the cancel's text on the serialized `FINAL` body. */
export const CANCELLED_MESSAGE = KILL_MESSAGES.cancel;

/**
 * Lines of child output one run may relay before the rest are dropped and counted (AC-8).
 *
 * A constant rather than a configuration key: AC-19's instruction is that this story must not
 * widen the surfaces it touches, and a chatty-browser bound is not something a deployment needs to
 * tune. It is deliberately larger than `maxLogEntries` (200) — the relay writes to the pod log, not
 * to the bounded report body, and the two have different consumers.
 */
export const MAX_CHILD_OUTPUT_LINES = 500;

/**
 * Reconciles what the child said about the recording with what the parent observed.
 *
 * Three inputs, one of which only exists for an instant:
 *
 * - the child's own report, when it lived long enough to make one;
 * - whether the parent's **ordered stop** completed within the grace, recorded before the signal;
 * - the scratch directory, which is all that is left when the child was killed.
 *
 * None of them is the outcome. `partial` is computed by `evidenceFor`/`partialFor` from
 * `orderlyClose` alone, and this function never sees an error code (ADR-002 §17.4).
 */
async function settleRecording(input: {
  readonly reported: SessionRecording;
  readonly sawChildResult: boolean;
  readonly killed: boolean;
  readonly orderedStopCompleted: boolean | null;
  readonly scratchPath: string;
}): Promise<SessionRecording> {
  if (!input.killed) return input.reported;

  const orderly = input.orderedStopCompleted === true;

  if (input.sawChildResult) {
    // The child flushed and reported inside the grace. Its own file reading is better than a
    // directory scan — but the completeness fact is the parent's, because the parent is the one
    // that knows whether the stop it ordered finished.
    return {
      ...input.reported,
      partial: input.reported.state === 'PENDING' ? !orderly : false,
    };
  }

  // Killed without a word. Whatever is in scratch is the only evidence there is.
  const observed = await observeScratchRecording(input.scratchPath, orderly);
  const evidence = evidenceFor(observed);
  return {
    path: evidence.path,
    bytes: evidence.bytes,
    error: evidence.error,
    state: evidence.state,
    partial: evidence.partial,
  };
}

type ReadyOutcome =
  | {
      readonly kind: 'ready';
      readonly browserStartedAt: string;
      readonly startedAtMs: number;
      readonly calibrationOffsetMs: number | undefined;
    }
  | { readonly kind: 'failed'; readonly failureKind: string; readonly message: string };

interface Inbox {
  awaitReady(timeoutMs: number): Promise<ReadyOutcome>;
  awaitResult(): Promise<Extract<ChildMessage, { kind: 'result' }>>;
  awaitExit(timeoutMs: number): Promise<boolean>;
  forwardStepsTo(reporter: SessionRunRequest['reporter']): void;
  /**
   * Whether the child actually reported, as opposed to the abandoned result synthesized on exit.
   *
   * The difference decides who can speak about the recording: a child that reported inspected its
   * own file, and one that was signalled left only a scratch directory for the parent to look in.
   */
  readonly sawChildResult: boolean;
}

/**
 * Demultiplexes the child's messages.
 *
 * Step events are forwarded **synchronously** to 10.6's `RunReporter` as they arrive, which is
 * what keeps AC-16's property true across the process boundary: the reporter's deliveries are
 * detached, so a slow or failing callback cannot block, delay or alter a step — and now it cannot
 * do so from the other side of a pipe either.
 */
function createInbox(child: ChildProcessHandle): Inbox {
  let reporter: SessionRunRequest['reporter'] | null = null;

  /**
   * Delivers one step event, and swallows whatever the reporter does with it.
   *
   * This runs inside the IPC `message` handler, so a reporter that throws would surface as an
   * uncaught exception **in the parent** — the process serving `/health`, `/ready` and
   * `/v1/validate` for every other request. AC-15's "a slow or failing callback cannot block,
   * delay or alter a step" has to keep holding across the process boundary, and a callback that
   * kills the parent has done considerably worse than delay a step.
   */
  const forward = (deliver: () => void): void => {
    try {
      deliver();
    } catch {
      // The reporter's problem, not the run's. The readings are already what the child observed.
    }
  };
  let onReady: ((outcome: ReadyOutcome) => void) | null = null;
  let onResult: ((message: Extract<ChildMessage, { kind: 'result' }>) => void) | null = null;
  let pendingReady: ReadyOutcome | null = null;
  let pendingResult: Extract<ChildMessage, { kind: 'result' }> | null = null;
  let sawChildResult = false;
  let exited = false;
  const exitListeners: (() => void)[] = [];

  child.onExit(() => {
    exited = true;
    for (const listener of exitListeners.splice(0)) listener();
    const failure: ReadyOutcome = {
      kind: 'failed',
      failureKind: 'browser-launch',
      message: 'The browser child process exited before it reported a start.',
    };
    if (pendingReady === null) {
      pendingReady = failure;
      onReady?.(failure);
    }
    if (pendingResult === null) {
      // Recorded, not merely delivered. A child that died *before* anyone awaited its result
      // would otherwise leave `awaitResult` with nothing to resolve and the run would hang until
      // the drain deadline — a runner that never reports is the state a reaper exists to clean up.
      const abandoned: Extract<ChildMessage, { kind: 'result' }> = {
        kind: 'result',
        ok: false,
        executorVersion: '',
        failureKind: 'run-fault',
        failureMessage: 'The browser child process exited before it reported a result.',
        recording: {
          path: null,
          bytes: null,
          error: null,
          state: 'UNAVAILABLE',
          // Not a claim about the file: `settleRecording` looks in scratch on the kill path,
          // where a killed recorder often leaves a playable prefix (ADR-002 §17.7 item 1).
          partial: false,
        },
        observedHosts: [],
      };
      pendingResult = abandoned;
      onResult?.(abandoned);
      onResult = null;
    }
  });

  child.onMessage((value: unknown) => {
    const message = parseChildMessage(value);
    if (message === null) return;
    switch (message.kind) {
      case 'ready': {
        const outcome: ReadyOutcome = {
          kind: 'ready',
          browserStartedAt: message.browserStartedAt,
          startedAtMs: message.startedAtMs,
          calibrationOffsetMs: message.calibrationOffsetMs,
        };
        pendingReady ??= outcome;
        onReady?.(outcome);
        return;
      }
      case 'step-started':
        forward(() => {
          reporter?.stepStarted({
            stepIndex: message.stepIndex,
            startedAtMs: message.startedAtMs,
          });
        });
        return;
      case 'step-finished':
        forward(() => {
          reporter?.stepFinished({
            stepIndex: message.stepIndex,
            status: message.status,
            startedAtMs: message.startedAtMs,
            finishedAtMs: message.finishedAtMs,
            durationMs: message.durationMs,
            failure: message.failure,
          });
        });
        return;
      case 'result':
        sawChildResult = true;
        if (pendingReady === null) {
          // A result before `ready` is a launch that never happened.
          pendingReady = {
            kind: 'failed',
            failureKind: message.failureKind ?? 'browser-launch',
            message: message.failureMessage ?? 'The browser did not start.',
          };
          onReady?.(pendingReady);
        }
        pendingResult ??= message;
        onResult?.(message);
        return;
    }
  });

  return {
    get sawChildResult(): boolean {
      return sawChildResult;
    },

    forwardStepsTo(next: SessionRunRequest['reporter']): void {
      reporter = next;
    },

    awaitReady(timeoutMs: number): Promise<ReadyOutcome> {
      if (pendingReady !== null) return Promise.resolve(pendingReady);
      return new Promise<ReadyOutcome>((resolve) => {
        const timer = setTimeout(() => {
          onReady = null;
          resolve({
            kind: 'failed',
            failureKind: 'browser-launch',
            message: `The browser did not start within ${String(timeoutMs)}ms.`,
          });
        }, timeoutMs);
        onReady = (outcome): void => {
          clearTimeout(timer);
          onReady = null;
          resolve(outcome);
        };
      });
    },

    awaitResult(): Promise<Extract<ChildMessage, { kind: 'result' }>> {
      if (pendingResult !== null) return Promise.resolve(pendingResult);
      return new Promise<Extract<ChildMessage, { kind: 'result' }>>((resolve) => {
        onResult = (message): void => {
          onResult = null;
          resolve(message);
        };
      });
    },

    awaitExit(timeoutMs: number): Promise<boolean> {
      if (exited) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          resolve(false);
        }, timeoutMs);
        exitListeners.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    },
  };
}

/** Observed family uses the same confined spawner, recorded child and bounded process-group stop. */
async function launchObservedChild(options: ChildLauncherOptions, launchOptions: LaunchOptions, spawner: ChildSpawner, modulePath: string, parentEnv: Readonly<Record<string, string | undefined>>, stopTimeoutMs: number): Promise<BrowserSession> {
    const observed = launchOptions.observed;
    demand(observed);
    const { job, admission, policy } = observed, b = job.binding;
    const execute: Execute3 = { kind: 'execute', protocolVersion: 3, mode: 'observed', runId: b.executionId, attemptId: b.attemptId, profileHash: hashObserved(b.requiredProfile), configurationHash: b.configurationHash, waitStrategy: job.configuration.waitStrategy, stepTimeoutMs: launchOptions.stepTimeoutMs ?? job.runtime.stepTimeoutMs, steps: job.artifact.steps, guards: job.artifact.guards, bindings: job.artifact.replayPolicy.bindings.map(x => ({ bindingId: x.bindingId, producer: x.producer, recipe: x.recipe, origin: x.sourceOrigin })), transfers: job.artifact.replayPolicy.transfers, inputs: job.artifact.inputRecipes.map(i => { if (i.kind === 'secretRef') { demand(i.provenance.kind === 'configuration'); return { inputId: i.inputId, stepId: i.stepId, kind: 'secretRef' as const, intendedSlot: 'fill.value' as const, referenceName: i.provenance.referenceName }; } const v = job.inputs.find(x => x.inputId === i.inputId); demand(v); return { inputId: i.inputId, stepId: i.stepId, kind: i.kind === 'destination' ? 'destination' : 'nonsecretText', intendedSlot: i.intendedSlot, value: v.value }; }), secrets: job.secrets, secretOrigins: job.secretOrigins };
    validateObservedExecute(execute, b.scope);
    const launch: Launch3 = { kind: 'launch', protocolVersion: 3, mode: 'observed', runId: b.executionId, attemptId: b.attemptId, admission, profile: b.requiredProfile, build: b.requiredBuild, scopeHash: b.scopeHash, configurationHash: b.configurationHash, browser: 'chromium', viewport: job.configuration.viewport, recording: job.recording, seekOriginCalibrationMs: options.seekOriginCalibrationMs, scratchPath: launchOptions.scratchPath, totalRuntimeMs: launchOptions.totalRuntimeMs, scope: b.scope, policy };
    validateObserved('replay-ipc#/definitions/Launch3', launch, OBSERVED_LIMITS.launch);
    mkdirSync(join(launchOptions.scratchPath, SCRATCH_SUBDIRECTORIES.temp), { recursive: true });
    const videoRegistry=createAppVideoRegistry(launchOptions.scratchPath);
    const env = childEnvironment(parentEnv, launchOptions.scratchPath);
    for (const key of ['STUDIO_RUNNER_OBSERVED_CATALOG_FILE', 'STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST'])
        if (parentEnv[key])
            env[key] = parentEnv[key] ?? '';
    demand(!launchOptions.signal?.aborted,'CANCELLED');
    const runtimeDeadlineEpochMs=Math.min(Date.now()+launchOptions.totalRuntimeMs,Date.parse(admission.runDeadlineAt));
    const child = spawner.spawn({ modulePath, args: [], env });
    child.trackTree?.();
    // Drain and discard all raw output from BEFORE the first launch message.
    child.onOutput(() => undefined);
    let result: Result3 | null = null, ready: Ready3 | null = null, exited = false, violation = false, executed = false, reporter: StepReporter | null = null, killReason: SessionKillReason | null = null;
    const startedSteps = new Map<number, number>(), completedSteps = new Map<number, string>();
    const waiters = new Set<() => void>();
    const wake = (): void => { for (const f of waiters)
        f(); };
    let videoOwner:AppVideoSnapshot|undefined,quiescent=false;
    const sealVideo=():void=>{videoOwner??=sealAppVideoOwner(videoRegistry,launch,child.pid);};
    const sealedVideo=():AppVideoSnapshot=>videoOwner??{kind:'absent'};
    child.onExit(() => {sealVideo();exited = true; wake(); });
    child.onMessage(raw => {
        try {
            const kind = isRecord(raw) && typeof raw.kind === 'string' ? raw.kind : '';
            const names: Readonly<Record<string, string>> = { ready: 'Ready3', result: 'Result3', 'step-started': 'StepStarted3', 'step-finished': 'StepFinished3' };
            const name = names[kind];
            demand(name);
            const m = validateObserved<ObservedChildMessage>('replay-ipc#/definitions/' + name, raw, OBSERVED_LIMITS.result);
            demand(m.runId === b.executionId && m.attemptId === b.attemptId);
            if (m.kind === 'ready' || m.kind === 'result')
                demand(m.admissionId === admission.admissionId && m.profileHash === hashObserved(b.requiredProfile) && equalObserved(m.build, b.requiredBuild), 'PROFILE_MISMATCH');
            if (m.kind === 'ready') {
                demand(!ready && !result);
                validateObserved('replay-ipc#/definitions/Ready3', m, OBSERVED_LIMITS.ready);
                ready = m;
            }
            else if (m.kind === 'result') {
                demand(!result && (m.ok ? m.errorCode === null : m.errorCode !== null));
                if (executed)
                    demand(completedSteps.size === execute.steps.length && (!m.ok || execute.steps.every(s => completedSteps.get(s.stepIndex) === 'PASS')));
                const receipts=provenSecretUseAfterLoss(Object.keys(job.secrets),job.artifact.inputRecipes,job.artifact.steps,executed,completedSteps);
                demand(!mergeSecretUseEvidence(receipts,m.secretUse,Object.keys(job.secrets)).contradictory);
                result = m;
            }
            else {
                validateObserved(m.kind === 'step-started' ? 'replay-ipc#/definitions/StepStarted3' : 'replay-ipc#/definitions/StepFinished3', m, OBSERVED_LIMITS.step);
                demand(executed && reporter && job.artifact.steps[m.stepIndex]?.stepId === m.stepId && !result);
                if (m.kind === 'step-started') {
                    demand(!startedSteps.has(m.stepIndex) && !completedSteps.has(m.stepIndex) && m.stepIndex === completedSteps.size);
                    startedSteps.set(m.stepIndex, m.startedAtMs);
                    reporter.stepStarted({ stepIndex: m.stepIndex, startedAtMs: m.startedAtMs });
                }
                else {
                    demand(!completedSteps.has(m.stepIndex) && m.stepIndex === completedSteps.size);
                    demand(m.status === 'SKIPPED' ? !startedSteps.has(m.stepIndex) : startedSteps.get(m.stepIndex) === m.startedAtMs);
                    demand(m.status === 'SKIPPED' ? m.startedAtMs === null && m.finishedAtMs === null && m.durationMs === null && m.errorCode === null : m.startedAtMs !== null && m.finishedAtMs !== null && m.durationMs !== null && [m.startedAtMs,m.finishedAtMs,m.durationMs].every(n=>Number.isFinite(n)&&n>=0) && m.finishedAtMs >= m.startedAtMs && Math.abs(m.durationMs - (m.finishedAtMs - m.startedAtMs)) < 0.001 && (m.status === 'PASS' ? m.errorCode === null : m.errorCode !== null));
                    completedSteps.set(m.stepIndex, m.status);
                    reporter.stepFinished({ stepIndex: m.stepIndex, status: m.status, startedAtMs: m.startedAtMs, finishedAtMs: m.finishedAtMs, durationMs: m.durationMs, failure: m.errorCode });
                }
            }
            wake();
        }
        catch {
            violation = true;
            sealVideo();
            child.kill();
            wake();
        }
    });
    const wait = async (predicate: () => boolean, timeoutMs: number): Promise<boolean> => {
        if (predicate())
            return true;
        return new Promise(resolve => { const check = (): void => { if (predicate()) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(true);
        } }; const timer = setTimeout(() => { waiters.delete(check); resolve(false); }, Math.max(1, timeoutMs)); waiters.add(check); check(); });
    };
    let stopping: Promise<void> | null = null, ordered = false;
    const wasOrderly=(final:Result3|null):boolean=>quiescent&&final!==null&&final.recording.state==='PENDING'&&!final.recording.partial;
    const performStop = async (): Promise<void> => {sealVideo();const end=Date.now()+stopTimeoutMs,requestedWhileLive=!exited;if (requestedWhileLive)
        child.send({ kind: 'stop' }); const withinGrace=requestedWhileLive&&await wait(() => exited,Math.max(1,end-Date.now()));if(!withinGrace)child.kill();
        // stopTimeoutMs is the ordered-close grace; the same existing cleanup bound caps
        // a separate post-signal reaping wait. It grants no action/runtime/admission time.
        quiescent=await child.quiesce?.(stopTimeoutMs)??false;
        ordered=withinGrace&&wasOrderly(result);
    };
    const stop = (): Promise<void> => { stopping ??= performStop(); return stopping; };
    const cancelLaunch=():void=>{killReason??='cancel';void stop();};
    launchOptions.signal?.addEventListener('abort',cancelLaunch,{once:true});
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Cancellation can arrive after the pre-spawn check.
    if(launchOptions.signal?.aborted)cancelLaunch();else child.send(launch);
    await wait(() => ready !== null || result !== null || exited || violation, Math.min(options.launchTimeoutMs, Date.parse(admission.startDeadlineAt)-Date.now(),runtimeDeadlineEpochMs-Date.now()));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
    if (!ready || violation || launchOptions.signal?.aborted) {
        await stop();
        launchOptions.signal?.removeEventListener('abort',cancelLaunch);
        const final=result as Result3|null;
        const recording=observeOwnedAppRecording(sealedVideo(),final?.recording.path,wasOrderly(final),quiescent);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Abort/IPC callbacks settle independently of the launch await.
        throw new ObservedPreReadyFailure(final?.errorCode??(launchOptions.signal?.aborted?'CANCELLED':'LAUNCH_UNKNOWN'),recording);
    }
    launchOptions.signal?.removeEventListener('abort',cancelLaunch);
    const origin = ready as Ready3;
    return { adapter: createChildOwnedAdapter(), close: stop, run: { origin: { browserStartedAt: new Date(origin.browserStartedAt), startedAtMs: origin.startedAtMs, clock: null, ...(origin.calibrationOffsetMs === null ? {} : { calibrationOffsetMs: origin.calibrationOffsetMs }) }, async kill(reason) { killReason ??= reason; await stop(); return { orderedStopCompleted: ordered }; }, async execute(request) {
                demand(!executed && !result && !violation);
                // A void/backpressured/disconnected send cannot prove non-delivery. Mark the
                // private attempt before entering transport; missing child receipts stay unknown.
                executed = true;
                reporter = request.reporter;
                child.send(execute);
                await wait(() => result !== null || exited || violation, runtimeDeadlineEpochMs-Date.now());
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
                if (!result && !exited && !violation) {
                    killReason ??= 'total-runtime';
                    await stop();
                }
                else
                    await stop();
                const final = result as Result3 | null;
                const usage=mergeSecretUseEvidence(provenSecretUseAfterLoss(Object.keys(job.secrets),job.artifact.inputRecipes,job.artifact.steps,executed,completedSteps),final?.secretUse,Object.keys(job.secrets));
                const recording=observeOwnedAppRecording(sealedVideo(),final?.recording.path,wasOrderly(final),quiescent);
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- IPC callbacks and stop may change this state while the parent awaits.
                return { ok: killReason === null && !violation && final?.ok === true, failureKind: killReason ? KILL_FAILURE_KINDS[killReason] : final?.errorCode === 'ASSERTION_FAILED' ? 'step' : final?.ok ? null : 'run-fault', failureMessage: killReason ? KILL_MESSAGES[killReason] : final?.errorCode ?? (violation ? 'INVALID_CONTRACT' : null), recording, observedHosts: [], secretUse: usage.facts, ...(final?.detail ? {detail: final.detail} : {}) };
            } } };
}

/** A child-supplied path is never an unrestricted file-upload capability. */

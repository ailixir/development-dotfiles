/**
 * Process entry point (AC-12, ADR-001 §3, `Dockerfile` `CMD`).
 *
 * `node dist/main.js` is the runner's **only** entry point (STUDIO-OBS-009 AC-1, ruling A2.1): the
 * guided worker is not a second process but a mode of this one, switched by
 * `STUDIO_RUNNER_GUIDED_ENABLED`, and it is served by the same TLS listener as the replay routes
 * (ruling A3). Nothing in this file selects a different process, and nothing listens in plaintext.
 *
 * It is deliberately thin — load configuration, run the startup guards in a fixed order, build the
 * application, listen, wire `SIGTERM` to the one drain — because everything worth testing lives in
 * `src/server/application.ts` and is tested there.
 *
 * **Startup order is normative (drop D1.0 section 3), and nothing listens before the last step:**
 *
 * 1. configuration: `loadConfig`, `loadListenerConfig`, `loadGuidedConfig`; every problem is one
 *    `configuration rejected: <problem>` line and exit 78;
 * 2. the process table must list this process (exit 69);
 * 3. guided only: the debug environment is refused (`CONFIGURATION_DENIED DEBUG_ENV`, exit 78);
 * 4. guided only: `assertObservedBrowserStartup()`, once per process (`GUIDED_WORKER_UNAVAILABLE`, exit 1);
 * 5. guided only: `canEnumerateLaunchTree()`, which includes pid > 1 (PID-1 a; `CONFIGURATION_DENIED
 *    LAUNCH_TREE`, exit 78). The guard is not removed, bypassed or relaxed to fit a PID-1 container;
 * 6. the TLS files, and for guided the controller public key, are read and checked (exit 78);
 * 7. guided only: the RUNNER-SCRATCH sweep (`prepareRecordingScratch`), so SIGKILL residue is reclaimed
 *    before a session can be assigned (`GUIDED_WORKER_UNAVAILABLE`, exit 1);
 * 8. the application is built and listens (any failure: `RUNNER_START_FAILED`, exit 1);
 * 9. one `SIGTERM`/`SIGINT` drain is registered.
 *
 * Every refusal is one value-free stderr line. None names a path, a variable value or a byte of a file,
 * so `terminationMessagePolicy: FallbackToLogsOnError` can show them in a pod description safely.
 *
 * **Configuration failure is a startup failure.** `loadConfig` rejects any unrecognised key in
 * the runner's namespace, so a mounted database URL or vault address stops the pod from starting
 * rather than sitting unread in the environment (AC-22c). The process reports the problems and
 * exits non-zero; it does not start degraded.
 *
 * **The browser is real from story 10.12 onward.** `UNAVAILABLE_LAUNCHER` — the placeholder that
 * refused every launch with `BROWSER_LAUNCH_UNAVAILABLE` — is gone, replaced by
 * `createChildBrowserLauncher`: a Chromium child process, sandboxed, recording native webm into
 * the per-run scratch directory, reporting step timings on one run-scoped clock zeroed at the
 * browser start. `launcher` stays an injectable dependency so the behavioural suite keeps running
 * against 10.6's in-process fake and `npm test` launches no browser (AC-25).
 */
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAllowAll } from './allowedDomains.js';
import { currentRuntimeVersions } from './compat/index.js';
import { assertObservedBrowserStartup } from './compat/runtime-versions.js';
import { canEnumerateProcessTree, createChildBrowserLauncher, readProcessTable } from './run/index.js';
import type { ChildLauncherOptions, ProcessRow } from './run/index.js';
import { launchGuidedBrowser } from './run/browser.js';
import { prepareRecordingScratch } from './run/recordingScratch.js';
import type { RecordingScratch } from './run/recordingScratch.js';
import { canEnumerateLaunchTree } from './run/tree.js';
import type { BrowserLauncher } from './server/adapters.js';
import { createApplication } from './server/application.js';
import type { GuidedModeDependencies, RunnerApplication } from './server/application.js';
import {
  ConfigurationError,
  loadConfig,
  loadGuidedConfig,
  loadListenerConfig,
  pathsOverlap,
} from './server/config.js';
import type { GuidedConfig, RunnerConfig } from './server/config.js';
import { readListenerMaterial } from './server/server.js';

/**
 * What the production path is allowed to hand the launcher: everything except the test seams.
 *
 * `ChildLauncherOptions` carries three injection points — `spawner`, `childModulePath` and
 * `parentEnv` — that exist so the unit tier can spawn no process, fork no real child and read no
 * real environment. Each is also honoured in production if supplied, so each is a way to replace
 * the forked module, the process that forks it, or the environment it is given, from a caller
 * rather than from a diff to `src/run/launcher.ts`.
 *
 * Removing them is not an option: the seams are what keep `npm test` browser-free (AC-25). So the
 * production path is typed *without* them instead. Object-literal excess-property checking turns
 * supplying one below into a compile error rather than a habit — and `test/run/production-seams.
 * test.ts` asserts the same property over the options actually constructed, including a
 * key-for-key equality that also catches a seam added to `ChildLauncherOptions` later. Story 10.13
 * is the next change to this constructor, which is why the guard is written now.
 */
type ProductionLauncherOptions = Omit<
  ChildLauncherOptions,
  'spawner' | 'childModulePath' | 'parentEnv'
>;

/**
 * The real launcher, built from configuration.
 *
 * Everything here is an enumerated configuration key (`src/server/config.ts`), so the recording
 * geometry and the two browser timeouts are chosen values rather than library defaults — §6.1
 * requires the recording resolution to be explicit, and §8.5 calls the timeouts starting values to
 * be tuned against staging measurements. No seam is supplied, so production always forks
 * `DEFAULT_CHILD_MODULE_PATH` through the real `fork`, with the environment the allowlist builds.
 */
export function createConfiguredLauncher(config: RunnerConfig): BrowserLauncher {
  const options: ProductionLauncherOptions = {
    recording: { width: config.recordingWidth, height: config.recordingHeight },
    stepTimeoutMs: config.stepTimeoutMs,
    launchTimeoutMs: config.browserLaunchTimeoutMs,
    stopTimeoutMs: config.browserStopTimeoutMs,
    maxFailureMessageLength: config.maxReportLogEntryLength,
    // ADR-002 §26.3: applied in the child's `takeRunOrigin`, carried there by the launch message.
    seekOriginCalibrationMs: config.seekOriginCalibrationMs,
    // The child holds no runner configuration; it receives the whitelist in its environment.
    allowedDomains: config.allowedDomains,
  };
  return createChildBrowserLauncher(options);
}

/**
 * The guided startup steps, injectable so the unit tier can drive the order and the refusals
 * without a browser, a pid of 1 or a real sweep. Production supplies none: `main.ts`'s own entry
 * block passes only the process's own environment and streams.
 */
export interface GuidedStartupSeams {
  /** Defaults to `launchGuidedBrowser`: the guided browser runs inside this process, unlike the replay child. */
  readonly launch?: GuidedModeDependencies['launch'] | undefined;
  /** Defaults to `assertObservedBrowserStartup()`. */
  readonly assertBuild?: (() => void) | undefined;
  /** Defaults to `canEnumerateLaunchTree()`. */
  readonly launchTree?: (() => boolean) | undefined;
  /** Defaults to `prepareRecordingScratch`. */
  readonly sweep?: typeof prepareRecordingScratch | undefined;
}

export interface MainOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Registers a signal handler. Injected so the drain path is testable without real signals. */
  readonly onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  readonly write: (line: string) => void;
  readonly setExitCode: (code: number) => void;
  readonly launcher?: BrowserLauncher | undefined;
  /**
   * Where to read `runtime-versions.json` from. Defaults to the copy the build embedded next to
   * the compiled entry points; a parameter only so a test can point it at a known record.
   */
  readonly runtimeVersionsFile?: string | undefined;
  /**
   * Reads the process table. Injected only so a test can stand in for an image without `ps`;
   * production always reads the real one (`src/run/tree.ts`).
   */
  readonly processTable?: (() => readonly ProcessRow[]) | undefined;
  readonly guidedSeams?: GuidedStartupSeams | undefined;
}

/**
 * What the runner says when it cannot enumerate a process tree (Studio v1 WP16), and the exit code
 * it leaves with (`EX_UNAVAILABLE`). Value-free: it names the tool, never the environment.
 */
export const PROCESS_TABLE_UNREADABLE =
  'process table unreadable: `ps -A -o pid=,ppid=` did not list this process. The runner stops a ' +
  'cancelled or timed-out browser by enumerating its process tree, and without `ps` (procps) it ' +
  'would signal the fork alone and orphan Chromium. Refusing to start.';
export const PROCESS_TABLE_EXIT_CODE = 69;
/** `EX_CONFIG`: configuration rejected, or a guided refusal that only the deployment can fix. */
export const CONFIG_EXIT_CODE = 78;
/**
 * The one line the runner writes at startup when `STUDIO_RUNNER_ALLOW_ALL_DOMAINS=true`. Value-free:
 * it names the option, never a URL or a domain.
 */
export const NAVIGATION_ALL_DOMAINS_WARNING = 'WARN navigation allowed to all domains (allow-all-domains=true)';
/** The closed reasons of a guided refusal (ruling Q2). Each is one value-free line. */
export const CONFIGURATION_DENIED_DEBUG_ENV = 'CONFIGURATION_DENIED DEBUG_ENV';
export const CONFIGURATION_DENIED_LAUNCH_TREE = 'CONFIGURATION_DENIED LAUNCH_TREE';
/** A guided start step that failed after configuration was accepted (build identity, scratch sweep). */
export const GUIDED_WORKER_UNAVAILABLE = 'GUIDED_WORKER_UNAVAILABLE';
/** Any other failure after configuration was accepted (for example the listener could not bind). */
export const RUNNER_START_FAILED = 'RUNNER_START_FAILED';

const DEBUG_ENVIRONMENT = ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS'] as const;

export interface MainResult {
  readonly started: boolean;
  readonly port?: number;
  readonly application?: RunnerApplication;
}

/** Resolves a path through the symlinks of its longest existing ancestor, as `realpath` would. */
function realResolve(path: string): string {
  const absolute = resolve(path);
  const tail: string[] = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return absolute;
    tail.unshift(basename(current));
    current = parent;
  }
  return join(realpathSync(current), ...tail);
}

export async function main(options: MainOptions): Promise<MainResult> {
  // ── 1. Configuration: every loader reports every problem, and one exit covers them all. ──────
  const problems: string[] = [];
  const collect = <T>(load: () => T): T | undefined => {
    try {
      return load();
    } catch (error) {
      // The loaders throw only `ConfigurationError`. Anything else is a programming fault and
      // must not be laundered into an exit code that claims the deployment mis-configured the pod.
      if (!(error instanceof ConfigurationError)) throw error;
      problems.push(...error.problems);
      return undefined;
    }
  };
  const config = collect(() => loadConfig(options.env));
  const listenerConfig = collect(() => loadListenerConfig(options.env));
  const guidedConfig = collect(() => loadGuidedConfig(options.env));
  if (config !== undefined && guidedConfig?.enabled === true) {
    // The loader tests the journal lexically; the volume may be reached through a symlink.
    for (const [name, root] of [['SCRATCH_DIR', config.scratchDir], ['OBJECT_STORE_DIR', config.objectStoreDir]] as const) {
      if (pathsOverlap(realResolve(guidedConfig.journalDirectory), realResolve(root))) {
        problems.push(`STUDIO_RUNNER_GUIDED_JOURNAL_DIR must be disjoint from STUDIO_RUNNER_${name}; scratch is deleted on restart.`);
      }
    }
  }
  if (problems.length > 0 || config === undefined || listenerConfig === undefined || guidedConfig === undefined) {
    for (const problem of new Set(problems)) options.write(`configuration rejected: ${problem}`);
    options.setExitCode(CONFIG_EXIT_CODE);
    return { started: false };
  }

  // The allow-all option is a deliberate widening of the only navigation control: say so once, early.
  if (isAllowAll(config.allowedDomains)) options.write(NAVIGATION_ALL_DOMAINS_WARNING);

  // ── 2. The in-image `ps` guard (Studio v1 WP16). Checked before anything listens, so a pod on an
  // image that lost `procps` never becomes ready rather than serving runs it cannot stop. ────────
  if (!canEnumerateProcessTree((options.processTable ?? readProcessTable)())) {
    options.write(PROCESS_TABLE_UNREADABLE);
    options.setExitCode(PROCESS_TABLE_EXIT_CODE);
    return { started: false };
  }

  const refuse = (line: string, code: number): MainResult => {
    options.write(line);
    options.setExitCode(code);
    return { started: false };
  };
  const seams = options.guidedSeams ?? {};

  try {
    // ── 3-5. Guided only. The order is fixed by ruling A2.5. ───────────────────────────────────
    if (guidedConfig.enabled) {
      if (DEBUG_ENVIRONMENT.some((name) => (options.env[name] ?? '') !== '')) {
        return refuse(CONFIGURATION_DENIED_DEBUG_ENV, CONFIG_EXIT_CODE);
      }
      try {
        (seams.assertBuild ?? assertObservedBrowserStartup)();
      } catch {
        return refuse(GUIDED_WORKER_UNAVAILABLE, 1);
      }
      // REL-001/D4: a start that misses its deadline is cleaned up by listing this process's
      // children. Without `ps`, with a `ps` that cannot print command lines, or as pid 1, every
      // kill would silently find nothing, so a guided runner refuses to start.
      if (!(seams.launchTree ?? canEnumerateLaunchTree)()) {
        return refuse(CONFIGURATION_DENIED_LAUNCH_TREE, CONFIG_EXIT_CODE);
      }
    }

    // ── 6. The files. Read once; a rotation is a Secret update plus a restart (ruling 1.5 e). ───
    const material = readListenerMaterial(listenerConfig);
    const fileProblems: string[] = material.ok ? [] : [...material.problems];
    let controllerPublicKey = '';
    if (guidedConfig.enabled) {
      try {
        controllerPublicKey = readFileSync(guidedConfig.controllerPublicKeyFile, 'utf8');
        const key = createPublicKey(controllerPublicKey);
        if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
          fileProblems.push('STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE must hold an RSA public key of at least 2048 bits.');
        }
      } catch {
        fileProblems.push('STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE could not be read as a PEM public key.');
      }
    }
    if (!material.ok || fileProblems.length > 0) {
      for (const problem of fileProblems) options.write(`configuration rejected: ${problem}`);
      options.setExitCode(CONFIG_EXIT_CODE);
      return { started: false };
    }

    // ── 7. RUNNER-SCRATCH: reclaim SIGKILL residue before a session can be assigned. ────────────
    let guided: GuidedModeDependencies | undefined;
    if (guidedConfig.enabled) {
      let recordingScratch: RecordingScratch;
      let launch: GuidedModeDependencies['launch'];
      try {
        recordingScratch = await (seams.sweep ?? prepareRecordingScratch)({
          workerId: guidedConfig.workerId,
          journalDirectory: guidedConfig.journalDirectory,
        });
        launch = seams.launch ?? launchGuidedBrowser;
      } catch {
        return refuse(GUIDED_WORKER_UNAVAILABLE, 1);
      }
      guided = guidedModeDependencies(guidedConfig, controllerPublicKey, launch, recordingScratch);
    }

    // ── 8. Build and listen. ───────────────────────────────────────────────────────────────────
    const application = createApplication(config, {
      listener: material.settings,
      guided,
      launcher: options.launcher ?? createConfiguredLauncher(config),
      runtimeVersions: { ...currentRuntimeVersions(options.runtimeVersionsFile) } as Record<
        string,
        unknown
      >,
    });

    const port = await application.start();

    // ── 9. One drain for both halves. Exit 1 only when a guided stop could not be confirmed: a
    // survivor holds the one guided slot until the process ends (ruling Q5). ─────────────────────
    let draining = false;
    const drain = (): void => {
      if (draining) return;
      draining = true;
      void application.drain().then(
        (result) => {
          if (!result.guidedClosed) options.setExitCode(1);
        },
        () => {
          options.setExitCode(1);
        },
      );
    };
    options.onSignal('SIGTERM', drain);
    options.onSignal('SIGINT', drain);

    return { started: true, port, application };
  } catch {
    // Closed, value-free, and the same for every failure after configuration was accepted: no
    // message, no stack and no path reach stderr.
    return refuse(RUNNER_START_FAILED, 1);
  }
}

function guidedModeDependencies(
  guided: Extract<GuidedConfig, { enabled: true }>,
  controllerPublicKey: string,
  launch: GuidedModeDependencies['launch'],
  recordingScratch: RecordingScratch,
): GuidedModeDependencies {
  return {
    workerId: guided.workerId,
    journalDirectory: guided.journalDirectory,
    controllerJwt: {
      issuer: guided.controllerIssuer,
      subject: guided.controllerSubject,
      publicKey: controllerPublicKey,
    },
    callbackBaseUrl: guided.callbackBaseUrl,
    callbackToken: async () => (await readFile(guided.callbackTokenFile, 'utf8')).trim(),
    launch,
    recordingScratch,
    capacity: guided.capacity,
  };
}

// Not reachable under vitest: the module is imported, never invoked as the entry point.
/* v8 ignore start */
if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main({
    env: process.env,
    onSignal: (signal, handler) => {
      process.on(signal, handler);
    },
    write: (line) => process.stderr.write(`${line}\n`),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  }).catch(() => {
    // A programming fault escaped `main`. One closed line, no message or stack, and a non-zero exit.
    process.stderr.write(`${RUNNER_START_FAILED}\n`);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */

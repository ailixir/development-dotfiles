import type { ProcessRow } from './run/index.js';
import { prepareRecordingScratch } from './run/recordingScratch.js';
import type { BrowserLauncher } from './server/adapters.js';
import type { GuidedModeDependencies, RunnerApplication } from './server/application.js';
import type { RunnerConfig } from './server/config.js';
/**
 * The real launcher, built from configuration.
 *
 * Everything here is an enumerated configuration key (`src/server/config.ts`), so the recording
 * geometry and the two browser timeouts are chosen values rather than library defaults — §6.1
 * requires the recording resolution to be explicit, and §8.5 calls the timeouts starting values to
 * be tuned against staging measurements. No seam is supplied, so production always forks
 * `DEFAULT_CHILD_MODULE_PATH` through the real `fork`, with the environment the allowlist builds.
 */
export declare function createConfiguredLauncher(config: RunnerConfig): BrowserLauncher;
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
export declare const PROCESS_TABLE_UNREADABLE: string;
export declare const PROCESS_TABLE_EXIT_CODE = 69;
/** `EX_CONFIG`: configuration rejected, or a guided refusal that only the deployment can fix. */
export declare const CONFIG_EXIT_CODE = 78;
/** The closed reasons of a guided refusal (ruling Q2). Each is one value-free line. */
export declare const CONFIGURATION_DENIED_DEBUG_ENV = "CONFIGURATION_DENIED DEBUG_ENV";
export declare const CONFIGURATION_DENIED_LAUNCH_TREE = "CONFIGURATION_DENIED LAUNCH_TREE";
/** A guided start step that failed after configuration was accepted (build identity, scratch sweep). */
export declare const GUIDED_WORKER_UNAVAILABLE = "GUIDED_WORKER_UNAVAILABLE";
/** Any other failure after configuration was accepted (for example the listener could not bind). */
export declare const RUNNER_START_FAILED = "RUNNER_START_FAILED";
export interface MainResult {
    readonly started: boolean;
    readonly port?: number;
    readonly application?: RunnerApplication;
}
export declare function main(options: MainOptions): Promise<MainResult>;

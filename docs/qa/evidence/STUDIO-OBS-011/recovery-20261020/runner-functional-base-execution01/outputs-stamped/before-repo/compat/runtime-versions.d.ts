import type { BuildIdentity } from '../executor/observedOperations.js';
/**
 * The identity fields every runtime-versions record must carry.
 *
 * STUDIO-OBS-009 AC-1 P2 b: the required list names the Playwright pin and the observed identities
 * the runner reports on every run (`observedSchemaBundleHash`, `observedReferenceBundleHash`,
 * `observedChromiumBuild`, `observedBrowserLauncherSha256`). The artifact-1 stamps it used to name
 * (`validatorSchema`, `syntaxReference`, `executor`) are gone, and no old field stands in for a
 * missing observed one: `loadRuntimeVersions` refuses the file.
 */
export interface RuntimeVersions {
    readonly playwright: string;
    readonly observedSchemaBundleHash: string;
    readonly observedReferenceBundleHash: string;
    readonly observedChromiumBuild: string;
    readonly observedBrowserLauncherSha256: string;
}
/**
 * Default location: `dist/runtime-versions.json`, resolved from the compiled module's own URL.
 *
 * Running from `src/` (tests, `tsx`) this points at `src/runtime-versions.json`, which does not
 * exist; callers in that situation pass an explicit path or an explicit `RuntimeVersions` value.
 */
export declare const DEFAULT_RUNTIME_VERSIONS_FILE: string;
/** Everything `write-runtime-versions.mjs` records. Only the compared subset is typed strictly. */
export interface RecordedRuntimeVersions extends RuntimeVersions {
    readonly playwrightLocked: string | null;
    readonly playwrightImageTag: string | null;
    readonly chromiumBuild: string | null;
    readonly node: string;
    readonly nodeEngineRange: string | null;
    readonly nodeMajorPin: string | null;
    readonly observedBrowserProvenance: Readonly<Record<string, unknown>> | null;
    readonly image: string | null;
}
/**
 * Loads and validates the recorded runtime versions.
 *
 * Fails closed: a file missing a required version field is an error, not a
 * silently permissive default.
 */
export declare function loadRuntimeVersions(file?: string): RecordedRuntimeVersions;
export declare function currentRuntimeVersions(file?: string): RecordedRuntimeVersions;
/** Test seam: drops the memoised value so a later call re-reads the file. */
export declare function resetRuntimeVersionsCache(): void;
/** A deployment catalog authorizes a build; the job cannot choose or populate this record. */
export declare function assertObservedBrowserStartup(runtimeFile?: string, env?: Readonly<Record<string, string | undefined>>, launcherFile?: string): void;
export declare function loadObservedBuild(env?: Readonly<Record<string, string | undefined>>, runtimeFile?: string, referenceFile?: string, launcherFile?: string): BuildIdentity | null;

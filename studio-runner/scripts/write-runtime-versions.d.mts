/** Types for `scripts/write-runtime-versions.mjs`. See `check-pins.d.mts` for the rationale. */

export interface RecordedVersions {
  readonly playwright: string | null;
  readonly playwrightLocked: string | null;
  readonly playwrightImageTag: string | null;
  readonly chromiumBuild: string | null;
  readonly node: string;
  readonly nodeEngineRange: string | null;
  readonly nodeMajorPin: string;
  readonly image: string | null;
}

export declare function readChromiumBuild(browsersPath: string | undefined): string | null;
/** Absent, empty and whitespace-only environment values all collapse to `null` (QA MED-1). */
export declare function optionalEnv(value: unknown): string | null;
export interface RuntimeVersionsInput {
  readonly root: string;
  readonly env: Record<string, string | undefined>;
  readonly nodeVersion: string;
}

export declare function buildRuntimeVersions(input: RuntimeVersionsInput): RecordedVersions;
/** Writes `<root>/dist/runtime-versions.json` and returns the path it wrote. */
export declare function writeRuntimeVersionsFile(input: RuntimeVersionsInput): string;
export declare function runCli(): Promise<number>;

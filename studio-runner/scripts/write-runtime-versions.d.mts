/** Types for `scripts/write-runtime-versions.mjs`. See `check-pins.d.mts` for the rationale. */

export interface RecordedVersions {
  readonly playwright: string | null;
  readonly playwrightLocked: string | null;
  readonly playwrightImageTag: string | null;
  readonly chromiumBuild: string | null;
  readonly node: string;
  readonly nodeEngineRange: string | null;
  readonly nodeMajorPin: string;
  readonly validatorSchema: string;
  readonly validatorParser: string;
  readonly syntaxReference: string;
  readonly executor: string;
  readonly artifact: number;
  readonly image: string | null;
}

export interface VersionConstants {
  readonly VALIDATOR_SCHEMA_VERSION: string;
  readonly SYNTAX_REFERENCE_VERSION: string;
  readonly EXECUTOR_VERSION: string;
  readonly ARTIFACT_VERSION: number;
  readonly VALIDATOR_PARSER: { readonly name: string; readonly version: string };
}

export declare function readChromiumBuild(browsersPath: string | undefined): string | null;
export interface RuntimeVersionsInput {
  readonly root: string;
  readonly versions: VersionConstants;
  readonly env: Record<string, string | undefined>;
  readonly nodeVersion: string;
}

export declare function buildRuntimeVersions(input: RuntimeVersionsInput): RecordedVersions;
/** Writes `<root>/dist/runtime-versions.json` and returns the path it wrote. */
export declare function writeRuntimeVersionsFile(input: RuntimeVersionsInput): string;
export declare function runCli(): Promise<number>;

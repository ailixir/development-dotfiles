/**
 * Types for `scripts/print-observed-catalog.mjs`, following the `check-pins.d.mts` precedent: build-time
 * scripts stay plain ESM so they run with bare `node`, and their contract is declared here so the
 * type-checked tests can import them.
 */

export interface CatalogBuildIdentity {
  readonly profileHash: string;
  readonly schemaBundleHash: string;
  readonly referenceBundleHash: string;
  readonly executableImageDigest: string;
  readonly chromiumBuild: string;
}

export interface CatalogEntry {
  readonly profile: Readonly<Record<string, unknown>>;
  readonly build: CatalogBuildIdentity;
}

export interface CatalogInputs {
  readonly schemas: unknown;
  readonly references: unknown;
  readonly runtime: unknown;
}

export interface CatalogOutput {
  write(text: string): unknown;
}

export declare function canonicalObserved(value: unknown): string;
export declare function hashObserved(value: unknown): string;
/** 64 lowercase hex; a leading `sha256:` is dropped. Throws `CATALOG_ENTRY_REFUSED` otherwise. */
export declare function normalizeDigest(argument: unknown): string;
export declare function observedProfile(schemas: unknown): Record<string, unknown>;
export declare function validateBuildIdentity(build: unknown, schemas: unknown): void;
export declare function buildCatalogEntry(input: CatalogInputs & { readonly executableImageDigest: unknown }): CatalogEntry;
export declare function loadDistInputs(root: string): CatalogInputs;
/** 0: one JSON line on stdout. 1: refused, reason on stderr only. 2: usage. */
export declare function runCli(input: {
  readonly argv: readonly string[];
  readonly root?: string;
  readonly stdout?: CatalogOutput;
  readonly stderr?: CatalogOutput;
}): number;

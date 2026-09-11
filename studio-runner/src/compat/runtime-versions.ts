/**
 * Reads the `runtime-versions.json` this build emitted (ADR-001 §4.2, architecture §4.6).
 *
 * `scripts/write-runtime-versions.mjs` writes the file next to the compiled entry points, so the
 * shipped `dist/compat/runtime-versions.js` finds it one directory up. Nothing here recomputes the
 * versions: the file is the record of what the image was built with, and reading it — rather than
 * re-deriving it from constants — is what makes a stale image detectable at runtime.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { RuntimeVersions } from './compatibility.js';

/**
 * Default location: `dist/runtime-versions.json`, resolved from the compiled module's own URL.
 *
 * Running from `src/` (tests, `tsx`) this points at `src/runtime-versions.json`, which does not
 * exist; callers in that situation pass an explicit path or an explicit `RuntimeVersions` value.
 */
export const DEFAULT_RUNTIME_VERSIONS_FILE = fileURLToPath(
  new URL('../runtime-versions.json', import.meta.url),
);

/** Everything `write-runtime-versions.mjs` records. Only the compared subset is typed strictly. */
export interface RecordedRuntimeVersions extends RuntimeVersions {
  readonly playwrightLocked: string | null;
  readonly playwrightImageTag: string | null;
  readonly chromiumBuild: string | null;
  readonly node: string;
  readonly nodeEngineRange: string | null;
  readonly nodeMajorPin: string | null;
  readonly validatorParser: string;
  readonly artifact: number;
  readonly image: string | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Loads and validates the recorded runtime versions.
 *
 * Fails closed: a file missing the fields the compatibility check compares is an error, not a
 * silently permissive default.
 */
export function loadRuntimeVersions(
  file: string = DEFAULT_RUNTIME_VERSIONS_FILE,
): RecordedRuntimeVersions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read runtime versions from ${file}: ${error instanceof Error ? error.message : 'unknown error'}. ` +
        'Run `npm run build` to emit it.',
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${file} does not contain a runtime-versions object.`);
  }

  const record = parsed as Record<string, unknown>;
  const missing = (['playwright', 'validatorSchema', 'syntaxReference', 'executor'] as const).filter(
    (field) => !isNonEmptyString(record[field]),
  );
  if (missing.length > 0) {
    throw new Error(`${file} is missing required version fields: ${missing.join(', ')}.`);
  }

  return record as unknown as RecordedRuntimeVersions;
}

/**
 * Memoised accessor used as the default runtime for `isCompatible`.
 *
 * The file is immutable for the life of the process — it is baked into the image — so it is read
 * once. `file` is a parameter only so the check can be pointed at a specific record in tests.
 */
let cached: RecordedRuntimeVersions | null = null;

export function currentRuntimeVersions(
  file: string = DEFAULT_RUNTIME_VERSIONS_FILE,
): RecordedRuntimeVersions {
  cached ??= loadRuntimeVersions(file);
  return cached;
}

/** Test seam: drops the memoised value so a later call re-reads the file. */
export function resetRuntimeVersionsCache(): void {
  cached = null;
}

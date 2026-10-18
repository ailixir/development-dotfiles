#!/usr/bin/env node
/**
 * Prints the runner image's OWN catalog entry, `{profile, build}`, as one JSON line on stdout
 * (STUDIO-OBS-009 residue; STUDIO-OBS-010 live-surface ruling section B, item 10).
 *
 *   node scripts/print-observed-catalog.mjs <executableImageDigest>
 *
 * The entry is what `STUDIO_RUNNER_OBSERVED_CATALOG_FILE` holds and what the backend's
 * `studio.observed-replay.catalog-json` lists: the identity `loadObservedBuild`
 * (`src/compat/runtime-versions.ts`) accepts for this very image. It was derived inline in
 * `ObservedCoRunIT.realCatalog()`; this is that derivation, with the same formulas:
 *
 *   profile               the const of every `replay-profile` property (`OBSERVED_PROFILE`)
 *   profileHash           hash(profile)
 *   schemaBundleHash      hash(dist/validator/observedSchemas.json)    (`OBSERVED_SCHEMA_BUNDLE_HASH`)
 *   referenceBundleHash   hash(dist/observed-reference.json)           (what the loader compares)
 *   chromiumBuild         dist/runtime-versions.json `observedChromiumBuild`
 *   executableImageDigest the argument: the 64-hex image manifest digest, without `sha256:`
 *
 * `hash` is the canonical-v1 SHA-256 of `canonicalObserved`. Before printing, the entry is checked
 * against the `BuildIdentity` schema of the packaged bundle, and the recorded identities in
 * `dist/runtime-versions.json` must agree with the files they describe, as the loader requires.
 * Any disagreement refuses (exit 1) and prints nothing on stdout: a stale or foreign `dist/`
 * never produces a catalog entry.
 *
 * Run it INSIDE the pushed image, where `dist/` is the one that will run. The browser is not
 * started and nothing is written. It reads packaged JSON only, so it imports no `dist` code and
 * needs no dynamic evaluation (`test/no-dynamic-evaluation.test.ts` forbids both in `dist/`).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function refuse(reason) {
  throw new Error(`CATALOG_ENTRY_REFUSED: ${reason}`);
}

const isPlainRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const validUnicode = (value) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

/** The runner's `canonicalObserved` (src/validator/observedReferencePolicy.ts), refusing the same values. */
export function canonicalObserved(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!validUnicode(value)) refuse('a string is not valid Unicode');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) refuse('a number is not a safe integer');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalObserved).join(',')}]`;
  if (!isPlainRecord(value)) refuse('a value is not plain JSON');
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      if (!/^[\x20-\x7e]+$/u.test(key)) refuse('a key is not printable ASCII');
      return `${JSON.stringify(key)}:${canonicalObserved(value[key])}`;
    })
    .join(',')}}`;
}

export function hashObserved(value) {
  return createHash('sha256').update(canonicalObserved(value), 'utf8').digest('hex');
}

const DIGEST = /^[a-f0-9]{64}$/u;

/** The manifest digest as the schema wants it: 64 lowercase hex. A leading `sha256:` is accepted and dropped. */
export function normalizeDigest(argument) {
  const bare = typeof argument === 'string' ? argument.replace(/^sha256:/u, '') : '';
  if (!DIGEST.test(bare)) refuse('the image digest must be 64 lowercase hex characters (a leading "sha256:" is allowed)');
  return bare;
}

/** `OBSERVED_PROFILE`: the const of every property of the packaged `replay-profile` schema. */
export function observedProfile(schemas) {
  const properties = schemas?.['replay-profile']?.properties;
  if (!isPlainRecord(properties) || Object.keys(properties).length === 0) refuse('the packaged replay-profile schema has no properties');
  return Object.fromEntries(
    Object.entries(properties).map(([key, schema]) => {
      if (!isPlainRecord(schema) || !Object.hasOwn(schema, 'const')) refuse(`replay-profile property ${key} has no const`);
      return [key, schema.const];
    }),
  );
}

const OBJECT_KEYWORDS = new Set(['type', 'additionalProperties', 'properties', 'required']);
const STRING_KEYWORDS = new Set(['type', 'pattern', 'minLength', 'maxLength']);

/**
 * Checks `build` against `replay-profile#/definitions/BuildIdentity` of the packaged bundle, the schema the
 * loader validates with. This reads only the keywords that schema uses today (closed object, required
 * strings with `pattern`, `minLength`, `maxLength`) and refuses any other keyword instead of skipping it,
 * so a schema that grows cannot be silently under-checked.
 */
export function validateBuildIdentity(build, schemas) {
  const schema = schemas?.['replay-profile']?.definitions?.BuildIdentity;
  if (!isPlainRecord(schema)) refuse('the packaged bundle has no BuildIdentity schema');
  for (const keyword of Object.keys(schema)) if (!OBJECT_KEYWORDS.has(keyword)) refuse(`BuildIdentity uses the unsupported keyword ${keyword}`);
  if (schema.type !== 'object' || schema.additionalProperties !== false || !isPlainRecord(schema.properties) || !Array.isArray(schema.required)) {
    refuse('BuildIdentity is not a closed object schema');
  }
  if (!isPlainRecord(build)) refuse('the build identity is not an object');
  for (const key of Object.keys(build)) if (!Object.hasOwn(schema.properties, key)) refuse(`the build identity has the unknown field ${key}`);
  for (const key of schema.required) if (!Object.hasOwn(build, key)) refuse(`the build identity lacks ${String(key)}`);
  for (const [key, rule] of Object.entries(schema.properties)) {
    if (!isPlainRecord(rule)) refuse(`BuildIdentity.${key} is not a schema`);
    for (const keyword of Object.keys(rule)) if (!STRING_KEYWORDS.has(keyword)) refuse(`BuildIdentity.${key} uses the unsupported keyword ${keyword}`);
    if (rule.type !== 'string') refuse(`BuildIdentity.${key} is not a string schema`);
    const value = build[key];
    if (typeof value !== 'string') refuse(`the build identity field ${key} is not a string`);
    if (typeof rule.pattern === 'string' && !new RegExp(rule.pattern, 'u').test(value)) refuse(`the build identity field ${key} does not match its pattern`);
    if (Number.isInteger(rule.minLength) && value.length < rule.minLength) refuse(`the build identity field ${key} is too short`);
    if (Number.isInteger(rule.maxLength) && value.length > rule.maxLength) refuse(`the build identity field ${key} is too long`);
  }
}

/**
 * The catalog entry for one image. `schemas`, `references` and `runtime` are the parsed packaged files
 * (`dist/validator/observedSchemas.json`, `dist/observed-reference.json`, `dist/runtime-versions.json`).
 */
export function buildCatalogEntry({ schemas, references, runtime, executableImageDigest }) {
  const profile = observedProfile(schemas);
  const build = {
    profileHash: hashObserved(profile),
    schemaBundleHash: hashObserved(schemas),
    referenceBundleHash: hashObserved(references),
    executableImageDigest: normalizeDigest(executableImageDigest),
    chromiumBuild: isPlainRecord(runtime) ? runtime.observedChromiumBuild : undefined,
  };
  // The loader requires the recorded identities to equal the files they describe (src/compat/runtime-versions.ts).
  if (!isPlainRecord(runtime) || runtime.observedSchemaBundleHash !== build.schemaBundleHash) {
    refuse('dist/runtime-versions.json does not record this schema bundle: dist is stale');
  }
  if (runtime.observedReferenceBundleHash !== build.referenceBundleHash) {
    refuse('dist/runtime-versions.json does not record this reference bundle: dist is stale');
  }
  if (typeof build.chromiumBuild !== 'string' || build.chromiumBuild === '') {
    refuse('dist/runtime-versions.json records no Chromium build: run this inside the runner image');
  }
  validateBuildIdentity(build, schemas);
  return { profile, build };
}

/** Reads the three packaged files under `<root>/dist`. */
export function loadDistInputs(root) {
  const read = (relative) => {
    try {
      return JSON.parse(readFileSync(join(root, 'dist', relative), 'utf8'));
    } catch {
      return refuse(`dist/${relative} is missing or is not JSON: build the image first`);
    }
  };
  return {
    schemas: read(join('validator', 'observedSchemas.json')),
    references: read('observed-reference.json'),
    runtime: read('runtime-versions.json'),
  };
}

/**
 * CLI body: returns the exit code. 0 prints exactly one JSON line on stdout; 1 refuses with a reason on
 * stderr and nothing on stdout; 2 is a usage error.
 *
 * @param {{argv: readonly string[], root?: string, stdout?: {write(text: string): unknown}, stderr?: {write(text: string): unknown}}} input
 */
export function runCli({ argv, root = join(here, '..'), stdout = process.stdout, stderr = process.stderr }) {
  if (argv.length !== 1) {
    stderr.write('Usage: node scripts/print-observed-catalog.mjs <executableImageDigest>\n');
    return 2;
  }
  try {
    const entry = buildCatalogEntry({ ...loadDistInputs(root), executableImageDigest: argv[0] });
    stdout.write(`${JSON.stringify(entry)}\n`);
    return 0;
  } catch (failure) {
    stderr.write(`${failure instanceof Error ? failure.message : String(failure)}\n`);
    return 1;
  }
}

/* The wrapper below only forwards process.argv; everything it computes is covered above. */
/* v8 ignore start */
if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({ argv: process.argv.slice(2) });
}
/* v8 ignore stop */

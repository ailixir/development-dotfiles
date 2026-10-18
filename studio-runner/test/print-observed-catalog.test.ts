import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  buildCatalogEntry,
  hashObserved as scriptHash,
  loadDistInputs,
  normalizeDigest,
  observedProfile,
  runCli,
  validateBuildIdentity,
} from '../scripts/print-observed-catalog.mjs';
import {
  OBSERVED_PROFILE,
  OBSERVED_SCHEMA_BUNDLE_HASH,
  hashObserved,
  validateObserved,
} from '../src/validator/observedReferencePolicy.js';
import { packageRoot } from './helpers/corpus.js';

/**
 * STUDIO-OBS-009 residue (STUDIO-OBS-010 live-surface ruling B5 item 10): the runner prints its own
 * `{profile, build}` catalog entry. `ObservedCoRunIT.realCatalog()` derived it inline; the script must derive
 * the same value, and must refuse instead of printing when `dist/` disagrees with itself.
 *
 * The parity cases compare the script (which reads packaged JSON and imports no `dist` code) with the runner's
 * own functions from `src/`, so a drift in either side reddens here.
 */

const DIGEST = 'b'.repeat(64);
const CHROMIUM = '1243';

interface Packaged {
  schemas: unknown;
  references: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

interface Bundle {
  'replay-profile': {
    properties: Record<string, Record<string, unknown>>;
    definitions: { BuildIdentity: Record<string, unknown> & { properties: Record<string, Record<string, unknown>> } };
  };
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function realSchemas(): unknown {
  return JSON.parse(readFileSync(join(packageRoot, 'src', 'validator', 'observedSchemas.json'), 'utf8'));
}

/** What `write-runtime-versions.mjs` packages: the schema bundle, the keyed reference files, the recorded identities. */
function packaged(): Packaged {
  const directory = join(packageRoot, 'fixtures', 'observed-reference');
  const references = Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => [name, JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown]),
  );
  return {
    schemas: realSchemas(),
    references,
    runtime: {
      observedSchemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH,
      observedReferenceBundleHash: hashObserved(references),
      observedChromiumBuild: CHROMIUM,
    },
  };
}

function writeRoot(parts: Packaged): string {
  const root = mkdtempSync(join(tmpdir(), 'studio-runner-catalog-'));
  roots.push(root);
  mkdirSync(join(root, 'dist', 'validator'), { recursive: true });
  writeFileSync(join(root, 'dist', 'validator', 'observedSchemas.json'), JSON.stringify(parts.schemas));
  writeFileSync(join(root, 'dist', 'observed-reference.json'), JSON.stringify(parts.references));
  writeFileSync(join(root, 'dist', 'runtime-versions.json'), JSON.stringify(parts.runtime));
  return root;
}

function run(argv: readonly string[], root: string): { code: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const code = runCli({
    argv,
    root,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
  });
  return { code, stdout, stderr };
}

function withBundle(change: (bundle: Bundle) => void): unknown {
  const bundle = structuredClone(realSchemas()) as Bundle;
  change(bundle);
  return bundle;
}

describe('print-observed-catalog parity with the runner', () => {
  it('derives the profile and the build identity the runner derives', () => {
    const parts = packaged();
    const entry = buildCatalogEntry({ ...parts, executableImageDigest: DIGEST });
    expect(entry.profile).toEqual(OBSERVED_PROFILE);
    expect(entry.build).toEqual({
      profileHash: hashObserved(OBSERVED_PROFILE),
      schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH,
      referenceBundleHash: hashObserved(parts.references),
      executableImageDigest: DIGEST,
      chromiumBuild: CHROMIUM,
    });
    // The loader (loadObservedBuild) accepts exactly the keys build and profile, and validates the build like this.
    expect(Object.keys(entry).sort()).toEqual(['build', 'profile']);
    expect(validateObserved('replay-profile#/definitions/BuildIdentity', entry.build)).toEqual(entry.build);
  });

  it('hashes like the runner, including keys out of order and non-ASCII text', () => {
    for (const value of [{ b: 1, a: [true, null, 'é🧪'] }, { contract: 3 }, [], 'x']) {
      expect(scriptHash(value)).toBe(hashObserved(value));
    }
    expect(() => scriptHash({ n: 1.5 })).toThrow('CATALOG_ENTRY_REFUSED');
    expect(() => scriptHash({ n: -0 })).toThrow('CATALOG_ENTRY_REFUSED');
    expect(() => scriptHash('\ud800')).toThrow('CATALOG_ENTRY_REFUSED');
    expect(() => scriptHash({ é: 1 })).toThrow('CATALOG_ENTRY_REFUSED');
    expect(() => scriptHash(undefined)).toThrow('CATALOG_ENTRY_REFUSED');
  });

  it('reads the profile from the schema consts, as OBSERVED_PROFILE does', () => {
    expect(observedProfile(realSchemas())).toEqual(OBSERVED_PROFILE);
    expect(() => observedProfile({})).toThrow('no properties');
    expect(() => observedProfile(withBundle((b) => { b['replay-profile'].properties.contract = {}; }))).toThrow('no const');
  });
});

describe('print-observed-catalog CLI', () => {
  it('prints exactly one JSON line and exits 0', () => {
    const root = writeRoot(packaged());
    const result = run([DIGEST], root);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.endsWith('\n')).toBe(true);
    expect(result.stdout.trimEnd().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout) as unknown).toEqual(buildCatalogEntry({ ...loadDistInputs(root), executableImageDigest: DIGEST }));
  });

  it('accepts the digest with its sha256: prefix and prints it bare', () => {
    const result = run([`sha256:${DIGEST}`], writeRoot(packaged()));
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as { build: { executableImageDigest: string } }).build.executableImageDigest).toBe(DIGEST);
  });

  it('exits 2 with a usage line for no argument or more than one', () => {
    const root = writeRoot(packaged());
    for (const argv of [[], [DIGEST, DIGEST]]) {
      const result = run(argv, root);
      expect(result).toMatchObject({ code: 2, stdout: '' });
      expect(result.stderr).toContain('Usage: node scripts/print-observed-catalog.mjs');
    }
  });

  it.each([
    ['too short', 'b'.repeat(63)],
    ['too long', 'b'.repeat(65)],
    ['upper case', 'B'.repeat(64)],
    ['not hex', 'g'.repeat(64)],
    ['a tag, not a digest', 'registry/checks-studio-runner:0.1.0'],
    ['empty', ''],
    ['double prefix', `sha256:sha256:${DIGEST}`],
  ])('refuses a digest that is %s, with nothing on stdout', (_label, digest) => {
    const result = run([digest], writeRoot(packaged()));
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('CATALOG_ENTRY_REFUSED');
  });

  it('refuses a root without a built dist', () => {
    const empty = mkdtempSync(join(tmpdir(), 'studio-runner-catalog-empty-'));
    roots.push(empty);
    const result = run([DIGEST], empty);
    expect(result).toMatchObject({ code: 1, stdout: '' });
    expect(result.stderr).toContain('build the image first');
  });

  it('refuses a dist file that is not JSON', () => {
    const root = writeRoot(packaged());
    writeFileSync(join(root, 'dist', 'runtime-versions.json'), '{not json');
    expect(run([DIGEST], root)).toMatchObject({ code: 1, stdout: '' });
  });
});

describe('print-observed-catalog refuses a dist that disagrees with itself', () => {
  it('refuses a runtime record of another schema bundle', () => {
    const parts = packaged();
    parts.runtime.observedSchemaBundleHash = 'a'.repeat(64);
    expect(() => buildCatalogEntry({ ...parts, executableImageDigest: DIGEST })).toThrow('does not record this schema bundle');
  });

  it('refuses a runtime record of another reference bundle', () => {
    const parts = packaged();
    parts.runtime.observedReferenceBundleHash = 'a'.repeat(64);
    expect(() => buildCatalogEntry({ ...parts, executableImageDigest: DIGEST })).toThrow('does not record this reference bundle');
  });

  it('refuses reference files that changed after the record was written', () => {
    const parts = packaged();
    parts.references['fixture.json'] = { changed: true };
    expect(() => buildCatalogEntry({ ...parts, executableImageDigest: DIGEST })).toThrow('does not record this reference bundle');
  });

  it.each([null, '', 1243, undefined])('refuses a Chromium build of %j', (value) => {
    const parts = packaged();
    parts.runtime.observedChromiumBuild = value;
    expect(() => buildCatalogEntry({ ...parts, executableImageDigest: DIGEST })).toThrow('no Chromium build');
  });

  it('refuses a runtime record that is not an object', () => {
    const parts = packaged();
    expect(() => buildCatalogEntry({ ...parts, runtime: null, executableImageDigest: DIGEST })).toThrow('dist is stale');
  });
});

describe('print-observed-catalog BuildIdentity check', () => {
  const good = {
    profileHash: 'a'.repeat(64),
    schemaBundleHash: 'a'.repeat(64),
    referenceBundleHash: 'a'.repeat(64),
    executableImageDigest: 'a'.repeat(64),
    chromiumBuild: CHROMIUM,
  };

  it('accepts a complete build identity and agrees with the runner on every refusal below', () => {
    expect(() => { validateBuildIdentity(good, realSchemas()); }).not.toThrow();
    const refusals: [string, unknown, string][] = [
      ['an extra field', { ...good, extra: 'x' }, 'unknown field'],
      ['a missing field', Object.fromEntries(Object.entries(good).filter(([key]) => key !== 'chromiumBuild')), 'lacks'],
      ['a malformed hash', { ...good, profileHash: 'A'.repeat(64) }, 'pattern'],
      ['a short hash', { ...good, schemaBundleHash: 'a'.repeat(63) }, 'pattern'],
      ['an empty Chromium build', { ...good, chromiumBuild: '' }, 'too short'],
      ['an over-long Chromium build', { ...good, chromiumBuild: 'x'.repeat(257) }, 'too long'],
      ['a non-string field', { ...good, chromiumBuild: 1243 }, 'not a string'],
      ['a non-object', 'build', 'not an object'],
    ];
    for (const [label, build, reason] of refusals) {
      expect(() => { validateBuildIdentity(build, realSchemas()); }, label).toThrow(reason);
      expect(() => validateObserved('replay-profile#/definitions/BuildIdentity', build), `runner: ${label}`).toThrow();
    }
  });

  it('refuses a schema it cannot read fully instead of skipping its keywords', () => {
    const cases: [string, (bundle: Bundle) => void, string][] = [
      ['an unsupported object keyword', (b) => { b['replay-profile'].definitions.BuildIdentity.minProperties = 5; }, 'unsupported keyword minProperties'],
      ['an unsupported property keyword', (b) => { b['replay-profile'].definitions.BuildIdentity.properties.chromiumBuild = { type: 'string', format: 'uri' }; }, 'unsupported keyword format'],
      ['a non-string property', (b) => { b['replay-profile'].definitions.BuildIdentity.properties.chromiumBuild = { type: 'integer' }; }, 'not a string schema'],
      ['an open object', (b) => { b['replay-profile'].definitions.BuildIdentity.additionalProperties = true; }, 'not a closed object'],
      ['a property that is not a schema', (b) => { b['replay-profile'].definitions.BuildIdentity.properties.profileHash = 'x' as unknown as Record<string, unknown>; }, 'is not a schema'],
    ];
    for (const [label, change, reason] of cases) {
      expect(() => { validateBuildIdentity(good, withBundle(change)); }, label).toThrow(reason);
    }
    expect(() => { validateBuildIdentity(good, {}); }).toThrow('no BuildIdentity schema');
  });
});

describe('print-observed-catalog digest argument', () => {
  it('normalizes a bare or prefixed digest and refuses anything else', () => {
    expect(normalizeDigest(DIGEST)).toBe(DIGEST);
    expect(normalizeDigest(`sha256:${DIGEST}`)).toBe(DIGEST);
    expect(() => normalizeDigest(undefined)).toThrow('64 lowercase hex');
    expect(() => normalizeDigest(`sha256:${DIGEST.toUpperCase()}`)).toThrow('64 lowercase hex');
  });
});

/**
 * Same constructs as `test/no-dynamic-evaluation.test.ts`, which greps `dist/`. This script is not emitted into
 * `dist/` (it is a `scripts/` tool copied into the image next to it), so it is held to the same list here.
 */
describe('print-observed-catalog source', () => {
  const source = readFileSync(join(packageRoot, 'scripts', 'print-observed-catalog.mjs'), 'utf8');
  const forbidden: readonly (readonly [string, RegExp])[] = [
    ['eval(', /(?<![A-Za-z0-9_$.])eval\s*\(/u],
    ['new Function(', /new\s+Function\s*\(/u],
    ['Function(', /(?<![A-Za-z0-9_$.])Function\s*\(/u],
    ['node vm', /require\(\s*['"](?:node:)?vm['"]\s*\)|from\s+['"](?:node:)?vm['"]/u],
    ['worker_threads', /require\(\s*['"](?:node:)?worker_threads['"]\s*\)|from\s+['"](?:node:)?worker_threads['"]/u],
    ['dynamic import()', /(?<![A-Za-z0-9_$.])import\s*\(/u],
    ['async IIFE', /\(\s*async\s*\(\s*\)\s*=>/u],
  ];

  it.each(forbidden)('contains no %s', (_label, pattern) => {
    expect(pattern.test(source)).toBe(false);
  });

  it('imports no child process and no code from dist', () => {
    expect(source).not.toMatch(/child_process/u);
    expect(source).not.toMatch(/from\s+['"][^'"]*dist\//u);
  });
});

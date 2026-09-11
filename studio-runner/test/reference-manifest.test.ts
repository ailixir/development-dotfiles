import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SYNTAX_REFERENCE_VERSION } from '../src/versions.js';
import { loadReferenceFixtures, packageRoot } from './helpers/corpus.js';
import {
  describeOperations,
  literalUrlsFor,
  loadReferenceManifest,
  operationsFor,
  OPERATION_TO_METHOD,
  surfaceMethods,
  surfaceOptionKeys,
} from './helpers/reference-manifest.js';

/**
 * AC-4: the reference corpus is versioned and its manifest is complete against the accepted
 * language.
 *
 * The permitted surface is read from `src/validator/language.ts` and each example's coverage is
 * re-derived from the validator's own typed operations, so the manifest cannot claim coverage it
 * does not have and the language cannot grow a method or an option key without a fixture. This is
 * the keyed replacement for the textual `method(` search 10.2's QA gate flagged as CR-002.
 */

const manifest = loadReferenceManifest();
const fixtures = loadReferenceFixtures();
const fixturesByName = new Map(fixtures.map((fixture) => [fixture.name, fixture]));

/** Coverage re-derived from the validator, per example name. */
const derived = new Map(
  fixtures.map((fixture) => [fixture.name, describeOperations(operationsFor(fixture))]),
);

describe('reference manifest', () => {
  it('records the pinned syntax reference version', () => {
    expect(manifest.syntaxReferenceVersion).toBe(SYNTAX_REFERENCE_VERSION);
  });

  it('lists exactly the files in fixtures/reference', () => {
    const onDisk = readdirSync(join(packageRoot, 'fixtures', 'reference'))
      .filter((file) => file.endsWith('.json') && file !== 'manifest.json')
      .sort();
    expect(manifest.examples.map((example) => example.file).sort()).toEqual(onDisk);
  });

  it('names an existing fixture for every entry', () => {
    const missing = manifest.examples.filter((example) => !fixturesByName.has(example.name));
    expect(missing.map((example) => example.name)).toEqual([]);
  });

  it.each(manifest.examples.map((example) => [example.name, example] as const))(
    'declares the coverage %s actually has',
    (name, example) => {
      const actual = derived.get(name);
      expect(actual, `no fixture named ${name}`).toBeDefined();
      expect({
        methods: example.methods,
        optionKeys: example.optionKeys,
        referenceKinds: example.referenceKinds,
      }).toEqual(actual);
    },
  );
});

describe('permitted-surface completeness', () => {
  const declaredMethods = new Set(manifest.examples.flatMap((example) => example.methods));
  const declaredOptionKeys = new Set(manifest.examples.flatMap((example) => example.optionKeys));

  it('demonstrates every permitted method', () => {
    const missing = surfaceMethods().filter((method) => !declaredMethods.has(method));
    expect(
      missing,
      'every method in src/validator/language.ts needs a reference example',
    ).toEqual([]);
  });

  it('demonstrates no method outside the permitted surface', () => {
    const surface = new Set(surfaceMethods());
    const extraneous = [...declaredMethods].filter((method) => !surface.has(method)).sort();
    expect(extraneous).toEqual([]);
  });

  it('demonstrates every permitted option key', () => {
    const missing = surfaceOptionKeys().filter((key) => !declaredOptionKeys.has(key));
    expect(
      missing,
      'every option key in src/validator/language.ts needs a reference example',
    ).toEqual([]);
  });

  it('demonstrates no option key outside the permitted surface', () => {
    const surface = new Set(surfaceOptionKeys());
    const extraneous = [...declaredOptionKeys].filter((key) => !surface.has(key)).sort();
    expect(extraneous).toEqual([]);
  });

  it('names a permitted method for every operation the executor can run', () => {
    const surface = new Set(surfaceMethods());
    const unmapped = Object.entries(OPERATION_TO_METHOD)
      .filter(([, method]) => !surface.has(method))
      .map(([operation]) => operation);
    expect(unmapped).toEqual([]);
  });

  it('demonstrates both reference kinds', () => {
    const kinds = new Set(manifest.examples.flatMap((example) => example.referenceKinds));
    expect([...kinds].sort()).toEqual(['secret', 'variable']);
  });
});

describe('fixture page bindings', () => {
  it('binds every example to a declared page', () => {
    const unknown = manifest.examples
      .filter((example) => !Object.hasOwn(manifest.pages, example.page))
      .map((example) => `${example.name} -> ${example.page}`);
    expect(unknown).toEqual([]);
  });

  it('ships every declared page', () => {
    const missing = Object.keys(manifest.pages).filter(
      (page) => !existsSync(join(packageRoot, 'fixtures', 'pages', page)),
    );
    expect(missing).toEqual([]);
  });

  it('maps every literal URL the corpus uses to a fixture page', () => {
    const served = new Set(Object.values(manifest.pages));
    const unmapped = fixtures
      .flatMap((fixture) => literalUrlsFor(operationsFor(fixture)))
      .filter((url) => !served.has(url));
    expect([...new Set(unmapped)].sort()).toEqual([]);
  });
});

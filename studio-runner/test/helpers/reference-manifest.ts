import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACTION_METHODS,
  LOCATOR_ASSERTIONS,
  LOCATOR_METHODS,
  PAGE_ASSERTIONS,
  PAGE_METHODS,
} from '../../src/validator/language.js';
import type { MethodSchema } from '../../src/validator/language.js';
import type { LocatorChain, Operation, OperationName } from '../../src/executor/operations.js';
import { validateArtifact } from '../../src/validator/index.js';
import { packageRoot } from './corpus.js';
import type { ReferenceFixture } from './corpus.js';

/**
 * Manifest helpers for the pinned syntax reference (story 10.3 AC-4).
 *
 * Everything here is *derived*: the permitted surface comes from `src/validator/language.ts` (the
 * single source of truth story 10.2 established) and an example's coverage comes from the typed
 * operations the validator itself produces for it. Nothing is restated by hand and nothing is
 * matched textually, so the completeness test fails loudly when the language gains a method or an
 * option key that no example exercises, instead of passing on a substring that happens to appear.
 */

export interface ManifestExample {
  /** File name inside `fixtures/reference/`. */
  readonly file: string;
  readonly name: string;
  readonly description: string;
  /** File name inside `fixtures/pages/` this example is bound to. */
  readonly page: string;
  /** Permitted methods the example demonstrates (locator factories, actions, assertions). */
  readonly methods: readonly string[];
  /** Permitted option keys, as `method.optionKey`. */
  readonly optionKeys: readonly string[];
  /** Reference kinds used: `variable`, `secret`, or neither. */
  readonly referenceKinds: readonly string[];
}

export interface ReferenceManifest {
  readonly syntaxReferenceVersion: string;
  /** Fixture page file → the URL it is served at. Consumed by the real adapter in 10.12. */
  readonly pages: Readonly<Record<string, string>>;
  readonly examples: readonly ManifestExample[];
}

export const MANIFEST_FILE = join(packageRoot, 'fixtures', 'reference', 'manifest.json');

export function loadReferenceManifest(): ReferenceManifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as ReferenceManifest;
}

/**
 * Source-method name for each typed operation.
 *
 * This is the one place the operation contract and the accepted language meet, and it is declared
 * as a total `Record<OperationName, …>`: adding an operation to `src/executor/operations.ts`
 * without naming its source method stops the type-check, and a name that is not in the surface
 * fails `reference-manifest.test.ts`.
 */
export const OPERATION_TO_METHOD: Readonly<Record<OperationName, string>> = {
  goto: 'goto',
  waitForURL: 'waitForURL',
  click: 'click',
  fill: 'fill',
  press: 'press',
  check: 'check',
  uncheck: 'uncheck',
  hover: 'hover',
  selectOption: 'selectOption',
  expectVisible: 'toBeVisible',
  expectContainText: 'toContainText',
  expectValue: 'toHaveValue',
  expectUrl: 'toHaveURL',
  expectTitle: 'toHaveTitle',
};

/** Every table in the accepted language, keyed by the surface it belongs to. */
const SURFACE_TABLES: readonly Readonly<Record<string, MethodSchema>>[] = [
  PAGE_METHODS,
  LOCATOR_METHODS,
  ACTION_METHODS,
  LOCATOR_ASSERTIONS,
  PAGE_ASSERTIONS,
];

/** Every permitted method name, derived from `src/validator/language.ts`. */
export function surfaceMethods(): string[] {
  return SURFACE_TABLES.flatMap((table) => Object.keys(table)).sort();
}

/** Every permitted `method.optionKey` pair, derived from `src/validator/language.ts`. */
export function surfaceOptionKeys(): string[] {
  return SURFACE_TABLES.flatMap((table) =>
    Object.entries(table).flatMap(([method, schema]) =>
      schema.options === null ? [] : Object.keys(schema.options).map((key) => `${method}.${key}`),
    ),
  ).sort();
}

export interface ExampleCoverage {
  readonly methods: readonly string[];
  readonly optionKeys: readonly string[];
  readonly referenceKinds: readonly string[];
}

function collectReferenceKinds(value: unknown, into: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'variable' || kind === 'secret') into.add(kind);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectReferenceKinds(nested, into);
  }
}

/** Derives what an operation list demonstrates: methods, option keys and reference kinds. */
export function describeOperations(operations: readonly Operation[]): ExampleCoverage {
  const methods = new Set<string>();
  const optionKeys = new Set<string>();
  const referenceKinds = new Set<string>();

  const addOptions = (method: string, options: unknown): void => {
    if (options === null || options === undefined) return;
    for (const key of Object.keys(options as Record<string, unknown>)) {
      optionKeys.add(`${method}.${key}`);
    }
  };

  const walkChain = (chain: LocatorChain): void => {
    for (const segment of chain.segments) {
      methods.add(segment.kind);
      if ('options' in segment) addOptions(segment.kind, segment.options);
    }
  };

  for (const operation of operations) {
    const method = OPERATION_TO_METHOD[operation.op];
    methods.add(method);
    addOptions(method, operation.options);
    if ('locator' in operation) walkChain(operation.locator);
    collectReferenceKinds(operation, referenceKinds);
  }

  return {
    methods: [...methods].sort(),
    optionKeys: [...optionKeys].sort(),
    referenceKinds: [...referenceKinds].sort(),
  };
}

/** Validates a reference fixture and returns the typed operations it compiles to. */
export function operationsFor(fixture: ReferenceFixture): Operation[] {
  const result = validateArtifact(fixture.artifact, fixture.source, fixture.references);
  if (!result.ok) {
    throw new Error(
      `Reference fixture "${fixture.name}" does not validate on the current validator.`,
    );
  }
  return result.steps.flatMap((step) => [...(step.operations ?? [])]);
}

/** The locator segments a fixture targets, used by the fixture tier's page binding check. */
export function locatorSegmentsFor(operations: readonly Operation[]): LocatorChain['segments'][number][] {
  return operations.flatMap((operation) =>
    'locator' in operation ? [...operation.locator.segments] : [],
  );
}

/** Literal URLs the corpus navigates to or asserts on, which the page map must cover. */
export function literalUrlsFor(operations: readonly Operation[]): string[] {
  const urls: string[] = [];
  for (const operation of operations) {
    if (operation.op === 'goto' && operation.url.kind === 'literal') {
      urls.push(operation.url.value);
    }
    if (operation.op === 'waitForURL' && operation.url.kind === 'literal') {
      urls.push(operation.url.value);
    }
    if (operation.op === 'expectUrl' && operation.expected.kind === 'literal') {
      urls.push(operation.expected.value);
    }
  }
  return urls;
}

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ValidationPolicyInput, ReferenceDeclarations } from '../../src/validator/index.js';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface RecordedCallSnapshot {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface ReferenceFixture {
  readonly name: string;
  readonly description: string;
  readonly source: string[];
  readonly references: ReferenceDeclarations;
  readonly values: {
    readonly variables: Record<string, string>;
    readonly secrets: Record<string, string>;
  };
  readonly artifact: unknown;
  readonly expectedCalls: RecordedCallSnapshot[];
}

export interface AdversarialFixture {
  readonly name: string;
  readonly expectedClass: string;
  readonly description: string;
  readonly source: string[];
  readonly references: ReferenceDeclarations;
  readonly artifact: unknown;
  readonly referencePolicy?: unknown;
  readonly policy?: ValidationPolicyInput;
}

function loadDirectory<T>(relative: string, skip: readonly string[] = []): T[] {
  const directory = join(packageRoot, relative);
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json') && !skip.includes(file))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as T);
}

/** `manifest.json` describes the corpus (10.3 AC-4); it is not itself an example. */
export function loadReferenceFixtures(): ReferenceFixture[] {
  return loadDirectory<ReferenceFixture>('fixtures/reference', ['manifest.json']);
}

export function loadAdversarialFixtures(): AdversarialFixture[] {
  return loadDirectory<AdversarialFixture>('fixtures/adversarial');
}

/** Normalises recorded calls the way JSON does, so `undefined` options compare as `null`. */
export function normalise(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

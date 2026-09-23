import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  assertCompatible,
  COMPATIBILITY_RULES,
  currentRuntimeVersions,
  DEFAULT_RUNTIME_VERSIONS_FILE,
  isCompatible,
  loadRuntimeVersions,
  resetRuntimeVersionsCache,
  RUNNER_VERSIONS,
  RUNTIME_INCOMPATIBLE,
  RuntimeIncompatibleError,
} from '../src/compat/index.js';
import type { ArtifactProvenance, RuntimeVersions } from '../src/compat/index.js';
import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from './helpers/fakeAdapters.js';
import { validateArtifact } from '../src/validator/index.js';
import { EXECUTOR_VERSION, SYNTAX_REFERENCE_VERSION, VALIDATOR_SCHEMA_VERSION } from '../src/versions.js';
import { loadReferenceFixtures } from './helpers/corpus.js';

/**
 * AC-7/AC-8: an artifact only ever runs on the runtime it was validated for (architecture §4.6).
 */

const RUNTIME: RuntimeVersions = {
  validatorSchema: VALIDATOR_SCHEMA_VERSION,
  syntaxReference: SYNTAX_REFERENCE_VERSION,
  playwright: '1.63.0',
  executor: EXECUTOR_VERSION,
};

const MATCHING: ArtifactProvenance = { ...RUNTIME };

const fixture = loadReferenceFixtures().find((entry) => entry.name === 'flow-login');
if (fixture === undefined) {
  throw new Error('The flow-login reference fixture is missing; the corpus is incomplete.');
}

const files: string[] = [];

function writeRuntimeFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'studio-runner-compat-'));
  files.push(directory);
  const file = join(directory, 'runtime-versions.json');
  writeFileSync(file, contents, 'utf8');
  return file;
}

afterAll(() => {
  for (const directory of files) rmSync(directory, { recursive: true, force: true });
});

describe('isCompatible', () => {
  it('accepts an artifact recorded on this exact runtime', () => {
    const result = isCompatible(MATCHING, RUNTIME);
    expect(result).toEqual({ ok: true, reason: null, code: null, mismatches: [] });
  });

  it('compares the runner versions it actually ships', () => {
    expect(RUNNER_VERSIONS).toEqual({
      validatorSchema: VALIDATOR_SCHEMA_VERSION,
      syntaxReference: SYNTAX_REFERENCE_VERSION,
      executor: EXECUTOR_VERSION,
    });
  });

  it.each([
    ['validatorSchema', '0.9.0'],
    ['syntaxReference', '0.9.0'],
    ['playwright', '1.62.0'],
  ] as const)('rejects a differing %s under the exact rule', (field, recorded) => {
    expect(COMPATIBILITY_RULES[field]).toBe('exact');
    const result = isCompatible({ ...MATCHING, [field]: recorded }, RUNTIME);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(RUNTIME_INCOMPATIBLE);
    expect(result.mismatches.map((mismatch) => mismatch.field)).toEqual([field]);
    expect(result.reason).toContain(field);
    expect(result.reason).toContain(recorded);
  });

  it('rejects a newer Playwright as firmly as an older one', () => {
    expect(isCompatible({ ...MATCHING, playwright: '1.64.0' }, RUNTIME).ok).toBe(false);
  });

  it.each([
    ['1.0.0', true],
    ['0.9.0', false],
    ['2.0.0', false],
    ['1.0.1', false],
    ['not-a-version', false],
  ])('applies the executor range to %s', (recorded, expected) => {
    expect(COMPATIBILITY_RULES.executor).toBe('backwardCompatibleMinor');
    const result = isCompatible({ ...MATCHING, executor: recorded }, { ...RUNTIME, executor: '1.0.0' });
    expect(result.ok).toBe(expected);
  });

  it('accepts a runtime ahead of the artifact within the executor major', () => {
    const runtime = { ...RUNTIME, executor: '1.4.2' };
    expect(isCompatible({ ...MATCHING, executor: '1.2.9' }, runtime).ok).toBe(true);
    expect(isCompatible({ ...MATCHING, executor: '1.4.1' }, runtime).ok).toBe(true);
    expect(isCompatible({ ...MATCHING, executor: '1.4.3' }, runtime).ok).toBe(false);
    expect(isCompatible({ ...MATCHING, executor: '1.5.0' }, runtime).ok).toBe(false);
  });

  it('reports every differing field at once', () => {
    const result = isCompatible(
      { validatorSchema: '0.9.0', syntaxReference: '0.9.0', playwright: '1.60.0', executor: '0.9.0' },
      RUNTIME,
    );
    expect(result.mismatches.map((mismatch) => mismatch.field)).toEqual([
      'validatorSchema',
      'syntaxReference',
      'playwright',
      'executor',
    ]);
  });
});

/**
 * AC-8: an artifact recorded under an older validator schema is refused, not reinterpreted.
 *
 * The sequence below is the caller contract: check first, then execute. The fake adapter proves
 * the refusal happens before any browser call is made. Server-side enforcement stays authoritative
 * (architecture §4.6); the backend maps this to `409 RUNTIME_INCOMPATIBLE` on execute (10.8).
 */
describe('an artifact from an older validator schema', () => {
  it('is refused with RUNTIME_INCOMPATIBLE and reaches no adapter call', async () => {
    const stale: ArtifactProvenance = { ...MATCHING, validatorSchema: '0.9.0' };
    const adapter = createFakeBrowserAdapter();

    const result = validateArtifact(fixture.artifact, fixture.source, fixture.references);
    expect(result.ok).toBe(true);

    // The guard the caller places before execution.
    let raised: unknown = null;
    try {
      assertCompatible(stale, RUNTIME);
      await executeSteps({
        steps: result.steps.map((step) => ({
          stepIndex: step.stepIndex,
          operations: step.operations ?? [],
        })),
        adapter,
        reporter: createRecordingStepReporter(),
        resolver: createValueResolver(fixture.values),
        clock: createFakeClock(),
      });
    } catch (error) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(RuntimeIncompatibleError);
    const failure = raised as RuntimeIncompatibleError;
    expect(failure.code).toBe(RUNTIME_INCOMPATIBLE);
    expect(failure.mismatches.map((mismatch) => mismatch.field)).toEqual(['validatorSchema']);
    expect(failure.message).toContain('will not be reinterpreted');
    expect(adapter.calls).toEqual([]);
  });

  it('executes normally once the provenance matches the runtime', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = validateArtifact(fixture.artifact, fixture.source, fixture.references);

    assertCompatible(MATCHING, RUNTIME);
    const run = await executeSteps({
      steps: result.steps.map((step) => ({
        stepIndex: step.stepIndex,
        operations: step.operations ?? [],
      })),
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver(fixture.values),
      clock: createFakeClock(),
    });

    expect(run.ok).toBe(true);
    expect(adapter.calls.length).toBeGreaterThan(0);
  });
});

describe('loadRuntimeVersions', () => {
  it('reads the fields the compatibility check compares', () => {
    const file = writeRuntimeFile(
      `${JSON.stringify({
        playwright: '1.63.0',
        validatorSchema: '1.0.0',
        syntaxReference: SYNTAX_REFERENCE_VERSION,
        executor: '1.0.0',
        chromiumBuild: null,
        image: null,
      })}\n`,
    );
    const loaded = loadRuntimeVersions(file);
    expect(loaded.playwright).toBe('1.63.0');
    expect(loaded.chromiumBuild).toBeNull();
    expect(isCompatible(MATCHING, loaded).ok).toBe(true);
  });

  it('fails closed when the file is absent', () => {
    expect(() => loadRuntimeVersions(join(tmpdir(), 'studio-runner-absent.json'))).toThrow(
      /Could not read runtime versions/,
    );
  });

  it('fails closed when the file is not an object', () => {
    const file = writeRuntimeFile('"1.63.0"\n');
    expect(() => loadRuntimeVersions(file)).toThrow(/does not contain a runtime-versions object/);
  });

  it('fails closed when a compared field is missing', () => {
    const file = writeRuntimeFile(`${JSON.stringify({ playwright: '1.63.0' })}\n`);
    expect(() => loadRuntimeVersions(file)).toThrow(
      /missing required version fields: validatorSchema, syntaxReference, executor/,
    );
  });

  it('defaults to the file the build emits next to the compiled entry points', () => {
    expect(DEFAULT_RUNTIME_VERSIONS_FILE).toMatch(/runtime-versions\.json$/);
  });

  it('reads the record once and re-reads only after a reset', () => {
    const record = {
      playwright: '1.63.0',
      validatorSchema: '1.0.0',
      syntaxReference: '1.0.0',
      executor: '1.0.0',
    };
    const first = writeRuntimeFile(`${JSON.stringify(record)}\n`);
    const second = writeRuntimeFile(`${JSON.stringify({ ...record, playwright: '1.62.0' })}\n`);

    resetRuntimeVersionsCache();
    const loaded = currentRuntimeVersions(first);
    // The second path is ignored while the record is memoised.
    expect(currentRuntimeVersions(second)).toBe(loaded);

    resetRuntimeVersionsCache();
    expect(currentRuntimeVersions(second).playwright).toBe('1.62.0');
    resetRuntimeVersionsCache();
  });
});

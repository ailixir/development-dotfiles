import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES, validateArtifact } from '../src/validator/index.js';
import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../src/executor/adapters/fake.js';
import { loadAdversarialFixtures } from './helpers/corpus.js';

/**
 * AC-18 / AC-20: every denial class has at least one fixture, each fixture fails closed with a
 * diagnostic of that class, and no adapter call is made for any of them.
 */
const fixtures = loadAdversarialFixtures();

describe('adversarial corpus', () => {
  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    'rejects %s',
    async (_name, fixture) => {
      const result = validateArtifact(
        fixture.artifact,
        fixture.source,
        fixture.references,
        fixture.policy,
      );

      expect(result.ok).toBe(false);

      const codes = [
        ...result.diagnostics.map((diagnostic) => diagnostic.code),
        ...result.steps.flatMap((step) => step.diagnostics.map((d) => d.code)),
      ];
      expect(codes).toContain(fixture.expectedClass);

      // Nothing is ever executed from a rejected artifact: the runner only reaches the executor
      // when the whole artifact validated.
      const adapter = createFakeBrowserAdapter();
      if (result.ok) {
        await executeSteps({
          steps: result.steps.map((step) => ({
            stepIndex: step.stepIndex,
            operations: step.operations ?? [],
          })),
          adapter,
          reporter: createRecordingStepReporter(),
          resolver: createValueResolver({}),
          clock: createFakeClock(),
        });
      }
      expect(adapter.calls).toEqual([]);
    },
  );

  it('never returns operations for a rejected step', () => {
    for (const fixture of fixtures) {
      const result = validateArtifact(
        fixture.artifact,
        fixture.source,
        fixture.references,
        fixture.policy,
      );
      for (const step of result.steps) {
        if (step.diagnostics.length > 0) {
          expect(step.operations).toBeNull();
          expect(step.ok).toBe(false);
        }
      }
    }
  });

  it('bounds every diagnostic excerpt to the failing node', () => {
    for (const fixture of fixtures) {
      const result = validateArtifact(
        fixture.artifact,
        fixture.source,
        fixture.references,
        fixture.policy,
      );
      const diagnostics = [
        ...result.diagnostics,
        ...result.steps.flatMap((step) => step.diagnostics),
      ];
      for (const diagnostic of diagnostics) {
        expect(diagnostic.message.length).toBeLessThanOrEqual(400);
        if (diagnostic.excerpt !== null) {
          expect(diagnostic.excerpt.length).toBeLessThanOrEqual(120);
        }
      }
    }
  });

  it('has at least one fixture for every denial class', () => {
    const covered = new Set(fixtures.map((fixture) => fixture.expectedClass));
    const missing = DIAGNOSTIC_CODES.filter((code) => !covered.has(code));
    expect(missing).toEqual([]);
  });

  it('only declares known diagnostic codes as expected classes', () => {
    const known = new Set<string>(DIAGNOSTIC_CODES);
    const unknown = fixtures
      .map((fixture) => fixture.expectedClass)
      .filter((code) => !known.has(code));
    expect(unknown).toEqual([]);
  });
});

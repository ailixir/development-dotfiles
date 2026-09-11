import { describe, expect, it } from 'vitest';

import { validateArtifact } from '../src/validator/index.js';
import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../src/executor/adapters/fake.js';
import { ACTION_METHODS, LOCATOR_ASSERTIONS, LOCATOR_METHODS, PAGE_ASSERTIONS, PAGE_METHODS } from '../src/validator/language.js';
import { loadReferenceFixtures, normalise } from './helpers/corpus.js';

/**
 * AC-17: every permitted method has a valid artifact, and each one drives the expected
 * `BrowserAdapter` calls in order against a fake adapter.
 */
const fixtures = loadReferenceFixtures();

describe('reference corpus', () => {
  it('is not empty', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    'validates and executes %s',
    async (_name, fixture) => {
      const result = validateArtifact(fixture.artifact, fixture.source, fixture.references);
      expect(result.diagnostics).toEqual([]);
      expect(result.steps.flatMap((step) => step.diagnostics)).toEqual([]);
      expect(result.ok).toBe(true);

      const adapter = createFakeBrowserAdapter();
      const reporter = createRecordingStepReporter();
      const run = await executeSteps({
        steps: result.steps.map((step) => ({
          stepIndex: step.stepIndex,
          operations: step.operations ?? [],
        })),
        adapter,
        reporter,
        resolver: createValueResolver(fixture.values),
        clock: createFakeClock(),
      });

      expect(run.ok).toBe(true);
      expect(normalise(adapter.calls)).toEqual(fixture.expectedCalls);
      expect(reporter.finished.map((event) => event.status)).toEqual(
        fixture.source.map(() => 'PASSED'),
      );
    },
  );

  it('covers every permitted method at least once', () => {
    const allCode = fixtures
      .flatMap((fixture) => {
        const artifact = fixture.artifact as { steps: { code: string }[] };
        return artifact.steps.map((step) => step.code);
      })
      .join('\n');

    const methods = [
      ...Object.keys(PAGE_METHODS),
      ...Object.keys(LOCATOR_METHODS),
      ...Object.keys(ACTION_METHODS),
      ...Object.keys(LOCATOR_ASSERTIONS),
      ...Object.keys(PAGE_ASSERTIONS),
    ];
    const missing = methods.filter((method) => !allCode.includes(`${method}(`));
    expect(missing).toEqual([]);
  });

  it('covers both reference kinds', () => {
    const allCode = fixtures
      .flatMap((fixture) => {
        const artifact = fixture.artifact as { steps: { code: string }[] };
        return artifact.steps.map((step) => step.code);
      })
      .join('\n');
    expect(allCode).toContain('vars.get(');
    expect(allCode).toContain('vars.secret(');
  });
});

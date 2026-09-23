import { describe, expect, it } from 'vitest';

import { validateArtifact } from '../src/validator/index.js';
import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from './helpers/fakeAdapters.js';
import { loadReferenceFixtures, normalise } from './helpers/corpus.js';

/**
 * 10.2 AC-17 / 10.3 AC-5: every reference example validates on the current validator and drives
 * the expected `BrowserAdapter` calls in order against a fake adapter. A language-policy change
 * that breaks an example fails here, in the unit tier, with no browser involved.
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
        fixture.source.map(() => 'PASS'),
      );
    },
  );

  // Permitted-surface completeness (methods, option keys and reference kinds) is asserted in
  // `reference-manifest.test.ts`, keyed on `src/validator/language.ts` and on the validator's own
  // typed operations. The textual `method(` search this file used in 10.2 was replaced there
  // (10.2 QA gate, CR-002): it could not fail when the language grew a construct no example uses.
});

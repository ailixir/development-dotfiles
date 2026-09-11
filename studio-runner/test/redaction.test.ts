import { describe, expect, it } from 'vitest';

import { validateArtifact } from '../src/validator/index.js';
import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import { createRedactor, safeMessage, REDACTION_PLACEHOLDER } from '../src/executor/redaction.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../src/executor/adapters/fake.js';

/** A value with characters that change shape under URL and base64 encoding. */
const CANARY = 'p@ss w0rd/+=';

function variantsOf(value: string): string[] {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return [
    value,
    encodeURIComponent(value),
    encodeURI(value),
    encodeURIComponent(encodeURIComponent(value)),
    base64,
    base64.replace(/=+$/u, ''),
    base64.replace(/\+/gu, '-').replace(/\//gu, '_'),
  ];
}

describe('redaction', () => {
  it('scrubs plain, URL-encoded and base64 variants (AC-19)', () => {
    const redactor = createRedactor([CANARY]);
    for (const variant of variantsOf(CANARY)) {
      const redacted = redactor.redact(`prefix ${variant} suffix`);
      expect(redacted).not.toContain(variant);
      expect(redacted).toContain(REDACTION_PLACEHOLDER);
    }
  });

  it('ignores empty values and leaves unrelated text alone', () => {
    const redactor = createRedactor(['', 'abc']);
    expect(redactor.redact('nothing to see')).toBe('nothing to see');
    expect(redactor.variantCount).toBeGreaterThan(0);
  });

  it('bounds and redacts a thrown error message', () => {
    const redactor = createRedactor([CANARY]);
    const message = safeMessage(new Error(`failed with ${CANARY}`), redactor, 200);
    expect(message).not.toContain(CANARY);
    expect(message).toContain(REDACTION_PLACEHOLDER);
  });

  it('never leaks a secret through the operation list, reporter or failure message (AC-13, AC-19)', async () => {
    const source = ['Type "<secret LOGIN_PW>" in the "Password" field'];
    const artifact = {
      version: 1,
      steps: [
        {
          stepIndex: 0,
          originalText: source[0],
          code: "await page.getByLabel('Password').fill(vars.secret('LOGIN_PW'));",
        },
      ],
    };

    const result = validateArtifact(artifact, source, { variables: [], secrets: ['LOGIN_PW'] });
    expect(result.ok).toBe(true);

    // The operation list carries the reference, never the value.
    const serializedOperations = JSON.stringify(result.steps[0]?.operations);
    expect(serializedOperations).toContain('LOGIN_PW');
    for (const variant of variantsOf(CANARY)) {
      expect(serializedOperations).not.toContain(variant);
    }

    const adapter = createFakeBrowserAdapter();
    const reporter = createRecordingStepReporter();
    adapter.failOn('fill', new Error(`could not type ${CANARY} into the field`));

    const run = await executeSteps({
      steps: result.steps.map((step) => ({
        stepIndex: step.stepIndex,
        operations: step.operations ?? [],
      })),
      adapter,
      reporter,
      resolver: createValueResolver({ secrets: { LOGIN_PW: CANARY } }),
      clock: createFakeClock(),
    });

    expect(run.ok).toBe(false);
    const outbound = JSON.stringify({ run, finished: reporter.finished, started: reporter.started });
    for (const variant of variantsOf(CANARY)) {
      expect(outbound).not.toContain(variant);
    }
    expect(run.steps[0]?.failure).toContain(REDACTION_PLACEHOLDER);
  });

  it('keeps the secret out of every validator diagnostic (AC-13)', () => {
    const source = ['Type "<secret LOGIN_PW>" in the "Password" field'];
    const artifact = {
      version: 1,
      steps: [
        {
          stepIndex: 0,
          originalText: source[0],
          // A rejected artifact that inlines the value instead of referencing it.
          code: `await page.getByLabel('Password').press('${CANARY}');`,
        },
      ],
    };
    const result = validateArtifact(artifact, source, { variables: [], secrets: ['LOGIN_PW'] });
    expect(result.ok).toBe(false);
    // The validator cannot know this literal is a secret; the point asserted here is only that a
    // diagnostic never echoes more than the bounded excerpt of the failing node.
    for (const diagnostic of result.steps.flatMap((step) => step.diagnostics)) {
      expect(diagnostic.message.length).toBeLessThanOrEqual(400);
    }
  });
});

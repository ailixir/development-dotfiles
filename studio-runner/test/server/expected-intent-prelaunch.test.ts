import { afterEach, describe, expect, it } from 'vitest';

import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

function expected(secondValue = 'PW') {
  return {
    schemaVersion: 1,
    steps: [
      {
        stepIndex: 0,
        stepId: '11111111-1111-4111-8111-111111111111',
        operations: [{ op: 'goto', url: { kind: 'literal', value: 'https://example.com/login' } }],
      },
      {
        stepIndex: 1,
        stepId: '22222222-2222-4222-8222-222222222222',
        operations: [{
          op: 'fill',
          locator: { segments: [{ kind: 'getByTestId', testId: { kind: 'literal', value: 'password' } }] },
          value: { kind: 'secret', id: secondValue },
        }],
      },
    ],
  };
}

describe('expected intent revalidation precedes all run side effects', () => {
  it('mismatch makes zero capacity, admission, scratch and browser calls', async () => {
    harness = createHarness();
    await harness.start();
    const response = await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(validJob({ expectedIntent: expected('OTHER_SECRET') })),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(400);
    expect(response.body).not.toContain('canary-secret-value');
    expect(harness.app.pool.inUse).toBe(0);
    expect(harness.http.admissionRequests).toHaveLength(0);
    expect(harness.scratch.present).toEqual([]);
    expect(harness.launcher.launches).toHaveLength(0);
  });

  it('the matching immutable snapshot reaches admission', async () => {
    harness = createHarness();
    await harness.start();
    const response = await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(validJob({ expectedIntent: expected() })),
      SERVICE_TOKEN,
    );
    expect(response.status).toBe(202);
    expect(harness.http.admissionRequests.length).toBeGreaterThan(0);
  });
});

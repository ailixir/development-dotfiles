/**
 * Story 10.17 AC-3 — **reference/value correspondence, before capacity.**
 *
 * Before this story `validateEnvelope` checked that `resolvedVars` and `resolvedSecrets` were
 * string records and **never compared their keys to `references`**. A job declaring a secret and
 * supplying no value was therefore admitted: it took a capacity slot, issued an admission, launched
 * Chromium, and died mid-step with `Secret "LOGIN_PW" was not resolved for this run.` in front of a
 * real application. The epic's acceptance bullet — *"unauthorized or missing reference prevents
 * browser launch"* — was not true.
 *
 * Four refusals, each its own test, and each asserting four things: `400`, no capacity taken, no
 * admission request issued, and that the refusal detail names the reference and carries no value.
 * The fifth assertion AC-3 asks for — *no browser process exists* — is a statement about the
 * process table and cannot honestly be made here against a fake launcher, so it lives in
 * `test/fixtures-tier/no-browser-on-refusal.test.ts` where a real one can be observed. "Assert
 * launch was not called" is the assertion class this epic has already found worthless, and it is
 * deliberately not what this file does either: `harness.log` is read for the *admission* request,
 * which is a message that either left the process or did not.
 */
import { describe, expect, it, afterEach } from 'vitest';

import { validateEnvelope } from '../../src/reporting/envelope.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

const CANARY = 'correspondence-canary-9f31d0';

/** The four ways a job's declarations and its values can fail to correspond. */
const CASES = [
  {
    id: 'a declared secret with no value',
    code: 'JOB_REFERENCE_NOT_RESOLVED',
    field: 'PW',
    job: {
      references: { variables: [], secrets: ['PW'] },
      resolvedVars: {},
      resolvedSecrets: {},
    },
  },
  {
    id: 'a declared variable with no value',
    code: 'JOB_REFERENCE_NOT_RESOLVED',
    field: 'REGION',
    job: {
      references: { variables: ['REGION'], secrets: ['PW'] },
      resolvedVars: {},
      resolvedSecrets: { PW: CANARY },
    },
  },
  {
    id: 'a value the artifact cannot name',
    code: 'JOB_RESOLVED_NOT_DECLARED',
    field: 'SMUGGLED',
    job: {
      references: { variables: [], secrets: ['PW'] },
      resolvedVars: {},
      resolvedSecrets: { PW: CANARY, SMUGGLED: CANARY },
    },
  },
  {
    id: 'a name crossed between the two kinds',
    code: 'JOB_REFERENCE_CROSSED_TYPE',
    field: 'PW',
    job: {
      references: { variables: ['PW'], secrets: ['PW'] },
      resolvedVars: { PW: CANARY },
      resolvedSecrets: { PW: CANARY },
    },
  },
] as const;

describe('AC-3 — a job whose values do not correspond to its declarations is refused before capacity', () => {
  for (const testCase of CASES) {
    it(`refuses ${testCase.id} with 400, no capacity and no admission`, async () => {
      harness = createHarness();
      await harness.start();

      const response = await post(
        harness.port,
        '/v1/runs',
        JSON.stringify(validJob(testCase.job)),
        SERVICE_TOKEN,
      );

      expect(response.status, 'the refusal is terminal, not a retryable 429').toBe(400);
      const body = JSON.parse(response.body) as {
        code: string;
        detail?: { code: string; field: string }[];
      };
      expect(body.code).toBe('JOB_INVALID');
      expect(body.detail).toContainEqual({ code: testCase.code, field: testCase.field });

      // No capacity taken. `validateEnvelope` is step 1 of `submit`, before `pool.tryAcquire()`.
      expect(harness.app.pool.inUse, 'an invalid job consumed a capacity slot').toBe(0);
      expect(harness.app.coordinator.inFlight).toBe(0);

      // No admission request left the process. This is observed on the HTTP client's own record of
      // what it was asked to send, not on a log line and not on a spy's call count.
      expect(
        harness.http.admissionRequests,
        'an admission request was issued for a job that was refused at the envelope',
      ).toHaveLength(0);

      // The refusal names the reference and never the value (§9.2, AC-6). Asserted on the
      // serialized response bytes, which is what actually reaches a reader.
      expect(response.body).not.toContain(CANARY);
    });
  }

  it('the experiment is capable of failing: the same job with corresponding values is admitted', async () => {
    // Without this, "deny everything" would satisfy all four tests above. This is the permit
    // companion at the envelope: the identical job shape, corresponding, reaches capacity.
    harness = createHarness();
    await harness.start();

    const response = await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(
        validJob({
          references: { variables: ['REGION'], secrets: ['PW'] },
          resolvedVars: { REGION: 'emea' },
          resolvedSecrets: { PW: CANARY },
        }),
      ),
      SERVICE_TOKEN,
    );

    expect(response.status, 'a corresponding job must not be refused').toBe(202);
    expect(harness.http.admissionRequests.length).toBeGreaterThan(0);
  });

  it('reports correspondence problems with key names only, never a value', () => {
    // The whole `detail` array is logged and returned, so every member of it has to be safe. This
    // asserts the property over all four cases at once, on the validator's own output.
    for (const testCase of CASES) {
      const result = validateEnvelope(validJob(testCase.job));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(JSON.stringify(result.problems)).not.toContain(CANARY);
      for (const problem of result.problems) {
        expect(Object.keys(problem).sort()).toEqual(['code', 'field']);
      }
    }
  });
});

describe('secretOrigins — optional, bound only to declared secrets, canonical origins only', () => {
  const problemsFor = (secretOrigins: unknown) => {
    const result = validateEnvelope(validJob({ secretOrigins }));
    return result.ok ? [] : result.problems;
  };

  it('accepts canonical http(s) origins for a declared secret, and accepts absence', () => {
    expect(problemsFor({ PW: ['https://login.app.example', 'http://127.0.0.1:8080'] })).toEqual([]);
    expect(problemsFor({ PW: [] })).toEqual([]);
    expect(validateEnvelope(validJob()).ok).toBe(true);
  });

  it('refuses an origin for a secret the job does not declare, by id only', () => {
    expect(problemsFor({ OTHER: ['https://login.app.example'] })).toEqual([
      { code: 'JOB_RESOLVED_NOT_DECLARED', field: 'secretOrigins.OTHER' },
    ]);
  });

  it.each([
    ['a path', 'https://login.app.example/signin'],
    ['a trailing slash', 'https://login.app.example/'],
    ['an uppercase host', 'https://Login.App.Example'],
    ['a default port', 'https://login.app.example:443'],
    ['a non-http scheme', 'ftp://login.app.example'],
    ['a non-URL', 'login.app.example'],
  ])('refuses %s', (_label, origin) => {
    const problems = problemsFor({ PW: [origin] });
    expect(problems).toEqual([{ code: 'JOB_FIELD_INVALID', field: 'secretOrigins.PW' }]);
    // A problem names the field, never the origin.
    expect(JSON.stringify(problems)).not.toContain(origin);
  });

  it('refuses a non-record, a non-array entry and an over-long list', () => {
    expect(problemsFor(['https://login.app.example'])).toEqual([
      { code: 'JOB_FIELD_INVALID', field: 'secretOrigins' },
    ]);
    expect(problemsFor({ PW: 'https://login.app.example' })).toEqual([
      { code: 'JOB_FIELD_INVALID', field: 'secretOrigins.PW' },
    ]);
    const many = Array.from({ length: 17 }, (_, index) => `https://h${String(index)}.example`);
    expect(problemsFor({ PW: many })).toEqual([
      { code: 'JOB_FIELD_INVALID', field: 'secretOrigins.PW' },
    ]);
  });
});

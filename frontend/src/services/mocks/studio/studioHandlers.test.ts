import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';
import { MOCK_READABLE_CSIS, OTHER_CSI, mockExecutions, mockTests } from './fixtures';
import { draftsByReadiness, readinessDrafts } from './readinessFixtures';
import studioApi from '@/services/api/studioApi';
import {
  CANCELLED_ERROR_CODE,
  defaultConfiguration,
  type AuthoringStep,
  type TestRequest,
} from '@/types/studio/studioTypes';

/**
 * Story 10.1 AC-16 / AC-21 — the mock behaves like the server, including where it refuses.
 *
 * The scoping assertions matter most: a mock that hands back every tenant's rows quietly teaches
 * the UI to expect data the real API will never return, and the resulting bug surfaces as an
 * empty screen in production rather than a red test here.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

const otherCsiTest = mockTests.find((test) => test.csiId === OTHER_CSI)!;
const otherCsiExecution = mockExecutions.find((execution) => execution.csiId === OTHER_CSI)!;

describe('list scoping', () => {
  it('an unfiltered test list never contains another CSI', async () => {
    // One page of 100 holds every readable fixture, so the scope check sees the whole list.
    const page = await studioApi.listTests({ size: 100 });

    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((test) => MOCK_READABLE_CSIS.includes(test.csiId!))).toBe(true);
    expect(page.data.map((test) => test.id)).not.toContain(otherCsiTest.id);
    expect(page.totalElements).toBe(page.data.length);
    expect(
      page.data.every(
        (test) =>
          test.confirmedRevisionArtifact == null &&
          test.confirmedRevisionArtifactHash == null,
      ),
    ).toBe(true);

    const detail = await studioApi.getTest(mockTests[0].id);
    expect(detail.confirmedRevisionArtifact).not.toBeNull();
    expect(detail.confirmedRevisionArtifactHash).toHaveLength(64);
  });

  it('an unfiltered history list never contains another CSI', async () => {
    const page = await studioApi.listExecutions();

    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((execution) => MOCK_READABLE_CSIS.includes(execution.csiId!))).toBe(
      true,
    );
    expect(page.data.map((execution) => execution.executionId)).not.toContain(
      otherCsiExecution.executionId,
    );
  });

  it('asking for another CSI explicitly returns nothing rather than widening the scope', async () => {
    const page = await studioApi.listTests({ csiId: OTHER_CSI });

    expect(page.data).toHaveLength(0);
    expect(page.totalElements).toBe(0);
  });

  it('reading another CSI test or execution by id is refused', async () => {
    await expect(studioApi.getTest(otherCsiTest.id)).rejects.toBeDefined();
    await expect(studioApi.getExecution(otherCsiExecution.executionId)).rejects.toBeDefined();
  });

  it('testId is optional on history', async () => {
    const scoped = await studioApi.listExecutions({ testId: mockTests[0].id });
    const unscoped = await studioApi.listExecutions();

    expect(scoped.data.every((execution) => execution.testId === mockTests[0].id)).toBe(true);
    expect(unscoped.totalElements).toBeGreaterThanOrEqual(scoped.totalElements);
  });
});

/** Stable step IDs the way an editor mints them: one per step, kept for as long as the step lives. */
const authored = (...texts: string[]): AuthoringStep[] =>
  texts.map((text) => ({ id: crypto.randomUUID(), text }));

describe('write paths follow the contract', () => {
  const baseRequest: TestRequest = {
    authoringSchemaVersion: 2,
    name: 'Mock draft',
    description: 'created by a test',
    csiId: MOCK_READABLE_CSIS[0],
    environment: 'Production',
    steps: authored('Go to "https://www.citi.com"'),
    variables: [],
    configuration: defaultConfiguration(),
  };

  it('creates a draft that starts UNLEARNED with no confirmed revision', async () => {
    const created = await studioApi.createTest(baseRequest);

    expect(created.readiness).toBe('UNLEARNED');
    expect(created.firstChangedStepId).toBeNull();
    expect(created.confirmedRevisionId).toBeNull();
    expect(created.sourceRevision).toBe(1);
    expect(created.steps).toMatchObject(baseRequest.steps);
  });

  it('rejects an engine other than the canonical one', async () => {
    await expect(
      studioApi.createTest({
        ...baseRequest,
        configuration: { ...defaultConfiguration(), browser: 'firefox' as never },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects a save that carries stale revisions', async () => {
    const created = await studioApi.createTest(baseRequest);

    await expect(
      studioApi.updateTest(created.id, {
        ...baseRequest,
        steps: authored('Go to "https://www.citi.com/other"'),
        sourceRevision: 99,
        configurationRevision: 99,
      }),
    ).rejects.toBeDefined();
  });

  it('advances the source revision and leaves the draft unlearned on a step change', async () => {
    const created = await studioApi.createTest(baseRequest);

    const updated = await studioApi.updateTest(created.id, {
      ...baseRequest,
      steps: [{ id: baseRequest.steps[0].id, text: 'Go to "https://www.citi.com/other"' }],
      sourceRevision: created.sourceRevision,
      configurationRevision: created.configurationRevision,
    });

    expect(updated.sourceRevision).toBe(created.sourceRevision + 1);
    expect(updated.readiness).toBe('UNLEARNED');
    expect(updated.firstChangedStepId).toBeNull();
  });
});

describe('execute acceptance', () => {
  it('accepts a run as PENDING and exposes it on the snapshot endpoint', async () => {
    const accepted = await studioApi.executeTest(mockTests[0].id);

    expect(accepted.status).toBe('PENDING');
    const snapshot = await studioApi.getExecution(accepted.executionId);
    expect(snapshot.status).toBe('PENDING');
    expect(snapshot.startedAt).toBeNull();
    expect(snapshot.endedAt).toBeNull();
    expect(snapshot.durationMs).toBeNull();
    expect(snapshot.streamComplete).toBe(false);
  });

  it('returns the same execution for a retried idempotency key', async () => {
    const key = 'fixture-key-1';

    const first = await studioApi.executeTest(mockTests[0].id, key);
    const retry = await studioApi.executeTest(mockTests[0].id, key);

    expect(retry.executionId).toBe(first.executionId);
  });

  it('starts a new run when no key is supplied', async () => {
    const first = await studioApi.executeTest(mockTests[0].id);
    const second = await studioApi.executeTest(mockTests[0].id);

    expect(second.executionId).not.toBe(first.executionId);
  });
});

describe('cancel (Studio v1)', () => {
  it('ends a live run as ERROR/CANCELLED with 202, and refuses a second cancel with 409', async () => {
    const accepted = await studioApi.executeTest(mockTests[0].id);

    const snapshot = await studioApi.cancelExecution(accepted.executionId);
    expect(snapshot.status).toBe('ERROR');
    expect(snapshot.errorCode).toBe(CANCELLED_ERROR_CODE);
    expect(snapshot.streamComplete).toBe(true);
    expect((await studioApi.getExecution(accepted.executionId)).errorCode).toBe(CANCELLED_ERROR_CODE);

    await expect(studioApi.cancelExecution(accepted.executionId)).rejects.toMatchObject({
      response: { status: 409 },
    });
  });

  it('refuses an execution on another CSI', async () => {
    await expect(studioApi.cancelExecution(otherCsiExecution.executionId)).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});

describe('STUDIO-OBS-012B: the single-path routes are served the way the contract declares', () => {
  it('the single-draft read serves every readiness fixture by id, and the list never carries one', async () => {
    for (const [readiness, draft] of Object.entries(draftsByReadiness)) {
      const test = await studioApi.getTest(draft.id);
      expect(test.readiness).toBe(readiness);
    }
    const page = await studioApi.listTests({ size: 100 });
    const listed = page.data.map((test) => test.id);
    for (const draft of readinessDrafts) {
      expect(listed).not.toContain(draft.id);
    }
  });

  it('execute answers 409 LEARN_REQUIRED for a readable draft that is not READY', async () => {
    const unlearned = mockTests.find(
      (test) => test.readiness !== 'READY' && test.csiId !== null && MOCK_READABLE_CSIS.includes(test.csiId),
    );
    expect(unlearned, 'fixture: a readable draft that is not READY').toBeDefined();
    await expect(studioApi.executeTest(unlearned!.id)).rejects.toMatchObject({
      response: { status: 409, data: { error: 'LEARN_REQUIRED' } },
    });
  });

  it('validate-variables reports undeclared, unvalued and unused references and writes nothing', async () => {
    const created = await studioApi.createTest({
      ...baseRequestFor('Variables draft'),
      steps: authored('Type <var USER_ID> into "User"', 'Type <secret PW> into "Password"', 'Type <var MISSING> into "x"'),
      variables: [
        { name: 'USER_ID', kind: 'plain', value: '' },
        { name: 'SPARE', kind: 'plain', value: 'x' },
      ],
    });

    const report = await studioApi.validateVariables(created.id, {});
    expect(report).toEqual({
      testId: created.id,
      isValid: false,
      valid: false,
      hasVariables: true,
      missing: ['<var MISSING>', '<secret PW>', 'USER_ID'],
      undeclared: ['<var MISSING>', '<secret PW>'],
      unvalued: ['USER_ID'],
      conflicting: [],
      unused: ['SPARE'],
    });

    // A supplied value counts by presence only; the draft itself is unchanged.
    const supplied = await studioApi.validateVariables(created.id, { USER_ID: 'pilot' });
    expect(supplied.unvalued).toEqual([]);
    const after = await studioApi.getTest(created.id);
    expect(after.sourceRevision).toBe(created.sourceRevision);
    expect(after.variables).toEqual(created.variables);
  });

  it('validate-variables refuses an id the caller cannot read with the same 403 as the read', async () => {
    await expect(studioApi.validateVariables(otherCsiTest.id, {})).rejects.toMatchObject({
      response: { status: 403, data: { error: 'STUDIO_FORBIDDEN' } },
    });
  });
});

function baseRequestFor(name: string): TestRequest {
  return {
    authoringSchemaVersion: 2,
    name,
    description: null,
    csiId: MOCK_READABLE_CSIS[0],
    environment: 'Production',
    steps: [],
    variables: [],
    configuration: defaultConfiguration(),
  };
}

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';
import { MOCK_READABLE_CSIS, OTHER_CSI, mockExecutions, mockTests } from './fixtures';
import { awaitingDraft, needsRevisionDraft, readyDraft } from './compileFixtures';
import studioApi from '@/services/api/studioApi';
import { CANCELLED_ERROR_CODE, defaultConfiguration } from '@/types/studio/studioTypes';

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
          test.currentCandidateArtifact == null &&
          test.currentCandidateArtifactHash == null &&
          test.confirmedRevisionArtifact == null &&
          test.confirmedRevisionArtifactHash == null &&
          test.compileDiagnostics == null,
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

describe('write paths follow the contract', () => {
  const baseRequest = {
    name: 'Mock draft',
    description: 'created by a test',
    csiId: MOCK_READABLE_CSIS[0],
    environment: 'Production',
    steps: ['Go to "https://www.citi.com"'],
    variables: [],
    configuration: defaultConfiguration(),
  };

  it('creates a draft that starts STALE with no confirmed revision', async () => {
    const created = await studioApi.createTest(baseRequest);

    expect(created.compileStatus).toBe('STALE');
    expect(created.confirmedRevisionId).toBeNull();
    expect(created.sourceRevision).toBe(1);
    expect(created.steps).toEqual(baseRequest.steps);
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
        steps: ['Go to "https://www.citi.com/other"'],
        sourceRevision: 99,
        configurationRevision: 99,
      }),
    ).rejects.toBeDefined();
  });

  it('advances the source revision and invalidates the candidate on a step change', async () => {
    const created = await studioApi.createTest(baseRequest);

    const updated = await studioApi.updateTest(created.id, {
      ...baseRequest,
      steps: ['Go to "https://www.citi.com/other"'],
      sourceRevision: created.sourceRevision,
      configurationRevision: created.configurationRevision,
    });

    expect(updated.sourceRevision).toBe(created.sourceRevision + 1);
    expect(updated.compileStatus).toBe('STALE');
    expect(updated.currentCandidateRevisionId).toBeNull();
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


describe('story 10.10: the compile-review corpus is served the way the contract declares', () => {
  it('the single-draft read carries the diagnostics document', async () => {
    const test = await studioApi.getTest(needsRevisionDraft.id);

    expect(test.compileStatus).toBe('NEEDS_REVISION');
    expect(test.compileDiagnostics).not.toBeNull();
    expect(test.compileDiagnostics!.steps).toHaveLength(test.steps.length);
  });

  it('the list never carries a review draft, so the projection stays the declared one', async () => {
    const page = await studioApi.listTests();
    expect(page.data.map((test) => test.id)).not.toContain(needsRevisionDraft.id);
    for (const test of page.data) {
      expect(test.compileDiagnostics ?? null).toBeNull();
    }
  });

  it('confirm-compile refuses a body short of the four declared fields', async () => {
    await expect(
      studioApi.confirmCompile(awaitingDraft.id, {
        revisionId: awaitingDraft.currentCandidateRevisionId!,
        sourceRevision: awaitingDraft.sourceRevision,
        configurationRevision: awaitingDraft.configurationRevision,
      } as never),
    ).rejects.toBeDefined();
  });

  it('confirm-compile answers 409 STALE_CANDIDATE when the identity does not match', async () => {
    await expect(
      studioApi.confirmCompile(awaitingDraft.id, {
        revisionId: '22222222-2222-2222-2222-2222222222ff',
        artifactHash: 'b'.repeat(64),
        sourceRevision: awaitingDraft.sourceRevision,
        configurationRevision: awaitingDraft.configurationRevision,
      }),
    ).rejects.toThrow('STALE_CANDIDATE');
  });

  it('confirm-compile answers 409 for a draft that is not awaiting confirmation', async () => {
    await expect(
      studioApi.confirmCompile(readyDraft.id, {
        revisionId: readyDraft.currentCandidateRevisionId!,
        artifactHash: 'b'.repeat(64),
        sourceRevision: readyDraft.sourceRevision,
        configurationRevision: readyDraft.configurationRevision,
      }),
    ).rejects.toThrow('STALE_CANDIDATE');
  });

  it('confirming the exact identity on screen moves the draft to READY', async () => {
    const confirmed = await studioApi.confirmCompile(awaitingDraft.id, {
      revisionId: awaitingDraft.currentCandidateRevisionId!,
      artifactHash: 'b'.repeat(64),
      sourceRevision: awaitingDraft.sourceRevision,
      configurationRevision: awaitingDraft.configurationRevision,
    });

    expect(confirmed.compileStatus).toBe('READY');
    expect(confirmed.confirmedRevisionId).toBe(awaitingDraft.currentCandidateRevisionId);
  });

  it('compile answers 202 with the revisions it was asked about', async () => {
    const accepted = await studioApi.compileTest(awaitingDraft.id);
    expect(accepted.compileStatus).toBe('COMPILING');
    expect(accepted.sourceRevision).toBe(awaitingDraft.sourceRevision);
  });
});

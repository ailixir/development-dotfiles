import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import studioApi from '@/services/api/studioApi';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { defaultConfiguration, type TestDetailDto, type TestUpdateRequest } from '@/types/studio/studioTypes';
import type { FinalizeRequest, GuidedStartRequest } from '@/types/studio/studioGuidedTypes';
import { MOCK_EXECUTE_DENIED_CSIS, MOCK_READABLE_CSIS, mockTests } from './fixtures';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';
import { failGuidedRequests, guidedRequestCount, setGuidedScenario } from './guidedHandlers';
import { PUBLICATION_CONFLICT_SCENARIO, endsIn } from './guidedFixtures';

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { studioMockServer.resetHandlers(); resetStudioMocks(); });
afterAll(() => studioMockServer.close());

const writeOf = (test: TestDetailDto): TestUpdateRequest => ({
  authoringSchemaVersion: 2, name: test.name, description: test.description ?? '', csiId: test.csiId,
  environment: test.environment, steps: test.steps, globalContext: test.globalContext,
  variables: test.variables, configuration: test.configuration,
  sourceRevision: test.sourceRevision, configurationRevision: test.configurationRevision,
});

/** Mirrors the UI's empty creation followed by its first source save, using the real API clients. */
async function createSavedDraft(): Promise<TestDetailDto> {
  const created = await studioApi.createTest({
    authoringSchemaVersion: 2, name: 'Synthetic publication and replay', description: '',
    csiId: MOCK_READABLE_CSIS[0], environment: 'Development', steps: [], variables: [], configuration: defaultConfiguration(),
  });
  return studioApi.updateTest(created.id, {
    ...writeOf(created),
    steps: [
      { id: crypto.randomUUID(), text: 'Go to "https://synthetic.example.invalid"' },
      { id: crypto.randomUUID(), text: 'Check that "Synthetic ready" is visible' },
    ],
  });
}

async function start(test: TestDetailDto) {
  const capabilities = await studioApi.getCapabilities(test.id);
  if (!capabilities.guidedStart.available) throw new Error('Expected synthetic learn capability');
  const request = capabilities.guidedStart.context;
  const started = await studioGuidedApi.startSession(request, crypto.randomUUID());
  return { id: started.session.sessionId, request };
}

async function readUntil(id: string, state: string) {
  for (let index = 0; index < 30; index += 1) {
    const read = await studioGuidedApi.readSession(id);
    if (read.session.state === state) return read;
  }
  throw new Error(`Synthetic session did not reach ${state}`);
}

const finalizeBody = (request: GuidedStartRequest): FinalizeRequest => ({
  schemaVersion: 3, expectedSourceRevision: request.sourceRevision,
  expectedConfigurationRevision: request.configurationRevision,
});

async function learn(test: TestDetailDto) {
  const session = await start(test);
  await readUntil(session.id, 'FINALIZING');
  const key = crypto.randomUUID();
  const receipt = await studioGuidedApi.finalize(session.id, finalizeBody(session.request), key);
  return { ...session, key, receipt };
}

describe('the composed MSW publication and replay lifecycle', () => {
  it('creates, learns, publishes, reads READY and replays the receipt revision to a bounded synthetic terminal snapshot', async () => {
    const draft = await createSavedDraft();
    expect(draft.readiness).toBe('UNLEARNED');
    const other = await createSavedDraft();
    const publication = await learn(draft);
    const current = await studioApi.getTest(draft.id);
    expect(current).toMatchObject({
      readiness: 'READY', sourceRevision: draft.sourceRevision, configurationRevision: draft.configurationRevision,
      confirmedRevisionId: publication.receipt.revisionId,
      confirmedRevisionArtifactHash: publication.receipt.artifactHash,
      confirmedRevisionArtifact: null,
    });
    expect((await studioApi.getTest(other.id)).readiness).toBe('UNLEARNED');
    expect((await studioGuidedApi.readResult(publication.id)).result.publication).toEqual({
      status: 'PUBLISHED', receipt: publication.receipt,
    });
    const listed = (await studioApi.listTests({ size: 100 })).data.find((test) => test.id === draft.id);
    expect(listed).toMatchObject({ readiness: 'READY', confirmedRevisionId: publication.receipt.revisionId, confirmedRevisionArtifactHash: null });

    const executeKey = crypto.randomUUID();
    const accepted = await studioApi.executeTest(current.id, executeKey);
    expect((await studioApi.executeTest(current.id, executeKey)).executionId).toBe(accepted.executionId);
    const frames = [];
    for (let index = 0; index < 3; index += 1) frames.push(await studioApi.getExecution(accepted.executionId));
    expect(frames.map((frame) => frame.status)).toEqual(['PENDING', 'RUNNING', 'PASSED']);
    expect(frames.map((frame) => frame.revision)).toEqual([1, 2, 3]);
    expect(frames.every((frame) => frame.revisionId === publication.receipt.revisionId)).toBe(true);
    const terminal = frames[2];
    expect(terminal).toMatchObject({ streamComplete: true, video: { status: 'UNAVAILABLE' }, videoPath: null });
    expect(terminal.stepResults.every((step) => step.status === 'PASS')).toBe(true);
    expect(terminal.logs.every((log) => log.message.startsWith('Synthetic MSW replay'))).toBe(true);
    expect(terminal.logs[terminal.logs.length - 1]?.message).toContain('no browser ran and no recording exists');
    expect(await studioApi.getExecution(accepted.executionId)).toEqual(terminal);
    expect((await studioApi.executeTest(current.id, executeKey)).executionId).toBe(accepted.executionId);
    expect(await studioApi.getExecution(accepted.executionId)).toEqual(terminal);
    expect(guidedRequestCount('start')).toBe(1);
  });

  it.each(['source', 'configuration'] as const)('refuses publication after current %s drift without making the draft READY', async (change) => {
    const draft = await createSavedDraft();
    const session = await start(draft);
    await readUntil(session.id, 'FINALIZING');
    const next = await studioApi.updateTest(draft.id, {
      ...writeOf(draft),
      ...(change === 'source'
        ? { steps: draft.steps.map((step, index) => index === 1 ? { ...step, text: 'Check that "Changed" is visible' } : step) }
        : { configuration: { ...draft.configuration, timeoutSeconds: draft.configuration.timeoutSeconds + 1 } }),
    });
    await expect(studioGuidedApi.finalize(session.id, finalizeBody(session.request), crypto.randomUUID())).rejects.toMatchObject({
      response: { status: 409, data: { code: 'REVISION_CONFLICT' } },
    });
    expect(await studioApi.getTest(draft.id)).toMatchObject({
      readiness: 'UNLEARNED', sourceRevision: next.sourceRevision, configurationRevision: next.configurationRevision,
      confirmedRevisionId: null, confirmedRevisionArtifactHash: null,
    });
    expect((await studioGuidedApi.readResult(session.id)).result.publication).toEqual({ status: 'PENDING', receipt: null });
    await expect(studioApi.executeTest(draft.id)).rejects.toMatchObject({ response: { status: 409 } });
  });

  it.each([
    { name: 'failed learn', scenario: endsIn('FAILED', { atStepIndex: 1, failureCode: 'ASSERTION_FAILED' }), state: 'FAILED', publication: 'REFUSED' },
    { name: 'publication conflict', scenario: PUBLICATION_CONFLICT_SCENARIO, state: 'FINALIZING', publication: 'CONFLICT' },
  ])('$name never marks the saved draft READY', async ({ scenario, state, publication }) => {
    const draft = await createSavedDraft();
    setGuidedScenario(scenario, draft.id);
    const session = await start(draft);
    await readUntil(session.id, state);
    await expect(studioGuidedApi.finalize(session.id, finalizeBody(session.request), crypto.randomUUID())).rejects.toMatchObject({
      response: { status: 409, data: { code: 'PUBLICATION_CONFLICT' } },
    });
    expect((await studioGuidedApi.readResult(session.id)).result.publication).toEqual({ status: publication, receipt: null });
    expect(await studioApi.getTest(draft.id)).toMatchObject({ readiness: 'UNLEARNED', confirmedRevisionId: null });
  });

  it('does not publish a finalize refused before processing, and safely retries that same key', async () => {
    const draft = await createSavedDraft();
    const session = await start(draft);
    await readUntil(session.id, 'FINALIZING');
    const key = crypto.randomUUID();
    failGuidedRequests('finalize', { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Synthetic refusal' } } });
    await expect(studioGuidedApi.finalize(session.id, finalizeBody(session.request), key)).rejects.toMatchObject({ response: { status: 401 } });
    expect((await studioApi.getTest(draft.id)).readiness).toBe('UNLEARNED');
    const receipt = await studioGuidedApi.finalize(session.id, finalizeBody(session.request), key);
    expect(await studioApi.getTest(draft.id)).toMatchObject({ readiness: 'READY', confirmedRevisionId: receipt.revisionId });
  });

  it('retries a lost finalized response without republishing or reviving READY after a subsequent edit', async () => {
    const draft = await createSavedDraft();
    const session = await start(draft);
    await readUntil(session.id, 'FINALIZING');
    const key = crypto.randomUUID();
    failGuidedRequests('finalize', 'network', { afterProcessing: true });
    await expect(studioGuidedApi.finalize(session.id, finalizeBody(session.request), key)).rejects.toBeDefined();
    const result = (await studioGuidedApi.readResult(session.id)).result;
    if (result.publication.status !== 'PUBLISHED') throw new Error('Expected stored synthetic receipt');
    const published = await studioApi.getTest(draft.id);
    const edited = await studioApi.updateTest(draft.id, {
      ...writeOf(published), steps: published.steps.map((step) => ({ ...step, text: `${step.text} again` })),
    });
    const retry = await studioGuidedApi.finalize(session.id, finalizeBody(session.request), key);
    expect(retry).toEqual(result.publication.receipt);
    expect(await studioApi.getTest(draft.id)).toMatchObject({
      readiness: 'UNLEARNED', sourceRevision: edited.sourceRevision,
      confirmedRevisionId: result.publication.receipt.revisionId, updatedAt: edited.updatedAt,
    });
    expect(guidedRequestCount('finalize', { executedOnly: true })).toBe(1);
    await expect(studioGuidedApi.finalize(session.id, {
      ...finalizeBody(session.request), expectedSourceRevision: String(edited.sourceRevision),
    }, key)).rejects.toMatchObject({ response: { status: 409, data: { code: 'IDEMPOTENCY_CONFLICT' } } });
  });

  it('preserves cancellation before publication and never advances a cancelled replay back to success', async () => {
    const draft = await createSavedDraft();
    const session = await start(draft);
    await studioGuidedApi.cancel(session.id, { schemaVersion: 3, reason: 'userRequested' }, crypto.randomUUID());
    await expect(studioGuidedApi.finalize(session.id, finalizeBody(session.request), crypto.randomUUID())).rejects.toMatchObject({ response: { status: 409 } });
    expect(await studioApi.getTest(draft.id)).toMatchObject({ readiness: 'UNLEARNED', confirmedRevisionId: null });
    await learn(draft);
    const accepted = await studioApi.executeTest(draft.id, crypto.randomUUID());
    await studioApi.getExecution(accepted.executionId);
    const running = await studioApi.getExecution(accepted.executionId);
    const cancelled = await studioApi.cancelExecution(accepted.executionId);
    expect(cancelled).toMatchObject({ status: 'ERROR', errorCode: 'CANCELLED', streamComplete: true, revision: running.revision + 1 });
    for (let index = 0; index < 4; index += 1) expect(await studioApi.getExecution(accepted.executionId)).toEqual({ ...cancelled, testName: draft.name });
    await expect(studioApi.cancelExecution(accepted.executionId)).rejects.toMatchObject({ response: { status: 409 } });
  });

  it('keeps execution permission gates and resets publication/replay state without mutating fixtures', async () => {
    const baseline = structuredClone(mockTests);
    const fixture = await studioApi.getTest(mockTests[0].id);
    const publication = await learn(fixture);
    expect((await studioApi.getTest(fixture.id)).confirmedRevisionId).toBe(publication.receipt.revisionId);
    expect(mockTests).toEqual(baseline);
    MOCK_EXECUTE_DENIED_CSIS.add(fixture.csiId!);
    await expect(studioApi.executeTest(fixture.id, crypto.randomUUID())).rejects.toMatchObject({ response: { status: 403 } });
    MOCK_EXECUTE_DENIED_CSIS.clear();
    const accepted = await studioApi.executeTest(fixture.id, crypto.randomUUID());
    await studioApi.getExecution(accepted.executionId);
    await studioApi.getExecution(accepted.executionId);
    resetStudioMocks();
    expect(await studioApi.getTest(fixture.id)).toEqual(fixture);
    expect(mockTests).toEqual(baseline);
    await expect(studioApi.getExecution(accepted.executionId)).rejects.toMatchObject({ response: { status: 404 } });
    await expect(studioGuidedApi.readSession(publication.id)).rejects.toMatchObject({ response: { status: 403 } });
    const fresh = await studioApi.executeTest(fixture.id, crypto.randomUUID());
    expect(await studioApi.getExecution(fresh.executionId)).toMatchObject({ status: 'PENDING', revision: 1 });
  });
});

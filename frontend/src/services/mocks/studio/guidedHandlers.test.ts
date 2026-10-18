import fs from 'node:fs';
import path from 'node:path';
import AjvDraft07 from 'ajv';
import { setupServer } from 'msw/node';
import { parse as parseYaml } from 'yaml';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StudioVariable, TestDto } from '@/types/studio/studioTypes';
import {
  GUIDED_ERROR_CODES,
  type GuidedClarification,
  type GuidedResult,
  type GuidedSessionView,
  type GuidedStartRequest,
  type StudioCapabilities,
} from '@/types/studio/studioGuidedTypes';
import {
  GUIDED_START_REFUSALS,
  LEARN_SCENARIO,
  PUBLICATION_CONFLICT_SCENARIO,
  endsIn,
  learnWithQuestion,
  learnWithSettlingVideo,
  loginRequired,
  refusesStart,
  type GuidedMockRefusal,
  type GuidedStartRefusalName,
} from './guidedFixtures';
import {
  createGuidedHandlers,
  failGuidedRequests,
  guidedHandlers,
  guidedRequestCount,
  guidedRequestLog,
  guidedSessionsForTest,
  hasAmbiguousDeclarations,
  resetGuidedMocks,
  setGuidedScenario,
  UNAUTHENTICATED_REFUSAL,
} from './guidedHandlers';
import {
  capabilityHandlers,
  capabilityRequestCount,
  createCapabilityHandlers,
  failCapabilityReads,
  resetCapabilityMocks,
  setGuidedStartCapability,
  setVaultSecrets,
} from './capabilityHandlers';
import { MOCK_EXECUTE_DENIED_CSIS } from './fixtures';
import { draftsByReadiness } from './readinessFixtures';

/**
 * AC-1: the guided MSW mirror is checked against the v3 contract, not against itself. Every body
 * the handlers return is validated with the same draft-07 Ajv harness the contract suite loads the
 * v3 schemas into, and the behaviours the contract fixes (idempotency, closed bodies, the 403 that
 * does not distinguish absent from denied, 202 versus 200) are asserted on the wire.
 */

const V3_DIR = path.resolve(
  __dirname,
  '../../../../../docs/specs/studio-observed-authoring/contracts/v3',
);
const V3_ID = 'https://checks.citi.example/contracts/observed/v3';

const ajv = new AjvDraft07({ strict: false, allErrors: true, logger: false });
for (const file of fs.readdirSync(V3_DIR).filter((name) => name.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(V3_DIR, file), 'utf8')));
}

function validator(reference: string) {
  const validate = ajv.getSchema(`${V3_ID}/${reference}`);
  expect(validate, `contracts/v3 no longer publishes ${reference}`).toBeDefined();
  return validate!;
}

function expectValid(reference: string, body: unknown): void {
  const validate = validator(reference);
  expect(validate(body), `${reference}: ${JSON.stringify(validate.errors)}`).toBe(true);
}

const server = setupServer(...guidedHandlers, ...capabilityHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetGuidedMocks();
  resetCapabilityMocks();
  MOCK_EXECUTE_DENIED_CSIS.clear();
});
afterAll(() => server.close());

const ORIGIN = 'http://localhost/api/v1/studio';
const UNLEARNED = draftsByReadiness.UNLEARNED;
const NEEDS_RELEARN = draftsByReadiness.NEEDS_RELEARN;

interface Reply<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

async function call<T = unknown>(
  method: 'GET' | 'POST',
  route: string,
  options: { key?: string | null; body?: unknown } = {},
): Promise<Reply<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.key !== null && options.key !== undefined) headers['Idempotency-Key'] = options.key;
  const response = await fetch(`${ORIGIN}${route}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T, headers: response.headers };
}

/** The start body exactly as the capability read hands it over: no client-made revision. */
async function startContext(test: TestDto = UNLEARNED): Promise<GuidedStartRequest> {
  const capabilities = await call<StudioCapabilities>('GET', `/tests/${test.id}/capabilities`);
  expect(capabilities.status).toBe(200);
  const { guidedStart } = capabilities.body;
  if (!guidedStart.available) throw new Error('guided start unavailable');
  return guidedStart.context;
}

async function start(
  key = 'start-1',
  test: TestDto = UNLEARNED,
  hints: Partial<GuidedStartRequest> = {},
): Promise<Reply<GuidedSessionView>> {
  return call<GuidedSessionView>('POST', '/guided-sessions', {
    key,
    body: { ...(await startContext(test)), ...hints },
  });
}

const readSession = (id: string) => call<GuidedSessionView>('GET', `/guided-sessions/${id}`);

async function readUntil(id: string, state: string, limit = 40): Promise<GuidedSessionView> {
  for (let index = 0; index < limit; index += 1) {
    const reply = await readSession(id);
    if (reply.body.session.state === state) return reply.body;
  }
  throw new Error(`session never reached ${state}`);
}

const FINALIZE_BODY = { schemaVersion: 3, expectedSourceRevision: '4', expectedConfigurationRevision: '1' };

describe('every body the mirror returns validates against the v3 contract', () => {
  it('walks a full learn: each session view, the pending result, the receipt and the final result', async () => {
    const started = await start();
    expect(started.status).toBe(202);
    expectValid('session-view.schema.json', started.body);
    const id = started.body.session.sessionId;

    const states: string[] = [started.body.session.state];
    for (let index = 0; index < 40 && states[states.length - 1] !== 'FINALIZING'; index += 1) {
      const reply = await readSession(id);
      expectValid('session-view.schema.json', reply.body);
      states.push(reply.body.session.state);
    }
    expect(states[0]).toBe('PREPARING');
    expect(states[states.length - 1]).toBe('FINALIZING');
    expect(new Set(states)).toEqual(new Set(['PREPARING', 'OBSERVING', 'PROPOSING', 'ACTING', 'FINALIZING']));

    // Held at the gate: reading again does not move a session that waits for finalize.
    expect((await readSession(id)).body.session.state).toBe('FINALIZING');

    const pending = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expect(pending.status).toBe(202);
    expect(pending.body.publication).toEqual({ status: 'PENDING', receipt: null });
    expectValid('result.schema.json', pending.body);

    const receipt = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'finalize-1', body: FINALIZE_BODY });
    expect(receipt.status).toBe(200);
    expectValid('publication.schema.json#/definitions/PublicationReceipt', receipt.body);

    expect((await readSession(id)).body.session.state).toBe('SUCCEEDED');
    const final = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expect(final.status).toBe(200);
    expectValid('result.schema.json', final.body);
    expect(final.body.publication.status).toBe('PUBLISHED');
    expect(final.body.currentReadiness).toMatchObject({ ready: true, code: 'READY' });
    expect(final.body.progress.activeStep).toBeNull();
    expect(final.body.explanation.steps.every((step) => step.completed && step.learnedFromThisRun)).toBe(true);
  });

  it('serves the view progress from the draft being learned, by stable step ID', async () => {
    const started = await start();
    const { progress } = started.body.session;
    expect(progress.stepCount).toBe(UNLEARNED.steps.length);
    expect(progress.activeStep).toEqual({
      stepId: '00000000-0000-4000-8000-000000000001',
      number: 1,
      text: UNLEARNED.steps[0],
    });
  });

  it.each([
    ['page choice', 'PAGE_CHOICE' as const],
    ['source choice', 'SOURCE_CHOICE' as const],
    ['side-effect confirmation', 'SIDE_EFFECT_CONFIRMATION' as const],
  ])('asks a %s question that validates and holds the session until it is answered', async (_name, kind) => {
    setGuidedScenario(learnWithQuestion(kind));
    const id = (await start()).body.session.sessionId;
    const asked = await readUntil(id, 'AWAITING_CLARIFICATION');
    expect(asked.session.progress.activeStep).not.toBeNull();
    // Held: further reads stay at the gate.
    expect((await readSession(id)).body.session.state).toBe('AWAITING_CLARIFICATION');

    const question = await call<GuidedClarification>('GET', `/guided-sessions/${id}/clarification`);
    expect(question.status).toBe(200);
    expectValid('clarification.schema.json', question.body);

    // A stale generation or an unknown question is refused and moves nothing.
    const stale = await call('POST', `/guided-sessions/${id}/clarify`, {
      key: 'c-stale',
      body: {
        schemaVersion: 3,
        clarificationId: question.body.clarificationId,
        choiceId: question.body.choices[0].choiceId,
        generation: question.body.generation + 1,
      },
    });
    expect(stale.status).toBe(409);
    expect((stale.body as { code: string }).code).toBe('STALE_GENERATION');
    expect((await readSession(id)).body.session.state).toBe('AWAITING_CLARIFICATION');

    const answered = await call('POST', `/guided-sessions/${id}/clarify`, {
      key: 'c-1',
      body: {
        schemaVersion: 3,
        clarificationId: question.body.clarificationId,
        choiceId: question.body.choices[0].choiceId,
        generation: question.body.generation,
      },
    });
    expect(answered.status).toBe(202);
    expectValid('session-view.schema.json#/definitions/PublicSession', answered.body);
    expect((answered.body as { state: string }).state).not.toBe('AWAITING_CLARIFICATION');
    expect((await call('GET', `/guided-sessions/${id}/clarification`)).status).toBe(204);
  });

  it('refuses a choice the question did not offer', async () => {
    setGuidedScenario(learnWithQuestion('PAGE_CHOICE'));
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'AWAITING_CLARIFICATION');
    const question = await call<GuidedClarification>('GET', `/guided-sessions/${id}/clarification`);
    const refused = await call('POST', `/guided-sessions/${id}/clarify`, {
      key: 'c-unknown',
      body: { schemaVersion: 3, clarificationId: question.body.clarificationId, choiceId: 'not-a-choice', generation: question.body.generation },
    });
    expect(refused.status).toBe(400);
    expectValid('error.schema.json', refused.body);
  });

  it('cancels a running session into CANCELLED with a failure the schema accepts, and cancel is idempotent on a terminal one', async () => {
    const id = (await start()).body.session.sessionId;
    await readSession(id);
    const cancelled = await call('POST', `/guided-sessions/${id}/cancel`, {
      key: 'x-1',
      body: { schemaVersion: 3, reason: 'userRequested' },
    });
    expect(cancelled.status).toBe(202);
    expectValid('session-view.schema.json#/definitions/PublicSession', cancelled.body);
    expect((cancelled.body as { state: string; progress: { activeStep: unknown } })).toMatchObject({
      state: 'CANCELLED',
      progress: { activeStep: null },
    });
    const result = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expect(result.status).toBe(200);
    expectValid('result.schema.json', result.body);
    expect(result.body).toMatchObject({ outcome: 'CANCELLED', errorCode: 'CANCELLED', failure: { code: 'CANCELLED' } });
    expect(result.body.publication.status).toBe('REFUSED');

    const again = await call('POST', `/guided-sessions/${id}/cancel`, {
      key: 'x-2',
      body: { schemaVersion: 3, reason: 'userRequested' },
    });
    expect((again.body as { state: string }).state).toBe('CANCELLED');
  });

  it.each([
    ['FAILED', endsIn('FAILED', { failureCode: 'TARGET_MISMATCH' }), 'FAILED', 'TARGET_MISMATCH'],
    ['FAILED by origin', endsIn('FAILED', { failureCode: 'ORIGIN_NOT_ALLOWED' }), 'FAILED', 'ORIGIN_NOT_ALLOWED'],
    ['UNKNOWN_OUTCOME', endsIn('UNKNOWN_OUTCOME', { failureCode: 'UNKNOWN_OUTCOME' }), 'UNKNOWN_OUTCOME', 'UNKNOWN_OUTCOME'],
    ['EXPIRED', endsIn('EXPIRED'), 'EXPIRED', 'EXPIRED'],
  ])('ends a %s session with a result the schema accepts', async (_name, scenario, finalState, code) => {
    setGuidedScenario(scenario);
    const id = (await start()).body.session.sessionId;
    const last = await readUntil(id, finalState);
    expect(last.session.progress.activeStep).toBeNull();
    const result = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expect(result.status).toBe(200);
    expectValid('result.schema.json', result.body);
    expect(result.body.outcome).toBe(finalState);
    expect(result.body.errorCode).toBe(code);
    expect(result.body.failure).toEqual({ code });
    expect(result.body.learnedFromThisRun).toBe(false);
    expect(result.body.publication.receipt).toBeNull();
    expect(result.body.currentReadiness).toMatchObject({ ready: false, code: 'NOT_PUBLISHED' });
    // What completed before the stop is explained as learned; the rest is not claimed.
    const [first, ...rest] = result.body.explanation.steps;
    expect(first.learnedFromThisRun).toBe(true);
    expect(rest.some((step) => step.learnedFromThisRun && !step.completed)).toBe(false);
  });

  it.each([true, false])('a LOGIN_REQUIRED result carries the closed detail (loginStepsPresent %s)', async (present) => {
    setGuidedScenario(loginRequired(present));
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'FAILED');
    const result = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expectValid('result.schema.json', result.body);
    expect(result.body.outcome).toBe('FAILED');
    expect(result.body.errorCode).toBe('LOGIN_REQUIRED');
    expect(result.body.detail).toEqual({ stepId: '00000000-0000-4000-8000-000000000001', loginStepsPresent: present });
    expect(result.body.failure).toEqual({ code: 'LOGIN_REQUIRED', detail: result.body.detail });
  });

  it('keeps the recording PROCESSING (no timings) for the scripted reads, then AVAILABLE with timings', async () => {
    setGuidedScenario(learnWithSettlingVideo(2));
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'FINALIZING');
    await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f', body: FINALIZE_BODY });
    const first = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    const second = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    const third = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    for (const reply of [first, second, third]) expectValid('result.schema.json', reply.body);
    expect(first.body.evidence.video.status).toBe('PROCESSING');
    expect(first.body.actionTimings).toEqual([]);
    expect(second.body.evidence.video.status).toBe('PROCESSING');
    expect(third.body.evidence.video.status).toBe('AVAILABLE');
    expect(third.body.actionTimings.some((timing) => timing.kind === 'action')).toBe(true);
  });

  it('publication conflict: finalize answers 409 and the session ends PUBLICATION_CONFLICT', async () => {
    setGuidedScenario(PUBLICATION_CONFLICT_SCENARIO);
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'FINALIZING');
    const refused = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f', body: FINALIZE_BODY });
    expect(refused.status).toBe(409);
    expectValid('error.schema.json', refused.body);
    expect((refused.body as { code: string }).code).toBe('PUBLICATION_CONFLICT');
    expect((await readSession(id)).body.session.state).toBe('PUBLICATION_CONFLICT');
    const result = await call<GuidedResult>('GET', `/guided-sessions/${id}/result`);
    expectValid('result.schema.json', result.body);
    expect(result.body.publication).toEqual({ status: 'CONFLICT', receipt: null });
  });
});

describe('an incremental learn (NEEDS_RELEARN)', () => {
  it('replays the saved prefix, learns from the server boundary, and explains reuse', async () => {
    const started = await start('s-inc', NEEDS_RELEARN);
    expect(started.status).toBe(202);
    const { session } = started.body;
    expect(session.baseRevisionId).toBe(NEEDS_RELEARN.confirmedRevisionId);
    expect(session.firstLearnStepId).toBe(NEEDS_RELEARN.firstChangedStepId);
    expectValid('session-view.schema.json', started.body);

    const states: string[] = [session.state];
    for (let index = 0; index < 40 && states[states.length - 1] !== 'FINALIZING'; index += 1) {
      states.push((await readSession(session.sessionId)).body.session.state);
    }
    expect(states).toContain('REPLAYING_PREFIX');
    await call('POST', `/guided-sessions/${session.sessionId}/finalize`, {
      key: 'f',
      body: { schemaVersion: 3, expectedSourceRevision: String(NEEDS_RELEARN.sourceRevision), expectedConfigurationRevision: String(NEEDS_RELEARN.configurationRevision) },
    });
    const result = await call<GuidedResult>('GET', `/guided-sessions/${session.sessionId}/result`);
    expectValid('result.schema.json', result.body);
    expect(result.body.relearnedFrom).toEqual({ stepId: NEEDS_RELEARN.firstChangedStepId });
    const [first, second] = result.body.explanation.steps;
    expect(first.reusedFrom).toEqual({ revisionId: NEEDS_RELEARN.confirmedRevisionId, stepId: first.stepId });
    expect(first.learnedFromThisRun).toBe(false);
    expect(second.learnedFromThisRun).toBe(true);
  });

  it('accepts the explicit base and first-step hint the server itself computed', async () => {
    const reply = await start('s-hint', NEEDS_RELEARN, {
      baseRevisionId: NEEDS_RELEARN.confirmedRevisionId as string,
      firstLearnStepId: NEEDS_RELEARN.firstChangedStepId as string,
    });
    expect(reply.status).toBe(202);
  });

  it('accepts an earlier boundary (more learning) and refuses a later one (D-3)', async () => {
    const earlier = await start('s-early', NEEDS_RELEARN, {
      baseRevisionId: NEEDS_RELEARN.confirmedRevisionId as string,
      firstLearnStepId: '00000000-0000-4000-8000-000000000001',
    });
    expect(earlier.status).toBe(202);
    const later = await start('s-late', NEEDS_RELEARN, {
      baseRevisionId: NEEDS_RELEARN.confirmedRevisionId as string,
      firstLearnStepId: '00000000-0000-4000-8000-000000000003',
    });
    expect(later.status).toBe(409);
    expectValid('error.schema.json', later.body);
    expect(later.body).toMatchObject({ code: 'REVISION_CONFLICT', messageCode: 'FIRST_LEARN_STEP_NARROWED' });
  });

  it('refuses an unknown step and a base that is not the confirmed revision', async () => {
    const unknown = await start('s-unknown', NEEDS_RELEARN, {
      baseRevisionId: NEEDS_RELEARN.confirmedRevisionId as string,
      firstLearnStepId: '00000000-0000-4000-8000-0000000000ff',
    });
    expect(unknown.body).toMatchObject({ code: 'REVISION_CONFLICT', messageCode: 'FIRST_LEARN_STEP_UNKNOWN' });
    const mismatch = await start('s-base', NEEDS_RELEARN, {
      baseRevisionId: '99999999-9999-4999-8999-999999999999',
      firstLearnStepId: NEEDS_RELEARN.firstChangedStepId as string,
    });
    expect(mismatch.body).toMatchObject({ code: 'REVISION_CONFLICT', messageCode: 'BASE_REVISION_MISMATCH' });
    expect(guidedSessionsForTest(NEEDS_RELEARN.id)).toEqual([]);
  });
});

describe('start refusals leave nothing behind', () => {
  const names = Object.keys(GUIDED_START_REFUSALS) as GuidedStartRefusalName[];

  it.each(names)('%s: a complete, schema-valid refusal and no session', async (name) => {
    setGuidedScenario(refusesStart(name));
    const reply = await start(`k-${name}`);
    const expected: GuidedMockRefusal = GUIDED_START_REFUSALS[name]();
    expect(reply.status).toBe(expected.status);
    if ('schemaVersion' in expected.body) {
      expectValid('error.schema.json', reply.body);
      expect(GUIDED_ERROR_CODES).toContain((reply.body as unknown as { code: string }).code);
    } else {
      expect(reply.body).toMatchObject({ error: { code: expect.any(String) } });
    }
    expect(reply.headers.get('Retry-After')).toBe(
      expected.retryAfterSeconds === undefined ? null : String(expected.retryAfterSeconds),
    );
    expect(guidedSessionsForTest(UNLEARNED.id)).toEqual([]);
  });

  it('a per-CSI budget refusal is retryable and carries Retry-After; a per-session bound is neither', async () => {
    setGuidedScenario(refusesStart('CSI_CONCURRENT_SESSIONS_EXHAUSTED'));
    const csi = await start('k-1');
    expect(csi.body).toMatchObject({ code: 'BUDGET_EXCEEDED', retryable: true });
    expect(Number(csi.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    setGuidedScenario(refusesStart('SESSION_BOUND_EXCEEDED'));
    const bound = await start('k-2');
    expect(bound.body).toMatchObject({ code: 'BUDGET_EXCEEDED', retryable: false });
    expect(bound.headers.get('Retry-After')).toBeNull();
  });

  it('a refusal is not remembered: the same key succeeds once the cause is gone', async () => {
    setGuidedScenario(refusesStart('POLICY_NOT_APPROVED_PENDING_VERSION'));
    expect((await start('same-key')).status).toBe(409);
    setGuidedScenario(LEARN_SCENARIO);
    expect((await start('same-key')).status).toBe(202);
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
  });

  it('an unknown or unreadable test is the same 403 as an unknown session', async () => {
    const body: GuidedStartRequest = { ...(await startContext()), testId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
    const unknownTest = await call('POST', '/guided-sessions', { key: 'k', body });
    expect(unknownTest.status).toBe(403);
    const unknownSession = await call('GET', '/guided-sessions/no-such-session');
    expect(unknownSession.status).toBe(403);
    expectValid('error.schema.json', unknownSession.body);
    expectValid('error.schema.json', unknownTest.body);
    for (const body of [unknownSession.body, unknownTest.body]) {
      expect(body).toMatchObject({ code: 'FORBIDDEN_SCOPE', messageCode: 'ACCESS_DENIED' });
    }
  });

  it('gives a zero-step draft no start and names no cause (D-11)', async () => {
    const empty: TestDto = { ...UNLEARNED, id: 'b0000000-0000-0000-0000-000000000009', steps: [] };
    // Runtime handlers take precedence over the server's own; `afterEach` resets them.
    server.use(...createGuidedHandlers({ getTest: (id) => (id === empty.id ? empty : undefined) }));
    const reply = await call('POST', '/guided-sessions', { key: 'k', body: await startContextFor(empty) });
    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: 'RUNTIME_INCOMPATIBLE', messageCode: 'RUNTIME_INCOMPATIBLE' });
  });
});

/**
 * C-OBS008-4: `startGuidedSession` can answer `422 INVALID_CONTRACT` /
 * `AUTHORING_REFERENCE_AMBIGUOUS`. The backend refuses in `IncrementalAuthoringIdentity.resolve`
 * (`:63-90`, `:379-382`) before any session exists; the mirror refuses the same declarations.
 */
describe('start refuses ambiguous variable declarations (422 AUTHORING_REFERENCE_AMBIGUOUS)', () => {
  const plain = (name: string, value = 'v'): StudioVariable => ({ name, kind: 'plain', value });
  const secret = (name: string, secretId: string | null): StudioVariable => ({ name, kind: 'secretRef', secretId });
  const withVariables = (variables: StudioVariable[]): TestDto => ({ ...UNLEARNED, variables });

  async function startWith(test: TestDto, key = 'amb-1', context: Partial<GuidedStartRequest> = {}) {
    server.use(...createGuidedHandlers({ getTest: (id) => (id === test.id ? test : undefined) }));
    return call<{ code: string; messageCode: string; retryable: boolean }>('POST', '/guided-sessions', {
      key,
      body: { ...(await startContextFor(test)), ...context },
    });
  }

  const refused: Array<[string, StudioVariable[]]> = [
    ['a secretRef with no secretId', [secret('LOGIN', null)]],
    ['a secretRef whose secretId is empty', [secret('LOGIN', '')]],
    ['a secretRef whose secretId has a character outside the pattern', [secret('LOGIN', 'a b')]],
    ['a secretRef whose secretId is 65 characters', [secret('LOGIN', 'a'.repeat(65))]],
    ['a secretRef whose secretId is "."', [secret('LOGIN', '.')]],
    ['a secretRef whose secretId is ".."', [secret('LOGIN', '..')]],
    ['two plain declarations with one name', [plain('USER_ID'), plain('USER_ID', 'other')]],
    ['a plain and a secretRef with one name', [plain('LOGIN'), secret('LOGIN', 'PW')]],
    ['a secretId that is the name of a plain declaration (4a)', [plain('USER_ID'), secret('LOGIN', 'USER_ID')]],
    [
      'a secretId that is the name of a secretRef with another secretId (4b)',
      [secret('USER_ID', 'OTHER'), secret('LOGIN', 'USER_ID')],
    ],
  ];

  it.each(refused)('%s: 422, a closed v3 error, and no session', async (_label, variables) => {
    expect(hasAmbiguousDeclarations(variables)).toBe(true);
    const reply = await startWith(withVariables(variables));
    expect(reply.status).toBe(422);
    expect(reply.body).toMatchObject({
      schemaVersion: 3,
      code: 'INVALID_CONTRACT',
      messageCode: 'AUTHORING_REFERENCE_AMBIGUOUS',
      retryable: false,
    });
    expectValid('error.schema.json', reply.body);
    expect(reply.headers.get('Retry-After')).toBeNull();
    expect(guidedSessionsForTest(UNLEARNED.id)).toEqual([]);
    expect(guidedRequestCount('start', { executedOnly: true })).toBe(1);
  });

  const accepted: Array<[string, StudioVariable[]]> = [
    ['no declarations', []],
    ['plain declarations with distinct names', [plain('A'), plain('B')]],
    ['a secretRef whose secretId is its own name', [secret('LOGIN', 'LOGIN')]],
    ['two secretRefs sharing a secretId under different names (rule 3)', [secret('A', 'PW'), secret('B', 'PW')]],
    ['a secretId that matches no declaration name', [plain('USER_ID'), secret('LOGIN', 'PW')]],
    ['a 64-character secretId', [secret('LOGIN', 'a'.repeat(64))]],
  ];

  it.each(accepted)('%s: accepted, the session starts', async (_label, variables) => {
    expect(hasAmbiguousDeclarations(variables)).toBe(false);
    const reply = await startWith(withVariables(variables));
    expect(reply.status).toBe(202);
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
  });

  it('a stale revision is refused 409 before the declarations are resolved, as the backend orders them', async () => {
    const reply = await startWith(withVariables([plain('X'), plain('X')]), 'amb-stale', { sourceRevision: '99' });
    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('a refusal is not remembered: the same key starts once the declarations are fixed', async () => {
    expect((await startWith(withVariables([plain('X'), plain('X')]), 'amb-fix')).status).toBe(422);
    expect((await startWith(withVariables([plain('X'), plain('Y')]), 'amb-fix')).status).toBe(202);
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
  });

  it('openapi.yaml declares exactly this refusal on startGuidedSession', () => {
    const document = parseYaml(
      fs.readFileSync(path.resolve(__dirname, '../../../../../docs/specs/studio/openapi.yaml'), 'utf8'),
    );
    const response = document.paths['/guided-sessions'].post.responses['422'];
    expect(response, 'startGuidedSession declares no 422').toBeDefined();
    expect(response.content['application/json'].schema.$ref).toBe(
      '../studio-observed-authoring/contracts/v3/error.schema.json',
    );
    expect(response.content['application/json'].examples.authoringReferenceAmbiguous.value).toMatchObject({
      schemaVersion: 3,
      code: 'INVALID_CONTRACT',
      messageCode: 'AUTHORING_REFERENCE_AMBIGUOUS',
      retryable: false,
    });
    expectValid('error.schema.json', response.content['application/json'].examples.authoringReferenceAmbiguous.value);
  });
});

async function startContextFor(test: TestDto): Promise<GuidedStartRequest> {
  return {
    schemaVersion: 3,
    testId: test.id,
    sourceRevision: String(test.sourceRevision),
    configurationRevision: String(test.configurationRevision),
    environmentId: test.environment,
    applicationId: test.csiId ?? '',
    versions: { contract: 3 },
  };
}

describe('idempotency and closed bodies', () => {
  it('answers the stored response for the same key and body, and writes nothing twice', async () => {
    const first = await start('dup');
    const second = await start('dup');
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
    expect(guidedRequestCount('start')).toBe(2);
    expect(guidedRequestCount('start', { executedOnly: true })).toBe(1);
  });

  it('refuses the same key with another body as IDEMPOTENCY_CONFLICT', async () => {
    await start('dup');
    const other = await start('dup', UNLEARNED, { environmentId: 'Elsewhere' });
    expect(other.status).toBe(409);
    expectValid('error.schema.json', other.body);
    expect(other.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
  });

  it.each(['start', 'clarify', 'cancel', 'finalize'] as const)('%s without an Idempotency-Key is refused 400', async (operation) => {
    const id = operation === 'start' ? 'x' : (await start('s')).body.session.sessionId;
    const route = operation === 'start' ? '/guided-sessions' : `/guided-sessions/${id}/${operation}`;
    const body =
      operation === 'start'
        ? await startContext()
        : operation === 'cancel'
          ? { schemaVersion: 3, reason: 'userRequested' }
          : operation === 'finalize'
            ? FINALIZE_BODY
            : { schemaVersion: 3, clarificationId: 'q', choiceId: 'c', generation: 0 };
    const reply = await call('POST', route, { key: null, body });
    expect(reply.status).toBe(400);
    expectValid('error.schema.json', reply.body);
  });

  it('refuses an unknown key in a start body and writes nothing', async () => {
    const reply = await call('POST', '/guided-sessions', { key: 'k', body: { ...(await startContext()), note: 'x' } });
    expect(reply.status).toBe(400);
    expect(guidedSessionsForTest(UNLEARNED.id)).toEqual([]);
  });

  it.each([
    ['schemaVersion 2', { schemaVersion: 2 }],
    ['versions with another contract', { versions: { contract: 2 } }],
    ['a non-uuid base', { baseRevisionId: 'nope', firstLearnStepId: '00000000-0000-4000-8000-000000000001' }],
  ])('refuses a start body with %s', async (_name, patch) => {
    const reply = await call('POST', '/guided-sessions', { key: 'k', body: { ...(await startContext()), ...patch } });
    expect(reply.status).toBe(400);
  });

  it('refuses an unknown key in a finalize body', async () => {
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'FINALIZING');
    const reply = await call('POST', `/guided-sessions/${id}/finalize`, {
      key: 'f',
      body: { ...FINALIZE_BODY, learnedPlanHash: 'x' },
    });
    expect(reply.status).toBe(400);
  });

  it('refuses a finalize whose revisions are not the session’s, and one sent before FINALIZING', async () => {
    const id = (await start()).body.session.sessionId;
    const early = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f1', body: FINALIZE_BODY });
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: 'PUBLICATION_CONFLICT' });
    await readUntil(id, 'FINALIZING');
    const wrong = await call('POST', `/guided-sessions/${id}/finalize`, {
      key: 'f2',
      body: { ...FINALIZE_BODY, expectedSourceRevision: '99' },
    });
    expect(wrong.status).toBe(409);
    expect(wrong.body).toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await readSession(id)).body.session.state).toBe('FINALIZING');
  });

  it('finalizes once: the same key replays the receipt, another key finds the session already published', async () => {
    const id = (await start()).body.session.sessionId;
    await readUntil(id, 'FINALIZING');
    const first = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f', body: FINALIZE_BODY });
    const replay = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f', body: FINALIZE_BODY });
    expect(replay.body).toEqual(first.body);
    const other = await call('POST', `/guided-sessions/${id}/finalize`, { key: 'f-other', body: FINALIZE_BODY });
    expect(other.status).toBe(409);
    expect(guidedRequestLog().filter((entry) => entry.operation === 'finalize').map((entry) => [entry.status, entry.replayed])).toEqual([
      [200, false],
      [200, true],
      [409, false],
    ]);
    expect(guidedRequestCount('finalize', { executedOnly: true })).toBe(2);
  });
});

describe('injected faults', () => {
  it('a start whose response is lost was still processed once; the retry under the same key finds that session', async () => {
    failGuidedRequests('start', 'network', { afterProcessing: true });
    const context = await startContext();
    await expect(call('POST', '/guided-sessions', { key: 'lost', body: context })).rejects.toThrow();
    expect(guidedSessionsForTest(UNLEARNED.id)).toHaveLength(1);
    const retry = await call<GuidedSessionView>('POST', '/guided-sessions', { key: 'lost', body: context });
    expect(retry.status).toBe(202);
    expect(guidedSessionsForTest(UNLEARNED.id)).toEqual([retry.body.session.sessionId]);
    expect(guidedRequestCount('start', { executedOnly: true })).toBe(1);
  });

  it('a 401 and a 503 on a read carry the documented status and nothing else changes', async () => {
    const id = (await start()).body.session.sessionId;
    failGuidedRequests('read', UNAUTHENTICATED_REFUSAL());
    failGuidedRequests('read', GUIDED_START_REFUSALS.UNAVAILABLE());
    expect((await readSession(id)).status).toBe(401);
    expect((await readSession(id)).status).toBe(503);
    expect((await readSession(id)).status).toBe(200);
  });
});

describe('capabilities (P1)', () => {
  it('serves a body that validates, uncached, whose context starts a session', async () => {
    const reply = await call<StudioCapabilities>('GET', `/tests/${UNLEARNED.id}/capabilities`);
    expect(reply.status).toBe(200);
    expect(reply.headers.get('Cache-Control')).toBe('no-store');
    expectValid('public-ui-projections.schema.json#/definitions/StudioCapabilities', reply.body);
    expect(reply.body.vaultSecrets).toBe(true);
    expect(reply.body.guidedStart).toMatchObject({
      available: true,
      context: { testId: UNLEARNED.id, sourceRevision: String(UNLEARNED.sourceRevision) },
    });
    expect((await start()).status).toBe(202);
  });

  it('answers the same 403 for an unknown id and an unreadable CSI, and 400 for a malformed id', async () => {
    const unknown = await call('GET', '/tests/ffffffff-ffff-4fff-8fff-ffffffffffff/capabilities');
    expect(unknown.status).toBe(403);
    const hidden: TestDto = { ...UNLEARNED, id: 'c0000000-0000-0000-0000-000000000001', csiId: 'not-readable' };
    server.use(...createCapabilityHandlers({ getTest: (id) => (id === hidden.id ? hidden : undefined) }));
    const denied = await call('GET', `/tests/${hidden.id}/capabilities`);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual(unknown.body);
    expect((await call('GET', '/tests/not-a-uuid/capabilities')).status).toBe(400);
  });

  it('reports vaultSecrets without any Vault call and the refusal codes as the closed set', async () => {
    setVaultSecrets(false);
    const off = await call<StudioCapabilities>('GET', `/tests/${UNLEARNED.id}/capabilities`);
    expect(off.body.vaultSecrets).toBe(false);
    expectValid('public-ui-projections.schema.json#/definitions/StudioCapabilities', off.body);

    setGuidedStartCapability(UNLEARNED.id, { available: false, code: 'FORBIDDEN_SCOPE' });
    const forbidden = await call<StudioCapabilities>('GET', `/tests/${UNLEARNED.id}/capabilities`);
    expect(forbidden.body.guidedStart).toEqual({ available: false, code: 'FORBIDDEN_SCOPE' });
    expectValid('public-ui-projections.schema.json#/definitions/StudioCapabilities', forbidden.body);
  });

  it('counts reads and can fail the next one', async () => {
    failCapabilityReads(() => new Response(null, { status: 503 }));
    expect((await call('GET', `/tests/${UNLEARNED.id}/capabilities`)).status).toBe(503);
    expect((await call('GET', `/tests/${UNLEARNED.id}/capabilities`)).status).toBe(200);
    expect(capabilityRequestCount()).toBe(2);
  });
});

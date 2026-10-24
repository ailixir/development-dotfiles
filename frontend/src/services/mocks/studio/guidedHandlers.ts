import { http, HttpResponse, type HttpHandler } from 'msw';
import type { StudioVariable, TestDto } from '@/types/studio/studioTypes';
import {
  isGuidedTerminalState,
  type GuidedClarification,
  type GuidedFailure,
  type GuidedPublication,
  type GuidedResult,
  type GuidedStartRequest,
  type LoginRequiredDetail,
  type PublicSession,
  type PublicationReceipt,
  type RelearnedFrom,
} from '@/types/studio/studioGuidedTypes';
import { MOCK_READABLE_CSIS, mockTests } from './fixtures';
import { demoTests } from './demoFixtures';
import { readinessDrafts } from './readinessFixtures';
import { fixtureStepId } from './authoringState';
import {
  GUIDED_START_REFUSALS,
  LEARN_SCENARIO,
  clarificationFor,
  guidedError,
  publicSessionFor,
  receiptFor,
  resetGuidedFixtureCounters,
  resultFor,
  type GuidedMockRefusal,
  type GuidedPlan,
  type GuidedScenario,
  type GuidedScriptStep,
  type GuidedStepRef,
  type GuidedTerminal,
} from './guidedFixtures';

/**
 * The guided-session MSW mirror (STUDIO-OBS-008 AC-1, lane L2b): the eight guided routes of
 * `openapi.yaml` (`startGuidedSession`, `readGuidedSession`, `readGuidedResult`,
 * `readGuidedClarification`, `clarifyGuidedSession`, `cancelGuidedSession`,
 * `finalizeObservedPublication`; the video route is served by the existing video handler's pattern
 * and is not mirrored here).
 *
 * It mirrors what the contract and the backend do, not what is convenient:
 *  - bodies are closed. An unknown key, a wrong type or a wrong `schemaVersion` is refused
 *    `400 INVALID_CONTRACT` and nothing is written;
 *  - every mutation needs an `Idempotency-Key`. The same key with the same body answers the stored
 *    response and writes nothing; the same key with another body is `409 IDEMPOTENCY_CONFLICT`. A
 *    refusal is not stored ("nothing is written"), so a retry under the same key is evaluated anew;
 *  - an unknown session and an unreadable test answer the same `403`;
 *  - a start whose saved declarations are ambiguous is refused `422 INVALID_CONTRACT` /
 *    `AUTHORING_REFERENCE_AMBIGUOUS` before any session exists (C-OBS008-4);
 *  - a session walks its scenario's script one read at a time (no timers), holding at
 *    `AWAITING_CLARIFICATION` until a clarify and at `FINALIZING` until a finalize;
 *  - `readGuidedResult` is `202` while publication is pending and `200` once the session is
 *    terminal, with the recording `PROCESSING` for as many reads as the scenario says.
 *
 * Composition into `handlers.ts` happens at root F1: this module exports `guidedHandlers` (an array)
 * and the controls a test needs, and imports nothing from `handlers.ts`.
 */

const BASE = '*/api/v1/studio/guided-sessions';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Where the mirror finds the draft being learned. F1 may inject the live store. */
export interface GuidedMockEnvironment {
  getTest(id: string): TestDto | undefined;
  /** The draft's source steps by stable ID. Defaults to the fixture IDs `fixtureStepId(i)`. */
  stepsOf?(test: TestDto): GuidedStepRef[];
  /** Commit this synthetic receipt only if the saved draft still matches its frozen revisions. */
  publish?(publication: GuidedMockPublication): boolean;
}

export interface GuidedMockPublication {
  readonly testId: string;
  readonly sourceRevision: string;
  readonly configurationRevision: string;
  readonly receipt: PublicationReceipt;
}

const fixtureTests = (): TestDto[] => [...mockTests, ...readinessDrafts, ...demoTests];

const defaultEnvironment: GuidedMockEnvironment = {
  getTest: (id) => fixtureTests().find((test) => test.id === id),
};

function defaultStepsOf(test: TestDto): GuidedStepRef[] {
  return test.steps.map((text, index) => ({ stepId: fixtureStepId(index), text }));
}

// ---------------------------------------------------------------------------
// State, request log, faults
// ---------------------------------------------------------------------------

export type GuidedOperation =
  | 'start'
  | 'read'
  | 'result'
  | 'clarification'
  | 'clarify'
  | 'cancel'
  | 'finalize';

/** One request the mirror served, for the request-count assertions. */
export interface GuidedLoggedRequest {
  operation: GuidedOperation;
  sessionId: string | null;
  idempotencyKey: string | null;
  status: number;
  /** True when the stored response of an earlier identical request was answered. */
  replayed: boolean;
}

/** A fault to inject into a route. `network` is a failed connection with no HTTP response. */
export type GuidedFault = GuidedMockRefusal | 'network';

interface PendingFault {
  operation: GuidedOperation;
  fault: GuidedFault;
  remaining: number;
  /** The server performs the operation, then the response is lost. */
  afterProcessing: boolean;
}

interface MockSession {
  sessionId: string;
  sequence: number;
  testId: string;
  csiId: string | null;
  request: GuidedStartRequest;
  steps: GuidedStepRef[];
  plan: GuidedPlan;
  boundaryIndex: number | null;
  baseRevisionId: string | null;
  /** Index of the script entry the session is in now. A read moves it on; a gate holds it. */
  cursor: number;
  reads: number;
  /** Set once a clarify, finalize or cancel moved the session out of the script. */
  forced: { step: GuidedScriptStep; terminal: GuidedTerminal; receipt: PublicationReceipt | null } | null;
  question: GuidedClarification | null;
  resultReadsAfterTerminal: number;
}

const sessions = new Map<string, MockSession>();
const stored = new Map<string, { fingerprint: string; status: number; body: unknown }>();
const requestLog: GuidedLoggedRequest[] = [];
let faults: PendingFault[] = [];
let sessionSequence = 0;
let scenarioDefault: GuidedScenario = LEARN_SCENARIO;
const scenarioByTest = new Map<string, GuidedScenario>();
const latency = new Map<GuidedOperation, number>();

const wait = async (operation: GuidedOperation): Promise<void> => {
  const milliseconds = latency.get(operation);
  if (milliseconds) await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

/** Every request the mirror has served since the last reset, oldest first. */
export function guidedRequestLog(): readonly GuidedLoggedRequest[] {
  return requestLog;
}

/** How many requests of `operation` the mirror served, replays included unless `executedOnly`. */
export function guidedRequestCount(
  operation: GuidedOperation,
  options: { executedOnly?: boolean } = {},
): number {
  return requestLog.filter(
    (entry) => entry.operation === operation && (!options.executedOnly || !entry.replayed),
  ).length;
}

/** The scenario used by every start unless a per-test one is set. */
export function setGuidedScenario(scenario: GuidedScenario, testId?: string): void {
  if (testId) scenarioByTest.set(testId, scenario);
  else scenarioDefault = scenario;
}

/**
 * Makes the next `times` requests of `operation` fail. With `afterProcessing` the server does the
 * work and only the response is lost, which is the case an idempotency key exists for.
 */
export function failGuidedRequests(
  operation: GuidedOperation,
  fault: GuidedFault,
  options: { times?: number; afterProcessing?: boolean } = {},
): void {
  faults.push({
    operation,
    fault,
    remaining: options.times ?? 1,
    afterProcessing: options.afterProcessing ?? false,
  });
}

/**
 * Makes every request of `operation` take `milliseconds` on the server before it is handled, so a
 * test can hold two callers in flight at once. Cleared by {@link resetGuidedMocks}.
 */
export function setGuidedLatency(operation: GuidedOperation, milliseconds: number): void {
  latency.set(operation, milliseconds);
}

/** Clears sessions, stored responses, the request log, faults, latency and scenarios. */
export function resetGuidedMocks(): void {
  sessions.clear();
  stored.clear();
  requestLog.length = 0;
  faults = [];
  sessionSequence = 0;
  scenarioDefault = LEARN_SCENARIO;
  scenarioByTest.clear();
  latency.clear();
  resetGuidedFixtureCounters();
}

/** The server-side session, for assertions that need more than the public view shows. */
export function guidedSessionsForTest(testId: string): readonly string[] {
  return [...sessions.values()].filter((entry) => entry.testId === testId).map((entry) => entry.sessionId);
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

type Json = Record<string, unknown> | unknown[];

function refusalResponse(refusal: GuidedMockRefusal): Response {
  const headers: Record<string, string> = {};
  if (refusal.retryAfterSeconds !== undefined) headers['Retry-After'] = String(refusal.retryAfterSeconds);
  return HttpResponse.json(refusal.body as Json, { status: refusal.status, headers });
}

const refuse = (code: Parameters<typeof guidedError>[0], status: number, messageCode?: string): GuidedMockRefusal => ({
  status,
  body: guidedError(code, messageCode ? { messageCode } : {}),
});

const FORBIDDEN: GuidedMockRefusal = {
  status: 403,
  body: guidedError('FORBIDDEN_SCOPE', { messageCode: 'ACCESS_DENIED' }),
};

export const UNAUTHENTICATED_REFUSAL = (): GuidedMockRefusal => ({
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Session required' } },
});

const INVALID_CONTRACT = (): GuidedMockRefusal => refuse('INVALID_CONTRACT', 400);

/**
 * `422 INVALID_CONTRACT` / `AUTHORING_REFERENCE_AMBIGUOUS` (`openapi.yaml` `startGuidedSession`
 * `422`; C-OBS008-4). Not a body error: the saved test's own declarations cannot be resolved.
 */
const AUTHORING_REFERENCE_AMBIGUOUS = (): GuidedMockRefusal =>
  refuse('INVALID_CONTRACT', 422, 'AUTHORING_REFERENCE_AMBIGUOUS');

const SECRET_ID = /^[A-Za-z0-9_.-]{1,64}$/u;

/**
 * Whether the backend's `IncrementalAuthoringIdentity.resolve` (`:63-90`) refuses these variable
 * declarations as ambiguous. It refuses in these cases, and this mirrors exactly those:
 *  - a declaration that is neither `plain` nor a `secretRef` with a pattern-valid `secretId`
 *    (`[A-Za-z0-9_.-]{1,64}`, not `.` or `..`) (`:63-70`);
 *  - a duplicate `name` (`:71-73`);
 *  - a `secretRef` whose `secretId` equals the `name` of another declaration that is not a
 *    `secretRef` with that same `secretId` (`:83-90`).
 * The backend's fourth refusal, two `secretRef`s with one `secretId` and different direct
 * declarations (`:77-80`), compares `{referenceId: secretId, kind, secretId}` records that are
 * equal by construction, so it cannot fire and has no mirror (Dex's probe accepted that shape).
 */
export function hasAmbiguousDeclarations(variables: readonly StudioVariable[]): boolean {
  const byName = new Map<string, StudioVariable>();
  const secretIds = new Set<string>();
  for (const variable of variables) {
    if (variable.kind !== 'plain') {
      const secretId = variable.secretId;
      if (
        variable.kind !== 'secretRef' ||
        typeof secretId !== 'string' ||
        !SECRET_ID.test(secretId) ||
        secretId === '.' ||
        secretId === '..'
      ) {
        return true;
      }
      secretIds.add(secretId);
    }
    if (byName.has(variable.name)) return true;
    byName.set(variable.name, variable);
  }
  for (const secretId of secretIds) {
    const named = byName.get(secretId);
    if (named && !(named.kind === 'secretRef' && named.secretId === secretId)) return true;
  }
  return false;
}

function takeFault(operation: GuidedOperation, phase: 'before' | 'after'): GuidedFault | null {
  const index = faults.findIndex(
    (fault) =>
      fault.operation === operation && fault.remaining > 0 && fault.afterProcessing === (phase === 'after'),
  );
  if (index < 0) return null;
  faults[index].remaining -= 1;
  return faults[index].fault;
}

function faultResponse(fault: GuidedFault): Response {
  return fault === 'network' ? HttpResponse.error() : refusalResponse(fault);
}

// ---------------------------------------------------------------------------
// Closed bodies
// ---------------------------------------------------------------------------

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

const boundedString = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 256;

function isStartBody(value: unknown): value is GuidedStartRequest {
  if (!isRecord(value)) return false;
  if (
    !closedKeys(value, [
      'schemaVersion',
      'testId',
      'sourceRevision',
      'configurationRevision',
      'environmentId',
      'applicationId',
      'versions',
      'baseRevisionId',
      'firstLearnStepId',
    ])
  ) {
    return false;
  }
  const versions = value.versions;
  return (
    value.schemaVersion === 3 &&
    boundedString(value.testId) &&
    boundedString(value.sourceRevision) &&
    boundedString(value.configurationRevision) &&
    boundedString(value.environmentId) &&
    boundedString(value.applicationId) &&
    isRecord(versions) &&
    closedKeys(versions, ['contract']) &&
    versions.contract === 3 &&
    (value.baseRevisionId === undefined || (typeof value.baseRevisionId === 'string' && UUID.test(value.baseRevisionId))) &&
    (value.firstLearnStepId === undefined || (typeof value.firstLearnStepId === 'string' && UUID.test(value.firstLearnStepId)))
  );
}

async function jsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

function stepAt(session: MockSession): GuidedScriptStep {
  if (session.forced) return session.forced.step;
  return session.plan.script[Math.min(session.cursor, session.plan.script.length - 1)];
}

const isGate = (step: GuidedScriptStep): boolean =>
  step.state === 'AWAITING_CLARIFICATION' || step.state === 'FINALIZING';

function terminalOf(session: MockSession): GuidedTerminal | null {
  if (session.forced) return session.forced.terminal;
  const step = stepAt(session);
  return isGuidedTerminalState(step.state) ? (session.plan.terminal ?? null) : null;
}

/**
 * A read of the session: the script moves one state on unless the session is at a gate (waiting
 * for a clarify or a finalize) or at its end, and the state it is now in is returned.
 */
function readStep(session: MockSession): GuidedScriptStep {
  session.reads += 1;
  if (
    !session.forced &&
    !isGate(stepAt(session)) &&
    session.cursor < session.plan.script.length - 1
  ) {
    session.cursor += 1;
  }
  return stepAt(session);
}

function sessionDocument(session: MockSession, step: GuidedScriptStep): PublicSession {
  return publicSessionFor({
    sessionId: session.sessionId,
    testId: session.testId,
    state: step.state,
    steps: session.steps,
    activeIndex: step.activeIndex,
    reads: session.reads,
    ...(session.baseRevisionId !== null && session.boundaryIndex !== null
      ? { baseRevisionId: session.baseRevisionId, firstLearnStepId: session.steps[session.boundaryIndex].stepId }
      : {}),
  });
}

function relearnedFromOf(session: MockSession): RelearnedFrom | null {
  return session.boundaryIndex === null ? null : { stepId: session.steps[session.boundaryIndex].stepId };
}

function failureOf(session: MockSession, terminal: GuidedTerminal): { failure: GuidedFailure | null; detail: LoginRequiredDetail | null } {
  if (!terminal.failureCode) return { failure: null, detail: null };
  if (terminal.failureCode === 'LOGIN_REQUIRED') {
    const stepIndex = terminal.failedIndex ?? 0;
    const detail = {
      stepId: session.steps[stepIndex]?.stepId ?? session.steps[0].stepId,
      loginStepsPresent: terminal.loginStepsPresent ?? false,
    };
    return { failure: { code: 'LOGIN_REQUIRED', detail }, detail };
  }
  return { failure: { code: terminal.failureCode }, detail: null };
}

/** The result for a session as it stands now. Counts a terminal read toward the recording settling. */
function resultDocument(session: MockSession): { result: GuidedResult; status: 200 | 202 } {
  const step = stepAt(session);
  const terminal = terminalOf(session);
  const base = {
    sessionId: session.sessionId,
    executionId: session.sessionId,
    steps: session.steps,
    sourceRevision: session.request.sourceRevision,
    configurationRevision: session.request.configurationRevision,
    relearnedFrom: relearnedFromOf(session),
  };
  if (!terminal) {
    // Not terminal: the OpenAPI document's `202`, "Pending publication, not a success claim".
    const result = resultFor({
      ...base,
      outcome: step.state,
      publication: { status: 'PENDING', receipt: null },
      explanation: { completed: Math.max(step.activeIndex ?? 0, 0), reusedBefore: session.boundaryIndex ?? 0, baseRevisionId: session.baseRevisionId, failedIndex: null },
      errorCode: null,
      failure: null,
      detail: null,
      relearnedFrom: null,
      video: 'UNAVAILABLE',
      timedSteps: 0,
    });
    return { result, status: 202 };
  }
  const settling = session.resultReadsAfterTerminal < (session.plan.videoProcessingReads ?? 0);
  session.resultReadsAfterTerminal += 1;
  const receipt = session.forced?.receipt ?? null;
  if (receipt) {
    const publication: GuidedPublication = { status: 'PUBLISHED', receipt };
    const result = resultFor({
      ...base,
      outcome: 'SUCCEEDED',
      publication,
      explanation: { completed: session.steps.length, reusedBefore: session.boundaryIndex ?? 0, baseRevisionId: session.baseRevisionId, failedIndex: null },
      errorCode: null,
      failure: null,
      detail: null,
      video: settling ? 'PROCESSING' : (session.plan.video ?? 'AVAILABLE'),
      timedSteps: session.steps.length,
    });
    return { result, status: 200 };
  }
  const ended = terminal as GuidedTerminal;
  const { failure, detail } = failureOf(session, ended);
  const result = resultFor({
    ...base,
    outcome: step.state,
    publication: { status: ended.publicationStatus, receipt: null },
    explanation: { completed: ended.completed, reusedBefore: session.boundaryIndex ?? 0, baseRevisionId: session.baseRevisionId, failedIndex: ended.failedIndex },
    errorCode: ended.failureCode ?? null,
    failure,
    detail,
    video: settling ? 'PROCESSING' : (session.plan.video ?? 'UNAVAILABLE'),
    timedSteps: ended.completed,
  });
  // The backend answers 202 for a pending publication, terminal session or not.
  return { result, status: ended.publicationStatus === 'PENDING' ? 202 : 200 };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function indexOfStep(steps: GuidedStepRef[], stepId: string): number {
  return steps.findIndex((step) => step.stepId === stepId);
}

/** Start-time hints, judged the way the OpenAPI description says ("each hint is checked independently"). */
function hintRefusal(
  test: TestDto,
  steps: GuidedStepRef[],
  request: GuidedStartRequest,
): GuidedMockRefusal | null {
  if (request.baseRevisionId !== undefined && request.baseRevisionId !== test.confirmedRevisionId) {
    return GUIDED_START_REFUSALS.BASE_REVISION_MISMATCH();
  }
  if (request.firstLearnStepId !== undefined) {
    const requested = indexOfStep(steps, request.firstLearnStepId);
    if (requested < 0) return GUIDED_START_REFUSALS.FIRST_LEARN_STEP_UNKNOWN();
    const changed = test.firstChangedStepId === null ? -1 : indexOfStep(steps, test.firstChangedStepId);
    // A boundary after the first changed step would skip a changed step (ruling D-3).
    if (changed >= 0 && requested > changed) return GUIDED_START_REFUSALS.FIRST_LEARN_STEP_NARROWED();
  }
  return null;
}

/** The boundary this run learns from: the explicit hint, else the server's own `firstChangedStepId`. */
function boundaryOf(test: TestDto, steps: GuidedStepRef[], request: GuidedStartRequest): number | null {
  if (test.confirmedRevisionId === null) return null;
  const wanted = request.firstLearnStepId ?? test.firstChangedStepId;
  if (wanted === null || wanted === undefined) return null;
  const index = indexOfStep(steps, wanted);
  return index < 0 ? null : index;
}

/**
 * Builds the guided handlers over `environment`. `guidedHandlers` below is this over the fixture
 * drafts; F1 may build another over the live store.
 */
export function createGuidedHandlers(environment: GuidedMockEnvironment): HttpHandler[] {
  const readableTest = (id: string): TestDto | undefined => {
    const test = environment.getTest(id);
    return test?.csiId && MOCK_READABLE_CSIS.includes(test.csiId) ? test : undefined;
  };
  const stepsOf = (test: TestDto): GuidedStepRef[] =>
    (environment.stepsOf ?? defaultStepsOf)(test);

  const log = (entry: GuidedLoggedRequest): void => {
    requestLog.push(entry);
  };

  /** A scoped session: unknown and unreadable answer the same `403`. */
  const sessionFor = (id: string): MockSession | null => {
    const session = sessions.get(id);
    return session && readableTest(session.testId) ? session : null;
  };

  /** Runs a mutation under the Idempotency-Key rules, with fault injection around it. */
  async function mutate(
    operation: GuidedOperation,
    request: Request,
    sessionId: string | null,
    execute: (body: unknown) => { refusal: GuidedMockRefusal } | { status: number; body: unknown },
  ): Promise<Response> {
    const key = request.headers.get('Idempotency-Key');
    const entry: GuidedLoggedRequest = { operation, sessionId, idempotencyKey: key, status: 0, replayed: false };
    const finish = (response: Response): Response => {
      entry.status = response.status;
      log(entry);
      return response;
    };
    const before = takeFault(operation, 'before');
    if (before) return finish(faultResponse(before));
    if (key === null || key.length < 1 || key.length > 256) {
      return finish(refusalResponse(INVALID_CONTRACT()));
    }
    const body = await jsonBody(request);
    if (body === undefined) return finish(refusalResponse(INVALID_CONTRACT()));
    await wait(operation);
    const storeKey = `${operation}:${sessionId ?? ''}:${key}`;
    const fingerprint = JSON.stringify(body);
    const earlier = stored.get(storeKey);
    let response: Response;
    if (earlier) {
      if (earlier.fingerprint !== fingerprint) {
        response = refusalResponse(refuse('IDEMPOTENCY_CONFLICT', 409));
      } else {
        entry.replayed = true;
        response = HttpResponse.json(earlier.body as Json, { status: earlier.status });
      }
    } else {
      const outcome = execute(body);
      if ('refusal' in outcome) {
        response = refusalResponse(outcome.refusal);
      } else {
        stored.set(storeKey, { fingerprint, status: outcome.status, body: structuredClone(outcome.body) });
        response = HttpResponse.json(outcome.body as Json, { status: outcome.status });
      }
    }
    const after = takeFault(operation, 'after');
    return finish(after ? faultResponse(after) : response);
  }

  function read(operation: GuidedOperation, sessionId: string, build: (session: MockSession) => Response): Response {
    const entry: GuidedLoggedRequest = { operation, sessionId, idempotencyKey: null, status: 0, replayed: false };
    const fault = takeFault(operation, 'before');
    let response: Response;
    if (fault) {
      response = faultResponse(fault);
    } else {
      const session = sessionFor(sessionId);
      response = session ? build(session) : refusalResponse(FORBIDDEN);
    }
    entry.status = response.status;
    log(entry);
    return response;
  }

  return [
    http.post(BASE, async ({ request }) =>
      mutate('start', request, null, (body) => {
        if (!isStartBody(body)) return { refusal: INVALID_CONTRACT() };
        const test = readableTest(body.testId);
        if (!test) return { refusal: FORBIDDEN };
        const scenario = scenarioByTest.get(test.id) ?? scenarioDefault;
        if (scenario.startRefusal) return { refusal: scenario.startRefusal() };
        const steps = stepsOf(test);
        // A zero-step draft gets no start and the refusal names no cause (ruling D-11).
        if (steps.length === 0) return { refusal: GUIDED_START_REFUSALS.RUNTIME_INCOMPATIBLE() };
        if (
          body.sourceRevision !== String(test.sourceRevision) ||
          body.configurationRevision !== String(test.configurationRevision)
        ) {
          return { refusal: refuse('REVISION_CONFLICT', 409) };
        }
        // The backend resolves the declarations before the base and first-step checks.
        if (hasAmbiguousDeclarations(test.variables)) return { refusal: AUTHORING_REFERENCE_AMBIGUOUS() };
        const hint = hintRefusal(test, steps, body);
        if (hint) return { refusal: hint };
        const boundaryIndex = boundaryOf(test, steps, body);
        const plan = (scenario.plan ?? LEARN_SCENARIO.plan)!({ steps, boundaryIndex });
        sessionSequence += 1;
        const session: MockSession = {
          sessionId: `guided-session-${sessionSequence}`,
          sequence: sessionSequence,
          testId: test.id,
          csiId: test.csiId,
          request: body,
          steps,
          plan,
          boundaryIndex,
          baseRevisionId: boundaryIndex === null ? null : test.confirmedRevisionId,
          cursor: 0,
          reads: 0,
          forced: null,
          question: null,
          resultReadsAfterTerminal: 0,
        };
        sessions.set(session.sessionId, session);
        return {
          status: 202,
          body: { schemaVersion: 3, session: sessionDocument(session, stepAt(session)), result: null },
        };
      }),
    ),

    http.get(`${BASE}/:id`, ({ params }) =>
      read('read', String(params.id), (session) => {
        const step = readStep(session);
        return HttpResponse.json({ schemaVersion: 3, session: sessionDocument(session, step), result: null });
      }),
    ),

    http.get(`${BASE}/:id/result`, ({ params }) =>
      read('result', String(params.id), (session) => {
        const { result, status } = resultDocument(session);
        return HttpResponse.json(result as unknown as Json, { status });
      }),
    ),

    http.get(`${BASE}/:id/clarification`, ({ params }) =>
      read('clarification', String(params.id), (session) => {
        const step = stepAt(session);
        if (step.state !== 'AWAITING_CLARIFICATION' || session.forced || !session.plan.question) {
          return new HttpResponse(null, { status: 204 });
        }
        session.question ??= clarificationFor(
          session.plan.question.kind,
          session.sessionId,
          session.steps[session.plan.question.stepIndex].stepId,
          session.sequence,
        );
        return HttpResponse.json(session.question as unknown as Json);
      }),
    ),

    http.post(`${BASE}/:id/clarify`, async ({ params, request }) => {
      const sessionId = String(params.id);
      return mutate('clarify', request, sessionId, (body) => {
        const session = sessionFor(sessionId);
        if (!session) return { refusal: FORBIDDEN };
        if (
          !isRecord(body) ||
          !closedKeys(body, ['schemaVersion', 'clarificationId', 'choiceId', 'generation']) ||
          body.schemaVersion !== 3 ||
          !boundedString(body.clarificationId) ||
          !boundedString(body.choiceId) ||
          typeof body.generation !== 'number'
        ) {
          return { refusal: INVALID_CONTRACT() };
        }
        const step = stepAt(session);
        const question = session.question;
        if (step.state !== 'AWAITING_CLARIFICATION' || !question) {
          return { refusal: refuse('STALE_GENERATION', 409) };
        }
        if (body.clarificationId !== question.clarificationId || body.generation !== question.generation) {
          return { refusal: refuse('STALE_GENERATION', 409) };
        }
        if (!question.choices.some((choice) => choice.choiceId === body.choiceId)) {
          return { refusal: INVALID_CONTRACT() };
        }
        session.question = null;
        // The answer moves the session past the gate.
        session.cursor = Math.min(session.cursor + 1, session.plan.script.length - 1);
        session.reads += 1;
        return { status: 202, body: sessionDocument(session, stepAt(session)) };
      });
    }),

    http.post(`${BASE}/:id/cancel`, async ({ params, request }) => {
      const sessionId = String(params.id);
      return mutate('cancel', request, sessionId, (body) => {
        const session = sessionFor(sessionId);
        if (!session) return { refusal: FORBIDDEN };
        if (
          !isRecord(body) ||
          !closedKeys(body, ['schemaVersion', 'reason']) ||
          body.schemaVersion !== 3 ||
          (body.reason !== 'userRequested' && body.reason !== 'policyRevoked')
        ) {
          return { refusal: INVALID_CONTRACT() };
        }
        const step = stepAt(session);
        // Cancelling a terminal session changes nothing; the answer is its current view.
        if (!isGuidedTerminalState(step.state)) {
          session.forced = {
            step: { state: 'CANCELLED', activeIndex: null },
            terminal: {
              failureCode: 'CANCELLED',
              publicationStatus: 'REFUSED',
              completed: Math.max(step.activeIndex ?? 0, 0),
              failedIndex: null,
            },
            receipt: null,
          };
          session.question = null;
        }
        return { status: 202, body: sessionDocument(session, stepAt(session)) };
      });
    }),

    http.post(`${BASE}/:id/finalize`, async ({ params, request }) => {
      const sessionId = String(params.id);
      return mutate('finalize', request, sessionId, (body) => {
        const session = sessionFor(sessionId);
        if (!session) return { refusal: FORBIDDEN };
        if (
          !isRecord(body) ||
          !closedKeys(body, ['schemaVersion', 'expectedSourceRevision', 'expectedConfigurationRevision']) ||
          body.schemaVersion !== 3 ||
          !boundedString(body.expectedSourceRevision) ||
          !boundedString(body.expectedConfigurationRevision)
        ) {
          return { refusal: INVALID_CONTRACT() };
        }
        // Only a session at FINALIZING can publish; anything else is a publication conflict.
        if (stepAt(session).state !== 'FINALIZING' || session.forced) {
          return { refusal: refuse('PUBLICATION_CONFLICT', 409) };
        }
        if (
          body.expectedSourceRevision !== session.request.sourceRevision ||
          body.expectedConfigurationRevision !== session.request.configurationRevision
        ) {
          return { refusal: refuse('REVISION_CONFLICT', 409) };
        }
        const current = readableTest(session.testId);
        if (
          !current ||
          String(current.sourceRevision) !== session.request.sourceRevision ||
          String(current.configurationRevision) !== session.request.configurationRevision
        ) {
          return { refusal: refuse('REVISION_CONFLICT', 409) };
        }
        if (session.plan.finalize === 'CONFLICT') {
          session.forced = {
            step: { state: 'PUBLICATION_CONFLICT', activeIndex: null },
            terminal: {
              failureCode: 'PUBLICATION_CONFLICT',
              publicationStatus: 'CONFLICT',
              completed: session.steps.length,
              failedIndex: null,
            },
            receipt: null,
          };
          return { refusal: refuse('PUBLICATION_CONFLICT', 409) };
        }
        const receipt = receiptFor(session.sessionId, session.sequence, relearnedFromOf(session));
        if (environment.publish && !environment.publish({
          testId: session.testId,
          sourceRevision: session.request.sourceRevision,
          configurationRevision: session.request.configurationRevision,
          receipt,
        })) {
          return { refusal: refuse('REVISION_CONFLICT', 409) };
        }
        session.forced = {
          step: { state: 'SUCCEEDED', activeIndex: null },
          terminal: { publicationStatus: 'REFUSED', completed: session.steps.length, failedIndex: null },
          receipt,
        };
        return { status: 200, body: receipt };
      });
    }),
  ];
}

/** The guided handlers over the fixture drafts. Wired into `studioHandlers` at root F1. */
export const guidedHandlers: HttpHandler[] = createGuidedHandlers(defaultEnvironment);

export default guidedHandlers;

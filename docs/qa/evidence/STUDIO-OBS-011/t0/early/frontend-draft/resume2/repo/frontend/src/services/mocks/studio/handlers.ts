import { http, HttpResponse } from 'msw';
import { createAuthoringHandlers } from './authoringHandlers';
import { resetAuthoringMocks, stepRefsOf } from './authoringState';
import { createCapabilityHandlers, resetCapabilityMocks } from './capabilityHandlers';
import { createGuidedHandlers, guidedSessionsForTest, resetGuidedMocks } from './guidedHandlers';
import { resetSecretsMocks, secretsHandlers } from './secretsHandlers';
import { createSchedulingHandlers, resetSchedulingMocks } from './schedulingHandlers';
import {
  CANCELLED_ERROR_CODE,
  isTerminalExecutionStatus,
  LEARN_REQUIRED_CONFLICT_CODE,
  type ExecutionSnapshot,
  type Page,
  type TestDto,
  type StudioVariable,
} from '@/types/studio/studioTypes';
import {
  MOCK_EXECUTE_DENIED_CSIS,
  MOCK_READABLE_CSIS,
  MOCK_VIDEO_BYTES,
  STUDIO_FORBIDDEN_BODY,
  mockExecutions,
  mockTests,
} from './fixtures';
import { demoExecutions, demoTests } from './demoFixtures';
import {
  EXECUTION_STATUS_FILTERS,
  TEST_LAST_RUN_FILTERS,
  isExecutionSort,
  isTestSort,
} from '@/types/studio/studioTypes';
import { executeConflictResponse, replayFailureExecutions } from './executionFixtures';
import { readinessDrafts } from './readinessFixtures';

/**
 * Studio request handlers for standalone development and Vitest (story 10.1, AC-16).
 *
 * These follow the frozen contract in `docs/specs/studio/openapi.yaml`, including the parts the
 * server has not implemented yet, so the UI stories can be built and demonstrated before 10.7.
 *
 * The scoping rule is enforced here rather than assumed: every list is filtered by the readable
 * CSIs before it is paged, exactly as the server does, because a mock that leaks across tenants
 * teaches the UI to rely on data it will never receive in production.
 */

const BASE = '*/api/v1/studio';

const readable = <T extends { csiId: string | null }>(items: T[]): T[] =>
  items.filter((item) => item.csiId !== null && MOCK_READABLE_CSIS.includes(item.csiId));

function paginate<T>(items: T[], url: URL): Page<T> {
  const rawPage = Number(url.searchParams.get('page') ?? '0');
  const rawSize = Number(url.searchParams.get('size') ?? '20');
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  // The server clamps rather than refuses: `Math.min(size, 100)`.
  const size = Number.isInteger(rawSize) && rawSize >= 1 ? Math.min(rawSize, 100) : 20;
  const start = page * size;
  return {
    data: items.slice(start, start + size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  };
}

function badRequest(error: string, message: string) {
  return HttpResponse.json({ error, message }, { status: 400 });
}

/**
 * Story 10.46 list query emulation. The FE must branch on the `400` status only: the backend's
 * `error` code for these refusals is not part of the contract, so `INVALID_QUERY` is the mock's.
 */
const INVALID_QUERY = 'INVALID_QUERY';

type SortKey<T> = (item: T) => string | number | null;

/**
 * `field,direction` order with a stable `id` tie-breaker in the same direction (AC-2). Nulls sort
 * last in both directions, so "never run" and "still running" rows never lead a sorted list.
 */
function sortBy<T>(
  items: T[], key: SortKey<T>, idOf: (item: T) => string, direction: string,
  /** Order among rows whose key is null, before the id (backend: unfinished runs newest first). */
  bothNull?: (left: T, right: T) => number,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: string | number, b: string | number) =>
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });
  return [...items].sort((left, right) => {
    const a = key(left);
    const b = key(right);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    const primary = a === null || b === null ? 0 : compare(a, b);
    if (primary !== 0) return sign * primary;
    const nullOrder = a === null && b === null && bothNull ? bothNull(left, right) : 0;
    if (nullOrder !== 0) return nullOrder;
    return sign * (idOf(left) < idOf(right) ? -1 : idOf(left) > idOf(right) ? 1 : 0);
  });
}

const instant = (value: string | null): number | null =>
  value === null ? null : new Date(value).getTime();

const searchTerm = (url: URL): string => (url.searchParams.get('q') ?? '').trim().toLowerCase();

let created: TestDto[] = [];
/** Soft-deleted test ids: hidden from every read; their runs resolve `testName: null`. */
const deletedTestIds = new Set<string>();
let acceptedExecutions: ExecutionSnapshot[] = [];
/** Principal-scoped idempotency, mirrored from the ledger the server keeps. */
const idempotency = new Map<string, string>();

export function resetStudioMocks(): void {
  resetSchedulingMocks();
  resetAuthoringMocks();
  resetGuidedMocks();
  resetCapabilityMocks();
  resetSecretsMocks();
  created = [];
  deletedTestIds.clear();
  acceptedExecutions = [];
  idempotency.clear();
  MOCK_EXECUTE_DENIED_CSIS.clear();
}

const allTests = (): TestDto[] => {
  return [...created, ...mockTests, ...demoTests]
    .filter((test,index,all) => all.findIndex(item => item.id === test.id) === index)
    .filter((test) => !deletedTestIds.has(test.id));
};

/** Mirrors the backend's bounded `GET /tests` projection. */
const forList = (test: TestDto): TestDto => ({
  ...test,
  confirmedRevisionArtifactHash: null,
  confirmedRevisionArtifact: null,
});

const VARIABLE_TOKEN = /<var\s+([A-Za-z0-9_.-]{1,64})>/g;
const SECRET_TOKEN = /<secret\s+([A-Za-z0-9_.-]{1,64})>/g;

function tokensOf(pattern: RegExp, steps: readonly string[]): string[] {
  const names: string[] = [];
  for (const step of steps) {
    for (const match of step.matchAll(pattern)) {
      if (!names.includes(match[1])) names.push(match[1]);
    }
  }
  return names;
}

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * `POST /tests/{id}/validate-variables` (`validateTestVariables`, kept by STUDIO-OBS-012A AC-2,
 * cleanup inventory CLN-12). Mirrors the document's description: `<var NAME>` and `<secret ID>`
 * references in the steps are matched against the declared variables (a `secretRef` by its
 * `secretId` only); only a supplied value's presence is read and no value is
 * echoed. Nothing is written.
 */
function validateVariableReferences(
  test: TestDto,
  supplied: Record<string, unknown>,
) {
  const referencedVariables = tokensOf(VARIABLE_TOKEN, test.steps);
  const referencedSecrets = tokensOf(SECRET_TOKEN, test.steps);
  const plainValues = new Map<string, StudioVariable['value']>();
  const secretIds: string[] = [];
  for (const variable of test.variables) {
    if (variable.kind === 'secretRef') {
      const id = variable.secretId;
      if (id && !secretIds.includes(id)) secretIds.push(id);
    } else if (variable.name) {
      plainValues.set(variable.name, variable.value);
    }
  }
  const undeclared: string[] = [];
  const unvalued: string[] = [];
  for (const name of referencedVariables) {
    if (!plainValues.has(name)) undeclared.push(`<var ${name}>`);
    else if (isBlank(plainValues.get(name)) && isBlank(supplied[name])) unvalued.push(name);
  }
  for (const id of referencedSecrets) {
    if (!secretIds.includes(id)) undeclared.push(`<secret ${id}>`);
  }
  const conflicting = [...plainValues.keys()].filter((name) => secretIds.includes(name));
  const unused = [
    ...[...plainValues.keys()].filter((name) => !referencedVariables.includes(name)),
    ...secretIds.filter((id) => !referencedSecrets.includes(id)),
  ];
  const valid = undeclared.length === 0 && unvalued.length === 0 && conflicting.length === 0;
  return {
    testId: test.id,
    isValid: valid,
    valid,
    hasVariables: test.variables.length > 0,
    missing: [...undeclared, ...unvalued],
    undeclared,
    unvalued,
    conflicting,
    unused,
  };
}

/**
 * The run-gate corpus (`readinessFixtures.ts`). Reachable by id from `GET /tests/{id}` and the
 * scheduling handlers, and deliberately **not** folded into the list, so the list projection and
 * the existing scoping fixtures keep their counts.
 */
const readinessDraft = (id: unknown): TestDto | undefined =>
  readinessDrafts.find((draft) => draft.id === id);

/**
 * Reachable by id from `GET /executions/{id}` and present in the history list: the three terminal
 * snapshots that carry a `replayFailure` (STUDIO-OBS-008 T0 ruling A1), equal to the document's
 * `getExecution` examples. They hold the other snapshots' ordinary place in the corpus.
 */
const allExecutions = (): ExecutionSnapshot[] => [
  ...acceptedExecutions,
  ...mockExecutions,
  ...Object.values(replayFailureExecutions),
  ...demoExecutions,
];

/** The server's batch name lookup: the live test's name, or `null` once it is deleted. */
function withTestNames(executions: ExecutionSnapshot[]): ExecutionSnapshot[] {
  const names = new Map(allTests().map((test) => [test.id, test.name]));
  return executions.map((execution) => ({ ...execution, testName: names.get(execution.testId) ?? null }));
}

/**
 * `GET /executions/{id}/video` (story 10.16a, AC-13).
 *
 * It answers with statuses `openapi.yaml` declares for `getExecutionVideo`: `200`, `206`, `403`,
 * `404`, `410` and `416`.
 *
 * **An unknown execution id and an execution on a CSI this principal may not read both answer
 * `403 STUDIO_FORBIDDEN`** — the same body the backend sends, byte for byte — because ADR-002 §24.3
 * ruled ESC-1: `401` and `403` are decided before anything about the recording is read, and using
 * `404` for an unknown id would be the existence oracle story 10.7 AC-4a exists to prevent. Until
 * that ruling landed (story 10.31) this handler answered `404` for both, which §24.5 item 1 names
 * as exactly the wrong choice.
 *
 * It still serves **no `401`**: MSW has no notion of an absent session, and the mock never sees the
 * platform authentication filter that writes one. It serves **no `503`** either: nothing in the
 * frontend can observe an unreachable evidence store (ADR-002 §24.5 item 1).
 *
 * Which answer is given is keyed off the execution's own `video.status` (and `video.expiresAt`), in
 * this one place. Every length is computed from {@link MOCK_VIDEO_BYTES} at request time.
 *
 * jsdom never loads media, so no `<video>` in the test suite reaches this handler. It exists for its
 * own tests and for manual use in standalone mode.
 */
type ByteRange = { kind: 'none' } | { kind: 'unsatisfiable' } | { kind: 'window'; first: number; last: number };

/** One `bytes=` range, per RFC 9110 §14.1.2. Anything else is ignored and the full body is served. */
function parseByteRange(header: string | null, size: number): ByteRange {
  const match = header === null ? null : /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (match === null) {
    return { kind: 'none' };
  }
  const [, firstText, lastText] = match;
  if (firstText === '' && lastText === '') {
    return { kind: 'none' };
  }
  if (firstText === '') {
    const suffix = Number(lastText);
    if (suffix === 0 || size === 0) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'window', first: Math.max(0, size - suffix), last: size - 1 };
  }
  const first = Number(firstText);
  if (lastText !== '' && Number(lastText) < first) {
    // An invalid range is ignored, not refused (RFC 9110 §14.2).
    return { kind: 'none' };
  }
  if (first >= size) {
    return { kind: 'unsatisfiable' };
  }
  const last = lastText === '' ? size - 1 : Math.min(Number(lastText), size - 1);
  return { kind: 'window', first, last };
}

function videoRefusal(status: 403 | 404 | 410 | 416, error: string, message: string, headers?: HeadersInit) {
  return HttpResponse.json({ error, message }, { status, headers });
}

function serveExecutionVideo(execution: ExecutionSnapshot | undefined, request: Request) {
  if (execution === undefined) {
    // Unknown id and unreadable CSI alike — `readable()` is applied before the `find` at the call
    // site, so both arrive here as `undefined` and neither may be distinguished from the other.
    // The body is the backend's own, verified against `ChecksExceptionHandler.handleStudioAccessDenied`
    // and `StudioAccessDeniedException.CODE`; the document declares no `Forbidden` example to read
    // one from, so this literal is the mock's own and is checked against the handler in review.
    return videoRefusal(403, 'STUDIO_FORBIDDEN', 'You do not have access to this Studio resource');
  }
  const { video } = execution;
  if (video.status === 'EXPIRED') {
    return videoRefusal(
      410,
      'VIDEO_EXPIRED',
      video.expiresAt !== null
        ? `The recording for this execution expired on ${video.expiresAt}`
        : 'The recording for this execution has expired',
    );
  }
  if (video.status !== 'AVAILABLE') {
    return videoRefusal(404, 'VIDEO_UNAVAILABLE', 'No evidence for this execution');
  }

  const size = MOCK_VIDEO_BYTES.length;
  const headers: Record<string, string> = {
    'Content-Type': 'video/webm',
    'Accept-Ranges': 'bytes',
  };
  if (new URL(request.url).searchParams.get('download') === 'true') {
    headers['Content-Disposition'] = `attachment; filename="execution-${execution.executionId}.webm"`;
  }

  const range = parseByteRange(request.headers.get('Range'), size);
  if (range.kind === 'unsatisfiable') {
    return videoRefusal(
      416,
      'RANGE_NOT_SATISFIABLE',
      'The requested range cannot be served',
      { 'Content-Range': `bytes */${size}` },
    );
  }
  if (range.kind === 'window') {
    const body = MOCK_VIDEO_BYTES.slice(range.first, range.last + 1);
    return new HttpResponse(body, {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.first}-${range.last}/${size}`,
        'Content-Length': String(body.length),
      },
    });
  }
  return new HttpResponse(MOCK_VIDEO_BYTES.slice(), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) },
  });
}

export const studioHandlers = [
  ...createSchedulingHandlers({ getTest: id => allTests().find(test => test.id === id) ?? readinessDraft(id), getExecutions: () => allExecutions() }),
  // The guided, capability and secrets mirrors (STUDIO-OBS-008 lanes L2b and L4), over the same
  // draft store the authoring routes write, so a draft created or saved here is the one they learn.
  ...createGuidedHandlers({
    getTest: id => allTests().find(test => test.id === id) ?? readinessDraft(id),
    stepsOf: stepRefsOf,
  }),
  ...createCapabilityHandlers({ getTest: id => allTests().find(test => test.id === id) ?? readinessDraft(id) }),
  ...secretsHandlers,
  ...createAuthoringHandlers({
    get: id => allTests().find(test => test.id === id) ?? readinessDraft(id),
    put: test => { created = [test, ...created.filter(candidate => candidate.id !== test.id)]; },
  }),
  http.get(`${BASE}/tests`, ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;
    const csiId = params.get('csiId');
    const environment = params.get('environment');
    // Filter values are case-insensitive, as on the backend.
    const lastRun = params.get('lastRun')?.toUpperCase() ?? null;
    const sort = params.get('sort') ?? 'updatedAt,desc';
    if (lastRun && !(TEST_LAST_RUN_FILTERS as readonly string[]).includes(lastRun)) {
      return badRequest(INVALID_QUERY, `Unsupported lastRun filter: ${lastRun}`);
    }
    const normalizedSort = sort.includes(',') ? sort : `${sort},asc`;
    if (!isTestSort(normalizedSort)) {
      return badRequest(INVALID_QUERY, `Unsupported sort: ${sort}`);
    }
    const term = searchTerm(url);
    let items = readable(allTests());
    if (csiId) {
      // An explicit filter can only narrow the scope, never widen it.
      items = items.filter((test) => test.csiId === csiId);
    }
    if (environment) items = items.filter((test) => test.environment === environment);
    if (term) {
      items = items.filter((test) =>
        test.name.toLowerCase().includes(term) || (test.description ?? '').toLowerCase().includes(term));
    }
    if (lastRun) {
      items = items.filter((test) =>
        lastRun === 'NEVER' ? test.lastRunStatus === null : test.lastRunStatus === lastRun);
    }
    const [field, direction] = normalizedSort.split(',');
    const key: SortKey<TestDto> =
      field === 'name' ? (test) => test.name
        : field === 'lastRunAt' ? (test) => instant(test.lastRunAt)
          : (test) => instant(test.updatedAt);
    items = sortBy(items, key, (test) => test.id, direction);
    return HttpResponse.json(paginate(items.map(forList), url));
  }),

  // `GET /tests/{id}`, `POST /tests` and `PUT /tests/{id}` are `createAuthoringHandlers`' alone
  // (STUDIO-OBS-008 inherited item g1): the one v2 contract, with no v1 route to fall through to.

  http.delete(`${BASE}/tests/:id`, ({ params }) => {
    created = created.filter((candidate) => candidate.id !== params.id);
    deletedTestIds.add(String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/tests/:id/validate-variables`, async ({ params, request }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      // An unknown id and an unreadable CSI answer the same refusal (`GET /tests/{id}`'s rule).
      return HttpResponse.json(STUDIO_FORBIDDEN_BODY, { status: 403 });
    }
    const text = await request.text();
    let body: { variables?: unknown } | null = null;
    try {
      body = text ? (JSON.parse(text) as { variables?: unknown }) : null;
    } catch {
      return badRequest('BAD_REQUEST', 'The request body is not valid JSON');
    }
    const supplied =
      body?.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
        ? (body.variables as Record<string, unknown>)
        : {};
    return HttpResponse.json(validateVariableReferences(test, supplied));
  }),

  http.post(`${BASE}/tests/:id/execute`, ({ params, request }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    /*
     * Story 10.48 — only owners and authorized administrators execute (ADR-002 O-22), and the
     * server decides that before readiness, so a caller who may only read gets the backend's `403`
     * whatever the draft's state.
     */
    if (test.csiId && MOCK_EXECUTE_DENIED_CSIS.has(test.csiId)) {
      return HttpResponse.json(STUDIO_FORBIDDEN_BODY, { status: 403 });
    }
    /*
     * Story 10.11a — the mock refuses a draft the server would refuse.
     *
     * The server-side readiness gate is unconditional, and a mock that accepts what the server
     * refuses teaches the UI that the client's own opinion is the gate. Only `READY` replays
     * (ADR-SC-005); every other readiness answers `409 LEARN_REQUIRED`. The lifecycle codes are not
     * folded in here for the reason the document gives: `LEARN_REQUIRED` tells an author to run a
     * guided session, which is work a deleted or quarantined draft would refuse too.
     */
    if (test.readiness !== 'READY') {
      return HttpResponse.json(executeConflictResponse(LEARN_REQUIRED_CONFLICT_CODE), { status: 409 });
    }
    const key = request.headers.get('Idempotency-Key');
    if (key && idempotency.has(key)) {
      return HttpResponse.json(
        { executionId: idempotency.get(key), status: 'PENDING' },
        { status: 202 },
      );
    }
    const executionId = crypto.randomUUID();
    if (key) {
      idempotency.set(key, executionId);
    }
    const pendingExecution: ExecutionSnapshot = {
        executionId,
        triggerSource: 'MANUAL',
        testId: test.id,
        csiId: test.csiId,
        revisionId: test.confirmedRevisionId,
        status: 'PENDING',
        errorCode: null,
        acceptedAt: new Date().toISOString(),
        startedAt: null,
        endedAt: null,
        durationMs: null,
        stepResults: test.steps.map((originalText, stepIndex) => ({
          stepIndex,
          originalText,
          status: 'PENDING' as const,
          offsetMs: null,
          durationMs: null,
          message: null,
        })),
        logs: [],
        logsTruncated: false,
        video: { status: 'PROCESSING', error: null, expiresAt: null, partial: false },
        videoPath: null,
        runtime: {
          playwright: null,
          chromium: null,
          validator: null,
          executor: null,
          image: null,
        },
        revision: 1,
        streamComplete: false,
      };
    acceptedExecutions = [pendingExecution, ...acceptedExecutions];
    return HttpResponse.json({ executionId, status: 'PENDING' }, { status: 202 });
  }),

  /*
   * `POST /executions/{id}/cancel` (Studio v1 cancel). `202` with the execution's snapshot, or
   * `409` when the run is already terminal. The mock ends the run at once, which is what the
   * server does for a run that was never sent to a browser: `ERROR` with `errorCode: CANCELLED`.
   * A run that is already in a browser ends later on the server. The page waits for the terminal
   * snapshot either way, so it does not depend on which of the two happened.
   */
  http.post(`${BASE}/executions/:id/cancel`, ({ params }) => {
    const execution = readable(allExecutions()).find(
      (candidate) => candidate.executionId === params.id,
    );
    if (!execution) {
      return HttpResponse.json(
        { error: 'STUDIO_FORBIDDEN', message: 'You do not have access to this Studio resource' },
        { status: 403 },
      );
    }
    if (isTerminalExecutionStatus(execution.status)) {
      return HttpResponse.json(
        { error: 'EXECUTION_TERMINAL', message: `Execution ${execution.executionId} has already ended` },
        { status: 409 },
      );
    }
    const now = new Date().toISOString();
    const cancelled: ExecutionSnapshot = {
      ...execution,
      status: 'ERROR',
      errorCode: CANCELLED_ERROR_CODE,
      endedAt: now,
      stepResults: execution.stepResults.map((step) =>
        step.status === 'PASS' || step.status === 'FAIL' ? step : { ...step, status: 'SKIPPED' },
      ),
      video:
        execution.video.status === 'PROCESSING'
          ? { status: 'UNAVAILABLE', error: null, expiresAt: null, partial: false }
          : execution.video,
      revision: execution.revision + 1,
      streamComplete: true,
    };
    acceptedExecutions = [
      cancelled,
      ...acceptedExecutions.filter((candidate) => candidate.executionId !== cancelled.executionId),
    ];
    return HttpResponse.json(cancelled, { status: 202 });
  }),

  http.get(`${BASE}/executions/:id`, ({ params }) => {
    const execution = readable(allExecutions()).find(
      (candidate) => candidate.executionId === params.id,
    );
    if (!execution) {
      // An unknown run answers 404 so the standalone drawer says "Run not found" (story 10.46).
      return HttpResponse.json(
        { error: 'NOT_FOUND', message: `Execution not found: ${params.id}` },
        { status: 404 },
      );
    }
    return HttpResponse.json(withTestNames([execution])[0]);
  }),

  http.get(`${BASE}/executions/:id/video`, ({ params, request }) =>
    serveExecutionVideo(
      readable(allExecutions()).find((candidate) => candidate.executionId === params.id),
      request,
    ),
  ),

  /**
   * `GET /guided-sessions/{id}/video` (`getGuidedSessionVideo`). The recording is the same fixture
   * bytes and the same status, range and refusal rules as the execution video; a session the mirror
   * never started, like an unreadable one, answers `403 STUDIO_FORBIDDEN`. The guided mirror's
   * `result.evidence.video.status` is what a client checks before it builds this path, so this
   * route serves the recording for every session it knows (a mirror simplification: it does not
   * re-derive `404`/`410` from the scenario).
   */
  http.get(`${BASE}/guided-sessions/:id/video`, ({ params, request }) => {
    const sessionId = String(params.id);
    const known = [...allTests(), ...readinessDrafts].some((test) =>
      guidedSessionsForTest(test.id).includes(sessionId));
    const recorded = mockExecutions.find((execution) => execution.video.status === 'AVAILABLE');
    return serveExecutionVideo(known && recorded ? { ...recorded, executionId: sessionId } : undefined, request);
  }),

  http.get(`${BASE}/executions`, ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;
    const testId = params.get('testId');
    const csiId = params.get('csiId');
    // Filter values are case-insensitive, as on the backend.
    const status = params.get('status')?.toUpperCase() ?? null;
    const sort = params.get('sort') ?? 'acceptedAt,desc';
    if (status && !(EXECUTION_STATUS_FILTERS as readonly string[]).includes(status)) {
      return badRequest(INVALID_QUERY, `Unsupported status filter: ${status}`);
    }
    const normalizedSort = sort.includes(',') ? sort : `${sort},asc`;
    if (!isExecutionSort(normalizedSort)) {
      return badRequest(INVALID_QUERY, `Unsupported sort: ${sort}`);
    }
    const term = searchTerm(url);
    let items = withTestNames(readable(allExecutions()));
    if (testId) {
      items = items.filter((execution) => execution.testId === testId);
    }
    if (csiId) items = items.filter((execution) => execution.csiId === csiId);
    if (status) {
      // CANCELLED is ERROR + errorCode CANCELLED, exactly as `isCancelledOutcome` reads it, and
      // ERROR then excludes it.
      const cancelled = (execution: ExecutionSnapshot) =>
        execution.status === 'ERROR' && execution.errorCode === CANCELLED_ERROR_CODE;
      items = items.filter((execution) =>
        status === 'CANCELLED' ? cancelled(execution)
          : status === 'ERROR' ? execution.status === 'ERROR' && !cancelled(execution)
            : execution.status === status);
    }
    if (term) {
      items = items.filter((execution) => (execution.testName ?? '').toLowerCase().includes(term));
    }
    const [field, direction] = normalizedSort.split(',');
    const key: SortKey<ExecutionSnapshot> =
      field === 'durationMs' ? (execution) => execution.durationMs : (execution) => instant(execution.acceptedAt);
    items = sortBy(items, key, (execution) => execution.executionId, direction,
      (left, right) => (instant(right.acceptedAt) ?? 0) - (instant(left.acceptedAt) ?? 0));
    return HttpResponse.json(paginate(items, url));
  }),
];

export default studioHandlers;

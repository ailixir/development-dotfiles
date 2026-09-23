import { http, HttpResponse } from 'msw';
import { createAuthoringHandlers } from './authoringHandlers';
import { resetAuthoringMocks } from './authoringState';
import {
  CANCELLED_ERROR_CODE,
  defaultConfiguration,
  isTerminalExecutionStatus,
  type ConfirmCompileRequest,
  type ExecutionSnapshot,
  type Page,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import { MOCK_READABLE_CSIS, MOCK_VIDEO_BYTES, mockExecutions, mockTests } from './fixtures';
import { compileReviewDrafts, conflictResponse } from './compileFixtures';
import { executeConflictResponse } from './executionFixtures';

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
  const page = Number(url.searchParams.get('page') ?? '0');
  const size = Math.min(Number(url.searchParams.get('size') ?? '20'), 100);
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

let created: TestDto[] = [];
let acceptedExecutions: ExecutionSnapshot[] = [];
/** Principal-scoped idempotency, mirrored from the ledger the server keeps. */
const idempotency = new Map<string, string>();

export function resetStudioMocks(): void {
  resetAuthoringMocks();
  created = [];
  acceptedExecutions = [];
  idempotency.clear();
}

const allTests = (): TestDto[] => [...created, ...mockTests];

/** Mirrors the backend's bounded `GET /tests` projection. */
const forList = (test: TestDto): TestDto => ({
  ...test,
  currentCandidateArtifactHash: null,
  currentCandidateArtifact: null,
  confirmedRevisionArtifactHash: null,
  confirmedRevisionArtifact: null,
  compileDiagnostics: null,
});

/**
 * Story 10.10's compile-review corpus. Reachable by id from `GET /tests/{id}` — the single-draft
 * read, which is the only route that carries `compileDiagnostics` (ADR-002 §16.5) — and
 * deliberately **not** folded into the list, so the list projection keeps the shape the contract
 * declares for it and the existing scoping fixtures keep their counts.
 */
const reviewDraft = (id: unknown): TestDto | undefined =>
  compileReviewDrafts.find((draft) => draft.id === id);

function conflict(code: string) {
  return HttpResponse.json(conflictResponse(code), { status: 409 });
}
const allExecutions = (): ExecutionSnapshot[] => [...acceptedExecutions, ...mockExecutions];

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
  ...createAuthoringHandlers({
    get: id => allTests().find(test => test.id === id) ?? reviewDraft(id),
    put: test => { created = [test, ...created.filter(candidate => candidate.id !== test.id)]; },
  }),
  http.get(`${BASE}/tests`, ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csiId');
    let items = readable(allTests());
    if (csiId) {
      // An explicit filter can only narrow the scope, never widen it.
      items = items.filter((test) => test.csiId === csiId);
    }
    return HttpResponse.json(paginate(items.map(forList), url));
  }),

  http.get(`${BASE}/tests/:id`, ({ params }) => {
    const test =
      readable(allTests()).find((candidate) => candidate.id === params.id) ?? reviewDraft(params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    return HttpResponse.json(test);
  }),

  http.post(`${BASE}/tests`, async ({ request }) => {
    const body = (await request.json()) as TestRequest;
    const rejection = rejectUnsupportedEngine(body);
    if (rejection) {
      return rejection;
    }
    if (!body.csiId) {
      return badRequest('BAD_REQUEST', 'csiId is required');
    }
    const test: TestDto = {
      id: crypto.randomUUID(),
      name: body.name,
      description: body.description ?? null,
      csiId: body.csiId,
      environment: body.environment,
      steps: body.steps ?? [],
      variables: body.variables ?? [],
      configuration: body.configuration ?? defaultConfiguration(),
      status: 'PAUSED',
      schedule: null,
      createdBy: 'pilot.user@citi.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunAt: null,
      lastRunStatus: null,
      sourceRevision: 1,
      configurationRevision: 1,
      compileStatus: 'STALE',
      currentCandidateRevisionId: null,
      confirmedRevisionId: null,
    };
    created = [test, ...created];
    return HttpResponse.json(test, {
      status: 201,
      headers: { Location: `/api/v1/studio/tests/${test.id}` },
    });
  }),

  http.put(`${BASE}/tests/:id`, async ({ params, request }) => {
    const body = (await request.json()) as TestRequest;
    const rejection = rejectUnsupportedEngine(body);
    if (rejection) {
      return rejection;
    }
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    if (body.sourceRevision == null || body.configurationRevision == null) {
      return badRequest(
        'BAD_REQUEST',
        'sourceRevision and configurationRevision are required on update',
      );
    }
    if (
      body.sourceRevision !== test.sourceRevision ||
      body.configurationRevision !== test.configurationRevision
    ) {
      return HttpResponse.json(
        {
          error: 'STALE_REVISION',
          message: `Test ${test.id} is at sourceRevision ${test.sourceRevision}/configurationRevision ${test.configurationRevision}; reload before saving`,
        },
        { status: 409 },
      );
    }
    if (body.csiId && body.csiId !== test.csiId) {
      return HttpResponse.json(
        {
          error: 'CSI_IMMUTABLE',
          message: `Test ${test.id} belongs to CSI ${test.csiId} and cannot be moved`,
        },
        { status: 409 },
      );
    }
    const sourceChanged = JSON.stringify(body.steps) !== JSON.stringify(test.steps);
    const updated: TestDto = {
      ...test,
      name: body.name,
      description: body.description ?? null,
      environment: body.environment,
      steps: body.steps,
      variables: body.variables ?? [],
      configuration: body.configuration,
      updatedAt: new Date().toISOString(),
      sourceRevision: test.sourceRevision + (sourceChanged ? 1 : 0),
      compileStatus: sourceChanged ? 'STALE' : test.compileStatus,
      currentCandidateRevisionId: sourceChanged ? null : test.currentCandidateRevisionId,
    };
    created = [updated, ...created.filter((candidate) => candidate.id !== updated.id)];
    return HttpResponse.json(updated);
  }),

  http.delete(`${BASE}/tests/:id`, ({ params }) => {
    created = created.filter((candidate) => candidate.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/tests/:id/compile`, ({ params }) => {
    const test =
      readable(allTests()).find((candidate) => candidate.id === params.id) ?? reviewDraft(params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    // The `202` means the attempt was started, never that it will succeed: pool saturation and
    // gateway failure surface asynchronously as `compileStatus: STALE` (§4.3).
    return HttpResponse.json(
      {
        compileRequestId: crypto.randomUUID(),
        compileStatus: 'COMPILING',
        sourceRevision: test.sourceRevision,
        configurationRevision: test.configurationRevision,
      },
      { status: 202 },
    );
  }),

  http.post(`${BASE}/tests/:id/confirm-compile`, async ({ params, request }) => {
    const test =
      readable(allTests()).find((candidate) => candidate.id === params.id) ?? reviewDraft(params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    const body = (await request.json()) as Partial<ConfirmCompileRequest> | null;
    // The server's transaction is conditional on all four, so the mock refuses a body that is
    // short of them rather than teaching the UI that three will do (§4.2, §8.3).
    const missing = (['revisionId', 'artifactHash', 'sourceRevision', 'configurationRevision'] as const)
      .filter((field) => body?.[field] === undefined || body?.[field] === null);
    if (missing.length > 0) {
      return badRequest('BAD_REQUEST', `confirm-compile requires ${missing.join(', ')}`);
    }
    if (test.compileStatus !== 'AWAITING_CONFIRMATION') {
      return conflict('STALE_CANDIDATE');
    }
    if (
      body!.revisionId !== test.currentCandidateRevisionId ||
      body!.sourceRevision !== test.sourceRevision ||
      body!.configurationRevision !== test.configurationRevision
    ) {
      return conflict('STALE_CANDIDATE');
    }
    const confirmed: TestDto = {
      ...test,
      compileStatus: 'READY',
      confirmedRevisionId: test.currentCandidateRevisionId,
      confirmedRevisionArtifactHash: test.currentCandidateArtifactHash ?? null,
      confirmedRevisionArtifact: test.currentCandidateArtifact ?? null,
      compileError: null,
      compileDiagnostics: null,
    };
    created = [confirmed, ...created.filter((candidate) => candidate.id !== confirmed.id)];
    return HttpResponse.json(confirmed);
  }),

  http.post(`${BASE}/tests/:id/execute`, ({ params, request }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    /*
     * Story 10.11a — the mock refuses an unconfirmed draft, because the server does.
     *
     * Story 10.8's AC-26 makes the server-side readiness gate unconditional, and a mock that
     * accepts what the server refuses teaches the UI that the client's own opinion is the gate.
     * That is the exact defect this story removes from the page, so leaving it in the mock would
     * leave the lesson in place. The lifecycle codes are not folded in here for the reason the
     * document gives: `COMPILE_REQUIRED` tells an author to confirm a candidate, which is work a
     * deleted or quarantined draft would refuse too.
     */
    if (test.compileStatus !== 'READY') {
      return HttpResponse.json(executeConflictResponse('COMPILE_REQUIRED'), { status: 409 });
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
      return badRequest('BAD_REQUEST', `Execution not found: ${params.id}`);
    }
    return HttpResponse.json(execution);
  }),

  http.get(`${BASE}/executions/:id/video`, ({ params, request }) =>
    serveExecutionVideo(
      readable(allExecutions()).find((candidate) => candidate.executionId === params.id),
      request,
    ),
  ),

  http.get(`${BASE}/executions`, ({ request }) => {
    const url = new URL(request.url);
    const testId = url.searchParams.get('testId');
    let items = readable(allExecutions());
    if (testId) {
      items = items.filter((execution) => execution.testId === testId);
    }
    return HttpResponse.json(paginate(items, url));
  }),
];

/** The canonical engine is the only one that reaches a draft; see architecture §8.3. */
function rejectUnsupportedEngine(body: TestRequest) {
  const browser = body.configuration?.browser;
  if (browser && browser !== 'chromium') {
    return badRequest(
      'INVALID_CONFIGURATION',
      `browser '${browser}' is not supported; the canonical engine is 'chromium'`,
    );
  }
  return null;
}

export default studioHandlers;

import { http, HttpResponse } from 'msw';
import {
  defaultConfiguration,
  type ExecutionSnapshot,
  type Page,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import { MOCK_READABLE_CSIS, mockExecutions, mockTests } from './fixtures';

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
  created = [];
  acceptedExecutions = [];
  idempotency.clear();
}

const allTests = (): TestDto[] => [...created, ...mockTests];
const allExecutions = (): ExecutionSnapshot[] => [...acceptedExecutions, ...mockExecutions];

export const studioHandlers = [
  http.get(`${BASE}/tests`, ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csiId');
    let items = readable(allTests());
    if (csiId) {
      // An explicit filter can only narrow the scope, never widen it.
      items = items.filter((test) => test.csiId === csiId);
    }
    return HttpResponse.json(paginate(items, url));
  }),

  http.get(`${BASE}/tests/:id`, ({ params }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
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

  http.post(`${BASE}/tests/:id/compile`, ({ params }) =>
    HttpResponse.json(
      {
        compileRequestId: crypto.randomUUID(),
        compileStatus: 'COMPILING',
        sourceRevision:
          readable(allTests()).find((test) => test.id === params.id)?.sourceRevision ?? 1,
        configurationRevision: 1,
      },
      { status: 202 },
    ),
  ),

  http.post(`${BASE}/tests/:id/confirm-compile`, ({ params }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
    }
    const confirmed: TestDto = {
      ...test,
      compileStatus: 'READY',
      currentCandidateRevisionId: test.currentCandidateRevisionId ?? crypto.randomUUID(),
      confirmedRevisionId: test.currentCandidateRevisionId ?? crypto.randomUUID(),
    };
    created = [confirmed, ...created.filter((candidate) => candidate.id !== confirmed.id)];
    return HttpResponse.json(confirmed);
  }),

  http.post(`${BASE}/tests/:id/execute`, ({ params, request }) => {
    const test = readable(allTests()).find((candidate) => candidate.id === params.id);
    if (!test) {
      return badRequest('BAD_REQUEST', `UI Test not found: ${params.id}`);
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
    acceptedExecutions = [
      {
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
      },
      ...acceptedExecutions,
    ];
    return HttpResponse.json({ executionId, status: 'PENDING' }, { status: 202 });
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

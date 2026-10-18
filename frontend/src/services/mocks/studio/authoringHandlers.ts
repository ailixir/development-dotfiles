import { http, HttpResponse } from 'msw';
import {
  defaultConfiguration,
  type TestDto,
  type TestRequest,
} from '@/types/studio/studioTypes';
import { MOCK_READABLE_CSIS } from './fixtures';
import { authoringProjection, authoringSource, changesFor, storeAuthoring, validateAuthoringWrite } from './authoringState';

const BASE = '*/api/v1/studio';
const FIELDS = ['authoringSchemaVersion', 'globalContext', 'steps', 'name', 'description', 'csiId',
  'environment', 'variables', 'configuration', 'sourceRevision', 'configurationRevision'];
const error = (code: string, status = 400, message = code) => HttpResponse.json({ error: code, message }, { status });
const readable = (test: TestDto | undefined): test is TestDto =>
  !!test && !!test.csiId && MOCK_READABLE_CSIS.includes(test.csiId);

/**
 * `GET /tests/{id}`, `POST /tests` and `PUT /tests/{id}`: the one authoring contract
 * (`openapi.yaml`, `TestRequest` and `TestDetailDto`). A write must carry `authoringSchemaVersion: 2`
 * and `AuthoringStep` objects; anything else is refused `400 INVALID_AUTHORING` before any state is
 * touched, and no other handler answers these routes, so a v1 body has nowhere to fall through to.
 * Every read answers the `TestDetailDto` shape, with a fixture draft's list steps under their
 * deterministic fixture IDs.
 */
export function createAuthoringHandlers(storage: {
  get: (id: string) => TestDto | undefined;
  put: (test: TestDto) => void;
}) {
  const write = async (request: Request, id?: string) => {
    let input: unknown;
    try { input = await request.clone().json(); } catch { return error('INVALID_AUTHORING'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return error('INVALID_AUTHORING');
    if (!('authoringSchemaVersion' in input)) return error('INVALID_AUTHORING');
    if (Object.keys(input).some(field => !FIELDS.includes(field))) return error('UNSUPPORTED_FIELD');
    const body = input as TestRequest;
    if (body.authoringSchemaVersion !== 2) return error('INVALID_AUTHORING');
    const structural = validateAuthoringWrite(body, body.csiId ?? storage.get(id ?? '')?.csiId ?? '');
    if (structural) return error(structural, structural === 'STUDIO_FORBIDDEN' ? 403 : 400);
    if (body.configuration?.browser && body.configuration.browser !== 'chromium') {
      return error('INVALID_CONFIGURATION', 400,
        `browser '${body.configuration.browser}' is not supported; the canonical engine is 'chromium'`);
    }
    const now = new Date().toISOString();
    if (!id) {
      if (!body.csiId || !MOCK_READABLE_CSIS.includes(body.csiId)) return error('STUDIO_FORBIDDEN', 403);
      const test: TestDto = {
        id: crypto.randomUUID(), name: body.name, description: body.description ?? null,
        csiId: body.csiId, environment: body.environment, steps: body.steps.map(step => step.text),
        variables: body.variables ?? [], configuration: body.configuration ?? defaultConfiguration(),
        status: 'PAUSED', schedule: null, createdBy: 'pilot.user@citi.com', createdAt: now, updatedAt: now,
        lastRunAt: null, lastRunStatus: null, sourceRevision: 1, configurationRevision: 1,
        readiness: 'UNLEARNED', firstChangedStepId: null, confirmedRevisionId: null,
        confirmedRevisionArtifactHash: null, confirmedRevisionArtifact: null,
      };
      storeAuthoring(test.id, authoringSource(body));
      storage.put(test);
      return HttpResponse.json(await authoringProjection(test), {
        status: 201, headers: { Location: `/api/v1/studio/tests/${test.id}` },
      });
    }
    if (![body.sourceRevision, body.configurationRevision].every(token => Number.isSafeInteger(token) && Number(token) > 0)) {
      return error('INVALID_AUTHORING');
    }
    const previous = storage.get(id);
    if (!readable(previous)) return error('STUDIO_FORBIDDEN', 403);
    if (body.sourceRevision !== previous.sourceRevision || body.configurationRevision !== previous.configurationRevision) return error('STALE_REVISION', 409);
    if (body.csiId != null && body.csiId !== previous.csiId) return error('CSI_IMMUTABLE', 409);
    const change = changesFor(previous, body);
    const next: TestDto = {
      ...previous, name: body.name, description: body.description ?? null,
      environment: body.environment, variables: body.variables ?? [], configuration: body.configuration,
      steps: body.steps.map(step => step.text), updatedAt: now,
      sourceRevision: previous.sourceRevision + Number(change.source),
      configurationRevision: previous.configurationRevision + Number(change.configuration),
    };
    if (change.source || change.configuration) {
      // No published revision matches a changed draft. The server reports `NEEDS_RELEARN` only
      // from STUDIO-OBS-015, so until then the changed draft is `UNLEARNED`.
      Object.assign(next, { readiness: 'UNLEARNED', firstChangedStepId: null });
    }
    storeAuthoring(id, authoringSource(body));
    storage.put(next);
    return HttpResponse.json(await authoringProjection(next));
  };
  return [
    http.get(`${BASE}/tests/:id`, async ({ params }) => {
      const test = storage.get(String(params.id));
      if (!readable(test)) return error('STUDIO_FORBIDDEN', 403);
      return HttpResponse.json(await authoringProjection(test));
    }),
    http.post(`${BASE}/tests`, ({ request }) => write(request)),
    http.put(`${BASE}/tests/:id`, ({ request, params }) => write(request, String(params.id))),
  ];
}

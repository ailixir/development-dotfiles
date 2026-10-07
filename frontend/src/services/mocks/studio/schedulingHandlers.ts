import { http, HttpResponse } from 'msw';
import type { ExecutionSnapshot, TestDto } from '@/types/studio/studioTypes';
import type { ScheduleCapabilities, ScheduleEnable, ScheduleOccurrence, ScheduleWrite, StudioSchedule } from '@/types/studio/studioScheduling';
import { MOCK_READABLE_CSIS } from './fixtures';
import { mockSchedulePreview, MOCK_SCHEDULE_POLICY } from './schedulePreview';

const BASE = '*/api/v1/studio';
const schedules = new Map<string, StudioSchedule>();
const history = new Map<string, ScheduleOccurrence[]>();
const activationInputs = new Map<string, { sourceRevision: number; configurationRevision: number }>();
const acknowledged = new Map<string, Set<string>>();
export function resetSchedulingMocks(): void { schedules.clear(); history.clear(); activationInputs.clear(); acknowledged.clear(); }
export function seedScheduleOccurrences(testId: string, rows: ScheduleOccurrence[]): void { history.set(testId, structuredClone(rows)); }
const error = (code: string, status = 400) => HttpResponse.json({ error: code, code, message: code }, { status });
const timestamp = () => new Date().toISOString();

/** Registered fixtures only: no runtime MSW activation, due producer, or claimed browser execution. */
export function createSchedulingHandlers(storage: { getTest: (id: string) => TestDto | undefined; getExecutions: () => ExecutionSnapshot[] }) {
  const testFor = (id: string) => {
    const test = storage.getTest(id);
    return test?.csiId && MOCK_READABLE_CSIS.includes(test.csiId) ? test : undefined;
  };
  const settleDeferred = (id: string, code: string, refused = false) => {
    history.set(id, (history.get(id) ?? []).map(row => row.decision === 'DEFERRED'
      ? { ...row, decision: refused ? 'REFUSED' : 'SKIPPED', code, retryAt: null, updatedAt: timestamp() } : row));
  };
  const current = (test: TestDto) => {
    const s = schedules.get(test.id);
    if (!s || s.deletedAt) return null;
    const input = activationInputs.get(test.id);
    if (s.requestedEnabled && input && (input.sourceRevision !== test.sourceRevision || input.configurationRevision !== test.configurationRevision || s.activatedRevisionId !== test.confirmedRevisionId)) {
      const code = s.activatedRevisionId !== test.confirmedRevisionId ? 'ACTIVATION_REVISION_MISMATCH' : 'COMPILE_REQUIRED';
      if (s.state !== 'BLOCKED' || s.blockedCode !== code) { s.version += 1; s.updatedAt = timestamp(); }
      s.state = 'BLOCKED'; s.blockedCode = code;
      settleDeferred(test.id, code, true);
    }
    s.unacknowledgedUncertaintyExecutionIds = storage.getExecutions().filter(run => run.testId === test.id &&
      ['DISPATCH_UNKNOWN', 'START_TIMEOUT', 'STALE'].includes(run.errorCode ?? '') &&
      !(acknowledged.get(s.id) ?? new Set()).has(run.executionId)).map(run => run.executionId);
    // Mirrors API read timing: uncertainty is projected immediately, while the due processor
    // persists BLOCKED later. A read does not mutate enabled/paused intent because a run ended.
    s.latestOccurrence = history.get(test.id)?.[0] ?? null;
    return s;
  };
  const validWrite = (body: ScheduleWrite) => {
    if (typeof body?.cronExpression !== 'string' || typeof body?.timeZone !== 'string' || body.executionPrincipal !== 'studio-local') throw new Error('INVALID_SCHEDULE');
    return mockSchedulePreview(body.cronExpression, body.timeZone);
  };
  return [
    http.get(`${BASE}/tests/:id/schedule/capabilities`, ({ params }) => {
      if (!testFor(String(params.id))) return error('STUDIO_FORBIDDEN', 403);
      const capabilities: ScheduleCapabilities = { enabled: true, canManage: true, availableExecutionPrincipals: ['studio-local'], localAuthorizationOnly: true, policy: MOCK_SCHEDULE_POLICY };
      return HttpResponse.json(capabilities);
    }),
    http.get(`${BASE}/tests/:id/schedule`, ({ params }) => {
      const test = testFor(String(params.id));
      return test ? HttpResponse.json(current(test)) : error('STUDIO_FORBIDDEN', 403);
    }),
    http.post(`${BASE}/schedules/preview`, async ({ request }) => {
      try {
        const body = await request.json() as Pick<ScheduleWrite, 'cronExpression' | 'timeZone'>;
        return HttpResponse.json(mockSchedulePreview(body.cronExpression, body.timeZone));
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'INVALID_SCHEDULE'); }
    }),
    http.post(`${BASE}/tests/:id/schedule`, async ({ params, request }) => {
      const test = testFor(String(params.id));
      if (!test) return error('STUDIO_FORBIDDEN', 403);
      if (current(test)) return error('SCHEDULE_EXISTS', 409);
      try {
        const body = await request.json() as ScheduleWrite;
        const preview = validWrite(body);
        const old = schedules.get(test.id);
        const now = timestamp();
        const schedule: StudioSchedule = { id: old?.id ?? crypto.randomUUID(), testId: test.id, csiId: test.csiId!, version: (old?.version ?? 0) + 1,
          ...body, cronExpression: preview.normalizedCronExpression, state: 'PAUSED', requestedEnabled: false, blockedCode: null,
          activatedRevisionId: old?.activatedRevisionId ?? null, activationId: old?.activationId ?? null,
          activatedBy: old?.activatedBy ?? null, activatedAt: old?.activatedAt ?? null,
          nextDueAt: null, pollAfterAt: null, deletedAt: null, createdAt: old?.createdAt ?? now, updatedAt: now,
          unacknowledgedUncertaintyExecutionIds: [], latestOccurrence: history.get(test.id)?.[0] ?? null };
        schedules.set(test.id, schedule);
        return HttpResponse.json(current(test), { status: 201 });
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'INVALID_SCHEDULE'); }
    }),
    http.put(`${BASE}/tests/:id/schedule`, async ({ params, request }) => {
      const test = testFor(String(params.id));
      if (!test) return error('STUDIO_FORBIDDEN', 403);
      const s = current(test);
      if (!s) return error('SCHEDULE_NOT_FOUND', 409);
      const body = await request.json() as ScheduleWrite & { expectedVersion: number };
      if (body.expectedVersion !== s.version) return error('SCHEDULE_VERSION_CONFLICT', 409);
      try {
        const preview = validWrite(body);
        settleDeferred(test.id, 'SCHEDULE_UPDATED'); s.state = 'PAUSED'; s.requestedEnabled = false; s.blockedCode = null;
        Object.assign(s, { cronExpression: preview.normalizedCronExpression, timeZone: body.timeZone, executionPrincipal: body.executionPrincipal, version: s.version + 1, updatedAt: timestamp() });
        return HttpResponse.json(current(test));
      } catch (failure) { return error(failure instanceof Error ? failure.message : 'INVALID_SCHEDULE'); }
    }),
    http.patch(`${BASE}/tests/:id/schedule/enabled`, async ({ params, request }) => {
      const test = testFor(String(params.id));
      if (!test) return error('STUDIO_FORBIDDEN', 403);
      const s = current(test);
      if (!s) return error('SCHEDULE_NOT_FOUND', 409);
      const body = await request.json() as ScheduleEnable;
      if (body.expectedVersion !== s.version) return error('SCHEDULE_VERSION_CONFLICT', 409);
      if (body.enabled) {
        if (!test.confirmedRevisionId) return error('COMPILE_REQUIRED', 409);
        if (body.confirmedRevisionId !== test.confirmedRevisionId) return error('ACTIVATION_REVISION_MISMATCH', 409);
        const input = activationInputs.get(test.id);
        if (input && s.activatedRevisionId === test.confirmedRevisionId &&
          (input.sourceRevision !== test.sourceRevision || input.configurationRevision !== test.configurationRevision)) return error('COMPILE_REQUIRED', 409);
        if (JSON.stringify([...(body.acknowledgedUncertaintyExecutionIds ?? [])].sort()) !== JSON.stringify([...s.unacknowledgedUncertaintyExecutionIds].sort())) return error('UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED', 409);
        const next = mockSchedulePreview(s.cronExpression, s.timeZone).occurrences[0].scheduledAt;
        settleDeferred(test.id, 'SCHEDULE_UPDATED');
        const seen = acknowledged.get(s.id) ?? new Set<string>();
        s.unacknowledgedUncertaintyExecutionIds.forEach(id => seen.add(id)); acknowledged.set(s.id, seen);
        Object.assign(s, { state: 'ENABLED', requestedEnabled: true, blockedCode: null, activatedRevisionId: test.confirmedRevisionId,
          activationId: crypto.randomUUID(), activatedBy: 'pilot.user@citi.com', activatedAt: timestamp(), nextDueAt: next, pollAfterAt: next, unacknowledgedUncertaintyExecutionIds: [] });
        activationInputs.set(test.id, { sourceRevision: test.sourceRevision, configurationRevision: test.configurationRevision });
      } else { settleDeferred(test.id, 'SCHEDULE_PAUSED'); Object.assign(s, { state: 'PAUSED', requestedEnabled: false, blockedCode: null }); }
      s.version += 1; s.updatedAt = timestamp();
      return HttpResponse.json(current(test));
    }),
    http.delete(`${BASE}/tests/:id/schedule`, ({ params, request }) => {
      const test = testFor(String(params.id));
      if (!test) return error('STUDIO_FORBIDDEN', 403);
      const s = current(test);
      if (!s) return error('SCHEDULE_NOT_FOUND', 409);
      if (Number(new URL(request.url).searchParams.get('expectedVersion')) !== s.version) return error('SCHEDULE_VERSION_CONFLICT', 409);
      settleDeferred(test.id, 'SCHEDULE_REMOVED');
      Object.assign(s, { state: 'PAUSED', requestedEnabled: false, blockedCode: null, deletedAt: timestamp(), version: s.version + 1 });
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${BASE}/tests/:id/schedule/occurrences`, ({ params, request }) => {
      const test = testFor(String(params.id));
      if (!test) return error('STUDIO_FORBIDDEN', 403);
      current(test);
      const query = new URL(request.url).searchParams;
      const page = Number(query.get('page') ?? 0), size = Number(query.get('size') ?? 20);
      if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) return error('INVALID_PAGINATION');
      const rows = [...(history.get(test.id) ?? [])].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.id.localeCompare(a.id));
      return HttpResponse.json({ data: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) });
    }),
  ];
}

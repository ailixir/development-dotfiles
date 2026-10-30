import { http, HttpResponse } from 'msw';
import type { BackendScheduleDto } from '@/services/api/mappers/scheduleMapper';
import type { TestDto } from '@/types/studio/studioTypes';
import { MOCK_EXECUTE_DENIED_CSIS, MOCK_READABLE_CSIS } from './fixtures';

/**
 * The ordinary check schedule API (`/api/v1/schedules`), as far as UI tests use it. A UI test is
 * scheduled through the same endpoints as a check, with `uiTestId` in place of `checkId`.
 *
 * Mirrors the server's rules, not its clock: exactly one of `checkId` / `uiTestId`; one schedule per
 * target (409); an interval under 60 s or an unknown timezone is 400; a caller who cannot write the
 * test's CSI is 403 (the read-only CSIs of `MOCK_EXECUTE_DENIED_CSIS`); an unknown or unreadable test
 * is 400, as an unknown check is. Check targets are accepted as given: no mock check store exists here.
 */

const BASE = '*/api/v1/schedules';
const schedules = new Map<string, BackendScheduleDto>();
let sequence = 0;

export function resetSchedulesMocks(): void {
  schedules.clear();
  sequence = 0;
}

const error = (code: string, message: string, status: number) =>
  HttpResponse.json({ error: code, message }, { status });

const nextRun = (enabled: boolean): string | null =>
  enabled ? new Date(Date.now() + 5 * 60_000).toISOString() : null;

// The step in seconds when the seconds field is a plain `*` or a `*` with a step; null otherwise.
function minuteInterval(cron: string): number | null {
  const [seconds, minutes] = cron.trim().split(/\s+/u);
  if (seconds === undefined || minutes === undefined) return null;
  if (/^\*(\/\d+)?$/u.test(seconds) && seconds !== '0') {
    const step = /^\*\/(\d+)$/u.exec(seconds);
    return step ? Number(step[1]) : 1;
  }
  return null;
}

export function createSchedulesHandlers(storage: { getTest: (id: string) => TestDto | undefined }) {
  /** The test, when it is readable; null otherwise. */
  const visibleTest = (id: string) => {
    const test = storage.getTest(id);
    return test?.csiId && MOCK_READABLE_CSIS.includes(test.csiId) ? test : null;
  };
  const canWrite = (test: TestDto) => !(test.csiId && MOCK_EXECUTE_DENIED_CSIS.has(test.csiId));

  const refusal = (body: Partial<BackendScheduleDto> & { uiTestId?: string | null; checkId?: string | null }) => {
    const hasCheck = typeof body.checkId === 'string';
    const hasTest = typeof body.uiTestId === 'string';
    if (hasCheck === hasTest) return error('SCHEDULE_VALIDATION', 'Exactly one of checkId or uiTestId is required', 400);
    if (typeof body.cronExpression !== 'string' || body.cronExpression.trim() === '') {
      return error('SCHEDULE_VALIDATION', 'Cron expression is required', 400);
    }
    const interval = minuteInterval(body.cronExpression);
    if (interval !== null && interval < 60) {
      return error('SCHEDULE_VALIDATION', 'Schedule interval too short: minimum allowed is 60s', 400);
    }
    if (body.timezone !== undefined && body.timezone !== null) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
      } catch {
        return error('SCHEDULE_VALIDATION', `Invalid timezone: ${body.timezone}`, 400);
      }
    }
    if (hasTest) {
      const test = visibleTest(body.uiTestId as string);
      if (!test) return error('BAD_REQUEST', `UI test not found: ${body.uiTestId}`, 400);
      if (!canWrite(test)) return error('ACCESS_DENIED', `No write access to CSI ${test.csiId}`, 403);
    }
    return null;
  };

  return [
    http.get(BASE, ({ request }) => {
      const url = new URL(request.url);
      const checkId = url.searchParams.get('checkId');
      const uiTestId = url.searchParams.get('uiTestId');
      const enabled = url.searchParams.get('enabled');
      const timezone = url.searchParams.get('timezone');
      const rows = [...schedules.values()].filter(
        (row) =>
          (checkId === null || row.checkId === checkId) &&
          (uiTestId === null || row.uiTestId === uiTestId) &&
          (enabled === null || String(row.enabled) === enabled) &&
          (timezone === null || row.timezone === timezone) &&
          (row.uiTestId === null || visibleTest(row.uiTestId) !== null),
      );
      const page = Number(url.searchParams.get('page') ?? '0');
      const size = Math.min(Number(url.searchParams.get('size') ?? '20'), 100);
      return HttpResponse.json({
        data: rows.slice(page * size, page * size + size),
        page,
        size,
        totalElements: rows.length,
        totalPages: Math.ceil(rows.length / size),
      });
    }),
    http.post(BASE, async ({ request }) => {
      const body = (await request.json()) as Partial<BackendScheduleDto>;
      const refused = refusal(body);
      if (refused) return refused;
      const exists = [...schedules.values()].some(
        (row) => (body.checkId && row.checkId === body.checkId) || (body.uiTestId && row.uiTestId === body.uiTestId),
      );
      if (exists) return error('SCHEDULE_CONFLICT', 'A schedule already exists for this target', 409);
      sequence += 1;
      const now = new Date().toISOString();
      const enabled = body.enabled ?? true;
      const created: BackendScheduleDto = {
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        checkId: body.checkId ?? null,
        uiTestId: body.uiTestId ?? null,
        frequency: body.frequency ?? 'custom',
        cronExpression: body.cronExpression as string,
        timezone: body.timezone ?? 'UTC',
        enabled,
        nextExecutionAt: nextRun(enabled),
        createdAt: now,
        updatedAt: now,
      };
      schedules.set(created.id, created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.get(`${BASE}/:id`, ({ params }) => {
      const row = schedules.get(String(params.id));
      return row ? HttpResponse.json(row) : error('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
    }),
    http.put(`${BASE}/:id`, async ({ params, request }) => {
      const row = schedules.get(String(params.id));
      if (!row) return error('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
      const body = (await request.json()) as Partial<BackendScheduleDto>;
      const refused = refusal({ ...body, checkId: row.checkId, uiTestId: row.uiTestId });
      if (refused) return refused;
      const enabled = body.enabled ?? row.enabled;
      const updated: BackendScheduleDto = {
        ...row,
        frequency: body.frequency ?? row.frequency,
        cronExpression: body.cronExpression as string,
        timezone: body.timezone ?? row.timezone,
        enabled,
        nextExecutionAt: nextRun(enabled),
        updatedAt: new Date().toISOString(),
      };
      schedules.set(row.id, updated);
      return HttpResponse.json(updated);
    }),
    http.patch(`${BASE}/:id/enabled`, async ({ params, request }) => {
      const row = schedules.get(String(params.id));
      if (!row) return error('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
      const { enabled } = (await request.json()) as { enabled: boolean };
      const updated = { ...row, enabled, nextExecutionAt: nextRun(enabled), updatedAt: new Date().toISOString() };
      schedules.set(row.id, updated);
      return HttpResponse.json(updated);
    }),
    http.delete(`${BASE}/:id`, ({ params }) => {
      if (!schedules.delete(String(params.id))) return error('SCHEDULE_NOT_FOUND', 'Schedule not found', 404);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

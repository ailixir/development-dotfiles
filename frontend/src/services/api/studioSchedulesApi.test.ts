import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import { mockSchedulePreview } from '@/services/mocks/studio/schedulePreview';
import { studioSchedulesApi } from './studioSchedulesApi';
import { createSchedulingHandlers, seedScheduleOccurrences } from '@/services/mocks/studio/schedulingHandlers';
import type { ScheduleOccurrence, StudioSchedule } from '@/types/studio/studioScheduling';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { parse } from 'yaml';

const spec = parse(fs.readFileSync(path.resolve(__dirname, '../../../../docs/specs/studio/openapi.yaml'), 'utf8'));
function jsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(jsonSchema);
  if (!node || typeof node !== 'object') return node;
  const source = node as Record<string, unknown>;
  const value = Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'nullable').map(([key, entry]) => [key, jsonSchema(entry)]));
  if (source.nullable === true) return { anyOf: [value, { type: 'null' }] };
  return value;
}
const schemaId = 'https://put.citi.com/studio-scheduling-contract';
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema({ ...(jsonSchema(spec) as Record<string, unknown>), $id: schemaId });
function matchesContract(name: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${schemaId}#/components/schemas/${name}` });
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
}

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { studioMockServer.resetHandlers(); resetStudioMocks(); });
afterAll(() => studioMockServer.close());
const write = { cronExpression: '*/5 * * * *', timeZone: 'UTC', executionPrincipal: 'studio-local' };
function deferred(schedule: StudioSchedule): ScheduleOccurrence {
  return { id: 'a1111111-1111-1111-1111-111111111111', scheduleId: schedule.id, scheduleVersion: schedule.version,
    testId: readyDraft.id, csiId: readyDraft.csiId!, environment: readyDraft.environment, executionPrincipal: schedule.executionPrincipal,
    activationId: schedule.activationId, activatedRevisionId: schedule.activatedRevisionId, activatedBy: schedule.activatedBy, activatedAt: schedule.activatedAt,
    scheduledAt: '2026-10-05T12:00:00Z', localScheduledAt: '2026-10-05T12:00:00', timeZone: 'UTC', offsetSeconds: 0,
    decision: 'DEFERRED', code: 'PENDING_QUOTA_EXCEEDED', executionId: null, acceptedAt: null, retryAt: '2026-10-05T12:00:05Z',
    graceExpiresAt: '2026-10-05T12:05:00Z', createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z',
    missedFrom: null, missedUntil: null, missedCount: null };
}
async function activate() {
  const created = await studioSchedulesApi.create(readyDraft.id, write);
  return studioSchedulesApi.enable(readyDraft.id, { expectedVersion: created.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
}

describe('Studio schedule transport and registered mock contract', () => {
  it('creates paused, activates exact revision, rejects stale mutations, removes and reuses the anchor', async () => {
    const id = readyDraft.id;
    const capability = await studioSchedulesApi.capabilities(id);
    matchesContract('StudioScheduleCapabilities', capability);
    expect(capability.localAuthorizationOnly).toBe(true);
    expect(await studioSchedulesApi.get(id)).toBeNull();
    const created = await studioSchedulesApi.create(id, write);
    matchesContract('StudioSchedule', created);
    expect(created.state).toBe('PAUSED');
    await expect(studioSchedulesApi.enable(id, { expectedVersion: created.version, enabled: true, confirmedRevisionId: 'wrong' })).rejects.toMatchObject({ response: { status: 409 } });
    const active = await studioSchedulesApi.enable(id, { expectedVersion: created.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId!, acknowledgedUncertaintyExecutionIds: [] });
    expect(active.state).toBe('ENABLED');
    matchesContract('StudioSchedule', active);
    expect(active.activatedBy).toBe('pilot.user@citi.com');
    expect(active.activationId).toBeTruthy();
    await expect(studioSchedulesApi.update(id, { ...write, expectedVersion: created.version })).rejects.toMatchObject({ response: { status: 409 } });
    const edited = await studioSchedulesApi.update(id, { ...write, cronExpression: '0 0 * * * *', expectedVersion: active.version });
    expect(edited.state).toBe('PAUSED');
    await studioSchedulesApi.remove(id, edited.version);
    expect(await studioSchedulesApi.get(id)).toBeNull();
    const recreated = await studioSchedulesApi.create(id, write);
    expect(recreated.id).toBe(created.id);
    expect(recreated.version).toBeGreaterThan(edited.version);
    const occurrences = await studioSchedulesApi.occurrences(id);
    matchesContract('StudioScheduleOccurrencePage', occurrences);
    expect(occurrences.data).toEqual([]);
  });

  it('previews five clock-aligned timezone slots and denies unknown targets', async () => {
    const preview = await studioSchedulesApi.preview(write);
    matchesContract('StudioSchedulePreview', preview);
    expect(preview.normalizedCronExpression).toBe('0 */5 * * * *');
    expect(preview.occurrences).toHaveLength(5);
    expect(preview.occurrences.every(slot => new Date(slot.scheduledAt).getUTCMinutes() % 5 === 0)).toBe(true);
    await expect(studioSchedulesApi.get('hidden-test')).rejects.toMatchObject({ response: { status: 403 } });
    await expect(studioSchedulesApi.preview({ cronExpression: '1 * * * * *', timeZone: 'UTC' })).rejects.toMatchObject({ response: { status: 400 } });
    await expect(studioSchedulesApi.preview({ cronExpression: write.cronExpression, timeZone: 'invalid' })).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('mock fixed-clock DST fixtures choose earlier 01:30 and skip nonexistent 02:30', () => {
    const repeated = mockSchedulePreview('0 30 1 * * *', 'America/New_York', new Date('2026-11-01T00:00:00Z'));
    expect(repeated.occurrences[0].scheduledAt).toBe('2026-11-01T05:30:00.000Z');
    expect(repeated.occurrences[1].scheduledAt).toBe('2026-11-02T06:30:00.000Z');
    const resumed = mockSchedulePreview('0 30 1 * * *', 'America/New_York', new Date('2026-11-01T05:45:00Z'));
    expect(resumed.occurrences[0].scheduledAt).toBe('2026-11-02T06:30:00.000Z');
    const gap = mockSchedulePreview('0 30 2 * * *', 'America/New_York', new Date('2026-03-08T05:00:00Z'));
    expect(gap.occurrences[0].scheduledAt).toBe('2026-03-09T06:30:00.000Z');
  });

  it('backend parity: even no-op PUT pauses and settles the pending slot without rewriting activation provenance', async () => {
    const active = await activate();
    const before = deferred(active);
    seedScheduleOccurrences(readyDraft.id, [before]);
    const updated = await studioSchedulesApi.update(readyDraft.id, { ...write, expectedVersion: active.version });
    expect(updated.state).toBe('PAUSED');
    expect(updated.requestedEnabled).toBe(false);
    expect(updated.latestOccurrence).toMatchObject({ decision: 'SKIPPED', code: 'SCHEDULE_UPDATED', retryAt: null, activationId: before.activationId,
      activatedAt: before.activatedAt, activatedBy: before.activatedBy, graceExpiresAt: before.graceExpiresAt });
    matchesContract('StudioScheduleOccurrence', updated.latestOccurrence);
  });

  it('backend parity: Resume settles an existing deferred identity before starting future work', async () => {
    const active = await activate();
    const before = deferred(active);
    seedScheduleOccurrences(readyDraft.id, [before]);
    const resumed = await studioSchedulesApi.enable(readyDraft.id, { expectedVersion: active.version, enabled: true, confirmedRevisionId: readyDraft.confirmedRevisionId! });
    expect(resumed.latestOccurrence).toMatchObject({ id: before.id, decision: 'SKIPPED', code: 'SCHEDULE_UPDATED', retryAt: null, activationId: before.activationId });
    expect(resumed.activationId).not.toBe(before.activationId);
    expect((await studioSchedulesApi.occurrences(readyDraft.id)).data[0].activationId).toBe(before.activationId);
  });

  it('backend parity: replacement confirmation blocks and settles with ACTIVATION_REVISION_MISMATCH', async () => {
    let saved = { ...readyDraft };
    studioMockServer.use(...createSchedulingHandlers({ getTest: () => saved, getExecutions: () => [] }));
    const active = await activate();
    seedScheduleOccurrences(readyDraft.id, [deferred(active)]);
    saved = { ...saved, confirmedRevisionId: 'a2222222-2222-2222-2222-222222222222' };
    const blocked = await studioSchedulesApi.get(readyDraft.id);
    expect(blocked).toMatchObject({ state: 'BLOCKED', requestedEnabled: true, blockedCode: 'ACTIVATION_REVISION_MISMATCH',
      latestOccurrence: { decision: 'REFUSED', code: 'ACTIVATION_REVISION_MISMATCH' } });
    expect(blocked?.version).toBeGreaterThan(active.version);
  });
});

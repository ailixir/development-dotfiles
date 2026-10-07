import apiClient from './apiClient';
import type {
  ScheduleCapabilities, ScheduleEnable, ScheduleOccurrencePage, SchedulePreview,
  ScheduleWrite, StudioSchedule,
} from '@/types/studio/studioScheduling';

const path = (id: string) => `/studio/tests/${encodeURIComponent(id)}/schedule`;

/** All scheduling transport uses the centralized authenticated client; mutations are never retried. */
export const studioSchedulesApi = {
  capabilities: (id: string): Promise<ScheduleCapabilities> => apiClient.get(`${path(id)}/capabilities`),
  get: (id: string, signal?: AbortSignal): Promise<StudioSchedule | null> => apiClient.get(path(id), { signal, __doNotRetry: true }),
  create: (id: string, body: ScheduleWrite): Promise<StudioSchedule> => apiClient.post(path(id), body),
  update: (id: string, body: ScheduleWrite & { expectedVersion: number }): Promise<StudioSchedule> => apiClient.put(path(id), body),
  enable: (id: string, body: ScheduleEnable): Promise<StudioSchedule> => apiClient.patch(`${path(id)}/enabled`, body),
  remove: (id: string, expectedVersion: number): Promise<void> => apiClient.delete(path(id), { params: { expectedVersion } }),
  preview: (body: Pick<ScheduleWrite, 'cronExpression' | 'timeZone'>, signal?: AbortSignal): Promise<SchedulePreview> =>
    apiClient.post('/studio/schedules/preview', body, { signal }),
  occurrences: (id: string, page = 0, size = 10): Promise<ScheduleOccurrencePage> =>
    apiClient.get(`${path(id)}/occurrences`, { params: { page, size } }),
};

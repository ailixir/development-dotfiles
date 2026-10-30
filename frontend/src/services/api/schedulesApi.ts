import apiClient from './apiClient';
import { normalizePageResponse } from './responseAdapter';
import type { BackendScheduleDto } from './mappers/scheduleMapper';
import type { ApiResponse } from '../../types/common/commonTypes';

/** A schedule's target: a check or a UI test, never both. */
export type ScheduleTargetIds = { checkId: string } | { uiTestId: string };

export interface ScheduleWrite {
  frequency: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
}

export const schedulesApi = {
  async create(data: ScheduleTargetIds & ScheduleWrite): Promise<BackendScheduleDto> {
    return apiClient.post('/schedules', data);
  },

  async list(params?: {
    checkId?: string;
    uiTestId?: string;
    enabled?: boolean;
    timezone?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<BackendScheduleDto[]>> {
    const { page = 1, limit = 20, ...rest } = params ?? {};
    const raw = await apiClient.get('/schedules', {
      params: { ...rest, page: page - 1, size: limit },
    });
    return normalizePageResponse<BackendScheduleDto>(raw);
  },

  async getById(id: string): Promise<BackendScheduleDto> {
    return apiClient.get(`/schedules/${id}`);
  },

  async update(id: string, data: ScheduleTargetIds & ScheduleWrite): Promise<BackendScheduleDto> {
    return apiClient.put(`/schedules/${id}`, data);
  },

  async setEnabled(id: string, enabled: boolean): Promise<BackendScheduleDto> {
    return apiClient.patch(`/schedules/${id}/enabled`, { enabled });
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete(`/schedules/${id}`);
  },
};

export default schedulesApi;

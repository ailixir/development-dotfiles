import apiClient from './apiClient';
import { normalizePageResponse } from './responseAdapter';
import type { BackendScheduleDto } from './mappers/scheduleMapper';
import type { ApiResponse } from '../../types/common/commonTypes';

export const schedulesApi = {
  async create(data: {
    checkId: string;
    frequency: string;
    cronExpression: string;
    timezone: string;
    enabled: boolean;
  }): Promise<BackendScheduleDto> {
    return apiClient.post('/schedules', data);
  },

  async list(params?: {
    checkId?: string;
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

  async update(
    id: string,
    data: {
      checkId: string;
      frequency: string;
      cronExpression: string;
      timezone: string;
      enabled: boolean;
    },
  ): Promise<BackendScheduleDto> {
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

import { apiClient } from './apiClient';
import { API_ENDPOINTS } from '@utils/constants/appConfig';
import { normalizePageResponse } from './responseAdapter';
import { mapCheckResponse, mapExecutionResponse } from './mappers/checkMapper';
import { pollForExecution } from './executionPoller';
import type {
  CheckEntity,
  CreateCheckRequest,
  UpdateCheckRequest,
  ExecutionResult,
  CheckFilters,
} from '../../types/checks/checkTypes';
import type { ApiResponse, PaginationParams } from '../../types/common/commonTypes';

function toBackendConfiguration(type: string, cfg: Record<string, any>): Record<string, any> {
  switch (type) {
    case 'HTTP':
      return {
        type: 'HTTP',
        method: cfg.method ?? 'GET',
        url: cfg.endpoint ?? cfg.url ?? '',
        headers: cfg.headers ?? null,
        body: cfg.body ?? null,
        expectedStatusCode: cfg.expectedStatus ?? cfg.expectedStatusCode ?? 200,
        followRedirects: cfg.followRedirects ?? true,
        timeoutMs: cfg.timeout != null ? cfg.timeout * 1000 : cfg.timeoutMs ?? 5000,
        verifyTls: cfg.validateSSL ?? cfg.verifyTls ?? true,
      };
    case 'TCP':
      return {
        type: 'TCP',
        host: cfg.host ?? '',
        port: cfg.port ?? 0,
        timeoutMs: cfg.timeout != null ? cfg.timeout * 1000 : cfg.timeoutMs ?? 5000,
      };
    default:
      return { type, ...cfg };
  }
}

function toBackendCheckRequest(checkData: CreateCheckRequest): Record<string, any> {
  const type = (checkData as any).type ?? (checkData.configuration as any)?.type ?? 'HTTP';
  return {
    name: checkData.name,
    description: checkData.description ?? '',
    csiId: checkData.csiId,
    environment: (checkData as any).environment ?? 'Production',
    configuration: toBackendConfiguration(type, checkData.configuration ?? {}),
    tags: checkData.tags ?? [],
  };
}

interface GetChecksParams extends PaginationParams {
  filters?: Partial<CheckFilters>;
}

export const checksApi = {
  async getChecks(params: GetChecksParams = {}): Promise<ApiResponse<CheckEntity[]>> {
    const { page = 1, limit = 20, filters = {} } = params;

    const queryParams = new URLSearchParams({
      page: String(page - 1),
      size: String(limit),
    });

    if (filters.csiId) queryParams.append('csiId', filters.csiId);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.searchQuery) queryParams.append('search', filters.searchQuery);
    if (filters.tags?.length) {
      filters.tags.forEach((tag) => queryParams.append('tags', tag));
    }

    const raw = await apiClient.get(`${API_ENDPOINTS.CHECKS}?${queryParams.toString()}`);
    const normalized = normalizePageResponse<CheckEntity>(raw);
    normalized.data = normalized.data.map(mapCheckResponse);
    return normalized;
  },

  async getCheckById(id: string): Promise<CheckEntity> {
    const raw = await apiClient.get(API_ENDPOINTS.CHECK_BY_ID(id));
    return mapCheckResponse(raw);
  },

  async createCheck(checkData: CreateCheckRequest): Promise<CheckEntity> {
    const raw = await apiClient.post(API_ENDPOINTS.CHECKS, toBackendCheckRequest(checkData));
    return mapCheckResponse(raw);
  },

  async updateCheck(id: string, updateData: Partial<UpdateCheckRequest>): Promise<CheckEntity> {
    const raw = await apiClient.put(API_ENDPOINTS.CHECK_BY_ID(id), toBackendCheckRequest(updateData as CreateCheckRequest));
    return mapCheckResponse(raw);
  },

  async deleteCheck(id: string): Promise<void> {
    return apiClient.delete(API_ENDPOINTS.CHECK_BY_ID(id));
  },

  async executeCheck(id: string): Promise<ExecutionResult> {
    const res = await apiClient.post<any>(API_ENDPOINTS.EXECUTE_CHECK(id));

    if (res && res.executionId) {
      return pollForExecution(id, String(res.executionId));
    }

    return mapExecutionResponse(res);
  },

  async getCheckExecutions(
    id: string,
    limit: number = 10,
    cursor?: string,
  ): Promise<ApiResponse<ExecutionResult[]>> {
    const queryParams = new URLSearchParams({ limit: String(limit) });
    if (cursor) queryParams.append('cursor', cursor);

    const raw = await apiClient.get<any>(
      `${API_ENDPOINTS.CHECK_HISTORY(id)}?${queryParams.toString()}`,
    );

    const data: ExecutionResult[] = (raw.data ?? []).map(mapExecutionResponse);
    return {
      data,
      total: raw.total ?? data.length,
      hasMore: raw.hasMore,
    };
  },

  async updateCheckSchedule(
    id: string,
    schedule: { enabled: boolean; frequency?: string; cron?: string },
  ): Promise<CheckEntity> {
    const raw = await apiClient.put(`${API_ENDPOINTS.CHECK_BY_ID(id)}/schedule`, schedule);
    return mapCheckResponse(raw);
  },

  async pauseCheck(id: string): Promise<CheckEntity> {
    const raw = await apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/pause`);
    return mapCheckResponse(raw);
  },

  async resumeCheck(id: string): Promise<CheckEntity> {
    const raw = await apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/resume`);
    return mapCheckResponse(raw);
  },

  async getUpcomingExecutions(
    limit: number = 20,
  ): Promise<ApiResponse<Array<{ checkId: string; checkName: string; nextExecution: string; csiName: string }>>> {
    const queryParams = new URLSearchParams({ limit: String(limit) });
    return apiClient.get(`${API_ENDPOINTS.CHECKS}/upcoming?${queryParams.toString()}`);
  },

  async deleteMultipleChecks(
    checkIds: string[],
  ): Promise<{ succeeded: string[]; failed: string[] }> {
    try {
      const res = await apiClient.post<any>(API_ENDPOINTS.CHECKS_BULK, {
        operations: checkIds.map((id) => ({ op: 'delete', id })),
      });

      const succeeded: string[] = [];
      const failed: string[] = [];
      (res.results ?? []).forEach((r: any) => {
        if (r.status === 'ok' || r.status === 'SUCCESS') {
          succeeded.push(String(r.id));
        } else {
          failed.push(String(r.id));
        }
      });
      return { succeeded, failed };
    } catch {
      const succeeded: string[] = [];
      const failed: string[] = [];
      await Promise.all(
        checkIds.map(async (id) => {
          try {
            await this.deleteCheck(id);
            succeeded.push(id);
          } catch {
            failed.push(id);
          }
        }),
      );
      return { succeeded, failed };
    }
  },

  async executeMultipleChecks(checkIds: string[]): Promise<Record<string, ExecutionResult>> {
    const results: Record<string, ExecutionResult> = {};
    const maxConcurrent = 5;

    for (let i = 0; i < checkIds.length; i += maxConcurrent) {
      const batch = checkIds.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const result = await this.executeCheck(id);
            return { id, result };
          } catch {
            return { id, result: null };
          }
        }),
      );
      batchResults.forEach(({ id, result }) => {
        if (result) results[id] = result;
      });
    }

    return results;
  },
};

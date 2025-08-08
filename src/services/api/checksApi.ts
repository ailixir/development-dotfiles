import { apiClient } from './apiClient';
import { API_ENDPOINTS } from '@utils/constants/appConfig';
import { 
  CheckEntity, 
  CreateCheckRequest, 
  UpdateCheckRequest, 
  ExecutionResult,
  CheckFilters 
} from '../../types/checks/checkTypes';
import { ApiResponse, PaginationParams } from '../../types/common/commonTypes';

interface GetChecksParams extends PaginationParams {
  filters?: Partial<CheckFilters>;
}

export const checksApi = {
  // Get all checks with optional filtering and pagination
  async getChecks(params: GetChecksParams = {}): Promise<ApiResponse<CheckEntity[]>> {
    const { page = 1, limit = 20, filters = {} } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // Add filters to query params
    if (filters.csiId) queryParams.append('csiId', filters.csiId);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.searchQuery) queryParams.append('search', filters.searchQuery);
    if (filters.tags?.length) {
      filters.tags.forEach(tag => queryParams.append('tags', tag));
    }

    return apiClient.get(`${API_ENDPOINTS.CHECKS}?${queryParams.toString()}`);
  },

  // Get a single check by ID
  async getCheckById(id: string): Promise<CheckEntity> {
    return apiClient.get(API_ENDPOINTS.CHECK_BY_ID(id));
  },

  // Create a new check
  async createCheck(checkData: CreateCheckRequest): Promise<CheckEntity> {
    return apiClient.post(API_ENDPOINTS.CHECKS, checkData);
  },

  // Update an existing check
  async updateCheck(id: string, updateData: Partial<UpdateCheckRequest>): Promise<CheckEntity> {
    return apiClient.put(API_ENDPOINTS.CHECK_BY_ID(id), updateData);
  },

  // Delete a check
  async deleteCheck(id: string): Promise<void> {
    return apiClient.delete(API_ENDPOINTS.CHECK_BY_ID(id));
  },

  // Execute a check
  async executeCheck(id: string): Promise<ExecutionResult> {
    return apiClient.post(API_ENDPOINTS.EXECUTE_CHECK(id));
  },

  // Get execution history for a check
  async getCheckExecutions(id: string, limit: number = 10): Promise<ApiResponse<ExecutionResult[]>> {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
    });

    return apiClient.get(`${API_ENDPOINTS.CHECK_EXECUTIONS(id)}?${queryParams.toString()}`);
  },

  // Schedule management
  async updateCheckSchedule(id: string, schedule: { enabled: boolean; frequency?: string; cron?: string }): Promise<CheckEntity> {
    return apiClient.put(`${API_ENDPOINTS.CHECK_BY_ID(id)}/schedule`, schedule);
  },

  async pauseCheck(id: string): Promise<CheckEntity> {
    return apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/pause`);
  },

  async resumeCheck(id: string): Promise<CheckEntity> {
    return apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/resume`);
  },

  // Get next scheduled executions
  async getUpcomingExecutions(limit: number = 20): Promise<ApiResponse<Array<{ checkId: string; checkName: string; nextExecution: string; csiName: string }>>> {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
    });

    return apiClient.get(`${API_ENDPOINTS.CHECKS}/upcoming?${queryParams.toString()}`);
  },

  // Bulk operations
  async executeMultipleChecks(checkIds: string[]): Promise<Record<string, ExecutionResult>> {
    const results: Record<string, ExecutionResult> = {};
    
    // Execute checks in parallel (limited concurrency)
    const maxConcurrent = 5;
    const batches = [];
    
    for (let i = 0; i < checkIds.length; i += maxConcurrent) {
      batches.push(checkIds.slice(i, i + maxConcurrent));
    }
    
    for (const batch of batches) {
      const promises = batch.map(async (id) => {
        try {
          const result = await this.executeCheck(id);
          return { id, result };
        } catch (error) {
          console.error(`Failed to execute check ${id}:`, error);
          return { id, result: null };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ id, result }) => {
        if (result) {
          results[id] = result;
        }
      });
    }
    
    return results;
  },

  async deleteMultipleChecks(checkIds: string[]): Promise<{ succeeded: string[]; failed: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];
    
    const promises = checkIds.map(async (id) => {
      try {
        await this.deleteCheck(id);
        succeeded.push(id);
      } catch (error) {
        console.error(`Failed to delete check ${id}:`, error);
        failed.push(id);
      }
    });
    
    await Promise.all(promises);
    
    return { succeeded, failed };
  },
};
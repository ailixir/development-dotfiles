import apiClient from './apiClient';
import type {
  DashboardSummary,
  AttentionItem,
  ActivityItem,
  ReportSnapshotItem,
  SearchResultItem,
} from '@/types/dashboard/dashboardTypes';

export const dashboardApi = {
  async getDashboardSummary(params?: { csiId?: string | null }): Promise<DashboardSummary> {
    return await apiClient.get('/dashboard/summary', { params });
  },

  async getAttention(params?: { limit?: number; csiId?: string | null }): Promise<{ data: AttentionItem[] }> {
    return await apiClient.get('/dashboard/attention', { params });
  },

  async getActivity(params?: { scope?: 'ALL' | 'MINE'; hours?: number; csiId?: string | null }): Promise<{ data: ActivityItem[] }> {
    return await apiClient.get('/dashboard/activity', { params });
  },

  async getUpcomingSchedules(params?: { limit?: number; csiId?: string | null }): Promise<{ data: any[] }> {
    return await apiClient.get('/dashboard/upcoming', { params });
  },

  async getReportsSnapshot(params?: { limit?: number; csiId?: string | null }): Promise<{ data: ReportSnapshotItem[] }> {
    return await apiClient.get('/dashboard/reports/snapshot', { params });
  },

  async searchAll(
    query: string,
    context?: { csiId?: string | null; environment?: string | null; tags?: string[]; tagMode?: 'AND' | 'OR' }
  ): Promise<{ data: SearchResultItem[] }> {
    const params: Record<string, any> = { q: query };
    if (context?.csiId) params.csiId = context.csiId;
    if (context?.environment) params.environment = context.environment;
    if (context?.tags && context.tags.length) params.tags = context.tags;
    if (context?.tagMode) params.tagMode = context.tagMode;
    return await apiClient.get('/dashboard/search', { params });
  },

  async acknowledgeCheck(id: string): Promise<{ id: string; acknowledgedAt: string }> {
    return await apiClient.post(`/dashboard/attention/${id}/acknowledge`);
  },

  async assignCheck(id: string, userId: string): Promise<{ id: string; userId: string }> {
    return await apiClient.post(`/dashboard/attention/${id}/assign`, { userId });
  },
};

export default dashboardApi;


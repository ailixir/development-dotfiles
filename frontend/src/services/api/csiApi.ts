import apiClient from './apiClient';
import { normalizePageResponse } from './responseAdapter';
import { mapCsiResponse } from './mappers/csiMapper';

export interface CsiSearchItem {
  id: string;
  name: string;
  description?: string;
  businessUnit?: string;
  environment?: string;
}

export const csiApi = {
  async listCsis(params?: { search?: string; businessUnit?: string; environment?: string; status?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, ...rest } = params ?? {};
    const raw = await apiClient.get('/csi', { params: { ...rest, page: page - 1, size: limit } });
    const normalized = normalizePageResponse<any>(raw);
    normalized.data = normalized.data.map(mapCsiResponse);
    return normalized;
  },

  async getCsiById(id: string) {
    const raw = await apiClient.get(`/csi/${id}`);
    return mapCsiResponse(raw);
  },

  async getBusinessUnits(): Promise<string[]> {
    return await apiClient.get('/csi/business-units');
  },

  async getUserPermissions() {
    return await apiClient.get('/csi/user-permissions');
  },

  async getCsiHealth(id: string) {
    return await apiClient.get(`/csi/${id}/health`);
  },

  async searchCsis(query: string, limit: number = 10): Promise<CsiSearchItem[]> {
    if (!query || query.length < 2) return [];
    return await apiClient.get('/csi/search', { params: { q: query, limit } });
  },
};

export default csiApi;

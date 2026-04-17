import apiClient from './apiClient';

export interface CsiSearchItem {
  id: string;
  name: string;
  description?: string;
  businessUnit?: string;
  environment?: string;
}

export const csiApi = {
  async listCsis(params?: { search?: string; businessUnit?: string; environment?: string; status?: string; page?: number; limit?: number }) {
    return await apiClient.get('/csi', { params });
  },

  async getCsiById(id: string) {
    return await apiClient.get(`/csi/${id}`);
  },

  async getBusinessUnits() {
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


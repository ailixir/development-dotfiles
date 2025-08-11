import apiClient from './apiClient';

export interface CsiSearchItem {
  id: string;
  name: string;
  description?: string;
  businessUnit?: string;
  environment?: string;
}

export const csiApi = {
  async searchCsis(query: string, limit: number = 10): Promise<CsiSearchItem[]> {
    if (!query || query.length < 2) return [];
    return await apiClient.get('/csi/search', { params: { q: query, limit } });
  },
};

export default csiApi;


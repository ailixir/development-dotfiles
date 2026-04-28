import apiClient from './apiClient';

export const tagsApi = {
  async getTags(csiId?: string): Promise<{ data: string[]; total: number }> {
    const params: Record<string, any> = {};
    if (csiId) params.csi = csiId;
    return apiClient.get('/tags', { params });
  },

  async getTagStats(csiId?: string): Promise<{ data: Array<{ tag: string; count: number }>; totalTags: number; totalChecks: number }> {
    const params: Record<string, any> = {};
    if (csiId) params.csi = csiId;
    return apiClient.get('/tags/stats', { params });
  },

  async getSuggestions(selectedTags: string[], csiId?: string): Promise<{ data: string[] }> {
    return apiClient.post('/tags/suggestions', { selectedTags, csiId });
  },
};

export default tagsApi;

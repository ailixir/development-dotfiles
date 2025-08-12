import apiClient from './apiClient';

export interface ReportTemplateSummary {
  id: string;
  name: string;
  description: string;
}

export const templatesApi = {
  list: (params?: { q?: string; type?: string }) => apiClient.get('/check-templates', { params }),
  get: (id: string) => apiClient.get(`/check-templates/${id}`),
};

export default templatesApi;



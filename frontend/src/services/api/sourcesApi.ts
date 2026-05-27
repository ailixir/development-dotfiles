import apiClient from './apiClient';

export interface CheckSource {
  type: string;
  enabled: boolean;
  label: string;
}

export interface CheckSourcesResponse {
  sources: CheckSource[];
}

export const sourcesApi = {
  async getSources(): Promise<CheckSourcesResponse> {
    return apiClient.get<CheckSourcesResponse>('/checks/sources');
  },
};

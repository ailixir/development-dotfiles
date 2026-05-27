import apiClient from './apiClient';
import { CheckSource } from './sourcesApi';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  label: string;
}

export interface FeaturesResponse {
  sources: CheckSource[];
  features: FeatureFlag[];
}

export const featuresApi = {
  async getFeatures(): Promise<FeaturesResponse> {
    return apiClient.get<FeaturesResponse>('/features');
  },
};

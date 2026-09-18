import apiClient from './apiClient';
import type { TestIR } from '@/types/studio/studioTypes';

export interface ValidateStepsResponse {
  isValid: boolean;
  results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>;
}

export interface StudioAiStatus {
  enabled: boolean;
  provider: 'vertex-ai' | 'gemini-developer-api';
  model: string;
  location: string;
  credentialMode: string;
}

export interface StudioCompileResponse {
  outcome: string;
  errorCode?: string;
  artifactJson?: string;
  failureReason?: string;
  provenance?: { model: string; modelVersion?: string; sdkVersion: string; promptVersion: string };
}

interface ValidateStepsApiResponse {
  allValid: boolean;
  results: Array<{ stepIndex?: number; isValid: boolean; suggestion: string | null }>;
}

export const studioApi = {
  listTests: async (params?: { csiId?: string }) => apiClient.get('/studio/tests', { params }),
  getTest: async (id: string) => apiClient.get(`/studio/tests/${id}`),
  validateVariables: async (id: string, variables: Record<string, any>) => apiClient.post(`/studio/tests/${id}/validate-variables`, { variables }),
  createTest: async (payload: Partial<TestIR> & { name: string; csiId: string }) => apiClient.post('/studio/tests', payload),
  updateTest: async (id: string, payload: Partial<TestIR>) => apiClient.put(`/studio/tests/${id}`, payload),
  deleteTest: async (id: string) => apiClient.delete(`/studio/tests/${id}`),
  executeTest: async (id: string): Promise<{ executionId: string; status: string; message?: string }> => apiClient.post(`/studio/tests/${id}/execute`),
  getAiStatus: async (): Promise<StudioAiStatus> => apiClient.get('/studio/ai/status'),
  compileWithGemini: async (id: string): Promise<StudioCompileResponse> => apiClient.post(`/studio/tests/${id}/compile`),
  getExecution: async (id: string) => apiClient.get(`/studio/executions/${id}`),
  validateSteps: async (steps: string[]): Promise<ValidateStepsResponse> => {
    const response = await apiClient.post<ValidateStepsApiResponse>('/studio/validate-steps', { steps });
    return {
      isValid: response.allValid,
      results: response.results.map((result, stepIndex) => ({
        ...result,
        stepIndex: result.stepIndex ?? stepIndex,
      })),
    };
  },
  listExecutions: async (params?: { testId?: string; page?: number; size?: number }) => apiClient.get('/studio/executions', { params }),
};

export default studioApi;
